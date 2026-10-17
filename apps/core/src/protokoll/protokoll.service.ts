/**
 * Übergabe- und Rückgabeprotokoll mit Foto-Check (D-014). Der Fahrer (in der
 * App, mit gültigem Schlüssel zur Miete) oder der Betrieb (Ausnahmeprozess mit
 * Personal) dokumentiert Fotos, Checkliste, Kilometerstand und Schäden.
 *
 * Fotos: (1) Foto anfordern → Datensatz `angefordert` + signierter Upload-Link,
 * (2) das Gerät lädt direkt in den Objektspeicher, (3) bestätigen → der Kern
 * prüft Existenz, Größe, Typ und SHA-256 und setzt `hochgeladen` – sonst
 * `verworfen` mit Grund. Speicherzugriffe nie innerhalb einer Transaktion.
 *
 * Abgeschlossen ist unveränderbar (Kern und Datenbank-Trigger, Migration 0014).
 */
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  CHECKLISTE,
  fehltZumAbschluss,
  fotoObjektSchluessel,
  hatRolle,
  type FotoAnfordern,
  type FotoPerspektive,
  type Principal,
  type ProtokollAendern,
  type ProtokollArt,
} from '@rent2cool/shared';
import { ermittleAenderungen, neueWerte, pruefeVersion, versionVon } from '../audit/aenderung';
import { protokolliereAnlage, schreibeAudit } from '../audit/audit.service';
import type { Database, Transaktion } from '../db/client';
import { DB } from '../db/db.module';
import { istPgFehler, PG_FEHLER } from '../db/fehler';
import { fahrer, miete, protokollFoto, schluessel, uebergabeprotokoll } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import {
  OBJEKT_SPEICHER,
  type HochladeLink,
  type ObjektSpeicher,
} from '../objektspeicher/objekt-speicher';

/** Upload-Links gelten kurz (Gerät lädt sofort hoch), Ansichts-Links ebenso. */
const UPLOAD_GUELTIG_SEK = 15 * 60;
const ANSICHT_GUELTIG_SEK = 10 * 60;

/** In welchen Mietstatus darf welches Protokoll angelegt werden? */
const ERLAUBT: Record<ProtokollArt, readonly string[]> = {
  uebergabe: ['bestaetigt', 'aktiv'],
  rueckgabe: ['aktiv', 'beendet'],
};

type ProtokollZeile = typeof uebergabeprotokoll.$inferSelect;
type FotoZeile = typeof protokollFoto.$inferSelect;

export type FotoAnsicht = Omit<FotoZeile, 'objektSchluessel' | 'idempotencyKey'> & {
  /** Kurzlebiger Link zum Ansehen (nur hochgeladene Fotos). */
  url: string | null;
};
export type ProtokollAnsicht = ProtokollZeile & {
  version: string;
  fotos: FotoAnsicht[];
  /** Was zum Abschluss noch fehlt (leer = abschließbar bzw. abgeschlossen). */
  fehlt: string[];
};

