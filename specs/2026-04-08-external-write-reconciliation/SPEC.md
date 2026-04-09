# External Write Reconciliation & Shadow Repo — Spec

**Status:** Draft
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-08
**Baseline commit:** fa3dd17 (main)
**Links:**
- PROJECT.md: §CC1 (Yjs + git complementary), §CC2 (three-layer auto-persistence), §CC4 (editing contexts = branches), §CC6 (everything branchable), §CC7 (portability)
- STORIES.md: Bucket 3 (attribution), Bucket 4 (auto-persistence), Bucket 5 (draft branches), open question #6 (KB git relationship to parent repo)
- Prior art in spike: `init_spike/src/server/persistence.ts`, `init_spike/src/server/file-watcher.ts`, `init_spike/src/editor/three-way-merge.ts`, `init_spike/src/server/hocuspocus-plugin.ts:418-449`
- Evidence: `./evidence/design-reasoning.md` (architectural candidate comparison)
- Reports: `reports/git-library-for-knowledge-platform/`, `reports/parcel-watcher-crdt-disk-bridge/`, `reports/crdt-mcp-filesystem-bridge/`, `reports/markdown-roundtrip-fidelity-tiptap/`, `reports/local-git-merge-infrastructure/`, `reports/claude-code-worktree-git-isolation/`, `reports/source-of-truth-persistence-collaboration/`

---

## 1) Problem statement

**Situation.** Openknowledge edits markdown files via a CRDT session layer (Y.Doc hosted by Hocuspocus) and persists them through a two-layer pipeline validated in the init-spike: (L1) CRDT → ProseMirror JSON → markdown → `.md` file, debounced 2–10s via `onStoreDocument`; (L2) `.md` files → `refs/wip/main` in the enclosing git repo, debounced 30s via `scheduleGitCommit()`. The Y.Doc itself is never persisted as binary — it is hydrated on demand from the markdown file on disk via `onLoadDocument` (parse → `updateYFragment`). A disk bridge via `@parcel/watcher` catches external writes and applies them to open Y.Docs via `updateYFragment` wrapped in a `skipStoreHooks: true` transaction. A `three-way-merge.ts` module exists and is wired for the source-mode toggle-back case — but *not* for the disk bridge path. PROJECT.md §CC1 locks in "Yjs + git as complementary" with Yjs handling within-branch concurrency and git handling between-branch isolation. §CC6 locks in "everything branchable," requiring per-branch atomic file + catalog switches. §CC7 locks in file-portability: any coding agent should be able to read the KB via files alone, without our MCP server.

**Complication.** The spike's architecture was designed for a **standalone-KB** deployment where openknowledge owns both the content directory and the `.git` tracking it. That assumption breaks the moment openknowledge is installed into an existing project — the Karpathy-IC flagship use case, which includes any Fumadocs, Mintlify, Nextra, Docusaurus, or custom-MDX repo. Two classes of failure appear simultaneously:

1. **Host-repo pollution.** The spike's Layer 2 writes WIP commits directly into the enclosing repo's `.git/`. In a Fumadocs repo, this means: our `refs/wip/main` is visible in `git log --all` and every git GUI; our objects bloat `.git/objects/` indefinitely; `git gc` keeps our state alive via reachable refs; `git push --mirror` silently carries our refs upstream; uninstalling openknowledge leaves orphaned state the user doesn't know how to clean up. The `GIT_INDEX_FILE=.git/index-wip` trick isolates the staging area but not the ref namespace or the object database.

2. **Reconciliation is underspecified and actively data-destroying.** When any external writer (git pull, vim save, agent using an unrelated filesystem tool, LSP fixer, `sed`, AI code editor) modifies a file, the disk bridge does a **2-way diff-apply** (`updateYFragment` transforms current Y.XmlFragment → new PM node) instead of a **3-way merge** (base + ours + theirs). There is no tracked merge base. Six concrete bugs result in the current spike:
   - **Overlapping in-flight edits are silently overwritten.** User types for 5 seconds, `git pull` changes the same paragraph upstream, file-watcher fires, `updateYFragment` replaces the Y.XmlFragment's state with the disk state — user's last 5 seconds are gone, with no warning.
   - **File deletions are explicitly ignored** (`file-watcher.ts:74-77`). A `git pull` that removes a file leaves the Y.Doc alive; the next save re-creates the file on disk, effectively undoing the `git rm`.
   - **Renames leak state.** `@parcel/watcher` delivers renames as delete+create; the delete is ignored, the create finds no open doc and also does nothing. The old Y.Doc continues editing a path that no longer exists.
   - **Git merge conflict markers parse as markdown.** `<<<<<<< HEAD ... ======= ... >>>>>>> origin/main` is treated as literal text, loaded into the Y.Doc, and written back to disk on the next save — destroying the user's ability to resolve the conflict in their normal tool.
   - **Shadow history blames upstream on the user.** If we adopt a shadow repo (below) without parent-awareness, the next WIP commit after a `git pull` contains upstream's diff on top of our prior tree, attributed to the current author. Bucket 3's origin-shading story becomes a lie.
   - **The save/pull race is unmitigated.** The 2s debounce can fire mid-`git pull`, interleaving our Y.Doc state with half-pulled upstream state. Git then aborts the merge with "Your local changes would be overwritten" and the user has to diagnose auto-save as the culprit.

The two failure classes are entangled: shipping integrated-mode requires fixing host-repo pollution (Class 1), and making the shadow repo attribution-faithful requires a reconciliation protocol that understands external writers as first-class events (Class 2). Neither ships alone.

**Resolution.** Adopt a two-part architecture that makes openknowledge a **sacred guest** of any host repo:

1. **Shadow bare repo at `.openknowledge/history.git`**, with `--work-tree` pointing at the parent project root, holding all WIP refs, drafts, checkpoints, and attribution metadata. The host's `.git/` is never touched. `.openknowledge/` is added to the host's `.gitignore` at init time.

2. **Explicit reconciliation protocol** for external writes, centered on: (a) a `reconciledBase: Map<string, string>` tracked per Y.Doc, (b) **three-way merge** as the only sync primitive (degenerating to 2-way when the Y.Doc is clean), (c) first-class **lifecycle events** (create/update/delete/rename/conflict) replacing the current "ignore delete" branch, (d) **batched disk events** during coordinated operations (pull/checkout/rebase/merge), triggered by a watcher on the parent repo's `.git/HEAD`, and (e) **upstream-import commits** in the shadow repo authored by `upstream` that preserve attribution across pulls and serve as rebase targets for active drafts. Block-level three-way merge reuses the existing `three-way-merge.ts` module; conflicts surface via a `Y.Map('conflicts')` side-channel (mirroring the pattern used by `Y.Map('activity')` in the presence spec).

Architecturally, this formalizes PROJECT.md's §CC1 claim that "Yjs handles within, git handles between" by making **all disk-level divergence** (whether from branch switch, branch merge, or upstream pull) go through git-mediated three-way merge, with the CRDT reconciling via diff-based `updateYFragment` transactions. It resolves STORIES.md open question #6 with a fifth option the list didn't consider: "bare git in `.openknowledge`, work-tree = parent project root, parent-aware via HEAD watcher."

## 2) Goals

- **G1** Openknowledge leaves **zero trace** in the host repo's `.git/` — no refs, no objects, no hooks, no config entries, no commits the user didn't author. Uninstalling openknowledge is `rm -rf .openknowledge/`.
- **G2** No external writer (git pull, vim, sed, agent filesystem tool, LSP fixer) can silently destroy in-flight CRDT edits. Non-overlapping external changes merge cleanly into the Y.Doc. Overlapping changes surface as conflicts.
- **G3** The shadow repo's history accurately attributes every change to its source writer (human, agent, or upstream). Bucket 3 origin shading and Bucket 4 checkpoint semantics can read from this substrate without post-hoc heuristics.
- **G4** File lifecycle events have first-class handling: deletes tombstone open docs, renames migrate Y.Doc state, creates hydrate lazily on open. No lifecycle transition silently re-creates or strands state.
- **G5** Git operations (pull, checkout, merge, rebase, cherry-pick, reset) do not corrupt disk state, CRDT state, or shadow repo state. Mid-operation races with our debounced save are prevented via an `.git/index.lock`-based quiet period.
- **G6** Merge conflicts that git cannot resolve (`<<<<<<<` markers) enter a dedicated **resolution mode**. The editor never attempts to parse conflict markers as markdown or write them to the Y.Doc. The user resolves the conflict via their normal git tool, and openknowledge re-engages after resolution.
- **G7** Every observable Y.Doc state is explainable from three per-document quantities: `reconciledBase`, `diskContent`, and `ydocUnsavedDelta`. Local reasoning about correctness is possible without global system knowledge.
- **G8** The architecture works identically in standalone mode (no host repo) and integrated mode (host repo present). The only difference is whether we write `.gitignore` entries for `.openknowledge/`.

## 3) Non-goals

