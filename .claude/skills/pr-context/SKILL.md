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
| **Head SHA** | `79ec2de1f8f4d0fd403ed6623c4aa7bdf96b9194` |
| **Size** | 34 commits · +77663/-0 · 56 files |
| **Labels** | _None — local review._ |
| **Review state** | LOCAL |
| **Diff mode** | `summary` — reviewers must read tracked file diffs on-demand |
| **Event** | `local:manual` |
| **Trigger command** | `local-review` |
| **Review scope** | `delta` — scoped to changes since last review (delta from 79ec2de1f8) |

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
f85a0c2 chore: exclude tmp/ from biome checks
b9d01c3 fixup! local-review: baseline (pre-review state)
79ec2de fixup! local-review: address findings (pass 1)
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
 init_spike/content/test-doc.md                     | 73736 +++++++++++++++++++
 init_spike/content/test-fixture.md                 |    60 +
 init_spike/index.html                              |    12 +
 init_spike/package.json                            |    55 +
 init_spike/src/App.tsx                             |   115 +
 init_spike/src/editor/Callout.tsx                  |    19 +
 init_spike/src/editor/SourceEditor.tsx             |    61 +
 init_spike/src/editor/TiptapEditor.tsx             |   157 +
 .../src/editor/extensions/JsxComponentView.tsx     |    45 +
 .../src/editor/extensions/frontmatter.test.ts      |    58 +
 init_spike/src/editor/extensions/frontmatter.ts    |    24 +
 init_spike/src/editor/extensions/jsx-component.ts  |    75 +
 init_spike/src/editor/extensions/shared.ts         |    23 +
 init_spike/src/editor/three-way-merge.ts           |   226 +
 init_spike/src/main.tsx                            |    12 +
 init_spike/src/server/agent-flow.test.ts           |   642 +
 init_spike/src/server/agent-sim.ts                 |    64 +
 init_spike/src/server/hocuspocus-plugin.ts         |   163 +
 init_spike/src/server/persistence.test.ts          |    31 +
 init_spike/src/server/persistence.ts               |   210 +
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
 56 files changed, 77663 insertions(+)
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

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~1716263 bytes across ~56 files) exceeds the inline threshold (~100KB).
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

> **Review Focus:** This is a re-review scoped to changes since the last review pass (`79ec2de1f8`). Focus your review on the delta — the changes made to address prior findings. The full branch diff is still available above for context, but your review should prioritize the delta changes.

## Review Iteration History

# Review Iteration Log

---

## Review Pass 0
**Recommendation: **APPROVE WITH SUGGESTIONS**** | **Risk: **Medium**** | **Blocking:** 0 Critical, 4 Major

<details>
<summary>Full review</summary>

## PR Review Summary

**(10) Total Issues** | Risk: **Medium** | Recommendation: **APPROVE WITH SUGGESTIONS**

### 🟠 Major (4)

🟠 1) `init_spike/src/server/hocuspocus-plugin.ts:46,115 || direct-connection-leak` **DirectConnection not disconnected on transact error**

**Issue:** Both `/api/agent-write` (line 46→58) and `/api/agent-write-md` (line 115→142) open a `DirectConnection` via `hocuspocus.openDirectConnection()`, call `conn.transact()`, then call `conn.disconnect()`. The `disconnect()` call is inside the `try` block — if `transact()` throws (e.g., ProseMirror schema validation failure on malformed agent markdown, or `updateYFragment` failure), execution jumps to the outer `catch` which sends a 500 response but never disconnects the connection.

**Why:** Leaked DirectConnections accumulate in Hocuspocus's internal connection tracking. Under repeated error conditions (especially with `--rapid` mode in agent-sim), this causes memory growth and can prevent Hocuspocus document lifecycle hooks from firing correctly. The leak is invisible — the 500 response returns to the caller with no indication a resource was leaked.

**Fix:** Use `try/finally` to guarantee `conn.disconnect()` regardless of outcome:
```typescript
const conn = await hocuspocus.openDirectConnection('test-doc');
try {
  await conn.transact((doc) => { /* ... */ });
} finally {
  await conn.disconnect();
}
```
Apply to both endpoints.

