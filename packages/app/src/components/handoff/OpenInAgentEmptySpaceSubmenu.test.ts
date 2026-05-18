import { describe, expect, test } from 'bun:test';
import { emptySpaceRowHint } from './OpenInAgentEmptySpaceSubmenu';
import SRC from './OpenInAgentEmptySpaceSubmenu?raw';

describe('OpenInAgentEmptySpaceSubmenu module', () => {
  test('exports the OpenInAgentEmptySpaceSubmenu component', async () => {
    const mod = await import('./OpenInAgentEmptySpaceSubmenu');
    expect(typeof mod.OpenInAgentEmptySpaceSubmenu).toBe('function');
  });

  test('exports emptySpaceRowHint helper for accessibility-label coherence', () => {
    expect(typeof emptySpaceRowHint).toBe('function');
  });
});

describe('emptySpaceRowHint — pure helper contract', () => {
  test('returns "No workspace" when input is missing (workspace not yet resolved)', () => {
    expect(emptySpaceRowHint(true)).toBe('No workspace');
  });

  test('returns null when input is ready', () => {
    expect(emptySpaceRowHint(false)).toBeNull();
  });
});

describe('OpenInAgentEmptySpaceSubmenu source-level guards', () => {
  test('imports ContextMenu submenu primitives (NOT DropdownMenu)', () => {
    expect(SRC).toMatch(
      /import\s*\{[\s\S]*?\bContextMenuItem\b[\s\S]*?\bContextMenuSub\b[\s\S]*?\bContextMenuSubContent\b[\s\S]*?\bContextMenuSubTrigger\b[\s\S]*?\}\s*from\s*['"]@\/components\/ui\/context-menu['"]/,
    );
    expect(SRC).not.toMatch(
      /import\s*\{[^}]*\bDropdownMenuSub\b[^}]*\}\s*from\s*['"]@\/components\/ui\/dropdown-menu/,
    );
  });

  test('renders ContextMenuSub root, NOT DropdownMenuSub', () => {
    expect(SRC).toMatch(/<ContextMenuSub>/);
    expect(SRC).toMatch(/<ContextMenuSubTrigger>/);
    expect(SRC).toMatch(/<ContextMenuSubContent>/);
    expect(SRC).not.toMatch(/<DropdownMenuSub>/);
  });

  test('trigger uses the canonical Sparkles icon + "Open with AI" label (D13)', () => {
    expect(SRC).toMatch(
      /<ContextMenuSubTrigger>\s*\n?\s*<Sparkles\s+aria-hidden="true"\s*\/>\s*\n?\s*Open with AI\s*\n?\s*<\/ContextMenuSubTrigger>/,
    );
  });

  test('webFallbackVisible prop defaults to true (file-surface parity)', () => {
    expect(SRC).toMatch(/webFallbackVisible\s*\??\s*:\s*boolean/);
    expect(SRC).toMatch(/webFallbackVisible\s*=\s*true/);
  });

  test('web fallback row is gated by both webFallbackVisible AND !claudeInstalled', () => {
    expect(SRC).toMatch(/webFallbackVisible\s*&&\s*!claudeInstalled/);
  });

  test('per-target aria-label uses "Open with AI <displayName>" (D13)', () => {
    expect(SRC).toMatch(
      /accessibleLabel\s*=\s*hint\s*\?\s*`Open with AI\s+\$\{target\.displayName\},\s*\$\{hint\}`\s*:\s*`Open with AI\s+\$\{target\.displayName\}`/,
    );
  });

  test('install-state filter is `installed === true` (v1 contract)', () => {
    expect(SRC).toMatch(/installStates\[target\.id\]\?\.installed\s*===\s*true/);
  });

  test('Claude web-fallback prompt uses composeFilePrompt for file scope, empty string otherwise', () => {
    expect(SRC).toMatch(
      /input\s*!==\s*null\s*&&\s*input\.docContext\s*!==\s*null\s*\?\s*composeFilePrompt\(\s*input\.docContext\.relativePath\s*\)\s*:\s*['"]['"]\s*;/,
    );
  });

  test('data-testid pattern uses "empty-space-open-in-<id>" prefix', () => {
    expect(SRC).toMatch(/data-testid=\{`empty-space-open-in-\$\{target\.id\}`\}/);
    expect(SRC).toMatch(/data-testid="empty-space-open-in-claude-web-fallback"/);
  });

  test('does NOT depend on isElectronHost — install-state filter subsumes host detection', () => {
    expect(SRC).not.toMatch(/isElectronHost/);
  });
});
