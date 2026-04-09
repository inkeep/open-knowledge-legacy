# Design reasoning — why Candidate A

This file captures the architectural candidate comparison that led to the approach in SPEC.md §9. It's preserved as evidence so future readers can audit the reasoning and — more importantly — know which alternatives were *considered and rejected* rather than never seen.

## The fundamental question

When openknowledge is installed inside an existing project (Fumadocs, Mintlify, any repo with MDX files), multiple writers converge on the same content:

- The openknowledge CRDT editor (Y.Doc in memory, multi-client via Hocuspocus)
- AI agents via our MCP server
- External text editors (VS Code, Cursor, vim, emacs)
- Git operations (pull, merge, rebase, checkout, stash pop, cherry-pick)
- Other tools (sed, AI code-modification tools, LSP auto-fixers)

All converge on the same files. The question: **what is the source of truth, and how do all these writers reconcile?**

## Three evaluation frames

Different frames optimize for different invariants:

1. **Invariant-robustness frame** — the system has knowable invariants that hold under every failure mode, restart, and external tool interaction. Data loss is impossible. Attribution is faithful.
2. **Composability frame** — the system composes cleanly with other tools operating on the same files. We are maximally a "good citizen."
3. **Elegance frame** — minimum moving parts, minimum duplicate state, maximum reuse of existing primitives.

These pull in different directions. The elegance frame alone would pick Candidate B. The composability frame alone would pick Candidate A. The invariant-robustness frame is neutral on A vs B but rules out C and D.

## The four candidates

### Candidate A — Disk-canonical + session CRDT + isolated shadow repo (chosen)

Files are source of truth. CRDT is a live session cache derived from disk. Shadow bare repo at `.openknowledge/history.git` with work-tree pointing at the parent project root keeps history. Parent repo is untouched. Three-way merge reconciles disk ↔ CRDT via a tracked `reconciledBase`. Upstream pulls create attributed import commits in the shadow.

### Candidate B — Git-native, namespaced refs in the parent repo

`.git/objects/` holds our WIP blobs. `refs/openknowledge/wip/*` holds our WIP refs. Drafts become `refs/openknowledge/drafts/*`. We're a git tool, nothing separate. "Save Version" becomes a real commit on the user's branch. Pollution is traded for unified history.

### Candidate C — CRDT-canonical with disk as projection

The Y.Doc (persisted via y-leveldb / y-sqlite / a `.ydoc` blob) is the source of truth. Disk is a materialized view. External writes are imported. Git is a publishing target, not the history layer.

### Candidate D — Event-sourced log as source of truth, files and git as derived outputs

A monotonic append-only operation log is canonical. Files are projected from the log. Git commits are periodic materializations. External writes are imported as log events.

## Candidate-by-candidate evaluation

### Candidate C — CRDT-canonical — CUT

Seductive because it offers a "real" database with attribution, history, undo, and merge all native. This is what Figma/Notion/Linear do internally.

**Rejected because it violates a principle PROJECT.md locks in:** files are the knowledge. A user should be able to `cat content/docs/intro.mdx` and get the truth; a coding agent should be able to read the file without going through our MCP server (CC7 portability, T6.5 AGENTS.md). If the Y.Doc is canonical and the file is a projection:

- The file is *always* potentially stale
- Writes to the file from vim/sed/git pull are *imports*, not edits
- `git commit` is a capture of a projection, not a source of truth

**More damning: the CRDT isn't even canonical today in the spike.** `persistence.ts` doesn't persist any Y.Doc binary anywhere — hydration is `markdown → PM JSON → updateYFragment`. If you wanted to make the CRDT canonical, you'd need to ship y-leveldb, deal with the `.ydoc` vs `.md` consistency question, and answer "who wins when they disagree?" The answer can't be "the CRDT" because the whole point of being file-first is that external tools can write.

**Internally inconsistent with the files-are-the-knowledge principle. Cut.**

### Candidate D — Event-sourced log — CUT

The most *theoretically* correct architecture. Every edit is a patch, every patch is attributed, git commits are periodic checkpoints, reconciliation with upstream is just "insert upstream's patches into the log at the point they were created." This is essentially what Automerge / Loro do internally, and what Pijul/Darcs do at the VCS level. Attribution is free. Undo is free. Branching is free. Time travel is free.

**Why it's actually the wrong answer for us:**

1. **The log has to live somewhere**, and that somewhere can't be the file (because then we're back to files-are-canonical with the log as their content). So the log lives in... a sidecar database? The shadow repo's objects? A Yjs update stream persisted to disk? Whatever you pick, you've now got a new source-of-truth question: if the log and the files disagree, who wins?
2. **External writes force you to compute a patch from a diff** — which requires the same three-way merge machinery as Candidate A. The event-sourced framing doesn't eliminate reconciliation; it just moves it into the "import external edit" pathway.
3. **The ecosystem isn't there.** Git is the VCS everyone ships with. If our history isn't a git history, it can't be browsed, PR'd, pushed, blamed, bisected, or gc'd by existing tooling. You'd be building a custom VCS, at which point you're Pijul, at which point you have 0.1% adoption.

