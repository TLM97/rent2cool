import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Marke } from '../../components/bausteine';
import { Navigation } from '../../components/Navigation';
import { holeIch } from '../../lib/api';
import { aufgaben, navigation } from '../../lib/portal';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const ich = await holeIch();
  const meine = aufgaben(ich.rollen);

  return (
    <div className="portal">
      <a className="sprunglink" href="#inhalt">
        Zum Inhalt springen
      </a>
      <header className="portal-kopf">
        <Marke zusatz="Kundenportal" />
        {ich.kunde ? <Navigation punkte={navigation(ich.rollen)} /> : <span />}
        <div className="nutzer">
          <div>
            <strong>{ich.name ?? 'Angemeldet'}</strong>
            <span>{ich.kunde ? ich.kunde.firmenname : 'noch ohne Unternehmen'}</span>
            {meine.length > 0 ? <span className="leise">{meine.join(' · ')}</span> : null}
          </div>
          <form action="/api/abmelden" method="post">
            <button className="knopf zweitrangig klein" type="submit">
              Abmelden
            </button>
          </form>
        </div>
      </header>
      <main id="inhalt" className="portal-inhalt">
        {children}
      </main>
    </div>
  );
}
