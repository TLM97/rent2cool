/**
 * Archiv der Temperaturnachweise einer Miete (zentrales Verkaufsargument):
 * jede Version mit PDF/JSON, Bewertung und Echtheitsprüfung.
 */
import { fordereNachweisAn, pruefeNachweis } from '../app/(app)/aktionen';
import { formatDatumZeit } from '../lib/format';
import { AUSLOESER_TEXT, SIEGEL_TEXT } from '../lib/nachweis';
import type { NachweisArchivEintrag } from '../lib/typen';
import { Leer, Plakette } from './bausteine';

export function NachweisArchivKarte({
  mieteId,
  mieteStatus,
  eintraege,
  darfAnfordern,
}: {
  mieteId: string;
  mieteStatus: string;
  eintraege: NachweisArchivEintrag[];
  darfAnfordern: boolean;
}) {
  const beendet = mieteStatus === 'beendet' || mieteStatus === 'abgerechnet';
  return (
    <section className="karte" aria-labelledby="archiv-titel">
      <h2 id="archiv-titel">Temperaturnachweis für den Kunden</h2>
      <p className="leise">
        Entsteht automatisch nach Mietende (nach einer Karenzzeit für nachgelieferte Messwerte), als
        PDF und JSON, signiert und unveränderbar archiviert. Neue Erkenntnisse ergeben eine neue
        Version.
      </p>
      {eintraege.length === 0 ? (
        <Leer>
          {beendet
            ? 'Noch kein Nachweis – der Berichtsdienst erzeugt ihn in Kürze.'
            : 'Der Nachweis entsteht automatisch nach Mietende.'}
        </Leer>
      ) : (
        <div className="tabelle-huelle">
          <table aria-labelledby="archiv-titel">
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">Erzeugt</th>
                <th scope="col">Bewertung</th>
                <th scope="col" className="zahl">
                  Verletzungen / Lücken
                </th>
                <th scope="col">Dateien</th>
                <th scope="col">An den Kunden</th>
                <th scope="col">Echtheit</th>
              </tr>
            </thead>
            <tbody>
              {eintraege.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.version}</strong>
                    <div className="leise">{AUSLOESER_TEXT[e.ausloeser] ?? e.ausloeser}</div>
                  </td>
                  <td>{formatDatumZeit(e.erzeugtAm)}</td>
                  <td>
                    <Plakette status={e.bewertung} />
                  </td>
                  <td className="zahl">
                    {e.anzahlGrenzverletzungen} / {e.anzahlLuecken}
                  </td>
                  <td>
                    <a href={e.pdfUrl} target="_blank" rel="noreferrer">
                      PDF
                    </a>{' '}
                    ·{' '}
                    <a href={e.jsonUrl} target="_blank" rel="noreferrer">
                      JSON
                    </a>
                    <div className="leise mono" title={`SHA-256 PDF ${e.pdfSha256}`}>
                      {e.pdfSha256.slice(0, 12)}…
                    </div>
                    {e.siegelArt ? (
                      <div title={e.siegelAussteller ?? undefined}>
                        <span
                          className={`plakette ${e.siegelArt === 'testsiegel' ? 'warn' : 'ok'}`}
                        >
                          {SIEGEL_TEXT[e.siegelArt]}
                        </span>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {e.zustellung ? (
                      <>
                        <Plakette status={e.zustellung.status} />
                        <div className="leise">
                          {e.zustellung.empfaenger ?? e.zustellung.grund ?? ''}
                        </div>
                      </>
                    ) : (
                      <span className="leise">ausstehend</span>
                    )}
                  </td>
                  <td>
                    <form action={pruefeNachweis}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="mieteId" value={mieteId} />
                      <input type="hidden" name="version" value={String(e.version)} />
                      <button type="submit" className="knopf zweitrangig klein">
                        Prüfen
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {darfAnfordern && beendet ? (
        <form action={fordereNachweisAn} className="knopfreihe">
          <input type="hidden" name="mieteId" value={mieteId} />
          <button type="submit" className="knopf zweitrangig">
            Neue Version erzeugen
          </button>
        </form>
      ) : null}
    </section>
  );
}
