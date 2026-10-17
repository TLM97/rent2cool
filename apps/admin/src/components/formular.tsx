'use client';

/**
 * Formular-Baukasten: Server Action + useActionState. Fehler erscheinen am
 * Feld (aria-invalid/aria-describedby), eingegebene Werte bleiben bei Fehlern
 * erhalten, der Absendeknopf ist während des Sendens gesperrt (kein
 * Doppelabsenden).
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
import type { FormularZustand } from '../lib/formular';

type Aktion = (zustand: FormularZustand, fd: FormData) => Promise<FormularZustand>;

const Zustand = createContext<FormularZustand>({});

function SendenKnopf({ text }: { text: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="knopf" type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? 'Wird gespeichert …' : text}
    </button>
  );
}

export function FormularRahmen({
  aktion,
  sendenText,
  versteckt,
  children,
  abbrechenHref,
}: {
  aktion: Aktion;
  sendenText: string;
  versteckt?: Record<string, string>;
  children: ReactNode;
  abbrechenHref?: string;
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
        <div className="knopfreihe formular-aktionen">
          <SendenKnopf text={sendenText} />
          {abbrechenHref ? (
            <a className="knopf zweitrangig" href={abbrechenHref}>
              Abbrechen
            </a>
          ) : null}
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

function useFeld(name: string, standard?: string) {
  const z = useContext(Zustand);
  return {
    wert: z.werte ? (z.werte[name] ?? '') : (standard ?? ''),
    fehler: z.feldFehler?.[name],
    hatWerte: z.werte !== undefined,
  };
}

function Rahmen({
  name,
  label,
  pflicht,
  hinweis,
  breit,
  fehler,
  children,
}: FeldBasis & { fehler?: string; children: ReactNode }) {
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
      {children}
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

function aria(name: string, fehler?: string, hinweis?: string) {
  return {
    'aria-invalid': fehler ? true : undefined,
    'aria-describedby': fehler ? `${name}-fehler` : hinweis ? `${name}-hinweis` : undefined,
  } as const;
}

export function Feld({
  typ = 'text',
  standard,
  schritt,
  min,
  ...basis
}: FeldBasis & {
  typ?: 'text' | 'number' | 'date' | 'datetime-local' | 'email' | 'time';
  standard?: string;
  schritt?: string;
  min?: string;
}) {
  const f = useFeld(basis.name, standard);
  return (
    <Rahmen {...basis} fehler={f.fehler}>
      <input
        id={basis.name}
        name={basis.name}
        type={typ}
        defaultValue={f.wert}
        required={basis.pflicht}
        step={schritt}
        min={min}
        inputMode={typ === 'number' ? 'decimal' : undefined}
        {...aria(basis.name, f.fehler, basis.hinweis)}
      />
    </Rahmen>
  );
}

/** Datei-Auswahl (z. B. Foto); nach einem Fehler muss die Datei neu gewählt werden. */
export function Dateifeld({ annehmen, ...basis }: FeldBasis & { annehmen?: string }) {
  const f = useFeld(basis.name);
  return (
    <Rahmen {...basis} fehler={f.fehler}>
      <input
        id={basis.name}
        name={basis.name}
        type="file"
        accept={annehmen}
        required={basis.pflicht}
        {...aria(basis.name, f.fehler, basis.hinweis)}
      />
    </Rahmen>
  );
}

export function Textfeld({ standard, ...basis }: FeldBasis & { standard?: string }) {
  const f = useFeld(basis.name, standard);
  return (
    <Rahmen {...basis} fehler={f.fehler}>
      <textarea
        id={basis.name}
        name={basis.name}
        rows={4}
        defaultValue={f.wert}
        required={basis.pflicht}
        {...aria(basis.name, f.fehler, basis.hinweis)}
      />
    </Rahmen>
  );
}

export function Auswahl({
  optionen,
  standard,
  leer,
  ...basis
}: FeldBasis & {
  optionen: readonly { wert: string; text: string }[];
  standard?: string;
  /** Text der Leer-Option; ohne Angabe gibt es keine. */
  leer?: string;
}) {
  const f = useFeld(basis.name, standard);
  return (
    <Rahmen {...basis} fehler={f.fehler}>
      {/* key: React übernimmt ein geändertes defaultValue bei <select> nicht; nach dem
          automatischen Formular-Reset (React 19) sprang die Auswahl sonst auf den
          ursprünglichen Standard zurück. Neu einhängen mit dem zurückgegebenen Wert. */}
      <select
        key={f.wert}
        id={basis.name}
        name={basis.name}
        defaultValue={f.wert}
        required={basis.pflicht}
        {...aria(basis.name, f.fehler, basis.hinweis)}
      >
        {leer !== undefined ? <option value="">{leer}</option> : null}
        {optionen.map((o) => (
          <option key={o.wert} value={o.wert}>
            {o.text}
          </option>
        ))}
      </select>
    </Rahmen>
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

export function Gruppe({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <fieldset className="gruppe-feld breit">
      <legend>{titel}</legend>
      <div className="felder">{children}</div>
    </fieldset>
  );
}

/**
 * Kompaktes Uhrzeitfeld ohne eigene Beschriftung (für Tabellen, z. B.
 * Öffnungszeiten); die Beschriftung kommt per `label` als aria-label.
 */
export function Zeitfeld({
  name,
  label,
  standard,
}: {
  name: string;
  label: string;
  standard?: string;
}) {
  const f = useFeld(name, standard);
  return (
    <span className="zeitfeld">
      <input
        id={name}
        name={name}
        type="time"
        aria-label={label}
        defaultValue={f.wert}
        {...aria(name, f.fehler)}
      />
      {f.fehler ? (
        <span className="feldfehler" id={`${name}-fehler`}>
          {f.fehler}
        </span>
      ) : null}
    </span>
  );
}
