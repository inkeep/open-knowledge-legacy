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

describe('source-level guards', () => {
  test('renders only the VISIBLE_TARGETS subset (cowork hidden from FileTree submenu)', () => {
    expect(SRC).toContain('installedTargets = VISIBLE_TARGETS.filter(');
    expect(SRC).toMatch(/installStates\[target\.id\]\?\.installed\s*===\s*true/);
  });

  test('claudeInstalled probe keys off the visible claude-code row', () => {
    expect(SRC).toMatch(/installStates\[['"]claude-code['"]\]\?\.installed\s*===\s*true/);
    expect(SRC).not.toContain("installStates['claude-cowork']");
  });

  test('preserves the Claude web-fallback row when !claudeInstalled', () => {
    expect(SRC).toContain('file-tree-open-in-claude-web-fallback');
    expect(SRC).toMatch(/!claudeInstalled\s*\?/);
  });
});

describe('webFallbackVisible prop (D25 — folder/empty-space hide the claude.ai row)', () => {
  test('prop is declared optional on the props interface', () => {
    expect(SRC).toMatch(/readonly webFallbackVisible\?:\s*boolean;/);
  });

  test("defaults to true so the file-surface caller keeps today's behavior", () => {
    expect(SRC).toMatch(/webFallbackVisible\s*=\s*true\s*\}\s*=\s*props/);
  });

  test('the web-fallback row is gated on BOTH webFallbackVisible AND !claudeInstalled', () => {
    expect(SRC).toMatch(/webFallbackVisible\s*&&\s*!claudeInstalled\s*\?/);
  });
});
