import Link from 'next/link';
import type { Metadata } from 'next';
import { ALARM_STATUS } from '@rent2cool/shared';
import {
  Blaettern,
  FahrzeugLink,
  Leer,
  Meldungen,
  Plakette,
  Seitenkopf,
  StatusFilter,
} from '../../../components/bausteine';
import { apiGet } from '../../../lib/api';
import { formatDatumZeit, formatTemperatur, statusLabel } from '../../../lib/format';
import { blattAus, erster, seitenLink, type SuchParameter } from '../../../lib/seiten';
import { holeSitzung } from '../../../lib/sitzung';
import { hatRolle } from '../../../lib/token';
import type { Alarm, Liste } from '../../../lib/typen';
import { quittiereAlarm, schliesseAlarm } from '../aktionen';

export const metadata: Metadata = { title: 'Alarme' };

export default async function Alarme({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const params = await searchParams;
  const status = erster(params.status);
  const blatt = blattAus(params);
  const [daten, sitzung] = await Promise.all([
    apiGet<Liste<Alarm>>('/v1/alarme', { status, limit: blatt.limit, offset: blatt.offset }),
    holeSitzung(),
  ]);
  const rollen = sitzung?.rollen ?? [];
  const darfQuittieren = hatRolle(rollen, 'ops', 'admin');
  const darfSchliessen = hatRolle(rollen, 'ops', 'admin', 'qa_approver');
  const darfAbweichung = darfSchliessen;
  const zurueck = seitenLink('/alarme', params, blatt.seite);

  return (
    <>
      <Seitenkopf
        titel="Alarme"
        untertitel="Automatisch aus der Telematik: Temperatur außerhalb des Profils, Tür offen."
      />
      <Meldungen params={params} />
      <section className="karte">
        <StatusFilter pfad="/alarme" aktuell={status} optionen={ALARM_STATUS} />
        {daten.eintraege.length === 0 ? (
          <Leer>Keine Alarme für diesen Filter.</Leer>
        ) : (
          <div className="tabelle-huelle">
            <table>
              <caption>Alarme, neueste zuerst</caption>
              <thead>
                <tr>
                  <th scope="col">ausgelöst</th>
                  <th scope="col">Art</th>
                  <th scope="col" className="zahl">
                    Wert
                  </th>
                  <th scope="col" className="zahl">
                    Grenze
                  </th>
                  <th scope="col">Fahrzeug</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="leise">Aktion</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {daten.eintraege.map((a) => {
                  const temp = a.typ.startsWith('temperatur');
                  return (
                    <tr key={a.id}>
                      <td>{formatDatumZeit(a.ausgeloestAm)}</td>
                      <td>{statusLabel(a.typ)}</td>
                      <td className="zahl">{temp ? formatTemperatur(a.wert) : '–'}</td>
                      <td className="zahl">{temp ? formatTemperatur(a.schwelle) : '–'}</td>
                      <td>
                        <FahrzeugLink id={a.fahrzeugId} kennzeichen={a.fahrzeugKennzeichen} />
                      </td>
                      <td>
                        <Plakette status={a.status} />
                      </td>
                      <td>
                        <div className="knopfreihe">
                          {a.status === 'offen' && darfQuittieren ? (
                            <form action={quittiereAlarm}>
                              <input type="hidden" name="id" value={a.id} />
                              <input type="hidden" name="zurueck" value={zurueck} />
                              <button className="knopf klein" type="submit">
                                Quittieren
                              </button>
                            </form>
                          ) : null}
                          {a.status !== 'geschlossen' && darfSchliessen ? (
                            <form action={schliesseAlarm}>
                              <input type="hidden" name="id" value={a.id} />
                              <input type="hidden" name="zurueck" value={zurueck} />
                              <button className="knopf zweitrangig klein" type="submit">
                                Schließen
                              </button>
                            </form>
                          ) : null}
                          {darfAbweichung ? (
                            <Link
                              className="knopf zweitrangig klein"
                              href={`/abweichungen/neu?bezugTyp=alarm&bezugId=${a.id}`}
                            >
                              Abweichung
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Blaettern
          pfad="/alarme"
          params={params}
          gesamt={daten.gesamt}
          limit={blatt.limit}
          offset={blatt.offset}
        />
      </section>
    </>
  );
}
