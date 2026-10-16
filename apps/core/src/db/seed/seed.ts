/**
 * Seed der lokalen Entwicklungsdatenbank mit Platzhalter-Stammdaten (D-015).
 * Aufruf:  pnpm --filter @rent2cool/core db:seed
 *
 * Noch gibt es keine Tabellen (das Datenmodell ist in T-002 ein Vorschlag,
 * keine Migration). Deshalb schreibt dieses Skript noch nichts in die DB,
 * sondern validiert und zeigt die Platzhalter, die nach Freigabe des
 * Datenmodells eingespielt werden. So ist der Seed-Pfad eingerichtet und die
 * Platzhalter (PLACEHOLDER_HQ u. a.) sind an einer Stelle definiert.
 */
import { placeholderDpo, placeholderHq } from './placeholder-data';

function main(): void {
  const hq = placeholderHq();
  const dpo = placeholderDpo();

  console.log('Platzhalter-Stammdaten (D-015) – werden nach T-002-Freigabe eingespielt:');
  console.log(JSON.stringify({ standort: hq, dpo }, null, 2));
  console.log(
    '\nTODO(D-015): Sobald das Datenmodell (T-002) freigegeben und migriert ist,' +
      ' hier echte INSERTs über das Drizzle-Schema ergänzen.',
  );
}

main();
