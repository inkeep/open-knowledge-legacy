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
| **Head SHA** | `c8bedbcb8bf012b9b95cfc33c32d7534264b587e` |
| **Size** | 20 commits · +2490/-0 · 51 files |
| **Labels** | _None — local review._ |
| **Review state** | LOCAL |
| **Diff mode** | `summary` — reviewers must read tracked file diffs on-demand |
| **Event** | `local:manual` |
| **Trigger command** | `local-review` |
| **Review scope** | `delta` — scoped to changes since last review (delta from c8bedbcb8b) |

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
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 .claude/pr-diff/local-review-target-branch.txt     |   1 +
 .gitignore                                         |   7 +
 .gitmodules                                        |   3 +
 PROJECT.md                                         |  50 +++++
 docs/.gitignore                                    |   2 +
 docs/content/architecture.mdx                      |  87 +++++++++
 docs/content/meta.json                             |   3 +
 docs/content/overview.mdx                          |  31 +++
 docs/content/validations.mdx                       |  76 ++++++++
 docs/next-env.d.ts                                 |   6 +
 docs/next.config.ts                                |  10 +
 docs/package.json                                  |  28 +++
 docs/postcss.config.mjs                            |   8 +
 docs/source.config.ts                              |  17 ++
 docs/src/app/[[...slug]]/page.tsx                  |  37 ++++
 docs/src/app/global.css                            |   3 +
 docs/src/app/layout.tsx                            |  19 ++
 docs/src/lib/source.ts                             |   7 +
 docs/src/mdx-components.tsx                        |   8 +
 docs/tailwind.config.ts                            |  13 ++
 docs/tsconfig.json                                 |  36 ++++
 init_spike/CLAUDE.md                               |  63 ++++++
 init_spike/README.md                               | 120 ++++++++++++
 init_spike/RESULTS.md                              | 217 +++++++++++++++++++++
 init_spike/biome.jsonc                             |  32 +++
 init_spike/content/test-doc.md                     |  76 ++++++++
 init_spike/content/test-fixture.md                 |  60 ++++++
 init_spike/index.html                              |  12 ++
 init_spike/package.json                            |  54 +++++
 init_spike/src/App.tsx                             |  86 ++++++++
 init_spike/src/editor/Callout.tsx                  |  19 ++
 init_spike/src/editor/SourceEditor.tsx             |  61 ++++++
 init_spike/src/editor/TiptapEditor.tsx             | 105 ++++++++++
 .../src/editor/extensions/JsxComponentView.tsx     |  45 +++++
 .../src/editor/extensions/frontmatter.test.ts      |  58 ++++++
 init_spike/src/editor/extensions/frontmatter.ts    |  24 +++
 init_spike/src/editor/extensions/jsx-component.ts  |  75 +++++++
 init_spike/src/editor/extensions/shared.ts         |  25 +++
 init_spike/src/main.tsx                            |  12 ++
 init_spike/src/server/agent-sim.ts                 |  43 ++++
 init_spike/src/server/hocuspocus-plugin.ts         |  66 +++++++
 init_spike/src/server/persistence.test.ts          |  38 ++++
 init_spike/src/server/persistence.ts               | 189 ++++++++++++++++++
 init_spike/src/v1a-roundtrip-test.ts               | 126 ++++++++++++
 init_spike/src/v1b-roundtrip-test.ts               | 136 +++++++++++++
 init_spike/src/v7-test/delta-protocol-test.ts      | 107 ++++++++++
 init_spike/src/v7-test/package-lock.json           | 147 ++++++++++++++
 init_spike/src/v7-test/package.json                |  15 ++
 init_spike/tsconfig.json                           |  19 ++
 init_spike/vite.config.ts                          |   7 +
 reports                                            |   1 +
 51 files changed, 2490 insertions(+)
