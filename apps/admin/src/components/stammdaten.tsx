/**
 * Feldgruppen der Stammdaten – gemeinsam für „Anlegen“ und „Bearbeiten“, damit
 * Beschriftungen, Hinweise und Formate nur an einer Stelle gepflegt werden.
 * `werte` belegt die Felder beim Bearbeiten mit dem gespeicherten Stand vor.
 */
import { FUEHRERSCHEINKLASSEN, STANDARD_TEMPERATURPROFILE } from '@rent2cool/shared';
import { isoZuBerlinLokal } from '../lib/formular';
import type { Fahrer, Fahrzeug, Kunde } from '../lib/typen';
import { Auswahl, Feld, Haken } from './formular';

const KLASSEN = FUEHRERSCHEINKLASSEN.map((k) => ({ wert: k, text: k }));

export function FahrzeugFelder({ werte }: { werte?: Fahrzeug }) {
  return (
    <>
      <Feld name="kennzeichen" label="Kennzeichen" pflicht hinweis="z. B. B-RC 1001" standard={werte?.kennzeichen} />
      <Feld name="vin" label="Fahrgestellnummer (VIN)" standard={werte?.vin ?? ''} />
      <Feld
        name="zulGesamtmasseKg"
        label="zul. Gesamtmasse (kg)"
        typ="number"
        pflicht
        standard={String(werte?.zulGesamtmasseKg ?? 3500)}
        hinweis="Bestimmt die nötige Führerscheinklasse (D-007)."
      />
      <Auswahl
        name="benoetigteFuehrerscheinklasse"
        label="Benötigte Führerscheinklasse"
        standard={werte?.benoetigteFuehrerscheinklasse ?? 'B'}
        optionen={KLASSEN}
      />
      <Auswahl
        name="standardTemperaturprofil"
        label="Standard-Temperaturprofil"
        standard={werte ? (werte.standardTemperaturprofil ?? '') : '2-8'}
        leer="keins"
        optionen={STANDARD_TEMPERATURPROFILE.map((p) => ({ wert: p.name, text: `${p.name} °C` }))}
        hinweis="Gegen dieses Profil wertet die Telematik Alarme aus."
      />
      <Haken
        name="hatFahrtenschreiber"
        label="Fahrtenschreiber verbaut"
        standard={werte?.hatFahrtenschreiber ?? false}
        hinweis="Nur Fahrzeuge mit Fahrtenschreiber dürfen für Auslandsfahrten gebucht werden (D-006)."
      />
    </>
  );
}

export function KundeFelder({ werte }: { werte?: Kunde }) {
  return (
    <>
      <Feld name="firmenname" label="Firmenname" pflicht breit standard={werte?.firmenname} />
      <Feld
        name="handelsregisternummer"
        label="Handelsregisternummer"
        hinweis="z. B. HRB 12345 B"
        standard={werte?.handelsregisternummer ?? ''}
      />
      <Feld name="ustId" label="USt-ID" hinweis="z. B. DE123456789" standard={werte?.ustId ?? ''} />
      <Feld name="strasse" label="Straße und Hausnummer" breit standard={werte?.strasse ?? ''} />
      <Feld name="plz" label="PLZ" standard={werte?.plz ?? ''} />
      <Feld name="ort" label="Ort" standard={werte?.ort ?? ''} />
      <Feld name="land" label="Land (ISO)" standard={werte?.land ?? 'DE'} />
    </>
  );
}

export function FahrerFelder({ werte }: { werte?: Fahrer }) {
  return (
    <>
      <Feld name="name" label="Name" pflicht standard={werte?.name} />
      <Auswahl
        name="fuehrerscheinKlasse"
        label="Führerscheinklasse"
        pflicht
        standard={werte?.fuehrerscheinKlasse ?? 'B'}
        optionen={KLASSEN}
      />
      <Feld name="fuehrerscheinNummer" label="Führerscheinnummer" standard={werte?.fuehrerscheinNummer ?? ''} />
      <Feld
        name="fuehrerscheinGueltigBis"
        label="Führerschein gültig bis"
        typ="date"
        standard={werte?.fuehrerscheinGueltigBis ? isoZuBerlinLokal(werte.fuehrerscheinGueltigBis, true) : ''}
      />
    </>
  );
}
