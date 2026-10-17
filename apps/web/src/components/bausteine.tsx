import Link from 'next/link';
import type { ReactNode } from 'react';
import { statusLabel, statusTon } from '@rent2cool/oberflaeche/format';
import { seitenLink, type SuchParameter } from '@rent2cool/oberflaeche/seiten';

export function Marke({ zusatz }: { zusatz?: string }) {
  return (
    <Link href="/" className="marke">
      <span className="marke-zeichen" aria-hidden="true">
        ❄
      </span>
      <span>
        Rent2Cool
        {zusatz ? <small>{zusatz}</small> : null}
      </span>
    </Link>
  );
}

export function Plakette({ status, text }: { status: string; text?: string }) {
  return <span className={`plakette ${statusTon(status)}`}>{text ?? statusLabel(status)}</span>;
}

export function Seitenkopf({
  titel,
  untertitel,
  zurueck,
}: {
  titel: string;
  untertitel?: ReactNode;
  zurueck?: { href: string; text: string };
}) {
  return (
    <div className="seitenkopf">
      {zurueck ? (
        <div className="brotkrume">
          <Link href={zurueck.href}>← {zurueck.text}</Link>
        </div>
      ) : null}
      <h1>{titel}</h1>
      {untertitel ? <p>{untertitel}</p> : null}
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
  seite,
  limit,
}: {
  pfad: string;
  params: SuchParameter;
  gesamt: number;
  seite: number;
  limit: number;
}) {
  const seiten = Math.max(1, Math.ceil(gesamt / limit));
  if (seiten <= 1) return null;
  return (
    <nav className="blaettern" aria-label="Seiten">
      {seite > 1 ? <Link href={seitenLink(pfad, params, seite - 1)}>← Zurück</Link> : <span />}
      <span>
        Seite {seite} von {seiten}
      </span>
      {seite < seiten ? <Link href={seitenLink(pfad, params, seite + 1)}>Weiter →</Link> : <span />}
    </nav>
  );
}
