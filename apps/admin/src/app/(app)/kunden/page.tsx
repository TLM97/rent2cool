import Link from 'next/link';
import type { Metadata } from 'next';
import { KUNDE_STATUS } from '@rent2cool/shared';
import { Blaettern, Leer, Plakette, Seitenkopf, StatusFilter } from '../../../components/bausteine';
import { apiGet } from '../../../lib/api';
import { holeSitzung } from '../../../lib/sitzung';
import { hatRolle } from '../../../lib/token';
import { formatDatum } from '../../../lib/format';
import { blattAus, erster, type SuchParameter } from '../../../lib/seiten';
import type { Kunde, Liste } from '../../../lib/typen';

export const metadata: Metadata = { title: 'Kunden & Fahrer' };

export default async function Kunden({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const params = await searchParams;
  const status = erster(params.status);
  const blatt = blattAus(params);
  const [daten, sitzung] = await Promise.all([
    apiGet<Liste<Kunde>>('/v1/kunden', { status, limit: blatt.limit, offset: blatt.offset }),
    holeSitzung(),
  ]);
  const darfAnlegen = hatRolle(sitzung?.rollen ?? [], 'ops', 'admin');

  return (
    <>
      <Seitenkopf
        titel="Kunden & Fahrer"
        untertitel="Firmenkunden (D-010) mit Prüfstatus; Fahrer gehören zum Kunden (D-004)."
        aktionen={
          darfAnlegen ? (
            <Link className="knopf" href="/kunden/neu">
              Kunde anlegen
            </Link>
          ) : null
        }
      />
      <section className="karte">
        <StatusFilter pfad="/kunden" aktuell={status} optionen={KUNDE_STATUS} />
        {daten.eintraege.length === 0 ? (
          <Leer>Keine Kunden für diesen Filter.</Leer>
        ) : (
          <div className="tabelle-huelle">
            <table>
              <caption>Firmenkunden, neueste zuerst</caption>
              <thead>
                <tr>
                  <th scope="col">Firma</th>
                  <th scope="col">Status</th>
                  <th scope="col">USt-ID</th>
                  <th scope="col">Ort</th>
                  <th scope="col">angelegt</th>
                </tr>
              </thead>
              <tbody>
                {daten.eintraege.map((k) => (
                  <tr key={k.id}>
                    <td>
                      <Link href={`/kunden/${k.id}`}>
                        <strong>{k.firmenname}</strong>
                      </Link>
                    </td>
                    <td>
                      <Plakette status={k.status} />
                    </td>
                    <td className="mono">{k.ustId ?? '–'}</td>
                    <td>{k.ort ?? '–'}</td>
                    <td>{formatDatum(k.erstelltAm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Blaettern pfad="/kunden" params={params} gesamt={daten.gesamt} limit={blatt.limit} offset={blatt.offset} />
      </section>
    </>
  );
}
