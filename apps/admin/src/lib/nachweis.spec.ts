import { describe, expect, it } from 'vitest';
import { pruefungsText } from './nachweis';

describe('Echtheitsprüfung als Text', () => {
  it('echt, echt mit Hinweis, Abweichung', () => {
    expect(pruefungsText('1', { ergebnis: 'echt', hinweise: [] })).toBe(
      'Version 1 ist echt: Dateien unverändert, Signaturen gültig, Messdaten unverändert.',
    );
    expect(pruefungsText('2', { ergebnis: 'echt', hinweise: ['Nachlieferung.'] })).toContain(
      'Hinweis: Nachlieferung.',
    );
    expect(
      pruefungsText('', {
        ergebnis: 'abweichung',
        hinweise: ['PDF verändert', 'Signatur ungültig'],
      }),
    ).toBe('Nachweis: Abweichung – PDF verändert; Signatur ungültig');
  });
});
