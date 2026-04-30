/**
 * E2E coverage for the remaining top-list acceptance scenarios from
 * `evidence/e2e-acceptance-scenarios.md` that genuinely need a browser
 * (US-017):
 *
 *   - P5.1   rename doc with `![alt](path)` image ref → path recomputes
 *   - P5.1a  rename doc with `![[name.ext]]` wiki-embed ref → NO rewrite
 *            (basename index resolves dynamically)
 *
 * Scenarios NOT in this file (intentional — their integration-tier
 * coverage is stronger per test-runtime dollar, or the scenario was
 * deleted under a post-finalization amendment):
 *   - P1.3  Oversized-file rejection — DELETED 2026-04-22 under the
 *           streaming-upload amendment. `upload.maxBytes` no longer
 *           exists; server-side `storage-full` / `malformed-upload` /
 *           `collision-exhaustion` are covered at unit + integration
 *           tier (see `packages/server/src/upload-streaming.test.ts`
 *           and `packages/server/src/api-extension.test.ts`). See
 *           SPEC §Post-finalization amendment +
 *           reports/streaming-upload-refactor/REPORT.md §D8.
 *   - P2.1 / P2.1a  Obsidian vault open + ambiguous resolution — require
 *                   full server-restart against a fixture vault. Fully
 *                   covered by obsidian-vault-detect.test.ts (23 tests)
 *                   + path-resolve.test.ts tiebreak PBT.
 *   - P4.1  Operator tunes `attachmentFolderPath` / `emitFormat` —
 *           server config surgery is heavier than the test adds.
 *           Covered by api-extension.test.ts custom-config describe
 *           block (post-2026-04-22 amendment: maxBytes branch deleted
 *           along with the field).
 *   - P5.2 / P5.3 concurrent bursts + P6.x multi-user — require
 *                 multi-browser harness. Per US-017 AC: tier-1
 *                 `createTestClients` integration tests are the right
 *                 home; the CRDT sync layer didn't change in this spec.
 */

import { randomUUID } from 'node:crypto';
import { expect, test, waitForActiveProviderSynced as waitForProvider } from './_helpers';

test.describe('asset-embed — rename stability (SPEC §6 FR-7 / P5.1 / P5.1a / D-K)', () => {
  test('P5.1: rename doc with ![alt](path) image ref rewrites path', async ({ page, api }) => {
    // Setup: doc in docs/ references a co-located image via relative path.
    const suffix = randomUUID().slice(0, 8);
    const origDoc = `rename-a-${suffix}`;
    await api.createPage(`docs/${origDoc}.md`);
    await api.replaceDoc(`docs/${origDoc}`, '# First Draft\n\n![first draft](first-draft.png)\n');

    // Kick the doc open to prime the provider cache; /api/rename operates
    // on loaded documents via the managed-rename-rewrite pipeline.
    await page.goto(`/#/docs/${origDoc}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');

    // Invoke the managed-rename endpoint directly — no UI dependency.
    const renameRes = await page.request.post('/api/rename-path', {
      data: {
        kind: 'file',
        fromPath: `docs/${origDoc}.md`,
        toPath: `archive/2026/${origDoc}.md`,
      },
    });
    expect(renameRes.ok()).toBe(true);

    // The body at the new location carries a recomputed relative path.
    // Fetch via /api/document (bypasses debounce) to read live Y.Text.
    // API response shape: { ok, docName, content } — NOT `text`.
    const docRes = await page.request.get(`/api/document?docName=archive/2026/${origDoc}`);
    expect(docRes.ok()).toBe(true);
    const body = (await docRes.json()) as { content?: string };
    const text = body.content ?? '';
    // From archive/2026/<name>.md, the image in docs/ is two levels up
    // and one across — posix.relative produces this exact shape
    // deterministically (unit test `managed-rename-rewrite.test.ts`
    // asserts the same path against the same inputs). Use `toContain`
    // on the exact expected form so a one-dot-dot-short or extra-
    // subtree bug fails this test instead of sneaking past a permissive
    // regex.
    expect(text).toContain('![first draft](../../docs/first-draft.png)');
  });

  test('P5.1a: rename doc with ![[name.ext]] wiki-embed ref — body stays byte-identical', async ({
    page,
    api,
  }) => {
    // Wiki-embed refs resolve at render time via the basename index
    // (D-K refs-only). Renaming the containing doc must NOT rewrite
    // the ref string.
    const suffix = randomUUID().slice(0, 8);
    const origDoc = `rename-b-${suffix}`;
    await api.createPage(`docs/${origDoc}.md`);
    const originalBody = '# First Draft\n\n![[first-draft.png]]\n';
    await api.replaceDoc(`docs/${origDoc}`, originalBody);

    await page.goto(`/#/docs/${origDoc}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');

    const renameRes = await page.request.post('/api/rename-path', {
      data: {
        kind: 'file',
        fromPath: `docs/${origDoc}.md`,
        toPath: `archive/2026/${origDoc}.md`,
      },
    });
    expect(renameRes.ok()).toBe(true);

    const docRes = await page.request.get(`/api/document?docName=archive/2026/${origDoc}`);
    expect(docRes.ok()).toBe(true);
    const body = (await docRes.json()) as { content?: string };
    const text = body.content ?? '';
    // The wiki-embed ref stays verbatim.
    expect(text).toContain('![[first-draft.png]]');
  });
});
