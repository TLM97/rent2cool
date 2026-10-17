import { describe, expect, it } from 'vitest';
import { istPgFehler, mitWiederholung, PG_FEHLER } from './fehler';

describe('istPgFehler', () => {
  const eindeutig = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint_name: 'uq_miete_idempotency',
  });

  it('erkennt den Code aus dem Feld, nicht aus dem Text', () => {
    expect(String(eindeutig)).not.toContain('23505');
    expect(istPgFehler(eindeutig, PG_FEHLER.EINDEUTIG)).toBe(true);
    expect(istPgFehler(eindeutig, PG_FEHLER.AUSSCHLUSS)).toBe(false);
  });

  it('unterscheidet Constraints und findet eingepackte Fehler', () => {
    expect(istPgFehler(eindeutig, PG_FEHLER.EINDEUTIG, 'uq_miete_idempotency')).toBe(true);
    expect(istPgFehler(eindeutig, PG_FEHLER.EINDEUTIG, 'uq_anders')).toBe(false);
    expect(istPgFehler(new Error('x', { cause: eindeutig }), PG_FEHLER.EINDEUTIG)).toBe(true);
  });

  it('ignoriert andere Fehler', () => {
    expect(istPgFehler(new Error('23505'), PG_FEHLER.EINDEUTIG)).toBe(false);
    expect(istPgFehler(undefined, PG_FEHLER.EINDEUTIG)).toBe(false);
  });
});

describe('mitWiederholung', () => {
  const deadlock = () => Object.assign(new Error('deadlock detected'), { code: '40P01' });
  const sofort = async () => {};

  it('wiederholt bei Deadlock und liefert dann das Ergebnis', async () => {
    let n = 0;
    const r = await mitWiederholung(
      async () => {
        if (++n < 3) throw deadlock();
        return 'ok';
      },
      4,
      sofort,
    );
    expect(r).toBe('ok');
    expect(n).toBe(3);
  });

  it('gibt andere Fehler sofort weiter', async () => {
    let n = 0;
    const fehler = Object.assign(new Error('x'), { code: '23P01' });
    await expect(
      mitWiederholung(
        async () => {
          n++;
          throw fehler;
        },
        4,
        sofort,
      ),
    ).rejects.toBe(fehler);
    expect(n).toBe(1);
  });

  it('gibt nach der letzten Wiederholung auf', async () => {
    let n = 0;
    await expect(
      mitWiederholung(
        async () => {
          n++;
          throw deadlock();
        },
        3,
        sofort,
      ),
    ).rejects.toMatchObject({ code: '40P01' });
    expect(n).toBe(3);
  });
});
