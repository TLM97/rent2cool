/**
 * Login → Kunde (F-41/F-51): Gehört der angemeldete Login zu einem Kunden,
 * bekommt der Principal dessen ID und die Rollen, die der Kunde ihm in seiner
 * Organisation gegeben hat. Diese Rollen vergibt der Kunde selbst – sie können
 * nie interne Rollen sein (Datenbank-Regel, Migration 0019).
 */
import { eq } from 'drizzle-orm';
import type { Principal, Rolle } from '@rent2cool/shared';
import type { Database } from '../db/client';
import { kundeKonto } from '../db/schema';

export async function mitKundenkonto(db: Database, p: Principal): Promise<Principal> {
  const [k] = await db
    .select({
      kundeId: kundeKonto.kundeId,
      mandantId: kundeKonto.mandantId,
      rollen: kundeKonto.rollen,
    })
    .from(kundeKonto)
    .where(eq(kundeKonto.kontoId, p.akteurId));
  if (!k) return p;
  return {
    ...p,
    mandantId: p.mandantId ?? k.mandantId,
    kundeId: k.kundeId,
    rollen: [...new Set<Rolle>([...p.rollen, ...k.rollen])],
  };
}
