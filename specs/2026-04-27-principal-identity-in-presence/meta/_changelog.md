# Changelog — Principal identity in presence

Append-only process history. Latest entry on top.

---

## 2026-04-28 — Pre-QA review repair: scope exception + FR3 refinement recorded

- **`api-extension.ts` touched despite §16 EXCLUDE.** Commit `2ebb3ff8` added a loopback + Host-header gate to `handlePrincipal`, mirroring the identical gate already present on `handleWorkspace` and `handleMetricsAgentPresence`. The §16 rationale ("server side already correct; no changes") assumed the gate was already in place — it was not. The change is correct and low-risk (17 lines, established pattern), so it was accepted rather than reverted.
- **Coverage added.** `packages/app/tests/integration/principal-endpoint.test.ts` adds integration tests for the security gates: happy-path schema round-trip, DNS-rebinding Host-header rejection (403), and auth-before-method ordering (POST with bad Host → 403, not 405). Mirrors `workspace-endpoint.test.ts` precedent.
- **FR3 amendment — wire-side label polish.** Implementation calls `formatPresenceLabel(principal.display_name)` at the publish boundary so Unix-style git-config names like `miles-kt-inkeep` reach peers as `Miles Kt Inkeep`. FR3 says `name = principal.display_name` literally; the polish was added to fix an asymmetry that surfaced during pre-QA review (`computeInitials` already polished the avatar, but the cursor label and tooltip floated raw `display_name` next to every selection — a regression vs. the random-fallback experience for users whose git config is a Unix-style username). Single transform at the publish boundary is preferred over per-consumer polish; downstream surfaces (avatar / tooltip / cursor label) inherit consistency.

## 2026-04-27 — Session 1: Intake + scaffold

- **Seed received:** Use principal git identity (`display_name` from `principal.json`) for client-side presence entries instead of random animal-adjective names. User raised five open questions: transport, color, privacy/opt-out, localStorage precedence, refresh semantics.
- **Investigation surfaced** that `/api/principal` already exists on the server, AND the client already fetches it in `DocumentContext.tsx:367` for auth-token wiring — but discards `display_name`/`display_email`. This collapses the transport question and significantly reduces the change surface.
- **Decisions locked from user (5 + 2):**
  - D1 (Avatar visual): real-name humans render as initials; animals reserved for `source: 'synthesized'`. LOCKED.
  - D2 (localStorage migration): pre-launch state allows overwrite/ignore. LOCKED.
  - D3 (Color derivation): deterministic via `colorFromSeed(principal.id)` against HUMAN\_COLORS palette. LOCKED.
  - D4 (Fetch failure): silent fallback with warn-log. LOCKED.
  - D5 (Mid-session git config change): stale-until-reload, no client-side refresh. LOCKED.
  - D6 (Multi-tab UX): single avatar, tooltip "Name · 2 tabs", no badge. LOCKED.
  - D7 (Architecture): keep `getIdentity()` sync; expose principal via DocumentContext; awareness re-publishes on principal arrival. LOCKED.
- **Scope confirmed:** Multi-tab correlation in scope (small data plumbing on top of existing principalId path).
- **Future Work agreed:**
  - Config flag `presence.useGitIdentity: false` (NOT NOW — no shared-content scenarios in production)
  - "Rename my presence" UI (NOTED)
  - Avatar image (gravatar / GitHub avatar) (NEVER for v1)
- **Artifacts created:**
  - `SPEC.md`
  - `evidence/current-identity-flow.md`
  - `evidence/principal-already-fetched.md`
  - `meta/_changelog.md`

## 2026-04-27 — Session 1 cont.: Backlog + first iteration

- **Q4 → Resolved.** Investigated SourceEditor — only sets `setLocalStateField('mode', ...)`, never `'user'`. TiptapEditor mounted eagerly via `EditorActivityPool` is the sole user-publication site. No shared hook required.
- **Q5 → Resolved.** Grep for animal-name patterns (`Curious`, `Squirrel`, `Turtle`, `Adjective`) across `packages/` returned zero matches in test code. PresenceBar.test.ts only tests `WRITING_PULSE_MIN_MS` constants. No test cleanup work.
- **Q6 added (Deferred).** `tabId` on `AwarenessUser` is dead data — set in TiptapEditor.tsx:649 but never consumed by any peer. Out of scope; documented in Future Work as a cleanup candidate.
- **FR3 refined** to enumerate three explicit states (principal not resolved / source: git-config / source: synthesized) — synthesized users now correctly get deterministic color and `principalId` for multi-tab dedupe even though their name stays random.
- **FR4 refined** with deterministic tie-break (lowest `clientId`) for cross-profile synthesized-user dedupe edge case.
- **FR8b added** — `PrincipalSchema` Zod schema in `packages/core/src/schemas/api.ts` (mirrors existing `ServerInfoResponseSchema` pattern), replacing the ad-hoc `as { id?: unknown }` shape check at the fetch boundary.
- **§13 next-actions trimmed** — removed shared-hook step, added schema step, scoped TiptapEditor as the sole publication site.
- **§16 SCOPE updated** — removed SourceEditor.tsx; added `packages/core/src/schemas/api.ts`; explicit EXCLUDE for SourceEditor and `tabId`.

## 2026-04-27 — Session 1 cont.: Audit + assess findings + cascade

