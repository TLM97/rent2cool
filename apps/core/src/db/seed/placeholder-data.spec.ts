import { describe, expect, it } from 'vitest';
import { placeholderDpo, placeholderHq } from './placeholder-data';

describe('Platzhalter-Stammdaten (D-015)', () => {
  it('PLACEHOLDER_HQ ist als Platzhalter erkennbar und in DE', () => {
    const hq = placeholderHq({});
    expect(hq.key).toBe('PLACEHOLDER_HQ');
    expect(hq.land).toBe('DE');
    expect(hq.geofence.radiusM).toBeGreaterThan(0);
  });

  it('nimmt Overrides aus der Umgebung', () => {
    const hq = placeholderHq({ PLACEHOLDER_HQ_CITY: 'Teststadt' } as NodeJS.ProcessEnv);
    expect(hq.ort).toBe('Teststadt');
  });

  it('DPO-Platzhalter trägt den PLACEHOLDER-Namen', () => {
    expect(placeholderDpo({}).name).toBe('PLACEHOLDER_DPO');
  });
});
