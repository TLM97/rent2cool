/**
 * Digitaler Schlüssel und Fernzugriff (D-014). Der Kern entscheidet über jeden
 * Befehl und protokolliert ihn – auch abgelehnte Versuche (Sicherheit, GDP:
 * Türöffnungen erklären Temperaturabweichungen). Der KeyProvider führt aus.
 *
 * Ablauf eines Befehls: (1) prüfen und als `gesendet` bzw. `abgelehnt` mit
 * Audit speichern, (2) außerhalb der Transaktion an den Anbieter übergeben
 * (keine Sperren während Netzwerkaufrufen), (3) Rückmeldung als Statuswechsel
 * mit Audit festhalten – sofort (Simulator) oder später (`schliesseAb`).
 */
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  hatRolle,
  pruefeSchluesselBefehl,
  schluesselAusstellbar,
  schluesselGueltigAb,
  type FahrzeugBefehl,
  type FahrzeugBefehlEingabe,
  type Principal,
  type SchluesselBefehl,
} from '@rent2cool/shared';
import { protokolliereAnlage, schreibeAudit } from '../audit/audit.service';
import type { Database, Transaktion } from '../db/client';
import { DB } from '../db/db.module';
import { istPgFehler, PG_FEHLER } from '../db/fehler';
import { fahrer, fahrzeug, fahrzeugBefehl, miete, schluessel } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { KundeService } from '../kunde/kunde.service';
import { KEY_PROVIDER, type BefehlErgebnis, type KeyProvider } from './key-provider';

export type BefehlZeile = typeof fahrzeugBefehl.$inferSelect;
export type SchluesselZeile = typeof schluessel.$inferSelect;

/** Rückmeldungen des Anbieters schreibt der Kern im Namen des Anbieters. */
function anbieterPrincipal(provider: KeyProvider, mandantId: string): Principal {
  return { akteurId: `system:key-provider`, name: provider.name, rollen: [], mandantId };
}

/**
 * Aktive Schlüssel einer Miete widerrufen (Mietende, Storno) – in der
 * Transaktion des Statuswechsels, damit kein Schlüssel eine beendete Miete
 * überlebt. Liefert die Anbieter-Referenzen; dem Anbieter meldet der Aufrufer
 * den Widerruf nach dem Commit.
 */
export async function widerrufeSchluesselDerMiete(
  tx: Transaktion,
  principal: Principal,
  mieteId: string,
  grund: string,
): Promise<string[]> {
  const jetzt = new Date();
  const widerrufen = await tx
    .update(schluessel)
    .set({
      status: 'widerrufen',
      widerrufenAm: jetzt,
      widerrufenVon: principal.akteurId,
      widerrufGrund: grund,
      aktualisiertAm: jetzt,
    })
    .where(and(eq(schluessel.mieteId, mieteId), eq(schluessel.status, 'aktiv')))
    .returning({ id: schluessel.id, anbieterRef: schluessel.anbieterRef });
  for (const s of widerrufen) {
    await schreibeAudit(tx, principal, {
      aktion: 'POST',
      entitaetTyp: 'schluessel_status',
      entitaetId: s.id,
      altWert: { status: 'aktiv' },
      neuWert: { status: 'widerrufen', widerrufGrund: grund },
    });
  }
  return widerrufen.flatMap((s) => (s.anbieterRef ? [s.anbieterRef] : []));
}

@Injectable()
export class SchluesselService {
  private readonly log = new Logger(SchluesselService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(KEY_PROVIDER) private readonly provider: KeyProvider,
    private readonly kunden: KundeService,
  ) {}

  // --- Schlüssel ---

  /**
   * Schlüssel für einen Fahrer des Mietkunden ausstellen. Höchstens ein aktiver
   * Schlüssel je Miete und Fahrer – erneutes Ausstellen liefert denselben.
   */
  async stelleAus(
    principal: Principal,
    mieteId: string,
    fahrerId: string,
  ): Promise<{ id: string; idempotent: boolean }> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const [m] = await this.db
      .select()
      .from(miete)
      .where(and(eq(miete.id, mieteId), eq(miete.mandantId, mandant)));
    if (!m) throw new NotFoundException('Miete nicht gefunden');

    const vorhanden = async () => {
      const [s] = await this.db
        .select({ id: schluessel.id })
        .from(schluessel)
        .where(
          and(
            eq(schluessel.mieteId, mieteId),
            eq(schluessel.fahrerId, fahrerId),
            eq(schluessel.status, 'aktiv'),
          ),
        );
      return s ? { id: s.id, idempotent: true } : undefined;
    };
    const schonDa = await vorhanden();
    if (schonDa) return schonDa;

