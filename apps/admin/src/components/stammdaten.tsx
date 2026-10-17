/**
 * Feldgruppen der Stammdaten – gemeinsam für „Anlegen“ und „Bearbeiten“, damit
 * Beschriftungen, Hinweise und Formate nur an einer Stelle gepflegt werden.
 * `werte` belegt die Felder beim Bearbeiten mit dem gespeicherten Stand vor.
 */
import {
  FUEHRERSCHEINKLASSEN,
  STANDARD_TEMPERATURPROFILE,
  WOCHENTAG_NAME,
  WOCHENTAGE,
} from '@rent2cool/shared';
import { isoZuBerlinLokal } from '../lib/formular';
import { FENSTER_JE_TAG, feldName, formularWerte } from '../lib/oeffnungszeiten';
import type { Fahrer, Fahrzeug, Kunde, Standort } from '../lib/typen';
import { Auswahl, Feld, Gruppe, Haken, Zeitfeld } from './formular';

const KLASSEN = FUEHRERSCHEINKLASSEN.map((k) => ({ wert: k, text: k }));

export function FahrzeugFelder({
  werte,
  standorte = [],
}: {
  werte?: Fahrzeug;
  standorte?: readonly Standort[];
}) {
  return (
    <>
      <Auswahl
        name="standortId"
        label="Heimatstandort"
        standard={werte?.standortId ?? (standorte.length === 1 ? standorte[0]!.id : '')}
        leer="keiner"
        optionen={standorte.map((st) => ({ wert: st.id, text: st.name }))}
        hinweis="Abholung und Rückgabe finden hier statt (D-011)."
      />
      <Feld
        name="kennzeichen"
        label="Kennzeichen"
        pflicht
        hinweis="z. B. B-RC 1001"
        standard={werte?.kennzeichen}
      />
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
      <Feld
        name="nachweisEmail"
        label="E-Mail für Temperaturnachweise (QA)"
        typ="email"
        breit
        hinweis="Bekommt nach jeder Miete den gesiegelten Nachweis als PDF."
        standard={werte?.nachweisEmail ?? ''}
      />
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
      <Feld
        name="fuehrerscheinNummer"
        label="Führerscheinnummer"
        standard={werte?.fuehrerscheinNummer ?? ''}
      />
      <Feld
        name="fuehrerscheinGueltigBis"
        label="Führerschein gültig bis"
        typ="date"
        standard={
          werte?.fuehrerscheinGueltigBis
            ? isoZuBerlinLokal(werte.fuehrerscheinGueltigBis, true)
            : ''
        }
      />
      {werte ? (
        <Feld
          name="kontoId"
          label="App-Konto (Benutzer-ID)"
          standard={werte.kontoId ?? ''}
          hinweis="Verknüpft den Login des Fahrers in der App mit diesem Datensatz – Voraussetzung für den digitalen Schlüssel."
        />
      ) : null}
    </>
  );
}

const TAG_MS = 86_400_000;

/** Kalibriernachweis nach EN 12830 – in der Fahrzeugakte und beim Sensortausch. */
export function KalibrierungFelder({ heute = new Date() }: { heute?: Date }) {
  return (
    <>
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
        standard={isoZuBerlinLokal(new Date(heute.getTime() + 365 * TAG_MS), true)}
      />
      <Feld name="zertifikatRef" label="Zertifikat-Nr. / Referenz" />
      <Feld name="ergebnis" label="Ergebnis" standard="bestanden" />
    </>
  );
}

/** Standort (D-011): Adresse, Geofence, Öffnungszeiten. */
export function StandortFelder({ werte }: { werte?: Standort }) {
  const oz = werte ? formularWerte(werte.oeffnungsregeln) : { oz_rund: 'on' };
  const zahl = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
  return (
    <>
      <Feld name="name" label="Name" pflicht breit standard={werte?.name} />
      <Feld name="strasse" label="Straße und Hausnummer" breit standard={werte?.strasse ?? ''} />
      <Feld name="plz" label="PLZ" standard={werte?.plz ?? ''} />
      <Feld name="ort" label="Ort" standard={werte?.ort ?? ''} />
      <Feld name="land" label="Land (ISO)" standard={werte?.land ?? 'DE'} />
      <Feld
        name="region"
        label="Region"
        standard={werte?.region ?? ''}
        hinweis="Betriebszone, Platzhalter bis F-9 geklärt ist."
      />
      <Gruppe titel="Geofence (Übergabebereich)">
        <Feld
          name="geofenceLat"
          label="Breitengrad"
          typ="number"
          schritt="0.000001"
          standard={zahl(werte?.geofenceLat)}
        />
        <Feld
          name="geofenceLng"
          label="Längengrad"
          typ="number"
          schritt="0.000001"
          standard={zahl(werte?.geofenceLng)}
        />
        <Feld
          name="geofenceRadiusM"
          label="Radius (m)"
          typ="number"
          standard={zahl(werte?.geofenceRadiusM)}
          hinweis="Alle drei Werte oder keinen. 10 m bis 10 km."
        />
      </Gruppe>
      <Gruppe titel="Öffnungszeiten (Ortszeit)">
        <Haken
          name="oz_rund"
          label="Rund um die Uhr (kontaktlose Übergabe, D-014)"
          standard={oz.oz_rund === 'on'}
          hinweis="Ist das Häkchen gesetzt, gelten die Zeiten unten nicht. Ende 00:00 = Mitternacht."
        />
        <div className="tabelle-huelle breit">
          <table className="oeffnungszeiten">
            <caption className="sr-nur">Zeitfenster je Wochentag; leer = geschlossen</caption>
            <thead>
              <tr>
                <th scope="col">Tag</th>
                {Array.from({ length: FENSTER_JE_TAG }, (_, i) => (
                  <th scope="col" key={i}>
                    {i === 0 ? 'Zeitfenster' : `${i + 1}. Zeitfenster (optional)`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WOCHENTAGE.map((tag) => (
                <tr key={tag}>
                  <th scope="row">{WOCHENTAG_NAME[tag]}</th>
                  {Array.from({ length: FENSTER_JE_TAG }, (_, i) => (
                    <td key={i}>
                      <Zeitfeld
                        name={feldName(tag, 'von', i + 1)}
                        label={`${WOCHENTAG_NAME[tag]}, ${i + 1}. Zeitfenster von`}
                        standard={oz[feldName(tag, 'von', i + 1)] ?? ''}
                      />
                      {' – '}
                      <Zeitfeld
                        name={feldName(tag, 'bis', i + 1)}
                        label={`${WOCHENTAG_NAME[tag]}, ${i + 1}. Zeitfenster bis`}
                        standard={oz[feldName(tag, 'bis', i + 1)] ?? ''}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Gruppe>
    </>
  );
}
