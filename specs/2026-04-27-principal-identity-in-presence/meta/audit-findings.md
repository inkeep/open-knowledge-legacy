# Audit Findings

**Artifact:** /Users/mileskaming-thanassi/open-knowledge/specs/2026-04-27-principal-identity-in-presence/SPEC.md
**Audit date:** 2026-04-27
**Total findings:** 11 (3 high, 5 medium, 3 low)
**Baseline commit verified:** e251f70b (matches `**Baseline commit:**` in SPEC.md — no codebase drift since baseline)

---

## High Severity

### [H] Finding 1: P2 (Pair coder) journey contradicts dedupe semantics — same-server pair coders share `principalId` and would collapse to one avatar

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L4 (evidence-synthesis fidelity)
**Location:** §4 Personas (P2), §5 User journeys (P2), §6 FR4, §15 Future Work

**Issue:** The spec defines P2 ("Pair coder / small team in shared sessions: two-to-three humans co-editing in real time on the same content dir") as a primary persona with a journey that explicitly shows "two distinct named avatars in the presence bar: 'MK' (Miles) and 'ND' (Nick)." But by the spec's own dedupe rule (FR4) and `loadPrincipal()`'s data model, two humans sharing a single content dir share **one** `principal.id` — there is exactly one `principal.json` per `<contentDir>/.open-knowledge/`, and it persists across boots. Whatever git config the server reads at boot becomes the single principal for everyone connecting to that server.

If pair coders share a server, FR4's dedupe collapses them into one avatar with tooltip "<one name> · 2 tabs" — not two distinct named avatars. The journey is unreachable under the proposed design + current architecture.

**Current text (§5 P2):**
> "**Aha moment:** Sees two distinct named avatars in the presence bar: 'MK' (Miles) and 'ND' (Nick). Tooltips confirm full names. Cursors are color-coded matching avatar colors."

**Current text (§15 Future Work):**
> "What we learned: No production users today; no shared-content scenarios in the wild; OK is local-loopback-only."

**Evidence:**
- `packages/server/src/principal.ts:32-98` shows `loadPrincipal()` reads/writes one `principal.json` per `contentDir`, with `id` and `created_at` immutable across boots and `display_name`/`display_email` derived from a single git-config read on the host machine. There is no per-user partitioning.
- The server publishes the single principal via `GET /api/principal` (api-extension.ts:3339, 5566) and every connecting client receives the same record.
- `packages/app/src/editor/tab-identity.ts:1-12` notes "Two tabs opening the same document will have distinct `tabSessionId` values but share the same `principalId`" — the architecture explicitly groups by principal regardless of how many humans drive those tabs.

**Status:** INCOHERENT

**Suggested resolution:** Either:
1. Reframe P2 to clarify the deployment model (e.g., "two humans on **separate checkouts** running their own `open-knowledge start` against shared content via some sync mechanism" — though this contradicts "OK is local-loopback-only" elsewhere), and add an explicit non-goal that single-server multi-human dedupe is a known wrong-direction collapse with a cited mitigation trigger.
2. Acknowledge that P2 is aspirational/future-state given OK's loopback-only architecture, and rewrite the journey to be solo-developer-only (consistent with §15).
3. Add an explicit risk row to §14: "Multi-human-on-same-server dedupe wrong-direction" with a real (not Low/Low) likelihood/impact, since this is the same root cause as the Low/Low row currently there but in the opposite direction. The current §14 row addresses cross-checkout (different `principal.id`) but not same-checkout-multi-human (same `principal.id`).

The spec needs to pick one and be internally consistent.

---

### [H] Finding 2: §9 architecture pseudo-code drops `type: 'human'` and over-publishes `principalId` during boot

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §9 Proposed solution (pseudo-code block), §6 FR3

**Issue:** The §9 architecture sketch shows the awareness `setLocalStateField` payload as:

```js
{
  ...identity (random fallback),
  ...(principal && source==='git-config' ? {
    name: principal.display_name,
    color: colorFromSeed(principal.id, HUMAN_COLORS),
  } : {}),
  principalId: principal?.id,
}
```

