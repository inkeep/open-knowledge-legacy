# V0-11 Graph Surface Completion — Spec

**Status:** Draft
**Owner(s):** Mike (product / graph domain)
**Last updated:** 2026-04-14
**Links:**
- Umbrella spec: `../2026-04-10-wiki-links-backlinks/SPEC.md`
- Project plan: `../../projects/v0-launch/PROJECT.md` (`V0-11`)
- Evidence: `./evidence/app-graph-surfaces.md`
- Evidence: `./evidence/server-graph-semantics.md`

---

## 1) Problem statement
- **Who is affected:** Writers using the editor's graph/navigation surfaces; secondarily MCP/API consumers that rely on orphan/hub semantics matching the product surface.
- **What pain / job-to-be-done:** The app already exposes doc-scoped orientation in the docked right rail (`Outline`, `Backlinks`, `Outgoing Links`, `Graph`) and project-level structure in the fullscreen graph, but it still lacks focused project-level surfaces for "what is disconnected?" and "what is central?". Current orphan semantics are also too loose for project hygiene because pages with outbound-only links are still treated as orphans.
- **Why now:** `V0-11` is already partially shipped. Forward links landed, the graph fullscreen shell already exists, and the server already exposes `/api/orphans` and `/api/hubs`. The remaining work is mostly information architecture plus one semantic tightening on the server.
- **Current workaround(s):** Users visually scan the force graph, call MCP/API graph tools, or manually inspect pages to identify true orphans and high-degree hubs.

## 2) Goals
- **G1:** Keep the docked right rail focused on doc-scoped context by preserving `Outgoing Links` as a docked per-document panel.
- **G2:** Add project-level `Orphans` and `Hubs` to the existing fullscreen / full-graph experience, rather than inventing a parallel product surface.
- **G3:** Tighten orphan semantics so the product's "orphan" concept means "disconnected from the project graph", not merely "has no inbound links".
- **G4:** Preserve consistency across UI, HTTP, and MCP graph surfaces so the same terms mean the same thing everywhere.
- **G5:** Let users switch the orphan lens in fullscreen between `No Incoming`, `No Outgoing`, and `Both`, while keeping `Both` as the default.

## 3) Non-goals
- **NG1:** Moving `Outgoing Links` into the fullscreen graph experience or otherwise replacing the existing docked doc-level panel.
- **NG2:** Creating a new route/page for full graph exploration in v0.
- **NG3:** Reworking the force-directed graph visualization itself beyond what is needed to host project-level Orphans/Hubs.
- **NG4:** Adding new graph analytics such as clusters, dead-link repair, or suggested links.
- **NG5:** Redesigning hub ranking beyond the existing inbound-count-first model unless product scope explicitly expands.
- **NG6:** Adding arbitrary graph filters beyond the three orphan modes above.

## 4) Personas / consumers
- **P1: Active writer in a document** — wants local context in the docked rail and should not have project-level lists crowd out per-doc tools.
- **P2: Project curator / knowledge gardener** — zooms out to understand the whole wiki, find disconnected pages, and identify central pages to inspect.
- **P3: Graph/runtime consumer** — the app, HTTP API, and MCP tools should agree on what `orphan` and `hub` mean so automation and UI do not drift.

## 5) User journeys

### P1: Writer checks doc-local outgoing links
1. Writer is editing a page.
2. They open the docked right rail and choose `Outgoing Links`.
3. They see only links from the current page.
4. They click a target or create a missing page from that panel.
5. Project-level curation surfaces do not interrupt this local workflow.

### P2: Curator zooms out to project-level graph hygiene
1. Curator opens the `Graph` panel from the docked rail.
2. They enter fullscreen / full-graph mode.
3. Within that fullscreen experience, they switch between `Explore`, `Orphans`, and `Hubs` views.
4. In `Orphans`, they can change the orphan lens between `No Incoming`, `No Outgoing`, and `Both`; `Both` is the default.
5. They inspect the list of disconnected or high-degree pages, then click into a page to navigate there.
6. The same fullscreen surface remains the home for project-level graph exploration.

### P2: Failure / recovery path
1. Curator opens fullscreen graph but the project has no true orphans, or no hubs beyond trivial counts.
2. The fullscreen surface shows an explicit empty state that explains the semantics.
3. Curator can return to `Explore` without leaving fullscreen or losing the broader graph context.

