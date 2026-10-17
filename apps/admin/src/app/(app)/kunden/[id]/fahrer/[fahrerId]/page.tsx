import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Leer, Plakette, Seitenkopf } from '../../../../../../components/bausteine';
import { Verlauf } from '../../../../../../components/verlauf';
import { FormularRahmen } from '../../../../../../components/formular';
import { FahrerFelder } from '../../../../../../components/stammdaten';
import { apiGetOderNull } from '../../../../../../lib/api';
import { istUuid } from '../../../../../../lib/seiten';
import { holeSitzung } from '../../../../../../lib/sitzung';
import { hatRolle } from '../../../../../../lib/token';
import type { Fahrer, Kunde } from '../../../../../../lib/typen';
import { aendereFahrer } from '../../../../formulare';

export const metadata: Metadata = { title: 'Fahrer bearbeiten' };

export default async function FahrerBearbeiten({
  params,
}: {
  params: Promise<{ id: string; fahrerId: string }>;
}) {
  const { id, fahrerId } = await params;
  if (!istUuid(id) || !istUuid(fahrerId)) notFound();
  const [kunde, fahrer, sitzung] = await Promise.all([
    apiGetOderNull<Kunde>(`/v1/kunden/${id}`),
    apiGetOderNull<Fahrer>(`/v1/fahrer/${fahrerId}`),
    holeSitzung(),
  ]);
  if (!kunde || !fahrer || fahrer.kundeId !== kunde.id) notFound();
  const pfad = `/kunden/${kunde.id}`;

  return (
    <>
      <Seitenkopf
        titel={`${fahrer.name} bearbeiten`}
        untertitel={
          <>
            Fahrer von {kunde.firmenname} · <Plakette status={fahrer.status} />
          </>
        }
        brotkrume={{ href: pfad, text: kunde.firmenname }}
      />
      <section className="karte">
        {!hatRolle(sitzung?.rollen ?? [], 'ops', 'admin') ? (
          <Leer>Stammdaten ändern dürfen nur Ops und Admin.</Leer>
        ) : (
          <>
            {fahrer.status === 'freigegeben' ? (
              <div className="hinweis warn">
                Der Fahrer ist freigegeben. Bei neuen Führerscheindaten bitte den Führerschein
                erneut prüfen – die Freigabe wird nicht automatisch zurückgesetzt (R-22).
              </div>
            ) : null}
            <FormularRahmen
              aktion={aendereFahrer}
              sendenText="Änderungen speichern"
              abbrechenHref={pfad}
              versteckt={{ id: fahrer.id, kundeId: kunde.id, version: fahrer.aktualisiertAm }}
            >
              <FahrerFelder werte={fahrer} />
            </FormularRahmen>
          </>
        )}
      </section>
      <Verlauf entitaetIds={[fahrer.id]} typen={['fahrer', 'fahrer_status']} />
    </>
  );
}
