import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Leer, Seitenkopf } from '../../../../../components/bausteine';
import { FormularRahmen } from '../../../../../components/formular';
import { FahrzeugFelder } from '../../../../../components/stammdaten';
import { standorteFuerAuswahl } from '../../../../../lib/standorte';
import { apiGetOderNull } from '../../../../../lib/api';
import { istUuid } from '../../../../../lib/seiten';
import { holeSitzung } from '../../../../../lib/sitzung';
import { hatRolle } from '../../../../../lib/token';
import type { FahrzeugAkte } from '../../../../../lib/typen';
import { aendereFahrzeug } from '../../../formulare';

export const metadata: Metadata = { title: 'Fahrzeug bearbeiten' };

const GEBUCHT = new Set(['reserviert', 'vermietet', 'in_ruecknahme']);

export default async function FahrzeugBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const [akte, sitzung] = await Promise.all([
    apiGetOderNull<FahrzeugAkte>(`/v1/fahrzeuge/${id}`),
    holeSitzung(),
  ]);
  if (!akte) notFound();
  const f = akte.fahrzeug;
  const standorte = await standorteFuerAuswahl(f.standortId);
  const pfad = `/fahrzeuge/${f.id}`;

  return (
    <>
      <Seitenkopf
        titel={`${f.kennzeichen} bearbeiten`}
        untertitel="Stammdaten der Fahrzeugakte. Status, Kühlaufbau und Kalibrierung haben eigene Wege."
        brotkrume={{ href: pfad, text: f.kennzeichen }}
      />
      <section className="karte">
        {!hatRolle(sitzung?.rollen ?? [], 'ops', 'admin') ? (
          <Leer>Stammdaten ändern dürfen nur Ops und Admin.</Leer>
        ) : (
          <>
            {GEBUCHT.has(f.status) ? (
              <div className="hinweis warn">
                Das Fahrzeug ist gebucht oder unterwegs. Änderungen an Klasse oder Fahrtenschreiber
                prüfen bestehende Buchungen nicht erneut.
              </div>
            ) : null}
            <FormularRahmen
              aktion={aendereFahrzeug}
              sendenText="Änderungen speichern"
              abbrechenHref={pfad}
              versteckt={{ id: f.id, version: f.aktualisiertAm }}
            >
              <FahrzeugFelder werte={f} standorte={standorte} />
            </FormularRahmen>
          </>
        )}
      </section>
    </>
  );
}
