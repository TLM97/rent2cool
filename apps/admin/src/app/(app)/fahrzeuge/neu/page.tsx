import type { Metadata } from 'next';
import { FUEHRERSCHEINKLASSEN, STANDARD_TEMPERATURPROFILE } from '@rent2cool/shared';
import { Seitenkopf } from '../../../../components/bausteine';
import { Auswahl, Feld, FormularRahmen, Gruppe, Haken } from '../../../../components/formular';
import { erstelleFahrzeug } from '../../formulare';

export const metadata: Metadata = { title: 'Fahrzeug anlegen' };

export default function FahrzeugNeu() {
  return (
    <>
      <Seitenkopf
        titel="Fahrzeug anlegen"
        untertitel="Neue Fahrzeugakte. Das Fahrzeug startet im Status „angelegt“ und wird erst nach Kalibrierung buchbar."
        brotkrume={{ href: '/fahrzeuge', text: 'Fahrzeuge' }}
      />
      <section className="karte">
        <FormularRahmen aktion={erstelleFahrzeug} sendenText="Fahrzeug anlegen" abbrechenHref="/fahrzeuge">
          <Feld name="kennzeichen" label="Kennzeichen" pflicht hinweis="z. B. B-RC 1001" />
          <Feld name="vin" label="Fahrgestellnummer (VIN)" />
          <Feld
            name="zulGesamtmasseKg"
            label="zul. Gesamtmasse (kg)"
            typ="number"
            pflicht
            standard="3500"
            hinweis="Bestimmt die nötige Führerscheinklasse (D-007)."
          />
          <Auswahl
            name="benoetigteFuehrerscheinklasse"
            label="Benötigte Führerscheinklasse"
            standard="B"
            optionen={FUEHRERSCHEINKLASSEN.map((k) => ({ wert: k, text: k }))}
          />
          <Auswahl
            name="standardTemperaturprofil"
            label="Standard-Temperaturprofil"
            standard="2-8"
            leer="keins"
            optionen={STANDARD_TEMPERATURPROFILE.map((p) => ({ wert: p.name, text: `${p.name} °C` }))}
            hinweis="Gegen dieses Profil wertet die Telematik Alarme aus."
          />
          <Haken
            name="hatFahrtenschreiber"
            label="Fahrtenschreiber verbaut"
            hinweis="Nur Fahrzeuge mit Fahrtenschreiber dürfen für Auslandsfahrten gebucht werden (D-006)."
          />
          <Haken name="mitAufbau" label="Kühlaufbau mit Laderaum-Temperatursensor erfassen" standard />
          <Gruppe titel="Kühlaufbau (Aggregat) und Sensor">
            <Feld name="aggregatTyp" label="Typ des Aufbaus" standard="Kühlkoffer" />
            <Feld name="aggregatHersteller" label="Hersteller" />
            <Feld name="aggregatSeriennummer" label="Seriennummer Aufbau" />
            <Feld name="sensorModell" label="Sensor-Modell" hinweis="Temperaturschreiber nach EN 12830" />
            <Feld name="sensorSeriennummer" label="Sensor-Seriennummer" />
          </Gruppe>
        </FormularRahmen>
      </section>
    </>
  );
}
