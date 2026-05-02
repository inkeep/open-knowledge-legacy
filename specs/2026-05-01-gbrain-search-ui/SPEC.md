---
title: GBrain Search UI
description: Spec for exposing gbrain search inside Open Knowledge when the current project folder is registered as a gbrain source.
tags:
  - spec
  - gbrain
  - search
  - browser
---

# GBrain Search UI — Spec

**Status:** Ready for implementation
**Owner(s):** Open Knowledge
**Last updated:** 2026-05-01
**Links:**
- Evidence: [Open Knowledge current surfaces](./evidence/open-knowledge-current-surfaces.md)
- Evidence: [gbrain integration surfaces](./evidence/gbrain-integration-surfaces.md)

---

## 1) Problem Statement

Open Knowledge can open a local project folder, but it does not currently know whether that folder is also registered in the user's gbrain. The user wants the app to detect that relationship and, when present, expose a search UI that queries gbrain's imported/indexed knowledge for the current project. The current workaround is leaving Open Knowledge, running `gbrain sources list --json`, and then using `gbrain call query` manually in a terminal. [gbrain integration surfaces](./evidence/gbrain-integration-surfaces.md)

## 2) Goals

- Detect when the current Open Knowledge project folder matches a registered gbrain source path.
- Expose a low-friction sidebar gbrain search entry point only when detection succeeds.
- Return useful search results without requiring the user to understand gbrain's CLI.
- Keep the integration local-first and safe: no remote service, no broad filesystem access, and no mutation of gbrain data.

## 3) Non-goals

- Do not make Open Knowledge depend on gbrain being installed for normal editing.
- Do not implement gbrain import, sync, embed, or source registration flows in v1.
- Do not replace Open Knowledge's own literal Markdown search.
- Do not require users to run `gbrain serve --http` in v1.

## 4) Personas / Consumers

- **Local browser user with gbrain installed:** Runs the Open Knowledge local web app and wants to search the richer gbrain index for the current folder.
- **Desktop user with gbrain installed:** Opens a folder in Open Knowledge Desktop and wants the same gbrain search behavior as the browser app.
- **Developer / power user:** Wants predictable local behavior, clear errors, and JSON-compatible surfaces for future automation.

## 5) User Journeys

### Happy Path

1. User opens a local project folder in Open Knowledge, either through the desktop app or local browser app.
2. The Open Knowledge server checks whether `gbrain` is available.
3. The server reads registered gbrain sources and compares the current project real path to each source `local_path`.
4. If matched, the sidebar shows a gbrain search entry.
5. User enters a query.
6. The app calls the local Open Knowledge server, which proxies to gbrain hybrid search.
7. The server normalizes and filters returned rows to the matched gbrain source when `source_id` is present.
8. The app renders result rows with title/slug/snippet/source.

### Failure / Recovery Path

1. User opens a folder that has been imported into gbrain but is not registered as a source path.
2. App does not show the gbrain search action by default.
3. A compact disabled diagnostics row can explain: "gbrain is installed, but this folder is not registered as a gbrain source."
4. Future work may offer "register this folder" or "search all gbrain" flows.

### Aha Moment

The user sees a gbrain search affordance in the sidebar only when the current folder is registered in gbrain, runs a natural-language query, and gets indexed gbrain results without switching tools.

## 6) Requirements

### Functional Requirements

| Priority | Requirement | Acceptance Criteria | Notes |
|---|---|---|---|
| Must | Detect gbrain availability | Local server can distinguish "not installed", "installed but not configured", "configured but current folder not registered", and "current folder matched" | Use short timeouts so app startup is not blocked. |
| Must | Match current folder to gbrain source | Realpath-normalized project path matches a `sources[].local_path` from `gbrain sources list --json` | Include legacy `sync.repo_path` fallback. |
| Must | Expose search only when matched | Sidebar gbrain search affordance is hidden or disabled unless the current folder is matched | Applies to browser and desktop. |
| Must | Execute gbrain hybrid search | Query returns structured results via `gbrain call query` or equivalent, normalized and filtered to the matched source when possible | Default rendered `limit` should be modest, likely 10; server may request more rows internally to compensate for source filtering. |
| Must | Show clear failure states | Search failures surface concise, non-scary messages | Include timeout, missing embeddings, invalid JSON, and gbrain unavailable. |
| Must | Support local browser mode | Browser UI calls Open Knowledge server endpoints; browser never spawns local processes directly | Server owns CLI execution. |
| Must | Render result rows only | Results show slug/title/snippet/score/source but do not open local files in v1 | Matches current product decision. |
| Should | Cache status briefly | Avoid spawning gbrain repeatedly during a single session | Cache by project path with explicit refresh on project switch. |
| Must | Add sidebar search UI | Show a compact gbrain search entry/result panel in the file sidebar | This is the v1 UI surface. |

