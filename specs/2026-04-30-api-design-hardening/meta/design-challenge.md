# Design Challenge Findings

**Artifact:** `specs/2026-04-30-api-design-hardening/SPEC.md`
**Challenge date:** 2026-04-30
**Total findings:** 11 (4 high, 5 medium, 2 low)

The spec is well-grounded and rigorous; this challenge does not contest the **direction** of hardening. It surfaces gaps between the spec's stated scope and what the spec's own evidence files plus the codebase actually support. Several findings target the "greenfield reframing" batch-4/5 promotions specifically — they pivoted the spec's center of mass without the same evidence depth that supported the batch-1/2/3 decisions.

---

## High Severity

### [H] Finding 1: D22 RFC 9457 silently breaks ~17+ existing client `data.ok` reads — wire-shape break unenumerated

**Category:** DESIGN
**Source:** DC2 (stakeholder gap)
**Location:** §10 D22 ("Existing in-repo consumers ... survive — they read fields directly, no dependency on `ok: true` wrapper"); §6 FR1; §6 FR3.

**Issue:** D22 drops the `{ ok: true }` wrapper from all 57 success-path responses (~37 sites). The Decision Log claims existing in-repo consumers survive because they "read fields directly," citing one example: `ProviderPool` reading `serverInstanceId`. A grep across `packages/app/src` finds **at least 17 client sites that explicitly read `data.ok` / `body.ok` / `raw.ok` to discriminate success from error before consuming the payload**:

| Site | Pattern |
|---|---|
| `packages/app/src/components/FileTree.tsx:585` | `if (res.ok && data?.ok) {` |
| `packages/app/src/components/FileTree.tsx:725, 775, 834, 977` | `if (!res.ok \|\| !data.ok) {` (4 sites) |
| `packages/app/src/components/ForwardLinksPanel.tsx:53` | `if (!data.ok) throw new Error(data.error ?? ...)` |
| `packages/app/src/components/GraphPanel.tsx:102, 110` | `if (!data.ok) throw new Error(...)` (2 sites) |
| `packages/app/src/components/OutlinePanel.tsx:44` | `if (!data.ok) throw new Error(...)` |
| `packages/app/src/components/GraphView.tsx:534` | `if (!data.ok) {` |
| `packages/app/src/components/NewItemDialog.tsx:225` | `if (!data.ok) {` |
| `packages/app/src/components/BacklinksPanel.tsx:32` | `if (!data.ok) throw new Error(data.error ?? ...)` |
| `packages/app/src/lib/use-activity-panel.ts:113, 136` | `if (!body.ok) {` (2 sites) |
| `packages/app/src/editor/extensions/wiki-link-suggestion.ts:148` | `return data.ok && Array.isArray(data.headings) ? ... : []` |
| `packages/app/src/components/EditorHeader.tsx:284` | `if (!raw.ok) {` (after isRenameResponse type-guard) |
| `packages/app/tests/integration/backlinks.test.ts:53, 81, 124` | `data.ok && ...` (3 sites) |
| `packages/app/tests/integration/test-harness.ts:750, 811` | `data.ok && ...` (2 sites) |

**Failure mode** (silent): post-D22, these reads see `data.ok === undefined`. `!data.ok` becomes `!undefined === true`, so success responses are misclassified as errors. The most dangerous case is `wiki-link-suggestion.ts:148` — a typo-suggestion fetch that will silently return `[]` on every success after D22, with no error to surface.

**Current design:** "Existing in-repo consumers (e.g., `ProviderPool`'s `expectedServerInstanceId` claim against `ServerInfoResponse.serverInstanceId`) survive — they read fields directly, no dependency on `ok: true` wrapper."

**Alternative:** Three options, in increasing scope:
1. **Keep `ok: true`** on success paths. RFC 9457 only mandates `application/problem+json` for *errors*; the success shape is unconstrained. Adopt RFC 9457 Problem Details on errors only; keep `{ ok: true, ... }` on success. This breaks no existing reader.
2. **Drop `ok: true` AND audit/migrate every consumer.** The 17+ sites above must be enumerated in §13 and migrated as part of IS6 (not "separate scope per IS5 above" as the spec currently scopes client-side migration). FR4 covers only `image-upload`; the rest are unaddressed.
3. **Hybrid:** keep `ok: true` for handlers consumed by SPA components; drop only for handlers consumed exclusively by external/test paths. Heterogeneous and confusing — likely worst of both worlds.

**Trade-off:** Option 1 keeps RFC 9457 compliance for the error path (which is what RFC 9457 actually standardizes) and avoids a wire break. The asymmetry (`ok: true` on success / `application/problem+json` on error) is consistent with how Stripe and most production RFC 9457 adopters structure their APIs — RFC 9457 was *designed* to layer onto existing success conventions.

