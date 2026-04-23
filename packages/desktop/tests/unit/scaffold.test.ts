import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

/**
 * Mechanical enforcement of the electron-version contract (M2 / D6).
 *
 * `packages/desktop/package.json`'s `electron` devDep version MUST match
 * `packages/desktop/electron-builder.yml`'s `electronVersion` byte-for-byte.
 * A drift between these two values causes a silent ABI mismatch in the
 * packaged DMG: `@electron/rebuild` compiles native modules
 * (`@napi-rs/keyring`, `@parcel/watcher`) against the yml version, but the
 * runtime uses the package.json version. The resulting packaged app crashes
 * at `dlopen` time — caught only post-ship.
 *
 * The yml's comment warns humans; this test catches drift mechanically so
 * agents bumping only one side of the pair fail loud in CI. See
 * `specs/2026-04-20-m2-signed-dmg-scaffolding/SPEC.md` §9 D6.
 */
describe('M2 electron-version contract (D6)', () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const desktopRoot = resolve(__dirname, '../..');

  test('package.json `electron` devDep matches electron-builder.yml `electronVersion`', () => {
    const pkg = JSON.parse(readFileSync(resolve(desktopRoot, 'package.json'), 'utf8'));
    const yml = readFileSync(resolve(desktopRoot, 'electron-builder.yml'), 'utf8');

    const pkgVersion = pkg.devDependencies?.electron as string | undefined;
    expect(pkgVersion, 'electron devDep missing from package.json').toBeDefined();

    // Both must be pinned exact (no caret/tilde). A caret range on either
    // side reintroduces the drift this test is designed to catch.
    expect(pkgVersion).toMatch(/^\d+\.\d+\.\d+$/);

    const ymlMatch = yml.match(/^electronVersion:\s*"([^"]+)"$/m);
    expect(ymlMatch, 'electronVersion not found in electron-builder.yml').not.toBeNull();
    const ymlVersion = ymlMatch?.[1];

    expect(ymlVersion).toBe(pkgVersion);
  });
});
