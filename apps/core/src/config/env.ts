/**
 * Zentrale, typsichere Konfiguration – ausschließlich aus Umgebungsvariablen
 * (12-Factor, D-005). Validiert mit Zod (D-001). Fehlt etwas oder ist es
 * ungültig, startet der Dienst gar nicht erst, statt später kaputtzugehen.
 */
import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  CORE_HTTP_HOST: z.string().default('0.0.0.0'),
  CORE_HTTP_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  PUBLIC_BASE_DOMAIN: z.string().default('rent2cool.example'),

  DATABASE_URL: z.string().url(),

  KAFKA_BROKERS: z.string().default('localhost:19092'),
  KAFKA_CLIENT_ID: z.string().default('rent2cool-core'),
  KAFKA_TOPIC_TELEMETRY_RAW: z.string().default('telemetry.raw'),
  KAFKA_CONSUMER_GROUP: z.string().default('rent2cool-core-telemetry'),

  // Telematik-Verarbeiter (T-003). Consumer standardmäßig aus, damit Tests/CI
  // und ein reiner API-Start keinen Kafka-Broker brauchen.
  TELEMETRY_CONSUMER_ENABLED: booleanish.default('false'),
  // HMAC-Schlüssel für die Telematik-Signatur – Platzhalter bis Anbieterwahl (D-015).
  TELEMETRY_SIGNING_KEY: z.string().default('PLACEHOLDER_TELEMETRY_SIGNING_KEY'),

  VALKEY_URL: z.string().default('redis://localhost:6379'),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('eu-central-1'),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET: z.string(),
  S3_FORCE_PATH_STYLE: booleanish.default('true'),

  OIDC_ISSUER_URL: z.string().url(),
  OIDC_CLIENT_ID: z.string(),
  OIDC_CLIENT_SECRET: z.string(),

  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('rent2cool-core'),
});

export type Env = z.infer<typeof envSchema>;

/** Validiert ein rohes Env-Objekt. Wird von @nestjs/config als `validate` genutzt. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Ungültige Umgebungskonfiguration:\n${issues}`);
  }
  return parsed.data;
}
