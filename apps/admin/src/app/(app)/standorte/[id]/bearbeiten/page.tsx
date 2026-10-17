import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Leer, Seitenkopf } from '../../../../../components/bausteine';
import { FormularRahmen } from '../../../../../components/formular';
import { StandortFelder } from '../../../../../components/stammdaten';
import { apiGetOderNull } from '../../../../../lib/api';
import { hatMehrFenster } from '../../../../../lib/oeffnungszeiten';
import { istUuid } from '../../../../../lib/seiten';
import { holeSitzung } from '../../../../../lib/sitzung';
import { hatRolle } from '../../../../../lib/token';
import type { Standort } from '../../../../../lib/typen';
import { aendereStandort } from '../../../formulare';

export const metadata: Metadata = { title: 'Standort bearbeiten' };

export default async function StandortBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const [s, sitzung] = await Promise.all([
    apiGetOderNull<Standort>(`/v1/standorte/${id}`),
    holeSitzung(),
  ]);
  if (!s) notFound();
  const pfad = `/standorte/${s.id}`;

  return (
    <>
      <Seitenkopf titel={`${s.name} bearbeiten`} brotkrume={{ href: pfad, text: s.name }} />
      <section className="karte">
        {!hatRolle(sitzung?.rollen ?? [], 'admin') ? (
          <Leer>Standorte pflegen darf nur die Rolle Admin.</Leer>
        ) : hatMehrFenster(s.oeffnungsregeln) ? (
          <Leer>
            Dieser Standort hat mehr Zeitfenster je Tag, als das Formular darstellen kann. Bitte
            über die Schnittstelle pflegen, damit nichts verloren geht.
          </Leer>
        ) : (
          <FormularRahmen
            aktion={aendereStandort}
            sendenText="Änderungen speichern"
            abbrechenHref={pfad}
            versteckt={{ id: s.id, version: s.aktualisiertAm }}
          >
            <StandortFelder werte={s} />
          </FormularRahmen>
        )}
      </section>
    </>
  );
}
