import Link from 'next/link';
import type { Metadata } from 'next';
import { Leer, Seitenkopf } from '../../../components/bausteine';
import { apiGet } from '../../../lib/api';
import { erster, type SuchParameter } from '../../../lib/seiten';
import { holeSitzung } from '../../../lib/sitzung';
import { hatRolle } from '../../../lib/token';
import type { Liste, Standort } from '../../../lib/typen';
import { adresse, oeffnungKurz } from './anzeige';

export const metadata: Metadata = { title: 'Standorte' };

const FILTER = [
  { wert: 'true', text: 'aktive' },
  { wert: 'false', text: 'deaktivierte' },
  { wert: 'alle', text: 'alle' },
];

export default async function Standorte({
  searchParams,
}: {
  searchParams: Promise<SuchParameter>;
}) {
  const params = await searchParams;
  const aktiv = erster(params.aktiv) ?? 'true';
  const [daten, sitzung] = await Promise.all([
    apiGet<Liste<Standort>>('/v1/standorte', {
      aktiv: aktiv === 'alle' ? undefined : aktiv,
      limit: 200,
      offset: 0,
    }),
    holeSitzung(),
  ]);
  const darfAnlegen = hatRolle(sitzung?.rollen ?? [], 'admin');

  return (
    <>
      <Seitenkopf
        titel="Standorte"
        untertitel="Übergabe und Rückgabe am Firmenstandort (D-011): Adresse, Geofence, Öffnungszeiten."
        aktionen={
          darfAnlegen ? (
            <Link className="knopf" href="/standorte/neu">
              Standort anlegen
            </Link>
          ) : null
        }
      />
      <section className="karte">
        <nav className="filterleiste" aria-label="Filter">
          {FILTER.map((f) => (
            <Link
              key={f.wert}
              className={`knopf klein${f.wert === aktiv ? '' : ' zweitrangig'}`}
              aria-current={f.wert === aktiv ? 'page' : undefined}
              href={`/standorte?aktiv=${f.wert}`}
            >
              {f.text}
            </Link>
          ))}
        </nav>
        {daten.eintraege.length === 0 ? (
          <Leer>Keine Standorte für diesen Filter.</Leer>
        ) : (
          <div className="tabelle-huelle">
            <table>
              <caption>Standorte nach Name</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Adresse</th>
                  <th scope="col">geöffnet</th>
                  <th scope="col" className="zahl">
                    Fahrzeuge
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {daten.eintraege.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/standorte/${s.id}`}>
                        <strong>{s.name}</strong>
                      </Link>
                    </td>
                    <td>{adresse(s)}</td>
                    <td>{oeffnungKurz(s.oeffnungsregeln)}</td>
                    <td className="zahl">
                      <Link href={`/fahrzeuge?standortId=${s.id}`}>{s.fahrzeugAnzahl ?? 0}</Link>
                    </td>
                    <td>
                      <span className={`plakette ${s.aktiv ? 'ok' : 'neutral'}`}>
                        {s.aktiv ? 'aktiv' : 'deaktiviert'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
