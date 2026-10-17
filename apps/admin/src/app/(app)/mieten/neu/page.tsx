import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import { STANDARD_TEMPERATURPROFILE } from '@rent2cool/shared';
import { Leer, Seitenkopf } from '../../../../components/bausteine';
import { Auswahl, Feld, FormularRahmen, Haken } from '../../../../components/formular';
import { apiGet, apiGetOderNull } from '../../../../lib/api';
import { isoZuBerlinLokal } from '../../../../lib/formular';
import { erster, istUuid, type SuchParameter } from '../../../../lib/seiten';
import type { Fahrer, Fahrzeug, Kunde, Liste } from '../../../../lib/typen';
import { erstelleMiete } from '../../formulare';

export const metadata: Metadata = { title: 'Buchung anlegen' };

/**
 * Auswahllisten sind auf 200 Einträge begrenzt. Bei 4.000 Fahrzeugen (D-003)
 * braucht es stattdessen eine Suche nach Kennzeichen/Standort – vor Go-live.
 */
const AUSWAHL_LIMIT = 200;
const STUNDE = 3_600_000;

export default async function MieteNeu({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const params = await searchParams;
  const kundeId = erster(params.kundeId);
  const kunden = await apiGet<Liste<Kunde>>('/v1/kunden', { status: 'freigegeben', limit: AUSWAHL_LIMIT, offset: 0 });
  const kunde = kundeId && istUuid(kundeId) ? await apiGetOderNull<Kunde>(`/v1/kunden/${kundeId}`) : null;

  return (
    <>
      <Seitenkopf
        titel="Buchung anlegen"
        untertitel="Der Kern prüft Kunde, Fahrer, Führerscheinklasse, Kalibrierung und Überschneidungen. Erst danach ist die Buchung bestätigt."
        brotkrume={{ href: '/mieten', text: 'Mieten' }}
      />

      <section className="karte" aria-labelledby="schritt1-titel">
        <h2 id="schritt1-titel">
          <span className="schritt">1</span> Kunde
        </h2>
        {kunden.eintraege.length === 0 ? (
          <Leer>Es gibt noch keinen freigegebenen Kunden. Kunden müssen vor der ersten Buchung geprüft werden.</Leer>
        ) : (
          <form method="get" className="filterleiste">
            <div className="feld">
              <label htmlFor="kundeId">Freigegebener Kunde</label>
              <select id="kundeId" name="kundeId" defaultValue={kunde?.id ?? ''}>
                <option value="" disabled>
                  Kunde auswählen
                </option>
                {kunden.eintraege.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.firmenname}
                  </option>
                ))}
              </select>
            </div>
            <button className="knopf zweitrangig" type="submit">
              Weiter
            </button>
          </form>
        )}
      </section>

      {kunde ? <Schritt2 kunde={kunde} /> : null}
    </>
  );
}

async function Schritt2({ kunde }: { kunde: Kunde }) {
  const [fahrzeuge, fahrer] = await Promise.all([
    apiGet<Liste<Fahrzeug>>('/v1/fahrzeuge', { status: 'verfuegbar', limit: AUSWAHL_LIMIT, offset: 0 }),
    apiGet<Fahrer[]>(`/v1/kunden/${kunde.id}/fahrer`),
  ]);
  const freigegeben = fahrer.filter((f) => f.status === 'freigegeben');
  const start = new Date(Math.ceil(Date.now() / STUNDE) * STUNDE);
  const ende = new Date(start.getTime() + 24 * STUNDE);

  return (
    <section className="karte" aria-labelledby="schritt2-titel">
      <h2 id="schritt2-titel">
        <span className="schritt">2</span> Fahrzeug, Fahrer und Zeitraum für {kunde.firmenname}
      </h2>
      {kunde.status !== 'freigegeben' ? (
        <div className="hinweis warn">Dieser Kunde ist nicht freigegeben – der Kern wird die Buchung ablehnen.</div>
      ) : null}
      {fahrzeuge.eintraege.length === 0 ? (
        <Leer>Kein Fahrzeug im Status „verfügbar“.</Leer>
      ) : (
        <FormularRahmen
          aktion={erstelleMiete}
          sendenText="Buchung prüfen und anlegen"
          abbrechenHref="/mieten"
          // Ein Schlüssel je geöffnetem Formular: doppeltes Absenden legt keine zweite Buchung an (D-003).
          versteckt={{ kundeId: kunde.id, idempotencyKey: randomUUID() }}
        >
          <Auswahl
            name="fahrzeugId"
            label="Fahrzeug (verfügbar)"
            pflicht
            leer="Fahrzeug auswählen"
            optionen={fahrzeuge.eintraege.map((f) => ({
              wert: f.id,
              text: `${f.kennzeichen} · Klasse ${f.benoetigteFuehrerscheinklasse}${f.hatFahrtenschreiber ? ' · Ausland' : ''}`,
            }))}
            hinweis={fahrzeuge.gesamt > AUSWAHL_LIMIT ? `Nur die ersten ${AUSWAHL_LIMIT} von ${fahrzeuge.gesamt}.` : undefined}
          />
          <Auswahl
            name="fahrerId"
            label="Fahrer"
            leer={freigegeben.length === 0 ? 'Kein freigegebener Fahrer' : 'später festlegen'}
            optionen={freigegeben.map((f) => ({ wert: f.id, text: `${f.name} · Klasse ${f.fuehrerscheinKlasse}` }))}
            hinweis="Nur freigegebene Fahrer des Kunden (R-22)."
          />
          <Feld
            name="startGeplant"
            label="Start (Ortszeit)"
            typ="datetime-local"
            pflicht
            standard={isoZuBerlinLokal(start)}
          />
          <Feld name="endeGeplant" label="Ende (Ortszeit)" typ="datetime-local" pflicht standard={isoZuBerlinLokal(ende)} />
          <Auswahl
            name="temperaturprofil"
            label="Temperaturprofil"
            leer="Standard des Fahrzeugs"
            optionen={STANDARD_TEMPERATURPROFILE.map((p) => ({ wert: p.name, text: `${p.name} °C` }))}
          />
          <Haken
            name="auslandsfahrtGeplant"
            label="Auslandsfahrt geplant"
            hinweis="Nur mit Fahrzeugen mit Fahrtenschreiber (D-006)."
          />
        </FormularRahmen>
      )}
    </section>
  );
}
