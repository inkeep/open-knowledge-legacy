/**
 * useBlockSelection — React hook for subscribing to `SelectionStatePlugin`
 * state (Precedent #15).
 *
 * Returns `null` for a null editor (safe pre-mount rendering).
 *
 * Implementation notes:
 * - Uses `useState` + `useEffect` subscription. `useSyncExternalStore` was
 *   the first choice (canonical primitive) but in this codebase, combined
 *   with React Compiler auto-memoization + the TipTap+PM view-update cycle,
 *   it was observed to not propagate plugin-state changes to top-level
 *   subscribers (Breadcrumb, SelectionAnnouncer) while correctly updating
 *   NodeView-level subscribers (JsxComponentView). Likely cause:
 *   React Compiler memoizes the hook call when its single input (`editor`)
 *   is referentially stable, bypassing the snapshot-poll path. Plain
 *   useState + useEffect subscription is outside the compiler's
 *   memoization scope and propagates reliably to every subscriber tier.
 * - Subscribe fires synchronously on mount; cleanup fires on unmount or
 *   editor change. The listener reads the current snapshot imperatively
 *   and calls setState — React scheduling then triggers a re-render.
 */

import type { Editor } from '@tiptap/core';
import { useEffect, useState } from 'react';
import {
  type BlockSelection,
  getBlockSelection,
  subscribeBlockSelection,
} from '../extensions/selection-state-plugin.ts';

export function useBlockSelection(editor: Editor | null): BlockSelection | null {
  const [state, setState] = useState<BlockSelection | null>(() =>
    editor ? getBlockSelection(editor) : null,
  );

  useEffect(() => {
    if (!editor) {
      setState(null);
      return;
    }
    // Seed with current state in case it changed between render and effect.
    setState(getBlockSelection(editor));
    return subscribeBlockSelection(editor, () => {
      setState(getBlockSelection(editor));
    });
  }, [editor]);

  return state;
}