Two problems:
1. **Missing `type: 'human'`.** The current TiptapEditor.tsx:644-650 sets `type: 'human' as const` explicitly because `Identity` (packages/core/src/types/identity.ts) does not have a `type` field. A spread of `...identity` drops the `type` discriminator, which is mandatory on `AwarenessUser` (packages/core/src/types/awareness.ts:9 — `type: 'human'`). The `usePresence` hook at use-presence.ts:164 explicitly skips entries where `user.type !== 'human'`. Without `type` on the published payload, peers would skip the entry entirely.
2. **`principalId: principal?.id` always publishes the field, including as `undefined` during the boot race.** This contradicts FR3 case (a) which states "principalId omitted" when principal not yet resolved. FR4's dedupe rule keys on "non-empty principalId" — if `undefined` slips through, downstream code must filter, but the spec's pseudo-code doesn't make this filtering explicit.

**Current text (§9):** As above.

**Current text (§6 FR3 case (a)):**
> "**principal not yet resolved** (boot race) — `name` + `color` from `getIdentity()` random fallback; `principalId` omitted."

**Evidence:**
- `packages/app/src/editor/TiptapEditor.tsx:644-650` shows the current explicit `type: 'human' as const`.
- `packages/core/src/types/identity.ts:1-7` confirms `Identity` lacks `type`.
- `packages/core/src/types/awareness.ts:9` makes `type: 'human'` non-optional on `AwarenessUser`.
- `packages/app/src/presence/use-presence.ts:164` enforces the type discriminator at consumption.

**Status:** INCOHERENT

**Suggested resolution:** Update §9 pseudo-code to:
- Always include `type: 'human' as const`.
- Either conditionally spread `principalId` (e.g., `...(principal ? { principalId: principal.id } : {})`) so undefined is never emitted, or explicitly state in FR4 that the dedupe guard filters out `undefined`/empty-string. Pick one to match FR3 case (a)'s "omitted."

---

### [H] Finding 3: G4 ("no regression for synthesized users") inconsistent with FR3 case (c) — color *does* change from random to deterministic

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L6 (stance consistency)
**Location:** §2 Goals (G4), §6 FR3 case (c)

**Issue:** G4 promises "No regression for users without git config (synthesized source) — they keep the random animal-adjective UX they have today." But FR3 case (c) changes synthesized users' color derivation from random (today's behavior — `generateRandomColor()` picks from HUMAN_COLORS, persisted in localStorage `ok-user-color-v2`) to deterministic (`colorFromSeed(principal.id, HUMAN_COLORS)`). FR3 also publishes `principalId` for synthesized users (today there is no principalId on awareness at all).

This is not strictly "the same as today." Whether deterministic-color counts as a regression is debatable, but the goal statement claims preservation that the requirements don't deliver.

**Current text (§2 G4):**
> "**G4:** No regression for users without git config (synthesized source) — they keep the random animal-adjective UX they have today."

**Current text (§6 FR3 case (c)):**
> "**`principal.source === 'synthesized'`** — `name` from `getIdentity()` random fallback (cached to localStorage); `color = colorFromSeed(principal.id, HUMAN_COLORS)` (still deterministic); `principalId = principal.id` (still published — multi-tab dedupe works)."

**Evidence:**
- `packages/core/src/utils/identity.ts:159-161` shows `generateRandomColor()` picks via `randomElement(HUMAN_COLORS)` — random, not seeded.
- `packages/core/src/utils/identity.ts:188-206` shows `getIdentity()` caches the random color in localStorage (`ok-user-color-v2`).

**Status:** INCOHERENT

**Suggested resolution:** Either:
1. Tighten G4 to "name UX is preserved; color becomes deterministic" and explicitly call out the color change as an intentional, mild improvement (not a regression). Then justify why deterministic color for synthesized users is desirable (consistency across tab restarts, even without git config).
2. Drop the deterministic color for synthesized users (use random) — at the cost of FR3 case (c) needing to read color from localStorage instead of computing it. Loses the multi-tab color stability for those users.

Option 1 is the smaller change and more honest.

---

## Medium Severity

### [M] Finding 4: Evidence file `current-identity-flow.md` claims `tabId?: string` (optional) but the actual type has `tabId: string` (required)

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** evidence/current-identity-flow.md, "Type — `AwarenessUser`" section

