/**
 * Widerruf aller Schlüssel einer Miete – eigene Datei, damit der Miet-Dienst sie
 * nutzen kann, ohne vom Schlüssel-Dienst abzuhängen (der ihn selbst braucht).
 */
import { and, eq } from 'drizzle-orm';
import type { Principal } from '@rent2cool/shared';
import { schreibeAudit } from '../audit/audit.service';
import type { Transaktion } from '../db/client';
import { schluessel } from '../db/schema';

/**
 * Aktive Schlüssel einer Miete widerrufen (Mietende, Storno) – in der
 * Transaktion des Statuswechsels, damit kein Schlüssel eine beendete Miete
 * überlebt. Liefert die Anbieter-Referenzen; dem Anbieter meldet der Aufrufer
 * den Widerruf nach dem Commit.
 */
export async function widerrufeSchluesselDerMiete(
  tx: Transaktion,
  principal: Principal,
  mieteId: string,
  grund: string,
): Promise<string[]> {
  const jetzt = new Date();
  const widerrufen = await tx
    .update(schluessel)
    .set({
      status: 'widerrufen',
      widerrufenAm: jetzt,
      widerrufenVon: principal.akteurId,
      widerrufGrund: grund,
      aktualisiertAm: jetzt,
    })
    .where(and(eq(schluessel.mieteId, mieteId), eq(schluessel.status, 'aktiv')))
    .returning({ id: schluessel.id, anbieterRef: schluessel.anbieterRef });
  for (const s of widerrufen) {
    await schreibeAudit(tx, principal, {
      aktion: 'POST',
      entitaetTyp: 'schluessel_status',
      entitaetId: s.id,
      altWert: { status: 'aktiv' },
      neuWert: { status: 'widerrufen', widerrufGrund: grund },
    });
  }
  return widerrufen.flatMap((s) => (s.anbieterRef ? [s.anbieterRef] : []));
}
