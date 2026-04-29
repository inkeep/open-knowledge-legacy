# Principal identity in presence — Spec

**Status:** Approved
**Owner(s):** miles@inkeep.com
**Last updated:** 2026-04-27
**Baseline commit:** e251f70b (verified at finalization — no codebase drift since spec start)
**Links:**
- Evidence:
  - [evidence/current-identity-flow.md](evidence/current-identity-flow.md)
  - [evidence/principal-already-fetched.md](evidence/principal-already-fetched.md)
- Process: [meta/_changelog.md](meta/_changelog.md)

---

## 1) Problem statement

**Situation:** Client `getIdentity()` ([packages/core/src/utils/identity.ts:188](../../packages/core/src/utils/identity.ts:188)) generates random `${adjective} ${animal}` names like "Curious Squirrel" for presence and persists them in localStorage on first visit. Server-side `loadPrincipal()` ([packages/server/src/principal.ts:32](../../packages/server/src/principal.ts:32)) already reads `git config user.name` / `user.email` at every boot and writes a stable `principal.json` record under `<contentDir>/.open-knowledge/`, exposed via `GET /api/principal`. The client even already fetches that endpoint in [DocumentContext.tsx:367](../../packages/app/src/editor/DocumentContext.tsx:367) — but only consumes `principal.id` for the auth token, discarding `display_name`, `display_email`, and `source`.

**Complication:** The data needed for human-readable presence is sitting on the client one `.then()` away, but the presence bar still shows random animal names. Solo developers see "Curious Squirrel" for their own avatar across multiple tabs of the same doc, with no way to recognize "those are all me." As OK adoption broadens, this friction compounds — every new tab is an unrecognizable nickname, and there's no per-human aggregation. (Real-time multi-machine peering — where two humans on separate checkouts see each other in the presence bar — isn't a feature today; this spec is forward-compatible with that scenario but doesn't deliver it.)

**Resolution:** Lift the existing principal fetch into React state, plumb it through `DocumentContext` to the awareness publication site, and prefer `display_name` over the random fallback when `source === 'git-config'`. Color is seeded deterministically from `principal.id` for cross-tab/cross-machine consistency. Add `principalId` to `AwarenessUser` so `usePresence()` can dedupe humans across tabs into one avatar with a tab-count tooltip. Random animal-adjective stays as the fallback for `source === 'synthesized'` users (no git config) and during the brief boot window before principal arrives.

## 2) Goals

- **G1:** Replace anonymous random nicknames with the user's actual name in presence whenever a git identity is available.
- **G2:** Eliminate visual duplication when one human has multiple tabs of the same document open.
- **G3:** Deterministic per-principal color so the same human gets the same color across tabs/machines/restarts on the same checkout.
- **G4:** Name UX preserved for users without git config (synthesized source) — they keep the random animal-adjective. Color becomes deterministic from `principal.id` (an intentional, mild improvement: stable color across tab restarts even without git config). `principalId` is **not** published for synthesized users (FR9, post-audit).
- **G5:** Forward-compatible with multi-machine peering: if two humans on separate machines (separate `principal.json` records) ever connect to a shared Y.Doc in real time, the dedupe key (`principal.id`) correctly distinguishes them.

## 3) Non-goals

- **[NOT NOW]** NG1: User-facing config flag to suppress git-identity broadcast (`presence.useGitIdentity: false`). Revisit if/when shared-content-dir scenarios emerge or any user reports privacy concern.
- **[NOT NOW]** NG2: In-app "rename my presence" UI. Revisit if users ask for it; the localStorage override path remains technically open for power users.
- **[NEVER]** NG3: Avatar images sourced externally (gravatar, GitHub avatar lookups by email). Out of scope: introduces network dependency, privacy surface, and per-tenant config that doesn't fit OK's local-first model.
- **[NOT UNLESS]** NG4: Mid-session live refresh of `display_name` when the user changes git config without restarting. Only revisit if users hit it in practice — server boot already refreshes; reload covers it.
- **[NEVER]** NG5: Cross-tab cursor deduplication. Each tab continues to publish and render its own cursor — N tabs editing should show N cursors. Only the avatar bar dedupes.
- **[NOT NOW]** NG6: Caching the resolved principal-derived name in localStorage to avoid first-paint flicker on cold start. Acceptable for v1 given the fetch is typically <50ms on localhost; revisit if flicker becomes user-visible.

## 4) Personas / consumers

- **P1 — Solo developer** (primary, the v1 user-facing win): one human, possibly multiple tabs of the same doc, wants to recognize their own avatar and see "this is me across N tabs" at a glance.
- **P2 — Multi-machine pair coder** (forward-compatible, journey is aspirational): two-to-three humans on **separate machines, separate checkouts**, each with their own `principal.json` (distinct `id`s). When real-time multi-machine peering ships (currently not a feature), the dedupe key is correct and each human renders as a distinct avatar. **Same-machine multi-human is explicitly out of scope** — two humans driving the same loopback server share `principal.json` and would dedupe to one avatar; not a v1 use case.
- **P3 — Synthesized-source user** (no `git config user.name` set): keeps the existing animal-adjective UX. This persona exists on fresh boxes / sandbox CI environments. No `principalId` published (FR9), so cross-browser-profile users render per-tab as today.