**Status:** CHALLENGED

**Suggested resolution:** Re-examine D22's success-side scope. If the wire break is intentional, IS6 must enumerate all consumer sites and migrate them in lockstep — not defer to "separate scope." If unintentional, narrow D22 to error-path only.

---

### [H] Finding 2: D22 RFC 9457 adoption — "two staff engineers test" rationale is unsupported assertion that conflicts with the spec's own NG7

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC3 (framing validity)
**Location:** §10 D22 rationale; §3 NG7; `evidence/_user_outcomes.md` framing.

**Issue:** D22 was promoted batch-4 under the "greenfield no deferred tech debt" framing with this rationale: *"Two staff engineers would adopt it day one rather than ship a custom envelope and migrate later."* Two structural problems:

1. **The user's own intake framing rejected this scope.** `evidence/_user_outcomes.md` says: *"Items where the trigger is 'going public' or 'MCP exposure of upload' without a concrete next surface stay as Future Work pointers."* And explicitly: *"No public-API trigger named (no imminent SDK generation, no public docs ship). RFC 9457 Problem Details + Idempotency-Key support stay deferred."* Greenfield doesn't unlock RFC 9457 — it removes production-migration friction, not the requirement for a concrete trigger. The batch-4 reframing inverts the user's own filter without re-eliciting the constraint.

2. **The "two staff engineers" assertion contradicts NG7.** §3 NG7 keeps MCP envelope alignment Out of Scope because *"Different transport contract — MCP SDK uses `{ content, isError? }`. Architecturally correct to diverge."* If two staff engineers in greenfield would adopt RFC 9457 day one for HTTP, why wouldn't they also unify it with MCP? The only consistent answer is "RFC 9457 is the right tool when crossing organizational/SDK boundaries, not for internal-only contracts." But that's exactly the original framing's logic, which D22 contradicts.

