/**
 * CLI des Telematik-Simulators.
 *
 * Beispiele:
 *   # Lasttest: 4000 Fahrzeuge, 1 Runde (= 1 Nachricht/Minute je Fahrzeug)
 *   pnpm --filter @rent2cool/simulator start -- --vehicles 4000 --rounds 1
 *
 *   # Mit Funklöchern und Duplikaten (Dedup-Nachweis)
 *   pnpm --filter @rent2cool/simulator start -- --vehicles 1000 --rounds 3 \
 *     --funkloch-rate 0.1 --duplikat-rate 0.05
 *
 * Umgebung: INGEST_URL (Standard http://localhost:3001),
 *           TELEMETRY_SIGNING_KEY (muss zu Eingang/Verarbeiter passen).
 */
import { laufLast } from './simulator';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
function num(name: string, fallback: number): number {
  const v = Number(arg(name, String(fallback)));
  return Number.isFinite(v) ? v : fallback;
}

async function main(): Promise<void> {
  const ingestUrl = process.env.INGEST_URL ?? 'http://localhost:3001';
  const schluessel = process.env.TELEMETRY_SIGNING_KEY ?? 'PLACEHOLDER_TELEMETRY_SIGNING_KEY';

  const ergebnis = await laufLast({
    ingestUrl,
    schluessel,
    fahrzeuge: num('vehicles', 4000),
    runden: num('rounds', 1),
    parallel: num('parallel', 200),
    tuerRate: num('tuer-rate', 0.05),
    ausreisserRate: num('ausreisser-rate', 0.01),
    funklochRate: num('funkloch-rate', 0),
    duplikatRate: num('duplikat-rate', 0),
    log: (z) => console.log(z),
  });

  console.log('\n=== Lasttest-Ergebnis ===');
  console.log(JSON.stringify(ergebnis, null, 2));
  console.log(
    `\nDurchsatz: ${ergebnis.durchsatzProS} Nachrichten/s ` +
      `(${ergebnis.angenommen} angenommen, ${ergebnis.abgelehnt} abgelehnt, ${ergebnis.fehler} Fehler) ` +
      `in ${ergebnis.dauerMs} ms`,
  );
  if (ergebnis.fehler > 0 || ergebnis.abgelehnt > 0) {
    process.exitCode = 1;
  }
}

void main();
