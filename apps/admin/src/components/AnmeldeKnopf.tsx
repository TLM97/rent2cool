'use client';

import { signIn } from 'next-auth/react';

export function AnmeldeKnopf({ callbackUrl }: { callbackUrl: string }) {
  return (
    <button className="knopf" type="button" onClick={() => signIn('keycloak', { callbackUrl })}>
      Mit Rent2Cool-Konto anmelden
    </button>
  );
}