- **[NEVER]** NG1: Writing WIP refs into the host repo's `.git/`. The "git-native with namespaced refs" architecture (Candidate B in `evidence/design-reasoning.md`) is rejected because it fails G1 — users can't uninstall cleanly, `git push --mirror` leaks state, and per-op attribution within batch commits is impossible.
- **[NEVER]** NG2: Making the CRDT the source of truth. The Y.Doc is a session cache derived from disk. Disk is canonical. This matches CC7 portability and the spike's actual behavior (Y.Doc is never persisted as binary).
- **[NEVER]** NG3: Silent "ours wins" or "theirs wins" conflict resolution on overlapping block-level edits. Overlaps must be surfaced to the user via the conflict side-channel.
- **[NEVER]** NG4: Parsing `<<<<<<<` / `=======` / `>>>>>>>` sequences as content. Files containing conflict markers are refused by the reconciliation layer until the markers are removed.
- **[NEVER]** NG5: Calling `git gc`, `git prune`, or any destructive operation on the host repo. The shadow repo owns its own gc lifecycle; the host's is the user's concern.
- **[NOT NOW]** NG6: Optimistic-concurrency MCP surface for agents (`write_file(path, content, expected_sha)` with 409 on mismatch). Needed to close the "agent mid-multi-file write races a git pull" case but out of scope for this spec. **Revisit if:** user testing shows agents stepping on concurrent upstream state frequently enough to warrant a dedicated design pass.
- **[NOT NOW]** NG7: Cross-device sync of the shadow repo (push/pull shadow to its own remote). The shadow repo is local-first. **Revisit if:** cloud mode ships and cross-device history sync is a requirement.
- **[NOT NOW]** NG8: Full draft UI (create/rename/delete/list/switch via visible controls). This spec defines the draft *storage model* (refs in shadow repo, base tracking, rebase-on-upstream-import) — the draft UX lives in a separate spec under Bucket 5.
- **[NOT NOW]** NG9: Full Bucket 4 "Save Version" timeline UI. This spec defines the *attribution substrate* (per-writer WIP refs, upstream-import commits) that the timeline reads from, not the timeline itself.
- **[NOT NOW]** NG10: Fine-grained (sentence/word/character) merge granularity. Block-level (paragraph/heading/code-fence) is the default. **Revisit if:** user testing shows block-level produces too many false conflicts on prose-heavy content.
- **[NOT NOW]** NG11: A file-watcher channel for `.git/HEAD` on Windows (where filesystem watching semantics differ). Linux and macOS ship first; Windows parity is a follow-up.
- **[NOT UNLESS]** NG12: File-level locking across clients to prevent concurrent human/human edits on the same paragraph. Y.js CRDT merge handles concurrent human edits natively. Only revisit if real-world evidence shows CRDT merges producing confusing results for users.
- **[NOT UNLESS]** NG13: Supporting non-git host VCS (Mercurial, Fossil, Pijul). The shadow bare repo exists regardless; parent-awareness hooks are git-specific. **Revisit if:** a meaningful user cohort requests non-git integration.

## 4) Personas / consumers

- **P1: Karpathy-IC user in a Fumadocs project.** Runs `npx openknowledge init` inside an existing Fumadocs repo, opens a browser editor for `content/docs/**/*.mdx`. Also edits the same files via VS Code, terminal, and `git`. Expects: their normal git workflow (pull, branch, commit, push, log, blame) works unchanged; their IDE git integration shows no unexplained refs; uninstalling openknowledge cleans up completely.

- **P2: Standalone-KB user.** Runs `npx openknowledge init` in a fresh directory. No pre-existing git repo. Expects: version history works without them ever seeing git terminology (PQ5 Locked); "Save Version" and the timeline panel are the only version-history surfaces.

- **P3: AI agent with MCP filesystem tools.** Reads and writes MDX files via openknowledge's MCP server. Expects: stable file state between read and write within a single tool call; explicit error when the underlying state changed concurrently (future — NG6); no silent merge that invalidates its pre-write assumptions. For this spec, agents are treated as one more external writer.

- **P4: External editor user.** Edits the same MDX files via VS Code, vim, emacs, Cursor, Zed, or any filesystem editor that writes through disk. Expects: their saves appear in the browser editor within seconds; their saves are never silently lost by our background save; a visible-to-them signal when openknowledge cannot merge their edits with in-flight browser edits.

## 5) User journeys

### P1: Fumadocs user runs `git pull` during normal editing (happy path)

1. User is editing `content/docs/intro.mdx` in the openknowledge browser editor. They've typed 3 paragraphs in the last minute, one save has flushed (L1 wrote to disk, L2 WIP commit captured it in shadow).
2. User switches to a terminal and runs `git pull origin main`. Upstream has changes to 20 files, including edits to different sections of `intro.mdx` (non-overlapping with what the user just typed).
3. Openknowledge's `.git/HEAD` watcher sees HEAD move. It enters a **pull-in-progress** state: dispatches `BatchBegin`, immediately flushes any pending L1 write (short-circuits the 2s debounce), suspends new L1 writes.
4. Git completes the merge. All 20 file updates land in the working tree. `.git/index.lock` disappears. The HEAD watcher waits 100ms for quiet, then dispatches `BatchEnd`.
5. Inside `BatchEnd`: for each affected content file, look up whether a Y.Doc is open. For `intro.mdx`, yes. Run `threeWayMerge(reconciledBase, ours, theirs)` where `ours` is the current Y.Doc state and `theirs` is the post-pull disk content. Non-overlapping blocks merge automatically. Apply the result to the Y.Doc via a `skipStoreHooks` `updateYFragment` transaction. Update `reconciledBase[intro.mdx] = theirs`.
6. Shadow repo commits an **upstream-import** commit with author `upstream <noreply@openknowledge.local>`, parented on the previous shadow HEAD, with tree = post-pull content tree. Message: `upstream: import from <sha1>..<sha2>`.
7. User sees their paragraphs intact, upstream's new section appears above theirs, editor remains responsive. Presence bar shows no interruption. No modal. The next WIP commit from the user's edits parents on the upstream-import commit, so shadow blame correctly attributes upstream's diff to `upstream` and the user's diff to the user.

**Aha moment:** "I just pulled a bunch of changes and openknowledge merged them into my draft paragraphs without losing anything."

### P1: Fumadocs user runs `git pull` that produces a conflict (sad path → resolution mode)

1. User has committed a change to `intro.mdx` on their local `main` (outside openknowledge, via terminal git). Upstream also changed the same paragraph.
2. User runs `git pull origin main`. Git fails to auto-merge and writes conflict markers into `intro.mdx`.
3. `.git/HEAD` watcher sees HEAD *not* move (merge is in progress, not committed). `.git/MERGE_HEAD` appears. Openknowledge detects merge-in-progress and dispatches `BatchBegin` with `conflict: true`.
4. File-watcher fires for `intro.mdx`. Reconciliation reads the file and detects conflict markers via regex (`^<{7} |^={7}$|^>{7} `). It **refuses to parse** the content into the Y.Doc.
5. Openknowledge enters **resolution mode** for `intro.mdx`: the editor becomes read-only with a banner — "This file has a git merge conflict. Resolve it in your normal tool (VS Code, terminal), then click 'Re-engage'." The banner shows the three-way diff (base = shadow's last known content, ours = user's local commit, theirs = upstream).
6. User resolves the conflict in VS Code, runs `git add intro.mdx && git commit`. `.git/MERGE_HEAD` disappears, HEAD moves.
7. HEAD watcher sees this, dispatches `BatchEnd`. Reconciliation re-reads `intro.mdx`, finds no conflict markers, runs three-way merge against the Y.Doc (which is clean because the editor was read-only during the conflict). Y.Doc matches disk. Banner dismisses. Editor returns to edit mode.
8. Shadow repo records two commits: one `upstream-import` capturing the pull, one `user-resolved-conflict` attributed to the user capturing the resolution.

**Aha moment:** "Openknowledge got out of my way during the conflict and cleanly came back when I was done."

### P1: Fumadocs user runs `git checkout` to switch branches

1. User is editing `intro.mdx`, 4 seconds of unsaved Y.Doc state, open in browser.
2. User runs `git checkout feature-xyz` in terminal. Git changes working-tree files (potentially many).
3. HEAD watcher sees HEAD move. `BatchBegin` dispatches. Pending L1 writes flush to the current-branch tree first.
4. **Decision point (see §9.6):** does openknowledge follow the branch switch, or hold the user on their prior branch? We default to **follow**: the editor's view of the world tracks what `cat` would show. Drafts live in the shadow repo; branch switches in the host repo are treated as "external world changed."
5. Git completes the checkout. `BatchEnd` dispatches. Every open Y.Doc reconciles against the new disk content. Non-overlapping in-flight edits survive. Overlapping edits surface as conflicts. Files that existed only on the old branch are tombstoned (see P4 journey).
6. Shadow repo commits an `upstream-import` labeled "host checkout to branch `feature-xyz`" for attribution clarity.

**Open question (see §11 Q3):** follow-branch-switch vs hold-user is a defensible choice either way. Default is follow; a settings toggle may surface this later.

### P4: External editor user saves a file via VS Code while openknowledge is editing it

1. User A is editing `intro.mdx` in the openknowledge browser. User B (same person, different surface) saves `intro.mdx` from VS Code with a new paragraph added at the bottom.
2. File-watcher fires a single `Update` event. Hash differs from `writeTracker` (not our self-write). Reconciliation runs.
3. `ours = current Y.Doc state` (with User A's in-flight edits). `theirs = new disk content` (with User B's new paragraph). `base = reconciledBase[intro.mdx]` (the content at the last sync).
4. Three-way merge: User A's edits are non-overlapping with User B's new paragraph → clean merge. Y.Doc gets both. `updateYFragment` applies the merged state. `reconciledBase` updates.
5. Browser editor shows User A's in-flight paragraphs and User B's new paragraph. No interruption.

### P1: File is deleted upstream during a `git pull`

