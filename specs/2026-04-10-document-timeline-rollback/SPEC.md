# Document Timeline & Rollback — Spec

**Status:** Draft
**Owner(s):** Miles Kaming-Thanassi
**Last updated:** 2026-04-10
**Baseline commit:** (post external-write-reconciliation merge)
**Links:**
- Parent spec: `specs/2026-04-08-external-write-reconciliation/SPEC.md` (shadow repo substrate)
- STORIES.md: Bucket 4 (auto-persistence timeline), Bucket 3 (attribution)
- Shadow repo: `packages/server/src/shadow-repo.ts`
- API extension: `packages/server/src/api-extension.ts`
- Editor: `packages/app/src/editor/TiptapEditor.tsx`, `packages/app/src/components/EditorPane.tsx`

---

## 1) Problem statement

**Situation.** The shadow bare repo (`.git/openknowledge/` or `.openknowledge/`) is now live. It captures per-writer WIP commits on every auto-save (L2, 30s debounce), upstream-import commits on every `git pull`, and checkpoint refs on every user-triggered "Save Version." The parent spec (external-write-reconciliation) explicitly deferred the timeline UI surface (NG9: "Full Bucket 4 Save Version timeline UI") and the History Queries future work category (time-based recovery, cross-session undo, per-block blame). The shadow repo was designed as an attribution journal — G3 states it "accurately tracks every change to its source writer between Save Versions." The substrate exists. No surface reads from it yet.

**Complication.** Three tensions make "just add a timeline panel" insufficient:

1. **The data isn't query-ready.** Shadow history is spread across N writer refs per branch (`refs/wip/<branch>/<writer-id>`), each with independent parent chains. There's no merged timeline view — getting "all edits to `intro.mdx` in chronological order across all writers" requires enumerating all writer refs, walking each log filtered to the file, merging by timestamp, and deduplicating. No API endpoint exists for this.

2. **Rollback into a live CRDT session is a design problem.** The Y.Doc is an active, shared document with connected clients, observers, and bidirectional sync. "Restore to version X" means: read historical content from shadow → apply to Y.Doc as a CRDT transaction → other clients see the change like any normal edit → `reconciledBase` updates → L1 flushes to disk. This must go through the same transact path as any other edit to maintain CRDT invariants.

3. **WIP refs are ephemeral — they reset on Save Version.** After `saveVersion()`, all `refs/wip/<branch>/*` are deleted and the commits become orphaned (reachable only via reflog until gc). Checkpoint refs survive, but fine-grained auto-save history between checkpoints is temporary by design. The timeline must decide how to handle this: preserve WIP history across checkpoints, or accept that inter-checkpoint detail is transient.

**Resolution.** Build a Document Timeline feature with:
- A right-side collapsible panel showing chronological edit history per document
- Two tiers of entries: **checkpoints** (durable, from `refs/checkpoints/*`) and **WIP auto-saves** (expandable between checkpoints, from `refs/wip/*`)
- Per-writer attribution coloring (human/agent/upstream)
- Markdown diff preview between any two versions
- Append-only rollback: "Restore to version X" reads historical content from shadow, applies to Y.Doc via CRDT transact, creating a new forward entry in the timeline
- Server-side HTTP APIs for history queries and rollback execution

## 2) Goals

- **G1** Users can see a chronological timeline of all edits to the current document, scoped to the current branch, in a right-side collapsible panel.
- **G2** Each timeline entry shows: timestamp, author (human/agent/upstream), and a summary of what changed (e.g., "3 blocks added").
- **G3** Users can preview the document content at any historical point by selecting a timeline entry.
- **G4** Users can restore to any historical version via an append-only rollback that goes through the CRDT — other connected clients see the change like any normal edit.
- **G5** Checkpoint entries (from Save Version) are visually prominent; WIP auto-save entries are collapsed between checkpoints and expandable on demand.
- **G6** Per-writer attribution coloring distinguishes human edits, agent edits, and upstream syncs.
- **G7** The timeline works identically in integrated mode (project repo present) and standalone mode (no project repo).
- **G8** History queries are paginated and performant — the panel is responsive even with long edit histories.

## 3) Non-goals

