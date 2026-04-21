/**
 * App-layer LinkFidelity extension — V2 plain-DOM chip routed via the shared
 * InteractionLayer (FR4/FR5).
 *
 * Pre-V2: per-instance `ReactMarkViewRenderer(InternalLinkView)` mounted one
 * React subtree per `<a>` mark — 768 portals on PROJECT.md with ~2.2s of
 * React reconciliation cost on cold-pool-warm (cold-mount-profile §Corrected
 * 5-component attribution).
 *
 * V2: `renderHTML` emits a plain `<span data-link>` containing a child
 * `<a>`. The mark-identity / mark-interaction-bridge / decoration plugin
 * stack (US-004 + iter-20/21/23/24/25 prep) attaches `data-mark-id` and
 * `data-resolution-state` decoration attrs at PM render time, and routes
 * clicks to the singleton `InternalLinkPropPanel` at editor root.
 *
 * **Click semantics (greenfield, simplified):** click on chip activates
 * the InteractionLayer for this mark — the singleton PropPanel surfaces
 * Open / Edit / Remove (and Create-Page when unresolved). Cmd/Ctrl+Click
 * still opens in a new tab via the chip's child `<a href=...>` natural
 * navigation. This collapses the pre-V2 split-button (anchor-navigates +
 * ellipsis-opens-menu) into one consistent affordance.
 *
 * **docName threading:** consumers call `InternalLink.configure({docName})`
 * to bind the active doc name (used by the link-resolution decoration
 * plugin to compute `data-resolution-state` against the page-list cache).
 * `TiptapEditor.tsx` invokes `.configure` with `provider.configuration.name`.
 *
 * Schema unchanged (precedent #9 add-only). All identity + resolution state
 * lives in PluginState / decoration attrs.
 */
import { LinkFidelity } from '@inkeep/open-knowledge-core';
import { mergeAttributes } from '@tiptap/core';
import { createElement } from 'react';
import { InternalLinkPropPanel } from './InternalLinkPropPanel';
import { makeLinkResolutionAttrsComputer } from './link-resolution';
import { linkResolutionDecorationPlugin } from './link-resolution-decoration-plugin';
import { markIdentityDecorationPlugin } from './mark-identity-decoration-plugin';
import { createMarkInteractionBridgePlugin } from './mark-interaction-bridge';

export interface InternalLinkOptions {
  /** Active document name — used by link-resolution decoration to compute resolved/folder/unresolved states. */
  docName: string;
}

export const InternalLink = LinkFidelity.extend<InternalLinkOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      docName: '',
    };
  },

  renderHTML({ HTMLAttributes }) {
    // Plain-DOM chip — a single <span> with link text inline. We deliberately
    // omit the `<a href>` child that the pre-V2 React MarkView wrapped its
    // text in: clicking an `<a>` navigates immediately, which races the
    // InteractionLayer's pointerdown handler (the layer fires setActiveNode,
    // but the browser navigation aborts the React render before the singleton
    // PropPanel can mount). The V2 click semantics route through the
    // PropPanel's "Open" button — same destination, deterministic flow.
    //
    // The decoration plugins add data-mark-id (mark-identity-decoration-plugin)
    // and data-resolution-state (link-resolution-decoration-plugin) at render
    // time; CSS in globals.css styles the chip based on the latter. The
    // original href stays in the link mark's attrs (read by PropPanel for
    // navigate / edit) — it's just not rendered as a navigable element.
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-link': '',
        role: 'link',
        // touch-action: manipulation eliminates the iOS 300ms tap delay.
        style: 'touch-action: manipulation;',
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const docName = this.options.docName ?? '';
    return [
      // 1. mark-identity (PluginState IDs) + InteractionLayer wiring
      createMarkInteractionBridgePlugin({
        editor: this.editor,
        markTypes: ['link'],
        renderPropPanel: ({ editor, nodeId, deactivate }) =>
          createElement(InternalLinkPropPanel, {
            editor,
            nodeId,
            sourceDocName: docName,
            onClose: deactivate,
          }),
      }),
      // 2. data-mark-id decoration so the layer's event delegation can resolve
      //    chips → mark IDs without per-instance React.
      markIdentityDecorationPlugin(),
      // 3. data-resolution-state decoration so chip CSS can style based on
      //    resolved/folder/unresolved/loading/external/anchor state.
      linkResolutionDecorationPlugin({
        markTypes: ['link'],
        computeAttrs: makeLinkResolutionAttrsComputer(docName),
      }),
    ];
  },
});
