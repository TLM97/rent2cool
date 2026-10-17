import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { erlaubteUebergaenge, istFahrzeugStatus } from '@rent2cool/shared';
import {
  Leer,
  Meldungen,
  Plakette,
  Seitenkopf,
  UebergabePlakette,
} from '../../../../components/bausteine';
import { Verlauf } from '../../../../components/verlauf';
import { Auswahl, FormularRahmen } from '../../../../components/formular';
import { KalibrierungFelder } from '../../../../components/stammdaten';
import { apiGet, apiGetOderNull } from '../../../../lib/api';
import { formatDatum, formatDatumZeit, kurzeId, statusLabel } from '../../../../lib/format';
import { kalibrierungFrist } from '../../../../lib/fristen';
import { istUuid, type SuchParameter } from '../../../../lib/seiten';
import { holeSitzung } from '../../../../lib/sitzung';
import { hatRolle } from '../../../../lib/token';
import type {
  FahrzeugAkte,
  FahrzeugPosition,
  Pruefergebnis,
  Standort,
} from '../../../../lib/typen';
import { aendereFahrzeugStatus } from '../../aktionen';
import { erfasseKalibrierung } from '../../formulare';

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
  const [buchbarkeit, sitzung, ort] = await Promise.all([
    apiGet<Pruefergebnis>(`/v1/fahrzeuge/${id}/buchbarkeit`),
    holeSitzung(),
    apiGetOderNull<FahrzeugPosition>(`/v1/fahrzeuge/${id}/position`),
  ]);
  const f = akte.fahrzeug;
  const standortName = f.standortId
    ? (await apiGetOderNull<Standort>(`/v1/standorte/${f.standortId}`))?.name
    : undefined;
  const rollen = sitzung?.rollen ?? [];
  const darfAendern = hatRolle(rollen, 'ops', 'admin');
  const darfAbweichung = hatRolle(rollen, 'ops', 'admin', 'qa_approver');
  const naechste = istFahrzeugStatus(f.status) ? erlaubteUebergaenge(f.status) : [];
  const alleSensoren = akte.aggregate.flatMap((a) => a.sensoren);
  const sensoren = alleSensoren.filter((s) => s.aktiv);

  return (
    <>
      <Seitenkopf
        titel={f.kennzeichen}
        untertitel={<Plakette status={f.status} />}
        brotkrume={{ href: '/fahrzeuge', text: 'Fahrzeuge' }}
        aktionen={
          <>
            {darfAendern ? (
              <Link className="knopf zweitrangig" href={`/fahrzeuge/${f.id}/bearbeiten`}>
                Stammdaten bearbeiten
              </Link>
            ) : null}
            {darfAbweichung ? (
              <Link
                className="knopf zweitrangig"
                href={`/abweichungen/neu?bezugTyp=fahrzeug&bezugId=${f.id}`}
              >
                Abweichung erfassen
              </Link>
            ) : null}
          </>
        }
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
            <dt>Heimatstandort</dt>
            <dd>
              {standortName && f.standortId ? (
                <Link href={`/standorte/${f.standortId}`}>{standortName}</Link>
              ) : (
                'keiner'
              )}
            </dd>
            <dt>Temperaturprofil</dt>
            <dd>{f.standardTemperaturprofil ? `${f.standardTemperaturprofil} °C` : '–'}</dd>
            <dt>angelegt</dt>
            <dd>{formatDatum(f.erstelltAm)}</dd>
          </dl>
        </section>

        <section className="karte" aria-labelledby="buchbar-titel">
          <h2 id="buchbar-titel">Buchbarkeit</h2>
          {buchbarkeit.buchbar ? (
            <div className="hinweis erfolg">
              Buchbar – verfügbar und alle Sensoren gültig kalibriert.
            </div>
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

      {ort ? (
        <section className="karte" aria-labelledby="position-titel">
          <h2 id="position-titel">Position</h2>
          <dl className="eigenschaften">
            <dt>Letzte Position</dt>
            <dd>
              {ort.position
                ? `${ort.position.lat.toLocaleString('de-DE')}, ${ort.position.lng.toLocaleString('de-DE')} · ${formatDatumZeit(ort.position.zeit)}`
                : 'keine in den letzten 24 Stunden'}
            </dd>
            <dt>Heimatstandort</dt>
            <dd>
              <UebergabePlakette pruefung={ort.pruefung} />
            </dd>
          </dl>
        </section>
      ) : null}

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
                    <th scope="col">Seriennummer / Modell</th>
                    <th scope="col">eingebaut</th>
                    <th scope="col">ausgebaut</th>
                    <th scope="col">Kalibrierung</th>
                    {darfAendern ? (
                      <th scope="col">
                        <span className="leise">Aktion</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {a.sensoren.map((s) => {
                    const frist = kalibrierungFrist(s.kalibriertBis);
                    return (
                      <tr key={s.id} className={s.aktiv ? undefined : 'ausgebaut'}>
                        <td className="mono">{kurzeId(s.id)}</td>
                        <td>
                          {s.messgroesse} ({s.einheit})
                        </td>
                        <td>
                          <span className="mono">{s.seriennummer ?? '–'}</span>
                          {s.modell ? <span className="leise"> · {s.modell}</span> : null}
                        </td>
                        <td>{formatDatumZeit(s.eingebautAm)}</td>
                        <td>
                          {s.ausgebautAm ? (
                            <>
                              {formatDatumZeit(s.ausgebautAm)}
                              {s.ausbauGrund ? <div className="leise">{s.ausbauGrund}</div> : null}
                            </>
                          ) : (
                            <span className="plakette ok">eingebaut</span>
                          )}
                        </td>
                        <td>
                          {s.aktiv ? (
                            <span className={`plakette ${frist.ton}`}>
                              {frist.text}
                              {s.kalibriertBis ? ` · bis ${formatDatum(s.kalibriertBis)}` : ''}
                            </span>
                          ) : s.kalibriertBis ? (
                            <span className="leise">bis {formatDatum(s.kalibriertBis)}</span>
                          ) : (
                            '–'
                          )}
                        </td>
                        {darfAendern ? (
                          <td>
                            {s.aktiv ? (
                              <Link
                                className="knopf zweitrangig klein"
                                href={`/fahrzeuge/${f.id}/sensoren/${s.id}/tausch`}
                              >
                                Tauschen
                              </Link>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>

      {darfAendern && sensoren.length > 0 ? (
        <section className="karte" aria-labelledby="kalib-titel">
          <h2 id="kalib-titel">Kalibrierung erfassen</h2>
          <p className="leise">
            Nachweis nach EN 12830. Ohne gültige Kalibrierung ist das Fahrzeug nicht buchbar
            (R-08/R-09).
          </p>
          <FormularRahmen
            aktion={erfasseKalibrierung}
            sendenText="Kalibrierung speichern"
            versteckt={{ fahrzeugId: f.id }}
          >
            <Auswahl
              name="sensorId"
              label="Sensor"
              pflicht
              standard={sensoren[0]?.id}
              optionen={sensoren.map((s) => ({
                wert: s.id,
                text: `${s.messgroesse} · ${kurzeId(s.id)}${s.seriennummer ? ` · SN ${s.seriennummer}` : ''}`,
              }))}
            />
            <KalibrierungFelder />
          </FormularRahmen>
        </section>
      ) : null}
      <Verlauf
        entitaetIds={[f.id, ...alleSensoren.map((s) => s.id)]}
        typen={['fahrzeug', 'fahrzeug_status', 'kalibrierung', 'sensor_tausch']}
        bezeichnungen={Object.fromEntries(
          alleSensoren.map((s) => [
            s.id,
            `Sensor ${s.seriennummer ? `SN ${s.seriennummer}` : kurzeId(s.id)}`,
          ]),
        )}
      />
    </>
  );
}
