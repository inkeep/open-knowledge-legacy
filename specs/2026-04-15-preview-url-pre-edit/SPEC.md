# Preview URL & Pre-Edit Navigation — Spec

**Status:** Approved
**Owner(s):** Tim Cardona
**Last updated:** 2026-04-15
**Baseline commit:** a6c279a
**Links:**
- Evidence: ./evidence/
- Changelog: ./meta/_changelog.md

---

## 1) Problem statement

**Situation:** Open Knowledge exposes wiki docs to agents via MCP tools (`exec`, `read_document`, `list_documents`, `search`, `write_document`, `edit_document`). Agents read and edit docs autonomously. The browser editor (`packages/app`) renders the Hocuspocus-backed CRDT live for any subscribed client. Navigation uses hash routing `#/{docName}` ([[docNameFromHash]] in `packages/app/src/lib/doc-hash.ts`).

**Complication:** When the agent edits a doc, the user typically has no visual feedback — the editor tab either isn't open, or is on a different doc. The live CRDT stream is the core value of the browser editor, but agents (a) don't know the URL, (b) don't proactively navigate before editing, and (c) can't compute the URL portably — local dev uses an ephemeral port written to `.open-knowledge/server.lock`, while the upcoming cloud deploy will use a stable domain with no lock file semantics.

**Resolution:** Surface a deployment-aware `previewUrl` in every wiki-touching MCP tool response, backed by a single `resolvePreviewUrl(docName)` helper that tries config → env → server-lock → null in priority order. Teach the agent (via the `CLAUDE_MD_SECTION` injection in `packages/cli/src/content/init.ts`) to navigate the Claude Code preview browser to that URL *before* calling any write tool, so the user watches the CRDT change stream in live. Additionally: verify the preview is actually subscribed via Hocuspocus's per-room provider introspection and warn if not, closing the loop between "URL sent" and "human watching."

## 2) Goals
- **G1:** An agent about to edit a doc can call `get_preview_url(docName)` and immediately get a URL to navigate the preview browser to — zero config reads, zero follow-up calls.
- **G2:** Resolution works identically in local dev and cloud deploy via one resolver path (env → lock → config).
- **G3:** CLAUDE.md guidance pushes the agent to open-before-edit; subscriber-presence warning on write tools tells it (and the user) when the preview wasn't actually watching.<br>_[Corrected 2026-04-24 post-ship: per-edit mandate superseded by once-per-session contract. Authoritative fix in [[specs/2026-04-24-preview-attach-once-per-session/SPEC]].]_
- **G4:** No syntactically invalid URLs emitted. If nothing resolves, omit the field rather than fake one. (Reachability is a deploy-time operator responsibility; see D13.)

## 3) Non-goals

- **[NOT NOW]** NG1: Automatic preview-server launch from the MCP server. — Revisit if: users frequently hit "no preview running" warnings. Today the Claude Code harness controls preview lifecycle via `preview_start`; the MCP server has no standing to spawn browser windows.
- **[NOT NOW]** NG2: A `PreToolUse` hook enforcing the open-before-edit rule at the harness layer. — Revisit if: CLAUDE.md guidance alone proves insufficient in practice. Hook scaffolding is additive and can ship later.
- **[NEVER]** NG3: Embedding the full preview content in tool responses. The URL is the contract; the browser renders the content.
- **[NOT UNLESS]** NG4: Supporting multiple concurrent preview base URLs per repo (e.g. prod + staging). — Only if: teams run parallel deploys against the same content directory.

## 4) Personas / consumers

- **P1 — Agent (Claude / any MCP client):** receives `previewUrl` in tool responses; navigates preview before editing.
- **P2 — Human user:** watches CRDT edits stream into the already-open browser editor.
- **P3 — Downstream integrators:** anyone else wiring an MCP client into Open Knowledge — gets `previewUrl` for free, can ignore it if they have no browser concept.

## 5) User journeys

