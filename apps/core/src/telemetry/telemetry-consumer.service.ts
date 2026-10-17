/**
 * Telematik-Verarbeiter im Kern (T-003): liest rohe Nachrichten aus der
 * Warteschlange (Kafka/Redpanda), erkennt Duplikate und schreibt Messwerte
 * append-only in die Hypertable.
 *
 * At-least-once + idempotent: Der Offset wird erst nach erfolgreicher
 * Verarbeitung committed (kafkajs-Standard). Wird der Prozess neu gestartet,
 * werden noch nicht bestätigte Nachrichten erneut zugestellt und über die
 * `nachrichtId` dedupliziert – nichts geht verloren, nichts wird doppelt
 * gespeichert.
 */
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { Kafka, type Consumer } from 'kafkajs';
import { telemetrieNachrichtSchema, type Temperaturprofil } from '@rent2cool/shared';
import type { Env } from '../config/env';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { fahrzeug } from '../db/schema';
import { KonfigProfilQuelle } from '../bericht/profil';
import { AlarmService } from '../alarm/alarm.service';
import { verarbeiteNachricht } from './processor';

@Injectable()
export class TelemetryConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryConsumerService.name);
  private consumer?: Consumer;
  private readonly profile = new KonfigProfilQuelle();
  // Cache Fahrzeug -> {mandantId, Profil} für die Alarm-Auswertung (hält den
  // Hot-Path schlank; bei 4.000 Fahrzeugen ein kleiner Cache, D-003).
  private readonly profilCache = new Map<
    string,
    { mandantId: string; profil: Temperaturprofil } | null
  >();

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(DB) private readonly db: Database,
    private readonly alarme: AlarmService,
  ) {}

  private async profilKontext(
    fahrzeugId: string,
  ): Promise<{ mandantId: string; profil: Temperaturprofil } | null> {
    const cached = this.profilCache.get(fahrzeugId);
    if (cached !== undefined) {
      return cached;
    }
    const [fz] = await this.db
      .select({ mandantId: fahrzeug.mandantId, profilName: fahrzeug.standardTemperaturprofil })
      .from(fahrzeug)
      .where(eq(fahrzeug.id, fahrzeugId));
    const profil = fz?.profilName ? this.profile.hole(fz.profilName) : undefined;
    const kontext = fz && profil ? { mandantId: fz.mandantId, profil } : null;
    this.profilCache.set(fahrzeugId, kontext);
    return kontext;
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.get('TELEMETRY_CONSUMER_ENABLED', { infer: true })) {
      this.logger.log('Telematik-Consumer ist deaktiviert (TELEMETRY_CONSUMER_ENABLED=false).');
      return;
    }

    const kafka = new Kafka({
      clientId: this.config.get('KAFKA_CLIENT_ID', { infer: true }),
      brokers: this.config.get('KAFKA_BROKERS', { infer: true }).split(','),
    });
    this.consumer = kafka.consumer({
      groupId: this.config.get('KAFKA_CONSUMER_GROUP', { infer: true }),
    });
    const topic = this.config.get('KAFKA_TOPIC_TELEMETRY_RAW', { infer: true });

    await this.consumer.connect();
    await this.consumer.subscribe({ topic, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return;
        }
        let roh: unknown;
        try {
          roh = JSON.parse(message.value.toString('utf8'));
        } catch {
          this.logger.warn('Nachricht ist kein JSON – verworfen');
          return;
        }
        const parsed = telemetrieNachrichtSchema.safeParse(roh);
        if (!parsed.success) {
          this.logger.warn(`Ungültige Nachricht verworfen: ${parsed.error.message}`);
          return;
        }
        const ergebnis = await verarbeiteNachricht(this.db, parsed.data);
        // Alarm-Auswertung nur für neu gespeicherte Nachrichten; best-effort,
        // Fehler blockieren die Ingestion nicht.
        if (ergebnis === 'gespeichert') {
          try {
            const ctx = await this.profilKontext(parsed.data.fahrzeugId);
            if (ctx) {
              await this.alarme.auswerteNachricht(parsed.data, ctx.profil, {
                mandantId: ctx.mandantId,
              });
            }
          } catch (e) {
            this.logger.warn(`Alarm-Auswertung fehlgeschlagen: ${String(e)}`);
          }
        }
      },
    });

    this.logger.log(`Telematik-Consumer läuft auf Topic "${topic}".`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
  }
}
