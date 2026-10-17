import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Leer, Seitenkopf } from '../../../../../../../components/bausteine';
import { Feld, FormularRahmen, Gruppe, Haken, Textfeld } from '../../../../../../../components/formular';
import { KalibrierungFelder } from '../../../../../../../components/stammdaten';
import { apiGetOderNull } from '../../../../../../../lib/api';
import { formatDatum, formatDatumZeit, kurzeId } from '../../../../../../../lib/format';
import { istUuid } from '../../../../../../../lib/seiten';
import { holeSitzung } from '../../../../../../../lib/sitzung';
import { hatRolle } from '../../../../../../../lib/token';
import type { FahrzeugAkte } from '../../../../../../../lib/typen';
import { tauscheSensor } from '../../../../../formulare';

export const metadata: Metadata = { title: 'Sensor tauschen' };

const UNTERWEGS = new Set(['vermietet', 'in_ruecknahme']);

export default async function SensorTausch({ params }: { params: Promise<{ id: string; sensorId: string }> }) {
  const { id, sensorId } = await params;
  if (!istUuid(id) || !istUuid(sensorId)) notFound();
  const [akte, sitzung] = await Promise.all([apiGetOderNull<FahrzeugAkte>(`/v1/fahrzeuge/${id}`), holeSitzung()]);
  const sensor = akte?.aggregate.flatMap((a) => a.sensoren).find((s) => s.id === sensorId);
  if (!akte || !sensor) notFound();
  const f = akte.fahrzeug;
  const pfad = `/fahrzeuge/${f.id}`;

  return (
    <>
      <Seitenkopf
        titel="Sensor tauschen"
        untertitel={`${f.kennzeichen} · ${sensor.messgroesse} · Sensor ${kurzeId(sensor.id)}`}
        brotkrume={{ href: pfad, text: f.kennzeichen }}
      />
      <section className="karte" aria-labelledby="alt-titel">
        <h2 id="alt-titel">Auszubauender Sensor</h2>
        <dl className="eigenschaften">
          <dt>Seriennummer</dt>
          <dd className="mono">{sensor.seriennummer ?? '–'}</dd>
          <dt>Modell</dt>
          <dd>{sensor.modell ?? '–'}</dd>
          <dt>eingebaut</dt>
          <dd>{formatDatumZeit(sensor.eingebautAm)}</dd>
          <dt>kalibriert bis</dt>
          <dd>{formatDatum(sensor.kalibriertBis)}</dd>
        </dl>
      </section>
      <section className="karte" aria-labelledby="tausch-titel">
        <h2 id="tausch-titel">Neuer Sensor</h2>
        {!hatRolle(sitzung?.rollen ?? [], 'ops', 'admin') ? (
          <Leer>Sensoren tauschen dürfen nur Ops und Admin.</Leer>
        ) : !sensor.aktiv ? (
          <Leer>Dieser Sensor ist bereits ausgebaut.</Leer>
        ) : (
          <>
            <p className="leise">
              Der alte Sensor wird ausgebaut und bleibt mit seiner Historie in der Akte. Der neue misst ab jetzt dieselbe
              Größe. Ohne gültige Kalibrierung des neuen Sensors ist das Fahrzeug nicht buchbar (R-08/R-09).
            </p>
            {UNTERWEGS.has(f.status) ? (
              <div className="hinweis warn">
                Das Fahrzeug ist gerade vermietet. Der Tausch wird mit Zeitpunkt protokolliert; bitte die Abweichung
                zur laufenden Miete erfassen.
              </div>
            ) : null}
            <FormularRahmen
              aktion={tauscheSensor}
              sendenText="Sensor tauschen"
              abbrechenHref={pfad}
              versteckt={{ fahrzeugId: f.id, sensorId: sensor.id }}
            >
              <Feld name="seriennummer" label="Seriennummer (neu)" pflicht />
              <Feld name="modell" label="Modell" standard={sensor.modell ?? ''} hinweis="Temperaturschreiber nach EN 12830" />
              <Textfeld name="grund" label="Grund für den Tausch" pflicht breit />
              <Haken name="mitKalibrierung" label="Kalibrierung des neuen Sensors gleich erfassen" standard />
              <Gruppe titel="Kalibrierung (neuer Sensor)">
                <KalibrierungFelder />
              </Gruppe>
            </FormularRahmen>
          </>
        )}
      </section>
    </>
  );
}
