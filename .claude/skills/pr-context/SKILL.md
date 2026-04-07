---
name: pr-context
description: Local review context generated from git state.
---

# PR Review Context

(!IMPORTANT)

Use this context to:
1. Get an initial sense of the purpose and scope of the local changes
2. Review the current branch against the target branch without relying on GitHub APIs
3. Identify what needs attention before the changes are pushed

---

## PR Metadata

| Field | Value |
|---|---|
| **PR** | Local review — feat/init-spike vs main |
| **Author** | Nick Gomez |
| **Base** | `main` |
| **Repo** | inkeep/open-knowledge |
| **Head SHA** | `f67d819fabaeca662904db7474ff3fee34864ea1` |
| **Size** | 31 commits · +40700/-0 · 56 files |
| **Labels** | _None — local review._ |
| **Review state** | LOCAL |
| **Diff mode** | `summary` — reviewers must read tracked file diffs on-demand |
| **Event** | `local:manual` |
| **Trigger command** | `local-review` |
| **Review scope** | `delta` — scoped to changes since last review (delta from f67d819fab) |

## Description

Local review — no PR description is available.

## Linked Issues

_No linked issues in local review mode._

## Commit History

Commits reachable from HEAD and not in the target branch (oldest → newest). Local staged and unstaged changes may also be present in the diff below.

```
3167755 [US-001] Scaffold init_spike project with Vite + React + TypeScript + Biome
7d6b1f1 [US-002] V2: Embed Hocuspocus in Vite with TipTap WYSIWYG editor
f679a69 [US-003] V1a: Measure raw markdown round-trip fidelity without fixes
43e7c27 [US-004] V7: FAIL — Yjs v14 delta protocol not viable for dual-binding
2d33194 [US-005] V3: DirectConnection agent writes via HTTP API + CLI
54345a4 [US-006] V6: Void node with React component preview
c26794d [US-007] V1b: Apply markdown round-trip fixes — zero semantic loss
8dd6812 [US-008] V4b: Source toggle — serialize-on-toggle via updateYFragment
0a1c624 [US-009] V5: Git auto-persistence pipeline (CRDT → disk → git)
df0205b [US-010] Final RESULTS.md compilation — all validations documented
298e26b fix: address post-implementation review findings
ad32782 docs: add README and update CLAUDE.md for init_spike
3f1a241 docs: add fumadocs documentation site
ab08dd1 chore: update gitignore for docs site (.next, .source)
6751db6 fixup! local-review: baseline (pre-review state)
cf05381 fixup! local-review: address findings (pass 1)
4627e4c fix: source toggle round-trip and frontmatter sync
adf298b Add research reports submodule and reference table in PROJECT.md
4a244c0 fixup! local-review: baseline (pre-review state)
c8bedbc fixup! local-review: address findings (pass 1)
7a998c6 test: add agent→editor flow e2e tests and fix duplicate Link extension
20fe750 Update pr-context skill, diff, and test doc content
c97fb00 spec: agent markdown write path + three-way merge source toggle
95b7eb4 [US-001] three-way merge on toggle-back preserves agent writes
25e5f4f [US-002] conflict detection — user wins for conflicting paragraphs
d236989 [US-003] agent markdown write endpoint (POST /api/agent-write-md)
af0232f [US-004] source mode live injection — agent writes appear in CodeMirror
a912b36 [US-005] combined A3 test and RESULTS.md update
6f37a03 docs: document agent markdown write path and three-way merge
42f5e10 fixup! local-review: baseline (pre-review state)
f67d819 fixup! local-review: address findings (pass 1)
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 .claude/pr-diff/local-review-target-branch.txt     |     1 +
 .gitignore                                         |     7 +
 .gitmodules                                        |     3 +
 PROJECT.md                                         |    50 +
 docs/.gitignore                                    |     2 +
 docs/content/agent-write-path.mdx                  |    92 +
 docs/content/architecture.mdx                      |    92 +
 docs/content/meta.json                             |     3 +
 docs/content/overview.mdx                          |    31 +
 docs/content/validations.mdx                       |    93 +
 docs/next-env.d.ts                                 |     6 +
 docs/next.config.ts                                |    10 +
 docs/package.json                                  |    28 +
 docs/postcss.config.mjs                            |     8 +
 docs/source.config.ts                              |    17 +
 docs/src/app/[[...slug]]/page.tsx                  |    37 +
 docs/src/app/global.css                            |     3 +
 docs/src/app/layout.tsx                            |    19 +
 docs/src/lib/source.ts                             |     7 +
 docs/src/mdx-components.tsx                        |     8 +
 docs/tailwind.config.ts                            |    13 +
 docs/tsconfig.json                                 |    36 +
 init_spike/CLAUDE.md                               |    66 +
 init_spike/README.md                               |   130 +
 init_spike/RESULTS.md                              |   268 +
 init_spike/biome.jsonc                             |    32 +
 init_spike/content/test-doc.md                     | 36868 +++++++++++++++++++
 init_spike/content/test-fixture.md                 |    60 +
 init_spike/index.html                              |    12 +
 init_spike/package.json                            |    55 +
 init_spike/src/App.tsx                             |   115 +
 init_spike/src/editor/Callout.tsx                  |    19 +
 init_spike/src/editor/SourceEditor.tsx             |    61 +
 init_spike/src/editor/TiptapEditor.tsx             |   156 +
 .../src/editor/extensions/JsxComponentView.tsx     |    45 +
 .../src/editor/extensions/frontmatter.test.ts      |    58 +
 init_spike/src/editor/extensions/frontmatter.ts    |    24 +
 init_spike/src/editor/extensions/jsx-component.ts  |    75 +
 init_spike/src/editor/extensions/shared.ts         |    23 +
 init_spike/src/editor/three-way-merge.ts           |   209 +
 init_spike/src/main.tsx                            |    12 +
 init_spike/src/server/agent-flow.test.ts           |   573 +
 init_spike/src/server/agent-sim.ts                 |    64 +
 init_spike/src/server/hocuspocus-plugin.ts         |   159 +
 init_spike/src/server/persistence.test.ts          |    38 +
 init_spike/src/server/persistence.ts               |   199 +
 init_spike/src/types/diff.d.ts                     |    10 +
 init_spike/src/v1a-roundtrip-test.ts               |   126 +
 init_spike/src/v1b-roundtrip-test.ts               |   136 +
 init_spike/src/v7-test/delta-protocol-test.ts      |   107 +
 init_spike/src/v7-test/package-lock.json           |   147 +
 init_spike/src/v7-test/package.json                |    15 +
 init_spike/tsconfig.json                           |    19 +
 init_spike/vite.config.ts                          |     7 +
 reports                                            |     1 +
 specs/2026-04-07-agent-markdown-writes/SPEC.md     |   245 +
 56 files changed, 40700 insertions(+)
```

