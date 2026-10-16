/**
 * Kafka-Producer (lokal Redpanda, D-001). Kapselt Verbindung und das
 * Schreiben einer Nachricht ins Telematik-Topic. Keyed nach fahrzeugId, damit
 * Nachrichten eines Fahrzeugs ihre Reihenfolge behalten.
 */
import { Kafka, type Producer } from 'kafkajs';

export interface Warteschlange {
  publiziere: (fahrzeugId: string, nachrichtJson: string) => Promise<void>;
  istBereit: () => boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function erzeugeWarteschlange(opts: {
  brokers: string[];
  clientId: string;
  topic: string;
}): Warteschlange {
  const kafka = new Kafka({ clientId: opts.clientId, brokers: opts.brokers });
  const producer: Producer = kafka.producer({ allowAutoTopicCreation: true });
  let bereit = false;

  return {
    async connect() {
      await producer.connect();
      bereit = true;
    },
    async disconnect() {
      bereit = false;
      await producer.disconnect();
    },
    istBereit: () => bereit,
    async publiziere(fahrzeugId, nachrichtJson) {
      await producer.send({
        topic: opts.topic,
        messages: [{ key: fahrzeugId, value: nachrichtJson }],
      });
    },
  };
}
