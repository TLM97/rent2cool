import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { erlaubteUebergaenge, istFahrzeugStatus } from '@rent2cool/shared';
import { Leer, Meldungen, Plakette, Seitenkopf } from '../../../../components/bausteine';
import { apiGet, apiGetOderNull } from '../../../../lib/api';
import { formatDatum, kurzeId, statusLabel } from '../../../../lib/format';
import { istUuid, type SuchParameter } from '../../../../lib/seiten';
import { holeSitzung } from '../../../../lib/sitzung';
import { hatRolle } from '../../../../lib/token';
import type { FahrzeugAkte, Pruefergebnis } from '../../../../lib/typen';
import { aendereFahrzeugStatus } from '../../aktionen';

export const metadata: Metadata = { title: 'Fahrzeugakte' };

export default async function FahrzeugDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SuchParameter>;
}) {
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const suche = await searchParams;

  const akte = await apiGetOderNull<FahrzeugAkte>(`/v1/fahrzeuge/${id}`);
  if (!akte) notFound();
  const [buchbarkeit, sitzung] = await Promise.all([
    apiGet<Pruefergebnis>(`/v1/fahrzeuge/${id}/buchbarkeit`),
    holeSitzung(),
  ]);
  const f = akte.fahrzeug;
  const darfAendern = hatRolle(sitzung?.rollen ?? [], 'ops', 'admin');
  const naechste = istFahrzeugStatus(f.status) ? erlaubteUebergaenge(f.status) : [];

  return (
    <>
      <Seitenkopf
        titel={f.kennzeichen}
        untertitel={<Plakette status={f.status} />}
        brotkrume={{ href: '/fahrzeuge', text: 'Fahrzeuge' }}
      />
      <Meldungen params={suche} />

      <div className="zweispaltig">
        <section className="karte" aria-labelledby="stamm-titel">
          <h2 id="stamm-titel">Stammdaten</h2>
          <dl className="eigenschaften">
            <dt>Fahrzeugprofil</dt>
            <dd>{f.fahrzeugprofil}</dd>
            <dt>VIN</dt>
            <dd className="mono">{f.vin ?? '–'}</dd>
            <dt>zul. Gesamtmasse</dt>
            <dd>{f.zulGesamtmasseKg.toLocaleString('de-DE')} kg</dd>
            <dt>Führerscheinklasse</dt>
            <dd>{f.benoetigteFuehrerscheinklasse}</dd>
            <dt>Fahrtenschreiber</dt>
            <dd>{f.hatFahrtenschreiber ? 'ja (auslandstauglich, D-006)' : 'nein (nur Inland)'}</dd>
            <dt>Temperaturprofil</dt>
            <dd>{f.standardTemperaturprofil ? `${f.standardTemperaturprofil} °C` : '–'}</dd>
            <dt>angelegt</dt>
            <dd>{formatDatum(f.erstelltAm)}</dd>
          </dl>
        </section>

        <section className="karte" aria-labelledby="buchbar-titel">
          <h2 id="buchbar-titel">Buchbarkeit</h2>
          {buchbarkeit.buchbar ? (
            <div className="hinweis erfolg">Buchbar – verfügbar und alle Sensoren gültig kalibriert.</div>
          ) : (
            <div className="hinweis fehler">
              Nicht buchbar:
              <ul>
                {buchbarkeit.gruende.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          {darfAendern && naechste.length > 0 ? (
            <form action={aendereFahrzeugStatus} className="filterleiste">
              <input type="hidden" name="id" value={f.id} />
              <div className="feld">
                <label htmlFor="status">Status ändern</label>
                <select id="status" name="status" defaultValue={naechste[0]}>
                  {naechste.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <button className="knopf" type="submit">
                Übernehmen
              </button>
            </form>
          ) : null}
        </section>
      </div>

      <section className="karte" aria-labelledby="aufbau-titel">
        <h2 id="aufbau-titel">Kühlaufbau & Sensoren</h2>
        {akte.aggregate.length === 0 ? (
          <Leer>Kein Kühlaufbau erfasst.</Leer>
        ) : (
          akte.aggregate.map((a) => (
            <div key={a.id} className="tabelle-huelle">
              <table>
                <caption>
                  Aggregat {a.typ ?? ''} {a.hersteller ? `· ${a.hersteller}` : ''}{' '}
                  {a.seriennummer ? `· SN ${a.seriennummer}` : ''}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Sensor</th>
                    <th scope="col">Messgröße</th>
                    <th scope="col">Einheit</th>
                    <th scope="col">Modell</th>
                    <th scope="col">aktiv</th>
                  </tr>
                </thead>
                <tbody>
                  {a.sensoren.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{kurzeId(s.id)}</td>
                      <td>{s.messgroesse}</td>
                      <td>{s.einheit}</td>
                      <td>{s.modell ?? '–'}</td>
                      <td>{s.aktiv ? 'ja' : 'nein'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>
    </>
  );
}
