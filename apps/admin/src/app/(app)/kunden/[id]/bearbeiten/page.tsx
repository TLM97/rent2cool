import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Leer, Seitenkopf } from '../../../../../components/bausteine';
import { FormularRahmen } from '../../../../../components/formular';
import { KundeFelder } from '../../../../../components/stammdaten';
import { apiGetOderNull } from '../../../../../lib/api';
import { istUuid } from '../../../../../lib/seiten';
import { holeSitzung } from '../../../../../lib/sitzung';
import { hatRolle } from '../../../../../lib/token';
import type { Kunde } from '../../../../../lib/typen';
import { aendereKunde } from '../../../formulare';

export const metadata: Metadata = { title: 'Kunde bearbeiten' };

export default async function KundeBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const [kunde, sitzung] = await Promise.all([
    apiGetOderNull<Kunde>(`/v1/kunden/${id}`),
    holeSitzung(),
  ]);
  if (!kunde) notFound();
  const pfad = `/kunden/${kunde.id}`;

  return (
    <>
      <Seitenkopf
        titel={`${kunde.firmenname} bearbeiten`}
        untertitel="Firmendaten und Anschrift. Der Prüfstatus wird auf der Kundenseite geändert."
        brotkrume={{ href: pfad, text: kunde.firmenname }}
      />
      <section className="karte">
        {!hatRolle(sitzung?.rollen ?? [], 'ops', 'admin') ? (
          <Leer>Stammdaten ändern dürfen nur Ops und Admin.</Leer>
        ) : (
          <>
            {kunde.status === 'freigegeben' ? (
              <div className="hinweis warn">
                Der Kunde ist freigegeben. Ändern sich Firma, Handelsregister oder USt-ID, bitte
                erneut prüfen – die Freigabe wird nicht automatisch zurückgesetzt.
              </div>
            ) : null}
            <FormularRahmen
              aktion={aendereKunde}
              sendenText="Änderungen speichern"
              abbrechenHref={pfad}
              versteckt={{ id: kunde.id, version: kunde.aktualisiertAm }}
            >
              <KundeFelder werte={kunde} />
            </FormularRahmen>
          </>
        )}
      </section>
    </>
  );
}