**Industry evidence the spec doesn't cite:**
- Stripe (cited in D22 rationale) does NOT use RFC 9457 Problem Details. Stripe uses a custom envelope: `{ error: { type, code, message, ... } }` with `application/json`. ([Stripe API Reference](https://docs.stripe.com/api/errors))
- GitHub doesn't use RFC 9457. GitHub uses `{ message, errors[], documentation_url }` (custom).
- Of the major APIs the spec name-drops (Stripe, GitHub, Microsoft Graph, AWS API Gateway), only Microsoft Graph and parts of AWS use RFC 9457-shaped errors. The "established standard adopted by ..." claim conflates "publicly published as RFC" with "industry-standard for internal APIs."

**Current design:** Adopt RFC 9457 Problem Details across all 57 handlers; ~286-site migration; new content-type, new field names (`type`/`title`/`detail`), wire-shape change.

**Alternative (DC1 simpler):** Hybrid envelope formalization without RFC 9457 commitment.

```
Success: { ok: true, ...data }                          // unchanged
Error:   { ok: false, error: { code, message, instance } }  // tighten existing
Content-Type: application/json on both                  // unchanged
```

This delivers all of FR1/FR2/FR3/FR4's *internal* value (typed code union, single helper, schema-as-SSOT, client narrowing) without:
- Wire-shape breakage (Finding 1).
- The relative-URI-reference confusion RFC 9457 itself warns about ("It is RECOMMENDED that absolute URIs be used in `type` when possible"). The spec uses relative `/errors/<kebab>` — RFC 9457 §3.1.1 calls this out as implementation-fragile.
- Conflict with NG7's "different transport contract" argument.

**Trade-off:** Hybrid envelope loses ~10 hours of "we adopted the standard" headline value in case of future SDK generation. Gains: ~17 wire-shape regression sites avoided; alignment with the user's original intake framing; consistency with NG7 rationale; alignment with how Stripe (the spec's named exemplar) actually does this.

**Status:** CHALLENGED

**Suggested resolution:** Reopen D22. Either (a) keep envelope custom and adopt RFC 9457's *spirit* (typed `code`, structured envelope) without its letter (URI types, content-type, success-side wrapper drop); OR (b) commit fully and migrate all 17+ wire consumers in-scope, not deferred. The current half-step (RFC 9457 letter on errors, plus a wire break on success that no consumer is migrated for) is the worst position.

---

### [H] Finding 3: D25 per-DU exhaustiveness type-tests are circular — they test the test, not the consumers

**Category:** DESIGN
**Source:** DC1 (simpler alternative) — interface depth probe
**Location:** §6 FR11 acceptance (b); §10 D25 rationale.

**Issue:** D25 promoted "per-DU exhaustiveness type-tests" to In Scope to absorb NG8's lint-rule-equivalent goal. The intended mechanism (FR11 acceptance b): *"Per-DU exhaustiveness type-test files (e.g., `link-targets.exhaustiveness.test.ts`) exercise `switch` over every variant with `default: assertNeverXyz(value)` — adding a new variant breaks compile at every consumer site."*

**Why this is circular:** `assertNeverXyz(value: never): never` already produces a TypeScript compile error at the consumer site if any variant is missed. The exhaustiveness type-test file *also* uses `assertNeverXyz` — it just exercises a switch in a test file. **If a real consumer forgets to add the `default: assertNeverXyz(...)` clause, the test file's exhaustiveness check doesn't fire — the test only proves that the test itself is exhaustive.** Adding a new `ClassifiedLinkTarget` variant doesn't break compile at every consumer; it only breaks compile at consumers that *opted in* to `assertNeverLinkTarget`.

The mechanism the spec actually wants (the lint rule `@typescript-eslint/switch-exhaustiveness-check` flags `switch` statements without `default`) is not what FR11(b) implements. The lint rule operates on the consumer's switch statement — not on a test file's switch. FR11(b) adds maintenance overhead (one test file per DU, kept in sync as variants are added) while delivering zero defense beyond what `assertNeverXyz` already provides at consumer sites.

**Current design:** Co-located `*.exhaustiveness.test.ts` per DU exercises a switch with `default: assertNeverXyz(value)`.

**Alternative (DC1):** One of:
1. **Drop FR11(b) entirely.** `assertNever*` already enforces at consumer sites. The test adds nothing. Keep FR5 (define `assertNeverLinkTarget`) and FR11(a) (negative type tests for schemas only).
2. **Replace FR11(b) with a structural meta-test** that scans the codebase for `switch (target.kind)`-style consumer sites and asserts each one ends in `default: assertNever*(...)`. This mirrors `attribution-sweep-coverage.test.ts` (precedent #20). It would actually catch the failure mode the spec is targeting.
3. **Wait for biome to ship the lint rule.** The spec's own §15 Future Work — Noted bullet says biome doesn't have it; the spec acknowledges this is the right tool but proposes a workaround. The workaround doesn't deliver the same defense. Better to defer than ship a circular test.

**Trade-off:** Option 1 saves ~10-30 LoC per DU + ongoing maintenance, costs zero defense. Option 2 is the right shape but requires a meta-test build (similar to `attribution-sweep-coverage.test.ts`). Option 3 defers correctly to a tool that exists but isn't yet in the repo.

**Status:** CHALLENGED

**Suggested resolution:** Reopen D25. Drop FR11(b) or replace with structural meta-test. Keep FR11(a) (schema negative type tests) — that's well-targeted.

---

### [H] Finding 4: FR12 per-handler request schemas chosen without considering middleware alternative

**Category:** DESIGN
**Source:** DC1 (simpler alternative) — parallel-design adequacy probe
**Location:** §6 FR12; §10 D23; §13 IS8.

**Issue:** D23 mandates per-handler `XyzRequestSchema` schemas with handler-entry `safeParse` calls before business logic. Industry consensus (Express/Hono/Fastify ecosystems) is that **request validation is centralized middleware** — every framework's idiomatic Zod integration uses `zValidator(schema, target)` middleware that runs before the handler, not inline `safeParse` in each handler body.

The Decision Log records exactly one option for D23: per-handler safeParse. **No middleware alternative was considered.** This is a parallel-design adequacy gap (per `references/technical-design-playbook.md` "Parallel design protocol for major architectural decisions"): 1-way door (sets the precedent for ~20 handlers + every future handler), single-shot decision, no constraint-varied alternative.

**Comparison:**

| Aspect | Per-handler `safeParse` (D23) | Middleware (`zValidator` pattern) |
|---|---|---|
| Setup cost | ~20 schemas + ~20 inline `safeParse` calls + ~20 error routes | ~20 schemas + 1 middleware definition + 0 inline calls |
| LoC per handler | ~5-10 LoC (call, branch, errorResponse) | 0 (handler receives already-typed body) |
| Forgetting validation on a new handler | Possible (no structural enforcement) | Impossible (middleware applied at registration) |
| Handler signature | `(req, res) => { const r = safeParse(...); if (!r.success) ...` | `(req: typed-request, res) => { const body = req.body; ... }` |
| Test boundary | Test must mock parser invocation | Test handler with already-typed input |

**The codebase already has analogous shared boundary helpers:** `recordContributor` (precedent #24) routes summaries through `normalizeSummary` at the API boundary as a single helper. D23's pattern recreates that surface 20 times instead of once.

**Current design:** Per-handler `XyzRequestSchema` + inline `safeParse` at handler entry.

**Alternative (DC1):** Centralized middleware. The spec's existing `json()` helper at `api-extension.ts:1029` is the precedent — every handler routes through it for response emission. Mirror that for request validation:

```ts
// packages/server/src/http/request-validation.ts
function withValidation<T>(schema: ZodSchema<T>, handler: (req, res, body: T) => Promise<void>) {
  return async (req, res) => {
    const body = await readJson(req);
    const result = schema.safeParse(body);
    if (!result.success) {
      errorResponse(res, 400, '/errors/invalid-request', 'Invalid request body', result.error.message);
      return;
    }
    return handler(req, res, result.data);
  };
}
```

Each handler then becomes `withValidation(XyzRequestSchema, async (req, res, body) => { ... })`. The validation can never be forgotten because the handler doesn't receive `req` until it's parsed.

**Trade-off:** Middleware approach: handlers can't be added without going through the wrapper (structural enforcement). Per-handler approach: handlers can be added without validation (review enforcement only — mirrors the same failure mode FR-3's `extractAgentIdentity` ordering risk has). Middleware also makes type narrowing automatic; per-handler requires every handler to remember the narrowing dance.

**Status:** CHALLENGED

**Suggested resolution:** Reopen D23. Apply parallel-design protocol (constraint: "validation cannot be forgotten by structure, not by review"). Either justify per-handler over middleware with constraints D23 doesn't currently enumerate, or migrate to middleware.

---

## Medium Severity

### [M] Finding 5: §14 risk mitigation "attribution-sweep-coverage.test.ts continues to enforce" misstates what the test enforces

**Category:** DESIGN
**Source:** DC2 (stakeholder gap)
**Location:** §14 row "IS6 migration disturbs `extractAgentIdentity` ordering on mutating handlers"; §13 IS6 risks; §16 (placeholder).

**Issue:** §14 lists this risk: *"IS6 migration disturbs `extractAgentIdentity` ordering on mutating handlers (precedent #24). Likelihood: Low. Impact: High. Mitigation: `attribution-sweep-coverage.test.ts` continues to enforce; reviewer adds explicit 'no `errorResponse` before `extractAgentIdentity` on mutating handlers' check during PR review."*

**The test does not enforce ordering.** Verified at `packages/app/tests/integration/attribution-sweep-coverage.test.ts:53-58`:

```ts
if (!body.includes('extractAgentIdentity(')) {
  failures.push(`${handler}: missing extractAgentIdentity call`);
}
```

It checks for the *presence* of the substring. It does not check ordering vs error responses. A migrated handler that calls `errorResponse(res, 400, ...)` before `extractAgentIdentity()` passes the test.

**Why this matters:** The current `handleUploadImage` (line 4686-4760) has 4 error returns BEFORE `extractAgentIdentity` (lines 4691, 4696, 4699, 4702 from JSON-body parse path; identity is extracted at line ~4731). If the IS6 migration normalizes the structure across handlers (e.g., a reviewer says "let's move `extractAgentIdentity` to the very top for consistency"), it could either:
- Move identity extraction earlier (good), or
- Be tempted to standardize on the existing pattern of "extract identity after body parse" (which means error responses for body-parse failures are anonymous — semantically OK, since "you sent an empty file" doesn't need attribution).

The spec doesn't take a position. The mitigation falls back to "reviewer checks during PR review" — exactly the mechanism that has historically failed (cycle 47-49 of PR #270 surfaced 3 drift items the spec itself cites in §4 P1's "pain points"). 1-way door risk relying on review discipline.

**Current design:** Implicit "review will catch it" + a test that doesn't actually catch it.

**Alternative:** Either (a) extend `attribution-sweep-coverage.test.ts` to assert `extractAgentIdentity` appears before any `errorResponse` 4xx/5xx call in mutating handlers (structural), or (b) pick an explicit policy in the spec (e.g., "errorResponse for body-shape failures is allowed pre-identity; for semantic failures must be post-identity") and add a STOP rule in CLAUDE.md.

**Status:** CHALLENGED

**Suggested resolution:** Update §14 mitigation to acknowledge what the test actually enforces; either harden the meta-test or pick an explicit policy.

---

### [M] Finding 6: FR6 `found → ok` rename is a category error — `lookup` results aren't operation results

**Category:** DESIGN
**Source:** DC1 (simpler alternative) — interface depth probe
**Location:** §10 D4 ("`ok` is canonical for result-discriminated unions"); §6 FR6; §13 IS3.

**Issue:** D4 / FR6 normalizes `AssetViewerLookupResult.found → ok` on the rationale that `ok` is the dominant pattern (HTTP + IPC, 30+ sites). But the semantic distinction between `ok` and `found` is load-bearing:

- `ok` (HTTP, IPC) — discriminates **operation result**: did the operation succeed or fail? `{ ok: true } | { ok: false; reason }` — failure carries actionable error metadata.
- `found` (registry lookup) — discriminates **lookup presence**: does an entry exist? `{ found: true; viewer } | { found: false }` — absence is a normal state, not a failure.

**The registry's `lookup()` is a total function that doesn't fail.** "No viewer registered for `.bin`" is not an error — it's the expected outcome that triggers fallthrough to OS dispatch. Renaming it `ok` semantically signals "the operation failed" when actually nothing failed.

This is consistent with the broader ecosystem:
- Java `Optional<T>.isPresent()` — not "isOk".
- Rust `HashMap::get` returns `Option<T>` — `Some` / `None`, not `Ok` / `Err`.
- TypeScript ecosystem: `Map.has()` / `Map.get()` — not "ok".

**Current design:** "Single field-name convention is canonical" — collapses operation-result and lookup-result into one shape.

**Alternative:** Keep `found` for lookup-shape unions; reserve `ok` for operation-shape unions. Document the distinction in PRECEDENTS.md or `packages/server/src/http/README.md` (FR16). Add a third pattern if a future case clearly fits neither.

**Trade-off:** Heterogeneous field names cost a moment of "wait, is this ok or found?" Homogeneous costs semantic precision. For a 1-reader site that the spec cites as low-cost migration, the precision win is also low — but the precedent set (single shape regardless of semantic kind) constrains future result types unnecessarily.

**Status:** CHALLENGED

**Suggested resolution:** Reopen D4. Either (a) keep `found` and document the distinction; or (b) commit to `ok` and update SPEC §6 to acknowledge the precedent foreclosure (future "Optional"-shaped DUs lose the semantic signal).

---

### [M] Finding 7: D26 Standard Schema convention sets a precedent without a single concrete consumer

**Category:** DESIGN
**Source:** DC3 (framing validity) — demand-reality probe
**Location:** §10 D26; §6 FR13; §3 NG2/NG7 deferral rationale.

**Issue:** D26 mandates `satisfies StandardSchemaV1<...>` on every Zod schema in `core/src/schemas/*` as a precedent. The spec acknowledges:
- §1 §3 NG7: MCP envelope alignment is deferred (no concrete trigger).
- §3 NG1: open `ProblemTypeToken` for wire is deferred (no SDK trigger).
- §4 P4: "Future SDK consumers — DEFERRED. User's `_user_outcomes.md`: 'No public-API trigger named.'"

**No In Scope consumer benefits from Standard Schema.** The repo has zero adoption today (verified). The cost is small per-schema (one annotation) but the *precedent commitment* is non-trivial: "every schema in `core/src/schemas/*` must export with `satisfies StandardSchemaV1<...>`."

When the trigger fires (SDK gen, oRPC adoption, Hono migration), the FIRST consumer's needs will shape what the convention should look like — Standard Schema v1 may not be what they need. Setting the precedent now constrains the future-trigger response without any feedback loop from a real consumer.

**The "two staff engineers, greenfield" framing applies to RFC 9457 and Standard Schema differently:**
- RFC 9457: established standard, well-understood semantics, broadly adopted (though not as broadly as the spec claims — Finding 2). Downside is wire shape lock-in.
- Standard Schema: nascent (~April 2026), v1 may evolve. Annotation today commits to v1 shape; if the consumer wants v2 or a Zod-native variant, the convention becomes drag.

**Current design:** Adopt now to "set the right precedent now while the count is bounded."

**Alternative (DC3):** Delete D26 / FR13. Add Standard Schema annotation when the FIRST concrete consumer (SDK, MCP wire migration, Hono adoption) needs it; at that point the consumer's shape requirements are known. The annotation is mechanically retrofittable across schemas — `core/src/schemas/*` is bounded at ~5 files today, even with full migration ~80 schemas. Adding an annotation later is a 1-line edit per schema.

**Trade-off:** Adopting now: consistency, zero-runtime-cost. Deferring: avoid premature commitment to a v1 spec that may evolve. The risk weights are small — but the user's intake explicitly tagged "no public-API trigger named" and D26 reaches past that filter.

**Status:** CHALLENGED

**Suggested resolution:** Reopen D26. Either (a) keep the annotation only for `ProblemDetailsSchema` (the wire-most-stable schema, low-risk) and defer the rest; or (b) delete the convention and rely on retrofit when the trigger fires. Document the trigger criteria in §15 Future Work — Noted.

---

### [M] Finding 8: FR14 telemetry counter naming `ok.http.error.count` violates CLAUDE.md "follow OTel semconv for `http.*`" guidance

**Category:** DESIGN
**Source:** DC2 (stakeholder gap) — operability
**Location:** §6 FR14; §10 D30; CLAUDE.md observability section ("namespace repo-specific attributes / metrics under `ok.*` ... and follow OTel semconv for `http.*` / `fs.*` / `db.*`").

**Issue:** The spec's metric name `ok.http.error.count` mixes the `ok.<area>` repo namespace with the `http.*` OTel semconv namespace. CLAUDE.md is explicit: *"namespace repo-specific attributes / metrics under `ok.*` / `agent.*` / `shadow.*` / `persistence.*` / `doc.*` / `config.*` and follow OTel semconv for `http.*` / `fs.*` / `db.*`."* Existing precedent: `api-extension.ts:182` defines `getMeter().createHistogram('http.server.request.duration', ...)` — pure OTel semconv name.

The spec's name conflates the two namespaces in a way that CLAUDE.md guidance routes against. Either the metric is HTTP-shaped (use `http.*` semconv — e.g., `http.server.errors` or extend `http.server.request.errors`) or it's a repo-internal counter (use `ok.*` and don't reuse `http.error` because semconv reserves the namespace).

**Cardinality math the spec cites is also slightly off:** "~80 ProblemTypes × ~57 handlers ≈ 285 unique combinations" — but ~80 is the future-projected enum size. Today's seed is the upload tokens (~8) plus per-handler tokens accumulated during migration. The realized cross-product in practice will be much smaller (most handlers emit 2-5 codes). Cardinality is fine, but the math presented as evidence is forward-projected, not measured.

**Current design:** `ok.http.error.count` with `type` + `handler` attributes.

**Alternative:** Either:
1. Pure semconv: extend the existing `http.server.request.duration` histogram with a `problem_type` attribute (low cardinality on the histogram bucket) — single metric, no new emission point.
2. Pure repo-internal: rename to `ok.api.error.count` (drop the `http` infix). Avoids the namespace conflation.
3. Drop FR14 — the existing histogram already partitions on HTTP status; add `problem_type` as a new attribute on the existing histogram if needed for triage.

**Trade-off:** Option 1/3 reuse existing infrastructure. Option 2 is a 5-character rename. The current name is a structural inconsistency that future readers will trip over.

**Status:** CHALLENGED

**Suggested resolution:** Reopen FR14 / D30. Pick a namespace and stick with CLAUDE.md guidance.

---

### [M] Finding 9: ~50-PR migration plan has no rollback or convergence-checkpoint strategy

**Category:** DESIGN
**Source:** DC2 (stakeholder gap) — SRE/maintainer
**Location:** §13 Deployment / rollout considerations table; §13 IS6 next actions; §16 Agent Constraints (placeholder).

**Issue:** §13 commits to *"Per-cluster PR cadence (PR2: agent-write paths; PR3: document-list/read paths; PR4: link-graph paths; etc.)."* With 57 handlers in clusters of 5-10, that's roughly 10-12 PRs after the foundation PR1, on top of IS1-IS5+IS7+IS8+IS9+IS10 PRs.

The spec doesn't address:

1. **What if PR3 introduces a regression discovered after PR7?** Stack-of-PRs implies sequential review and merge. Reverting PR3 without losing PR4-7 requires either (a) a clean cherry-pick rebase (risky if PR3 modified shared schemas in `core`), or (b) re-merging PR4-7 on the post-revert tip. No revert plan documented.

2. **What if RFC 9457 turns out wrong (Findings 1-2) after 5 PRs are merged?** The wire-shape change is partial — some handlers RFC 9457, some still `{ ok, error }`. Reverting requires undoing ~5 cluster PRs while leaving IS1-IS5 in place. Cost grows with each merged PR.

3. **What's the convergence checkpoint?** Spec doesn't define a "halt and reassess" trigger. If PR4 reveals that 3 handlers don't fit the canonical pattern (existing precedent for streaming endpoints `application/x-ndjson` at lines 5054, 5359, 5569), the migration may need to fork. No mechanism to surface this.

4. **What does the meta-test that "fails on any remaining inline `json(res, ...)` call" gate?** §13 IS6 next-actions says *"Final PR removes any remaining inline `json(res, ...; { ok: false, ... })` sites and the meta-test (if Q11 chooses to add one) flips to fail-on-any-occurrence."* Until that final PR lands, no meta-test enforces. An incomplete migration is shippable.

**Current design:** Stacked PRs, mechanical review, IS6 risks listed but no rollback or checkpoint strategy.

**Alternative:**
1. **Add a meta-test from PR1 that maintains an allowlist** of unmigrated handlers (mirrors `attribution-sweep-coverage.test.ts`'s pattern). PR1 ships allowlist with all 56 unmigrated handlers; each cluster PR removes its handlers from the allowlist. The final PR removes the allowlist entirely. This guarantees no regression of already-migrated handlers and provides a measurable convergence signal.
2. **Define a rollback unit** — each cluster PR is a single revert unit. Document this as a STOP rule (don't share schemas across cluster PRs in `core`; keep cluster shape edits local).
3. **Define a checkpoint trigger** — after PR1+PR2 merge, run the migration on one streaming endpoint (`/api/agent-flash` SSE, `/api/agent-effects` NDJSON?) to validate the canonical pattern handles streaming. Halt if it doesn't.

**Trade-off:** Meta-test + allowlist adds ~50 LoC of test infrastructure but turns "review caught it" into "CI caught it." Rollback discipline is process documentation, low cost.

**Status:** CHALLENGED

**Suggested resolution:** Add allowlist-based meta-test to IS6 PR1; document rollback unit in §13; pick a checkpoint trigger.

---

## Low Severity

### [L] Finding 10: §1 Resolution + §6 FR2 use relative URI references; RFC 9457 §3.1.1 itself recommends absolute URIs

**Category:** DESIGN
**Source:** DC2 (stakeholder gap) — future-maintainer
**Location:** §6 FR2 ("relative URI references of form `/errors/<kebab-token>`"); §10 D21 ("relative-URI reference of form `/errors/<kebab-action-or-condition>`").

**Issue:** RFC 9457 §3.1.1 says: *"It is RECOMMENDED that absolute URIs be used in 'type' when possible. When relative URIs are used, they include the full path. In particular, the use of relative URIs that include only the path component can be confusing because the resolution depends on the base URI of the resource."*

The spec uses relative URIs (`/errors/<kebab>`) — explicitly the "path-only" shape RFC 9457 calls out as confusing. If the OK server is ever proxied or path-prefixed (e.g., embedded under `/ok-app/api/...`), the relative URI changes meaning. Future readers parsing `type: '/errors/storage-full'` will interpret it relative to the request URI's base.

**Current design:** `'/errors/<kebab>'` (path-only relative URI).

**Alternative:** Either:
1. Use a stable URN: `'urn:ok:error:storage-full'` — independent of HTTP routing, RFC 9457-compliant, can't be path-confused.
2. Use absolute URI: `'https://open-knowledge.dev/errors/storage-full'` — but the domain doesn't exist as documentation today; it's a forward-looking placeholder.
3. Use plain kebab tokens (`'storage-full'`) and acknowledge the spec deviates from RFC 9457's URI guidance — which would itself be a strong argument for not adopting RFC 9457 letter (Finding 2).

**Trade-off:** URN gives a stable identifier without URL routing concerns. Absolute URI ties the contract to a domain. Kebab tokens are simplest but non-compliant.

**Status:** CHALLENGED

**Suggested resolution:** If RFC 9457 stays adopted (Finding 2 unresolved), use URN form for `type`. Document the choice in `packages/server/src/http/README.md` (FR16).

---

### [L] Finding 11: §13 IS5 framing claims "introduces typed-reason consumption where none exists" — but the client already discriminates on HTTP status

**Category:** DESIGN
**Source:** DC3 (framing validity) — Complication intersection
**Location:** §1 Complication item 2; §13 IS5 goal; `evidence/verified-current-state.md` C1.

**Issue:** The spec corrects worldmodel's earlier claim ("client parses `e.message` substring back to `UploadWriteReason`-shaped value") via C1 in `verified-current-state.md`. But the corrected framing — *"The hardening introduces typed-reason consumption where none currently exists"* — overstates the value proposition.

Verified at `image-upload/index.ts:316`:

```ts
if (!res.ok) {
  // Server-side reasons the upload rejects a request ... all populate `message` with
  // a human-readable form. Fall through to a generic shape only if the
  // response lacks one.
  const message = body.message ?? body.error ?? `Upload failed (${res.status})`;
  console.error('[uploadAndInsert] Server error:', message);
  showError(editor, uploadId, message);
  return;
}
```

The client *does* discriminate on `res.ok` (HTTP status) and *does* read the structured body for a display string. What it doesn't do is route on a typed `code` field — but it doesn't need to today. The current client has one error UX path: log + showError(message). There's no branching on reason.

**Why this matters:** The spec's value proposition for IS5 (FR4 acceptance) is *"Compile-time link from server-emitted `type` token to client-narrowed `result.data.type`."* But the client doesn't *use* the type for branching — it uses it only for display (now via `result.data.title` per FR4). The "compile-time link" benefit accrues only IF a future client adds branching logic.

The spec's §7 Success metrics says: *"Adoption signal (qualitative). Next 2-3 new HTTP routes ... reuse `errorResponse` helper or its pattern."* This conflates "server-side helper adoption" (real) with "client-side typed narrowing adoption" (speculative).

**Current design:** Frame IS5/FR4 as "introduces typed narrowing where none exists" — implies a load-bearing client-side win.

**Alternative:** Reframe IS5/FR4 as "tightens the wire contract for FUTURE client-side branching while leaving the current display-only client behavior unchanged." Move the load-bearing value to the SERVER side (typed `code` union, helper consolidation, telemetry) — that's where the actual win lives. The client-side typed narrowing is option-value insurance, not a current-day win.

**Trade-off:** More accurate framing; reveals that IS5 is mostly server-side benefit; weakens the "type-erasure elimination (binary)" success metric (§7) since erasure was never actually consumed.

**Status:** CHALLENGED

**Suggested resolution:** Sharpen §1 Complication 2, §7 success metric, and §13 IS5 goal to acknowledge what's actually shipping changes. Doesn't change scope; clarifies value attribution.

---

## Confirmed Design Choices (summary)

These design choices were probed across DC1/DC2/DC3 and held up:

**DC1 (simpler alternative) — held:**
- D9 `assertNeverLinkTarget` per-DU helper (vs single shared `assertNever`) — codebase precedent (`assertNeverDiskEvent`) is per-DU; per-DU gives clearer error messages; matches existing convention.
- D10 `AssetViewerRegistry.register()` returns unregister fn — matches React 19 ref-callback cleanup idiom; the alternative (no unregister) makes hot-reload tests harder and was rejected with adequate evidence.
- D17 schema smoke-test as co-located unit test (not module-load top-level) — `/tdd` evidence is sound; module-load brittleness is real.
- D20 per-handler success schemas + shared error envelope — wire-compatible (vs Option B `ApiResponse<TData>` generic which is wire-breaking); evidence in `decision-grounding-q20-q22.md` is conclusive.
- D2 S6 IPC reason-union out of scope until PR #354 sequences — defensible given PR #354 is seeded.
- NG10 branded types — heuristic doesn't trigger; well-reasoned "no" not deferred.

**DC2 (stakeholder gap) — held:**
- D24 `handleUploadImage → handleUploadAsset` rename — function name reflects route; cosmetic but architecturally correct.
- D31 `HttpResponseParseError` class — matches existing repo error-class precedent; covers a real client-side gap.
- §14 risk row "PR #354 stalls" — explicit mitigation (NG5 14-day expiry trigger).
- D29 PR coordination plan — concrete dates and channels.

**DC3 (framing validity) — held:**
- The Situation framing of "PR #270 just merged 8 contract surfaces" is well-grounded in `evidence/_init_worldmodel.md`.
- The Complication item 1 ("inherited drift from nearest existing site") is well-grounded in cycle-47-49 review evidence.
- Persona P3 (operators triaging Pino logs) is concrete and pulls weight.
- NG7 (MCP envelope divergence) is correctly framed — MCP's `{ content, isError? }` is a different transport contract.

---

## Cross-cutting observation

Findings 1, 2, 3, 4, 7, 8, and 11 cluster around the **batch-4/5 "greenfield no deferred tech debt" reframing** that promoted NG2 (RFC 9457), NG8 (lint via type-test), NG9 (negative type tests), and added D23 (per-handler request schemas), D26 (Standard Schema convention), D27 (CLAUDE.md docs), D30 (telemetry counter), D31 (parse-error class).

The batch-1/2/3 decisions (D5-D21) were grounded in detailed evidence files (`decision-grounding-q1-q6.md`, `decision-grounding-q20-q22.md`, type-safety cross-reference). The batch-4/5 promotions cite evidence less concretely — most rationale is "two staff engineers would do this in greenfield" or "set the right precedent." That asymmetry is worth surfacing because it shifted the spec's center of mass from "harden the contract surfaces PR #270 shipped" (the user's intake framing) to "adopt RFC 9457 + StandardSchema + lint-equivalent type tests + central docs + telemetry counter" — a substantially larger scope that the user didn't originally direct.

The user's intake framing in `evidence/_user_outcomes.md` is unambiguous: *"code-health polish AND general hardening before the next round of capability work touches these surfaces — pick a defensible cut. Items where the trigger is 'going public' or 'MCP exposure of upload' without a concrete next surface stay as Future Work pointers."* The greenfield reframing should be re-tested against that filter — particularly D22 (RFC 9457), D26 (Standard Schema), and FR12 (per-handler request schemas), all of which serve hypothetical future consumers without a concrete trigger.

This is not an argument for reverting batch-4/5 decisions wholesale — D24 (rename), D27 (docs), D31 (parse-error class) hold up well. It is an argument for re-stress-testing the wire-shape and scope-expanding decisions (D22, D23, D25, D26) against the user's original framing before locking them.
