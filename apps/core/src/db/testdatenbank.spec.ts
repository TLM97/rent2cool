import { describe, expect, it } from 'vitest';
import { datenbankName, testDatenbankUrl, verwaltungsUrl } from './testdatenbank';

describe('testDatenbankUrl', () => {
  it('hängt _test an den Namen der Arbeitsdatenbank', () => {
    const url = testDatenbankUrl({ DATABASE_URL: 'postgres://u:p@db:5432/rent2cool' });
    expect(url).toBe('postgres://u:p@db:5432/rent2cool_test');
    expect(datenbankName(url)).toBe('rent2cool_test');
  });

  it('ohne Angaben: lokale Standard-Test-Datenbank', () => {
    expect(datenbankName(testDatenbankUrl({}))).toBe('rent2cool_test');
  });

  it('TEST_DATABASE_URL hat Vorrang, muss aber auf _test enden', () => {
    expect(
      testDatenbankUrl({
        TEST_DATABASE_URL: 'postgres://u:p@h/ci_test',
        DATABASE_URL: 'postgres://x/y',
      }),
    ).toBe('postgres://u:p@h/ci_test');
    expect(() => testDatenbankUrl({ TEST_DATABASE_URL: 'postgres://u:p@h/rent2cool' })).toThrow(
      /_test/,
    );
    expect(() => testDatenbankUrl({ TEST_DATABASE_URL: 'postgres://u:p@h/x;drop_test' })).toThrow();
  });

  it('bleibt bei einer URL, die schon auf _test endet', () => {
    expect(testDatenbankUrl({ DATABASE_URL: 'postgres://u:p@h/rent2cool_test' })).toBe(
      'postgres://u:p@h/rent2cool_test',
    );
  });

  it('Verwaltungsverbindung zeigt auf die Datenbank postgres', () => {
    expect(verwaltungsUrl('postgres://u:p@h:5432/rent2cool_test')).toBe(
      'postgres://u:p@h:5432/postgres',
    );
  });
});