```

Full file list (including untracked files when present):

```
.claude/pr-diff/local-review-target-branch.txt
.gitignore
.gitmodules
PROJECT.md
docs/.gitignore
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
init_spike/src/main.tsx
init_spike/src/server/agent-sim.ts
init_spike/src/server/hocuspocus-plugin.ts
init_spike/src/server/persistence.test.ts
init_spike/src/server/persistence.ts
init_spike/src/v1a-roundtrip-test.ts
init_spike/src/v1b-roundtrip-test.ts
init_spike/src/v7-test/delta-protocol-test.ts
init_spike/src/v7-test/package-lock.json
init_spike/src/v7-test/package.json
init_spike/tsconfig.json
init_spike/vite.config.ts
reports
```

## Diff

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~110671 bytes across ~51 files) exceeds the inline threshold (~100KB).
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

> **Review Focus:** This is a re-review scoped to changes since the last review pass (`c8bedbcb8b`). Focus your review on the delta — the changes made to address prior findings. The full branch diff is still available above for context, but your review should prioritize the delta changes.

## Review Iteration History

# Review Iteration Log

---

## Review Pass 0
**Recommendation: **🚫 REQUEST CHANGES**** | **Risk: **High**** | **Blocking:** 2 Critical, 5 Major

<details>
<summary>Full review</summary>

## PR Review Summary

**(9) Total Issues** | Risk: **High** | Recommendation: **🚫 REQUEST CHANGES**

### 🔴 Critical (2)

🔴 1) `init_spike/src/server/persistence.ts:45 || git-add-pollutes-shared-index` **`git add` uses shared index, corrupting staging area and WIP tree objects**

**Issue:** `commitToWipRef` uses `git.add('content/')` — a porcelain command that mutates the shared `.git/index`. This causes two problems: (1) content files are silently staged into the developer's index, so `git status` shows unexpected staged changes, and (2) `git write-tree` on line 46 captures the *entire* index (not just `content/`), so WIP commits include the full repo tree — including any user-staged changes to unrelated files. The README and RESULTS.md claim this uses "plumbing commands without checkout" but `git add` is porcelain.

**Why:** Every time the 30s git debounce fires, the developer's staging area is corrupted. Their next `git status`, `git stash`, or manual commit includes content files they did not stage. WIP ref history contains incorrect tree objects. This is not a theoretical concern — it happens on every successful auto-commit cycle.

**Fix:** Use a dedicated temporary index via `GIT_INDEX_FILE` environment variable. Seed it from HEAD's tree via `read-tree`, add only `content/` to it, and `write-tree` from it. Clean up the temp index in a `finally` block. `simple-git` supports this via `.env({ GIT_INDEX_FILE: path })`.
```typescript
const tmpIndex = resolve(PROJECT_DIR, '.git/index-wip');
const env = { GIT_INDEX_FILE: tmpIndex };
try {
  try {
    const headTree = (await git.raw('rev-parse', 'HEAD^{tree}')).trim();
    await git.env(env).raw('read-tree', headTree);
  } catch { /* empty repo — start with empty index */ }
  await git.env(env).raw('add', 'content/');
  const treeSha = (await git.env(env).raw('write-tree')).trim();
  // ... rest of commit-tree / update-ref unchanged
} finally {
  try { unlinkSync(tmpIndex); } catch { /* ignore */ }
}
```

**Refs:**
- `init_spike/RESULTS.md` — "Git plumbing commands: git add → write-tree → commit-tree → update-ref"
- [Git GIT_INDEX_FILE docs](https://git-scm.com/docs/git#Documentation/git.txt-codeGITINDEXFILEcode)

---

🔴 2) `init_spike/src/server/persistence.ts:112 || persistence-silent-data-loss` **Persistence error handlers silently swallow all failures, enabling data loss**

**Issue:** Both `onLoadDocument` (line 112) and `onStoreDocument` (line 138) catch all exceptions and only `console.error` them. This creates two distinct data-loss paths:

- **Load failure → overwrite:** If `onLoadDocument` fails (malformed content, parse error, schema mismatch), the Y.Doc is left empty. The user connects to an empty document. When they type anything, `onStoreDocument` fires and overwrites the original file with near-empty content. The original markdown file is permanently destroyed.

- **Save failure → silent loss:** If `onStoreDocument` fails (serialization error, disk full, permissions), the user's edits exist only in the in-memory Y.Doc. No disk write occurs, and `scheduleGitCommit()` is never called. If the server restarts, all unpersisted edits are lost with zero user-visible indication.

**Why:** These are not edge cases — the `onLoadDocument` path fires on every document open, and `onStoreDocument` fires on every edit cycle. A single markdown edge case that crashes the parser creates permanent content destruction. The user sees no error, no warning, and no indication their work is not being saved.

**Fix:** At minimum, propagate errors from `onLoadDocument` so Hocuspocus rejects the connection (the user sees a connection error rather than an empty document). For `onStoreDocument`, signal the failure to connected clients via Y.Doc metadata so the UI can display a warning:
```typescript
// onLoadDocument — let Hocuspocus handle the failure
catch (e) {
  console.error(`[persistence] Failed to load ${filePath}:`, e);
  throw e; // Client sees connection error, not empty doc
}

