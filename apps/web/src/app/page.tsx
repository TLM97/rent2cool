/**
 * Öffentliche Startseite (Platzhalter bis zur Website v1). GDP-Grenze (D-002):
 * Seiten der Website sprechen nicht mit der Kern-API – ein Test prüft das.
 */
import Link from 'next/link';
import { Marke } from '../components/bausteine';

export default function Startseite() {
  return (
    <div className="website">
      <header className="website-kopf">
        <Marke />
        <Link className="knopf zweitrangig klein" href="/portal">
          Kundenportal
        </Link>
      </header>
      <main id="inhalt" className="website-inhalt">
        <h1>Kühltransporter für die Pharmaindustrie</h1>
        <p className="einleitung">
          GDP-konform gemietet, kontaktlos übergeben – und nach jeder Miete ein lückenloser,
          elektronisch gesiegelter Temperaturnachweis.
        </p>
        <div className="knopfreihe">
          <Link className="knopf" href="/portal">
            Zum Kundenportal
          </Link>
        </div>
        <p className="leise">
          Platzhalter-Inhalt (D-015). Die Website v1 mit Leistungen, Anfrage und Rechtstexten ist
          eine eigene Aufgabe.
        </p>
      </main>
    </div>
  );
}