### Non-functional Requirements

- **Performance:** Initial detection should complete within roughly 2 seconds or fail soft; searches should time out rather than hang the renderer.
- **Reliability:** CLI errors must not crash the app or pollute the editor state.
- **Security/privacy:** Only spawn the local `gbrain` binary with fixed command arguments; never pass user input through a shell.
- **Operability:** Log coarse diagnostic states locally, not query text by default.
- **Cost:** No new hosted service and no required gbrain HTTP daemon for v1.

## 7) Success Metrics & Instrumentation

- **Detection success rate**
  - Baseline: no current measurement.
  - Target: track how often current projects enter `matched`, `not-installed`, `not-configured`, and `not-registered` states.
- **Search activation**
  - Baseline: no current measurement.
  - Target: count command-palette action opens and successful result renders.
- **Failure clarity**
  - Baseline: no current measurement.
  - Target: every failed status/search attempt maps to a user-facing reason and a developer-facing diagnostic code.

## 8) Current State

- The desktop renderer can synchronously access the current project path through `window.okDesktop.config.projectPath`, while browser mode can fetch `/api/workspace`. [Open Knowledge current surfaces](./evidence/open-knowledge-current-surfaces.md)
- The app has a desktop-only command palette, but browser support should not depend on porting that palette. [Open Knowledge current surfaces](./evidence/open-knowledge-current-surfaces.md)
- The file sidebar owns the persistent left-rail file/navigation surface and is the v1 home for gbrain search. [Open Knowledge current surfaces](./evidence/open-knowledge-current-surfaces.md)
- The server has loopback-only JSON API route patterns, including `/api/workspace`, but no gbrain route today. [Open Knowledge current surfaces](./evidence/open-knowledge-current-surfaces.md)
- The desktop bridge has no gbrain-specific methods today. [Open Knowledge current surfaces](./evidence/open-knowledge-current-surfaces.md)
- gbrain exposes source paths through `gbrain sources list --json` and a legacy fallback through `gbrain config get sync.repo_path`. [gbrain integration surfaces](./evidence/gbrain-integration-surfaces.md)
- gbrain hybrid search can be invoked through `gbrain call query '{"query":"...", "limit":10}'`. [gbrain integration surfaces](./evidence/gbrain-integration-surfaces.md)

## 9) Proposed Solution

### User Experience / Surfaces

V1 should add one primary UI surface in `FileSidebar`: a compact **gbrain search** module. The active search input appears only when the current project folder is matched to a registered gbrain source. When gbrain is installed/configured but the folder is not registered, the sidebar may render a compact disabled diagnostics row; `not-installed` should stay quiet by default so normal editing is not noisy. The matched module should include a small search input, a submit affordance, loading/error states, and a result list. It should not require porting the desktop command palette to browser mode. [Open Knowledge current surfaces](./evidence/open-knowledge-current-surfaces.md)

### System Design

```mermaid
flowchart LR
  User[User opens project] --> UI[Open Knowledge UI]
  UI --> API[Local OK server /api/gbrain/*]
  API --> Detector[gbrain detector]
  Detector --> CLI[gbrain CLI]
  CLI --> Sources[gbrain sources list --json]
  Detector --> Match{Current path matches source?}
  Match -- yes --> Sidebar[Show sidebar gbrain search]
  Sidebar --> SearchAPI[/api/gbrain/search]
  SearchAPI --> Query[gbrain call query]
  Query --> Results[Render result list]
  Match -- no --> Hidden[No gbrain UI]
```

### Runtime Boundary

Recommended v1 boundary: the Open Knowledge local server owns all gbrain CLI execution, and both browser and desktop renderers call the same `/api/gbrain/*` endpoints. This keeps local process spawning out of the browser renderer while making browser mode first-class. Desktop may later wrap the same endpoints in typed bridge helpers, but the server route is the product contract for v1. [Open Knowledge current surfaces](./evidence/open-knowledge-current-surfaces.md)

### Data Model

No persistent schema is required for v1. Runtime state can be modeled as:

```ts
type GBrainStatus =
  | { state: 'checking' }
  | { state: 'not-installed' }
  | { state: 'not-configured' }
  | { state: 'not-registered'; projectPath: string }
  | { state: 'matched'; sourceId: string; sourceName: string; localPath: string }
  | { state: 'error'; code: string; message: string };
```

Search result shape should normalize gbrain's CLI JSON into renderer-friendly rows:

```ts
interface GBrainSearchResult {
  sourceId?: string;
  slug: string;
  title?: string;
  score?: number;
  snippet: string;
  stale?: boolean;
}
```

### API / Transport

Preferred v1 server endpoints:

