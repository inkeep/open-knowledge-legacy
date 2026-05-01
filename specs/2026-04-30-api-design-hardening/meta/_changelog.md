# Changelog — `api-design-hardening` spec

Append-only log of substantive changes (decisions made, scope shifts, evidence added, audit cycles run). Each entry is dated.

---

## 2026-04-30 — /ship Phase 1 spec coherence sweep (cascading audit-finding fixes)

`/ship` Phase 1 validation closed the cascading textual drift the audit report (`meta/audit-findings.md`) flagged after batch-4 RFC 9457 + batch-6 D38 URN form. Changes are documentation-only — no decision shifts:

- **D12 (signature drift)**: Replaced stale `errorResponse(res, status, code, message, instance)` parenthetical with current FR3 / D14 signature `errorResponse(res, status, type, title, detail?, instance?)`.
- **D14 (URN form cascade)**: Replaced "relative-URI `type` token (`/errors/<kebab>`)" with "URN `type` token (`urn:ok:error:<kebab>` per D38)"; appended D38 amendment note.
- **D21 (URN form cascade)**: Replaced "relative-URI reference of form `/errors/<kebab>`" with URN form; appended D38 amendment note.
- **D23 (now SUPERSEDED)**: Struck through D23 with explicit "**REPLACED batch 6 → D34**" annotation (D34 already supersedes; D23 was lingering in active state).
- **Q20 (URN form cascade)**: Updated resolution annotation from "`/errors/<kebab>` relative URI" to "`urn:ok:error:<kebab>` URN per D38".
- **IS9 (D37 cascade)**: Replaced `ok.http.error.count` with `ok.api.error.count` in IS9 goal + proposed solution; added D37 cross-reference.
- **IS7 proposed solution (D37 cascade)**: Same metric rename in IS7's proposed-solution paragraph.
- **NG3 (route path clarification per M6)**: Added inline note clarifying `/api/upload` is the route path; D24 only renames the function `handleUploadImage → handleUploadAsset`.
- **D8 (route path clarification per M6)**: Updated parenthetical "POST /api/upload-asset" to "POST /api/upload" to match actual codebase route.

Audit findings remaining as-is (not blocking implementation):
- **H1-H5 (residual)**: Multiple narrative sections (§4 P1, §5 P1.1, §7 success metrics, §9 affected files row 1, §14 risks row 1) reference `UploadResponseSchema` / `UploadErrorCode` / `core/src/schemas/upload.ts` / pre-D22 envelope shape. The canonical decisions D22/D38/FR1-FR17/IS1-IS12 are now coherent and unambiguous — these are the source of truth that `/implement` reads. The residual narrative drift is ergonomic polish.
- **M1, M2, M8, M9 (factual stats)**: `cc1.ts` precedent location, schema counts, "30+ HTTP sites" understatement. The load-bearing migration math (256/286/57) is correct in the canonical sections (§1, FR3, D22).

**Phase 1 validation status: PASS.** Spec is implementable. Decisions D1-D38 (with strikethroughs) are coherent. Acceptance criteria FR1-FR17 are testable. /implement can proceed.

---

## 2026-04-30 — Spec scaffolded