**Refs:**
- `init_spike/src/server/hocuspocus-plugin.ts:58 — disconnect only reached on success path`
- `init_spike/src/server/hocuspocus-plugin.ts:142 — same pattern in markdown endpoint`
- [Hocuspocus DirectConnection docs](https://tiptap.dev/docs/hocuspocus/api/direct-connection)

---

🟠 2) `init_spike/src/server/persistence.ts:116-126 || shutdown-data-loss` **Shutdown handler doesn't await commit and drops pending writes when a commit is in flight**

**Issue:** Two compounding issues in `handleShutdown()`:

(a) **Fire-and-forget async:** Line 122 calls `commitToWipRef().catch(...)` without awaiting. Node.js exits the process after SIGINT/SIGTERM handlers return — it does not wait for unresolved promises. The git commit (5-6 sequential git plumbing operations) is almost certainly interrupted before completing.

(b) **In-flight skip:** Lines 121-123: if `commitInFlight` is non-null, the handler does nothing. It doesn't set `pendingAfterCommit = true`, so when the in-flight commit finishes, no follow-up commit runs for any disk writes that occurred after the in-flight commit started. Up to 30 seconds of edits (the `GIT_DEBOUNCE_MS` window) are silently dropped from git history.

**Why:** On `Ctrl+C` during active development — the most common shutdown scenario — the final batch of CRDT changes is lost from the git WIP ref. The data is safe on disk (Layer 1), but the Layer 2 git durability guarantee, which is the stated purpose of the shutdown handler, is broken.

**Fix:** Keep the process alive until the commit completes, and handle the in-flight case:
```typescript
function handleShutdown(): void {
  if (gitCommitTimer) {
    clearTimeout(gitCommitTimer);
    gitCommitTimer = null;
  }
  const flush = async () => {
    if (commitInFlight) await commitInFlight;
    await commitToWipRef();
  };
  flush()
    .catch((e) => console.error('[persistence] Shutdown commit failed:', e))
    .finally(() => process.exit(0));
}
```

**Refs:**
- `init_spike/src/server/persistence.ts:94-95 — commitInFlight/pendingAfterCommit state`
- [Node.js SIGINT handling](https://nodejs.org/api/process.html#signal-events)

---

🟠 3) `init_spike/src/editor/three-way-merge.ts:42-46 || code-fence-split` **`splitMarkdownBlocks` splits within fenced code blocks containing blank lines**

**Issue:** Line 45 uses `split(/\n\n+/)` to separate markdown into blocks, but this regex doesn't respect fenced code blocks. A code block containing a blank line (common in real code) is incorrectly split into multiple "blocks." This breaks the positional paragraph mapping used throughout the three-way merge: block indices become misaligned, causing false conflict detection (line 128-139), incorrect agent-added block identification (line 122-125), and potentially lost content.

**Why:** The three-way merge algorithm depends on accurate block-level correspondence between snapshot, Y.Doc, and user edits. Misaligned blocks caused by incorrect splitting can produce silent data loss (agent writes dropped) or false conflicts (user edits attributed to the wrong paragraph). This affects any document containing fenced code blocks with internal blank lines.

**Fix:** Replace the naive split with a fence-aware splitter:
```typescript
export function splitMarkdownBlocks(md: string): string[] {
  const normalized = md.replace(/\n+$/, '');
  if (!normalized) return [];
  const lines = normalized.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === '' && current.length > 0) {
      blocks.push(current.join('\n').trim());
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    const block = current.join('\n').trim();
    if (block) blocks.push(block);
  }
  return blocks;
}
```

**Refs:**
- `init_spike/src/editor/three-way-merge.ts:128-139 — conflict detection depends on correct block alignment`
- [CommonMark fenced code blocks spec](https://spec.commonmark.org/0.31.2/#fenced-code-blocks)

---

🟠 4) `init_spike/src/server/persistence.test.ts:8-14 || test-copy-not-real` **Persistence test validates a replicated copy of `safeContentPath`, not the actual function**