```ts
GET /api/gbrain/status

POST /api/gbrain/search
{
  "query": "family calendar",
  "limit": 10
}
```

Both endpoints must follow the existing loopback and host-header gate pattern used by `/api/workspace`. [Open Knowledge current surfaces](./evidence/open-knowledge-current-surfaces.md)

### Detection Algorithm

1. Resolve the current Open Knowledge project path with realpath.
2. Probe `gbrain --version` with a short timeout.
3. Run `gbrain sources list --json`.
4. Compare realpath-normalized `sources[].local_path` to the project path.
5. If no match, run `gbrain config get sync.repo_path` as a legacy fallback; when this matches, treat the matched source as `default` for result filtering because legacy brains store the default repo path outside the `sources[].local_path` field.
6. Cache the result for the active project window.

### Search Algorithm

1. Require `GBrainStatus.state === 'matched'`.
2. Run `gbrain call query` with JSON params.
3. Use `limit: 10` by default.
4. Request more than the rendered limit internally, up to a bounded cap, so filtering by source can still return enough rows.
5. Parse and validate JSON before returning to renderer.
6. Filter rows to the matched `sourceId` when `source_id` is present; fail soft with a diagnostic if gbrain omits source identifiers for a matched-source query.
7. Render slug, score, source, and snippet.
8. Do not open local files in v1; result rows are informational.

### Failure Modes

| Failure | User-facing behavior | Developer diagnostic |
|---|---|---|
| gbrain not on PATH | Hide action; optional diagnostics says gbrain is not installed | `not-installed` |
| gbrain installed but uninitialized | Hide action; diagnostics says gbrain is not configured | `not-configured` |
| source path not registered | Hide action; diagnostics says this folder is not registered | `not-registered` |
| CLI timeout | Show retryable error | `timeout` |
| invalid JSON | Show "gbrain returned an unexpected response" | `invalid-json` |
| search error | Keep modal open with error text | `search-failed` |

### Alternatives Considered

- **Server-proxied CLI integration:** Recommended for v1. It works in browser and desktop modes, uses the user's installed gbrain, and avoids bundling gbrain into Open Knowledge.
- **CLI integration from desktop main process:** Rejected for v1 because it would leave local browser mode behind.
- **Direct library integration:** More control and potentially faster repeated queries, but couples Open Knowledge to gbrain runtime/versioning and may pull in PGLite/Postgres dependencies.
- **gbrain HTTP transport:** Cleaner for API calls, but requires users to run `gbrain serve --http` and is mainly a Postgres/server setup, not the local PGLite default.
- **Always show gbrain UI:** Rejected for v1 because it adds confusing UI to projects with no gbrain relationship.

## 10) Decision Log

| ID | Decision | Type (P/T/X) | 1-way door? | Status | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Use sidebar as the first UI surface | Product | Reversible | Accepted | User clarified that porting the desktop command palette is out of scope; sidebar is the intended v1 surface | [Open Knowledge current surfaces](./evidence/open-knowledge-current-surfaces.md) | Add gbrain search UI to `FileSidebar` or a child component. |
| D2 | Use local server-proxied CLI integration for v1 | Technical | Reversible | Accepted | User wants browser support; server proxy keeps CLI spawning local and out of the browser renderer | [Open Knowledge current surfaces](./evidence/open-knowledge-current-surfaces.md), [gbrain integration surfaces](./evidence/gbrain-integration-surfaces.md) | Add `/api/gbrain/status` and `/api/gbrain/search`. |
| D3 | Gate search UI on registered source-path match | Cross-cutting | Reversible | Accepted | Prevents UI from appearing for unrelated folders and matches the user request | [gbrain integration surfaces](./evidence/gbrain-integration-surfaces.md) | Imported-but-unregistered folders will not show UI until registered. |
| D4 | Render result rows only in v1 | Product | Reversible | Accepted | User confirmed local file opening is not needed for v1 | User decision, 2026-05-01 | Slug-to-file opening moves to Future Work. |
| D5 | Filter CLI query results to the matched source before returning them to the renderer | Technical | Reversible | Accepted | `gbrain call query` does not expose a source filter, but current result rows include `source_id`; post-filtering preserves the CLI boundary while avoiding unrelated rendered results | [gbrain integration surfaces](./evidence/gbrain-integration-surfaces.md) | Server should over-fetch within a bounded cap, filter by matched source, and surface a diagnostic if source identifiers are missing. |
| D6 | Use inline sidebar diagnostics for non-registered/configured states, but keep `not-installed` quiet by default | Product | Reversible | Accepted | Keeps normal editing quiet on machines without gbrain while giving users a local explanation when gbrain exists but the current folder cannot search | [Open Knowledge current surfaces](./evidence/open-knowledge-current-surfaces.md) | Search input remains matched-only; diagnostics are disabled/non-search UI. |

