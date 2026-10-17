/**
 * Übergabe- und Rückgabeprotokoll in der Mietakte (D-014). Normalerweise
 * erstellt der Fahrer es in der App; hier sieht der Betrieb Fotos, Checkliste
 * und Schäden – und kann im Ausnahmeprozess mit Personal selbst protokollieren.
 */
import { randomUUID } from 'node:crypto';
import {
  CHECKLISTE,
  FOTO_PERSPEKTIVE_NAME,
  FOTO_PERSPEKTIVEN,
  FOTO_TYPEN,
  PROTOKOLL_ART_NAME,
  PROTOKOLL_ARTEN,
  type ProtokollArt,
} from '@rent2cool/shared';
import {
  legeProtokollAn,
  ladeProtokollFotoHoch,
  schliesseProtokollAb,
  speichereProtokoll,
} from '../app/(app)/formulare';
import { formatDatumZeit } from '../lib/format';
import { feldName, schaedenAlsText } from '../lib/protokoll';
import type { Protokoll } from '../lib/typen';
import { Leer, Plakette } from './bausteine';
import { Auswahl, Dateifeld, Feld, FormularRahmen, Textfeld } from './formular';

/** In welchem Mietstatus darf welches Protokoll angelegt werden (wie im Kern). */
const ANLEGBAR: Record<ProtokollArt, readonly string[]> = {
  uebergabe: ['bestaetigt', 'aktiv'],
  rueckgabe: ['aktiv', 'beendet'],
};

const JA_NEIN = [
  { wert: 'ja', text: 'ja' },
  { wert: 'nein', text: 'nein' },
];

