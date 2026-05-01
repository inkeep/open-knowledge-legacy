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

const SRC = readFileSync(join(__dirname, 'SettingsPane.tsx'), 'utf8');

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

  test('L3 rejection wires form.setError + form.setFocus on the rejected field', () => {
    expect(SRC).toContain('form.setError(');
    expect(SRC).toContain('form.setFocus(');
    expect(SRC).toContain("type: 'config-validation-rejected'");
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

  test('uses the shadcn Form primitive (FormField / FormControl / FormMessage)', () => {
    expect(SRC).toMatch(/from\s+['"]@\/components\/ui\/form['"]/);
    // Ensure the imported names land on the JSX (FormField is the harness
    // entry point; FormMessage owns the data-field-error attribute).
    expect(SRC).toMatch(/<FormField\b/);
    expect(SRC).toMatch(/<FormMessage\b/);
  });

  test('consumes the useConfigForm harness hook', () => {
    expect(SRC).toMatch(/from\s+['"]\.\/use-config-form['"]/);
    expect(SRC).toContain('useConfigForm(');
  });
});

describe('SettingsPane folders section integration', () => {
  test('imports FoldersSection from the settings module', () => {
    expect(SRC).toMatch(/from\s+['"]\.\/FoldersSection['"]/);
    expect(SRC).toContain('FoldersSection');
  });

  test('SectionDef is a discriminated union (scalar vs custom-folders) so illegal compositions are unrepresentable', () => {
    // The scalar variant carries `custom?: never`; the custom-folders
    // variant carries `custom: 'folders'` with `fields: []`. A refactor
    // that collapses this back to a single interface would re-permit
    // `{ custom: 'folders', fields: [{...}] }` — a composition where the
    // field would silently never render under the dispatcher early-return.
    expect(SRC).toMatch(/custom\?:\s*never/);
    expect(SRC).toMatch(/custom:\s*'folders'/);
    expect(SRC).toMatch(/fields:\s*\[\]/);
  });

  test("SECTIONS includes a folders entry with custom: 'folders' and empty fields[]", () => {
    // Locate the 'folders' SECTIONS entry by id and verify the custom tag
    // + empty fields array. A regression that flips this to the scalar
    // path would silently lose the FoldersSection render.
    const idMatch = SRC.match(/\{[\s\S]{0,400}id:\s*'folders'[\s\S]{0,400}custom:\s*'folders'/);
    expect(idMatch).toBeTruthy();
    expect(SRC).toMatch(/id:\s*'folders'[\s\S]{0,400}fields:\s*\[\]/);
  });

  test("SettingsForm dispatches on section.custom === 'folders'", () => {
    expect(SRC).toContain("section.custom === 'folders'");
    expect(SRC).toMatch(/<FoldersSection\b/);
  });

  test('SettingsForm passes form into FoldersSection (atomic-array commit needs it)', () => {
    // FoldersSection consumes form for useFieldArray + setFocus; without
    // this prop the section can't drive the array.
    expect(SRC).toMatch(/SettingsFormProps[\s\S]{0,400}form:\s*UseFormReturn<Config>/);
    expect(SRC).toMatch(/<SettingsForm[\s\S]{0,200}form=\{form\}/);
  });
});

describe('SettingsPane Sync section guards', () => {
  test('Sync section renders only on the workspace tab', () => {
    // SyncEnabled is workspace-runtime state — the toggle has no meaning on
    // the User tab. Removing this guard would surface a duplicate, broken
    // toggle on User scope.
    expect(SRC).toMatch(/scope\s*===\s*'workspace'[^\n]*<SyncSection\s*\/>/);
  });

  test('Sync section toggle goes through the shared confirmation hook', () => {
    expect(SRC).toContain("from '@/hooks/use-enable-sync-with-confirm'");
    expect(SRC).toContain('useEnableSyncWithConfirm');
    expect(SRC).toContain('EnableSyncConfirmDialog');
  });

  test('Sync toggle label is associated to the Switch via htmlFor', () => {
    // Clicking the "Git auto-sync" text must toggle the Switch — same UX
    // contract as every other settings field's <label htmlFor>.
    expect(SRC).toMatch(/<label\s+htmlFor="settings-sync-toggle"/);
    expect(SRC).toMatch(/<Switch[\s\S]*?id="settings-sync-toggle"/);
  });
});
