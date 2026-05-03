import { describe, expect, test } from 'bun:test';
import { RUNTIME_VERSION, STATE_SCHEMA_VERSION } from './version-constants.ts';

describe('version-constants', () => {
  test('RUNTIME_VERSION resolves from package.json (NOT the unknown sentinel)', () => {
    expect(RUNTIME_VERSION).not.toBe('0.0.0-unknown');
    expect(RUNTIME_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('STATE_SCHEMA_VERSION is a positive integer (schema-0 reserved as adoption sentinel)', () => {
    expect(typeof STATE_SCHEMA_VERSION).toBe('number');
    expect(Number.isInteger(STATE_SCHEMA_VERSION)).toBe(true);
    expect(STATE_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
