import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { erlaubteUebergaenge, istFahrzeugStatus } from '@rent2cool/shared';
import { Leer, Meldungen, Plakette, Seitenkopf } from '../../../../components/bausteine';
import { Auswahl, Feld, FormularRahmen } from '../../../../components/formular';
import { apiGet, apiGetOderNull } from '../../../../lib/api';
import { formatDatum, kurzeId, statusLabel } from '../../../../lib/format';
import { isoZuBerlinLokal } from '../../../../lib/formular';
import { istUuid, type SuchParameter } from '../../../../lib/seiten';
import { holeSitzung } from '../../../../lib/sitzung';
import { hatRolle } from '../../../../lib/token';
import type { FahrzeugAkte, Pruefergebnis } from '../../../../lib/typen';
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
  const [buchbarkeit, sitzung] = await Promise.all([
    apiGet<Pruefergebnis>(`/v1/fahrzeuge/${id}/buchbarkeit`),
    holeSitzung(),
  ]);
  const f = akte.fahrzeug;
  const rollen = sitzung?.rollen ?? [];
  const darfAendern = hatRolle(rollen, 'ops', 'admin');
  const darfAbweichung = hatRolle(rollen, 'ops', 'admin', 'qa_approver');
  const naechste = istFahrzeugStatus(f.status) ? erlaubteUebergaenge(f.status) : [];
  const sensoren = akte.aggregate.flatMap((a) => a.sensoren.filter((s) => s.aktiv));
  const heute = new Date();
  const inEinemJahr = new Date(heute.getTime() + 365 * 86_400_000);

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
              <Link className="knopf zweitrangig" href={`/abweichungen/neu?bezugTyp=fahrzeug&bezugId=${f.id}`}>
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
            <dt>Temperaturprofil</dt>
            <dd>{f.standardTemperaturprofil ? `${f.standardTemperaturprofil} °C` : '–'}</dd>
            <dt>angelegt</dt>
            <dd>{formatDatum(f.erstelltAm)}</dd>
          </dl>
        </section>

        <section className="karte" aria-labelledby="buchbar-titel">
          <h2 id="buchbar-titel">Buchbarkeit</h2>
          {buchbarkeit.buchbar ? (
            <div className="hinweis erfolg">Buchbar – verfügbar und alle Sensoren gültig kalibriert.</div>
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
                    <th scope="col">Einheit</th>
                    <th scope="col">Modell</th>
                    <th scope="col">aktiv</th>
                  </tr>
                </thead>
                <tbody>
                  {a.sensoren.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{kurzeId(s.id)}</td>
                      <td>{s.messgroesse}</td>
                      <td>{s.einheit}</td>
                      <td>{s.modell ?? '–'}</td>
                      <td>{s.aktiv ? 'ja' : 'nein'}</td>
                    </tr>
                  ))}
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
            Nachweis nach EN 12830. Ohne gültige Kalibrierung ist das Fahrzeug nicht buchbar (R-08/R-09).
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
            <Feld name="pruefstelle" label="Prüfstelle" />
            <Feld
              name="durchgefuehrtAm"
              label="Geprüft am"
              typ="date"
              pflicht
              standard={isoZuBerlinLokal(heute, true)}
            />
            <Feld
              name="gueltigBis"
              label="Gültig bis (einschließlich)"
              typ="date"
              pflicht
              standard={isoZuBerlinLokal(inEinemJahr, true)}
            />
            <Feld name="zertifikatRef" label="Zertifikat-Nr. / Referenz" />
            <Feld name="ergebnis" label="Ergebnis" standard="bestanden" />
          </FormularRahmen>
        </section>
      ) : null}
    </>
  );
}