Full file list (including untracked files when present):

```
.claude/pr-diff/local-review-target-branch.txt
.gitignore
.gitmodules
PROJECT.md
docs/.gitignore
docs/content/agent-write-path.mdx
docs/content/architecture.mdx
docs/content/meta.json
docs/content/overview.mdx
docs/content/validations.mdx
docs/next-env.d.ts
docs/next.config.ts
docs/package.json
docs/postcss.config.mjs
docs/source.config.ts
docs/src/app/[[...slug]]/page.tsx
docs/src/app/global.css
docs/src/app/layout.tsx
docs/src/lib/source.ts
docs/src/mdx-components.tsx
docs/tailwind.config.ts
docs/tsconfig.json
init_spike/CLAUDE.md
init_spike/README.md
init_spike/RESULTS.md
init_spike/biome.jsonc
init_spike/content/test-doc.md
init_spike/content/test-fixture.md
init_spike/index.html
init_spike/package.json
init_spike/src/App.tsx
init_spike/src/editor/Callout.tsx
init_spike/src/editor/SourceEditor.tsx
init_spike/src/editor/TiptapEditor.tsx
init_spike/src/editor/extensions/JsxComponentView.tsx
init_spike/src/editor/extensions/frontmatter.test.ts
init_spike/src/editor/extensions/frontmatter.ts
init_spike/src/editor/extensions/jsx-component.ts
init_spike/src/editor/extensions/shared.ts
init_spike/src/editor/three-way-merge.ts
init_spike/src/main.tsx
init_spike/src/server/agent-flow.test.ts
init_spike/src/server/agent-sim.ts
init_spike/src/server/hocuspocus-plugin.ts
init_spike/src/server/persistence.test.ts
init_spike/src/server/persistence.ts
init_spike/src/types/diff.d.ts
init_spike/src/v1a-roundtrip-test.ts
init_spike/src/v1b-roundtrip-test.ts
init_spike/src/v7-test/delta-protocol-test.ts
init_spike/src/v7-test/package-lock.json
init_spike/src/v7-test/package.json
init_spike/tsconfig.json
init_spike/vite.config.ts
reports
specs/2026-04-07-agent-markdown-writes/SPEC.md
```

