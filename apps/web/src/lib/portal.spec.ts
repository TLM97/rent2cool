import { describe, expect, it } from 'vitest';
import { KUNDE_ROLLEN } from '@rent2cool/shared';
import {
  aufgaben,
  einladungsCode,
  istAktiv,
  istIntern,
  istVerwalter,
  ROLLEN,
  navigation,
  rollenAusFormular,
  sicheresZiel,
} from './portal';

describe('Portal-Regeln', () => {
  it('Navigation je Rolle: Verwalter ohne Dispo/QA sieht keine Mieten', () => {
    expect(navigation(['kunde_admin']).map((n) => n.href)).toEqual([
      '/portal',
      '/portal/organisation',
    ]);
    expect(navigation(['kunde_qa']).map((n) => n.href)).toEqual([
      '/portal',
      '/portal/mieten',
      '/portal/fahrer',
      '/portal/rechnungen',
      '/portal/organisation',
    ]);
    // Buchen nur mit Disposition.
    expect(navigation(['kunde_dispo']).map((n) => n.href)).toContain('/portal/buchen');
    expect(navigation(['kunde_qa']).map((n) => n.href)).not.toContain('/portal/buchen');
  });

  it('aktiver Menüpunkt', () => {
    expect(istAktiv('/portal', '/portal')).toBe(true);
    expect(istAktiv('/portal', '/portal/mieten')).toBe(false);
    expect(istAktiv('/portal/mieten', '/portal/mieten/abc')).toBe(true);
    expect(istAktiv('/portal/mieten', '/portal/mietenx')).toBe(false);
  });

  it('Rollen', () => {
    expect(istVerwalter(['kunde_dispo', 'kunde_admin'])).toBe(true);
    expect(istVerwalter(['kunde_qa'])).toBe(false);
    expect(istIntern(['ops'])).toBe(true);
    expect(istIntern(['kunde_admin'])).toBe(false);
  });

  it('Rollen aus Haken: nur bekannte, feste Reihenfolge', () => {
    const fd = new FormData();
    fd.set('rolle_kunde_qa', 'on');
    fd.set('rolle_kunde_admin', 'on');
    fd.set('rolle_admin', 'on');
    expect(rollenAusFormular(fd)).toEqual(['kunde_admin', 'kunde_qa']);
  });

  it('Einladungscode: nur base64url in sinnvoller Länge', () => {
    expect(einladungsCode('aB3_-'.repeat(6))).toBe('aB3_-'.repeat(6));
    expect(einladungsCode(['x'.repeat(32), 'y'])).toBe('x'.repeat(32));
    expect(einladungsCode('kurz')).toBeUndefined();
    expect(einladungsCode('<script>alert(1)</script>xxxxxxxxxx')).toBeUndefined();
    expect(einladungsCode(undefined)).toBeUndefined();
  });

  it('Rücksprungziel: nur relative Pfade', () => {
    expect(sicheresZiel('/portal/mieten')).toBe('/portal/mieten');
    expect(sicheresZiel('//boese.example')).toBe('/portal');
    expect(sicheresZiel('/\\boese.example')).toBe('/portal');
    expect(sicheresZiel('https://boese.example')).toBe('/portal');
    expect(sicheresZiel(undefined, '/x')).toBe('/x');
  });

  it('Aufgaben als Kurztext, feste Reihenfolge, interne Rollen ausgeblendet', () => {
    expect(aufgaben(['kunde_qa', 'admin', 'kunde_admin'])).toEqual([
      'Verwaltung',
      'Qualitätssicherung',
    ]);
  });

  it('Rollenliste gleich der gemeinsamen Liste (keine Abweichung zum Kern)', () => {
    expect([...ROLLEN]).toEqual([...KUNDE_ROLLEN]);
  });
});
