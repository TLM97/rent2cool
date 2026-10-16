/**
 * HTTP-Server des Telematik-Eingangs (Fastify).
 *
 * Aufgabe (T-003): Nachricht annehmen, Format UND Signatur prüfen, KEINE
 * eigenen IDs vergeben, in die Warteschlange schreiben, schnell antworten.
 * Die Warteschlange ist über die injizierte `publiziere`-Funktion abstrahiert,
 * damit der Server ohne echtes Kafka testbar ist.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import {
  nowUtcIso,
  validierePayloadUndSignatur,
  type HealthReport,
} from '@rent2cool/shared';

export interface ServerDeps {
  signierSchluessel: string;
  /** Schreibt die (validierte) Nachricht als JSON in die Warteschlange. */
  publiziere: (fahrzeugId: string, nachrichtJson: string) => Promise<void>;
  /** Für die Readiness: ist die Warteschlange erreichbar? */
  istBereit: () => boolean;
  logLevel?: string;
  pretty?: boolean;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({
    logger: {
      level: deps.logLevel ?? 'info',
      ...(deps.pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
      redact: { paths: ['req.headers.authorization'], remove: true },
    },
    bodyLimit: 1_048_576, // 1 MB je Nachricht reicht reichlich
  });

  app.get('/health', (): HealthReport => ({
    status: 'ok',
    time: nowUtcIso(),
    service: 'rent2cool-ingest',
  }));

  app.get('/health/ready', (_req, reply) => {
    const bereit = deps.istBereit();
    const report: HealthReport = {
      status: bereit ? 'ok' : 'down',
      time: nowUtcIso(),
      service: 'rent2cool-ingest',
      checks: { queue: bereit ? 'ok' : 'down' },
    };
    reply.code(bereit ? 200 : 503).send(report);
  });

  app.post('/v1/telemetrie', async (req, reply) => {
    const pruefung = validierePayloadUndSignatur(req.body, deps.signierSchluessel);
    if (!pruefung.ok) {
      // Format kaputt -> 400, Signatur falsch -> 401.
      const code = pruefung.grund === 'signatur' ? 401 : 400;
      return reply.code(code).send({ status: 'abgelehnt', grund: pruefung.grund });
    }
    const { nachricht } = pruefung;
    // Nur in die Warteschlange schreiben; keine ID vergeben, keine DB.
    // Partitionierung nach fahrzeugId wahrt die Reihenfolge je Fahrzeug.
    await deps.publiziere(nachricht.fahrzeugId, JSON.stringify(nachricht));
    return reply.code(202).send({ status: 'angenommen', nachrichtId: nachricht.nachrichtId });
  });

  return app;
}
