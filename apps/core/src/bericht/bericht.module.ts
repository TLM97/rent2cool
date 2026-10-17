import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { NachweisArchiv } from './archiv.service';
import {
  BerichtController,
  MieteNachweisController,
  NachweisPruefungController,
} from './bericht.controller';
import { Berichtsdienst } from './berichtsdienst';
import {
  BERICHT_SPEICHER,
  BerichtService,
  PROFIL_QUELLE,
  RENDERER_REGISTRY,
  SIGNIERER,
} from './bericht.service';
import { KonfigProfilQuelle } from './profil';
import { standardRenderer } from './renderer';
import { HmacSignierer } from './signierer';
import { ObjektBerichtSpeicher } from './speicher';
import { OBJEKT_SPEICHER, type ObjektSpeicher } from '../objektspeicher/objekt-speicher';

/**
 * Temperaturnachweis. Austauschbare Teile über Tokens: Profilquelle,
 * Signierer, Renderer (JSON, PDF – weitere Formate ohne Umbau), Speicher
 * (Objektspeicher, D-003). Dazu das unveränderbare Archiv je Miete und der
 * Berichtsdienst (BullMQ), der Nachweise nach Mietende automatisch erzeugt.
 */
@Module({
  controllers: [BerichtController, MieteNachweisController, NachweisPruefungController],
  providers: [
    BerichtService,
    { provide: PROFIL_QUELLE, useFactory: () => new KonfigProfilQuelle() },
    {
      provide: SIGNIERER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new HmacSignierer(config.get('BERICHT_SIGNING_KEY', { infer: true })),
    },
    { provide: RENDERER_REGISTRY, useFactory: standardRenderer },
    {
      provide: BERICHT_SPEICHER,
      inject: [OBJEKT_SPEICHER],
      useFactory: (s: ObjektSpeicher) => new ObjektBerichtSpeicher(s),
    },
    NachweisArchiv,
    Berichtsdienst,
  ],
  exports: [BerichtService, NachweisArchiv],
})
export class BerichtModule {}
