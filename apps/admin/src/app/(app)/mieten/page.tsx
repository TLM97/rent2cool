import Link from 'next/link';
import type { Metadata } from 'next';
import { MIETE_STATUS } from '@rent2cool/shared';
import {
  Blaettern,
  FahrzeugLink,
  KundeLink,
  Leer,
  Plakette,
  Seitenkopf,
  StatusFilter,
} from '../../../components/bausteine';
import { apiGet } from '../../../lib/api';
import { holeSitzung } from '../../../lib/sitzung';
import { hatRolle } from '../../../lib/token';
import { formatDatumZeit } from '../../../lib/format';
import { blattAus, erster, type SuchParameter } from '../../../lib/seiten';
import type { Liste, Miete } from '../../../lib/typen';

export const metadata: Metadata = { title: 'Mieten' };

export default async function Mieten({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const params = await searchParams;
  const status = erster(params.status);
  const blatt = blattAus(params);
  const [daten, sitzung] = await Promise.all([
    apiGet<Liste<Miete>>('/v1/mieten', { status, limit: blatt.limit, offset: blatt.offset }),
    holeSitzung(),
  ]);
  const darfBuchen = hatRolle(sitzung?.rollen ?? [], 'ops', 'admin');

  return (
    <>
      <Seitenkopf
        titel="Mieten"
        untertitel="Buchungen mit Zeitraum, Status und Temperaturnachweis."
        aktionen={
          darfBuchen ? (
            <Link className="knopf" href="/mieten/neu">
              Buchung anlegen
            </Link>
          ) : null
        }
      />
      <section className="karte">
        <StatusFilter pfad="/mieten" aktuell={status} optionen={MIETE_STATUS} />
        {daten.eintraege.length === 0 ? (
          <Leer>Keine Mieten für diesen Filter.</Leer>
        ) : (
          <div className="tabelle-huelle">
            <table>
              <caption>Mieten nach geplantem Start, neueste zuerst</caption>
              <thead>
                <tr>
                  <th scope="col">Zeitraum (geplant)</th>
                  <th scope="col">Status</th>
                  <th scope="col">Fahrzeug</th>
                  <th scope="col">Kunde</th>
                  <th scope="col">Ausland</th>
                </tr>
              </thead>
              <tbody>
                {daten.eintraege.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/mieten/${m.id}`}>
                        {formatDatumZeit(m.startGeplant)} – {formatDatumZeit(m.endeGeplant)}
                      </Link>
                    </td>
                    <td>
                      <Plakette status={m.status} />
                    </td>
                    <td>
                      <FahrzeugLink id={m.fahrzeugId} kennzeichen={m.fahrzeugKennzeichen} />
                    </td>
                    <td>
                      <KundeLink id={m.kundeId} firmenname={m.kundeFirmenname} />
                    </td>
                    <td>{m.auslandsfahrtGeplant ? 'ja' : 'nein'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Blaettern
          pfad="/mieten"
          params={params}
          gesamt={daten.gesamt}
          limit={blatt.limit}
          offset={blatt.offset}
        />
      </section>
    </>
  );
}