**Happy path (local dev):**
1. User starts `open-knowledge start`; server writes `server.lock` with port.
2. User opens Claude Code, starts a conversation touching a wiki doc.
3. Agent calls `exec("ls docs/")` → response includes `enrichedPaths[].previewUrl = "http://localhost:5173/#/docs/test"`.
4. Agent decides to edit `docs/test`. Per CLAUDE.md guidance, agent navigates the preview to that URL *first*.<br>_[Corrected 2026-04-24 post-ship: per-edit mandate superseded by once-per-session contract. Authoritative fix in [[specs/2026-04-24-preview-attach-once-per-session/SPEC]].]_
5. Agent calls `edit_document`. CRDT change streams into the now-open editor tab. User sees the edit land live.

**Happy path (cloud deploy — future):**
1. Admin deploys Open Knowledge with `preview.baseUrl: "https://wiki.acme.com"` in config.
2. Agent (running remotely via claude.ai) calls `read_document(...)` → response includes `previewUrl = "https://wiki.acme.com/#/docs/test"`.
3. Same open-before-edit flow. User's preview tab (already on that domain) navigates and watches the edit.

**Failure / recovery:**
- No preview running locally: `server.lock` missing or stale → `previewUrl = null`, agent proceeds without navigation, write tool succeeds normally.
- Preview open on wrong doc: agent navigates to correct URL before editing; hashchange handler switches doc (verified: `packages/app/src/App.tsx:16`).
- Preview not subscribed: `write_document`/`edit_document` response includes a `warning` field flagging "no client attached to {docName}" — agent logs it, user sees it in the next turn.

**Aha moment:** First time the user sees the agent type a paragraph into the editor and the cursor/content appears live in their browser without either party asking.

**Debug experience:** `previewUrl` always present when resolvable; tool responses include `resolvePreviewUrl` source (`config` / `env` / `lock` / `null`) so a confused user can tell *why* the URL is what it is.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| `resolvePreviewUrl` | n/a (sync) | no config + no lock → `null` | malformed lock file → treat as missing, `null` | URL returned | config set but lock port=0 → use config (config wins) |
| `previewUrl` on tool response | n/a | non-wiki path → field omitted | resolver throws → log, omit field, don't fail tool | field present on wiki paths | some paths wiki, others not → per-path conditional |
| Preview-subscriber check | n/a | no room for docName → "no preview attached" | Hocuspocus introspection fails → omit warning, don't block edit | subscribers found → no warning | subscribers present but not on this docName → warning |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Resolver checks env first | `OPEN_KNOWLEDGE_PREVIEW_BASE_URL=http://y` → `resolvePreviewUrl("docs/a")` = `"http://y/#/docs/a"`, overrides any other source | Explicit per-shell intent wins |
| Must | Resolver falls back to server lock | No env, valid lock, `port>0` → returns `"http://localhost:{lock.port}/#/docs/a"`; ignore `lock.hostname` entirely | Dev-mode: `hocuspocus-plugin.ts` writes bound Vite port post-listen; prod-mode: `start.ts` serves editor HTML via sirv on same port as Hocuspocus. Same port is correct. |
| Must | Resolver falls back to config | No env, no lock (or stale/port=0), `preview.baseUrl: "https://x"` → returns `"https://x/#/docs/a"` | Cloud-deploy default |
| Must | Resolver returns null when nothing resolves | No env, no lock, no config → returns `null`; tool response omits `previewUrl` entirely | |
| Must | `previewUrl` emitted on `write_document` and `edit_document` only | Write-tool responses include `previewUrl` + `previewUrlSource` in structuredContent when resolvable | Read tools (`exec`, `read_document`, `list_documents`, `search`) do NOT emit `previewUrl` — avoids read-then-edit drift per D3 |
| Must | New `get_preview_url(docName)` MCP tool | Given a wiki-included `docName`, returns `{url, source}` or `null`. Rejects non-wiki `docName` with clear error per D10. | Primary surface agents use pre-edit |
| Must | Write tools emit subscriber-presence warning | If `hocuspocus.documents.get(docName)?.connections.size` is 0 or document isn't loaded, response includes `warning: { message, previewUrl }` — agent surfaces it as actionable "open this to watch" link | Edit still succeeds; best-effort signal |
| Must | `docName` encoding is URL-safe and round-trips | `resolvePreviewUrl("notes/My Doc — 2026")` emits a URL whose hash, when parsed by `docNameFromHash`, decodes back to exactly `"notes/My Doc — 2026"` | `hashFromDocName` currently does NO encoding on the docName (only anchor); resolver must encode per-segment and `docNameFromHash` already decodes per-segment. Asymmetric but compatible. |
| Must | Adversarial encoding coverage | Unit tests cover: `?`, `#`, `%`, leading/trailing `/`, empty segments, doc names starting with `-` | Audit C8 |
| Must | `PREVIEW_GUIDANCE` shared constant | Both `CLAUDE_MD_SECTION` (`content/init.ts`) and `buildInstructions` (`mcp/server.ts`) consume the same exported string | Audit C7 — eliminates drift |
| Should | Resolver exposes source | `previewUrlSource: "env" \| "lock" \| "config"` in the same response | Debugging aid |

