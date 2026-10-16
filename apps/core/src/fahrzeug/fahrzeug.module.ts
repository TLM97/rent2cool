import { Module } from '@nestjs/common';
import { FahrzeugController, SensorController } from './fahrzeug.controller';
import { FahrzeugService } from './fahrzeug.service';

/**
 * Fahrzeugakte (Fahrzeug/Aggregat/Sensor/Kalibrierung) mit Statusmodell und
 * Fristen/Buchbarkeit. Schreibzugriffe rollengeschützt und auditiert (T-004).
 */
@Module({
  controllers: [FahrzeugController, SensorController],
  providers: [FahrzeugService],
})
export class FahrzeugModule {}
