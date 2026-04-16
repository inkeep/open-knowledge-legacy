/**
 * useSelectionAnchoredPopover — canonical positioning primitive for any
 * UI that floats relative to the current block selection (Precedent #19).
 *
 * Wraps `@floating-ui/dom`'s primitives (`computePosition`, `autoUpdate`,
 * `offset`, `flip`, `shift`, `hide`) + the `computeSelectionAnchor`
 * virtual-element builder. Consumers include future selection-anchored
 * popovers — link editor, image caption, inline action toolbars. No
 * production consumer lands in this spec; the hook's API is proved via
 * unit tests (see compute-selection-anchor.test.ts) and will be exercised
 * by downstream features.
 *
 * The hook's single responsibility: own the Floating UI lifecycle so
 * consumers just render the floating content with the returned ref +
 * styles + visibility flag. Scroll/resize/intersection tracking is
 * handled automatically via `autoUpdate` — including the
 * `ancestorScroll`, `elementResize`, `layoutShift` listeners that catch
 * editor-internal scroll (overflow-y-auto containers).
 */

import {
  autoUpdate,
  computePosition,
  flip,
  hide,
  type Middleware,
  offset,
  type Placement,
  shift,
} from '@floating-ui/dom';
import type { Editor } from '@tiptap/core';
import type { CSSProperties } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BlockSelection } from '../extensions/selection-state-plugin.ts';
import { computeSelectionAnchor } from '../selection/compute-selection-anchor.ts';
import { useBlockSelection } from './use-block-selection.ts';

export interface UseSelectionAnchoredPopoverOptions {
  /** Caller-controlled visibility. `false` short-circuits position
   *  computation for perf (Tiptap BubbleMenu pattern). */
  open: boolean;
  /** Optional predicate — when provided, the popover is only considered
   *  visible if `shouldShow(selection) === true`. Fires on every plugin
   *  state change. */
  shouldShow?: (selection: BlockSelection) => boolean;
  /** Floating UI placement. Default: 'bottom-start'. */
  placement?: Placement;
  /** Middleware override. Defaults to `[offset(8), flip(), shift({padding: 8}), hide()]`
   *  — standard Tiptap-style placement for selection-anchored UI.
   *
   *  **Identity warning:** the middleware array is read in the hook's
   *  `useLayoutEffect` dep list. Passing a fresh array literal on every
   *  render will tear down + re-attach Floating UI's `autoUpdate`
   *  listeners on every render, cancelling scroll/resize tracking mid-
   *  frame. Either (a) pass a module-level constant, (b) memoize in the
   *  caller with a stable reference, or (c) omit the prop to inherit the
   *  default constant. React Compiler auto-memoizes array literals in
   *  component bodies, but do not rely on that in code that may run
   *  uncompiled (e.g. SSR harnesses or pre-compiler tests). */
  middleware?: Middleware[];
}

export interface UseSelectionAnchoredPopoverResult {
  /** Ref callback — assign to the floating element (the popover content). */
  setFloating: (el: HTMLElement | null) => void;
  /** Computed style — apply directly to the floating element. Uses
   *  `position: 'fixed'` strategy. */
  floatingStyles: CSSProperties;
  /** Current visibility after evaluating open + shouldShow + anchor availability. */
  isVisible: boolean;
  /** Resolved placement after flip/shift/hide middleware runs. */
  placement: Placement;
}

const DEFAULT_MIDDLEWARE: Middleware[] = [offset(8), flip(), shift({ padding: 8 }), hide()];

export function useSelectionAnchoredPopover(
  editor: Editor | null,
  options: UseSelectionAnchoredPopoverOptions,
): UseSelectionAnchoredPopoverResult {
  const { open, shouldShow, placement = 'bottom-start', middleware = DEFAULT_MIDDLEWARE } = options;

  const blockSelection = useBlockSelection(editor);

  // Ref to the floating element. Mounted via `setFloating` ref-callback.
  const [floating, setFloatingState] = useState<HTMLElement | null>(null);

  // Current computed position. `useLayoutEffect` sync avoids first-frame flicker.
  const [floatingStyles, setFloatingStyles] = useState<CSSProperties>({
    position: 'fixed',
    top: 0,
    left: 0,
    visibility: 'hidden',
  });
  const [resolvedPlacement, setResolvedPlacement] = useState<Placement>(placement);

  // Cleanup fn returned by the last autoUpdate() call, or null.
  const autoUpdateCleanupRef = useRef<(() => void) | null>(null);

  // setFloatingState identity is stable across renders per React's useState
  // contract — React Compiler handles memoization automatically, so we don't
  // wrap in useCallback (Biome lint rule flags manual memoization).
  const setFloating = setFloatingState;

  // Re-evaluate shouldShow + compute visibility. Recomputed whenever any
  // input changes — plugin state, open flag, or shouldShow ref.
  const shouldShowResult = blockSelection ? (shouldShow?.(blockSelection) ?? true) : false;
  const wantsToBeVisible = open && shouldShowResult;

  useLayoutEffect(() => {
    // Teardown previous autoUpdate. Safe to call with a null cleanup.
    autoUpdateCleanupRef.current?.();
    autoUpdateCleanupRef.current = null;

    if (!editor || !floating || !wantsToBeVisible) {
      // Hide when the popover shouldn't be showing — keeps a stable
      // position on the style object but flips visibility.
      setFloatingStyles((prev) => ({ ...prev, visibility: 'hidden' }));
      return;
    }

    const anchor = computeSelectionAnchor(editor.view, blockSelection);
    if (!anchor) {
      setFloatingStyles((prev) => ({ ...prev, visibility: 'hidden' }));
      return;
    }

    const update = () => {
      computePosition(anchor, floating, {
        strategy: 'fixed',
        placement,
        middleware,
      })
        .then(({ x, y, placement: resolved, middlewareData }) => {
          // `hide()` middleware sets referenceHidden when the anchor is off-
          // screen — we reflect that in visibility so the popover disappears
          // when the user scrolls past the selection.
          const hidden = middlewareData?.hide?.referenceHidden === true;
          setFloatingStyles({
            position: 'fixed',
            top: `${y}px`,
            left: `${x}px`,
            visibility: hidden ? 'hidden' : 'visible',
          });
          setResolvedPlacement(resolved);
        })
        .catch(() => {
          // computePosition is async — if the floating element unmounts
          // mid-compute, the .then resolves after cleanup. Safe to ignore.
        });
    };

    autoUpdateCleanupRef.current = autoUpdate(anchor, floating, update, {
      ancestorScroll: true,
      ancestorResize: true,
      elementResize: true,
      layoutShift: true,
    });

    return () => {
      autoUpdateCleanupRef.current?.();
      autoUpdateCleanupRef.current = null;
    };
  }, [editor, floating, wantsToBeVisible, blockSelection, placement, middleware]);

  // Cleanup on unmount — belt+braces over the effect cleanup.
  useEffect(
    () => () => {
      autoUpdateCleanupRef.current?.();
      autoUpdateCleanupRef.current = null;
    },
    [],
  );

  return {
    setFloating,
    floatingStyles,
    isVisible: wantsToBeVisible && floatingStyles.visibility !== 'hidden',
    placement: resolvedPlacement,
  };
}
