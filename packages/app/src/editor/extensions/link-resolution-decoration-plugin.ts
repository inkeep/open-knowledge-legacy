/**
 * linkResolutionDecorationPlugin — decorates tracked link marks with caller-computed
 * attributes (typically `data-resolution-state`), refreshed whenever the module-level
 * page-list cache changes.
 *
 * Why this plugin exists
 * ----------------------
 * V2's plain-DOM link chips (US-005 internal-link / wiki-link migrations) render via
 * `renderHTML` at PM-parse time, which has no React context access. The chip still
 * needs live resolution-state classification — `resolved` / `folder` / `unresolved` /
 * `loading` / `external` — so CSS can drive its visual appearance.
 *
 * Four moving pieces:
 *   1. `markIdentityPlugin` (US-004) — assigns stable `m${n}` IDs in appendTransaction.
 *   2. `page-list-cache` (iter-22) — module-level store with pages + folderPaths sets,
 *      written by PageListProvider on every render.
 *   3. `markIdentityDecorationPlugin` (iter-20) — materializes IDs as `data-mark-id`
 *      decoration attrs.
 *   4. This plugin — reads `markIdentityPlugin`'s byId + page-list-cache; calls
 *      caller's `computeAttrs(markInfo, cache)`; emits decorations carrying those attrs.
 *
 * A consumer (e.g. the eventual internal-link.ts rewrite) installs #1, #3, and #4
 * together. #4's refresh cadence is:
 *   - Every doc-changing transaction (PM re-runs `props.decorations` unconditionally).
 *   - Every page-list-cache write (handler dispatches a meta transaction that triggers
 *     PM to re-run decorations; the meta itself is a no-op for other plugins because
 *     it is keyed by this plugin's own PluginKey).
 *
 * Decoration stacking contract
 * ----------------------------
 * When `markIdentityDecorationPlugin` AND this plugin both emit decorations over the
 * same range, PM merges their attrs (different keys stack; shared keys take the later
 * decoration's value). Because `data-mark-id` and `data-resolution-state` have
 * disjoint keys, the chip DOM ends up with both attributes applied.
 *
 * Consumer pattern (sketch for US-005 internal-link.ts)
 * -----------------------------------------------------
 *   addProseMirrorPlugins() {
 *     return [
 *       markIdentityPlugin({
 *         markTypes: ['link'],
 *         onRegister: (evt) => getInteractionLayer(editor).register(...),
 *         onDeregister: (evt) => getInteractionLayer(editor).deregister(...),
 *       }),
 *       markIdentityDecorationPlugin(),
 *       linkResolutionDecorationPlugin({
 *         markTypes: ['link'],
 *         computeAttrs: (info, cache) => {
 *           const href = info.attrs.href as string | undefined;
 *           if (!href) return null;
 *           return { 'data-resolution-state': resolveLinkState(href, cache) };
 *         },
 *       }),
 *     ];
 *   }
 *
 * @see packages/app/src/editor/page-list-cache.ts — iter-22, side-channel store
 * @see packages/app/src/editor/extensions/mark-identity-plugin.ts — US-004, ID source
 * @see packages/app/src/editor/extensions/mark-identity-decoration-plugin.ts — iter-20, pairs
 * @see specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/SPEC.md §FR5
 *
 * Precedent #9 (add-only schema) preserved — no mark attr added or narrowed; the
 * resolution-state lives in decoration attrs only.
 */

import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  getPageListCache,
  type PageListCacheSnapshot,
  subscribePageListCache,
} from '../page-list-cache';
import { type MarkInfo, markIdentityKey } from './mark-identity-plugin';

/**
 * Shape of the plugin's internal state. `version` bumps on every refresh meta so
 * consumers inspecting the plugin state externally can see that a refresh fired
 * even though it doesn't influence the decorations output itself (PM re-runs
 * `props.decorations` whenever plugin state transitions on an apply).
 */
