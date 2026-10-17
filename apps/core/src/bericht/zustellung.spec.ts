import { describe, expect, it } from 'vitest';
import { nachweisMail } from './zustellung';

const basis = {
  an: 'qa@kunde.example',
  firmenname: 'Testpharma GmbH (Demo)',
  kennzeichen: 'DEMO-102',
  von: new Date('2026-10-13T17:15:00Z'),
  bis: new Date('2026-10-14T17:15:00Z'),
  version: 1,
  bewertung: 'verletzt',
  pdfSha256: 'ab'.repeat(32),
  siegel: 'Testsiegel ohne Rechtswirkung',
  pdf: Buffer.from('%PDF-test'),
};

describe('Nachweis-Mail', () => {
  it('Betreff mit Kennzeichen und Ergebnis, PDF im Anhang, Prüfsumme im Text', () => {
    const m = nachweisMail(basis);
    expect(m.betreff).toBe('Temperaturnachweis DEMO-102 – Temperaturprofil VERLETZT');
    expect(m.text).toContain('13.10.2026, 19:15 – 14.10.2026, 19:15 (Ortszeit Berlin)');
    expect(m.text).toContain(`SHA-256 des PDF: ${'ab'.repeat(32)}`);
    expect(m.text).toContain('elektronisch gesiegelt (Testsiegel ohne Rechtswirkung)');
    expect(m.anhaenge).toEqual([
      {
        dateiname: 'Temperaturnachweis_DEMO-102_v1.pdf',
        inhalt: basis.pdf,
        typ: 'application/pdf',
      },
    ]);
  });

  it('neue Version wird als solche angekündigt', () => {
    const m = nachweisMail({ ...basis, version: 2, bewertung: 'eingehalten' });
    expect(m.betreff).toBe(
      'Neue Version 2: Temperaturnachweis DEMO-102 – Temperaturprofil eingehalten',
    );
    expect(m.text).toContain('ersetzt Version 1');
  });
});
