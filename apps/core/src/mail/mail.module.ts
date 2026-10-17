import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { MAIL_VERSAND, SmtpMailVersand } from './mail-versand';

/** E-Mail-Versand für alle Module (SMTP; lokal Mailpit). */
@Global()
@Module({
  providers: [
    {
      provide: MAIL_VERSAND,
      inject: [ConfigService],
      useFactory: (c: ConfigService<Env, true>) =>
        new SmtpMailVersand(
          c.get('SMTP_URL', { infer: true }),
          c.get('MAIL_ABSENDER', { infer: true }),
        ),
    },
  ],
  exports: [MAIL_VERSAND],
})
export class MailModule {}
