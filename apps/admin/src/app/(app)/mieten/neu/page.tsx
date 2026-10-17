import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import type { Metadata } from 'next';
import { STANDARD_TEMPERATURPROFILE } from '@rent2cool/shared';
import { Blaettern, Leer, Seitenkopf } from '../../../../components/bausteine';
import { Auswahl, FormularRahmen } from '../../../../components/formular';
import { apiGet, apiGetOderNull } from '../../../../lib/api';
import { formatDatum, formatDatumZeit } from '../../../../lib/format';
import { berlinLokalZuIso, isoZuBerlinLokal } from '../../../../lib/formular';
import { blattAus, erster, istUuid, linkMit, type SuchParameter } from '../../../../lib/seiten';
import type {
  Fahrer,
  FahrzeugAkte,
  Kunde,
  Liste,
  VerfuegbaresFahrzeug,
} from '../../../../lib/typen';
import { erstelleMiete } from '../../formulare';

export const metadata: Metadata = { title: 'Buchung anlegen' };

const PFAD = '/mieten/neu';
const STUNDE = 3_600_000;
/** Treffer je Seite – gesucht wird serverseitig über alle Fahrzeuge (D-003). */
const SEITE = 20;

/**
 * Buchung in vier Schritten, ohne JavaScript im Browser (GET-Formulare):
 * 1. Kunde suchen, 2. Zeitraum/Fahrer/Anforderungen, 3. buchbare Fahrzeuge
 * im Zeitraum (Suche im Kern, dieselben Regeln wie die Buchung), 4. bestätigen.
 */
