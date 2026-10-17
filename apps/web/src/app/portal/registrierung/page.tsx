import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Seitenkopf } from '../../../components/bausteine';
import { holeIch } from '../../../lib/api';
import { istIntern } from '../../../lib/portal';
import { RegistrierungsFormular } from './formular';

export const metadata: Metadata = { title: 'Unternehmen registrieren' };

/** Erster Schritt nach dem Anlegen des Kontos: Unternehmen registrieren (F-51). */
export default async function Registrierung() {
  const ich = await holeIch();
  if (ich.kunde) redirect('/portal');

  if (istIntern(ich.rollen)) {
    return (
      <>
        <Seitenkopf titel="Kein Kundenkonto" />
        <div className="hinweis info" role="status">
          Sie sind als Mitarbeiterin oder Mitarbeiter von Rent2Cool angemeldet. Bitte nutzen Sie die
          Admin-Oberfläche; interne Konten gehören zu keinem Kunden.
        </div>
      </>
    );
  }

  return (
    <>
      <Seitenkopf
        titel="Unternehmen registrieren"
        untertitel="Ihr Konto ist angelegt. Jetzt noch Ihr Unternehmen – wir prüfen die Angaben und geben es frei. Sie verwalten es danach selbst und laden Ihre Kolleginnen und Kollegen ein."
      />
      <section className="karte">
        <RegistrierungsFormular />
      </section>
      <p className="leise">
        Gehört Ihr Unternehmen schon zu Rent2Cool? Dann bitten Sie die Verwaltung dort um eine
        Einladung, statt es ein zweites Mal zu registrieren.
      </p>
    </>
  );
}
