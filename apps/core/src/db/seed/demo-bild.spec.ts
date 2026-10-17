import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { demoBild } from './demo-bild';

describe('Demo-Platzhalterbild', () => {
  it('ist ein gültiges PNG in der gewünschten Größe', () => {
    const png = demoBild([11, 110, 122], 40, 30);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(40);
    expect(png.readUInt32BE(20)).toBe(30);
    // IDAT entpackt: 30 Zeilen à (1 Filterbyte + 40 × RGB)
    const idatLaenge = png.readUInt32BE(33);
    const idat = png.subarray(41, 41 + idatLaenge);
    expect(inflateSync(idat).length).toBe(30 * (1 + 40 * 3));
  });
});