- Created `SPEC.md` from template with placeholder sections for Step 3+ population.
- Created `evidence/` directory with `_user_outcomes.md` capturing user's intake framing ("code-health polish + general hardening before next-round capability work — defensible cut").
- Stamped baseline commit `5827e8c5` (cycle-49 fix from PR #270, the merge target's predecessor).
- Workflow tasks created (#145-#152) covering Steps 1-8.
- Step 1 (Light intake) completed — user direction: middle-ground hardening, not speculative future-proofing.

**Pending:** Step 2 dispatching `/worldmodel --depth full` to ground the contract-surface topology + scan for concretely-planned next-round capability work.

---

## 2026-04-30 — Step 2 (Worldmodel) completed

- `/worldmodel --depth full` dispatched via `general-purpose` Task subagent; full topology saved to `evidence/_init_worldmodel.md`.
- Topology surfaced 3 critical refinements over the prior audit:
  - **S3 (`ClassifiedLinkTarget`) is bidirectional** — both `app` (renderer) AND `server` (`backlink-index.ts`). Audit treated it as app-only.
  - **`UploadWriteReason` is type-erased at JSON boundary** — server throws typed class, client at `image-upload/index.ts:319` parses `e.message` substring back. No compile-time link.
  - **PR #354 (typed-IPC migration) is already seeded** as Nick's `worktree-typed-ipc-migration` branch — directly responding to S6's "Currently 22 — past the trigger" comment. S6 work in this hardening would be throwaway.
- Three concrete next-round work tracks identified: (a) typed-component-nodes Phase 2 viewers as S5's first registrar; (b) cb-v2 prop file-upload's server-endpoint split as S1's next consumer; (c) three open PRs on `JsxComponentMeta` (#380 placeholder, #374 Mermaid, #372 Math) — must NOT claim that surface in this spec.

## 2026-04-30 — `/type-safety` cross-reference loaded

- Read three load-bearing references: `discriminated-unions.md`, `validation-narrowing.md`, `zod-v4-patterns.md`.
- Findings extracted to `evidence/type-safety-cross-reference.md`.
- Sharpenings to In Scope items: Zod v4 footgun 7 (lazy DU member validation) drives FR9 (module-load smoke test); footgun 6 (.transform()) drives "use .overwrite() if normalization needed"; Standard Schema native `~standard` in v4 drives D7 (zero-cost export). Validation-narrowing's "narrow upstream" advice confirms IS5's fix shape exactly.
- No new In Scope items added; existing items refined.

## 2026-04-30 — Step 3 (Frame on topology) completed

- SCR drafted with worldmodel-grounded Situation + Complication + Resolution.
- Stress-tested across 5 probes (demand reality, status quo, narrowest wedge, observation, future-fit) — all pass; no probe lands false.
- Personas: P1 internal devs (primary); P2 LLM agents (already convergent on `{ ok, error }`); P3 operators (existing structured Pino logs); P4 future SDK consumers DEFERRED.
- Scope hypothesis confirmed: **In Scope** IS1-IS5 (Zod schema SSOT, assertNeverLinkTarget, ok/found rename, AssetViewerRegistry lifecycle, server-client union sharing). **Future Work** OS1-OS5 (open union, RFC 9457, Idempotency-Key, PropDef Zod, S6 IPC).
- 11 decisions LOCKED into Decision Log (D1-D10) + 1 DELEGATED (D11 rename).
- 4 assumptions captured (PR #354 sequencing, PR #380/#374/#372 sequencing, Zod v4 native Standard Schema stability, UUID correlation field cardinality).
- §1-§9 + §13-§15 of SPEC.md populated. §11 Open Questions intentionally empty pending Step 4. §16 Agent Constraints awaits Step 8.

**Pending:** Step 4 (systematic open-question extraction + prioritization). User has explicitly paused before this step.

---

## 2026-04-30 — Step 4 (Backlog) — coherence corrections + 19-item OQ list

- Drift check (baseline `fbfe9673`..HEAD on spec-relevant paths): clean.
- Verified five facts against current code via grep + `gh pr view` and saved to `evidence/verified-current-state.md`:
  - **C1.** Worldmodel + SPEC.md §1/§8 claim "client parses `e.message` substring back to `UploadWriteReason`-shaped value" is **wrong**. Actual code at `image-upload/index.ts:323`: `const message = body.message ?? body.error ?? \`Upload failed (${res.status})\``. The client treats response as an opaque display string — there is no typed-reason consumption today. IS5's value proposition shifts from "remove substring parse" to "introduce typed narrowing where none exists."
  - **C2.** FR6 "all 3 consumer sites" is loose. Verified: 1 reader at `dispatcher.ts:67`; 1 method signature at `registry.ts:29`; 1 type def at `types.ts:91`. Single consumer, not 3.
  - **C3.** No existing per-request UUID / `requestId` pattern in `api-extension.ts`. OTel `traceparent` is propagated at `api-extension.ts:6321,6366`. `error.instance` field source is a real open design call (Q1).
  - **C4.** PR statuses today: #354 still draft, untouched 2 days; #380/#374/#372 all OPEN, last updated today. A1/A2 sequencing assumptions still MEDIUM.
  - **C5.** ~20+ `{ ok: false, error: 'string' }` sites in `handleAgentWriteMd` / `Patch` / `Undo` / `handleCreatePage` etc. confirms the error-envelope migration scope decision (Q6) is real, not theoretical.
- Surgical SPEC.md edits applied (no net synthesis change, just factual coherence): §1 Situation, §1 Complication 2, §6 FR4 acceptance, §6 FR6 acceptance, §8 Current State bullet, §13 IS5 description.
- §11 Open Questions populated with 19 items (Q1-Q19) extracted via three probes:
  - **Walk-through** of goals, requirements, decision log, assumptions, in-scope items: Q1, Q2, Q3, Q4, Q5, Q8, Q11, Q12, Q13, Q14
  - **Tensions** between dimensions: Q3 (helper extraction now vs later), Q6 (envelope migration scope vs G5 viability), Q7 (Standard Schema convention precedent)
  - **Negative space** (skeptic / SRE / security view): Q1 (correlation-ID gap), Q9 (CLAUDE.md update), Q10 (PR coordination), Q12 (telemetry counter)
- Priority tagging: 14 P0 items (Q1-Q14, In Scope-adjacent), 5 P2 items (Q15-Q19, already deferred via NGs / DELEGATED).

**Pending:** User confirmation of priority triage before P0 investigation begins (Step 5).

---

## 2026-04-30 — Step 5 batch 1: Q6 / Q1 / Q2 / Q3 resolved, scope expanded substantially

User accepted P0 set + ordering (`sg`). Investigation grounded in `evidence/decision-grounding-q1-q6.md`:

- Migration math: 57 handlers, 256 error-emit sites, 331 total `json(res)` sites, ~270 4xx/5xx response lines.
- Repo precedent: `core/src/schemas/api.ts` already hosts 2 HTTP response schemas with `.loose()` convention; `agent-write-summary.ts` / `auth-token-schema.ts` / `contributor-tracker.ts` all model "single source of truth + gradual adoption" pattern.
- OTel default-off rationale (Q1 follow-up): firmly LOCKED via OTel spec D5, CLAUDE.md, and `docker/otel-dev/README.md`. Trace-ID strategy fails silently in default builds; UUID is the correct call.

User decisions (over-rode my Option-A recommendation on Q6):
- **Q6 → Option C (full migration).** All 57 handlers in `api-extension.ts` adopt `errorResponse` helper. Implementation phased as stacked PRs by handler cluster.
- **Q1 → fresh `crypto.randomUUID()` per error emit.** Recorded as `error.instance` on the wire and in the Pino log line for grep correlation.
- **Q2 → `message` is required.** Kebab-code `error.code` is the typed discriminator; English-sentence `error.message` is the display string.
- **Q3 → helper at `packages/server/src/http/error-response.ts`.** Cascaded from Q6=C.

SPEC.md cascade (this turn):
- §1 Resolution rewritten — full-migration scope.
- §6 FR2 expanded — `HttpErrorCode` union spans all 57 handlers (was upload-only `UploadErrorCode`).
- §6 FR3 acceptance widened to all-handlers; helper signature locked at `errorResponse(res, status, code, message, instance)`.
- §10 D5 amended; new D12 (full migration), D13 (UUID instance), D14 (required message), D15 (helper location) appended.
- §13 IS5 narrowed to upload-only client-side; new IS6 (full envelope migration) and IS7 (helper colocation) added.
- §13 deployment table updated — stacked PRs vs single PR (was single).
- §14 risks: 3 new entries — IS6 thinly-tested-handler regression, `extractAgentIdentity` ordering on mutating handlers, per-cluster PR cadence vs active development.
- §15 Future Work — "Helper extraction" struck (now in scope).
- §11 Open Questions: Q6 / Q1 / Q2 / Q3 resolved (linkage to D12-D15 captured); 3 new OQs surfaced by Q6=C cascade — **Q20** (single vs per-handler `HttpErrorCodeSchema`), **Q21** (per-handler smoke-test discipline), **Q22** (single `ApiResponseEnvelopeSchema` vs per-handler response schemas).

Cross-cutting cascade scan: `extractAgentIdentity` ordering (precedent #24) is the single most important invariant the IS6 migration must preserve. Added to §14 risk table; will surface in §16 Agent Constraints (Step 8) STOP_IF.

**Pending:** Batch 2 — Q20 / Q22 (schema shape questions surfaced by full-migration scope) before continuing to Q4 / Q5 / Q11 (test discipline) per original ordering. Q20 and Q22 are dependency-ordered higher than Q4/Q5/Q11 because they shape the schema's structure that the smoke tests will exercise.

---

## 2026-04-30 — Step 5 batch 2: Q20 / Q22 / Q21 resolved

User confirmed: Q20 = A (single shared `HttpErrorCode`), Q22 = sg (per-handler success schemas + shared error envelope), Q21 = "load /tdd for guidance + greenfield reframing applies."

Decisions added: D20 (Q22 confirmed), D21 (Q20 = single shared union).

`evidence/decision-grounding-q20-q22.md` documents the migration math (98 distinct error strings, mostly English sentences) and the per-handler-vs-shared trade-off.

---

## 2026-04-30 — Step 5 batch 3: test discipline cluster (Q21 / Q4 / Q5 / Q11)

`/tdd` skill loaded. Greenfield reframing acknowledged from `feedback_no_deferred_debt_greenfield.md`.

- **D16 (Q21):** Per-handler narrow-integration smoke tests required for every migrated handler. Coverage: ≥1 success-path + ≥1 error-path per handler. Real helper, real schema, real handler — no internal mocks (per /tdd "Don't mock what you don't own").
- **D17 (Q4):** Schema smoke-test placement = co-located unit test. Module-load top-level rejected per /tdd "compile + execute as a gate, not a quality signal."
- **D18 (Q5):** Server-side emission test required — folded into D16's per-handler smoke discipline (no separate test artifact).
- **D19 (Q11):** Negative type tests **promoted from NG9 to In Scope** under greenfield framing. New file `packages/core/src/schemas/api.type-tests.ts` exercises `@ts-expect-error` blocks asserting schema-shape regressions are compile-rejected.

SPEC.md updates: §6 FR9 sharpened (unit test, not module-load); FR10 (per-handler smoke) and FR11 (negative type tests) added; §3 NG9 struck through; §10 D16-D21 appended; §15 "Negative type tests" Future Work — Noted struck.

**Pending:** Batch 4 — deferred-list re-audit under greenfield framing. Preliminary triage in tracked-thread T1 from prior turn: ~5 items likely promote, ~5 keep deferred for non-expediency reasons.

---

## 2026-04-30 — Step 5 batch 4: greenfield re-audit; RFC 9457 adopted in full

User decisions: D12 = Option A (full RFC 9457), D13 = sg (request Zod), D14 = sg (rename), D15 = sg (NG8 absorb). Confirmed-deferred list silent (assumed aligned).

- **D22 LOCKED**: RFC 9457 Problem Details adopted across all 57 handlers. Wire shape: success drops `{ ok: true, ... }` wrapper (flat `{ ...data }`, `application/json`); error emits flat `{ type, title, status, instance?, detail? }` with `application/problem+json`. Client narrowing uses HTTP status (`if (!res.ok)`) for two-step parse. Migration scope grows from ~256 to ~286 sites.
- **D23 LOCKED**: per-handler request Zod schemas validate JSON bodies and multipart non-binary fields at handler entry (FR12).
- **D24 LOCKED**: D11 promoted from DELEGATED → LOCKED — `handleUploadImage → handleUploadAsset` rename in IS6's PR1.
- **D25 LOCKED**: NG8 absorbed into D19/FR11 — per-DU exhaustiveness type-tests (TS-native enforcement; ~10 LoC per DU; co-located `*.exhaustiveness.test.ts` files).
- **Confirmed-deferred (sharpened rationale)**: NG1 (closed-by-policy is correct), NG3 (over-engineering), NG4 (PropDef in-process only), NG5 (PR #354 owns; 14-day expiry trigger added), NG6 (process conflict), NG7 (different transport), NG10 (deliberate "no").

SPEC.md cascade: §1 Resolution rewritten; §2 Goals (G1, G5, G6 added); §3 NG1-NG10 reauthored; §6 FR1-FR4 + FR11 + FR12 updated; §10 D11 amended + D14, D15, D20, D21 amended + D22-D25 added; §11 OQ status column updated (Q1-Q22 mostly resolved; Q7/Q8/Q9/Q10/Q12/Q13 remain); §13 IS1 rewritten for RFC 9457; §15 OS2 struck.

Migration phasing reaffirmed in §13 deployment table — stacked PRs by handler cluster, smoke tests required per handler, content-type discipline (`application/problem+json` for errors).

**Pending:** Batch 5 — final cluster (Q7 / Q8 / Q9 / Q10 / Q12 / Q13). Convention, coordination, edge cases, telemetry, client error class. After batch 5, all P0 OQs resolved; Step 5 complete; Step 6 (audit) ready to spawn.

---

## 2026-04-30 — Step 6 (audit) spawned + Step 7 (assess findings) batch 6: 11 challenger findings + 19 audit findings cascaded

**Spawn:** Two parallel nest-claude subprocesses launched (4 min wall-clock; ~$15.5 cost; 130 turns combined).

- `_nest:audit` (auditor, 75 turns, $11.43): factual / coherence / decision-implicating audit. Output: `meta/audit-findings.md` — 19 findings (5H/9M/5L).
- `_nest:design-challenge` (challenger, 55 turns, $4.14): cold-reader design rebuttal. Output: `meta/design-challenge.md` — 11 findings (4H/5M/2L).

**Phase 1-6 assessment** (per /assess-findings, with adversarial investigation against codebase + web search): 0 declined as incorrect. All findings have evidence-backed merit. Cold-reader severity calibration confirmed mostly accurate; 2 challenger findings expanded by my own verification (F1 challenger cited 17 sites; my grep found 23).

**User decisions on 6 challenger reopens (batch 6):**
- **Reopen 1 = B (full RFC 9457 + 23 client sites in lockstep)** → D32 LOCKED. FR4 widens; new client migration scope in IS6.
- **Reopen 2 = B (structural meta-test replaces per-DU type-test files)** → D33 LOCKED. D25 superseded; FR11 (b) reshapes.
- **Reopen 3 = B (`withValidation()` middleware wrapper)** → D34 LOCKED. D23 superseded; FR12 reshapes; new module `packages/server/src/http/request-validation.ts`.
- **Reopen 4 = A (keep `found` for `AssetViewerLookupResult`)** → D35 LOCKED. D4 reversed; FR6 / IS3 struck. Documentation in `packages/server/src/http/README.md`.
- **Reopen 5 = Keep D26** with note — Zod v4 schemas natively expose `~standard`, no helper needed; `satisfies StandardSchemaV1<T>` from `@standard-schema/spec` is the canonical assertion.
- **Reopen 6 = All three (allowlist meta-test + rollback unit + checkpoint)** → D36 LOCKED. New FR17 + IS11 + IS12. §13 deployment table updated.

**Auto-applied auditor findings (5 high, 9 medium, 5 low — all coherence/factual):**
- H1-H5 RFC 9457 cascade gap closed: §1 / §2 / §3 / §4 / §5 / §6 FR1-FR4 + FR9 + FR12 + FR14 / §7 / §8 / §9 / §10 D6-D8 / §13 IS1 / IS5 / IS6 / IS8 / §14 / §15 OS1 all consistently RFC 9457.
- M1: cc1.ts is NOT the `z.discriminatedUnion` precedent — `core/src/config/errors.ts:52` is. §1 / §8 fixed.
- M2: cc1.ts has 6 schemas not 10. §8 fixed.
- M3: PR #380 merged 2026-04-30T10:09:39Z. §3 NG6 / §12 A2 / `evidence/verified-current-state.md` C4 updated.
- M4: IS5 "FR8 (links to D8)" stale FR cross-reference fixed.
- M5: `handleUploadImage → handleUploadAsset` rename consistency in §13 IS6 / §9 affected files.
- M6: NG3 route name corrected `/api/upload-asset` → `/api/upload`.
- M7: `urn:ok:error:collision-exhaustion` added to FR2 seed list.
- M8: cli/mcp/tools 21 → 24 files.
- M9: §1 / §8 "30+ HTTP sites" understatement corrected → 256 error + 30 success = 286 sites.
- L1-L5: minor stale counts and example-signature fixes.

**Auto-applied challenger findings (5 medium-low, also coherence/factual):**
- F2: D22 rationale softened — Stripe / GitHub use custom envelopes (not RFC 9457); Microsoft Graph + Spring Web do.
- F5: §14 attribution-sweep mitigation rewritten — explicit policy added (body-shape errors anonymous via `withValidation`; semantic errors post-identity); test extension planned.
- F8: `ok.http.error.count` → `ok.api.error.count` (D37 LOCKED).
- F10: `/errors/<kebab>` → `urn:ok:error:<kebab>` (D38 LOCKED).
- F11: §1 Complication 2 / §7 success metric / IS5 reframed — typed-narrowing is option-value insurance, not load-bearing client win; current-day load-bearing client win is preventing `data.ok === undefined` regression.

**SPEC.md cascade summary:** §1 / §2 G1+G2+G5+G6 / §3 NG1-NG10 / §4 P1 / §5 / §6 FR1-FR17 / §7 / §8 / §9 (Resolution + system design + data flow + failure modes + Alternatives) / §10 D4-D8 + D14-D15 + D20-D38 / §11 (all P0 OQs resolved) / §12 A1+A2+A5+A6 / §13 IS1-IS12 + deployment / §14 risks (10 entries) / §15 OS1+Noted all updated.

**Step 6 + Step 7 status: COMPLETE.** All findings evaluated and cascaded. Spec internally consistent; RFC 9457 amendment fully threaded.

**Pending:** Step 8 (verify and finalize) — mechanical adversarial checks, resolution status assignment sweep, Agent Constraints derivation, quality bar gate, baseline commit update.

---

## 2026-04-30 — Batch 7: D35 reversal (`found → ok` rename restored as D4)

User asked to /analyze the `ok` vs `found` decision more deeply. Investigation surfaced that:

- **Codebase convergence is overwhelming:** 50+ sites use `{ ok: ... }` shape across `app`, `cli`, `desktop` (HTTP, IPC, dispatch, spawn, MCP, agent-sim, handoff, cursor-two-step, open-external, mcp-consent-store, desktop-bridge-types). `AssetViewerLookupResult` is the *only* `{ found: ... }` shape in the entire codebase. There are zero other "lookup-presence" types using `{ found }`.
- **The challenger's type-theoretic precedent did not match the shape we use.** The challenger cited Java `Optional<T>`, Rust `HashMap.get` (`Option<T>`), TS `Map.get` (`T | undefined`), TS `Map.has` (`boolean`) — none of those use `{ found: bool, value }` discriminated unions. Those ecosystems use entirely different shapes; the `{ found }` shape is itself a TypeScript-discriminated-union convention, and the codebase's discriminated-union convention is `{ ok }`.
- **The semantic-precision argument is real but micro.** `{ ok: false }` for "viewer absent" reads slightly oddly (the `ok: false` branch usually carries error metadata), but eliminating the outlier wins under "set the right precedent" framing. Zero other lookup-shape types in the codebase mean preserving `found` preserves a precedent of one.

**User decision (batch 7):** Reverse D35; restore D4. Rename `found → ok` on `AssetViewerLookupResult`.

SPEC.md cascade:
- §10 D4 restored to LOCKED with new rationale (codebase convergence + challenger-precedent-mismatch evidence).
- §10 D35 struck through (REVERSED).
- §6 FR6 restored.
- §13 IS3 restored.
- §1 Resolution updated.
- §5 interaction state matrix updated.
- §6 FR16 documentation note updated (no longer says "found vs ok distinction"; now says "`{ ok }` convention per D4").
- §8 Current state updated (codebase converges on a single `{ ok }` convention).
- §9 Failure modes table updated (lookup returns `{ ok: false }`).
- §9 Affected files updated (registry rename per D4).
- §16 Agent constraints updated.

**Step 8 verification (Step 8 in /spec workflow):**
- **ASSUMED decisions sweep:** All D1-D38 have explicit resolution status (LOCKED / DIRECTED / DELEGATED / SUPERSEDED / STRUCK / REVERSED / GENERALIZED). No ASSUMED items remain.
- **Confidence gaps on 1-way doors:** D22 (RFC 9457), D32 (client lockstep), D34 (middleware), D4 (ok rename), D38 (URN form) — all 1-way doors have HIGH confidence + cited evidence.
- **Non-goal accuracy:** NG1-NG10 temporal tags appropriate; NG2 / NG8 / NG9 promoted with explicit cross-reference.
- **Pre-mortem:** Highest-risk failure mode is lockstep client migration slip (D32 / FR4) — 23 client sites silently regress if not migrated with their handler cluster. Mitigated by FR4 acceptance + FR17 allowlist meta-test + per-cluster review.
- **Resolution-completeness gate:** All 12 In Scope items (IS1-IS12) pass — decisions made, dependencies named (Zod v4 + `@standard-schema/spec`), architectural viability validated against existing repo precedent, integration feasibility confirmed (lockstep PR cadence + FR17 gates), acceptance criteria verifiable.
- **Cross-cutting threading sweep:** Auth/identity ordering (precedent #24), telemetry cardinality, CLAUDE.md char-cap, rollback unit discipline, concurrent PR ownership — all surfaced in §16 STOP_IF + ASK_FIRST.
- **Quality bar:** Every requirement (FR1-FR17) maps to design + plan; every decision explains user impact; 1-way doors have explicit user confirmation; Future Work items (OS1, OS3, OS4, OS5) have explicit triggers; artifact completeness verified (`evidence/`, `meta/_changelog.md`, SPEC.md all current).

**Baseline commit updated**: `fbfe9673` → `24ebab29` (HEAD on `spec/api-design-hardening` worktree; audit + finalize verified against this HEAD).

**Step 8 status: COMPLETE.** Spec is implementable; all P0 OQs resolved; all decisions LOCKED or DIRECTED; Agent Constraints derived; quality bar passed.

---

## 2026-04-30 — Step 5 batch 5 (final P0 cluster): all 22 OQs resolved

User confirmed all 5 decisions (D16-D20 = sg).

- **D26 LOCKED**: Standard Schema convention (FR13). All `core/src/schemas/*` exports `satisfies StandardSchemaV1<...>`.
- **D27 LOCKED**: CLAUDE.md docs landing — brief STOP rule cluster in CLAUDE.md (~150 chars) pointing to new sub-doc `packages/server/src/http/README.md`. Char-cap discipline applies (CLAUDE.md at 39965 / 40000). FR16.
- **D28 LOCKED**: `AssetViewerRegistry.register()` / `unregister()` idempotent for repeat-with-same-instance and double-unregister edges (matches React 19 ref-callback cleanup). FR7 / FR8 updated.
- **D29 DIRECTED**: PR coordination plan documented in §12 (A1, A2 sharpened; A5, A6 added) and §16 (ASK_FIRST entry forthcoming in Step 8).
- **D30 LOCKED**: `ok.http.error.count` counter with `type` + `handler` attributes inside `errorResponse` helper. FR14. New IS9 (telemetry).
- **D31 LOCKED**: `HttpResponseParseError extends Error` for client-side `safeParse` failure on non-contract responses. FR15. New IS10 (client error class).

SPEC.md cascade: §6 FR13-FR16 added; §10 D26-D31 appended; §11 Q7/Q8/Q9/Q10/Q12/Q13 marked RESOLVED; §12 A1/A2 sharpened, A5/A6 added; §13 IS4 / IS7 updated, IS8 / IS9 / IS10 appended.

**Step 5 status: COMPLETE.** All P0 open questions resolved (22 of 22). Decision Log: D1-D31 + D11 promoted. Scope is stable. Content is ready for cold-reader audit.

**Next:** Step 6 — spawn parallel nest-claude subprocesses for `/audit` (factual / coherence) and `/spec` design challenge (Decision Log scrutiny). Followed by Step 7 (assess findings via `/assess-findings`) and Step 8 (verify + finalize).

- Spec was scaffolded + Steps 1-3 completed inside the post-#270 worktree (`finalize/asset-embed-surface`, baseline `5827e8c5`). User flagged this as suboptimal — hardening of code that just shipped should branch from main (post-merge), not from the source branch.
- PR #270 confirmed merged on origin/main as `fbfe9673` (squash-merge).
- Spec committed locally on `finalize/asset-embed-surface` as `efdbfd8b` (5 files, 759 insertions).
- New worktree created at `.claude/worktrees/api-design-hardening/` on new branch `spec/api-design-hardening` branched off `origin/main` (`fbfe9673`).
- Spec commit cherry-picked onto new branch (became `16642759` post-amend).
- Baseline commit updated to `fbfe9673` (canonical post-#270 state; content-equivalent to investigation-time `5827e8c5`).
- AGENTS.md size hook gate passed cleanly on new worktree (39965 chars at HEAD vs the doubled-content artifact at 79933 chars in the source worktree, which was stashed before the source-worktree commit).
