/**
 * Platzhalterbilder für Demo-Protokolle (D-015: keine echten Fotos). Erzeugt
 * ein kleines PNG ohne Bibliothek: Farbverlauf je Ansicht mit einem Rahmen –
 * sichtbar „Demo“, nicht mit einem echten Foto zu verwechseln.
 */
import { crc32, deflateSync } from 'node:zlib';

function chunk(typ: string, daten: Buffer): Buffer {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const typUndDaten = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(typUndDaten) >>> 0);
  return Buffer.concat([laenge, typUndDaten, pruef]);
}

/** PNG (RGB) mit Verlauf von `farbe` nach Weiß und dunklem Rahmen. */
export function demoBild(farbe: [number, number, number], breite = 320, hoehe = 240): Buffer {
  const zeilen = Buffer.alloc((breite * 3 + 1) * hoehe);
  for (let y = 0; y < hoehe; y++) {
    const start = y * (breite * 3 + 1);
    zeilen[start] = 0; // Filter: keiner
    for (let x = 0; x < breite; x++) {
      const rand = x < 6 || y < 6 || x >= breite - 6 || y >= hoehe - 6;
      // Diagonale Streifen markieren das Bild als Platzhalter.
      const streifen = Math.floor((x + y) / 24) % 2 === 0;
      const t = (x / breite) * 0.6 + (streifen ? 0.15 : 0);
      for (let k = 0; k < 3; k++) {
        zeilen[start + 1 + x * 3 + k] = rand
          ? 40
          : Math.round(farbe[k]! + (255 - farbe[k]!) * Math.min(1, t));
      }
    }
  }
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(breite, 0);
  kopf.writeUInt32BE(hoehe, 4);
  kopf[8] = 8; // Bit je Kanal
  kopf[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', kopf),
    chunk('IDAT', deflateSync(zeilen)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
