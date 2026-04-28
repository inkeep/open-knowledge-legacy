# Design Challenge Findings

**Artifact:** specs/2026-04-27-principal-identity-in-presence/SPEC.md
**Challenge date:** 2026-04-27
**Total findings:** 8 (3 high, 4 medium, 1 low)

---

## High Severity

### [H] Finding 1: Server-authoritative awareness write avoids the React-state lift, the boot-race fallback, the Zod schema, and the localStorage migration entirely

**Category:** DESIGN
**Source:** DC1
**Location:** §9 Architecture overview; §10 D7 (Architecture: keep `getIdentity()` sync); Alternatives considered (none of A/C/D explore server-side awareness writes)
**Issue:** The Decision Log evaluated four client-side architectures (current FR3 path; Option A make `getIdentity()` async; Option C eager pre-fetch blocking; Option D inject principal into HTML) and rejected all but FR3. None of them considered the architecture the server already uses for *agents*: the server holds a DirectConnection on each doc, holds the principal record at boot, and writes awareness state directly. The client never has to fetch, never has to lift, never has to merge.

**Current design:** "Lift the existing principal fetch into React state, plumb it through `DocumentContext` to the awareness publication site, and prefer `display_name` over the random fallback when `source === 'git-config'`. Color is seeded deterministically from `principal.id` for cross-tab/cross-machine consistency."

**Alternative — server writes principal-derived fields onto each tab's awareness state at `onAuthenticate` time:**
1. The server already parses `principalId` from the auth token at `onAuthenticate` (`packages/server/src/standalone.ts:361-372`).
2. At the same site where it sets `ctx.principalId = loadedPrincipal.id`, it can additionally call `awareness.setLocalState({ ...existing, user: { name: loadedPrincipal.display_name, color: colorFromSeed(loadedPrincipal.id, HUMAN_COLORS), type: 'human', principalId: loadedPrincipal.id } })` on the per-doc DirectConnection (the same machinery `AgentPresenceBroadcaster` uses to write the agent map at `packages/server/src/agent-presence.ts:242`).
3. The client's TiptapEditor stops publishing user fields entirely (or publishes only the random fallback when `setLocalState` arrives empty — i.e. unauthenticated / synthesized).
4. `usePresence()` dedupes on `principalId` exactly as the spec specifies.

**Trade-off:**
- **Gained:**
  - No boot-race flicker (the spec accepts as NG6 / FR3 state-(a)). The server resolves principal *before* awareness is broadcast, eliminating the random→real-name swap.
  - No `PrincipalSchema` Zod schema needed (FR8b deletes itself; the wire shape is already `HocuspocusAuthToken` which is already Zod-parsed).
  - No `DocumentContext` plumbing change. No `principal` field on `DocumentContextValue`. No new `useState`.
  - No localStorage migration concern for principal-derived fields (D2 partially deletes itself; only the random-fallback `ok-user-name-v2` matters, and only for synthesized users).
  - Aligns with the precedent #3 / agent-presence pattern explicitly: "agents publish via the `__system__` agentPresence map, not per-doc awareness." Inverting to "server writes user fields onto per-doc awareness" sounds dissonant — but the server already writes presence state for agents (`AgentPresenceBroadcaster`), and the rationale in `awareness.ts:35-46` is specifically about cross-agent stomping (multi-agent on a shared `__system__` clientID), not server→per-doc-awareness writes for humans, where exactly one human owns one clientID.
- **Lost:**
  - Server has to know how to compute `colorFromSeed(id, HUMAN_COLORS)`. The function already lives in `packages/core/src/utils/identity.ts` (browser+Node compatible) and is already imported by `packages/server` via `@inkeep/open-knowledge-core`. Zero new dep.
  - Server-to-awareness write timing: the spec's flicker concern moves from "client fetches and re-publishes" to "server publishes on connect." On a reconnect, the server can write awareness *before* the y-protocols sync handshake completes. This is exactly the same pattern `AgentPresenceBroadcaster.setPresence` uses today.
  - The `coeditor` URL query-param can no longer be plumbed into awareness from the server (since the URL is client-only). Acceptable — `coeditor` is a sticky tag for telemetry, not a presence-bar surface. The spec already preserves it unchanged in FR12 (Could) but doesn't claim it ever rendered to anyone.
- **Net:** Removes ~80 of the spec's claimed ~30 lines of net code (the FR8b schema, the FR1 lift, the FR3 effect re-fire, the FR8 silent-fallback path), and eliminates all three states in FR3 (no race, no synthesized-vs-git-config branching at the client, no fallback path).

