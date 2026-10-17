/**
 * Verlauf eines Datensatzes aus dem Audit Trail (wer, wann, was, alt → neu).
 * Nur lesend; erscheint nicht, wenn die Rolle den Audit Trail nicht sehen darf.
 */
import { apiGetOderNull } from '../lib/api';
import { formatDatumZeit } from '../lib/format';
import type { Liste } from '../lib/typen';
import { beschreibe, type AuditEintrag } from '../lib/verlauf';
import { Leer } from './bausteine';

const LIMIT = 50;

export async function Verlauf({ entitaetId, typen }: { entitaetId: string; typen: readonly string[] }) {
  const daten = await apiGetOderNull<Liste<AuditEintrag>>('/v1/audit', {
    entitaetId,
    typ: typen.join(','),
    limit: LIMIT,
    offset: 0,
  });
  if (!daten) return null;
  const titelId = `verlauf-${entitaetId}`;

  return (
    <section className="karte" aria-labelledby={titelId}>
      <h2 id={titelId}>Verlauf</h2>
      {daten.eintraege.length === 0 ? (
        <Leer>Noch keine protokollierten Änderungen.</Leer>
      ) : (
        <div className="tabelle-huelle">
          <table>
            <caption>
              Audit Trail, neueste zuerst
              {daten.gesamt > LIMIT ? ` (die letzten ${LIMIT} von ${daten.gesamt})` : ''}
            </caption>
            <thead>
              <tr>
                <th scope="col">Zeit</th>
                <th scope="col">Wer</th>
                <th scope="col">Vorgang</th>
                <th scope="col">Änderung</th>
              </tr>
            </thead>
            <tbody>
              {daten.eintraege.map((e) => {
                const b = beschreibe(e);
                return (
                  <tr key={e.id}>
                    <td>{formatDatumZeit(e.zeit)}</td>
                    <td title={e.akteurId}>
                      {b.wer}
                      {e.akteurRolle ? <div className="leise">{e.akteurRolle.replaceAll(',', ', ')}</div> : null}
                    </td>
                    <td>{b.vorgang}</td>
                    <td>
                      {b.aenderungen.length === 0 ? (
                        <span className="leise">–</span>
                      ) : (
                        <ul className="aenderungen">
                          {b.aenderungen.map((a) => (
                            <li key={a.feld}>
                              <span className="leise">{a.feld}:</span> {a.alt} → <strong>{a.neu}</strong>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