### Aha moment
- The right rail is for "this page"; fullscreen graph is for "this project". Users do not have to guess where to look for each kind of graph information.

## 6) Requirements
### Functional requirements
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | `Outgoing Links` remains a docked doc-level panel | `DocPanel` continues to expose a doc-scoped `Outgoing Links` tab and that tab does not absorb project-level Orphans/Hubs content | Matches existing shipped behavior and user direction |
| Must | Fullscreen graph exposes project-level Orphans and Hubs | From the existing fullscreen / full-graph experience, a user can reach an `Orphans` view and a `Hubs` view without navigating to a different route | Implemented as fullscreen modes inside `GraphPanel` |
| Must | Default orphan semantics tighten from inbound-only to disconnected | In `Both` mode, a page only appears in `Orphans` if it has no inbound and no outbound graph edges in the current unified internal graph model | Replaces current inbound-only default |
| Must | `Orphans` exposes a mode toggle | The fullscreen `Orphans` view shows a UI control with exactly three options: `No Incoming`, `No Outgoing`, and `Both` | `Both` is the default selection |
| Must | Orphan mode is reusable in backend contracts | The orphan mode is available at the HTTP layer, with `both` as the default; frontend should not be the only place that knows the three-mode definition | Keeps UI/API/MCP semantics aligned |
| Must | Hubs remain ordered by inbound count | The project-level `Hubs` view sorts highest inbound-link count first, with deterministic tie-breaking | Current server behavior already does this |
| Must | Project-level entries are navigable | Clicking an orphan or hub entry navigates to that document using the app's existing hash-based document navigation | Reuse current panel navigation pattern |
| Must | Fullscreen graph surfaces refresh from existing derived-view invalidation | When graph structure changes, fullscreen graph, Orphans, and Hubs refresh using the repo's existing push/re-fetch model rather than introducing polling-only behavior | Reuse `files` / `backlinks` / `graph` invalidation pattern |
| Must | UI semantics stay coherent across surfaces | Labels and empty-state copy make clear which views are doc-level vs project-level, and "orphan" means the same thing in UI/API/MCP | Cross-surface naming/semantic contract |
| Should | Fullscreen project-level views stay inside the existing graph container | The implementation extends today's fullscreen `GraphPanel` mode instead of introducing a separate page-level IA | Confirmed shape |
| Should | Orphans/Hubs show useful metadata | Orphans display title/docName; Hubs display title/docName plus inbound count | Mirrors current endpoint payloads |
| Should | Empty states explain the graph concept | `Orphans` explains what qualifies; `Hubs` explains ordering or lack of results | Reduces semantic confusion after tightening |
| Could | Fullscreen can visually connect list selections back to the graph | A selected orphan/hub could optionally highlight or center the corresponding node in `Explore` | Explicitly optional for v0 |
| Should | Fullscreen `Hubs` uses a larger fixed limit than the transport default | The fullscreen `Hubs` view fetches the top 50 hubs with no user-adjustable limit in v0; the API/MCP default remains 20 | Keeps fullscreen project exploration broad without adding UI ceremony |

### Non-functional requirements
- **Performance:** No new resident graph/body cache for v0; reuse existing endpoints and current push/re-fetch behavior.
- **Reliability:** If `/api/orphans` or `/api/hubs` fails, the failure stays localized to that fullscreen view and does not break doc editing.
- **Security/privacy:** Only admitted content docs from the current project may appear in project-level lists; no expansion beyond existing file-index/backlink-index boundaries.
- **Operability:** Semantic changes to orphan calculation should be covered by tests at the `BacklinkIndex` and HTTP API layers.
- **Cost:** No new third-party dependencies or new server-side indexing subsystem.

## 7) Success metrics & instrumentation
- **Metric 1:** Product surfaces make the doc-level vs project-level split legible.
  - **Baseline:** Docked `Outgoing Links` exists, but project-level Orphans/Hubs are absent from the app.
  - **Target:** A first-time user can discover `Outgoing Links` in the docked rail and `Orphans`/`Hubs` in fullscreen without needing docs or MCP.
  - **Instrumentation notes:** No new analytics required for v0; success is primarily product coherence plus QA verification.
