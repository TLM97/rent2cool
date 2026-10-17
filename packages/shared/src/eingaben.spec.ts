import { describe, expect, it } from 'vitest';
import {
  abweichungStatusSchema,
  fahrzeugErstellenSchema,
  kalibrierungSchema,
  mieteErstellenSchema,
  rechnungErstellenSchema,
} from './eingaben';

const uuid = '018f3a2b-7c4d-7e2a-9b1c-2f3a4b5c6d7e';

function feldMeldung(res: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }, feld: string) {
  return res.error?.issues.find((i) => i.path[0] === feld)?.message;
}

describe('Geteilte Eingabe-Schemas', () => {
  it('Fahrzeug: deutsche Meldung bei fehlendem Kennzeichen, Masse wird zur Zahl', () => {
    expect(feldMeldung(fahrzeugErstellenSchema.safeParse({ kennzeichen: ' ', zulGesamtmasseKg: 3500 }), 'kennzeichen')).toBe(
      'Kennzeichen fehlt',
    );
    const ok = fahrzeugErstellenSchema.parse({ kennzeichen: 'B-RC 1', zulGesamtmasseKg: '3500' });
    expect(ok.zulGesamtmasseKg).toBe(3500);
    expect(ok.benoetigteFuehrerscheinklasse).toBe('B');
  });

  it('Kalibrierung: gültig-bis muss nach dem Prüfdatum liegen', () => {
    const r = kalibrierungSchema.safeParse({
      durchgefuehrtAm: '2026-10-17T08:00:00Z',
      gueltigBis: '2026-10-01T08:00:00Z',
    });
    expect(feldMeldung(r, 'gueltigBis')).toBe('Muss nach dem Prüfdatum liegen');
  });

  it('Miete: Ende vor Start wird abgewiesen, fehlende Auswahl gemeldet', () => {
    const r = mieteErstellenSchema.safeParse({
      kundeId: uuid,
      fahrzeugId: uuid,
      startGeplant: '2026-10-18T10:00:00Z',
      endeGeplant: '2026-10-18T09:00:00Z',
    });
    expect(feldMeldung(r, 'endeGeplant')).toBe('Ende muss nach dem Start liegen');
    const ohne = mieteErstellenSchema.safeParse({ kundeId: '', fahrzeugId: uuid, startGeplant: 'x', endeGeplant: 'y' });
    expect(feldMeldung(ohne, 'kundeId')).toBe('Kunde auswählen');
  });

  it('Rechnung: Betrag muss positiv sein', () => {
    expect(feldMeldung(rechnungErstellenSchema.safeParse({ mieteId: uuid, netto: 0 }), 'netto')).toBe('Muss größer als 0 sein');
    expect(rechnungErstellenSchema.parse({ mieteId: uuid, netto: '119.5' }).netto).toBe(119.5);
  });

  it('Abweichung: unbekannter Status wird abgewiesen', () => {
    expect(abweichungStatusSchema.safeParse({ status: 'erledigt' }).success).toBe(false);
    expect(abweichungStatusSchema.safeParse({ status: 'in_bewertung' }).success).toBe(true);
  });
});
