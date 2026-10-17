/**
 * Archiv der Temperaturnachweise je Miete – das zentrale Verkaufsargument:
 * Nach jeder Miete entsteht automatisch ein lückenloser, fälschungssicherer
 * Nachweis (JSON für Systeme, PDF für Menschen).
 *
 * Sicherung in zwei Stufen: (1) Messdaten-Hash + Signatur im Nachweis selbst,
 * (2) SHA-256 beider Dateien + Dokumentsignatur im Archiv. Archiveinträge sind
 * unveränderbar (Datenbank-Trigger); neue Erkenntnisse ergeben eine neue Version.
 * Die Echtheitsprüfung erkennt veränderte Dateien und nachgelieferte Messwerte.
 */
import { randomUUID, createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, notExists, sql } from 'drizzle-orm';
import type { NachweisAusloeser, NachweisDokument, Principal } from '@rent2cool/shared';
import { protokolliereAnlage } from '../audit/audit.service';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { istPgFehler, PG_FEHLER } from '../db/fehler';
import { fahrzeug, kunde, miete, temperaturnachweisArchiv } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { OBJEKT_SPEICHER, type ObjektSpeicher } from '../objektspeicher/objekt-speicher';
import { BerichtService } from './bericht.service';

/** Akteur des automatischen Nachweises im Audit Trail. */
export const BERICHTSDIENST: Principal = {
  akteurId: 'system:berichtsdienst',
  name: 'Berichtsdienst',
  rollen: [],
};

const MESSGROESSE = 'temperatur_laderaum';
const LUECKE_MIN = 5;
const LINK_GUELTIG_SEK = 10 * 60;
/** Nur so weit zurück sucht der Dienst nach fehlenden Nachweisen (begrenzte Abfrage, D-003). */
const SUCHFENSTER_TAGE = 30;

type ArchivZeile = typeof temperaturnachweisArchiv.$inferSelect;

export interface ArchivAnsicht extends Omit<
  ArchivZeile,
  'jsonSchluessel' | 'pdfSchluessel' | 'datenSignatur'
> {
  jsonUrl: string;
  pdfUrl: string;
}

export interface Echtheitspruefung {
  id: string;
  ergebnis: 'echt' | 'abweichung';
  /** Dateien im Speicher unverändert (SHA-256 wie archiviert)? */
  dateienUnveraendert: boolean;
  /** Dokument- und Datensignatur gültig? */
  signaturenGueltig: boolean;
  /** Messdaten heute noch dieselben (keine Nachlieferung)? */
  messdatenUnveraendert: boolean;
  hinweise: string[];
  geprueftAm: string;
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

@Injectable()
export class NachweisArchiv {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly berichte: BerichtService,
    @Inject(OBJEKT_SPEICHER) private readonly speicher: ObjektSpeicher,
  ) {}

  /**
   * Nachweis einer beendeten Miete erzeugen, ablegen und archivieren.
   * Automatisch: höchstens einmal je Miete (Wiederholung liefert den vorhandenen).
   */
  async erstelle(
    mieteId: string,
    o: { ausloeser: NachweisAusloeser; akteur: Principal },
  ): Promise<{ id: string; version: number; idempotent: boolean }> {
    const m = await this.lade(mieteId, o.akteur);
    if (!['beendet', 'abgerechnet'].includes(m.status) || !m.startIst || !m.endeIst) {
      throw new ConflictException({
        fehler: 'Kein Nachweis möglich',
        gruende: [`Miete ist im Status ${m.status} – der Nachweis entsteht nach Mietende`],
      });
    }
    for (let versuch = 1; ; versuch++) {
      const vorhanden = await this.automatischVorhanden(mieteId);
      if (o.ausloeser === 'automatisch' && vorhanden) {
        return { id: vorhanden.id, version: vorhanden.version, idempotent: true };
      }
      try {
        return { ...(await this.erzeugeVersion(m, o)), idempotent: false };
      } catch (e: unknown) {
        // Gleichzeitig entstanden: automatischer Nachweis bereits da bzw. Version vergeben.
        if (istPgFehler(e, PG_FEHLER.EINDEUTIG, 'uq_archiv_miete_automatisch')) continue;
        if (istPgFehler(e, PG_FEHLER.EINDEUTIG, 'uq_archiv_miete_version') && versuch < 3) continue;
        throw e;
      }
    }
  }

