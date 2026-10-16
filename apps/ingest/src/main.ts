/**
 * Einstieg des Telematik-Eingangs: Warteschlange verbinden, Server starten,
 * sauber herunterfahren.
 */
import { ladeEnv } from './env';
import { erzeugeWarteschlange } from './kafka';
import { buildServer } from './server';

async function main(): Promise<void> {
  const env = ladeEnv();
  const queue = erzeugeWarteschlange({
    brokers: env.KAFKA_BROKERS.split(','),
    clientId: env.KAFKA_CLIENT_ID,
    topic: env.KAFKA_TOPIC_TELEMETRY_RAW,
  });
  await queue.connect();

  const app = buildServer({
    signierSchluessel: env.TELEMETRY_SIGNING_KEY,
    publiziere: queue.publiziere,
    istBereit: queue.istBereit,
    logLevel: env.LOG_LEVEL,
    pretty: env.NODE_ENV === 'development',
  });

  const schliessen = async () => {
    await app.close();
    await queue.disconnect();
    process.exit(0);
  };
  process.once('SIGTERM', schliessen);
  process.once('SIGINT', schliessen);

  await app.listen({ host: env.INGEST_HTTP_HOST, port: env.INGEST_HTTP_PORT });
}

void main();
