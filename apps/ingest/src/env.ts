/**
 * Konfiguration des Telematik-Eingangs – nur aus Umgebungsvariablen (12-Factor,
 * D-005), validiert mit Zod. Startet nicht mit ungültiger Umgebung.
 */
import { z } from 'zod';

export const ingestEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  INGEST_HTTP_HOST: z.string().default('0.0.0.0'),
  INGEST_HTTP_PORT: z.coerce.number().int().positive().default(3001),

  KAFKA_BROKERS: z.string().default('localhost:19092'),
  KAFKA_CLIENT_ID: z.string().default('rent2cool-ingest'),
  KAFKA_TOPIC_TELEMETRY_RAW: z.string().default('telemetry.raw'),

  // Muss mit dem Schlüssel von Verarbeiter und Simulator übereinstimmen (D-015).
  TELEMETRY_SIGNING_KEY: z.string().default('PLACEHOLDER_TELEMETRY_SIGNING_KEY'),
});

export type IngestEnv = z.infer<typeof ingestEnvSchema>;

export function ladeEnv(roh: NodeJS.ProcessEnv = process.env): IngestEnv {
  const parsed = ingestEnvSchema.safeParse(roh);
  if (!parsed.success) {
    throw new Error(`Ungültige Umgebungskonfiguration:\n${parsed.error.message}`);
  }
  return parsed.data;
}
