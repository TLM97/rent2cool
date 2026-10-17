/**
 * Zustellung des Temperaturnachweises an den Kunden (F-46, Tom 2026-10-17:
 * Kundenportal und E-Mail). Hier: E-Mail an den QA-Kontakt des Kunden mit dem
 * gesiegelten PDF im Anhang – je Nachweis höchstens einmal, jedes Ergebnis
 * festgehalten (gesendet, übersprungen, fehlgeschlagen) und auditiert.
 * Der Download im Kundenportal läuft über `GET /v1/mieten/:id/temperaturnachweise`.
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import type { NachweisBewertung } from '@rent2cool/shared';
import { schreibeAudit } from '../audit/audit.service';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { fahrzeug, kunde, miete, nachweisZustellung, temperaturnachweisArchiv } from '../db/schema';
import { MAIL_VERSAND, type Mail, type MailVersand } from '../mail/mail-versand';
import { OBJEKT_SPEICHER, type ObjektSpeicher } from '../objektspeicher/objekt-speicher';
import { BERICHTSDIENST } from './archiv.service';

export type ZustellErgebnis = 'gesendet' | 'uebersprungen' | 'bereits_erledigt';

const BEWERTUNG: Record<string, string> = {
  eingehalten: 'Temperaturprofil eingehalten',
  verletzt: 'Temperaturprofil VERLETZT',
  unvollstaendig: 'Messreihe unvollständig',
};

const ortszeit = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Inhalt der Nachweis-Mail (rein, testbar). */
export function nachweisMail(o: {
  an: string;
  firmenname: string;
  kennzeichen: string;
  von: Date;
  bis: Date;
  version: number;
  bewertung: NachweisBewertung | string;
  pdfSha256: string;
  siegel: string | null;
  pdf: Buffer;
}): Mail {
  const zeitraum = `${ortszeit.format(o.von)} – ${ortszeit.format(o.bis)}`;
  const neu = o.version > 1;
  return {
    an: o.an,
    betreff: `${neu ? `Neue Version ${o.version}: ` : ''}Temperaturnachweis ${o.kennzeichen} – ${BEWERTUNG[o.bewertung] ?? o.bewertung}`,
    text: [
      'Guten Tag,',
      '',
      `anbei der Temperaturnachweis zu Ihrer Miete (${o.firmenname}):`,
      '',
      `Fahrzeug:   ${o.kennzeichen}`,
      `Zeitraum:   ${zeitraum} (Ortszeit Berlin)`,
      `Ergebnis:   ${BEWERTUNG[o.bewertung] ?? o.bewertung}`,
      `Version:    ${o.version}`,
      ...(neu
        ? [
            '',
            `Diese Version ersetzt Version ${o.version - 1} – zum Beispiel, weil Messwerte aus einem Funkloch nachgeliefert wurden.`,
          ]
        : []),
      '',
      o.siegel
        ? `Das PDF ist elektronisch gesiegelt (${o.siegel}) und lässt sich in jedem PDF-Programm prüfen.`
        : 'Das PDF ist durch eine Prüfsumme gesichert.',
      `SHA-256 des PDF: ${o.pdfSha256}`,
      '',
      'Den Nachweis finden Sie außerdem im Kundenportal.',
      '',
      'Rent2Cool (Platzhalter-Absender, D-015)',
    ].join('\n'),
    anhaenge: [
      {
        dateiname: `Temperaturnachweis_${o.kennzeichen.replace(/[^A-Za-z0-9-]/g, '_')}_v${o.version}.pdf`,
        inhalt: o.pdf,
        typ: 'application/pdf',
      },
    ],
  };
}

