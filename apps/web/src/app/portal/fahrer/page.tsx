import type { Metadata } from 'next';
import { formatDatum } from '@rent2cool/oberflaeche/format';
import type { SuchParameter } from '@rent2cool/oberflaeche/seiten';
import { Leer, Meldungen, Plakette, Seitenkopf } from '../../../components/bausteine';
import { apiGet, mitKunde } from '../../../lib/api';
import { hat } from '../../../lib/portal';
import type { Fahrer } from '../../../lib/typen';
import { FahrerFormular } from './formular';

export const metadata: Metadata = { title: 'Fahrer' };

/**
 * Fahrer des Unternehmens. Anlegen darf die Disposition; Identität und
 * Führerschein prüft Rent2Cool, erst danach ist ein Fahrer buchbar (R-22).
 */
export default async function FahrerSeite({
  searchParams,
}: {
  searchParams: Promise<SuchParameter>;
}) {
  const params = await searchParams;
  const ich = await mitKunde();
  const fahrer = await apiGet<Fahrer[]>(`/v1/kunden/${ich.kunde.id}/fahrer`);
  const darfAnlegen = hat(ich.rollen, 'kunde_dispo', 'kunde_admin');

  return (
    <>
      <Seitenkopf
        titel="Fahrer"
        untertitel="Wer Ihre gemieteten Fahrzeuge fährt. Rent2Cool prüft Identität und Führerschein, bevor ein Fahrer gebucht werden kann."
      />
      <Meldungen params={params} />
      <section className="karte" aria-labelledby="fahrer-titel">
        <h2 id="fahrer-titel">Ihre Fahrer</h2>
        {fahrer.length === 0 ? (
          <Leer>Noch keine Fahrer angelegt.</Leer>
        ) : (
          <div className="tabelle-huelle">
            <table aria-labelledby="fahrer-titel">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Klasse</th>
                  <th scope="col">Führerschein gültig bis</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {fahrer.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td>{f.fuehrerscheinKlasse}</td>
                    <td>{formatDatum(f.fuehrerscheinGueltigBis)}</td>
                    <td>
                      <Plakette status={f.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {darfAnlegen ? (
        <section className="karte" aria-labelledby="neu-titel">
          <h2 id="neu-titel">Fahrer anlegen</h2>
          <FahrerFormular />
        </section>
      ) : null}
    </>
  );
}
