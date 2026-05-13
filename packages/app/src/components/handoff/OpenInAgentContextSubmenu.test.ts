import { describe, expect, test } from 'bun:test';
import { contextRowHint } from './OpenInAgentContextSubmenu';
import SRC from './OpenInAgentContextSubmenu?raw';

describe('contextRowHint (v1: inputMissing only)', () => {
  test('inputMissing=false (workspace known): returns null (no hint)', () => {
    expect(contextRowHint(false)).toBeNull();
  });

  test('inputMissing=true (no workspace): returns "No workspace"', () => {
    expect(contextRowHint(true)).toBe('No workspace');
  });
});

describe('module surface', () => {
  test('exports OpenInAgentContextSubmenu + contextRowHint', async () => {
    const mod = await import('./OpenInAgentContextSubmenu');
    expect(typeof mod.OpenInAgentContextSubmenu).toBe('function');
    expect(typeof mod.contextRowHint).toBe('function');
  });
});

describe('source-level guards — skill-install INSTALL nudge wiring', () => {
  test('consumes the shared useClaudeDesktopIntegration hook', () => {
    expect(SRC).toContain('useClaudeDesktopIntegration');
    expect(SRC).toMatch(
      /skillInstalled,\s*refresh:\s*refreshIntegration\s*\}\s*=\s*useClaudeDesktopIntegration\(\)/,
    );
  });

  test('badge predicate routed through the shared `shouldShowSkillInstallBadge` (no open-coding)', () => {
    expect(SRC).toContain('shouldShowSkillInstallBadge');
    expect(SRC).toMatch(
      /enabled\s*&&\s*!skillInstalled\s*\?\s*\(\s*\)\s*=>\s*setInstallDialogOpen\(true\)/,
    );
  });

  test('badge click routes to setInstallDialogOpen(true) instead of dispatch', () => {
    expect(SRC).toMatch(
      /if\s*\(showSkillInstallBadge\s*&&\s*onInstallSkillRequest\)\s*\{\s*onInstallSkillRequest\(\)/,
    );
    expect(SRC).toMatch(/else\s*\{[\s\S]{0,80}dispatch\(target\.id,\s*input\)/);
  });

  test('badge span carries the canonical data-testid', () => {
    expect(SRC).toContain('"open-in-agent-skill-install-badge"');
  });

  test('mounts InstallInClaudeDesktopDialog as a sibling of the submenu', () => {
    expect(SRC).toContain("from '@/components/InstallInClaudeDesktopDialog'");
    expect(SRC).toMatch(/<InstallInClaudeDesktopDialog\s+open=\{installDialogOpen\}/);
  });

  test('refreshes the integration hook on dialog close', () => {
    expect(SRC).toMatch(/if\s*\(!next\)\s*refreshIntegration\(\)/);
  });

  test('preserves the installedTargets filter (no row visibility regression)', () => {
    expect(SRC).toContain('installedTargets = KNOWN_TARGETS.filter(');
    expect(SRC).toMatch(/installStates\[target\.id\]\?\.installed\s*===\s*true/);
  });

  test('preserves the Claude web-fallback row when !claudeInstalled', () => {
    expect(SRC).toContain('file-tree-open-in-claude-web-fallback');
    expect(SRC).toMatch(/!claudeInstalled\s*\?/);
  });
});
