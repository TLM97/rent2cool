import type { Metadata } from 'next';
import { erster, type SuchParameter } from '@rent2cool/oberflaeche/seiten';
import { AnmeldeKnoepfe } from '../../components/AnmeldeKnoepfe';
import { Marke } from '../../components/bausteine';
import { sicheresZiel } from '../../lib/portal';

export const metadata: Metadata = { title: 'Anmelden', robots: { index: false } };

const GRUENDE: Record<string, string> = {
  abgelaufen: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
  abgemeldet: 'Sie wurden abgemeldet.',
};

export default async function Anmelden({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const params = await searchParams;
  const grund = erster(params.grund);
  const ziel = sicheresZiel(erster(params.callbackUrl));
  const einladung = ziel.startsWith('/einladung');

  return (
    <main className="anmeldung">
      <div className="karte">
        <Marke zusatz="Kundenportal" />
        <h1>{einladung ? 'Einladung annehmen' : 'Kundenportal'}</h1>
        <p>
          {einladung
            ? 'Melden Sie sich mit der E-Mail-Adresse an, an die die Einladung ging – oder legen Sie mit ihr ein Konto an.'
            : 'Buchungen, Temperaturnachweise und Rechnungen Ihres Unternehmens. Neu hier? Legen Sie ein Konto an und registrieren Sie Ihr Unternehmen – wir prüfen und geben es frei.'}
        </p>
        {grund && GRUENDE[grund] ? (
          <div className="hinweis info" role="status">
            {GRUENDE[grund]}
          </div>
        ) : null}
        <AnmeldeKnoepfe callbackUrl={ziel} />
      </div>
    </main>
  );
}