## 11) Open Questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to Resolve / Next Action | Status |
|---|---|---|---|---|---|---|
| Q1 | Should v1 be desktop-only? | Product | P0 | Yes | Resolved by user: browser support is required via local server proxy. | Resolved → D2 |
| Q2 | Should imported-but-unregistered folders show a diagnostic prompt? | Product | P1 | No | Decide after v1 scope; registration is not currently in scope. | Open |
| Q3 | Should search results open local files in v1? | Cross-cutting | P0 | Yes | Resolved by user: result rows only for now. | Resolved → D4 |
| Q4 | Should search be source-scoped in v1? | Technical | P1 | No | Resolved for v1: keep CLI boundary and post-filter result rows to the matched `source_id`; revisit direct library integration only if query-time source scoping becomes required. | Resolved → D5 |
| Q5 | Where should diagnostics live? | Product | P1 | No | Resolved for v1: use inline/compact sidebar diagnostics for configured-but-unmatched states and no visible `not-installed` row by default. | Resolved → D6 |
| Q6 | Should the existing command palette become browser-compatible, or should gbrain search use a separate browser-compatible modal first? | Product | P0 | Yes | Resolved by user: do not port the command palette; use sidebar UI. | Resolved → D1 |

## 12) Assumptions

| ID | Assumption | Confidence | Verification Plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | The initial product should target Open Knowledge Desktop, not browser-only usage. | MED | Refuted by user: browser support is required. | Before scope freeze | Refuted |
| A2 | `gbrain sources list --json` is stable enough for companion-app detection. | MED | Treat as CLI contract for v1 or confirm with gbrain maintainers if public-support bar is higher. | Before implementation | Active |
| A3 | Most useful v1 queries do not require strict source-scoping if UI is only shown on matched folders. | LOW | Refined during implementation handoff: source filtering is required for returned rows even though CLI query-time scoping is unavailable. | Before scope freeze | Superseded by D5 |

## 13) In Scope

- Browser and desktop gbrain availability detection through the local Open Knowledge server.
- Current project folder matching against `gbrain sources list --json`.
- Legacy fallback against `gbrain config get sync.repo_path`.
- Sidebar gbrain search UI.
- Local server endpoints `/api/gbrain/status` and `/api/gbrain/search`.
- Server-proxied hybrid search invocation via `gbrain call query`.
- Source-filtered result normalization before responses leave the local server.
- Result list with slug, score, and snippet.
- Clear hidden/disabled/error states, including compact sidebar diagnostics for configured-but-unmatched states.
- Unit tests for detector parsing, path matching, timeout handling, server route guards, and renderer gating.

## 14) Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| macOS GUI PATH cannot find `gbrain` even though terminal can | Medium | Search UI never appears | Check common install paths and expose diagnostics. | Open Knowledge |
| Imported folder is not registered as a gbrain source | High | User expects UI but app hides it | Explain registered-source requirement; consider registration prompt later. | Open Knowledge |
| CLI output shape changes | Medium | Parsing breaks | Validate response, fail soft, and keep CLI adapter isolated. | Open Knowledge |
| Search all gbrain returns results outside current folder | Medium | Confusing or privacy-sensitive results | Prefer source scoping if technically feasible; otherwise clearly label source/slug. | Open Knowledge |
| Running CLI per query is slow | Low/Medium | Poor UX | Cache status; add timeout; only optimize to library/daemon if measured. | Open Knowledge |

## 15) Future Work

### Explored

- **Direct gbrain library integration**
  - What we learned: gbrain exports engine/config/search modules.
  - Recommended approach: revisit if strict source-scoped search or lower latency becomes a must-have.
  - Why not in scope now: higher dependency and version coupling.
  - Triggers to revisit: CLI search latency is poor, or source scoping cannot be achieved through CLI.

### Identified

- **Register current folder as a gbrain source from Open Knowledge**
  - What we know: gbrain can register sources with `gbrain sources add <id> --path <path>`.
  - Why it matters: imported-but-unregistered folders are common when users run `gbrain import` on a subfolder.
  - What investigation is needed: naming, safety, whether Open Knowledge should mutate gbrain config.

- **Sidebar connected-state indicator**
  - What we know: FileSidebar is a viable persistent surface.
  - Why it matters: Users may not discover command-palette-only features.
  - What investigation is needed: visual design and whether persistent chrome is worth it.

### Noted

- **gbrain HTTP transport support** — useful for server/browser mode or remote deployments, but not needed for local desktop v1.
- **Embedding status prompts** — if gbrain search quality is poor because embeddings are missing, future UI could surface "run `gbrain embed --stale`."
