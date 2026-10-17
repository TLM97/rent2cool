import type { Metadata } from 'next';
import { Marke } from '../../components/bausteine';

export const metadata: Metadata = { title: 'Kein Zugriff' };

export default function KeinZugriff() {
  return (
    <main className="anmeldung">
      <div className="karte">
        <Marke />
        <h1>Kein Zugriff</h1>
        <p>
          Ihr Konto hat keine Berechtigung für die interne Oberfläche. Kunden und Fahrer nutzen das
          Kundenportal bzw. die App.
        </p>
        <form action="/api/abmelden" method="post">
          <button className="knopf zweitrangig" type="submit">
            Abmelden
          </button>
        </form>
      </div>
    </main>
  );
}
