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
    entitaetId: 'm1',
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
      beschreibe(
        eintrag({
          altWert: { status: 'in_bewertung', bewertung: null },
          neuWert: { status: 'in_bewertung', bewertung: 'ok' },
        }),
      ).vorgang,
    ).toBe('Angaben ergänzt');
    expect(beschreibe(eintrag({ aktion: 'PATCH', entitaetTyp: 'kunde' })).vorgang).toBe(
      'Stammdaten geändert',
    );
  });

  it('Anlegen zeigt die gefüllten Felder ohne alten Wert; ohne Namen die gekürzte Kennung', () => {
    const b = beschreibe(
      eintrag({
        entitaetTyp: 'rechnung',
        neuWert: {
          id: 'x',
          mandantId: 'm',
          rechnungsnummer: '2026-00001',
          nettoCent: 10000,
          status: 'entwurf',
          bezahltAm: null,
        },
      }),
    );
    expect(b.vorgang).toBe('angelegt');
    expect(b.wer).toBe('Konto 0f4c2a9e');
    expect(b.aenderungen).toEqual([
      { feld: 'Status', alt: null, neu: 'Entwurf' },
      { feld: 'Rechnungsnummer', alt: null, neu: '2026-00001' },
      { feld: 'Netto', alt: null, neu: '100,00\u00a0€' },
    ]);
    // Alte Einträge der Rückfallebene enthielten nur die ID.
    expect(beschreibe(eintrag({ entitaetTyp: 'miete', neuWert: { id: 'x' } })).aenderungen).toEqual(
      [],
    );
    expect(
      beschreibe(eintrag({ entitaetTyp: 'kalibrierung', neuWert: { zertifikatRef: 'K1' } }))
        .vorgang,
    ).toBe('Kalibrierung erfasst');
  });

  it('formatiert Werte deutsch', () => {
    expect(formatWert('hatFahrtenschreiber', true)).toBe('ja');
    expect(formatWert('zulGesamtmasseKg', 7490)).toBe('7.490');
    expect(formatWert('ort', null)).toBe('–');
    expect(formatWert('oeffnungsregeln', null)).toBe('rund um die Uhr');
    expect(
      formatWert('oeffnungsregeln', {
        zeitzone: 'Europe/Berlin',
        woche: { mo: [{ von: '06:00', bis: '22:00' }] },
      }),
    ).toBe('Montag: 06:00–22:00');
    expect(feldaenderungen({ aktiv: true }, { aktiv: false })).toEqual([
      { feld: 'aktiv', alt: 'ja', neu: 'nein' },
    ]);
    expect(feldaenderungen({ ort: 'A', plz: '1' }, { ort: 'B', plz: '1' })).toEqual([
      { feld: 'Ort', alt: 'A', neu: 'B' },
    ]);
  });

  it('Schlüssel und Befehle', () => {
    const ausgestellt = beschreibe(
      eintrag({
        entitaetTyp: 'schluessel',
        neuWert: { status: 'aktiv', gueltigVon: '2026-10-17T07:00:00.000Z', fahrerId: 'f1' },
      }),
    );
    expect(ausgestellt.vorgang).toBe('Schlüssel ausgestellt');
    expect(ausgestellt.aenderungen).toEqual([
      { feld: 'Status', alt: null, neu: 'aktiv' },
      { feld: 'gültig ab', alt: null, neu: '17.10.2026, 09:00' },
    ]);
    expect(formatWert('befehl', 'wegfahrsperre_ein')).toBe('Wegfahrsperre ein');
    expect(formatWert('gruende', ['a', 'b'])).toBe('a · b');
  });
});
