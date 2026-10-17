import Link from 'next/link';
import type { Metadata } from 'next';
import { ABWEICHUNG_STATUS } from '@rent2cool/shared';
import { Blaettern, Leer, Plakette, Seitenkopf, StatusFilter } from '../../../components/bausteine';
import { apiGet } from '../../../lib/api';
import { formatDatumZeit, kurzeId } from '../../../lib/format';
import { blattAus, erster, type SuchParameter } from '../../../lib/seiten';
import { holeSitzung } from '../../../lib/sitzung';
import { hatRolle } from '../../../lib/token';
import type { Abweichung, Liste } from '../../../lib/typen';
import { BEZUG } from './bezug';

export const metadata: Metadata = { title: 'Abweichungen' };

export default async function Abweichungen({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const params = await searchParams;
  const status = erster(params.status);
  const blatt = blattAus(params);
  const [daten, sitzung] = await Promise.all([
    apiGet<Liste<Abweichung>>('/v1/abweichungen', { status, limit: blatt.limit, offset: blatt.offset }),
    holeSitzung(),
  ]);
  const darfErfassen = hatRolle(sitzung?.rollen ?? [], 'ops', 'admin', 'qa_approver');

  return (
    <>
      <Seitenkopf
        titel="Abweichungen"
        untertitel="GDP-Abweichungen und CAPA – Bewertung und Abschluss durch die qualitätsverantwortliche Person."
        aktionen={
          darfErfassen ? (
            <Link className="knopf" href="/abweichungen/neu">
              Abweichung erfassen
            </Link>
          ) : null
        }
      />
      <section className="karte">
        <StatusFilter pfad="/abweichungen" aktuell={status} optionen={ABWEICHUNG_STATUS} />
        {daten.eintraege.length === 0 ? (
          <Leer>Keine Abweichungen für diesen Filter.</Leer>
        ) : (
          <div className="tabelle-huelle">
            <table>
              <caption>Abweichungen, neueste zuerst</caption>
              <thead>
                <tr>
                  <th scope="col">erfasst</th>
                  <th scope="col">Beschreibung</th>
                  <th scope="col">Bezug</th>
                  <th scope="col">Schwere</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {daten.eintraege.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDatumZeit(a.erfasstAm)}</td>
                    <td>
                      <Link href={`/abweichungen/${a.id}`}>{a.beschreibung}</Link>
                    </td>
                    <td>
                      {BEZUG[a.bezugTyp] ?? a.bezugTyp} <span className="mono leise">{kurzeId(a.bezugId)}</span>
                    </td>
                    <td>{a.schweregrad ?? '–'}</td>
                    <td>
                      <Plakette status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Blaettern pfad="/abweichungen" params={params} gesamt={daten.gesamt} limit={blatt.limit} offset={blatt.offset} />
      </section>
    </>
  );
}
