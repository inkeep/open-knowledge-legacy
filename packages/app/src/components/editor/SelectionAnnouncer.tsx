/**
 * SelectionAnnouncer — `aria-live="polite"` region that announces block
 * selection changes to assistive technologies (SPEC §3.6, Precedent #20).
 *
 * Renders a single visually-hidden `<div role="status" aria-live="polite">`
 * whose `textContent` updates 200ms after each selection change. Debounce
 * prevents screen-reader queue flooding during rapid keyboard navigation
 * (arrow-key bursts would otherwise queue dozens of announcements).
 *
 * Imperative textContent write (not React state): React batching has been
 * observed to swallow rapid aria-live updates — the region only re-announces
 * when the DOM text actually changes. Writing imperatively via ref gives
 * AT a clean mutation to latch onto every time.
 *
 * Message format:
 *   - ancestorChain.length === 1: "Selected: Card"
 *   - ancestorChain.length > 1:   "Selected: Step, 2 of 4 in Steps"
 *   - null selection:             "" (clears — previous announcement fades)
 *
 * The index-in-parent is derived from the PM doc at read time: we use the
 * selected wrapper's pos and its parent's childCount. This is cheap; the
 * computation runs once per debounce tick, not per render.
 */

import type { Editor } from '@tiptap/core';
import { useEffect, useRef } from 'react';
import type { BlockChainEntry } from '../../editor/extensions/selection-state-plugin.ts';
import { useBlockSelection } from '../../editor/hooks/use-block-selection.ts';
import { getDescriptor } from '../../editor/registry/index.ts';

const ANNOUNCE_DEBOUNCE_MS = 200;

export function SelectionAnnouncer({ editor }: { editor: Editor | null }) {
  const blockSelection = useBlockSelection(editor);
  const regionRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Clear any pending announcement — selection has moved; the in-flight
    // message is stale.
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!editor || !regionRef.current) return;

    const message = formatSelectionMessage(editor, blockSelection);

    timeoutRef.current = window.setTimeout(() => {
      if (regionRef.current) {
        // Imperative write — bypasses React's batching so AT gets every
        // mutation. Two-step clear-then-write guarantees a detectable DOM
        // change even when the new message is identical to the previous
        // one (e.g. re-selecting the same block): screen readers only
        // re-announce on observed content change, so `textContent = same`
        // would be a silent no-op.
        // Reference: MDN "ARIA live regions" — "briefly clear the contents
        // of the alert container before injecting the alert message."
        regionRef.current.textContent = '';
        regionRef.current.textContent = message;
      }
      timeoutRef.current = null;
    }, ANNOUNCE_DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [editor, blockSelection]);

  return (
    <div ref={regionRef} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
  );
}

/**
 * Resolve the announce-label for a BlockChainEntry. Prefers the registered
 * descriptor's `displayName`, falls back to descriptor `name`, and finally to
 * the entry's own `componentName` (the string the user actually authored) —
 * the last case covers unregistered components that resolve to the wildcard
 * `'*'` descriptor, where neither `displayName` nor `name` carries useful
 * text. Appends " (unregistered)" in the wildcard case so AT users
 * understand why the label is unfamiliar.
 */
function entryLabel(entry: BlockChainEntry): string {
  const descriptor = getDescriptor(entry.componentName);
  if (descriptor.name === '*') {
    return `${entry.componentName} (unregistered)`;
  }
  return descriptor.displayName ?? descriptor.name;
}

/**
 * Format the aria-live message for the current selection. Separated out so
 * the formatting logic is pure and the useEffect stays focused on lifecycle.
 * Exported for unit testing.
 */
export function formatSelectionMessage(
  editor: Editor,
  blockSelection: ReturnType<typeof useBlockSelection>,
): string {
  if (!blockSelection || blockSelection.ancestorChain.length === 0) {
    return '';
  }

  const chain = blockSelection.ancestorChain;
  const innermost = chain[chain.length - 1];
  const innermostLabel = entryLabel(innermost);

  if (chain.length === 1) {
    return `Selected: ${innermostLabel}`;
  }

  const parent = chain[chain.length - 2];
  const parentLabel = entryLabel(parent);

  // Compute the selected wrapper's index within its parent's children via
  // PM position resolution. If the resolve fails (doc shifted mid-tick), we
  // gracefully fall back to the simpler message without the index.
  try {
    const $pos = editor.state.doc.resolve(innermost.pos);
    const index = $pos.index($pos.depth);
    const total = $pos.parent.childCount;
    return `Selected: ${innermostLabel}, ${index + 1} of ${total} in ${parentLabel}`;
  } catch {
    return `Selected: ${innermostLabel} in ${parentLabel}`;
  }
}
