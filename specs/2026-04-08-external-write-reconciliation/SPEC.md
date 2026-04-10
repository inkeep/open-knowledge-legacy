# External Write Reconciliation & Shadow Repo — Spec

**Status:** Draft → Finalizing
**Owner(s):** Nick Gomez, Andrew Mikofalvy
**Last updated:** 2026-04-09 (amendment: branch-scoped shadow contexts — park/load/restore on branch switch)
**Baseline commit:** fa3dd17 (main)
**Links:**
- PROJECT.md: §CC1 (Yjs + git complementary), §CC2 (three-layer auto-persistence), §CC4 (editing contexts = branches), §CC6 (everything branchable), §CC7 (portability)
- STORIES.md: Bucket 3 (attribution), Bucket 4 (auto-persistence), Bucket 5 (draft branches), open question #6 (KB git relationship to project repo)
- Prior art in spike: `packages/server/src/persistence.ts`, `packages/server/src/file-watcher.ts`, `packages/app/src/editor/three-way-merge.ts`, `packages/app/src/server/hocuspocus-plugin.ts:418-449`
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
   - **Shadow history blames upstream on the user.** If we adopt a shadow repo (below) without project-repo-awareness, the next WIP commit after a `git pull` contains upstream's diff on top of our prior tree, attributed to the current author. Bucket 3's origin-shading story becomes a lie.
   - **The save/pull race is unmitigated.** The 2s debounce can fire mid-`git pull`, interleaving our Y.Doc state with half-pulled upstream state. Git then aborts the merge with "Your local changes would be overwritten" and the user has to diagnose auto-save as the culprit.

The two failure classes are entangled: shipping integrated-mode requires fixing project-repo pollution (Class 1), and making the shadow repo attribution-faithful requires a reconciliation protocol that understands external writers as first-class events (Class 2). Neither ships alone.

**Resolution.** Adopt a two-part architecture that makes openknowledge a **sacred guest** of any project repo:

1. **Shadow bare repo at `.git/openknowledge/`**, nested inside the project's `.git/` directory, with `--work-tree` pointing at the project root. Holds all WIP refs, drafts, checkpoints, and attribution metadata. No `.gitignore` modification needed — the shadow is invisible to git's transport protocol and untouched by git maintenance commands (see `reports/git-directory-nesting-shadow-repo/`). In standalone mode (no project `.git/`), falls back to `.openknowledge/` in the project root. In Now, only one active writer instance may mutate a given shadow root at a time; concurrent writers against the same shadow store are rejected via an exclusive lock.

2. **Explicit reconciliation protocol** for external writes, centered on: (a) a `reconciledBase: Map<string, string>` tracked per Y.Doc, (b) **three-way merge** as the only sync primitive (degenerating to 2-way when the Y.Doc is clean), (c) first-class **lifecycle events** (create/update/delete/rename/conflict) replacing the current "ignore delete" branch, (d) **batched disk events** during coordinated operations (pull/checkout/rebase/merge), triggered by a watcher on the project repo's `.git/HEAD`, and (e) **upstream-import commits** in the shadow repo authored by `upstream` that preserve attribution across pulls and serve as rebase targets for active drafts. Block-level three-way merge reuses the existing `three-way-merge.ts` module; conflicts surface via a `Y.Map('conflicts')` side-channel (mirroring the pattern used by `Y.Map('activity')` in the presence spec).

Architecturally, this formalizes PROJECT.md's §CC1 claim that "Yjs handles within, git handles between" by making **all disk-level divergence** (whether from branch switch, branch merge, or upstream pull) go through git-mediated three-way merge, with the CRDT reconciling via diff-based `updateYFragment` transactions. It resolves STORIES.md open question #6 with a fifth option the list didn't consider: "bare git in `.openknowledge`, work-tree = project root, project-repo-aware via HEAD watcher."

## 2) Goals

