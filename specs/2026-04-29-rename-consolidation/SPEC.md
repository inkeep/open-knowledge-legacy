# Rename consolidation + principal attribution + folder MCP tool — Spec

**Status:** Draft
**Owner(s):** miles@inkeep.com
**Last updated:** 2026-04-29
**Baseline commit:** 71517635
**Links:**
- World model: [`reports/rename-handling-gaps/REPORT.md`](../../reports/rename-handling-gaps/REPORT.md)
- Evidence: [`./evidence/`](./evidence/)
- Spec being amended: [`specs/2026-04-21-agent-write-summaries/SPEC.md`](../2026-04-21-agent-write-summaries/SPEC.md) (D22)
- Foundational attribution spec: [`specs/2026-04-18-agent-identity-attribution-foundation/SPEC.md`](../2026-04-18-agent-identity-attribution-foundation/SPEC.md)

---

## 1) Problem statement

**Situation.** Open Knowledge has two HTTP rename endpoints with non-equivalent semantics. `/api/rename` (file-only) runs a full link-rewrite spine — rewrites inbound `[[wiki-links]]` and supported markdown links in linking docs, rewrites self-references, updates the backlink index in-memory and on disk, and is wrapped in a recovery journal. `/api/rename-path` (file or folder) covers both kinds but runs none of that machinery: the file branch only moves the file on disk; the folder branch additionally updates the in-memory backlink index but never touches link text. UI dispatches file renames to `/api/rename` and folder renames to `/api/rename-path`. The MCP `rename_document` tool calls `/api/rename`. There is no MCP tool for folder rename; agents loop file renames to simulate one.