### Non-functional requirements

- **Performance:** Resolver called per tool response — must be synchronous and cheap (<1ms). Cache lock file reads per-process with a short TTL.
- **Reliability:** Resolver failures must never fail the underlying tool call. Wrap in try/catch; log; omit field.
- **Security/privacy:** `previewUrl` is emitted to whoever calls the MCP server. For cloud deploy, this leaks the public editor domain — acceptable since it's public by design. Do not include auth tokens or query params beyond the hash.
- **Operability:** Debug log line per resolution attempt (source + result) behind a DEBUG flag.
- **Cost:** Zero — no network, no DB, no additional processes.

## 7) Success metrics & instrumentation

- **M1:** Fraction of wiki-edit MCP calls that were preceded (within same session, within 30s) by a preview-navigation.<br>_[Corrected 2026-04-24 post-ship: metric superseded. The once-per-session contract has new metrics M1 (tool calls per write) + M2 (hint-emission count). Authoritative fix in [[specs/2026-04-24-preview-attach-once-per-session/SPEC]].]_
  - Baseline: ~0% (no mechanism today).
  - Target: ≥70% once CLAUDE.md guidance lands.
  - Instrumentation: correlate agent tool-call logs (not persistent today — see evidence/observability-gap.md *TBD*).
- **M2:** Fraction of write-tool calls where a preview was subscribed at edit time.
  - Baseline: unknown today.
  - Target: ≥80% post-launch.
  - Instrumentation: the subscriber-presence check already computes this; log count + warning emitted per call.

## 8) Current state (how it works today)

- MCP tools return `enrichedPaths`, `stdout`, etc. No `previewUrl` anywhere. (Verified.)
- Browser editor routes via `#/{docName}` hash (verified: `packages/app/src/App.tsx:16`, `packages/app/src/lib/doc-hash.ts`). `hashFromDocName` does no encoding on the docName portion; `docNameFromHash` decodes per-segment — asymmetric but compatible.
- Server lock at `.open-knowledge/server.lock` contains `{pid, hostname, port, startedAt, worktreeRoot}` (verified: `packages/server/src/server-lock.ts:19`). Port may be `0` during startup. In dev mode `hocuspocus-plugin.ts:237-239` calls `updateServerLockPort` after Vite's HTTP server binds. In prod mode `start.ts` serves editor HTML (sirv) + Hocuspocus WebSocket on the same port.
- Config schema lives in `packages/cli/src/config/schema.ts`; already has `server.openOnAgentEdit` (line 22, default false) as related prior art — auto-opens browser on first agent write via `packages/cli/src/commands/start.ts:64`. New `preview.baseUrl` is a separate top-level block per D12.
- `CLAUDE_MD_SECTION` lives in `packages/cli/src/content/init.ts:144`, injected on `init`. `buildInstructions(config)` in `packages/cli/src/mcp/server.ts:40` sends MCP `instructions` string. Per D11, both now consume a shared `PREVIEW_GUIDANCE` constant.
- `@hocuspocus/server@4.0.0-rc.1` exposes public per-room subscriber introspection (`Document.connections` Map, `getConnectionsCount`, `getConnections`, `getClients`, `hasConnection`) at `node_modules/@hocuspocus/server/dist/index.d.ts:134,167-189`. Enables D4 subscriber-presence check.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **MCP tool responses:** new `previewUrl` (and optional `previewUrlSource`) field on structuredContent.
- **Warning surface:** `warning` field on write-tool responses when no subscriber attached.
- **CLAUDE.md:** new paragraph under "Writing (wiki markdown)" in `CLAUDE_MD_SECTION`.
- **Config file:** new optional `preview.baseUrl` field in `.open-knowledge/config.yml`.
- **Docs:** README note on cloud deploy → set `preview.baseUrl`.

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `/#/{docName}` | Browser editor | Hash change triggers `openDocument(docName)` — already works; nothing to change |