- **G1** The only traces openknowledge leaves in the project repo are **user-triggered Save Version commits** (in the commit DAG) and the **`.git/openknowledge/` directory** (the shadow attribution journal, invisible to git transport/clone/push). No WIP refs in the project's ref namespace, no auto-save objects in the project's object store, no hooks, no config entries. Uninstalling openknowledge is `rm -rf .git/openknowledge/` — Save Version commits remain as intentional project history.
- **G2** No external writer (git pull, vim, sed, agent filesystem tool, LSP fixer) can silently destroy in-flight CRDT edits. Non-overlapping external changes merge cleanly into the Y.Doc. Overlapping changes surface as conflicts.
- **G3** The shadow repo is an **attribution journal** that accurately tracks every change to its source writer (human, agent, or upstream) between Save Versions. Bucket 3 origin shading reads fine-grained per-writer detail from the shadow; Bucket 4 timeline reads checkpoint refs that bookmark the correspondence between Save Version commits (in the project repo) and shadow state.
- **G3a** Save Version creates **real commits on the project repo** with proper author attribution (co-authored-by trailers as default). The project repo holds the durable commit history; the shadow holds the fine-grained who-wrote-what detail between those commits.
- **G3b** Shadow corruption is **graceful degradation** — losing the shadow loses fine-grained attribution detail but NOT the content commits (those are in the project repo). `rm -rf .openknowledge && openknowledge init` recovers a working state.
- **G4** File lifecycle events have first-class handling: deletes tombstone open docs, renames migrate Y.Doc state, creates hydrate lazily on open. No lifecycle transition silently re-creates or strands state.
- **G5** Git operations (pull, checkout, merge, rebase, cherry-pick, reset) do not corrupt disk state, CRDT state, or shadow repo state. Mid-operation races with our debounced save are prevented via an `.git/index.lock`-based quiet period.
- **G6** Merge conflicts that git cannot resolve (`<<<<<<<` markers) enter a dedicated **resolution mode**. The editor never attempts to parse conflict markers as markdown or write them to the Y.Doc. The user resolves the conflict via their normal git tool, and openknowledge re-engages after resolution.
- **G7** Every observable Y.Doc state is explainable from three per-document quantities: `reconciledBase`, `diskContent`, and `ydocUnsavedDelta`. Local reasoning about correctness is possible without global system knowledge.
- **G8** The architecture works identically in standalone mode (no project repo) and integrated mode (project repo present). In integrated mode, the shadow lives at `.git/openknowledge/`; in standalone mode, at `.openknowledge/` in the project root (since there's no `.git/` to nest inside).
- **G9** Concurrent mutation of a single shadow root is prevented. Different repositories may run simultaneously, but only one active writer instance may own a given shadow store in Now.
- **G10** Branch switches in the project repo are **context-preserving**, not data-merging. In-progress edits on the old branch are parked in branch-scoped shadow refs and restored when the user switches back. No edits from one branch bleed into another. The shadow repo's WIP refs, checkpoints, and `reconciledBase` state are all scoped to the active project branch.

## 3) Non-goals

- **[NEVER]** NG1: Writing WIP refs into the project repo's `.git/`. The "git-native with namespaced refs" architecture (Candidate B in `evidence/design-reasoning.md`) is rejected because it fails G1 — users can't uninstall cleanly, `git push --mirror` leaks state, and per-op attribution within batch commits is impossible.
- **[NEVER]** NG2: Making the CRDT the source of truth. The Y.Doc is a session cache derived from disk. Disk is canonical. This matches CC7 portability and the spike's actual behavior (Y.Doc is never persisted as binary).
- **[NEVER]** NG3: Silent "ours wins" or "theirs wins" conflict resolution on overlapping block-level edits. Overlaps must be surfaced to the user via the conflict side-channel.
- **[NEVER]** NG4: Parsing `<<<<<<<` / `=======` / `>>>>>>>` sequences as content. Files containing conflict markers are refused by the reconciliation layer until the markers are removed.
- **[NEVER]** NG5: Calling `git gc`, `git prune`, or any destructive operation on the project repo. The shadow repo owns its own gc lifecycle; the project's is the user's concern.
- **[NOT NOW]** NG6: Optimistic-concurrency MCP surface for agents (`write_file(path, content, expected_sha)` with 409 on mismatch). Needed to close the "agent mid-multi-file write races a git pull" case but out of scope for this spec. **Revisit if:** user testing shows agents stepping on concurrent upstream state frequently enough to warrant a dedicated design pass.
- **[NOT NOW]** NG7: Cross-device sync of the shadow repo (push/pull shadow to its own remote). The shadow repo is local-first. **Revisit if:** cloud mode ships and cross-device history sync is a requirement.
- **[NOT NOW]** NG8: Full draft UI (create/rename/delete/list/switch via visible controls). This spec defines the draft *storage model* (refs in shadow repo, base tracking, rebase-on-upstream-import) — the draft UX lives in a separate spec under Bucket 5.
- **[NOT NOW]** NG9: Full Bucket 4 "Save Version" timeline UI. This spec defines the *attribution substrate* (per-writer WIP refs, upstream-import commits) that the timeline reads from, not the timeline itself.
- **[NOT NOW]** NG10: Fine-grained (sentence/word/character) merge granularity. Block-level (paragraph/heading/code-fence) is the default. **Revisit if:** user testing shows block-level produces too many false conflicts on prose-heavy content.
- **[NOT NOW]** NG11: A file-watcher channel for `.git/HEAD` on Windows (where filesystem watching semantics differ). Linux and macOS ship first; Windows parity is a follow-up.
- **[NOT UNLESS]** NG12: File-level locking across clients to prevent concurrent human/human edits on the same paragraph. Y.js CRDT merge handles concurrent human edits natively. Only revisit if real-world evidence shows CRDT merges producing confusing results for users.
- **[NOT UNLESS]** NG13: Supporting non-git project VCS (Mercurial, Fossil, Pijul). The shadow bare repo exists regardless; project-repo-awareness hooks are git-specific. **Revisit if:** a meaningful user cohort requests non-git integration.
- **[NOT NOW]** NG14: Concurrent writer instances against the same shadow root. Openknowledge v1 supports at most one active writer instance per shadow store (for example, multiple worktrees of the same repository that resolve to the same `.git/openknowledge/`). Supporting concurrent multi-worktree writers is deferred until shadow refs, reconciliation state, and checkpoint semantics are made worktree-aware.

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

1. User is editing `intro.mdx` on `main`, 4 seconds of unsaved Y.Doc state, open in browser. `lastKnownBranch = main`.
2. User runs `git checkout feature-xyz` in terminal. Git creates `index.lock`.
3. HEAD watcher detects `index.lock` → `BatchBegin` dispatches. Openknowledge immediately **parks** the current branch context:
   - Commits current Y.Doc state (from memory, not disk) to `refs/wip/main/human-<id>` in the shadow repo.
   - Suspends all L1/L2 writes.
4. Git completes the checkout: updates working-tree files, moves HEAD to `feature-xyz`, releases `index.lock`.
5. HEAD watcher: 100ms of quiet → `BatchEnd` dispatches. Openknowledge detects a **cross-branch switch** (`lastKnownBranch = main`, new HEAD resolves to `feature-xyz`):
   - Switches `reconciledBase` to the `feature-xyz` scope (creates a fresh scope if this is the first visit to this branch).
   - Resets all open Y.Docs from the new branch's disk content via `onLoadDocument`-style hydration.
   - If `refs/wip/feature-xyz/human-<id>` exists from a prior visit, **restores the parked WIP** by running three-way merge: `base = parked-at disk snapshot`, `ours = parked Y.Doc state`, `theirs = current disk`. Non-overlapping edits merge; overlapping edits surface as conflicts.
   - Files that existed only on `main` are tombstoned with rescue buffers if dirty. Files new on `feature-xyz` are available for lazy hydration on open.
   - Updates `lastKnownBranch = feature-xyz`.
6. Shadow repo commits an `upstream-import` on the `feature-xyz` branch scope, labeled "project checkout to branch `feature-xyz`" for attribution clarity.
7. User sees the `feature-xyz` content in the editor. If they'd previously been editing on `feature-xyz`, their in-progress edits from that prior session are restored.

**Aha moment:** "I switched branches and my draft paragraphs on `main` weren't lost — they were parked. When I switch back, they'll be right where I left them."

### P1: Fumadocs user switches back to `main` after working on `feature-xyz`

1. User has been editing on `feature-xyz`. They run `git checkout main`.
2. `index.lock` → `BatchBegin`. Openknowledge parks `feature-xyz` context to `refs/wip/feature-xyz/human-<id>`.
3. Git completes checkout. `BatchEnd` fires. Cross-branch switch detected (`feature-xyz` → `main`).
4. `reconciledBase` switches to `main` scope. Y.Docs reset from `main` disk content.
5. `refs/wip/main/human-<id>` exists from the earlier park → restore via three-way merge against current `main` disk state.
6. User sees their `main` edits exactly as they left them (unless `main` content changed while they were on `feature-xyz`, in which case three-way merge applies).

**Aha moment:** "My work on `main` was waiting for me — and it even merged with upstream changes that landed while I was on the feature branch."

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

### P2: Standalone-KB user — no project repo (reconciliation degenerates gracefully)

1. User runs `npx openknowledge init` in an empty directory. No project `.git`. Openknowledge creates `.openknowledge/` in the project root as the shadow bare repo (fallback location when no `.git/` exists).
2. They edit files via the browser. L1 persistence writes `.md` files. L2 persistence commits to `refs/wip/main/human-<id>` in the shadow (standalone mode has a single implicit `main` branch context).
3. External writers (vim, another editor) trigger the same reconciliation protocol. `.git/HEAD` watcher is absent (no project repo), so reconciliation processes events individually rather than batched — a graceful degradation.
4. User never sees the shadow in their editor (it's inside `.openknowledge/` which can be `.gitignore`d), never touches git.

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
| Any | `.git/HEAD` moves (BatchBegin) | Suspend L1/L2 writes, park current branch context to shadow | No visible change until BatchEnd |
| Any | BatchEnd, within-branch (pull/merge) | Reconcile all affected docs, emit upstream-import commit | Editor re-engages, attribution clean in shadow |
| Any | BatchEnd, cross-branch (checkout) | Park old branch → reset Y.Docs from new branch disk → restore parked WIP if exists | Editor shows target branch content; prior branch edits preserved in shadow |
| Any | BatchEnd, detached HEAD | Park old branch → reset Y.Docs from detached commit's disk state | Editor shows detached content; detached context GC'd on next branch checkout |

## 6) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| Must | FR1 | Shadow bare repo at `.git/openknowledge/` | `npx openknowledge init` creates `.git/openknowledge/` as a bare repo with `core.worktree` pointing at the project root. In standalone mode (no project `.git/`), falls back to `.openknowledge/` in the project root. | No `.gitignore` modification needed in integrated mode — shadow is inside `.git/` and invisible to git transport |
| Must | FR2 | All WIP refs live in the shadow repo, scoped by project branch | `simpleGit` in `persistence.ts` is parameterized over `gitDir`. Default is `.git/openknowledge/`. `refs/wip/<project-branch>/<writer-id>` is written via `--git-dir=<shadow> --work-tree=<project-root>`. | Per-writer, per-branch refs replace the single `refs/wip/main` ref |
| Must | FR3 | Per-document, per-branch `reconciledBase` map | `Map<branch, Map<docName, string>>` keyed by project branch name then document name. Value is the last-known byte-identical string between Y.Doc and disk. Updated on `onLoadDocument`, on successful `onStoreDocument`, and on every successful reconciliation. On branch switch, the active scope switches to the target branch's map. | Resides in `persistence.ts` or a new `reconciliation.ts` module |
| Must | FR4 | Three-way merge is the only sync primitive for disk → Y.Doc | `handleExternalChange` calls `reconcile(base, ours, theirs)`. When `ours === base` (clean), degenerates to `updateYFragment(theirs)`. When both differ, calls `threeWayMerge` from `three-way-merge.ts` with block-level granularity. | Block granularity is paragraph/heading/code-fence per the existing module |
| Must | FR5 | Overlapping conflicts surface via `Y.Map('conflicts')` | When `threeWayMerge` reports `conflicts.length > 0`, each conflict is written to `Y.Map('conflicts')` with `{ blockIndex, base, ours, theirs, resolution: 'pending' }`. Clients observe this map and render a conflict badge inline. | Mirrors `Y.Map('activity')` pattern from the presence spec |
| Must | FR6 | `DiskEvent` taxonomy replaces raw watcher events | `file-watcher.ts` emits `DiskEvent` unions: `Create`, `Update`, `Delete`, `Rename`, `Conflict`, `BatchBegin`, `BatchEnd`. Rename pairs are detected by hash-matching delete+create within 200ms. | `BatchBegin/End` come from the HEAD watcher, not parcel-watcher |
| Must | FR7 | Deletes tombstone open docs | On `Delete` for an open Y.Doc: if clean, unload + broadcast `lifecycle: deleted-upstream`; if dirty, expose rescue buffer via HTTP `GET /api/rescue/:docName` and broadcast before unloading. | "Ignore delete" branch in `file-watcher.ts:74-77` is removed |
| Must | FR8 | Renames migrate Y.Doc state | On `Rename(oldPath, newPath)`: migrate the Hocuspocus document entry key, update `frontmatterCache`, update `reconciledBase`, update `writeTracker`, broadcast `lifecycle: renamed` to connected clients with the new path. | Connected clients reload with the new doc name |
| Must | FR9 | Conflict-marker files trigger resolution mode | Before parsing a file as markdown, check for lines matching `^(<{7} \|={7}$\|>{7} \|\|{7} )` (covers merge, diff3, zdiff3 styles). If found, refuse to update the Y.Doc; broadcast `lifecycle: conflict` with `{ ours, theirs, base }` for the UI. | Editor becomes read-only for affected docs |
| Must | FR10 | `.git/HEAD` watcher on the project repo | A second `@parcel/watcher` subscription on the project's `.git/` directory, filtered to `HEAD`, `ORIG_HEAD`, `MERGE_HEAD`, `index.lock`. Emits `BatchBegin` on any movement and `BatchEnd` after a 100ms quiet window. | Only active when a project `.git` exists |
| Must | FR11 | L1 + L2 writes suspended during `BatchBegin..BatchEnd` | `onStoreDocument` and `scheduleGitCommit` short-circuit while `batchInProgress === true`. Pending writes are flushed *before* `BatchBegin` is fully dispatched (to preserve user state from the last quiet window). | Prevents mid-pull race condition |
| Must | FR12 | Upstream-import commits in shadow repo | After a `BatchEnd` where HEAD actually moved, the shadow repo commits the new content tree with author `upstream <noreply@openknowledge.local>`, parented on the previous shadow HEAD, message `upstream: import from <old-sha>..<new-sha>`. | Only fires if the batch involved HEAD movement, not just file-watcher bursts |
| Must | FR13 | Per-writer, per-branch WIP refs | Each identity (human session, agent, upstream) writes to `refs/wip/<project-branch>/<writer-id>` in the shadow repo. Commits are written with author/committer matching the writer identity. The active project branch is resolved from `.git/HEAD` and cached as `lastKnownBranch`. | Writer IDs: `human-<hash>`, `agent-<agent-id>`, `upstream`. Branch from `lastKnownBranch` cache. |
| Must | FR21 | Save Version creates real project repo commits | User-triggered "Save Version" collects per-writer deltas from shadow WIP refs, creates a commit on the project repo's current branch via `commit-tree` plumbing (temporary `GIT_INDEX_FILE` to avoid touching user's staging area). Default: single commit with `Co-authored-by:` trailers for each writer. | Does NOT use the user's working index; project `git log` shows the Save Version commit |
| Must | FR22 | Shadow checkpoint refs with full tree snapshots | On Save Version, write `refs/checkpoints/<lastKnownBranch>/<project-commit-sha>` in the shadow pointing at current shadow HEAD. The checkpoint commit stores the full content tree (not just the SHA) so the shadow is self-contained and survives project-repo rewrites (rebase, force-push). Branch-scoped to match the WIP ref namespace. | Enables attribution queries between any two checkpoints regardless of project-repo state |
| Must | FR23 | WIP ref reset after checkpoint | After a Save Version, per-writer WIP refs are reset so subsequent WIP commits track only post-checkpoint deltas. Shadow state between checkpoints is queryable via the checkpoint refs. | Prevents unbounded WIP growth in shadow |
| Must | FR24 | Exclusive shadow-root writer lock | Before enabling reconciliation, persistence, upstream-import commits, checkpoint writes, or any mutation of `refs/wip/*`, `refs/checkpoints/*`, or `refs/drafts/*`, openknowledge acquires an exclusive lock at `<shadowDir>/lock`. The lock is scoped to the shadow root, not globally to the machine. Different repositories may run concurrently; only one active writer instance may mutate a given shadow root at a time. | Prevents concurrent worktrees/processes from mixing attribution and checkpoint state in one shadow store |
| Should | FR25 | Stale shadow-lock recovery | If `<shadowDir>/lock` already exists at startup, openknowledge validates whether the recorded owner is still live. If the owner is alive, startup fails before any writer behavior begins. If the owner is dead or the lock is clearly stale, openknowledge may replace it after logging a warning. Lock metadata records at least `pid`, `hostname`, `startedAt`, and `worktreeRoot`. | Conservative failure is preferred when liveness cannot be determined safely |
| Must | FR26 | Branch context tracking | Openknowledge caches the active project branch name (`lastKnownBranch`) by parsing `.git/HEAD` on startup and updating on every `BatchEnd`. Detached HEAD (`.git/HEAD` contains a raw SHA, not a `ref:` symref) is tracked as `detached-<sha>`. | Required for distinguishing within-branch vs cross-branch HEAD movements |
| Must | FR27 | Park-on-branch-switch | On `BatchBegin` when a `git checkout` is detected (or preemptively on every `BatchBegin`), commit current Y.Doc in-memory state to `refs/wip/<lastKnownBranch>/<writer-id>` in the shadow repo. This captures the user's in-flight edits before git modifies the working tree. The park commit also records a metadata blob with the disk snapshot hash at park time (used as merge base for WIP restoration). | Park from Y.Doc memory, not from disk — disk may already reflect the new branch by the time HEAD watcher fires |
| Must | FR28 | Load-on-branch-switch | On `BatchEnd` where a cross-branch switch is detected (`lastKnownBranch !== newBranch`), reset all open Y.Docs from the target branch's disk content via `onLoadDocument`-style hydration. Switch `reconciledBase` to the target branch's scope. Tombstone Y.Docs for files that don't exist on the target branch (with rescue buffer if dirty). Create placeholder entries for files new on the target branch (hydrated lazily on open). | Y.Docs must not carry state from the old branch into the new branch |
| Should | FR29 | Restore-parked-WIP on branch switch | On `BatchEnd` after a cross-branch switch, if `refs/wip/<newBranch>/<writer-id>` exists from a prior visit, restore the parked WIP via three-way merge: `base = disk snapshot at park time`, `ours = parked Y.Doc state`, `theirs = current disk content`. Non-overlapping edits merge cleanly; overlapping edits surface as conflicts via `Y.Map('conflicts')`. | Enables round-trip branch switching without losing in-progress work |
| Must | FR30 | Detached HEAD fallback context | When `.git/HEAD` contains a raw SHA (detached HEAD), use `detached-<sha>` as the branch context name for WIP refs and `reconciledBase` scoping. Detached contexts are GC'd on the next checkout to a named branch — their shadow refs are deleted unless the user has dirty state (in which case, a rescue buffer is created). | Prevents unbounded accumulation of orphaned detached contexts |
| Must | FR31 | Shadow branch cleanup on project branch deletion | When a project branch is deleted (detectable via reflog or periodic scan of `refs/wip/*` against project repo branches), the corresponding shadow branch's WIP refs are scheduled for deletion after a 24h grace period. Checkpoint refs are retained (they reference project-repo commit SHAs that may still be reachable). | Prevents unbounded shadow ref growth from stale branches |
| Should | FR32 | Shadow branch rename on project branch rename | When a project branch is renamed (`git branch -m old new`), migrate shadow refs from `refs/wip/old/*` to `refs/wip/new/*` and update `reconciledBase` scope key. Detectable via `.git/HEAD` change where the old branch disappears and a new branch appears with the same HEAD SHA. | Prevents orphaned shadow refs after branch renames |
| Must | FR14 | Shadow location resolution at init | `npx openknowledge init` resolves the shadow location: if project `.git/` exists, creates `.git/openknowledge/` (no `.gitignore` needed); if no project `.git/`, creates `.openknowledge/` and adds `.openknowledge/` to `.gitignore` if one exists. | Integrated mode needs no working-tree modifications |
| Must | FR15 | Reconciliation works in standalone mode | Absence of a project `.git/` is a graceful degradation. HEAD watcher is skipped. File-watcher events process individually without `BatchBegin/End` wrapping. All other invariants (base tracking, three-way merge, lifecycle events) apply identically. | Standalone users get the same protocol minus project-repo awareness |
| Must | FR16 | Parameterize content root | `CONTENT_DIR` in `persistence.ts` (currently hardcoded to `../../content` at line 25) becomes a config option resolved at init. Fumadocs users point at `content/docs/`; Mintlify at `docs/`; standalone users at whatever they pick. | Enables integrated mode at all |
| Should | FR17 | Rescue buffer retention | Rescue buffers from tombstoned-with-dirty docs persist for 24h in `<shadow-parent>/openknowledge/rescue/<doc-name>.md`. Indexed in a list endpoint `GET /api/rescue` for recovery UX. | Prevents data loss when user doesn't act immediately |
| Should | FR18 | `BatchEnd` timeout cap | If `BatchEnd` hasn't fired within 30s of `BatchBegin` (stuck merge, stalled rebase), emit a warning log and cap the batch. Reconciliation resumes with whatever disk state is current. | Prevents indefinite suspension of saves |
| Could | FR19 | Upstream-pull marker UI | When a `BatchEnd` involves HEAD movement, briefly flash the presence bar with a "Synced with upstream" indicator. | Pure UI polish |
| Must | FR20 | All file paths resolve under the content root | `safeContentPath` (already present at `persistence.ts:36-42`) validates every resolved path starts with `CONTENT_DIR`. Non-content files outside the root are ignored entirely. | Security boundary — prevents path-traversal attacks via crafted filenames |

### Non-functional requirements

- **Performance:** Three-way merge must complete in < 50ms for files up to 10KB of markdown. `BatchEnd` reconciliation of 50 open docs must complete in < 500ms. File-watcher event processing (single event) < 20ms p95.
- **Reliability:** `reconciledBase` is source-of-truth; if it diverges from reality, reconciliation must self-repair on next `onLoadDocument` by reinitializing base from disk. No state is persisted in-memory that can't be reconstructed from disk.
- **Data safety:** No code path may lose a user's in-flight edits without surfacing them. If three-way merge fails with an exception, the Y.Doc is unchanged and an error is logged. If the shadow repo write fails, disk state is unchanged and a retry is scheduled.
- **Security:** All file paths go through `safeContentPath`. The shadow repo directory is quarantined — nothing outside `.git/openknowledge/` (or `.openknowledge/` in standalone mode) is written by openknowledge's git operations. No project git config, hooks, or credentials are read or modified.
- **Concurrency:** All writer paths require ownership of the shadow-root lock. Different repositories may run concurrently; a second live writer against the same shadow root fails to start.
- **Observability:** Structured logs for every reconciliation pass (`[reconcile] ${docName} base=<hash> ours=<hash> theirs=<hash> result=<clean|merged|conflict|refused>`). Counter metrics for `BatchBegin/End` invocations, conflict incidents, rescue-buffer creations.
- **Portability:** Works on macOS and Linux in v1. Windows support is NG11. WSL counts as Linux.
- **Operability:** The reconciliation layer must be toggleable via env var (`OPENKNOWLEDGE_RECONCILIATION=legacy|strict`) for rollback to the current 2-way-apply behavior if a critical bug is found. Legacy mode replicates current spike behavior for compatibility testing.

## 7) Success metrics & instrumentation

- **M1: Zero silent data loss on `git pull`.** A Playwright E2E test that starts with in-flight edits, runs `git pull` against a controlled remote with non-overlapping changes, and asserts that every user keystroke is preserved in the Y.Doc. Target: 100% pass over 100 runs.
- **M2: Project repo contains only Save Version commits after a session.** Fresh project repo → install openknowledge → edit for 10 minutes → Save Version → uninstall (rm -rf `.git/openknowledge/`) → `git status && git log --all && ls .git/refs`. Assert: no WIP refs in project ref namespace, no auto-save objects in project object store, no config changes. Only the user-triggered Save Version commit(s). No `.gitignore` modification needed.
- **M3: Attribution faithfulness in shadow repo.** A 3-writer scenario (human, agent, upstream pull) produces a shadow history where `git log refs/wip/<branch>/<writer>` for each writer shows only their own changes, scoped to the correct project branch. Upstream imports are not misattributed. Cross-branch edits do not bleed. Measured via test scenario.
- **M4: Reconciliation latency.** p95 time from `BatchEnd` dispatch to Y.Doc update visible in browser. Target: < 300ms for 10 affected docs.
- **M5: Conflict resolution round-trip.** Simulated conflict → resolution mode banner → external resolution → editor re-engages. Measured: did the user lose any state? Target: 0 state loss across 20 test scenarios.
- **Instrumentation:** `console.log('[reconcile] ...', { docName, basehash, ourshash, theirshash, conflicts, outcome })` for every reconciliation pass. `[batch] begin ...` / `[batch] end ... (N docs reconciled)` for batch boundaries. Counters exposed via `GET /api/metrics/reconciliation`.

## 8) Current state (how it works today)

- **`packages/server/src/persistence.ts`** implements L1+L2 as validated in TQ20: `onLoadDocument` reads markdown → parses → `updateYFragment`; `onStoreDocument` serializes Y.Doc → markdown → atomic temp+rename write → `scheduleGitCommit()` with 30s debounce. Git commits go to `refs/wip/main` in the enclosing repo (line 85), using `GIT_INDEX_FILE=.git/index-wip` for staging isolation (line 52).
- **`packages/server/src/file-watcher.ts`** subscribes to `@parcel/watcher` on `CONTENT_DIR`. Maintains a `writeTracker` for self-write detection via content hash. Calls `onExternalChange(docName, content)` for each external event. **Explicitly ignores `delete` events** (line 74-77).
- **`packages/app/src/server/hocuspocus-plugin.ts:418-449`** implements `handleExternalChange` as **Strategy C**: only syncs open docs. Applies changes via `document.transact(..., { skipStoreHooks: true })` wrapping a direct `updateYFragment` call. No three-way merge, no merge base.
- **`packages/app/src/editor/three-way-merge.ts`** implements block-level three-way merge with conflict detection. Resolution defaults to `'user-wins'`. **Only used for the source-mode toggle-back path, not for the disk bridge.**
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
│                       Project root                              │
│                                                                        │
│   .git/                       ← PROJECT repo                            │
│     openknowledge/            ← SHADOW (bare repo, nested inside .git/  │
│       HEAD, config, objects/    invisible to git transport/clone/push)  │
│       refs/wip/<branch>/      ← branch-scoped WIP attribution          │
│         human-<id>                                                      │
│         agent-<id>                                                      │
│         upstream                                                        │
│       refs/checkpoints/<branch>/<sha> ← branch-scoped checkpoints      │
│       refs/drafts/<name>      ← user-created drafts (within a branch)  │
│       rescue/<docName>.md     ← dirty-doc rescue buffers                │
│       ok-config.json          ← runtime config (content root, etc.)     │
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
│   Per-doc, per-branch state:                                           │
│     reconciledBase: Map<branch, Map<docName, string>>                  │
│     lastKnownBranch: string                                            │
│                                                                        │
│   Primitives:                                                          │
│     reconcile(base, ours, theirs) → result | conflict                  │
│     tombstone(docName) → rescue buffer if dirty                        │
│     rename(oldName, newName) → migrate Y.Doc                           │
│     enterResolutionMode(docName, base, ours, theirs)                   │
│     applyUpstreamImport(shadowRepo, newTreeSha)                        │
│     parkBranch(branch) → commit Y.Docs to shadow refs                  │
│     loadBranch(branch) → reset Y.Docs from disk                        │
│     restoreBranchWIP(branch) → 3-way merge parked WIP                  │
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
                 │ watches project's .git/HEAD, MERGE_HEAD, index.lock
                 │ tracks lastKnownBranch for cross-branch detection
                 │
                 └─── emits BatchBegin/BatchEnd
                      BatchEnd includes: withinBranch | crossBranch | detachedHead
```

### 9.2 Shadow repo layout and parameterization

**Init (`npx openknowledge init`):**

```typescript
async function initShadowRepo(projectRoot: string): Promise<ShadowRepoHandle> {
  // Resolve shadow location: inside .git/ if project repo exists, else .openknowledge/
  const projectGitDir = resolve(projectRoot, '.git');
  const hasProjectRepo = existsSync(projectGitDir) && statSync(projectGitDir).isDirectory();
  
  const shadowDir = hasProjectRepo
    ? resolve(projectGitDir, 'openknowledge')           // .git/openknowledge/
    : resolve(projectRoot, '.openknowledge');             // fallback for standalone

  if (!existsSync(shadowDir)) {
    await mkdir(shadowDir, { recursive: true });
    // Initialize as bare repo, then unset core.bare before setting core.worktree
    const git = simpleGit({ baseDir: projectRoot });
    await git.raw('init', '--bare', shadowDir);
    const sg = simpleGit().env({ GIT_DIR: shadowDir });
    await sg.raw('config', '--unset', 'core.bare');
    await sg.raw('config', 'core.worktree', projectRoot);
    await sg.raw('config', 'user.name', 'openknowledge');
    await sg.raw('config', 'user.email', 'noreply@openknowledge.local');
  }
  
  // In standalone mode, add .openknowledge/ to .gitignore
  if (!hasProjectRepo) {
    await ensureGitignoreEntry(projectRoot, '.openknowledge/');
  }
  // In integrated mode: no .gitignore needed — shadow is inside .git/
  
  return { gitDir: shadowDir, workTree: projectRoot };
}
```

**Parameterize `persistence.ts`:** Replace `const git = simpleGit(PROJECT_DIR, ...)` with a module-level handle constructed via `createPersistenceExtension({ shadowRepo, contentRoot })`. The L2 `commitToWipRef` function becomes `commitToWipRef({ gitDir, workTree, writerId })`, using `--git-dir` + `--work-tree` flags on every `git.raw()` call. `GIT_INDEX_FILE` becomes `<shadowDir>/index-wip` — still isolated, still scoped to the shadow.

**Content root parameterization:** `CONTENT_DIR` moves out of a module constant into the init config. A new `<shadow-parent>/openknowledge/config.json` holds `{ contentRoot: "content/docs", writerName: "Nick" }`. `safeContentPath` reads from this config.

### 9.3 Reconciliation module (new)

Create `packages/server/src/reconciliation.ts`:

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
  // Check for git conflict markers at line starts (covers merge, diff3, zdiff3 styles)
  return /^(<{7} |={7}$|>{7} |\|{7} )/m.test(content);
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

Create `packages/server/src/head-watcher.ts`:

```typescript
export type BatchKind = 'within-branch' | 'cross-branch' | 'detached-head';

export interface BatchEndInfo {
  headMoved: boolean;
  oldHead: string | null;
  newHead: string | null;
  batchKind: BatchKind;
  oldBranch: string | null;
  newBranch: string | null;
}

export async function startHeadWatcher(
  parentGitDir: string,
  onBatchBegin: (reason: BatchReason) => void,
  onBatchEnd: (info: BatchEndInfo) => void,
): Promise<AsyncSubscription> {
  let batchInProgress = false;
  let lastHeadSha: string | null = null;
  let lastKnownBranch: string | null = null;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;

  const resolveHead = () => {
    try { return readFileSync(resolve(parentGitDir, 'HEAD'), 'utf-8').trim(); }
    catch { return null; }
  };

  const resolveBranch = (headContent: string | null): string | null => {
    if (!headContent) return null;
    if (headContent.startsWith('ref: refs/heads/')) {
      return headContent.slice('ref: refs/heads/'.length);
    }
    // Detached HEAD — raw SHA
    return `detached-${headContent.slice(0, 12)}`;
  };

  lastHeadSha = resolveHead();
  lastKnownBranch = resolveBranch(lastHeadSha);

  return subscribe(parentGitDir, (err, events) => {
    if (err) return;
    for (const e of events) {
      const base = basename(e.path);
      if (base === 'HEAD' || base === 'MERGE_HEAD' || base === 'ORIG_HEAD' || base === 'index.lock') {
        if (!batchInProgress) {
          batchInProgress = true;
          onBatchBegin({ trigger: base });
        }
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(() => {
          const newHead = resolveHead();
          const newBranch = resolveBranch(newHead);
          const headMoved = newHead !== null && newHead !== lastHeadSha;

          let batchKind: BatchKind;
          if (newBranch?.startsWith('detached-')) {
            batchKind = 'detached-head';
          } else if (lastKnownBranch !== newBranch) {
            batchKind = 'cross-branch';
          } else {
            batchKind = 'within-branch';
          }

          onBatchEnd({
            headMoved,
            oldHead: lastHeadSha,
            newHead,
            batchKind,
            oldBranch: lastKnownBranch,
            newBranch,
          });

          lastHeadSha = newHead;
          lastKnownBranch = newBranch;
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

async function onBatchEnd(info: BatchEndInfo) {
  batchInProgress = false;

  switch (info.batchKind) {
    case 'within-branch': {
      // Pull, merge, rebase on the same branch — reconcile as before
      const events = drainBufferedFileEvents();
      for (const ev of events) await handleExternalChange(ev);
      if (info.headMoved) {
        await commitUpstreamImport(info.oldHead, info.newHead, info.newBranch!);
      }
      break;
    }
    case 'cross-branch':
    case 'detached-head': {
      // Branch switch — park, load, optionally restore
      drainBufferedFileEvents(); // discard — we're loading fresh state
      await loadBranch(info.newBranch!);
      if (info.batchKind === 'cross-branch') {
        await restoreBranchWIP(info.newBranch!);
      }
      // Write upstream-import under the NEW branch scope, not the old one
      await commitUpstreamImport(info.oldHead, info.newHead, info.newBranch!);
      break;
    }
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
async function commitUpstreamImport(
  oldHead: string | null,
  newHead: string,
  branch: string,
): Promise<void> {
  const env = { GIT_INDEX_FILE: resolve(shadowDir, 'index-import') };
  const git = shadowGit();
  try {
    const shadowHead = await safeRevParse(`refs/wip/${branch}/upstream`);
    if (shadowHead) {
      const headTree = (await git.raw('rev-parse', `${shadowHead}^{tree}`)).trim();
      await git.env(env).raw('read-tree', headTree);
    }
    await git.env(env).raw('add', contentRoot);
    const treeSha = (await git.env(env).raw('write-tree')).trim();
    const parentSha = shadowHead;
    const message = oldHead
      ? `upstream: import from ${oldHead.slice(0, 8)}..${newHead.slice(0, 8)}`
      : `upstream: initial import at ${newHead.slice(0, 8)}`;
    const args = ['commit-tree', treeSha, '-m', message];
    if (parentSha) args.push('-p', parentSha);
    const authorEnv = {
      ...env,
      GIT_AUTHOR_NAME: 'upstream',
      GIT_AUTHOR_EMAIL: 'noreply@openknowledge.local',
      GIT_COMMITTER_NAME: 'openknowledge',
      GIT_COMMITTER_EMAIL: 'noreply@openknowledge.local',
    };
    const commitSha = (await git.env(authorEnv).raw(...args)).trim();
    await git.raw('update-ref', `refs/wip/${branch}/upstream`, commitSha);
  } finally {
    try { unlinkSync(resolve(shadowDir, 'index-import')); } catch {}
  }
}
```

### 9.7 Shadow branch runtime (park / load / restore)

Branch switches are the one case where reconciliation is the **wrong** primitive. Reconciling old-branch Y.Doc state against new-branch disk state would bleed edits across branches. Instead, branch switches follow a **park → load → restore** sequence:

```typescript
async function parkBranch(branch: string): Promise<void> {
  const git = shadowGit();
  const env = { GIT_INDEX_FILE: resolve(shadowDir, `index-park-${branch}`) };

  try {
    for (const [docName, document] of hocuspocus.documents) {
      const markdown = serializeYDocToMarkdown(document);
      const diskSnapshot = reconciledBase.get(branch)?.get(docName) ?? markdown;

      // Write Y.Doc state + disk snapshot into a park commit
      // The disk snapshot serves as merge base for future WIP restoration
      const blobSha = (await git.env(env).raw('hash-object', '-w', '--stdin', { input: markdown })).trim();
      const baseSha = (await git.env(env).raw('hash-object', '-w', '--stdin', { input: diskSnapshot })).trim();
      await git.env(env).raw('update-index', '--add', '--cacheinfo', `100644,${blobSha},${docName}`);
      await git.env(env).raw('update-index', '--add', '--cacheinfo', `100644,${baseSha},.park-base/${docName}`);
    }

    const treeSha = (await git.env(env).raw('write-tree')).trim();
    const parentSha = await safeRevParse(`refs/wip/${branch}/human-${sessionId}`);
    const args = ['commit-tree', treeSha, '-m', `park: branch context at ${new Date().toISOString()}`];
    if (parentSha) args.push('-p', parentSha);
    const commitSha = (await git.raw(...args)).trim();
    await git.raw('update-ref', `refs/wip/${branch}/human-${sessionId}`, commitSha);
  } finally {
    try { unlinkSync(resolve(shadowDir, `index-park-${branch}`)); } catch {}
  }
}

async function loadBranch(branch: string): Promise<void> {
  // Switch reconciledBase scope
  if (!reconciledBase.has(branch)) {
    reconciledBase.set(branch, new Map());
  }

  for (const [docName, document] of hocuspocus.documents) {
    const filePath = docNameToPath(docName, contentRoot);
    if (!existsSync(filePath)) {
      // File doesn't exist on new branch — tombstone
      await tombstoneDoc(docName, document);
      continue;
    }
    const content = readFileSync(filePath, 'utf-8');
    applyMarkdownToYDoc(document, content);
    reconciledBase.get(branch)!.set(docName, content);
  }
}

async function restoreBranchWIP(branch: string): Promise<void> {
  const git = shadowGit();
  const parkRef = await safeRevParse(`refs/wip/${branch}/human-${sessionId}`);
  if (!parkRef) return; // No prior WIP for this branch

  const parkCommit = await git.raw('log', '-1', '--format=%s', parkRef);
  if (!parkCommit.trim().startsWith('park:')) return; // Latest commit isn't a park

  for (const [docName, document] of hocuspocus.documents) {
    try {
      // Read parked Y.Doc state
      const parkedContent = (await git.raw('show', `${parkRef}:${docName}`)).trim();
      // Read parked disk snapshot (merge base)
      const parkedBase = (await git.raw('show', `${parkRef}:.park-base/${docName}`)).trim();
      const currentDisk = reconciledBase.get(branch)?.get(docName);
      if (!currentDisk || !parkedContent) continue;

      if (parkedContent === parkedBase) continue; // No in-flight edits were parked

      // Three-way merge: base=parked disk snapshot, ours=parked Y.Doc, theirs=current disk
      const outcome = reconcile({
        docName,
        base: parkedBase,
        ours: parkedContent,
        theirs: currentDisk,
      });

      switch (outcome.kind) {
        case 'merged':
          applyMarkdownToYDoc(document, outcome.newContent);
          reconciledBase.get(branch)!.set(docName, outcome.newContent);
          break;
        case 'conflicts':
          applyMarkdownToYDoc(document, outcome.newContent);
          publishConflicts(document, outcome.conflicts);
          reconciledBase.get(branch)!.set(docName, outcome.newContent);
          break;
        case 'noop':
        case 'clean':
        case 'refused':
          break; // Current disk state is fine as-is
      }
    } catch {
      // Parked file may not exist in this commit — skip silently
    }
  }
}
```

**Detached HEAD cleanup:** When a `cross-branch` batch transitions *from* a `detached-<sha>` context to a named branch, the detached context's shadow refs (`refs/wip/detached-<sha>/*`) are scheduled for deletion. If any Y.Docs were dirty at park time, rescue buffers are created before deletion.

**Branch deletion GC:** A periodic scan (on startup + every 24h) compares `refs/wip/*` branch prefixes against the project repo's branch list (`git branch --list`). Shadow branches with no corresponding project branch and no activity in the last 24h have their WIP refs deleted. Checkpoint refs (`refs/checkpoints/<branch>/*`) are retained because they reference durable project-repo commit SHAs.

**Branch rename detection:** When `BatchEnd` detects a cross-branch switch where the old branch no longer exists in the project repo and the new branch has the same HEAD SHA, it's treated as a rename. Shadow refs are migrated: `refs/wip/<old>/*` → `refs/wip/<new>/*`.

### 9.8 Per-writer WIP refs

Writer identity is derived from the transaction origin that caused the L1 write:
- User edits via browser client → writer = `human-<session-hash>` (where session hash is the stable identity from `presence/identity.ts`)
- Agent writes via DirectConnection → writer = `agent-<agent-id>` (from the DC session)
- File-watcher imports → writer = `upstream` (handled by `commitUpstreamImport`)

`onStoreDocument` inspects the document's last `transaction.origin` (or a side-channel map of writer identity per doc, if origin is ambiguous) and routes the L2 commit to `refs/wip/<lastKnownBranch>/<writer-id>`. The active project branch is resolved from the HEAD watcher's `lastKnownBranch` cache. The shadow repo grows a small number of refs over time (one per active writer per visited branch), which is fine — inactive branches are GC'd per FR31.

**Checkpoint / Save Version** is a two-repo operation:

1. **Project repo commit.** Collect all per-writer deltas since the last checkpoint. Create a real commit on the project repo's current branch with the merged content. Default: single commit with `Co-authored-by:` trailers for each writer. Power-user option: one commit per writer in temporal order. The commit is created via `commit-tree` plumbing + `update-ref` to avoid touching the user's staging area (uses a temporary `GIT_INDEX_FILE`).

2. **Shadow checkpoint bookmark.** Write `refs/checkpoints/<lastKnownBranch>/<project-commit-sha>` in the shadow pointing at the current shadow HEAD state. The checkpoint commit stores the **full content tree snapshot** (not just the SHA), so the shadow is self-contained and survives project-repo history rewrites (rebase, force-push). If the project repo later rewrites the commit (e.g., `git rebase`), the shadow's checkpoint ref becomes an annotation on a rewritten SHA but the tree snapshot remains valid for attribution queries.

3. **WIP ref reset.** After checkpointing, per-writer WIP refs are reset (or fast-forwarded) so subsequent WIP commits track only post-checkpoint deltas.

Upstream-import commits are *not* included in the Save Version commit — they represent content that already entered the project repo via `git pull` and are already part of the project's history.

### 9.9 Lifecycle event module

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

### 9.10 Affected routes / pages / files

| File | Change |
|---|---|
| `packages/server/src/persistence.ts` | Parameterize `gitDir`, `contentRoot`, writer identity. Add `reconciledBase` map. Gate writes on `batchInProgress`. |
| `packages/server/src/file-watcher.ts` | Emit `DiskEvent` taxonomy. Remove "ignore delete" branch. Add rename detection. |
| `packages/app/src/server/hocuspocus-plugin.ts:418-449` | Replace `handleExternalChange` with the reconciliation-aware version. Wire `Y.Map('conflicts')` and `Y.Map('lifecycle')`. |
| `packages/server/src/reconciliation.ts` | **New**. `reconcile()` primitive, conflict-marker detection, rescue buffer management. |
| `packages/server/src/head-watcher.ts` | **New**. Project `.git/HEAD` subscription, `BatchBegin`/`BatchEnd` dispatch, branch detection (`lastKnownBranch`), `BatchKind` classification. |
| `packages/server/src/shadow-repo.ts` | **New**. `initShadowRepo`, `commitUpstreamImport`, per-writer ref management, `parkBranch`, `loadBranch`, `restoreBranchWIP`. |
| `packages/server/src/shadow-branch-gc.ts` | **New**. Periodic scan for orphaned shadow branch refs. Detached HEAD cleanup. Branch rename migration. |
| `packages/app/src/editor/three-way-merge.ts` | Add markdown-level `blockLevelThreeWayMerge(base, ours, theirs)` entry point alongside existing Y.XmlFragment one. |
| `packages/app/src/App.tsx` (or new component) | Conflict banner UI reading from `Y.Map('conflicts')`; lifecycle banner reading from `Y.Map('lifecycle')`. |
| `<shadow-parent>/openknowledge/config.json` | **New**. Runtime config for content root + writer identity. |
| `bin/init.ts` | **New (or extension of existing init)**. Creates shadow repo, writes `.gitignore`, writes config. |

### 9.11 Data flow — happy-path `git pull`

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
  - commitUpstreamImport(oldHead, newHead) writes refs/wip/<branch>/upstream
    ↓
Browser clients observe Y.Doc updates via HocuspocusProvider
    ↓
(If any conflicts) Y.Map('conflicts') observer fires → conflict banner UI
```

### 9.12 Data flow — `git checkout` (cross-branch switch)

```
User terminal: git checkout feature-xyz
    ↓
.git/index.lock appears
    ↓
head-watcher detects index.lock → emits BatchBegin
    ↓
persistence.ts: batchInProgress = true
  - parkBranch(lastKnownBranch):
    - for each open Y.Doc: serialize to markdown from memory
    - commit Y.Doc state + disk snapshot to refs/wip/<branch>/human-<id>
  - suspend L1/L2 writes
    ↓
Git checkout completes → working tree files updated to feature-xyz
  - .git/index.lock disappears
  - .git/HEAD moves to feature-xyz ref
    ↓
parcel-watcher fires N Update events for content files
  - Buffered while batchInProgress is true
    ↓
head-watcher: 100ms of quiet → BatchEnd
  - resolves newBranch = "feature-xyz"
  - lastKnownBranch = "main" ≠ "feature-xyz" → batchKind = cross-branch
    ↓
onBatchEnd (cross-branch):
  - drainBufferedFileEvents() — discarded (loading fresh state)
  - loadBranch("feature-xyz"):
    - switch reconciledBase to feature-xyz scope
    - reset all Y.Docs from new branch disk content
    - tombstone docs that don't exist on feature-xyz
  - restoreBranchWIP("feature-xyz"):
    - if refs/wip/feature-xyz/human-<id> exists with a park commit:
      - for each doc: 3-way merge (parked-base, parked-ydoc, current-disk)
      - auto-merge non-overlapping; surface conflicts if overlapping
  - commitUpstreamImport(oldHead, newHead) on feature-xyz scope
  - lastKnownBranch = "feature-xyz"
    ↓
Browser clients observe Y.Doc resets via HocuspocusProvider
  - Content shows feature-xyz state (+ restored WIP if any)
  - No old-branch edits bleed through
```

### 9.13 Alternatives considered (cut)

See `evidence/design-reasoning.md` for the full four-candidate comparison. Summary:

- **Candidate B — git-native with namespaced refs in project repo** (cut, NG1). Trades elegance for composability failure: project-repo pollution, `git push --mirror` footgun, inability to do per-op attribution within batch commits, no clean uninstall.
- **Candidate C — CRDT-canonical with disk as projection** (cut, NG2). Internally inconsistent with the spike's actual behavior (Y.Doc is never persisted), violates CC7 file-portability, forces a "files are stale projections" mental model that breaks user expectations.
- **Candidate D — event-sourced log as source of truth** (cut). Theoretically cleanest but doesn't eliminate the reconciliation problem (external writes still have to be imported as events), requires abandoning git tooling, and has no ecosystem support.
- **Candidate A** (chosen). Disk-canonical + session CRDT + isolated shadow repo + three-way merge + lifecycle events + project-repo-awareness. Satisfies every axiom and enables local reasoning about correctness.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Shadow bare repo at `.git/openknowledge/` is the **attribution journal** (not the durable history layer) | T | LOCKED | No | Shadow holds fine-grained per-writer WIP attribution between Save Versions. Nested inside `.git/` — invisible to git transport, untouched by git maintenance (see `reports/git-directory-nesting-shadow-repo/`). Clean uninstall = `rm -rf .git/openknowledge/`. Falls back to `.openknowledge/` in standalone mode (no project `.git/`). | See `evidence/design-reasoning.md`, `reports/git-directory-nesting-shadow-repo/` | No `.gitignore` needed; repo-local storage; concurrent writers against the same shadow root are prevented by lock; resolves STORIES.md #6 |
| D2 | Disk is the source of truth; Y.Doc is a session cache | T | LOCKED | Yes | Matches CC6 (files are canonical) + CC7 (portability) + spike's actual behavior (no Y.Doc persistence). Any alternative requires a new persistence layer and conflicts with file-portability. | `persistence.ts:150-219` — hydration is `markdown → PM → Y.Doc`, no binary | Y.Doc can always be reconstructed from disk; crash recovery is the 2–10s L1 debounce window |
| D3 | Three-way merge is the only sync primitive for disk → Y.Doc | T | LOCKED | No | 2-way `updateYFragment` silently destroys in-flight edits when the Y.Doc is dirty. 3-way merge is required for correctness under any external writer. | `hocuspocus-plugin.ts:431-443` bug analysis | `three-way-merge.ts` gains a markdown-level entry point; `reconciledBase` is required state |
| D4 | Block-level merge granularity (paragraph/heading/code-fence) | T | DIRECTED | No | Matches the existing `three-way-merge.ts` module. Fine-grained is NG10 — revisit only if false conflicts are a practical problem. | `three-way-merge.ts` `splitMarkdownBlocks` | Users see "this paragraph has a conflict" not "this word has a conflict" |
| D5 | Overlapping conflicts surface via `Y.Map('conflicts')` side-channel, never silently resolved | P | LOCKED | No | "User wins" or "theirs wins" hides upstream authorship decisions and destroys data. Surfacing is the only trust-preserving option. | NG3 | UI must render conflict badges; lives in future UX spec for conflict resolution |
| D6 | Git merge conflict markers trigger resolution mode; editor becomes read-only | P | LOCKED | Yes | Parsing `<<<<<<<` as markdown corrupts the Y.Doc irreversibly. Resolution mode is the only safe option. | File-watcher path analysis | Requires conflict-marker regex in reconciliation layer; new banner UI |
| D7 | File deletes tombstone open Y.Docs with optional rescue buffer | P | DIRECTED | No | Current "ignore delete" re-creates deleted files. Tombstoning + rescue matches user expectations. | `file-watcher.ts:74-77` | Rescue buffers live in `<shadow-parent>/openknowledge/rescue/*.md` with 24h retention |
| D8 | Renames detected via delete+create pair with matching content hash | T | DIRECTED | No | @parcel/watcher reports renames as independent delete+create on macOS. Hash-matching within 200ms pairs them reliably. | parcel-watcher semantics | Pairing window is 200ms (configurable); false positives possible if two unrelated files share content |
| D9 | `.git/HEAD` + `MERGE_HEAD` + `index.lock` watcher for batch detection | T | DIRECTED | No | Batches multi-file changes as one reconciliation pass. Required for upstream-import attribution to cover the entire pull atomically. | Git's operational model — HEAD moves only on commit completion | HEAD watcher only active when project `.git` exists; standalone mode skips it |
| D10 | `BatchBegin` flushes pending L1 writes; `batchInProgress` gates further writes | T | LOCKED | Yes | Without pre-batch flush, the last 2s of user edits can be clobbered by the incoming pull. Without `batchInProgress`, a save mid-pull interleaves states and breaks git merge. | Race analysis in conversation turn 5 | L1 quiet period extends L1 debounce window implicitly; no user-visible effect on normal editing |
| D11 | Upstream-import commits authored by `upstream`, not the user | T | LOCKED | Yes | Without this, shadow repo blame attributes upstream's diff to whoever saved next. Breaks Bucket 3 attribution. | Shadow repo race analysis | Adds a `refs/wip/<branch>/upstream` ref per branch; checkpoint bookmarks via `refs/checkpoints/<branch>/<sha>` |
| D12 | Per-writer, per-branch WIP refs (`refs/wip/<branch>/<writer-id>`) replace single `refs/wip/main` | T | DIRECTED | No | Supports multi-writer attribution natively via git primitives, scoped per project branch to prevent cross-branch contamination (D28). Checkpoint squash-merges all writer refs for the active branch with co-authored-by trailers. | Bucket 3 requirement for per-op attribution | Small number of refs per branch (typically 1 human + N agents + 1 upstream); inactive branches GC'd per FR31 |
| D13 | Standalone mode is the same protocol minus project-repo-awareness | T | DIRECTED | No | One code path, two deployments. Standalone loses `BatchBegin/End` batching but keeps every other invariant. | G8 | Tests cover both modes; no feature flags distinguish them |
| D14 | `reconciledBase` is in-memory only, rebuilt from disk on restart | T | DIRECTED | No | Persisting it adds complexity for no benefit — on restart, `onLoadDocument` reads fresh content which becomes the new base. | G7 local reasoning invariant | Edge case: if the Hocuspocus process crashes mid-reconciliation, the base is lost for active docs; next hydration uses current disk as base (safe) |
| D15 | Content root is parameterized via `<shadow-parent>/openknowledge/config.json` | T | DIRECTED | No | Hardcoded `../../content` in the spike works only for standalone. Integrated mode needs `content/docs` (Fumadocs), `docs` (Mintlify), or user-chosen paths. | `persistence.ts:25` | `bin/init.ts` sets this at init time; can be edited by hand later |
| D16 | `handleExternalChange` dispatches on `DiskEvent` kind, not raw parcel events | T | DIRECTED | No | First-class event taxonomy lets each lifecycle have dedicated handling. Current spike's switch statement can't distinguish rename from delete. | `file-watcher.ts:74-95` | Replaces direct parcel-watcher callbacks; adds a buffer-and-drain layer for batching |
| D17 | Block-level merge module reused, not rewritten | T | DIRECTED | No | `three-way-merge.ts` already implements the hard part. Adding a markdown-level entry point is ~50 lines. | `three-way-merge.ts:1-80` | Two callers (source-toggle + disk-bridge) share the same merge logic |
| D18 | L1 atomic write remains temp+rename; L2 isolated via `GIT_INDEX_FILE` (unchanged) | T | LOCKED | No | Already validated in TQ20. No reason to change. | `persistence.ts:197-216` | Shadow repo's L2 uses `<shadowDir>/index-wip` instead of `.git/index-wip` |
| D19 | Shadow lives inside `.git/openknowledge/` — no `.gitignore` modification needed in integrated mode | P | LOCKED | Yes | Nesting inside `.git/` eliminates the `.gitignore` requirement entirely. Shadow is invisible to `git clone`, `git push --mirror`, `git status`. Established pattern: git-lfs (`.git/lfs/`), git-annex (`.git/annex/`), Cursor (`.git/cursor/`). In standalone mode, `.openknowledge/` in project root with optional `.gitignore`. | `reports/git-directory-nesting-shadow-repo/` | Better for worktrees (shared via main `.git/`); zero working-tree footprint |
| D20 | Follow-branch-switch semantics on `git checkout` via **park + load**, not reconcile | P | LOCKED | No | Editor's view tracks `cat`. In-flight edits are parked in branch-scoped shadow refs, not merged into the new branch's content. The park + load sequence prevents cross-branch edit contamination while preserving the user's draft work for later restoration. | See §5 P1 branch-switch journey, §9.7 shadow branch runtime | Default is follow with park/restore; settings toggle may surface later |
| D21 | HEAD movements dispatch on `BatchKind`: within-branch reconciles, cross-branch parks + loads | P | LOCKED | No | Within-branch movements (pull, merge, rebase) reconcile via three-way merge as before. Cross-branch movements (checkout, switch) use the park → load → restore sequence to prevent edit contamination. The HEAD watcher classifies each `BatchEnd` as `within-branch`, `cross-branch`, or `detached-head` by comparing `lastKnownBranch` to the resolved new branch. | §9.5 `BatchKind` classification; reconcile and park+load are fundamentally different operations | Two code paths at `BatchEnd` dispatch, unified by `BatchKind` enum |
| D22 | Rescue buffers live in `<shadow-parent>/openknowledge/rescue/<docName>.md` with 24h retention | P | DIRECTED | No | Filesystem is the simplest durable store; 24h matches VS Code's "recent closed" window. | — | `GET /api/rescue` lists; manual cleanup after 24h |
| D23 | Upstream-import commits do NOT replay individual upstream commits; they're a single tree snapshot | T | DIRECTED | No | Preserves shadow repo simplicity; upstream's actual commit history lives in the project repo for browsing via normal `git log`. Shadow history is "how openknowledge saw the world change," not a mirror of upstream. | Simplicity principle | Shadow repo is not a mirror; two-repo mental model |
| D24 | Save Version creates real commits on the project repo | P | LOCKED | Yes | The project repo holds durable history; the shadow is an ephemeral attribution journal. Save Version is the graduation point where WIP becomes real project history. Default: single commit with co-authored-by trailers. Power-user option: per-writer commits in temporal order. | Conversation design session 2026-04-08 | `commit-tree` plumbing + temporary `GIT_INDEX_FILE` avoids touching user's staging area; project `git log` shows meaningful save points |
| D25 | Checkpoint refs in shadow store full content tree snapshots (Option 1) | T | LOCKED | No | Shadow must be self-contained and survive project-repo history rewrites (rebase, force-push). Storing only the project SHA would break the shadow↔project mapping when SHAs change. Full tree snapshot means the shadow's attribution queries work regardless of project-repo state. | Conversation design session 2026-04-08 — evaluated 3 options: (1) full tree, (2) re-anchor on pull, (3) don't care | Shadow is portable — could survive migration to a different project repo clone |
| D26 | Shadow corruption is graceful degradation, not catastrophic | T | LOCKED | No | Since Save Version commits live in the project repo, losing the shadow loses fine-grained who-wrote-what detail but NOT the content. `rm -rf .openknowledge && openknowledge init` recovers a working state. This significantly de-risks the shadow repo compared to the original spec where shadow was the sole history layer. | D24 makes the project repo the durable history | Q7 (corruption recovery) drops from medium impact to low impact |
| D27 | One active writer per shadow root in Now | T | LOCKED | Yes | The primary multi-worktree hazard in Now is concurrent mutation of the same shadow root, which would mix WIP attribution, checkpoint state, and reconciliation history across checked-out worlds. A repo-local writer lock preserves correctness without requiring full multi-worktree design in v1. | Conversation analysis during spec review | Different repositories may run concurrently; multiple writer instances for the same shadow root are rejected until worktree-aware namespacing is added |
| D28 | WIP refs, checkpoints, and `reconciledBase` are branch-scoped | T | LOCKED | No | Without branch scoping, the shadow's WIP history conflates edits across project branches. Attribution for "what did I write on `main`?" becomes a puzzle of parsing upstream-import commit messages. Branch scoping gives each project branch its own clean attribution timeline. | Analysis of branch-switch UX during spec review | `refs/wip/<branch>/<writer-id>`, `refs/checkpoints/<branch>/<sha>`, `reconciledBase: Map<branch, Map<docName, string>>` |
| D29 | Branch switch is park + load, not reconcile | T | LOCKED | Yes | Reconciling old-branch Y.Doc state against new-branch disk content would merge edits across branches — directly contradicting the user's intent to switch contexts. The park → load → restore sequence preserves each branch's editing context independently. Additionally, L1 continuous writes keep the working tree dirty, which would cause `git checkout` to refuse unless we avoid writing old-branch state to disk at the wrong time. | Branch-switch race analysis; L1 dirty working tree blocks `git checkout` | Parking commits from Y.Doc memory (not disk); `BatchKind` classification in HEAD watcher; `loadBranch` resets Y.Docs rather than reconciling |
| D30 | Detached HEAD gets a `detached-<sha>` context, GC'd on next named-branch checkout | T | DIRECTED | No | Detached HEAD is uncommon but must not crash. A fallback context name prevents null-branch errors. Aggressive GC (cleanup on next named-branch checkout, with rescue buffers for dirty state) prevents unbounded accumulation of orphaned contexts. | Edge case analysis | Detached contexts are ephemeral; if the user commits on detached HEAD and creates a branch, the context migrates to the new branch name |
| D31 | Shadow branch lifecycle mirrors project branch lifecycle | T | DIRECTED | No | Branch deletion in the project repo should clean up shadow WIP refs (with 24h grace period). Branch rename should migrate shadow refs. Without lifecycle mirroring, the shadow accumulates orphaned refs from deleted/renamed branches. | Shadow ref growth analysis | Periodic scan on startup + 24h interval; checkpoint refs retained (reference durable project commits); rename detection via HEAD SHA matching |
| D32 | Shadow branches are 1:1 with project branches; drafts are a separate namespace | P | DIRECTED | No | Shadow branches are *automatic* — every project branch gets implicit branch-scoped WIP state. Drafts (`refs/drafts/<name>`) are *user-created* named editing contexts within a branch. The two compose: a draft lives within a shadow branch context. This avoids conflating "I switched git branches" with "I created an alternative version of this content." | Conversation analysis distinguishing shadow branches from drafts | Shadow branches use the reconciliation + park/load machinery; drafts use the Bucket 5 UX for create/apply/delete |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | What exactly triggers `reconciledBase` initialization for a document that was never loaded before an external event? | T | P0 | No | When a closed doc receives an `Update` event, set `reconciledBase[docName] = content` as a side effect (so the next `onLoadDocument` starts with a consistent base). Documented in §9.4. | Decided |
| Q2 | What's the conflict-marker regex, exactly? Git's markers can vary under custom merge drivers or diff3 style. | T | P0 | No | `^(<{7} \|={7}$\|>{7} \|\|{7} )/m`. Tested against all three git conflict styles: `merge` (default), `diff3`, and `zdiff3` (git 2.35+). The `\|\|\|\|\|\|\|` marker appears in diff3/zdiff3 styles as the base-version separator. All four markers are line-start anchored. | Decided — regex covers all styles |
| Q3 | On `git checkout` with in-flight edits that conflict with the target branch, do we follow or pause? | P | P1 | No | D20 + D29: default follow via park + load. In-flight edits are parked to the old branch's shadow refs (not merged into the new branch). On switch-back, parked WIP is restored via three-way merge; overlapping edits surface as conflicts. This supersedes the original "reconcile on branch switch" approach. | Decided — park + load, not reconcile |
| Q4 | How does `git reset --hard <far-commit>` get detected vs a normal checkout? | T | P1 | No | **Closed — distinction unnecessary.** Both move HEAD and change the working tree. Three-way merge handles both correctly: non-overlapping in-flight edits survive (good for checkout, harmless for reset); overlapping edits surface as conflicts (user resolves). No need to detect reset specifically. D21 simplified accordingly. | Decided — treat both as "HEAD moved, reconcile" |
| Q5 | What author identity does a human's WIP commits use — the editor's own identity, or the project repo's `user.name`/`user.email`? | T | P1 | No | For attribution clarity, use the openknowledge presence identity (`ok-user-name` from localStorage). Can be overridden via `<shadow>/config.json` to match project git config if the user prefers. | Decided — openknowledge identity with override |
| Q6 | Shadow repo `git gc` — who runs it, when? | T | P2 | No | Cron-style cleanup inside openknowledge server on startup if the shadow repo hasn't been gc'd in 7 days. `git gc --auto` in the shadow. Never touches the project repo. | Decided — startup check |
| Q7 | What happens when the shadow repo is corrupted (manual mucking, disk fault)? | T | P2 | No | Detect on startup via `git fsck`. On failure, rename the broken shadow to `openknowledge.broken-<timestamp>` and create a fresh shadow. User loses attribution detail but not content (Save Versions are in project repo). | Decided — reinit on corruption |
| Q8 | Rename detection on Linux: is the 200ms hash window reliable? | T | P1 | No | **Empirically confirmed on macOS:** `@parcel/watcher` delivers rename as delete+create in the **same event batch** (0ms gap). Hash matching within each batch is sufficient — the 200ms timer is unnecessary for same-batch events. Linux inotify delivers `IN_MOVED_FROM` + `IN_MOVED_TO` synchronously, which parcel-watcher maps to delete+create in the same batch. Fallback (treat as independent delete+create) remains safe. | Decided — hash-match within batch; 200ms timer as fallback for cross-batch |
| Q9 | What if the user has uncommitted staged changes in the project repo when openknowledge starts up? | P | P1 | No | **Closed.** `reconciledBase` initializes from current disk state via `onLoadDocument` (reads the file as it exists on disk). Staged changes are irrelevant — disk content is what matters, and disk reflects whatever the user has written (staged or not). No special handling needed. | Decided — reconciledBase from disk state, no git-index awareness |
| Q10 | What happens when a second openknowledge writer instance starts against the same shadow root? | T | P0 | No | **Closed.** The second instance fails startup unless the existing lock is proven stale. Lock metadata records owner `pid`, `hostname`, `startedAt`, and `worktreeRoot`; stale locks may be replaced conservatively. | Decided — exclusive shadow-root writer lock |
| Q11 | Multi-writer concurrent writes to the same block — what does attribution look like? | T | P2 | No | If human and agent both edit the same paragraph within one L2 debounce window, the shadow commit is authored by whoever's WIP ref advances first. Second writer's delta attributed to them in their own WIP ref. Checkpoint merges via co-authored-by trailers. | Decided — per-writer refs handle it |
| Q12 | Is `refs/heads/main` in the shadow repo meaningful? | T | P2 | No | **Closed — removed.** With Save Version creating real project repo commits (D24) and checkpoint refs bookmarking shadow state (D25), `refs/heads/main` in the shadow is vestigial. The shadow's ref namespace is: `refs/wip/<branch>/*` (per-writer, per-branch WIP), `refs/checkpoints/<branch>/*` (Save Version bookmarks), `refs/drafts/*` (user-created drafts). No `refs/heads/main` needed. | Decided — removed from shadow |
| Q13 | How are drafts represented in the shadow repo, and what happens when upstream pulls land on a draft? | T | P0 | No | Drafts are `refs/drafts/<name>` branched from the latest `refs/checkpoints/<branch>/*` at creation. Drafts live *within* a shadow branch context — they are user-created named editing alternatives, distinct from shadow branches which are automatic 1:1 mirrors of project branches (D32). On upstream-import, drafts are rebased onto the new checkpoint. If rebase fails, draft enters resolution mode. Full draft model is a follow-up spec under Bucket 5. | Partial — storage model decided, relationship to shadow branches clarified (D32), UX deferred |
| Q14 | Does the shadow repo need any kind of garbage-collection limit for deep histories (months/years of WIP)? | T | P2 | No | `git gc --auto` with standard thresholds. If history gets unwieldy, we can add a "archive WIPs older than N days" pass. Not an MVP concern. | Deferred |
| Q15 | What about files openknowledge does NOT care about (non-markdown, outside content root) that change during a pull? | T | P1 | No | File-watcher is scoped to `contentRoot` via `safeContentPath`. Non-content files trigger zero openknowledge behavior. HEAD watcher still fires (it's on `.git/HEAD`), so `BatchBegin/End` still wrap the pull, but there are no content-file events to reconcile. Upstream-import commit reflects only the content-root subtree. | Decided |
| Q16 | How does this interact with `Y.Map('activity')` from the presence spec? | T | P0 | No | Reconciliation transactions use origin `'reconciliation'`, not `'agent-write'`. They don't write to `Y.Map('activity')` — the presence spec's flash plugin ignores them. Upstream imports optionally write to `Y.Map('lifecycle')` for a "Synced with upstream" indicator (FR19). | Decided |
| Q17 | What happens if `.git/HEAD` watcher fires for a `git stash pop` that restores conflicting changes? | T | P2 | No | `stash pop` can produce conflict markers. Reconciliation sees them and enters resolution mode per D6. User resolves normally. | Decided — same path as any conflict |
| Q18 | Can the project repo be a submodule? | T | P2 | No | Submodules have their own `.git/` pointer files. Reconciliation should work, but `.git/HEAD` watching needs to resolve the real gitdir. Defer empirical validation. | Deferred |
| Q19 | Does the `BatchEnd` upstream-import commit happen even when no content files changed in the pull (e.g., upstream only changed `package.json`)? | T | P2 | No | No — `commitUpstreamImport` checks whether the content tree actually differs from the previous shadow HEAD tree. If identical, skip the commit. | Decided |
| Q20 | How is the shadow repo presented in the Bucket 4 timeline UI? | P | P1 | No | Timeline reads from `refs/checkpoints/*` + `refs/wip/*`, renders Save Versions prominently and auto-saves collapsed. Upstream-import commits appear as a distinct "Synced with upstream" entry type. Full UX is in the Bucket 4 timeline spec (separate). | Deferred to Bucket 4 spec |
| Q21 | Is the content hash in `writeTracker` the right thing to match against for self-write detection when the reconciliation path does its own writes? | T | P0 | No | Yes — reconciliation writes go through `onStoreDocument` which calls `registerWrite(filePath, contentHash(markdown))` as today. The reconciled content is what ends up in both Y.Doc and disk, so the hash matches on the next parcel event and self-write detection still works. | Decided |
| Q22 | WIP restoration staleness — how old is too old to auto-restore? | P | P1 | No | For now, always restore if parked WIP exists. The three-way merge against current disk content handles divergence safely. If the merge produces excessive conflicts (e.g., the branch was rebased significantly since the WIP was parked), the user sees conflict badges and can dismiss them. A staleness policy (e.g., "don't auto-restore WIP older than 7 days") could be added later if user testing shows it's needed. | Decided — always restore, let merge handle staleness |
| Q23 | What if the user creates a brand-new branch (`git checkout -b new-feature`) — is there any shadow state to load? | T | P1 | No | No — the new branch starts with the same disk content as the branch it was created from. `loadBranch` creates a fresh `reconciledBase` scope, hydrates Y.Docs from disk (which haven't changed), and there's no parked WIP to restore. The park step still runs for the old branch (capturing any in-flight edits), which is correct. | Decided — new branch starts with clean slate |
| Q24 | How does `git checkout` interact with L1's dirty working tree? | T | P0 | No | L1 continuously writes Y.Doc state to disk, keeping content files "dirty" from git's perspective. `git checkout` will refuse if dirty files differ on the target branch. The park step in `BatchBegin` fires on `index.lock` — which appears *before* git checks the working tree. However, `index.lock` appears after git has already validated the checkout is safe. If git refuses the checkout, `index.lock` never appears and the HEAD watcher never fires — so no park occurs, which is correct (the user stays on the current branch). If git succeeds (files are identical on both branches, or git auto-merges), the park + load proceeds normally. **Edge case:** if `git checkout --force` is used, dirty state is overwritten by git before our watcher fires — the park step may capture stale state. This is acceptable: `--force` is an explicit "discard my changes" signal. | Decided — git's own dirty-tree check is the gatekeeper; no special handling needed |
| Q25 | Should `reconciledBase` branch scopes be persisted to the shadow repo for crash recovery? | T | P2 | No | In-memory only, consistent with D14. On restart, `onLoadDocument` reads current disk content (which reflects whichever branch is checked out) and initializes a fresh `reconciledBase` scope. Parked WIP in shadow refs survives the crash and is available for restoration on the next branch switch. | Decided — in-memory, same as D14 |

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

**Phase 4 — project-repo-awareness (2–3 days):**
- `head-watcher.ts` with `BatchBegin/End` dispatch, `BatchKind` classification, `lastKnownBranch` tracking (FR10, FR26).
- Buffer-and-drain for file events during batches.
- Upstream-import commits fully wired with branch-scoped refs (FR12).
- Test matrix: pull ff / pull merge / pull rebase / reset --hard / stash pop (within-branch cases).

**Phase 4b — shadow branch runtime (3–4 days):**
- `parkBranch`, `loadBranch`, `restoreBranchWIP` in `shadow-repo.ts` (FR27, FR28, FR29).
- Branch-scoped `reconciledBase` migration (FR3 update).
- Detached HEAD fallback context (FR30).
- Test matrix: checkout to named branch / checkout to detached HEAD / checkout -b new branch / switch back to parked branch / switch back after upstream changes landed.

**Phase 4c — shadow branch lifecycle (1–2 days):**
- Branch deletion GC scan in `shadow-branch-gc.ts` (FR31).
- Branch rename detection and ref migration (FR32).
- Detached HEAD context cleanup.
- Test matrix: delete branch with parked WIP / rename branch / detached HEAD GC.

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

**Total estimate: ~17–26 days of focused work**, excluding open questions that need empirical validation. Phase 4b–4c (shadow branch runtime + lifecycle) adds ~4–6 days over the original estimate. This is a substantial piece of work, comparable to the presence/awareness spec, and it's foundational — Bucket 3, 4, 5, and integrated-mode distribution all rest on it.

## 13) Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Three-way merge produces false conflicts on prose users find annoying | Medium | Medium | Block-level is the default; fine-grained is NG10. Instrument conflict frequency via M5; revisit if problematic. |
| HEAD watcher misses a `git pull` because of a watcher bug or race | Low | High | `batchInProgress` is not the only defense — `.git/index.lock` polling inside `onStoreDocument` provides a second check. On miss, we degrade to per-event reconciliation (current behavior + three-way merge), which is still correct. |
| Shadow repo corrupts under disk fault or user tampering | Low | Medium | `git fsck` on startup; reinit on failure (Q7). User loses history but not disk content. |
| Rename detection on platforms where delete+create ordering varies | Medium | Low | Fall back to treating renames as independent delete+create events. Y.Doc state is lost (tombstoned); user reopens the new file. Not a data-loss event. |
| `.gitignore` modification conflicts with user-managed `.gitignore` (e.g., sorted, schema'd, or file-mode'd) | Low | Low | Idempotent append with a distinctive comment marker. User can move the line within the file; we only check for presence. |
| Shadow repo growth over months of WIP dominates `.git/openknowledge/` size | Low | Low | `git gc --auto` on startup. Can add ref expiration policy later. |
| User has two openknowledge writer instances attached to the same shadow root (for example, two worktrees of one repo) | Medium | High | First instance wins; second instance detects the shadow repo is already being written by another process (via `.git/openknowledge/lock`) and refuses to start with a clear error. |
| The block-level merge module is insufficient for MDX (JSX components inside markdown) | Medium | Medium | Test against real Fumadocs content. If block detection breaks on JSX, either (a) treat JSX void nodes as opaque blocks that merge whole, or (b) extend the block splitter. See M1 test suite. |
| `git gc` on project repo evicts blobs we cached but are still referenced only by the shadow's index | None (new arch) | — | Not applicable — shadow has its own object database. |
| Park commit captures stale Y.Doc state when `git checkout --force` overwrites disk before watcher fires | Low | Medium | `--force` is an explicit "discard changes" signal. If the park captures stale state, the restored WIP on switch-back may conflict with the force-checkout's result — user resolves via conflict UI. Acceptable tradeoff. |
| Shadow branch ref accumulation from frequent branch switching in a repo with many short-lived branches | Medium | Low | Periodic GC scan (startup + 24h) deletes orphaned shadow branches. Detached HEAD contexts are GC'd immediately on next named-branch checkout. `git gc --auto` in shadow handles object-level compaction. |
| Branch rename detection produces false positives (two unrelated branches with same HEAD SHA) | Low | Low | Rename detection requires: old branch disappears, new branch appears, same HEAD SHA, within a single `BatchEnd` window. False positives would migrate shadow refs to the wrong name — recoverable by re-parking on the correct branch. |
| `restoreBranchWIP` produces excessive conflicts after a long absence from a branch that received many upstream changes | Medium | Low | Three-way merge handles this correctly (conflicts surface via `Y.Map('conflicts')`). If false-conflict rate is high, a staleness policy can suppress auto-restore for old WIPs. See Q22. |

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
- Exclusive writer lock prevents a second live instance from starting.
- Stale shadow lock is detected and replaced conservatively.
- Standalone mode (no project `.git`) works.
- Integrated mode with a fresh Fumadocs repo works.
- Shadow `git fsck` detects corruption; reinit recovers.

**Integration tests** — `shadow-branch.test.ts`:
- Park commits contain correct Y.Doc state and disk snapshot per document.
- `loadBranch` resets Y.Docs from target branch disk content and switches `reconciledBase` scope.
- `restoreBranchWIP` three-way merges parked state against current disk.
- Round-trip: park `main` → load `feature` → park `feature` → load `main` → restore `main` WIP. Assert original edits survived.
- Detached HEAD gets `detached-<sha>` context; GC'd on next named-branch checkout.
- Branch deletion triggers shadow ref cleanup after 24h grace period.
- Branch rename migrates shadow refs.
- New branch (`checkout -b`) starts with clean slate — no parked WIP, fresh `reconciledBase`.
- `reconciledBase` scopes are independent — edits on `main` don't pollute `feature`'s base map.

**E2E tests** — `reconciliation.e2e.spec.ts` (Playwright):
- **Happy-path pull:** type in browser, `exec('git pull')` with fixture remote, assert browser content = merged content.
- **Race pull:** type mid-save-debounce, fire pull, assert zero keystrokes lost.
- **Conflict pull:** both sides change same paragraph, fire pull, assert resolution mode banner appears.
- **Delete pull:** upstream removes file, assert tombstone banner.
- **Rename pull:** upstream renames file, assert Y.Doc migrates.
- **Branch switch (park + load):** type in browser on `main`, `exec('git checkout feature')`, assert editor shows `feature` content with zero `main` edits bleeding through.
- **Branch switch round-trip:** type on `main`, switch to `feature`, switch back to `main`, assert original edits restored via WIP restoration.
- **Branch switch with upstream changes:** type on `main`, switch to `feature`, run `git pull` on `feature` (via another terminal), switch back to `main` after upstream changes land on `main`, assert WIP restoration merges with upstream changes.
- **Zero-trace test:** fresh project repo → install → edit → uninstall → `git status && git log --all && diff <before> <after>`. Assert no changes.
- **Multi-writer attribution:** human + agent + upstream in one session, assert shadow log has clean per-writer history.

**Chaos tests**:
- Kill Hocuspocus mid-reconciliation; restart; assert no corruption.
- Fill `.git/openknowledge/` with random bytes; assert `git fsck` detects and reinit recovers.
- Run two openknowledge writer instances against the same shadow root; assert second fails cleanly.

## 15) Dependencies

- **Upstream (must be done first):** none. This spec can be implemented against the current `main` branch.
- **Lateral (interacts with):** presence-awareness-ux spec (Y.Map side-channel pattern), bidirectional-observer-sync spec (`updateYFragment` mechanics).
- **Downstream (depends on this):** Bucket 3 attribution UI (reads from shadow repo's per-writer refs), Bucket 4 timeline UI (reads from shadow repo), Bucket 5 draft UX (uses `refs/drafts/*`), Bucket 6 integrated-mode distribution.

## 16) Future work (explicitly out of scope)

This section is the load-bearing design memory. Items here are NOT speculative — they are the *known* extensions of the protocol that this spec is structured to support without rework. Future contributors should treat this list as architectural commitments that constrain how this spec evolves. In particular: decisions in this spec that look "over-engineered for Now" (per-writer WIP refs as N-writer general, shadow repo as a normal git repo with addable remotes, writer IDs as git-author-compatible) are LOCKED specifically because items in §16.2 require them.

> ~~**"Export history to project repo" action.**~~ Now the default behavior — Save Version creates real project repo commits (D24). No longer future work.

### 16.1 — Adjacent Now-scope specs that depend on this substrate

These ship as part of the Now bundle but are owned by other workstreams. They depend on this spec's substrate (shadow repo, per-writer WIP refs, reconciliation protocol) but their UX lives in dedicated specs.

- **Bucket 4 — version history timeline UI (NG9).** "Save Version" modal, timeline panel with named checkpoints prominent and auto-saves collapsed (Google Docs bar), restore-to-checkpoint action, attribution visualization (me / agent / upstream). Reads from `refs/checkpoints/*` + per-writer WIP refs in this spec's shadow repo. **Without this spec's substrate, the timeline has no data source. Without the timeline UI, this spec's history infrastructure has no user-visible payoff.** Both must ship together in Now.
- **Bucket 5 — draft UX (NG8).** Create / switch / delete / list / apply drafts. Reads from `refs/drafts/<name>` storage model. Draft-apply is rebase + squash-merge per the substrate. The branch lifecycle is owned here; the UX lives in Bucket 5.
- **Bucket 3 — attribution UX.** Origin shading, per-block "who wrote this" hovers, agent activity feed. Reads from this spec's per-writer WIP refs. Attribution data is owned here; rendering lives in Bucket 3.
- **S10 — wiki-links and backlinks.** Largely independent of this spec, except for one cross-spec dependency: when a file is renamed (this spec's `Rename` lifecycle event), the backlink graph must update referencing files. Cross-spec semantic agreement needed on whether wiki-links resolve by file basename, H1 heading, or frontmatter title.
- **Distribution / CLI / init.** `npx openknowledge init` auto-detection (walk up from content directory looking for `.git/`, confirm with user, persist to `ok-config.json`), content root discovery for known frameworks (Fumadocs `content/docs/`, Mintlify `docs/`, Nextra, Docusaurus). The runtime behavior (whether a project repo is detected) is consumed by this spec; the init UX lives in a dedicated CLI spec.
- **File-path search (Cmd-P).** Fuzzy file-name search across the content directory. Tiny implementation, not its own spec — lands inside the editor spec. Worth naming because users coming from VS Code / Obsidian / Notion expect it as table-stakes.

### 16.2 — Protocol extensions for Next / Later

These extend this spec's protocol into new domains. The Now architecture is structured to support them without rework. Future contributors who try to simplify Now-scope decisions for "we don't need that complexity right now" should read this section first.

#### Cloud forward-compatibility (Next)

PROJECT.md commits to *"local-first single-player to start, with architecture that gives a clear path to collaboration, publishing, and SaaS"* (line 13) and *"the cloud product ... consumes the same MCP tools, CRDT protocol, and storage primitives as any external agent"* (line 16). The cloud target is **hybrid local-first** — OSS users start local, then upgrade to cloud cleanly without rewriting their data. This spec's architectural commitments are specifically structured for that upgrade path.

- **Hybrid local-first cloud deployment.** The full upgrade flow: `npx openknowledge cloud link` adds a cloud remote to the user's local `.git/openknowledge/` and pushes existing history; `npx openknowledge clone <workspace-url>` clones into a new machine. Cloud git becomes the canonical system of record; each user has a local clone. Users can work offline against their local copy and sync via git push/pull when reconnected. **The shadow repo concept survives the upgrade unchanged** — it's already a git repo with an addable remote. Subsumes NG7 (cross-device sync of shadow repo).
- **Cloud Hocuspocus deployment.** Multi-tenant or per-workspace Hocuspocus running in our cloud. Same Yjs + Hocuspocus stack from PROJECT.md TQ1, just a different connection target. When users are online, browser/MCP clients connect to cloud Hocuspocus instead of (or in addition to) localhost. When offline, they fall back to local Hocuspocus or a Yjs-IndexedDB cache.
- **Local ↔ cloud Hocuspocus reconciliation when toggling online/offline.** The hardest design question for cloud mode. When a user has been editing offline and reconnects, the cloud may have N hours of remote changes and the local has N hours of theirs. **The reconciliation protocol from this spec is the load-bearing primitive that handles it** — three-way merge against `reconciledBase`, with cloud-peer commits treated as external writers (the same way `git pull` from origin is treated today). What's *not* yet decided: does local Hocuspocus shut off when online (clients connect directly to cloud)? Proxy to cloud? Coexist with bidirectional sync? Three plausible options, decision deferred to the cloud topology spec.
- **Multi-user presence extending to remote participants.** The presence-awareness-ux spec today scopes to local participants (me + my browser tabs + my local agents). Cloud adds remote humans on other machines via the same Yjs awareness protocol. Cursors, selections, and "who's editing" indicators just work over WebSocket-to-cloud instead of WebSocket-to-localhost.
- **Cross-machine writer identity stability.** Local writer IDs (`human-<install-id>`) must map to cloud account IDs (`human-<cloud-user-id>`) at upgrade time. The mapping happens at `cloud link`. Historical commits are not retroactively reattributed — the new identity applies to commits made after the upgrade. **This is why writer IDs in this spec are git-author-compatible** — local IDs must be representable as git authors so the upgrade can rewrite them via standard git author mapping.
- **Cloud authentication / authorization layer.** Cloud Hocuspocus needs auth (workspace membership, permission checks). Cloud git needs auth (push/pull credentials). Out of scope for this spec but the missing prerequisite for cloud deployment.
- **Cross-machine attribution via git commit metadata.** When agent-authored commits are pushed to cloud and pulled by another user, attribution must survive the round trip. Per-writer WIP refs are local-only. Cross-machine attribution carrier: `Co-Authored-By: <agent-name> <agent@openknowledge.local>` trailers on commits that included agent work, written at L2 commit time. This is how the timeline UI in another user's local install can still distinguish "my teammate's edits" from "my teammate's agent's edits."
- **Workspace management and invite flow.** Cloud workspaces, member roles, invite links. Cloud product surface, not protocol.

#### History queries

Items in this category extend "what users can do with the history this spec captures." The substrate (shadow repo with per-writer refs) is in scope; the query primitives and UIs are out.

- **Time-based recovery ("rewind N minutes").** The "my cat jumped on the keyboard and added 200 lines of garbage" scenario. Different from per-transaction Y.js undo (too granular, will produce thousands of operations) and from named-checkpoint restore (requires the user to have created a checkpoint beforehand). Needs a query primitive: `git show refs/wip/<branch>/<writer>@{N minutes ago}:<file>` and an HTTP/UI surface. **This is probably the most common real recovery action for solo IC users** — more common than checkpoint restore, more common than draft branches — and it's currently absent from the entire Now bundle.
- **Cross-session agent undo.** Undo an agent edit from yesterday. Current per-origin undo (presence spec) is in-session only — the UndoManager dies when the doc is unloaded. Cross-session needs a "revert commits authored by writer X in time window Y..Z" primitive against the shadow repo. Substrate is per-writer WIP refs (this spec); query primitive is future work.
- **Cross-document attribution queries.** "Every AI edit across my whole KB this week." "Show me everything Claude wrote in the auth section last month." Bucket 3 surface, requires walking the shadow log across files.
- **Full-text search over history.** Search past versions of files, not just current. "I remember writing a good sentence about X — find it across all versions." Requires indexing shadow blob history, separate from the current-state search index.
- **Per-block blame.** Finer-grained version of "who wrote this paragraph": which writer added each block, when, in what surrounding context. Drives a hover-to-see-attribution UX in Bucket 3.

#### Migration / onboarding from prior content

Items here cover users with existing content who want to adopt openknowledge.

- **Onboarding from existing markdown directories with prior git history.** A user's repo has `content/docs/*.mdx` with pre-existing history in their project repo's `.git/`. Today: the shadow repo starts fresh at install time; the project repo's history stays in the project repo where it always was. Future: optionally surface pre-install history in the timeline UI by reading from the project repo (read-only), or synthesize WIP commits from project history. Probably the simpler answer is "shadow history starts at install; pre-install history is browsable via the user's normal git tools" — but worth deciding explicitly.
- **Migration from Obsidian vaults.** Obsidian users have markdown + frontmatter + wiki-links + plugins. Importing means: scan the vault, map Obsidian's wiki-link conventions to ours, preserve frontmatter, ignore Obsidian-specific files (`.obsidian/`). Probably its own spec under a "switchers" workstream.
- **Migration from Notion / Confluence exports.** Markdown export from these tools is lossy and shaped differently from openknowledge's expectations. An "import from Notion" workflow would parse the export and create matching pages with metadata mapping. Out of scope for this spec but worth naming.
- **Onboarding into a project repo with existing CI / hooks.** What if the user's project repo has pre-commit hooks that run `prettier --write` or similar? Those modify files and trigger our reconciliation. Probably handled correctly (it's just another external write source) but deserves an explicit test scenario.

#### Operational maturity

- **Shadow repo garbage collection / archival policy.** What happens when WIP refs accumulate over months or years. Current Q6 ("`git gc --auto` on startup") is a starting point, not a real archival story. Long-running installs may need policies for: archiving WIP refs older than N days, compacting auto-save commits between checkpoints, splitting history into time-bucketed packfiles.
- **Performance at scale.** Repos with 10K+ files, deep histories, concurrent multi-agent writes. The spec has performance NFRs but no benchmarks. Needs a perf spec with targets and measurement methodology before scaling concerns become real.
- **Shadow repo corruption recovery and backup.** Q7 covers `git fsck` + reinit on failure. That's a recovery story, not a prevention story. Backup primitives (export shadow to tarball, restore from tarball) and partial-corruption recovery (when fsck doesn't catch the issue) are unaddressed.
- **Streaming / lazy loading of timeline.** Long histories shouldn't load the entire shadow log into memory or render in one pass. Pagination + virtualization for the timeline UI.
- **Shadow repo portability across machines (pre-cloud).** Can a user copy `.git/openknowledge/` between machines manually? Today: probably yes, but writer IDs are tied to install. Mostly subsumed by the cloud upgrade path — pre-cloud users who want this can do it manually and accept the writer-ID drift.

#### UX maturation

- **In-browser conflict resolution UI.** Currently this spec punts to external tools when git markers appear (resolution mode is read-only with a banner). A proper in-browser 3-way merge UI showing base/ours/theirs with click-to-accept-block would be a better experience long-term. Significant UX work, deferred but worth naming as a future improvement, not a permanent limitation.
- **Optimistic concurrency at MCP surface (NG6).** The "agent mid-multi-file-write races a git pull" case. The fix is at the MCP surface (e.g., `write_file(path, content, expected_sha)` with 409 on mismatch), not the file layer. Dedicated spec under Bucket 5 when agent concurrency becomes a real problem.
- **Rich notification when external changes land.** Today's spec has FR19 (brief "Synced with upstream" indicator). Future work: a sidebar notification log of external changes, click-to-jump-to-changed-block, "show me all changes since this morning" type queries.
- **"What changed since I was last here" view.** A user comes back after a week and wants to see what's new in their KB. Currently they'd have to manually browse the timeline. A dedicated "since I was last here" view is a high-leverage onboarding moment for returning users.
- **Rescue buffer UI.** Currently rescue buffers are just an HTTP endpoint + filesystem store. A proper "recent rescues" browser UI showing all dirty-doc rescues with their timestamps and content previews would be a quality-of-life improvement.

#### Cross-protocol extensions

- **Non-git project VCS (NG13).** Mercurial / Fossil / Pijul / Dolt / Sapling. The shadow repo abstraction generalizes ("openknowledge owns its own versioned blob store with text-level merge"); only the project-repo-awareness hooks are git-specific. Each VCS would need its own equivalent of `.git/HEAD` watching, lifecycle event detection, and conflict marker conventions.
- **Fine-grained merge granularity (NG10).** Sentence-level or word-level instead of block-level. Only worth investing in if block-level proves to produce too many false conflicts on prose-heavy content. Block-level is probably right for prose; sentence-level might be needed for code blocks inside MDX.
- **Windows support (NG11).** Empirical testing of `.git/HEAD` watching on NTFS, file-watcher semantics, path handling. Platform port, not architectural change.

## 17) Glossary

- **Project repo** — the user's existing git repository (Fumadocs, Mintlify, any MDX repo). Openknowledge is a guest in this repo. The only traces openknowledge leaves are user-triggered Save Version commits and the `.git/openknowledge/` directory (invisible to git transport).
- **Shadow repo** — bare git repo at `.git/openknowledge/` (integrated mode) or `.openknowledge/` (standalone mode), with work-tree pointing at the project root. The bare repo files (`HEAD`, `config`, `objects/`, `refs/`) live directly in this directory alongside openknowledge-specific files (`rescue/`, `ok-config.json`). An **attribution journal** holding fine-grained per-writer WIP refs between Save Versions. Ephemeral — losing it loses attribution detail but not content (that's in the project repo). Nested inside `.git/` so it requires no `.gitignore` entry and is repo-local; in Now, concurrent writer instances against the same shadow repo are prevented by the shadow-root lock.
- **Attribution journal** — the shadow repo's role. Tracks who wrote what at a finer granularity than the project repo's commit history. Readable by Bucket 3 origin-shading UI and Bucket 4 timeline.
- **Shadow branch** — an automatic, branch-scoped editing context in the shadow repo that mirrors a project repo branch 1:1. Each project branch gets its own set of WIP refs (`refs/wip/<branch>/*`), checkpoint refs (`refs/checkpoints/<branch>/*`), and `reconciledBase` scope. On branch switch, the current shadow branch's state is parked and the target branch's state is loaded. Distinct from drafts, which are user-created named editing alternatives within a shadow branch.
- **Park (branch context)** — the operation of committing current Y.Doc in-memory state to a shadow branch's WIP refs before a cross-branch switch. The park commit includes both the Y.Doc state and a disk snapshot (used as merge base for future WIP restoration). Parking captures state from memory, not disk, because git may have already modified the working tree by the time the HEAD watcher fires.
- **Reconciled base** — per-document, per-branch snapshot of the byte-identical state between Y.Doc and disk at the last sync point. The "base" input to three-way merge. Scoped by shadow branch — each project branch has its own `reconciledBase` map.
- **In-flight edits** — user changes present in the Y.Doc but not yet flushed to disk (within the 2–10s L1 debounce window).
- **External writer** — any writer other than our L1 save path: git operations, external editors, agents with filesystem tools, LSP fixers, shell scripts.
- **Lifecycle event** — a typed `DiskEvent`: Create, Update, Delete, Rename, Conflict, or BatchBegin/End.
- **BatchBegin / BatchEnd** — atomic-event markers emitted by the HEAD watcher around coordinated operations (git pull, checkout, merge, rebase). File-watcher events inside a batch are buffered and applied together at BatchEnd. Each `BatchEnd` is classified as `within-branch` (pull/merge), `cross-branch` (checkout), or `detached-head` — determining whether reconciliation or park+load semantics apply.
- **Upstream-import commit** — a commit in the shadow repo authored by `upstream`, representing the set of content changes that entered the working tree via a project git operation. Not a mirror of upstream's commit history; a single tree snapshot.
- **Resolution mode** — a read-only Y.Doc state entered when a file contains git conflict markers or when reconciliation cannot proceed safely. User resolves externally; openknowledge re-engages on next clean state.
- **Per-writer WIP refs** — `refs/wip/<branch>/<writer-id>` in the shadow repo. One ref per active writer per visited branch. Attribution-faithful by construction. Branch-scoped to prevent cross-branch edit contamination.
- **Shadow-root writer lock** — exclusive lock stored at `<shadowDir>/lock` that grants one runtime instance authority to mutate shadow refs and perform reconciliation-side writes. Prevents concurrent mutation of a single shadow store by multiple worktrees or processes.
- **Rescue buffer** — the in-memory Y.Doc state of a tombstoned-but-dirty document, persisted to `<shadow-parent>/openknowledge/rescue/<docName>.md` for 24h so the user can recover unsaved work.
- **Save Version** — user-triggered checkpoint that creates a real commit on the project repo's current branch (with co-authored-by trailers) and writes a `refs/checkpoints/<branch>/<sha>` bookmark in the shadow. The graduation point where WIP becomes durable project history.
- **Checkpoint ref** — `refs/checkpoints/<branch>/<project-commit-sha>` in the shadow repo. Branch-scoped. Stores a full content tree snapshot so the shadow remains self-contained even if the project repo rewrites history (rebase, force-push).
- **BatchKind** — classification of a `BatchEnd` event: `within-branch` (same branch, HEAD moved due to pull/merge/rebase — reconcile), `cross-branch` (different branch detected — park + load + restore), or `detached-head` (HEAD is a raw SHA — park + load, no restore, GC on next named checkout).
- **lastKnownBranch** — cached project branch name, resolved from `.git/HEAD` on startup and updated on every `BatchEnd`. Used to classify `BatchKind` by comparing old branch to new branch. For detached HEAD, stores `detached-<sha>`.
