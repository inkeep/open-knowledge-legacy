/**
 * R13 patch verification — checks the installed y-prosemirror@1.3.7 AND
 * @tiptap/y-tiptap@3.0.3 actually have our patch body, not the upstream
 * destructive-delete behavior.
 *
 * ## Why this test exists
 *
 * The R13 patch is applied via `bun patch` at install time in two places
 * because two different `@tiptap/*` extensions import different packages:
 *   (a) `patches/y-prosemirror@1.3.7.patch` — `@tiptap/extension-collaboration-cursor`
 *       imports `yCursorPlugin` from this package.
 *   (b) `patches/@tiptap%2Fy-tiptap@3.0.3.patch` — `@tiptap/extension-collaboration`
 *       imports `ySyncPlugin` / `yUndoPlugin` from this vendored Tiptap fork;
 *       our 27+ direct imports of `updateYFragment` /
 *       `yXmlFragmentToProsemirrorJSON` also resolve here.
 *
 * Both packages contain their own bundled copies of the destructive-delete
 * catch blocks; patching only one leaves the other live in production.
 *
 * If either patch silently fails to apply (e.g., upstream drift, corrupted
 * lockfile, missing patchedDependencies entry), the destructive
 * `el._item.delete(transaction)` path returns, which is catastrophic —
 * schema-throw silently destroys peer data across the CRDT.
 *
 * This test reads each installed bundle and asserts:
 *   1. The patch marker comment `R13 patch:` is present at both throw sites
 *   2. The destructive `_item.delete(transaction)` call is absent from those sites
 *   3. The `rawMdxFallback` substitution + `globalThis.__okYpsCounters` increments are present
 *   4. The `patchedDependencies` entries are registered in package.json
 *
 * If this test fails on a clean `bun install`, the fix is to investigate
 * the patch file (it may need re-porting to a new package version
 * per SPEC §17 STOP rule).
 *
 * End-to-end verification of the patch actually firing on a live Y.Doc
 * is covered by
 * `packages/app/tests/integration/y-tiptap-schema-throw-substitution.test.ts`,
 * which drives a schema.node() throw through the production import path.
 *
 * ## Upgrade procedure (bumping either patched package)
 *
 * The patches are pinned to specific versions (`y-prosemirror@1.3.7`,
 * `@tiptap/y-tiptap@3.0.3`). Upstream may refactor the sync-plugin
 * internals. When bumping either package to version N.N.N, do the work in a
 * DEDICATED PR (do not bundle with unrelated changes):
 *
 *   1. **Diff upstream** — compare the old patched bundle against the new
 *      version. Focus on the two `catch (e) {` blocks inside
 *      `createNodeFromYElement` and `createTextNodesFromYText`. If upstream
 *      moved or replaced the destructive `_item.delete(transaction)` call,
 *      re-port to the new call sites. Patch invariants to preserve:
 *        - NO `_item.delete(transaction)` anywhere in the bundle
 *        - `rawMdxFallback` substitution in block-context `schema.node()` catch
 *        - `globalThis.__okYpsCounters.{block,inline}++` at every catch site
 *        - Structured `console.warn('[y-prosemirror] ...')` retained (the log
 *          prefix is a stable identifier tests/ops filter on — keep it even
 *          when the host package is `@tiptap/y-tiptap`)
 *
 *   2. **Regenerate via `bun patch`**:
 *        `bun patch <pkg>@N.N.N`
 *      edit both `dist/*.cjs` AND `dist/*.js` if the package ships both,
 *      then `bun patch --commit node_modules/<pkg>`. Bun writes the patch
 *      file under `patches/` and updates `package.json`.
 *
 *   3. **Update the `PATCHED_BUNDLES` array below** to reflect new paths if
 *      the bundle layout changed.
 *
 *   4. **Run the full gate**: `bun run check` PLUS the live-fire regression
 *      at `packages/app/tests/integration/y-tiptap-schema-throw-substitution.test.ts`.
 *
 * If upstream ever adds a non-destructive hook (e.g., `onSchemaError`
 * callback), retire the patches in favor of the official API. Track upstream
 * at https://github.com/yjs/y-prosemirror and https://github.com/ueberdosis/y-tiptap.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function findRepoRoot(): string {
  // this file lives at packages/core/src/ — repo root is two dirs up from package.json
  return join(__dirname, '..', '..', '..');
}

const REPO_ROOT = findRepoRoot();

/**
 * Every bundle in our dep tree that ships its own copy of the destructive-
 * delete code. Both are real production paths: `@tiptap/extension-collaboration-cursor`
 * imports from `y-prosemirror`; `@tiptap/extension-collaboration` and our 27+
 * direct imports go through `@tiptap/y-tiptap`. Patching only one leaves a
 * live CRDT data-loss bug in the other.
 */