## Diff

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~943152 bytes across ~56 files) exceeds the inline threshold (~100KB).
> The full diff is written to `.claude/pr-diff/full.diff`.
>
> **How to read diffs on-demand:**
> - Specific file: `git diff 622fa0668dce2b2259d5ff57ac23d2c703903e55 -- path/to/file.ts`
> - Full diff: read `.claude/pr-diff/full.diff`
> - Untracked files: inspect the file directly in the working tree

## Changes Since Last Review

### Delta Files

```
_No files changed in delta._
```

### Delta Stats

```
_No stats available._
```

### Delta Diff

_No delta diff available._

> **Review Focus:** This is a re-review scoped to changes since the last review pass (`f67d819fab`). Focus your review on the delta — the changes made to address prior findings. The full branch diff is still available above for context, but your review should prioritize the delta changes.

## Review Iteration History

# Review Iteration Log

---

## Review Pass 0
**Recommendation: **💡 APPROVE WITH SUGGESTIONS**** | **Risk: **Medium****

<details>
<summary>Full review</summary>

## PR Review Summary

**(7) Total Issues** | Risk: **Medium** | Recommendation: **💡 APPROVE WITH SUGGESTIONS**

### 🟡 Minor (7)

🟡 1) `init_spike/src/editor/three-way-merge.ts:107-126 || positional-merge-limitation` **Position-based block matching silently mishandles structural edits**

**Issue:** The three-way merge identifies agent-added content solely by positional index: blocks beyond `snapshotBlocks.length` are classified as agent-added (line 109), and conflict detection compares blocks at matching indices (lines 114-126). When the user inserts or deletes paragraphs in source mode, indices shift and produce misaligned comparisons. For example, a user-deleted paragraph causes `userBlocks[i]` to be `undefined` for trailing indices, which is coerced to `undefined !== snapshotBlock → true`, producing spurious conflict reports. Agent insertions *within* existing content (not at the end) are silently dropped because only blocks beyond `snapshotBlocks.length` are preserved.

**Why:** The spec (A2, item 5) explicitly requires a fallback when "markdown structure changed too drastically for paragraph-level mapping," but the code proceeds with misaligned indices rather than falling back. The conflict metadata returned to callers is unreliable when paragraph counts differ, and mid-document agent insertions — a realistic use case — are silently lost. The tested scenarios all cover append-only agent writes, masking this limitation.

**Fix:** Two options: (1) Add a guard that detects `userBlocks.length !== snapshotBlocks.length` and falls back to `applyWholeDoc` with a documented reason. This is minimal and matches the spec's stated fallback expectation. (2) Replace the positional comparison with content-aware diffing using the already-imported `diff` library at the block level (`diffLines` on `snapshotBlocks` vs `currentBlocks` and `snapshotBlocks` vs `userBlocks`), then merge the edit scripts. Either way, add a test that exercises user paragraph insertion/deletion during source mode to document the expected behavior.

**Refs:**
- `specs/2026-04-07-agent-markdown-writes/SPEC.md` — A2 item 5: "fallback when markdown structure changed too drastically"
- `init_spike/src/server/agent-flow.test.ts` — existing tests only cover append-only scenarios

---

🟡 2) `init_spike/src/server/persistence.ts:159-182 || no-temp-cleanup-on-save-failure` **Atomic write leaves orphaned temp file on rename failure**

**Issue:** The `onStoreDocument` handler has no try-catch. If `writeFile` to `${filePath}.tmp` succeeds but `rename` fails (disk full, permission denied, cross-device rename), the temp file is left on disk and the error propagates to Hocuspocus. There is no cleanup of the `.tmp` file on failure.

