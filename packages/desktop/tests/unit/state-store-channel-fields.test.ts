import { describe, expect, test } from 'bun:test';
import {
  CURRENT_SCHEMA_VERSION,
  emptyState,
  evaluateSchemaCompatibility,
  MAX_SUPPORTED_SCHEMA_VERSION,
  parseAppState,
  type UpdateChannel,
} from '../../src/main/state-store.ts';

describe('AppState channel fields — defaults', () => {
  test('emptyState defaults updateChannel to latest', () => {
    const s = emptyState();
    expect(s.updateChannel).toBe('latest');
  });

  test('emptyState defaults schemaVersion to CURRENT_SCHEMA_VERSION', () => {
    const s = emptyState();
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test('CURRENT_SCHEMA_VERSION === MAX_SUPPORTED_SCHEMA_VERSION today', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(MAX_SUPPORTED_SCHEMA_VERSION);
  });
});

describe('parseAppState channel fields — coercion', () => {
  test('accepts a fully-populated blob with new fields', () => {
    const raw = {
      recentProjects: [],
      lastOpenedProject: null,
      updateChannel: 'beta',
      schemaVersion: 1,
    };
    const parsed = parseAppState(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.updateChannel).toBe('beta');
    expect(parsed?.schemaVersion).toBe(1);
  });

  test('forward-compat: blob without new keys returns valid state with defaults', () => {
    const raw = {
      recentProjects: [{ path: '/tmp/p', name: 'p', lastOpenedAt: '2026-04-01T00:00:00Z' }],
      lastOpenedProject: '/tmp/p',
    };
    const parsed = parseAppState(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.recentProjects.length).toBe(1);
    expect(parsed?.lastOpenedProject).toBe('/tmp/p');
    expect(parsed?.updateChannel).toBe('latest');
    expect(parsed?.schemaVersion).toBe(1);
  });

  test('coerces unknown updateChannel string to latest', () => {
    const raw = {
      recentProjects: [],
      lastOpenedProject: null,
      updateChannel: 'alpha',
    };
    const parsed = parseAppState(raw);
    expect(parsed?.updateChannel).toBe('latest');
  });

  test('coerces malformed updateChannel types to latest', () => {
    const variants: unknown[] = [42, true, null, { v: 'beta' }, ['beta']];
    for (const input of variants) {
      const parsed = parseAppState({
        recentProjects: [],
        lastOpenedProject: null,
        updateChannel: input,
      });
      const channel: UpdateChannel | undefined = parsed?.updateChannel;
      expect(channel).toBe('latest');
    }
  });

  test('preserves a future schemaVersion verbatim — boot-side check decides what to do', () => {
    const raw = {
      recentProjects: [],
      lastOpenedProject: null,
      schemaVersion: 999,
    };
    const parsed = parseAppState(raw);
    expect(parsed?.schemaVersion).toBe(999);
  });

  test('coerces non-integer schemaVersion to 1', () => {
    const variants: unknown[] = [null, '1', 1.5, NaN, true];
    for (const input of variants) {
      const parsed = parseAppState({
        recentProjects: [],
        lastOpenedProject: null,
        schemaVersion: input,
      });
      expect(parsed?.schemaVersion).toBe(1);
    }
  });

  test('round-trips a beta+schemaVersion blob through stringify/parse', () => {
    const original = { ...emptyState(), updateChannel: 'beta' as const };
    const restored = parseAppState(JSON.parse(JSON.stringify(original)));
    expect(restored).not.toBeNull();
    expect(restored?.updateChannel).toBe('beta');
    expect(restored?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe('evaluateSchemaCompatibility — boot-time refuse-downgrade gate', () => {
  test('returns ok when schemaVersion equals max supported (today)', () => {
    const result = evaluateSchemaCompatibility(
      { schemaVersion: MAX_SUPPORTED_SCHEMA_VERSION },
      MAX_SUPPORTED_SCHEMA_VERSION,
      '0.4.0',
    );
    expect(result.status).toBe('ok');
  });

  test('returns ok when schemaVersion is below max supported (future migration window)', () => {
    const result = evaluateSchemaCompatibility(
      { schemaVersion: 1 },
      2, // a future build raises max while still reading version 1
      '0.5.0',
    );
    expect(result.status).toBe('ok');
  });

  test('returns incompatible with diagnostic when schemaVersion exceeds max supported', () => {
    const result = evaluateSchemaCompatibility(
      { schemaVersion: 999 },
      MAX_SUPPORTED_SCHEMA_VERSION,
      '0.4.0',
    );
    expect(result.status).toBe('incompatible');
    if (result.status === 'incompatible') {
      expect(result.diagnostic).toEqual({
        currentBuild: '0.4.0',
        persistedSchemaVersion: 999,
        maxSupported: MAX_SUPPORTED_SCHEMA_VERSION,
      });
    }
  });

  test('boundary: schemaVersion === max + 1 is incompatible', () => {
    const result = evaluateSchemaCompatibility({ schemaVersion: 2 }, 1, '0.4.0');
    expect(result.status).toBe('incompatible');
  });

  test('CURRENT and MAX both 1 today means a fresh persisted state is always ok', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeLessThanOrEqual(MAX_SUPPORTED_SCHEMA_VERSION);
  });
});
