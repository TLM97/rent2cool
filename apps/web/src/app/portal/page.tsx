import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDatumZeit } from '@rent2cool/oberflaeche/format';
import type { SuchParameter } from '@rent2cool/oberflaeche/seiten';
import { Leer, Meldungen, Plakette, Seitenkopf } from '../../components/bausteine';
import { apiGet, mitKunde } from '../../lib/api';
import { hat, istVerwalter } from '../../lib/portal';
import type { Liste, Miete, Organisation } from '../../lib/typen';

export const metadata: Metadata = { title: 'Übersicht' };

export default async function Uebersicht({
  searchParams,
}: {
  searchParams: Promise<SuchParameter>;
}) {
  const params = await searchParams;
  const ich = await mitKunde();
  const siehtMieten = hat(ich.rollen, 'kunde_dispo', 'kunde_qa');
  const [org, mieten] = await Promise.all([
    apiGet<Organisation>('/v1/organisation'),
    siehtMieten
      ? apiGet<Liste<Miete>>('/v1/mieten', { limit: 5, offset: 0 })
      : Promise.resolve(null),
  ]);

  return (
    <>
      <Seitenkopf titel={org.kunde.firmenname} untertitel="Ihr Unternehmen bei Rent2Cool" />
      <Meldungen params={params} />
      {!org.freigegeben ? (
        <div className="hinweis warn" role="status">
          <strong>
            Ihr Unternehmen ist{' '}
            {org.kunde.status === 'in_pruefung' ? 'in Prüfung' : 'nicht freigegeben'}.
          </strong>{' '}
          Wir prüfen Ihre Angaben und geben Ihr Unternehmen frei – erst dann sind Buchungen möglich.{' '}
          {istVerwalter(ich.rollen)
            ? 'Sie können schon jetzt Ihre Daten vervollständigen und Kolleginnen und Kollegen einladen.'
            : null}
        </div>
      ) : null}

      <div className="kacheln">
        <div className="kachel">
          <span className="kachel-titel">Status</span>
          <Plakette status={org.kunde.status} />
        </div>
        <div className="kachel">
          <span className="kachel-titel">Personen im Unternehmen</span>
          <strong className="kachel-zahl">{org.mitglieder.length}</strong>
          <Link href="/portal/organisation">Unternehmen verwalten</Link>
        </div>
        {mieten ? (
          <div className="kachel">
            <span className="kachel-titel">Mieten</span>
            <strong className="kachel-zahl">{mieten.gesamt}</strong>
            <Link href="/portal/mieten">Mieten & Nachweise</Link>
          </div>
        ) : null}
      </div>

      {mieten ? (
        <section className="karte" aria-labelledby="letzte-titel">
          <h2 id="letzte-titel">Letzte Mieten</h2>
          {mieten.eintraege.length === 0 ? (
            <Leer>Noch keine Mieten.</Leer>
          ) : (
            <ul className="liste">
              {mieten.eintraege.map((m) => (
                <li key={m.id}>
                  <Link href={`/portal/mieten/${m.id}`}>
                    {m.fahrzeugKennzeichen ?? 'Fahrzeug'} · {formatDatumZeit(m.startGeplant)}
                  </Link>{' '}
                  <Plakette status={m.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