### System design

- **Architecture overview:**
  ```
  agent → get_preview_url(docName) ──┐
         │                            ▼
         └→ edit_document(docName) → resolvePreviewUrl(docName)
                                      │            │
                                      │            ├─► {url, source}
                                      │            └─► subscriber-presence check
                                      │                 │
                                      ▼                 ▼
                                previewUrl       warning (if count=0)
  ```
- **Data model:** `resolvePreviewUrl(docName, ctx) → {url: string, source: 'env'|'lock'|'config'} | null`. Single shared helper, priority: env → lock → config.
- **API/transport:** additive MCP fields on write tools only; new `get_preview_url` tool.
- **Auth/permissions:** none — URL is public by construction.
- **Enforcement point(s):** `resolvePreviewUrl` is the single code path. Every tool invokes it in the same shared module.
- **Observability:** `debug("[preview] resolved=%s source=%s", url, source)`.

#### Data flow diagram

- **Primary flow:** tool invoked → tool calls `resolvePreviewUrl(docName)` → result merged into structuredContent → returned to MCP client.
- **Shadow paths to test:**
  - **nil / missing:** no config, no env, no lock → `{url: null, source: 'none'}`, field omitted.
  - **empty:** config baseUrl is empty string → treat as unset.
  - **wrong type:** config baseUrl is a number / invalid URL → log + fall through to next source.
  - **timeout:** n/a (no network).
  - **conflict:** config set + lock exists → config wins (documented).
  - **partial failure:** lock file exists but port=0 (server starting) → treat as unresolvable at lock level, still try config/env.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| `resolvePreviewUrl` | throws | try/catch in tool wrapper | log + omit field | No URL in response; agent proceeds without navigation |
| Lock file | stale / corrupt | existing `isProcessAlive` check | treat as missing | Falls through to other sources |
| Config | invalid URL | URL constructor throws | log + fall through | Config ignored, env/lock tried |
| Hocuspocus subscriber check | introspection API unavailable | try/catch | omit warning | Edit proceeds silently (no regression vs today) |
| `docName` encoding | special chars break URL | unit tests | per-segment encodeURIComponent | URL round-trips correctly |

### Alternatives considered

