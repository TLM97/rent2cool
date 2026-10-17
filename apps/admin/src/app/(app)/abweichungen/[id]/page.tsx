import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ABWEICHUNG_STATUS, istAbweichungUebergangErlaubt } from '@rent2cool/shared';
import { Meldungen, Plakette, Seitenkopf } from '../../../../components/bausteine';
import { Verlauf } from '../../../../components/verlauf';
import { Auswahl, Feld, FormularRahmen, Textfeld } from '../../../../components/formular';
import { apiGetOderNull } from '../../../../lib/api';
import { formatDatumZeit, kurzeId, statusLabel } from '../../../../lib/format';
import { naechsteStatus } from '../../../../lib/formular';
import { istUuid, type SuchParameter } from '../../../../lib/seiten';
import { holeSitzung } from '../../../../lib/sitzung';
import { hatRolle } from '../../../../lib/token';
import type { Abweichung } from '../../../../lib/typen';
import { bewerteAbweichung } from '../../formulare';
import { BEZUG, bezugLink } from '../bezug';

export const metadata: Metadata = { title: 'Abweichung' };

export default async function AbweichungDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SuchParameter>;
}) {
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const suche = await searchParams;
  const a = await apiGetOderNull<Abweichung>(`/v1/abweichungen/${id}`);
  if (!a) notFound();
  const sitzung = await holeSitzung();
  // Bewertung und Abschluss nur durch die QA-Rolle (Vier-Augen, R-02).
  const darfBewerten = hatRolle(sitzung?.rollen ?? [], 'qa_approver', 'admin');
  const naechste = naechsteStatus(ABWEICHUNG_STATUS, a.status, istAbweichungUebergangErlaubt);

  return (
    <>
      <Seitenkopf
        titel={`Abweichung ${kurzeId(a.id)}`}
        untertitel={<Plakette status={a.status} />}
        brotkrume={{ href: '/abweichungen', text: 'Abweichungen' }}
      />
      <Meldungen params={suche} />

      <section className="karte" aria-labelledby="abw-titel">
        <h2 id="abw-titel">Erfassung</h2>
        <dl className="eigenschaften">
          <dt>Bezug</dt>
          <dd>
            <Link href={bezugLink(a.bezugTyp, a.bezugId)}>
              {BEZUG[a.bezugTyp] ?? a.bezugTyp} <span className="mono">{kurzeId(a.bezugId)}</span>
            </Link>
          </dd>
          <dt>Beschreibung</dt>
          <dd className="mehrzeilig">{a.beschreibung}</dd>
          <dt>Schweregrad</dt>
          <dd>{a.schweregrad ?? '–'}</dd>
          <dt>erfasst</dt>
          <dd>{formatDatumZeit(a.erfasstAm)}</dd>
          <dt>Bewertung</dt>
          <dd className="mehrzeilig">{a.bewertung ?? '–'}</dd>
          <dt>Maßnahmen (CAPA)</dt>
          <dd className="mehrzeilig">{a.massnahmen ?? '–'}</dd>
          <dt>verantwortlich</dt>
          <dd>{a.verantwortlich ?? '–'}</dd>
          <dt>geschlossen</dt>
          <dd>{formatDatumZeit(a.geschlossenAm)}</dd>
        </dl>
      </section>

      {darfBewerten && naechste.length > 0 ? (
        <section className="karte" aria-labelledby="bewerten-titel">
          <h2 id="bewerten-titel">Bewerten und weiterführen</h2>
          <FormularRahmen
            aktion={bewerteAbweichung}
            sendenText="Speichern"
            versteckt={{ id: a.id }}
          >
            <Auswahl
              name="status"
              label="Neuer Status"
              pflicht
              standard={naechste[0]}
              optionen={naechste.map((s) => ({ wert: s, text: statusLabel(s) }))}
            />
            <Feld
              name="verantwortlich"
              label="Verantwortlich"
              standard={a.verantwortlich ?? sitzung?.name ?? ''}
            />
            <Textfeld name="bewertung" label="Bewertung" breit standard={a.bewertung ?? ''} />
            <Textfeld
              name="massnahmen"
              label="Maßnahmen (CAPA)"
              breit
              standard={a.massnahmen ?? ''}
            />
          </FormularRahmen>
        </section>
      ) : null}
      <Verlauf entitaetIds={[a.id]} typen={['abweichung', 'abweichung_status']} />
    </>
  );
}
