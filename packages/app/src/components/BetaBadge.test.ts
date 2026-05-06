import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'BetaBadge.tsx'), 'utf8');

describe('BetaBadge module', () => {
  test('exports BetaBadge component', async () => {
    const mod = await import('./BetaBadge');
    expect(typeof mod.BetaBadge).toBe('function');
  });
});

describe('BetaBadge source-level guards', () => {
  test('uses the shared useUpdateChannel hook (single source of truth across Settings + chrome + About panel)', () => {
    expect(SRC).toMatch(/from\s+['"]@\/hooks\/use-update-channel['"]/);
    expect(SRC).toContain('useUpdateChannel(');
  });

  test('returns null when channel is anything other than beta (covers latest AND null/loading)', () => {
    expect(SRC).toMatch(/channel\s*!==\s*['"]beta['"]/);
    expect(SRC).toMatch(/return\s+null/);
  });

  test('renders a shadcn Badge primitive (not a custom div / dock-icon / app-name surface)', () => {
    expect(SRC).toMatch(/from\s+['"]\.\/ui\/badge['"]/);
    expect(SRC).toMatch(/<Badge\b/);
    expect(SRC).toMatch(/variant=["']secondary["']/);
  });

  test('renders the literal text "BETA"', () => {
    expect(SRC).toMatch(/>\s*BETA\s*</);
  });

  test('exposes accessibility + test seams', () => {
    expect(SRC).toContain('aria-label="Beta channel"');
    expect(SRC).toContain('data-testid="beta-badge"');
  });

  test('accepts an optional className for layout overrides without forking the component', () => {
    expect(SRC).toMatch(/className\?:\s*string/);
    expect(SRC).toContain('className={className}');
  });
});
