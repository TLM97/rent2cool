/**
 * Selbstregistrierung und Organisation des Kunden (F-51, Tom 2026-10-17):
 * Der Kunde legt seinen Zugang selbst an und verwaltet seine Leute; Rent2Cool
 * gibt den Kunden nur frei (Kundenstatus, D-010 – gebucht wird erst danach).
 *
 * - Registrierung: der angemeldete Login legt seinen Kunden an („in Prüfung“)
 *   und wird dessen Verwalter (alle drei Kundenrollen); der Betrieb wird per
 *   E-Mail auf die Freigabe hingewiesen.
 * - Einladungen: Link mit Einmal-Code per E-Mail; gespeichert nur der Hash,
 *   7 Tage gültig, einlösbar nur von dem Login mit der eingeladenen E-Mail.
 * - Mitglieder: Rollen ändern, entfernen – mindestens ein Verwalter bleibt.
 * Alles auditiert.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, gt, isNull, lte } from 'drizzle-orm';
import {
  hatRolle,
  KUNDE_ROLLE_NAME,
  type Einladung,
  type KundeRolle,
  type OrganisationAendern,
  type Principal,
  type Registrierung,
} from '@rent2cool/shared';
import { protokolliereAnlage, schreibeAudit } from '../audit/audit.service';
import type { Env } from '../config/env';
import type { Database, Transaktion } from '../db/client';
import { DB } from '../db/db.module';
import { istPgFehler, PG_FEHLER } from '../db/fehler';
import { kunde, kundeEinladung, kundeKonto } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { KundeService } from '../kunde/kunde.service';
import { MAIL_VERSAND, type MailVersand } from '../mail/mail-versand';

const EINLADUNG_GUELTIG_TAGE = 7;
const INTERN = ['admin', 'ops', 'qa_approver', 'dpo'] as const;
/** Felder, die die Identität des Kunden ausmachen: nach der Freigabe nur durch uns. */
const IDENTITAET = ['firmenname', 'handelsregisternummer', 'ustId'] as const;

const codeHash = (code: string) => createHash('sha256').update(code, 'utf8').digest('hex');