@Injectable()
export class ProtokollService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OBJEKT_SPEICHER) private readonly speicher: ObjektSpeicher,
  ) {}

  // --- Zugriff ---

  /**
   * Betrieb (ops, admin, qa_approver) im eigenen Mandanten; Fahrer nur mit
   * gültigem Schlüssel zu genau dieser Miete. Sonst „nicht gefunden“.
   */
  private async miete(principal: Principal, mieteId: string) {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const [m] = await this.db
      .select()
      .from(miete)
      .where(and(eq(miete.id, mieteId), eq(miete.mandantId, mandant)));
    if (!m) throw new NotFoundException('Miete nicht gefunden');
    if (hatRolle(principal, 'ops', 'admin', 'qa_approver')) return m;
    const [s] = await this.db
      .select({ id: schluessel.id })
      .from(schluessel)
      .innerJoin(fahrer, eq(schluessel.fahrerId, fahrer.id))
      .where(
        and(
          eq(schluessel.mieteId, mieteId),
          eq(schluessel.status, 'aktiv'),
          eq(fahrer.kontoId, principal.akteurId),
        ),
      )
      .limit(1);
    if (!s) throw new NotFoundException('Miete nicht gefunden');
    return m;
  }

  private async protokoll(principal: Principal, id: string): Promise<ProtokollZeile> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const [p] = await this.db
      .select()
      .from(uebergabeprotokoll)
      .where(and(eq(uebergabeprotokoll.id, id), eq(uebergabeprotokoll.mandantId, mandant)));
    if (!p) throw new NotFoundException('Protokoll nicht gefunden');
    await this.miete(principal, p.mieteId);
    return p;
  }

  /** Lesen ja (QA), schreiben nur Betrieb und Fahrer. */
  private nurSchreibend(principal: Principal) {
    if (!hatRolle(principal, 'ops', 'admin', 'fahrer')) {
      throw new ForbiddenException('Keine Berechtigung');
    }
  }

  // --- Protokoll ---

  async legeAn(
    principal: Principal,
    mieteId: string,
    art: ProtokollArt,
  ): Promise<{ id: string; idempotent: boolean }> {
    this.nurSchreibend(principal);
    const m = await this.miete(principal, mieteId);
    const vorhanden = async () => {
      const [p] = await this.db
        .select({ id: uebergabeprotokoll.id })
        .from(uebergabeprotokoll)
        .where(and(eq(uebergabeprotokoll.mieteId, mieteId), eq(uebergabeprotokoll.art, art)));
      return p ? { id: p.id, idempotent: true } : undefined;
    };
    const schonDa = await vorhanden();
    if (schonDa) return schonDa;
    if (!ERLAUBT[art].includes(m.status)) {
      throw new ConflictException({
        fehler: 'Protokoll nicht angelegt',
        gruende: [`Miete ist im Status ${m.status}`],
      });
    }
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(uebergabeprotokoll)
          .values({
            mandantId: m.mandantId,
            mieteId,
            fahrzeugId: m.fahrzeugId,
            art,
            erstelltVon: principal.akteurId,
          })
          .returning();
        await protokolliereAnlage(tx, principal, 'protokoll', row!.id, row);
        return { id: row!.id, idempotent: false };
      });
    } catch (e: unknown) {
      if (istPgFehler(e, PG_FEHLER.EINDEUTIG, 'uq_protokoll_miete_art')) {
        const inzwischen = await vorhanden();
        if (inzwischen) return inzwischen;
      }
      throw e;
    }
  }

  async hole(principal: Principal, id: string): Promise<ProtokollAnsicht> {
    return this.ansicht(await this.protokoll(principal, id));
  }

  async listeZurMiete(principal: Principal, mieteId: string): Promise<ProtokollAnsicht[]> {
    await this.miete(principal, mieteId);
    const zeilen = await this.db
      .select()
      .from(uebergabeprotokoll)
      .where(eq(uebergabeprotokoll.mieteId, mieteId))
      .orderBy(asc(uebergabeprotokoll.erstelltAm));
    return Promise.all(zeilen.map((p) => this.ansicht(p)));
  }

  /** Kilometerstand, Checkliste (Punkte werden ergänzt), Schäden – nur solange offen. */
  async aendere(
    principal: Principal,
    id: string,
    p: ProtokollAendern,
  ): Promise<{ id: string; version: string; geaendert: string[] }> {
    this.nurSchreibend(principal);
    const vorab = await this.protokoll(principal, id);
    const bekannt = new Set(CHECKLISTE[vorab.art as ProtokollArt].map((c) => c.id));
    const unbekannt = Object.keys(p.checkliste ?? {}).filter((k) => !bekannt.has(k));
    if (unbekannt.length > 0) {
      throw new BadRequestException(`Unbekannte Checklistenpunkte: ${unbekannt.join(', ')}`);
    }
    return this.db.transaction(async (tx) => {
      const vorher = await this.sperreOffen(tx, id);
      pruefeVersion(vorher.aktualisiertAm, p.version);
      if (p.schaeden) await this.pruefeSchadenFotos(tx, id, p.schaeden);
      const eingabe = {
        kmStand: p.kmStand,
        checkliste: p.checkliste ? { ...(vorher.checkliste ?? {}), ...p.checkliste } : undefined,
        schaeden: p.schaeden,
      };
      const a = ermittleAenderungen(vorher, eingabe);
      if (a.felder.length === 0) {
        return { id, version: versionVon(vorher.aktualisiertAm), geaendert: [] };
      }
      const jetzt = new Date();
      await tx
        .update(uebergabeprotokoll)
        .set({ ...neueWerte(eingabe, a), aktualisiertAm: jetzt })
        .where(eq(uebergabeprotokoll.id, id));
      await schreibeAudit(tx, principal, {
        aktion: 'PATCH',
        entitaetTyp: 'protokoll',
        entitaetId: id,
        altWert: a.alt,
        neuWert: a.neu,
      });
      return { id, version: versionVon(jetzt), geaendert: a.felder };
    });
  }

  /** Abschließen, wenn nichts fehlt. Danach unveränderbar. */
  async schliesseAb(
    principal: Principal,
    id: string,
  ): Promise<{ id: string; status: 'abgeschlossen'; geaendert: boolean }> {
    this.nurSchreibend(principal);
    await this.protokoll(principal, id);
    return this.db.transaction(async (tx) => {
      const [p] = await tx
        .select()
        .from(uebergabeprotokoll)
        .where(eq(uebergabeprotokoll.id, id))
        .for('update');
      if (p!.status === 'abgeschlossen') return { id, status: 'abgeschlossen', geaendert: false };
      const fotos = await tx
        .select({ perspektive: protokollFoto.perspektive })
        .from(protokollFoto)
        .where(and(eq(protokollFoto.protokollId, id), eq(protokollFoto.status, 'hochgeladen')));
      const fehlt = fehltZumAbschluss({
        art: p!.art as ProtokollArt,
        kmStand: p!.kmStand,
        checkliste: p!.checkliste,
        fotos: fotos.map((f) => f.perspektive as FotoPerspektive),
      });
      if (fehlt.length > 0) {
        throw new ConflictException({
          fehler: 'Protokoll ist noch nicht vollständig',
          gruende: fehlt,
        });
      }
      const jetzt = new Date();
      await tx
        .update(uebergabeprotokoll)
        .set({
          status: 'abgeschlossen',
          abgeschlossenAm: jetzt,
          abgeschlossenVon: principal.akteurId,
          aktualisiertAm: jetzt,
        })
        .where(eq(uebergabeprotokoll.id, id));
      await schreibeAudit(tx, principal, {
        aktion: 'POST',
        entitaetTyp: 'protokoll_status',
        entitaetId: id,
        altWert: { status: 'offen' },
        neuWert: { status: 'abgeschlossen' },
      });
      return { id, status: 'abgeschlossen', geaendert: true };
    });
  }

  // --- Fotos ---

  /**
   * Foto anfordern: Datensatz + signierter Upload-Link. Wiederholung mit
   * gleichem Key liefert dasselbe Foto (und, solange nicht hochgeladen, einen
   * frischen Link).
   */
  async fordereFotoAn(
    principal: Principal,
    protokollId: string,
    p: FotoAnfordern,
  ): Promise<{ foto: FotoAnsicht; upload: HochladeLink | null; idempotent: boolean }> {
    this.nurSchreibend(principal);
    const prot = await this.protokoll(principal, protokollId);
    const wiederholt = await this.fotoZumKey(prot.mandantId, p.idempotencyKey);
    if (wiederholt) {
      if (wiederholt.protokollId !== protokollId) {
        throw new ConflictException('Idempotency-Key wurde bereits für ein anderes Foto verwendet');
      }
      return { ...(await this.fotoMitLink(wiederholt)), idempotent: true };
    }
    if (prot.status !== 'offen') {
      throw new ConflictException('Protokoll ist abgeschlossen – keine weiteren Fotos');
    }
    let foto: FotoZeile;
    try {
      foto = await this.db.transaction(async (tx) => {
        await this.sperreOffen(tx, protokollId);
        const id = randomUUID();
        const [row] = await tx
          .insert(protokollFoto)
          .values({
            id,
            mandantId: prot.mandantId,
            protokollId,
            perspektive: p.perspektive,
            objektSchluessel: fotoObjektSchluessel({
              mandantId: prot.mandantId,
              protokollId,
              fotoId: id,
              typ: p.contentType,
              zeit: new Date(),
            }),
            contentType: p.contentType,
            groesse: p.groesse,
            sha256: p.sha256,
            aufgenommenAm: p.aufgenommenAm ? new Date(p.aufgenommenAm) : null,
            angefordertVon: principal.akteurId,
            idempotencyKey: p.idempotencyKey,
          })
          .returning();
        await protokolliereAnlage(tx, principal, 'protokoll_foto', row!.id, ohneTechnik(row!));
        return row!;
      });
    } catch (e: unknown) {
      if (istPgFehler(e, PG_FEHLER.EINDEUTIG, 'uq_foto_idempotency')) {
        const erste = await this.fotoZumKey(prot.mandantId, p.idempotencyKey);
        if (erste) return { ...(await this.fotoMitLink(erste)), idempotent: true };
      }
      throw e;
    }
    return { ...(await this.fotoMitLink(foto)), idempotent: false };
  }

  /**
   * Hochladen bestätigen: Der Kern prüft das Objekt im Speicher gegen die
   * Angaben der Anforderung. Passt etwas nicht, wird das Foto verworfen.
   */
  async bestaetigeFoto(
    principal: Principal,
    protokollId: string,
    fotoId: string,
  ): Promise<FotoAnsicht> {
    this.nurSchreibend(principal);
    await this.protokoll(principal, protokollId);
    const [f] = await this.db
      .select()
      .from(protokollFoto)
      .where(and(eq(protokollFoto.id, fotoId), eq(protokollFoto.protokollId, protokollId)));
    if (!f) throw new NotFoundException('Foto nicht gefunden');
    if (f.status === 'hochgeladen') return this.fotoAnsicht(f);
    if (f.status === 'verworfen') {
      throw new ConflictException({ fehler: 'Foto verworfen', gruende: [f.verwurfGrund ?? ''] });
    }

    // Prüfen außerhalb der Transaktion (Netzwerk, ggf. mehrere MB lesen).
    const info = await this.speicher.info(f.objektSchluessel);
    if (!info) {
      throw new ConflictException({
        fehler: 'Foto ist noch nicht im Speicher',
        gruende: ['Bitte zuerst über den Upload-Link hochladen'],
      });
    }
    let grund: string | null = null;
    if (info.groesse !== f.groesse) {
      grund = `Größe ${info.groesse} Bytes statt angekündigter ${f.groesse} Bytes`;
    } else if (info.contentType && info.contentType !== f.contentType) {
      grund = `Typ ${info.contentType} statt ${f.contentType}`;
    } else if ((await this.speicher.sha256(f.objektSchluessel)) !== f.sha256) {
      grund = 'Prüfsumme (SHA-256) stimmt nicht – Datei beschädigt oder verändert';
    }

    const neu = await this.db.transaction(async (tx) => {
      await this.sperreOffen(tx, protokollId);
      const [jetzt] = await tx
        .select()
        .from(protokollFoto)
        .where(eq(protokollFoto.id, fotoId))
        .for('update');
      if (jetzt!.status !== 'angefordert') return jetzt!;
      const werte = grund
        ? { status: 'verworfen', verwurfGrund: grund }
        : { status: 'hochgeladen', hochgeladenAm: new Date() };
      const [row] = await tx
        .update(protokollFoto)
        .set(werte)
        .where(eq(protokollFoto.id, fotoId))
        .returning();
      await schreibeAudit(tx, principal, {
        aktion: 'POST',
        entitaetTyp: 'protokoll_foto_status',
        entitaetId: fotoId,
        altWert: { status: 'angefordert' },
        neuWert: grund ? { status: 'verworfen', verwurfGrund: grund } : { status: 'hochgeladen' },
      });
      return row!;
    });
    if (neu.status === 'verworfen') {
      throw new ConflictException({ fehler: 'Foto verworfen', gruende: [neu.verwurfGrund ?? ''] });
    }
    return this.fotoAnsicht(neu);
  }

  // --- intern ---

  /** Protokollzeile sperren; abgeschlossen = keine Änderung mehr. */
  private async sperreOffen(tx: Transaktion, id: string): Promise<ProtokollZeile> {
    const [p] = await tx
      .select()
      .from(uebergabeprotokoll)
      .where(eq(uebergabeprotokoll.id, id))
      .for('update');
    if (!p) throw new NotFoundException('Protokoll nicht gefunden');
    if (p.status !== 'offen') {
      throw new ConflictException('Protokoll ist abgeschlossen und unveränderbar');
    }
    return p;
  }

  private async pruefeSchadenFotos(
    tx: Transaktion,
    protokollId: string,
    schaeden: { fotoIds?: string[] }[],
  ): Promise<void> {
    const ids = [...new Set(schaeden.flatMap((s) => s.fotoIds ?? []))];
    if (ids.length === 0) return;
    const gefunden = await tx
      .select({ id: protokollFoto.id })
      .from(protokollFoto)
      .where(and(eq(protokollFoto.protokollId, protokollId), inArray(protokollFoto.id, ids)));
    if (gefunden.length !== ids.length) {
      throw new BadRequestException('Schadenfotos gehören nicht zu diesem Protokoll');
    }
  }

  private async fotoZumKey(mandant: string, key: string): Promise<FotoZeile | undefined> {
    const [f] = await this.db
      .select()
      .from(protokollFoto)
      .where(and(eq(protokollFoto.mandantId, mandant), eq(protokollFoto.idempotencyKey, key)));
    return f;
  }

  private async fotoMitLink(f: FotoZeile) {
    const upload =
      f.status === 'angefordert'
        ? await this.speicher.hochladeLink(f.objektSchluessel, f.contentType, UPLOAD_GUELTIG_SEK)
        : null;
    return { foto: await this.fotoAnsicht(f), upload };
  }

  private async fotoAnsicht(f: FotoZeile): Promise<FotoAnsicht> {
    const { objektSchluessel, idempotencyKey: _k, ...rest } = f;
    return {
      ...rest,
      url:
        f.status === 'hochgeladen'
          ? await this.speicher.ladeLink(objektSchluessel, ANSICHT_GUELTIG_SEK)
          : null,
    };
  }

  private async ansicht(p: ProtokollZeile): Promise<ProtokollAnsicht> {
    const fotos = await this.db
      .select()
      .from(protokollFoto)
      .where(eq(protokollFoto.protokollId, p.id))
      .orderBy(asc(protokollFoto.angefordertAm))
      .limit(100);
    const fertige = fotos.filter((f) => f.status === 'hochgeladen');
    return {
      ...p,
      version: versionVon(p.aktualisiertAm),
      fotos: await Promise.all(fotos.map((f) => this.fotoAnsicht(f))),
      fehlt:
        p.status === 'offen'
          ? fehltZumAbschluss({
              art: p.art as ProtokollArt,
              kmStand: p.kmStand,
              checkliste: p.checkliste,
              fotos: fertige.map((f) => f.perspektive as FotoPerspektive),
            })
          : [],
    };
  }
}

/** Audit ohne technische Felder (Objektschlüssel bleibt im Datensatz). */
function ohneTechnik(f: FotoZeile): Omit<FotoZeile, 'idempotencyKey'> {
  const { idempotencyKey: _k, ...rest } = f;
  return rest;
}
