import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDatum, formatEuro } from '@rent2cool/oberflaeche/format';
import { blattAus, type SuchParameter } from '@rent2cool/oberflaeche/seiten';
import { Blaettern, Leer, Plakette, Seitenkopf } from '../../../components/bausteine';
import { apiGet, mitKunde } from '../../../lib/api';
import type { Liste, Rechnung } from '../../../lib/typen';

export const metadata: Metadata = { title: 'Rechnungen' };

export default async function Rechnungen({
  searchParams,
}: {
  searchParams: Promise<SuchParameter>;
}) {
  const params = await searchParams;
  await mitKunde();
  const blatt = blattAus(params, 25);
  const rechnungen = await apiGet<Liste<Rechnung>>('/v1/rechnungen', {
    limit: blatt.limit,
    offset: blatt.offset,
  });

  return (
    <>
      <Seitenkopf titel="Rechnungen" />
      <section className="karte">
        {rechnungen.eintraege.length === 0 ? (
          <Leer>Noch keine Rechnungen.</Leer>
        ) : (
          <div className="tabelle-huelle">
            <table>
              <thead>
                <tr>
                  <th scope="col">Nummer</th>
                  <th scope="col">Zeitraum</th>
                  <th scope="col">Betrag (brutto)</th>
                  <th scope="col">Status</th>
                  <th scope="col">Miete</th>
                </tr>
              </thead>
              <tbody>
                {rechnungen.eintraege.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.rechnungsnummer}</td>
                    <td>
                      {formatDatum(r.zeitraumVon)} – {formatDatum(r.zeitraumBis)}
                    </td>
                    <td>{formatEuro(r.bruttoCent, r.waehrung)}</td>
                    <td>
                      <Plakette status={r.status} />
                    </td>
                    <td>
                      <Link href={`/portal/mieten/${r.mieteId}`}>ansehen</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Blaettern
          pfad="/portal/rechnungen"
          params={params}
          gesamt={rechnungen.gesamt}
          seite={blatt.seite}
          limit={blatt.limit}
        />
      </section>
    </>
  );
}
