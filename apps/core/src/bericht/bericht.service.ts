import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, between, eq } from 'drizzle-orm';
import {
  verdichteKurve,
  type KurvenPunkt,
  type NachweisDokument,
  type TemperaturNachweis,
} from '@rent2cool/shared';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { messwert } from '../db/schema';
import { berechneNachweis, type Messpunkt } from './nachweis';
import type { ProfilQuelle } from './profil';
import type { NachweisRenderer, RendererRegistry } from './renderer';
import type { Signierer } from './signierer';
import type { BerichtSpeicher, GespeicherterBericht } from './speicher';

export const PROFIL_QUELLE = Symbol('PROFIL_QUELLE');
export const SIGNIERER = Symbol('SIGNIERER');
export const RENDERER_REGISTRY = Symbol('RENDERER_REGISTRY');
export const BERICHT_SPEICHER = Symbol('BERICHT_SPEICHER');

export interface ErzeugeParams {
  fahrzeugId: string;
  messgroesse: string;
  von: string;
  bis: string;
  profilName: string;
  lueckeSchwelleMin: number;
}

@Injectable()
export class BerichtService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PROFIL_QUELLE) private readonly profile: ProfilQuelle,
    @Inject(SIGNIERER) private readonly signierer: Signierer,
    @Inject(RENDERER_REGISTRY) private readonly rendererRegistry: RendererRegistry,
    @Inject(BERICHT_SPEICHER) private readonly speicher: BerichtSpeicher,
  ) {}

  async erzeuge(p: ErzeugeParams): Promise<TemperaturNachweis> {
    return (await this.erzeugeMitKurve(p)).nachweis;
  }

  /** Nachweis plus verdichtete Kurve für die Grafik (aus denselben Messpunkten). */
  async erzeugeMitKurve(
    p: ErzeugeParams,
  ): Promise<{ nachweis: TemperaturNachweis; kurve: KurvenPunkt[] }> {
    const profil = this.profile.hole(p.profilName);
    if (!profil) {
      throw new BadRequestException(
        `Unbekanntes Temperaturprofil: ${p.profilName}. Verfügbar: ${this.profile
          .alle()
          .map((x) => x.name)
          .join(', ')}`,
      );
    }
    const punkte = await this.ladeMesspunkte(p);
    const nachweis = berechneNachweis(
      punkte,
      {
        fahrzeugId: p.fahrzeugId,
        messgroesse: p.messgroesse,
        von: p.von,
        bis: p.bis,
        profil,
        lueckeSchwelleMin: p.lueckeSchwelleMin,
      },
      this.signierer,
    );
    return { nachweis, kurve: verdichteKurve(punkte) };
  }

  /** Renderer eines Formats (oder Fehler mit den verfügbaren Formaten). */
  renderer(format: string): NachweisRenderer {
    const r = this.rendererRegistry.hole(format);
    if (!r) {
      throw new BadRequestException(
        `Unbekanntes Format: ${format}. Verfügbar: ${this.rendererRegistry.formate().join(', ')}`,
      );
    }
    return r;
  }

  get signatur(): Signierer {
    return this.signierer;
  }

  async erzeugeUndLege(
    p: ErzeugeParams,
    format: string,
  ): Promise<{ nachweis: TemperaturNachweis; format: string; gespeichert: GespeicherterBericht }> {
    const r = this.renderer(format);
    const { nachweis, kurve } = await this.erzeugeMitKurve(p);
    const dokument: NachweisDokument = {
      schemaVersion: 1,
      titel: 'Temperaturnachweis (Fahrzeug und Zeitraum)',
      version: 0,
      ausloeser: 'manuell',
      miete: null,
      nachweis,
      kurve,
      siegel: null,
    };
    const pfad = `temperaturnachweis/${p.fahrzeugId}/${nachweis.erzeugtAm}.${r.dateiendung}`;
    const gespeichert = await this.speicher.ablegen(pfad, r.contentType, await r.render(dokument));
    return { nachweis, format, gespeichert };
  }

  private async ladeMesspunkte(p: ErzeugeParams): Promise<Messpunkt[]> {
    // Immer mit Zeit-/Fahrzeug-/Messgrößenfilter + Reihenfolge (D-003: nie
    // unbegrenzt über alle Messwerte).
    const rows = await this.db
      .select({ zeit: messwert.zeit, wert: messwert.wert })
      .from(messwert)
      .where(
        and(
          eq(messwert.fahrzeugId, p.fahrzeugId),
          eq(messwert.messgroesse, p.messgroesse),
          between(messwert.zeit, new Date(p.von), new Date(p.bis)),
        ),
      )
      .orderBy(messwert.zeit);
    return rows.map((r) => ({ zeit: r.zeit.toISOString(), wert: r.wert }));
  }
}