- **[NEVER]** NG1: Direct file manipulation for rollback. Rollback always goes through the CRDT to maintain session invariants.
- **[NOT NOW]** NG2: Per-block blame ("who wrote this paragraph"). Deferred to Bucket 3 attribution UI.
- **[NOT NOW]** NG3: Cross-document history queries ("all AI edits across my KB this week"). Single-document scope only.
- **[NOT NOW]** NG4: Cross-branch history. Current branch only.
- **[NOT NOW]** NG5: Agent undo integration. Standard undo (ctrl+z) and selective undo (undo another user's changes) are separate future work.
- **[NOT NOW]** NG6: Full-text search over historical versions.
- **[NOT NOW]** NG7: "What changed since I was last here" view.
- **[NOT NOW]** NG8: Rich rendered diff preview (showing formatted output). Markdown source diff for MVP.

## 4) Personas / consumers

| Persona | Timeline use case |
|---------|------------------|
| **P1: Fumadocs IC** | Sees what changed since last Save Version, previews a checkpoint before rolling back, understands which edits came from upstream vs. their own typing |
| **P2: Standalone KB user** | Same needs but without git vocabulary — "Save Version" and "Restore" are the only version concepts; the timeline panel is the primary version-history surface |
| **P4: External editor user** | Sees that their VS Code saves were captured in the timeline, recovers from accidental overwrites by restoring a prior version |

## 5) User journeys

### P1: Fumadocs IC recovers from accidental paste (time-based recovery)

1. User is editing `content/docs/auth.mdx` in the browser. They accidentally paste 200 lines of clipboard garbage over their introduction paragraph.
2. They immediately notice and want to recover. They click the clock icon in the editor header.
3. The timeline panel slides open from the right. At the top: "Now" with the current (corrupted) state. Below: a series of WIP auto-save entries from the last few minutes, each showing a timestamp and "Miles" with a blue dot.
4. They click the entry from "3 minutes ago" (before the bad paste). The panel shows a markdown diff: the old introduction paragraph vs. the current garbage.
5. They click "Restore this version." The CRDT applies the old content — the garbage disappears, the introduction reappears. The editor updates smoothly. Any other connected client sees the content revert.
6. The timeline now shows a new topmost entry: "Restored from version 3 min ago."

**Aha moment:** "I got my paragraph back in 10 seconds without ever leaving the editor."

### P1: Fumadocs IC reviews what changed since last Save Version

1. User has been editing for 30 minutes. They want to review before clicking "Save Version."
2. They open the timeline panel. The top section shows 8 WIP auto-save entries (every ~30 seconds of active editing), plus 2 agent entries (Claude added some content).
3. They click the most recent checkpoint entry ("Save Version — 45 min ago") to see a diff of everything that changed since then: their 8 edits + Claude's 2 edits, merged.
4. Satisfied, they close the panel and click "Save Version."

### P2: Standalone KB user explores version history

1. User has been using openknowledge for a week. They open the timeline panel on `getting-started.mdx`.
2. The timeline shows 4 checkpoint entries (one per Save Version this week) with WIP entries collapsed between them. The top section has 3 recent WIP entries.
3. They expand the WIP section between checkpoints 2 and 3 — 12 auto-save entries appear, some blue (their edits), some orange (agent edits), one gray (upstream sync from a pull).
4. They click checkpoint 2 to preview the document as it was 3 days ago. The panel shows the historical markdown content.
5. They decide they prefer the current version and close the panel. No changes made.

### P4: External editor user recovers from overwrite

1. User has been editing `intro.mdx` in the browser. Their VS Code auto-save accidentally overwrites the file with an older version from a different branch.
2. The editor updates (reconciliation picks up the external change). Their recent paragraphs disappear.
3. They open the timeline panel. The most recent WIP entry shows "2 min ago — upstream" (gray dot) — that's the VS Code overwrite. Just above it: their own edits from moments earlier (blue dots).
4. They click their last WIP entry before the overwrite, see their original content, and click "Restore this version." Their paragraphs reappear.

## 6) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| Must | FR1 | History list API endpoint | `GET /api/history?docName=<name>&branch=<branch>&limit=<n>&offset=<n>` returns paginated timeline entries sorted by `--author-date-order`, filtered to the requested file via `--full-history`. Each entry: `{ sha, timestamp, author, authorEmail, type, message }` where type is `checkpoint`, `wip`, or `upstream`. Supports filtering: `type` (checkpoint/wip/upstream, comma-separated), `author` (include by name), `excludeAuthor` (exclude by name). | Walks checkpoint ancestry + current WIP refs, merges by author date, applies filters post-merge |
| Must | FR2 | Version content API endpoint | `GET /api/history/:sha?docName=<name>` returns the full markdown content of the document at the given commit via `git show <sha>:<docName>.md`. Returns 404 `{ ok: false, error: "Document did not exist at this version" }` if the file is not in the tree at that commit (validated via `git cat-file -e` before `git show`). | Used for preview panel and restore |
| Must | FR3 | Diff API endpoint | `GET /api/diff?docName=<name>&from=<sha>&to=<sha>` returns a unified diff between two versions of the document. If `from` is omitted, diffs against current Y.Doc content. | Uses `diff` library (already in deps) for markdown-level diff |
| Must | FR4 | Rollback API endpoint | `POST /api/rollback` with body `{ docName, commitSha }`. Validates file exists at commit via `git cat-file -e` (404 if not). Reads historical markdown from shadow → applies to Y.Doc via `updateYFragment` transact with string origin `'rollback-apply'` (no `skipStoreHooks` — L1 persistence fires normally, `registerWrite` in file-watcher prevents re-detection loop) → updates `reconciledBase`. Returns `{ ok, restoredFrom, timestamp }`. | Append-only: creates a new CRDT transaction, does NOT rewrite history. All connected clients see the change via CRDT sync. Rollback transaction propagates to clients as a remote update — client-side observers A/B skip remote transactions, so no feedback loops. |
| Must | FR5 | Timeline panel UI (right-side Sheet) | Collapsible right-side panel (~350px) triggered by clock icon in EditorHeader. Shows chronological list of timeline entries. Checkpoints are always visible; WIP entries between checkpoints are collapsed behind "Show N auto-saves" expander. Current (pre-checkpoint) WIP entries expanded by default. Panel is a navigation list only — no content preview in the panel itself. | Uses existing Sheet component with `side="right"` |
| Must | FR6 | Per-writer attribution coloring | Timeline entries have colored indicators: blue for human, orange for agent, gray for upstream. Author name displayed next to indicator. | Colors from existing design tokens: `--color-azure-blue`, `--color-agent`, muted for upstream |
| Must | FR7 | Version preview in editor area | Clicking a timeline entry switches the main editor to a **read-only preview mode** showing the historical markdown content in the full editor area (not the panel). A "Show diff" toggle switches between raw historical content and a unified diff against current. The TipTap/CodeMirror live editor is replaced by a read-only CodeMirror instance. The Visual/Markdown toggle is hidden during preview. "Exit preview" or clicking "Now" in the panel returns to live editing. | Fetches content via FR2. Editor area state: `'editing' | 'preview' | 'diff'`. |
| Must | FR8 | Restore action with confirmation | "Restore" button in the editor header during preview mode. Clicking shows confirmation: "Replace current content with this version?" → [Cancel] [Restore]. Confirming calls FR4, exits preview mode, and returns to live editing with restored content. | Preview-first flow prevents accidental restores. Restore button only visible during preview mode. |
| Should | FR9 | Relative timestamps | Timeline entries show relative timestamps ("2 min ago", "yesterday") with full ISO timestamp on hover. | Needs date formatting utility (add `date-fns` or use native `Intl.RelativeTimeFormat`) |
| Should | FR10 | Change summary on entries | WIP entries show a brief summary: "N blocks changed" or "content added/removed". Derived from diffing adjacent commits at query time or stored in commit message. | May impact query performance; evaluate during implementation |
| Should | FR11 | Keyboard shortcut | `Ctrl+Shift+H` (or similar) toggles the timeline panel. | Register in editor keymap |
| Could | FR12 | "Restored from version X" label | After a rollback, the new WIP entry in the timeline shows a label indicating it was a restore operation, linking back to the source version. | Rollback commit message includes source SHA |
| Must | FR13 | Multi-parent checkpoint commits | `saveVersion()` collects ALL writer WIP refs as parents (not just the first), deduplicates by SHA (`[...new Set(parents)]`). When `parents` is empty (no activity since last checkpoint), falls back to parenting on the latest checkpoint ref. Ensures all per-writer WIP chains survive across Save Versions via checkpoint ancestry. | ~10 line change in shadow-repo.ts. Experimentally verified with octopus merges. |
| Must | FR17 | Standalone-mode checkpoints | When no project repo exists, `saveVersion()` skips the project commit step (step 1) and creates only the shadow checkpoint + resets WIP refs. Checkpoint ref is named `refs/checkpoints/<branch>/<shadow-commit-sha>` (using the shadow commit's own SHA instead of a project commit SHA). The API endpoint (`POST /api/save-version`) removes the `!projectRoot` guard — the shadow ref is the only required dependency. | ~20 lines of conditional logic in saveVersion(). Ensures standalone users get the full two-tier timeline. |
| Should | FR14 | Timeline live refresh | While the timeline panel is open, the entry list re-fetches when the document is saved (detectable by polling `GET /api/history` on a 10s interval while the panel is visible, or triggered by L2 commit completion if a signal is available). New entries appear at the top of the list. | Prevents stale timeline when panel stays open during editing |
| Must | FR15 | UI states: loading, empty, error | **Loading:** Skeleton/spinner while `GET /api/history` is in flight. **Empty:** "No history yet" message for brand-new documents with zero commits. **Error:** "History unavailable" banner if shadow repo is missing/corrupt (graceful degradation). **Preview loading:** Spinner while `GET /api/history/:sha` fetches content. **Rollback error:** Inline error text "Restore failed — document unchanged" in the editor header (auto-dismisses after 4s) if `POST /api/rollback` returns an error. | Defensive UI for all non-happy-path states |
| Must | FR16 | No-checkpoint rendering | When zero checkpoints exist (new install, or standalone mode), all WIP entries display as a flat chronological list with no collapsing. The `type=checkpoint` fast path returns an empty list, which is correct. | First Save Version creates the first checkpoint anchor |

### Non-functional requirements

- **Performance:** `GET /api/history` must respond in < 200ms for files with up to 500 commits in the shadow DAG. `GET /api/history/:sha` (content retrieval) in < 50ms. `POST /api/rollback` in < 300ms including CRDT apply.
- **Reliability:** If the shadow repo is missing or corrupted, the timeline panel shows "History unavailable" gracefully (not a crash). Rollback failure leaves the Y.Doc unchanged.
- **Data safety:** Rollback never destroys history. It creates a new CRDT transaction that results in a new WIP commit. The restored-from version remains in the timeline.
- **Responsiveness:** The timeline panel opens in < 100ms (empty state), populates entries incrementally. Scroll performance remains smooth with 100+ visible entries.

## 7) Success metrics & instrumentation

- **M1: Time-to-recovery.** User accidentally corrupts content → opens timeline → restores prior version. Target: < 15 seconds end-to-end.
- **M2: Timeline accuracy.** Every WIP commit and checkpoint in the shadow repo appears in the timeline in correct chronological order. Verified via test scenario with 3 writers.
- **M3: Rollback correctness.** After rollback, `git show <rollback-wip-sha>:<file>` matches `git show <source-sha>:<file>`. All connected clients show the same content. Verified via E2E test.
- **M4: Multi-writer preservation.** After Save Version with 2+ writers, `git log <checkpoint> --full-history -- <file>` includes commits from ALL writers, not just the first. Verified via unit test.
- **Instrumentation:** `[timeline] query docName=<name> branch=<branch> entries=<N> duration=<ms>` for every history query. `[rollback] docName=<name> from=<sha> to=<sha> duration=<ms>` for every restore. Counter metrics via `GET /api/metrics/timeline`.

## 8) Current state

The shadow bare repo exists and captures all the data needed for the timeline:
- Per-writer WIP commits on every L2 auto-save (30s debounce)
- Upstream-import commits on every `git pull` / HEAD movement
- Checkpoint refs on every user-triggered "Save Version"
- Full content tree retrievable at any commit via `git show`

**What doesn't exist:** No history query APIs, no rollback API, no timeline UI.

See `evidence/shadow-repo-substrate.md` for detailed data model, function signatures, and query patterns.

## 9) Proposed solution

### Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│ Browser (React)                                          │
│                                                          │
│  EditorPane                                              │
│  ├── EditorHeader ──── [Clock icon] ──► toggle panel     │
│  ├── EditorArea (TipTap / CodeMirror)                    │
│  └── Sheet (right side)                                  │
│       └── TimelinePanel                                  │
│            ├── EntryList (checkpoints + WIP)              │
│            ├── VersionPreview (markdown content / diff)   │
│            └── RestoreButton → POST /api/rollback        │
│                                                          │
│  Data flow:                                              │
│  GET /api/history ──► populate EntryList                  │
│  GET /api/history/:sha ──► populate VersionPreview       │
│  GET /api/diff ──► show diff in VersionPreview            │
│  POST /api/rollback ──► CRDT transact ──► all clients    │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────────┐
│ Server (Hocuspocus + API extension)                      │
│                                                          │
│  /api/history     ── shadowGit().log() with              │
│                      --full-history --author-date-order   │
│  /api/history/:sha ── shadowGit().show()                  │
│  /api/diff         ── diff library on two markdown blobs  │
│  /api/rollback     ── shadowGit().show() →                │
│                      parse markdown →                     │
│                      updateYFragment() →                  │
│                      setReconciledBase()                  │
│                                                          │
│  Shadow bare repo (.git/openknowledge/)                   │
│  ├── refs/checkpoints/<branch>/<sha> (durable)           │
│  ├── refs/wip/<branch>/<writer-id> (current session)     │
│  └── object store (commits, trees, blobs)                │
└─────────────────────────────────────────────────────────┘
```

### API design

#### GET /api/history

Query parameters:
- `docName` (required): document name (e.g., `intro`)
- `branch` (optional, default: current branch): project branch
- `limit` (optional, default: 50): max entries
- `offset` (optional, default: 0): pagination offset
- `type` (optional): filter by entry type. Values: `checkpoint`, `wip`, `upstream`. Comma-separated for multiple (e.g., `type=checkpoint,wip`). If omitted, returns all types.
- `author` (optional): filter to entries by a specific author name (e.g., `author=Miles`). Comma-separated for multiple.
- `excludeAuthor` (optional): exclude entries by a specific author name (e.g., `excludeAuthor=upstream`). Useful for hiding upstream sync noise.

Response:
```json
{
  "ok": true,
  "entries": [
    {
      "sha": "abc123def456...",
      "timestamp": "2026-04-10T14:30:00Z",
      "author": "Miles",
      "authorEmail": "miles@example.com",
      "type": "wip",
      "message": "WIP auto-save 2026-04-10T14:30:00Z"
    },
    {
      "sha": "789012abc345...",
      "timestamp": "2026-04-10T14:00:00Z",
      "author": "Miles",
      "authorEmail": "miles@example.com",
      "type": "checkpoint",
      "message": "checkpoint: Save Version → project commit 8a2f...",
      "projectCommitSha": "8a2f1234..."
    },
    {
      "sha": "def456ghi789...",
      "timestamp": "2026-04-10T13:55:00Z",
      "author": "upstream",
      "authorEmail": "noreply@openknowledge.local",
      "type": "upstream",
      "message": "upstream: import from fa3d..8b2e"
    }
  ],
  "total": 47,
  "hasMore": true
}
```

Implementation:
1. Enumerate checkpoint refs: `git for-each-ref refs/checkpoints/<branch>/`
2. For each checkpoint, walk its ancestor chain filtered to the file: `git log <checkpoint> --full-history --author-date-order --format='%H|%aI|%an|%ae|%s' -- <docName>.md`
3. Walk current WIP refs (pre-next-checkpoint): `git log refs/wip/<branch>/<writer> --author-date-order --format=... -- <docName>.md`
4. Merge all entries by author timestamp, deduplicate by SHA
5. Classify type from commit message prefix: `checkpoint:` → checkpoint, `upstream:` → upstream, else → wip
6. Apply filters post-merge:
   - `type`: keep only entries matching requested types
   - `author`: keep only entries matching requested author names
   - `excludeAuthor`: remove entries matching excluded author names
   - Note: `author`/`excludeAuthor` filters can also be pushed to git via `--author=<name>` for performance, but post-merge filtering is simpler and handles the cross-ref merge case correctly
7. Paginate via limit/offset on the filtered, merged list

Shortcut for `type=checkpoint` only: skip DAG walk entirely, just `git for-each-ref --sort=-authordate refs/checkpoints/<branch>/` and read commit metadata. This is the fast path for the "show me just my Save Versions" view.

#### GET /api/history/:sha

Query parameters:
- `docName` (required): document name

Response:
```json
{
  "ok": true,
  "sha": "abc123...",
  "content": "---\ntitle: Introduction\n---\n\n# Welcome\n\nThis is the document content at that point in time.",
  "timestamp": "2026-04-10T14:30:00Z",
  "author": "Miles"
}
```

Implementation: `shadowGit().raw('show', `${sha}:${docName}.md`)`

#### GET /api/diff

Query parameters:
- `docName` (required)
- `from` (optional): commit SHA. If omitted, uses current Y.Doc content.
- `to` (required): commit SHA

Response:
```json
{
  "ok": true,
  "lines": [
    { "type": "unchanged", "text": "# Welcome" },
    { "type": "removed", "text": "Old paragraph" },
    { "type": "added", "text": "New paragraph" }
  ],
  "additions": 1,
  "deletions": 1
}
```

Implementation: Read both versions via `git show`, compute unified diff via `diff` library.

#### POST /api/rollback

Request body:
```json
{
  "docName": "intro",
  "commitSha": "abc123..."
}
```

Response:
```json
{
  "ok": true,
  "restoredFrom": "abc123...",
  "timestamp": "2026-04-10T15:00:00Z"
}
```

Implementation:
1. `const markdown = await shadowGit().raw('show', `${commitSha}:${docName}.md`)`
2. Get live Y.Doc from Hocuspocus
3. Inside `document.transact(() => { ... }, 'rollback-apply')`:
   - Strip frontmatter, parse markdown, convert to ProseMirror node
   - `updateYFragment(document, xmlFragment, pmNode, meta)` — updates XmlFragment
   - Replace Y.Text('source') content with the full markdown
   - Update metadata map with restored frontmatter
4. `setReconciledBase(docName, markdown)` — update merge base
5. L1 debounce writes restored content to disk (no `skipStoreHooks` needed — the `registerWrite` mechanism in file-watcher prevents re-detection of our own write)
6. L2 debounce creates new WIP commit (message includes "restored from <sha>")

**Rollback transaction origin:** Use raw string `'rollback-apply'` (not a `LocalTransactionOrigin` object with `skipStoreHooks`). We *want* L1 persistence to fire so the restored content reaches disk through the normal pipeline. The file-watcher's `registerWrite` hash check prevents the self-write from re-triggering reconciliation.

**Client observer safety:** The rollback transaction propagates to clients as a remote CRDT update. Client-side bidirectional observers (Observer A: tree→text, Observer B: text→tree) both skip remote transactions (`!transaction.local` guard), so no feedback loops occur. The server does not run bidirectional observers — it only hosts the Y.Doc and sync protocol.

**Concurrency note:** Between `git show` (reading historical content) and `document.transact()` (applying it), another write could land (agent write, external change). The rollback overwrites it. This is inherent to append-only semantics and acceptable — the overwritten write will appear as a WIP entry in the timeline and is itself restorable.

### Implementation notes

- **Timeline reads do NOT need the shadow-root writer lock.** History queries (`git log`, `git show`) are read-only. Git's object store is append-only and ref reads are atomic. The lock is only needed for mutations.
- **Never use `--simplify-merges`** with multi-parent checkpoint queries. Always use `--full-history` to prevent git from hiding commits via TREESAME optimization.
- **Deduplicate checkpoint parents:** Before building `commit-tree` args, `parents = [...new Set(parents)]` to handle cases where two writers share the same tip SHA.
- **Zero-parent checkpoint fallback:** When no writers have WIP refs (no activity since last checkpoint), parent the new checkpoint on the latest existing checkpoint ref via `git for-each-ref --sort=-authordate --count=1 refs/checkpoints/<branch>/`. First-ever checkpoint with no prior refs is a valid orphan.
- **Standalone mode (FR17):** `saveVersion()` conditionally skips the project commit step when no project repo exists. The shadow checkpoint + WIP reset still execute. Checkpoint ref uses the shadow commit SHA instead of a project commit SHA: `refs/checkpoints/<branch>/<shadow-sha>`. The `POST /api/save-version` endpoint removes the `!projectRoot` guard. Timeline query classifies entries by commit message prefix (`checkpoint:` → checkpoint), not ref name structure, so both naming conventions are handled uniformly.
- **Rollback + Save Version race:** If `saveVersion()` runs before L1 flushes the rollback to disk, the checkpoint captures pre-rollback disk content. This is a pre-existing race (not introduced by this spec) between Y.Doc state and disk state. Mitigation: `saveVersion()` should force-flush pending L1 writes before checkpointing. This is out of scope for this spec but noted as a dependency.

### UI design

#### Panel trigger (EditorHeader)

Clock icon button (`lucide-react` Clock) in the right controls, before PresenceBar:
```
[SidebarTrigger] [Separator] [filename]  [ToggleGroup]  [🕐] [PresenceBar] [AgentUndoButton]
```

Ghost variant, `icon-sm` size, tooltip: "Document timeline (Ctrl+Shift+H)".

#### Timeline panel (Sheet, right side)

**Width:** ~350px fixed. The panel is purely a navigation list — diffs display in the main editor area.

**Panel structure:**
```
┌──────────────────────────┐
│ Timeline            [✕]  │
├──────────────────────────┤
│ ● Now                    │  ← current state (click to exit preview)
│ ○ 2 min ago — Miles      │  ← WIP (expanded, pre-checkpoint)
│ ○ 5 min ago — Claude     │
│ ○ 8 min ago — Miles      │
│                          │
│ ◆ Save Version — 15m ago │  ← checkpoint (prominent)
│   "Updated auth docs"    │
│   Miles, Claude           │
│                          │
│ ▸ Show 6 auto-saves      │  ← collapsed WIP tier
│                          │
│ ◆ Save Version — 2h ago  │  ← checkpoint
│   "Initial draft"        │
│   Miles                   │
│                          │
│ ▸ Show 12 auto-saves     │
└──────────────────────────┘
```

**Entry interactions — diff in main editor area:**

Clicking a timeline entry puts the main editor into a **read-only preview/diff mode**. The diff renders in the full editor area, not the narrow panel.

```
┌──────────────────────────┐ ┌──────────────────────────────────────────────┐
│ Timeline            [✕]  │ │ EditorHeader                                 │
├──────────────────────────┤ │  Viewing: 5 min ago — Claude                  │
│ ● Now                    │ │  [Exit preview]  [Show diff ↔]  [Restore ↩]  │
│ ○ 2 min ago — Miles      │ ├──────────────────────────────────────────────┤
│ ○ 5 min ago — Claude  ◄──┤ │                                              │
│ ○ 8 min ago — Miles      │ │  ## Authentication                           │
│                          │ │                                              │
│ ◆ Save Version — 15m ago │ │  OAuth2 integration with PKCE flow...        │
│   "Updated auth docs"    │ │                                              │
│   Miles, Claude           │ │  (read-only historical content               │
│                          │ │   or unified diff vs. current)               │
│ ▸ Show 6 auto-saves      │ │                                              │
└──────────────────────────┘ └──────────────────────────────────────────────┘
```

**Editor preview mode behavior:**
- The editor area switches to **read-only** and displays either the historical markdown content or a diff against the current version
- "Show diff" toggles between raw historical content and unified diff view (additions in green, deletions in red)
- "Restore" button → confirmation: "Replace current content with this version?" → [Cancel] [Restore]
- "Exit preview" (or clicking "Now" in the panel) returns to live editing
- Clicking a different entry in the panel updates the preview without exiting the mode
- The TipTap/CodeMirror editor is replaced by a read-only CodeMirror instance showing markdown content or diff (not the live Y.Doc)
- The Visual/Markdown mode toggle is hidden during preview mode

**Attribution colors:**
- Human: `var(--color-azure-blue)` (#3784ff) dot + name
- Agent: `agent` (#d97757) dot + name  
- Upstream: `gray-400` dot + "upstream sync"

### Multi-parent checkpoint change

In `saveVersion()` (shadow-repo.ts), replace the break-on-first-writer loop:

```typescript
// Collect ALL writer WIP refs as parents
const parents: string[] = [];
for (const w of writers) {
  try {
    const sha = (await sg.raw('rev-parse', `refs/wip/${branch}/${w.id}`)).trim();
    parents.push(sha);
  } catch { /* ref may not exist */ }
}
try {
  const upstreamSha = (await sg.raw('rev-parse', `refs/wip/${branch}/upstream`)).trim();
  parents.push(upstreamSha);
} catch { /* may not exist */ }

// Checkpoint gets all parents
for (const p of parents) checkpointArgs.push('-p', p);
```

This ensures `git log <checkpoint> --full-history` includes all writer chains.

## 10) Decision log

| ID | Decision | Type | Status | 1-way? | Rationale | Evidence | Implication |
|----|----------|------|--------|--------|-----------|----------|-------------|
| D1 | Rollback is append-only (creates new version with old content) | P | LOCKED | Yes | Safer, no history loss, matches Google Docs pattern. "Undo the undo" is always possible. | Industry standard (Google Docs, Notion) | Timeline grows forward on restore; no destructive operations |
| D2 | Rollback goes through CRDT (Y.Doc transact), not direct file write | T | LOCKED | Yes | Maintains CRDT session invariants. Other clients see the change like any normal edit. `reconciledBase` updates naturally. | Parent spec architecture: Y.Doc is session cache, disk is canonical, all mutations go through CRDT | Rollback = read markdown from shadow → apply to Y.Doc via `updateYFragment` transact → L1 flushes to disk |
| D3 | Timeline panel is a collapsible right-side panel | P | LOCKED | No | On-demand, doesn't compete with file sidebar, matches editor convention (VS Code timeline) | Existing `Sheet` and `Resizable` components available | New component in EditorPane, triggered from EditorHeader |
| D4 | Primary scenario: all recovery modes, time-based recovery is MVP wedge | P | DIRECTED | No | Time-based recovery is "probably the most common real recovery action for solo IC users" (parent spec) | Parent spec Future Work §History queries | MVP must support both checkpoint restore and WIP-level rewind |
| D5 | Agent undo integration is deferred | P | LOCKED | No | Standard undo + selective undo are separate future work items | User direction | Timeline doesn't interact with UndoManager; rollback is a content replacement, not an undo stack operation |
| D6 | WIP entries are expandable relative to checkpoints | P | DIRECTED | No | Keeps the timeline scannable while preserving fine-grained recovery access | — | Checkpoints are top-level; WIP entries collapsed between them |
| D7 | Per-writer attribution coloring in timeline | P | DIRECTED | No | Low cost (data already in shadow commits), high value for understanding edit provenance | Shadow commit author metadata | Color-code: human (azure), agent (orange), upstream (gray) |
| D8 | Restore UX: preview first, then confirm | P | LOCKED | Yes | Preview step prevents accidental restores. Cost is ~zero since we already fetch content for the panel. | Industry pattern (Google Docs, GitHub) | Click entry → see content/diff → "Restore" button → confirmation |
| D9 | Restore does NOT auto-checkpoint | P | LOCKED | No | Keeps restore simple and consistent — it's just another CRDT edit. User Save Versions when ready. | Consistency with "edits are WIP until explicit Save Version" model | Restored content enters normal L1→L2 pipeline |
| D10 | Timeline queries use `--full-history --author-date-order` | T | LOCKED | No | `--full-history` prevents git history simplification from hiding commits. `--author-date-order` gives true chronological interleaving across writers. | Experimental verification in /tmp/shadow-merge-test | All timeline queries must include both flags |
| D11 | Multi-parent checkpoint commits preserve all writer chains | T | LOCKED | No | ~10 line change. Experimentally verified with octopus merges. Prevents losing agent/upstream WIP history after Save Version. Per-commit attribution fully preserved — each WIP commit retains its original author. | evidence/multi-parent-checkpoint.md | Change saveVersion() loop from break-on-first to collect-all |
| D12 | History API supports type/author/excludeAuthor filtering | P | LOCKED | No | Enables checkpoints-only view, per-writer filtering, and hiding upstream noise. `type=checkpoint` has a fast path (skip DAG walk). | User request | New query params on GET /api/history |
| D13 | Standalone-mode checkpoints in scope | T | LOCKED | No | No architectural reason to block checkpoints in standalone — `saveVersion()` just skips the project commit step and creates a shadow-only checkpoint. ~20 lines of conditional logic. Standalone users get full two-tier timeline. | Code trace: steps 2+3 of saveVersion() only need shadow repo | FR17 added. API guard `!projectRoot` removed for save-version. |
| D14 | Diff/preview displays in the main editor area, not the timeline panel | P | LOCKED | No | The panel is narrow (~350px) — not enough space for meaningful diff reading. The editor area has full width and the user is already focused there. Matches VS Code timeline pattern. | User direction, UX analysis | Panel is navigation-only. Editor enters read-only preview/diff mode on entry click. Header shows preview controls (exit, toggle diff, restore). |

## 11) Open questions

| ID | Question | Type | Priority | Resolved? | Investigation status | Resolution |
|----|----------|------|----------|-----------|---------------------|------------|
| Q1 | Should WIP refs be preserved across Save Versions? | T | P0 | **Yes** | Checkpoint already parents on WIP chain — ancestry preserves commits after ref deletion. Multi-parent fix (D11) extends this to all writers. | No change to deletion behavior needed. Multi-parent checkpoint preserves all chains. |
| Q2 | What markdown diff format/library should we use? | T | P0 | **Yes** | `diff@^7.0.0` already in app dependencies. Provides `createTwoFilesPatch` for unified diff output. | Use existing `diff` library for unified markdown diff |
| Q3 | How many entries shown by default (pagination)? | P | P0 | **Yes** | Default limit=50 via API. UI shows all checkpoints always; WIP collapsed between them. Scrollable. | limit=50 default, all checkpoints visible, WIP collapsed |
| Q4 | Diff preview format? | P | P0 | **Yes** | User leans markdown. Unified markdown diff for MVP; rendered diff is future work (NG8). | Markdown source diff via `diff` library |
| Q5 | How does the rollback API identify versions? | T | P0 | **Yes** | Commit SHA is the stable identifier. Timestamps are display-only. | `POST /api/rollback { docName, commitSha }` |
| Q6 | How does the timeline query merge entries across writer refs? | T | P0 | **Yes** | Walk checkpoint ancestry (which includes all WIP via parent chain) + current WIP refs. Merge by author date. `--full-history --author-date-order`. | Single DAG walk from checkpoints + current WIP refs |
| Q7 | Should multi-parent checkpoint be in scope? | T | P0 | **Yes** | Experimentally verified. ~10 lines. User confirmed after reviewing findings and verifying attribution is preserved per-commit. | In scope (D11 LOCKED) |
| Q8 | Date formatting library choice | T | P2 | No | Options: `date-fns` (tree-shakeable), `dayjs` (tiny), native `Intl.RelativeTimeFormat`. Low-risk reversible choice. | Deferred to implementation |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry |
|----|-----------|------------|-------------------|--------|
| A1 | Single-document sessions (one human writer) are the dominant use case for MVP | HIGH | Usage telemetry after launch | If multi-agent sessions become common, revisit multi-parent checkpoint priority |
| A2 | 50 entries per page is sufficient for most timeline browsing | MEDIUM | User testing. If users frequently paginate, increase default or add "load more" | After first user cohort |
| A3 | `git log` with `--full-history --author-date-order` on the shadow DAG performs acceptably up to 500 commits | HIGH | Experimentally verified: 900 commits in 189ms worst case | If shadow histories grow beyond 10K commits, add caching |
| A4 | The `diff` library already in dependencies produces good enough unified diffs for markdown | MEDIUM | Manual review of diff output on real markdown files | If diffs are noisy (e.g., frontmatter churn), investigate smarter diffing |
| A5 | Rollback via `updateYFragment` transact produces the same result as if the user had manually retyped the historical content | HIGH | Verified by tracing the external-change handler which uses the same path | — |

## 13) Risks / unknowns

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Shadow repo corruption makes timeline unavailable | Low | Medium | Graceful degradation: panel shows "History unavailable." Content is never lost (disk is canonical). `git fsck` recovery from parent spec. |
| `git log` performance degrades with very deep histories (thousands of commits) | Low | Medium | Pagination limits exposure. If needed: add commit-count caching, or limit DAG walk depth. |
| Rollback of large documents causes visible "flash" as CRDT applies | Medium | Low | Debounce render updates. The `updateYFragment` path already handles large replacements for the external-change case. |
| Multi-parent checkpoint changes could affect existing `saveVersion()` consumers | Low | Medium | The `SaveVersionResult` interface doesn't change. The checkpoint commit just has more parents. Unit test for backward compatibility. |
| Timeline entries for files that were renamed show broken history (shadow commits reference old filename) | Medium | Medium | Known limitation for MVP. Rename tracking requires `git log --follow` which adds complexity. Document as known gap. |
| Standalone checkpoint ref naming diverges from integrated mode | Low | Low | Standalone uses shadow commit SHA in ref name (`refs/checkpoints/<branch>/<shadow-sha>`) while integrated uses project commit SHA. Timeline queries must handle both. Implementer should ensure the `type` classification logic checks commit message prefix, not ref name structure. |
| Rollback + Save Version race: checkpoint could capture pre-rollback disk content | Low | Medium | Pre-existing race between Y.Doc state and L1 disk flush. `saveVersion()` should force-flush L1 first. Noted as dependency, not in scope. |
| Offset-based pagination fragile with live data | Low | Low | New WIP commits between page fetches can shift entries. Practical impact minimal with limit=50. Cursor-based pagination (last SHA as cursor) is a future upgrade. |

## 14) Future work

| Item | Maturity | Notes |
|------|----------|-------|
| Per-block blame | Identified | Bucket 3; needs walking shadow commits + block-level diff correlation |
| Cross-document history queries | Identified | "All AI edits this week" — needs cross-file shadow log walking |
| Cross-branch history | Identified | Requires multi-branch ref enumeration |
| Full-text search over history | Noted | Requires indexing shadow blob history |
| Standard undo (ctrl+z reverts my changes only) | Identified | Separate from timeline; per-origin UndoManager |
| Selective undo (undo another user/agent's changes) | Identified | Needs per-writer commit reversal primitive |
| "What changed since I was last here" view | Identified | High-leverage onboarding for returning users |
| Rich rendered diff preview | Noted | Show formatted output side-by-side instead of markdown source |
| Streaming/lazy loading timeline | Noted | Virtualization for very long histories |
| ~~Standalone-mode checkpoints~~ | ~~Identified~~ | **In scope (FR17).** |
| Cursor-based pagination | Noted | Replace offset-based with SHA-cursor-based pagination to handle live data correctly |
| Force-flush L1 before Save Version | Identified | Pre-existing race: `saveVersion()` reads disk content which may be stale vs Y.Doc. Rollback makes this more likely. Fix is in the persistence layer, not this spec. |
| Rename-aware timeline | Identified | Use `git log --follow` to track file renames and show continuous history across renames |

## 15) Glossary

*Inherits from parent spec. Additional terms:*

- **Timeline entry** — a single row in the timeline panel representing either a checkpoint (Save Version) or a WIP auto-save commit from the shadow repo.
- **Append-only rollback** — restoring to a historical version by applying old content as a new CRDT transaction, creating a new forward entry rather than rewriting history.
- **WIP tier** — the expandable section between checkpoints showing fine-grained auto-save history.

## 16) Agent constraints

**SCOPE:**
- `packages/server/src/shadow-repo.ts` — multi-parent checkpoint change in `saveVersion()`
- `packages/server/src/api-extension.ts` — new endpoints: `/api/history`, `/api/history/:sha`, `/api/diff`, `/api/rollback`
- `packages/server/src/` — new module for timeline query logic (history aggregation, filtering, pagination)
- `packages/app/src/components/` — new `TimelinePanel.tsx` component + `TimelineEntry.tsx` sub-components
- `packages/app/src/components/EditorPane.tsx` — add Sheet wrapper + timeline state
- `packages/app/src/components/EditorHeader.tsx` — add timeline toggle button
- `packages/app/src/components/ui/` — only if new shadcn components needed (unlikely)
- Tests co-located with source per convention

**EXCLUDE:**
- `packages/core/` — no changes needed (shared extensions unchanged)
- `packages/cli/` — no CLI changes for timeline
- `packages/server/src/persistence.ts` — no structural changes (rollback goes through existing CRDT transact path, not direct persistence manipulation)
- `packages/server/src/file-watcher.ts` — no changes
- `packages/server/src/reconciliation.ts` — no changes (rollback doesn't go through reconciliation)
- `docs/` — no doc changes in this spec

**STOP_IF:**
- Rollback causes data loss in any test scenario (Y.Doc content doesn't match source version after restore)
- `git log` on multi-parent checkpoints doesn't return commits from all parent chains
- Timeline query takes > 500ms on a shadow repo with < 1000 commits
- Any change would affect the parent spec's reconciliation protocol or batch coordination
- `saveVersion()` changes break existing Save Version behavior (project commit creation, checkpoint ref structure)

**ASK_FIRST:**
- Before adding new npm dependencies (date formatting library choice)
- Before changing any existing API endpoint's contract
- Before modifying the Sheet component's default behavior
- If standalone-mode checkpoint support seems needed during implementation
