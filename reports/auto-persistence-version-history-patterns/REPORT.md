---
title: "Auto-Persistence & Version History Implementation Patterns"
description: "Implementation patterns for Open Knowledge's Layer 3 (named checkpoints, version history timeline, restore-to-checkpoint) and how the git-based persistence model interacts with zero-friction onboarding. Covers git squash-merge pipelines, version history UX from 8 products, CRDT crash recovery, draft branch patterns, and onboarding friction analysis."
createdAt: 2026-04-08
updatedAt: 2026-04-08
subjects:
  - Open Knowledge
  - Figma
  - Google Docs
  - Notion
  - Replit
  - Lovable
  - Hocuspocus
  - Yjs
  - simple-git
topics:
  - version history UX
  - git plumbing
  - CRDT persistence
  - crash recovery
  - onboarding friction
---

# Auto-Persistence & Version History Implementation Patterns

**Purpose:** Inform the implementation of Bucket 4 (S6) in Open Knowledge — specifically Layer 3 (named checkpoints via squash-merge + annotated tags), the version history timeline UI, restore-to-checkpoint, and crash recovery. Also investigates how the git-based persistence model interacts with the zero-friction onboarding goals (Bucket 6). A developer reading this report should be able to implement the checkpoint pipeline and timeline UI with confidence in the patterns chosen.

---

## Executive Summary

Open Knowledge's three-layer persistence pipeline (CRDT→filesystem→git) is architecturally sound and independently validated by products like Replit (which uses the same two-tier auto-save + checkpoint model under the hood with git). The remaining implementation work — Layer 3 named checkpoints, timeline UI, and restore — follows patterns that are well-established across 8 products surveyed.

**Key Findings:**

- **Named checkpoint creation is ~5 git plumbing calls.** The squash-merge from WIP refs to main uses `rev-parse` → `commit-tree` → `update-ref` → `tag` → delete WIP ref. No index isolation needed (unlike Layer 2). No working tree modifications. The existing `git.raw()` pattern from Layer 2 extends directly.

- **Every modern product implements restore as a forward operation — never destructive rollback.** Figma, Google Docs, Notion, Replit, Lovable, and Apple Pages all create a new version entry when restoring, preserving forward history. Open Knowledge should follow: `git checkout <tag> -- .` then new commit on main.

- **Google Docs' "Only show named versions" toggle is the gold standard timeline UX.** Auto-saves collapsed under named checkpoints (Figma pattern) with a toggle to filter to checkpoints only. This maps directly to Layer 2 WIP refs collapsing under Layer 3 checkpoints.

- **The git persistence model creates 6 specific gaps in the existing onboarding report.** The most critical: `npx openknowledge init` must validate git presence (no comparable tool depends on git this deeply). WIP refs are invisible to standard git workflows but visible to `git push --mirror` — a documented-but-not-blocking risk.

