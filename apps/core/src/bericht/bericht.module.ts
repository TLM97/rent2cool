import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { BerichtController } from './bericht.controller';
import {
  BERICHT_SPEICHER,
  BerichtService,
  PROFIL_QUELLE,
  RENDERER_REGISTRY,
  SIGNIERER,
} from './bericht.service';
import { KonfigProfilQuelle } from './profil';
import { JsonNachweisRenderer, RendererRegistry } from './renderer';
import { HmacSignierer } from './signierer';
import { InMemoryBerichtSpeicher } from './speicher';

/**
 * Temperaturbericht v1. Alle austauschbaren Teile sind über Tokens
 * eingebunden: Profilquelle, Signierer, Renderer-Registry (Formate) und
 * Speicher. Ein Formatwechsel (z. B. PDF) ist ein weiterer Renderer; ein
 * Speicherwechsel (z. B. S3/MinIO) eine andere Implementierung des
 * BerichtSpeicher-Interfaces – ohne Änderung am Service/Controller.
 */
@Module({
  controllers: [BerichtController],
  providers: [
    BerichtService,
    { provide: PROFIL_QUELLE, useFactory: () => new KonfigProfilQuelle() },
    {
      provide: SIGNIERER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new HmacSignierer(config.get('BERICHT_SIGNING_KEY', { infer: true })),
    },
    {
      provide: RENDERER_REGISTRY,
      useFactory: () => new RendererRegistry([new JsonNachweisRenderer()]),
    },
    { provide: BERICHT_SPEICHER, useFactory: () => new InMemoryBerichtSpeicher() },
  ],
})
export class BerichtModule {}
