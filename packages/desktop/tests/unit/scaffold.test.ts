import { describe, expect, test } from 'bun:test';
import { OK_DIR } from '@inkeep/open-knowledge-core';

/**
 * Scaffold placeholder test (US-003). Validates that the desktop package can
 * import from both workspace deps it declared (`@inkeep/open-knowledge-core`
 * + `@inkeep/open-knowledge-server`) without module-resolution errors.
 *
 * Expands in US-005+ with real preload-bridge / main-window / utility-entry
 * unit tests. Keeps this test so `bun test` never runs zero-files.
 */
describe('desktop scaffold', () => {
  test('OK_DIR from core resolves to .open-knowledge', () => {
    expect(OK_DIR).toBe('.open-knowledge');
  });

  test('server package is importable', async () => {
    const server = await import('@inkeep/open-knowledge-server');
    expect(typeof server.bootServer).toBe('function');
    expect(typeof server.createServer).toBe('function');
  });
});
