import type { Metadata } from 'next';
import { Seitenkopf } from '../../../../components/bausteine';
import { Feld, FormularRahmen, Gruppe, Haken } from '../../../../components/formular';
import { FahrzeugFelder } from '../../../../components/stammdaten';
import { standorteFuerAuswahl } from '../../../../lib/standorte';
import { erstelleFahrzeug } from '../../formulare';

export const metadata: Metadata = { title: 'Fahrzeug anlegen' };

export default async function FahrzeugNeu() {
  const standorte = await standorteFuerAuswahl();
  return (
    <>
      <Seitenkopf
        titel="Fahrzeug anlegen"
        untertitel="Neue Fahrzeugakte. Das Fahrzeug startet im Status „angelegt“ und wird erst nach Kalibrierung buchbar."
        brotkrume={{ href: '/fahrzeuge', text: 'Fahrzeuge' }}
      />
      <section className="karte">
        <FormularRahmen
          aktion={erstelleFahrzeug}
          sendenText="Fahrzeug anlegen"
          abbrechenHref="/fahrzeuge"
        >
          <FahrzeugFelder standorte={standorte} />
          <Haken
            name="mitAufbau"
            label="Kühlaufbau mit Laderaum-Temperatursensor erfassen"
            standard
          />
          <Gruppe titel="Kühlaufbau (Aggregat) und Sensor">
            <Feld name="aggregatTyp" label="Typ des Aufbaus" standard="Kühlkoffer" />
            <Feld name="aggregatHersteller" label="Hersteller" />
            <Feld name="aggregatSeriennummer" label="Seriennummer Aufbau" />
            <Feld
              name="sensorModell"
              label="Sensor-Modell"
              hinweis="Temperaturschreiber nach EN 12830"
            />
            <Feld name="sensorSeriennummer" label="Sensor-Seriennummer" />
          </Gruppe>
        </FormularRahmen>
      </section>
    </>
  );
}
