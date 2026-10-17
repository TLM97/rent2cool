import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  FAHRER_STATUS,
  istFahrerUebergangErlaubt,
  istKundeUebergangErlaubt,
  KUNDE_STATUS,
} from '@rent2cool/shared';
import {
  Leer,
  Meldungen,
  Plakette,
  Seitenkopf,
  StatusFormular,
} from '../../../../components/bausteine';
import { Verlauf } from '../../../../components/verlauf';
import { Feld, FormularRahmen, Haken } from '../../../../components/formular';
import { FahrerFelder } from '../../../../components/stammdaten';
import { apiGet, apiGetOderNull } from '../../../../lib/api';
import { formatDatum } from '../../../../lib/format';
import { naechsteStatus } from '../../../../lib/formular';
import { fuehrerscheinFrist } from '../../../../lib/fristen';
import { istUuid, type SuchParameter } from '../../../../lib/seiten';
import { holeSitzung } from '../../../../lib/sitzung';
import { hatRolle } from '../../../../lib/token';
import type { Fahrer, Kunde, KundeKonto } from '../../../../lib/typen';
import { aendereFahrerStatus, aendereKundeStatus, entferneKundenLogin } from '../../aktionen';
import { erstelleFahrer, ordneKundenLoginZu } from '../../formulare';

/** Kurzform der Kundenrollen für die Tabelle. */
const KUNDE_ROLLE_KURZ: Record<string, string> = {
  kunde_admin: 'Verwaltung',
  kunde_dispo: 'Disposition',
  kunde_qa: 'QA',
};

export const metadata: Metadata = { title: 'Kunde' };

