/**
 * Pure link-resolution helpers for V2 plain-DOM link chips.
 *
 * Computes the `data-resolution-state` attribute that plain-DOM link chips need
 * (today computed inside `InternalLinkView` via React hooks). Consumed by the
 * mdast→PM decoration pipeline from the eventual US-005 `internal-link.ts` rewrite:
 * `linkResolutionDecorationPlugin({markTypes: ['link'], computeAttrs: makeLinkResolutionAttrsComputer(sourceDocName)})`.
 *
 * Pure: no React, no DOM, no window globals. The `sourceDocName` is explicit
 * (InternalLinkView's `classifyCurrentMarkdownHref` implicitly reads
 * `window.location.hash` — decoupled here so caller threads the editor's
 * document name via closure capture at plugin-factory time).
 *
 * **Resolution states:**
 * - `'external'` — absolute URL (https://, mailto:, etc.) or starts with `/`
 * - `'anchor'` — starts with `#` (in-document link)
 * - `'loading'` — doc link but page-list-cache hasn't been written yet
 *   (cache === null); renders as "still computing" chrome so we don't
 *   flash the unresolved styling during first cold load
 * - `'resolved'` — doc link, target exists in `cache.pages`
 * - `'folder'` — doc link, target resolves to a folder-index
 * - `'unresolved'` — doc link, target missing (prompts create-on-click)
 *
 * Matches the exact branches `InternalLinkView.resolutionState` produces today:
 * `loading ? 'loading' : folder ? 'folder' : resolved ? 'resolved' : 'unresolved'`.
 * The 'external' + 'anchor' states are additive for V2 — InternalLinkView handles
 * those via separate render branches (ExternalLinkChip + plain-anchor).
 */

import { classifyMarkdownHref } from '@inkeep/open-knowledge-core';
import { resolveLinkTargetIntent } from '../../components/link-target-intent';
import type { PageListCacheSnapshot } from '../page-list-cache';
import type { MarkInfo } from './mark-identity';

type LinkResolutionState = 'loading' | 'external' | 'anchor' | 'resolved' | 'folder' | 'unresolved';

/**
 * Compute the resolution state for a single link href + source-doc + cache snapshot.
 *
 * Pure — takes all inputs as parameters, reads no globals. Invariants:
 * - Empty / unclassifiable href → 'unresolved'
 * - External URLs → 'external' (regardless of cache state)
 * - Anchor-only hrefs → 'anchor'
 * - Doc-link href with `cache === null` → 'loading'
 * - Doc-link href with cache populated → 'resolved' | 'folder' | 'unresolved'
 */
export function computeLinkResolutionState(
  href: string,
  sourceDocName: string,
  cache: PageListCacheSnapshot | null,
): LinkResolutionState {
  const target = classifyMarkdownHref(href, sourceDocName);
  if (!target) return 'unresolved';
  if (target.kind === 'external') return 'external';
  if (target.kind === 'anchor') return 'anchor';

  if (cache === null) return 'loading';

  const intent = resolveLinkTargetIntent(target.docName, {
    pages: cache.pages,
    folderPaths: cache.folderPaths,
  });
  if (intent.kind === 'create') return 'unresolved';
  return intent.displayState;
}

/**
 * Compute the decoration attrs record for `linkResolutionDecorationPlugin`.
 *
 * Pure adapter: {markInfo + cache + sourceDocName} → `{'data-resolution-state': state}`.
 * Returns `null` when the mark has no usable href (e.g. attrs missing / malformed)
 * so the decoration plugin skips it (cleaner than emitting a decoration with a
 * bogus value).
 */
export function computeLinkResolutionAttrs(
  markInfo: MarkInfo,
  cache: PageListCacheSnapshot | null,
  sourceDocName: string,
): Record<string, string> | null {
  const href = markInfo.attrs?.href;
  if (typeof href !== 'string' || href.length === 0) return null;
  const state = computeLinkResolutionState(href, sourceDocName, cache);
  return { 'data-resolution-state': state };
}

/**
 * Curry helper — binds `sourceDocName` so consumers can hand the resulting
 * computer directly to `linkResolutionDecorationPlugin({computeAttrs})`.
 *
 * Pattern at the eventual US-005 wiring site:
 *
 * ```ts
 * linkResolutionDecorationPlugin({
 *   markTypes: ['link'],
 *   computeAttrs: makeLinkResolutionAttrsComputer(editor.options.docName),
 * })
 * ```
 */
export function makeLinkResolutionAttrsComputer(
  sourceDocName: string,
): (markInfo: MarkInfo, cache: PageListCacheSnapshot | null) => Record<string, string> | null {
  return (markInfo, cache) => computeLinkResolutionAttrs(markInfo, cache, sourceDocName);
}
