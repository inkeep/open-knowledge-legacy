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
 * The "Document" segment is synthetic (non-clickable) because there's no
 * meaningful "select document" action; it's an orientation anchor.
 *
 * Unregistered components (descriptor resolves to wildcard `'*'`) surface
 * the original `componentName` from the entry, not `"*"` — the real name
 * is the only useful label for AT users.
 */

import type { Editor } from '@tiptap/core';
import { ChevronRight } from 'lucide-react';
import { useBlockSelection } from '../../editor/hooks/use-block-selection.ts';
import { getEntryLabel } from '../../editor/selection/entry-label.ts';

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
      className={`jsx-component-breadcrumb flex items-center gap-1 min-h-[28px] px-3 py-1.5 text-xs font-mono text-muted-foreground ${hasSelection ? 'border-t border-border' : ''}`}
    >
      {hasSelection && blockSelection ? (
        <BreadcrumbContent editor={editor as Editor} blockSelection={blockSelection} />
      ) : null}
    </nav>
  );
}

function BreadcrumbContent({
  editor,
  blockSelection,
}: {
  editor: Editor;
  blockSelection: NonNullable<ReturnType<typeof useBlockSelection>>;
}) {
  const { ancestorChain, selectedBlockId } = blockSelection;
  return (
    <>
      {/* Synthetic "Document" anchor — non-interactive; orientation only. */}
      <span aria-hidden="true" className="opacity-60">
        Document
      </span>
      {ancestorChain.map((entry, index) => {
        const label = getEntryLabel(entry);
        const isInnermost = entry.bridgeId === selectedBlockId;

        return (
          <span key={entry.bridgeId} className="flex items-center gap-1">
            <ChevronRight size={12} className="opacity-50" aria-hidden="true" />
            {isInnermost ? (
              // Innermost: non-interactive; `aria-current="location"` marks
              // the current position within the ancestor hierarchy.
              <span aria-current="location" className="text-foreground">
                {label}
              </span>
            ) : (
              <button
                type="button"
                className="hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                onClick={() => {
                  // setNodeSelection moves the PM selection to the ancestor's
                  // pos; .focus() returns keyboard focus to the editor body so
                  // arrow nav still lands on block surfaces.
                  editor.chain().focus().setNodeSelection(entry.pos).run();
                }}
              >
                {label}
              </button>
            )}
            {/* Hint for screen readers that non-last items are navigable. */}
            {!isInnermost && index === ancestorChain.length - 2 ? (
              <span className="sr-only"> (innermost ancestor)</span>
            ) : null}
          </span>
        );
      })}
    </>
  );
}
