/**
 * Editor / selection helpers.
 *
 * Document seeding (`createPage`, `replaceDoc`, `seedDocs`) moved to the
 * worker-scoped `api` fixture in `fixtures.ts` so each worker addresses its
 * own dev server via a closure over `baseURL` — no more ambient
 * `process.env.VITE_PORT` lookup. Consumers access those via
 * `test(async ({ api }) => ...)`.
 *
 * This file retains only page-scoped selection/editor helpers that don't
 * touch the server URL.
 */

import type { Page } from '@playwright/test';

/**
 * Press the platform select-all chord in the focused editor view and yield
 * to the browser so PM / CM6 sync their internal selection state before the
 * caller dispatches the next event. Uses a page-level double-rAF — a
 * deterministic signal that the browser has completed at least two paint
 * frames since the select-all fired.
 *
 * Uses Playwright's `ControlOrMeta` pseudo-modifier (v1.37+), which maps to
 * Meta on macOS and Control elsewhere. This matches `prosemirror-keymap`'s
 * `Mod-a` resolution — without it, CI chromium (Linux) would send Super+a,
 * which doesn't trigger PM's `selectAll` command, so `simulateCopyAndRead`
 * would return an empty MIME map (verified on PR #193 CI runs where every
 * `simulateCopyAndRead` assertion failed with `Received string: ""`).
 *
 * Replaces the ad-hoc `page.waitForTimeout(50)` frame-yield idiom; the
 * double-rAF wait is bounded (~32ms at 60fps), deterministic, and tolerates
 * the empty-doc case (FR-15 empty-copy — no selection is expected) without
 * special-casing.
 *
 * Category C (selection / cursor-flush) per D-Q1.
 */
export async function selectAllAndWaitForSelection(page: Page, selector: string): Promise<void> {
  await page.focus(selector);
  await page.keyboard.press('ControlOrMeta+a');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * Wait until ProseMirror's `editor.state.selection` has an ancestor of the
 * given `nodeType` name — i.e. the cursor is INSIDE that node type per PM's
 * internal state, not merely per the DOM.
 *
 * Use this after a `click()` that should land the cursor inside a specific
 * node (tableCell, listItem, codeBlock, ...) and BEFORE the subsequent
 * `keyboard.press(...)` that reads PM state. Under `workers>1` CPU
 * contention, PM's DOMObserver can lag behind the DOM selection update by
 * tens of ms — a double-rAF yield reports "frame painted" but PM's state
 * is still stale. The TipTap table extension's Tab handler reads
 * `editor.state.selection`, sees no tableCell ancestor, calls
 * `goToNextCell()` → returns false → falls through to `addRowAfter()`
 * which creates an empty trailing row (the exact `list-keymap.e2e.ts:100`
 * flake that surfaced under full-suite `workers=4`).
 *
 * Requires `window.__activeEditor` exposure from `DocumentContext.tsx`
 * (DEV-gated — tree-shaken from production bundles). Category C per
 * precedent §20(a).
 */
export async function waitForPmSelectionInNode(
  page: Page,
  nodeType: string,
  timeoutMs = 5_000,
): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const editor = window.__activeEditor;
      if (!editor) return false;
      const $from = editor.state.selection.$from;
      for (let d = $from.depth; d >= 0; d--) {
        if ($from.node(d).type.name === expected) return true;
      }
      return false;
    },
    nodeType,
    { timeout: timeoutMs },
  );
}
