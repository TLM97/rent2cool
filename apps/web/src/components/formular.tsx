'use client';

/**
 * Formular-Baukasten des Portals (wie in der Admin-Oberfläche): Server Action
 * + useActionState, Fehler am Feld, Eingaben bleiben bei Fehlern erhalten,
 * Absendeknopf während des Sendens gesperrt (kein Doppelabsenden).
 */
import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import type { FormularZustand } from '@rent2cool/oberflaeche/formular';

type Aktion = (zustand: FormularZustand, fd: FormData) => Promise<FormularZustand>;

const Zustand = createContext<FormularZustand>({});

function SendenKnopf({ text }: { text: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="knopf" type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? 'Wird gesendet …' : text}
    </button>
  );
}

export function FormularRahmen({
  aktion,
  sendenText,
  versteckt,
  children,
}: {
  aktion: Aktion;
  sendenText: string;
  versteckt?: Record<string, string>;
  children: ReactNode;
}) {
  const [zustand, formAktion] = useActionState(aktion, {});
  const meldung = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (zustand.fehler) meldung.current?.focus();
  }, [zustand]);

  return (
    <Zustand.Provider value={zustand}>
      <form action={formAktion} className="formular" noValidate>
        {zustand.fehler ? (
          <div className="hinweis fehler" role="alert" tabIndex={-1} ref={meldung}>
            {zustand.fehler}
            {zustand.liste && zustand.liste.length > 0 ? (
              <ul>
                {zustand.liste.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {Object.entries(versteckt ?? {}).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="felder">{children}</div>
        <div className="knopfreihe">
          <SendenKnopf text={sendenText} />
        </div>
      </form>
    </Zustand.Provider>
  );
}

interface FeldBasis {
  name: string;
  label: string;
  pflicht?: boolean;
  hinweis?: string;
  breit?: boolean;
}

export function Feld({
  typ = 'text',
  standard,
  autocomplete,
  ...basis
}: FeldBasis & { typ?: 'text' | 'email' | 'date'; standard?: string; autocomplete?: string }) {
  const z = useContext(Zustand);
  const wert = z.werte ? (z.werte[basis.name] ?? '') : (standard ?? '');
  const fehler = z.feldFehler?.[basis.name];
  const { name, label, pflicht, hinweis, breit } = basis;
  return (
    <div className={`feld${breit ? ' breit' : ''}`}>
      <label htmlFor={name}>
        {label}
        {pflicht ? (
          <span className="pflicht" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      <input
        id={name}
        name={name}
        type={typ}
        defaultValue={wert}
        required={pflicht}
        autoComplete={autocomplete}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={fehler ? `${name}-fehler` : hinweis ? `${name}-hinweis` : undefined}
      />
      {hinweis && !fehler ? (
        <p className="feldhinweis" id={`${name}-hinweis`}>
          {hinweis}
        </p>
      ) : null}
      {fehler ? (
        <p className="feldfehler" id={`${name}-fehler`}>
          {fehler}
        </p>
      ) : null}
    </div>
  );
}

export function Auswahl({
  name,
  label,
  optionen,
  standard,
  leer,
  hinweis,
}: {
  name: string;
  label: string;
  optionen: readonly { wert: string; text: string }[];
  standard?: string;
  /** Text der Leer-Option; ohne Angabe gibt es keine. */
  leer?: string;
  hinweis?: string;
}) {
  const z = useContext(Zustand);
  const wert = z.werte ? (z.werte[name] ?? '') : (standard ?? '');
  const fehler = z.feldFehler?.[name];
  return (
    <div className="feld">
      <label htmlFor={name}>{label}</label>
      {/* key: React übernimmt ein geändertes defaultValue bei <select> nicht. */}
      <select
        key={wert}
        id={name}
        name={name}
        defaultValue={wert}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={fehler ? `${name}-fehler` : hinweis ? `${name}-hinweis` : undefined}
      >
        {leer !== undefined ? <option value="">{leer}</option> : null}
        {optionen.map((o) => (
          <option key={o.wert} value={o.wert}>
            {o.text}
          </option>
        ))}
      </select>
      {hinweis && !fehler ? (
        <p className="feldhinweis" id={`${name}-hinweis`}>
          {hinweis}
        </p>
      ) : null}
      {fehler ? (
        <p className="feldfehler" id={`${name}-fehler`}>
          {fehler}
        </p>
      ) : null}
    </div>
  );
}

export function Haken({
  name,
  label,
  standard = false,
  hinweis,
}: {
  name: string;
  label: string;
  standard?: boolean;
  hinweis?: string;
}) {
  const z = useContext(Zustand);
  const an = z.werte ? z.werte[name] === 'on' : standard;
  return (
    <div className="feld haken breit">
      <label htmlFor={name}>
        <input key={String(an)} id={name} name={name} type="checkbox" defaultChecked={an} /> {label}
      </label>
      {hinweis ? <p className="feldhinweis">{hinweis}</p> : null}
    </div>
  );
}

/** Fehler, der keinem Feld gehört (z. B. „mindestens eine Rolle“). */
export function GruppenFehler({ name }: { name: string }) {
  const z = useContext(Zustand);
  const fehler = z.feldFehler?.[name];
  return fehler ? (
    <p className="feldfehler breit" role="alert">
      {fehler}
    </p>
  ) : null;
}