@Injectable()
export class OrganisationService {
  private readonly log = new Logger(OrganisationService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly kunden: KundeService,
    @Inject(MAIL_VERSAND) private readonly mail: MailVersand,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  // --- Registrierung ---

  async registriere(p: Principal, r: Registrierung): Promise<{ kundeId: string }> {
    this.keinInternesKonto(p);
    await this.nochKeinKunde(p);
    const mandantId = p.mandantId ?? PLACEHOLDER_MANDANT_ID;
    let kundeId: string;
    try {
      kundeId = await this.db.transaction(async (tx) => {
        const [k] = await tx
          .insert(kunde)
          .values({
            mandantId,
            firmenname: r.firmenname,
            handelsregisternummer: r.handelsregisternummer ?? null,
            ustId: r.ustId ?? null,
            strasse: r.strasse ?? null,
            plz: r.plz ?? null,
            ort: r.ort ?? null,
            land: r.land,
            nachweisEmail: r.nachweisEmail ?? null,
            // Selbst angelegt = zur Prüfung eingereicht; freigeben tut der Betrieb.
            status: 'in_pruefung',
          })
          .returning();
        await protokolliereAnlage(tx, p, 'kunde', k!.id, { ...k, quelle: 'selbstregistrierung' });
        await this.mitglied(tx, p, k!.id, mandantId, {
          kontoId: p.akteurId,
          rollen: ['kunde_admin', 'kunde_dispo', 'kunde_qa'],
          email: p.email ?? null,
          bezeichnung: p.name ?? null,
        });
        return k!.id;
      });
    } catch (e: unknown) {
      if (istPgFehler(e, PG_FEHLER.EINDEUTIG)) {
        throw new ConflictException('Ihr Login gehört bereits zu einem Kunden');
      }
      throw e;
    }
    // Betrieb auf die Freigabe hinweisen (Zustellung ist Hinweis, kein Muss).
    await this.mail
      .sende({
        an: this.config.get('BETRIEB_EMAIL', { infer: true }),
        betreff: `Neue Registrierung zur Freigabe: ${r.firmenname}`,
        text: [
          `${r.firmenname} hat sich selbst registriert und wartet auf die Freigabe (Kundenprüfung).`,
          '',
          `USt-ID: ${r.ustId ?? '–'}`,
          `Handelsregister: ${r.handelsregisternummer ?? '–'}`,
          `Registriert von: ${p.name ?? p.akteurId}${p.email ? ` <${p.email}>` : ''}`,
          `Kunde: ${kundeId}`,
        ].join('\n'),
      })
      .catch((e: unknown) => this.log.warn({ err: e }, 'Hinweis an den Betrieb nicht versandt'));
    return { kundeId };
  }

  // --- Organisation ---

  async organisation(p: Principal) {
    const kundeId = this.eigenerKunde(p);
    const [k] = await this.db.select().from(kunde).where(eq(kunde.id, kundeId));
    if (!k) throw new NotFoundException('Kunde nicht gefunden');
    const [mitglieder, einladungen] = await Promise.all([
      this.db
        .select({
          kontoId: kundeKonto.kontoId,
          email: kundeKonto.email,
          bezeichnung: kundeKonto.bezeichnung,
          rollen: kundeKonto.rollen,
          erstelltAm: kundeKonto.erstelltAm,
        })
        .from(kundeKonto)
        .where(eq(kundeKonto.kundeId, kundeId))
        .orderBy(asc(kundeKonto.erstelltAm))
        .limit(200),
      this.offeneEinladungen(kundeId),
    ]);
    return {
      kunde: k,
      version: k.aktualisiertAm.toISOString(),
      // Gebucht werden kann erst nach unserer Freigabe (D-010).
      freigegeben: k.status === 'freigegeben',
      mitglieder,
      einladungen,
    };
  }

  async aendere(p: Principal, a: OrganisationAendern) {
    const kundeId = this.eigenerKunde(p);
    this.verwalter(p);
    const [k] = await this.db
      .select({ status: kunde.status })
      .from(kunde)
      .where(eq(kunde.id, kundeId));
    const identitaet = IDENTITAET.filter((f) => a[f] !== undefined);
    if (k?.status === 'freigegeben' && identitaet.length > 0) {
      throw new ConflictException({
        fehler: 'Nach der Freigabe nicht selbst änderbar',
        gruende: [
          'Firmenname, Handelsregister und USt-ID ändert nach der Freigabe nur Rent2Cool (erneute Prüfung) – bitte melden Sie sich bei uns.',
        ],
      });
    }
    return this.kunden.aendereKunde(p, kundeId, a);
  }

  // --- Einladungen ---

  async ladeEin(p: Principal, e: Einladung): Promise<{ id: string; gueltigBis: Date }> {
    const kundeId = this.eigenerKunde(p);
    this.verwalter(p);
    const [schonMitglied] = await this.db
      .select({ kontoId: kundeKonto.kontoId })
      .from(kundeKonto)
      .where(and(eq(kundeKonto.kundeId, kundeId), eq(kundeKonto.email, e.email)));
    if (schonMitglied) throw new ConflictException('Diese Person gehört bereits zur Organisation');

    const code = randomBytes(24).toString('base64url');
    const gueltigBis = new Date(Date.now() + EINLADUNG_GUELTIG_TAGE * 86_400_000);
    const [k] = await this.db
      .select({ mandantId: kunde.mandantId, firmenname: kunde.firmenname })
      .from(kunde)
      .where(eq(kunde.id, kundeId));
    let id: string;
    try {
      id = await this.db.transaction(async (tx) => {
        // Abgelaufene, nie eingelöste Einladung an dieselbe Adresse gilt als
        // ersetzt – sonst blockierte sie über den Index jede neue.
        const ersetzt = await tx
          .update(kundeEinladung)
          .set({ widerrufenAm: new Date() })
          .where(
            and(
              eq(kundeEinladung.kundeId, kundeId),
              eq(kundeEinladung.email, e.email),
              isNull(kundeEinladung.angenommenAm),
              isNull(kundeEinladung.widerrufenAm),
              lte(kundeEinladung.gueltigBis, new Date()),
            ),
          )
          .returning({ id: kundeEinladung.id });
        const [row] = await tx
          .insert(kundeEinladung)
          .values({
            mandantId: k!.mandantId,
            kundeId,
            email: e.email,
            rollen: e.rollen,
            codeHash: codeHash(code),
            erstelltVon: p.akteurId,
            gueltigBis,
          })
          .returning();
        // Den Code selbst nie protokollieren.
        await protokolliereAnlage(tx, p, 'kunde_einladung', kundeId, {
          einladungId: row!.id,
          email: e.email,
          rollen: e.rollen,
          gueltigBis,
          ...(ersetzt.length ? { ersetzt: ersetzt.map((x) => x.id) } : {}),
        });
        return row!.id;
      });
    } catch (err: unknown) {
      if (istPgFehler(err, PG_FEHLER.EINDEUTIG, 'uq_einladung_offen')) {
        throw new ConflictException(
          'Für diese E-Mail-Adresse gibt es bereits eine offene Einladung',
        );
      }
      throw err;
    }
    const link = `${this.config.get('PORTAL_URL', { infer: true })}/einladung?code=${code}`;
    await this.mail.sende({
      an: e.email,
      betreff: `Einladung zu ${k!.firmenname} bei Rent2Cool`,
      text: [
        'Guten Tag,',
        '',
        `${p.name ?? 'Ein Kollege'} lädt Sie in die Organisation „${k!.firmenname}“ bei Rent2Cool ein.`,
        `Ihre Aufgaben: ${e.rollen.map((r) => KUNDE_ROLLE_NAME[r]).join('; ')}.`,
        '',
        `Einladung annehmen (gültig bis ${gueltigBis.toISOString().slice(0, 10)}):`,
        link,
        '',
        'Melden Sie sich mit dieser E-Mail-Adresse an bzw. registrieren Sie sich damit.',
        '',
        'Rent2Cool (Platzhalter-Absender, D-015)',
      ].join('\n'),
    });
    return { id, gueltigBis };
  }

  async widerrufeEinladung(p: Principal, id: string): Promise<void> {
    const kundeId = this.eigenerKunde(p);
    this.verwalter(p);
    await this.db.transaction(async (tx) => {
      const [weg] = await tx
        .update(kundeEinladung)
        .set({ widerrufenAm: new Date() })
        .where(
          and(
            eq(kundeEinladung.id, id),
            eq(kundeEinladung.kundeId, kundeId),
            isNull(kundeEinladung.angenommenAm),
            isNull(kundeEinladung.widerrufenAm),
          ),
        )
        .returning();
      if (!weg) throw new NotFoundException('Offene Einladung nicht gefunden');
      await schreibeAudit(tx, p, {
        aktion: 'DELETE',
        entitaetTyp: 'kunde_einladung',
        entitaetId: kundeId,
        altWert: { einladungId: id, email: weg.email, rollen: weg.rollen },
        neuWert: null,
      });
    });
  }

  /** Einladung einlösen: nur der Login mit der eingeladenen E-Mail, nur einmal, nur gültig. */
  async nehmeAn(p: Principal, code: string): Promise<{ kundeId: string; rollen: KundeRolle[] }> {
    this.keinInternesKonto(p);
    await this.nochKeinKunde(p);
    try {
      return await this.db.transaction(async (tx) => {
        const [e] = await tx
          .select()
          .from(kundeEinladung)
          .where(eq(kundeEinladung.codeHash, codeHash(code)))
          .for('update');
        if (!e || e.angenommenAm || e.widerrufenAm || e.gueltigBis.getTime() < Date.now()) {
          throw new NotFoundException('Einladung ungültig, abgelaufen oder bereits verwendet');
        }
        if (!p.email || p.email !== e.email) {
          throw new ForbiddenException(
            'Diese Einladung gilt für eine andere E-Mail-Adresse – bitte mit der eingeladenen Adresse anmelden',
          );
        }
        await tx
          .update(kundeEinladung)
          .set({ angenommenVon: p.akteurId, angenommenAm: new Date() })
          .where(eq(kundeEinladung.id, e.id));
        await this.mitglied(tx, p, e.kundeId, e.mandantId, {
          kontoId: p.akteurId,
          rollen: e.rollen,
          email: e.email,
          bezeichnung: p.name ?? null,
        });
        return { kundeId: e.kundeId, rollen: e.rollen };
      });
    } catch (err: unknown) {
      if (istPgFehler(err, PG_FEHLER.EINDEUTIG)) {
        throw new ConflictException('Ihr Login gehört bereits zu einem Kunden');
      }
      throw err;
    }
  }

  // --- Mitglieder ---

  async aendereRollen(p: Principal, kontoId: string, rollen: KundeRolle[]): Promise<void> {
    const kundeId = this.eigenerKunde(p);
    this.verwalter(p);
    await this.db.transaction(async (tx) => {
      const alle = await this.sperreMitglieder(tx, kundeId);
      const m = alle.find((x) => x.kontoId === kontoId);
      if (!m) throw new NotFoundException('Mitglied nicht gefunden');
      const verwalterDanach = alle.filter((x) =>
        (x.kontoId === kontoId ? rollen : x.rollen).includes('kunde_admin'),
      );
      if (verwalterDanach.length === 0) throw new ConflictException(LETZTER_VERWALTER);
      await tx
        .update(kundeKonto)
        .set({ rollen, aktualisiertAm: new Date() })
        .where(eq(kundeKonto.kontoId, kontoId));
      await schreibeAudit(tx, p, {
        aktion: 'PATCH',
        entitaetTyp: 'kunde_konto',
        entitaetId: kundeId,
        altWert: { kontoId, rollen: m.rollen },
        neuWert: { kontoId, rollen },
      });
    });
  }

  async entferneMitglied(p: Principal, kontoId: string): Promise<void> {
    const kundeId = this.eigenerKunde(p);
    this.verwalter(p);
    await this.db.transaction(async (tx) => {
      const alle = await this.sperreMitglieder(tx, kundeId);
      const m = alle.find((x) => x.kontoId === kontoId);
      if (!m) throw new NotFoundException('Mitglied nicht gefunden');
      const verwalterDanach = alle.filter(
        (x) => x.kontoId !== kontoId && x.rollen.includes('kunde_admin'),
      );
      if (verwalterDanach.length === 0) throw new ConflictException(LETZTER_VERWALTER);
      await tx.delete(kundeKonto).where(eq(kundeKonto.kontoId, kontoId));
      await schreibeAudit(tx, p, {
        aktion: 'DELETE',
        entitaetTyp: 'kunde_konto',
        entitaetId: kundeId,
        altWert: { kontoId, email: m.email, rollen: m.rollen },
        neuWert: null,
      });
    });
  }

  // --- intern ---

  private keinInternesKonto(p: Principal) {
    if (hatRolle(p, ...INTERN)) {
      throw new ForbiddenException('Interne Konten gehören zu keinem Kunden');
    }
  }

  private async nochKeinKunde(p: Principal) {
    const [k] = await this.db
      .select({ kundeId: kundeKonto.kundeId })
      .from(kundeKonto)
      .where(eq(kundeKonto.kontoId, p.akteurId));
    if (k) throw new ConflictException('Ihr Login gehört bereits zu einem Kunden');
  }

  private eigenerKunde(p: Principal): string {
    if (!p.kundeId) throw new ForbiddenException('Ihr Zugang ist keinem Kunden zugeordnet');
    return p.kundeId;
  }

  private verwalter(p: Principal) {
    if (!hatRolle(p, 'kunde_admin')) {
      throw new ForbiddenException('Nur die Verwaltung der Organisation darf das');
    }
  }

  private offeneEinladungen(kundeId: string) {
    return this.db
      .select({
        id: kundeEinladung.id,
        email: kundeEinladung.email,
        rollen: kundeEinladung.rollen,
        erstelltAm: kundeEinladung.erstelltAm,
        gueltigBis: kundeEinladung.gueltigBis,
      })
      .from(kundeEinladung)
      .where(
        and(
          eq(kundeEinladung.kundeId, kundeId),
          isNull(kundeEinladung.angenommenAm),
          isNull(kundeEinladung.widerrufenAm),
          gt(kundeEinladung.gueltigBis, new Date()),
        ),
      )
      .orderBy(asc(kundeEinladung.erstelltAm))
      .limit(200);
  }

  /** Mitglieder sperren: Rollenänderungen gleichzeitig dürfen den letzten Verwalter nicht entfernen. */
  private sperreMitglieder(tx: Transaktion, kundeId: string) {
    return tx.select().from(kundeKonto).where(eq(kundeKonto.kundeId, kundeId)).for('update');
  }

  private async mitglied(
    tx: Transaktion,
    p: Principal,
    kundeId: string,
    mandantId: string,
    m: { kontoId: string; rollen: KundeRolle[]; email: string | null; bezeichnung: string | null },
  ) {
    const [row] = await tx
      .insert(kundeKonto)
      .values({ ...m, kundeId, mandantId, erstelltVon: p.akteurId })
      .returning();
    await protokolliereAnlage(tx, p, 'kunde_konto', kundeId, row);
  }
}

const LETZTER_VERWALTER =
  'Mindestens eine Person muss die Organisation verwalten – zuerst eine andere Person zur Verwaltung machen';
