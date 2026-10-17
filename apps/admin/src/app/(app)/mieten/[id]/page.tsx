import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { TemperaturNachweis } from '@rent2cool/shared';
import { Leer, Plakette, Seitenkopf } from '../../../../components/bausteine';
import { apiGetOderNull } from '../../../../lib/api';
import { formatDatumZeit, formatTemperatur, kurzeId, statusLabel } from '../../../../lib/format';
import { istUuid } from '../../../../lib/seiten';
import type { Fahrzeug, Kunde, Miete } from '../../../../lib/typen';

export const metadata: Metadata = { title: 'Miete' };

export default async function MieteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const miete = await apiGetOderNull<Miete>(`/v1/mieten/${id}`);
  if (!miete) notFound();

  const [nachweis, fahrzeug, kunde] = await Promise.all([
    apiGetOderNull<TemperaturNachweis>(`/v1/mieten/${id}/temperaturnachweis`),
    apiGetOderNull<{ fahrzeug: Fahrzeug }>(`/v1/fahrzeuge/${miete.fahrzeugId}`),
    apiGetOderNull<Kunde>(`/v1/kunden/${miete.kundeId}`),
  ]);

  return (
    <>
      <Seitenkopf
        titel={`Miete ${kurzeId(miete.id)}`}
        untertitel={<Plakette status={miete.status} />}
        brotkrume={{ href: '/mieten', text: 'Mieten' }}
      />

      <div className="zweispaltig">
        <section className="karte" aria-labelledby="miete-titel">
          <h2 id="miete-titel">Buchung</h2>
          <dl className="eigenschaften">
            <dt>Kunde</dt>
            <dd>
              <Link href={`/kunden/${miete.kundeId}`}>{kunde?.firmenname ?? kurzeId(miete.kundeId)}</Link>
            </dd>
            <dt>Fahrzeug</dt>
            <dd>
              <Link href={`/fahrzeuge/${miete.fahrzeugId}`}>
                {fahrzeug?.fahrzeug.kennzeichen ?? kurzeId(miete.fahrzeugId)}
              </Link>
            </dd>
            <dt>geplant</dt>
            <dd>
              {formatDatumZeit(miete.startGeplant)} – {formatDatumZeit(miete.endeGeplant)}
            </dd>
            <dt>tatsächlich</dt>
            <dd>
              {formatDatumZeit(miete.startIst)} – {formatDatumZeit(miete.endeIst)}
            </dd>
            <dt>Auslandsfahrt</dt>
            <dd>{miete.auslandsfahrtGeplant ? 'geplant' : 'nein'}</dd>
            <dt>Temperaturprofil</dt>
            <dd>{miete.temperaturprofil ? `${miete.temperaturprofil} °C` : 'Standard des Fahrzeugs'}</dd>
          </dl>
        </section>

        <section className="karte" aria-labelledby="nachweis-titel">
          <h2 id="nachweis-titel">Temperaturnachweis</h2>
          {!nachweis ? (
            <Leer>Kein Nachweis verfügbar.</Leer>
          ) : (
            <>
              <p>
                <Plakette status={nachweis.bewertung} /> <span className="leise">Profil {nachweis.profil.name} °C</span>
              </p>
              <dl className="eigenschaften">
                <dt>Messwerte</dt>
                <dd>{nachweis.kennzahlen.anzahl}</dd>
                <dt>min / mittel / max</dt>
                <dd>
                  {formatTemperatur(nachweis.kennzahlen.minC)} / {formatTemperatur(nachweis.kennzahlen.mittelC)} /{' '}
                  {formatTemperatur(nachweis.kennzahlen.maxC)}
                </dd>
                <dt>Grenzverletzungen</dt>
                <dd>{nachweis.grenzverletzungen.length}</dd>
                <dt>Lücken</dt>
                <dd>{nachweis.luecken.length}</dd>
                <dt>Integrität</dt>
                <dd className="mono" title={nachweis.integritaet.datenHash}>
                  {nachweis.integritaet.algorithmus} · {nachweis.integritaet.datenHash.slice(0, 16)}…
                </dd>
              </dl>
            </>
          )}
        </section>
      </div>

      {nachweis && nachweis.grenzverletzungen.length > 0 ? (
        <section className="karte" aria-labelledby="verletzung-titel">
          <h2 id="verletzung-titel">Grenzverletzungen</h2>
          <div className="tabelle-huelle">
            <table>
              <thead>
                <tr>
                  <th scope="col">Zeit</th>
                  <th scope="col">Art</th>
                  <th scope="col" className="zahl">
                    Wert
                  </th>
                </tr>
              </thead>
              <tbody>
                {nachweis.grenzverletzungen.slice(0, 50).map((g) => (
                  <tr key={g.zeit}>
                    <td>{formatDatumZeit(g.zeit)}</td>
                    <td>{statusLabel(g.art === 'ueber' ? 'temperatur_ueber' : 'temperatur_unter')}</td>
                    <td className="zahl">{formatTemperatur(g.wert)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