- **Metric 2:** Orphan results better match intuitive "disconnected page" semantics.
  - **Baseline:** Pages with outbound-only links are returned as orphans.
  - **Target:** Outbound-only pages no longer appear in `Orphans` once semantics tighten.
  - **Instrumentation notes:** Verify via unit/API tests rather than product telemetry.
- **What we will log/trace:** Existing endpoint errors remain sufficient for v0; no new telemetry is required unless implementation complexity grows.
- **How we'll know adoption/value:** The fullscreen graph becomes the single project-level orientation surface, while the docked rail stays useful for active document work.

## 8) Current state (how it works today)
- `DocPanel` currently exposes four docked tabs: `Outline`, `Backlinks`, `Outgoing Links`, and `Graph`.
- `Outgoing Links` is already implemented as a doc-scoped panel backed by `GET /api/forward-links?docName=...`.
- The app has no current UI consumer for `/api/orphans` or `/api/hubs`.
- "Fullscreen graph" is not a separate route. It is the existing `GraphPanel` rendered with the browser Fullscreen API.
- In docked mode, `GraphView` shows a 2-hop neighborhood around the active doc. In fullscreen mode, the same `GraphView` renders the full graph (`Number.POSITIVE_INFINITY` hop limit).
- `GraphView` re-fetches `/api/link-graph` when derived-view channels include `files` or `graph`.
- `SystemDocSubscriber` invalidates `backlinks` and `forward-links` queries on `files` or `backlinks`, so the docked graph/link panels already participate in the repo's push-driven refresh pattern.
- `/api/orphans` currently calls `BacklinkIndex.getOrphans([...getFileIndex().keys()])`, and `getOrphans()` only checks for zero inbound edges.
- The public MCP tool `get_orphans` is currently described as "Find pages with no incoming wiki-links", so orphan semantics are already part of the external vocabulary.
- There is no current orphan-mode toggle in the app or the backend contract.
- `/api/hubs` already returns `{ docName, title, count }`, ordered by inbound count descending and then docName ascending, with a default limit of 20.
- `BacklinkIndex` currently builds one unified internal graph from extracted wiki links plus internal markdown links. That shaped the chosen orphan definition.

## 9) Proposed solution (vertical slice)
### User experience / surfaces
- **Docked right rail:** Preserve `Outgoing Links` exactly as the doc-scoped local panel.
- **Fullscreen graph:** Treat today's fullscreen `GraphPanel` as the project-level graph home. Add explicit project-level views there:
  - `Explore` — existing force-directed full graph
  - `Orphans` — project-level disconnected pages
  - `Hubs` — project-level high-inbound pages
- **Orphans UX:** In the fullscreen `Orphans` mode, expose a compact UI toggle with three choices:
  - `No Incoming`
  - `No Outgoing`
  - `Both` (default)
- **Navigation:** Reuse the app's existing hash-based document navigation from project-level entries.
- **Empty/error UX:** Fullscreen list states should explain the concept ("No disconnected pages", "Top linked pages") rather than generic fetch failures alone.

### System design
- **Recommended UI shape:** Extend the existing `GraphPanel` fullscreen mode instead of creating a new route or a second fullscreen shell. This reuses the current fullscreen/full-graph mental model and avoids a split-world product surface.
- **Recommended data flow:** Reuse current endpoints rather than enriching `/api/link-graph` immediately:
  - `Explore` -> `/api/link-graph`
  - `Orphans` -> `/api/orphans?mode=<incoming|outgoing|both>`
  - `Hubs` -> `/api/hubs?limit=50`
- **Recommended invalidation:** Reuse the existing derived-view invalidation channels and query reload patterns already used by graph/backlink surfaces.
- **Required server change:** Extend orphan calculation so the backend can compute three modes over the current unified internal graph:
  - `incoming` -> no inbound edges
  - `outgoing` -> no outbound edges
  - `both` -> no inbound and no outbound edges
- **Contract recommendation:** Support orphan mode in both HTTP and MCP surfaces, defaulting to `both`, so the fullscreen UI and automation share one definition source.
- **Semantic contract note:** Although the original wording said "wiki links", the chosen v0 semantics follow the current unified internal graph model. Product/API/MCP copy should describe disconnected graph pages consistently with that decision.
- **Panel-docking precedent:** This design preserves the current product split: docked rail = active-doc tooling, fullscreen graph = project-level exploration.
- **Hub breadth choice:** Treat the existing default of 20 as a transport/MCP default, not the fullscreen UX limit. The fullscreen app surface should request a broader fixed slice (50) with no additional control in v0.

