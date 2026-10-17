import { Module } from '@nestjs/common';
import { KEY_PROVIDER, SimulatorKeyProvider } from './key-provider';

/**
 * Der Anbieter für Schlüssel und Fernzugriff – eigenes Modul, weil Miete
 * (Widerruf bei Mietende) und Schlüssel (Befehle) ihn beide brauchen.
 */
@Module({
  providers: [
    // TODO(D-015): Anbieter wählen, sobald entschieden.
    { provide: KEY_PROVIDER, useFactory: () => new SimulatorKeyProvider() },
  ],
  exports: [KEY_PROVIDER],
})
export class KeyProviderModule {}
