import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { AdminModule } from './admin/admin.module';
import { BerichtModule } from './bericht/bericht.module';
import { FahrzeugModule } from './fahrzeug/fahrzeug.module';
import { KundeModule } from './kunde/kunde.module';
import { MieteModule } from './miete/miete.module';
import { RechnungModule } from './rechnung/rechnung.module';
import { AlarmModule } from './alarm/alarm.module';
import { HealthModule } from './health/health.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { StandortModule } from './standort/standort.module';
import { SchluesselModule } from './schluessel/schluessel.module';
import { ObjektspeicherModule } from './objektspeicher/objektspeicher.module';
import { ProtokollModule } from './protokoll/protokoll.module';

/**
 * Wurzelmodul des Kerns. Als modularer Monolith (D-002) kommen fachliche
 * Module (Flotte, Kunden, Buchung, Telematik-Verarbeitung ...) später hier
 * als eigene Module dazu.
 */
@Module({
  imports: [
    ConfigModule,
    // Strukturierte JSON-Logs (D-001). In der Entwicklung hübsch via
    // pino-pretty, in Produktion reines JSON für die Log-Pipeline.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        // Zugangsdaten/Tokens niemals in Logs (CLAUDE.md: keine Geheimnisse).
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.secret',
          ],
          remove: true,
        },
      },
    }),
    DbModule,
    AuthModule,
    AuditModule,
    AdminModule,
    BerichtModule,
    StandortModule,
    FahrzeugModule,
    KundeModule,
    MieteModule,
    SchluesselModule,
    ObjektspeicherModule,
    ProtokollModule,
    RechnungModule,
    AlarmModule,
    HealthModule,
    TelemetryModule,
  ],
})
export class AppModule {}
