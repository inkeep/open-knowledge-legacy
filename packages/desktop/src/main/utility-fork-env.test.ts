import { describe, expect, test } from 'bun:test';
import { buildUtilityForkEnv } from './utility-fork-env.ts';

/**
 * AC8 (M4) — utility fork env carries `OK_ELECTRON_PROTOCOL_HOST=1` while
 * preserving any other vars already on the parent env (PATH, HOME, etc.).
 * Proves the merge does not overwrite.
 */

describe('buildUtilityForkEnv', () => {
  test('sets OK_ELECTRON_PROTOCOL_HOST=1', () => {
    const env = buildUtilityForkEnv({});
    expect(env.OK_ELECTRON_PROTOCOL_HOST).toBe('1');
  });

  test('preserves other parent-env vars via spread (no overwrite)', () => {
    const env = buildUtilityForkEnv({ PATH: '/usr/bin', HOME: '/Users/test' });
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/Users/test');
    expect(env.OK_ELECTRON_PROTOCOL_HOST).toBe('1');
  });

  test('overrides a pre-existing OK_ELECTRON_PROTOCOL_HOST to "1" (canonicalize)', () => {
    // If a test-harness or a parent CI run pre-set the var to something else,
    // the desktop utility should still see `'1'` — the marker is binary, not
    // value-sensitive, and accidental `0` / stale values would confuse the
    // `=== '1'` gate in preview-url.ts.
    const env = buildUtilityForkEnv({ OK_ELECTRON_PROTOCOL_HOST: '0' });
    expect(env.OK_ELECTRON_PROTOCOL_HOST).toBe('1');
  });

  test('defaults to process.env when no arg provided', () => {
    // Smoke — the no-arg overload returns *some* object with our key set.
    const env = buildUtilityForkEnv();
    expect(env.OK_ELECTRON_PROTOCOL_HOST).toBe('1');
  });
});
