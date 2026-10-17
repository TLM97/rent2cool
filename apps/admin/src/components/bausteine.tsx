import Link from 'next/link';
import type { ReactNode } from 'react';
import { statusLabel, statusTon } from '../lib/format';
import { seitenLink, type SuchParameter } from '../lib/seiten';

export function Marke() {
  return (
    <div className="marke">
      <span className="marke-zeichen" aria-hidden="true">
        ❄
      </span>
      <span>
        Rent2Cool
        <small>Admin</small>
      </span>
    </div>
  );
}

export function Plakette({ status }: { status: string }) {
  return <span className={`plakette ${statusTon(status)}`}>{statusLabel(status)}</span>;
}

export function Seitenkopf({
  titel,
  untertitel,
  brotkrume,
  aktionen,
}: {
  titel: string;
  untertitel?: ReactNode;
  brotkrume?: { href: string; text: string };
  aktionen?: ReactNode;
}) {
  return (
    <div className="seitenkopf">
      <div>
        {brotkrume ? (
          <div className="brotkrume">
            <Link href={brotkrume.href}>← {brotkrume.text}</Link>
          </div>
        ) : null}
        <h1>{titel}</h1>
        {untertitel ? <p>{untertitel}</p> : null}
      </div>
      {aktionen ? <div className="knopfreihe">{aktionen}</div> : null}
    </div>
  );
}

/** Erfolg-/Fehlermeldungen, die Server Actions per Query-Parameter zurückgeben. */
export function Meldungen({ params }: { params: SuchParameter }) {
  const fehler = typeof params.fehler === 'string' ? params.fehler : undefined;
  const erfolg = typeof params.erfolg === 'string' ? params.erfolg : undefined;
  return (
    <>
      {fehler ? (
        <div className="hinweis fehler" role="alert">
          {fehler}
        </div>
      ) : null}
      {erfolg ? (
        <div className="hinweis erfolg" role="status">
          {erfolg}
        </div>
      ) : null}
    </>
  );
}

export function Leer({ children }: { children: ReactNode }) {
  return <div className="leer">{children}</div>;
}

export function Blaettern({
  pfad,
  params,
  gesamt,
  limit,
  offset,
}: {
  pfad: string;
  params: SuchParameter;
  gesamt: number;
  limit: number;
  offset: number;
}) {
  const seite = Math.floor(offset / limit) + 1;
  const seiten = Math.max(1, Math.ceil(gesamt / limit));
  const von = gesamt === 0 ? 0 : offset + 1;
  const bis = Math.min(offset + limit, gesamt);
  return (
    <nav className="blaettern" aria-label="Seiten">
      <span>
        {von}–{bis} von {gesamt}
      </span>
      <span className="knopfreihe">
        {seite > 1 ? (
          <Link className="knopf zweitrangig klein" href={seitenLink(pfad, params, seite - 1)}>
            ← Zurück
          </Link>
        ) : null}
        {seite < seiten ? (
          <Link className="knopf zweitrangig klein" href={seitenLink(pfad, params, seite + 1)}>
            Weiter →
          </Link>
        ) : null}
      </span>
    </nav>
  );
}

export function StatusFilter({
  pfad,
  aktuell,
  optionen,
}: {
  pfad: string;
  aktuell?: string;
  optionen: readonly string[];
}) {
  return (
    <form className="filterleiste" action={pfad} method="get">
      <div className="feld">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={aktuell ?? ''}>
          <option value="">alle</option>
          {optionen.map((o) => (
            <option key={o} value={o}>
              {statusLabel(o)}
            </option>
          ))}
        </select>
      </div>
      <button className="knopf zweitrangig" type="submit">
        Filtern
      </button>
    </form>
  );
}

/**
 * Kleines Formular für einen Statuswechsel. Bietet nur die laut Statusmodell
 * erlaubten Folgestatus an; der Kern prüft trotzdem erneut.
 */
export function StatusFormular({
  aktion,
  id,
  naechste,
  zurueck,
  label = 'Status ändern',
}: {
  aktion: (fd: FormData) => Promise<void>;
  id: string;
  naechste: readonly string[];
  zurueck?: string;
  label?: string;
}) {
  if (naechste.length === 0) return null;
  const feldId = `status-${id}`;
  return (
    <form action={aktion} className="inline-form">
      <input type="hidden" name="id" value={id} />
      {zurueck ? <input type="hidden" name="zurueck" value={zurueck} /> : null}
      <label htmlFor={feldId} className="sr-nur">
        {label}
      </label>
      <select id={feldId} name="status" defaultValue={naechste[0]}>
        {naechste.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </select>
      <button className="knopf klein" type="submit">
        Übernehmen
      </button>
    </form>
  );
}