    const gruende = schluesselAusstellbar(m.status);
    const [f] = await this.db
      .select({ kundeId: fahrer.kundeId })
      .from(fahrer)
      .where(eq(fahrer.id, fahrerId));
    if (!f || f.kundeId !== m.kundeId) {
      gruende.push('Fahrer gehört nicht zum Kunden der Miete');
    } else {
      // Fahrerlaubnis (R-22) zum Mietbeginn bzw. jetzt, wenn die Miete schon läuft.
      const stichtag = new Date(Math.max(Date.now(), m.startGeplant.getTime()));
      const e = await this.kunden.einsatzbereit(fahrerId, m.fahrzeugId, stichtag);
      gruende.push(...e.gruende.map((g) => `Fahrer: ${g}`));
    }
    if (gruende.length > 0) {
      throw new ConflictException({ fehler: 'Schlüssel nicht ausgestellt', gruende });
    }

    let neu: SchluesselZeile;
    try {
      neu = await this.db.transaction(async (tx) => {
        // Status der Miete unter Sperre erneut prüfen (gleichzeitiges Beenden).
        const [gesperrt] = await tx
          .select({ status: miete.status })
          .from(miete)
          .where(eq(miete.id, mieteId))
          .for('update');
        const spaet = schluesselAusstellbar(gesperrt!.status);
        if (spaet.length > 0) {
          throw new ConflictException({ fehler: 'Schlüssel nicht ausgestellt', gruende: spaet });
        }
        const [row] = await tx
          .insert(schluessel)
          .values({
            mandantId: mandant,
            mieteId,
            fahrerId,
            fahrzeugId: m.fahrzeugId,
            status: 'aktiv',
            gueltigVon: schluesselGueltigAb(m.startGeplant),
            gueltigBis: null,
            ausgestelltVon: principal.akteurId,
          })
          .returning();
        await protokolliereAnlage(tx, principal, 'schluessel', row!.id, row);
        return row!;
      });
    } catch (e: unknown) {
      if (istPgFehler(e, PG_FEHLER.EINDEUTIG, 'uq_schluessel_aktiv')) {
        const inzwischen = await vorhanden();
        if (inzwischen) return inzwischen;
      }
      throw e;
    }