**Why:** The atomic write pattern (temp file + rename) is correctly designed, but incomplete without cleanup. On rename failure, users' WYSIWYG edits appear to save (no browser error) but the disk file is stale. The reliance on Hocuspocus surfacing this error to WebSocket clients is undocumented and unverified.

**Fix:** Wrap in try-catch with cleanup:
```typescript
const tmpPath = `${filePath}.tmp`;
try {
  await writeFile(tmpPath, markdown, 'utf-8');
  await rename(tmpPath, filePath);
} catch (e) {
  try { unlinkSync(tmpPath); } catch { /* cleanup best-effort */ }
  console.error(`[persistence] Failed to save ${documentName}:`, e);
  throw e; // Re-throw for Hocuspocus
}
```

**Refs:**
- `init_spike/src/server/persistence.ts:172-176` — current atomic write without cleanup

---

🟡 3) `init_spike/src/server/persistence.ts:50-56 || silent-catch-git-rev-parse` **Empty catch swallows all git errors, not just empty-repo case**

**Issue:** The inner try-catch at lines 51-56 catches ALL errors from `git rev-parse HEAD^{tree}` and silently falls back to an empty index. The comment says "Empty repo — start with empty index," but this catch suppresses permission errors, corrupted git objects, wrong `PROJECT_DIR`, etc.

**Why:** If `HEAD^{tree}` fails for a reason other than an empty repo, every `commitToWipRef()` call silently creates commits from an empty index instead of the repo's current tree. This would overwrite `refs/wip/main` with commits containing ONLY the content directory. No error is ever logged, making this extremely hard to diagnose.

**Fix:** Log non-empty-repo errors:
```typescript
try {
  const headTree = (await git.raw('rev-parse', 'HEAD^{tree}')).trim();
  await git.env(env).raw('read-tree', headTree);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('unknown revision') || msg.includes('bad revision')) {
    console.log('[persistence] Empty repo — starting with empty index');
  } else {
    console.error('[persistence] Failed to read HEAD tree, falling back to empty index:', e);
  }
}
```

---

🟡 4) `init_spike/src/editor/TiptapEditor.tsx:118-131 || frontmatter-outside-transaction` **Frontmatter metadata update is a separate Yjs transaction from the content merge**

**Issue:** In `applyThreeWayMerge`, `metaMap.set('frontmatter', ...)` on line 122 executes as an implicit auto-transaction, while the content update inside `threeWayMerge` runs in its own `doc.transact()` call (line 148 of `three-way-merge.ts`). These are two separate Yjs transactions that propagate independently. A remote client could observe the frontmatter change before the content change, producing a transient inconsistency. The `applyMarkdown` method (lines 90-97) correctly wraps both in a single `provider.document.transact()`.

**Why:** Transient desynchronization between frontmatter and content could cause the persistence layer to save a file with mismatched frontmatter/body if a save triggers between the two transactions.

**Fix:** Wrap both operations in a single transaction, matching the `applyMarkdown` pattern. This requires `threeWayMerge` to accept a `{ skipTransact: true }` option, or restructuring so the caller owns the outer transaction.

**Refs:**
- `init_spike/src/editor/TiptapEditor.tsx:90-97` — `applyMarkdown` correctly uses single transaction

---

🟡 5) `init_spike/src/server/hocuspocus-plugin.ts:74-80 || no-body-size-limit` **No request body size limit on `/api/agent-write-md`**

**Issue:** The body reading loop at lines 76-79 accumulates the entire request into memory with no size cap. A large POST request can exhaust server memory.

**Why:** Even in a spike, this endpoint is the documented production-path API for agent writes. A single curl command with `/dev/urandom` or a large JSON payload could crash the dev server.

**Fix:**
```typescript
const MAX_BODY_BYTES = 1_048_576; // 1 MB
let totalBytes = 0;
for await (const chunk of req) {
  totalBytes += (chunk as Buffer).length;
  if (totalBytes > MAX_BODY_BYTES) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
    return;
  }
  chunks.push(chunk as Buffer);
}
```

---