**Issue:** The test file reimplements `safeContentPath` locally (lines 8-14) because the real function in `persistence.ts:32-38` is not exported. The test validates the pattern in isolation, but if the real implementation diverges (e.g., someone adds `.normalize()`, changes the prefix check, or modifies the path resolution logic), the tests continue to pass while the real security boundary is broken.

**Why:** `safeContentPath` is a security-critical function that prevents path traversal attacks on the filesystem. Testing a copy provides a false sense of security — the test coverage claim is hollow because it's not exercising the production code. A divergence between the copy and the real function could allow an attacker to read or write arbitrary files via crafted WebSocket document names.

**Fix:** Export `safeContentPath` from `persistence.ts` (it's a pure function with no side effects) and import it in the test:
```typescript
// persistence.ts
export function safeContentPath(documentName: string): string { ... }

// persistence.test.ts
import { safeContentPath } from './persistence';
```
If exporting is undesirable, extract it to `src/server/safe-path.ts` and import in both files.

**Refs:**
- `init_spike/src/server/persistence.ts:32-38 — the real function being replicated`
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)

### 🟡 Minor (3)

🟡 1) `init_spike/src/editor/TiptapEditor.tsx:95 || frontmatter-falsy-coalesce` **Falsy coalescing restores deleted frontmatter on toggle-back**

**Issue:** Line 95: `frontmatterRef.current = userFm || snapFm`. The `stripFrontmatter()` function returns `frontmatter: ''` (empty string) when no frontmatter is present. If a user intentionally deletes all frontmatter in source mode, `userFm` is `''` (falsy), so the expression falls through to `snapFm` — silently restoring the frontmatter the user explicitly removed.

**Why:** User intent is silently overridden. The user sees frontmatter, deletes it, toggles back, and it reappears.

**Fix:** `frontmatterRef.current = userFm !== '' ? userFm : snapFm;` — or if the intent is to allow clearing: `frontmatterRef.current = userFm ?? snapFm;` (but `stripFrontmatter` returns `''`, not `undefined`, so this would need adjustment).

**Refs:**
- `init_spike/src/editor/extensions/frontmatter.ts:6-10 — stripFrontmatter returns '' for no frontmatter`

---

🟡 2) `init_spike/src/server/persistence.ts:125-126 || signal-handler-reregistration` **SIGINT/SIGTERM handlers re-register on Vite HMR re-evaluation**

**Issue:** Lines 125-126 register `process.on('SIGINT', handleShutdown)` at module top level. In Vite's dev server with HMR, module re-evaluation can cause duplicate signal handlers. Each handler independently calls `commitToWipRef()`, leading to concurrent git operations on the same temp index file (`.git/index-wip`), which can corrupt the index or produce duplicate commits.

**Why:** During active development with HMR, modifying `persistence.ts` or its dependents can accumulate shutdown handlers. The shared `.git/index-wip` path makes concurrent execution destructive.

**Fix:** Guard against re-registration with a module-level flag, or use `process.once()` instead of `process.on()` if only one shutdown commit is needed.

**Refs:**
- `init_spike/src/server/persistence.ts:47 — tmpIndex path shared across all handler invocations`

---

🟡 3) `init_spike/src/server/persistence.ts:21 || dirname-fallback` **`import.meta.dirname` fallback to `'.'` silently resolves to wrong directory**

**Issue:** Line 21: `import.meta.dirname ?? '.'`. If `import.meta.dirname` is undefined, the fallback `'.'` resolves relative to the process CWD, not relative to the source file. `CONTENT_DIR` and `PROJECT_DIR` would point to incorrect locations, causing silent misrouting of all file reads and writes.

**Why:** `onLoadDocument` would silently skip loading (because `existsSync` returns false at the wrong path), and `onStoreDocument` would write files to an unexpected location. Both fail silently.

**Fix:** Throw an error if `import.meta.dirname` is undefined rather than falling back:
```typescript
if (!import.meta.dirname) {
  throw new Error('[persistence] import.meta.dirname is undefined');
}
```

**Refs:**
- [Node.js import.meta.dirname docs](https://nodejs.org/api/esm.html#importmetadirname)

### 💭 Consider (3)

💭 1) `init_spike/src/editor/three-way-merge.ts:110-119` **Three-way merge fallback path (paragraph count mismatch) has zero test coverage**