Additionally, contributor attribution for renames is gated on D22 (LOCKED 1-way door, [agent-write-summaries SPEC §10 D22](../2026-04-21-agent-write-summaries/SPEC.md)). Today the gate is binary: explicit `agentId` in the request body → attribute to that agent; no `agentId` → skip attribution entirely. UI clients send no `agentId` (because `extractAgentIdentity`'s default would mis-attribute every UI click to Claude), so all UI renames are anonymous in the timeline. The `principal-<UUID>` writer category exists in the writer-ID taxonomy ([attribution-foundation SPEC](../2026-04-18-agent-identity-attribution-foundation/SPEC.md), precedent #25) but is unreachable from the rename and rollback handlers.

**Complication.** Five compounding issues:

1. **Folder rename leaves backlinks dangling.** A user dragging a folder in FileTree triggers `POST /api/rename-path` with `kind: 'folder'`. The renamed files move on disk, but every linking doc still contains the literal text `[[old/path/file]]`. They render as redlinks until manually fixed. The backlink index says one thing; the rendered link text says another.
2. **Folder rename has no crash safety.** `withManagedRenameRecovery` wraps file renames; folder rename calls `applyRename` directly. A process crash mid-batch leaves `<contentDir>` in a partial state — some files renamed, others not, no journal to replay.
3. **UI-driven renames are anonymous in the timeline.** A user dragging a file produces a shadow commit attributed to no contributor. The information needed to attribute it (the principal identity) exists at `<contentDir>/.open-knowledge/principal.json` and is already authenticated through the WS layer for CRDT writes, but the HTTP rename and rollback handlers never look it up.
4. **Agent-driven folder rename costs N protocol calls.** Without an MCP folder-rename tool, agents must `list_documents` then loop `rename_document`. Each call produces its own L2 drain and shadow commit, fragmenting attribution and load-balancing concerns across N round trips.
5. **Two endpoints with diverging semantics is a maintenance hazard.** Future rename work has to update both code paths or accept silent skew. The file branch of `/api/rename-path` already drifted — it's the only file-rename code path that doesn't update the backlink index at all (CONFIRMED gap).

**Resolution.** Three bundled improvements that share a common spine.

1. **Consolidate** to one polymorphic endpoint (`/api/rename-path` with `kind: 'file' | 'folder'`). Lift the link-rewrite spine into a shared helper invoked by both branches. Delete `/api/rename`. Repoint UI and MCP callers atomically — both live in this monorepo, both can update in lockstep.
2. **Extend the recovery journal** (v1 → v2) to cover folder rename. Snapshots cover every affected doc + every backlink-source doc across all of them.
3. **Supersede D22 with D22-A:** rename and rollback handlers route attribution via a new `extractActorIdentity` helper — body `agentId` → agent contributor; absent → `getPrincipal()` fallback to the server's loaded principal. The OK server is single-principal ([standalone.ts:385-391](packages/server/src/standalone.ts#L385) — "single-user loopback deployment"); body-supplied `principalId` is rejected as a security boundary. UI payloads do not change. Side-effect docs (backlink-rewrite cascades) stay anonymous (carve-out preserved). Covers `handleRollback` symmetrically (D-A10).
4. **Add MCP `rename_folder`** mirroring `rename_document`'s shape — calls the consolidated endpoint with `kind: 'folder'`.

---

## 2) Goals

- **G1.** A folder rename in the UI rewrites all inbound wiki-links and supported markdown links in linking docs, end-to-end, without manual fix-up.
- **G2.** A folder rename is crash-safe — process kill mid-batch is recoverable on next startup with no data loss and no partial state visible to readers.
- **G3.** A UI-driven rename (file or folder) lands in the timeline with a `principal-<UUID>` contributor entry visible as the user's identity ("Miles renamed X → Y"), not anonymous.
- **G4.** An agent can rename a folder via a single MCP call with proper per-affected-doc attribution.
- **G5.** Renames flow through one server endpoint. The asymmetric file vs folder paths in `handleRenamePath` are eliminated as a maintenance hazard.

---

## 3) Non-goals

- **[NOT NOW] NG1.** External rename link rewrites. When the file-watcher detects a rename via `mv` on disk, it does NOT trigger backlink rewrites in linking docs. Out of scope here. Revisit if the gap surfaces in real workflows or the watcher's hash-based pairing pass becomes more reliable. (Tracked at world model §6 gap 2.)
- **[NOT NOW] NG2.** Per-writer fan-out ghost commits in `timeline-query.ts`. Different code path; ~30-line filter fix. Will ship as its own task.
- **[NEVER] NG3.** Stable-ID linking (frontmatter IDs as link targets). Architectural alternative that would dissolve roughly half of the world-model gaps but locks in a permanent UX trade-off and a one-way migration. The codebase has chosen path/title-based linking and pays the rename-propagation tax via the rewrite spine.
- **[NOT UNLESS] NG4.** `git log --follow` adoption for the timeline. Only if pre-rename history loss surfaces as a real user complaint. Tracked in a future timeline spec.
- **[NOT UNLESS] NG5.** Extension flip guard (`.md` ↔ `.mdx`). Only add if cheap to bolt onto the consolidated endpoint's input validation. Otherwise defer.
- **[NOT UNLESS] NG6.** `content.include` / `content.exclude` admission validation on rename destinations. Only add if cheap to bolt onto the consolidated endpoint. Otherwise defer.
- **[NEVER] NG7.** Default-attribute UI renames to any agent identity (Claude or otherwise) when no `principalId` or `agentId` is supplied. Preserves D22's anonymity invariant for surfaces that don't supply identity.
- **[NEVER] NG8.** Attribute side-effect docs (backlink rewrites in N linking docs) to the principal or agent who triggered the rename. Applies to BOTH agent-driven and principal-driven renames per D-A2 (challenger H2 considered and rejected). Rationale: a rename's intent is to move one doc, not to edit N. The renamed doc itself records the actor; the cascading backlink rewrites are mechanical side effects.

---

## 4) Personas / consumers

- **P1 — Editor user (Principal).** Authenticated human via the `principal-<UUID>` writer identity. Drags files/folders in FileTree, types in the editor, clicks Restore in the timeline. Expects renames to "just work" — links update, history attributes correctly.
- **P2 — Agent (MCP-connected).** Calls `rename_document` (today) and `rename_folder` (after this spec). Identity carried as `agent-<connId>`. Expects atomic semantics + summaries that land on the timeline.
- **P3 — Server (system writer).** `file-system`, `git-upstream`, `openknowledge-service`. Triggered by external `mv`, `git pull`, or internal recovery flows. Doesn't go through this spec's surfaces but coexists with them in the writer-ID taxonomy.

---

## 5) User journeys

### P1 happy path — UI folder rename
1. User drags `notes/old-folder/` to `notes/new-folder/` in FileTree.
2. Browser POSTs `/api/rename-path { kind: 'folder', fromPath: 'notes/old-folder', toPath: 'notes/new-folder' }`. (No `principalId` in body — server resolves it via `getPrincipal()`.)
3. Server enumerates affected docs, captures pre-content snapshots into a v2 recovery journal at `<contentDir>/.open-knowledge/managed-rename.json`.
4. For each affected doc, runs the rewrite spine: gather backlink sources, rewrite their wiki-links + markdown links to point at the new path, update self-references, update backlink index.
5. Atomic disk move (`renameTrackedPathInGit` or `renameSync`).
6. Records contributor entries: one `principal-<uuid>` entry per affected doc with `subjectOverride: 'rename: notes/old-folder/X -> notes/new-folder/X'`. Side-effect docs stay anonymous.
7. Clears journal. Triggers L2 drain.
8. UI reflects new tree. Timeline shows "Miles renamed notes/old-folder/ → notes/new-folder/" with the affected docs listed.

### P1 failure / recovery path — process crash mid-rename
1. Same as above through step 4 (some link rewrites complete, others pending).
2. Process kill (server crash, OOM, restart).
3. Next server boot: `recoverPendingManagedRename(contentDir)` reads `<contentDir>/.open-knowledge/managed-rename.json`.
4. Restores every snapshot's pre-content. Cleans destination paths. Clears journal.
5. State is identical to pre-rename. User retries.

### P2 happy path — Agent folder rename
1. Agent decides to reorganize `articles/` → `essays/`.
2. Agent calls `rename_folder({ fromFolder: 'articles', toFolder: 'essays', agentId: '<conn-id>', summary: 'Reorganizing taxonomy' })`.
3. MCP tool POSTs `/api/rename-path { kind: 'folder', fromPath: 'articles', toPath: 'essays', agentId, agentName, ..., summary }`.
4. Server runs the same flow as P1 happy path, but contributor is `agent-<conn-id>` per affected doc; summary applies to the rename event.
5. Tool response: full list of renamed docs + per-doc preview URLs + summary echo.

### P1 "Aha moment"
- A user renames a folder. They open a doc that linked into the renamed folder. The link still works — wiki-link text now reads `[[essays/auth]]` instead of `[[articles/auth]]`. No manual fix-up. Backlinks panel shows the new structure immediately.

### Debug experience
- A rename fails. The tool/endpoint response includes the actor (agent or principal), the affected doc list, and the failure reason. The recovery journal at `<contentDir>/.open-knowledge/managed-rename.json` is inspectable on disk. Server logs include the structured `rename:` subject and contributor JSON.

### Interaction state matrix

| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| FileTree drag-rename (folder) | spinner on dragged node | n/a | toast + tree reverts | tree updates, focus follows | crash → journal recovery on next boot restores pre-rename state |
| MCP `rename_folder` | tool blocks | n/a | structured error response | response with renamed list + previewUrls | partial completion impossible (atomic via journal); error response includes full snapshot |
| Timeline (post-rename) | skeleton | "No history yet" | "History unavailable" | rename entry visible with subject + contributor | TBD: how does timeline render in-flight rename events? See OQ-1 |

---

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | FR1. `/api/rename-path` is the only HTTP rename endpoint. | `POST /api/rename` returns 404. UI and MCP callers both target `/api/rename-path`. | `/api/rename` is deleted, not deprecated. |
| Must | FR2. The link-rewrite spine is a shared helper invoked by both `kind: 'file'` and `kind: 'folder'` branches of `handleRenamePath`. | Both branches call the same function (or composition) for: backlink-source enumeration, wiki-link rewriting, markdown-link rewriting, self-reference rewriting, backlink-index update (in-memory + on-disk). | Lifted from `_performManagedRename`. |
| Must | FR3. Folder rename rewrites inbound wiki-links and supported markdown links in linking docs for every affected file. Destination parent directory is auto-created with `mkdirSync({ recursive: true })`. Two collision/cycle invariants enforced (per D-A9): rename-map collisions return 409 at journal-build; swap cycles use placeholder-substitute internally. Case-only renames return 400 (out of scope). | After `POST /api/rename-path { kind: 'folder', ... }`, no linking doc anywhere in `contentDir` contains `[[old/path/file]]` text where `old/path/file` was an affected doc. Rendered backlink panel shows correct counts. Auto-create test passes (rename to nested non-existent destination parent). 409 on collision; 400 on case-only. | Intra-folder links (where both ends are remapped) resolve correctly without double-rewriting — see D-A9. |
| Must | FR4. The recovery journal v2 supports folder rename. | A v2 journal capturing a folder rename in flight survives a process kill. Next server boot restores pre-rename content for every affected doc + every backlink-source doc, removes any new destination files, clears the journal. | Schema bump from v1; v1 journals on disk at startup are honored — see OQ-3. |
| Must | FR5. Rename and rollback handlers attribute to the server-side principal via `getPrincipal()` when no `agentId` is supplied in the body. | `POST /api/rename-path { ... }` (no `agentId`) produces a shadow commit with `ok-actor: { writer_id: 'principal-<uuid>', display_name, ... }` matching the server's loaded principal. The renamed doc shows the principal as a contributor in `getDocumentHistory()`. | UI does NOT send `principalId` in body. `extractActorIdentity` reads body `agentId` → if absent, calls `getPrincipal()` server-side. See evidence/oq-7-principal-trust-boundary.md. |
| Must | FR6. D22 anonymity invariant preserved when no principal is loaded. | When body has no `agentId` AND `getPrincipal()` returns null (server-bootstrap failure), no contributor entry is recorded. | Edge case; `principal.json` is loaded at server boot and validated. |
| Must | FR7. Side-effect docs from a principal-driven rename remain anonymous. | When the rewrite spine touches N backlink-source docs, those docs do NOT receive `principal-<uuid>` contributor entries. They flow through the existing `defaultWriter` path. | Existing carve-out for agent-driven side-effects extended to principal-driven side-effects. |
| Must | FR7b. `handleRollback` extends symmetrically with the same actor-identity routing. | UI Restore button (TimelinePanel.tsx) without `agentId` records a `principal-<uuid>` contributor on the rolled-back doc. Agent rollback with `agentId` records the agent. | Same `extractActorIdentity` helper used. See evidence/oq-8-rollback-symmetry.md. |
| Must | FR8. New MCP tool `rename_folder` exposes folder rename to agents. | Tool registered in `packages/cli/src/mcp/tools/index.ts`. Calls `/api/rename-path` with `kind: 'folder'`. Response includes per-affected-doc preview URLs + summary echo. | API shape — see OQ-4. |
| Should | FR9. The MCP `rename_document` tool repoints to `/api/rename-path` with `kind: 'file'`. | Functionally equivalent to today (same response shape, same attribution semantics). | Internal-only change; tool API stable to agents. |
| Should | FR10. The file branch of `handleRenamePath` updates the backlink index. | After `POST /api/rename-path { kind: 'file', ... }`, the in-memory backlink index reflects the new docName. (Today this only happens via `/api/rename` → `_performManagedRename`.) | Subsumed by FR2's shared helper; documented separately because it's a CONFIRMED current gap. |
| Could | FR11. `content.include` / `content.exclude` admission validation on rename destinations. | If `toPath` would be excluded by the active ContentFilter, the API returns 400 with a clear error. | Only if trivial to add via existing `ContentFilter` API — see OQ-5. |
| Could | FR12. Extension flip guard. | If a rename would change `.md` → `.mdx` or vice versa, the API rejects unless an explicit `allowExtensionChange: true` flag is set. | Only if trivial. See OQ-5. |

### Non-functional requirements

- **Performance.** Folder rename of 100 docs with average 5 backlink sources each (= 500 link-rewrite operations) should complete in < 5s on a warm server. Recovery journal write should not block the response by more than 50ms on common disk hardware.
- **Reliability.** Process kill at any point during a folder rename must be recoverable with no data loss. The journal is the source of truth for partial-state recovery. Snapshot capture happens BEFORE any mutation begins.
- **Security/privacy.** `principal.json` already lives at `<contentDir>/.open-knowledge/`; this spec does not change that. Principal IDs in commit bodies are already public per the existing FR-9 design (agent-identity-attribution-foundation §FR-9).
- **Operability.** Telemetry: `rename.kind` (file/folder), `rename.affected_docs_count`, `rename.rewrite_count`, `rename.journal_size_bytes`, `rename.duration_ms`. Existing `withSpan('shadow.commitWipFromTree', ...)` covers L2 drains. Add `withSpan('rename.executeRewrites', ...)` for the new shared helper.
- **Cost.** No new infrastructure. Slightly larger journal files for big folder renames — same disk volume, marginally more write cost. Acceptable.

---

## 7) Success metrics & instrumentation

- **Metric 1: Folder rename link integrity.**
  - **Baseline:** ~0% of inbound wiki-links auto-rewritten on UI folder rename today (folder branch skips the rewrite spine).
  - **Target:** 100% of inbound wiki-links + supported markdown links auto-rewritten in linking docs after a folder rename.
  - **Instrumentation:** Integration test pinning the link-text post-condition; metric `rename.dangling_links_after_rename` should be 0 on every folder rename.
- **Metric 2: UI rename attribution coverage.**
  - **Baseline:** 0% of UI-driven renames are attributed to the principal in the timeline.
  - **Target:** 100% of UI renames (no `agentId` in body) carry `principal-<uuid>` attribution when the server has a principal loaded.
  - **Instrumentation:** Test on the rename handler asserts `recordContributor` is called with the principal writer ID. Counter `rename.attribution_kind` (agent | principal | anonymous) for runtime visibility.
- **Metric 3: Folder rename crash safety.**
  - **Baseline:** No recovery journal for folder rename today.
  - **Target:** Process kill mid-folder-rename is recoverable with no observable partial state.
  - **Instrumentation:** Crash-injection test (kill server during a folder rename, verify on-disk state matches pre-rename after recovery). No production metric needed.

What we will log/trace:
- Span: `rename.executeRewrites` with attributes `rename.kind`, `rename.affected_docs`, `rename.rewrite_count`.
- Existing spans `shadow.commitWipFromTree`, `shadow.commitWip` cover the L2 drain.
- Logs: `rename:` subject prefix in shadow commits provides searchable history.

How we'll know adoption/value:
- The folder-rename gap was diagnosed mid-conversation looking at the user's actual workflow. After this spec ships, "I dragged a folder and the links broke" becomes uncatchable as a bug because the rewrite spine forces consistency.
- Timeline attribution becomes the user's audit trail. "Did I rename this, or did the agent?" gets a real answer.

---

## 8) Current state (how it works today)

Foundation document: [`reports/rename-handling-gaps/REPORT.md`](../../reports/rename-handling-gaps/REPORT.md).

Summary of current behavior:

| Surface | Trigger | File | Folder | Attribution | Link rewrite | Recovery journal |
|---|---|---|---|---|---|---|
| `/api/rename` | UI file rename, MCP `rename_document` | ✓ | — | Agent only (D22) | ✓ full spine | ✓ |
| `/api/rename-path` file branch | unreached from UI today (FileTree dispatches to `/api/rename`) | ✓ | — | None | ✗ | ✓ |
| `/api/rename-path` folder branch | UI folder rename via FileTree | — | ✓ | None | ✗ link text; ✓ backlink index (in-memory + on-disk) | ✗ |
| MCP `rename_document` | Agent tool call | ✓ | — | Agent (via `/api/rename`) | ✓ via `/api/rename` | ✓ via `/api/rename` |

Key constraints (relevant to the spec):
- Writer-ID taxonomy is fixed (precedent #25): `agent-<connId>` | `principal-<UUID>` | `file-system` | `git-upstream` | `openknowledge-service`.
- D22 is LOCKED 1-way door — amendment requires explicit spec text.
- Recovery journal pattern is established — atomic temp+rename write, cleared only on success, "do not wrap in try/finally" is load-bearing for the crash-safety guarantee.
- Backlink index is keyed by docName and rebuilt incrementally per rename.

Known gaps/bugs discovered during research (full inventory in the report §6):
- File branch of `/api/rename-path` skips backlink-index updates entirely (asymmetric with folder branch).
- File branch of `/api/rename-path` may be unreachable from any UI affordance — possibly dead code.
- File-watcher detects renames when content hashes match in one batch; falls back to delete+create otherwise.
- `git log --follow` not used; pre-rename history is unreachable in the timeline today.
- Per-writer fan-out causes ghost commits — separate task.

---

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **Editor UI (FileTree).** File and folder rename both flow through `/api/rename-path` with `kind` discriminator. The two dispatches in `FileTree.tsx:753` (`handleTreeRename`) and `FileTree.tsx:812` (`handleDropComplete`) both collapse to `/api/rename-path`. Payload shape unchanged from today (no `principalId` field). Visual UX unchanged.
- **Editor UI (Restore button).** TimelinePanel.tsx Restore button payload unchanged (`{docName, commitSha}`). The server-side amendment automatically attributes UI rollbacks to the loaded principal via `getPrincipal()`.
- **Timeline panel.** No UI change required; once principal contributor entries arrive in the data, existing `displayAuthor()` logic renders the principal name. Folder-rename entries appear with subject `rename: <fromFolder> -> <toFolder>` and contributor entries per affected doc.
- **MCP `rename_document` tool.** No external API change; internal call repoints to `/api/rename-path { kind: 'file' }`.
- **MCP `rename_folder` tool (new).** API shape — see OQ-4. Description tuned for folder semantics ("affects N docs in one call, returns full renamed list, summary applies to the rename event").
- **API endpoints:** `POST /api/rename-path` is the only rename endpoint. `POST /api/rename` returns 404.
- **Docs/onboarding:** OK MCP onboarding guide gains `rename_folder` in the tool list.

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| FileTree component | App | Drag-rename for file and folder produces correct UI updates; principal attribution visible in timeline |
| Editor's Timeline tab | App | Folder rename entries render with `rename:` subject and per-doc contributors |
| Editor's Restore button | App | Click → POST `/api/rollback { docName, commitSha }` → principal contributor recorded server-side via `getPrincipal()` |
| `POST /api/rename-path` | Server | Both `kind: 'file'` and `kind: 'folder'` succeed with full link-rewrite + attribution + journal |
| `POST /api/rename` | Server | Returns 404 |
| MCP `rename_document` | CLI/MCP | Functionally equivalent to today |
| MCP `rename_folder` | CLI/MCP | Folder rename via single tool call; per-doc summaries land on the timeline |

### System design

**Architecture overview.**

```
                    ┌──────────────────┐
                    │  /api/rename-path │
                    │  (kind: file|folder)
                    └────────┬─────────┘
                             ↓
                    extractActorIdentity(body)
                       agentId in body? → agent contributor
                       else            → getPrincipal() → principal contributor
                       getPrincipal() null? → no contributor
                             ↓
                    handleRenamePath
                             │
              ┌──────────────┴──────────────┐
              ↓                             ↓
        kind: 'file'                  kind: 'folder'
              │                             │
              │      buildSnapshots         │
              │      (source + backlink     │
              │       sources)              │
              │              ⤵              │
              │      writeManagedRename     │
              │      Journal v2             │
              │              ⤵              │
              ↓                             ↓
         applyRewriteSpine          applyRewriteSpine
         (one doc + its             (per affected doc +
          backlink sources)          all backlink sources;
                                     intra-folder dedup)
              │                             │
              └──────────────┬──────────────┘
                             ↓
                  recordContributor
                  (agent | principal | none;
                   one entry per affected doc;
                   subjectOverride: 'rename: X -> Y')
                             ↓
                  flushDocToGit (per affected doc)
                             ↓
                  clearManagedRenameJournal
```

**Data model.**

Recovery journal v2 schema (final, per D-A5):

```ts
interface ManagedRenameRecoveryJournalV2 {
  version: 2;
  fromPath: string;        // observability: 'articles/foo' (file) or 'articles' (folder)
  toPath: string;          // observability: 'essays/foo' or 'essays'
  affectedDocs: Array<{ from: string; to: string }>;  // drives recovery
  snapshots: ManagedRenameSnapshot[];                 // pre-content for affected + backlink sources
  createdAt: string;
}
```

`fromPath` and `toPath` are observability-only (used in recovery logs). `affectedDocs[]` is the authoritative list of doc renames; recovery iterates over it. `kind` is intentionally absent — recovery doesn't need it, and a 1-file folder rename would be indistinguishable from a file rename by `affectedDocs.length` anyway.

v1 journals at startup are still readable via the v1 parser; recovery routine tries v2 first, falls back to v1.

**Recovery iterates `affectedDocs[]`** to clean every `to` path that's not present in the restored snapshot set. Generalizes the v1 single-destination cleanup to N destinations. Pseudocode:

```
recover(journal):
  restored = {}
  for snap in journal.snapshots:
    write(safeContentPath(snap.docName), snap.content)
    restored.add(snap.docName)
  for doc in journal.affectedDocs:
    if doc.to not in restored:
      rmSync(safeContentPath(doc.to), { force: true })
  clearJournal()
```

**API/transport.**

- `POST /api/rename-path`
  - Body (file): `{ kind: 'file', fromPath: '<docName>', toPath: '<newDocName>', agentId?, agentName?, ..., summary? }`
  - Body (folder): `{ kind: 'folder', fromPath: '<folderPath>', toPath: '<newFolderPath>', agentId?, agentName?, ..., summary? }`
  - **No `principalId` field** — server resolves principal via `getPrincipal()` server-side when no `agentId` is present.
  - Response: `{ ok, renamed: [{fromDocName, toDocName}], rewrittenDocs: [{docName, rewrites}], summary?, previewUrls? }`

- MCP `rename_folder({ fromFolder, toFolder, agentId?, agentName?, summary?, ... })` — see OQ-4 for final shape.

**Auth/permissions.** No change. The HTTP API is server-internal (single-user loopback per [standalone.ts:385-391](packages/server/src/standalone.ts#L385)). Principal identity is read from `<contentDir>/.open-knowledge/principal.json` server-side via `getPrincipal()`. Body never carries principal identity. (Closed via OQ-7; see D-A11.)

**Enforcement point(s).** D22 amendment lives in §10 D-A1. The `extractActorIdentity` helper is the single decision point for routing identity → contributor.

**Observability.** Span `rename.executeRewrites` with attributes `rename.kind`, `rename.affected_docs`, `rename.rewrite_count`. Counter `rename.attribution_kind` (agent | principal | anonymous).

#### Data flow diagram

- Primary flow: HTTP → `extractActorIdentity` → `handleRenamePath` (kind branch) → snapshot capture + journal write → `applyRewriteSpine` (per affected doc) → `recordContributor` per affected doc → atomic disk move → clear journal → `flushDocToGit` per doc.
- Shadow paths to test:
  - **nil / missing:** `agentId` absent + `getPrincipal()` returns null → anonymous attribution path (no contributor entry; D22 invariant for the failure case).
  - **empty:** `agentId: ''` → treated as absent (validate at boundary).
  - **wrong type:** `agentId: 42` → 400 invalid input.
  - **body-supplied `principalId` (deliberately rejected):** Body field `principalId: '<anything>'` is silently ignored — server's `getPrincipal()` is the only source of truth (D-A11).
  - **timeout:** `applyRewriteSpine` partial completion → recovery journal restores; verify recovery integration test.
  - **conflict:** Two renames in flight on same paths (impossible today — single journal file is the serialization point; document this invariant explicitly).
  - **partial failure:** Per-affected-doc commit fails after rewrite — `restoreContributorEntry` carries forward; journal still cleared because disk state is consistent. Verify.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| `applyRewriteSpine` per-doc rewrite | Disk write fails mid-batch | Try/catch in spine | Journal recovery on next boot restores pre-rename | Rename appears to fail; retry recovers |
| Process kill mid-rename | Crash | Journal exists at startup | `recoverPendingManagedRename` runs at boot | None observable; pre-rename state restored |
| `recordContributor` per-doc | Tracker accumulator fails | Defensive try/catch (existing) | Continue with remaining docs | Partial attribution; logged warning; no data loss |
| Backlink index update failure | Index write throws | Try/catch around index update | Skip index update for this doc | Index drifts from disk; rebuild on next read or restart |
| `agentId` in body + server's principal exists | (no conflict — agent wins) | Routine in `extractActorIdentity` | Agent gets the contributor entry; principal is not invoked for this call | Documented behavior — agent calls override the auto-principal fallback |
| Body has `principalId` field (intentionally) | Silently ignored | `extractActorIdentity` does NOT read it | Server uses `getPrincipal()` regardless | Security invariant — see D-A11 |

### Alternatives considered

- **Option A (chosen).** Bundle three improvements in one spec. Consolidate `/api/rename` into `/api/rename-path`, lift the rewrite spine, extend the journal, amend D22 for principal, add `rename_folder` MCP tool. Bundling because all three depend on or reinforce the consolidated spine.
- **Option B.** Ship them as three separate specs. Discarded — the spine consolidation is a prerequisite for both the folder rewrite and the principal attribution wiring (D22 amendment touches the same handlers). Sequential specs would force temporary half-states or scaffolding.
- **Option C.** Adopt stable-ID linking instead. Rejected as NG3 — would dissolve the link-rewrite gap entirely but is a permanent UX trade-off and one-way migration. Path/title-based linking is the chosen design; pay the rewrite tax.
- **Option D.** Keep `/api/rename` deprecated but functional during a migration window. Rejected — both callers are in this monorepo and migrate atomically. CLAUDE.md's "don't add backward-compat shims when you can just change the code" applies.

---

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D-A1 | **Supersede D22** with a new D22-A in this spec. The original D22 in [agent-write-summaries SPEC](../2026-04-21-agent-write-summaries/SPEC.md) §10 stays unchanged for historical record; this new spec carries the authoritative current version. **D22-A:** `handleRenamePath` and `handleRollback` route attribution via `extractActorIdentity` — body `agentId` → agent contributor; absent → `getPrincipal()` fallback to server's loaded principal contributor; `getPrincipal()` returns null → no contributor (D22 anonymity invariant for the failure case only). | X | LOCKED | YES (1-way door — supersedes a 1-way door) | OQ-7 finding: server is single-principal, body-supplied `principalId` cannot be safely trusted. Server-side `getPrincipal()` is the authenticated source already used by `resolveWriterFromOrigin`. | World model §6 gap 5; evidence/oq-7-principal-trust-boundary.md; D22 source. | New helper `extractActorIdentity` replaces `extractAgentIdentity` in rename + rollback handlers (server-side only — UI payloads unchanged). D-A10 captures the rollback symmetry. |
| D-A2 | **Side-effect docs from any rename (agent or principal) stay anonymous.** Backlink-rewrite cascades use `defaultWriter` (anonymous), not the actor. The renamed-doc itself is attributed; the N backlink-source docs are not. | X | LOCKED | NO (reversible by spec amendment) | Confirmed under challenge H2: same anonymity rule for both agent and principal renames. Rationale: a single rename of a popular doc cascades to N linking docs; attributing N edits to the actor inflates their write-count and clutters per-doc timelines with a phantom edit on every backlink-source. The actor's intent was "rename one doc," not "edit 47 docs." The renamed doc itself carries the `rename: X -> Y` subject + actor — sufficient audit trail. | World model §3.2; D22 spec text on side-effect carve-out; challenger H2 + user judgment. | Codified in NG8. Test pins this behavior for both agent-driven and principal-driven renames. |
| D-A3 | **Delete `/api/rename`** atomically. No deprecation window. | T | LOCKED | YES (cannot un-delete and re-route without code change) | Both `@inkeep/open-knowledge` callers (FileTree.tsx, MCP rename-document.ts) are in this monorepo and update in lockstep. CLAUDE.md "don't add backward-compat shims" applies. The pre-1.0 user base is small (per user — "we have two active users"); accepting the localhost-HTTP exposure breakage is acceptable. | World model §1, §3.2; challenger L9 + user judgment. | Document the deletion in the published `@inkeep/open-knowledge` changelog so any external `localhost:<port>/api/rename` callers (browser extensions, scripts) are notified. |
| D-A4 | **Lift the link-rewrite spine into a shared helper** invoked by both kind branches of `handleRenamePath`. | T | DIRECTED (spec sets direction; implementer chooses naming + module placement) | NO | Eliminates the asymmetric file/folder side-effect coverage gap. | World model §6 gap 1; api-extension.ts:1114-1244 (current `_performManagedRename` body). | New module/file in `packages/server/src/`. Tests for the helper specifically. Auto-create destination parent directory (`mkdirSync({ recursive: true })`) — preserved from current behavior at api-extension.ts:1199 / 4035. |
| D-A5 | **Recovery journal v2 schema:** flat shape, no `kind` field. `affectedDocs[]` drives recovery; top-level `fromPath`/`toPath` are observability-only. Migration: v1 parser kept alongside v2; recovery routine tries v2 first, falls back to v1. | T | LOCKED | NO (schema can be amended in v3) | Recovery doesn't need `kind` — it just iterates `affectedDocs[]` and snapshots. If observability ever needs `kind` (e.g., dashboards), a v3 schema bump adds it cheaply. (Per challenger L8: this rationale is the actual reason; the "indistinguishable by length" framing was misleading.) | OQ-3 (resolved here). | Shape: `{ version: 2, fromPath, toPath, affectedDocs: [{from, to}], snapshots: [{docName, content}], createdAt }`. Test crash-injection at v2. |
| D-A6 | **`rename_folder` MCP tool API shape:** `{ fromFolder: string, toFolder: string, agentId?, agentName?, colorSeed?, summary?, clientName?, clientVersion?, label? }`. Mirrors `rename_document`'s identity field set; uses `fromFolder`/`toFolder` for clarity. | T | DIRECTED | NO (tool API can iterate; discoverable via tool description) | Naming `fromFolder`/`toFolder` matches the user-facing concept (folder, not "doc" or "path"). Identity field set is identical to `rename_document` so agents have one mental model. | OQ-4 (resolved here). | New tool in `packages/cli/src/mcp/tools/rename-folder.ts`. Registered in `tools/index.ts`. |
| D-A7 | **Summary semantics for folder rename:** single folder-level summary, applied to every affected-doc contributor entry. | P | DIRECTED | NO | One folder rename = one user intent. Per-doc summaries would force the agent to fabricate N summaries for one operation, which dilutes meaning. | OQ-1 (resolved here). | Each per-doc contributor entry's `summaries[]` contains the same single string. Timeline display already handles this. |
| D-A8 | **Actor precedence:** body `agentId` (when present) takes precedence over server-side `getPrincipal()` for the contributor's writer ID. **However, `extractActorIdentity` MUST also populate `actor.principalId` from `getPrincipal()` whenever a principal is loaded — even when the agent wins on writer ID.** This preserves the "agent on behalf of principal" audit trail. Symmetric with `buildAgentActor()` ([api-extension.ts:1323](packages/server/src/api-extension.ts#L1323)) which already attaches `actor.principalId` to non-rename agent writes. | T | LOCKED | NO | Per challenger H1: the original "agent wins" framing dropped principal context that the rest of the system carries. Refinement preserves the audit trail without changing user-facing semantics. Cost: one `getPrincipal()` call per rename. | OQ-6 (resolved here); challenger H1. | `extractActorIdentity({...})` returns `{kind:'agent', writerId, displayName, actor:{ principalId: getPrincipal()?.id, ...}}` when agent supplied; `{kind:'principal', writerId, displayName, actor:{principalId: getPrincipal()?.id}}` when no agent. Test pins this — agent rename with principal loaded → contributor.writerId='agent-X', contributor.actor.principalId='principal-Y'. |
| D-A9 | **Intra-folder link rewriting:** rename-map single-pass algorithm. Build the full rename map (`Map<oldDocName, newDocName>`) before any rewrite. For each backlink-source doc, apply ALL substitutions in one pass against pre-rename snapshots. Concurrent edits during rewrite are handled by Y.js native locks for open docs (via `document.transact()` in `applyManagedRenameToLoadedDocument`) and by `runSerialized` (`api-extension.ts:942, 1118`) wrapping `_performManagedRename` so renames are globally single-threaded. `writeTracker` is unrelated (it's the file-watcher's self-write-detection map). Three edge cases explicitly handled: (1) **collision** — two rename-map entries that would write to the same destination → 409 at journal-build time with the colliding paths in the error; (2) **swap cycles** — implementation MUST use a placeholder-substitute trick (each old-name → UUID → new-name) so a hypothetical `{A:B, B:A}` works; pin via test even if unreachable today; (3) **case-only renames on case-insensitive filesystems** (macOS APFS, Windows NTFS) — out of scope here, returns 400 with explicit error. Same case-only gap exists in S1 today. | T | LOCKED | NO | Avoids double-rewriting because rewrite is text replacement against the full map, not iterative re-scan. Existing `_performManagedRename` already uses `runSerialized` to single-thread renames; we inherit. Edge cases per challenger M5. | OQ-2 (resolved here); challenger M5. | Helper takes a rename map, not a single old/new pair. NFR add: concurrent-edit invariant explicit. Test matrix must include collision + swap-cycle + (skipped) case-only. |
| D-A10 | **Extend D22-A symmetrically to `handleRollback`.** `handleRollback` uses the same `extractActorIdentity` helper as `handleRenamePath`. UI Restore (no `agentId`) records `principal-<uuid>` contributor; agent rollback records `agent-<id>`. | T | LOCKED | NO | Asymmetry would mean an agent's rollback gets attributed today but a UI rollback wouldn't post-spec — strictly worse than today's anonymity. Both handlers share the structural pattern. | evidence/oq-8-rollback-symmetry.md; OQ-8 (resolved here). | TimelinePanel.tsx:540 Restore payload unchanged. Server-side change only. |
| D-A11 | **Trust boundary:** HTTP rename and rollback handlers do NOT accept `principalId` from request body. Server-side `getPrincipal()` is the only source of principal identity. | X | LOCKED | YES (security 1-way door — opens up a body-trust pattern that would have to be rolled back for multi-principal correctness later) | Single-principal server (standalone.ts:385-391); WS auth token verified principalId via `standalone.ts:450` (`onAuthenticate`); HTTP body is unauthenticated and cannot be trusted. (Note: multi-principal future will require session threading through call sites regardless — D-A11 is justified by the unauthenticated-body argument alone, not by the future-proofing claim. Per challenger M4.) | evidence/oq-7-principal-trust-boundary.md. | When multi-principal is ever needed: `getPrincipal()` impl needs to become session-aware AND call sites need to thread the session/request through — both are required, not just the impl change. |

### Decisions still open

| ID | Decision | Type | Status |
|---|---|---|---|
| (See §11 — OQ-5 remains open; all others resolved in D-A1 through D-A11. Audit and challenger findings folded in.) | | | |

---

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| OQ-1 | Folder rename summary semantics — per-file vs single | P | P0 | Yes | RESOLVED in D-A7: single folder-level summary | Closed |
| OQ-2 | Intra-folder link rewriting — avoid double-rewrite | T | P0 | Yes | RESOLVED in D-A9: rename-map single-pass + inherited concurrency primitives | Closed |
| OQ-3 | Journal v2 schema shape | T | P0 | Yes | RESOLVED in D-A5: flat shape, no `kind` field, `affectedDocs[]` drives recovery | Closed |
| OQ-4 | `rename_folder` MCP tool API surface | T | P0 | Yes | RESOLVED in D-A6: `fromFolder` / `toFolder` + identity field set mirroring `rename_document` | Closed |
| OQ-5 | Cheap auxiliary guards (extension flip, content.include admission) | T | P0 | No | Investigate during implementation: if both can be added in <20 LOC each, include via FR11/FR12. Otherwise defer to NG5/NG6. | Open |
| OQ-6 | Actor precedence (agent vs principal-fallback) | T | P0 | Yes | RESOLVED in D-A8: agent wins over auto-principal fallback. Simplified by OQ-7 — no body-vs-body conflict possible. | Closed |
| OQ-7 | Trust boundary on `principalId` from body | X | P0 | Yes | RESOLVED in D-A11: server is single-principal; body-supplied `principalId` rejected; `getPrincipal()` is sole source. See evidence/oq-7-principal-trust-boundary.md. | Closed |
| OQ-8 | Should `handleRollback` get the same amendment? | T | P0 | Yes | RESOLVED in D-A10: yes, extend symmetrically; same `extractActorIdentity` helper. See evidence/oq-8-rollback-symmetry.md. | Closed |

---

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Both `/api/rename` callers (FileTree.tsx file branch, MCP rename-document.ts) can migrate atomically in this PR. | HIGH | Grep for all `/api/rename` HTTP callers; confirm only the two known sites. | Before finalization | Active |
| A2 | The recovery journal v1 → v2 migration window doesn't matter — v1 journals only exist mid-rename and are cleared on success; finding one at startup means a crash, which is rare. | MEDIUM | Confirm v1 parser still works for legacy journals during the spec implementation. | Before finalization | Active |
| A3 | ~~`principalId` is already known to the browser at rename time~~ — **OBSOLETE per D-A11** (browser doesn't send `principalId`). Replaced by A3b. | — | — | — | Obsolete |
| A3b | The server's loaded principal at `<contentDir>/.open-knowledge/principal.json` is reliably available at HTTP request time. | HIGH | Bootstrap order in `standalone.ts:1223` (`loadedPrincipal = await loadPrincipal(contentDir)`) precedes the API extension wiring. | Before finalization | Active |
| A4 | Folder renames of >100 docs are rare. Performance NFR (<5s for 100 docs) does not need to scale to thousands. | MEDIUM | Document expected scale in spec; if real workflows hit >1000-doc folder renames, escalate to a follow-up perf spec. | Before finalization | Active |

---

## 13) In Scope (implement now)

- **Goal.** Ship the four functional changes (FR1–FR8) as one coherent PR. Should-haves (FR9–FR10) included by virtue of the consolidation. Could-haves (FR11–FR12) included only if trivial (OQ-5).
- **Non-goals.** All of §3 (especially NG1 external rename, NG2 ghost commits, NG3 stable-ID linking).
- **Requirements with acceptance criteria.** §6 functional requirements.
- **Proposed solution.** §9 vertical slice.
- **Owner(s)/DRI.** miles@inkeep.com.
- **Next actions.**
  1. Resolve OQ-5, OQ-7, OQ-8 in the iterative loop.
  2. Run audit (challenger + auditor) on the spec.
  3. Decompose into stories via /decompose.
  4. Implement.
- **Risks + mitigations.** §14.
- **What gets instrumented/measured.** §7 metrics.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| `/api/rename` deletion breaks an unknown caller | Grep for all `/api/rename` references in monorepo; CI typecheck after deletion | Tests pass; no 404s in dev usage |
| Recovery journal v1 → v2 schema bump leaves a v1 journal at startup | v1 parser kept alongside v2 parser; recovery routine tries both | Crash-injection test on v1 journal restoration |
| Server-side `getPrincipal()` returns null on test rigs without `principal.json` | Tests bootstrap a fake principal in test setup (or mock `getPrincipal`) | Integration test: FileTree rename → handler records principal contributor with the test principal's id |
| Existing tests pin `extractAgentIdentity` behavior | Replace call sites with `extractActorIdentity`; old name stays available for non-rename handlers | Test suite passes after refactor |

---

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Lifted rewrite spine introduces regressions in `/api/rename` semantics | M | H | Comprehensive test coverage of `_performManagedRename`'s current behavior pinned BEFORE the lift. Spine tests at the new helper. | implementer |
| Folder rename rewrite over a 1000-doc folder is too slow | L | M | Accept; document scale assumption in A4. Optimize only if real-world reports surface. | implementer |
| `principal.json` corruption / load failure leaves all UI renames anonymous (FR6 invariant) | L | L | Loaded once at server boot via `loadPrincipal`; bootstrap is monitored; corruption → fallback to anonymous attribution per D22 invariant. (Spoofing risk closed by design — D-A11.) | spec author |
| Journal v2 schema needs another revision later | L | L | Discriminated union is extensible; v2 → v3 is the same exercise. | implementer |
| Intra-folder link rewriting double-counts in test coverage | L | M | Test scenario: folder F has docs X, Y where X links to Y and folder is renamed. Verify exactly one rewrite per linking doc. | implementer |
| D22 amendment bypassed by future handler additions | M | M | Add an architectural test that scans rename/rollback handlers for `recordContributor` calls and asserts they all go through `extractActorIdentity`. | implementer |

---

## 15) Future Work

### Explored

- **External rename link rewrites (NG1).**
  - What we learned: File-watcher detects renames when content hashes match in one batch (file-watcher.ts:298). The rename event currently propagates only to the file index — backlinks, forward links, shadow-commit subject are unaware. Folder-level external rename produces N delete+create events without rename detection.
  - Recommended approach: Hook the watcher's rename event into the same shared rewrite spine, attributed to `file-system` writer.
  - Why not in scope now: Different surface (watcher, not HTTP handler), different attribution profile (every external `mv` becomes N attributed shadow commits — surprising UX), different recovery considerations (no client-side recovery journal). Worth its own spec.
  - Triggers to revisit: User reports of "I `mv`'d a folder and the links broke," or the file-watcher's hash-pairing pass becomes more reliable.

- **Per-writer fan-out ghost commits (NG2).**
  - What we learned: Per-writer fan-out makes writer A's commits show up in file X's history when only writer B edited X. ~30-line filter fix (post-filter by `ok-actor.docs ∋ currentName` OR `subject startsWith 'rename:'`).
  - Recommended approach: Surgical edit to `timeline-query.ts:367` walk; pin via integration test.
  - Why not in scope now: Different code path; this spec touches handlers + journal + MCP, not the timeline query.
  - Triggers to revisit: File the ticket separately; can ship in parallel with this spec.

### Identified

- **Stable-ID linking adoption (NG3).**
  - What we know: AnyType, Notion, Roam, Logseq use stable-ID mentions resolved at render time. Would dissolve roughly half the world model gaps. One-way migration; permanent UX trade-off (less human-readable links).
  - Why it matters: Long-term, if rename propagation costs accumulate, this is the architectural alternative.
  - What investigation is needed: Migration cost, UX prototype with ID-based links, evaluation against the readability/authoring trade-off.

- **`git log --follow` adoption (NG4).**
  - What we know: Single-file only, similarity-50% default, silently fails on heavy edits.
  - Why it matters: Today the timeline drops pre-rename history at the rename commit. Users renaming a doc lose its edit history visibility.
  - What investigation is needed: Real-world rates of "rename + heavy edit," whether the heuristic is good enough, alternative explicit rename log.

### Noted

- **Forward-link extraction post-rename (world model §6 gap 7).** Today only S1 (current `_performManagedRename`) updates the renamed doc's forward-link state via `updateDocumentFromMarkdown`. Other surfaces leave it stale until next edit. Probably fine; flag if it surfaces.
- **S2 dead code question (world model §10 UNRESOLVED).** The file branch of `/api/rename-path` may be unreachable from any UI affordance. After consolidation it goes away, but worth confirming during implementation.
- **Symlink rename semantics.** Renaming a symlink target vs renaming the symlink itself behaves differently. Out of scope here; symlink handling lives in [`reports/symlink-handling-file-sync-crdt/REPORT.md`](../../reports/symlink-handling-file-sync-crdt/REPORT.md).
- **Folder rename UX for very large folders.** No progress indicator today. May need one if real-world usage hits big folders.

---

## 16) Phased delivery (un-bundle, per challenger H3)

The original bundle thesis assumed all three improvements share a load-bearing spine. The challenger demonstrated that principal attribution (D-A1, D-A8, D-A10, D-A11, FR5–FR7b) is empirically independent of the spine consolidation — D-A10 already extends the amendment to `handleRollback` without touching the spine. Bundling the cheap user-visible win (G3) behind the architecturally riskier consolidation slows G3 needlessly.

**Phasing (two PRs):**

### Phase 1 — Rename attribution (ships first)
Independent server-side change. ~150 LOC. No UI work. No schema migration. Low regression risk.

- **Decisions:** D-A1 (supersede D22), D-A2 (side-effect anonymity), D-A8 (precedence + `actor.principalId` preservation), D-A10 (rollback symmetry), D-A11 (trust boundary).
- **Functional requirements:** FR5, FR6, FR7, FR7b.
- **Non-goals applicable:** NG7 (don't default to agent), NG8 (side-effect anonymity).
- **Files touched:**
  - `packages/server/src/api-extension.ts` — replace `extractAgentIdentity` with `extractActorIdentity` in `handleRenamePath` and `handleRollback`. Wire `getPrincipal()` fallback.
  - Tests for the new helper + symmetry across both handlers.
- **Files NOT touched in Phase 1:** the rewrite spine, `_performManagedRename`, `managed-rename-journal.ts`, MCP tools, `FileTree.tsx`.
- **Implementation prerequisites:** none. Ships standalone.
- **Acceptance:** UI rename and rollback land as `principal-<uuid>` in the timeline. Agent rename and rollback land as `agent-<id>` with `actor.principalId` populated when a principal is loaded.

### Phase 2 — Rename consolidation + folder + journal v2 + MCP tool (ships after Phase 1)
The architectural rework. Higher complexity. Higher regression risk per §14. Builds on Phase 1's `extractActorIdentity` helper.

- **Decisions:** D-A3 (delete `/api/rename`), D-A4 (lift spine), D-A5 (journal v2), D-A6 (`rename_folder` MCP), D-A7 (folder summary), D-A9 (rename-map algorithm).
- **Functional requirements:** FR1, FR2, FR3, FR4, FR8, FR9, FR10. Conditional: FR11, FR12 if cheap.
- **Non-goals applicable:** NG1 (external rename out), NG2 (ghost commits separate), NG3 (stable-ID linking out), NG4 (`--follow` deferred), NG5/NG6 (extension flip + admission deferred-or-cheap).
- **Files touched:**
  - `packages/server/src/api-extension.ts` — delete `handleRename` + `_performManagedRename`; lift the spine into a shared helper; route `handleRenamePath` through it for both file and folder branches.
  - `packages/server/src/managed-rename-journal.ts` — schema v2.
  - `packages/cli/src/mcp/tools/rename-document.ts` — repoint to `/api/rename-path` with `kind: 'file'`.
  - `packages/cli/src/mcp/tools/rename-folder.ts` — new MCP tool.
  - `packages/cli/src/mcp/tools/index.ts` — register new tool.
  - `packages/app/src/components/FileTree.tsx` — collapse two dispatch sites (753, 812) to single endpoint.
  - Tests: integration for both kind branches, journal v2 round-trip, MCP `rename_folder`, intra-folder link rewriting (with collision/swap-cycle/case-only edge cases per D-A9).
- **Implementation prerequisites:** Phase 1 merged (`extractActorIdentity` helper exists; the lifted spine consumes it).
- **Acceptance:** UI folder rename rewrites all inbound wiki-links. Crash mid-folder-rename is recoverable. Agent can call `rename_folder` for atomic folder rename with proper attribution.

### Why the order

Phase 1 first because:
1. User-visible win (G3) lands in days, not weeks.
2. No dependency on Phase 2's architectural rework.
3. Phase 2's lifted spine consumes Phase 1's `extractActorIdentity`. If Phase 2 shipped first, the spine would call `extractAgentIdentity` (current state) and Phase 1 would have to retrofit. Cleaner to land the helper first.

### What's shared

- World model report (`reports/rename-handling-gaps/REPORT.md`) — context for both phases.
- Evidence files (`evidence/oq-7-principal-trust-boundary.md`, `evidence/oq-8-rollback-symmetry.md`) — apply to both, especially Phase 1.
- This single SPEC.md is the source of truth for both phases. Two PRs reference the same spec.

---

## 17) Agent constraints

- **PHASE 1 SCOPE (rename attribution PR).**
  - `packages/server/src/api-extension.ts` — replace `extractAgentIdentity` calls in `handleRenamePath` and `handleRollback` with new `extractActorIdentity` helper. Wire `getPrincipal()` fallback. Preserve `actor.principalId` even on agent-wins per D-A8.
  - `packages/server/src/contributor-tracker.ts` — `ActorMetadata` extension if needed for principal.
  - Tests: `extractActorIdentity` unit tests; integration tests for handleRenamePath + handleRollback with all four actor combos (agent only, principal only, agent + principal loaded, neither).
  - **NOT touched in Phase 1:** rewrite spine, `_performManagedRename`, journal, MCP tools, FileTree.tsx, TimelinePanel.tsx.

- **PHASE 2 SCOPE (consolidation + folder + journal v2 + MCP PR).**
  - `packages/server/src/api-extension.ts` — delete `handleRename` and its route. Lift the link-rewrite spine from `_performManagedRename` (lines 1114–1244) into a shared helper. Route `handleRenamePath` through it for both `kind: 'file'` and `kind: 'folder'`. Preserve auto-create-parent and `runSerialized` invariants.
  - `packages/server/src/managed-rename-journal.ts` — schema v2 (flat shape, no `kind`, `affectedDocs[]`-driven recovery). Keep v1 parser alongside for legacy journals at startup.
  - `packages/server/src/` — new module/file for the shared rewrite spine helper.
  - `packages/cli/src/mcp/tools/rename-document.ts` — repoint to `/api/rename-path` with `kind: 'file'`.
  - `packages/cli/src/mcp/tools/rename-folder.ts` — new MCP tool. Mirrors `rename_document` identity field set; uses `fromFolder` / `toFolder`.
  - `packages/cli/src/mcp/tools/index.ts` — register `rename_folder`.
  - `packages/app/src/components/FileTree.tsx` — collapse the two dispatch sites at lines 753 and 812 to single endpoint `/api/rename-path`. No payload identity changes (Phase 1 did the server-side principal work).
  - Tests: integration for both kind branches; journal v2 round-trip + crash-injection; MCP `rename_folder` end-to-end; intra-folder link rewriting (collision → 409, swap-cycle via placeholder-substitute, case-only → 400).
  - Published `@inkeep/open-knowledge` changelog: note `/api/rename` deletion (per D-A3 + challenger L9 user-acknowledged break).

- **EXCLUDE (both phases).**
  - `packages/server/src/file-watcher.ts` — external rename link rewrites are NG1.
  - `packages/server/src/timeline-query.ts` — ghost-commits fix is NG2.
  - Markdown pipeline (`packages/core/src/markdown/`) — no link parser changes; the spine reuses existing `rewriteSupportedLinksForDocumentRename`.
  - Auth/session boundaries — closed by D-A11 (single-principal server). Multi-principal future is NG-class.
  - The original D22 text in [agent-write-summaries SPEC](../2026-04-21-agent-write-summaries/SPEC.md) — D-A1 supersedes via this spec; original stays for historical record (DO NOT EDIT).

- **STOP_IF (Phase 1).**
  - Existing tests pinning `extractAgentIdentity` behavior in non-rename/non-rollback handlers (e.g., `handleAgentWrite`) start to fail — STOP and review (the helper rename should be confined to rename + rollback paths only).
  - `getPrincipal()` returns null in any production code path other than server-bootstrap failure — STOP and review (likely an integration bug, not a design hole).

- **STOP_IF (Phase 2).**
  - The lifted rewrite spine helper introduces user-visible regressions in single-file rename behavior (any test pinning `_performManagedRename`'s current behavior fails) — STOP and review.
  - Journal v2 schema migration leaves a v1 journal unrestorable at startup — STOP and review (v1 parser MUST stay alongside v2).
  - Folder rename test suite produces non-deterministic intra-folder link results across runs — STOP and review (likely a swap-cycle edge case in the rename-map algorithm).

- **ASK_FIRST.**
  - New 3P dependency (none expected; flag if surprised).
  - Any change to the writer-ID taxonomy.
  - Any change to the contributor JSON shape (`ok-actor:` lines in commit bodies) — public format invariant.
  - Public MCP tool API shape for `rename_folder` (D-A6 sets direction, but final naming is still implementer-confirmable).
