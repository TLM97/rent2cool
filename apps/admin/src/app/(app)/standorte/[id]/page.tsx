import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { oeffnungszeitenText } from '@rent2cool/shared';
import { Meldungen, Seitenkopf } from '../../../../components/bausteine';
import { Verlauf } from '../../../../components/verlauf';
import { apiGetOderNull } from '../../../../lib/api';
import { formatDatum } from '../../../../lib/format';
import { istUuid, type SuchParameter } from '../../../../lib/seiten';
import { holeSitzung } from '../../../../lib/sitzung';
import { hatRolle } from '../../../../lib/token';
import type { Standort } from '../../../../lib/typen';
import { setzeStandortAktiv } from '../../aktionen';
import { adresse } from '../anzeige';

export const metadata: Metadata = { title: 'Standort' };

export default async function StandortDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SuchParameter>;
}) {
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const suche = await searchParams;
  const [s, sitzung] = await Promise.all([
    apiGetOderNull<Standort>(`/v1/standorte/${id}`),
    holeSitzung(),
  ]);
  if (!s) notFound();
  const istAdmin = hatRolle(sitzung?.rollen ?? [], 'admin');

  return (
    <>
      <Seitenkopf
        titel={s.name}
        untertitel={
          <span className={`plakette ${s.aktiv ? 'ok' : 'neutral'}`}>
            {s.aktiv ? 'aktiv' : 'deaktiviert'}
          </span>
        }
        brotkrume={{ href: '/standorte', text: 'Standorte' }}
        aktionen={
          <>
            <Link className="knopf zweitrangig" href={`/fahrzeuge?standortId=${s.id}`}>
              Fahrzeuge am Standort
            </Link>
            {istAdmin ? (
              <Link className="knopf zweitrangig" href={`/standorte/${s.id}/bearbeiten`}>
                Bearbeiten
              </Link>
            ) : null}
          </>
        }
      />
      <Meldungen params={suche} />

      <div className="zweispaltig">
        <section className="karte" aria-labelledby="stamm-titel">
          <h2 id="stamm-titel">Standort</h2>
          <dl className="eigenschaften">
            <dt>Adresse</dt>
            <dd>{adresse(s)}</dd>
            <dt>Region</dt>
            <dd>{s.region ?? '–'}</dd>
            <dt>Geofence</dt>
            <dd>
              {s.geofenceLat !== null && s.geofenceLng !== null && s.geofenceRadiusM !== null
                ? `${s.geofenceLat.toLocaleString('de-DE')}, ${s.geofenceLng.toLocaleString('de-DE')} · Radius ${s.geofenceRadiusM.toLocaleString('de-DE')} m`
                : 'nicht festgelegt'}
            </dd>
            <dt>angelegt</dt>
            <dd>{formatDatum(s.erstelltAm)}</dd>
            {istAdmin ? (
              <>
                <dt>Status</dt>
                <dd>
                  <form action={setzeStandortAktiv} className="inline-form">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="version" value={s.aktualisiertAm} />
                    <input type="hidden" name="aktiv" value={s.aktiv ? 'false' : 'true'} />
                    <button className="knopf zweitrangig klein" type="submit">
                      {s.aktiv ? 'Deaktivieren' : 'Wieder aktivieren'}
                    </button>
                  </form>
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        <section className="karte" aria-labelledby="oz-titel">
          <h2 id="oz-titel">Öffnungszeiten (Ortszeit)</h2>
          <ul className="trefferliste">
            {oeffnungszeitenText(s.oeffnungsregeln).map((z) => (
              <li key={z}>{z}</li>
            ))}
          </ul>
        </section>
      </div>

      <Verlauf entitaetIds={[s.id]} typen={['standort']} />
    </>
  );
}
