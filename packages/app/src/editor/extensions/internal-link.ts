/**
 * App-layer LinkFidelity extension — V2 plain-DOM chip routed via the shared
 * InteractionLayer (FR4/FR5).
 *
 * Pre-V2: per-instance `ReactMarkViewRenderer(InternalLinkView)` mounted one
 * React subtree per `<a>` mark — 768 portals on PROJECT.md with ~2.2s of
 * React reconciliation cost on cold-pool-warm (cold-mount-profile §Corrected
 * 5-component attribution).
 *
 * V2: `renderHTML` emits a plain `<span data-link role="link" tabindex="0">`
 * with an `aria-label`. The mark-identity / mark-interaction-bridge /
 * decoration plugin stack (US-004 + iter-20/21/23/24/25 prep) attaches
 * `data-mark-id` and `data-resolution-state` decoration attrs at PM render
 * time. The InteractionLayer's event delegation routes pointer AND keyboard
 * activation to the shared PropPanel at editor root.
 *
 * **Click / keyboard semantics (review-Critical #3 + Major #4):**
 *   - bare click / Enter / Space on a focused chip opens the singleton
 *     `InternalLinkPropPanel` (Open / Edit / Remove / Create-Page actions).
 *   - Cmd/Ctrl+click (and middle-click button=1) routes through the
 *     extension's `handlePrimary` hook to navigate immediately in a new
 *     tab — preserving the universal web link convention without
 *     reintroducing a child `<a href>` that would race the event
 *     delegation. The hook is also the only place Cmd+Click semantics
 *     live; the PropPanel's "Open" button remains the in-panel affordance.
 *   - Escape dismisses the active PropPanel (handled at the layer).
 *
 * **docName threading:** consumers call `InternalLink.configure({docName})`
 * to bind the active doc name (used by the link-resolution decoration
 * plugin to compute `data-resolution-state` against the page-list cache).
 * `TiptapEditor.tsx` invokes `.configure` with `provider.configuration.name`.
 *
 * Schema unchanged (precedent #9 add-only). All identity + resolution state
 * lives in PluginState / decoration attrs.
 */