## 5) User journeys

### P1 — Solo developer

- **Discovery:** Loads OK in browser; sees their own avatar in the presence bar.
- **Aha moment:** Avatar shows "MK" initials with deterministic teal color and tooltip "Miles Kaming-Thanassi" — instead of a random squirrel.
- **Multi-tab:** Opens the same doc in a second tab. Single avatar in the presence bar, tooltip says "Miles Kaming-Thanassi · 2 tabs."
- **Failure path (server slow / down):** Avatar briefly shows a random animal name on first paint, upgrades to real name within ~50ms once `/api/principal` resolves. If the fetch fails entirely, silent fallback to random — log line emitted but no user-facing error.

### P2 — Multi-machine pair coder (future-state journey)

> **Aspirational** — predicated on real-time multi-machine peering being implemented (not in this spec's scope). The dedupe architecture below is forward-compatible.

- **Discovery:** Joins a real-time editing session where another human (different machine, different checkout) is already in the doc.
- **Aha moment:** Sees two distinct named avatars in the presence bar: "MK" (Miles) and "ND" (Nick). Tooltips confirm full names. Distinct `principal.id`s per machine → distinct dedupe groups → distinct avatars.
- **Failure path:** Same as P1.

### P3 — Synthesized-source user

- **Discovery:** Opens OK on a fresh machine with no `git config user.name` set.
- **Experience:** Identical to today — random animal-adjective name, random pastel color, persisted in localStorage. No regression.
- **Note:** `principal.json` is still created with `source: 'synthesized'` and the synthesized `Local User` display name; the client ignores the synthesized display name and continues to use the random fallback.

### Interaction state matrix

| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| HumanAvatar (own) | Random animal until principal lands | n/a (always have *some* identity) | Silent fallback to random | Real name + initials + deterministic color | Real name with brief flicker if fetch is slow |
| HumanAvatar (peer) | Same per-peer | n/a | Peer's local fallback applies | Real name + initials | Each peer independently renders by their own publish state |
| Multi-tab dedupe | n/a until both tabs have principal | One tab → one avatar (today's behavior) | If only one tab has principal, both render separately | Single avatar, tooltip "Name · N tabs" | Mixed: tabs without principalId render as separate avatars |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | FR1 — Client lifts existing `/api/principal` fetch into React state and exposes via `DocumentContext`. | `DocumentContextValue.principal: Principal \| null` is non-null after fetch resolves; null until then. Test: integration test asserts context value transitions null → resolved within deterministic delay. | Reuses existing fetch in `DocumentContext.tsx:367`; no new endpoint. |
| Must | FR2 — `AwarenessUser` type adds `principalId?: string`. | TypeScript export includes the field; awareness publish-site sets it when principal is known. | Edits `packages/core/src/types/awareness.ts`. |
| Must | FR3 — Awareness publication merges principal into name/color. | Three states: (a) **principal not yet resolved** (boot race) — `name` + `color` from `getIdentity()` random fallback; `principalId` not included in payload. (b) **`principal.source === 'git-config'`** — `name = principal.display_name`, `color = colorFromSeed(principal.id, HUMAN_COLORS)`, `principalId = principal.id`. (c) **`principal.source === 'synthesized'`** — `name` from `getIdentity()` random fallback (cached); `color = colorFromSeed(principal.id, HUMAN_COLORS)` (deterministic per-checkout); `principalId` **not** published (FR9, post-audit). All three states must explicitly include `type: 'human' as const` in the payload — the discriminator is mandatory on `AwarenessUser` and `usePresence` filters on it. | Effect re-fires when principal arrives → peers see the upgrade. |
| Must | FR4 — `usePresence()` dedupes humans by `principalId`. | Eligibility rule: `typeof principalId === 'string' && principalId.length > 0`. When ≥2 awareness entries pass eligibility and share a `principalId`, exactly one `HumanParticipant` is emitted; tie-break for `name`/`color` is lowest `clientId`. Ineligible entries render per-clientId as today. Post-dedupe shape: `HumanParticipant` gains `tabCount: number` (= 1 for non-deduped entries; ≥ 2 for collapsed). `participantsEqual` (the existing `setState` short-circuit at [use-presence.ts:70](../../packages/app/src/presence/use-presence.ts:70)) must compare `tabCount` to avoid stale tooltip counts. | Synthesized users don't publish `principalId` (FR9) — eliminates the cross-profile name-flicker edge case where different browser profiles on the same machine each generate distinct random names but share the same synthesized `principal.id`. |
| Must | FR5 — `HumanAvatar` tooltip surfaces multi-tab count. | When the deduped participant has tab count N > 1, tooltip text reads `"<name> · <N> tabs"`. When N === 1, tooltip reads just `"<name>"`. | Pluralization: "1 tab" vs "N tabs"; "tab" if N === 1 doesn't apply since N === 1 is the no-suffix case. |
| Must | FR6 — Cursor rendering stays per-clientId. | N tabs editing the same doc render N cursors in the editor. Dedupe applies only to the avatar bar. | No change to `@tiptap/extension-collaboration-cursor` integration. |
| Must | FR7 — `colorFromSeed` accepts a palette parameter or has a HUMAN_COLORS variant. | `colorFromSeed(seed, HUMAN_COLORS)` returns one of the 7 pastel colors deterministically. | Existing function in [identity.ts:46](../../packages/core/src/utils/identity.ts:46) is hardcoded to `AGENT_COLORS`; refactor to accept a palette argument or add `colorFromSeedHuman` sibling. |
| Must | FR8 — Fetch failure is silent + logged. | If `/api/principal` returns non-2xx, throws, or fails Zod parse: `principal` stays null; presence renders random fallback; one `console.warn('[principal-fetch] ...')` per session; no UI error. | Aligns with existing localStorage-failure pattern at [identity.ts:170](../../packages/core/src/utils/identity.ts:170). |
| Must | FR8b — Add `PrincipalSchema` Zod schema in [packages/core/src/schemas/api.ts](../../packages/core/src/schemas/api.ts) mirroring `ServerInfoResponseSchema`. | Schema exported alongside existing schemas with `.loose()` for forward-compat. Fetch boundary parses via `PrincipalSchema.safeParse(json)`; failure routes to FR8 silent-fallback path. | Single source of truth between server response and client consumer; no `as { id?: unknown }` ad-hoc shape checks. |
| Must | FR9 — Synthesized-source users render per-tab. | When `principal.source === 'synthesized'`: awareness publishes the random fallback `name` (not `principal.display_name`, which is `'Local User'`); `color = colorFromSeed(principal.id, HUMAN_COLORS)` (deterministic); `principalId` is **not** included in the payload. Same-checkout, same-browser-profile multi-tab synthesized users render as N copies of the same animal name — same as today. | Avoids the cross-browser-profile name-flicker described in FR4 Notes: different profiles each generate distinct localStorage random names but share the synthesized `principal.id`; without `principalId` on awareness, no false dedupe occurs. |
| Should | FR10 — `getIdentity()` remains synchronous. | No call sites change. `useState(getIdentity)` still works. | Preserves existing API contract; the upgrade is layered on top via DocumentContext. |
| Should | FR11 — localStorage cache key for synthesized-source random name is bumped or repurposed. | After this ships, the existing `ok-user-name-v2` value is ignored on first read; a fresh key (e.g. `ok-user-name-v3`) holds the synthesized random fallback. | Pre-launch state per user direction; no migration path needed. |
| Could | FR12 — `coeditor` query-param plumbing is preserved unchanged. | Test asserts the published awareness `user.coeditor` equals the URL `?coeditor=` value (or `'standalone'` when absent), under each FR3 state: (a) principal not yet resolved, (b) principal resolved git-config, (c) principal resolved synthesized. | Pins the regression — implementer who writes the awareness payload as an explicit object (instead of `...identity` spread) won't silently drop `coeditor`. |
| Must | FR13 — Add `computeInitials(name: string): string` helper. | Helper handles common git-config formats: hyphenated Unix usernames (`miles-kt-inkeep` → `MK`), single words (`Miles` → `MI`, first 2 letters), full names (`Miles Kaming-Thanassi` → `MK`), camelCase (`MilesKT` → `MK`). Caps at 2 chars, uppercase. Lives in `packages/core/src/utils/identity.ts`; unit-tested against representative formats. `HumanAvatar` calls `computeInitials(user.name)` instead of inlining `name.split(' ').map(w => w[0]).join('')`. | Without this, the spec author's own `display_name: "miles-kt-inkeep"` renders as a single lowercase `m` in the avatar — visibly worse than today's animal icon. |

### Non-functional requirements

- **Performance:** First-paint flicker on cold start is the cost of architecture B. Target <100ms on localhost (single fetch, already in flight at mount). No measurable cost on warm tab navigation.
- **Reliability:** Fetch failure must degrade gracefully — presence remains functional with random fallback. No crash, no broken state.
- **Privacy / Trust model:** `display_name` may be the user's real name; broadcast over awareness only on the loopback Hocuspocus connection. No external network egress beyond what already happens. `display_email` is **not** published to awareness (only used server-side for shadow-repo authoring). **`principalId` on awareness is informational, client-published, and trusted because the server is loopback-only.** A malicious or buggy peer could publish a forged `principalId`, causing local clients to mis-dedupe; this is acceptable in the loopback-only threat model. **If non-loopback connections ever ship** (team-mode in §15, dev-tunnel scenarios), the publish-site needs server-authoritative attribution (server validates or overwrites `awareness.user.principalId` from `ctx.principalId` at `onAuthenticate` time). This is the explicit revisit trigger for the trust model.
- **Operability:** One `console.warn` on fetch failure (`[principal-fetch]` prefix). No new metrics needed for v1.
- **Cost:** Zero new dependencies; ~30 lines of net code (FR1 + FR3 + FR4 + FR8b + FR13).

## 7) Success metrics & instrumentation

- **Metric 1: Avatar identity legibility (qualitative).**
  - Baseline: random animal name, no recognition without tooltip.
  - Target: real name visible in tooltip, initials in avatar; user-self-recognition is immediate.
  - Instrumentation: none formal — verified via QA + dogfooding.
- **Metric 2: Tab dedupe correctness.**
  - Baseline: N humans × M tabs = N×M avatars.
  - Target: N humans → N avatars regardless of M.
  - Instrumentation: Playwright test in `packages/app/tests/integration/presence-multi-tab.test.ts` or sibling.
- **What gets logged:** `console.warn('[principal-fetch] ...')` on fetch failure (one-shot per session). Existing presence telemetry (if any in `metrics-presence`) is unaffected.

## 8) Current state (how it works today)

See [evidence/current-identity-flow.md](evidence/current-identity-flow.md) for the full trace.

Summary:
- Random `Adjective Animal` names persisted in `ok-user-name-v2` localStorage key.
- Random pastel color persisted in `ok-user-color-v2`.
- `useState(getIdentity)` runs once per editor mount → identity stable for component lifetime, fresh per tab.
- `setLocalStateField('user', {...})` publishes to Yjs awareness on TiptapEditor + SourceEditor mount.
- `usePresence()` builds one `HumanParticipant` per Yjs `clientId` → multi-tab humans appear N times.
- `HumanAvatar` looks up animal icon by second word of name; falls back to initials for non-matching names.

Server-side `principal.json` (read in `loadPrincipal()`) already holds `id`, `display_name`, `display_email`, `source`, `created_at`. The client already fetches `/api/principal` at `DocumentContext` mount, but only uses `principal.id` to wire the auth-token claim — `display_name`, `display_email`, `source` are discarded.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **PresenceBar:** Same component, real names instead of animal-adjectives, initials in avatar, deterministic per-principal color, tab-count suffix in tooltip.
- **No new UI surfaces.**
- **Tooltip text:**
  - Single tab: `"Miles Kaming-Thanassi"` (just the name)
  - Multi-tab: `"Miles Kaming-Thanassi · 2 tabs"` (separator + count + plural)
- **Error messages:** None user-visible. Log line on fetch failure.
- **Docs:** No new docs surface — internal refactor.

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `/` (any doc) | PresenceBar shows resolved identity | Real-name avatar appears for git-config user; animal name for synthesized; multi-tab dedupes correctly |
| `/` cold start, slow fetch | Boot flicker behavior | First paint may show random name; upgrades to real name when fetch lands; no error toast |

### System design

- **Architecture overview:**
  ```
  Server: principal.json on disk
       │
       └─→ GET /api/principal (existing handler, no change)
            │
            └─→ DocumentContext mount: fetch already exists
                 │
                 ├─→ pool.setTabIdentity({ principalId: id, tabSessionId }) [today]
                 │
                 └─→ NEW: setPrincipal(principal) into React state
                          │
                          └─→ DocumentContextValue.principal: Principal | null
                                  │
                                  └─→ TiptapEditor effect deps on
                                       useDocumentContext().principal (Q4 resolved
                                       — only TiptapEditor; SourceEditor doesn't
                                       publish `user`)
                                       │
                                       └─→ awareness.setLocalStateField('user', {
                                              type: 'human' as const,         // mandatory discriminator
                                              name: identity.name,             // random fallback or principal.display_name
                                              color: identity.color,           // random fallback or colorFromSeed(principal.id, HUMAN_COLORS)
                                              coeditor: identity.coeditor,     // preserved (FR12)
                                              tabId: identity.tabId,           // preserved (Q6 deferred)
                                              ...(principal && principal.source === 'git-config'
                                                ? { principalId: principal.id }
                                                : {}),                         // FR9: only emit principalId for git-config users
                                          })
                                       // Resolution rule (FR3):
                                       //  null      → random name + random color, no principalId
                                       //  git-config → display_name + deterministic color + principalId
                                       //  synthesized→ random name + deterministic color, no principalId
  ```
- **Data model:**
  - `AwarenessUser` gains `principalId?: string`.
  - `Principal` type already exists; no schema change.
  - localStorage: bump from `ok-user-name-v2` / `ok-user-color-v2` to `ok-user-name-v3` / `ok-user-color-v3` (or repurpose v2 with new semantics — pick one at implementation; user direction is "overwrite or ignore").
- **API/transport:** No new endpoint. Reuses existing `GET /api/principal`.
- **Auth/permissions:** Same loopback access as existing `/api/principal`. No change to auth model.
- **Enforcement points:** `usePresence()` aggregation (dedupe), `setLocalStateField` call sites (publish), `DocumentContext` (principal source-of-truth on the client).
- **Observability:** Existing log conventions; add one `console.warn` on fetch failure.

#### Data flow diagram

- **Primary flow:** DocumentContext mount → existing `fetch('/api/principal')` → setPrincipal in state + setTabIdentity on pool (today) → awareness effects re-fire with principal → peers see upgraded identity via awareness change events.
- **Shadow paths to test:**
  - **nil / missing:** `/api/principal` returns 404 → `principal` stays null → awareness publishes random fallback indefinitely. No log spam (one warn per session).
  - **empty:** `principal.display_name === ''` (shouldn't happen post-sanitize, but defend): treat as synthesized for awareness purposes. Don't break the bar.
  - **wrong type:** `principal.source` is neither `'git-config'` nor `'synthesized'`: defensive — fall through to random. Schema validation via Zod at the fetch boundary recommended.
  - **timeout:** `fetch` hangs > some threshold → AbortController? Today's fetch has no abort. Acceptable for v1; presence is non-essential, the user can navigate without it.
  - **conflict:** Multiple tabs each fetch independently → all converge on the same principal (server is source of truth). No conflict possible.
  - **partial failure:** Principal arrives in tab A but not tab B → tab A renders dedupe candidate, tab B renders separately. Tooltip-count is "1 tab" for tab A's deduped entry until B's principalId arrives.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| `/api/principal` fetch | Network error / 404 | `.catch()` / non-2xx | Silent fallback to random fallback name+color; one `console.warn` | Presence shows animal name + random pastel color; functional |
| Zod parse fail (if added) | Malformed response | Parse exception | Same as fetch fail | Same |
| `colorFromSeed` palette mismatch | Implementation bug returning out-of-range index | Unit test | Static check (modulo on palette length) | None if palette is non-empty |
| `usePresence` dedupe with stale entry | Tab closes but principalId entry lingers in awareness map | Existing TTL tick (1s) ages out closed clients | Standard awareness expiry | Brief lag before tab-count drops |

### Alternatives considered

- **Option A — Make `getIdentity()` async.** Rejected. Public API change; cascades through every consumer. Heavy refactor for marginal benefit.
- **Option C — Eager pre-fetch in DocumentContext to avoid first-paint flicker.** Rejected for v1. The fetch is already happening at the same boot moment; the extra plumbing of blocking awareness publication doesn't pay off when the flicker is sub-100ms on localhost. Re-evaluate if flicker becomes user-visible in practice.
- **Option D — Inject principal into HTML at server time** (server renders `<script>window.__OK_PRINCIPAL__ = {...}</script>`). Rejected: requires touching the dev-server / CLI HTML serving path; the existing fetch is just as fast on localhost and doesn't add cross-cutting infrastructure. Worth revisiting if the flicker concern grows.
- **Option E — Random color stays random.** Rejected per user direction; deterministic color is a small consistency win for cross-tab/cross-machine UX.

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Avatar visual: animal icons gated on the **`source` discriminator**, not name-pattern matching. `principal.source === 'synthesized'` (or `principal === null`) → use the existing animal-icon lookup if `name.split(' ')[1]` happens to match. `principal.source === 'git-config'` → always render initials via `computeInitials(name)` (FR13), never the animal lookup. | P | LOCKED | No | Avoids the audit-flagged edge case (a real human named "John Bird" rendering a bird icon). Source-gating is a 1-line guard in `HumanAvatar`; reads `principal.source` from awareness or via context. | [PresenceBar.tsx:62](../../packages/app/src/presence/PresenceBar.tsx:62), AUD F11 | Synthesized users keep cute UX; real-name users always get clean initials regardless of surname coincidence. |
| D2 | localStorage migration: overwrite/ignore the existing `ok-user-name-v2` key. No data loss concern — pre-launch state. | T | LOCKED | No | User direction. No active users; only developers building/testing. | User session 1 | Implementation can choose v3 key or repurpose v2; both acceptable. |
| D3 | Color derivation: deterministic from `principal.id` via `colorFromSeed(id, HUMAN_COLORS)`. | T | LOCKED | No | Existing infra ([identity.ts:46](../../packages/core/src/utils/identity.ts:46)). Cross-tab consistency. | [identity.ts:46](../../packages/core/src/utils/identity.ts:46) | `colorFromSeed` needs a palette parameter or a HUMAN_COLORS sibling. |
| D4 | Fetch failure handling: silent fallback to random + one-shot warn log. | T | LOCKED | No | Presence is non-essential UX; loud failures are worse than degraded UX. | [identity.ts:170](../../packages/core/src/utils/identity.ts:170) (existing pattern) | One `[principal-fetch]` warn per session. |
| D5 | Mid-session git config refresh: stale-until-reload. No client-side refresh logic. | P | LOCKED | No | Rare scenario; existing "restart server, reload page" recovery suffices. | Session 1 | If this becomes a felt pain, see NG4 trigger. |
| D6 | Multi-tab UX: single avatar; tooltip "Name · N tabs" for N > 1; no badge. | P | LOCKED | No | Cleanest default; visible on hover; can upgrade later if invisible. | Session 1 | Pluralization rule: "1 tab" never appears (N === 1 → no suffix). |
| D7 | Architecture: keep `getIdentity()` sync; expose principal via DocumentContext; awareness re-publishes on principal arrival. | T | LOCKED | No | Existing fetch in DocumentContext.tsx:367 is reused; no API churn; idiomatic upgrade pattern. | [DocumentContext.tsx:367](../../packages/app/src/editor/DocumentContext.tsx:367) | Brief first-paint flicker on cold start is the accepted cost. |
| D8 | Multi-tab correlation in scope for v1. | P | LOCKED | No | Data plumbing is small once `principalId` is in awareness; foundational for future team-mode features. | Session 1 | `usePresence()` aggregation gains a dedupe pass; cursors stay per-clientId. |
| D9 | Awareness does NOT carry `display_email`. | T | DIRECTED | No | Email is more identifying than name; not needed for presence display; reduces broadcast surface. | Session 1 | Email stays server-only (shadow-repo authoring, Co-Authored-By). |
| D10 | Adding `principalId?: string` to `AwarenessUser` is a **low-stakes 1-way wire-format door**. The field is optional, so a future removal is non-breaking for consumers that handle missing-field gracefully. | T | LOCKED | Yes (low-stakes) | Wire-format additions are observable to every connected peer + WebSocket observer. The trust model is documented in §6 NFR Privacy. | DC3 (audit) | Implementers must NOT break the optional contract by changing `principalId?: string` to `principalId: string` in a future change without re-spec. |
| D11 | Synthesized users do NOT publish `principalId`. Cross-browser-profile dedupe was creating a name-flicker on reconnect (different localStorage random names, lowest-clientId tie-break). Only git-config users participate in dedupe. | P | LOCKED | No | Synthesized users render per-tab (today's behavior). Multi-tab dedupe is a feature for users with git config; it's neutral for users without. | DC6 (audit) | Single-browser-profile synthesized users still see N copies of the same animal name (same as today, since localStorage is shared). |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Should `colorFromSeed` accept a palette argument or grow a `colorFromSeedHuman` sibling? | T | P0 | No | Implementer judgment call (DELEGATED). Both are fine; palette argument is cleaner. | Open |
| Q2 | localStorage key strategy: bump to v3 vs repurpose v2 with new semantics? | T | P0 | No | Implementer judgment call (DELEGATED). Bump to v3 is cleaner — no risk of misinterpreting an old v2 value. | Open |
| Q3 | Should we publish `principal.source` on awareness so peers can see "this is a synthesized identity" indicator? | P | P2 | No | Probably not — private detail; presence consumers don't need it. Confirm during implementation review. | Deferred |
| Q4 | Does the SourceEditor's parallel `setLocalStateField` effect need the same treatment? | T | P0 | No | **Resolved** — investigated: SourceEditor only sets `setLocalStateField('mode', ...)`, not `'user'`. TiptapEditor is mounted eagerly per `EditorActivityPool` ([EditorArea.tsx:188](../../packages/app/src/components/EditorArea.tsx:188)) and is the sole user-publication site. No shared hook needed. | Resolved |
| Q5 | What about Playwright E2E tests that hardcode "Curious Squirrel"-style assertions? | T | P0 | No | **Resolved** — grep across `packages/` for `Curious\|Squirrel\|Turtle\|Adjective` returned zero matches in test code. `PresenceBar.test.ts` only tests `WRITING_PULSE_MIN_MS` constants. No test cleanup needed. | Resolved |
| Q6 | `tabId` on `AwarenessUser` is dead data — set in TiptapEditor.tsx:649 but never consumed by any peer. Should we remove it? | T | P2 | No | Out of scope for this spec — separate cleanup. Noted in Future Work. Keeping it preserves wire-compat for any external observer. | Deferred |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `/api/principal` always returns within ~100ms on localhost. | HIGH | Direct evidence — server reads a single small JSON file. | Verified | Active |
| A2 | No production users have customized `ok-user-name-v2` localStorage to a value they want to keep. | HIGH | User direction — pre-launch state. | Confirmed | Active |
| A3 | `simpleGit` `user.name` reads do not cross-talk with shadow-repo writes (which already use the same machinery in `principal.ts` + `shadow-repo.ts`). | HIGH | Existing test `principal.test.ts` covers the read path. | Verified | Active |
| A4 | Awareness change events (re-publish on principal arrival) reach all peers promptly. | HIGH | Y.js awareness has no client-side debounce ([use-presence.ts](../../packages/app/src/presence/use-presence.ts) inspection: only the per-doc `change` event handler + 1Hz TTL tick); updates broadcast on each `setLocalStateField` call. The prose IS the verification. | Verified | Active |

## 13) In Scope (implement now)

- **Goal:** Real names + multi-tab dedupe + deterministic color in the human presence bar; zero regression for synthesized-source users.
- **Non-goals:** §3 NG1-NG6.
- **Requirements:** §6 FR1-FR12.
- **Proposed solution:** §9.
- **Owner(s)/DRI:** miles@inkeep.com.
- **Next actions:**
  1. Add `principalId?: string` to `AwarenessUser` in [packages/core/src/types/awareness.ts](../../packages/core/src/types/awareness.ts).
  2. Refactor `colorFromSeed` to accept a palette parameter (Q1) in [packages/core/src/utils/identity.ts](../../packages/core/src/utils/identity.ts).
  3. Add `computeInitials(name: string): string` helper to `packages/core/src/utils/identity.ts` (FR13).
  4. Add `PrincipalSchema` (Zod) to [packages/core/src/schemas/api.ts](../../packages/core/src/schemas/api.ts) mirroring `ServerInfoResponseSchema` (FR8b).
  5. Lift principal fetch result into `useState<Principal | null>` in [DocumentContext.tsx:363](../../packages/app/src/editor/DocumentContext.tsx:363); switch the existing `as { id?: unknown }` shape check to `PrincipalSchema.safeParse(...)`; expose `principal` in `DocumentContextValue`.
  6. Update [TiptapEditor.tsx:641](../../packages/app/src/editor/TiptapEditor.tsx:641)'s awareness effect to also consume `useDocumentContext().principal` and merge per FR3 (explicit object shape; no `...identity` spread that could drop `type` or `coeditor`). Add `principal` to the effect's dependency array.
  7. Update `usePresence()` aggregation in [packages/app/src/presence/use-presence.ts](../../packages/app/src/presence/use-presence.ts) to dedupe humans by `principalId` (FR4 eligibility rule). Add `tabCount: number` to `HumanParticipant`. Update `participantsEqual` to compare `tabCount`.
  8. Update `HumanAvatar` in [PresenceBar.tsx:62](../../packages/app/src/presence/PresenceBar.tsx:62): render initials via `computeInitials(user.name)`; gate animal-icon lookup on `principal.source === 'synthesized'` (or `null`) per D1; tooltip suffix `· N tabs` when `tabCount > 1`.
  9. Bump localStorage keys to v3 (or repurpose v2) — Q2 implementer call.
  10. Update / add tests:
     - Unit test for `colorFromSeed(seed, palette)` against HUMAN_COLORS and AGENT_COLORS.
     - Unit test for `computeInitials` against representative formats: `miles-kt-inkeep`, `Miles Kaming-Thanassi`, `Miles`, `MilesKT`.
     - Unit test for `PrincipalSchema` parse / parse-failure.
     - Unit test for `usePresence` dedupe by `principalId` with tie-break by lowest `clientId`; assert `tabCount`.
     - Integration test: two clients with same `principalId` → one `HumanParticipant`, `tabCount === 2`.
     - Integration test: tooltip count updates when a sibling tab connects/disconnects (guards FR4 `participantsEqual` regression).
     - Test for FR12: `user.coeditor` preserved in awareness under each FR3 state.
     - Test for FR3: `user.type === 'human'` mandatory in payload across all states.
     - Update [identity.test.ts](../../packages/core/src/utils/identity.test.ts) for the new `colorFromSeed` signature.
- **Risks + mitigations:** §14.
- **What gets instrumented/measured:** One `[principal-fetch]` warn on fetch failure; otherwise zero new instrumentation. QA verification covers the visual checks.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Existing developer's `ok-user-name-v2` localStorage values | Bump to v3 — old key ignored on first read | Manual: open OK with stale v2 in storage; confirm fresh principal-derived identity appears |
| Server-version skew (older server returning slightly different `Principal` shape) | Zod parse at the fetch boundary, fall back to random on parse failure | Unit test for parse failure path |
| Boot race: principal arrives mid-edit | Awareness change events propagate the upgrade; peers see name change live | Multi-client integration test |
| First-paint flicker | Accept for v1 (NG6) | QA in dogfood; if user-visible, revisit per NG6 trigger |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| First-paint flicker from random → real-name swap is jarring | Low | Low | Accept for v1. Concrete revisit trigger (NG6): dogfood QA reports flicker, OR `/api/principal` p99 fetch latency exceeds 200ms in dev. | Implementer |
| `principalId` published to peers — forgery surface if non-loopback path emerges | Low | Low (today) / Medium (post team-mode) | Trust model documented in §6 NFR Privacy. Loopback-only is the v1 perimeter; non-loopback is the explicit revisit trigger for server-authoritative attribution. | n/a (v1) |
| Multi-tab dedupe collapses humans who shouldn't be deduped | Very low | Medium | Dedupe key requires `source === 'git-config'` (FR9 doesn't publish for synthesized) AND non-empty `principalId`. Different machines have different `principal.id`s. Same-machine multi-human is explicit non-goal (P2 caveat). | n/a |
| Hardcoded animal-name assertions in tests break | None | n/a | Resolved Q5 — zero matches in test code. | n/a |
| `colorFromSeed` palette refactor breaks agent color stability | Low | Medium | Existing single-arg callers must continue to default to AGENT_COLORS. Unit test pins both palettes. | Implementer |
| `usePresence` `participantsEqual` not updated to compare `tabCount` → tooltip count goes stale | Medium | Low | Test asserts tooltip count updates when a sibling tab connects/disconnects (FR4 acceptance criterion). | Implementer |
| Implementer drops `type: 'human'` from awareness payload by writing the merge as `...identity` spread | Medium | High (peers skip the entry entirely) | FR3 explicitly mandates `type: 'human' as const` in all three states. §9 pseudo-code shows the explicit shape. Test asserts `user.type === 'human'` on the published state. | Implementer |

## 15) Future Work

### Explored
- **Config flag `presence.useGitIdentity: false`** for users who don't want real-name broadcast.
  - What we learned: No production users today; no shared-content scenarios in the wild; OK is local-loopback-only.
  - Recommended approach: Add `presence.useGitIdentity` to `.open-knowledge/config.yml` with hierarchical precedence (flags > env > workspace > user > defaults, per CLI's existing config model). When `false`, skip merging `display_name` and `display_email` into awareness; fall back to random animal-adjective even when git config is present. `principalId` and color derivation can stay (they don't reveal real-world identity).
  - Why not in scope now: Speculative — no user has asked. Adding it speculatively bloats the surface.
  - Triggers to revisit: Any user reports a privacy concern; multi-tenant or shared-content-dir scenarios emerge; Open Knowledge starts shipping team-mode features.
  - Implementation sketch: One config key; one branch in the awareness-merge logic; one docs paragraph.

### Identified
- **In-app "rename my presence" UI.**
  - What we know: Today there's no such UI; localStorage is set programmatically only. Users who want a different display name have no path beyond editing localStorage by hand or running `git config user.name "..."` and reloading.
  - Why it matters: Power users may want a screen name distinct from their git config (privacy, persona, fun).
  - What investigation is needed: Where in the app does this UI surface? Right-click on own avatar? A settings dialog? How does it interact with multi-tab dedupe (per-tab override or per-principal)? Does it persist server-side (so it follows the principal across machines) or stay client-only (localStorage)?

- **Multi-tab UX: tab navigation popover.**
  - What we know: With `principalId` deduping, the bar knows about N tabs of one user; today the only signal is the tooltip count.
  - Why it matters: Users with many tabs lose track of which tab is editing what; the avatar could be a click-target opening a popover listing the tabs and their docs.
  - What investigation is needed: Same affordance pattern as the agent activity panel? Reuse `OverflowChip`-style popover? How to identify each tab to the user (tab title, current doc, last-active timestamp)?

### Noted
- **First-paint flicker mitigation via principal cache** — store resolved name/color in localStorage; warm starts skip flicker. NG6.
- **Avatar image (gravatar / GitHub avatar)** — explicit NEVER for v1. NG3.
- **Mid-session live refresh on git-config change** — NG4.
- **`tabId` on `AwarenessUser` is dead data** — set in [TiptapEditor.tsx:649](../../packages/app/src/editor/TiptapEditor.tsx:649) but no peer consumes it. Auth-token side uses a separate `tabSessionId` that's already wired correctly. Either remove the field or document a future consumer. Out of scope for this spec; cleanup candidate.

## 16) Agent constraints

- **SCOPE:**
  - `packages/core/src/types/awareness.ts` (add `principalId?: string` field)
  - `packages/core/src/utils/identity.ts` (palette parameter on `colorFromSeed`; new `computeInitials` helper)
  - `packages/core/src/utils/identity.test.ts` (update for new signatures; add `computeInitials` cases)
  - `packages/core/src/schemas/api.ts` (add `PrincipalSchema`)
  - `packages/app/src/editor/DocumentContext.tsx` (lift principal fetch result into state, expose in context value, switch shape check to `PrincipalSchema.safeParse`)
  - `packages/app/src/editor/TiptapEditor.tsx` (consume principal from context, merge into `setLocalStateField('user', ...)` per FR3 — explicit object shape, no spread)
  - `packages/app/src/presence/use-presence.ts` (dedupe by `principalId`; add `tabCount` to `HumanParticipant`; update `participantsEqual`)
  - `packages/app/src/presence/use-presence.test.ts` (or new file — dedupe + `tabCount` coverage)
  - `packages/app/src/presence/PresenceBar.tsx` (use `computeInitials`; gate animal-icon on `source`; tooltip with tab count)
  - `packages/app/tests/integration/` (new test file — multi-tab dedupe + principal-arrival + tooltip-count regression)
- **EXCLUDE:**
  - `packages/server/src/principal.ts` and `packages/server/src/api-extension.ts` (server side already correct; no changes)
  - Shadow-repo / authorship paths (orthogonal; already use principal correctly)
  - Agent presence (`packages/server/src/agent-presence.ts` and the `__system__` doc) — agents are separate from human presence
  - `packages/app/src/editor/SourceEditor.tsx` (only sets `mode`, never `user` — Q4 resolved)
  - `packages/app/src/editor/tab-identity.ts` (frozen `tabSessionId`; do not modify)
  - `packages/app/src/editor/provider-pool.ts:setTabIdentity` and the auth-token claim shape (change requires re-spec)
  - `coeditor` query-param plumbing (preserve unchanged; FR12 pins it)
  - `tabId` field on `AwarenessUser` (set but never consumed by any peer — Q6 deferred to Future Work)
- **STOP_IF:**
  - Implementation requires changing `Principal` type or adding new server endpoint — re-spec required.
  - Awareness wire format change beyond adding `principalId?: string` to `AwarenessUser` — re-review.
  - Touches `setTabIdentity` / `provider-pool.ts` auth-token logic — out of scope; reach out before changing.
  - Discovers a current production user with `ok-user-name-v2` value they care about — re-review migration approach.
- **ASK_FIRST:**
  - Adding any new `console.warn` / metric beyond the single `[principal-fetch]` log line.
  - Any change to `colorFromSeed`'s default behavior (existing callers must continue to work unchanged).
  - Modifying `setTabIdentity` or the auth-token claim shape.