**Right answer in a universe where git doesn't exist. Cut.**

### Candidate B — Git-native with parent-repo pollution — CUT

Genuinely architecturally elegant. Zero duplicate state. One source of truth for history. `git log refs/openknowledge/wip/main` shows you everything. Cross-device sync is free (`git push`). Drafts are real git branches. Upstream reconciliation is `git rebase`, a battle-tested operation. "Save Version" becomes a real commit on `main` that survives uninstalling openknowledge.

**Rejected because it fails a principle worth stating explicitly:**

> **The parent repo must be taken at face value after openknowledge leaves.** No orphaned refs, no lingering objects, no commits the user didn't author, no config entries they didn't set.

This is the same principle behind `.gitignore`-ing `node_modules`: our state is not their state, and the user should be able to nuke our presence without losing their work.

**Concrete failure modes for B:**

- User installs openknowledge, uses it for a month, uninstalls. Their `.git/objects/` now contains 30 days of WIP blobs that `git gc` won't prune until the refs are deleted. If they `git push --mirror` during that month, those blobs are on origin forever.
- User runs `git push --mirror` or any tool that pushes all refs. Our `refs/openknowledge/*` go upstream. Their teammates see our refs. Chaos.
- User runs `git gc --prune=now --aggressive`. Any WIP ref that's momentarily unreferenced gets nuked. We have to be defensive about this.
- User force-pushes their branch and rewrites history. Our shadow refs are now parented on commits that don't exist. Custom rebase logic required.
- User does `rm -rf .git && git init` to reset their repo. Our entire history is gone — unrecoverable, because our history lived in their `.git`.

Every one of these is a composability failure. The user is doing a legitimate git operation and we break.

**There's a more subtle problem: git-native attribution is attached to commits, but our attribution needs to be attached to ops.** In git, the author of a commit is whoever ran `git commit`. If we batch 30 seconds of edits into one WIP commit, all 30 seconds are attributed to a single author. That's fine for single-writer, but wrong when multiple writers are live concurrently (user + agent) — which is explicitly a case we care about (Bucket 3 origin shading). Git commits can't distinguish "this line was written by the user, this line was written by an agent, in the same batch." The shadow repo in Candidate A can, because we control the write policy and can emit per-writer commits (`refs/wip/<writer>`).

**B trades per-op attribution for unified git history. That's the wrong trade for Bucket 3. Cut.**

### Candidate A — Disk-canonical + session CRDT + shadow repo — CHOSEN

The axioms it satisfies:

- **Files are canonical** ← matches CC6 ("everything that matters is either a file in git or a per-branch cache") and CC7 portability
- **Parent repo is sacred** ← nothing in `.git/` changes, nothing lingers after uninstall, no footguns from standard git operations
- **CRDT is session coordination** ← matches the spike's actual behavior (no Y.Doc persistence), matches the "multiple live writers converging" requirement
- **History layer exists and is attribution-faithful** ← shadow repo can have per-writer refs and per-writer commits, matching Bucket 3's requirements
- **Text-level merge is always git-mediated** ← matches CC1 (Yjs + git complementary)
- **Drafts are branches, apply is squash-merge** ← matches CC4, just in the shadow repo instead of the parent

The axioms it has to *add* that aren't in the spike:

- **Reconciled snapshot per document** — the last byte string on disk we agreed with, needed for three-way merge
- **Parent-awareness** — the shadow repo needs to know when the parent repo's HEAD moves, so it can insert upstream-import commits for attribution and keep draft bases coherent
- **Coalescing window** during multi-file events (pulls, checkouts, rebases)
- **Lifecycle events** (create/update/delete/rename) as a real taxonomy

None of these break the axioms above. They extend the architecture in a direction it was always going to go.

## The property that tips the decision

The real argument for A over B is **local reasoning about correctness.** For any file at any moment, I can answer "what should the Y.Doc state be?" by looking at three things: `disk`, `reconciledBase`, and `user_unsaved_delta`. Everything else is derivable.