import {
  assertNeverLinkTarget,
  classifyMarkdownHref,
  extractAssetExtension,
  LinkFidelity,
  resolveAssetProjectPath,
} from '@inkeep/open-knowledge-core';
import { mergeAttributes } from '@tiptap/core';
import { createElement } from 'react';
import { dispatchAssetClick } from '../asset-dispatch';
import { openHashHrefInNewTab, openInternalHashHrefInNewTab } from '../internal-link-helpers';
import { createAssetContextMenuPlugin } from '../plugins/asset-context-menu';
import { isSafeNavigationUrl } from '../safe-navigation-url';
import { InternalLinkPropPanel } from './InternalLinkPropPanel';
import { makeLinkResolutionAttrsComputer } from './link-resolution';
import { linkResolutionDecorationPlugin } from './link-resolution-decoration';
import { markIdentityDecorationPlugin } from './mark-identity-decoration';
import { createMarkInteractionBridgePlugin, getCurrentMarkInfo } from './mark-interaction-bridge';

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
    // InteractionLayer's pointerdown handler. Cmd/Ctrl+Click semantics live
    // in the extension's `handlePrimary` hook below — see file-header
    // comment for the full rationale.
    //
    // Accessibility (review Critical #3):
    //   - `tabindex="0"` makes the chip keyboard-reachable.
    //   - `role="link"` matches the semantic intent.
    //   - `aria-label` surfaces the destination to assistive tech
    //     (falls back to "Link" when href is missing).
    //
    // The decoration plugins add data-mark-id (mark-identity-decoration)
    // and data-resolution-state (link-resolution-decoration) at render
    // time; CSS in globals.css styles the chip based on the latter. The
    // original href stays in the link mark's attrs (read by PropPanel +
    // handlePrimary for navigate/edit) — it's just not rendered as a
    // navigable element.
    const href = typeof HTMLAttributes.href === 'string' ? HTMLAttributes.href : '';
    const ariaLabel = href ? `Link: ${href}` : 'Link';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-link': '',
        role: 'link',
        tabindex: '0',
        'aria-label': ariaLabel,
        // touch-action: manipulation eliminates the iOS 300ms tap delay.
        style: 'touch-action: manipulation;',
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const docName = this.options.docName ?? '';
    return [
      // 1. mark-identity (PluginState IDs) + InteractionLayer wiring + Cmd+Click new-tab
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
        handlePrimary: ({ editor, nodeId, newTab }) => {
          const info = getCurrentMarkInfo(editor.state, nodeId);
          const href = info?.attrs?.href;
          if (typeof href !== 'string' || !href) return false;

          // Asset dispatch branch. Fires on BOTH bare click AND
          // Cmd/Ctrl+click — asset hrefs never open the PropPanel.
          // Cmd+click forces OS delegation as an escape hatch.
          //
          // Two paths enter this branch:
          //   1. `classifyMarkdownHref` returned `kind: 'asset'` — the
          //      href is a plain relative path with a non-md/mdx
          //      extension.
          //   2. `sourceForm === 'wikiembed'` + the href shape looks
          //      asset-like (has an extension). This captures post-
          //      roundtrip `![[file.ext]]` refs that emit as server-
          //      absolute paths (`/file.ext`) — classifier returns
          //      `external` for leading-slash paths, but the
          //      `sourceForm` tag tells us unambiguously that this
          //      came from a wiki-embed. Without this branch, post-
          //      reload clicks on server-absolute asset hrefs open
          //      the PropPanel instead of the file.
          //      `resolveAssetProjectPath` handles the leading slash.
          const sourceForm = info?.attrs?.sourceForm;
          const target = classifyMarkdownHref(href, docName);
          const hrefExt = extractAssetExtension(href);
          const isAssetShape =
            target?.kind === 'asset' || (sourceForm === 'wikiembed' && hrefExt !== null);
          if (isAssetShape) {
            const url = target?.kind === 'asset' ? target.url : href;
            const ext = target?.kind === 'asset' ? target.ext : (hrefExt ?? '');
            const projectRelPath = resolveAssetProjectPath(url, docName);
            if (!projectRelPath) {
              // Path-escape detected at the renderer boundary — fall
              // through to PropPanel so the author sees the suspicious
              // href. Main-process `openAssetSafely` is the defense-in-
              // depth if the renderer ever calls with an escape.
              return false;
            }
            void dispatchAssetClick({
              url,
              projectRelPath,
              ext,
              title: projectRelPath.split('/').pop() ?? url,
              forceOsDelegation: newTab,
            });
            return true;
          }

          // Non-asset paths — only handle Cmd/Ctrl/middle-click
          // (newTab=true). Bare click opens the PropPanel (fall through
          // by returning false).
          if (!newTab) return false;
          if (!target) return false;
          // `target.kind === 'asset'` is excluded by the isAssetShape
          // early-return above, so TypeScript narrows `target` to the
          // remaining three variants here.
          switch (target.kind) {
            case 'doc':
              openInternalHashHrefInNewTab({ docName: target.docName, anchor: target.anchor });
              return true;
            case 'anchor':
              // Anchor lives inside the current doc — "new tab" on an
              // in-page anchor is an app-level concept, preserve it via the
              // same hash-href helper.
              openInternalHashHrefInNewTab({ docName, anchor: target.anchor });
              return true;
            case 'external':
              // Refuse javascript:/data:/etc via scheme allowlist
              // (review Major #13). Fall through if unsafe so the PropPanel
              // still opens and surfaces the unsafe URL for the author to edit.
              if (!isSafeNavigationUrl(target.url)) return false;
              openHashHrefInNewTab(target.url);
              return true;
            default:
              return assertNeverLinkTarget(target);
          }
        },
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
      // 4. Right-click context menu for on-disk references. Attaches
      //    a `contextmenu` DOM listener on `editor.view.dom` and
      //    routes matched targets
      //    (wiki-embed chips, asset link marks, images) through the
      //    showAssetMenu IPC. No-op in web (browser default).
      createAssetContextMenuPlugin({ sourceDocName: docName }),
    ];
  },
});
