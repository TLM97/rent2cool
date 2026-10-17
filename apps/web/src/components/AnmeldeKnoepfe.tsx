'use client';

import { signIn } from 'next-auth/react';

export function AnmeldeKnoepfe({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div className="knopfreihe">
      <button className="knopf" type="button" onClick={() => signIn('keycloak', { callbackUrl })}>
        Anmelden
      </button>
      <button
        className="knopf zweitrangig"
        type="button"
        onClick={() => signIn('keycloak-registrierung', { callbackUrl })}
      >
        Konto anlegen
      </button>
    </div>
  );
}