export default async function KundeDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SuchParameter>;
}) {
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const suche = await searchParams;
  const kunde = await apiGetOderNull<Kunde>(`/v1/kunden/${id}`);
  if (!kunde) notFound();
  const [fahrer, sitzung] = await Promise.all([
    apiGet<Fahrer[]>(`/v1/kunden/${id}/fahrer`),
    holeSitzung(),
  ]);
  const darfAendern = hatRolle(sitzung?.rollen ?? [], 'ops', 'admin');
  const darfLogins = hatRolle(sitzung?.rollen ?? [], 'admin');
  const konten = darfAendern ? await apiGet<KundeKonto[]>(`/v1/kunden/${id}/konten`) : null;
  // Ohne erlaubten Folgestatus (z. B. Endzustand) kein leeres Statusfeld.
  const naechsteKunde = naechsteStatus(KUNDE_STATUS, kunde.status, istKundeUebergangErlaubt);
  const pfad = `/kunden/${id}`;

  return (
    <>
      <Seitenkopf
        titel={kunde.firmenname}
        untertitel={<Plakette status={kunde.status} />}
        brotkrume={{ href: '/kunden', text: 'Kunden & Fahrer' }}
        aktionen={
          darfAendern ? (
            <Link className="knopf zweitrangig" href={`${pfad}/bearbeiten`}>
              Stammdaten bearbeiten
            </Link>
          ) : null
        }
      />
      <Meldungen params={suche} />

      <section className="karte" aria-labelledby="stamm-titel">
        <h2 id="stamm-titel">Firmendaten</h2>
        <dl className="eigenschaften">
          <dt>USt-ID</dt>
          <dd className="mono">{kunde.ustId ?? '–'}</dd>
          <dt>Handelsregister</dt>
          <dd className="mono">{kunde.handelsregisternummer ?? '–'}</dd>
          <dt>Anschrift</dt>
          <dd>
            {[kunde.strasse, [kunde.plz, kunde.ort].filter(Boolean).join(' '), kunde.land]
              .filter(Boolean)
              .join(', ') || '–'}
          </dd>
          <dt>Nachweise an</dt>
          <dd>
            {kunde.nachweisEmail ?? (
              <span className="leise">keine E-Mail hinterlegt – Nachweise nur im Portal</span>
            )}
          </dd>
          <dt>angelegt</dt>
          <dd>{formatDatum(kunde.erstelltAm)}</dd>
          {darfAendern && naechsteKunde.length > 0 ? (
            <>
              <dt>Prüfung/Freigabe</dt>
              <dd>
                <StatusFormular
                  aktion={aendereKundeStatus}
                  id={kunde.id}
                  naechste={naechsteKunde}
                  label="Kundenstatus ändern"
                />
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="karte" aria-labelledby="fahrer-titel">
        <h2 id="fahrer-titel">Fahrer ({fahrer.length})</h2>
        {fahrer.length === 0 ? (
          <Leer>Für diesen Kunden sind keine Fahrer erfasst.</Leer>
        ) : (
          <div className="tabelle-huelle">
            <table>
              <caption>Fahrerlaubnis-Prüfung (R-22): Status, Klasse und Gültigkeit</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Klasse</th>
                  <th scope="col">Führerschein gültig bis</th>
                  <th scope="col">Frist</th>
                  {darfAendern ? <th scope="col">Prüfung</th> : null}
                </tr>
              </thead>
              <tbody>
                {fahrer.map((f) => {
                  const frist = fuehrerscheinFrist(f.fuehrerscheinGueltigBis);
                  return (
                    <tr key={f.id}>
                      <td>
                        {darfAendern ? (
                          <Link href={`${pfad}/fahrer/${f.id}`}>{f.name}</Link>
                        ) : (
                          f.name
                        )}
                      </td>
                      <td>
                        <Plakette status={f.status} />
                      </td>
                      <td>{f.fuehrerscheinKlasse}</td>
                      <td>{formatDatum(f.fuehrerscheinGueltigBis)}</td>
                      <td>
                        <span className={`plakette ${frist.ton}`}>{frist.text}</span>
                      </td>
                      {darfAendern ? (
                        <td>
                          <StatusFormular
                            aktion={aendereFahrerStatus}
                            id={f.id}
                            zurueck={pfad}
                            naechste={naechsteStatus(
                              FAHRER_STATUS,
                              f.status,
                              istFahrerUebergangErlaubt,
                            )}
                            label={`Status von ${f.name} ändern`}
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {konten ? (
        <section className="karte" aria-labelledby="logins-titel">
          <h2 id="logins-titel">Logins fürs Kundenportal</h2>
          <p className="leise">
            Diese Logins sehen ausschließlich Daten dieses Kunden (Mieten, Nachweise, Rechnungen,
            Alarme). Normalerweise verwaltet der Kunde sie selbst (Registrierung, Einladungen); hier
            nur für Ausnahmen. Die Benutzer-ID stammt aus der Anmeldung (Keycloak).
          </p>
          {konten.length === 0 ? (
            <Leer>Noch kein Login zugeordnet.</Leer>
          ) : (
            <div className="tabelle-huelle">
              <table aria-labelledby="logins-titel">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Rollen</th>
                    <th scope="col">Benutzer-ID</th>
                    <th scope="col">seit</th>
                    {darfLogins ? <th scope="col">Aktion</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {konten.map((k) => (
                    <tr key={k.kontoId}>
                      <td>
                        {k.bezeichnung ?? '–'}
                        {k.email ? <div className="leise">{k.email}</div> : null}
                      </td>
                      <td>{k.rollen.map((r) => KUNDE_ROLLE_KURZ[r]).join(', ')}</td>
                      <td className="mono">{k.kontoId}</td>
                      <td>{formatDatum(k.erstelltAm)}</td>
                      {darfLogins ? (
                        <td>
                          <form action={entferneKundenLogin}>
                            <input type="hidden" name="kundeId" value={kunde.id} />
                            <input type="hidden" name="kontoId" value={k.kontoId} />
                            <button type="submit" className="knopf zweitrangig klein">
                              Entfernen
                            </button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {darfLogins ? (
            <FormularRahmen
              aktion={ordneKundenLoginZu}
              sendenText="Login zuordnen"
              versteckt={{ kundeId: kunde.id }}
            >
              <Feld name="kontoId" label="Benutzer-ID (Keycloak)" pflicht />
              <Feld
                name="bezeichnung"
                label="Bezeichnung"
                hinweis="z. B. „Disposition, Frau Muster“"
              />
              <Haken name="rolle_kunde_admin" label="Verwaltung (Organisation, Einladungen)" />
              <Haken name="rolle_kunde_dispo" label="Disposition" standard />
              <Haken name="rolle_kunde_qa" label="Qualitätssicherung" standard />
            </FormularRahmen>
          ) : null}
        </section>
      ) : null}

      {darfAendern ? (
        <section className="karte" aria-labelledby="fahrer-neu-titel">
          <h2 id="fahrer-neu-titel">Fahrer anlegen</h2>
          <p className="leise">
            Fahrer gehören zum Kunden (D-004). Nur erfundene Testdaten, solange kein
            Datenschutzbeauftragter benannt ist (D-015).
          </p>
          <FormularRahmen
            aktion={erstelleFahrer}
            sendenText="Fahrer anlegen"
            versteckt={{ kundeId: kunde.id }}
          >
            <FahrerFelder />
          </FormularRahmen>
        </section>
      ) : null}
      <Verlauf
        entitaetIds={[kunde.id, ...fahrer.map((f) => f.id)]}
        typen={[
          'kunde',
          'kunde_status',
          'fahrer',
          'fahrer_status',
          'kunde_konto',
          'kunde_einladung',
        ]}
        bezeichnungen={Object.fromEntries(fahrer.map((f) => [f.id, `Fahrer ${f.name}`]))}
      />
    </>
  );
}
