import { Module } from '@nestjs/common';
import { AlarmModule } from '../alarm/alarm.module';
import { TelemetryConsumerService } from './telemetry-consumer.service';

/**
 * Telematik-Verarbeitung als klar getrenntes Modul (D-003: Telematik-Eingang
 * und Berichtsdienst als herauslösbare Module des modularen Monolithen).
 * Wertet eingehende Nachrichten gegen das Profil aus (Alarme).
 */
@Module({
  imports: [AlarmModule],
  providers: [TelemetryConsumerService],
})
export class TelemetryModule {}
