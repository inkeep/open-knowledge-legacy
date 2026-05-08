import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'SettingsDialog.tsx'), 'utf8');

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

  test('Integrations row uses detectClaudeDesktop bridge for hide-on-Linux', () => {
    expect(SRC).toContain('detectClaudeDesktop');
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

  test('mounts both user + project bindings simultaneously', () => {
    expect(SRC).toContain('useConfigDocConnections');
    expect(SRC).toMatch(
      /CONFIG_DOC_NAME_USER[\s\S]*?CONFIG_DOC_NAME_PROJECT|CONFIG_DOC_NAME_PROJECT[\s\S]*?CONFIG_DOC_NAME_USER/,
    );
  });
});

describe('SettingsDialog Channel section guards', () => {
  test('imports ChannelSection from a sibling module', () => {
    expect(SRC).toMatch(/from\s+['"]\.\/ChannelSection['"]/);
    expect(SRC).toContain('ChannelSection');
  });

  test('Channel section appears under USER in the "Preferences" item', () => {
    expect(SRC).toMatch(/activeId\s*===\s*['"]preferences['"]\s*\)[\s\S]*?<ChannelSection\s*\/>/);
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
  test('Sync section appears under THIS PROJECT in the combined "General" item', () => {
    expect(SRC).toMatch(/activeId\s*===\s*['"]project-general['"]\s*\)[\s\S]*?<SyncSection\s*\/>/);
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
});
