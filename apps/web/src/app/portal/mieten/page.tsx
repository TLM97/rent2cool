import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDatumZeit } from '@rent2cool/oberflaeche/format';
import { blattAus, type SuchParameter } from '@rent2cool/oberflaeche/seiten';
import { Blaettern, Leer, Plakette, Seitenkopf } from '../../../components/bausteine';
import { apiGet, mitKunde } from '../../../lib/api';
import { hat } from '../../../lib/portal';
import type { Liste, Miete } from '../../../lib/typen';

export const metadata: Metadata = { title: 'Mieten & Nachweise' };

export default async function Mieten({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const params = await searchParams;
  const ich = await mitKunde();
  const blatt = blattAus(params, 25);
  // Der Kern liefert nur Mieten des eigenen Unternehmens (D-020).
  const mieten = await apiGet<Liste<Miete>>('/v1/mieten', {
    limit: blatt.limit,
    offset: blatt.offset,
  });

  return (
    <>
      <Seitenkopf
        titel="Mieten & Nachweise"
        untertitel="Nach jeder Miete entsteht automatisch ein gesiegelter Temperaturnachweis."
      />
      {hat(ich.rollen, 'kunde_dispo') ? (
        <div className="knopfreihe abstand-unten">
          <Link className="knopf" href="/portal/buchen">
            Neue Buchung
          </Link>
        </div>
      ) : null}
      <section className="karte">
        {mieten.eintraege.length === 0 ? (
          <Leer>Noch keine Mieten.</Leer>
        ) : (
          <div className="tabelle-huelle">
            <table>
              <thead>
                <tr>
                  <th scope="col">Fahrzeug</th>
                  <th scope="col">Zeitraum</th>
                  <th scope="col">Temperaturprofil</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {mieten.eintraege.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/portal/mieten/${m.id}`}>
                        {m.fahrzeugKennzeichen ?? 'Fahrzeug'}
                      </Link>
                    </td>
                    <td>
                      {formatDatumZeit(m.startIst ?? m.startGeplant)} –{' '}
                      {formatDatumZeit(m.endeIst ?? m.endeGeplant)}
                    </td>
                    <td>{m.temperaturprofil ?? '–'}</td>
                    <td>
                      <Plakette status={m.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Blaettern
          pfad="/portal/mieten"
          params={params}
          gesamt={mieten.gesamt}
          seite={blatt.seite}
          limit={blatt.limit}
        />
      </section>
    </>
  );
}
