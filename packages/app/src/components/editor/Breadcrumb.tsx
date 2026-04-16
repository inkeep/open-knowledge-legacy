/**
 * Breadcrumb — editor-footer ancestry trail for the current block selection
 * (SPEC §3.5, pattern from WordPress Gutenberg).
 *
 * Renders `Document › Cards › Card › Steps › Step` when a deeply-nested block
 * is selected; each ancestor segment is a clickable button that NodeSelects
 * that ancestor. The innermost (currently-selected) segment is non-interactive
 * with `aria-current='location'` — WAI-ARIA 1.2 specifies `location` for
 * "the current location within an environment or context," which matches
 * block-ancestor navigation within a single document better than the generic
 * `true`. (`page` is the canonical breadcrumb value for cross-page trails;
 * we're navigating block ancestry within one document, so `location` fits.)
 *
 * Layout: container is always rendered with a reserved min-height so
 * selecting / deselecting a block does not cause a footer layout shift
 * (~28px pump visible on rapid drag-select). Content is conditional; the
 * empty state collapses to `aria-hidden` with no interactive children.
 * The "Document" segment is interactive — clicking it clears the block
 * selection (Notion / Gutenberg "return to document body" affordance).
 *
 * Overflow strategy: head-truncation. With 5+ ancestors, leading entries
 * past the first one collapse to a single `…` segment so the innermost
 * (most important) two are always visible. Naive right-truncation would
 * hide the *focused* segment; we keep it visible by design.
 *
 * Click-time pos resolution: ancestor entries store the PM `pos` captured
 * at render time. In a collaborative session, remote edits between render
 * and click can shift positions, so we re-resolve via the entry's stable
 * `bridgeId` against the live `posToId` map at click time. Falls through
 * to the captured `pos` if bridge-id-plugin isn't registered (test envs).
 *
 * Unregistered components (descriptor resolves to wildcard `'*'`) surface
 * the original `componentName` from the entry, not `"*"` — the real name
 * is the only useful label for AT users.
 */

import type { Editor } from '@tiptap/core';
import { ChevronRight } from 'lucide-react';
import { bridgeIdPluginKey } from '../../editor/extensions/bridge-id-plugin.ts';
import {
  type BlockChainEntry,
  SELECTION_ORIGIN_META_KEY,
} from '../../editor/extensions/selection-state-plugin.ts';
import { useBlockSelection } from '../../editor/hooks/use-block-selection.ts';
import { getEntryLabel } from '../../editor/selection/entry-label.ts';

/** With 5+ ancestors, the leading chain past the first kept entry collapses
 *  into a single `…` segment. Always keeps the document anchor + the first
 *  ancestor + the innermost two — so user keeps orientation at both ends. */
const MAX_VISIBLE_SEGMENTS = 4;

export function Breadcrumb({ editor }: { editor: Editor | null }) {
  const blockSelection = useBlockSelection(editor);
  const hasSelection = Boolean(editor && blockSelection && blockSelection.ancestorChain.length > 0);

  // Render the container unconditionally — `min-h-[28px]` reserves the
  // footer height so selecting / deselecting never shifts the editor body.
  // When no block is selected, the nav is empty with no visual border; the
  // space is held but the divider line stays invisible until a selection
  // exists, matching the pre-fix "footer appears only with content" intent
  // without the layout-shift pump.
  return (
    <nav
      aria-label="Block ancestor navigation"
      aria-hidden={hasSelection ? undefined : 'true'}
      className={`jsx-component-breadcrumb flex items-center gap-1 min-h-[28px] px-3 py-1.5 text-xs font-mono text-muted-foreground overflow-hidden ${hasSelection ? 'border-t border-border' : ''}`}
    >
      {hasSelection && blockSelection ? (
        <BreadcrumbContent editor={editor as Editor} blockSelection={blockSelection} />
      ) : null}
    </nav>
  );
}

/**
 * Resolve an ancestor entry to a live PM position. Reads the bridge-id-plugin's
 * `posToId` map at click time so collaborative edits between render and click
 * don't target stale positions.
 *
 * Return semantics:
 *   - **number**: live position resolved (production happy path), OR the
 *     captured `entry.pos` because bridge-id-plugin isn't registered (test
 *     harness fallback only).
 *   - **null**: bridge-id-plugin IS registered but the entry's `bridgeId` is
 *     no longer in `posToId` — most plausibly a remote peer deleted the
 *     ancestor between render and click. Callers no-op the click; firing
 *     `setNodeSelection(entry.pos)` would target whatever node now occupies
 *     that pos (the original stale-pos bug).
 */
function resolveLivePos(editor: Editor, entry: BlockChainEntry): number | null {
  const posToId = bridgeIdPluginKey.getState(editor.state)?.posToId;
  // No plugin → harness/test environment; the captured pos is the best we
  // have, and tests don't shift positions between render and click.
  if (!posToId) return entry.pos;
  for (const [livePos, id] of posToId) {
    if (id === entry.bridgeId) return livePos;
  }
  // Plugin registered but bridgeId gone — node was deleted. Returning
  // entry.pos here would re-introduce the stale-pos bug under a strict
  // subset of conditions (selecting whatever now occupies that offset).
  return null;
}

