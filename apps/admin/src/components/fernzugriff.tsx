/**
 * Digitaler Schlüssel und Fernzugriff (D-014): Befehlsprotokoll, Schlüssel
 * einer Miete und die Formulare dazu. Entscheiden und protokollieren tut der
 * Kern; hier wird nur angezeigt und angefragt.
 */
import { randomUUID } from 'node:crypto';
import { BEFEHL_NAME } from '@rent2cool/shared';
import {
  sendeFahrzeugBefehl,
  stelleSchluesselAus,
  widerrufeSchluessel,
} from '../app/(app)/formulare';
import { formatDatumZeit, statusLabel } from '../lib/format';
import { BEFEHL_OPTIONEN, befehlDetail, befehlVon, schluesselGueltigkeit } from '../lib/schluessel';
import type { Befehl, Fahrer, Liste, Schluessel } from '../lib/typen';
import { Leer, Plakette } from './bausteine';
import { Auswahl, Feld, FormularRahmen } from './formular';

/** Protokoll der Befehle, neueste zuerst – auch abgelehnte und fehlgeschlagene. */
export function BefehlTabelle({ befehle, titelId }: { befehle: Liste<Befehl>; titelId: string }) {
  if (befehle.eintraege.length === 0) return <Leer>Noch keine Befehle.</Leer>;
  return (
    <div className="tabelle-huelle">
      <table aria-labelledby={titelId}>
        <thead>
          <tr>
            <th scope="col">Zeit</th>
            <th scope="col">Befehl</th>
            <th scope="col">Ergebnis</th>
            <th scope="col">Von</th>
            <th scope="col">Grund / Details</th>
          </tr>
        </thead>
        <tbody>
          {befehle.eintraege.map((b) => (
            <tr key={b.id}>
              <td>{formatDatumZeit(b.angefordertAm)}</td>
              <td>{BEFEHL_NAME[b.befehl] ?? b.befehl}</td>
              <td>
                <Plakette status={b.status} />
              </td>
              <td>{befehlVon(b)}</td>
              <td>{befehlDetail(b) || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {befehle.gesamt > befehle.eintraege.length ? (
        <p className="leise">
          {befehle.eintraege.length} von {befehle.gesamt} Befehlen
        </p>
      ) : null}
    </div>
  );
}

/** Fahrzeugakte: Befehl durch den Betrieb (Grund ist Pflicht) und Protokoll. */
export function FernzugriffKarte({
  fahrzeugId,
  befehle,
  darfSenden,
}: {
  fahrzeugId: string;
  befehle: Liste<Befehl>;
  darfSenden: boolean;
}) {
  return (
    <section className="karte" aria-labelledby="fernzugriff-titel">
      <h2 id="fernzugriff-titel">Fernzugriff</h2>
      <p className="leise">
        Türen und Wegfahrsperre über den Kern – jeder Befehl wird protokolliert. Fahrer nutzen ihren
        digitalen Schlüssel in der App; hier handelt der Betrieb (z. B. Fahrer ausgesperrt,
        Diebstahl).
      </p>
      {darfSenden ? (
        <FormularRahmen
          aktion={sendeFahrzeugBefehl}
          sendenText="Befehl senden"
          versteckt={{ fahrzeugId, idempotencyKey: randomUUID() }}
        >
          <Auswahl name="befehl" label="Befehl" pflicht optionen={BEFEHL_OPTIONEN} />
          <Feld
            name="grund"
            label="Grund"
            pflicht
            hinweis="Steht im Audit Trail, z. B. „Fahrer ausgesperrt, Anruf 14:05“."
          />
        </FormularRahmen>
      ) : null}
      <h3 id="befehle-fahrzeug">Letzte Befehle</h3>
      <BefehlTabelle befehle={befehle} titelId="befehle-fahrzeug" />
    </section>
  );
}

/** Mietakte: Schlüssel der Fahrer, Ausstellen/Widerrufen und Befehle dieser Miete. */
export function SchluesselKarte({
  mieteId,
  mieteStatus,
  schluessel,
  fahrer,
  befehle,
  darfAendern,
}: {
  mieteId: string;
  mieteStatus: string;
  schluessel: Schluessel[];
  fahrer: Fahrer[];
  befehle: Liste<Befehl>;
  darfAendern: boolean;
}) {
  const aktive = schluessel.filter((s) => s.status === 'aktiv');
  const ausstellbar = mieteStatus === 'bestaetigt' || mieteStatus === 'aktiv';
  return (
    <section className="karte" aria-labelledby="schluessel-titel">
      <h2 id="schluessel-titel">Digitaler Schlüssel</h2>
      {schluessel.length === 0 ? (
        <Leer>Noch kein Schlüssel ausgestellt.</Leer>
      ) : (
        <div className="tabelle-huelle">
          <table aria-labelledby="schluessel-titel">
            <thead>
              <tr>
                <th scope="col">Fahrer</th>
                <th scope="col">Status</th>
                <th scope="col">gültig ab</th>
                <th scope="col">bis</th>
                <th scope="col">App-Konto</th>
              </tr>
            </thead>
            <tbody>
              {schluessel.map((s) => (
                <tr key={s.id}>
                  <td>{s.fahrerName}</td>
                  <td>
                    <Plakette status={s.status} />
                  </td>
                  <td>{formatDatumZeit(s.gueltigVon)}</td>
                  <td>{schluesselGueltigkeit(s)}</td>
                  <td>
                    {s.appKontoVerknuepft
                      ? 'verknüpft'
                      : 'fehlt – Fahrer kann den Schlüssel nicht nutzen'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {darfAendern && ausstellbar ? (
        <div className="zweispaltig">
          <div>
            <h3>Schlüssel ausstellen</h3>
            <FormularRahmen
              aktion={stelleSchluesselAus}
              sendenText="Schlüssel ausstellen"
              versteckt={{ mieteId }}
            >
              <Auswahl
                name="fahrerId"
                label="Fahrer des Kunden"
                pflicht
                leer="– bitte wählen –"
                optionen={fahrer.map((f) => ({
                  wert: f.id,
                  text: `${f.name} (${statusLabel(f.status)})`,
                }))}
                hinweis="Gilt ab einer Stunde vor Mietbeginn bis zum Ende der Miete."
              />
            </FormularRahmen>
          </div>
          {aktive.length > 0 ? (
            <div>
              <h3>Schlüssel widerrufen</h3>
              <FormularRahmen
                aktion={widerrufeSchluessel}
                sendenText="Widerrufen"
                versteckt={{ mieteId }}
              >
                <Auswahl
                  name="id"
                  label="Schlüssel"
                  pflicht
                  optionen={aktive.map((s) => ({ wert: s.id, text: s.fahrerName }))}
                />
                <Feld name="grund" label="Grund" pflicht hinweis="z. B. „Handy verloren“" />
              </FormularRahmen>
            </div>
          ) : null}
        </div>
      ) : null}

      <h3 id="befehle-miete">Befehle dieser Miete</h3>
      <BefehlTabelle befehle={befehle} titelId="befehle-miete" />
    </section>
  );
}
