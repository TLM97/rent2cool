/**
 * Verarbeitung einer Telematik-Nachricht (T-003).
 *
 * Idempotent und atomar: In einer Transaktion wird zuerst die `nachrichtId` in
 * den Dedup-Ledger geschrieben. Gelingt das (keine Kollision), werden die
 * Messwerte angehängt; war die ID schon da, ist es ein Duplikat und es wird
 * nichts geschrieben. Dedup-Eintrag und Messwerte committen gemeinsam – stürzt
 * der Prozess vor dem Commit ab, wird die Nachricht bei der Neuzustellung
 * vollständig neu verarbeitet (kein Verlust, keine Doppelung).
 */
import type { TelemetrieNachricht } from '@rent2cool/shared';
import type { Database } from '../db/client';
import { messwert, telemetrieNachricht } from '../db/schema';

export type Verarbeitungsergebnis = 'gespeichert' | 'duplikat';

export async function verarbeiteNachricht(
  db: Database,
  n: TelemetrieNachricht,
): Promise<Verarbeitungsergebnis> {
  return db.transaction(async (tx) => {
    const eingefuegt = await tx
      .insert(telemetrieNachricht)
      .values({
        nachrichtId: n.nachrichtId,
        fahrzeugId: n.fahrzeugId,
        quelle: n.quelle,
        gesendetAm: new Date(n.gesendetAm),
        werteAnzahl: n.messwerte.length,
      })
      .onConflictDoNothing()
      .returning({ id: telemetrieNachricht.nachrichtId });

    if (eingefuegt.length === 0) {
      return 'duplikat';
    }

    const zeilen = n.messwerte.map((w) => ({
      zeit: new Date(w.zeit ?? n.gesendetAm),
      fahrzeugId: n.fahrzeugId,
      messgroesse: w.messgroesse,
      wert: w.wert,
      einheit: w.einheit,
      nachrichtId: n.nachrichtId,
      quelle: n.quelle,
      mieteId: null,
    }));
    await tx.insert(messwert).values(zeilen);
    return 'gespeichert';
  });
}
