/**
 * Shared CodeMirror extension factory (FR-33, §9.14).
 *
 * Creates CodeMirror Extension[] arrays for two modes:
 * - 'source': main SourceEditor (includes basicSetup, gutter, history, y-codemirror.next)
 * - 'nested': embedded CM inside a PM NodeView (excludes gutter, history — PM owns undo)
 *
 * Both modes share: markdown language, wiki-link + md-link decorations,
 * agent flash, line wrapping, and per-instance theme Compartment.
 *
 * Each nested CM instance MUST create its own Compartment for theme
 * reconfiguration. Module-scoped theme singletons cause cross-instance
 * reconfigure conflicts.
 */

import { markdown } from '@codemirror/lang-markdown';
import type { Compartment, Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicDarkInit, basicLightInit } from '@uiw/codemirror-theme-basic';

// Theme factories — each caller gets a fresh theme object
export const darkTheme = basicDarkInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--background)',
  },
});

export const lightTheme = basicLightInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--background)',
  },
});

export interface NestedCMOptions {
  /** Per-instance theme compartment — caller MUST create their own */
  themeCompartment: Compartment;
  /** Current resolved theme */
  resolvedTheme: string | undefined;
  /** Override keybindings for nested mode (e.g., Cmd-Z → PM undo) */
  extraKeymaps?: Extension;
}

/**
 * Create extension array for a nested CodeMirror instance inside a PM NodeView.
 * Excludes basicSetup (gutter, history, search — PM owns these).
 * Includes markdown language, decorations, line wrapping, and theme.
 */
export function createNestedCMExtensions(options: NestedCMOptions): Extension[] {
  const { themeCompartment, resolvedTheme } = options;
  const theme = resolvedTheme === 'dark' ? darkTheme : lightTheme;

  return [
    markdown(),
    keymap.of([]),
    themeCompartment.of(theme),
    EditorView.lineWrapping,
    EditorView.theme({
      '&': {
        fontSize: '13px',
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
      },
      '.cm-content': {
        padding: '8px 0',
      },
      '.cm-line': {
        padding: '0 8px',
      },
      '&.cm-focused': {
        outline: 'none',
      },
    }),
    ...(options.extraKeymaps ? [options.extraKeymaps] : []),
  ];
}