🟡 6) `init_spike/src/server/hocuspocus-plugin.ts:80 || unsafe-json-parse-cast` **Unsafe `as` assertion on untrusted JSON.parse result**

**Issue:** The request body is parsed with `JSON.parse()` and immediately cast via `as { markdown: string; position?: ... }`. `JSON.parse` can return `null`, a number, an array, or any shape. If the body is `null` or a primitive, accessing `body.markdown` on line 85 throws a `TypeError` that reaches the catch block and returns 500 instead of the appropriate 400.

**Why:** Malformed request bodies should return 400 (Bad Request), not 500 (Internal Server Error). The `position` field is never validated — a client sending `position: 'replace'` silently falls through to the append branch.

**Fix:** Validate before casting:
```typescript
let body: unknown;
try {
  body = JSON.parse(Buffer.concat(chunks).toString());
} catch {
  res.writeHead(400, ...); res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' })); return;
}
if (!body || typeof body !== 'object' || Array.isArray(body)) {
  res.writeHead(400, ...); res.end(JSON.stringify({ ok: false, error: 'Body must be a JSON object' })); return;
}
```
Also validate `position` if provided: reject values other than `'append'` | `'prepend'`.

---

🟡 7) `init_spike/src/server/persistence.ts:187-189 || dead-code-cacheFrontmatter` **Exported `cacheFrontmatter` is dead code**

**Issue:** `cacheFrontmatter` is exported but never imported or called anywhere in the codebase. The internal `frontmatterCache.set()` inside `onLoadDocument` (line 133) handles the only real use case. Additionally, the in-memory `frontmatterCache` Map duplicates the Y.Doc metadata map as a source of truth, creating a three-source frontmatter pattern (Y.Doc metadata, server cache, client ref) that can diverge.

**Why:** Dead exports mislead future developers into thinking there's an external call site. The three-source frontmatter pattern is a known split-brain risk when transitioning from spike to production.

**Fix:** Remove the exported `cacheFrontmatter` function. Consider eliminating `frontmatterCache` entirely — the Y.Doc metadata map is already the authoritative source, and the persistence layer reads from it first (line 167).

---

### 💭 Consider (3)

💭 1) `init_spike/src/editor/TiptapEditor.tsx:73-74` **Silent empty-string return from `getMarkdown()` when editor is null**

When `editor` is null (e.g., during React initialization), `getMarkdown()` returns `''`. The caller in `App.tsx:62` stores this as the snapshot for three-way merge. An empty snapshot poisons the merge base — the merge would treat ALL Y.Doc content as "agent-added" and ALL user edits as "user changes." The caller already has try-catch, so throwing an error would abort the toggle cleanly. However, the `if (editor)` guard in `App.tsx:60` partially mitigates this by checking the handle ref first. This is a developer judgment call — throwing is safer but the current guard may be sufficient if `useEditor()` always resolves before user interaction.

💭 2) `init_spike/src/server/hocuspocus-plugin.ts:95-96` **MarkdownManager instantiated per-request**

`MarkdownManager` and `getSchema()` are created inside the request handler on every `POST /api/agent-write-md`. The persistence layer (`persistence.ts:24-25`) correctly instantiates these as module-level singletons. Both are stateless given the same extensions. Hoisting to module scope would be more consistent and avoid redundant work.

💭 3) `init_spike/src/editor/TiptapEditor.tsx:136-137` **Stale code comment**

The comment says "We use a flag that's set during applyMarkdown/threeWayMerge" to avoid feedback loops. No such flag exists. The actual mechanism is unsubscribing the observer in `App.tsx:34-37` before calling `applyThreeWayMerge`. The comment describes an abandoned design approach.

---

### 🧹 While You're Here (1)

🧹 1) `init_spike/src/editor/TiptapEditor.tsx:16` **`applyMarkdown` is dead code on the handle interface**

`applyMarkdown` is defined on `TiptapEditorHandle` (line 16) and implemented (line 79) but has zero call sites. After `applyThreeWayMerge` was introduced, it became unused. Consider removing it from the interface and implementation, or documenting it as a public API for future consumers.

---

## 💡 APPROVE WITH SUGGESTIONS

