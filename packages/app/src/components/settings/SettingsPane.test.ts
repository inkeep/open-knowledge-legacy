/**
 * Module-level smoke + source-level guards for the Settings pane.
 *
 * Repo convention (see `CommandPalette.test.ts`, `EditorActivityPool.test.ts`):
 * full DOM + interaction coverage lives in Playwright stress tests; unit
 * tests guard the export shape, regression-critical strings, and the
 * architectural choice to render as a pane (NOT a Dialog overlay).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const SRC = readFileSync(join(HERE, 'SettingsPane.tsx'), 'utf8');

describe('SettingsPane module', () => {
  test('exports SettingsPane component', async () => {
    const mod = await import('./SettingsPane');
    expect(typeof mod.SettingsPane).toBe('function');
  });
});

describe('SettingsPane source-level guards', () => {
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

  test('renders as a pane, NOT a Dialog overlay', () => {
    // The architectural choice — the file should not import Dialog from ui/dialog
    // for its own structural shell. (InstallInClaudeDesktopDialog is rendered
    // inside the Integrations row, but uses its own internal Dialog.)
    expect(SRC).not.toMatch(/from\s+['"]@\/components\/ui\/dialog['"]/);
  });

  test('has Integrations section with Install in Claude Desktop row', () => {
    expect(SRC).toContain('IntegrationsSection');
    expect(SRC).toContain('Install in Claude Desktop');
    expect(SRC).toContain('InstallInClaudeDesktopDialog');
  });

  test('Integrations row uses detectClaudeDesktop bridge for hide-on-Linux', () => {
    expect(SRC).toContain('detectClaudeDesktop');
  });

  test('renders both scope sub-tabs', () => {
    expect(SRC).toContain('This project');
    expect(SRC).toContain('User');
  });

  test('uses sonner for L3 rejection toast', () => {
    expect(SRC).toContain("from 'sonner'");
    expect(SRC).toContain('toast.error(');
  });

  test('per-field reset writes default OR null-as-clear', () => {
    expect(SRC).toContain('Reset to default');
    // Post-RHF refactor: reset writes via form.setValue (defaultValue OR null
    // for fields without a schema default — null-as-clear preserves RFC 7396
    // semantics) followed by the harness's commitField.
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
});
