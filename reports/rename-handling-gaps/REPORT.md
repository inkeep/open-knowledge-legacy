# Rename handling — world model

**Topic:** File and folder rename handling in `@inkeep/open-knowledge`, mapped across config, back/forward linking, and shadow-git-history axes.

**Stance:** Non-prescriptive. Reports observations, gaps, divergences, open questions. Does not recommend fixes.

**Date:** 2026-04-28
**Channels harvested:** Code (Explore subagent), Reports (CATALOGUE scan), Web (3 probes). OSS dir absent (`~/.claude/oss-repos/` not present). No topic-relevant catalog skills.

---

## 1. Surfaces inventory

Eight surfaces can rename a file or folder in this system. They differ in attribution, link-rewrite coverage, recovery protection, and history fidelity.

| # | Surface | Trigger | File | Folder | Attribution | Link rewrite | Recovery journal |
|---|---|---|---|---|---|---|---|
| S1 | `/api/rename` (handleRename) | UI file rename, MCP `rename_document` | ✓ | — | Agent only (D22) | ✓ full | ✓ |
| S2 | `/api/rename-path` file branch | UI file rename via FileTree drag/drop | ✓ | — | None | ✗ | ✓ |
| S3 | `/api/rename-path` folder branch | UI folder rename via FileTree | — | ✓ | None | ✗ | ✗ |
| S4 | MCP `rename_document` | Agent tool call | ✓ | — | Agent (via S1) | ✓ via S1 | ✓ via S1 |
| S5 | (no MCP folder rename tool) | — | — | — | — | — | — |
| S6 | File-watcher rename detection | External `mv` in contentDir (same batch, content unchanged) | ✓ | partial | `file-system` writer | ✗ | ✗ |
| S7 | File-watcher delete+create fallback | External `mv` across batches OR with content change | ✓ | ✓ | `file-system` writer | ✗ | ✗ |
| S8 | Git-upstream import | `git pull` brings in renamed paths | ✓ | ✓ | `git-upstream` writer | UNRESOLVED | ✗ |

**Observations.**

