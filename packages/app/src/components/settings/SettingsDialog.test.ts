import { describe, expect, test } from 'bun:test';
import SRC from './SettingsDialog?raw';

describe('SettingsDialog module', () => {
  test('exports SettingsDialog component', async () => {
    const mod = await import('./SettingsDialog');
    expect(typeof mod.SettingsDialog).toBe('function');
  });
});

describe('SettingsDialog source-level guards', () => {
  test('binds via core bindConfigDoc', () => {
    expect(SRC).toContain("from '@inkeep/open-knowledge-core'");
    expect(SRC).toContain('bindConfigDoc(');
  });

  test('admits both well-known config doc names', () => {
    expect(SRC).toContain('CONFIG_DOC_NAME_PROJECT');
    expect(SRC).toContain('CONFIG_DOC_NAME_USER');
  });

  test('subscribes to CC1 config-validation-rejected', () => {
    expect(SRC).toContain('subscribeToConfigValidationRejected');
  });

  test('L3 rejection wires form.setError + form.setFocus on the rejected field', () => {
    expect(SRC).toContain('form.setError(');
    expect(SRC).toContain('form.setFocus(');
    expect(SRC).toContain("type: 'config-validation-rejected'");
  });

  test('renders as a Dialog overlay (not a full-pane page)', () => {
    expect(SRC).toMatch(/from\s+['"]@\/components\/ui\/dialog['"]/);
    expect(SRC).toMatch(/<Dialog\s+open=\{open\}/);
    expect(SRC).toMatch(/<DialogContent\b/);
  });

  test('has Integrations section with Install in Claude Desktop row', () => {
    expect(SRC).toContain('IntegrationsSection');
    expect(SRC).toContain('Install in Claude Desktop');
    expect(SRC).toContain('InstallInClaudeDesktopDialog');
  });

  test('Integrations row consumes the shared useClaudeDesktopIntegration hook', () => {
    expect(SRC).toContain('useClaudeDesktopIntegration');
    expect(SRC).not.toContain('useClaudeDesktopAvailable');
    expect(SRC).not.toMatch(/detectClaudeDesktop\s*\?\.\(/);
  });

  test('Integrations row hides when desktopPresent === false', () => {
    expect(SRC).toMatch(/desktopPresent\s*\?\s*\[\{[^}]*id:\s*['"]claude-desktop['"]/);
  });

  test('IntegrationsSection button label branches on skillInstalled', () => {
    expect(SRC).toMatch(/skillInstalled\s*\?\s*['"]Reinstall['"]\s*:\s*['"]Install['"]/);
  });

  test('IntegrationsSection refreshes the shared hook on dialog close', () => {
    expect(SRC).toMatch(/if\s*\(!next\)\s*refresh\(\)/);
  });

  test('sidebar exposes the three required group labels', () => {
    expect(SRC).toContain("label: 'User'");
    expect(SRC).toContain("label: 'This project'");
    expect(SRC).toContain("label: 'Integrations'");
  });

  test('no top-level scope toggle in the dialog header', () => {
    expect(SRC).not.toMatch(/value=\{scope\}/);
    expect(SRC).not.toMatch(/aria-label=["']Settings scope["']/);
  });

  test('uses sonner for L3 rejection toast', () => {
    expect(SRC).toContain("from 'sonner'");
    expect(SRC).toContain('toast.error(');
  });

  test('per-field reset writes default OR null-as-clear', () => {
    expect(SRC).toContain('Reset to default');
    expect(SRC).toMatch(/form\.setValue\(/);
    expect(SRC).toContain('shouldDirty: false');
    expect(SRC).toMatch(/defaultValue\s*===\s*undefined\s*\?\s*null/);
  });

  test('flash animation uses the settings-flash CSS keyframe', () => {
    expect(SRC).toContain('animate-settings-flash');
  });

  test('does not instantiate client-side IndexeddbPersistence', () => {
    expect(SRC).not.toContain('IndexeddbPersistence');
    expect(SRC).not.toContain('createClientPersistence');
  });

  test('uses the shadcn Form primitive (FormField / FormControl / FormMessage)', () => {
    expect(SRC).toMatch(/from\s+['"]@\/components\/ui\/form['"]/);
    expect(SRC).toMatch(/<FormField\b/);
    expect(SRC).toMatch(/<FormMessage\b/);
  });

  test('consumes the useConfigForm harness hook', () => {
    expect(SRC).toMatch(/from\s+['"]\.\/use-config-form['"]/);
    expect(SRC).toContain('useConfigForm(');
  });

  test('mounts the user-scope ConfigBinding for the dialog lifetime', () => {
    expect(SRC).toContain('useUserConfigDocConnection');
    expect(SRC).toContain('CONFIG_DOC_NAME_USER');
  });
});

describe('SettingsDialog Channel section guards', () => {
  test('no longer renders a channel switcher', () => {
    expect(SRC).not.toContain('ChannelSection');
  });
});

describe('SettingsDialog Okignore section guards', () => {
  test('imports OkignoreSection from a sibling module', () => {
    expect(SRC).toMatch(/from\s+['"]\.\/OkignoreSection['"]/);
    expect(SRC).toContain('OkignoreSection');
  });

  test('Okignore section appears under THIS PROJECT in the "Ignore patterns" item', () => {
    expect(SRC).toMatch(/activeId\s*===\s*['"]okignore['"]\s*\)[\s\S]*?<OkignoreSection\b/);
  });
});

describe('SettingsDialog Sync section guards', () => {
  test('Sync section appears under THIS PROJECT as the dedicated "Sync" sidebar item', () => {
    expect(SRC).toMatch(/activeId\s*===\s*['"]sync['"]\s*\)[\s\S]*?<SyncSection\s*\/>/);
  });

  test('Sync section toggle goes through the shared confirmation hook', () => {
    expect(SRC).toContain("from '@/hooks/use-enable-sync-with-confirm'");
    expect(SRC).toContain('useEnableSyncWithConfirm');
    expect(SRC).toContain('EnableSyncConfirmDialog');
  });

  test('Sync toggle label is associated to the Switch via htmlFor', () => {
    expect(SRC).toMatch(/<label\s+htmlFor="settings-sync-toggle"/);
    expect(SRC).toMatch(/<Switch[\s\S]*?id="settings-sync-toggle"/);
  });

  test('Sync section renders an empty state when no git remote is detected', () => {
    expect(SRC).toContain('No git remote was detected');
    expect(SRC).toMatch(/data-testid="settings-sync-empty"/);
  });
});

describe('SettingsDialog SyncSection Switch — bound to local CRDT preference (not server status)', () => {
  const syncSectionStart = SRC.indexOf('function SyncSection()');
  const nextSiblingStart = SRC.indexOf('interface SettingsFieldProps', syncSectionStart);
  const syncSectionSrc = SRC.slice(syncSectionStart, nextSiblingStart);

  test('SyncSection isolation slice is non-empty (sanity)', () => {
    expect(syncSectionStart).toBeGreaterThan(-1);
    expect(nextSiblingStart).toBeGreaterThan(syncSectionStart);
    expect(syncSectionSrc.length).toBeGreaterThan(200);
  });

  test('Switch.checked derives from the local CRDT preference, not status.syncEnabled', () => {
    expect(syncSectionSrc).toMatch(/useConfigContext|projectLocalConfig/);
    expect(syncSectionSrc).not.toMatch(/const enabled\s*=\s*.*status/);
  });

  test('useGitSyncStatus still used for hasRemote + dormant visibility gate', () => {
    expect(syncSectionSrc).toContain('useGitSyncStatus');
    expect(syncSectionSrc).toMatch(/!status\.hasRemote[\s\S]*?status\.state\s*===\s*'dormant'/);
  });

  test('Switch disabled prop gates against the cold-start window', () => {
    expect(syncSectionSrc).toMatch(/disabled=\{disabledControl\}/);
    expect(syncSectionSrc).toMatch(
      /projectLocalSynced|projectLocalBinding\s*===\s*null|projectLocalConfig\s*===\s*null/,
    );
  });

  test('write path is unchanged — useSyncEnabledWriter + EnableSyncConfirmDialog', () => {
    expect(syncSectionSrc).toContain('useSyncEnabledWriter');
    expect(syncSectionSrc).toContain('useEnableSyncWithConfirm');
    expect(syncSectionSrc).toContain('EnableSyncConfirmDialog');
  });
});
