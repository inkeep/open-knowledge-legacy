import { WikiLink as BaseWikiLink, classifyWikiLinkTarget } from '@inkeep/open-knowledge-core';
import { createElement } from 'react';
import { hashFromAssetPath } from '../../lib/doc-hash';
import { getInteractionLayer } from '../interaction-layer-host';
import { openHashHrefInNewTab, openInternalHashHrefInNewTab } from '../internal-link-helpers';
import { getPageListCache } from '../page-list-cache';
import { isSafeNavigationUrl } from '../safe-navigation-url';
import { WikiLinkPropPanel } from './WikiLinkPropPanel';
import { resolveWikiLinkAssetTarget } from './wiki-link-helpers';
import { configureWikiLinkSuggestion, wikiLinkSuggestionKey } from './wiki-link-suggestion';

let __wikiLinkNodeIdCounter = 0;

function nextWikiLinkNodeId(): string {
  return `wiki-link-${++__wikiLinkNodeIdCounter}`;
}

function __resetWikiLinkNodeIdCounterForTests(): void {
  __wikiLinkNodeIdCounter = 0;
}

interface BuildChipDomResult {
  dom: HTMLElement;
}

function buildWikiLinkChipDom(params: {
  nodeId: string;
  target: string;
  alias: string | null;
  anchor: string | null;
  doc?: Pick<Document, 'createElement' | 'createTextNode'>;
}): BuildChipDomResult {
  const docImpl: Pick<Document, 'createElement' | 'createTextNode'> =
    params.doc ??
    (typeof document !== 'undefined'
      ? document
      : ({
          createElement: null as never,
          createTextNode: null as never,
        } as never));

  const dom = docImpl.createElement('span') as HTMLElement;
  dom.setAttribute('data-wiki-link', '');
  dom.setAttribute('data-node-id', params.nodeId);
  dom.setAttribute('data-target', params.target);
  dom.setAttribute('data-alias', params.alias ?? '');
  dom.setAttribute('data-anchor', params.anchor ?? '');
  dom.setAttribute('contenteditable', 'false');
  dom.setAttribute('role', 'button');
  dom.setAttribute('tabindex', '0');
  dom.setAttribute(
    'aria-label',
    `Wiki link: ${params.target}${params.anchor ? `#${params.anchor}` : ''}`,
  );
  dom.classList.add('wiki-link-chip');
  dom.style.touchAction = 'manipulation';

  const labelText = params.alias ?? `${params.target}${params.anchor ? `#${params.anchor}` : ''}`;
  const labelNode = docImpl.createTextNode(labelText);
  dom.appendChild(labelNode);

  return { dom };
}

export const WikiLink = BaseWikiLink.extend<{ docName: string }>({
  // Higher priority ensures the suggestion plugin's handleKeyDown fires before
  // TipTap's base keymap (Enter → split block, Backspace → joinBackward), so
  // Enter completes a suggestion and Backspace/Delete can target adjacent atoms.
  priority: 200,

  addOptions() {
    return {
      ...this.parent?.(),
      docName: '',
    };
  },

  addNodeView() {
    return ({ editor, node, getPos }) => {
      const nodeId = nextWikiLinkNodeId();
      const target = String(node.attrs.target ?? '');
      const alias = node.attrs.alias != null ? String(node.attrs.alias) : null;
      const anchor = node.attrs.anchor != null ? String(node.attrs.anchor) : null;
      const { dom } = buildWikiLinkChipDom({ nodeId, target, alias, anchor });

      let currentNode = node;

      const safeGetPos = (): number | undefined => {
        const pos = getPos();
        return typeof pos === 'number' ? pos : undefined;
      };

      const layer = getInteractionLayer(editor);
      layer.register({
        type: 'wikiLink',
        nodeId,
        getPos: safeGetPos,
        controls: {
          propPanel: (ctx) =>
            createElement(WikiLinkPropPanel, {
              editor,
              getPos: safeGetPos,
              onClose: ctx.deactivate,
            }),
        },
        handlePrimary: ({ newTab }) => {
          if (!newTab) return false;
          const live = currentNode.attrs;
          const liveTarget = typeof live.target === 'string' ? live.target : '';
          if (!liveTarget) return false;
          const liveAnchor = typeof live.anchor === 'string' ? live.anchor : null;
          const classified = classifyWikiLinkTarget(liveTarget, liveAnchor);
          if (!classified) return false;
          if (classified.kind === 'doc') {
            openInternalHashHrefInNewTab({
              docName: classified.docName,
              anchor: classified.anchor,
            });
            return true;
          }
          if (classified.kind === 'asset') {
            const assetPath =
              resolveWikiLinkAssetTarget(
                classified.url,
                getPageListCache()?.assetPaths ?? new Set<string>(),
              ) ?? classified.url.replace(/^\//, '');
            openHashHrefInNewTab(hashFromAssetPath(assetPath));
            return true;
          }
          // external — refuse unsafe schemes (review Major #13).
          if (!isSafeNavigationUrl(classified.url)) return false;
          openHashHrefInNewTab(classified.url);
          return true;
        },
      });

      return {
        dom,
        ignoreMutation: () => true,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'wikiLink') return false;
          currentNode = updatedNode;
          const newTarget = String(updatedNode.attrs.target ?? '');
          const newAlias = updatedNode.attrs.alias != null ? String(updatedNode.attrs.alias) : null;
          const newAnchor =
            updatedNode.attrs.anchor != null ? String(updatedNode.attrs.anchor) : null;
          dom.setAttribute('data-target', newTarget);
          dom.setAttribute('data-alias', newAlias ?? '');
          dom.setAttribute('data-anchor', newAnchor ?? '');
          dom.setAttribute(
            'aria-label',
            `Wiki link: ${newTarget}${newAnchor ? `#${newAnchor}` : ''}`,
          );
          const labelText = newAlias ?? `${newTarget}${newAnchor ? `#${newAnchor}` : ''}`;
          dom.textContent = labelText;
          return true;
        },
        destroy: () => {
          layer.deregister(nodeId);
        },
      };
    };
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const pluginState = wikiLinkSuggestionKey.getState(this.editor.state) as
          | { active: boolean }
          | undefined;
        if (pluginState?.active) return false;

        const { selection } = this.editor.state;
        if (!selection.empty) return false;

        const nodeBefore = selection.$from.nodeBefore;
        if (nodeBefore?.type.name === 'wikiLink') {
          const { state, view } = this.editor;
          view.dispatch(state.tr.delete(selection.from - nodeBefore.nodeSize, selection.from));
          return true;
        }
        return false;
      },
      Delete: () => {
        const pluginState = wikiLinkSuggestionKey.getState(this.editor.state) as
          | { active: boolean }
          | undefined;
        if (pluginState?.active) return false;

        const { selection } = this.editor.state;
        if (!selection.empty) return false;

        const nodeAfter = selection.$from.nodeAfter;
        if (nodeAfter?.type.name === 'wikiLink') {
          const { state, view } = this.editor;
          view.dispatch(state.tr.delete(selection.from, selection.from + nodeAfter.nodeSize));
          return true;
        }
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [configureWikiLinkSuggestion(this.editor)];
  },
});
