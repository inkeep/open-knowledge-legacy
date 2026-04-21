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
 * Parse path: uses `parseToMdastWithFallback` — mirrors the editor's
 * `parseWithFallback` contract at the mdast layer. Never throws; on parse
 * failure, substitutes `rawMdxFallback` mdast nodes for broken blocks so
 * the fallback render matches what the editor will show once it finishes
 * mounting (review Major #5). A stable module-level MarkdownManager
 * instance amortizes processor construction across fallback renders.
 */

import {
  MarkdownManager,
  mdastToElementTree,
  parseToMdastWithFallback,
  sharedExtensions,
} from '@inkeep/open-knowledge-core';
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
 *
 * Contract: never throws. On parse failure, emits a tree that visibly
 * shows the broken MDX source inline — matching the editor's own
 * parseWithFallback behavior.
 */
export function markdownToReact(markdown: string): ReactElement {
  const mdMgr = getMdManager();
  const mdast = parseToMdastWithFallback(markdown, {
    parseToMdast: (md) => mdMgr.parseToMdast(md),
  });
  const tree = mdastToElementTree(mdast, {
    createElement,
    componentMap: getMDXComponents(),
  });
  if (tree == null || typeof tree === 'string') {
    return createElement('div', { 'data-ok-fallback-root': '' }, tree ?? '');
  }
  return tree as ReactElement;
}