- **A) No resolution — hardcode `localhost:5173`.** Rejected: breaks cloud deploy.
- **B) Resolution at MCP server *startup* only.** Rejected: port may be `0` at startup; users start/stop preview mid-session. Need fresh resolution per call.
- **C) Emit `previewUrl` on all six tools (including reads).** Rejected after audit C3: creates read-then-edit drift (agent navigates to most-recent URL, not target URL) + noise on read-heavy sessions. Current design: writes only + dedicated `get_preview_url`.
- **D) Config-first priority (`config → env → lock`).** Rejected after audit C2: local clones of cloud-deployed repos would resolve to prod URLs while user edits locally. Current design: env → lock → config.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | **Env → lock → config → null** priority | Technical | LOCKED | No | Env is explicit per-shell intent; lock proves a live local server; config is the deploy-time default. Flipped from original config-first after audit C2 showed local clones of cloud repos would resolve to prod and break local editing. 2026-04-15 | `meta/design-challenge.md` C2 | Local checkouts of cloud-deployed repos keep working without overrides; cloud deploys still "just work" because they ship without a lock file |
| D2 | Resolve per tool call, not at startup | Technical | LOCKED | No | Port can be 0 at startup; users start/stop preview mid-session | `server-lock.ts:23` comment on port=0 | Slight perf cost; mitigated by in-process cache |
| D3 | `previewUrl` only on `write_document` + `edit_document`; add dedicated `get_preview_url(docName)` tool for pre-edit nav | Cross-cutting | LOCKED | No | Audit C3 flagged read-then-edit drift and read-only session noise from wide emission. `get_preview_url` gives agent the URL *before* editing (the original intent) without polluting read responses. 2026-04-15 (reversed after audit) | `meta/design-challenge.md` C3; conversation 2026-04-15 | Narrower surface; agent must call `get_preview_url(targetDoc)` before `edit_document(targetDoc)` to navigate preview first |
| D4 | Hocuspocus subscriber-presence check is **P0, In Scope** | Cross-cutting | LOCKED | No | Audit caught the earlier "no public API, 1–2 days" claim as factually wrong. `@hocuspocus/server@4.0.0-rc.1` exposes `Document.connections: Map<>`, `hasConnection`, `getConnections`, `getConnectionsCount`, `getClients` publicly (`node_modules/@hocuspocus/server/dist/index.d.ts:134,167-189`). The check is one-liner: `hocuspocus.documents.get(docName)?.connections.size`. Decision reopened + re-locked. 2026-04-15 | `meta/audit-findings.md` High-1; `evidence/hocuspocus-subscriber-api.md` | Write tools return `warning` when count=0, including `previewUrl` as actionable "open this" link per Q7 |
| D5 | Hash route `#/{docName}` is the URL contract | Technical | LOCKED | Yes | Already shipped; `docNameFromHash` handles encoding | `packages/app/src/App.tsx:16`, `packages/app/src/lib/doc-hash.ts` | Frontend cannot change route format without breaking this |
| D6 | `PreToolUse` hook deferred | Product | DIRECTED → Future Work | No | Hook is additive; CLAUDE.md guidance ships first | Conversation | Revisit if CLAUDE.md insufficient |
| D7 | Auto-launch preview is out of scope | Product | LOCKED | No | Harness owns browser lifecycle, not MCP server | Conversation | User must have started preview for flow to work |
| D8 | `previewUrlSource` field name for debug | Technical | DIRECTED | No | Name chosen for clarity; open to rename | — | Cosmetic; implementer owns final name |
| D9 | When the lock branch fires, always build `http://localhost:{lock.port}/...` — ignore `lock.hostname` entirely | Technical | LOCKED | No | Audit C5: "current machine" predicate was underspecified. Simpler rule: if a lock file exists and is fresh, the MCP server and the browser are co-located (not a supported SSH-remote-dev persona). | `evidence/current-state.md`; `meta/design-challenge.md` C5 | Lock `hostname` still used for collision detection, not URL building |
| D10 | `get_preview_url(docName)` validates that `docName` is inside `content.include` before returning a URL | Technical | LOCKED | No | Keeps the "no broken URLs" invariant (G4) without per-tool filtering plumbing. Pattern copied from `search.ts:67`. | `evidence/current-state.md` §"`exec` enrichment"; audit 2026-04-15 | Tool returns null/error for non-wiki paths; write tools intrinsically only act on wiki paths |
| D11 | Single shared `PREVIEW_GUIDANCE` constant consumed by both `CLAUDE_MD_SECTION` and `buildInstructions` | Technical | LOCKED | No | Audit C7: two hand-edited strings = drift guaranteed. One constant, two consumers. | `meta/design-challenge.md` C7 | Exported from `packages/cli/src/content/init.ts`; imported by `packages/cli/src/mcp/server.ts` |
| D12 | `preview.baseUrl` is a new top-level config block; coexists with existing `server.openOnAgentEdit` | Technical | LOCKED | No | Prior art: `server.openOnAgentEdit` (existing, default false) auto-opens browser on first agent write. Different mechanism (one-shot OS-level open) with related intent. User chose to keep both, scoped differently. | `packages/cli/src/config/schema.ts:22` (existing field); audit 2026-04-15 | No schema migration; new block is additive |
| D13 | G4 scoped to "no syntactically invalid URLs emitted" (not "no unreachable URLs") | Technical | LOCKED | No | Audit C9: resolver has no way to verify browser reachability without runtime probe (rejected by perf NFR). | `meta/design-challenge.md` C9 | Reachability is covered by D9's co-location assumption + operator responsibility for `preview.baseUrl` |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | `server.lock.hostname` behavior | Technical | P0 | Yes | Resolved → D9 | Resolved 2026-04-15 |
| Q2 | Hocuspocus per-room subscriber introspection API | Technical | P0 | Yes | Resolved → no public API; custom Extension needed. See `evidence/subscriber-presence-cost.md` | Resolved 2026-04-15 — escalates D4 cost |
| Q3 | Wiki-included filter for `exec.enrichedPaths[]` | Technical | P0 | Yes | Resolved → D10 (use `content.include` via shared helper) | Resolved 2026-04-15 |
| Q4 | Is `content.include` the right predicate? | Technical | P0 | No | Resolved → yes, matches `search.ts:67` precedent | Resolved 2026-04-15 |
| Q5 | CLAUDE_MD_SECTION vs buildInstructions — one or both? | Technical | P0 | No | Resolved → D11 (both) | Resolved 2026-04-15 |
| Q6 | Subscriber-presence in split cloud deploy | Technical | P2 | No | Deferred with D4 | Resolved 2026-04-15 — moved to Future Work |
| Q7 | Should the "no preview attached" warning include the URL? | Product | P2 | No | User said yes — applies when D4 ships later | Resolved 2026-04-15 (deferred with D4) |
| Q8 | Does D4 stay P0 given plumbing cost? | Cross-cutting | P0 | Yes | User chose (b) — ship `previewUrl` only | Resolved 2026-04-15 |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Hocuspocus exposes a way to enumerate connected providers per room | MEDIUM | Read Hocuspocus 4.0-rc docs + trace our server | Before audit (Step 6) | Active |
| A2 | `content.include` filter is accessible from tool response builders | HIGH | Grep tool shared helpers | During iteration | Active |
| A3 | Current MCP tool response format allows additive fields without breaking existing clients | HIGH | MCP spec is additive by design; verify with one tool | Before implementation | Active |
| A4 | Agents will reliably read `previewUrl` from tool responses and navigate before editing when CLAUDE.md tells them to<br>_[Corrected 2026-04-24 post-ship: assumption no longer load-bearing — per-edit navigation dropped. Authoritative fix in [[specs/2026-04-24-preview-attach-once-per-session/SPEC]].]_ | LOW | Dogfood for a week post-ship; measure M1 | 2 weeks post-ship | Active |