**Status:** CHALLENGED
**Suggested resolution:** Re-examine D7 with this alternative explicitly enumerated. The Decision Log records four rejected client-side architectures; this is a server-side architecture that wasn't considered. The rejection rationale for D7 ("brief first-paint flicker on cold start is the accepted cost") is exactly the symptom this alternative eliminates. The spec's "Alternatives considered" §9 should either rebut this option on technical grounds (e.g. "we want the source of truth to remain the localStorage-backed identity for offline-first scenarios" — but the loopback server is always-on by definition) or accept this as the actual chosen path.

---

### [H] Finding 2: Privacy posture leaves a one-way data flow open while leaning on "no shared-content scenarios today" — but the same `principalId` already flows on the auth-token path that *is* visible to peers via Y.js sync

**Category:** DESIGN
**Source:** DC2 (security/privacy stakeholder)
**Location:** §3 NG1 ("config flag deferred — no shared-content scenarios today"); §6 Privacy ("`display_email` is **not** published to awareness"); §14 R2 (`principalId` privacy regression "Likelihood: Low, Impact: Low")

**Issue:** The spec frames privacy as "loopback Hocuspocus only, no external network egress beyond what already happens" and defers the opt-out flag (NG1) on the basis that "no shared-content scenarios in production today." Two concerns:

1. **The threat model isn't only "external network egress."** It's "what does the server broadcast to every connected peer of this doc?" Once `display_name` lives in `awareness.user.name`, it's broadcast to every WebSocket peer of every doc the user opens — not just the user's own tabs. Today `coeditor` URLs in agent-sim and `?coeditor=cursor` flows mean other processes (Claude Code, Cursor) connect as peers. Tomorrow's "two devs on the same shared content dir over Tailscale" or "team-mode features" (explicitly named as a trigger in the Future Work block) inherits this default-on without any user choice. The opt-out is being deferred at exactly the moment the surface is being established — i.e. the worst time to defer it from a precedent perspective, because users/integrators will start to depend on the new behavior.

2. **`display_email` exclusion is undermined by FR8b's `.loose()` contract.** §6 Privacy says "`display_email` is **not** published to awareness — only used server-side." But the spec also adds `PrincipalSchema` with `.loose()` (FR8b mirrors `ServerInfoResponseSchema` per the §13 next-actions item 3). `.loose()` preserves unknown fields; combined with a future server change that adds e.g. `display_avatar_url` or a new field, the *client* will pass it through to the awareness merge unchanged unless the merge is explicitly allowlist-shaped. The FR3 spec uses spread-merge syntax (`...principal && source==='git-config' ? { name: ..., color: ... } : {}`) which is allowlisted, so this is okay *today*. But the precedent set by lifting the full `Principal` into context state primes the next change to "just add it to the bag." Having the client never see `display_email` (Finding 1's server-write architecture) eliminates the risk surface entirely.

**Current design:** "**[NOT NOW]** NG1: User-facing config flag to suppress git-identity broadcast (`presence.useGitIdentity: false`). Revisit if/when shared-content-dir scenarios emerge or any user reports privacy concern."

**Alternative — ship the config flag now (the implementation sketch in §15 Future Work / Explored estimates "one config key; one branch in the awareness-merge logic; one docs paragraph"):**
- Cost: ~10-15 LOC + a paragraph in `packages/cli/src/content/init.ts`'s starter config.yml comment block. The cost is dramatically smaller than the spec's "speculative — no user has asked" framing implies.
- Benefit: Default-on with an opt-out is more auditable than "we'll add the opt-out later." An auditor today can read NG1 and conclude "this is shipping with no off-switch"; an auditor with the flag in place can read "default on, opt out via config.yml" and the conclusion is "documented user choice." The two are observably different from a privacy review angle.
- Cost of *adding it later*: every existing client install that has been broadcasting `display_name` for N weeks. The user direction "no production users today" makes the cost of adding the flag now exactly zero (no migration); deferring inverts that cost.

**Trade-off:**
- **Gained:** Default-private-by-default OR default-public-with-opt-out are both clearly stated; neither is "TBD." Privacy reviewers / future audit have a single decision to confirm rather than "where is the flag we said we'd add?"
- **Lost:** ~10-15 LOC of additive surface and a config docstring.

