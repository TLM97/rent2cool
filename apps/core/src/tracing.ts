/**
 * OpenTelemetry-Grundkonfiguration (D-001: Beobachtbarkeit ab Tag 1).
 *
 * Wird als Allererstes in main.ts importiert, damit die Auto-Instrumentierung
 * vor allen anderen Modulen greift. Der Export läuft nur, wenn ein Collector
 * konfiguriert ist (OTEL_EXPORTER_OTLP_ENDPOINT). Ohne Endpunkt – etwa in
 * Tests oder CI – passiert nichts, der Dienst startet ganz normal.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

let sdk: NodeSDK | undefined;

export function startTracing(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    return;
  }

  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'rent2cool-core',
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  const shutdown = () => {
    void sdk?.shutdown().finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

// Seiteneffekt beim Import: Tracing starten, bevor andere Module laden.
startTracing();
