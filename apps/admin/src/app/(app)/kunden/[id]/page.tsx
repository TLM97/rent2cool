import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  FAHRER_STATUS,
  istFahrerUebergangErlaubt,
  istKundeUebergangErlaubt,
  KUNDE_STATUS,
} from '@rent2cool/shared';
import { Leer, Meldungen, Plakette, Seitenkopf, StatusFormular } from '../../../../components/bausteine';
import { Verlauf } from '../../../../components/verlauf';
import { FormularRahmen } from '../../../../components/formular';
import { FahrerFelder } from '../../../../components/stammdaten';
import { apiGet, apiGetOderNull } from '../../../../lib/api';
import { formatDatum } from '../../../../lib/format';
import { naechsteStatus } from '../../../../lib/formular';
import { fuehrerscheinFrist } from '../../../../lib/fristen';
import { istUuid, type SuchParameter } from '../../../../lib/seiten';
import { holeSitzung } from '../../../../lib/sitzung';
import { hatRolle } from '../../../../lib/token';
import type { Fahrer, Kunde } from '../../../../lib/typen';
import { aendereFahrerStatus, aendereKundeStatus } from '../../aktionen';
import { erstelleFahrer } from '../../formulare';

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
  const [fahrer, sitzung] = await Promise.all([apiGet<Fahrer[]>(`/v1/kunden/${id}/fahrer`), holeSitzung()]);
  const darfAendern = hatRolle(sitzung?.rollen ?? [], 'ops', 'admin');
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
          <dt>angelegt</dt>
          <dd>{formatDatum(kunde.erstelltAm)}</dd>
          {darfAendern ? (
            <>
              <dt>Prüfung/Freigabe</dt>
              <dd>
                <StatusFormular
                  aktion={aendereKundeStatus}
                  id={kunde.id}
                  naechste={naechsteStatus(KUNDE_STATUS, kunde.status, istKundeUebergangErlaubt)}
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
                        {darfAendern ? <Link href={`${pfad}/fahrer/${f.id}`}>{f.name}</Link> : f.name}
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
                            naechste={naechsteStatus(FAHRER_STATUS, f.status, istFahrerUebergangErlaubt)}
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

      {darfAendern ? (
        <section className="karte" aria-labelledby="fahrer-neu-titel">
          <h2 id="fahrer-neu-titel">Fahrer anlegen</h2>
          <p className="leise">
            Fahrer gehören zum Kunden (D-004). Nur erfundene Testdaten, solange kein Datenschutzbeauftragter
            benannt ist (D-015).
          </p>
          <FormularRahmen aktion={erstelleFahrer} sendenText="Fahrer anlegen" versteckt={{ kundeId: kunde.id }}>
            <FahrerFelder />
          </FormularRahmen>
        </section>
      ) : null}
      <Verlauf entitaetId={kunde.id} typen={['kunde', 'kunde_status']} />
    </>
  );
}