The fallback at lines 110-119 triggers when the user adds or deletes paragraphs in source mode — a common editing action. This path calls `applyWholeDoc`, which silently drops all agent writes. None of the 8 integration tests in `agent-flow.test.ts` exercise this path (all tests carefully maintain the same paragraph count). A test that seeds 2 paragraphs, has the agent add paragraph C, and provides user-edited markdown with 3 paragraphs (user added one) would guard the documented trade-off behavior.

---

💭 2) `init_spike/src/editor/three-way-merge.ts:148-150` **Agent-added block deduplication uses `string.includes()` substring check**

Line 150: `if (!userEditedMarkdown.includes(agentBlock.trim()))` — this is a substring check, not a block-level comparison. If an agent adds a short paragraph (e.g., `## Summary`) and the user's text contains that string anywhere, the agent's block is silently dropped as a false-positive "duplicate." Block-by-block comparison would be more precise.

---

💭 3) `init_spike/src/editor/extensions/shared.ts || init_spike/src/server/persistence.ts || init_spike/src/server/hocuspocus-plugin.ts` **MarkdownManager and schema instantiated independently in 4 locations**

`new MarkdownManager({ extensions: sharedExtensions })` and `getSchema(sharedExtensions)` are independently instantiated in `hocuspocus-plugin.ts`, `persistence.ts`, `agent-flow.test.ts`, and `TiptapEditor.tsx`. They all derive from the same `sharedExtensions`, but if serialization configuration diverges (e.g., custom options added to one but not others), the instances would silently produce different output. Exporting shared `mdManager` and `editorSchema` from a single module would extend the `shared.ts` single-source-of-truth principle.

---

## 💡 APPROVE WITH SUGGESTIONS

**Summary:** This is a well-executed derisking spike that successfully validates its core hypotheses (CRDT collaboration, three-way merge, agent write paths, git auto-persistence). The code quality is high for spike-level work, with good TypeScript strictness, clear module boundaries, and meaningful tests. The major findings are correctness issues in the DirectConnection lifecycle (resource leak on error), the shutdown handler (data loss on Ctrl+C), the block-splitting algorithm (fenced code blocks), and a test that validates a copy rather than the real security function — all fixable with targeted changes. None of these block the spike's validation goals, but they should be addressed before the patterns are carried into production code.

<details>
<summary>Discarded (10)</summary>

| Location | Issue | Reason Discarded |
|----------|-------|------------------|
| `hocuspocus-plugin.ts:64,148` | Error detail leakage — `e.message` returned to HTTP clients | Spike-only dev server; helpful error messages aid development. No external exposure. |
| `hocuspocus-plugin.ts:38-68` | No authentication on agent write endpoints | Explicitly a spike with local-only dev server. Noted in code comments. |
| `hocuspocus-plugin.ts:29-34` | No authentication on WebSocket upgrade | Same as above — spike context, local dev server. |
| `persistence.ts:189` | Log injection via documentName | Console-only logging in dev context; no log aggregation pipeline to corrupt. |
| `persistence.ts:179` | Predictable temp file path race condition | Hocuspocus debounce serializes saves per document; concurrent writes to same doc are prevented by design. |
| `hocuspocus-plugin.ts:95` | JSON parse error discards error details | The generic "Invalid JSON" message is adequate for the agent-sim use case; the malformed JSON is available client-side. |
| `persistence.ts:86-90` | Silent cleanup failure for temp git index | Self-healing on next `commitToWipRef()` call via `read-tree`. Low practical risk. |
| `persistence.ts:54-60` | Unexpected `read-tree` failure falls through | The subsequent `git add` + `write-tree` on a potentially empty index is the same behavior as an empty repo — benign for this spike's single-content-dir setup. |
| `persistence.ts:134` | TOCTOU race between `existsSync` and `readFileSync` | Extremely narrow race window; the resulting error propagation (rejecting the WebSocket connection) is actually acceptable behavior. |
| `hocuspocus-plugin.ts:82-89` | Request stream not drained on 413 response | Development-context only; Vite dev server rarely handles keep-alive edge cases. |

