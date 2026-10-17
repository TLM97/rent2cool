import { Module } from '@nestjs/common';
import { MieteProtokollController, ProtokollController } from './protokoll.controller';
import { ProtokollService } from './protokoll.service';

/**
 * Übergabe- und Rückgabeprotokoll mit Foto-Check (D-014). Fotos über den
 * globalen Objektspeicher (OBJEKT_SPEICHER, S3-API).
 */
@Module({
  controllers: [MieteProtokollController, ProtokollController],
  providers: [ProtokollService],
  exports: [ProtokollService],
})
export class ProtokollModule {}
