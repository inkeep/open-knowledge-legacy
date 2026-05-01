
import type { Editor } from '@tiptap/core';
import { ChevronRight } from 'lucide-react';
import { bridgeIdPluginKey } from '../../editor/extensions/bridge-id-plugin.ts';
import {
  type BlockChainEntry,
  SELECTION_ORIGIN_META_KEY,
} from '../../editor/extensions/selection-state-plugin.ts';
import { useBlockSelection } from '../../editor/hooks/use-block-selection.ts';
import { getEntryLabel } from '../../editor/selection/entry-label.ts';
import { DOCUMENT_ROOT_LABEL } from '../../editor/utils/editor-strings.ts';

const MAX_VISIBLE_SEGMENTS = 4;

export function Breadcrumb({ editor }: { editor: Editor | null }) {
  const blockSelection = useBlockSelection(editor);
  const hasSelection = Boolean(editor && blockSelection && blockSelection.ancestorChain.length > 0);

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

export function resolveLivePos(editor: Editor, entry: BlockChainEntry): number | null {
  const posToId = bridgeIdPluginKey.getState(editor.state)?.posToId;
  if (!posToId) return entry.pos;
  for (const [livePos, id] of posToId) {
    if (id === entry.bridgeId) return livePos;
  }
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
          selection change lands.
          String source: `DOCUMENT_ROOT_LABEL` in
          `editor/utils/editor-strings.ts` — a future i18n pass swaps the
          file, not the render site. */}
      <button
        type="button"
        className="opacity-60 hover:opacity-100 hover:text-foreground transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        onClick={() => {
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
        {DOCUMENT_ROOT_LABEL}
      </button>
      {visible.map((entry) => {
        if (entry.kind === 'ellipsis') {
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
              <span aria-current="location" className="text-foreground truncate">
                {label}
              </span>
            ) : (
              <button
                type="button"
                className="hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm truncate"
                onClick={() => {
                  const livePos = resolveLivePos(editor, entry.entry);
                  if (livePos === null) return;
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

type VisibleEntry =
  | { kind: 'entry'; entry: BlockChainEntry }
  | { kind: 'ellipsis'; hiddenCount: number };

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
