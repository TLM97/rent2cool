import { Module } from '@nestjs/common';
import { BerichtModule } from '../bericht/bericht.module';
import { FahrzeugModule } from '../fahrzeug/fahrzeug.module';
import { KundeModule } from '../kunde/kunde.module';
import { SchluesselModule } from '../schluessel/schluessel.module';
import { MieteController } from './miete.controller';
import { MieteService } from './miete.service';

/**
 * Buchung/Miete (D-009). Bringt Fahrzeugakte, Kunden/Fahrer und
 * Temperaturnachweis zusammen: Buchungsregeln (D-006/D-010/R-22, idempotent
 * D-003) und Nachweis gebunden an die Miete. Schreibzugriffe auditiert (T-004).
 */
@Module({
  imports: [FahrzeugModule, KundeModule, BerichtModule, SchluesselModule],
  controllers: [MieteController],
  providers: [MieteService],
  exports: [MieteService],
})
export class MieteModule {}
