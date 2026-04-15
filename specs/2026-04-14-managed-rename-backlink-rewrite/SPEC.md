# Managed Rename + Atomic Backlink Rewrite — Spec

**Status:** Draft
**Owner(s):** Mike
**Last updated:** 2026-04-14
**Links:**
- Evidence: `./evidence/current-state-rename-and-links.md`
- Tracking: `projects/v0-launch/PROJECT.md` (`V0-5`), `stories/wiki-links-next/STORY.md` (Story 3 / M5a)

---

## 1) Problem statement
- Who is affected: human writers renaming pages in the sidebar, agents invoking file/page rename, and any reader relying on inbound links staying valid.
- What pain / job-to-be-done: rename a document without silently breaking inbound references anywhere else in the vault.
- Why now: rename is currently a trust-breaking correctness gap in a live wiki-link/backlink system, and the same rewrite/orchestration machinery is a planned dependency for slug migration (`V0-12`).
- Current workaround(s): rename on disk or via the existing sidebar path-rename flow, then manually repair broken inbound links later.

## 2) Goals
- G1: Managed rename is graph-safe: no stale inbound references remain after a successful rename.
- G2: The operation is crash-safe: no partial vault state is left behind after mid-operation failure.
- G3: Open docs and derived views stay live and consistent through the rename.
- G4: The implementation establishes reusable rewrite/orchestration machinery for future rename-adjacent migrations.

## 3) Non-goals
- NG1: External filesystem rename reconciliation (`mv foo.md bar.md`) in this slice.
- NG2: Heading rename propagation (`[[Page#Old]] -> [[Page#New]]`) in this slice.
- NG3: Fuzzy or semantic link repair.
- NG4: Rich conflict-resolution UI beyond collision rejection.

## 4) Personas / consumers
- P1: Human writer renaming a page from the sidebar.
- P2: Agent / MCP caller invoking managed rename as part of knowledge-base hygiene.
- P3: Open-editor collaborator viewing a doc whose outbound link target was renamed elsewhere.

## 5) User journeys
- P1 happy path: rename page `foo` to `bar` -> sidebar updates -> every inbound `[[foo]]` / internal markdown link now points to `bar` -> open docs update live.
- P1 failure path: rename collides or rename cannot complete atomically -> error returned -> no doc content changes persist.
- P2 happy path: MCP tool renames a page and receives a structured response describing rewritten docs.
- P3 aha moment: a doc already open in the editor updates live without manual refresh when one of its internal links is rewritten due to rename.

## 6) Requirements
### Functional requirements
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Managed rename renames the target document and rewrites all inbound wiki-links that target that document. | After successful rename, docs that previously contained `[[old]]`, `[[old|Alias]]`, or `[[old#anchor]]` contain the corresponding `new` target form and no stale `old` target remains from that rename. | Core `V0-5` requirement from launch plan + Story 3. |
| Must | Managed rename is exposed through server API and MCP. | HTTP rename endpoint and MCP rename tool both exist and drive the same backend orchestration. | Naming still open (`rename_page` vs `rename_document`). |
| Must | Rename collision fails loudly and leaves no partial state. | Renaming to an existing destination returns conflict; file graph and doc contents remain unchanged. | |
| Must | Open documents update live after rewrite. | An already-open doc that linked to the renamed target reflects the updated link through normal collab propagation. | |
| Must | The operation is crash-safe at vault scope. | Recovery on restart yields either fully-applied rename or pre-rename state, never a mixed subset of rewritten docs. | |
| Must | Managed rename also rewrites supported internal inline Markdown links that resolve to the renamed doc. | After successful rename, supported internal inline Markdown links preserve link text while updating the href/path target correctly. | Resolved: include the currently-supported internal inline Markdown-link surface, not all Markdown forms. |
| Could | Folder/path rename shares the same orchestration where semantics are well-defined. | Deferred unless spec shows this is the same problem rather than a separate feature. | |

### Non-functional requirements
- Performance: rewrite latency should scale with affected-doc count without blocking the server indefinitely; target should stay within acceptable interactive rename latency for typical vault sizes.
- Reliability: no partial on-disk graph state after failure or crash.
- Security/privacy: path handling must preserve current traversal/symlink protections.
- Operability (telemetry, alerts, debug): rename lifecycle must be observable enough to diagnose stuck/incomplete recovery.
- Cost: avoid introducing heavyweight infrastructure that overshoots the current architecture.

## 7) Success metrics & instrumentation
- Metric 1: successful managed renames leave zero stale inbound references for the renamed target.
  - Baseline: currently false for all inbound refs outside the renamed file.
  - Target: 100% for supported internal link syntaxes.
  - Instrumentation notes: rename result payload + post-rename verification hooks / tests.
- Metric 2: rename recovery never leaves partial state after forced interruption.
  - Baseline: no managed rename flow exists.
  - Target: crash-recovery tests always converge to all-or-none.
  - Instrumentation notes: recovery journal / startup replay logs if adopted.
