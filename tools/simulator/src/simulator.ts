/**
 * Treiber des Simulators: sendet signierte Nachrichten an den Telematik-Eingang
 * und misst den Durchsatz. Unterstützt Funklöcher (Pufferung + Nachlieferung)
 * und das gezielte Wiederholen von Nachrichten (Duplikat-Test der Dedup).
 */
import { baueHuelle, type TelemetrieNachricht } from '@rent2cool/shared';
import { erzeugeFlotte, type VirtualVehicle } from './vehicle';

export interface SendeErgebnis {
  gesendet: number;
  angenommen: number;
  abgelehnt: number;
  fehler: number;
  dauerMs: number;
  durchsatzProS: number;
  eindeutigeNachrichten: number;
}

async function poste(
  url: string,
  nachricht: TelemetrieNachricht,
  schluessel: string,
): Promise<'angenommen' | 'abgelehnt' | 'fehler'> {
  try {
    const res = await fetch(`${url}/v1/telemetrie`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(baueHuelle(nachricht, schluessel)),
    });
    return res.status === 202 ? 'angenommen' : 'abgelehnt';
  } catch {
    return 'fehler';
  }
}

/** Sendet eine Liste von Nachrichten mit begrenzter Nebenläufigkeit. */
async function sendeAlle(
  url: string,
  schluessel: string,
  nachrichten: TelemetrieNachricht[],
  parallel: number,
): Promise<{ angenommen: number; abgelehnt: number; fehler: number }> {
  let angenommen = 0;
  let abgelehnt = 0;
  let fehler = 0;
  let index = 0;

  async function worker(): Promise<void> {
    while (index < nachrichten.length) {
      const n = nachrichten[index++]!;
      const r = await poste(url, n, schluessel);
      if (r === 'angenommen') angenommen++;
      else if (r === 'abgelehnt') abgelehnt++;
      else fehler++;
    }
  }

  await Promise.all(Array.from({ length: Math.min(parallel, nachrichten.length) }, worker));
  return { angenommen, abgelehnt, fehler };
}

export interface LastOpts {
  ingestUrl: string;
  schluessel: string;
  fahrzeuge: number;
  runden: number;
  parallel: number;
  tuerRate: number;
  ausreisserRate: number;
  /** Anteil Fahrzeuge mit Funkloch je Runde (Puffer -> Nachlieferung). */
  funklochRate: number;
  /** Anteil Nachrichten, die zusätzlich als Duplikat gesendet werden. */
  duplikatRate: number;
  log?: (zeile: string) => void;
}

/**
 * Lasttest/Burst: erzeugt `fahrzeuge` × `runden` Nachrichten (eine Runde =
 * „1 Nachricht pro Minute je Fahrzeug“) und sendet sie so schnell wie möglich.
 */
export async function laufLast(opts: LastOpts): Promise<SendeErgebnis> {
  const log = opts.log ?? (() => {});
  const flotte = erzeugeFlotte(opts.fahrzeuge, {
    tuerRate: opts.tuerRate,
    ausreisserRate: opts.ausreisserRate,
  });

  // Puffer je Fahrzeugindex für Funkloch-Nachlieferung.
  const puffer = new Map<number, TelemetrieNachricht[]>();
  const alle: TelemetrieNachricht[] = [];
  const basis = Date.now();

  for (let runde = 0; runde < opts.runden; runde++) {
    const zeit = new Date(basis + runde * 60_000);
    flotte.forEach((v: VirtualVehicle, i: number) => {
      const n = v.erzeuge(zeit);
      const imFunkloch = Math.random() < opts.funklochRate;
      if (imFunkloch) {
        // Nachricht wird gepuffert und in der nächsten Runde nachgeliefert.
        const liste = puffer.get(i) ?? [];
        liste.push(n);
        puffer.set(i, liste);
      } else {
        // Zuerst gepufferte (verspätete) Nachrichten nachliefern ...
        const nachzuliefern = puffer.get(i);
        if (nachzuliefern?.length) {
          alle.push(...nachzuliefern);
          puffer.delete(i);
        }
        alle.push(n);
      }
      if (Math.random() < opts.duplikatRate) {
        alle.push(n); // dieselbe Nachricht (gleiche ID) noch einmal -> Dedup-Test
      }
    });
  }
  // Am Ende verbliebene Puffer nachliefern.
  for (const liste of puffer.values()) {
    alle.push(...liste);
  }

  const eindeutige = new Set(alle.map((n) => n.nachrichtId)).size;
  log(
    `Sende ${alle.length} Nachrichten (${eindeutige} eindeutig) von ${opts.fahrzeuge} Fahrzeugen, ${opts.runden} Runde(n), Parallelität ${opts.parallel} ...`,
  );

  const start = Date.now();
  const { angenommen, abgelehnt, fehler } = await sendeAlle(
    opts.ingestUrl,
    opts.schluessel,
    alle,
    opts.parallel,
  );
  const dauerMs = Date.now() - start;

  return {
    gesendet: alle.length,
    angenommen,
    abgelehnt,
    fehler,
    dauerMs,
    durchsatzProS: Math.round((alle.length / dauerMs) * 1000),
    eindeutigeNachrichten: eindeutige,
  };
}
