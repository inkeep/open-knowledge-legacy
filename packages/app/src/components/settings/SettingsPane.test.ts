
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
});

describe('SettingsPane folders section integration', () => {
  test('imports FoldersSection from the settings module', () => {
    expect(SRC).toMatch(/from\s+['"]\.\/FoldersSection['"]/);
    expect(SRC).toContain('FoldersSection');
  });

  test('SectionDef is a discriminated union (scalar vs custom-folders) so illegal compositions are unrepresentable', () => {
    expect(SRC).toMatch(/custom\?:\s*never/);
    expect(SRC).toMatch(/custom:\s*'folders'/);
    expect(SRC).toMatch(/fields:\s*\[\]/);
  });

  test("SECTIONS includes a folders entry with custom: 'folders' and empty fields[]", () => {
    const idMatch = SRC.match(/\{[\s\S]{0,400}id:\s*'folders'[\s\S]{0,400}custom:\s*'folders'/);
    expect(idMatch).toBeTruthy();
    expect(SRC).toMatch(/id:\s*'folders'[\s\S]{0,400}fields:\s*\[\]/);
  });

  test("SettingsForm dispatches on section.custom === 'folders'", () => {
    expect(SRC).toContain("section.custom === 'folders'");
    expect(SRC).toMatch(/<FoldersSection\b/);
  });

  test('SettingsForm passes form into FoldersSection (atomic-array commit needs it)', () => {
    expect(SRC).toMatch(/SettingsFormProps[\s\S]{0,400}form:\s*UseFormReturn<Config>/);
    expect(SRC).toMatch(/<SettingsForm[\s\S]{0,200}form=\{form\}/);
  });
});
