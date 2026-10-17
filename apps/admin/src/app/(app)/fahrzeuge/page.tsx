import Link from 'next/link';
import type { Metadata } from 'next';
import { FAHRZEUG_STATUS } from '@rent2cool/shared';
import { Blaettern, Leer, Plakette, Seitenkopf, StatusFilter } from '../../../components/bausteine';
import { apiGet } from '../../../lib/api';
import { holeSitzung } from '../../../lib/sitzung';
import { hatRolle } from '../../../lib/token';
import { formatDatum } from '../../../lib/format';
import { blattAus, erster, type SuchParameter } from '../../../lib/seiten';
import type { Fahrzeug, Liste } from '../../../lib/typen';

export const metadata: Metadata = { title: 'Fahrzeuge' };

export default async function Fahrzeuge({
  searchParams,
}: {
  searchParams: Promise<SuchParameter>;
}) {
  const params = await searchParams;
  const status = erster(params.status);
  const blatt = blattAus(params);
  const [daten, sitzung] = await Promise.all([
    apiGet<Liste<Fahrzeug>>('/v1/fahrzeuge', { status, limit: blatt.limit, offset: blatt.offset }),
    holeSitzung(),
  ]);
  const darfAnlegen = hatRolle(sitzung?.rollen ?? [], 'ops', 'admin');

  return (
    <>
      <Seitenkopf
        titel="Fahrzeuge"
        untertitel="Fahrzeugakte: Status, Klasse, Fahrtenschreiber und Kühlaufbau."
        aktionen={
          darfAnlegen ? (
            <Link className="knopf" href="/fahrzeuge/neu">
              Fahrzeug anlegen
            </Link>
          ) : null
        }
      />
      <section className="karte">
        <StatusFilter pfad="/fahrzeuge" aktuell={status} optionen={FAHRZEUG_STATUS} />
        {daten.eintraege.length === 0 ? (
          <Leer>Keine Fahrzeuge für diesen Filter.</Leer>
        ) : (
          <div className="tabelle-huelle">
            <table>
              <caption>Fahrzeuge des Mandanten, neueste zuerst</caption>
              <thead>
                <tr>
                  <th scope="col">Kennzeichen</th>
                  <th scope="col">Status</th>
                  <th scope="col">Klasse</th>
                  <th scope="col" className="zahl">
                    zul. Masse
                  </th>
                  <th scope="col">Fahrtenschreiber</th>
                  <th scope="col">Profil</th>
                  <th scope="col">angelegt</th>
                </tr>
              </thead>
              <tbody>
                {daten.eintraege.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Link href={`/fahrzeuge/${f.id}`}>
                        <strong>{f.kennzeichen}</strong>
                      </Link>
                    </td>
                    <td>
                      <Plakette status={f.status} />
                    </td>
                    <td>{f.benoetigteFuehrerscheinklasse}</td>
                    <td className="zahl">{f.zulGesamtmasseKg.toLocaleString('de-DE')} kg</td>
                    <td>{f.hatFahrtenschreiber ? 'ja' : 'nein'}</td>
                    <td>
                      {f.standardTemperaturprofil ? (
                        `${f.standardTemperaturprofil} °C`
                      ) : (
                        <span className="leise">–</span>
                      )}
                    </td>
                    <td>{formatDatum(f.erstelltAm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Blaettern
          pfad="/fahrzeuge"
          params={params}
          gesamt={daten.gesamt}
          limit={blatt.limit}
          offset={blatt.offset}
        />
      </section>
    </>
  );
}
