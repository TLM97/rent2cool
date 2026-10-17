import { Module } from '@nestjs/common';
import { KundeModule } from '../kunde/kunde.module';
import { MieteModule } from '../miete/miete.module';
import { KeyProviderModule } from './key-provider.module';
import {
  BefehlController,
  FahrzeugBefehlController,
  MieteSchluesselController,
  SchluesselController,
} from './schluessel.controller';
import { SchluesselService } from './schluessel.service';

/**
 * Digitaler Schlüssel und Fernzugriff (D-014). Der Anbieter steckt hinter dem
 * Token KEY_PROVIDER (KeyProviderModule): heute der Simulator (D-015), später die Mercedes-Lösung
 * oder eine Nachrüstbox – ohne Änderung an Service oder Controllern.
 */
@Module({
  imports: [KundeModule, MieteModule, KeyProviderModule],
  controllers: [
    MieteSchluesselController,
    SchluesselController,
    FahrzeugBefehlController,
    BefehlController,
  ],
  providers: [SchluesselService],
  exports: [SchluesselService],
})
export class SchluesselModule {}
