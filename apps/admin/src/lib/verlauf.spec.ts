import { describe, expect, it } from 'vitest';
import { beschreibe, feldaenderungen, formatWert, type AuditEintrag } from './verlauf';

function eintrag(t: Partial<AuditEintrag>): AuditEintrag {
  return {
    id: 'e1',
    zeit: '2026-10-17T08:00:00.000Z',
    akteurId: '0f4c2a9e-1111-4222-8333-944445555666',
    akteurName: null,
    akteurRolle: 'ops',
    aktion: 'POST',
    entitaetTyp: 'miete_status',
    altWert: null,
    neuWert: null,
    ...t,
  };
}

describe('Verlauf', () => {
  it('beschreibt einen Statuswechsel mit Folgefeld', () => {
    const b = beschreibe(
      eintrag({
        akteurName: 'ops.dev',
        altWert: { status: 'bestaetigt', startIst: null },
        neuWert: { status: 'aktiv', startIst: '2026-10-17T08:00:00.000Z' },
      }),
    );
    expect(b.vorgang).toBe('Status geändert');
    expect(b.wer).toBe('ops.dev');
    expect(b.aenderungen).toEqual([
      { feld: 'Status', alt: 'bestätigt', neu: 'aktiv' },
      { feld: 'Start (tatsächlich)', alt: '–', neu: '17.10.2026, 10:00' },
    ]);
  });

  it('Feldänderung ohne Statuswechsel und Stammdaten', () => {
    expect(
      beschreibe(eintrag({ altWert: { status: 'in_bewertung', bewertung: null }, neuWert: { status: 'in_bewertung', bewertung: 'ok' } }))
        .vorgang,
    ).toBe('Angaben ergänzt');
    expect(beschreibe(eintrag({ aktion: 'PATCH', entitaetTyp: 'kunde' })).vorgang).toBe('Stammdaten geändert');
  });

  it('Anlegen zeigt keine Feldliste; ohne Namen die gekürzte Kennung', () => {
    const b = beschreibe(eintrag({ entitaetTyp: 'miete', neuWert: { id: 'x' } }));
    expect(b).toEqual({ vorgang: 'angelegt', wer: 'Konto 0f4c2a9e', aenderungen: [] });
  });

  it('formatiert Werte deutsch', () => {
    expect(formatWert('hatFahrtenschreiber', true)).toBe('ja');
    expect(formatWert('zulGesamtmasseKg', 7490)).toBe('7.490');
    expect(formatWert('ort', null)).toBe('–');
    expect(feldaenderungen({ ort: 'A', plz: '1' }, { ort: 'B', plz: '1' })).toEqual([{ feld: 'Ort', alt: 'A', neu: 'B' }]);
  });
});
