import { Module } from '@nestjs/common';
import { TelemetryConsumerService } from './telemetry-consumer.service';

/**
 * Telematik-Verarbeitung als klar getrenntes Modul (D-003: Telematik-Eingang
 * und Berichtsdienst als herauslösbare Module des modularen Monolithen).
 */
@Module({
  providers: [TelemetryConsumerService],
})
export class TelemetryModule {}
