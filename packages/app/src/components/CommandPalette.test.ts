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

  // Isolate the single CommandItem block carrying our testid. Splitting
  // on `<CommandItem` boundaries means the chunk for our testid contains
  // ALL wiring (icon, label, onSelect, shortcut) for THAT entry — a
  // refactor that crosses onSelect onto a sibling item would fail the
  // `bridge.navigator.open()` assertion below.
  const switchProjectBlock = (() => {
    const chunks = src.split(/(?=<CommandItem\b)/);
    const ours = chunks.find((c) => c.includes('data-testid="command-palette-switch-project"'));
    if (!ours) return '';
    return ours.split('</CommandItem>')[0] ?? '';
  })();

  test('replaces the legacy "Start fresh" placeholder entry', () => {
    expect(src).not.toContain('Start fresh in a new folder');
    expect(src).not.toContain('command-palette-start-fresh');
  });

  test('imports the shared label constant and the LayoutGrid icon', () => {
    expect(src).toContain('SWITCH_PROJECT_LABEL_WITH_ELLIPSIS');
    expect(src).toMatch(/import\s*\{[^}]*\bLayoutGrid\b[^}]*\}\s*from\s*'lucide-react'/);
  });

  test('Switch Project block contains LayoutGrid icon, shared label, Cmd+Shift+N hint, and bridge.navigator.open() in the SAME CommandItem', () => {
    expect(
      switchProjectBlock,
      'CommandItem with command-palette-switch-project not found',
    ).toBeTruthy();
    expect(switchProjectBlock).toContain('<LayoutGrid');
    expect(switchProjectBlock).toContain('SWITCH_PROJECT_LABEL_WITH_ELLIPSIS');
    expect(switchProjectBlock).toContain('<CommandShortcut>⌘⇧N</CommandShortcut>');
    // Wiring lives inside this CommandItem's onSelect — guards against a
    // refactor that swaps the call onto a sibling CommandItem (open-folder,
    // install-claude-desktop, recent-*, open-in-agent-*).
    expect(switchProjectBlock).toMatch(/bridge\.navigator\.open\(\)/);
  });

  test('search-token value covers FR4(e) substrings (switch / projects / navigator)', () => {
    // The cmdk `value` prop drives substring matching. Each required
    // partial must be reachable from this entry's value tokens. `manage`
    // was dropped per spec D3 — the Navigator does not currently support
    // manage operations (rename/move/remove are NG3 Future Work), so
    // surfacing the entry on `manage` would set a mental-model trap.
    const valueLine = switchProjectBlock.match(/value="switch-project[^"]*"/)?.[0] ?? '';
    expect(valueLine).toContain('switch');
    expect(valueLine).toContain('projects');
    expect(valueLine).toContain('navigator');
    expect(valueLine).not.toContain('manage');
  });
});

describe('Settings entry (US-010 / FR-1 / D54 — source-level guards)', () => {
  const SRC_PATH = join(__dirname, 'CommandPalette.tsx');
  const src = readFileSync(SRC_PATH, 'utf-8');

  // Isolate the Settings CommandItem block by its data-testid so a refactor
  // that crosses the onSelect onto a sibling item (open-folder, install-claude-
  // desktop, recent-*, open-in-agent-*) would fail the assertions below.
  const settingsBlock = (() => {
    const chunks = src.split(/(?=<CommandItem\b)/);
    const ours = chunks.find((c) => c.includes('data-testid="command-palette-settings"'));
    if (!ours) return '';
    return ours.split('</CommandItem>')[0] ?? '';
  })();

  test('imports the Settings icon from lucide-react and SETTINGS_OPEN_HASH', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bSettings\b[^}]*\}\s*from\s*'lucide-react'/);
    expect(src).toContain('SETTINGS_OPEN_HASH');
    expect(src).toMatch(/from\s*'@\/lib\/use-settings-route'/);
  });

  test('Settings CommandItem carries the icon, the ⌘, shortcut hint, and the Settings… label', () => {
    expect(settingsBlock, 'CommandItem with command-palette-settings not found').toBeTruthy();
    expect(settingsBlock).toContain('<Settings');
    expect(settingsBlock).toContain('Settings…');
    expect(settingsBlock).toContain('<CommandShortcut>⌘,</CommandShortcut>');
  });

  test('Settings onSelect closes the palette and routes to SETTINGS_OPEN_HASH', () => {
    // Wiring lives inside this CommandItem's onSelect. The `setOpen(false)`
    // + hash-set pair MUST live together so a future edit that splits them
    // across siblings is caught. Hash literal drift guard — entry funnels
    // through the canonical export, not an inlined string.
    expect(settingsBlock).toContain('setOpen(false)');
    expect(settingsBlock).toContain('SETTINGS_OPEN_HASH');
  });

  test('search-token value covers settings / preferences / config substrings', () => {
    // The cmdk `value` prop drives substring matching for fuzzy search. A
    // user typing "preferences" or "config" should still find Settings.
    const valueLine = settingsBlock.match(/value="settings[^"]*"/)?.[0] ?? '';
    expect(valueLine).toContain('settings');
    expect(valueLine).toContain('preferences');
    expect(valueLine).toContain('config');
  });

  test('Settings sits inside the "Project" CommandGroup', () => {
    // Regression guard on placement — Settings is a project-level command,
    // not an agent or recent-projects entry. Locate the Settings testid and
    // verify the surrounding CommandGroup heading is "Project".
    const settingsIdx = src.indexOf('command-palette-settings');
    const projectGroupIdx = src.indexOf('heading="Project"');
    const agentGroupIdx = src.indexOf('heading="Open in agent"');
    expect(projectGroupIdx).toBeLessThan(settingsIdx);
    if (agentGroupIdx >= 0) {
      // If the agent group exists, Settings should fall before it (still
      // inside the Project group).
      expect(settingsIdx).toBeLessThan(agentGroupIdx);
    }
  });
});
