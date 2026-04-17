/**
 * Editor / document seeding helpers.
 *
 * Mirrors the gold-standard pattern from `docs-open.e2e.ts:17-59`. Every E2E
 * test creates its own documents via `/api/create-page` and seeds content
 * with `position: 'replace'` on `/api/agent-write-md` — NEVER `mode: 'replace'`
 * (silent fallback to append, verified in PR #185).
 *
 * Each helper reads `VITE_PORT` at call time so parallel worker processes can
 * target their own dev server when Playwright's fullyParallel mode is enabled.
 */

import type { Page } from '@playwright/test';

const port = () => process.env.VITE_PORT || '5173';
const base = () => `http://localhost:${port()}`;

/**
 * Create an empty document at `path` (e.g. `"doc-a.md"` or `"nested/x.md"`).
 * Returns quietly on HTTP 409 (already exists) so tests can re-seed safely.
 */
export async function createPage(path: string): Promise<void> {
  const res = await fetch(`${base()}/api/create-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (res.status === 409) return;
  if (!res.ok) {
    throw new Error(`create-page failed for ${path}: ${res.status}`);
  }
}

/**
 * Replace a document's entire contents with `markdown` via
 * `/api/agent-write-md`. The `position: 'replace'` body key is the PR #185
 * contract — do NOT pass `mode: 'replace'` (silent fallback to append).
 */
export async function replaceDoc(docName: string, markdown: string): Promise<void> {
  const res = await fetch(`${base()}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName, markdown, position: 'replace' }),
  });
  if (!res.ok) {
    throw new Error(`agent-write-md failed for ${docName}: ${res.status}`);
  }
}

/**
 * Reset the server and seed N unique docs. Every test that needs a clean
 * workspace should call this first.
 */
export async function seedDocs(docs: Array<{ name: string; markdown: string }>): Promise<void> {
  await fetch(`${base()}/api/test-reset`, { method: 'POST' });
  for (const d of docs) await createPage(`${d.name}.md`);
  for (const d of docs) await replaceDoc(d.name, d.markdown);
}

/**
 * Press Meta+A in the focused editor view and yield to the browser so PM /
 * CM6 sync their internal selection state before the caller dispatches the
 * next event. Uses a page-level double-rAF — a deterministic signal that the
 * browser has completed at least two paint frames since Meta+A fired.
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
  await page.keyboard.press('Meta+a');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}