// onStoreDocument — signal to clients and optionally re-throw
catch (e) {
  console.error('[persistence] onStoreDocument failed:', e);
  const metaMap = document.getMap('metadata');
  metaMap.set('saveError', e instanceof Error ? e.message : String(e));
  throw e; // Let Hocuspocus know the store failed
}
```

**Refs:**
- `init_spike/src/server/persistence.ts:84-114` — onLoadDocument catch block
- `init_spike/src/server/persistence.ts:117-141` — onStoreDocument catch block

### 🟠 Major (5)

🟠 3) `init_spike/src/server/persistence.ts:68-77 || commit-scheduling-drops-writes` **Git commits silently dropped when previous commit is in-flight**

**Issue:** `scheduleGitCommit` (line 72) returns immediately when `commitInFlight` is truthy. The `.finally()` callback (line 73-75) clears `commitInFlight` but does not check whether new disk writes occurred during the in-flight commit. If a user stops editing while a commit is in-flight, disk writes made during that commit window are never committed to `refs/wip/main`.

**Why:** Under normal editing, the 30s debounce usually re-triggers. But the last save before a quiet period can be permanently orphaned from git history. Under load (e.g., agent-sim rapid writes), the gap is more pronounced.

**Fix:** Track a dirty flag set during skipped schedules, and re-schedule in the `.finally()` block:
```typescript
let pendingAfterCommit = false;
// In setTimeout callback:
if (commitInFlight) { pendingAfterCommit = true; return; }
commitInFlight = commitToWipRef().finally(() => {
  commitInFlight = null;
  if (pendingAfterCommit) { pendingAfterCommit = false; scheduleGitCommit(); }
});
```

---

🟠 4) `init_spike/src/server/persistence.ts:133 || non-atomic-file-write` **Non-atomic, synchronous file write risks partial content and blocks event loop**

**Issue:** `writeFileSync` on the `onStoreDocument` hot path has two problems: (1) it blocks the Node.js event loop during disk I/O, stalling all WebSocket message processing, and (2) it writes directly to the target file — if the process crashes mid-write, the file contains partial markdown that will fail to parse on reload.

**Why:** For a collaborative editor where all CRDT operations flow through the event loop, a blocking write creates latency spikes for all connected clients. The non-atomic write means a process crash (Ctrl+C during a write, OOM kill) can corrupt the canonical file.

**Fix:** Use async `writeFile` from `node:fs/promises`, and write-then-rename for atomicity:
```typescript
import { writeFile, rename } from 'node:fs/promises';
const tmpPath = `${filePath}.tmp`;
await writeFile(tmpPath, markdown, 'utf-8');
await rename(tmpPath, filePath); // atomic on POSIX
```

---

🟠 5) `init_spike/package.json || phantom-dependency-y-tiptap` **`@tiptap/y-tiptap` is a phantom dependency — imported directly but not declared**

**Issue:** Both `persistence.ts` (line 15) and `TiptapEditor.tsx` (line 5) import `updateYFragment` and `yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap`. This package is not in `package.json` — it resolves as a transitive dependency of `@tiptap/extension-collaboration`. If that parent package drops, version-bumps, or makes it optional, the import breaks with no signal in the dependency manifest.

**Why:** `@tiptap/y-tiptap` is load-bearing: it provides the Yjs↔ProseMirror bridge that the entire persistence pipeline and source toggle rely on. A phantom dependency on something this critical means version drift could silently break serialization.

**Fix:** Add `"@tiptap/y-tiptap": "^3.0.2"` as an explicit dependency in `package.json`.

---

🟠 6) `init_spike/package.json:7 || no-test-infrastructure` **No test framework, no test script, no automated tests**

**Issue:** The `package.json` has no `"test"` script and no test framework dependency. All validation is via manually-run scripts (`v1a/v1b-roundtrip-test.ts`, `v7-test/`, `agent-sim.ts`) that print to stdout with no assertions or exit codes. The `"check"` quality gate (`tsc + biome + vite build`) does not include tests. The round-trip convergence test — the central contract of this spike — cannot be run in CI.

**Why:** The CLAUDE.md states "This is foundational code — write it like it will be built upon." Every future developer inherits zero regression coverage and no infrastructure to add tests. The cost of adding a test framework grows with each commit. `stripFrontmatter` (data-integrity-critical), `safeContentPath` (security-critical), and the round-trip convergence contract are all unprotected.

**Fix:** Bun has built-in test support requiring zero additional dependencies:
1. Add `"test": "bun test"` to scripts.
2. Update `"check"` to: `"check": "tsc --noEmit && biome check . && bun test && vite build"`.
3. Start with the highest-value tests: `frontmatter.test.ts` (strip/prepend edge cases), `safeContentPath.test.ts` (path traversal), and convert `v1b-roundtrip-test.ts` to use assertions with a non-zero exit code on failure.

---

🟠 7) `init_spike/src/editor/extensions/shared.ts || server-imports-from-editor` **Server layer imports from editor layer — upward dependency coupling**

**Issue:** `persistence.ts` (lines 17-18) imports `stripFrontmatter`, `prependFrontmatter`, and `sharedExtensions` from `../editor/extensions/`. This creates a server→editor dependency. Today the imported modules are environment-agnostic, but any future change to `editor/extensions/` that introduces browser-only code (e.g., a new extension importing from `@tiptap/react` at module scope) will break the server-side persistence pipeline.

**Why:** The `shared.ts` file is already positioned as a shared kernel, but living inside `editor/extensions/` signals editor ownership. As the extension list grows, the likelihood of accidentally introducing a browser dependency increases. This is cheap to fix now and expensive once more server code depends on the `editor/` import path.

**Fix:** Move `shared.ts` and `frontmatter.ts` to a dedicated `src/shared/` directory. Both editor and server import downward from this shared kernel. This makes the dependency direction explicit and provides a natural home for the environment-agnostic extension list.

### 🟡 Minor (2)

🟡 8) `init_spike/src/App.tsx:31-36 || asymmetric-toggle-error-handling` **WYSIWYG-to-Source toggle missing try-catch (asymmetric with reverse direction)**

**Issue:** The Source→WYSIWYG toggle (lines 20-26) properly wraps `applyMarkdown` in try-catch and displays errors in a banner. The WYSIWYG→Source toggle (lines 31-36) calls `editor.getMarkdown()` without a try-catch. A serialization error on unexpected node types would crash the React render cycle with no user-facing error message.

**Fix:** Wrap the WYSIWYG→Source path in the same error handling pattern:
```typescript
try {
  const md = editor.getMarkdown();
  setSourceContent(md);
  setToggleError(null);
} catch (err) {
  setToggleError(err instanceof Error ? err.message : 'Failed to serialize markdown');
  return; // Stay in WYSIWYG mode
}
```

---

🟡 9) `init_spike/src/server/persistence.ts:49-52 || rev-parse-catch-swallows-all` **Inner catch in `rev-parse` swallows all errors, not just "ref not found"**

**Issue:** The catch block at line 51 intends to handle the "first commit" case (ref doesn't exist) but catches *all* exceptions from `git.raw('rev-parse', 'refs/wip/main')`. This also silently swallows: git binary not found, repository corruption, `.git` permission errors, and `simple-git` spawn failures. All are masked as "first commit — no parent," causing orphan commits that lose the WIP ref chain.

**Fix:** Check the error message to distinguish "ref not found" from unexpected failures:
```typescript
try {
  parentSha = (await git.raw('rev-parse', 'refs/wip/main')).trim();
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (!msg.includes('unknown revision') && !msg.includes('bad revision')) {
    throw e; // Re-throw unexpected errors
  }
  // First commit — no parent (expected)
}
```

### 💭 Consider (4)

💭 10) `init_spike/src/server/persistence.ts:39-76` **No graceful shutdown — pending git commit lost on Ctrl+C**

There is no `SIGTERM`/`SIGINT` handler to flush the pending `gitCommitTimer`. When the dev server is stopped, any disk writes made in the last 30 seconds (the git debounce window) will never be committed. Adding a shutdown handler that clears the timer and immediately runs `commitToWipRef()` would close this gap.

💭 11) `init_spike/src/server/persistence.ts:31-37` **Document name allows arbitrary `.md` file creation within `content/`**

The `safeContentPath` function correctly prevents traversal above `CONTENT_DIR`, but any unauthenticated WebSocket client can connect with an arbitrary document name and create/overwrite any `.md` file within `content/`. For a localhost-only spike this is acceptable, but worth noting before the Hocuspocus server is ever exposed beyond localhost. Adding a strict name pattern (`/^[a-zA-Z0-9_-]+$/`) and/or an `onAuthenticate` hook would prevent this.

💭 12) `init_spike/src/server/hocuspocus-plugin.ts:54-58` **HTTP API returns raw error messages to clients**

The catch block at line 54 sends `e.message` in the JSON response without sanitization or server-side logging. While low-risk for a localhost spike, internal error messages could reveal file paths or library details. Adding `console.error('[agent-write]', e)` server-side and returning a generic `'Internal server error'` to clients would be a quick improvement.

💭 13) `init_spike/src/editor/TiptapEditor.tsx:79` **Frontmatter updated before Y.Doc transact — out-of-sync on transaction failure**

In `applyMarkdown`, frontmatter is set on the Y.Doc metadata map (line 79) *before* the `transact` call (line 87). If `updateYFragment` throws inside the transaction, frontmatter has been updated but content has not, leaving them out of sync. Moving the metadata update inside the `transact` block (or after it succeeds) would maintain atomicity.

---

## 🚫 REQUEST CHANGES

**Summary:** The spike's architecture is sound and the validation methodology is thorough, but two critical issues need resolution before this code can be safely built upon: (1) `git add` using the shared index corrupts the developer's staging area on every auto-commit cycle, and (2) silent error swallowing in the persistence handlers creates concrete data-loss paths where a document load failure leads to content overwrite. Both are straightforward to fix.

<details>
<summary>Discarded (16)</summary>

| Location | Issue | Reason Discarded |
|----------|-------|------------------|
| `TiptapEditor.tsx:18-29` | Singleton provider with hardcoded URL/name | Expected spike limitation, acknowledged in code comments |
| `shared.ts:1-25` | MarkdownManager instantiated in 3 locations | Architecture reviewer noted this is well-managed today via centralized extension list |
| `persistence.ts:60` | Unstructured console.log logging | Acceptable for spike; would be noise to require structured logging |
| `agent-sim.ts:18` | Fetch has no timeout | Auxiliary dev tool, not core code |
| `persistence.ts:55` | Git commit message with dynamic timestamp | Currently safe — `simple-git.raw()` uses execFile semantics, timestamp is not user-controlled |
| `persistence.ts:34` | Log injection via documentName | Very low risk for localhost spike; would be addressed by name validation in Consider #11 |
| `TiptapEditor.tsx:24` | Hardcoded plaintext `ws://` URL | Expected for dev spike, already documented |
| `hocuspocus-plugin.ts:7-59` | Unauthenticated WebSocket and HTTP endpoints | Expected for localhost dev spike; covered by Consider #11 |
| `persistence.ts:10` | Synchronous `readFileSync` in onLoadDocument | Tolerable for single-user spike; async would be nice but not blocking |
| `hocuspocus-plugin.ts:21-26` | WebSocket upgrade handler has no error handling | Low confidence that this manifests in practice; Hocuspocus handles most errors internally |
| `TiptapEditor.tsx:67-69` | `getMarkdown()` returns empty string when editor is null | Defensive pattern; addressed by the broader toggle error handling in Minor #8 |
| `TiptapEditor.tsx:80-91` | `applyMarkdown` can leave Y.Doc in partial state on failure | Yjs transactions provide atomicity for observers; the frontmatter ordering is addressed in Consider #13 |
| `hocuspocus-plugin.ts:30-58` | Agent write endpoint has no timeout/rate limiting | Localhost-only dev tool; would be addressed before any network exposure |
| `hocuspocus-plugin.ts:54-58` | Error response lacks correlation ID | Over-engineering for a spike |
| `hocuspocus-plugin.ts:1-65` | Hocuspocus embedded in Vite has no production deployment path | Expected for spike; Vite plugin is the right pattern for validation |
| `TiptapEditor.tsx:21-29` | No reconnection/status handling for WebSocket provider | HocuspocusProvider has built-in reconnection; UI status indicator is a feature request, not a bug |

