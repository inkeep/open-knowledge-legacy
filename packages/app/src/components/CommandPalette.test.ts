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
    const { runWithToast } = await import('./CommandPalette');
    const toastApi = { error: mock(() => {}) };
    await runWithToast(() => Promise.resolve(), 'Command failed.', toastApi);
    expect(toastApi.error).not.toHaveBeenCalled();
  });

  test('falls back to module sonner toast when toastApi is omitted', async () => {
    const { runWithToast } = await import('./CommandPalette');
    await expect(runWithToast(() => Promise.resolve(), 'fallback')).resolves.toBeUndefined();
  });
});

describe('Switch Project entry (source-level guards)', () => {
  const SRC_PATH = join(__dirname, 'CommandPalette.tsx');
  const src = readFileSync(SRC_PATH, 'utf-8');

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
    expect(switchProjectBlock).toMatch(/bridge\.navigator\.open\(\)/);
  });

  test('search-token value covers FR4(e) substrings (switch / projects / navigator)', () => {
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
    expect(settingsBlock).toContain('onOpenChange(false)');
    expect(settingsBlock).toContain('SETTINGS_OPEN_HASH');
  });

  test('search-token value covers settings / preferences / config substrings', () => {
    const valueLine = settingsBlock.match(/value="settings[^"]*"/)?.[0] ?? '';
    expect(valueLine).toContain('settings');
    expect(valueLine).toContain('preferences');
    expect(valueLine).toContain('config');
  });

  test('Settings sits inside the "Project" CommandGroup', () => {
    const settingsIdx = src.indexOf('command-palette-settings');
    const projectGroupIdx = src.indexOf('heading="Project"');
    const agentGroupIdx = src.indexOf('heading="Open in agent"');
    expect(projectGroupIdx).toBeLessThan(settingsIdx);
    if (agentGroupIdx >= 0) {
      expect(agentGroupIdx).toBeLessThan(projectGroupIdx);
    }
  });
});