type PluginStateShape = { version: number };

/**
 * PluginKey — exported for state lookup + meta typing.
 */
export const linkResolutionDecorationKey = new PluginKey<PluginStateShape>(
  'linkResolutionDecoration',
);

/**
 * Callback shape — maps `(markInfo, cache)` to an attrs object for the decoration
 * over that mark's range. Return null to skip emitting a decoration for this mark
 * (e.g. when `markInfo.attrs.href` is missing or when the attr set would be empty).
 */
export type LinkResolutionAttrsComputer = (
  markInfo: MarkInfo,
  cache: PageListCacheSnapshot | null,
) => Record<string, string> | null;

export interface LinkResolutionDecorationOptions {
  /**
   * Mark type names to decorate. Typically `['link']` for internal-link; could
   * also be `['wikiLink']` if wiki-links ever migrate from node to mark.
   */
  markTypes: readonly string[];
  /**
   * Caller-provided attrs resolver. Receives the latest MarkInfo (with live
   * from/to range) and the current cache snapshot (or null before first write).
   */
  computeAttrs: LinkResolutionAttrsComputer;
}

/**
 * Pure helper — given a byId map + markTypes + cache + computeAttrs, produce the
 * DecorationSet. Exported so tests can exercise the core logic without owning a
 * full EditorState + PluginKey plumbing.
 *
 * Returns null when no decorations would be emitted (mirrors PM's convention for
 * `props.decorations` returning a cheap "nothing to render" signal).
 */
export function computeLinkResolutionDecorations(
  doc: PmNode,
  byId: Map<string, MarkInfo>,
  markTypes: ReadonlySet<string>,
  computeAttrs: LinkResolutionAttrsComputer,
  cache: PageListCacheSnapshot | null,
): DecorationSet | null {
  if (byId.size === 0) return null;
  const decos: Decoration[] = [];
  for (const info of byId.values()) {
    if (!markTypes.has(info.markType)) continue;
    const attrs = computeAttrs(info, cache);
    if (attrs === null) continue;
    decos.push(Decoration.inline(info.from, info.to, attrs));
  }
  if (decos.length === 0) return null;
  return DecorationSet.create(doc, decos);
}

/**
 * Plugin factory. Installs state (for refresh-meta version tracking), props
 * (reads markIdentityPlugin's byId + cache; emits decorations), and view (subscribes
 * to page-list-cache; dispatches refresh meta on every cache change; unsubscribes
 * cleanly on plugin destroy).
 *
 * Requires `markIdentityPlugin({ markTypes })` to be installed with overlapping
 * markTypes — otherwise `markIdentityKey.getState(state)` returns null and the
 * decorations function bails out.
 */
export function linkResolutionDecorationPlugin(
  options: LinkResolutionDecorationOptions,
): Plugin<PluginStateShape> {
  const markTypeSet = new Set(options.markTypes);
  const { computeAttrs } = options;

  return new Plugin<PluginStateShape>({
    key: linkResolutionDecorationKey,
    state: {
      init: () => ({ version: 0 }),
      apply(tr, value) {
        const meta = tr.getMeta(linkResolutionDecorationKey);
        if (meta && typeof meta === 'object' && (meta as { refresh?: boolean }).refresh) {
          return { version: value.version + 1 };
        }
        return value;
      },
    },
    props: {
      decorations(state) {
        const identity = markIdentityKey.getState(state);
        if (!identity) return null;
        const cache = getPageListCache();
        return computeLinkResolutionDecorations(
          state.doc,
          identity.byId,
          markTypeSet,
          computeAttrs,
          cache,
        );
      },
    },
    view(view) {
      const unsubscribe = subscribePageListCache(() => {
        view.dispatch(view.state.tr.setMeta(linkResolutionDecorationKey, { refresh: true }));
      });
      return {
        destroy() {
          unsubscribe();
        },
      };
    },
  });
}
