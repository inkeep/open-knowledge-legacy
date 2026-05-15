import { describe, expect, test } from 'bun:test';
import SRC from './OpenInAgentMenu?raw';

describe('OpenInAgentMenu module surface', () => {
  test('exports the shell component', async () => {
    const mod = await import('./OpenInAgentMenu');
    expect(typeof mod.OpenInAgentMenu).toBe('function');
  });

  test('re-exports successToastForWebFallback for surface-level wiring', async () => {
    const mod = await import('./OpenInAgentMenu');
    expect(typeof mod.successToastForWebFallback).toBe('function');
    const itemMod = await import('./OpenInAgentMenuItem');
    expect(mod.successToastForWebFallback).toBe(itemMod.successToastForWebFallback);
  });
});

describe('OpenInAgentMenu source-level guards', () => {
  test('renders only the VISIBLE_TARGETS subset (cowork hidden from this surface)', () => {
    expect(SRC).toMatch(
      /installedTargets\s*=\s*VISIBLE_TARGETS\.filter\(\s*\(target\)\s*=>\s*states\[target\.id\]\?\.installed\s*===\s*true,?\s*\)/,
    );
  });

  test('claudeInstalled probe keys off the visible claude-code row', () => {
    expect(SRC).toMatch(/states\[['"]claude-code['"]\]\?\.installed\s*===\s*true/);
    expect(SRC).not.toContain("states['claude-cowork']");
  });

  test('preserves the always-visible Claude web fallback when !claudeInstalled', () => {
    expect(SRC).toContain('open-in-agent-claude-web-fallback');
    expect(SRC).toContain('Open in claude.ai');
    expect(SRC).toMatch(/!claudeInstalled\s*\?/);
  });
});
