import type { Metadata } from 'next';
import Link from 'next/link';
import type { SuchParameter } from '@rent2cool/oberflaeche/seiten';
import { Marke, Meldungen } from '../../components/bausteine';
import { holeIch } from '../../lib/api';
import { einladungsCode } from '../../lib/portal';
import { nehmeEinladungAn } from '../portal/aktionen';

export const metadata: Metadata = { title: 'Einladung', robots: { index: false } };

/** Einladung annehmen (Link aus der E-Mail). Der Kern prüft Code und E-Mail-Adresse. */
export default async function Einladung({
  searchParams,
}: {
  searchParams: Promise<SuchParameter>;
}) {
  const params = await searchParams;
  const code = einladungsCode(params.code);
  const ich = await holeIch();

  return (
    <main className="anmeldung">
      <div className="karte">
        <Marke zusatz="Kundenportal" />
        <h1>Einladung annehmen</h1>
        <Meldungen params={params} />
        {!code ? (
          <p>Der Einladungslink ist unvollständig. Bitte öffnen Sie den Link aus der E-Mail.</p>
        ) : ich.kunde ? (
          <>
            <p>
              Sie gehören bereits zu <strong>{ich.kunde.firmenname}</strong>. Ein Konto kann nur zu
              einem Unternehmen gehören.
            </p>
            <Link className="knopf" href="/portal">
              Zum Portal
            </Link>
          </>
        ) : (
          <form action={nehmeEinladungAn}>
            <input type="hidden" name="code" value={code} />
            <p>
              Angemeldet als <strong>{ich.name ?? 'neues Konto'}</strong>. Mit dem Annehmen sehen
              Sie die Daten des einladenden Unternehmens im Rahmen der zugewiesenen Aufgaben.
            </p>
            <button className="knopf" type="submit">
              Einladung annehmen
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
