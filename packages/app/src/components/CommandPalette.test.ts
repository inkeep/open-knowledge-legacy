/**
 * CommandPalette unit tests — mirrors `ProjectSwitcher.test.ts`'s shape.
 *
 * Repo convention (see `EditorActivityPool.test.ts`) is no
 * @testing-library/react; full DOM + keyboard interaction is exercised by
 * Playwright in M2. These tests assert the pure error-handling surface that
 * the shared `runWithToast` helper exposes (success / Error-rejection /
 * non-Error / empty-message / non-rethrow / internal-clear-regression-
 * guard), keeping the silent-error class of bug out of future diffs.
 *
 * Plus source-level regression guards on the "Switch Project" entry that
 * replaced the old "Start fresh in a new folder…" placeholder.
 */
import { describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('CommandPalette module', () => {
  test('Component module imports cleanly', async () => {
    const mod = await import('./CommandPalette');
    expect(typeof mod.CommandPalette).toBe('function');
    expect(typeof mod.runWithToast).toBe('function');
  });
});

describe('CommandPalette.runWithToast (IPC rejection → toast feedback)', () => {
  test('success: no toast.error fires', async () => {
    const { runWithToast } = await import('./CommandPalette');
    const toastApi = { error: mock(() => {}) };
    await runWithToast(() => Promise.resolve(), 'Command failed.', toastApi);
    expect(toastApi.error).not.toHaveBeenCalled();
  });

  test('Error rejection: toast.error fires with Error.message', async () => {
    const { runWithToast } = await import('./CommandPalette');
    const toastApi = { error: mock(() => {}) };
    await runWithToast(
      () => Promise.reject(new Error('utility failed to boot')),
      'Command failed.',
      toastApi,
    );
    expect(toastApi.error).toHaveBeenCalledWith('utility failed to boot');
  });

  test('non-Error rejection: toast.error fires with fallback', async () => {
    const { runWithToast } = await import('./CommandPalette');
    const toastApi = { error: mock(() => {}) };
    await runWithToast(() => Promise.reject('network dropped'), 'Command failed.', toastApi);
    expect(toastApi.error).toHaveBeenCalledWith('Command failed.');
  });

  test('empty-message Error: toast.error fires with fallback', async () => {
    const { runWithToast } = await import('./CommandPalette');
    const toastApi = { error: mock(() => {}) };
    await runWithToast(() => Promise.reject(new Error('')), 'Command failed.', toastApi);
    expect(toastApi.error).toHaveBeenCalledWith('Command failed.');
  });

  test('does not re-throw on rejection (runAction continues)', async () => {
    const { runWithToast } = await import('./CommandPalette');
    const toastApi = { error: mock(() => {}) };
    let afterAwait = false;
    await runWithToast(() => Promise.reject(new Error('x')), 'Command failed.', toastApi);
    afterAwait = true;
    expect(afterAwait).toBe(true);
  });

  test('success path fires NO toast even on the internal setError(null) clear', async () => {
    // Regression guard — the shared runWithErrorStatePure calls setError(null)
    // first to clear stale state; our adapter must filter the null rather
    // than passing it to toast.error(null).
    const { runWithToast } = await import('./CommandPalette');
    const toastApi = { error: mock(() => {}) };
    await runWithToast(() => Promise.resolve(), 'Command failed.', toastApi);
    expect(toastApi.error).not.toHaveBeenCalled();
  });

  test('falls back to module sonner toast when toastApi is omitted', async () => {
    // Smoke — calling runWithToast without the test double must not throw.
    const { runWithToast } = await import('./CommandPalette');
    await expect(runWithToast(() => Promise.resolve(), 'fallback')).resolves.toBeUndefined();
  });
});

describe('Switch Project entry (source-level guards)', () => {
  const SRC_PATH = join(__dirname, 'CommandPalette.tsx');
  const src = readFileSync(SRC_PATH, 'utf-8');

  test('replaces the legacy "Start fresh" placeholder entry', () => {
    expect(src).not.toContain('Start fresh in a new folder');
    expect(src).not.toContain('command-palette-start-fresh');
  });

  test('imports the shared palette label and the LayoutGrid icon', () => {
    expect(src).toContain('SWITCH_PROJECT_LABEL_PALETTE');
    expect(src).toMatch(/import\s*\{[^}]*\bLayoutGrid\b[^}]*\}\s*from\s*'lucide-react'/);
  });

  test('renders the Switch Project entry with testid + LayoutGrid icon + Cmd+Shift+N hint', () => {
    expect(src).toContain('data-testid="command-palette-switch-project"');
    // Icon usage shows up as JSX <LayoutGrid /> inside the same item block.
    expect(src).toMatch(/<LayoutGrid\s*\/>\s*\n\s*<span>\{SWITCH_PROJECT_LABEL_PALETTE\}<\/span>/);
    // Shortcut hint is preserved (matches the menu accelerator).
    expect(src).toContain('<CommandShortcut>⌘⇧N</CommandShortcut>');
  });

  test('search-token value covers the FR4(e) substrings (switch / manage / projects / navigator)', () => {
    // The cmdk `value` prop drives substring matching. All four required
    // partials must be reachable from the entry's value tokens.
    const valueLine = src.match(/value="switch-project[^"]*"/)?.[0] ?? '';
    expect(valueLine).toContain('switch');
    expect(valueLine).toContain('manage');
    expect(valueLine).toContain('projects');
    expect(valueLine).toContain('navigator');
  });

  test('click handler invokes bridge.navigator.open()', () => {
    expect(src).toMatch(/bridge\.navigator\.open\(\)/);
  });
});
