/**
 * React binding for V2's pure mdast → element walker (V2 SPEC FR11
 * frontend half, Audit §B2 split).
 *
 * The pure walker lives at `packages/core/src/markdown/to-react.ts` with
 * no React import. This file threads `React.createElement` through it and
 * wires the fumadocs-style `componentMap` from `./componentMap`. Consumers
 * pass markdown strings; the return value is a `React.ReactElement` tree
 * ready to mount anywhere a React subtree goes (Suspense fallback, dev
 * preview, CLI export, etc.).
 *
 * Parse path: uses the same `MarkdownManager.parseToMdast` as the editor
 * itself, so fallback render ≡ editor parse (Phase A restoreFromMdx +
 * Phase B merged walker). A stable module-level MarkdownManager instance
 * amortizes processor construction across fallback renders.
 */

import { MarkdownManager, mdastToReact, sharedExtensions } from '@inkeep/open-knowledge-core';
import { createElement, type ReactElement } from 'react';
import { getMDXComponents } from './componentMap';

// ---------------------------------------------------------------------------
// Shared MarkdownManager — one instance per app runtime. The R16 processor
// caching contract (CLAUDE.md §Markdown Pipeline) makes this safe.
// ---------------------------------------------------------------------------

let _mdManager: MarkdownManager | null = null;

function getMdManager(): MarkdownManager {
  if (!_mdManager) {
    _mdManager = new MarkdownManager({ extensions: sharedExtensions });
  }
  return _mdManager;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render markdown to a React tree via the V2 Option E walker. Suitable
 * for Suspense fallback rendering — the returned element tree is pure
 * React and can be mounted directly.
 */
export function markdownToReact(markdown: string): ReactElement {
  const mdast = getMdManager().parseToMdast(markdown);
  const tree = mdastToReact(mdast, {
    createElement,
    componentMap: getMDXComponents(),
  });
  // The walker always returns an element at the root level (root → <div>).
  // Defensive fallback in case of an empty doc.
  if (tree == null || typeof tree === 'string') {
    return createElement('div', { 'data-ok-fallback-root': '' }, tree ?? '');
  }
  return tree as ReactElement;
}
