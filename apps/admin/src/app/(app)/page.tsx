import Link from 'next/link';
import type { Metadata } from 'next';
import { FahrzeugLink, Leer, Seitenkopf } from '../../components/bausteine';
import { apiGetOderNull } from '../../lib/api';
import { formatDatumZeit, formatTemperatur, kurzeId, statusLabel } from '../../lib/format';
import type {
  Kunde,
  Abweichung,
  Alarm,
  FaelligeKalibrierung,
  FaelligerFuehrerschein,
  Fahrzeug,
  Liste,
  Miete,
  Rechnung,
} from '../../lib/typen';

export const metadata: Metadata = { title: 'Übersicht' };

function Kennzahl({
  wert,
  bezeichnung,
  href,
  ton,
}: {
  wert: number | null;
  bezeichnung: string;
  href: string;
  ton?: 'warn' | 'kritisch';
}) {
  const klasse = `kennzahl${wert && ton ? ` ${ton}` : ''}`;
  return (
    <Link className={klasse} href={href}>
      <span className="wert">{wert ?? '–'}</span>
      <span className="bezeichnung">{bezeichnung}</span>
    </Link>
  );
}

export default async function Uebersicht() {
  const [
    fahrzeuge,
    verfuegbar,
    aktiveMieten,
    offeneAlarme,
    abweichungen,
    rechnungen,
    kalibrierungen,
    fuehrerscheine,
    zurFreigabe,
  ] = await Promise.all([
    apiGetOderNull<Liste<Fahrzeug>>('/v1/fahrzeuge', { limit: 1 }),
    apiGetOderNull<Liste<Fahrzeug>>('/v1/fahrzeuge', { status: 'verfuegbar', limit: 1 }),
    apiGetOderNull<Liste<Miete>>('/v1/mieten', { status: 'aktiv', limit: 1 }),
    apiGetOderNull<Liste<Alarm>>('/v1/alarme', { status: 'offen', limit: 6 }),
    apiGetOderNull<Liste<Abweichung>>('/v1/abweichungen', { status: 'erfasst', limit: 1 }),
    apiGetOderNull<Liste<Rechnung>>('/v1/rechnungen', { status: 'gestellt', limit: 1 }),
    apiGetOderNull<FaelligeKalibrierung[]>('/v1/fahrzeuge/faellige-kalibrierungen'),
    apiGetOderNull<FaelligerFuehrerschein[]>('/v1/fahrer/faellige-fuehrerscheine'),
    // Selbst registrierte Kunden warten auf unsere Freigabe (F-51).
    apiGetOderNull<Liste<Kunde>>('/v1/kunden', { status: 'in_pruefung', limit: 1 }),
  ]);

  return (
    <>
      <Seitenkopf
        titel="Übersicht"
        untertitel="Lage der Flotte, offene Qualitätsfälle und Fristen auf einen Blick."
      />

      <section className="kennzahlen" aria-label="Kennzahlen">
        <Kennzahl
          wert={zurFreigabe?.gesamt ?? null}
          bezeichnung="Kunden zur Freigabe"
          href="/kunden?status=in_pruefung"
          ton="warn"
        />
        <Kennzahl
          wert={fahrzeuge?.gesamt ?? null}
          bezeichnung="Fahrzeuge gesamt"
          href="/fahrzeuge"
        />
        <Kennzahl
          wert={verfuegbar?.gesamt ?? null}
          bezeichnung="verfügbar"
          href="/fahrzeuge?status=verfuegbar"
        />
        <Kennzahl
          wert={aktiveMieten?.gesamt ?? null}
          bezeichnung="aktive Mieten"
          href="/mieten?status=aktiv"
        />
        <Kennzahl
          wert={offeneAlarme?.gesamt ?? null}
          bezeichnung="offene Alarme"
          href="/alarme?status=offen"
          ton="kritisch"
        />
        <Kennzahl
          wert={abweichungen?.gesamt ?? null}
          bezeichnung="neue Abweichungen"
          href="/abweichungen?status=erfasst"
          ton="warn"
        />
        <Kennzahl
          wert={rechnungen?.gesamt ?? null}
          bezeichnung="offene Rechnungen"
          href="/rechnungen?status=gestellt"
        />
        <Kennzahl
          wert={kalibrierungen?.length ?? null}
          bezeichnung="Kalibrierungen fällig (30 T.)"
          href="/fahrzeuge"
          ton="warn"
        />
        <Kennzahl
          wert={fuehrerscheine?.length ?? null}
          bezeichnung="Führerscheine fällig (30 T.)"
          href="/kunden"
          ton="warn"
        />
      </section>

      <div className="zweispaltig">
        <section className="karte" aria-labelledby="alarme-titel">
          <h2 id="alarme-titel">Offene Alarme</h2>
          {offeneAlarme === null ? (
            <Leer>Keine Berechtigung für Alarme.</Leer>
          ) : offeneAlarme.eintraege.length === 0 ? (
            <Leer>Keine offenen Alarme. ✓</Leer>
          ) : (
            <div className="tabelle-huelle">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Zeit</th>
                    <th scope="col">Art</th>
                    <th scope="col" className="zahl">
                      Wert
                    </th>
                    <th scope="col">Fahrzeug</th>
                  </tr>
                </thead>
                <tbody>
                  {offeneAlarme.eintraege.map((a) => (
                    <tr key={a.id}>
                      <td>{formatDatumZeit(a.ausgeloestAm)}</td>
                      <td>{statusLabel(a.typ)}</td>
                      <td className="zahl">
                        {a.typ.startsWith('temperatur') ? formatTemperatur(a.wert) : '–'}
                      </td>
                      <td>
                        <FahrzeugLink id={a.fahrzeugId} kennzeichen={a.fahrzeugKennzeichen} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                <Link href="/alarme?status=offen">Alle offenen Alarme →</Link>
              </p>
            </div>
          )}
        </section>

        <section className="karte" aria-labelledby="fristen-titel">
          <h2 id="fristen-titel">Fällige Kalibrierungen</h2>
          {kalibrierungen === null ? (
            <Leer>Keine Berechtigung.</Leer>
          ) : kalibrierungen.length === 0 ? (
            <Leer>Keine Kalibrierung läuft in den nächsten 30 Tagen ab. ✓</Leer>
          ) : (
            <div className="tabelle-huelle">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Fahrzeug</th>
                    <th scope="col">Sensor</th>
                    <th scope="col">gültig bis</th>
                  </tr>
                </thead>
                <tbody>
                  {kalibrierungen.slice(0, 8).map((k) => (
                    <tr key={k.sensorId}>
                      <td>
                        <Link href={`/fahrzeuge/${k.fahrzeugId}`}>{k.kennzeichen}</Link>
                      </td>
                      <td className="mono">{k.seriennummer ?? kurzeId(k.sensorId)}</td>
                      <td>
                        {k.gueltigBis ? (
                          formatDatumZeit(k.gueltigBis)
                        ) : (
                          <span className="plakette kritisch">keine Kalibrierung</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {kalibrierungen.length > 8 ? (
                <p className="leise">… und {kalibrierungen.length - 8} weitere</p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