const PATCHED_BUNDLES = [
  {
    label: 'y-prosemirror CJS',
    path: 'node_modules/y-prosemirror/dist/y-prosemirror.cjs',
  },
  {
    label: '@tiptap/y-tiptap CJS',
    path: 'node_modules/@tiptap/y-tiptap/dist/y-tiptap.cjs',
  },
  {
    label: '@tiptap/y-tiptap ESM',
    path: 'node_modules/@tiptap/y-tiptap/dist/y-tiptap.js',
  },
] as const;

describe('R13 patch verification (y-prosemirror + @tiptap/y-tiptap)', () => {
  test('both patches are registered in root package.json patchedDependencies', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    const patched = pkg.patchedDependencies as Record<string, string> | undefined;
    expect(patched).toBeDefined();

    expect(patched?.['y-prosemirror@1.3.7']).toBeDefined();
    expect(patched?.['y-prosemirror@1.3.7']).toContain('patches/');
    expect(patched?.['y-prosemirror@1.3.7']).toContain('y-prosemirror');

    expect(patched?.['@tiptap/y-tiptap@3.0.3']).toBeDefined();
    expect(patched?.['@tiptap/y-tiptap@3.0.3']).toContain('patches/');
    expect(patched?.['@tiptap/y-tiptap@3.0.3']).toContain('y-tiptap');
  });

  for (const bundle of PATCHED_BUNDLES) {
    describe(bundle.label, () => {
      test('contains R13 patch body (not upstream destructive-delete)', () => {
        const src = readFileSync(join(REPO_ROOT, bundle.path), 'utf8');

        // Patch markers must be present at BOTH throw sites
        const patchMarkers = src.match(/R13 patch:/g);
        expect(patchMarkers).not.toBeNull();
        expect(patchMarkers?.length).toBeGreaterThanOrEqual(2);

        // rawMdxFallback substitution path must be present in block-context catch
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
        const src = readFileSync(join(REPO_ROOT, bundle.path), 'utf8');

        // Split on 'R13 patch:' and for each hunk, verify the patch body does
        // NOT contain `_item.delete(transaction)` — that's the upstream
        // destructive path the patch replaced.
        const hunks = src.split(/R13 patch:/);
        // The first hunk is everything BEFORE the first patch marker — skip it.
        for (let i = 1; i < hunks.length; i++) {
          const hunk = hunks[i].slice(0, 4000);
          expect(hunk).not.toMatch(/_item\.delete\(transaction\)/);
        }

        // Stronger check: NO `_item.delete(transaction)` anywhere in the
        // bundle. Both call sites (block + text) lived only in the patched
        // catch blocks; after patching, neither bundle should reference it
        // at all.
        expect(src).not.toMatch(/_item\.delete\(transaction\)/);
      });
    });
  }

  test('y-prosemirror patch file exists on disk and references y-prosemirror', () => {
    const patchPath = join(REPO_ROOT, 'patches', 'y-prosemirror@1.3.7.patch');
    const patchContent = readFileSync(patchPath, 'utf8');
    expect(patchContent).toContain('y-prosemirror.cjs');
    expect(patchContent).toContain('R13 patch:');
    expect(patchContent).toContain('rawMdxFallback');
    expect(patchContent).toContain('__okYpsCounters');
  });

  test('@tiptap/y-tiptap patch file exists on disk and references both bundles', () => {
    // Bun encodes `/` as `%2F` in scoped-package patch filenames.
    const patchPath = join(REPO_ROOT, 'patches', '@tiptap%2Fy-tiptap@3.0.3.patch');
    const patchContent = readFileSync(patchPath, 'utf8');
    expect(patchContent).toContain('dist/y-tiptap.cjs');
    expect(patchContent).toContain('dist/y-tiptap.js');
    expect(patchContent).toContain('R13 patch:');
    expect(patchContent).toContain('rawMdxFallback');
    expect(patchContent).toContain('__okYpsCounters');
  });

  /**
   * Dep-tree invariant: NO shipped bundle anywhere in node_modules retains the
   * upstream destructive-delete pattern `_item.delete(transaction)`. This is
   * the future-proof gate — if a new dependency ships another vendored copy
   * of the same code, this test fails in CI and points at the exact file, so
   * the patch surface is extended before the regression can ship.
   *
   * Why this is architecturally the right gate (vs. enumerating known bundles):
   * y-prosemirror and @tiptap/y-tiptap both bundle the same destructive-delete
   * code. Different Tiptap extensions import from different packages — e.g.
   * @tiptap/extension-collaboration uses y-tiptap; @tiptap/extension-
   * collaboration-cursor uses y-prosemirror. Any future Tiptap consolidation
   * (or new vendor) could re-introduce another copy. Listing known-bad bundles
   * makes it trivially easy to miss the next one; checking the invariant
   * mechanically cannot.
   *
   * Scoping: skips `.bun-tag-*` and source maps; scans `.js` / `.cjs` under
   * every direct package's `dist/` to keep runtime bounded. Not recursive into
   * every transitive package — that would balloon runtime for no added
   * coverage (y-prosemirror and y-tiptap are both hoisted to top-level).
   */
  test('dep-tree invariant: no destructive _item.delete(transaction) in any dist bundle', () => {
    const nodeModules = join(REPO_ROOT, 'node_modules');
    const offending: Array<{ path: string; line: number }> = [];

    function scanDistDir(distDir: string) {
      let entries: string[];
      try {
        entries = readdirSync(distDir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.endsWith('.js') && !entry.endsWith('.cjs')) continue;
        const full = join(distDir, entry);
        let src: string;
        try {
          src = readFileSync(full, 'utf8');
        } catch {
          continue;
        }
        if (!src.includes('_item.delete(transaction)')) continue;
        // Report first offending line for actionable failure output.
        const lines = src.split('\n');
        const lineIdx = lines.findIndex((l) => l.includes('_item.delete(transaction)'));
        offending.push({ path: full, line: lineIdx + 1 });
      }
    }

    function scanPackageDir(pkgDir: string) {
      scanDistDir(join(pkgDir, 'dist'));
    }

    function walkTopLevel(dir: string) {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (name.startsWith('.')) continue; // skip .bin, .cache, etc.
        const full = join(dir, name);
        let stats: ReturnType<typeof statSync>;
        try {
          stats = statSync(full);
        } catch {
          continue;
        }
        if (!stats.isDirectory()) continue;
        if (name.startsWith('@')) {
          // Scoped packages — walk one level deeper.
          walkTopLevel(full);
          continue;
        }
        scanPackageDir(full);
      }
    }

    walkTopLevel(nodeModules);

    if (offending.length > 0) {
      const details = offending.map(({ path, line }) => `  ${path}:${line}`).join('\n');
      throw new Error(
        `Found ${offending.length} bundle(s) with the upstream destructive-delete pattern ` +
          `\`_item.delete(transaction)\`. Every such bundle must be patched via \`bun patch\` ` +
          `to substitute rawMdxFallback (block-context) or log+skip (inline-context); ` +
          `otherwise a schema.node()/schema.text() throw will tombstone Y.Items and ` +
          `broadcast the delete to all peers (see CLAUDE.md precedent #9):\n${details}`,
      );
    }
  });
});