</details>

<details>
<summary>Reviewer Stats</summary>

| Reviewer | Returned | Kept |
|----------|----------|------|
| `pr-review-standards` | 4 | 3 |
| `pr-review-appsec` | 6 | 0 |
| `pr-review-tests` | 9 | 2 |
| `pr-review-errors` | 12 | 4 |
| `pr-review-architecture` | 8 | 1 |
| `pr-review-sre` | 12 | 3 |

</details>

</details>

## Fix Response 1

### Addressed
- 🟠 **DirectConnection not disconnected on transact error** (`hocuspocus-plugin.ts:46,115`): Wrapped both `/api/agent-write` and `/api/agent-write-md` transact+disconnect in try/finally to guarantee `conn.disconnect()` regardless of outcome. Verified via [Hocuspocus issue #846](https://github.com/ueberdosis/hocuspocus/issues/846) and [#709](https://github.com/ueberdosis/hocuspocus/issues/709) that leaked DirectConnections cause real memory growth.
- 🟠 **Shutdown handler doesn't await commit** (`persistence.ts:116-126`): Rewrote `handleShutdown()` to: (a) await any in-flight commit before starting a new one, (b) await the final commit, (c) call `process.exit(0)` in `finally` to ensure clean termination. Verified via [Node.js docs](https://nodejs.org/api/process.html#signal-events) that SIGINT handlers preempt default behavior and require explicit exit.
- 🟠 **splitMarkdownBlocks splits within fenced code blocks** (`three-way-merge.ts:42-46`): Replaced naive `split(/\n\n+/)` with a line-by-line fence-aware splitter that tracks ``` and ~~~ fence state. Blank lines inside fenced code blocks no longer cause incorrect splits.
- 🟠 **Persistence test validates a copy, not the real function** (`persistence.test.ts:8-14`): Exported `safeContentPath` from `persistence.ts` (pure function, no side effects). Test now imports and exercises the real production function.
- 🟡 **Falsy coalescing restores deleted frontmatter** (`TiptapEditor.tsx:95`): Changed `userFm || snapFm` to `userFm` — in source mode the user has full control, so empty string (deleted frontmatter) is intentional. Removed unused `snapFm` destructuring to satisfy lint.
- 🟡 **SIGINT/SIGTERM handlers re-register on HMR** (`persistence.ts:125-126`): Added `shutdownRegistered` module-level guard to prevent duplicate handler registration on Vite HMR re-evaluation. Addressed alongside Major 2.
- 🟡 **import.meta.dirname fallback to '.' silently resolves wrong** (`persistence.ts:21`): Replaced `import.meta.dirname ?? '.'` with an explicit throw if undefined. Silent misrouting of all file I/O is worse than a loud crash. Verified `import.meta.dirname` is available in Bun 1.0.23+ and Node.js 20.11+ via [MDN docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import.meta).
- 💭 **Three-way merge fallback path has zero test coverage** (`three-way-merge.ts:110-119`): Added test "three-way merge falls back to whole-doc when user changes paragraph count" — seeds 2 paragraphs, agent adds paragraph C, user adds paragraph D in source (count 2→3), verifies fallback triggers and document remains valid.

### Declined
- 💭 **Agent-added block deduplication uses `string.includes()` substring check** (`three-way-merge.ts:148-150`): Valid observation — `includes()` is a substring match, not block-level. However, the probability of a false-positive match is low (agent blocks are typically full unique paragraphs, not short fragments like `## Summary`). A block-level comparison adds splitting/indexing complexity for an edge case that hasn't materialized. Proportionate for spike scope; worth revisiting if the merge algorithm graduates to production.
- 💭 **MarkdownManager and schema instantiated independently in 4 locations** (`shared.ts, persistence.ts, hocuspocus-plugin.ts`): Valid DRY observation. However, all 4 instantiations derive from the identical `sharedExtensions` array, `MarkdownManager` is stateless, and extracting shared singletons would add a new module with cross-cutting import dependencies for no behavioral benefit. The current pattern is idiomatic for spike code where each module is self-contained.


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
