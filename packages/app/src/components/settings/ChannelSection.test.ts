import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'ChannelSection.tsx'), 'utf8');

describe('ChannelSection module', () => {
  test('exports ChannelSection component', async () => {
    const mod = await import('./ChannelSection');
    expect(typeof mod.ChannelSection).toBe('function');
  });
});

describe('ChannelSection source-level guards', () => {
  test('uses the shared useUpdateChannel hook (single source of truth across Settings + future BETA badge / About panel)', () => {
    expect(SRC).toMatch(/from\s+['"]@\/hooks\/use-update-channel['"]/);
    expect(SRC).toContain('useUpdateChannel(');
  });

  test('returns null while channel is unresolved (loading or non-Electron host)', () => {
    expect(SRC).toMatch(/channel\s*===\s*null/);
    expect(SRC).toMatch(/return\s+null/);
  });

  test('exposes both channel options as RadioGroupItem with stable ids', () => {
    expect(SRC).toMatch(/<RadioGroupItem[\s\S]*?value="latest"/);
    expect(SRC).toMatch(/<RadioGroupItem[\s\S]*?value="beta"/);
    expect(SRC).toContain('id="settings-channel-latest"');
    expect(SRC).toContain('id="settings-channel-beta"');
  });

  test('Label htmlFor matches each RadioGroupItem id', () => {
    expect(SRC).toContain('htmlFor="settings-channel-latest"');
    expect(SRC).toContain('htmlFor="settings-channel-beta"');
  });

  test('renders the spec-defined description text for each option', () => {
    expect(SRC).toContain('Stable (recommended)');
    expect(SRC).toContain('Safe, well-tested releases. Recommended for everyday use.');
    expect(SRC).toContain('Beta (early access)');
    expect(SRC).toContain('Early access to in-flight features.');
  });

  test('inline confirmation references the saved channel name', () => {
    expect(SRC).toContain('Channel saved.');
    expect(SRC).toMatch(/savedFlash\s*===\s*'beta'\s*\?\s*'Beta'\s*:\s*'Stable'/);
  });

  test('inline confirmation is a polite live region (screen-reader announcement on save)', () => {
    expect(SRC).toContain('role="status"');
    expect(SRC).toContain('aria-live="polite"');
  });

  test('IPC failure surfaces a sonner toast (not a silent drop)', () => {
    expect(SRC).toMatch(/from\s+['"]sonner['"]/);
    expect(SRC).toContain('toast.error(');
  });

  test('does NOT route through the shadcn form harness — stays a sibling of SyncSection / IntegrationsSection', () => {
    expect(SRC).not.toMatch(/from\s+['"]@\/components\/ui\/form['"]/);
    expect(SRC).not.toMatch(/<FormField\b/);
    expect(SRC).not.toMatch(/<SettingsField\b/);
  });
});
