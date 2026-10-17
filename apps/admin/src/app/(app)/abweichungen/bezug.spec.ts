import { describe, expect, it } from 'vitest';
import { bezugLink } from './bezug';

describe('bezugLink', () => {
  const id = '6f1c2a3e-0000-4000-8000-000000000001';
  it('verlinkt Miete und Fahrzeug auf ihre Seiten', () => {
    expect(bezugLink('miete', id)).toBe(`/mieten/${id}`);
    expect(bezugLink('fahrzeug', id)).toBe(`/fahrzeuge/${id}`);
  });
  it('Alarme haben keine eigene Seite → Alarmliste', () => {
    expect(bezugLink('alarm', id)).toBe('/alarme');
  });
});
