/**
 * Wächter für „Audit Trail ab dem ersten Commit“: Jede schreibende Route
 * (alles außer GET/HEAD/OPTIONS) muss `@Audited` oder `@AuditImService` tragen.
 * Neue Controller hier eintragen – vergessene fallen sonst nicht auf.
 */
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AdminController } from '../admin/admin.controller';
import { AbweichungController, AlarmController } from '../alarm/alarm.controller';
import { BerichtController } from '../bericht/bericht.controller';
import { FahrzeugController, SensorController } from '../fahrzeug/fahrzeug.controller';
import { HealthController } from '../health/health.controller';
import { FahrerController, KundeController } from '../kunde/kunde.controller';
import { MieteController } from '../miete/miete.controller';
import { RechnungController } from '../rechnung/rechnung.controller';
import { AuditController } from './audit.controller';
import { AUDITED_KEY } from './audited.decorator';

const CONTROLLER = [
  AdminController,
  AlarmController,
  AbweichungController,
  AuditController,
  BerichtController,
  FahrzeugController,
  SensorController,
  HealthController,
  KundeController,
  FahrerController,
  MieteController,
  RechnungController,
];
const LESEND = new Set([RequestMethod.GET, RequestMethod.HEAD, RequestMethod.OPTIONS]);

describe('Audit-Abdeckung', () => {
  it('jede schreibende Route ist auditiert', () => {
    const fehlend: string[] = [];
    let schreibend = 0;
    for (const c of CONTROLLER) {
      const proto = c.prototype as unknown as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const methode = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (methode === undefined || LESEND.has(methode)) continue;
        schreibend++;
        if (!Reflect.getMetadata(AUDITED_KEY, handler)) {
          fehlend.push(
            `${c.name}.${name} (${String(Reflect.getMetadata(PATH_METADATA, handler))})`,
          );
        }
      }
    }
    expect(schreibend).toBeGreaterThan(15);
    expect(fehlend).toEqual([]);
  });
});
