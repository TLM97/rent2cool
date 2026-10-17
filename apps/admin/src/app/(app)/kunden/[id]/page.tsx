import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Leer, Plakette, Seitenkopf } from '../../../../components/bausteine';
import { apiGet, apiGetOderNull } from '../../../../lib/api';
import { formatDatum } from '../../../../lib/format';
import { fuehrerscheinFrist } from '../../../../lib/fristen';
import { istUuid } from '../../../../lib/seiten';
import type { Fahrer, Kunde } from '../../../../lib/typen';

export const metadata: Metadata = { title: 'Kunde' };

export default async function KundeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const kunde = await apiGetOderNull<Kunde>(`/v1/kunden/${id}`);
  if (!kunde) notFound();
  const fahrer = await apiGet<Fahrer[]>(`/v1/kunden/${id}/fahrer`);

  return (
    <>
      <Seitenkopf
        titel={kunde.firmenname}
        untertitel={<Plakette status={kunde.status} />}
        brotkrume={{ href: '/kunden', text: 'Kunden & Fahrer' }}
      />
      <section className="karte" aria-labelledby="stamm-titel">
        <h2 id="stamm-titel">Firmendaten</h2>
        <dl className="eigenschaften">
          <dt>USt-ID</dt>
          <dd className="mono">{kunde.ustId ?? '–'}</dd>
          <dt>Handelsregister</dt>
          <dd className="mono">{kunde.handelsregisternummer ?? '–'}</dd>
          <dt>Ort</dt>
          <dd>{kunde.ort ?? '–'}</dd>
          <dt>angelegt</dt>
          <dd>{formatDatum(kunde.erstelltAm)}</dd>
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
                </tr>
              </thead>
              <tbody>
                {fahrer.map((f) => {
                  const frist = fuehrerscheinFrist(f.fuehrerscheinGueltigBis);
                  return (
                    <tr key={f.id}>
                      <td>{f.name}</td>
                      <td>
                        <Plakette status={f.status} />
                      </td>
                      <td>{f.fuehrerscheinKlasse}</td>
                      <td>{formatDatum(f.fuehrerscheinGueltigBis)}</td>
                      <td>
                        <span className={`plakette ${frist.ton}`}>{frist.text}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
