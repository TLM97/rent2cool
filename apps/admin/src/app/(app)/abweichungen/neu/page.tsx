import type { Metadata } from 'next';
import { ABWEICHUNG_BEZUG } from '@rent2cool/shared';
import { Seitenkopf } from '../../../../components/bausteine';
import { Auswahl, Feld, FormularRahmen, Textfeld } from '../../../../components/formular';
import { erster, istUuid, type SuchParameter } from '../../../../lib/seiten';
import { erstelleAbweichung } from '../../formulare';
import { BEZUG, SCHWEREGRADE, bezugLink } from '../bezug';

export const metadata: Metadata = { title: 'Abweichung erfassen' };

export default async function AbweichungNeu({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const params = await searchParams;
  const typ = erster(params.bezugTyp);
  const bezugTyp = (ABWEICHUNG_BEZUG as readonly string[]).includes(typ ?? '') ? typ! : 'miete';
  const id = erster(params.bezugId);
  const bezugId = id && istUuid(id) ? id : '';
  const zurueck = bezugId ? bezugLink(bezugTyp, bezugId) : '/abweichungen';

  return (
    <>
      <Seitenkopf
        titel="Abweichung erfassen"
        untertitel="GDP-Abweichung (CAPA). Bewertung und Abschluss übernimmt die qualitätsverantwortliche Person."
        brotkrume={{ href: '/abweichungen', text: 'Abweichungen' }}
      />
      <section className="karte">
        <FormularRahmen aktion={erstelleAbweichung} sendenText="Abweichung erfassen" abbrechenHref={zurueck}>
          <Auswahl
            name="bezugTyp"
            label="Bezug"
            pflicht
            standard={bezugTyp}
            optionen={ABWEICHUNG_BEZUG.map((b) => ({ wert: b, text: BEZUG[b] ?? b }))}
          />
          <Feld name="bezugId" label="Bezugs-ID" pflicht standard={bezugId} hinweis="Wird beim Aufruf aus Miete, Fahrzeug oder Alarm vorbelegt." />
          <Textfeld name="beschreibung" label="Beschreibung" pflicht breit />
          <Auswahl
            name="schweregrad"
            label="Schweregrad"
            leer="noch offen"
            optionen={SCHWEREGRADE.map((s) => ({ wert: s, text: s }))}
          />
        </FormularRahmen>
      </section>
    </>
  );
}
