import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { istGeoeffnet, oeffnungszeitenText, STANDARD_TEMPERATURPROFILE } from '@rent2cool/shared';
import { formatDatum, formatDatumZeit } from '@rent2cool/oberflaeche/format';
import { blattAus, erster, linkMit, type SuchParameter } from '@rent2cool/oberflaeche/seiten';
import { Blaettern, Leer, Seitenkopf } from '../../../components/bausteine';
import { apiGet, mitKunde } from '../../../lib/api';
import { zeitraumAus } from '../../../lib/buchung';
import { hat } from '../../../lib/portal';
import type {
  Fahrer,
  Liste,
  Organisation,
  Standort,
  VerfuegbaresFahrzeug,
} from '../../../lib/typen';
import { BuchungsFormular } from './formular';

export const metadata: Metadata = { title: 'Buchen' };

const PFAD = '/portal/buchen';
/** Treffer je Seite – gesucht wird im Kern über alle Fahrzeuge (D-003). */
const SEITE = 10;

/**
 * Buchen in drei Schritten (GET-Formulare, ohne JavaScript im Browser):
 * Zeitraum und Anforderungen → buchbare Fahrzeuge → bestätigen. Die Suche
 * nutzt dieselben Regeln wie die Buchung; beim Bestätigen prüft der Kern
 * alles noch einmal.
 */
export default async function Buchen({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const params = await searchParams;
  const ich = await mitKunde();
  if (!hat(ich.rollen, 'kunde_dispo')) {
    return (
      <>
        <Seitenkopf titel="Buchen" />
        <div className="hinweis info">Buchen darf in Ihrem Unternehmen die Disposition.</div>
      </>
    );
  }
  const [org, alleFahrer, standorte] = await Promise.all([
    apiGet<Organisation>('/v1/organisation'),
    apiGet<Fahrer[]>(`/v1/kunden/${ich.kunde.id}/fahrer`),
    apiGet<Liste<Standort>>('/v1/standorte', { aktiv: 'true', limit: 200, offset: 0 }),
  ]);
  if (!org.freigegeben) {
    return (
      <>
        <Seitenkopf titel="Buchen" />
        <div className="hinweis warn" role="status">
          Buchen ist möglich, sobald wir Ihr Unternehmen freigegeben haben.
        </div>
      </>
    );
  }

  const fahrerListe = alleFahrer.filter((f) => f.status === 'freigegeben');
  const zeitraum = zeitraumAus(params);
  const fahrerId = erster(params.fahrerId) ?? '';
  const fahrer = fahrerListe.find((f) => f.id === fahrerId);
  // Ein einziger Standort ist automatisch gewählt.
  const standortId =
    erster(params.standortId) ??
    (standorte.eintraege.length === 1 ? standorte.eintraege[0]!.id : '');
  const standort = standorte.eintraege.find((s) => s.id === standortId);
  const ausland = erster(params.ausland) === 'on';
  const gesucht = erster(params.start) !== undefined;

  return (
    <>
      <Seitenkopf
        titel="Kühltransporter buchen"
        untertitel="Zeitraum wählen, buchbares Fahrzeug aussuchen, bestätigen. Angezeigt werden nur Fahrzeuge, die im Zeitraum frei, gültig kalibriert und für Ihre Anforderungen geeignet sind."
      />
      <section className="karte" aria-labelledby="s1">
        <h2 id="s1">1 · Zeitraum und Anforderungen</h2>
        <form method="get" action={PFAD} className="formular">
          <div className="felder">
            <div className="feld">
              <label htmlFor="start">Abholung (Ortszeit)</label>
              <input id="start" name="start" type="datetime-local" defaultValue={zeitraum.start} />
            </div>
            <div className="feld">
              <label htmlFor="ende">Rückgabe (Ortszeit)</label>
              <input id="ende" name="ende" type="datetime-local" defaultValue={zeitraum.ende} />
            </div>
            <div className="feld">
              <label htmlFor="fahrerId">Fahrer</label>
              <select id="fahrerId" name="fahrerId" defaultValue={fahrerId}>
                <option value="">später festlegen</option>
                {fahrerListe.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} · Klasse {f.fuehrerscheinKlasse}
                  </option>
                ))}
              </select>
              <p className="feldhinweis">
                Mit Fahrer: nur Fahrzeuge, die er fahren darf.{' '}
                <Link href="/portal/fahrer">Fahrer verwalten</Link>
              </p>
            </div>
            <div className="feld">
              <label htmlFor="standortId">Abholung und Rückgabe</label>
              <select id="standortId" name="standortId" defaultValue={standortId}>
                <option value="">alle Standorte</option>
                {standorte.eintraege.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="feld haken breit">
              <label htmlFor="ausland">
                <input id="ausland" name="ausland" type="checkbox" defaultChecked={ausland} /> Fahrt
                ins Ausland geplant
              </label>
              <p className="feldhinweis">Dann nur Fahrzeuge mit Fahrtenschreiber.</p>
            </div>
          </div>
          <div className="knopfreihe">
            <button className="knopf" type="submit">
              Fahrzeuge suchen
            </button>
          </div>
        </form>
      </section>

      {!gesucht ? null : !zeitraum.ok ? (
        <div className="hinweis fehler" role="alert">
          Bitte einen gültigen Zeitraum angeben – die Rückgabe muss nach der Abholung liegen.
        </div>
      ) : (
        <Fahrzeugwahl
          params={params}
          vonIso={zeitraum.vonIso!}
          bisIso={zeitraum.bisIso!}
          start={zeitraum.start}
          ende={zeitraum.ende}
          fahrer={fahrer}
          standort={standort}
          ausland={ausland}
        />
      )}
    </>
  );
}