## 13) In Scope (implement now)

- **Goal:** `previewUrl` available on every wiki-touching MCP response; agents open doc in preview before editing; cloud-ready via config.
- **Non-goals:** See §3.
- **Requirements:** §6.
- **Proposed solution:** §9.
- **Owner/DRI:** Tim Cardona.
- **Next actions:**
  1. Add `preview: { baseUrl?: string }` to `packages/cli/src/config/schema.ts` (top-level block per D12).
  2. Build `resolvePreviewUrl(docName, ctx)` in a new `packages/cli/src/mcp/tools/preview-url.ts` — priority env → lock → config; per-segment encoding.
  3. New `get_preview_url` MCP tool; register in `packages/cli/src/mcp/tools/index.ts`.
  4. Add `previewUrl` + `previewUrlSource` fields to `write_document` / `edit_document` response structuredContent.
  5. Add subscriber-presence check — call `hocuspocus.documents.get(docName)?.connections.size` from write tools; emit `warning` with `previewUrl` when 0.
  6. Export `PREVIEW_GUIDANCE` constant from `packages/cli/src/content/init.ts`; consume from both `CLAUDE_MD_SECTION` and `buildInstructions`.
  7. Tests: resolver branches (env, lock, config, null), adversarial encoding (`?`, `#`, `%`, `/`, empty segments), subscriber-count check with mocked Hocuspocus, round-trip via `docNameFromHash`.
