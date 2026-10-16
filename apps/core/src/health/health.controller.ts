import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { nowUtcIso, type HealthReport } from '@rent2cool/shared';
import type { Env } from '../config/env';

/**
 * Gesundheits- und Bereitschafts-Endpunkte (D-005).
 *
 * - GET /health        Liveness: Prozess lebt. Keine Abhängigkeiten, nie 5xx.
 * - GET /health/ready  Readiness: Dienst nimmt Last an.
 *
 * Die Readiness prüft derzeit nur, dass die Konfiguration geladen ist. Echte
 * Checks auf Datenbank, Warteschlange und Objektspeicher kommen mit den
 * jeweiligen Modulen dazu (Persistenz-/Telematik-Aufgaben).
 */
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get()
  liveness(): HealthReport {
    return {
      status: 'ok',
      time: nowUtcIso(),
      service: this.config.get('OTEL_SERVICE_NAME', { infer: true }),
    };
  }

  @Get('ready')
  readiness(): HealthReport {
    return {
      status: 'ok',
      time: nowUtcIso(),
      service: this.config.get('OTEL_SERVICE_NAME', { infer: true }),
      checks: {
        config: 'ok',
      },
    };
  }
}
