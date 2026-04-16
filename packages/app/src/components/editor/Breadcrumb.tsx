/**
 * Breadcrumb — editor-footer ancestry trail for the current block selection
 * (SPEC §3.5, pattern from WordPress Gutenberg).
 *
 * Renders `Document › Cards › Card › Steps › Step` when a deeply-nested block
 * is selected; each ancestor segment is a clickable button that NodeSelects
 * that ancestor. The innermost (currently-selected) segment is non-interactive
 * with `aria-current='true'`.
 *
 * Hidden when no block is selected — an empty trail is visual noise. The
 * "Document" segment is synthetic (non-clickable) because there's no
 * meaningful "select document" action; it's an orientation anchor.
 */

import type { Editor } from '@tiptap/core';
import { ChevronRight } from 'lucide-react';
import { useBlockSelection } from '../../editor/hooks/use-block-selection.ts';
import { getDescriptor } from '../../editor/registry/index.ts';

export function Breadcrumb({ editor }: { editor: Editor | null }) {
  const blockSelection = useBlockSelection(editor);

  // Hide entirely when no block is selected — avoids always-visible noise.
  if (!editor || !blockSelection || blockSelection.ancestorChain.length === 0) {
    return null;
  }

  const { ancestorChain, selectedBlockId } = blockSelection;

  return (
    <nav
      aria-label="Block ancestor navigation"
      className="jsx-component-breadcrumb flex items-center gap-1 px-3 py-1.5 text-xs font-mono text-muted-foreground border-t border-border"
    >
      {/* Synthetic "Document" anchor — non-interactive; orientation only. */}
      <span aria-hidden="true" className="opacity-60">
        Document
      </span>
      {ancestorChain.map((entry, index) => {
        const descriptor = getDescriptor(entry.componentName);
        const label = descriptor.displayName ?? descriptor.name;
        const isInnermost = entry.bridgeId === selectedBlockId;

        return (
          <span key={entry.bridgeId} className="flex items-center gap-1">
            <ChevronRight size={12} className="opacity-50" aria-hidden="true" />
            {isInnermost ? (
              // Innermost: non-interactive, aria-current flags the active
              // node in the trail (WAI-ARIA breadcrumb authoring pattern).
              <span aria-current="true" className="text-foreground">
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
    </nav>
  );
}
