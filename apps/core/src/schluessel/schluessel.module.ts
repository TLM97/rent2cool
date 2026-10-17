import { Module } from '@nestjs/common';
import { KundeModule } from '../kunde/kunde.module';
import { KEY_PROVIDER, SimulatorKeyProvider } from './key-provider';
import {
  BefehlController,
  FahrzeugBefehlController,
  MieteSchluesselController,
  SchluesselController,
} from './schluessel.controller';
import { SchluesselService } from './schluessel.service';

/**
 * Digitaler Schlüssel und Fernzugriff (D-014). Der Anbieter steckt hinter dem
 * Token KEY_PROVIDER: heute der Simulator (D-015), später die Mercedes-Lösung
 * oder eine Nachrüstbox – ohne Änderung an Service oder Controllern.
 */
@Module({
  imports: [KundeModule],
  controllers: [
    MieteSchluesselController,
    SchluesselController,
    FahrzeugBefehlController,
    BefehlController,
  ],
  providers: [
    SchluesselService,
    // TODO(D-015): Anbieter wählen, sobald entschieden.
    { provide: KEY_PROVIDER, useFactory: () => new SimulatorKeyProvider() },
  ],
  exports: [SchluesselService, KEY_PROVIDER],
})
export class SchluesselModule {}
