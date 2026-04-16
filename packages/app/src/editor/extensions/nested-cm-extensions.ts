/**
 * Shared CodeMirror extension factory (FR-33, §9.14).
 *
 * Single source of truth for every CM instance in the app — both the full-page
 * `SourceEditor` and every nested CM mounted inside a PM NodeView
 * (rawMdxFallback, future per-block source toggles).
 *
 * Both consumers share: markdown language, wiki-link + md-link decorations,
 * agent-flash decoration (when a Y.Doc is available), line wrapping, and a
 * per-instance theme Compartment. Source-mode adds `basicSetup`, y-codemirror
 * collaboration, and a full-height theme on top of this factory.
 *
 * Each nested CM instance MUST create its own Compartment for theme
 * reconfiguration. Module-scoped theme singletons cause cross-instance
 * reconfigure conflicts.
 */

import { markdown } from '@codemirror/lang-markdown';
import type { Compartment, Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicDarkInit, basicLightInit } from '@uiw/codemirror-theme-basic';
import type * as Y from 'yjs';
import { createAgentFlashSourceExtension } from '../plugins/agent-flash-source';
import { createMdLinkSourceExtension } from '../plugins/md-link-source';
import { createWikiLinkSourceExtension } from '../plugins/wiki-link-source';

// Theme factories — each caller gets a fresh theme object.
// Background is transparent so the CM inherits its host's surface:
//   - SourceEditor: host surface is `var(--background)` (the page) → reads
//     identical to a solid-background theme.
//   - rawMdxFallback wrappers: host surface is the severity-tinted wrapper
//     (muted / amber-50 / destructive/5). Without transparency, the CM
//     paints a pure-white panel inside the tinted wrapper, creating a
//     raised-panel / inner-shadow illusion. Transparent keeps the CM flush
//     with its host.
export const darkTheme = basicDarkInit({
  settings: {
    background: 'transparent',
    gutterBackground: 'transparent',
  },
});

export const lightTheme = basicLightInit({
  settings: {
    background: 'transparent',
    gutterBackground: 'transparent',
  },
});

export interface NestedCMOptions {
  /** Per-instance theme compartment — caller MUST create their own */
  themeCompartment: Compartment;
  /** Current resolved theme */
  resolvedTheme: string | undefined;
  /** Y.Doc for agent-flash decoration. When omitted, agent-flash is skipped. */
  ydoc?: Y.Doc;
  /** Override keybindings for nested mode (e.g., Cmd-Z → PM undo) */
  extraKeymaps?: Extension;
}

/**
 * Create extension array for a CodeMirror instance.
 * Shared by full-page SourceEditor and every nested CM inside a PM NodeView.
 * Excludes basicSetup, yCollab, and full-height theme — source mode adds those.
 */
export function createNestedCMExtensions(options: NestedCMOptions): Extension[] {
  const { themeCompartment, resolvedTheme, ydoc } = options;
  const theme = resolvedTheme === 'dark' ? darkTheme : lightTheme;

  // Shared visuals (font-size, font-family, line padding, focus outline,
  // scrollbar) are owned by `globals.css` so the factory doesn't compete
  // with those rules. Keep the factory to behavior (language, decorations,
  // theme, wrapping) only — that way both consumers render identically.
  return [
    markdown(),
    createWikiLinkSourceExtension(),
    createMdLinkSourceExtension(),
    ...(ydoc ? [createAgentFlashSourceExtension(ydoc)] : []),
    keymap.of([]),
    themeCompartment.of(theme),
    EditorView.lineWrapping,
    ...(options.extraKeymaps ? [options.extraKeymaps] : []),
  ];
}