Compare this to the spike today, where:
- `reconciledBase` doesn't exist (we can't compute `user_unsaved_delta`)
- File-watcher events are non-atomic (a pull is N independent events, not one batch)
- Delete is silently ignored (the state machine doesn't have a "tombstoned" state)
- Shadow repo (proposed, not built) has no concept of upstream imports (attribution is corrupted on pull)

Each of those is a case where we cannot reason locally about correctness. The fix, in every case, is to add a piece of state or a distinction that makes reasoning local again. That's what "architecturally correct" means here — **enabling local reasoning about every observable state.**

And `three-way-merge.ts` already exists, already handles the hardest part (block-level merge with conflict detection), and just needs to be wired into a disk bridge with a base tracked per document. The architecture isn't asking for new primitives; it's asking us to *name what the primitives are* and *use the ones we have in the places they belong*.

## 10 invariants that define the ideal shape

These are the design commitments that fall out of the candidate choice. Each becomes a requirement or a locked decision in SPEC.md:

1. **The file is the only canonical state.** For every path under the content root, `read_file(p)` returns the current truth. No process holds state that is authoritative-over-disk for more than its current operation.

2. **Every Y.Doc has a reconciled base.** When a Y.Doc is created, `reconciledBase[doc] = current_disk_content(doc)`. Updated on save and on import.

3. **All disk-vs-CRDT reconciliation is three-way.** `reconcile(base, ours, theirs)`. When `ours === base`, degenerates to "apply theirs."

4. **External writers are events, not polls.** A `DiskEvent` is one of `Create | Update | Delete | Rename | Conflict | BatchBegin | BatchEnd`.

5. **Git operations are batched disk events.** A watcher on the parent repo's `.git/HEAD` emits `BatchBegin` when HEAD moves and `BatchEnd` after the working tree settles. Inside a batch, reconciliation is suspended; at `BatchEnd`, all events are applied in one atomic pass.

6. **Shadow repo is complete, parent repo is untouched.** `.openknowledge/history.git` is a bare git repo with work-tree pointing at the parent project root. Nothing we do touches the parent's `.git/`.

7. **Lifecycle events are never ignored.** Delete tombstones the Y.Doc (with rescue buffer if dirty). Rename migrates the Y.Doc. Create is no-op until first hydration. Conflict-marker files enter resolution mode.

8. **The shadow repo has per-writer attribution.** WIP refs are `refs/wip/<writer-id>`. Each auto-commit writes only the files touched by that writer since the last commit. Checkpoints squash all WIP refs into a single commit on `refs/heads/main` with co-authored-by trailers.

9. **Drafts are real branches off the shadow's main.** `refs/drafts/<name>`, branched from `refs/heads/main` at creation. Draft-apply is rebase + squash-merge. When upstream imports land, active drafts auto-rebase; conflicts → resolution mode.

10. **The system degrades honestly under failure.** If HEAD watcher fails, we fall back to per-event reconciliation. If shadow write fails, we log and retry. If `reconciledBase` is missing, we rehydrate from disk. No silent corruption paths.

## Confidence calibration

**High confidence** (the architectural shape is right):
- Disk should be canonical, not CRDT. Axiom argument + spike's actual behavior + external-tool interop all point the same direction.
- Three-way merge is the right reconciliation primitive. Standard in every VCS and editor, and `three-way-merge.ts` already exists for the adjacent source-toggle case.
- The parent repo should be sacred. Composability principle worth dying on.

**Medium confidence** (the mechanics are right but wants empirical validation):
- Per-writer WIP refs vs single WIP ref with author metadata. Both work; per-writer is cleaner but introduces small shadow-repo complexity.
- Upstream-import commits synchronously on HEAD movement. Right in spirit but the exact detection mechanism (`.git/HEAD` watcher? `.git/index.lock` polling? git hooks?) is a detail that wants validation.
- Block-level merge granularity. Right for prose, but code blocks inside MDX might want finer. Wants a real test suite.

**Lower confidence** (wants its own design pass):
- Agent-intent-layer answer for mid-write pulls. Handwaved with "optimistic concurrency at the MCP surface" — directionally right but underspecified. NG6 in the spec.
- Whether `git reset --hard` should reconcile or refuse. Arguments both ways. Leaning "refuse" (D21) but open.
- Whether the shadow repo should track the parent's upstream as a second remote (second clone) or just mirror trees at HEAD movements (D23). Second is simpler; first would enable richer diffing but is probably overkill.

## Related reading

- `reports/git-library-for-knowledge-platform/` — why simple-git (TQ20 Locked)
- `reports/parcel-watcher-crdt-disk-bridge/` — file watcher + CRDT integration patterns
- `reports/crdt-mcp-filesystem-bridge/` — how agents write through the CRDT
- `reports/markdown-roundtrip-fidelity-tiptap/` — round-trip fidelity constraints
- `reports/local-git-merge-infrastructure/` — programmatic merge feasibility
- `reports/claude-code-worktree-git-isolation/` — worktree patterns for draft isolation
- `reports/source-of-truth-persistence-collaboration/` — git-as-source-of-truth evidence
