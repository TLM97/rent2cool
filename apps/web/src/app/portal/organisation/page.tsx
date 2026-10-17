import type { Metadata } from 'next';
import { KUNDE_ROLLE_NAME, KUNDE_ROLLEN } from '@rent2cool/shared';
import { formatDatum } from '@rent2cool/oberflaeche/format';
import type { SuchParameter } from '@rent2cool/oberflaeche/seiten';
import { Leer, Meldungen, Plakette, Seitenkopf } from '../../../components/bausteine';
import { apiGet, mitKunde } from '../../../lib/api';
import { AUFGABE_KURZ, aufgaben, istVerwalter } from '../../../lib/portal';
import type { Organisation } from '../../../lib/typen';
import { aendereRollen, entferneMitglied, widerrufeEinladung } from '../aktionen';
import { EinladungsFormular, UnternehmenFormular } from './formulare';

export const metadata: Metadata = { title: 'Unternehmen' };

/** Das Unternehmen verwaltet sich selbst (F-51); Rent2Cool gibt nur frei. */
export default async function Unternehmen({
  searchParams,
}: {
  searchParams: Promise<SuchParameter>;
}) {
  const params = await searchParams;
  const ich = await mitKunde();
  const org = await apiGet<Organisation>('/v1/organisation');
  const verwalter = istVerwalter(ich.rollen);
  const k = org.kunde;

  return (
    <>
      <Seitenkopf
        titel="Unternehmen"
        untertitel={
          verwalter
            ? 'Unternehmensdaten, Personen und ihre Aufgaben – Sie verwalten das selbst.'
            : 'Nur die Verwaltung Ihres Unternehmens kann hier etwas ändern.'
        }
      />
      <Meldungen params={params} />

      <section className="karte" aria-labelledby="daten-titel">
        <div className="karte-kopf">
          <h2 id="daten-titel">Unternehmensdaten</h2>
          <Plakette status={k.status} />
        </div>
        {verwalter ? (
          <UnternehmenFormular kunde={k} version={org.version} freigegeben={org.freigegeben} />
        ) : (
          <dl className="daten">
            <dt>Firmenname</dt>
            <dd>{k.firmenname}</dd>
            <dt>Handelsregister</dt>
            <dd>{k.handelsregisternummer ?? '–'}</dd>
            <dt>USt-IdNr.</dt>
            <dd>{k.ustId ?? '–'}</dd>
            <dt>Anschrift</dt>
            <dd>
              {[k.strasse, [k.plz, k.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') ||
                '–'}
            </dd>
            <dt>Nachweise an</dt>
            <dd>{k.nachweisEmail ?? '–'}</dd>
          </dl>
        )}
      </section>

      <section className="karte" aria-labelledby="personen-titel">
        <h2 id="personen-titel">Personen</h2>
        <div className="tabelle-huelle">
          <table aria-labelledby="personen-titel">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Aufgaben</th>
                <th scope="col">Seit</th>
                {verwalter ? <th scope="col">Ändern</th> : null}
              </tr>
            </thead>
            <tbody>
              {org.mitglieder.map((m) => {
                const selbst = m.kontoId === ich.akteurId;
                return (
                  <tr key={m.kontoId}>
                    <td>
                      <strong>{m.bezeichnung ?? m.email ?? 'Person'}</strong>
                      {selbst ? <span className="leise"> (Sie)</span> : null}
                      {m.email && m.email !== m.bezeichnung ? (
                        <div className="leise">{m.email}</div>
                      ) : null}
                    </td>
                    <td>{aufgaben(m.rollen).join(', ')}</td>
                    <td>{formatDatum(m.erstelltAm)}</td>
                    {verwalter ? (
                      <td>
                        <form action={aendereRollen} className="zeilenformular">
                          <input type="hidden" name="kontoId" value={m.kontoId} />
                          <fieldset>
                            <legend className="unsichtbar">
                              Aufgaben von {m.bezeichnung ?? m.email ?? 'Person'}
                            </legend>
                            {KUNDE_ROLLEN.map((r) => (
                              <label key={r}>
                                <input
                                  type="checkbox"
                                  name={`rolle_${r}`}
                                  defaultChecked={m.rollen.includes(r)}
                                />{' '}
                                {AUFGABE_KURZ[r]}
                              </label>
                            ))}
                          </fieldset>
                          <button className="knopf zweitrangig klein" type="submit">
                            Speichern
                          </button>
                        </form>
                        <form action={entferneMitglied}>
                          <input type="hidden" name="kontoId" value={m.kontoId} />
                          <button className="knopf gefahr klein" type="submit">
                            {selbst ? 'Unternehmen verlassen' : 'Entfernen'}
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {verwalter ? (
        <>
          <section className="karte" aria-labelledby="einladungen-titel">
            <h2 id="einladungen-titel">Offene Einladungen</h2>
            {org.einladungen.length === 0 ? (
              <Leer>Keine offenen Einladungen.</Leer>
            ) : (
              <div className="tabelle-huelle">
                <table aria-labelledby="einladungen-titel">
                  <thead>
                    <tr>
                      <th scope="col">E-Mail</th>
                      <th scope="col">Aufgaben</th>
                      <th scope="col">Gültig bis</th>
                      <th scope="col">
                        <span className="unsichtbar">Aktion</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {org.einladungen.map((e) => (
                      <tr key={e.id}>
                        <td>{e.email}</td>
                        <td>{aufgaben(e.rollen).join(', ')}</td>
                        <td>{formatDatum(e.gueltigBis)}</td>
                        <td>
                          <form action={widerrufeEinladung}>
                            <input type="hidden" name="id" value={e.id} />
                            <button className="knopf zweitrangig klein" type="submit">
                              Widerrufen
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="karte" aria-labelledby="einladen-titel">
            <h2 id="einladen-titel">Person einladen</h2>
            <p className="leise">
              Die Person bekommt einen Link per E-Mail (7 Tage gültig) und meldet sich mit genau
              dieser Adresse an oder legt damit ein Konto an.
            </p>
            <EinladungsFormular
              rollen={KUNDE_ROLLEN.map((r) => ({ wert: r, text: KUNDE_ROLLE_NAME[r] }))}
            />
          </section>
        </>
      ) : null}
    </>
  );
}