export function ProtokollKarte({
  mieteId,
  mieteStatus,
  protokolle,
  darfAendern,
}: {
  mieteId: string;
  mieteStatus: string;
  protokolle: Protokoll[];
  darfAendern: boolean;
}) {
  return (
    <section className="karte" aria-labelledby="protokoll-titel">
      <h2 id="protokoll-titel">Übergabe- und Rückgabeprotokoll</h2>
      <p className="leise">
        Foto-Check, Checkliste und Kilometerstand – normalerweise vom Fahrer in der App.
        Abgeschlossene Protokolle sind unveränderbar.
      </p>
      {PROTOKOLL_ARTEN.map((art) => {
        const p = protokolle.find((x) => x.art === art);
        return (
          <div key={art} className="protokoll">
            <h3 id={`protokoll-${art}`}>
              {PROTOKOLL_ART_NAME[art]}{' '}
              {p ? (
                p.status === 'abgeschlossen' ? (
                  <Plakette status="abgeschlossen" />
                ) : (
                  <span className="plakette info">offen</span>
                )
              ) : null}
            </h3>
            {!p ? (
              darfAendern && ANLEGBAR[art].includes(mieteStatus) ? (
                <FormularRahmen
                  aktion={legeProtokollAn}
                  sendenText={`${PROTOKOLL_ART_NAME[art]}protokoll anlegen`}
                  versteckt={{ mieteId, art }}
                >
                  <p className="leise breit">
                    Nur im Ausnahmeprozess mit Personal – sonst erstellt es der Fahrer.
                  </p>
                </FormularRahmen>
              ) : (
                <Leer>Noch kein Protokoll.</Leer>
              )
            ) : (
              <ProtokollInhalt
                mieteId={mieteId}
                p={p}
                bearbeitbar={darfAendern && p.status === 'offen'}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}

function ProtokollInhalt({
  mieteId,
  p,
  bearbeitbar,
}: {
  mieteId: string;
  p: Protokoll;
  bearbeitbar: boolean;
}) {
  const art = p.art;
  const kontext = { mieteId, protokollId: p.id, art };
  return (
    <>
      <dl className="eigenschaften">
        <dt>Kilometerstand</dt>
        <dd>{p.kmStand !== null ? `${p.kmStand.toLocaleString('de-DE')} km` : '–'}</dd>
        <dt>begonnen</dt>
        <dd>{formatDatumZeit(p.erstelltAm)}</dd>
        {p.abgeschlossenAm ? (
          <>
            <dt>abgeschlossen</dt>
            <dd>{formatDatumZeit(p.abgeschlossenAm)}</dd>
          </>
        ) : null}
      </dl>

      {p.fehlt.length > 0 ? (
        <div className="hinweis warn">
          Für den Abschluss fehlt noch:
          <ul>
            {p.fehlt.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="tabelle-huelle">
        <table aria-label={`Checkliste ${PROTOKOLL_ART_NAME[art]}`}>
          <thead>
            <tr>
              <th scope="col">Prüfpunkt</th>
              <th scope="col">Ergebnis</th>
              <th scope="col">Bemerkung</th>
            </tr>
          </thead>
          <tbody>
            {CHECKLISTE[art].map((c) => {
              const a = p.checkliste?.[c.id];
              return (
                <tr key={c.id}>
                  <td>{c.text}</td>
                  <td>
                    {a ? (
                      <span className={`plakette ${a.ok ? 'ok' : 'warn'}`}>
                        {a.ok ? 'ja' : 'nein'}
                      </span>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td>{a?.bemerkung || '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {p.schaeden && p.schaeden.length > 0 ? (
        <>
          <h4>Schäden</h4>
          <ul>
            {p.schaeden.map((s, i) => (
              <li key={i}>{s.beschreibung}</li>
            ))}
          </ul>
        </>
      ) : null}

      <h4>Fotos</h4>
      {p.fotos.length === 0 ? (
        <Leer>Noch keine Fotos.</Leer>
      ) : (
        <ul className="fotos">
          {p.fotos.map((f) => (
            <li key={f.id}>
              <figure>
                {f.url ? (
                  <a href={f.url} target="_blank" rel="noreferrer">
                    {/* Signierter Link in den Objektspeicher, kein Next-Bildoptimierer. */}
                    <img src={f.url} alt={FOTO_PERSPEKTIVE_NAME[f.perspektive]} loading="lazy" />
                  </a>
                ) : (
                  <div className="foto-platzhalter" aria-hidden="true" />
                )}
                <figcaption>
                  {FOTO_PERSPEKTIVE_NAME[f.perspektive]}
                  {f.status !== 'hochgeladen' ? (
                    <>
                      {' '}
                      <Plakette status={f.status} />
                    </>
                  ) : null}
                  {f.verwurfGrund ? <div className="leise">{f.verwurfGrund}</div> : null}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}

      {bearbeitbar ? (
        <div className="zweispaltig">
          <div>
            <h4>Foto hinzufügen</h4>
            <FormularRahmen
              aktion={ladeProtokollFotoHoch}
              sendenText="Foto hochladen"
              versteckt={{ ...kontext, idempotencyKey: randomUUID() }}
            >
              <Auswahl
                name={feldName(art, 'perspektive')}
                label="Ansicht"
                pflicht
                optionen={FOTO_PERSPEKTIVEN.map((v) => ({
                  wert: v,
                  text: FOTO_PERSPEKTIVE_NAME[v],
                }))}
              />
              <Dateifeld
                name={feldName(art, 'foto')}
                label="Foto"
                pflicht
                annehmen={FOTO_TYPEN.join(',')}
                hinweis="JPEG, PNG oder WebP, höchstens 15 MB"
              />
            </FormularRahmen>
            <h4>Abschließen</h4>
            <FormularRahmen
              aktion={schliesseProtokollAb}
              sendenText={`${PROTOKOLL_ART_NAME[art]}protokoll abschließen`}
              versteckt={kontext}
            >
              <p className="leise breit">Danach ist das Protokoll unveränderbar.</p>
            </FormularRahmen>
          </div>
          <div>
            <h4>Angaben</h4>
            <FormularRahmen
              aktion={speichereProtokoll}
              sendenText="Angaben speichern"
              versteckt={{
                ...kontext,
                version: p.version,
                // Unveränderte Schäden nicht neu senden (behält Fotoverweise aus der App).
                schaedenVorher: schaedenAlsText(p.schaeden),
              }}
            >
              <Feld
                name={feldName(art, 'kmStand')}
                label="Kilometerstand"
                typ="number"
                schritt="1"
                min="0"
                standard={p.kmStand?.toString() ?? ''}
              />
              {CHECKLISTE[art].map((c) => (
                <div key={c.id} className="feld breit checkpunkt">
                  <Auswahl
                    name={feldName(art, `check_${c.id}`)}
                    label={c.text}
                    leer="–"
                    optionen={JA_NEIN}
                    standard={p.checkliste?.[c.id] ? (p.checkliste[c.id]!.ok ? 'ja' : 'nein') : ''}
                  />
                  <Feld
                    name={feldName(art, `bemerkung_${c.id}`)}
                    label="Bemerkung"
                    standard={p.checkliste?.[c.id]?.bemerkung ?? ''}
                  />
                </div>
              ))}
              <Textfeld
                name={feldName(art, 'schaeden')}
                label="Schäden (eine Zeile je Schaden)"
                breit
                standard={schaedenAlsText(p.schaeden)}
              />
            </FormularRahmen>
          </div>
        </div>
      ) : null}
    </>
  );
}
