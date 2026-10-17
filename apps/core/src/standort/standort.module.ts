import { Module } from '@nestjs/common';
import { StandortController } from './standort.controller';
import { StandortService } from './standort.service';

/** Standorte (D-011): Adresse, Geofence, Öffnungsregeln; Grundlage für Heimatstandort und Übergabe. */
@Module({
  controllers: [StandortController],
  providers: [StandortService],
  exports: [StandortService],
})
export class StandortModule {}