1. User has `content/docs/deprecated.mdx` open in the browser editor. They're *not* actively editing it (Y.Doc is clean, matches `reconciledBase`).
2. User runs `git pull`. Upstream deleted `deprecated.mdx`.
3. HEAD watcher → `BatchBegin`. File-watcher fires `Delete` for `deprecated.mdx`.
4. Reconciliation: Y.Doc is clean, so tombstone without rescue. Broadcast to connected clients via `Y.Map('lifecycle')` side-channel: `{ docName, event: 'deleted-upstream' }`. Editor shows a banner: "This file was deleted upstream. Close tab?"
5. If Y.Doc had been dirty, the banner would include a "Save as rescue copy" button exposing a buffer via HTTP endpoint, so the user can recover unsaved work before closing.

### P2: Standalone-KB user — no host repo (reconciliation degenerates gracefully)

1. User runs `npx openknowledge init` in an empty directory. No parent `.git`. Openknowledge creates `.openknowledge/history.git` as the shadow bare repo anyway.
2. They edit files via the browser. L1 persistence writes `.md` files. L2 persistence commits to `refs/wip/main` in the shadow.
3. External writers (vim, another editor) trigger the same reconciliation protocol. `.git/HEAD` watcher is absent (no parent repo), so reconciliation processes events individually rather than batched — a graceful degradation.
4. User never sees `.openknowledge/` in their editor, never touches git.

### Interaction state matrix

| Y.Doc state | External event | Reconciliation action | User-visible result |
|---|---|---|---|
| Clean | Update (non-overlapping) | 2-way apply via `updateYFragment` | Editor content updates smoothly |
| Clean | Update (overlapping) | 2-way apply via `updateYFragment` | Editor content updates smoothly (no conflict possible when Y.Doc is clean) |
| Dirty, non-overlap | Update | 3-way merge, auto-resolve | Both changes appear in editor |
| Dirty, overlap | Update | 3-way merge, block-level conflict | Conflict badge on affected block, user picks resolution |
| Any | Delete | Tombstone Y.Doc, rescue buffer if dirty | Banner: "File deleted upstream" |
| Any | Rename (detected as pair) | Migrate Y.Doc to new name | Tab URL updates, no interruption |
| Any | File contains conflict markers | Enter resolution mode | Read-only banner, three-way diff panel |
| Any | `.git/HEAD` moves (BatchBegin) | Suspend L1/L2 writes, flush pending | No visible change until BatchEnd |
| Any | BatchEnd after HEAD moved | Reconcile all affected docs, emit upstream-import commit | Editor re-engages, attribution clean in shadow |

## 6) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| Must | FR1 | Shadow bare repo at `.openknowledge/history.git` | `npx openknowledge init` creates `.openknowledge/history.git` as a bare repo with `core.worktree` pointing at the parent project root. The host repo's `.git/` is not modified. | Creates `.openknowledge/` and adds it to the host's `.gitignore` if a host repo exists |
| Must | FR2 | All WIP refs live in the shadow repo | `simpleGit` in `persistence.ts` is parameterized over `gitDir`. Default is `.openknowledge/history.git`. `refs/wip/<writer-id>` is written via `--git-dir=<shadow> --work-tree=<parent>`. | Per-writer refs replace the single `refs/wip/main` ref |
| Must | FR3 | Per-document `reconciledBase` map | `Map<string, string>` keyed by document name, value is the last-known byte-identical string between Y.Doc and disk. Updated on `onLoadDocument`, on successful `onStoreDocument`, and on every successful reconciliation. | Resides in `persistence.ts` or a new `reconciliation.ts` module |
| Must | FR4 | Three-way merge is the only sync primitive for disk → Y.Doc | `handleExternalChange` calls `reconcile(base, ours, theirs)`. When `ours === base` (clean), degenerates to `updateYFragment(theirs)`. When both differ, calls `threeWayMerge` from `three-way-merge.ts` with block-level granularity. | Block granularity is paragraph/heading/code-fence per the existing module |
| Must | FR5 | Overlapping conflicts surface via `Y.Map('conflicts')` | When `threeWayMerge` reports `conflicts.length > 0`, each conflict is written to `Y.Map('conflicts')` with `{ blockIndex, base, ours, theirs, resolution: 'pending' }`. Clients observe this map and render a conflict badge inline. | Mirrors `Y.Map('activity')` pattern from the presence spec |
| Must | FR6 | `DiskEvent` taxonomy replaces raw watcher events | `file-watcher.ts` emits `DiskEvent` unions: `Create`, `Update`, `Delete`, `Rename`, `Conflict`, `BatchBegin`, `BatchEnd`. Rename pairs are detected by hash-matching delete+create within 200ms. | `BatchBegin/End` come from the HEAD watcher, not parcel-watcher |
| Must | FR7 | Deletes tombstone open docs | On `Delete` for an open Y.Doc: if clean, unload + broadcast `lifecycle: deleted-upstream`; if dirty, expose rescue buffer via HTTP `GET /api/rescue/:docName` and broadcast before unloading. | "Ignore delete" branch in `file-watcher.ts:74-77` is removed |
| Must | FR8 | Renames migrate Y.Doc state | On `Rename(oldPath, newPath)`: migrate the Hocuspocus document entry key, update `frontmatterCache`, update `reconciledBase`, update `writeTracker`, broadcast `lifecycle: renamed` to connected clients with the new path. | Connected clients reload with the new doc name |
| Must | FR9 | Conflict-marker files trigger resolution mode | Before parsing a file as markdown, check for lines matching `^<{7} |^={7}$|^>{7} `. If found, refuse to update the Y.Doc; broadcast `lifecycle: conflict` with `{ ours, theirs, base }` for the UI. | Editor becomes read-only for affected docs |
| Must | FR10 | `.git/HEAD` watcher on the parent repo | A second `@parcel/watcher` subscription on the parent's `.git/` directory, filtered to `HEAD`, `ORIG_HEAD`, `MERGE_HEAD`, `index.lock`. Emits `BatchBegin` on any movement and `BatchEnd` after a 100ms quiet window. | Only active when a parent `.git` exists |
| Must | FR11 | L1 + L2 writes suspended during `BatchBegin..BatchEnd` | `onStoreDocument` and `scheduleGitCommit` short-circuit while `batchInProgress === true`. Pending writes are flushed *before* `BatchBegin` is fully dispatched (to preserve user state from the last quiet window). | Prevents mid-pull race condition |
| Must | FR12 | Upstream-import commits in shadow repo | After a `BatchEnd` where HEAD actually moved, the shadow repo commits the new content tree with author `upstream <noreply@openknowledge.local>`, parented on the previous shadow HEAD, message `upstream: import from <old-sha>..<new-sha>`. | Only fires if the batch involved HEAD movement, not just file-watcher bursts |
| Must | FR13 | Per-writer WIP refs | Each identity (human session, agent, upstream) writes to `refs/wip/<writer-id>` in the shadow repo. Commits are written with author/committer matching the writer identity. Checkpoint (future: "Save Version") squash-merges all WIP refs into `refs/heads/main` with co-authored-by trailers. | Writer IDs: `human-<hash>`, `agent-<agent-id>`, `upstream` |
| Must | FR14 | `.openknowledge/` in host `.gitignore` at init | `npx openknowledge init` appends `.openknowledge/` to the host's `.gitignore` if one exists, or creates it if not. Idempotent. | Only when a host repo is detected |
| Must | FR15 | Reconciliation works in standalone mode | Absence of a parent `.git/` is a graceful degradation. HEAD watcher is skipped. File-watcher events process individually without `BatchBegin/End` wrapping. All other invariants (base tracking, three-way merge, lifecycle events) apply identically. | Standalone users get the same protocol minus host awareness |
| Must | FR16 | Parameterize content root | `CONTENT_DIR` in `persistence.ts` (currently hardcoded to `../../content` at line 25) becomes a config option resolved at init. Fumadocs users point at `content/docs/`; Mintlify at `docs/`; standalone users at whatever they pick. | Enables integrated mode at all |
| Should | FR17 | Rescue buffer retention | Rescue buffers from tombstoned-with-dirty docs persist for 24h in `.openknowledge/rescue/<doc-name>.md`. Indexed in a list endpoint `GET /api/rescue` for recovery UX. | Prevents data loss when user doesn't act immediately |
| Should | FR18 | `BatchEnd` timeout cap | If `BatchEnd` hasn't fired within 30s of `BatchBegin` (stuck merge, stalled rebase), emit a warning log and cap the batch. Reconciliation resumes with whatever disk state is current. | Prevents indefinite suspension of saves |
| Could | FR19 | Host-pull marker UI | When a `BatchEnd` involves HEAD movement, briefly flash the presence bar with a "Synced with upstream" indicator. | Pure UI polish |
| Must | FR20 | All file paths resolve under the content root | `safeContentPath` (already present at `persistence.ts:36-42`) validates every resolved path starts with `CONTENT_DIR`. Non-content files outside the root are ignored entirely. | Security boundary — prevents path-traversal attacks via crafted filenames |

### Non-functional requirements