**Issue:** The evidence file's reproduction of the `AwarenessUser` interface marks `tabId` as optional (`tabId?: string`), but the actual type at `packages/core/src/types/awareness.ts:12` declares `tabId: string` — required. The spec's Q6 ("`tabId` on `AwarenessUser` is dead data — set in TiptapEditor.tsx:649 but never consumed") relies on this evidence file being current.

**Current text (evidence/current-identity-flow.md):**
```typescript
export interface AwarenessUser {
  type: 'human';
  name: string;
  color: string;
  icon?: string;
  coeditor?: string;
  tabId?: string;
}
```

**Evidence:** `packages/core/src/types/awareness.ts:1-13`:
```typescript
export interface AwarenessUser {
  name: string;
  color: string;
  type: 'human';
  icon?: string;
  coeditor?: string;
  tabId: string;
}
```

**Status:** STALE / CONTRADICTED

**Suggested resolution:** Update the evidence file to match the actual type. This may also affect Q6's framing — "dead data" but currently a required field, so removing it is a bigger structural change than removing an optional field.

---

### [M] Finding 5: `principalId` published to peers but spec doesn't address peer trust/forgery surface

**Category:** COHERENCE
**Source:** L7 (inline source attribution / completeness gap)
**Location:** §6 NFR Privacy, §14 Risks, §6 FR4 (dedupe)

**Issue:** FR4 dedupes humans by `principalId`. The dedupe key arrives over-the-wire via Yjs awareness. A malicious or buggy peer could publish a forged `principalId` matching another peer, causing the local client to dedupe two distinct humans into one. The spec's risk row claims "Dedupe key is principalId — server-issued, not client-claimed" but this is only true on the **server** — once the value is on the wire, any peer can echo any string into their own awareness state.

Today's loopback-only model makes this risk theoretical (no untrusted peers), but the spec's §15 explicitly contemplates "shared-content-dir scenarios emerge" and "team-mode features" as triggers — and adding the config flag later doesn't retroactively close this hole. The spec should at least name the trust model assumption (every connected peer is trusted because the server only accepts loopback connections) and where it would fail.

**Current text (§14 Risks):**
> "Multi-tab dedupe wrong direction: dedupes humans who shouldn't be dedupes | Very low | Medium | Dedupe key is `principalId` — server-issued, not client-claimed; cross-checkout users have different `principal.id` (different `<contentDir>`)."

**Evidence:**
- `packages/app/src/editor/DocumentContext.tsx:367-379` fetches the principal once and uses `principal.id` for both `setTabIdentity` (auth-token) and (per the spec) the awareness publish-site. There's no server-side validation of the `principalId` field on awareness state — Yjs broadcasts whatever the client sets.
- `packages/server/src/principal.ts` is the only authoritative source, but the awareness-publish site reads from `DocumentContext.principal` after the fetch, so a buggy client could mutate React state and publish anything.

**Status:** UNVERIFIABLE (architecture decision implicit — should be explicit)

**Suggested resolution:** Add a "Trust model" paragraph to §6 NFR or §10 (Decision Log): "All peers are trusted because the server only accepts loopback connections; `principalId` on awareness is informational, not authoritative. If team-mode / non-loopback connections ship, the principalId publish-site needs server-side authoritative attribution rather than client-published." This gives implementers a clean handle for the future trigger in §15.

---

### [M] Finding 6: NG6 (no localStorage caching of resolved name) interacts with NG3 (no avatar images) in a way that's not addressed

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** §3 Non-goals (NG6), §6 NFR Performance, §14 Risks (first-paint flicker)

**Issue:** NG6 says "Caching the resolved principal-derived name in localStorage to avoid first-paint flicker on cold start. Acceptable for v1 given the fetch is typically <50ms on localhost; revisit if flicker becomes user-visible." This is reasonable in isolation. But §14 lists "First-paint flicker from random → real-name swap is jarring | Medium likelihood | Low impact | Accept for v1" — Medium likelihood. If flicker is medium-likelihood and currently not mitigated, the bar for "user-visible" trigger should be defined more concretely than "if flicker becomes user-visible." How would a developer (the user) determine that?

This isn't a contradiction, but a gap: the trigger is too vague to actually trigger. Either:
- Define the threshold (e.g., "if dogfood QA reports the flicker, OR if the fetch p99 exceeds 200ms") OR
- Rate the likelihood Low (which would be more consistent with "<50ms on localhost").

