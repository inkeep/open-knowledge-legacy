/**
 * R13 patch verification — checks the installed y-prosemirror@1.3.7 actually
 * has our patch body, not the upstream destructive-delete behavior.
 *
 * ## Why this test exists
 *
 * The R13 patch (`patches/y-prosemirror@1.3.7.patch`) is applied via
 * `bun patch` at install time. If the patch silently fails to apply (e.g.,
 * upstream drift, corrupted lockfile, missing patchedDependencies entry),
 * the destructive `el._item.delete(transaction)` path returns, which is
 * catastrophic — schema-throw silently destroys peer data across the CRDT.
 *
 * This test reads the installed dist file and asserts:
 *   1. The patch marker comment `R13 patch:` is present at both throw sites
 *   2. The destructive `_item.delete(transaction)` call is absent from those sites
 *   3. The `rawMdxFallback` substitution + `globalThis.__okYpsCounters` increments are present
 *   4. The `patchedDependencies` entry is registered in package.json
 *
 * If this test fails on a clean `bun install`, the fix is to investigate
 * the patch file (it may need re-porting to a new y-prosemirror version
 * per SPEC §17 STOP rule).
 *
 * End-to-end verification of the patch actually firing on a live Y.Doc
 * requires a DOM (TipTap editor), which is out of scope for Node unit
 * tests. The patch's internal logic (counter bridge, fallback substitution)
 * IS unit-tested via globalThis in `metrics/parse-health.test.ts`.
 *
 * ## Upgrade procedure (y-prosemirror past 1.3.7)
 *
 * The patch is verified against 1.3.7 source only. Upstream may refactor
 * the sync-plugin internals. When bumping to version N.N.N, do this work
 * in a DEDICATED PR (do not bundle with unrelated changes):
 *
 *   1. **Diff upstream** — compare the patched `dist/y-prosemirror.cjs@1.3.7`
 *      against the new `@N.N.N` version. Focus on the two `catch (e) {`
 *      blocks formerly at ~801 (`schema.node` catch) and ~834 (`schema.text`
 *      catch). If upstream moved or replaced the destructive
 *      `el._item.delete(transaction)` call, re-port to the new call sites.
 *      Patch invariants to preserve:
 *        - NO `_item.delete(transaction)` in either catch block
 *        - `rawMdxFallback` substitution in block-context `schema.node()` catch
 *        - `globalThis.__okYpsCounters.{block,inline}++` at every catch site
 *        - Structured `console.warn('[y-prosemirror] ...')` retained
 *
 *   2. **Regenerate via `bun patch`**:
 *        `bun patch y-prosemirror@N.N.N`
 *      edit the workspace copy, then
 *        `bun patch --commit node_modules/y-prosemirror`.
 *      The new `patches/y-prosemirror@N.N.N.patch` replaces the 1.3.7 file.
 *
 *   3. **Update `package.json`** `patchedDependencies` entry from
 *      `"y-prosemirror@1.3.7"` → `"y-prosemirror@N.N.N"` with the new path.
 *
 *   4. **Update this file** — change the version literal in the
 *      `patchedDependencies` test below and the path in the file-exists test.
 *
 *   5. **Run the full gate**: `bun run check` PLUS any DOM-level Q6 E2E tests
 *      (see `specs/2026-04-13-mdx-tolerant-parsing/SPEC.md §6 Q6`).
 *
 * If upstream ever adds a non-destructive hook (e.g., `onSchemaError`
 * callback), retire this patch in favor of the official API. Track upstream
 * at https://github.com/yjs/y-prosemirror.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function findRepoRoot(): string {
  // this file lives at packages/core/src/ — repo root is two dirs up from package.json
  return join(__dirname, '..', '..', '..');
}

const REPO_ROOT = findRepoRoot();

describe('R13 y-prosemirror@1.3.7 patch verification', () => {
  test('patch is registered in root package.json patchedDependencies', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    const patched = pkg.patchedDependencies as Record<string, string> | undefined;
    expect(patched).toBeDefined();
    expect(patched?.['y-prosemirror@1.3.7']).toBeDefined();
    expect(patched?.['y-prosemirror@1.3.7']).toContain('patches/');
    expect(patched?.['y-prosemirror@1.3.7']).toContain('y-prosemirror');
  });

  test('installed y-prosemirror dist contains R13 patch body (not upstream destructive-delete)', () => {
    const distPath = join(REPO_ROOT, 'node_modules/y-prosemirror/dist/y-prosemirror.cjs');
    const src = readFileSync(distPath, 'utf8');

    // Patch markers must be present at BOTH throw sites
    const patchMarkers = src.match(/R13 patch:/g);
    expect(patchMarkers).not.toBeNull();
    expect(patchMarkers?.length).toBeGreaterThanOrEqual(2);

    // rawMdxFallback substitution path must be present
    expect(src).toContain("schema.node('rawMdxFallback'");

    // globalThis counter bridge must be wired at both the block and text
    // catch sites so ypsMismatch counters report real values through the
    // /api/metrics/parse-health endpoint.
    const counterMarkers = src.match(/__okYpsCounters/g);
    expect(counterMarkers).not.toBeNull();
    // At minimum: block-context increment + inline-context increment + text-site increment
    expect(counterMarkers?.length).toBeGreaterThanOrEqual(3);

    // The structured console.warn for developer-facing signal must fire
    expect(src).toMatch(/\[y-prosemirror\] schema\.node\(/);
    expect(src).toMatch(/\[y-prosemirror\] schema\.text\(/);
  });

  test('patched throw sites do NOT retain upstream destructive _item.delete calls', () => {
    const distPath = join(REPO_ROOT, 'node_modules/y-prosemirror/dist/y-prosemirror.cjs');
    const src = readFileSync(distPath, 'utf8');

    // Locate each `catch (e) {` block that contains `R13 patch:` and verify
    // the SAME block does NOT contain `el._item.delete(transaction)` or
    // `text._item.delete(transaction)`. Those are the two upstream destructive
    // paths the patch replaced.

    // Rough check: split on 'R13 patch:' and for each half, look within the
    // next ~40 lines for `_item.delete(transaction)` with ySyncPluginKey.
    const hunks = src.split(/R13 patch:/);
    // The first hunk is everything BEFORE the first patch marker — skip it.
    // Each subsequent hunk starts with the patch body + continues to the next patch marker (or EOF).
    for (let i = 1; i < hunks.length; i++) {
      const hunk = hunks[i].slice(0, 4000); // only inspect the patch body, not the whole file
      // The string `_item.delete(transaction)` should NOT appear in a patched catch block
      expect(hunk).not.toMatch(/_item\.delete\(transaction\)/);
    }
  });

  test('patch file exists on disk and references y-prosemirror', () => {
    const patchPath = join(REPO_ROOT, 'patches', 'y-prosemirror@1.3.7.patch');
    const patchContent = readFileSync(patchPath, 'utf8');
    expect(patchContent).toContain('y-prosemirror.cjs');
    expect(patchContent).toContain('R13 patch:');
    expect(patchContent).toContain('rawMdxFallback');
    expect(patchContent).toContain('__okYpsCounters');
  });
});
