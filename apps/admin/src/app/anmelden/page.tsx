import type { Metadata } from 'next';
import { AnmeldeKnopf } from '../../components/AnmeldeKnopf';
import { Marke } from '../../components/bausteine';
import { erster, type SuchParameter } from '../../lib/seiten';

export const metadata: Metadata = { title: 'Anmelden' };

const GRUENDE: Record<string, string> = {
  abgelaufen: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
  abgemeldet: 'Sie wurden abgemeldet.',
};

/** Nur relative Pfade als Rücksprungziel zulassen (kein Open Redirect). */
function sicheresZiel(wert: string | undefined): string {
  return wert && wert.startsWith('/') && !wert.startsWith('//') ? wert : '/';
}

export default async function Anmelden({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const params = await searchParams;
  const grund = erster(params.grund);
  const ziel = sicheresZiel(erster(params.callbackUrl));

  return (
    <main className="anmeldung">
      <div className="karte">
        <Marke />
        <h1>Anmelden</h1>
        <p>
          Interne Oberfläche für Flotte, Buchungen und Qualität. Die Anmeldung läuft über Ihr
          Rent2Cool-Konto.
        </p>
        {grund && GRUENDE[grund] ? (
          <div className="hinweis info" role="status">
            {GRUENDE[grund]}
          </div>
        ) : null}
        <AnmeldeKnopf callbackUrl={ziel} />
      </div>
    </main>
  );
}