**Current text (§14):**
> "First-paint flicker from random → real-name swap is jarring | Medium | Low | Accept for v1; revisit per NG6 if visible | Implementer"

**Current text (§3 NG6):**
> "Acceptable for v1 given the fetch is typically <50ms on localhost; revisit if flicker becomes user-visible."

**Status:** INCOHERENT (likelihood + trigger don't square)

**Suggested resolution:** Either downgrade the §14 likelihood to Low (given the <50ms claim), or add a concrete trigger to NG6 (e.g., "dogfood QA report" or "p99 fetch >200ms").

---

### [M] Finding 7: `Identity` type's `coeditor: string` (required) — the spec's pseudo-code spread captures it correctly, but FR12 says "preserve unchanged" without explicit acceptance criteria

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** §6 FR12, §9 architecture pseudo-code

**Issue:** FR12 says "`coeditor` query-param plumbing is preserved unchanged" with acceptance criteria "Existing `?coeditor=...` URL param continues to flow through `getIdentity()` → awareness with no behavior change." But the §9 pseudo-code merge object only highlights what's added — the `...identity` spread is the only thing carrying `coeditor` through. If an implementer reads §9 and writes the merge object explicitly without spread, `coeditor` would be lost. FR12's acceptance criterion doesn't specify HOW this is preserved (spread, explicit field, etc.) — just that behavior is unchanged.

This is a bug-prone seam: an implementer who writes the merge object explicitly and forgets `coeditor` would silently regress.

**Current text (§6 FR12):**
> "Existing `?coeditor=...` URL param continues to flow through `getIdentity()` → awareness with no behavior change."

**Evidence:**
- `packages/core/src/types/identity.ts:4` — `coeditor: string` (required field on `Identity`).
- `packages/app/src/editor/TiptapEditor.tsx:648` — current `coeditor: identity.coeditor` is explicit.

**Status:** INCOHERENT (acceptance criterion too loose to guard the regression)

**Suggested resolution:** Tighten FR12's acceptance criterion: "Test asserts the published awareness `user.coeditor` equals the URL `?coeditor=` value (or `'standalone'` when absent), under (a) principal-resolved git-config, (b) principal-resolved synthesized, (c) principal-not-yet-resolved boot race." This is a 3-line test that pins the behavior.

---

### [M] Finding 8: §16 EXCLUDE list omits `tab-identity.ts` and `provider-pool.ts`'s `setTabIdentity` code path, but STOP_IF correctly names them

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L6 (stance consistency)
**Location:** §16 Agent constraints (SCOPE / EXCLUDE / STOP_IF)

**Issue:** §16 STOP_IF says "Touches `setTabIdentity` / `provider-pool.ts` auth-token logic — out of scope; reach out before changing." But the EXCLUDE list does NOT explicitly enumerate `packages/app/src/editor/tab-identity.ts` or `packages/app/src/editor/provider-pool.ts` (only "Shadow-repo / authorship paths" and "agent presence"). An implementer reading EXCLUDE in isolation might modify `provider-pool.ts` to wire principal into the auth-token differently and only hit the STOP_IF after touching the file.

**Current text (§16 EXCLUDE):**
> "EXCLUDE:
> - `packages/server/src/principal.ts` and `packages/server/src/api-extension.ts` (server side already correct; no changes)
> - Shadow-repo / authorship paths (orthogonal; already use principal correctly)
> - Agent presence ...
> - `packages/app/src/editor/SourceEditor.tsx` ...
> - `coeditor` query-param plumbing (preserve unchanged)
> - `tabId` field on `AwarenessUser` ..."

**Status:** INCOHERENT (STOP_IF and EXCLUDE don't reinforce each other)

**Suggested resolution:** Add explicit lines to EXCLUDE:
- `packages/app/src/editor/tab-identity.ts` (frozen tabSessionId; do not modify)
- `packages/app/src/editor/provider-pool.ts:setTabIdentity` and the auth-token claim shape (change requires re-spec)

---

## Low Severity

### [L] Finding 9: FR4 dedupe acceptance criteria silent on the empty-string vs undefined principalId distinction

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** §6 FR4

**Issue:** FR4 says "When ≥2 awareness entries share a non-empty `principalId`, exactly one `HumanParticipant` is emitted." The phrase "non-empty" suggests the implementation must filter both `undefined` and `''`. But the type (FR2) declares `principalId?: string`, which TypeScript treats as `string | undefined` — `''` is not specially excluded. An implementer reading FR4 strictly would write `if (principalId)` (which excludes both); reading FR2 strictly would write `if (principalId !== undefined)` (which lets `''` through). This is a dedupe correctness issue at the seam.

**Current text (§6 FR4):**
> "When ≥2 awareness entries share a non-empty `principalId`, exactly one `HumanParticipant` is emitted."

**Status:** INCOHERENT (under-specified)

**Suggested resolution:** Make explicit: "Entries are eligible for dedupe iff `typeof principalId === 'string' && principalId.length > 0`. Entries with missing or empty principalId render per-clientId."

---

### [L] Finding 10: A4 confidence label "HIGH" but verification plan is "Will verify in QA"

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment)
**Location:** §12 Assumptions A4

**Issue:** A4 ("Awareness change events reach all peers within the existing Yjs awareness debounce — peers see name upgrade promptly") is rated HIGH confidence, but the verification plan reads "Y.js awareness has no explicit debounce; updates broadcast on the WS connection. | Will verify in QA". A HIGH-confidence assumption with "will verify" is in tension with the confidence label — by the spec skill's own conventions, HIGH confidence comes from existing evidence, not future QA.

**Current text (§12 A4):**
> "Awareness change events (re-publish on principal arrival) reach all peers within the existing Yjs awareness debounce — peers see name upgrade promptly. | HIGH | Y.js awareness has no explicit debounce; updates broadcast on the WS connection. | Will verify in QA | Active"

**Status:** INCOHERENT (confidence-prose misalignment)

**Suggested resolution:** Either:
- Downgrade to MEDIUM with the same verification plan, OR
- Keep HIGH and remove "Will verify in QA" (the prose reasoning IS the verification — Yjs broadcasts on every awareness change with no client-side debounce). The current text is doing both.

---

### [L] Finding 11: HumanAvatar fallback claim relies on second-word-of-name pattern that has thin coverage for non-Western names

**Category:** COHERENCE
**Source:** L3 (missing conditionality), Phase 2 reader pass
**Location:** evidence/current-identity-flow.md, §6 FR-implicit (avatar rendering)

**Issue:** The evidence file claims:
> "Animal-icon lookup keys off the second word of the name. Random 'Curious Squirrel' → 🐿; real 'Miles Kaming-Thanassi' → second word is 'Kaming-Thanassi', which doesn't match → falls back to initials `MK` automatically."

This works for the reviewer's name. But:
- Single-word display names (e.g., common in non-Western git configs, CJK, Indonesian, mononyms) → `name.split(' ')[1]` = `undefined` → falls back to initials of `name.split(' ').map(w => w[0]).join('')` = single character. Acceptable but might surprise.
- Two-word names where the second word coincides with an animal-map key (e.g., "John Bird" — Bird is in `ANIMAL_ICON_MAP`) → renders animal icon for a real human.

The animal map keys are: `Bird, Cat, Dog, Fish, Mouse(→Rat), Rabbit, Shrimp, Snail, Squirrel, Turtle`. Some are uncommon as surnames but `Bird` and `Cat` are real surnames. The fallback is "graceful but quirky."

The spec doesn't surface this minor risk; it's not a blocker but worth noting in §14 Risks or the §3 NG list.

**Status:** INCOHERENT (silent edge case)

**Suggested resolution:** Add a one-line note in §14 Risks: "Real human with second-name matching ANIMAL_ICON_MAP key (e.g., 'John Bird') renders animal icon — pre-existing quirk, not introduced by this change. Mitigation: replace second-word-match with explicit animal-name-set check on the synthesized fallback path." Low priority; can be a Future Work cleanup.

---

## Confirmed Claims (summary)

The following load-bearing claims were checked against the codebase and confirmed:

**File paths and line numbers:**
- `packages/core/src/utils/identity.ts:46` — `colorFromSeed(seed)` hardcoded to AGENT_COLORS — CONFIRMED.
- `packages/core/src/utils/identity.ts:170` — `safeLocalStorageGet` defensive pattern — CONFIRMED.
- `packages/core/src/utils/identity.ts:188` — `getIdentity()` synchronous, returns Identity, persists to localStorage v2 keys — CONFIRMED.
- `packages/core/src/utils/identity.ts:120-144` — 10 adjectives × 10 animals — CONFIRMED.
- `packages/core/src/utils/identity.ts:32-40` — HUMAN_COLORS has 7 pastels — CONFIRMED.
- `packages/server/src/principal.ts:32` — `loadPrincipal()` exists at this line — CONFIRMED.
- `packages/server/src/principal.ts` — produces `Principal` with `id`/`display_name`/`display_email`/`source`/`created_at`, source = 'git-config' iff gitName||gitEmail — CONFIRMED.
- `packages/server/src/api-extension.ts:3339` — `handlePrincipal` handler — CONFIRMED.
- `packages/app/src/editor/DocumentContext.tsx:367` — `fetch('/api/principal')` exists — CONFIRMED.
- `packages/app/src/editor/DocumentContext.tsx:363-379` — fetch range — CONFIRMED.
- `packages/app/src/editor/TiptapEditor.tsx:641-652` — awareness `useEffect` block, including `tabId: identity.tabId` at line 649 — CONFIRMED.
- `packages/app/src/presence/PresenceBar.tsx:62` — `HumanAvatar` function with `user.name.split(' ')[1]` second-word lookup — CONFIRMED.
- `packages/app/src/presence/PresenceBar.tsx:93` — `<TooltipContent>{user.name}</TooltipContent>` — CONFIRMED.
- `packages/app/src/presence/use-presence.ts:151-170` — humans loop with one HumanParticipant per clientId — CONFIRMED.
- `packages/app/src/components/EditorArea.tsx:188` — file docstring matches "EditorActivityPool keeps Tiptap eager" — CONFIRMED.
- `packages/server/src/principal.test.ts` exists — CONFIRMED (A3).

**Behavioral claims:**
- Q4 resolved: SourceEditor only sets `setLocalStateField('mode', ...)` (verified at SourceEditor.tsx:121, 123), never `'user'`. TiptapEditor is the sole user-publication site. CONFIRMED.
- Q5 resolved: grep for `Curious|Squirrel|Turtle|Adjective` in test code returns zero matches — verified.
- `tabSessionId` is module-scoped and frozen for the tab's lifetime (`packages/app/src/editor/tab-identity.ts:12`) — CONFIRMED. Multi-tab from same browser profile share principalId but distinct tabSessionId.
- Existing `ServerInfoResponseSchema` uses `.loose()` pattern in `packages/core/src/schemas/api.ts:47-54` — confirms FR8b's mirror-pattern is well-grounded.
- Today's `Principal` type at `packages/core/src/types/principal.ts:3-9` matches the spec's claim — CONFIRMED.
- `usePresence` filters on `user.type !== 'human'` (use-presence.ts:164) — confirms the type discriminator is load-bearing.

**Architectural claims:**
- The CRDT awareness path is the broadcast medium; Yjs publishes setLocalStateField changes immediately (verified by inspection — no client-side awareness debounce in use-presence.ts).
- `loadPrincipal()` produces ONE principal record per `<contentDir>/.open-knowledge/`, with `id` immutable across boots (the source of Finding 1's tension).

---

## Unverifiable Claims

- **Performance claim "fetch is typically <50ms on localhost" (NG6, §6 NFR).** Not measured in evidence; relies on operator experience. Reasonable for `/api/principal` (single small JSON file read), but no evidence file backs the specific number. Could be tightened with a quick measurement during implementation.
- **Risk claim "principalId is already in the auth-token path on the loopback server; it doesn't leak beyond peers already authorized to the doc" (§14).** True in the loopback-only model but not explicitly verified for any non-loopback path that might exist (e.g., dev port-forwarding scenarios). The architecture is loopback-only per §15, so this is consistent — but if a developer dogfoods over a tunnel, the assumption breaks silently. Acceptable risk for v1 given the loopback-only stance.
- **A2 ("No production users have customized `ok-user-name-v2` localStorage to a value they want to keep").** Pre-launch assertion the agent cannot verify; relies on user direction. Not a finding, just unverifiable by the auditor.
