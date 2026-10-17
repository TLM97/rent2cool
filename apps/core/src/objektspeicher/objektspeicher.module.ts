import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { OBJEKT_SPEICHER, S3ObjektSpeicher } from './objekt-speicher';

/** Objektspeicher (S3-API) für alle Module – Fotos, später auch Berichte. */
@Global()
@Module({
  providers: [
    {
      provide: OBJEKT_SPEICHER,
      inject: [ConfigService],
      useFactory: (c: ConfigService<Env, true>) =>
        new S3ObjektSpeicher({
          endpoint: c.get('S3_ENDPOINT', { infer: true }),
          oeffentlicherEndpoint: c.get('S3_OEFFENTLICHER_ENDPOINT', { infer: true }),
          region: c.get('S3_REGION', { infer: true }),
          accessKey: c.get('S3_ACCESS_KEY', { infer: true }),
          secretKey: c.get('S3_SECRET_KEY', { infer: true }),
          bucket: c.get('S3_BUCKET', { infer: true }),
          forcePathStyle: c.get('S3_FORCE_PATH_STYLE', { infer: true }),
        }),
    },
  ],
  exports: [OBJEKT_SPEICHER],
})
export class ObjektspeicherModule {}
