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

describe('OpenInAgentMenu source-level guards — skill-install INSTALL nudge wiring', () => {
  test('consumes the shared useClaudeDesktopIntegration hook', () => {
    expect(SRC).toContain('useClaudeDesktopIntegration');
    expect(SRC).toMatch(
      /skillInstalled,\s*refresh:\s*refreshIntegration\s*\}\s*=\s*useClaudeDesktopIntegration\(\)/,
    );
  });

  test('passes onInstallSkillRequest only for claude-cowork when skillInstalled === false', () => {
    expect(SRC).toMatch(
      /target\.id\s*===\s*['"]claude-cowork['"]\s*&&\s*!skillInstalled[\s\S]{0,200}setInstallDialogOpen\(true\)/,
    );
    expect(SRC).toMatch(/onInstallSkillRequest=\{onInstallSkillRequest\}/);
  });

  test('mounts InstallInClaudeDesktopDialog as a sibling of the dropdown', () => {
    expect(SRC).toContain("from '@/components/InstallInClaudeDesktopDialog'");
    expect(SRC).toMatch(/<InstallInClaudeDesktopDialog\s+open=\{installDialogOpen\}/);
  });

  test('refreshes the integration hook on dialog close (success OR cancel)', () => {
    expect(SRC).toMatch(/if\s*\(!next\)\s*refreshIntegration\(\)/);
  });

  test('preserves the installedTargets filter (no row visibility regression)', () => {
    expect(SRC).toMatch(
      /installedTargets\s*=\s*KNOWN_TARGETS\.filter\(\(target\)\s*=>\s*states\[target\.id\]\?\.installed\s*===\s*true\)/,
    );
  });

  test('preserves the always-visible Claude web fallback when !claudeInstalled', () => {
    expect(SRC).toContain('open-in-agent-claude-web-fallback');
    expect(SRC).toContain('Open in claude.ai');
    expect(SRC).toMatch(/!claudeInstalled\s*\?/);
  });
});