**Status:** CHALLENGED
**Suggested resolution:** Ship the flag now with a default. The choice the user must make is: default `useGitIdentity: true` (privacy-permissive) or default `useGitIdentity: false` (privacy-conservative). The user direction "no shared-content scenarios" is a reason to default `true`, not a reason to omit the flag. This is also a 1-way door at the precedent level: the first version that ships without a flag teaches every downstream integrator that the broadcast is unconditional.

---

### [H] Finding 3: The Complication ("data is one `.then()` away") understates the actual change — the spec recommends a public-API change (`AwarenessUser` gains `principalId`) which is a 1-way wire-format door, but classifies all decisions as "1-way door? No"

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §10 Decision Log (D1-D9 all marked "1-way door? No"); §6 FR2 ("`AwarenessUser` type adds `principalId?: string`"); §16 Agent constraints SCOPE (`packages/core/src/types/awareness.ts`)

**Issue:** Adding `principalId` to `AwarenessUser` changes the wire format of every Y.js awareness frame the server broadcasts to every peer. This is observable to:
- Every connected client of every doc (via awareness updates).
- Any external observer of the WebSocket frames (e.g. analytics, MCP keepalive WS, Playwright test harness's `awareness.getStates()` introspection).
- The shadow-repo writer attribution path that already keys off `principalId` from the auth token — these are now two channels for the same value, with no contract that they stay in sync. (Server reads from token; client publishes to awareness; spec doesn't say "server should validate awareness.principalId === ctx.principalId" or "server should overwrite awareness.principalId from ctx.principalId.")

The spec's framing — "the data needed for human-readable presence is sitting on the client one `.then()` away" — is locally true but masks that the *publication* of that data to peers is what changes the contract. The `.then()` describes a pure code-level rearrangement; what actually ships to wire is a new field in awareness.

**Current design:** "Add `principalId` to `AwarenessUser` so `usePresence()` can dedupe humans across tabs into one avatar with a tab-count tooltip."

**Alternative framings that materially change the design:**
- **Option α (server-authoritative, see Finding 1):** `principalId` is on awareness because the server wrote it there, not the client. Wire change is the same, but the trust model is "server says this is the principalId" rather than "client claimed this is the principalId." This matters because today the auth-token path already has the server *validate* the claimed `principalId` against the loaded principal record (`standalone.ts:362-372` — mismatch logs `principal-token-mismatch` and omits the field). The awareness publication path the spec proposes has *no* such validation; a malicious or stale client could publish any string as `principalId` and peers would dedupe accordingly.
- **Option β (clientId-keyed dedupe via a side channel):** Don't change `AwarenessUser` at all. Add a server-broadcast map `clientToPrincipal: Record<clientId, principalId>` on `__system__` awareness, written by the server in `onAuthenticate`. Client computes dedupe groups from `usePresence` by looking up `activeAwareness.clientId → principalId` via the system map. Wire change is additive on `__system__`, not on every doc's awareness. This isolates the new field to one specialized doc that already carries similar metadata (`agentPresence`, `agentFocus`).

**Trade-off:**
- **Gained (over current spec):** The 1-way door is acknowledged; the design accounts for the trust model (who writes `principalId` — server or client?); the wire-format scope is bounded (one doc vs every doc).
- **Lost:** Marginal additional plumbing for option β (a new `__system__` field + reader); option α is strictly simpler than the spec.

**Status:** CHALLENGED
**Suggested resolution:** Reclassify FR2 / D7 / D8 as 1-way doors and revisit the trust model. Specifically: who is authoritative for `principalId` on awareness — the client (today's spec) or the server (Finding 1's alternative)? If the answer is "client," document the threat model where a stale or malicious client publishes a wrong `principalId` and dedupes another user's tabs (or splits their own). If the answer is "server," the spec collapses to Finding 1's design. The current spec's framing dodges this question by treating the change as a pure code-rearrangement.

---

## Medium Severity

### [M] Finding 4: First-paint flicker is described as "<50ms on localhost" but the spec contains no measurement and no acceptance criterion

**Category:** DESIGN
**Source:** DC2 (operations / SRE stakeholder)
**Location:** §6 Non-functional ("<100ms on localhost"); §3 NG6 ("the fetch is typically <50ms on localhost"); §14 R1 (Likelihood: Medium, Impact: Low, Mitigation: "Accept for v1")

**Issue:** Three different numbers appear (50ms, 100ms, "sub-100ms") with no measurement evidence cited. The spec acknowledges flicker is a real risk (R1, Medium likelihood) but mitigates by "accept for v1" without a verifiable threshold. The acceptance criterion in FR3 is "Effect re-fires when principal arrives → peers see the upgrade" — which is a code-level assertion, not a UX-level one. There's no test condition that says "first paint within X ms shows the resolved name" or "if the swap exceeds Y ms, file as a bug."

The risk this surfaces: A "Medium likelihood, Low impact" risk in a spec that's about replacing a naming convention has fairly tight UX coupling — the entire user-facing change is "real name appears in presence bar." If the swap is visible (200-500ms on a slow machine, a cold IndexedDB warmup, an under-load Hocuspocus boot), the feature looks broken on the first paint. The user reports "it shows Curious Squirrel for a moment when I refresh" and the fix is either Finding 1 (server-side) or NG6 cache.

**Current design:** "First-paint flicker on cold start is the cost of architecture B. Target <100ms on localhost (single fetch, already in flight at mount). No measurable cost on warm tab navigation."

**Alternative:** Either (a) cache the resolved name/color in localStorage on the v2/v3 keys (NG6) — flicker eliminates on every reload after the first. Or (b) Finding 1's server-side write — flicker eliminates always.

**Trade-off:** (a) costs ~10 LOC for an additional cache write; the spec's stated reason for declining ("acceptable for v1 given the fetch is typically <50ms on localhost") is a design opinion that the user is asked to confirm without empirical verification. (b) collapses to Finding 1.

**Status:** CHALLENGED
**Suggested resolution:** Either add a measurement (Playwright test asserting first-frame DOM content for the avatar tooltip) and a numerical acceptance criterion, or pre-implement NG6 (a few LOC of localStorage caching). The "accept for v1" path is reasonable only if the QA pass actually checks; the spec doesn't list a flicker check in §13 next-actions tests.

---

### [M] Finding 5: `usePresence`'s 1Hz TTL tick + spread tooltip count creates a spurious re-render path the spec doesn't address

**Category:** DESIGN
**Source:** DC2 (frontend performance / customer-facing engineer stakeholder)
**Location:** §9 Enforcement points ("`usePresence()` aggregation (dedupe)"); §6 FR4 ("Tab count = number of collapsed entries")

**Issue:** Today's `usePresence` uses `participantsEqual` to short-circuit `setState` when nothing changed (see `packages/app/src/presence/use-presence.ts:70-97` — the function compares `name`, `color`, `icon`, `mode` and explicitly skips `presence.ts` because timestamps shift). Adding `principalId` dedupe + tab count means `participantsEqual` must also compare tab count for each deduped human entry. If `participantsEqual` isn't updated, every awareness change in any tab (say, a cursor-mode flip from `wysiwyg` to `source` in tab B) will appear as "no participant difference" in the tab-count comparison and the bar won't re-render to update the tooltip. Conversely, if `participantsEqual` over-compares, the 1Hz tick will spuriously re-render whenever a tab count is computed off a slightly stale awareness map.

The spec's FR4 says "exactly one `HumanParticipant` is emitted" — but doesn't specify the shape of `HumanParticipant` post-dedupe. Does it grow a `tabCount: number` field? If so, every dedupe pass at 1Hz produces a fresh number; React's bail-out logic in `usePresence` (the participantsEqual guard) needs an explicit branch.

**Current design:** "Update `usePresence()` aggregation in [packages/app/src/presence/use-presence.ts] to dedupe humans by `principalId`. Track tab count for tooltip."

**Alternative:** Specify the post-dedupe shape explicitly: either (a) tab count lives on `HumanParticipant` and `participantsEqual` adds a tabCount comparison, or (b) tab count is computed at render time in `HumanAvatar` from a map of `principalId → clientId[]` exposed alongside the deduped list. (b) is more decoupled.

**Trade-off:** Specifying now avoids a re-render bug that's hard to detect because it's a "tooltip is stale" issue, not a crash.

**Status:** CHALLENGED
**Suggested resolution:** §6 FR4 should explicitly state the data shape `usePresence` returns post-dedupe (e.g. add a `tabCount: number` to `HumanParticipant` and document the `participantsEqual` change), and §13 should add a test that asserts the tooltip count updates when a sibling tab connects/disconnects.

---

### [M] Finding 6: Tie-break "lowest clientId" for cross-profile synthesized-user dedupe is presented as acceptable but is observably non-deterministic across reloads

**Category:** DESIGN
**Source:** DC2 (customer-facing engineer stakeholder)
**Location:** §6 FR4 ("Tie-break for which entry's `name`/`color` wins: lowest `clientId` (deterministic)"); §6 FR4 Notes ("Edge case: cross-browser-profile synthesized users (rare) share `principalId`")

**Issue:** Y.js `clientId` is randomly generated per Y.Doc instance, not stable per browser profile. Two browser profiles connecting to the same doc get fresh clientIds on every connect; the "lowest clientId wins" tie-break therefore produces a different "winning" name on every reconnection cycle. For the cross-profile synthesized-user edge case, this means: profile A and profile B both share a synthesized `principalId` (because the client-side principal fetch returns the same server-issued `principal-<UUID>`), each profile's localStorage holds its own random `Adjective Animal` name, and on every page load the displayed name flips between profile A's and profile B's random name. The tooltip count is right ("· 2 tabs") but the name is wrong half the time.

This is described as "acceptable — not a regression vs. today (where they'd render as 2 separate entries)." That's true for the rendered count but creates a *new* UX failure mode: today users see "Curious Squirrel" + "Brave Mouse" and know "those are two of me"; under the spec they see "Curious Squirrel · 2 tabs" half the time and "Brave Mouse · 2 tabs" the other half — i.e. a name that flickers across reconnects.

The deeper issue: the `principalId` for a synthesized user is identical across profiles for the *same* `<contentDir>`. That means *any* two browsers (Chrome + Firefox + Safari + Brave) on the same machine pointed at the same OK content dir will all share `principalId` and dedupe — but each generated its own animal-adjective in its own localStorage. Single-machine multi-browser is not "rare"; it's the standard developer setup.

**Current design:** "Edge case: cross-browser-profile synthesized users (rare) share `principalId` but each profile generates its own random animal-adjective in localStorage. Dedupe still applies; deterministic tie-break picks one name to display. Acceptable — not a regression vs. today."

**Alternative:** For synthesized users (`source === 'synthesized'`), DO NOT publish `principalId` to awareness. The dedupe across profiles is unwanted (different humans' browsers). Single-human multi-tab dedupe still works for git-config users; synthesized users keep today's per-clientId rendering.

**Trade-off:**
- **Gained:** No name-flicker on reconnect for the multi-browser edge case. Name stays per-tab, which is what users see today.
- **Lost:** The G2 promise ("eliminate visual duplication when one human has multiple tabs of the same document open") doesn't hold for synthesized-source users with multiple tabs. This was already accepted in P3 ("Identical to today — random animal-adjective name") so it's consistent with the rest of the spec.

**Status:** CHALLENGED
**Suggested resolution:** §6 FR9 should NOT publish `principalId` for synthesized users — it's currently spec'd to "still publish — multi-tab dedupe works for synthesized users too" but the dedupe is observably wrong across profiles. Synthesized users should fall through to today's per-clientId rendering entirely.

---

### [M] Finding 7: The Resolution doesn't follow from the Complication for the `?coeditor=` URL query-param flow

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §1 Complication ("solo developers see 'Curious Squirrel' for their own avatar; pair-coding sessions force participants into a tooltip-hover dance"); §6 FR12 ("`coeditor` query-param plumbing is preserved unchanged")

**Issue:** The spec's Complication frames the pain as: solo developer sees random name; pair-coding forces tooltip-hover. The `?coeditor=cursor` URL flow is exactly the pair-coding case (one dev on Cursor, one on Claude Code, both opening the OK editor in their respective IDEs' embedded webviews). FR12 preserves `coeditor` unchanged — meaning the query-param's existing role as "sticky tag for which IDE the human is in" doesn't get plumbed into the presence-bar tooltip. So in the canonical pair-coding case, the user *still* sees "Miles Kaming-Thanassi" and "Miles Kaming-Thanassi · 2 tabs" — and not "Miles (Claude Code)" or "Miles (Cursor)." The IDE distinction that today's `coeditor` URL captures is invisible.

This isn't a fatal flaw — the names ARE more legible than before. But the framing claims "pair-coding sessions force participants into a tooltip-hover dance" and then doesn't address that the same dance is required to figure out "is this Miles-from-Claude-Code or Miles-from-Cursor." The Resolution as written solves a single-IDE pair-coding case (two humans, same tool) and not the multi-tool case (one human, two IDEs, or two humans, two IDEs).

**Current design:** "`coeditor` query-param plumbing is preserved unchanged. Existing `?coeditor=...` URL param continues to flow through `getIdentity()` → awareness with no behavior change."

**Alternative:** Either (a) widen the Resolution's scope to include `coeditor` in the tooltip ("Miles Kaming-Thanassi · Cursor"), or (b) acknowledge the multi-IDE case is out of scope and adjust the Complication framing (drop "pair-coding sessions" or specify "pair-coding within the same IDE"). (a) is ~5 LOC; (b) is a one-line edit.

**Trade-off:**
- **Gained:** Framing matches what the spec actually delivers.
- **Lost:** Either a small additive feature or a small narrative trim.

**Status:** CHALLENGED
**Suggested resolution:** Tighten §1 Complication to match the Resolution's actual scope, or expand FR3 to include `coeditor` in the tooltip when present. Today's framing creates a narrative gap that an audit reader will notice ("but you said pair-coding").

---

## Low Severity

### [L] Finding 8: Initials computation is not robust to common git config formats

**Category:** DESIGN
**Source:** DC2 (customer-facing engineer stakeholder)
**Location:** §5 P1 ("Avatar shows 'MK' initials"); existing `HumanAvatar` initials code: `user.name.split(' ').map((w) => w[0]).join('')` (`PresenceBar.tsx:64-67`)

**Issue:** The actual project's `principal.json` (verified at `.open-knowledge/principal.json`) holds `display_name: "miles-kt-inkeep"` — a single-word, lowercase, hyphen-separated git username. The initials computation `name.split(' ').map((w) => w[0]).join('')` produces `"m"` (single lowercase letter), not `"MK"`. The spec's example "MK" assumes a specific naming convention (`First Last`) that's not enforced by `git config user.name` and isn't actually true for the spec author's own repo.

Common git config patterns the initials code handles poorly:
- `miles-kt-inkeep` → `m`
- `Miles K-T` → `MK` (works)
- `mileskt` → `m`
- `Miles` → `M`
- `Miles K. T.` → `MKT` (works)
- `MilesKT` (camelCase) → `M`
- `贺岁` (CJK) → first character of each word; depends on whitespace tokenization

For a feature whose entire user-facing change is "show readable initials in the avatar," lowercase single-letter renderings ("m" on a pastel circle) are arguably worse-looking than the random animal icon they replace.

**Current design:** "Avatar shows 'MK' initials with deterministic teal color and tooltip 'Miles Kaming-Thanassi' — instead of a random squirrel."

**Alternative:** Initials computation should:
1. Uppercase whatever it produces.
2. Split on whitespace AND on common separators (`-`, `_`, `.`, camelCase boundary).
3. Cap at 2 characters.
4. Fall back to first 2 letters of the trimmed name when no separator found.

For the verified data: `miles-kt-inkeep` → split on `-` → `[m, k, i]` → take 2 → uppercase → `MK`. Or just use the first 2 letters: `mi` → `MI`. Either is more legible than `m`.

**Trade-off:** ~5 LOC change to one function in `PresenceBar.tsx:64-67`; better UX for the single most likely git-config format on macOS dev machines (`git config user.name "$USER"` produces a Unix username).

**Status:** CHALLENGED
**Suggested resolution:** Add a small `computeInitials(name: string): string` helper in `packages/core/src/utils/identity.ts` (alongside `colorFromSeed`) that handles the common formats and is unit-tested against representative git config values. The spec's §13 next-actions can include this as a sibling test to the `colorFromSeed` palette test.

---

## Confirmed Design Choices (summary)

The following design choices held up under DC1-DC3 scrutiny:

- **D5 (mid-session git config refresh deferred):** Stale-until-reload is genuinely fine for a UX-only cosmetic, and the rationale ("rare scenario; existing 'restart server, reload page' recovery suffices") matches the cost/benefit.
- **D6 (multi-tab UX: single avatar + tooltip count, no badge):** Cleanest default; user can upgrade later. Aligns with existing `OverflowChip` pattern. (Pluralization rule "no '1 tab' suffix" is correctly noted.)
- **D9 (no `display_email` on awareness):** Correct privacy posture; email is more identifying than name and not needed for presence. (See Finding 2 for a related concern about `.loose()` schemas, but the explicit field-allowlist in FR3 keeps this discipline.)
- **NG3 (no avatar images / gravatar):** Correct NEVER call — out of scope for local-first model.
- **D2 (localStorage migration: overwrite/ignore v2):** Correct given pre-launch state; user direction holds.
- **§16 SCOPE / EXCLUDE:** Boundaries are well-traced; SourceEditor exclusion (Q4) and `tabId` deferral (Q6) are sound.
