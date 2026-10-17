/**
 * Berichtsdienst (D-001: BullMQ auf Valkey; D-003: alles, was länger als eine
 * Anfrage dauert, als Hintergrundjob). Klar getrenntes Modul, das sich später
 * als eigener Prozess herauslösen lässt (CLAUDE.md).
 *
 * - Wiederkehrender Suchlauf (`faellige-suchen`): beendete Mieten ohne
 *   automatischen Nachweis nach Ablauf der Karenzzeit → je Miete ein Job.
 *   Kein Kopplungspunkt im Miet-Modul nötig; geht ein Job verloren, findet
 *   ihn der nächste Suchlauf.
 * - Job `nachweis`: Nachweis erzeugen und archivieren (idempotent).
 */
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { NachweisAusloeser, Principal } from '@rent2cool/shared';
import type { Env } from '../config/env';
import { BERICHTSDIENST, NachweisArchiv } from './archiv.service';

export const BERICHT_QUEUE = 'berichte';

export interface NachweisJob {
  mieteId: string;
  ausloeser: NachweisAusloeser;
  /** Wer den Nachweis angefordert hat (manuell); sonst der Berichtsdienst. */
  akteur?: Principal;
}

/** `redis://[:passwort@]host:port[/db]` → Verbindungsoptionen. */
export function verbindung(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    // Für BullMQ-Worker vorgeschrieben (blockierende Befehle).
    maxRetriesPerRequest: null,
  };
}

@Injectable()
export class Berichtsdienst implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(Berichtsdienst.name);
  private queue?: Queue<NachweisJob | Record<string, never>>;
  private worker?: Worker;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    private readonly archiv: NachweisArchiv,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get('BERICHT_WORKER_ENABLED', { infer: true })) return;
    await this.starte(this.config.get('VALKEY_URL', { infer: true }));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Warteschlange, Worker und Suchlauf starten (Tests: eigener Warteschlangenname). */
  async starte(
    valkeyUrl: string,
    suchlaufSek = this.config.get('BERICHT_SUCHE_SEK', { infer: true }),
    name = BERICHT_QUEUE,
  ) {
    const connection = verbindung(valkeyUrl);
    this.queue = new Queue(name, { connection });
    this.worker = new Worker(name, (job) => this.verarbeite(job), {
      connection,
      concurrency: 2,
    });
    this.worker.on('failed', (job, err) =>
      this.log.error({ jobId: job?.id, err }, 'Berichtsjob fehlgeschlagen'),
    );
    await this.queue.upsertJobScheduler(
      'faellige-nachweise',
      { every: suchlaufSek * 1000 },
      { name: 'faellige-suchen', data: {} },
    );
    this.log.log(`Berichtsdienst gestartet (Suchlauf alle ${suchlaufSek} s)`);
  }

  get aktiv(): boolean {
    return this.queue !== undefined;
  }

  /** Neuen Nachweis anfordern (neue Version), z. B. nach Nachlieferung von Messwerten. */
  async fordereAn(mieteId: string, akteur: Principal): Promise<{ jobId: string }> {
    if (!this.queue) {
      // Ohne Warteschlange (lokal ohne Valkey) direkt erzeugen.
      const r = await this.archiv.erstelle(mieteId, { ausloeser: 'manuell', akteur });
      return { jobId: `direkt-${r.id}` };
    }
    const job = await this.queue.add(
      'nachweis',
      { mieteId, ausloeser: 'manuell', akteur },
      { ...JOB_OPTIONEN, jobId: `nachweis-manuell-${mieteId}-${Date.now()}` },
    );
    return { jobId: job.id! };
  }

  /** Ein Job: Suchlauf oder Nachweis. */
  async verarbeite(job: Job): Promise<unknown> {
    if (job.name === 'faellige-suchen') return this.sucheFaellige();
    if (job.name === 'nachweis') {
      const d = job.data as NachweisJob;
      return this.archiv.erstelle(d.mieteId, {
        ausloeser: d.ausloeser,
        akteur: d.akteur ?? BERICHTSDIENST,
      });
    }
    throw new Error(`Unbekannter Berichtsjob: ${job.name}`);
  }

  /** Fällige Mieten einreihen; die Job-ID je Miete verhindert Doppelte. */
  async sucheFaellige(jetzt = new Date()): Promise<{ eingereiht: number }> {
    const ids = await this.archiv.faellige(
      jetzt,
      this.config.get('BERICHT_KARENZ_MIN', { infer: true }),
    );
    if (this.queue && ids.length > 0) {
      await this.queue.addBulk(
        ids.map((mieteId) => ({
          name: 'nachweis',
          data: { mieteId, ausloeser: 'automatisch' as const },
          opts: { ...JOB_OPTIONEN, jobId: `nachweis-auto-${mieteId}` },
        })),
      );
    }
    return { eingereiht: ids.length };
  }
}

/** Wiederholung mit wachsendem Abstand; erledigte Jobs nicht ewig aufheben. */
const JOB_OPTIONEN = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
} as const;
