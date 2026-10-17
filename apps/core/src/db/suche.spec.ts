import { describe, expect, it } from 'vitest';
import { enthaeltMuster } from './suche';

describe('enthaeltMuster', () => {
  it('umschließt die Eingabe mit % und schneidet Leerraum ab', () => {
    expect(enthaeltMuster('  DEMO-1 ')).toBe('%DEMO-1%');
  });
  it('macht Platzhalter der Eingabe unwirksam', () => {
    expect(enthaeltMuster('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
  });
  it('leer = kein Filter', () => {
    expect(enthaeltMuster('')).toBeUndefined();
    expect(enthaeltMuster('   ')).toBeUndefined();
    expect(enthaeltMuster(undefined)).toBeUndefined();
  });
});
