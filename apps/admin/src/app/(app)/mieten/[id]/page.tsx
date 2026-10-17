import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { istMieteUebergangErlaubt, MIETE_STATUS, type TemperaturNachweis } from '@rent2cool/shared';
import { Leer, Meldungen, Plakette, Seitenkopf, StatusFormular } from '../../../../components/bausteine';
import { Verlauf } from '../../../../components/verlauf';
import { Feld, FormularRahmen } from '../../../../components/formular';
import { apiGet, apiGetOderNull } from '../../../../lib/api';
import { formatDatumZeit, formatEuro, formatTemperatur, kurzeId, statusLabel } from '../../../../lib/format';
import { naechsteStatus } from '../../../../lib/formular';
import { istUuid, type SuchParameter } from '../../../../lib/seiten';
import { holeSitzung } from '../../../../lib/sitzung';
import { hatRolle } from '../../../../lib/token';
import type { Fahrzeug, Kunde, Liste, Miete, Rechnung } from '../../../../lib/typen';
import { aendereMieteStatus } from '../../aktionen';
import { erstelleRechnung } from '../../formulare';

export const metadata: Metadata = { title: 'Miete' };

export default async function MieteDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SuchParameter>;
}) {
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const suche = await searchParams;
  const miete = await apiGetOderNull<Miete>(`/v1/mieten/${id}`);
  if (!miete) notFound();

  const [nachweis, fahrzeug, kunde, rechnungen, sitzung] = await Promise.all([
    apiGetOderNull<TemperaturNachweis>(`/v1/mieten/${id}/temperaturnachweis`),
    apiGetOderNull<{ fahrzeug: Fahrzeug }>(`/v1/fahrzeuge/${miete.fahrzeugId}`),
    apiGetOderNull<Kunde>(`/v1/kunden/${miete.kundeId}`),
    apiGet<Liste<Rechnung>>('/v1/rechnungen', { mieteId: id, limit: 1, offset: 0 }),
    holeSitzung(),
  ]);
  const rollen = sitzung?.rollen ?? [];
  const darfAendern = hatRolle(rollen, 'ops', 'admin');
  const darfAbweichung = hatRolle(rollen, 'ops', 'admin', 'qa_approver');
  const rechnung = rechnungen.eintraege[0];

  return (
    <>
      <Seitenkopf
        titel={`Miete ${kurzeId(miete.id)}`}
        untertitel={<Plakette status={miete.status} />}
        brotkrume={{ href: '/mieten', text: 'Mieten' }}
        aktionen={
          darfAbweichung ? (
            <Link className="knopf zweitrangig" href={`/abweichungen/neu?bezugTyp=miete&bezugId=${miete.id}`}>
              Abweichung erfassen
            </Link>
          ) : null
        }
      />
      <Meldungen params={suche} />

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
            {darfAendern ? (
              <>
                <dt>Status</dt>
                <dd>
                  <StatusFormular
                    aktion={aendereMieteStatus}
                    id={miete.id}
                    naechste={naechsteStatus(MIETE_STATUS, miete.status, istMieteUebergangErlaubt)}
                    label="Mietstatus ändern"
                  />
                </dd>
              </>
            ) : null}
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

      <section className="karte" aria-labelledby="rechnung-titel">
        <h2 id="rechnung-titel">Rechnung</h2>
        {rechnung ? (
          <p>
            <Link className="mono" href={`/rechnungen/${rechnung.id}`}>
              <strong>{rechnung.rechnungsnummer}</strong>
            </Link>{' '}
            <Plakette status={rechnung.status} />{' '}
            <span className="leise">{formatEuro(rechnung.bruttoCent, rechnung.waehrung)} brutto</span>
          </p>
        ) : miete.status !== 'beendet' ? (
          <Leer>Eine Rechnung kann erst nach Ende der Miete erstellt werden.</Leer>
        ) : darfAendern ? (
          <FormularRahmen aktion={erstelleRechnung} sendenText="Rechnung erstellen" versteckt={{ mieteId: miete.id }}>
            <Feld
              name="netto"
              label="Nettobetrag (EUR)"
              typ="number"
              schritt="0.01"
              min="0.01"
              pflicht
              hinweis="Die Rechnungsnummer vergibt der Kern fortlaufend (R-63)."
            />
            <Feld name="steuerSatz" label="USt-Satz (%)" typ="number" schritt="1" min="0" hinweis="leer = Standardsatz" />
          </FormularRahmen>
        ) : (
          <Leer>Noch keine Rechnung.</Leer>
        )}
      </section>

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
      <Verlauf entitaetIds={[miete.id]} typen={['miete', 'miete_status']} />
    </>
  );
}
