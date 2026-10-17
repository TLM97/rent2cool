// WICHTIG: Tracing zuerst, damit die Auto-Instrumentierung vor allem anderen greift.
import './tracing';

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  // Pino als zentraler Logger.
  app.useLogger(app.get(Logger));

  // Sauberes Herunterfahren (leert Warteschlangen/Verbindungen).
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const host = config.get('CORE_HTTP_HOST', { infer: true });
  const port = config.get('CORE_HTTP_PORT', { infer: true });

  await app.listen({ host, port });
  app.get(Logger).log(`Rent2Cool core lauscht auf http://${host}:${port}`);
}

void bootstrap();
