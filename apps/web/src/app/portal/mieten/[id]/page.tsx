import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatDatumZeit } from '@rent2cool/oberflaeche/format';
import { istUuid } from '@rent2cool/oberflaeche/seiten';
import { Leer, Plakette, Seitenkopf } from '../../../../components/bausteine';
import { apiGetOderNull, mitKunde } from '../../../../lib/api';
import { SIEGEL_TEXT } from '../../../../lib/portal';
import type { Miete, NachweisArchivEintrag } from '../../../../lib/typen';

export const metadata: Metadata = { title: 'Miete' };

export default async function MieteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await mitKunde();
  if (!istUuid(id)) notFound();
  // Fremde Mieten sind für den Kern „nicht gefunden“ (D-020).
  const [m, nachweise] = await Promise.all([
    apiGetOderNull<Miete>(`/v1/mieten/${id}`),
    apiGetOderNull<NachweisArchivEintrag[]>(`/v1/mieten/${id}/temperaturnachweise`),
  ]);
  if (!m) notFound();
  // Kennzeichen aus der Fahrzeugakte (Kunden sehen sie für Fahrzeuge ihrer Mieten).
  const akte = await apiGetOderNull<{ fahrzeug: { kennzeichen: string } }>(
    `/v1/fahrzeuge/${m.fahrzeugId}`,
  );
  const beendet = m.status === 'beendet' || m.status === 'abgerechnet';

  return (
    <>
      <Seitenkopf
        titel={`Miete ${akte?.fahrzeug.kennzeichen ?? ''}`.trim()}
        zurueck={{ href: '/portal/mieten', text: 'Alle Mieten' }}
      />
      <section className="karte">
        <dl className="daten">
          <dt>Status</dt>
          <dd>
            <Plakette status={m.status} />
          </dd>
          <dt>Geplant</dt>
          <dd>
            {formatDatumZeit(m.startGeplant)} – {formatDatumZeit(m.endeGeplant)}
          </dd>
          <dt>Tatsächlich</dt>
          <dd>
            {m.startIst ? formatDatumZeit(m.startIst) : 'noch nicht begonnen'}
            {m.endeIst ? ` – ${formatDatumZeit(m.endeIst)}` : ''}
          </dd>
          <dt>Temperaturprofil</dt>
          <dd>{m.temperaturprofil ?? '–'}</dd>
        </dl>
      </section>

      <section className="karte" aria-labelledby="nachweis-titel">
        <h2 id="nachweis-titel">Temperaturnachweis</h2>
        <p className="leise">
          Entsteht automatisch nach Mietende, als PDF mit elektronischem Siegel und als JSON
          (maschinenlesbar). Jede Version ist unveränderbar archiviert; der Fingerabdruck (SHA-256)
          belegt die Echtheit.
        </p>
        {!nachweise || nachweise.length === 0 ? (
          <Leer>
            {beendet
              ? 'Der Nachweis wird gerade erzeugt und kommt in Kürze – auch per E-Mail.'
              : 'Der Nachweis entsteht automatisch nach Mietende.'}
          </Leer>
        ) : (
          <div className="tabelle-huelle">
            <table aria-labelledby="nachweis-titel">
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Erzeugt</th>
                  <th scope="col">Bewertung</th>
                  <th scope="col">Verletzungen / Lücken</th>
                  <th scope="col">Dateien</th>
                </tr>
              </thead>
              <tbody>
                {nachweise.map((n) => (
                  <tr key={n.id}>
                    <td>{n.version}</td>
                    <td>{formatDatumZeit(n.erzeugtAm)}</td>
                    <td>
                      <Plakette status={n.bewertung} />
                    </td>
                    <td>
                      {n.anzahlGrenzverletzungen} / {n.anzahlLuecken}
                    </td>
                    <td>
                      <a href={n.pdfUrl} target="_blank" rel="noreferrer">
                        PDF
                      </a>{' '}
                      ·{' '}
                      <a href={n.jsonUrl} target="_blank" rel="noreferrer">
                        JSON
                      </a>
                      {n.siegelArt ? <div className="leise">{SIEGEL_TEXT[n.siegelArt]}</div> : null}
                      <div className="leise mono" title={`SHA-256 ${n.pdfSha256}`}>
                        SHA-256 {n.pdfSha256.slice(0, 16)}…
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