</details>

<details>
<summary>Reviewer Stats</summary>

| Reviewer | Returned | Kept |
|----------|----------|------|
| `pr-review-standards` | 1 | 1 |
| `pr-review-architecture` | 7 | 2 |
| `pr-review-errors` | 12 | 4 |
| `pr-review-appsec` | 6 | 1 |
| `pr-review-sre` | 14 | 2 |
| `pr-review-tests` | 10 | 1 |

</details>

</details>

## Fix Response 1

### Addressed
- 🔴 **git-add-pollutes-shared-index** (`persistence.ts:45`): Replaced `git.add('content/')` + shared-index `write-tree` with isolated `GIT_INDEX_FILE` workflow. Uses temp index at `.git/index-wip`, seeds via `read-tree HEAD^{tree}`, adds only `content/`, writes tree from temp index, cleans up in `finally`. Verified: simple-git `.env()` API supports `{ GIT_INDEX_FILE: path }` per type definitions.
- 🔴 **persistence-silent-data-loss** (`persistence.ts:112,138`): Removed try-catch wrappers from both `onLoadDocument` and `onStoreDocument`. Errors now propagate to Hocuspocus, which rejects the document connection on load failure (preventing empty doc overwrite) and signals store failure to clients. Verified via Hocuspocus source: `createDocument()` catches `onLoadDocument` errors, calls `closeConnections()` and `unloadDocument()`.
- 🟠 **commit-scheduling-drops-writes** (`persistence.ts:68-77`): Added `pendingAfterCommit` dirty flag. When `commitInFlight` is truthy, the flag is set instead of silently returning. The `.finally()` callback checks the flag and re-schedules if set.
- 🟠 **non-atomic-file-write** (`persistence.ts:133`): Replaced `writeFileSync` with async `writeFile` to temp path + `rename` for POSIX atomicity. Unblocks the event loop and prevents partial writes on crash.
- 🟠 **phantom-dependency-y-tiptap** (`package.json`): Added `"@tiptap/y-tiptap": "^3.0.2"` as explicit dependency. Verified it was resolving as a peerDependency of `@tiptap/extension-collaboration` — now declared directly since both `persistence.ts` and `TiptapEditor.tsx` import from it.
- 🟠 **no-test-infrastructure** (`package.json`): Added `"test": "bun test"` script. Updated `"check"` gate to include `bun test`. Created `frontmatter.test.ts` (9 tests: strip/prepend edge cases, round-trip identity) and `persistence.test.ts` (5 tests: safeContentPath traversal prevention). All 13 tests pass.
- 🟡 **asymmetric-toggle-error-handling** (`App.tsx:31-36`): Wrapped WYSIWYG→Source toggle in try-catch matching the reverse direction's pattern. Serialization errors now display in the error banner and prevent mode switch.
- 🟡 **rev-parse-catch-swallows-all** (`persistence.ts:49-52`): Narrowed catch to only suppress `unknown revision` / `bad revision` errors (expected on first commit). All other errors (git not found, repo corruption, permission errors) now re-throw.
- 💭 **no-graceful-shutdown** (`persistence.ts`): Added `SIGINT`/`SIGTERM` handlers that clear the debounce timer and fire a best-effort `commitToWipRef()` on shutdown.
- 💭 **raw-error-messages** (`hocuspocus-plugin.ts:54-58`): Added `console.error('[agent-write]', e)` for server-side logging. Kept error message in response — useful for localhost dev debugging.
- 💭 **frontmatter-outside-transact** (`TiptapEditor.tsx:79`): Moved `metaMap.set('frontmatter', ...)` inside the `provider.document.transact()` block so frontmatter and content updates are atomic in the same Yjs transaction.

### Declined
- 🟠 **server-imports-from-editor** (`persistence.ts:17-18`): The proposed fix (move `shared.ts` and `frontmatter.ts` to `src/shared/`) doesn't resolve the actual coupling. `shared.ts` imports `JsxComponent` from `./jsx-component`, which imports `ReactNodeViewRenderer` from `@tiptap/react` — a browser-coupled dependency. Moving the file changes the directory name but the dependency chain `server → shared → editor` persists. The only fix would be splitting the extension list into server-safe and editor-specific parts, which is a disproportionate refactor for a spike. The current code works because TipTap extensions are environment-agnostic at import time (no module-level DOM access). The finding correctly identifies the risk but the proposed solution is incomplete.
- 💭 **document-name-arbitrary-creation** (`persistence.ts:31-37`): Finding explicitly acknowledges this is acceptable for a localhost-only spike. `safeContentPath` prevents traversal — the scope of allowed creation within `content/` is intentional for the validation use case.


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