- What we will log/trace:
  - rename start / success / rollback / recovery replay
  - affected-doc count
  - rewritten-link counts by syntax
  - collision / validation failures
- How we'll know adoption/value:
  - rename endpoint/tool usage
  - reduction in dead links caused by renames

## 8) Current state (how it works today)
- Sidebar rename already exists in `packages/app/src/components/FileTree.tsx` and calls `POST /api/rename-path`.
- `POST /api/rename-path` in `packages/server/src/api-extension.ts` renames files/folders, captures live contents, closes/unloads docs, renames on disk, and re-syncs renamed docs to disk, but does not rewrite inbound references in other docs.
- `BacklinkIndex.renameDocument()` only deletes old graph edges and re-indexes the renamed doc's outbound links; it does not mutate referring docs.
- The backlink index already indexes both wiki-links and internal inline Markdown links resolved via `resolveInternalHref()`.
- Internal Markdown link support is already shared across server indexing and app navigation/rendering for relative links, but current rename planning only names wiki-links explicitly.
- No MCP rename tool exists yet in the current tool registry.

## 9) Proposed solution (vertical slice)
### User experience / surfaces
- Dashboard/admin UI: existing sidebar file rename becomes managed page-rename semantics, not raw path rename.
- API endpoints: expose managed page-rename as the public file/page rename surface; generic raw path rename/move remains a lower-level path operation rather than a public file/page rename contract.
- SDK: none today.
- CLI (if any): MCP rename tool is the agent-facing surface.
- Docs/onboarding: explain managed rename guarantees and the difference from external filesystem renames.
- Error messages: collisions, unsupported rename targets, and recovery-in-progress need actionable messaging.
- Billing/limits (if relevant): none.

### System design
- Architecture overview:
  - rename orchestration layer identifies affected docs from backlink index
  - applies targeted internal-link rewrites through Hocuspocus-loaded docs
  - persists renamed target + rewritten docs through normal persistence
  - records a persisted pre-rename recovery journal so interrupted operations roll back to pre-rename state on startup rather than leaving mixed partial state
- Data model:
  - document graph already exists in `BacklinkIndex`
  - recovery journal stores pending managed-rename state until the operation commits successfully
- API/transport:
  - HTTP + MCP both call the same backend primitive
- Auth/permissions:
  - same trust boundary as existing write/file-op endpoints
- Enforcement point(s):
  - natural chokepoint appears to be server-side API orchestration, not the client
- Failure modes and handling:
  - destination collision
  - mid-rewrite crash
  - unsupported link syntax mismatch
  - stale open-doc sessions / provider updates
- Observability:
  - explicit rename lifecycle logging and recovery visibility likely needed

### Alternatives considered
- Option A: wiki-links only in `V0-5`, leave Markdown-link rewriting for follow-up.
- Option B: include all currently-supported internal link syntaxes in `V0-5`.
- Option C: keep raw path rename and surface dead links only.
- Why we chose the proposed solution:
  - Resolved for syntax scope: include the currently-supported internal inline Markdown-link surface so managed rename matches the existing internal-link model instead of preserving split-world correctness.

## 10) Decision log
| ID | Decision | Type (P/T/X) | 1-way door? | Status | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Managed rename is a first-class server-orchestrated operation, not just a filesystem rename. | X | Yes | Decided | Existing raw path rename does not preserve link graph correctness. | `./evidence/current-state-rename-and-links.md` | Backend orchestration primitive required. |
| D2 | `V0-5` rewrites wiki-links plus the currently-supported internal inline Markdown-link surface, not wiki-links alone and not all Markdown forms. | X | Yes | Decided | Internal inline Markdown links are already a real supported internal-link surface in indexing, navigation, and rendering. Excluding them would preserve split-world trust debt; including all Markdown forms would overshoot current support. | `./evidence/current-state-rename-and-links.md` | Rename implementation must patch both syntax families; reference-style Markdown links remain out of scope. |
| D3 | Public file/page rename uses a managed page-rename contract; raw path rename is not a public file/page operation. | X | Yes | Decided | User intent is that file/page rename should always be graph-safe. Keeping a public raw file rename would preserve a misleading split-world contract. Generic path rename/move can remain as a lower-level/internal primitive and for folder/path-organization flows. | `./evidence/current-state-rename-and-links.md` | Sidebar file rename and MCP file/page rename should both target the managed operation; folder/path-tree ops stay a separate concern. |
| D4 | `V0-5` is page-scoped. Graph-safe folder/path-tree rename or move semantics are not part of this spec. | X | No | Decided | The user does not want all move/rename operations to become graph-safe under this slice. Folder/path-tree ops have different semantics and should remain a separate concern unless a future spec promotes them. | `./evidence/current-state-rename-and-links.md` | Acceptance criteria, API contract, and test matrix should stay doc/page-focused. |
| D5 | Public naming uses MCP `rename_document` and HTTP `POST /api/rename`. | X | Yes | Decided | `PROJECT.md` already names `rename_document`, and the existing MCP tool family consistently uses `document` vocabulary (`read_document`, `write_document`, `edit_document`, `list_documents`). This keeps the tool surface internally consistent while UI copy can still say "Rename page." | `projects/v0-launch/PROJECT.md`, `./evidence/current-state-rename-and-links.md` | MCP contract uses `document` vocabulary; HTTP route stays short and neutral. |
| D6 | Vault-level atomicity uses per-document transactions plus a persisted recovery journal; interrupted managed renames roll back to pre-rename state on startup. | T | Yes | Decided | The current runtime offers strong per-document atomicity and recovery primitives, but no built-in multi-document transaction. A recovery journal fits the architecture more naturally than trying to force an all-docs-in-one transaction. | `./evidence/current-state-rename-and-links.md` | Implementation needs journal write/remove, startup replay, and rollback semantics. |