- **Risks + mitigations:** §14.
- **What gets instrumented:** `previewUrlSource` counts, subscriber-presence hit rate.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Existing clients | `previewUrl` is additive; absence means same as today | Run old CLI client against new server |
| Upgrade ordering | MCP server update → CLAUDE.md injection via `init` | Stage on this repo first |
| Cloud deploy | Document `preview.baseUrl` in deploy guide | README update |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Agents ignore CLAUDE.md guidance | Medium | Medium (low feature value) | PreToolUse hook in Future Work; monitor M1<br>_[Corrected 2026-04-24 post-ship: risk dissolved — per-edit mandate removed; compliance now measured by FR9 hint-emission counter. Authoritative fix in [[specs/2026-04-24-preview-attach-once-per-session/SPEC]].]_ | Tim |
| Cloud deploy forgets `preview.baseUrl` | Medium | Low (field just omitted) | Loud warning on MCP startup when lock absent + no config | Tim |
| `hostname` in lock file is unreachable | Resolved | — | D9: always use `localhost` when lock branch fires | — |
| Cloud-deployed repo's `preview.baseUrl` leaks to local clones | Resolved | — | D1 priority flipped to env → lock → config; lock (local server) beats config (deploy default) | — |
| Two instruction surfaces drift | Resolved | — | D11: single `PREVIEW_GUIDANCE` constant | — |
| `previewUrl` on read tools creates navigation drift | Resolved | — | D3: emit only on writes + dedicated `get_preview_url` | — |

## 15) Future Work

### Identified

- **`PreToolUse` hook for settings.json** — Template hook that blocks `write_document`/`edit_document` until preview is confirmed open. Harder enforcement than CLAUDE.md + subscriber-presence warning. Needs its own spec; revisit if dogfooding shows agents routinely skip the warning.
- **Split-deploy subscriber-presence check** — when MCP server and Hocuspocus run in different processes (e.g. future remote MCP + cloud editor), the in-process `connections.size` lookup won't work. Will need an HTTP endpoint on `api-extension.ts`. Not needed for MVP since both run co-located today.
- **`preview.emit` config option** — audit C6 suggested `always | local-only | never` to let cloud deploys opt out of leaking doc paths to all MCP clients. Low priority — cloud deploys default to public domain.

### Explored

- **`get_preview_url` convenience tool** — Standalone tool returning the URL for a docName. Explored (D3 rejected it for now); ship only if cold-start cases emerge.
- **Auto-launch preview from MCP server** — Explored (D7). Rejected: harness owns browser lifecycle.

### Noted

- **Multi-environment preview URLs** (staging + prod against same content dir) — NG4 trigger.
- **Embedding snapshot thumbnails in tool responses** — richer context than just a URL.

## 16) Agent constraints

- **SCOPE:** `packages/cli/src/mcp/tools/` (new `preview-url.ts`, new `get-preview-url.ts`, edits to `write-document.ts` / `edit-document.ts` / `index.ts`), `packages/cli/src/config/schema.ts`, `packages/cli/src/content/init.ts` (`PREVIEW_GUIDANCE` constant + `CLAUDE_MD_SECTION`), `packages/cli/src/mcp/server.ts` (`buildInstructions`), tests alongside each.
- **EXCLUDE:** Browser editor (`packages/app/`) — route format stays. Docs CLI (`packages/docs/`). Unrelated tools.
- **STOP_IF:** Change to hash-route format, change to server-lock schema, change to MCP transport.
- **ASK_FIRST:** New 3P dependency, schema migration, changes to existing tool response field names.