    try {
      const { anbieterRef } = await this.provider.stelleAus({
        schluesselId: neu.id,
        fahrzeugId: neu.fahrzeugId,
        fahrerId,
        gueltigVon: neu.gueltigVon,
        gueltigBis: neu.gueltigBis,
      });
      await this.db
        .update(schluessel)
        .set({ anbieterRef, aktualisiertAm: new Date() })
        .where(eq(schluessel.id, neu.id));
    } catch (e: unknown) {
      // Ohne Schlüssel beim Anbieter ist der Datensatz wertlos: sofort widerrufen.
      const meldung = e instanceof Error ? e.message : String(e);
      await this.widerrufe(anbieterPrincipal(this.provider, mandant), neu.id, {
        grund: `Anbieter hat den Schlüssel nicht angelegt: ${meldung}`,
        anbieterMelden: false,
      });
      throw new ServiceUnavailableException('Schlüssel konnte beim Anbieter nicht angelegt werden');
    }
    return { id: neu.id, idempotent: false };
  }

  /** Schlüssel widerrufen (Audit alt/neu). Bereits widerrufen = nichts zu tun. */
  async widerrufe(
    principal: Principal,
    id: string,
    o: { grund: string; anbieterMelden?: boolean },
  ): Promise<{ id: string; status: 'widerrufen'; geaendert: boolean }> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const ergebnis = await this.db.transaction(async (tx) => {
      const [s] = await tx
        .select()
        .from(schluessel)
        .where(and(eq(schluessel.id, id), eq(schluessel.mandantId, mandant)))
        .for('update');
      if (!s) throw new NotFoundException('Schlüssel nicht gefunden');
      if (s.status === 'widerrufen') return { geaendert: false, anbieterRef: null };
      const jetzt = new Date();
      await tx
        .update(schluessel)
        .set({
          status: 'widerrufen',
          widerrufenAm: jetzt,
          widerrufenVon: principal.akteurId,
          widerrufGrund: o.grund,
          aktualisiertAm: jetzt,
        })
        .where(eq(schluessel.id, id));
      await schreibeAudit(tx, principal, {
        aktion: 'POST',
        entitaetTyp: 'schluessel_status',
        entitaetId: id,
        altWert: { status: 'aktiv' },
        neuWert: { status: 'widerrufen', widerrufGrund: o.grund },
      });
      return { geaendert: true, anbieterRef: s.anbieterRef };
    });
    if (ergebnis.anbieterRef && o.anbieterMelden !== false) {
      await this.meldeWiderruf([ergebnis.anbieterRef]);
    }
    return { id, status: 'widerrufen', geaendert: ergebnis.geaendert };
  }

  /**
   * Widerruf beim Anbieter nachziehen. Im Kern ist der Schlüssel bereits
   * gesperrt (jeder Befehl läuft über den Kern); scheitert der Anbieter, wird
   * das geloggt. TODO(D-015): Wiederholung als Hintergrundjob, sobald ein
   * echter Anbieter Offline-Schlüssel (Bluetooth) ausgibt.
   */
  async meldeWiderruf(anbieterRefs: string[]): Promise<void> {
    for (const ref of anbieterRefs) {
      try {
        await this.provider.widerrufe(ref);
      } catch (e: unknown) {
        this.log.error({ anbieterRef: ref, err: e }, 'Widerruf beim Anbieter fehlgeschlagen');
      }
    }
  }

  /** Schlüssel einer Miete mit Fahrername (eine Abfrage). */
  async listeZurMiete(mandantId: string | undefined, mieteId: string) {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const zeilen = await this.db
      .select({ s: schluessel, fahrerName: fahrer.name, kontoId: fahrer.kontoId })
      .from(schluessel)
      .innerJoin(fahrer, eq(schluessel.fahrerId, fahrer.id))
      .where(and(eq(schluessel.mieteId, mieteId), eq(schluessel.mandantId, mandant)))
      .orderBy(desc(schluessel.erstelltAm))
      .limit(50);
    return zeilen.map((z) => ({
      ...z.s,
      fahrerName: z.fahrerName,
      appKontoVerknuepft: z.kontoId !== null,
    }));
  }

  /** Aktive Schlüssel des angemeldeten Fahrers (App). */
  async meineSchluessel(principal: Principal) {
    const zeilen = await this.db
      .select({
        s: schluessel,
        kennzeichen: fahrzeug.kennzeichen,
        startGeplant: miete.startGeplant,
        endeGeplant: miete.endeGeplant,
        mieteStatus: miete.status,
      })
      .from(schluessel)
      .innerJoin(fahrer, eq(schluessel.fahrerId, fahrer.id))
      .innerJoin(miete, eq(schluessel.mieteId, miete.id))
      .innerJoin(fahrzeug, eq(schluessel.fahrzeugId, fahrzeug.id))
      .where(and(eq(fahrer.kontoId, principal.akteurId), eq(schluessel.status, 'aktiv')))
      .orderBy(miete.startGeplant)
      .limit(20);
    return zeilen.map((z) => ({
      id: z.s.id,
      mieteId: z.s.mieteId,
      fahrzeugId: z.s.fahrzeugId,
      kennzeichen: z.kennzeichen,
      gueltigVon: z.s.gueltigVon,
      gueltigBis: z.s.gueltigBis,
      startGeplant: z.startGeplant,
      endeGeplant: z.endeGeplant,
      mieteStatus: z.mieteStatus,
    }));
  }

  // --- Befehle ---

  /** Befehl mit dem Schlüssel des angemeldeten Fahrers (App). */
  async befehlMitSchluessel(
    principal: Principal,
    schluesselId: string,
    p: SchluesselBefehl,
  ): Promise<BefehlZeile> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const wiederholt = await this.befehlZumKey(mandant, p.idempotencyKey);
    if (wiederholt) return this.wiederholung(wiederholt, { schluesselId });

    const [s] = await this.db
      .select({ s: schluessel, kontoId: fahrer.kontoId, mieteStatus: miete.status })
      .from(schluessel)
      .innerJoin(fahrer, eq(schluessel.fahrerId, fahrer.id))
      .innerJoin(miete, eq(schluessel.mieteId, miete.id))
      .where(and(eq(schluessel.id, schluesselId), eq(schluessel.mandantId, mandant)));
    // Fremde Schlüssel sind „nicht gefunden“ – nichts über ihre Existenz verraten.
    if (!s || s.kontoId !== principal.akteurId) {
      throw new NotFoundException('Schlüssel nicht gefunden');
    }
    const gruende = pruefeSchluesselBefehl({
      schluessel: s.s,
      mieteStatus: s.mieteStatus,
      befehl: p.befehl,
      jetzt: new Date(),
    });
    return this.fuehreAus(principal, {
      mandantId: mandant,
      fahrzeugId: s.s.fahrzeugId,
      mieteId: s.s.mieteId,
      schluesselId,
      befehl: p.befehl,
      grund: null,
      idempotencyKey: p.idempotencyKey,
      gruende,
    });
  }

  /** Befehl durch Ops/Admin direkt an das Fahrzeug (Hilfe, Notfall) – immer mit Grund. */
  async befehlDurchBetrieb(
    principal: Principal,
    fahrzeugId: string,
    p: FahrzeugBefehlEingabe,
  ): Promise<BefehlZeile> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const wiederholt = await this.befehlZumKey(mandant, p.idempotencyKey);
    if (wiederholt) return this.wiederholung(wiederholt, { fahrzeugId, schluesselId: null });

    const [fz] = await this.db
      .select({ id: fahrzeug.id })
      .from(fahrzeug)
      .where(and(eq(fahrzeug.id, fahrzeugId), eq(fahrzeug.mandantId, mandant)));
    if (!fz) throw new NotFoundException('Fahrzeug nicht gefunden');
    // Laufende Miete verknüpfen, damit der Befehl in deren Akte erscheint.
    const [laufend] = await this.db
      .select({ id: miete.id })
      .from(miete)
      .where(and(eq(miete.fahrzeugId, fahrzeugId), eq(miete.status, 'aktiv')))
      .limit(1);
    return this.fuehreAus(principal, {
      mandantId: mandant,
      fahrzeugId,
      mieteId: laufend?.id ?? null,
      schluesselId: null,
      befehl: p.befehl,
      grund: p.grund,
      idempotencyKey: p.idempotencyKey,
      gruende: [],
    });
  }

  /**
   * Rückmeldung des Anbieters festhalten (`gesendet` → `ausgefuehrt` bzw.
   * `fehlgeschlagen`). Nur der erste Abschluss zählt; Wiederholungen ändern nichts.
   */
  async schliesseAb(befehlId: string, ergebnis: BefehlErgebnis): Promise<BefehlZeile> {
    return this.db.transaction(async (tx) => {
      const [b] = await tx
        .select()
        .from(fahrzeugBefehl)
        .where(eq(fahrzeugBefehl.id, befehlId))
        .for('update');
      if (!b) throw new NotFoundException('Befehl nicht gefunden');
      if (b.status !== 'gesendet') return b;
      const neu = {
        status: ergebnis.ok ? 'ausgefuehrt' : 'fehlgeschlagen',
        gruende: ergebnis.ok ? null : [ergebnis.fehler],
        abgeschlossenAm: new Date(),
      };
      const [row] = await tx
        .update(fahrzeugBefehl)
        .set(neu)
        .where(eq(fahrzeugBefehl.id, befehlId))
        .returning();
      await schreibeAudit(tx, anbieterPrincipal(this.provider, b.mandantId), {
        aktion: 'POST',
        entitaetTyp: 'fahrzeug_befehl_status',
        entitaetId: befehlId,
        altWert: { status: b.status },
        neuWert: { status: neu.status, ...(neu.gruende ? { gruende: neu.gruende } : {}) },
        quelle: `key-provider:${this.provider.name}`,
      });
      return row!;
    });
  }

  /** Einzelner Befehl (Statusabfrage der App). Fahrer sehen nur Befehle ihrer Schlüssel. */
  async holeBefehl(principal: Principal, id: string): Promise<BefehlZeile> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const [z] = await this.db
      .select({ b: fahrzeugBefehl, kontoId: fahrer.kontoId })
      .from(fahrzeugBefehl)
      .leftJoin(schluessel, eq(fahrzeugBefehl.schluesselId, schluessel.id))
      .leftJoin(fahrer, eq(schluessel.fahrerId, fahrer.id))
      .where(and(eq(fahrzeugBefehl.id, id), eq(fahrzeugBefehl.mandantId, mandant)));
    const intern = hatRolle(principal, 'ops', 'admin');
    if (!z || (!intern && z.kontoId !== principal.akteurId)) {
      throw new NotFoundException('Befehl nicht gefunden');
    }
    return z.b;
  }

  /** Befehle eines Fahrzeugs oder einer Miete, neueste zuerst, mit Blättern (D-003). */
  async liste(
    mandantId: string | undefined,
    filter: { fahrzeugId?: string; mieteId?: string },
    seite: { limit: number; offset: number },
  ) {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const bedingung = and(
      eq(fahrzeugBefehl.mandantId, mandant),
      filter.fahrzeugId ? eq(fahrzeugBefehl.fahrzeugId, filter.fahrzeugId) : undefined,
      filter.mieteId ? eq(fahrzeugBefehl.mieteId, filter.mieteId) : undefined,
    );
    const [zeilen, [zaehler]] = await Promise.all([
      this.db
        .select({ b: fahrzeugBefehl, fahrerName: fahrer.name })
        .from(fahrzeugBefehl)
        .leftJoin(schluessel, eq(fahrzeugBefehl.schluesselId, schluessel.id))
        .leftJoin(fahrer, eq(schluessel.fahrerId, fahrer.id))
        .where(bedingung)
        .orderBy(desc(fahrzeugBefehl.angefordertAm))
        .limit(seite.limit)
        .offset(seite.offset),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(fahrzeugBefehl)
        .where(bedingung),
    ]);
    return {
      eintraege: zeilen.map((z) => ({ ...z.b, fahrerName: z.fahrerName })),
      gesamt: zaehler?.n ?? 0,
    };
  }

  // --- intern ---

  private async befehlZumKey(mandant: string, key: string): Promise<BefehlZeile | undefined> {
    const [b] = await this.db
      .select()
      .from(fahrzeugBefehl)
      .where(and(eq(fahrzeugBefehl.mandantId, mandant), eq(fahrzeugBefehl.idempotencyKey, key)));
    return b;
  }

  /** Wiederholte Anfrage: denselben Befehl zurückgeben (abgelehnt bleibt abgelehnt). */
  private wiederholung(
    b: BefehlZeile,
    erwartet: { schluesselId?: string | null; fahrzeugId?: string },
  ): BefehlZeile {
    const passt =
      (erwartet.schluesselId === undefined || b.schluesselId === erwartet.schluesselId) &&
      (erwartet.fahrzeugId === undefined || b.fahrzeugId === erwartet.fahrzeugId);
    if (!passt) {
      throw new ConflictException(
        'Idempotency-Key wurde bereits für einen anderen Befehl verwendet',
      );
    }
    if (b.status === 'abgelehnt') this.ablehnen(b);
    return b;
  }

  private ablehnen(b: BefehlZeile): never {
    throw new ConflictException({
      fehler: 'Befehl abgelehnt',
      gruende: b.gruende ?? [],
      befehlId: b.id,
    });
  }

  private async fuehreAus(
    principal: Principal,
    d: {
      mandantId: string;
      fahrzeugId: string;
      mieteId: string | null;
      schluesselId: string | null;
      befehl: FahrzeugBefehl;
      grund: string | null;
      idempotencyKey: string;
      gruende: string[];
    },
  ): Promise<BefehlZeile> {
    const abgelehnt = d.gruende.length > 0;
    let b: BefehlZeile;
    try {
      b = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(fahrzeugBefehl)
          .values({
            mandantId: d.mandantId,
            fahrzeugId: d.fahrzeugId,
            mieteId: d.mieteId,
            schluesselId: d.schluesselId,
            befehl: d.befehl,
            status: abgelehnt ? 'abgelehnt' : 'gesendet',
            gruende: abgelehnt ? d.gruende : null,
            grund: d.grund,
            angefordertVon: principal.akteurId,
            abgeschlossenAm: abgelehnt ? new Date() : null,
            idempotencyKey: d.idempotencyKey,
          })
          .returning();
        await protokolliereAnlage(tx, principal, 'fahrzeug_befehl', row!.id, row);
        return row!;
      });
    } catch (e: unknown) {
      // Gleichzeitige Wiederholung mit demselben Key: die erste gewinnt.
      if (istPgFehler(e, PG_FEHLER.EINDEUTIG, 'uq_befehl_idempotency')) {
        const erste = await this.befehlZumKey(d.mandantId, d.idempotencyKey);
        if (erste) return this.wiederholung(erste, { schluesselId: d.schluesselId });
      }
      throw e;
    }
    if (abgelehnt) this.ablehnen(b);

    let antwort: Awaited<ReturnType<KeyProvider['sendeBefehl']>>;
    try {
      antwort = await this.provider.sendeBefehl({
        befehlId: b.id,
        fahrzeugId: d.fahrzeugId,
        befehl: d.befehl,
      });
    } catch (e: unknown) {
      const meldung = e instanceof Error ? e.message : String(e);
      return this.schliesseAb(b.id, { ok: false, fehler: `Anbieter nicht erreichbar: ${meldung}` });
    }
    await this.db
      .update(fahrzeugBefehl)
      .set({ anbieterRef: antwort.anbieterRef })
      .where(eq(fahrzeugBefehl.id, b.id));
    if (antwort.ergebnis) return this.schliesseAb(b.id, antwort.ergebnis);
    return { ...b, anbieterRef: antwort.anbieterRef };
  }
}
