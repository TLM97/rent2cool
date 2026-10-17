import type { ReactNode } from 'react';
import { Navigation } from '../../components/Navigation';
import { Marke } from '../../components/bausteine';
import { holeSitzung } from '../../lib/sitzung';

const ROLLEN_TEXT: Record<string, string> = {
  admin: 'Admin',
  ops: 'Ops',
  qa_approver: 'QA',
  dpo: 'Datenschutz',
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const sitzung = await holeSitzung();
  const name = sitzung?.name ?? sitzung?.email ?? 'Angemeldet';
  const rollen = (sitzung?.rollen ?? []).filter((r) => r in ROLLEN_TEXT).map((r) => ROLLEN_TEXT[r]);

  return (
    <div className="rahmen">
      <a className="sprunglink" href="#inhalt">
        Zum Inhalt springen
      </a>
      <aside className="seitenleiste">
        <Marke />
        <Navigation />
      </aside>
      <div className="hauptbereich">
        <header className="kopfleiste">
          <div className="nutzer">
            <strong>{name}</strong>
            <span>{rollen.join(' · ')}</span>
          </div>
          <form action="/api/abmelden" method="post">
            <button className="knopf zweitrangig klein" type="submit">
              Abmelden
            </button>
          </form>
        </header>
        <main id="inhalt" className="inhalt">
          {children}
        </main>
      </div>
    </div>
  );
}