- **Performance:** Three-way merge must complete in < 50ms for files up to 10KB of markdown. `BatchEnd` reconciliation of 50 open docs must complete in < 500ms. File-watcher event processing (single event) < 20ms p95.
- **Reliability:** `reconciledBase` is source-of-truth; if it diverges from reality, reconciliation must self-repair on next `onLoadDocument` by reinitializing base from disk. No state is persisted in-memory that can't be reconstructed from disk.
- **Data safety:** No code path may lose a user's in-flight edits without surfacing them. If three-way merge fails with an exception, the Y.Doc is unchanged and an error is logged. If the shadow repo write fails, disk state is unchanged and a retry is scheduled.
- **Security:** All file paths go through `safeContentPath`. The shadow repo directory is quarantined — nothing outside `.openknowledge/` is written by openknowledge's git operations. No host git config, hooks, or credentials are read or modified.
- **Observability:** Structured logs for every reconciliation pass (`[reconcile] ${docName} base=<hash> ours=<hash> theirs=<hash> result=<clean|merged|conflict|refused>`). Counter metrics for `BatchBegin/End` invocations, conflict incidents, rescue-buffer creations.
- **Portability:** Works on macOS and Linux in v1. Windows support is NG11. WSL counts as Linux.
- **Operability:** The reconciliation layer must be toggleable via env var (`OPENKNOWLEDGE_RECONCILIATION=legacy|strict`) for rollback to the current 2-way-apply behavior if a critical bug is found. Legacy mode replicates current spike behavior for compatibility testing.

## 7) Success metrics & instrumentation

- **M1: Zero silent data loss on `git pull`.** A Playwright E2E test that starts with in-flight edits, runs `git pull` against a controlled remote with non-overlapping changes, and asserts that every user keystroke is preserved in the Y.Doc. Target: 100% pass over 100 runs.
- **M2: Host repo unchanged after a session.** Fresh host repo → install openknowledge → edit for 10 minutes → uninstall (rm -rf `.openknowledge/`) → `git status && git log --all && ls .git/refs`. Assert: no new refs, no new objects reachable only through deleted refs, no config changes.
- **M3: Attribution faithfulness in shadow repo.** A 3-writer scenario (human, agent, upstream pull) produces a shadow history where `git log refs/wip/<writer>` for each writer shows only their own changes. Upstream imports are not misattributed. Measured via test scenario.
- **M4: Reconciliation latency.** p95 time from `BatchEnd` dispatch to Y.Doc update visible in browser. Target: < 300ms for 10 affected docs.
- **M5: Conflict resolution round-trip.** Simulated conflict → resolution mode banner → external resolution → editor re-engages. Measured: did the user lose any state? Target: 0 state loss across 20 test scenarios.
- **Instrumentation:** `console.log('[reconcile] ...', { docName, basehash, ourshash, theirshash, conflicts, outcome })` for every reconciliation pass. `[batch] begin ...` / `[batch] end ... (N docs reconciled)` for batch boundaries. Counters exposed via `GET /api/metrics/reconciliation`.

## 8) Current state (how it works today)

- **`init_spike/src/server/persistence.ts`** implements L1+L2 as validated in TQ20: `onLoadDocument` reads markdown → parses → `updateYFragment`; `onStoreDocument` serializes Y.Doc → markdown → atomic temp+rename write → `scheduleGitCommit()` with 30s debounce. Git commits go to `refs/wip/main` in the enclosing repo (line 85), using `GIT_INDEX_FILE=.git/index-wip` for staging isolation (line 52).
- **`init_spike/src/server/file-watcher.ts`** subscribes to `@parcel/watcher` on `CONTENT_DIR`. Maintains a `writeTracker` for self-write detection via content hash. Calls `onExternalChange(docName, content)` for each external event. **Explicitly ignores `delete` events** (line 74-77).
- **`init_spike/src/server/hocuspocus-plugin.ts:418-449`** implements `handleExternalChange` as **Strategy C**: only syncs open docs. Applies changes via `document.transact(..., { skipStoreHooks: true })` wrapping a direct `updateYFragment` call. No three-way merge, no merge base.
- **`init_spike/src/editor/three-way-merge.ts`** implements block-level three-way merge with conflict detection. Resolution defaults to `'user-wins'`. **Only used for the source-mode toggle-back path, not for the disk bridge.**
- **Content root is hardcoded** to `resolve(import.meta.dirname, '../../content')` at `persistence.ts:25`.
- **No shadow repo.** Commits go to the enclosing repo's `.git/`.
- **No HEAD watcher.** The spike has no awareness of parent-repo git operations.
- **No lifecycle event taxonomy.** File-watcher delivers raw parcel events.
- **No rescue buffer.** Dirty Y.Docs for deleted files silently persist.
- **No conflict-marker detection.** Files with `<<<<<<<` markers parse as markdown.

Every code path named in §6's Must requirements either doesn't exist or does the wrong thing under the integrated-mode scenarios described in §1.

## 9) Proposed solution (vertical slice)