export default async function MieteNeu({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const params = await searchParams;
  const kundeId = erster(params.kundeId);
  const kunde =
    kundeId && istUuid(kundeId) ? await apiGetOderNull<Kunde>(`/v1/kunden/${kundeId}`) : null;

  return (
    <>
      <Seitenkopf
        titel="Buchung anlegen"
        untertitel="Kunde suchen, Zeitraum festlegen, aus den buchbaren Fahrzeugen wählen. Der Kern prüft beim Bestätigen alles noch einmal."
        brotkrume={{ href: '/mieten', text: 'Mieten' }}
      />
      {kunde ? <KundeGewaehlt kunde={kunde} /> : <KundeSuchen params={params} />}
      {kunde ? <ZeitraumUndFahrzeug kunde={kunde} params={params} /> : null}
    </>
  );
}

function Schritt({
  nr,
  titel,
  children,
}: {
  nr: number;
  titel: string;
  children: React.ReactNode;
}) {
  const id = `schritt${nr}-titel`;
  return (
    <section className="karte" aria-labelledby={id}>
      <h2 id={id}>
        <span className="schritt">{nr}</span> {titel}
      </h2>
      {children}
    </section>
  );
}

async function KundeSuchen({ params }: { params: SuchParameter }) {
  const suche = erster(params.kundeSuche)?.trim() ?? '';
  const treffer = suche
    ? await apiGet<Liste<Kunde>>('/v1/kunden', {
        status: 'freigegeben',
        suche,
        limit: 10,
        offset: 0,
      })
    : null;
  return (
    <Schritt nr={1} titel="Kunde">
      <form method="get" action={PFAD} className="filterleiste">
        <div className="feld">
          <label htmlFor="kundeSuche">Firmenname (freigegebene Kunden)</label>
          <input
            id="kundeSuche"
            name="kundeSuche"
            defaultValue={suche}
            placeholder="z. B. Nordlicht"
          />
        </div>
        <button className="knopf" type="submit">
          Kunde suchen
        </button>
      </form>
      {treffer === null ? null : treffer.eintraege.length === 0 ? (
        <Leer>
          Kein freigegebener Kunde gefunden. Kunden müssen vor der ersten Buchung geprüft sein.
        </Leer>
      ) : (
        <ul className="trefferliste" aria-label="Gefundene Kunden">
          {treffer.eintraege.map((k) => (
            <li key={k.id}>
              <Link href={linkMit(PFAD, {}, { kundeId: k.id })}>{k.firmenname}</Link>
              <span className="leise"> · {k.ort ?? '–'}</span>
            </li>
          ))}
          {treffer.gesamt > treffer.eintraege.length ? (
            <li className="leise">
              {treffer.gesamt - treffer.eintraege.length} weitere – bitte genauer suchen.
            </li>
          ) : null}
        </ul>
      )}
    </Schritt>
  );
}

function KundeGewaehlt({ kunde }: { kunde: Kunde }) {
  return (
    <Schritt nr={1} titel="Kunde">
      <p>
        <strong>{kunde.firmenname}</strong> <span className="leise">· {kunde.ort ?? '–'}</span>{' '}
        <Link href={PFAD}>anderen Kunden wählen</Link>
      </p>
      {kunde.status !== 'freigegeben' ? (
        <div className="hinweis warn">
          Dieser Kunde ist nicht freigegeben – der Kern wird die Buchung ablehnen.
        </div>
      ) : null}
    </Schritt>
  );
}

async function ZeitraumUndFahrzeug({ kunde, params }: { kunde: Kunde; params: SuchParameter }) {
  const fahrerListe = (await apiGet<Fahrer[]>(`/v1/kunden/${kunde.id}/fahrer`)).filter(
    (f) => f.status === 'freigegeben',
  );
  const naechsteStunde = new Date(Math.ceil(Date.now() / STUNDE) * STUNDE);
  const start = erster(params.start) ?? isoZuBerlinLokal(naechsteStunde);
  const ende =
    erster(params.ende) ?? isoZuBerlinLokal(new Date(naechsteStunde.getTime() + 24 * STUNDE));
  const fahrerId = erster(params.fahrerId) ?? '';
  const fahrer = fahrerListe.find((f) => f.id === fahrerId);
  const ausland = erster(params.ausland) === 'on';
  const suche = erster(params.suche) ?? '';
  const gesucht = erster(params.start) !== undefined;
  const vonIso = berlinLokalZuIso(start);
  const bisIso = berlinLokalZuIso(ende);
  const zeitraumOk = Boolean(
    vonIso && bisIso && new Date(bisIso).getTime() > new Date(vonIso).getTime(),
  );

  return (
    <>
      <Schritt nr={2} titel="Zeitraum, Fahrer und Anforderungen">
        <form method="get" action={PFAD} className="formular">
          <input type="hidden" name="kundeId" value={kunde.id} />
          <div className="felder">
            <div className="feld">
              <label htmlFor="start">Start (Ortszeit)</label>
              <input id="start" name="start" type="datetime-local" defaultValue={start} required />
            </div>
            <div className="feld">
              <label htmlFor="ende">Ende (Ortszeit)</label>
              <input id="ende" name="ende" type="datetime-local" defaultValue={ende} required />
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
              <p className="feldhinweis">Mit Fahrer: nur Fahrzeuge, die er fahren darf (R-22).</p>
            </div>
            <div className="feld">
              <label htmlFor="suche">Kennzeichen enthält</label>
              <input id="suche" name="suche" defaultValue={suche} placeholder="optional" />
            </div>
            <div className="feld haken breit">
              <label htmlFor="ausland">
                <input id="ausland" name="ausland" type="checkbox" defaultChecked={ausland} />{' '}
                Auslandsfahrt geplant
              </label>
              <p className="feldhinweis">Nur Fahrzeuge mit Fahrtenschreiber (D-006).</p>
            </div>
          </div>
          <div className="knopfreihe formular-aktionen">
            <button className="knopf" type="submit">
              Fahrzeuge suchen
            </button>
          </div>
        </form>
      </Schritt>

      {!gesucht ? null : !zeitraumOk ? (
        <div className="hinweis fehler" role="alert">
          Bitte einen gültigen Zeitraum angeben – das Ende muss nach dem Start liegen.
        </div>
      ) : (
        <Fahrzeugwahl
          params={params}
          kunde={kunde}
          vonIso={vonIso!}
          bisIso={bisIso!}
          start={start}
          ende={ende}
          fahrer={fahrer}
          ausland={ausland}
          suche={suche}
        />
      )}
    </>
  );
}

async function Fahrzeugwahl(p: {
  params: SuchParameter;
  kunde: Kunde;
  vonIso: string;
  bisIso: string;
  start: string;
  ende: string;
  fahrer: Fahrer | undefined;
  ausland: boolean;
  suche: string;
}) {
  const fahrzeugId = erster(p.params.fahrzeugId);
  const blatt = blattAus(p.params, SEITE);
  const treffer = await apiGet<Liste<VerfuegbaresFahrzeug>>('/v1/fahrzeuge/verfuegbar', {
    von: p.vonIso,
    bis: p.bisIso,
    suche: p.suche || undefined,
    fahrerKlasse: p.fahrer?.fuehrerscheinKlasse,
    fahrtenschreiber: p.ausland ? 'true' : undefined,
    limit: blatt.limit,
    offset: blatt.offset,
  });
  const gewaehlt =
    fahrzeugId && istUuid(fahrzeugId)
      ? await apiGetOderNull<FahrzeugAkte>(`/v1/fahrzeuge/${fahrzeugId}`)
      : null;
  const endeMs = new Date(p.bisIso).getTime();

  return (
    <>
      <Schritt
        nr={3}
        titel={`Buchbare Fahrzeuge ${formatDatumZeit(p.vonIso)} – ${formatDatumZeit(p.bisIso)}`}
      >
        {treffer.eintraege.length === 0 ? (
          <Leer>
            Kein Fahrzeug ist im Zeitraum buchbar
            {p.ausland ? ' (mit Fahrtenschreiber)' : ''}
            {p.fahrer ? ` für Klasse ${p.fahrer.fuehrerscheinKlasse}` : ''}
            {p.suche ? ` mit „${p.suche}“ im Kennzeichen` : ''}.
          </Leer>
        ) : (
          <div className="tabelle-huelle">
            <table>
              <caption>
                Verfügbar, gültig kalibriert, ohne Überschneidung – nach Kennzeichen
              </caption>
              <thead>
                <tr>
                  <th scope="col">Kennzeichen</th>
                  <th scope="col">Klasse</th>
                  <th scope="col">Fahrtenschreiber</th>
                  <th scope="col">Profil</th>
                  <th scope="col">kalibriert bis</th>
                  <th scope="col">
                    <span className="sr-nur">Auswahl</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {treffer.eintraege.map((f) => (
                  <tr key={f.id} aria-current={f.id === fahrzeugId ? 'true' : undefined}>
                    <td>
                      <strong>{f.kennzeichen}</strong>
                    </td>
                    <td>{f.benoetigteFuehrerscheinklasse}</td>
                    <td>{f.hatFahrtenschreiber ? 'ja' : 'nein'}</td>
                    <td>{f.standardTemperaturprofil ? `${f.standardTemperaturprofil} °C` : '–'}</td>
                    <td>
                      {formatDatum(f.kalibriertBis)}
                      {new Date(f.kalibriertBis).getTime() < endeMs ? (
                        <div>
                          <span className="plakette warn">läuft während der Miete ab</span>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {f.id === fahrzeugId ? (
                        <span className="plakette ok">gewählt</span>
                      ) : (
                        <Link
                          className="knopf zweitrangig klein"
                          href={linkMit(PFAD, p.params, { fahrzeugId: f.id })}
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
          limit={blatt.limit}
          offset={blatt.offset}
        />
      </Schritt>

      {gewaehlt ? (
        <Schritt nr={4} titel="Buchung bestätigen">
          <dl className="eigenschaften">
            <dt>Kunde</dt>
            <dd>{p.kunde.firmenname}</dd>
            <dt>Fahrzeug</dt>
            <dd>{gewaehlt.fahrzeug.kennzeichen}</dd>
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
            <dt>Auslandsfahrt</dt>
            <dd>{p.ausland ? 'ja' : 'nein'}</dd>
          </dl>
          <FormularRahmen
            aktion={erstelleMiete}
            sendenText="Buchung bestätigen"
            abbrechenHref={linkMit(PFAD, p.params, { fahrzeugId: undefined })}
            // Ein Schlüssel je geöffnetem Formular: doppeltes Absenden legt keine zweite Buchung an (D-003).
            versteckt={{
              kundeId: p.kunde.id,
              fahrzeugId: gewaehlt.fahrzeug.id,
              fahrerId: p.fahrer?.id ?? '',
              startGeplant: p.start,
              endeGeplant: p.ende,
              ...(p.ausland ? { auslandsfahrtGeplant: 'on' } : {}),
              idempotencyKey: randomUUID(),
            }}
          >
            <Auswahl
              name="temperaturprofil"
              label="Temperaturprofil"
              standard={gewaehlt.fahrzeug.standardTemperaturprofil ?? ''}
              leer="Standard des Fahrzeugs"
              optionen={STANDARD_TEMPERATURPROFILE.map((t) => ({
                wert: t.name,
                text: `${t.name} °C`,
              }))}
            />
          </FormularRahmen>
        </Schritt>
      ) : null}
    </>
  );
}