## 11) Open questions
| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | What is the atomicity strategy for multi-document rename: per-doc transactions + journal, or another recovery model? | T | P0 | Yes | Resolved by D6: per-doc transactions + persisted recovery journal with startup rollback. | Resolved |
| Q2 | Should `V0-5` rewrite only wiki-links, or also supported internal inline Markdown links? | X | P0 | Yes | Resolved by D2. | Resolved |
| Q3 | If Markdown links are included, which forms are in scope: only internal inline relative links, or also reference-style / other forms? | T | P0 | Yes | Resolved by D2: current supported internal inline forms only. | Resolved |
| Q4 | Should managed rename be a distinct page-rename API/tool (`rename_page`) or replace the semantics of `/api/rename-path` for file docs? | X | P1 | No | Resolved by D3: public file/page rename is managed-only; raw path rename is not the public file/page contract. | Resolved |
| Q5 | Is folder rename part of this spec, or should `V0-5` stay page-scoped? | X | P1 | No | Resolved by D4: `V0-5` stays page-scoped. | Resolved |
| Q6 | What should the public managed-rename names be across HTTP and MCP: `rename_page`, `rename_document`, or another consistent pair? | X | P1 | No | Resolved by D5: MCP `rename_document`, HTTP `POST /api/rename`. | Resolved |

## 12) Assumptions
| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | The existing backlink index is the right source of truth for affected-doc discovery. | HIGH | Confirm no competing index/path is needed during design. | Before scope freeze | Active |
| A2 | Internal inline Markdown links are a real user-facing supported surface, not an incidental implementation detail. | HIGH | Already evidenced in source editor plugin + internal link view + backlink extraction. | Before scope freeze | Confirmed |

## 13) In Scope (implement now)
- Goal: deliver managed page rename with atomic inbound rewrite semantics for the chosen supported internal link syntaxes.
- Non-goals: external rename reconciliation, heading rename propagation, fuzzy repair.
- Requirements with acceptance criteria: see §6.
- Proposed solution: see §9.
- Owner(s)/DRI: Mike
- Next actions (tickets/tasks):
  - implement recovery journal + startup replay
  - wire managed rename API + MCP contract
  - define test matrix
- Risks + mitigations:
  - under-specifying syntax scope creates split behavior
  - overloading raw path rename semantics may confuse future folder operations
  - crash recovery complexity may exceed a narrow slice unless constrained carefully
- What gets instrumented/measured:
  - rename lifecycle
  - affected docs / rewritten links
  - recovery outcomes

## 14) Risks & mitigations
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Markdown-link scope silently widens beyond current supported forms | Medium | High | Explicitly define in-scope link syntaxes and non-goals. | Spec |
| Vault-level atomicity design is underspecified | High | High | Resolve Q1 before scope freeze; require crash-recovery acceptance tests. | Spec |
| Existing `/api/rename-path` semantics conflict with managed rename semantics | Medium | Medium | Keep managed file/page rename as its own public contract; do not expose raw file rename semantics publicly. | Spec |

## 15) Future Work
### Explored
- **External filesystem rename reconciliation**
  - What we learned: current story explicitly scopes it out as the hard half.
  - Recommended approach: separate spec after managed rename lands.
  - Why not in scope now: different detection/confidence model than managed rename.
  - Triggers to revisit: dogfood evidence of frequent external renames.
  - Implementation sketch: watcher-level rename inference + conflict handling.

### Identified
- **Heading rename propagation**
  - What we know: same rewrite machinery, different trigger and target granularity.
  - Why it matters: completes anchor-level correctness story.
  - What investigation is needed: anchor identity + heading rename UX.

### Noted
- **Folder rename graph safety** — may share machinery, but likely needs its own scoped decision once page rename semantics are nailed down.
- **Generic path-tree move/rename contract** — keep distinct from managed page rename unless/until a future spec defines graph-safe folder/path semantics.