  /** Beendete Mieten ohne automatischen Nachweis, deren Karenzzeit abgelaufen ist. */
  async faellige(jetzt: Date, karenzMin: number, limit = 100): Promise<string[]> {
    const bis = new Date(jetzt.getTime() - karenzMin * 60_000);
    const ab = new Date(jetzt.getTime() - SUCHFENSTER_TAGE * 86_400_000);
    const zeilen = await this.db
      .select({ id: miete.id })
      .from(miete)
      .where(
        and(
          inArray(miete.status, ['beendet', 'abgerechnet']),
          isNotNull(miete.endeIst),
          lte(miete.endeIst, bis),
          gte(miete.endeIst, ab),
          notExists(
            this.db
              .select({ x: sql`1` })
              .from(temperaturnachweisArchiv)
              .where(
                and(
                  eq(temperaturnachweisArchiv.mieteId, miete.id),
                  eq(temperaturnachweisArchiv.ausloeser, 'automatisch'),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(miete.endeIst))
      .limit(limit);
    return zeilen.map((z) => z.id);
  }

  /** Alle Versionen einer Miete, neueste zuerst, mit kurzlebigen Download-Links. */
  async liste(principal: Principal, mieteId: string): Promise<ArchivAnsicht[]> {
    await this.lade(mieteId, principal);
    const zeilen = await this.db
      .select()
      .from(temperaturnachweisArchiv)
      .where(eq(temperaturnachweisArchiv.mieteId, mieteId))
      .orderBy(desc(temperaturnachweisArchiv.version))
      .limit(50);
    return Promise.all(zeilen.map((z) => this.ansicht(z)));
  }

  /** Echtheitsprüfung: Dateien, Signaturen und Messdaten gegen das Archiv. */
  async pruefe(principal: Principal, id: string): Promise<Echtheitspruefung> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const [a] = await this.db
      .select()
      .from(temperaturnachweisArchiv)
      .where(
        and(eq(temperaturnachweisArchiv.id, id), eq(temperaturnachweisArchiv.mandantId, mandant)),
      );
    if (!a) throw new NotFoundException('Nachweis nicht gefunden');
    const hinweise: string[] = [];

    const [jsonIst, pdfIst] = await Promise.all([
      this.speicher.sha256(a.jsonSchluessel).catch(() => null),
      this.speicher.sha256(a.pdfSchluessel).catch(() => null),
    ]);
    if (jsonIst !== a.jsonSha256) hinweise.push('JSON-Datei fehlt oder wurde verändert');
    if (pdfIst !== a.pdfSha256) hinweise.push('PDF-Datei fehlt oder wurde verändert');

    const s = this.berichte.signatur;
    const signaturenGueltig =
      s.algorithmus === a.signaturAlgorithmus &&
      s.signiere(`${a.jsonSha256}:${a.pdfSha256}`) === a.dokumentSignatur &&
      s.signiere(a.datenHash) === a.datenSignatur;
    if (!signaturenGueltig) hinweise.push('Signatur ungültig');

    const heute = await this.berichte.erzeuge({
      fahrzeugId: (await this.fahrzeugVon(a.mieteId))!,
      messgroesse: MESSGROESSE,
      von: a.von.toISOString(),
      bis: a.bis.toISOString(),
      profilName: a.profil,
      lueckeSchwelleMin: LUECKE_MIN,
    });
    const messdatenUnveraendert = heute.integritaet.datenHash === a.datenHash;
    if (!messdatenUnveraendert) {
      hinweise.push(
        'Die Messdaten im Zeitraum haben sich seit der Erzeugung geändert (z. B. Nachlieferung aus einem Funkloch) – neue Version erzeugen',
      );
    }
    const dateienUnveraendert = jsonIst === a.jsonSha256 && pdfIst === a.pdfSha256;
    return {
      id,
      ergebnis: dateienUnveraendert && signaturenGueltig ? 'echt' : 'abweichung',
      dateienUnveraendert,
      signaturenGueltig,
      messdatenUnveraendert,
      hinweise,
      geprueftAm: new Date().toISOString(),
    };
  }

  // --- intern ---

  /** Miete mit Kunde und Kennzeichen; Mandant des Akteurs (System: alle). */
  private async lade(mieteId: string, akteur: Principal) {
    const [m] = await this.db
      .select({
        m: miete,
        kunde: kunde.firmenname,
        kennzeichen: fahrzeug.kennzeichen,
        standardProfil: fahrzeug.standardTemperaturprofil,
      })
      .from(miete)
      .innerJoin(kunde, eq(miete.kundeId, kunde.id))
      .innerJoin(fahrzeug, eq(miete.fahrzeugId, fahrzeug.id))
      .where(eq(miete.id, mieteId));
    const system = akteur.akteurId === BERICHTSDIENST.akteurId;
    if (!m || (!system && m.m.mandantId !== (akteur.mandantId ?? PLACEHOLDER_MANDANT_ID))) {
      throw new NotFoundException('Miete nicht gefunden');
    }
    return { ...m.m, kunde: m.kunde, kennzeichen: m.kennzeichen, standardProfil: m.standardProfil };
  }

  private async fahrzeugVon(mieteId: string): Promise<string | undefined> {
    const [m] = await this.db
      .select({ f: miete.fahrzeugId })
      .from(miete)
      .where(eq(miete.id, mieteId));
    return m?.f;
  }

  private async automatischVorhanden(mieteId: string) {
    const [a] = await this.db
      .select({ id: temperaturnachweisArchiv.id, version: temperaturnachweisArchiv.version })
      .from(temperaturnachweisArchiv)
      .where(
        and(
          eq(temperaturnachweisArchiv.mieteId, mieteId),
          eq(temperaturnachweisArchiv.ausloeser, 'automatisch'),
        ),
      );
    return a;
  }

  private async erzeugeVersion(
    m: Awaited<ReturnType<NachweisArchiv['lade']>>,
    o: { ausloeser: NachweisAusloeser; akteur: Principal },
  ): Promise<{ id: string; version: number }> {
    const [letzte] = await this.db
      .select({ v: sql<number>`coalesce(max(${temperaturnachweisArchiv.version}), 0)::int` })
      .from(temperaturnachweisArchiv)
      .where(eq(temperaturnachweisArchiv.mieteId, m.id));
    const version = (letzte?.v ?? 0) + 1;
    const profil = m.temperaturprofil ?? m.standardProfil ?? '2-8';
    const { nachweis, kurve } = await this.berichte.erzeugeMitKurve({
      fahrzeugId: m.fahrzeugId,
      messgroesse: MESSGROESSE,
      von: m.startIst!.toISOString(),
      bis: m.endeIst!.toISOString(),
      profilName: profil,
      lueckeSchwelleMin: LUECKE_MIN,
    });
    const dokument: NachweisDokument = {
      schemaVersion: 1,
      titel: 'Temperaturnachweis',
      version,
      ausloeser: o.ausloeser,
      miete: {
        mieteId: m.id,
        kunde: m.kunde,
        kennzeichen: m.kennzeichen,
        startIst: m.startIst!.toISOString(),
        endeIst: m.endeIst!.toISOString(),
      },
      nachweis,
      kurve,
    };
    const [json, pdf] = await Promise.all([
      this.berichte.renderer('json').render(dokument),
      this.berichte.renderer('pdf').render(dokument),
    ]);
    // Dateien zuerst ablegen; ohne Archiveintrag bleiben sie unbeachtet liegen.
    const id = randomUUID();
    const monat = new Date().toISOString().slice(0, 7).replace('-', '/');
    const basis = `nachweise/${m.mandantId}/${monat}/${m.id}/${id}`;
    await Promise.all([
      this.speicher.ablegen(`${basis}.json`, 'application/json', json),
      this.speicher.ablegen(`${basis}.pdf`, 'application/pdf', pdf),
    ]);
    const jsonSha256 = sha256(json);
    const pdfSha256 = sha256(pdf);
    const s = this.berichte.signatur;
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(temperaturnachweisArchiv)
        .values({
          id,
          mandantId: m.mandantId,
          mieteId: m.id,
          version,
          ausloeser: o.ausloeser,
          erzeugtVon: o.akteur.akteurId,
          erzeugtAm: new Date(nachweis.erzeugtAm),
          von: m.startIst!,
          bis: m.endeIst!,
          profil,
          bewertung: nachweis.bewertung,
          kennzahlen: nachweis.kennzahlen,
          anzahlGrenzverletzungen: nachweis.grenzverletzungen.length,
          anzahlLuecken: nachweis.luecken.length,
          datenHash: nachweis.integritaet.datenHash,
          signaturAlgorithmus: s.algorithmus,
          datenSignatur: nachweis.integritaet.signatur,
          jsonSchluessel: `${basis}.json`,
          jsonSha256,
          jsonGroesse: json.length,
          pdfSchluessel: `${basis}.pdf`,
          pdfSha256,
          pdfGroesse: pdf.length,
          dokumentSignatur: s.signiere(`${jsonSha256}:${pdfSha256}`),
        })
        .returning();
      await protokolliereAnlage(
        tx,
        { ...o.akteur, mandantId: m.mandantId },
        'temperaturnachweis',
        id,
        {
          mieteId: row!.mieteId,
          version,
          ausloeser: o.ausloeser,
          bewertung: row!.bewertung,
          datenHash: row!.datenHash,
          jsonSha256,
          pdfSha256,
        },
      );
      return { id, version };
    });
  }

  private async ansicht(z: ArchivZeile): Promise<ArchivAnsicht> {
    const { jsonSchluessel, pdfSchluessel, datenSignatur: _s, ...rest } = z;
    const [jsonUrl, pdfUrl] = await Promise.all([
      this.speicher.ladeLink(jsonSchluessel, LINK_GUELTIG_SEK),
      this.speicher.ladeLink(pdfSchluessel, LINK_GUELTIG_SEK),
    ]);
    return { ...rest, jsonUrl, pdfUrl };
  }
}