**Summary:** This is a well-structured spike with strong architectural decisions (CRDT + three-way merge, atomic writes, git plumbing isolation), comprehensive validation evidence, and good test coverage of the critical paths. The issues found are all Minor-severity — the three-way merge positional limitation is the most significant but is partially covered by the spec's acknowledged R1 risk. The error handling gaps (temp file cleanup, silent catch, missing body size limit) and frontmatter transaction atomicity are straightforward to address.

<details>
<summary>Discarded (19)</summary>

| Location | Issue | Reason Discarded |
|----------|-------|------------------|
| `hocuspocus-plugin.ts:34-67` | No authentication on agent write endpoints | Expected for local-only spike; explicitly noted in CLAUDE.md. Not actionable in current scope. |
| `hocuspocus-plugin.ts:25-31` | No WebSocket origin validation | Same — local spike, no auth system to validate against. |
| `TiptapEditor.tsx:30` | Hardcoded `ws://` WebSocket URL | Expected for localhost dev server. Production deployment is out of scope. |
| `hocuspocus-plugin.ts:58-62` | Error messages leak internal details | Low-impact for local-only spike. Would matter in production. |
| `persistence.ts:165-170` | Frontmatter content injection via Y.Doc metadata | Requires auth as prerequisite — without auth, content is already fully controllable. Defense-in-depth but not actionable without addressing auth first. |
| `hocuspocus-plugin.ts:59` | Log injection via unsanitized error messages | Extremely low-impact for a local dev server. |
| `hocuspocus-plugin.ts:25-31` | No error handling on WebSocket upgrade | Hocuspocus's `handleConnection` is designed to handle errors internally. Adding try-catch around it is defensive but the current behavior hasn't been shown to crash. |
| `persistence.ts:111-118` | Shutdown handler doesn't await async commit | Known Node.js limitation. The current code does prevent default SIGINT exit by registering a listener. The commit will run unless something else force-kills the process. |
| `persistence.ts:78-79` | Outer catch in commitToWipRef swallows errors | By design — git commit failures should not crash the server. The error IS logged. Adding a consecutive-failure counter is nice-to-have but not a real issue. |
| `persistence.ts:81-84` | Empty catch in finally for temp index cleanup | Cleanup failures for temp files are conventionally acceptable to swallow. |
| `persistence.ts:125-157` | No try-catch in onLoadDocument | Error propagation to Hocuspocus is the documented and intended behavior. Adding logging would help debugging but the pattern is correct. |
| `TiptapEditor.tsx:138-146` | Observer catches serialization errors silently | The `console.warn` is appropriate for a transient serialization failure. Escalating to `error` is a preference, not a bug. |
| `hocuspocus-plugin.ts:42-63` | conn.disconnect() inside try block | If disconnect fails after a successful transact, the write IS in the CRDT. The 500 response is misleading but the data is safe. Low-impact edge case. |
| `three-way-merge.ts:20-31` | ThreeWayMergeResult allows contradictory states | Valid type design observation but the current codebase only constructs valid combinations. Over-engineering the type for a spike. |
| `types/diff.d.ts:2-7` | Change interface allows added+removed simultaneously | Ambient type declaration for a third-party library. The loose typing is conventional for `.d.ts` files. |
| `TiptapEditor.tsx:99-110` | applyThreeWayMerge returns fake result when editor null | The `if (editor)` guard in App.tsx:41 prevents this path in practice. The edge case requires editor null during user interaction, which is extremely unlikely. |
| `v7-test/` directory | V7 FAIL validation code shipped as committed code | Has defensible value as a reproducible proof artifact. The directory is excluded from tsconfig and biome. |
| Docs: `architecture.mdx` | Various minor doc inaccuracies (y-prosemirror vs @tiptap/y-tiptap naming) | These are naming nuances, not factual errors. TipTap v3 wraps y-prosemirror, so saying "via y-prosemirror" is loosely accurate. |
| Docs: `validations.mdx` | Content duplicates RESULTS.md | Both serve different audiences (docs site vs. spike directory). Reasonable duplication for a spike transitioning to a product. |

</details>

<details>
<summary>Reviewer Stats</summary>

