import { describe, expect, it } from 'vitest';
import { istPgFehler, PG_FEHLER } from './fehler';

describe('istPgFehler', () => {
  const eindeutig = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint_name: 'uq_miete_idempotency',
  });

  it('erkennt den Code aus dem Feld, nicht aus dem Text', () => {
    expect(String(eindeutig)).not.toContain('23505');
    expect(istPgFehler(eindeutig, PG_FEHLER.EINDEUTIG)).toBe(true);
    expect(istPgFehler(eindeutig, PG_FEHLER.AUSSCHLUSS)).toBe(false);
  });

  it('unterscheidet Constraints und findet eingepackte Fehler', () => {
    expect(istPgFehler(eindeutig, PG_FEHLER.EINDEUTIG, 'uq_miete_idempotency')).toBe(true);
    expect(istPgFehler(eindeutig, PG_FEHLER.EINDEUTIG, 'uq_anders')).toBe(false);
    expect(istPgFehler(new Error('x', { cause: eindeutig }), PG_FEHLER.EINDEUTIG)).toBe(true);
  });

  it('ignoriert andere Fehler', () => {
    expect(istPgFehler(new Error('23505'), PG_FEHLER.EINDEUTIG)).toBe(false);
    expect(istPgFehler(undefined, PG_FEHLER.EINDEUTIG)).toBe(false);
  });
});