async function Fahrzeugwahl(p: {
  params: SuchParameter;
  vonIso: string;
  bisIso: string;
  start: string;
  ende: string;
  fahrer: Fahrer | undefined;
  standort: Standort | undefined;
  ausland: boolean;
}) {
  const blatt = blattAus(p.params, SEITE);
  const treffer = await apiGet<Liste<VerfuegbaresFahrzeug>>('/v1/fahrzeuge/verfuegbar', {
    von: p.vonIso,
    bis: p.bisIso,
    fahrerKlasse: p.fahrer?.fuehrerscheinKlasse,
    fahrtenschreiber: p.ausland ? 'true' : undefined,
    standortId: p.standort?.id,
    limit: blatt.limit,
    offset: blatt.offset,
  });
  // Gewählt wird aus den aktuellen Treffern: ist das Fahrzeug nicht mehr
  // dabei, ist es inzwischen vergeben – dann gibt es nichts zu bestätigen.
  const fahrzeugId = erster(p.params.fahrzeugId);
  const gewaehlt = treffer.eintraege.find((f) => f.id === fahrzeugId);
  const endeMs = new Date(p.bisIso).getTime();
  const ausserhalb = p.standort?.oeffnungsregeln
    ? [
        istGeoeffnet(p.standort.oeffnungsregeln, new Date(p.vonIso)) ? null : 'Abholung',
        istGeoeffnet(p.standort.oeffnungsregeln, new Date(p.bisIso)) ? null : 'Rückgabe',
      ].filter((x): x is string => x !== null)
    : [];

  return (
    <>
      <section className="karte" aria-labelledby="s2">
        <h2 id="s2">
          2 · Buchbare Fahrzeuge {formatDatumZeit(p.vonIso)} – {formatDatumZeit(p.bisIso)}
        </h2>
        {treffer.eintraege.length === 0 ? (
          <Leer>
            Im Zeitraum ist kein passendes Fahrzeug frei
            {p.ausland ? ' (mit Fahrtenschreiber)' : ''}
            {p.fahrer ? ` für Klasse ${p.fahrer.fuehrerscheinKlasse}` : ''}. Bitte einen anderen
            Zeitraum oder Standort wählen.
          </Leer>
        ) : (
          <div className="tabelle-huelle">
            <table aria-labelledby="s2">
              <thead>
                <tr>
                  <th scope="col">Kennzeichen</th>
                  <th scope="col">Führerschein</th>
                  <th scope="col">Fahrtenschreiber</th>
                  <th scope="col">Temperatur</th>
                  <th scope="col">kalibriert bis</th>
                  <th scope="col">
                    <span className="unsichtbar">Auswahl</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {treffer.eintraege.map((f) => (
                  <tr key={f.id} aria-current={f.id === fahrzeugId ? 'true' : undefined}>
                    <td>
                      <strong>{f.kennzeichen}</strong>
                    </td>
                    <td>Klasse {f.benoetigteFuehrerscheinklasse}</td>
                    <td>{f.hatFahrtenschreiber ? 'ja' : 'nein'}</td>
                    <td>{f.standardTemperaturprofil ? `${f.standardTemperaturprofil} °C` : '–'}</td>
                    <td>
                      {formatDatum(f.kalibriertBis)}
                      {new Date(f.kalibriertBis).getTime() < endeMs ? (
                        <div className="leise">läuft während der Miete ab</div>
                      ) : null}
                    </td>
                    <td>
                      {f.id === fahrzeugId ? (
                        <span className="plakette ok">gewählt</span>
                      ) : (
                        <Link
                          className="knopf zweitrangig klein"
                          href={`${linkMit(PFAD, p.params, { fahrzeugId: f.id })}#s3`}
                        >
                          {`${f.kennzeichen} wählen`}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Blaettern
          pfad={PFAD}
          params={p.params}
          gesamt={treffer.gesamt}
          seite={blatt.seite}
          limit={blatt.limit}
        />
      </section>

      {fahrzeugId && !gewaehlt ? (
        <div className="hinweis warn" role="status">
          Das gewählte Fahrzeug ist auf dieser Seite nicht (mehr) buchbar. Bitte erneut wählen.
        </div>
      ) : null}

      {gewaehlt ? (
        <section className="karte" aria-labelledby="s3-titel" id="s3">
          <h2 id="s3-titel">3 · Buchung bestätigen</h2>
          <dl className="daten">
            <dt>Fahrzeug</dt>
            <dd>{gewaehlt.kennzeichen}</dd>
            <dt>Zeitraum</dt>
            <dd>
              {formatDatumZeit(p.vonIso)} – {formatDatumZeit(p.bisIso)}
            </dd>
            <dt>Fahrer</dt>
            <dd>
              {p.fahrer
                ? `${p.fahrer.name} · Klasse ${p.fahrer.fuehrerscheinKlasse}`
                : 'später festlegen'}
            </dd>
            <dt>Abholung und Rückgabe</dt>
            <dd>{p.standort?.name ?? 'Heimatstandort des Fahrzeugs'}</dd>
            <dt>Auslandsfahrt</dt>
            <dd>{p.ausland ? 'ja' : 'nein'}</dd>
          </dl>
          {p.standort?.oeffnungsregeln && ausserhalb.length > 0 ? (
            <div className="hinweis warn">
              {ausserhalb.join(' und ')} außerhalb der Öffnungszeiten von {p.standort.name}:
              <ul>
                {oeffnungszeitenText(p.standort.oeffnungsregeln).map((z) => (
                  <li key={z}>{z}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <BuchungsFormular
            versteckt={{
              fahrzeugId: gewaehlt.id,
              fahrerId: p.fahrer?.id ?? '',
              standortId: p.standort?.id ?? '',
              start: p.start,
              ende: p.ende,
              ...(p.ausland ? { ausland: 'on' } : {}),
              // Ein Schlüssel je geöffnetem Formular: doppeltes Absenden bucht nicht doppelt (D-003).
              idempotencyKey: randomUUID(),
            }}
            standardProfil={gewaehlt.standardTemperaturprofil ?? ''}
            profile={STANDARD_TEMPERATURPROFILE.map((t) => ({
              wert: t.name,
              text: `${t.name} °C`,
            }))}
          />
        </section>
      ) : null}
    </>
  );
}