function BreadcrumbContent({
  editor,
  blockSelection,
}: {
  editor: Editor;
  blockSelection: NonNullable<ReturnType<typeof useBlockSelection>>;
}) {
  const { ancestorChain, selectedBlockId } = blockSelection;

  // Head-truncate: if the chain is long enough to overflow, fold leading
  // ancestors into a `…` and keep `[head, …, ...tail]`. The innermost two
  // are always tail; the user's focused block stays visible.
  const visible = computeVisibleEntries(ancestorChain);

  return (
    <>
      {/* "Document" anchor — clicking returns selection to the document body
          (clears block selection). Stamps SELECTION_ORIGIN_META on the same
          tx as the selection change, so the plugin's `computeSelectionApply`
          reads 'programmatic' in the same apply pass that sees the new
          selection. Dispatching the meta separately from the selection
          would be two applies, and a future plugin inserting an
          interleaving apply could consume the pending origin before the
          selection change lands. */}
      {/* TODO(i18n): "Document" is hard-coded English. See parallel TODO
          on JsxComponentView's groupAriaLabel (same future migration). */}
      <button
        type="button"
        className="opacity-60 hover:opacity-100 hover:text-foreground transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        onClick={() => {
          // Single tx: selection change + origin meta + focus via chain().
          // `.command({tr})` runs before `.run()` finishes the tx, so setMeta
          // lands on the same tx as setTextSelection.
          editor
            .chain()
            .focus()
            .setTextSelection(0)
            .command(({ tr }) => {
              tr.setMeta(SELECTION_ORIGIN_META_KEY, 'programmatic');
              return true;
            })
            .run();
        }}
      >
        Document
      </button>
      {visible.map((entry) => {
        if (entry.kind === 'ellipsis') {
          // Singleton in any chain — at most one ellipsis ever rendered;
          // the literal key is stable across renders.
          return (
            <span key="ellipsis" className="flex items-center gap-1">
              <ChevronRight size={12} className="opacity-50" aria-hidden="true" />
              <span
                role="img"
                aria-label={`${entry.hiddenCount} hidden ancestors`}
                title={`${entry.hiddenCount} hidden ancestors`}
                className="opacity-60"
              >
                …
              </span>
            </span>
          );
        }
        const label = getEntryLabel(entry.entry);
        const isInnermost = entry.entry.bridgeId === selectedBlockId;

        return (
          <span key={entry.entry.bridgeId} className="flex items-center gap-1 min-w-0">
            <ChevronRight size={12} className="opacity-50 shrink-0" aria-hidden="true" />
            {isInnermost ? (
              // Innermost: non-interactive; `aria-current="location"` marks
              // the current position within the ancestor hierarchy. `truncate`
              // keeps long names from pushing the layout off-screen.
              <span aria-current="location" className="text-foreground truncate">
                {label}
              </span>
            ) : (
              <button
                type="button"
                className="hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm truncate"
                onClick={() => {
                  // Re-resolve pos at click time — collaborative edits
                  // between render and click can shift positions; the
                  // bridgeId is stable, the pos is not.
                  const livePos = resolveLivePos(editor, entry.entry);
                  // Plugin registered but ancestor disappeared (remote
                  // delete between render and click) — no-op rather than
                  // selecting whatever now occupies that pos.
                  if (livePos === null) return;
                  // Single tx: NodeSelection + origin meta land together
                  // so `computeSelectionApply` sees 'programmatic' in the
                  // same apply pass as the selection change. Two-tx pattern
                  // (separate setMeta dispatch + chained selection) is
                  // fragile under future plugin additions.
                  editor
                    .chain()
                    .focus()
                    .setNodeSelection(livePos)
                    .command(({ tr }) => {
                      tr.setMeta(SELECTION_ORIGIN_META_KEY, 'programmatic');
                      return true;
                    })
                    .run();
                }}
              >
                {label}
              </button>
            )}
          </span>
        );
      })}
    </>
  );
}

/** A visible breadcrumb entry — either an ancestor or a collapsed-ellipsis. */
type VisibleEntry =
  | { kind: 'entry'; entry: BlockChainEntry }
  | { kind: 'ellipsis'; hiddenCount: number };

/**
 * Head-truncation: keep the first ancestor (orientation) + the last two
 * (focused + immediate parent) when the chain is too long. Anything in
 * between collapses to a single `…` segment.
 *
 * Returns the chain unchanged when within the limit (no extra DOM noise).
 */
export function computeVisibleEntries(chain: readonly BlockChainEntry[]): readonly VisibleEntry[] {
  if (chain.length <= MAX_VISIBLE_SEGMENTS) {
    return chain.map((entry) => ({ kind: 'entry' as const, entry }));
  }
  const head = chain[0];
  const tail = chain.slice(-2);
  const hiddenCount = chain.length - 1 - tail.length;
  return [
    { kind: 'entry', entry: head },
    { kind: 'ellipsis', hiddenCount },
    ...tail.map((entry) => ({ kind: 'entry' as const, entry })),
  ];
}