| Reviewer | Returned | Kept |
|----------|----------|------|
| `pr-review-standards` | 4 | 2 |
| `pr-review-tests` | 7 | 1 |
| `pr-review-errors` | 11 | 2 |
| `pr-review-appsec` | 8 | 1 |
| `pr-review-architecture` | 7 | 1 |
| `pr-review-types` | 4 | 0 |
| `pr-review-precision` | 9 | 2 |
| `pr-review-docs` | 14 | 0 |

</details>

</details>

## Fix Response 1

### Addressed
- 🟡 **positional-merge-limitation** (`three-way-merge.ts:105`): Added guard — when `userBlocks.length !== snapshotBlocks.length`, falls back to `applyWholeDoc` with descriptive reason. Matches spec A2 item 5 fallback requirement. Prevents unreliable positional conflict detection when user inserts/deletes paragraphs.

- 🟡 **no-temp-cleanup-on-save-failure** (`persistence.ts:172-176`): Wrapped atomic write in try-catch. On failure, temp file is cleaned up (best-effort `unlinkSync`), error is logged, and re-thrown for Hocuspocus.

- 🟡 **silent-catch-git-rev-parse** (`persistence.ts:50-56`): Added error discrimination — checks for `unknown revision` / `bad revision` (expected empty-repo case) vs unexpected errors. Unexpected errors now logged at `console.error` level instead of silently swallowed.

- 🟡 **frontmatter-outside-transaction** (`TiptapEditor.tsx:118-131`): Wrapped `metaMap.set('frontmatter', ...)` and `threeWayMerge()` call in a single `provider.document.transact()`. Yjs nested transactions are supported — the inner `doc.transact()` in `threeWayMerge` merges into the outer transaction. Matches the atomicity pattern in the (now-removed) `applyMarkdown`.

- 🟡 **no-body-size-limit** (`hocuspocus-plugin.ts:76-79`): Added 1 MB (`MAX_BODY_BYTES`) guard on the body reading loop. Returns 413 Payload Too Large when exceeded.

- 🟡 **unsafe-json-parse-cast** (`hocuspocus-plugin.ts:80`): Separated JSON.parse into its own try-catch returning 400 for invalid JSON. Added body shape validation (`typeof === 'object'`, not array, not null). Position field now explicitly normalized: only `'prepend'` is recognized, everything else defaults to `'append'`.

- 🟡 **dead-code-cacheFrontmatter** (`persistence.ts:187-189`): Removed the exported `cacheFrontmatter` function. Confirmed zero import sites — the internal `frontmatterCache.set()` in `onLoadDocument` handles all actual usage.

- 💭 **MarkdownManager-per-request** (`hocuspocus-plugin.ts:95-96`): Hoisted `MarkdownManager` and `getSchema()` to module-level singletons, matching the pattern in `persistence.ts`. Both are stateless given the same extensions.

- 💭 **stale-code-comment** (`TiptapEditor.tsx:136-137`): Replaced stale comment about a non-existent flag with accurate description of the actual mechanism (App.tsx unsubscribes observer before toggle-back).

- 🧹 **dead-applyMarkdown** (`TiptapEditor.tsx:16,79`): Removed `applyMarkdown` from the `TiptapEditorHandle` interface and its implementation. Zero call sites after `applyThreeWayMerge` was introduced. Also removed the now-unused `updateYFragment` import.

### Declined
- 💭 **silent-empty-string-return** (`TiptapEditor.tsx:73-74`): The existing guard in `App.tsx:60` (`if (editor)`) checks the `editorRef` before calling `getMarkdown()`. The internal `editor` being null requires the component to be mounted but `useEditor()` not yet resolved — which is impossible during user interaction (the toggle button can't be clicked before the editor renders). The reviewer acknowledged this is a judgment call. Existing guards are sufficient for a spike.


## Prior Feedback

> **IMPORTANT:** Local review mode does not load prior PR threads or prior review summaries. Treat this as a first-pass review of the current local changes unless the invoker provided additional context elsewhere.

### Automated Review Comments

_None (local review)._

### Human Review Comments

_None (local review)._

### Previous Review Summaries

_None (local review)._

### PR Discussion

_None (local review)._

## GitHub URL Base (for hyperlinks)

No GitHub PR context is available in local review mode.
- For in-repo citations, use repo-relative `path:line` or `path:start-end` references instead of GitHub blob URLs.
- External docs may still use standard markdown hyperlinks.
