import { describe, expect, it } from 'vitest';
import { blattAus, erster, istUuid, seitenLink } from './seiten';

describe('Seitenparameter', () => {
  it('liest die Seite, Fallback auf 1', () => {
    expect(blattAus({ seite: '3' }, 25)).toEqual({ seite: 3, limit: 25, offset: 50 });
    expect(blattAus({ seite: 'x' })).toMatchObject({ seite: 1, offset: 0 });
    expect(blattAus({ seite: '-2' })).toMatchObject({ seite: 1 });
  });

  it('nimmt bei Mehrfachwerten den ersten', () => {
    expect(erster(['a', 'b'])).toBe('a');
  });

  it('baut Seitenlinks mit erhaltenen Filtern, ohne Meldungen', () => {
    expect(seitenLink('/alarme', { status: 'offen', seite: '2', erfolg: 'ok' }, 3)).toBe(
      '/alarme?status=offen&seite=3',
    );
    expect(seitenLink('/alarme', { status: 'offen' }, 1)).toBe('/alarme?status=offen');
    expect(seitenLink('/alarme', {}, 1)).toBe('/alarme');
  });

  it('prüft UUIDs', () => {
    expect(istUuid('018f3a2b-7c4d-7e2a-9b1c-2f3a4b5c6d7e')).toBe(true);
    expect(istUuid('../../v1/admin')).toBe(false);
  });
});