### 9.1 Architecture overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                       Parent project root                              │
│                                                                        │
│   .git/                       ← HOST repo — NEVER TOUCHED              │
│   .openknowledge/                                                      │
│     history.git/  (bare)      ← SHADOW repo                            │
│       refs/wip/human-<id>                                              │
│       refs/wip/agent-<id>                                              │
│       refs/wip/upstream                                                │
│       refs/heads/main                                                  │
│       refs/drafts/<name>                                               │
│     rescue/<docName>.md       ← dirty-doc rescue buffers               │
│   .gitignore                  ← host — contains `.openknowledge/`      │
│   content/docs/*.mdx          ← the actual knowledge files             │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                 │                              ▲
                 │ file-watcher                 │ L1: onStoreDocument
                 │ (@parcel/watcher)            │ writes markdown
                 ▼                              │
┌────────────────────────────────────────────────────────────────────────┐
│                       Reconciliation Layer (new)                       │
│                                                                        │
│   DiskEvent taxonomy:                                                  │
│     Create | Update | Delete | Rename | Conflict | BatchBegin/End     │
│                                                                        │
│   Per-doc state:                                                       │
│     reconciledBase: Map<docName, string>                               │
│                                                                        │
│   Primitives:                                                          │
│     reconcile(base, ours, theirs) → result | conflict                  │
│     tombstone(docName) → rescue buffer if dirty                        │
│     rename(oldName, newName) → migrate Y.Doc                           │
│     enterResolutionMode(docName, base, ours, theirs)                   │
│     applyUpstreamImport(shadowRepo, newTreeSha)                        │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                 │                              ▲
                 ▼                              │
┌────────────────────────────────────────────────────────────────────────┐
│                       Hocuspocus Server (existing)                     │
│   Y.Doc memory  ←  HocuspocusProvider  ←  Browser clients             │
│     ├─ XmlFragment('default')                                          │
│     ├─ Text('source')                                                  │
│     ├─ Map('metadata')                                                 │
│     ├─ Map('activity')      ← (presence spec)                          │
│     ├─ Map('conflicts')     ← NEW: per-block conflict entries          │
│     └─ Map('lifecycle')     ← NEW: deleted/renamed/conflict signals    │
└────────────────────────────────────────────────────────────────────────┘
                 ▲
                 │ HEAD watcher (new)
                 │ watches parent's .git/HEAD, MERGE_HEAD, index.lock
                 │
                 └─── emits BatchBegin/BatchEnd
```

### 9.2 Shadow repo layout and parameterization

**Init (`npx openknowledge init`):**

```typescript
async function initShadowRepo(projectRoot: string): Promise<ShadowRepoHandle> {
  const shadowDir = resolve(projectRoot, '.openknowledge/history.git');
  if (!existsSync(shadowDir)) {
    await mkdir(resolve(projectRoot, '.openknowledge'), { recursive: true });
    // Initialize as bare repo with work-tree pointing at parent
    const git = simpleGit({ baseDir: projectRoot });
    await git.raw('--git-dir=' + shadowDir, 'init', '--bare');
    await git.raw('--git-dir=' + shadowDir, 'config', 'core.worktree', projectRoot);
    await git.raw('--git-dir=' + shadowDir, 'config', 'user.name', 'openknowledge');
    await git.raw('--git-dir=' + shadowDir, 'config', 'user.email', 'noreply@openknowledge.local');
  }
  // Add .openknowledge/ to host .gitignore if host repo exists
  const hostGitDir = resolve(projectRoot, '.git');
  if (existsSync(hostGitDir)) {
    await ensureGitignoreEntry(projectRoot, '.openknowledge/');
  }
  return { gitDir: shadowDir, workTree: projectRoot };
}
```

**Parameterize `persistence.ts`:** Replace `const git = simpleGit(PROJECT_DIR, ...)` with a module-level handle constructed via `createPersistenceExtension({ shadowRepo, contentRoot })`. The L2 `commitToWipRef` function becomes `commitToWipRef({ gitDir, workTree, writerId })`, using `--git-dir` + `--work-tree` flags on every `git.raw()` call. `GIT_INDEX_FILE` becomes `<shadowDir>/index-wip` — still isolated, still scoped to the shadow.

**Content root parameterization:** `CONTENT_DIR` moves out of a module constant into the init config. A new `.openknowledge/config.json` holds `{ contentRoot: "content/docs", writerName: "Nick" }`. `safeContentPath` reads from this config.

### 9.3 Reconciliation module (new)

Create `init_spike/src/server/reconciliation.ts`:

```typescript
export interface ReconcileInput {
  docName: string;
  base: string;                        // reconciledBase[docName]
  ours: string;                        // current Y.Doc serialized to markdown
  theirs: string;                      // new disk content
}

export type ReconcileOutcome =
  | { kind: 'clean'; newContent: string }          // Y.Doc was clean, apply theirs
  | { kind: 'merged'; newContent: string }         // 3-way succeeded, no conflicts
  | { kind: 'conflicts'; newContent: string; conflicts: BlockConflict[] }
  | { kind: 'refused'; reason: 'conflict-markers' | 'parse-failure' }
  | { kind: 'noop' };                              // theirs === base, nothing to do

export function reconcile(input: ReconcileInput): ReconcileOutcome {
  if (containsConflictMarkers(input.theirs)) {
    return { kind: 'refused', reason: 'conflict-markers' };
  }
  if (input.theirs === input.base) {
    return { kind: 'noop' };
  }
  if (input.ours === input.base) {
    // Y.Doc is clean — degenerate to 2-way apply
    return { kind: 'clean', newContent: input.theirs };
  }
  // Real 3-way merge
  const result = blockLevelThreeWayMerge(input.base, input.ours, input.theirs);
  if (result.conflicts.length > 0) {
    return { kind: 'conflicts', newContent: result.merged, conflicts: result.conflicts };
  }
  return { kind: 'merged', newContent: result.merged };
}

function containsConflictMarkers(content: string): boolean {
  // Check for git conflict markers at line starts
  return /^<{7} |^={7}$|^>{7} /m.test(content);
}
```

`blockLevelThreeWayMerge` wraps the existing `three-way-merge.ts` primitives (`splitMarkdownBlocks` + its diff3 logic) with a new entry point that accepts three markdown strings and returns a merged string + conflict list. The existing module operates on Y.XmlFragment directly for the source-toggle case; the new entry point works at the markdown level for the disk-bridge case.

### 9.4 Wire reconciliation into `handleExternalChange`

Replace `hocuspocus-plugin.ts:418-449` with:

```typescript
async function handleExternalChange(event: DiskEvent): Promise<void> {
  switch (event.kind) {
    case 'Delete':  return handleDelete(event.path);
    case 'Rename':  return handleRename(event.oldPath, event.newPath);
    case 'Create':  return; // no-op; onLoadDocument will hydrate on first open
    case 'Update':  return handleUpdate(event.path, event.content);
  }
}

async function handleUpdate(path: string, content: string): Promise<void> {
  const docName = pathToDocName(path, CONTENT_DIR);
  const document = hocuspocus.documents.get(docName);
  if (!document) {
    // Closed doc — just update the base cache for next open
    reconciledBase.set(docName, content);
    return;
  }

  const base = reconciledBase.get(docName) ?? content;
  const ours = serializeYDocToMarkdown(document);

  const outcome = reconcile({ docName, base, ours, theirs: content });

  switch (outcome.kind) {
    case 'noop':
      return;
    case 'refused':
      return enterResolutionMode(document, base, ours, content);
    case 'clean':
    case 'merged':
      applyMarkdownToYDoc(document, outcome.newContent);
      reconciledBase.set(docName, outcome.newContent);
      return;
    case 'conflicts':
      applyMarkdownToYDoc(document, outcome.newContent);
      publishConflicts(document, outcome.conflicts);
      reconciledBase.set(docName, outcome.newContent);
      return;
  }
}

function applyMarkdownToYDoc(document: Y.Doc, markdown: string): void {
  const { body } = stripFrontmatter(markdown);
  const json = mdManager.parse(body);
  const pmNode = schema.nodeFromJSON(json);
  const xmlFragment = document.getXmlFragment('default');
  document.transact(
    () => {
      updateYFragment(document, xmlFragment, pmNode, { mapping: new Map(), isOMark: new Map() });
    },
    { source: 'local', skipStoreHooks: true, context: { origin: 'reconciliation' } }
      satisfies LocalTransactionOrigin,
  );
}
```

### 9.5 HEAD watcher and batching

Create `init_spike/src/server/head-watcher.ts`:

```typescript
export async function startHeadWatcher(
  parentGitDir: string,
  onBatchBegin: (reason: BatchReason) => void,
  onBatchEnd: (info: BatchEndInfo) => void,
): Promise<AsyncSubscription> {
  let batchInProgress = false;
  let lastHeadSha: string | null = null;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;

  const resolveHead = () => {
    try { return readFileSync(resolve(parentGitDir, 'HEAD'), 'utf-8').trim(); }
    catch { return null; }
  };
  lastHeadSha = resolveHead();

  return subscribe(parentGitDir, (err, events) => {
    if (err) return;
    for (const e of events) {
      const base = basename(e.path);
      if (base === 'HEAD' || base === 'MERGE_HEAD' || base === 'ORIG_HEAD' || base === 'index.lock') {
        if (!batchInProgress) {
          batchInProgress = true;
          onBatchBegin({ trigger: base });
        }
        // Debounced BatchEnd after 100ms of quiet
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(() => {
          const newHead = resolveHead();
          const headMoved = newHead !== null && newHead !== lastHeadSha;
          onBatchEnd({ headMoved, oldHead: lastHeadSha, newHead });
          lastHeadSha = newHead;
          batchInProgress = false;
        }, 100);
      }
    }
  }, { ignore: ['objects/**', 'logs/**'] });
}
```

And in the persistence extension, a `batchInProgress` flag gates L1 + L2 writes:

```typescript
let batchInProgress = false;
let pendingFlushBeforeBatch: Promise<void> | null = null;

async function onBatchBegin() {
  // Flush any pending writes from BEFORE the batch began
  if (gitCommitTimer) { clearTimeout(gitCommitTimer); gitCommitTimer = null; }
  pendingFlushBeforeBatch = flushAllPendingL1Writes();
  await pendingFlushBeforeBatch;
  batchInProgress = true;
}

async function onBatchEnd({ headMoved, oldHead, newHead }: BatchEndInfo) {
  batchInProgress = false;
  // Reconcile all affected docs in one atomic pass
  const events = drainBufferedFileEvents();
  for (const ev of events) await handleExternalChange(ev);
  // If HEAD actually moved, emit upstream-import commit
  if (headMoved) {
    await commitUpstreamImport(oldHead, newHead);
  }
}

// In onStoreDocument:
async onStoreDocument(...) {
  if (batchInProgress) return; // skip — reconciliation will re-evaluate at BatchEnd
  // ... existing L1 write logic ...
}
```

### 9.6 Upstream-import commits in shadow repo

```typescript
async function commitUpstreamImport(oldHead: string | null, newHead: string): Promise<void> {
  const env = { GIT_INDEX_FILE: resolve(shadowDir, 'index-import') };
  const git = shadowGit();
  try {
    // Seed index from current shadow HEAD
    const shadowHead = await safeRevParse('refs/wip/upstream');
    if (shadowHead) {
      const headTree = (await git.raw('rev-parse', `${shadowHead}^{tree}`)).trim();
      await git.env(env).raw('read-tree', headTree);
    }
    // Stage the current content directory (now reflects post-pull state)
    await git.env(env).raw('add', contentRoot);
    const treeSha = (await git.env(env).raw('write-tree')).trim();
    const parentSha = shadowHead;
    const message = oldHead
      ? `upstream: import from ${oldHead.slice(0, 8)}..${newHead.slice(0, 8)}`
      : `upstream: initial import at ${newHead.slice(0, 8)}`;
    const args = ['commit-tree', treeSha, '-m', message];
    if (parentSha) args.push('-p', parentSha);
    // Author = upstream, committer = openknowledge (for audit)
    const authorEnv = {
      ...env,
      GIT_AUTHOR_NAME: 'upstream',
      GIT_AUTHOR_EMAIL: 'noreply@openknowledge.local',
      GIT_COMMITTER_NAME: 'openknowledge',
      GIT_COMMITTER_EMAIL: 'noreply@openknowledge.local',
    };
    const commitSha = (await git.env(authorEnv).raw(...args)).trim();
    await git.raw('update-ref', 'refs/wip/upstream', commitSha);
  } finally {
    try { unlinkSync(resolve(shadowDir, 'index-import')); } catch {}
  }
}
```

### 9.7 Per-writer WIP refs

Writer identity is derived from the transaction origin that caused the L1 write:
- User edits via browser client → writer = `human-<session-hash>` (where session hash is the stable identity from `presence/identity.ts`)
- Agent writes via DirectConnection → writer = `agent-<agent-id>` (from the DC session)
- File-watcher imports → writer = `upstream` (handled by `commitUpstreamImport`)

`onStoreDocument` inspects the document's last `transaction.origin` (or a side-channel map of writer identity per doc, if origin is ambiguous) and routes the L2 commit to `refs/wip/<writer-id>` instead of a single `refs/wip/main`. The shadow repo grows a small number of refs over time (one per active writer), which is fine.

**Checkpoint** ("Save Version", future work) is a squash-merge of `refs/wip/human-* refs/wip/agent-*` into `refs/heads/main` with co-authored-by trailers preserving attribution. Upstream-import commits are *not* merged — they already sit on `refs/heads/main`'s parent chain via the parent-awareness protocol.

### 9.8 Lifecycle event module

Extend `file-watcher.ts`:

```typescript
export type DiskEvent =
  | { kind: 'Create'; path: string; content: string }
  | { kind: 'Update'; path: string; content: string }
  | { kind: 'Delete'; path: string }
  | { kind: 'Rename'; oldPath: string; newPath: string; content: string }
  | { kind: 'Conflict'; path: string };

// Rename detection: buffer delete events for 200ms, pair with creates
// that have a matching last-known hash
const pendingDeletes = new Map<string, { hash: string; timer: NodeJS.Timeout }>();

function handleParcelEvent(event: ParcelEvent): DiskEvent[] {
  if (event.type === 'delete') {
    const lastHash = lastKnownHash.get(event.path);
    if (lastHash) {
      return new Promise(resolve => {
        const timer = setTimeout(() => {
          pendingDeletes.delete(event.path);
          resolve([{ kind: 'Delete', path: event.path }]);
        }, 200);
        pendingDeletes.set(lastHash, { hash: lastHash, timer });
      });
    }
    return [{ kind: 'Delete', path: event.path }];
  }
  if (event.type === 'create') {
    const content = readFileSync(event.path, 'utf-8');
    const hash = contentHash(content);
    // Check for matching pending delete (rename)
    const pending = pendingDeletes.get(hash);
    if (pending) {
      clearTimeout(pending.timer);
      pendingDeletes.delete(hash);
      return [{ kind: 'Rename', oldPath: pending.path, newPath: event.path, content }];
    }
    return [{ kind: 'Create', path: event.path, content }];
  }
  if (event.type === 'update') {
    const content = readFileSync(event.path, 'utf-8');
    if (containsConflictMarkers(content)) {
      return [{ kind: 'Conflict', path: event.path }];
    }
    return [{ kind: 'Update', path: event.path, content }];
  }
  return [];
}
```

### 9.9 Affected routes / pages / files

| File | Change |
|---|---|
| `init_spike/src/server/persistence.ts` | Parameterize `gitDir`, `contentRoot`, writer identity. Add `reconciledBase` map. Gate writes on `batchInProgress`. |
| `init_spike/src/server/file-watcher.ts` | Emit `DiskEvent` taxonomy. Remove "ignore delete" branch. Add rename detection. |
| `init_spike/src/server/hocuspocus-plugin.ts:418-449` | Replace `handleExternalChange` with the reconciliation-aware version. Wire `Y.Map('conflicts')` and `Y.Map('lifecycle')`. |
| `init_spike/src/server/reconciliation.ts` | **New**. `reconcile()` primitive, conflict-marker detection, rescue buffer management. |
| `init_spike/src/server/head-watcher.ts` | **New**. Parent `.git/HEAD` subscription, `BatchBegin`/`BatchEnd` dispatch. |
| `init_spike/src/server/shadow-repo.ts` | **New**. `initShadowRepo`, `commitUpstreamImport`, per-writer ref management. |
| `init_spike/src/editor/three-way-merge.ts` | Add markdown-level `blockLevelThreeWayMerge(base, ours, theirs)` entry point alongside existing Y.XmlFragment one. |
| `init_spike/src/App.tsx` (or new component) | Conflict banner UI reading from `Y.Map('conflicts')`; lifecycle banner reading from `Y.Map('lifecycle')`. |
| `.openknowledge/config.json` | **New**. Runtime config for content root + writer identity. |
| `bin/init.ts` | **New (or extension of existing init)**. Creates shadow repo, writes `.gitignore`, writes config. |

### 9.10 Data flow — happy-path `git pull`

```
User terminal: git pull origin main
    ↓
.git/HEAD → .git/index.lock appears
    ↓
head-watcher detects index.lock → emits BatchBegin
    ↓
persistence.ts: batchInProgress = true
  - clearTimeout(gitCommitTimer)
  - flushAllPendingL1Writes() — last 2s of user edits flush NOW
    ↓
Git merge completes → working tree files updated
  - .git/index.lock disappears
  - .git/HEAD moves to new commit
    ↓
parcel-watcher fires N Update events for content files
  - Buffered while batchInProgress is true
    ↓
head-watcher: 100ms of quiet → BatchEnd with headMoved: true
    ↓
persistence.ts: batchInProgress = false
  - drainBufferedFileEvents() — process N buffered events
  - for each: handleUpdate → reconcile() → three-way merge
    - clean docs: apply theirs
    - dirty docs: 3-way merge, surface conflicts if any
  - commitUpstreamImport(oldHead, newHead) writes refs/wip/upstream
    ↓
Browser clients observe Y.Doc updates via HocuspocusProvider
    ↓
(If any conflicts) Y.Map('conflicts') observer fires → conflict banner UI
```

### 9.11 Alternatives considered (cut)

See `evidence/design-reasoning.md` for the full four-candidate comparison. Summary:

- **Candidate B — git-native with namespaced refs in host repo** (cut, NG1). Trades elegance for composability failure: host pollution, `git push --mirror` footgun, inability to do per-op attribution within batch commits, no clean uninstall.
- **Candidate C — CRDT-canonical with disk as projection** (cut, NG2). Internally inconsistent with the spike's actual behavior (Y.Doc is never persisted), violates CC7 file-portability, forces a "files are stale projections" mental model that breaks user expectations.
- **Candidate D — event-sourced log as source of truth** (cut). Theoretically cleanest but doesn't eliminate the reconciliation problem (external writes still have to be imported as events), requires abandoning git tooling, and has no ecosystem support.
- **Candidate A** (chosen). Disk-canonical + session CRDT + isolated shadow repo + three-way merge + lifecycle events + parent-awareness. Satisfies every axiom and enables local reasoning about correctness.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Shadow bare repo at `.openknowledge/history.git` is the history layer | T | LOCKED | No | Only architecture that keeps host `.git/` untouched while preserving per-op attribution. Clean uninstall = rm -rf `.openknowledge/`. | See `evidence/design-reasoning.md` §Candidate comparison | Resolves STORIES.md #6 with a fifth option |
| D2 | Disk is the source of truth; Y.Doc is a session cache | T | LOCKED | Yes | Matches CC6 (files are canonical) + CC7 (portability) + spike's actual behavior (no Y.Doc persistence). Any alternative requires a new persistence layer and conflicts with file-portability. | `persistence.ts:150-219` — hydration is `markdown → PM → Y.Doc`, no binary | Y.Doc can always be reconstructed from disk; crash recovery is the 2–10s L1 debounce window |
| D3 | Three-way merge is the only sync primitive for disk → Y.Doc | T | LOCKED | No | 2-way `updateYFragment` silently destroys in-flight edits when the Y.Doc is dirty. 3-way merge is required for correctness under any external writer. | `hocuspocus-plugin.ts:431-443` bug analysis | `three-way-merge.ts` gains a markdown-level entry point; `reconciledBase` is required state |
| D4 | Block-level merge granularity (paragraph/heading/code-fence) | T | DIRECTED | No | Matches the existing `three-way-merge.ts` module. Fine-grained is NG10 — revisit only if false conflicts are a practical problem. | `three-way-merge.ts` `splitMarkdownBlocks` | Users see "this paragraph has a conflict" not "this word has a conflict" |
| D5 | Overlapping conflicts surface via `Y.Map('conflicts')` side-channel, never silently resolved | P | LOCKED | No | "User wins" or "theirs wins" hides upstream authorship decisions and destroys data. Surfacing is the only trust-preserving option. | NG3 | UI must render conflict badges; lives in future UX spec for conflict resolution |
| D6 | Git merge conflict markers trigger resolution mode; editor becomes read-only | P | LOCKED | Yes | Parsing `<<<<<<<` as markdown corrupts the Y.Doc irreversibly. Resolution mode is the only safe option. | File-watcher path analysis | Requires conflict-marker regex in reconciliation layer; new banner UI |
| D7 | File deletes tombstone open Y.Docs with optional rescue buffer | P | DIRECTED | No | Current "ignore delete" re-creates deleted files. Tombstoning + rescue matches user expectations. | `file-watcher.ts:74-77` | Rescue buffers live in `.openknowledge/rescue/*.md` with 24h retention |
| D8 | Renames detected via delete+create pair with matching content hash | T | DIRECTED | No | @parcel/watcher reports renames as independent delete+create on macOS. Hash-matching within 200ms pairs them reliably. | parcel-watcher semantics | Pairing window is 200ms (configurable); false positives possible if two unrelated files share content |
| D9 | `.git/HEAD` + `MERGE_HEAD` + `index.lock` watcher for batch detection | T | DIRECTED | No | Batches multi-file changes as one reconciliation pass. Required for upstream-import attribution to cover the entire pull atomically. | Git's operational model — HEAD moves only on commit completion | HEAD watcher only active when parent `.git` exists; standalone mode skips it |
| D10 | `BatchBegin` flushes pending L1 writes; `batchInProgress` gates further writes | T | LOCKED | Yes | Without pre-batch flush, the last 2s of user edits can be clobbered by the incoming pull. Without `batchInProgress`, a save mid-pull interleaves states and breaks git merge. | Race analysis in conversation turn 5 | L1 quiet period extends L1 debounce window implicitly; no user-visible effect on normal editing |
| D11 | Upstream-import commits authored by `upstream`, not the user | T | LOCKED | Yes | Without this, shadow repo blame attributes upstream's diff to whoever saved next. Breaks Bucket 3 attribution. | Shadow repo race analysis | Adds a `refs/wip/upstream` ref; merges into `refs/heads/main` at checkpoint time |
| D12 | Per-writer WIP refs (`refs/wip/<writer-id>`) replace single `refs/wip/main` | T | DIRECTED | No | Supports multi-writer attribution natively via git primitives. Checkpoint squash-merges all writer refs with co-authored-by trailers. | Bucket 3 requirement for per-op attribution | Small number of refs (typically 1 human + N agents + 1 upstream); shadow `git gc` is our concern, not the user's |
| D13 | Standalone mode is the same protocol minus host-awareness | T | DIRECTED | No | One code path, two deployments. Standalone loses `BatchBegin/End` batching but keeps every other invariant. | G8 | Tests cover both modes; no feature flags distinguish them |
| D14 | `reconciledBase` is in-memory only, rebuilt from disk on restart | T | DIRECTED | No | Persisting it adds complexity for no benefit — on restart, `onLoadDocument` reads fresh content which becomes the new base. | G7 local reasoning invariant | Edge case: if the Hocuspocus process crashes mid-reconciliation, the base is lost for active docs; next hydration uses current disk as base (safe) |
| D15 | Content root is parameterized via `.openknowledge/config.json` | T | DIRECTED | No | Hardcoded `../../content` in the spike works only for standalone. Integrated mode needs `content/docs` (Fumadocs), `docs` (Mintlify), or user-chosen paths. | `persistence.ts:25` | `bin/init.ts` sets this at init time; can be edited by hand later |
| D16 | `handleExternalChange` dispatches on `DiskEvent` kind, not raw parcel events | T | DIRECTED | No | First-class event taxonomy lets each lifecycle have dedicated handling. Current spike's switch statement can't distinguish rename from delete. | `file-watcher.ts:74-95` | Replaces direct parcel-watcher callbacks; adds a buffer-and-drain layer for batching |
| D17 | Block-level merge module reused, not rewritten | T | DIRECTED | No | `three-way-merge.ts` already implements the hard part. Adding a markdown-level entry point is ~50 lines. | `three-way-merge.ts:1-80` | Two callers (source-toggle + disk-bridge) share the same merge logic |
| D18 | L1 atomic write remains temp+rename; L2 isolated via `GIT_INDEX_FILE` (unchanged) | T | LOCKED | No | Already validated in TQ20. No reason to change. | `persistence.ts:197-216` | Shadow repo's L2 uses `<shadowDir>/index-wip` instead of `.git/index-wip` |
| D19 | Host repo's `.gitignore` is modified idempotently at init; nothing else in host `.git/` | P | LOCKED | Yes | G1 — "zero trace" — has one exception: adding `.openknowledge/` to `.gitignore`. This is a file in the working tree, not state in `.git/`, and is reversible by deleting the line. | G1 | User sees one line in their `.gitignore`; removal is a no-op |
| D20 | Follow-branch-switch semantics on `git checkout` (default) | P | DIRECTED | No | Editor's view tracks `cat`. Alternative — pin user to prior branch — is surprising and breaks mental model. | See §5 P1 branch-switch journey | Settings toggle may surface later; default is follow |
| D21 | On `git reset --hard`, editor enters resolution mode rather than silently reconciling | P | DIRECTED | No | `reset --hard` is the user declaring they don't care about in-flight state. Openknowledge should get out of the way, not try to merge. | Safety principle | Detected via HEAD jumping to an unrelated commit with working tree changes |
| D22 | Rescue buffers live in `.openknowledge/rescue/<docName>.md` with 24h retention | P | DIRECTED | No | Filesystem is the simplest durable store; 24h matches VS Code's "recent closed" window. | — | `GET /api/rescue` lists; manual cleanup after 24h |
| D23 | Upstream-import commits do NOT replay individual upstream commits; they're a single tree snapshot | T | DIRECTED | No | Preserves shadow repo simplicity; upstream's actual commit history lives in the host repo for browsing via normal `git log`. Shadow history is "how openknowledge saw the world change," not a mirror of upstream. | Simplicity principle | Shadow repo is not a mirror; two-repo mental model |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | What exactly triggers `reconciledBase` initialization for a document that was never loaded before an external event? | T | P0 | No | When a closed doc receives an `Update` event, set `reconciledBase[docName] = content` as a side effect (so the next `onLoadDocument` starts with a consistent base). Documented in §9.4. | Decided |
| Q2 | What's the conflict-marker regex, exactly? Git's markers can vary under custom merge drivers or diff3 style. | T | P0 | No | Default: `^<{7} |^={7}$|^>{7} `. Tested against `git merge --no-ff` output on real Fumadocs repos. May need adjustment for `merge.conflictStyle = diff3` which adds `|||||||`. | Open — test in evidence |
| Q3 | On `git checkout` with in-flight edits that conflict with the target branch, do we follow or pause? | P | P1 | No | D20: default follow. Reconciliation runs three-way merge; overlapping edits surface as conflicts. Alternative: "pause on branch switch" as a settings toggle. | Decided (default) |
| Q4 | How does `git reset --hard <far-commit>` get detected vs a normal checkout? | T | P1 | No | Both move HEAD. Difference: reset --hard has no `MERGE_HEAD`/`ORIG_HEAD` sequence, and the target commit isn't an ancestor of the current one. Heuristic: if `git merge-base --is-ancestor prior HEAD` fails, treat as `reset`. Enter resolution mode per D21. | Open — needs test |
| Q5 | What author identity does a human's WIP commits use — the editor's own identity, or the host repo's `user.name`/`user.email`? | T | P1 | No | For attribution clarity, use the openknowledge presence identity (`ok-user-name` from localStorage). Can be overridden via `.openknowledge/config.json` to match host git config if the user prefers. | Decided — openknowledge identity with override |
| Q6 | Shadow repo `git gc` — who runs it, when? | T | P2 | No | Cron-style cleanup inside openknowledge server on startup if the shadow repo hasn't been gc'd in 7 days. `git gc --auto` in the shadow. Never touches the host. | Decided — startup check |
| Q7 | What happens when the shadow repo is corrupted (manual mucking, disk fault)? | T | P2 | No | Detect on startup via `git fsck`. On failure, rename the broken shadow to `.openknowledge/history.git.broken-<timestamp>` and create a fresh shadow. User loses history but not disk content. | Decided — reinit on corruption |
| Q8 | Rename detection on Linux: is the 200ms hash window reliable? | T | P1 | No | Linux inotify delivers delete+create for renames within the same directory. Needs empirical testing. If unreliable, fall back to treating renames as delete+create (two independent events, Y.Doc for old path tombstones, Y.Doc for new path hydrates on open). | Open — platform test needed |
| Q9 | What if the user has uncommitted staged changes in the host repo when openknowledge starts up? | P | P1 | No | Detect via `git diff --cached`. If any content files are staged, warn the user and ask whether to include staged changes in the initial `reconciledBase`. Safe default: yes, they're part of the current state. | Open — UX decision |
| Q10 | Multi-writer concurrent writes to the same block — what does attribution look like? | T | P2 | No | If human and agent both edit the same paragraph within one L2 debounce window, the shadow commit is authored by whoever's WIP ref advances first. Second writer's delta attributed to them in their own WIP ref. Checkpoint merges via co-authored-by trailers. | Decided — per-writer refs handle it |
| Q11 | Is `refs/heads/main` in the shadow repo meaningful before the first checkpoint? | T | P2 | No | No — before the first "Save Version," only `refs/wip/*` exist. `main` is created by the first checkpoint and advances via squash-merges. Initial state is empty. | Decided |
| Q12 | How are drafts represented in the shadow repo, and what happens when upstream pulls land on a draft? | T | P0 | No | Drafts are `refs/drafts/<name>` branched from `refs/heads/main` at creation. On upstream-import commit, drafts are rebased onto the new `main` (via `git rebase` with merge-strategy: recursive). If rebase fails, draft enters resolution mode. Full draft model is a follow-up spec under Bucket 5. | Partial — storage model decided, UX deferred |
| Q13 | Does the shadow repo need any kind of garbage-collection limit for deep histories (months/years of WIP)? | T | P2 | No | `git gc --auto` with standard thresholds. If history gets unwieldy, we can add a "archive WIPs older than N days" pass. Not an MVP concern. | Deferred |
| Q14 | What about files openknowledge does NOT care about (non-markdown, outside content root) that change during a pull? | T | P1 | No | File-watcher is scoped to `contentRoot` via `safeContentPath`. Non-content files trigger zero openknowledge behavior. HEAD watcher still fires (it's on `.git/HEAD`), so `BatchBegin/End` still wrap the pull, but there are no content-file events to reconcile. Upstream-import commit reflects only the content-root subtree. | Decided |
| Q15 | How does this interact with `Y.Map('activity')` from the presence spec? | T | P0 | No | Reconciliation transactions use origin `'reconciliation'`, not `'agent-write'`. They don't write to `Y.Map('activity')` — the presence spec's flash plugin ignores them. Upstream imports optionally write to `Y.Map('lifecycle')` for a "Synced with upstream" indicator (FR19). | Decided |
| Q16 | What happens if `.git/HEAD` watcher fires for a `git stash pop` that restores conflicting changes? | T | P2 | No | `stash pop` can produce conflict markers. Reconciliation sees them and enters resolution mode per D6. User resolves normally. | Decided — same path as any conflict |
| Q17 | Can the host repo be a submodule? | T | P2 | No | Submodules have their own `.git/` pointer files. Reconciliation should work, but `.git/HEAD` watching needs to resolve the real gitdir. Defer empirical validation. | Deferred |
| Q18 | Does the `BatchEnd` upstream-import commit happen even when no content files changed in the pull (e.g., upstream only changed `package.json`)? | T | P2 | No | No — `commitUpstreamImport` checks whether the content tree actually differs from the previous shadow HEAD tree. If identical, skip the commit. | Decided |
| Q19 | How is the shadow repo presented in the Bucket 4 timeline UI? | P | P1 | No | Timeline reads from `refs/heads/main` + `refs/wip/*`, renders checkpoints prominently and auto-saves collapsed. Upstream-import commits appear as a distinct "Synced with upstream" entry type. Full UX is in the Bucket 4 timeline spec (separate). | Deferred to Bucket 4 spec |
| Q20 | Is the content hash in `writeTracker` the right thing to match against for self-write detection when the reconciliation path does its own writes? | T | P0 | No | Yes — reconciliation writes go through `onStoreDocument` which calls `registerWrite(filePath, contentHash(markdown))` as today. The reconciled content is what ends up in both Y.Doc and disk, so the hash matches on the next parcel event and self-write detection still works. | Decided |

## 12) Rollout plan

**Phase 1 — baseline safety (1–2 days):**
- `.git/index.lock`-based save suspension (FR11, narrow version: just pause L1 during index.lock presence). This alone prevents the race in scenario 7 of the failure matrix.
- Conflict-marker detection in `handleExternalChange` (FR9, just refuse to apply). This alone prevents Y.Doc corruption on bad merges.
- Ship behind `OPENKNOWLEDGE_RECONCILIATION=strict` env var.

**Phase 2 — reconciliation core (3–5 days):**
- `reconciliation.ts` module with `reconcile()` primitive (FR3, FR4).
- Markdown-level entry point added to `three-way-merge.ts` (D17).
- Wire reconciliation into `handleExternalChange` replacing direct `updateYFragment` (FR4).
- `Y.Map('conflicts')` side-channel + minimal conflict banner UI (FR5).
- Full test matrix: clean/dirty × overlap/non-overlap × deleted/renamed/created.

**Phase 3 — shadow repo (3–5 days):**
- `shadow-repo.ts` module with init, commit-to-WIP-ref, commit-upstream-import (FR1, FR2, FR12).
- Parameterize `persistence.ts` over `gitDir`, `contentRoot`, writer identity (FR13, FR15, FR16).
- `bin/init.ts` creates shadow and writes `.gitignore` (FR14).
- Test matrix: standalone vs integrated vs inside git submodule.

**Phase 4 — parent-awareness (2–3 days):**
- `head-watcher.ts` with `BatchBegin/End` dispatch (FR10).
- Buffer-and-drain for file events during batches.
- Upstream-import commits fully wired (FR12).
- Test matrix: pull ff / pull merge / pull rebase / checkout / reset --hard / stash pop.

**Phase 5 — lifecycle events (2–3 days):**
- `DiskEvent` taxonomy in `file-watcher.ts` (FR6).
- Rename detection with 200ms hash pairing (FR8, D8).
- Delete tombstoning + rescue buffer (FR7, FR17).
- Resolution-mode banner UI (FR9, D6).
- Test matrix: all five lifecycle events under clean and dirty Y.Docs.

**Phase 6 — E2E + metrics (2 days):**
- Playwright scenarios covering all §7 metrics.
- Instrumentation + `GET /api/metrics/reconciliation`.
- Toggle default to `strict` mode; `legacy` becomes the rollback switch.

**Total estimate: ~13–20 days of focused work**, excluding open questions that need empirical validation. This is a substantial piece of work, comparable to the presence/awareness spec, and it's foundational — Bucket 3, 4, 5, and integrated-mode distribution all rest on it.

## 13) Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Three-way merge produces false conflicts on prose users find annoying | Medium | Medium | Block-level is the default; fine-grained is NG10. Instrument conflict frequency via M5; revisit if problematic. |
| HEAD watcher misses a `git pull` because of a watcher bug or race | Low | High | `batchInProgress` is not the only defense — `.git/index.lock` polling inside `onStoreDocument` provides a second check. On miss, we degrade to per-event reconciliation (current behavior + three-way merge), which is still correct. |
| Shadow repo corrupts under disk fault or user tampering | Low | Medium | `git fsck` on startup; reinit on failure (Q7). User loses history but not disk content. |
| Rename detection on platforms where delete+create ordering varies | Medium | Low | Fall back to treating renames as independent delete+create events. Y.Doc state is lost (tombstoned); user reopens the new file. Not a data-loss event. |
| `.gitignore` modification conflicts with user-managed `.gitignore` (e.g., sorted, schema'd, or file-mode'd) | Low | Low | Idempotent append with a distinctive comment marker. User can move the line within the file; we only check for presence. |
| Shadow repo growth over months of WIP dominates `.openknowledge/` size | Low | Low | `git gc --auto` on startup. Can add ref expiration policy later. |
| User has two openknowledge instances attached to the same project (two ports, two tabs) | Medium | Medium | First instance wins; second instance detects the shadow repo is already being written by another process (via `.openknowledge/lock`) and refuses to start with a clear error. |
| The block-level merge module is insufficient for MDX (JSX components inside markdown) | Medium | Medium | Test against real Fumadocs content. If block detection breaks on JSX, either (a) treat JSX void nodes as opaque blocks that merge whole, or (b) extend the block splitter. See M1 test suite. |
| `git gc` on host repo evicts blobs we cached but are still referenced only by the shadow's index | None (new arch) | — | Not applicable — shadow has its own object database. |

## 14) Testing strategy

**Unit tests** — `reconciliation.test.ts`:
- `reconcile()` with every combination of (clean/dirty × overlap/non-overlap × same/different).
- Conflict marker regex against real git output (including `diff3` style).
- Rename detection with matching/non-matching hashes, within/outside the 200ms window.
- `reconciledBase` map update semantics on all reconcile outcomes.

**Integration tests** — `shadow-repo.test.ts`:
- Init creates bare repo with correct core.worktree.
- `.gitignore` idempotent append.
- `commitUpstreamImport` creates correct tree + parent + author.
- Per-writer WIP refs isolate commits.
- Standalone mode (no host `.git`) works.
- Integrated mode with a fresh Fumadocs repo works.
- Shadow `git fsck` detects corruption; reinit recovers.

**E2E tests** — `reconciliation.e2e.spec.ts` (Playwright):
- **Happy-path pull:** type in browser, `exec('git pull')` with fixture remote, assert browser content = merged content.
- **Race pull:** type mid-save-debounce, fire pull, assert zero keystrokes lost.
- **Conflict pull:** both sides change same paragraph, fire pull, assert resolution mode banner appears.
- **Delete pull:** upstream removes file, assert tombstone banner.
- **Rename pull:** upstream renames file, assert Y.Doc migrates.
- **Checkout:** branch switch via `exec('git checkout')`, assert reconcile.
- **Zero-trace test:** fresh host → install → edit → uninstall → `git status && git log --all && diff <before> <after>`. Assert no changes.
- **Multi-writer attribution:** human + agent + upstream in one session, assert shadow log has clean per-writer history.

**Chaos tests**:
- Kill Hocuspocus mid-reconciliation; restart; assert no corruption.
- Fill `.openknowledge/history.git` with random bytes; assert `git fsck` detects and reinit recovers.
- Run two openknowledge instances on the same project; assert second fails cleanly.

## 15) Dependencies

- **Upstream (must be done first):** none. This spec can be implemented against the current `main` branch.
- **Lateral (interacts with):** presence-awareness-ux spec (Y.Map side-channel pattern), bidirectional-observer-sync spec (`updateYFragment` mechanics).
- **Downstream (depends on this):** Bucket 3 attribution UI (reads from shadow repo's per-writer refs), Bucket 4 timeline UI (reads from shadow repo), Bucket 5 draft UX (uses `refs/drafts/*`), Bucket 6 integrated-mode distribution.

## 16) Future work (explicitly out of scope)

- **Optimistic concurrency at MCP surface** (NG6). Needed to close the "agent mid-multi-file write races a pull" case. Dedicated spec under Bucket 5.
- **Cross-device sync of shadow repo** (NG7). Push/pull the shadow to a dedicated remote. Depends on cloud mode.
- **Full draft UI** (NG8). Create/switch/delete/list drafts. Bucket 5 spec.
- **Full timeline UI** (NG9). "Save Version" modal, history panel, collapsed auto-saves. Bucket 4 spec.
- **Windows support** (NG11). Requires empirical testing of `.git/HEAD` watching on NTFS.
- **Non-git host VCS** (NG13). Mercurial / Fossil / Pijul. Shadow repo abstraction stays the same; parent-awareness would need VCS-specific hooks.
- **Fine-grained merge** (NG10). Sentence or word-level. Only if block-level proves insufficient in practice.
- **Rescue buffer UI** (mentioned in FR17). Currently just an HTTP endpoint + filesystem store. A proper "recent rescues" browser UI is a nice-to-have.
- **"Export history to parent repo" action.** Let users optionally squash-merge shadow checkpoints into the parent repo's main branch as real commits. Inverse of NG1 — opt-in, not default.

## 17) Glossary

- **Shadow repo** — bare git repo at `.openknowledge/history.git` with work-tree pointing at the parent project root. Holds all of openknowledge's history, drafts, WIP refs. Never touches the host's `.git/`.
- **Reconciled base** — per-document snapshot of the byte-identical state between Y.Doc and disk at the last sync point. The "base" input to three-way merge.
- **In-flight edits** — user changes present in the Y.Doc but not yet flushed to disk (within the 2–10s L1 debounce window).
- **External writer** — any writer other than our L1 save path: git operations, external editors, agents with filesystem tools, LSP fixers, shell scripts.
- **Lifecycle event** — a typed `DiskEvent`: Create, Update, Delete, Rename, Conflict, or BatchBegin/End.
- **BatchBegin / BatchEnd** — atomic-event markers emitted by the HEAD watcher around coordinated operations (git pull, checkout, merge, rebase). File-watcher events inside a batch are buffered and applied together at BatchEnd.
- **Upstream-import commit** — a commit in the shadow repo authored by `upstream`, representing the set of content changes that entered the working tree via a host git operation. Not a mirror of upstream's commit history; a single tree snapshot.
- **Resolution mode** — a read-only Y.Doc state entered when a file contains git conflict markers or when reconciliation cannot proceed safely. User resolves externally; openknowledge re-engages on next clean state.
- **Per-writer WIP refs** — `refs/wip/<writer-id>` in the shadow repo. One ref per active writer (human, agent, upstream). Attribution-faithful by construction.
- **Rescue buffer** — the in-memory Y.Doc state of a tombstoned-but-dirty document, persisted to `.openknowledge/rescue/<docName>.md` for 24h so the user can recover unsaved work.
