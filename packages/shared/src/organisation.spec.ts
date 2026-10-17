import { describe, expect, it } from 'vitest';
import { einladungSchema, kundeKontoSchema, registrierungSchema } from './eingaben';

describe('Selbstregistrierung und Organisation', () => {
  it('Registrierung: Firmenname Pflicht, Land Standard DE', () => {
    expect(registrierungSchema.safeParse({ firmenname: ' ' }).success).toBe(false);
    expect(registrierungSchema.parse({ firmenname: 'Testpharma GmbH' }).land).toBe('DE');
  });

  it('Einladung: E-Mail normalisiert, nur Kundenrollen, doppelte entfernt', () => {
    const e = einladungSchema.parse({
      email: ' QA@Kunde.Example ',
      rollen: ['kunde_qa', 'kunde_qa'],
    });
    expect(e).toEqual({ email: 'qa@kunde.example', rollen: ['kunde_qa'] });
    expect(einladungSchema.safeParse({ email: 'a@b.example', rollen: ['admin'] }).success).toBe(
      false,
    );
    expect(einladungSchema.safeParse({ email: 'a@b.example', rollen: [] }).success).toBe(false);
  });

  it('Zuordnung durch uns: Standardrollen Disposition und QA', () => {
    expect(kundeKontoSchema.parse({ kontoId: 'abc' }).rollen).toEqual(['kunde_dispo', 'kunde_qa']);
  });
});