- **Audit + Challenger subprocesses dispatched** in parallel (Step 6). Two findings files generated: `meta/audit-findings.md` (11 findings: 3 high, 5 medium, 3 low) and `meta/design-challenge.md` (8 findings: 3 high, 4 medium, 1 low).
- **Findings assessed via `/assess-findings` (Phases 1-6).** Cited evidence for every classification.
- **DC1 (server-authoritative awareness write) — DECLINED** with cited evidence. Investigation showed the challenger conflated `AgentPresenceBroadcaster` (writes a map-valued field on `__system__` — `agent-presence.ts:256` operates on `SYSTEM_DOC_NAME`) with hypothetical server writes to per-doc `awareness.user` (which would stomp via shared clientID per CLAUDE.md "Per-doc awareness would stomp across concurrent agents"). Replicating properly would require a new `humanPresence` map on `__system__` + new client subscriber + decoupling human presence from per-doc awareness — which would break `@tiptap/extension-collaboration-cursor`'s cursor positions. D7 stands; user confirmed.
- **DC2 (privacy opt-out flag in scope now) — DECLINED.** Re-litigates locked NG1. User confirmed Future Work disposition. Adding the flag later remains additive; precedent argument is symmetric.
- **AUD F1 (P2 pair-coder journey unreachable) — ACCEPTED, reframed.** User clarification: separate-machine pair coders have distinct `principal.json` files; same-machine pair coders aren't a use case. P2 reframed for separate-machine multi-human; journey marked aspirational pending real-time multi-machine peering (not in scope). Goal G5 added to make forward-compatibility explicit.
- **DC3 + AUD F5 (trust model + 1-way wire-format door) — ACCEPTED.** §6 NFR Privacy now documents the trust model: `principalId` is client-published, trusted because loopback-only. New D10 records the wire-format door classification. Revisit trigger: non-loopback connections (team-mode in §15).
- **AUD F2 (§9 pseudo-code missing `type`, over-publishes principalId) — ACCEPTED.** §9 pseudo-code rewritten: explicit object with `type: 'human' as const` + conditional `principalId` spread only when `source === 'git-config'`. New §14 risk row + test for `type: 'human'` on payload.
- **AUD F3 (G4 inconsistent with FR3 case (c)) — ACCEPTED.** G4 tightened: "name UX preserved; color becomes deterministic (intentional improvement)."
- **AUD F4 (evidence file claims `tabId?: string` but type has `tabId: string`) — ACCEPTED.** Evidence file corrected.
- **DC4 + AUD F6 (flicker measurement / NG6 trigger vagueness) — ACCEPTED.** §14 risk row downgraded to Low likelihood (matches <50ms typical claim). Concrete revisit trigger: dogfood QA reports flicker OR `/api/principal` p99 >200ms.
- **DC5 (`participantsEqual` + tab count interaction) — ACCEPTED.** FR4 specifies post-dedupe shape: `HumanParticipant` gains `tabCount: number`; `participantsEqual` must compare it. New integration test covers tooltip-count update on sibling tab connect/disconnect.
- **DC6 (cross-profile synthesized dedupe creates name flicker) — ACCEPTED.** FR9 changed: synthesized users do NOT publish `principalId`. They render per-tab as today. Cross-browser-profile multi-human edge case eliminated. New D11 records the decision.
- **DC7 (Complication framing mentions pair-coding but Resolution doesn't deliver) — ACCEPTED.** §1 Complication trimmed: "multi-tab correlation for solo dev" instead of "pair-coding sessions." Multi-machine peering caveat added.
- **DC8 (initials computation produces "m" for `miles-kt-inkeep`) — ACCEPTED.** New FR13: `computeInitials(name)` helper handles common git-config formats. Caps at 2 chars uppercase.
- **AUD F7 (FR12 acceptance criterion too loose) — ACCEPTED.** FR12 now requires test asserting `user.coeditor` preserved under all three FR3 states.
- **AUD F8 (§16 EXCLUDE missing tab-identity.ts/provider-pool.ts) — ACCEPTED.** Both files explicitly excluded; matches STOP\_IF list.
- **AUD F9 (FR4 empty-string vs undefined principalId) — ACCEPTED.** Eligibility rule made explicit: `typeof principalId === 'string' && principalId.length > 0`.
- **AUD F10 (A4 confidence label vs verification plan) — ACCEPTED.** A4 verification plan rewritten — the prose IS the verification (no Yjs awareness debounce); status now "Verified."
- **AUD F11 (HumanAvatar second-word matches ANIMAL\_ICON\_MAP key) — ACCEPTED.** D1 made explicit: animal icons gated on `source === 'synthesized'`, not name-pattern matching. Real human "John Bird" with git config never gets the bird icon.
- **Cascade — new requirements / decisions:**
  - FR13 (`computeInitials` helper)
  - D10 (wire-format door classification)
  - D11 (synthesized users don't publish `principalId`)
  - G5 (forward-compatibility goal)
  - 2 new §14 risk rows (`participantsEqual`, missing `type` discriminator)

## 2026-04-27 — Session 1: Finalize

- **Verification gates passed:**
  - All Decision Log entries have resolution status (10 LOCKED, 1 DIRECTED). No ASSUMED/INVESTIGATING residue.
  - 1-way doors documented (D10) with revisit trigger.
  - Non-goal temporal tags accurate; concrete triggers for NOT NOW items.
  - All In Scope items pass resolution completeness gate.
- **Status flipped to Approved.** Baseline commit unchanged (e251f70b — no source code committed during this session).
- **Pending items carried forward (none for v1 — all in Future Work tiers):**
  - Q1 (palette argument shape) — DELEGATED to implementer
  - Q2 (localStorage key strategy v2/v3) — DELEGATED to implementer
  - Q3 (publish `principal.source` on awareness) — P2 deferred
  - Q6 (`tabId` AwarenessUser cleanup) — P2 deferred to Future Work
- **Spec is ready for `/ship`.**
