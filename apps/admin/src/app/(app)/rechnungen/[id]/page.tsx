import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { istRechnungUebergangErlaubt, RECHNUNG_STATUS } from '@rent2cool/shared';
import { Meldungen, Plakette, Seitenkopf, StatusFormular } from '../../../../components/bausteine';
import { Verlauf } from '../../../../components/verlauf';
import { apiGetOderNull } from '../../../../lib/api';
import { formatDatum, formatDatumZeit, formatEuro, kurzeId } from '../../../../lib/format';
import { naechsteStatus } from '../../../../lib/formular';
import { istUuid, type SuchParameter } from '../../../../lib/seiten';
import { holeSitzung } from '../../../../lib/sitzung';
import { hatRolle } from '../../../../lib/token';
import type { Kunde, Rechnung } from '../../../../lib/typen';
import { aendereRechnungStatus } from '../../aktionen';

export const metadata: Metadata = { title: 'Rechnung' };

export default async function RechnungDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SuchParameter>;
}) {
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const suche = await searchParams;
  const r = await apiGetOderNull<Rechnung>(`/v1/rechnungen/${id}`);
  if (!r) notFound();
  const [kunde, sitzung] = await Promise.all([apiGetOderNull<Kunde>(`/v1/kunden/${r.kundeId}`), holeSitzung()]);
  const darfAendern = hatRolle(sitzung?.rollen ?? [], 'ops', 'admin');

  return (
    <>
      <Seitenkopf
        titel={`Rechnung ${r.rechnungsnummer}`}
        untertitel={<Plakette status={r.status} />}
        brotkrume={{ href: '/rechnungen', text: 'Rechnungen' }}
      />
      <Meldungen params={suche} />

      <section className="karte" aria-labelledby="rechnung-titel">
        <h2 id="rechnung-titel">Rechnungsdaten</h2>
        <dl className="eigenschaften">
          <dt>Kunde</dt>
          <dd>
            <Link href={`/kunden/${r.kundeId}`}>{kunde?.firmenname ?? kurzeId(r.kundeId)}</Link>
          </dd>
          <dt>Miete</dt>
          <dd>
            <Link className="mono" href={`/mieten/${r.mieteId}`}>
              {kurzeId(r.mieteId)}
            </Link>
          </dd>
          <dt>Leistungszeitraum</dt>
          <dd>
            {formatDatumZeit(r.zeitraumVon)} – {formatDatumZeit(r.zeitraumBis)}
          </dd>
          <dt>Netto</dt>
          <dd>{formatEuro(r.nettoCent, r.waehrung)}</dd>
          <dt>USt ({r.steuerSatz} %)</dt>
          <dd>{formatEuro(r.steuerCent, r.waehrung)}</dd>
          <dt>Brutto</dt>
          <dd>
            <strong>{formatEuro(r.bruttoCent, r.waehrung)}</strong>
          </dd>
          <dt>erstellt</dt>
          <dd>{formatDatum(r.erstelltAm)}</dd>
          <dt>gestellt</dt>
          <dd>{formatDatum(r.gestelltAm)}</dd>
          <dt>bezahlt</dt>
          <dd>{formatDatum(r.bezahltAm)}</dd>
          {darfAendern ? (
            <>
              <dt>Status</dt>
              <dd>
                <StatusFormular
                  aktion={aendereRechnungStatus}
                  id={r.id}
                  naechste={naechsteStatus(RECHNUNG_STATUS, r.status, istRechnungUebergangErlaubt)}
                  label="Rechnungsstatus ändern"
                />
              </dd>
            </>
          ) : null}
        </dl>
      </section>
      <Verlauf entitaetIds={[r.id]} typen={['rechnung', 'rechnung_status']} />
    </>
  );
}
