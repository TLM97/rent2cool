import Link from 'next/link';
import type { Metadata } from 'next';
import { RECHNUNG_STATUS } from '@rent2cool/shared';
import { Blaettern, Leer, Plakette, Seitenkopf, StatusFilter } from '../../../components/bausteine';
import { apiGet } from '../../../lib/api';
import { formatDatum, formatEuro, kurzeId } from '../../../lib/format';
import { blattAus, erster, type SuchParameter } from '../../../lib/seiten';
import type { Liste, Rechnung } from '../../../lib/typen';

export const metadata: Metadata = { title: 'Rechnungen' };

export default async function Rechnungen({
  searchParams,
}: {
  searchParams: Promise<SuchParameter>;
}) {
  const params = await searchParams;
  const status = erster(params.status);
  const blatt = blattAus(params);
  const daten = await apiGet<Liste<Rechnung>>('/v1/rechnungen', {
    status,
    limit: blatt.limit,
    offset: blatt.offset,
  });

  return (
    <>
      <Seitenkopf
        titel="Rechnungen"
        untertitel="Eine Rechnung je beendeter Miete, fortlaufend nummeriert (R-63)."
      />
      <section className="karte">
        <StatusFilter pfad="/rechnungen" aktuell={status} optionen={RECHNUNG_STATUS} />
        {daten.eintraege.length === 0 ? (
          <Leer>Keine Rechnungen für diesen Filter.</Leer>
        ) : (
          <div className="tabelle-huelle">
            <table>
              <caption>Rechnungen, neueste zuerst</caption>
              <thead>
                <tr>
                  <th scope="col">Nummer</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="zahl">
                    Netto
                  </th>
                  <th scope="col" className="zahl">
                    USt
                  </th>
                  <th scope="col" className="zahl">
                    Brutto
                  </th>
                  <th scope="col">Miete</th>
                  <th scope="col">gestellt</th>
                </tr>
              </thead>
              <tbody>
                {daten.eintraege.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link className="mono" href={`/rechnungen/${r.id}`}>
                        <strong>{r.rechnungsnummer}</strong>
                      </Link>
                    </td>
                    <td>
                      <Plakette status={r.status} />
                    </td>
                    <td className="zahl">{formatEuro(r.nettoCent, r.waehrung)}</td>
                    <td className="zahl">{formatEuro(r.steuerCent, r.waehrung)}</td>
                    <td className="zahl">
                      <strong>{formatEuro(r.bruttoCent, r.waehrung)}</strong>
                    </td>
                    <td>
                      <Link className="mono" href={`/mieten/${r.mieteId}`}>
                        {kurzeId(r.mieteId)}
                      </Link>
                    </td>
                    <td>{formatDatum(r.gestelltAm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Blaettern
          pfad="/rechnungen"
          params={params}
          gesamt={daten.gesamt}
          limit={blatt.limit}
          offset={blatt.offset}
        />
      </section>
    </>
  );
}
