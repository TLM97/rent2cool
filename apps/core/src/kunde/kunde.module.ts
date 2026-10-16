import { Module } from '@nestjs/common';
import { FahrerController, KundeController } from './kunde.controller';
import { KundeService } from './kunde.service';

/**
 * Kunden (Firmenkunden, D-010) und Fahrer (gehören zum Kunden, D-004) inkl.
 * Statusmodellen und Fahrerlaubnis-Prüfung (R-22). Schreibzugriffe
 * rollengeschützt und auditiert (T-004).
 */
@Module({
  controllers: [KundeController, FahrerController],
  providers: [KundeService],
  exports: [KundeService],
})
export class KundeModule {}