### Alternatives considered
- **Option A: Extend existing fullscreen `GraphPanel` with project-level modes (recommended)**
  - Pros: matches today's product surface, lowest IA churn, reuses fullscreen implementation and graph mental model.
  - Cons: fullscreen view needs extra state/layout, and list presentation still needs product decisions.
- **Option B: Add Orphans/Hubs as new docked right-rail tabs**
  - Pros: mechanically similar to existing panels.
  - Cons: overloads the per-doc dock with project-level content and conflicts with the already-decided V0-11 information architecture.
- **Option C: Build a separate route/page for project graph exploration**
  - Pros: maximum room for future graph tooling.
  - Cons: introduces a new navigation concept in v0, duplicates the existing fullscreen surface, and solves a larger problem than this story needs.

## 10) Decision log
| ID | Decision | Type (P/T/X) | 1-way door? | Status | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | `Outgoing Links` stays as the docked doc-level panel; project-level `Orphans` and `Hubs` live in fullscreen / full-graph | X | No | Confirmed | Matches the existing shipped product split and the explicit user request; also aligns with the project plan's V0-11 layout decision | `../../projects/v0-launch/PROJECT.md` (`V0-11`), `./evidence/app-graph-surfaces.md` | Preserves local-vs-project IA and prevents right-rail overload |
| D2 | Reuse the existing fullscreen `GraphPanel` instead of creating a new route/page | X | No | Confirmed | Code already models fullscreen as a mode of `GraphPanel`; extending it is the simplest path that does not foreclose a richer project-level graph later | `./evidence/app-graph-surfaces.md` | Keeps scope tight and avoids split-world navigation |
| D3 | Orphan semantics are mode-based, with `both` as the default | X | Yes | Confirmed | The default product meaning of orphan should be "disconnected", but the fullscreen surface should let users inspect inbound-only and outbound-only graph gaps too | `./evidence/server-graph-semantics.md` | Server/API/UI/MCP need a shared mode vocabulary and default |
| D4 | Orphan modes use the current unified internal graph, not wiki-syntax-only edges | X | Yes | Confirmed | This keeps v0 aligned with the existing stored graph model and makes the semantic tightening a coherent server-wide change rather than a syntax-specific exception path | `./evidence/server-graph-semantics.md` | `/api/orphans`, `get_orphans`, UI copy, and tests should talk about graph connectivity rather than only incoming wiki-links |
| D5 | Fullscreen `Orphans` exposes a visible three-way mode toggle, backed by reusable API semantics | X | No | Confirmed | The toggle is a product requirement for the fullscreen screen, and implementing mode support at the contract layer keeps the UI from inventing a private semantic model | `./evidence/app-graph-surfaces.md`, `./evidence/server-graph-semantics.md` | App needs a control; backend/MCP need an optional mode parameter |
| D6 | Fullscreen project-level presentation shape is a mode switch inside `GraphPanel` (`Explore` / `Orphans` / `Hubs`) | P | No | Confirmed | Best fit to the current fullscreen graph mental model; easiest way to keep project-level surfaces together | `./evidence/app-graph-surfaces.md` | Determines UI layout, copy, and interaction detail |
| D7 | Fullscreen `Hubs` uses a broader fixed limit (50) while API/MCP default remains 20 | P | No | Confirmed | The current 20 is inherited from the original API/tool contract, not from the V0-11 product story. Fullscreen is the project-level exploration surface, so it should not feel clipped by the old transport default | `./evidence/server-graph-semantics.md` | App requests `/api/hubs?limit=50`; no user-facing limit control in v0 |

## 11) Open questions
| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Does "no inbound and no outbound wiki links" mean wiki-syntax-only edges, or all internal graph edges regardless of syntax? | X | P0 | Yes | Resolved via D4: use the current unified internal graph model | Resolved |
| Q2 | In fullscreen, should `Orphans` and `Hubs` be separate modes, a persistent side list next to the graph, or both? | P | P0 | Yes | Resolved via D6: use separate fullscreen modes inside `GraphPanel` | Resolved |
| Q3 | Should the fullscreen `Hubs` view use the existing default top-20 contract, a larger fixed limit, or an explicitly adjustable limit? | P | P1 | No | Resolved via D7: use a larger fixed limit (50) with no control in v0 | Resolved |
| Q4 | Should selecting an orphan/hub entry only navigate, or also visually center/highlight that node in the graph experience? | P | P2 | No | Deferred to Future Work; not required for the core fullscreen IA | Deferred to Future Work |

