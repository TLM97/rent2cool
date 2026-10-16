import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { HealthController } from './health.controller';

// Schlanker Stub für den ConfigService – der Health-Endpunkt braucht nur
// den Dienstnamen.
const config = {
  get: () => 'rent2cool-core',
} as unknown as ConfigService<Env, true>;

describe('HealthController', () => {
  const controller = new HealthController(config);

  it('liveness meldet ok, ohne Abhängigkeiten', () => {
    const report = controller.liveness();
    expect(report.status).toBe('ok');
    expect(report.service).toBe('rent2cool-core');
    expect(() => new Date(report.time).toISOString()).not.toThrow();
  });

  it('readiness meldet die Teilprüfungen', () => {
    const report = controller.readiness();
    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({ config: 'ok' });
  });

  it('liefert UTC-Zeitstempel (endet auf Z)', () => {
    expect(controller.liveness().time.endsWith('Z')).toBe(true);
  });
});