@Injectable()
export class NachweisZustellung {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OBJEKT_SPEICHER) private readonly speicher: ObjektSpeicher,
    @Inject(MAIL_VERSAND) private readonly mail: MailVersand,
  ) {}

  /** Per E-Mail zustellen; Fehler werfen (der Job wiederholt), danach `vermerkeFehler`. */
  async zustelle(archivId: string): Promise<ZustellErgebnis> {
    const [schon] = await this.db
      .select({ id: nachweisZustellung.id })
      .from(nachweisZustellung)
      .where(eq(nachweisZustellung.archivId, archivId));
    if (schon) return 'bereits_erledigt';

    const [z] = await this.db
      .select({
        a: temperaturnachweisArchiv,
        firmenname: kunde.firmenname,
        email: kunde.nachweisEmail,
        kennzeichen: fahrzeug.kennzeichen,
      })
      .from(temperaturnachweisArchiv)
      .innerJoin(miete, eq(temperaturnachweisArchiv.mieteId, miete.id))
      .innerJoin(kunde, eq(miete.kundeId, kunde.id))
      .innerJoin(fahrzeug, eq(miete.fahrzeugId, fahrzeug.id))
      .where(eq(temperaturnachweisArchiv.id, archivId));
    if (!z) throw new NotFoundException('Nachweis nicht gefunden');

    if (!z.email) {
      await this.vermerke(z.a.mandantId, archivId, {
        status: 'uebersprungen',
        grund: 'Keine E-Mail-Adresse für Temperaturnachweise beim Kunden hinterlegt',
      });
      return 'uebersprungen';
    }
    const pdf = await this.speicher.lade(z.a.pdfSchluessel);
    // Nie eine veränderte Datei verschicken.
    if (createHash('sha256').update(pdf).digest('hex') !== z.a.pdfSha256) {
      throw new Error('PDF im Speicher weicht vom Archiv ab – Zustellung abgebrochen');
    }
    const { nachrichtId } = await this.mail.sende(
      nachweisMail({
        an: z.email,
        firmenname: z.firmenname,
        kennzeichen: z.kennzeichen,
        von: z.a.von,
        bis: z.a.bis,
        version: z.a.version,
        bewertung: z.a.bewertung,
        pdfSha256: z.a.pdfSha256,
        siegel:
          z.a.siegelArt === 'testsiegel' ? 'Testsiegel ohne Rechtswirkung' : z.a.siegelAussteller,
        pdf,
      }),
    );
    await this.vermerke(z.a.mandantId, archivId, {
      status: 'gesendet',
      empfaenger: z.email,
      nachrichtId,
    });
    return 'gesendet';
  }

  /** Endgültig gescheitert (alle Wiederholungen aufgebraucht). */
  async vermerkeFehler(archivId: string, grund: string): Promise<void> {
    const [a] = await this.db
      .select({ mandantId: temperaturnachweisArchiv.mandantId })
      .from(temperaturnachweisArchiv)
      .where(eq(temperaturnachweisArchiv.id, archivId));
    if (a) await this.vermerke(a.mandantId, archivId, { status: 'fehlgeschlagen', grund });
  }

  async liste(archivIds: string[]) {
    if (archivIds.length === 0) return [];
    return this.db
      .select()
      .from(nachweisZustellung)
      .where(inArray(nachweisZustellung.archivId, archivIds));
  }

  private async vermerke(
    mandantId: string,
    archivId: string,
    e: { status: string; empfaenger?: string; grund?: string; nachrichtId?: string },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(nachweisZustellung)
        .values({
          mandantId,
          archivId,
          kanal: 'email',
          status: e.status,
          empfaenger: e.empfaenger ?? null,
          grund: e.grund ?? null,
          nachrichtId: e.nachrichtId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) return; // gleichzeitig bereits vermerkt
      await schreibeAudit(
        tx,
        { ...BERICHTSDIENST, mandantId },
        {
          aktion: 'POST',
          entitaetTyp: 'nachweis_zustellung',
          entitaetId: archivId,
          altWert: null,
          neuWert: { kanal: 'email', status: e.status, empfaenger: e.empfaenger, grund: e.grund },
        },
      );
    });
  }
}
