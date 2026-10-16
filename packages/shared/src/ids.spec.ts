import { describe, expect, it } from 'vitest';
import { asId, isUuid, type FahrzeugId } from './ids';

describe('ids', () => {
  it('erkennt gültige UUIDs', () => {
    expect(isUuid('018f3a2b-7c4d-7e2a-9b1c-2f3a4b5c6d7e')).toBe(true);
  });

  it('weist ungültige UUIDs ab', () => {
    expect(isUuid('nicht-eine-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('brandet geprüfte IDs ohne den Wert zu verändern', () => {
    const raw = '018f3a2b-7c4d-7e2a-9b1c-2f3a4b5c6d7e';
    const id: FahrzeugId = asId<'FahrzeugId'>(raw);
    expect(id).toBe(raw);
  });
});
