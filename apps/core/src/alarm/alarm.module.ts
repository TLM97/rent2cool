import { Module } from '@nestjs/common';
import { AbweichungController, AlarmController } from './alarm.controller';
import { AbweichungService } from './abweichung.service';
import { AlarmService } from './alarm.service';

/**
 * Alarme (aus Telematik-Auswertung) und GDP-Abweichungen (CAPA). AlarmService
 * wird exportiert, damit der Telematik-Verarbeiter Nachrichten auswerten kann.
 */
@Module({
  controllers: [AlarmController, AbweichungController],
  providers: [AlarmService, AbweichungService],
  exports: [AlarmService],
})
export class AlarmModule {}
