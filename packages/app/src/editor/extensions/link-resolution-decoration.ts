
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  getPageListCache,
  type PageListCacheSnapshot,
  subscribePageListCache,
} from '../page-list-cache';
import { type MarkInfo, markIdentityKey } from './mark-identity';

type PluginStateShape = { version: number };

export const linkResolutionDecorationKey = new PluginKey<PluginStateShape>(
  'linkResolutionDecoration',
);

export type LinkResolutionAttrsComputer = (
  markInfo: MarkInfo,
  cache: PageListCacheSnapshot | null,
) => Record<string, string> | null;

interface LinkResolutionDecorationOptions {
  markTypes: readonly string[];
  computeAttrs: LinkResolutionAttrsComputer;
}

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
