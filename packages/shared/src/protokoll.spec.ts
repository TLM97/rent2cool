import { describe, expect, it } from 'vitest';
import {
  CHECKLISTE,
  fehltZumAbschluss,
  fotoAnfordernSchema,
  fotoObjektSchluessel,
  PFLICHT_FOTOS,
  protokollAendernSchema,
  type ChecklistenAntwort,
} from './protokoll';

const alleOk = (art: 'uebergabe' | 'rueckgabe'): Record<string, ChecklistenAntwort> =>
  Object.fromEntries(CHECKLISTE[art].map((p) => [p.id, { ok: true }]));

describe('Übergabeprotokoll', () => {
  it('vollständig: alle Pflichtfotos, Checkliste, Kilometerstand', () => {
    expect(
      fehltZumAbschluss({
        art: 'uebergabe',
        kmStand: 12_345,
        checkliste: alleOk('uebergabe'),
        fotos: [...PFLICHT_FOTOS, 'schaden'],
      }),
    ).toEqual([]);
  });

  it('nennt alles, was fehlt; „nein“ verlangt eine Bemerkung', () => {
    const checkliste = { ...alleOk('rueckgabe'), keine_neuen_schaeden: { ok: false } };
    delete (checkliste as Record<string, unknown>).laderaum_leer;
    expect(
      fehltZumAbschluss({
        art: 'rueckgabe',
        kmStand: null,
        checkliste,
        fotos: ['vorne', 'hinten', 'links', 'rechts', 'laderaum'],
      }),
    ).toEqual([
      'Foto fehlt: Kilometerstand / Kühlanzeige',
      'Checkliste offen: Laderaum leer und besenrein',
      'Bemerkung fehlt: Keine neuen Schäden',
      'Kilometerstand fehlt',
    ]);
    expect(
      fehltZumAbschluss({
        art: 'rueckgabe',
        kmStand: 1,
        checkliste: {
          ...alleOk('rueckgabe'),
          keine_neuen_schaeden: { ok: false, bemerkung: 'Delle Heck links' },
        },
        fotos: PFLICHT_FOTOS,
      }),
    ).toEqual([]);
  });

  it('Objektschlüssel ohne Personendaten, nach Monat gegliedert', () => {
    expect(
      fotoObjektSchluessel({
        mandantId: 'm1',
        protokollId: 'p1',
        fotoId: 'f1',
        typ: 'image/jpeg',
        zeit: new Date('2026-10-17T12:00:00Z'),
      }),
    ).toBe('protokolle/m1/2026/10/p1/f1.jpg');
  });

  it('Foto-Anfrage: Typ, Größe, Prüfsumme', () => {
    const basis = {
      perspektive: 'vorne',
      contentType: 'image/jpeg',
      groesse: 2_000_000,
      sha256: 'A'.repeat(64),
      idempotencyKey: 'k1',
    };
    const ok = fotoAnfordernSchema.parse(basis);
    expect(ok.sha256).toBe('a'.repeat(64));
    expect(
      fotoAnfordernSchema.safeParse({ ...basis, contentType: 'application/pdf' }).success,
    ).toBe(false);
    expect(fotoAnfordernSchema.safeParse({ ...basis, groesse: 16 * 1024 * 1024 }).success).toBe(
      false,
    );
    expect(fotoAnfordernSchema.safeParse({ ...basis, sha256: 'xyz' }).success).toBe(false);
  });

  it('Ändern verlangt die Version; Kilometerstand ganzzahlig', () => {
    expect(protokollAendernSchema.safeParse({ kmStand: 5 }).success).toBe(false);
    expect(
      protokollAendernSchema.safeParse({ version: '2026-10-17T08:00:00Z', kmStand: '12.5' })
        .success,
    ).toBe(false);
    expect(
      protokollAendernSchema.parse({ version: '2026-10-17T08:00:00Z', kmStand: '12500' }).kmStand,
    ).toBe(12500);
  });
});
