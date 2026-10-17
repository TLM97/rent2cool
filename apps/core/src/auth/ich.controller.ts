/**
 * Wer bin ich? Rollen und – für Kunden-Logins – der zugeordnete Kunde (F-41).
 * Für Kundenportal und App: zeigt, als wer man sieht, ohne etwas zu verraten.
 */
import { Controller, ForbiddenException, Get, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Principal } from '@rent2cool/shared';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { kunde } from '../db/schema';
import { CurrentUser } from './decorators';
import { Zugriff } from './zugriff';

@Controller('v1/ich')
export class IchController {
  constructor(
    private readonly zugriff: Zugriff,
    @Inject(DB) private readonly db: Database,
  ) {}

  @Get()
  async ich(@CurrentUser() user: Principal) {
    let kundeId: string | null = null;
    let hinweis: string | null = null;
    try {
      kundeId = (await this.zugriff.sicht(user)).kundeId;
    } catch (e) {
      if (!(e instanceof ForbiddenException)) throw e;
      hinweis = 'Ihr Zugang ist keinem Kunden zugeordnet';
    }
    const [k] = kundeId
      ? await this.db
          .select({ id: kunde.id, firmenname: kunde.firmenname })
          .from(kunde)
          .where(eq(kunde.id, kundeId))
      : [];
    return {
      akteurId: user.akteurId,
      name: user.name ?? null,
      rollen: user.rollen,
      kunde: k ?? null,
      hinweis,
    };
  }
}
