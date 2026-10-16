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
import { Kafka, type Consumer } from 'kafkajs';
import { telemetrieNachrichtSchema } from '@rent2cool/shared';
import type { Env } from '../config/env';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { verarbeiteNachricht } from './processor';

@Injectable()
export class TelemetryConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryConsumerService.name);
  private consumer?: Consumer;

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(DB) private readonly db: Database,
  ) {}

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
        await verarbeiteNachricht(this.db, parsed.data);
      },
    });

    this.logger.log(`Telematik-Consumer läuft auf Topic "${topic}".`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
  }
}