## 12) Assumptions
| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Extending the existing fullscreen `GraphPanel` is sufficient for v0 and does not require route-level IA changes | HIGH | Confirm against final UI-shape decision before scope freeze | Before scope freeze | Active |
| A2 | Existing derived-view invalidation (`files` / `backlinks` / `graph`) is enough for new fullscreen Orphans/Hubs views | HIGH | Confirm implementation can subscribe/reuse current client refresh plumbing | Before implementation start | Active |
| A3 | Users want Orphans/Hubs as project-level hygiene/orientation tools, not as additional docked right-rail tabs | HIGH | Already supported by user request and project-plan direction; revisit only if product intent changes | Before scope freeze | Active |

## 13) In Scope (implement now)
- **Goal:** Finish the remaining V0-11 product surface by keeping doc-local forward links docked and adding project-level Orphans/Hubs to fullscreen graph exploration.
- **Non-goals:** New route/page IA, new graph analytics beyond the three orphan modes, graph rendering overhaul, docked project-level tabs.
- **Requirements with acceptance criteria:** See §6.
- **Proposed solution:** See §9.
- **Owner(s)/DRI:** Mike.
- **Next actions (spec phase):**
  - Update product/API/MCP wording so orphan semantics describe disconnected graph pages rather than only incoming wiki-links.
  - Scope-freeze the implementation guidance around fullscreen mode switching, the orphan mode parameter/toggle, and the fixed `Hubs` breadth of 50.
- **Risks + mitigations:** See §14.
- **What gets instrumented/measured:** Primarily automated verification of server semantics and fullscreen UX behavior.

## 14) Risks & mitigations
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| "Orphan" semantics drift across UI, API, and MCP | Medium | High | Make the mode vocabulary explicit (`incoming`, `outgoing`, `both`) and update tests/docs everywhere together | Spec/implementation owner |
| Orphan mode support expands the backend/MCP contract surface beyond a one-line filter change | Medium | Medium | Treat mode support as an explicit API/tool contract update, not just a UI filter | Spec owner |
| Fullscreen project-level UI becomes cluttered if graph + lists are combined poorly | Medium | Medium | Resolve Q2 explicitly and prefer the simplest mode structure that preserves current mental models | Product owner |
| Legacy "top 20" expectations leak from API/MCP into the fullscreen product surface | Medium | Low | Keep API/MCP default at 20, but make the fullscreen app explicitly request 50 and document that split | Product owner |
| Orphan-mode toggle gets implemented only in the UI, creating a hidden split-world | Medium | Medium | Put the mode in the backend contract as well, then let the UI consume it | Implementation owner |

## 15) Future Work
### Explored
- **Graph-linked list interaction polish**
  - What we learned: A future version could highlight or center the selected orphan/hub node in the graph, not just navigate to the page.
  - Recommended approach: Keep fullscreen modes in one container and add cross-highlighting only after the base IA lands.
  - Why not in scope now: The core value is exposing project-level views; graph/list coupling is optional polish.
  - Triggers to revisit: Users need to compare list entries against graph topology without leaving fullscreen.
  - Implementation sketch: Add shared fullscreen state for selected doc and let `Explore` center/highlight that node.

### Identified
- **Dedicated project-level graph route/page**
  - What we know: The current app has no route-level graph exploration surface; fullscreen is a mode of `GraphPanel`.
  - Why it matters: A richer graph workbench may eventually need more space and discoverability than the current fullscreen panel affords.
  - What investigation is needed: Route/navigation design, permalink semantics, and convergence with the docked graph tab.

### Noted
- **Adjustable hub limit / pagination** — v0 uses a fixed broader fullscreen slice (`50`), but interactive controls or pagination may matter once projects outgrow that simple breadth or the API default needs rethinking.
- **Additional graph curation views** — clusters, dead links, or suggested links remain separate future surfaces.