- **Dual persistence (Yjs binary + markdown) prevents a known Hocuspocus reconnection bug.** Reconstructing Y.Doc from markdown alone creates new CRDT item IDs, causing content duplication when clients reconnect after server restart ([Hocuspocus #344](https://github.com/ueberdosis/hocuspocus/issues/344)). Persisting `Y.encodeStateAsUpdate()` alongside markdown enables clean recovery.

- **CRDT origin tracking does not survive serialization.** Per-character attribution (who wrote which paragraph) cannot round-trip through markdown. Attribution must live in git history (commit author/co-author metadata + `git blame`), not in the document format. This is a fundamental tradeoff of markdown-canonical architecture.

**Critical Caveats:**
- The dual persistence recommendation (Finding 5) adds a new storage concern not in the current architecture. The markdown-canonical principle still holds — Yjs binary is a performance cache, not a source of truth. But it's important enough for crash recovery to merit inclusion in the persistence pipeline.
- Multi-writer checkpoint merging (multiple WIP refs → one checkpoint) requires `git merge-tree` (Git 2.38+). For single-writer v1, the simple "WIP tree wins" approach is sufficient.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|---|---|---|
| D1 | Version history UX in auto-save products | Deep | P0 |
| D2 | Git squash-merge + annotated tag patterns | Deep | P0 |
| D3 | Restore-to-checkpoint / time-travel patterns | Moderate | P0 |
| D4 | Git persistence x onboarding friction | Deep | P0 |
| D5 | Server-restart & crash recovery patterns | Moderate | P1 |
| D6 | Draft branch persistence patterns | Moderate | P1 |
| D7 | Attribution in version history | Light | P1 |

**Non-goals:** Permission model design (Bucket 5), editor component architecture (Bucket 1), MCP tool signatures (Bucket 2), publishing/deployment (Later phase), real-time presence UX (Bucket 3 — except where attribution feeds into timeline).

---

## Detailed Findings

### D1: Version History UX — The Collapsed-Auto-Save + Prominent-Checkpoint Pattern

**Finding:** Every product with auto-save + named versions converges on the same UX pattern: auto-saves are noise that collapses under named milestones. The specific implementations vary, but the structure is universal.

**Evidence:** [evidence/version-history-ux.md](evidence/version-history-ux.md)

Three tiers of implementation quality emerged:

| Tier | Pattern | Example | Our mapping |
|---|---|---|---|
| **Gold** | Auto-saves collapse under named versions + "show only named" toggle | Google Docs, Figma | Layer 2 WIP refs collapse under Layer 3 checkpoints. Default view = checkpoints only. |
| **Silver** | Bookmark/favorite markers on a chronological list | Lovable | "Save Version" creates a bookmarked entry in the timeline |
| **Bronze** | Flat auto-save list, no named versions | Notion | Anti-pattern — becomes noisy and hard to navigate |

The timeline UI should be a **vertical list in a right sidebar/drawer**, ordered newest-first. This is the pattern in Figma, Google Docs, Notion, Lovable, and Replit. Apple Pages' Time Machine spatial UI is visually dramatic but impractical for a web-based tool.

**Minimum metadata per entry:** timestamp, author (name + avatar/icon), version name (if checkpoint), files changed count. Named checkpoints additionally show user-provided description.

**The timeline mockup in `evidence/auto-persistence-architecture.md` is well-aligned** with these patterns — named checkpoints prominent, auto-saves collapsed with expand, date-based grouping for long sessions.

**Implications:**
- Default view: only named checkpoints visible
- Expand control: click a checkpoint to reveal auto-saves between it and the previous checkpoint
- Date grouping: auto-saves within a session group by date when expanded
- Visual distinction: checkpoints get prominent styling (name, description, icon); auto-saves are compact single-line entries

**Decision triggers:**
- If the team defers timeline UI to Next phase, the checkpoint pipeline (Layer 3) should still ship — it provides the data model that the timeline will render
- If presence (Bucket 3) ships before timeline, the activity feed from presence can serve as a lightweight substitute

---

### D2: Git Squash-Merge Pipeline — 5 Plumbing Calls, No Index Needed

**Finding:** The checkpoint operation is simpler than expected. The WIP ref's tree already represents the complete desired state, so no merge resolution is needed — it's a tree promotion, not a merge. Raw git plumbing via `git.raw()` is correct; porcelain `git merge --squash` is unsuitable (requires working tree checkout).

**Evidence:** [evidence/git-squash-merge-patterns.md](evidence/git-squash-merge-patterns.md)

**Recommended implementation:**

```typescript
async function createCheckpoint(
  git: SimpleGit,
  name: string,
  description: string,
  author: string
): Promise<string> {
  // 1. Read WIP state (the tree IS the desired checkpoint content)
  const wipTree = (await git.raw('rev-parse', 'refs/wip/main^{tree}')).trim();
  const mainSha = (await git.raw('rev-parse', 'main')).trim();

  // 2. Create squash commit on main
  const msg = `checkpoint: ${name}\n\n${description}`;
  const commitSha = (await git.raw(
    'commit-tree', wipTree, '-p', mainSha, '-m', msg
  )).trim();

  // 3. Advance main to the new commit
  await git.raw('update-ref', 'refs/heads/main', commitSha);

  // 4. Create annotated tag
  const tagNum = await getNextCheckpointNumber(git);
  const tagName = `checkpoint/${tagNum}`;
  await git.raw('tag', '-a', tagName, '-m',
    `${name}\n\nAuthor: ${author}\nDescription: ${description}`,
    commitSha
  );

  // 5. Delete WIP ref (next auto-save recreates it)
  await git.raw('update-ref', '-d', 'refs/wip/main');

  return tagName;
}
```

**Why this works:** `rev-parse`, `commit-tree`, `update-ref`, and `tag` are pure plumbing — they operate on the object database and ref store directly. No index involvement. No working tree modifications. Layer 3 does NOT need `GIT_INDEX_FILE` isolation (unlike Layer 2).

**Tag naming:** `checkpoint/<N>` with sequential numbering derived from `git tag -l 'checkpoint/*' --sort=-version:refname | head -1`. Human-friendly, sortable, maps well to timeline UI.

**Tag metadata:** Annotated tags auto-store tagger name, email, and date. Additional structured metadata via message body (author, description, files changed). Git 2.46+ supports `--trailer` for machine-parseable key-value pairs.

**Querying for timeline UI:**
```bash
git for-each-ref --sort=-creatordate \
  --format='%(refname:short)|%(creatordate:iso)|%(taggername)|%(contents:subject)' \
  refs/tags/checkpoint/
```

**WIP ref lifecycle:** Delete after checkpoint. The existing Layer 2 code already handles the "no parent" case (first WIP commit after reset). Next auto-save recreates `refs/wip/main` from scratch. This allows `git gc` to clean up old WIP objects.

**Multi-writer (future):** When multiple per-writer WIP refs exist, `git merge-tree --write-tree` (Git 2.38+) enables in-memory three-way merge without touching the working tree. For v1, assume single-writer — "WIP tree wins."

**Prior art:** [bartman/git-wip](https://github.com/bartman/git-wip) is the closest OSS analog — uses `write-tree`/`commit-tree`/`update-ref` for automatic WIP saves, resets WIP refs after each real commit. Open Knowledge resets after each checkpoint instead.

**Implications:**
- Implementation is ~30 LOC for the core `createCheckpoint` function
- Uses the same `git.raw()` pattern already established in Layer 2
- No new dependencies or git features required beyond what Layer 2 uses
- Same `simpleGit()` instance can serve both layers (simple-git serializes commands via internal queue)

---

### D3: Restore — Always Forward, Never Destructive

**Finding:** Restore should create a new commit on main containing the old content, preserving complete forward history. This is the universal pattern across all 8 products surveyed — no modern product does destructive rollback.

**Evidence:** [evidence/restore-patterns.md](evidence/restore-patterns.md)

**Recommended restore sequence:**

1. User clicks "Restore" on a named checkpoint in the timeline
2. Preview: show the content at that checkpoint (read-only) before confirming
3. Backend: `git checkout <annotated-tag> -- .` (overwrite working tree with old content)
4. Backend: create new commit on main with message "Restore to: \<checkpoint-name\>"
5. Backend: create new annotated tag for the restore point
6. Rebuild Y.Doc: for each affected file, read restored markdown → parse → populate new Y.Doc via `updateYFragment()` → broadcast to connected clients

**Y.Doc rebuild after restore:** Yjs `createDocFromSnapshot` is for read-only preview, not live document restoration. Since markdown is canonical, the cleanest approach is to destroy current Y.Doc instances and re-initialize from the restored files. This resets undo history (consistent with every product surveyed — undo and version restore are separate systems).

**Branch-from-checkpoint** ("Explore from this version") is a power-user feature offered only by Figma and Google Docs. Defer to a future iteration — v1 should implement forward-commit restore only.

**Implications:**
- Restore is a checkpoint operation — same `createCheckpoint()` pipeline but sourcing content from an old tag instead of current WIP
- Preview-before-restore is table stakes; requires either rendering old markdown or showing a diff
- Undo stack resets on restore (Yjs UndoManager is session-scoped, unrelated to version restore)

---

### D4: Git Persistence x Onboarding — Six Gaps Found

**Finding:** The git-based persistence model creates specific onboarding concerns that the existing `onboarding-multiproject-ux` report did not anticipate, because it was scoped to onboarding UX rather than persistence internals. No hard conflicts exist, but supplementary handling is needed.

**Evidence:** [evidence/git-onboarding-friction.md](evidence/git-onboarding-friction.md)

**Gap analysis against existing onboarding report:**

| Gap | Severity | Description | Recommendation |
|---|---|---|---|
| **G1: Git presence validation** | HIGH | Init must verify git exists and determine repo type (work tree, bare, submodule, worktree) before proceeding. No comparable tool has this dependency. | Add git detection as first step of init. Auto-`git init` only with `--standalone`. |
| **G2: WIP ref leakage** | MEDIUM | `git push --mirror` pushes all refs including `refs/wip/`. Standard `push` is safe. | Document in init output or AGENTS.md. Do NOT auto-modify `.git/config`. |
| **G3: Cache index in gitignore** | LOW | `.openknowledge/cache/git-index` covered by `cache/` wildcard but not explicit. | Covered by existing plan. No action needed. |
| **G4: WIP ref cleanup** | MEDIUM | No lifecycle for pruning WIP refs after checkpoints. | Delete WIP ref as part of checkpoint operation (already in D2 recommendation). |
| **G5: Crash recovery at init** | MEDIUM | Init/restart should handle stale lock files, corrupt index, orphaned temp files. | Implement startup validation sequence (see D5). |
| **G6: git gc accumulation** | LOW→MED | WIP refs prevent gc of their objects. Long-running KBs accumulate. | Solved by G4 — checkpoint prunes WIP refs, allowing gc. |

**Init decision tree (recommended):**

| Condition | Behavior |
|---|---|
| Inside existing work tree (sidecar) | Use parent git. Do NOT `git init`. Happy path. |
| No git + `--standalone` flag | Auto `git init`. |
| No git + no flag | Warn and guide. Do not silently init. |
| Bare repo | Error with guidance. |
| Git worktree | Works — shared refs. |
| Git submodule | Warn but allow. |

**GIT_INDEX_FILE location:** `.openknowledge/cache/git-index`. Auto-covered by the `.openknowledge/cache/` gitignore entry. Persists between runs (useful for incremental WIP commits). On startup, validate integrity — delete and rebuild from WIP ref tree if corrupt.

**`.gitignore` management:** Init should append `.openknowledge/cache/` with a commented section, idempotent (check before appending). This follows Next.js, Docusaurus, and Turborepo precedent.

**Two tension points (neither blocking):**
1. "Under 10 seconds" init target vs. git validation complexity — still achievable, git detection is <1s
2. Sidecar "uses parent git" vs. WIP ref pollution of parent ref space — invisible to standard workflows

**Implications:**
- The onboarding report's recommendations remain sound; these gaps are additive, not contradictory
- G1 (git validation) should be implemented in the same PR as the init command
- G4 (WIP cleanup) is solved by the checkpoint pipeline itself

**Remaining uncertainty:**
- Windows-specific git behavior with custom refs not investigated
- `git gc` long-term impact with thousands of WIP commits needs empirical measurement on real KBs

---

### D5: Crash Recovery — Dual Persistence Prevents a Known Bug

**Finding:** Reconstructing Y.Doc from markdown alone works for first-load, but causes content duplication when clients reconnect after server restart. Persisting Yjs binary state alongside markdown prevents this.

**Evidence:** [evidence/crash-recovery.md](evidence/crash-recovery.md)

[Hocuspocus issue #344](https://github.com/ueberdosis/hocuspocus/issues/344) documents the problem: when the server restarts and rebuilds Y.Doc from storage, the new Y.Doc has fresh CRDT item IDs. Reconnecting clients still have their local Y.Doc with original item IDs. Yjs sync merges them, potentially duplicating content.

**Recommended dual persistence:**
- On `onStoreDocument`: serialize to markdown (for git, human-readable) AND `Y.encodeStateAsUpdate(doc)` (for CRDT recovery)
- On `onLoadDocument`: prefer Yjs binary if available (preserves item IDs, enables clean sync). Fall back to markdown reconstruction only if binary is missing (first load, binary corruption)
- Store Yjs binary in `.openknowledge/cache/` (gitignored, regenerable from markdown as fallback)

**This does not change the markdown-canonical principle.** Yjs binary is a performance/correctness cache, not a source of truth. If the binary is missing or corrupt, the system falls back to markdown reconstruction — the same path that works today. The binary just makes reconnection seamless.

**Startup recovery sequence:**
1. `git fsck --no-dangling` (fast corruption check)
2. Delete orphaned `.tmp` files
3. Load Yjs binary from cache if available
4. Fall back to markdown reconstruction if binary missing
5. If markdown is newer than binary (external edit), apply changes via disk bridge

**Atomic writes:** The existing temp+rename pattern is correct. For production, add `fsync()` calls (temp file + parent directory) to ensure durability on crash, not just atomicity.

**Implications:**
- Adds `Y.encodeStateAsUpdate()` call to the `onStoreDocument` pipeline (~5 LOC)
- Adds Yjs binary load path to `onLoadDocument` (~15 LOC)
- Storage overhead: Yjs binary is typically 2-5x the markdown size, but compressed well
- The Hocuspocus SQLite extension could handle this, but a simple file in `.openknowledge/cache/` is simpler for v1

---

### D6: Draft Branch Patterns — Document Namespacing + Standard Branches

**Finding:** For Open Knowledge, the recommended pattern combines Hocuspocus document namespacing (CRDT-level isolation) with standard git branches (persistence-level isolation). Git worktrees are viable but heavyweight; CMS-style status fields are too simple.

**Evidence:** [evidence/draft-branch-patterns.md](evidence/draft-branch-patterns.md)

**How it would work:**
- Client connects with `documentName = "drafts/my-experiment/article"` instead of `"article"`
- `onLoadDocument` resolves to the draft branch's file content
- `onStoreDocument` writes to the draft branch (same pipeline, different ref target)
- The persistence pipeline knows which git ref to commit to based on the document name prefix

[Sanity's](https://www.sanity.io/docs/content-lake/drafts) `drafts.{documentId}` prefix pattern is the closest CMS analog — both use naming conventions to scope draft state.

**This dimension is blocked by Bucket 5** (permission model decides when drafts are auto-created). The architectural pattern is clear; the trigger logic depends on permission resolution.

**Implications:**
- No implementation needed for v1 (blocked by Bucket 5)
- The existing persistence pipeline is parameterizable — changing the target ref from `refs/wip/main` to `refs/wip/drafts/<name>/main` is a small change
- Document namespacing in Hocuspocus is the cleanest isolation mechanism (no branch switching, no worktree management)

---

### D7: Attribution — Git Metadata + `git blame`, Not CRDT Origins

**Finding:** Per-character CRDT origin tracking does not survive the markdown round-trip. Attribution must live in git history, which provides commit-level and line-level attribution for free.

**Evidence:** [evidence/attribution-patterns.md](evidence/attribution-patterns.md)

**Attribution strategy:**

| Commit type | `--author` | `committer` | Trailers |
|---|---|---|---|
| Auto-save (Layer 2) | Human editor | System | — |
| Agent write auto-save | Agent identity | System | `Co-authored-by: <human>` |
| Named checkpoint | Human who triggered | System | `Co-authored-by: <agents>` if any contributed |

**Visual pattern for timeline:** Author avatar/icon (human face vs agent sparkle) + name + timestamp. Color-coding per author (Google Docs pattern) for change highlighting. The existing presence bar design extends naturally.

**`git blame` for line-level attribution:** Free with git. Shows which commit (and therefore which author) last modified each line. This provides the "who wrote this paragraph" answer without needing to persist CRDT origins.

**Implication:** The Yjs `Y.Map('activity')` side-channel is for real-time in-editor attribution (who is currently editing). Git commit metadata is for historical attribution (who wrote what). They complement each other — activity for live, git for permanent.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **D1 (Version History UX):** Exact pixel-level UI patterns from products not captured (screenshots are copyrighted). The structural patterns are clear; visual design will need its own iteration.
- **D5 (Crash Recovery):** Yjs binary storage location not decided — SQLite via Hocuspocus extension vs sidecar files in `.openknowledge/cache/`. Both work; the choice is an implementation detail.
- **D4 (Onboarding Friction):** Windows-specific git behavior with custom refs not investigated.

### Out of Scope (per Rubric)

- Permission model design (Bucket 5) — affects draft auto-creation trigger but not persistence patterns
- Editor component architecture (Bucket 1) — the timeline panel is a new React component but its design is UX, not architecture
- MCP tool signatures (Bucket 2) — checkpoint/restore could be exposed as MCP tools but that's a surface decision
- Publishing/deployment (Later phase)

### Open Decisions This Report Informs

| Decision | Options | Evidence points to |
|---|---|---|
| Ship timeline UI in Now or defer to Next? | Full UI / invisible auto-persist only | **Ship checkpoint pipeline in Now; timeline UI is judgment call.** The pipeline is ~30 LOC and provides the data model. Timeline UI is ~300-400 LOC of React. |
| Yjs binary persistence? | Dual (binary + markdown) / markdown only | **Dual.** Prevents Hocuspocus #344 reconnection bug. Binary is a cache, not source of truth. |
| GIT_INDEX_FILE location? | `.openknowledge/cache/` / `.git/` / `/tmp/` | **`.openknowledge/cache/git-index`** — gitignored, discoverable, survives reboots. |
| Restore semantics? | Forward commit / branch / destructive rollback | **Forward commit.** Universal pattern across all products. |
| WIP ref cleanup timing? | After checkpoint / periodic / never | **After checkpoint.** Delete ref, let git gc handle objects. |

---

## References

### Evidence Files
- [evidence/version-history-ux.md](evidence/version-history-ux.md) — 8 products compared on auto-save + named version patterns
- [evidence/git-squash-merge-patterns.md](evidence/git-squash-merge-patterns.md) — Git plumbing sequence, simple-git API, tag patterns, WIP ref management
- [evidence/restore-patterns.md](evidence/restore-patterns.md) — Restore semantics across 6 products, Y.Doc rebuild strategy
- [evidence/git-onboarding-friction.md](evidence/git-onboarding-friction.md) — 6 gaps in onboarding report, init decision tree, ref isolation
- [evidence/crash-recovery.md](evidence/crash-recovery.md) — Hocuspocus/Yjs recovery, dual persistence, startup sequence
- [evidence/draft-branch-patterns.md](evidence/draft-branch-patterns.md) — 4 draft patterns compared, Hocuspocus namespacing
- [evidence/attribution-patterns.md](evidence/attribution-patterns.md) — Git author conventions, CRDT origin limits, visual patterns

### External Sources
- [Hocuspocus Persistence Guide](https://tiptap.dev/docs/hocuspocus/guides/persistence) — Document lifecycle, onLoadDocument/onStoreDocument
- [Hocuspocus Issue #344](https://github.com/ueberdosis/hocuspocus/issues/344) — Content duplication on reconnect after restart
- [Yjs Document Updates](https://docs.yjs.dev/api/document-updates) — encodeStateAsUpdate, applyUpdate, mergeUpdates
- [bartman/git-wip](https://github.com/bartman/git-wip) — OSS WIP ref pattern (closest prior art)
- [Git merge-tree documentation](https://git-scm.com/docs/git-merge-tree) — In-memory merge without working tree (Git 2.38+)
- [Sanity Drafts Model](https://www.sanity.io/docs/content-lake/drafts) — Document ID prefix pattern for drafts
- [Storybook .gitignore Gap (Issue #26095)](https://github.com/storybookjs/storybook/issues/26095) — Precedent for init managing .gitignore
- [gitignore.pro Best Practices](https://gitignore.pro/guides/gitignore-best-practices) — Tool-artifact ignore conventions

### Related Research
- [reports/onboarding-multiproject-ux/](../onboarding-multiproject-ux/) — Zero-friction onboarding research; D4 of this report cross-references and identifies 6 gaps
