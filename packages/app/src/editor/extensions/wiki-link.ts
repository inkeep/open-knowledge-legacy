/**
 * App-specific WikiLink extension — V2 plain-DOM NodeView routed via the
 * shared InteractionLayer (FR4/FR6).
 *
 * Pre-V2: per-instance `ReactNodeViewRenderer(WikiLinkView)` mounted one
 * React subtree per `[[wiki-link]]` atom. V2: an imperative plain-DOM
 * NodeView mirrors the US-006 RawMdxFallback pattern — chip rendered as
 * pure DOM with `data-node-id` for InteractionLayer event delegation, and
 * a singleton `WikiLinkPropPanel` mounts at editor root on activation.
 *
 * WikiLink is an atom node (no inline content). Stable identity comes from
 * a per-NodeView monotonic counter (`wiki-link-${++counter}`) — there is no
 * mark-identity equivalent for atom nodes. This is symmetric to the
 * RawMdxFallback `nextRawMdxNodeId` pattern (US-006).
 *
 * The pre-V2 `+ [[ suggestion plugin (`configureWikiLinkSuggestion`) and the
 * Backspace/Delete keyboard shortcuts that trigger atom-deletion when the
 * wikiLink suggestion popover is closed remain unchanged — they're orthogonal
 * to the chip rendering.
 */
import { WikiLink as BaseWikiLink, classifyWikiLinkTarget } from '@inkeep/open-knowledge-core';
import { createElement } from 'react';
import { getInteractionLayer } from '../interaction-layer-host';
import { openHashHrefInNewTab, openInternalHashHrefInNewTab } from '../internal-link-helpers';
import { isSafeNavigationUrl } from '../safe-navigation-url';
import { WikiLinkPropPanel } from './WikiLinkPropPanel';
import { configureWikiLinkSuggestion, wikiLinkSuggestionKey } from './wiki-link-suggestion';

// Module-level monotonic counter — drives the stable `data-node-id` attribute
// used by InteractionLayer's event delegation. Mirrors the
// `nextRawMdxNodeId` (US-006) pattern.
let __wikiLinkNodeIdCounter = 0;

/**
 * Allocate a fresh stable node id for a WikiLink NodeView instance.
 * Exported for monotonicity testing.
 */
function nextWikiLinkNodeId(): string {
  return `wiki-link-${++__wikiLinkNodeIdCounter}`;
}

/** Reset the counter. Test-only. */
function __resetWikiLinkNodeIdCounterForTests(): void {
  __wikiLinkNodeIdCounter = 0;
}

interface BuildChipDomResult {
  dom: HTMLElement;
}

/**
 * Build the plain-DOM chip structure for a WikiLink NodeView.
 *
 * Exported for unit testing — the DOM layout (attributes, class list) can be
 * exercised without constructing a full TipTap Editor.
 */
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
  // touch-action: manipulation eliminates iOS 300ms tap delay.
  dom.style.touchAction = 'manipulation';

  // Visible label — text content of the chip.
  const labelText = params.alias ?? `${params.target}${params.anchor ? `#${params.anchor}` : ''}`;
  const labelNode = docImpl.createTextNode(labelText);
  dom.appendChild(labelNode);

  return { dom };
}

export const WikiLink = BaseWikiLink.extend({
  // Higher priority ensures the suggestion plugin's handleKeyDown fires before
  // TipTap's base keymap (Enter → split block, Backspace → joinBackward), so
  // Enter completes a suggestion and Backspace/Delete can target adjacent atoms.
  priority: 200,

  addNodeView() {
    return ({ editor, node, getPos }) => {
      const nodeId = nextWikiLinkNodeId();
      const target = String(node.attrs.target ?? '');
      const alias = node.attrs.alias != null ? String(node.attrs.alias) : null;
      const anchor = node.attrs.anchor != null ? String(node.attrs.anchor) : null;
      const { dom } = buildWikiLinkChipDom({ nodeId, target, alias, anchor });

      // Reassigned on every `update(newNode)` call — PM's NodeView contract
      // passes a fresh node object to `update`, but the factory-closure
      // `node` argument is NOT rebound. `handlePrimary` reads
      // `currentNode.attrs` so PropPanel edits flow through to the
      // Cmd/Ctrl+click destination without a full NodeView recreate
      // (review Pass-2 Major #6). Pre-fix, editing a wiki-link's target
      // via the PropPanel Save button correctly updated the visible chip
      // DOM (via the `update` hook below) but left the closure's `node`
      // variable pointing at the ORIGINAL attrs — Cmd+click then opened
      // the pre-edit target.
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
        // review Major #4: Cmd/Ctrl/middle-click opens the wiki target in
        // a new tab. Bare click falls through to the PropPanel (return
        // false). Reads `currentNode.attrs` (reassigned by the `update`
        // hook below on PropPanel edits) — review Pass-2 Major #6.
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
          // Atom node — only attrs change. Mirror updates back into the chip
          // DOM so external attr changes (e.g. PropPanel's setNodeMarkup)
          // refresh the visible label without re-creating the NodeView.
          if (updatedNode.type.name !== 'wikiLink') return false;
          // Reassign currentNode BEFORE the DOM writes so any synchronous
          // observer that reads it (unlikely in current code, but cheap
          // safety) sees consistent state (review Pass-2 Major #6).
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
        // WARN: Reads @tiptap/suggestion internal state — verify shape on upgrades.
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