- **Two UI file-rename code paths exist** (S1 and S2). [FileTree.tsx:687](packages/app/src/components/FileTree.tsx#L687) routes file renames to `/api/rename` (S1) and folder renames to `/api/rename-path` (S3). The S2 path (`/api/rename-path` with `kind: 'file'`) appears unreached from the UI today; both endpoints accept file renames but only S1 has full link semantics. **CONFIRMED** by reading FileTree dispatch.
- **No surface produces folder-rename attribution.** S3 doesn't record contributors; S5 doesn't exist; S7/S8 attribute to system/upstream writers without per-file granularity.
- **MCP surface area mirrors HTTP surface area** but for files only. Agent-driven folder rename has to be N file calls.

---

## 2. Axis 1 — Config interactions

### 2.1 `.open-knowledge/config.yml` — content.include / content.exclude

The repo has a `ContentFilter` ([content-filter.ts:2](packages/server/src/content-filter.ts#L2)) that combines `.gitignore` + `content.exclude` (exclusion) with `content.include` (inclusion). It is consulted by the file-walker and the file-watcher event classifier.

**Gap (CONFIRMED):** No rename surface validates that the destination path remains admitted. A user or agent can rename:
- An admitted doc → an excluded path (e.g., `notes/foo.md` → `node_modules/foo.md`). The rename succeeds at the API. The file-watcher then refuses to re-index the destination. The shadow commit still records the move on disk.
- An admitted doc → outside `content.include`. Same outcome — file system has the new path, but the doc effectively disappears from the wiki surface.

[`isValidRelativeContentPath`](packages/server/src/api-extension.ts#L3812) only validates path syntax (no traversal, relative, no system-doc), not glob admission.

### 2.2 Doc extension semantics

[`getDocExtension(docName)`](packages/server/src/doc-extensions.ts) resolves `.md` vs `.mdx` per doc. Rename handlers call it on both source and destination. **A rename can change extension** (e.g., `article` → `guide.mdx`) — confirmed because the API accepts both with-extension and without-extension `docName`/`newDocName` values. No guard prevents extension switch.

**Observation:** an extension flip is invisible to most callers, but it can change render-time behavior (Fumadocs/MDX vs raw markdown). No spec covers this case.

### 2.3 `principal.json`

Lives at `<contentDir>/.open-knowledge/principal.json`. Read-only in rename contexts: `getPrincipal()` populates the actor tuple in `buildAgentActor` for attribution but no rename surface writes to it. **CONFIRMED.**

### 2.4 No-OK-sidecars STOP rule

CLAUDE.md prohibits per-doc sidecars in user-content paths. **CONFIRMED no rename surface violates this.** All metadata lives in `<contentDir>/.open-knowledge/` (backlink cache, principal, recovery journals); no per-doc `_meta.json` or similar.

### 2.5 Backlink-index on-disk cache

The cache at `<contentDir>/.open-knowledge/` is **content-hashed, not path-keyed** (per code agent finding, MEDIUM confidence — claim was "SHA1-based"). This means rename moves a backlink-index entry from old → new docName via `backlinkIndex.renameDocument(oldName, newName, content)`, but only when the surface invokes that method.

| Surface | Calls `backlinkIndex.renameDocument`? |
|---|---|
| S1 `/api/rename` | ✓ ([api-extension.ts:1215](packages/server/src/api-extension.ts#L1215)) |
| S2 `/api/rename-path` file branch | ✗ **CONFIRMED gap** ([api-extension.ts:4016-4025](packages/server/src/api-extension.ts#L4016)) |
| S3 `/api/rename-path` folder branch | ✓ per affected doc ([api-extension.ts:4046-4054](packages/server/src/api-extension.ts#L4046)) |
| S6 file-watcher rename event | ✗ — only `updateFileIndex` runs ([file-watcher.ts:602-616](packages/server/src/file-watcher.ts#L602)) |
| S7 file-watcher delete+create | ✗ via the rename surface; backlinks would be re-derived on next content scan |

**Net.** S2's lack of backlink-index update is asymmetric with S3. S6 detects renames but doesn't propagate them to the backlink graph.

---

## 3. Axis 2 — Back/forward link handling

### 3.1 What "link rewrite" covers

The full spine in `_performManagedRename` ([api-extension.ts:1104-1233](packages/server/src/api-extension.ts#L1104)) does five things:

1. Reads all backlink sources pointing at the renamed doc.
2. For each, rewrites wiki-links `[[Page]]` and supported inline markdown links via `applyManagedRenameToLoadedDocument` (open) or `rewriteSupportedLinksForDocumentRename` (offline).
3. Writes rewritten contents back to disk.
4. Self-rewrites links inside the renamed doc that pointed to its own old name.
5. Updates the backlink index (in-memory + on-disk cache).

The full spine runs only for S1/S4. All other surfaces partial or skip.

### 3.2 Per-surface link-rewrite matrix

| Surface | Inbound wiki-link rewrite | Inbound markdown-link rewrite | Self-reference rewrite | Backlink index update | On-disk cache | Forward-link re-extract |
|---|---|---|---|---|---|---|
| S1 `/api/rename` | ✓ | ✓ | ✓ | ✓ | ✓ deferred | partial (via `updateDocumentFromMarkdown`) |
| S2 file branch | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| S3 folder branch | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| S4 MCP rename_document | ✓ via S1 | ✓ via S1 | ✓ via S1 | ✓ via S1 | ✓ via S1 | partial via S1 |
| S6 watcher rename | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| S7 watcher delete+create | ✗ | ✗ | ✗ | ✗ (delete+create separately) | ✗ | partial on next content load |
| S8 upstream import | UNRESOLVED | UNRESOLVED | UNRESOLVED | UNRESOLVED | UNRESOLVED | UNRESOLVED |

### 3.3 Dangling-link semantics

When inbound wiki-links are not rewritten, they remain literally `[[old/path]]` in linking docs. The wiki-link renderer treats unmatched targets as **redlinks** (visual indicator, click-to-create). The backlink graph is only as accurate as its index — surfaces that update the index but not the link text leave the graph correct while the rendered text is stale; surfaces that update neither leave both stale.

**Observation from web channel (MEDIUM confidence):** Obsidian has the same limitation — its in-app rename auto-updates backlinks, but external rename loses them, and folder rename does NOT update redlinks pointing at uncreated notes inside the folder. AnyType uses `@`-symbol mentions resolved by stable IDs to sidestep the rename-propagation problem entirely.

### 3.4 Forward-link extraction

`backlinkIndex.updateDocumentFromMarkdown(docName, content)` is the canonical re-extraction primitive. Called by S1 for backlink-source docs after their content is rewritten ([api-extension.ts:1173](packages/server/src/api-extension.ts#L1173)). **Not called for the renamed doc itself** in any surface — its forward links are inferred from its content as it sits at the new path; if rename rewrites self-references (S1 only), the forward-link state is consistent post-rename.

---

## 4. Axis 3 — Shadow git history & attribution

### 4.1 Writer-ID taxonomy

Five categories defined in CLAUDE.md (also covered in [`reports/agent-identity-attribution-worldmodel/`](reports/agent-identity-attribution-worldmodel/REPORT.md)):

- `agent-<connId>` — MCP-connected agent session
- `principal-<UUID>` — local human principal from `principal.json`
- `file-system` — external disk write
- `git-upstream` — imported via `git pull`
- `openknowledge-service` — server-internal fallback

### 4.2 Per-surface attribution matrix

| Surface | `recordContributor` called | Writer ID | `subjectOverride` | Explicit L2 flush | ok-actor.docs | Per-doc entries (folder case) | D22 honored |
|---|---|---|---|---|---|---|---|
| S1 `/api/rename` | ✓ when `agentId` in body | `agent-<id>` or skipped | `rename: X -> Y` | ✓ `flushDocToGit` | ✓ newDocName | n/a | ✓ |
| S2 file branch | ✗ (body checked but not used) | none | none | none | none | n/a | n/a |
| S3 folder branch | ✗ | none | none | none | none | ✗ none generated | n/a |
| S4 MCP `rename_document` | ✓ via S1 | `agent-<id>` | via S1 | via S1 | via S1 | n/a | ✓ |
| S6 watcher rename | ✗ (no rename-specific contributor; only update path runs `recordContributor`) | none | none | (next idle drain stages disk state) | none | n/a | n/a |
| S7 watcher delete+create | indirectly via `applyExternalChange` for create event | `file-system` | reconcile-style | ✓ via persistence | content-update doc only | n/a | n/a |
| S8 upstream import | UNRESOLVED | `git-upstream` | UNRESOLVED | UNRESOLVED | UNRESOLVED | UNRESOLVED | UNRESOLVED |

**D22 LOCKED** ([specs/2026-04-21-agent-write-summaries/SPEC.md](specs/2026-04-21-agent-write-summaries/SPEC.md)) — rename/rollback handlers MUST gate `recordContributor` on explicit `agentId` in the request body. Prevents `extractAgentIdentity`'s Claude default from misattributing UI clicks.

### 4.3 Timeline-query scoping

[`getDocumentHistory`](packages/server/src/timeline-query.ts) uses `git log --full-history -- <docPath>` ([timeline-query.ts:367](packages/server/src/timeline-query.ts#L367)) to scope commits to the queried doc. Checkpoints are post-filtered via `cat-file -e <sha>:<docPath>` ([timeline-query.ts:316](packages/server/src/timeline-query.ts#L316)).

**Established gaps (already in conversation context, summarized for completeness):**

- **Per-writer fan-out ghost commits.** `commitWipFromTree` ([shadow-repo.ts:389](packages/server/src/shadow-repo.ts#L389)) creates one commit per writer using a single shared tree built from the entire `contentRoot`. A writer's commit can show a delta at path X relative to their previous WIP ref even if they didn't touch X — because the shared tree picked up another writer's earlier change. `git log -- <path>` then includes that commit, attributed to the wrong writer.
- **`git log --follow` not used.** Pre-rename history is unreachable. `--follow` is single-file-only and uses git's similarity heuristic (default 50% — confirmed by web probe). Folder paths are not supported by `--follow` at any version of git.
- **No on-disk rename log.** No alternative mechanism reconstructs cross-rename history.

### 4.4 Rollback semantics

[`handleRollback`](packages/server/src/api-extension.ts) restores a doc's content at a historical SHA via `git show <sha>:<docPath>`. Implications:

- If the doc has been **renamed since the rollback target**, the rollback uses the post-rename `docName`. Pre-rename history is invisible to the rollback UX (timeline doesn't show it).
- D22 applies: UI-driven Restore (no `agentId`) stays anonymous.
- Forward-link extraction does not re-run on rollback. A doc that was renamed and rolled back has stale forward-link state until next edit.

---

## 5. Recovery & rollback paths

| Surface | Recovery journal | Crash-safety scope |
|---|---|---|
| S1 `/api/rename` | ✓ `withManagedRenameRecovery` ([api-extension.ts:1152](packages/server/src/api-extension.ts#L1152)) | Snapshot of source doc + all backlink sources before rewrite |
| S2 file branch | ✓ `withManagedRenameRecovery` ([api-extension.ts:4025](packages/server/src/api-extension.ts#L4025)) | Snapshot of source doc only (no backlink rewrites to roll back) |
| S3 folder branch | ✗ raw `applyRename()` ([api-extension.ts:4027](packages/server/src/api-extension.ts#L4027)) | None — partial-state on crash |
| S6 watcher rename | ✗ | None — rename is observation, not transaction |
| S7 watcher delete+create | ✗ | None |
| S8 upstream import | UNRESOLVED | UNRESOLVED |

**Observation.** S3's folder branch lacks recovery journaling. If a process crash interrupts a folder rename mid-batch, the contentDir can land in a partial state (some files renamed, others not) with no recoverable journal. Compare S1/S2 which use the journal pattern for single-file renames.

---

## 6. Cross-cutting gaps

These span axes — observations only.

1. **S2 ≠ S3 in side-effect coverage.** The file branch of `/api/rename-path` skips both link rewrite *and* backlink-index update. The folder branch updates the index but not link text. S1 does both but is file-only. No surface does the union of "link rewrite + folder support."

2. **External rename flow is best-effort.** S6 detects renames at the watcher layer but propagates them only to the file index — backlinks, forward links, and shadow-commit subject are unaware. S7 (the fallback for cross-batch or content-changed renames) breaks the rename into two events; the doc loses identity entirely from the watcher's perspective.

3. **No rename surface validates `content.include` / `content.exclude` admission.** A rename can move a doc out of the admitted set or into an excluded path. The file-watcher silently stops indexing it.

4. **Folder rename has no MCP exposure.** Agents must loop S4 per file to simulate. This loop produces N L2 drains, N attributed commits, N `rename: X -> Y` subjects — strictly more attribution than the UI folder rename, but at higher protocol cost.

5. **D22 is binary (agent-or-anonymous).** Principal-driven UI renames cannot be attributed today even though `principal-<UUID>` is a first-class writer category in the taxonomy. The UI knows its principal but doesn't send it on rename requests, and even if it did, the handlers' `extractAgentIdentity` flow has no principal branch.

6. **Per-writer fan-out + lack of `--follow` compose.** Ghost commits make cross-writer activity appear in unrelated docs' timelines; `--follow` absence drops pre-rename history entirely. Combined effect on a long-lived doc that's been renamed once: the timeline shows ghost entries from other writers but no entries from the doc's own pre-rename life.

7. **Forward-link extraction never re-runs post-rename for the renamed doc.** S1 rewrites self-references; the renamed doc's forward links thus stay self-consistent. But after a rollback, or after S2/S3/S6/S7, the renamed doc's forward-link extraction is stale until the next mutating edit.

8. **Recovery-journal asymmetry.** S1 protects file rename + backlink rewrites. S2 protects file rename only. S3 has no recovery. S7 has no recovery. A crash during S3 leaves contentDir in partial state; a crash during S7 leaves the watcher state inconsistent with disk.

9. **Extension flip is unguarded.** A rename can change `.md` to `.mdx` or vice versa. No surface emits a warning, and no spec covers the implication for downstream renderers.

10. **Backlink-index on-disk cache survives rename only when surface updates it.** S2's gap means a rename can leave the cache pointing at the old docName indefinitely until a process restart or full re-scan.

---

## 7. Patterns observed (cross-channel)

### 7.1 Convergences

- **Git rename detection limits are universal.** Code (no `--follow` use), reports (`git-directory-nesting-shadow-repo` confirms 50% similarity threshold, single-file-only), and web (multiple sources on the same threshold and limit) all converge on git's per-file heuristic boundary.
- **External-rename detection is a known industry gap.** Web (Obsidian forum) + reports (`parcel-watcher-crdt-disk-bridge`) + code (S6's same-batch-only requirement) all show that watcher-detected renames are partial — content-changed or cross-batch renames degrade to delete+create.
- **Stable-ID linking is the only known deterministic solution.** Reports (`wiki-links-backlinks-architecture`) and web (AnyType `@`-mentions) converge: ID-based linking eliminates rename-propagation entirely; path-based linking requires invalidation cascades.

### 7.2 Divergences

- **Code agent flagged S2 backlink-index update as MEDIUM confidence; verification confirms it's CONFIRMED missing.** The file branch of `/api/rename-path` simply doesn't call `backlinkIndex.renameDocument`. The folder branch does. Asymmetric.
- **Code agent claimed file-watcher emits delete+create for all renames; verification shows file-watcher DOES detect rename when content hashes match within one batch** ([file-watcher.ts:298](packages/server/src/file-watcher.ts#L298)). The agent's claim was overstated. The correct framing: rename detection is best-effort and content-conditional.

### 7.3 Recurring themes

- **"Surface knows what changed but doesn't propagate" pattern.** S2 (knows the rename but doesn't update the index), S3 (updates the index but not the link text), S6 (emits a rename event but no link consequences), and timeline-query (knows about contributor docs but doesn't filter ghost commits) all share the shape: the immediate operation is correct but a downstream invariant is left to drift.
- **Attribution-as-afterthought.** D22 is a defensive rule against mis-attribution, not a comprehensive attribution framework. The principal branch was never wired through; folder branch was never wired at all. Each surface implemented attribution in isolation, which produced the gap matrix in §4.2.

---

## 8. Prior research findings (reports channel)

Foundational context from prior reports that bears on rename handling. Most-relevant first.

- **[`timeline-scope-filter-patterns/`](reports/timeline-scope-filter-patterns/REPORT.md)** (2026-04-20). The hardest blocker for folder/project-scoped timeline is `docName` being required at every layer (server, MCP, React prop). Restore at folder/project scope is a new UX surface — entries can touch N files. Bloom filters (Git 2.27+) are a perf lever for folder-scoped log but coordinate with shadow-repo writer lock.
- **[`wiki-links-backlinks-architecture/`](reports/wiki-links-backlinks-architecture/REPORT.md)** (2026-04-04). Stable IDs in frontmatter eliminate rename-propagation entirely. Foam's `Map<target, Set<source>>` is the O(1) bar. Incremental update (diff old vs new links per doc) is strictly superior to full rebuild. AFFiNE confirms CRDT editors do not solve backlinks at the framework level — application-layer.
- **[`agent-identity-attribution-worldmodel/`](reports/agent-identity-attribution-worldmodel/REPORT.md)** (2026-04-18). Documents the seven simultaneously-active attribution surfaces, the writer-ID taxonomy, and the per-MCP-subprocess identity invariant. `AGENT_WRITE_ORIGIN` is a shared constant across all agents — relevant if per-agent rename attribution is ever desired.
- **[`auto-persistence-version-history-patterns/`](reports/auto-persistence-version-history-patterns/REPORT.md)** (2026-04-08). Restore is universally implemented as a forward operation (new commit), never destructive rollback. CRDT origin tracking does not survive serialization — must live in git history.
- **[`parcel-watcher-crdt-disk-bridge/`](reports/parcel-watcher-crdt-disk-bridge/REPORT.md)** (2026-04-07). @parcel/watcher emits `delete` + `create` for rename, NOT a single rename event. Race windows around rename are documented. (This codebase has a hash-based pairing pass on top to recover a rename event when possible.)
- **[`git-directory-nesting-shadow-repo/`](reports/git-directory-nesting-shadow-repo/REPORT.md)** (2026-04-08). `git log --follow` similarity-50% behavior; single-file-only; fails at directory scope.
- **[`config-edit-paths/`](reports/config-edit-paths/REPORT.md)** (2026-04-25). YAML round-trip + path glob plumbing if rename-aware config edits land here.
- **[`config-driven-folder-frontmatter/`](reports/config-driven-folder-frontmatter/REPORT.md)** (2026-04-16). Glob precedence pitfalls in `content.include`/`content.exclude`.
- **[`symlink-handling-file-sync-crdt/`](reports/symlink-handling-file-sync-crdt/REPORT.md)** (2026-04-12). Realpath-based identity — foundation for "two paths → same Y.Doc" semantics.

**Confirmed negatives in CATALOGUE search.** No dedicated reports for: rename mechanics overview, recovery-journal architecture, doc-name remap protocol, forward-link mechanics, file-watcher rename event detection (only mentioned as sub-findings in adjacent reports).

---

## 9. Third-party landscape (web channel)

Context only — for comparing primitives across systems.

- **Obsidian.** In-app rename auto-rewrites inbound links. External rename loses backlinks (matches our S6/S7). Folder rename does not update redlinks pointing at uncreated notes inside the folder — known limitation.
- **Logseq.** Same `[[brackets]]` syntax; explicit feature gap noted in community forums for system-folder rename.
- **AnyType.** Uses `@`-symbol mentions resolved by stable IDs at render time. Sidesteps rename propagation entirely. Migration tools to/from Obsidian convert between path-based and ID-based.
- **GitHub wiki / GitLab wiki.** Path-based linking with no automatic rewrite.
- **note-link-janitor (Andy Matuschak).** Script-based offline backlink injection; full-rebuild model.
- **Karpathy LLM-wiki pattern.** "LLMs touch fifteen files in one pass" framing — agent-driven rewrite as the primitive. Aligns with this codebase's MCP rename_document approach (loop file renames with agent attribution).

**Git rename detection (web confirms code findings).**

- Default similarity threshold: 50% (`-M50%`). Tunable.
- `--follow` works only for single file. Confirmed.
- `diff.renamelimit` (`-l300` default) caps inexact rename detection on large commits — silent skip emits a "too many files, skipping inexact rename detection" warning.
- A rename + heavy edit (>50% content change) defeats `--follow` silently.

---

## 10. UNRESOLVED / ADJACENT / INACCESSIBLE

### UNRESOLVED

- **Git-upstream rename handling (S8).** Searched: `api-extension.ts`, `external-change.ts`, `shadow-repo.ts`, grep for `git-upstream` and `import:` paths. The codebase has an upstream-import path but no explicit rename detection or contributor attribution for upstream-imported renames was found. The shadow commit subject prefix `import:` is documented in [SPEC §FR-13](specs/2026-04-18-agent-identity-attribution-foundation/SPEC.md) but rename semantics within an import are not specified. **Trail:** read upstream-related code paths in api-extension; confirmed no `--follow` or rename-detection flag passed to the upstream walk.
- **`backlinkIndex` on-disk cache key shape.** Code agent claimed "SHA1-based, content-hashed not path-keyed" at MEDIUM confidence. Not verified inline. **Trail:** would require reading `backlink-index.ts` directly; deferred for spec-time investigation.
- **What S6 does for folder renames.** The watcher's hash-based pairing pass works per-file. A folder rename produces N delete+N create events; whether the pairing pass scales to detect the entire folder as renamed (it shouldn't — pairing is per-file) is UNRESOLVED. **Trail:** read `classifyEvents`; pairing operates on individual file paths; folder identity is not tracked.
- **Whether S2 is reachable from any UI affordance.** [FileTree.tsx:687](packages/app/src/components/FileTree.tsx#L687) routes file renames to S1, not S2. S2 may be dead code or reserved for future use. **Trail:** grep for `/api/rename-path` callers in `packages/app/src` returned only the FileTree dispatch (which uses S1 for files).
- **Recovery-journal recovery semantics across rename failure modes.** [`withManagedRenameRecovery`](packages/server/src/managed-rename-journal.ts) was not read; the contract for what it restores on crash is inferred from the snapshot shape. **Trail:** would need to read the journal module itself.

### ADJACENT

- **Delete handling (`handleDeletePath`).** Same `extractAgentIdentity` path as rename; does not record a contributor for deletion. Separate but structurally analogous to S3.
- **Symlinks.** Realpath-based identity ([`reports/symlink-handling-file-sync-crdt/`](reports/symlink-handling-file-sync-crdt/REPORT.md)). Two paths resolving to the same inode share a Y.Doc. A rename of a symlink target vs the symlink itself has different semantics — not surveyed.
- **Worktree edge cases.** [`reports/worktree-git-shadow-repo-issue/`](reports/worktree-git-shadow-repo-issue/) flags shadow-repo issues under worktrees. Renames inside a worktree may interact differently if the shadow refs are worktree-shared.
- **`y-codemirror.next` source-mode rename.** When the user renames a doc while it's open in source mode, the CodeMirror binding's `Y.Text('source')` is on a different Y.Doc post-rename. UI behavior not surveyed.
- **CRDT origin survival across rename.** [`auto-persistence-version-history-patterns/`](reports/auto-persistence-version-history-patterns/REPORT.md) notes "CRDT origin tracking does not survive serialization." Implication for rename: per-character attribution from before the rename is in git history only, not in the post-rename Y.Doc.

### INACCESSIBLE

None. All relevant sources were reachable.

---

## 11. Open questions for spec phase

These are questions that, if answered before spec work, would constrain the design space. Listed in dependency order.

1. **Should principal-`<UUID>` be wired through rename/rollback as a third D22 branch?** Today: agent-or-anonymous. The principal writer category exists in the taxonomy but isn't reachable from these handlers.
2. **Is S2 dead code?** If yes, deleting it removes one source of asymmetry. If no (e.g., reserved for future), its lack of link-rewrite parity is load-bearing.
3. **Should `/api/rename` and `/api/rename-path` consolidate?** They have non-equivalent semantics today. If consolidating, which surface's behavior is canonical for the file case? (Established in conversation: S1's link-rewrite semantics need to be preserved.)
4. **Does `content.include` / `content.exclude` admission apply to rename destinations?** If yes, where (API boundary, file-walker re-validation, both)?
5. **Does folder rename get its own MCP tool, or do agents continue to loop file renames?** Trade-off: atomic semantics vs N-protocol-call cost.
6. **How does S8 (upstream import) attribute renames?** Today the answer is UNRESOLVED. If a `git pull` brings in a rename, the shadow commit subject and contributor entries are not yet specified for that case.
7. **Should the timeline scope to exclude per-writer fan-out ghost commits?** If yes, by `ok-actor.docs` filter, by tree-diff content check, or by per-writer narrow trees?
8. **Should `git log --follow` be enabled in `getDocumentHistory`?** Single-file scope is a fit; trade-off is similarity-heuristic cost vs deterministic rename log.
9. **Should an explicit rename log live at `<contentDir>/.open-knowledge/renames.jsonl`?** Would resolve `--follow`'s heuristic uncertainty and enable folder-aware history. Would also need a maintenance discipline.
10. **Should the file-watcher rename event invoke link-rewrite machinery?** If yes, attribution becomes `file-system` writer for the rewrites, which may surprise users (one external `mv` produces N attributed edits in the timeline).
11. **Is extension flip on rename intentional?** If yes, render-time semantics need a guard. If no, a check belongs at the API boundary.
12. **Does folder rename need a recovery journal?** S3 currently has none. A crash mid-folder-rename leaves contentDir partial.

---

## 12. Terminology

| Term | Meaning | Source |
|---|---|---|
| S1–S8 | Surface labels in this report only — for cross-section reference. | this report |
| `ok-actor:` | JSON-line in shadow commit body carrying writer + docs + summaries. | [api-extension.ts:419](packages/server/src/api-extension.ts#L419) |
| `subjectOverride` | Per-action commit subject (e.g., `rename: X -> Y`) replacing default `formatWipSubject(docs)`. | [contributor-tracker.ts:40](packages/server/src/contributor-tracker.ts#L40) |
| `D22 LOCKED` | Spec decision: rename/rollback handlers gate `recordContributor` on explicit `agentId`. 1-way door. | [SPEC](specs/2026-04-21-agent-write-summaries/SPEC.md) |
| `_performManagedRename` | The full-spine rename helper called by S1. Reads backlink sources, rewrites links, atomic disk move, journal-protected. | [api-extension.ts:1104](packages/server/src/api-extension.ts#L1104) |
| `commitWipFromTree` | Per-writer fan-out shadow commit creator. All writers share one tree per drain cycle. | [shadow-repo.ts:389](packages/server/src/shadow-repo.ts#L389) |
| `withManagedRenameRecovery` | Crash-safe wrapper around rename mutations using a snapshot journal. | imported in [api-extension.ts:1152](packages/server/src/api-extension.ts#L1152) |
| ContentFilter | Combines `.gitignore` + config-driven `content.exclude`/`content.include`. | [content-filter.ts:2](packages/server/src/content-filter.ts#L2) |
| Ghost commit | A timeline entry for file X attributed to writer A even though A didn't edit X — caused by per-writer fan-out shared trees. | conversation context |
| Redlink | Wiki-link to a target that doesn't exist; rendered with a visual indicator. | wiki-links-backlinks report |

---

## Meta

- **Channels run:** Code (Explore subagent), Reports (CATALOGUE scan + top-3 deep dives), Web (3 probes).
- **Channels unavailable:** OSS (`~/.claude/oss-repos/` not present); no topic-relevant catalog skills.
- **Verifications performed inline:** S2 backlink-index gap (CONFIRMED), file-watcher rename event detection (rename detected when content matches in same batch, ELSE delete+create), ContentFilter wiring.
- **Confidence-prose discipline:** CONFIRMED claims have inline file:line citations; MEDIUM claims are labeled; UNRESOLVED items list trail.
- **What this report does not do:** recommend fixes, rank gaps, propose specs. The Open Questions in §11 are framed as decisions the spec author must make, not as recommendations.
