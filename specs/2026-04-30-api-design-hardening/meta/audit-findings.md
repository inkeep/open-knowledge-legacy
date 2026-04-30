# Audit Findings — API Design Hardening Spec

**Artifact:** `specs/2026-04-30-api-design-hardening/SPEC.md`
**Audit date:** 2026-04-30
**Total findings:** 19 (5 high, 9 medium, 5 low)

---

## Summary

The spec's load-bearing math is solid (57 handlers, 256 error sites, 98 distinct error strings, 286 migration sites, 39965/40000 CLAUDE.md char count, line-level pinning of `extractAgentIdentity`, `assertNeverDiskEvent`, `image-upload/index.ts:323`, `dispatcher.ts:67` — all verified against current code). The high-severity findings cluster around **the batch-4 RFC 9457 amendment failing to cascade through every section**: §1, §6 FR1-FR4, §10 D22, §13 IS1, §13 IS7, §15 OS2 are all consistently RFC 9457; but §4, §5, §7, §9, §10 D6-D8, §13 IS5, §13 deployment table, §14 risks, §15 OS1 still describe the **pre-amendment** envelope (`UploadResponseSchema` discriminated on `ok`, nested `error: { code, message, instance }`, separate `core/src/schemas/upload.ts` file, "Adopt RFC 9457 — Rejected"). A reader cannot tell which envelope the spec actually adopts. These are decision-implicating in the literal sense — §9 Alternative A explicitly says RFC 9457 was *rejected*, while D22 explicitly LOCKS it.

A handful of factual claims propagated from worldmodel are stale or wrong (`cc1.ts` does not contain `z.discriminatedUnion`; the actual precedent is `packages/core/src/config/errors.ts:52`; PR #380 has merged since the evidence was captured today; `cc1.ts` has 6 schemas not 10; `cli/mcp/tools/*` has 24 Zod files not 21). Three smaller cascade gaps follow from D24 (handler rename) not propagating into §13 IS6 / §9 affected-files / §3 NG3.

The decisions themselves are well-grounded; the cascade discipline broke down on batch 4.

---

## High Severity

### [H1] §9 Alternative A directly contradicts D22 LOCKED

**Category:** COHERENCE (decision-implicating)
**Source:** L1 (cross-finding contradiction), L5 (summary coherence)
**Location:** SPEC.md §9 Alternatives Considered (line 226) ↔ §10 D22 (line 256), §3 NG2 (line 44)
**Issue:** §9 lists Alternative A as: "Adopt RFC 9457 Problem Details now. **Rejected** — no multi-language consumer demand (NG2). Defer until external SDK ships." But §10 D22 LOCKS full RFC 9457 adoption, and §3 NG2 is struck through ("PROMOTED to In Scope"). Within the same document, RFC 9457 is simultaneously the LOCKED resolution and a Rejected alternative.
**Current text:** Line 226: `**Alternative A:** Adopt RFC 9457 Problem Details now. **Rejected** — no multi-language consumer demand (NG2). Defer until external SDK ships.`
**Evidence:** §10 D22 (line 256): "**Adopt RFC 9457 Problem Details in full.** … LOCKED"; §3 NG2 (line 44): "~~**[NOT NOW]** **NG2: RFC 9457 Problem Details adoption.**~~ **PROMOTED to In Scope** as D22 / FR1 / FR3 / IS1 / IS6"
**Status:** INCOHERENT
**Suggested resolution:** Either delete Alternative A, replace it with the actually-rejected alternative (the original `{ ok, error }`-only "Option A upload-only" cut from batch 1), or rewrite to reflect D22's adoption and explain what was actually rejected (e.g., per-handler bespoke error envelopes, or a custom typed-but-non-RFC envelope).

---

### [H2] §9 System design data flow describes pre-RFC-9457 envelope shape

**Category:** COHERENCE (decision-implicating)
**Source:** L1 (cross-finding contradiction), L4 (evidence-synthesis fidelity)
**Location:** SPEC.md §9 System design (lines 193-209) ↔ §10 D22 (line 256), §6 FR1 (line 126)
**Issue:** §9 describes the wire shape as `error: string` → `error: { code: UploadErrorCode, message: string, instance?: string }` — a **nested** envelope under `error`. D22 specifies **flat** RFC 9457: `{ type, title, status, instance?, detail? }` at the top level with `Content-Type: application/problem+json`. The data flow paragraph (line 203) says success is `UploadResponseSchema.parse({ ok: true, src, deduped?, sha?, byteLength? })` — but D22 drops the `ok: true` wrapper. The "Failure modes" table refers to "emit a code not in the typed union" using "code" terminology (D14/D22 renamed to `type`).
**Current text:** Line 196: `error path tightens (\`error: string\` → \`error: { code: UploadErrorCode, message: string, instance?: string }\`)`. Line 203: `server emits \`UploadResponseSchema.parse({ ok: true, src, deduped?, sha?, byteLength? })\``.
**Evidence:** §10 D22 (line 256): "Wire shape: success → `{ ...data }` flat (no `ok: true` wrapper, content-type `application/json`); error → `{ type: '/errors/<kebab-token>', title: required English, status: int, instance?: UUID, detail?: string }`"
**Status:** INCOHERENT (stale)
**Suggested resolution:** Rewrite §9 §System design / §Data flow / §Failure modes to use the RFC 9457 wire shape ({type, title, status, instance, detail}, application/problem+json content-type, success drops `ok: true`). Replace `UploadResponseSchema` with `ProblemDetailsSchema` + `UploadAssetSuccessSchema`. Replace "code" with "type" and "message" with "title" throughout this section.

---

### [H3] §13 IS5 + §13 deployment table use pre-RFC-9457 schema names extensively

**Category:** COHERENCE (decision-implicating)
**Source:** L1 (cross-finding contradiction), L8 (terminology consistency)
**Location:** SPEC.md §13 IS5 (lines 351-359), §13 deployment table (lines 415-417), §6 FR4 (line 129) ↔ §10 D22 (line 256), §13 IS1 (lines 311-315)
**Issue:** IS5 still references `UploadResponseSchema` (and instructs client to read `result.data.error.code` for routing + `result.data.error.message` for display). FR4 — written *correctly* post-batch-4 — instead uses `safeParse(ProblemDetailsSchema, body)` for errors and `safeParse(UploadAssetSuccessSchema, body)` for success (the RFC 9457 two-step parse pattern). IS5 and FR4 disagree on the very thing IS5 implements. The deployment table compounds this: row 1 mentions `core/src/schemas/upload.ts`; rows 2-3 mention `bun test packages/core/src/schemas/upload.test.ts` and `StandardSchemaV1<UploadResponse>`. IS1 says schemas live in `core/src/schemas/api.ts` and the smoke-test in `api.test.ts`. The two sections are mutually contradictory.
**Current text:** Line 356 (IS5): `Client (\`image-upload/index.ts\` + \`upload-file.ts\`) uses \`safeParse(UploadResponseSchema, body)\`; on \`success: true\` reads \`result.data.error.code\` … Hand-rolled \`UploadResponseBody\` lookalike retired in favor of \`z.infer<typeof UploadResponseSchema>\`.`
**Evidence:** §6 FR4 (line 129): `uses HTTP-status discrimination first (\`if (!res.ok)\`), then \`safeParse(ProblemDetailsSchema, body)\` for error narrowing OR \`safeParse(UploadAssetSuccessSchema, body)\` for success narrowing — the standard RFC 9457 two-step parse pattern`
**Status:** INCOHERENT (stale)
**Suggested resolution:** Rewrite IS5's "Proposed solution" + deployment-table rows 1-3 to use the RFC 9457 two-step parse pattern from FR4. Replace `UploadResponseSchema` with `ProblemDetailsSchema` + `UploadAssetSuccessSchema`; replace `core/src/schemas/upload.ts` with `core/src/schemas/api.ts`; replace `upload.test.ts` with `api.test.ts`; replace `result.data.error.code` with `result.data.type` and `result.data.error.message` with `result.data.title`.

---

### [H4] §10 D6, D7, D8 still describe pre-amendment schemas

**Category:** COHERENCE (decision-implicating)
**Source:** L1 (cross-finding contradiction), L8 (terminology)
**Location:** SPEC.md §10 D6 (line 240), D7 (line 241), D8 (line 242) ↔ D22 (line 256), D26 (line 260), D21 (line 255)
**Issue:**
- **D6** says "`UploadResponseSchema` ships as a single default `z.discriminatedUnion('ok', [...])` with `z.object` members." But D22 drops the `ok: true` wrapper, so the discriminator on `ok` no longer exists. Plus `UploadResponseSchema` has been replaced by `ProblemDetailsSchema` + per-handler success schemas (D20).
- **D7** says "`UploadResponseSchema` exported with `satisfies StandardSchemaV1<UploadResponse>`". D26 generalized this to *every* `core/src/schemas/*` schema; D7 is now a stale specific case of D26 referencing a schema name that no longer exists.
- **D8** says `UploadWriteReason` (server) and `UploadErrorCode` (wire) unify as "the wire union". D21 + D22 renamed the wire union to `ProblemTypeSchema` (kebab → relative-URI tokens like `/errors/malformed-upload`); the rationale (eliminate type-erasure) survives, but D8's literal references are stale.
None of these decisions has been struck through, amended, or marked superseded — they sit alongside D22/D26 in the Decision Log as if both are active.
**Current text:** Lines 240-242 — Decision Log table rows for D6, D7, D8.
**Evidence:** §10 D22 (line 256), D26 (line 260), D21 (line 255).
**Status:** INCOHERENT (stale)
**Suggested resolution:** Either (a) strike through D6/D7 entirely with a "superseded by D22/D26" note (matching how D11 was promoted to D24), or (b) rewrite the descriptions to: D6 → `UploadAssetSuccessSchema = z.object(...).loose()` plain object (no `ok` discriminator post-D22); D7 → strike, since D26 generalized; D8 → amend to `UploadWriteReason` aligns 1:1 with `ProblemTypeSchema` upload-side tokens.

---

### [H5] Pervasive stale references to pre-RFC-9457 names across §4, §5, §7, §14, §15

**Category:** COHERENCE / FACTUAL
**Source:** L8 (terminology consistency), L5 (summary coherence)
**Location:** SPEC.md §4 line 62; §5 lines 91, 117; §6 NFR cost line 149; §7 line 154; §9 affected-files lines 183, 186, 188; §14 risks line 425; §15 OS1 line 439
**Issue:** Beyond the §9 / §13 IS5 / D6-D8 stale clusters listed in H2-H4, the following individual references to obsolete names remain:
- §4 P1 success criteria (line 62): "reuses `UploadResponseSchema` import"
- §5 P1.1.2 (line 91): "Imports `UploadResponseSchema`"; P1.1.3 (line 92): example helper signature is 3-arg `errorResponse(res, 400, 'malformed-input', 'Field X is required')` — but FR3 specifies 5-arg `(res, status, type, title, detail?, instance?)` and uses `/errors/malformed-input` relative-URI not bare `'malformed-input'`
- §5 interaction state matrix row 1 (line 117): `UploadResponseSchema parse on client`
- §6 NFR Cost (line 149): "`UploadResponseSchema` adds < 1KB gzipped"
- §7 Drift catch (line 154): "Adding a new variant to `ClassifiedLinkTarget`, `UploadErrorCode`, or `UploadResponseSchema` produces TypeScript errors"
- §9 Affected files row 1 (line 183): `packages/core/src/schemas/upload.ts (new)` — but D15 says schemas live in `core/src/schemas/api.ts`; no new `upload.ts` file is referenced anywhere else
- §9 Affected files row 5 (line 187): annotation `(handleUploadImage / handleUploadAsset rename DELEGATED)` — D24 LOCKED the rename; "DELEGATED" is stale
- §9 Affected files row 6 (line 188): `Use safeParse(UploadResponseSchema, body)`
- §14 risks row 1 (line 425): `Zod v4 footgun 7 (lazy DU member validation) breaks UploadResponseSchema silently` — also references `members are z.object` review checklist for a DU that no longer exists post-D22
- §15 OS1 (line 439): `Open UploadErrorCode for wire (open enum / (string & {}))`
- §7 success metric "Type-erasure elimination" (line 155): instructs `grep -n "e.message" packages/app/src/editor/image-upload/` to verify "no upload-error-parse hits". But evidence/verified-current-state.md C1 verified that no `e.message` substring parsing ever existed — the metric tests for the absence of something that was never present.
**Status:** INCOHERENT (stale)
**Suggested resolution:** Single sweep: rename `UploadResponseSchema` → `UploadAssetSuccessSchema` (success path) or `ProblemDetailsSchema` (error path) per context; rename `UploadErrorCode` → upload-side subset of `ProblemTypeSchema`; rewrite §9 affected-files row 1 to match D15/IS1 (no new `upload.ts`); strip "DELEGATED" annotation; rewrite the §7 type-erasure metric to test the *introduction* of typed narrowing per evidence/verified-current-state.md C1's "the hardening introduces typed-reason consumption where none currently exists."

---

## Medium Severity

### [M1] Worldmodel + SPEC §1 cite cc1.ts as the `z.discriminatedUnion` precedent — wrong file

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md §1 Situation (line 22) → derived from `evidence/_init_worldmodel.md` §5.2 (line 128, 131) and §10 (line 200)
**Issue:** §1 lists "`z.discriminatedUnion` precedent in `core/src/schemas/cc1.ts`" as a convergent codebase pattern. Verified `packages/core/src/schemas/cc1.ts` contains **6 exported schemas** — five `z.object(...)` payloads and one `z.enum(...)` channel union. **No `z.discriminatedUnion` exists** in that file. Each payload pins `ch: z.literal(<channel>)` independently; they are never composed into a `discriminatedUnion`.
**Evidence:** `grep -nE "discriminatedUnion" packages/core/src/schemas/cc1.ts` returns zero hits. The actual `z.discriminatedUnion` precedent in this repo is `packages/core/src/config/errors.ts:52` (`KnownConfigValidationErrorSchema = z.discriminatedUnion('code', [...])` with 4 variants).
**Status:** CONTRADICTED
**Suggested resolution:** Update §1 to cite `core/src/config/errors.ts:52` (`KnownConfigValidationErrorSchema`) as the actual `z.discriminatedUnion` precedent. Fix `evidence/_init_worldmodel.md` §5.2 ("10 schemas in a `discriminatedUnion('ch', [...])`") and §10 (divergence row reasoning) accordingly. The principle (codebase has discriminator-pattern precedent) survives unchanged; only the location reference is wrong.

---

### [M2] cc1.ts schema count inflated (10 vs actual 6)

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md §8 (line 169): "moderate in `core/src/schemas/{api,cc1}.ts` (12 schemas total)" — derived from `evidence/_init_worldmodel.md` §5.2 line 128
**Issue:** Worldmodel says cc1.ts has "10 schemas in a `discriminatedUnion('ch', [...])`". Verified count: cc1.ts has **6 exported schemas** (`DerivedViewChannelSchema`, `CC1ServerInfoPayloadSchema`, `CC1BranchSwitchedPayloadSchema`, `CC1DerivedViewPayloadSchema`, `CC1DiskAckPayloadSchema`, `CC1ConfigValidationRejectedPayloadSchema`). api.ts has 2. Total: 8, not 12.
**Evidence:** `grep -cE "^export const.*Schema = z" packages/core/src/schemas/cc1.ts` returns 6 (5 + DerivedViewChannelSchema). api.ts has 2 (`ServerInfoResponseSchema`, `PrincipalResponseSchema`).
**Status:** CONTRADICTED
**Suggested resolution:** Fix §8 to "8 schemas total (api.ts: 2, cc1.ts: 6)". Doesn't affect any decision; the existence of Zod precedent is the load-bearing claim, and that survives.

---

### [M3] PR #380 has merged since evidence was captured today

**Category:** FACTUAL (stale)
**Source:** T4 (web/external state)
**Location:** SPEC.md §1 line 22; §3 NG6 line 48; §10 D29 line 263; §12 A2 line 302; §14 line 430; §15 OS4 line 442; `evidence/verified-current-state.md` C4
**Issue:** Evidence at `evidence/verified-current-state.md` C4 (captured today, 2026-04-30) lists PR #380 as OPEN with last update 2026-04-30 10:04. As of audit (later same day), `gh pr view 380` returns `state: MERGED, updatedAt: 2026-04-30T10:09:39Z`. SPEC §3 NG6 explicitly says "Concurrent work owns that surface; this hardening's claim would create merge conflict and slow both. … The three PRs land first; subsequent hardening (if needed) is a follow-on spec." — one of the three has now landed. A2 ("Open PRs #380 / #374 / #372 … land before this hardening's IS6 cluster PRs") — partially fulfilled. NG6's "all three are in-flight" framing is stale.
**Evidence:** `gh pr view 380 --json state,updatedAt,title` → `{"state":"MERGED","updatedAt":"2026-04-30T10:09:39Z", "title": "feat(cb-v2): Notion-style empty-state placeholder for canonical descriptors"}`
**Status:** STALE
**Suggested resolution:** Refresh §3 NG6 to note "two of three remain open (#374 Mermaid, #372 Math); #380 placeholder merged 2026-04-30". Update §12 A2's verification plan to track only the remaining two PRs. The structural decisions don't change (NG6 still defers JsxComponentMeta polish), but the framing should reflect current state. Refresh `evidence/verified-current-state.md` C4 with the merge date.

---

### [M4] §13 IS5 Requirements: "FR8 (links to D8)" is a stale FR cross-reference

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** SPEC.md §13 IS5 (line 355) ↔ §6 FR8 (line 133), §10 D8 (line 242)
**Issue:** IS5 lists Requirements as "FR3, FR4, FR8 (links to D8)". FR8 (line 133) is "AssetViewerRegistry warns on extension-key collision; documents 'last-registered wins'" — a viewer-registry requirement, unrelated to upload typed-reason consumption. D8 (line 242) is "UploadWriteReason and UploadErrorCode unify". The "(links to D8)" annotation makes sense for the upload reason-sharing logic; FR8 is the wrong FR cross-reference. Likely an old-spec artifact (where FR-numbering may have been different) that wasn't updated. The Requirements row should probably reference FR1, FR2, or FR15 (HttpResponseParseError) — none of which match either.
**Current text:** Line 355: `**Requirements:** FR3, FR4, FR8 (links to D8).`
**Evidence:** §6 FR8 (line 133); §10 D8 (line 242).
**Status:** INCOHERENT
**Suggested resolution:** Either delete the "FR8" reference (FR3 + FR4 already cover the typed-narrowing work; D8 is the underlying decision) or replace it with the appropriate FR (FR15 for `HttpResponseParseError` is the closest semantic match, since it's the upload client's parse-failure path).

---

### [M5] Function rename inconsistency: D24 LOCKED but IS6 still says `handleUploadImage`

**Category:** COHERENCE
**Source:** L1, L8
**Location:** SPEC.md §13 IS6 (line 368) ↔ §10 D24 (line 258); also §9 affected-files (line 187)
**Issue:** D24 (line 258) LOCKED the rename `handleUploadImage → handleUploadAsset` and says "Implementer renames in IS6's PR1 alongside the helper extraction". §13 IS6 next-actions (line 368): "PR1: `core/src/schemas/upload.ts` or sibling, `packages/server/src/http/error-response.ts`, smoke test, `handleUploadImage` migration as the canonical example" — keeps the old function name. §9 affected files (line 187) annotates the row as "(`handleUploadImage` / `handleUploadAsset` rename DELEGATED)" — but D24 promoted to LOCKED.
**Evidence:** §10 D24: "`handleUploadImage → handleUploadAsset` rename — promoted from D11 DELEGATED to LOCKED"
**Status:** INCOHERENT
**Suggested resolution:** §13 IS6 PR1 step → change `handleUploadImage` to `handleUploadAsset` (or "the renamed handleUploadAsset (formerly handleUploadImage, per D24)"). §9 affected-files row 5 → strip "DELEGATED" annotation.

---

### [M6] Route name inconsistency: NG3 says `/api/upload-asset`, OS3 says `/api/upload`

**Category:** FACTUAL / COHERENCE
**Source:** T1 (own codebase), L8 (terminology consistency)
**Location:** SPEC.md §3 NG3 (line 45) ↔ §15 OS3 (line 441)
**Issue:** NG3 and OS3 both reference the Idempotency-Key Future Work item, but use different route paths:
- NG3: `Idempotency-Key header support on POST /api/upload-asset.`
- OS3: `Idempotency-Key header support on POST /api/upload.`

Verified actual route registration in `packages/server/src/api-extension.ts`: the route path is `/api/upload`. D24's rename (`handleUploadImage → handleUploadAsset`) is a function-name rename only; it does not change the HTTP route path. NG3's route name is wrong; OS3 is correct.
**Evidence:** Worldmodel S1 row: "`POST /api/upload` handler"; SPEC §1 line 22: "`POST /api/upload` + envelope"; D24 explicitly says "renames in IS6's PR1 alongside the helper extraction; updates internal references; updates JSDoc" — does not mention route-path change.
**Status:** INCOHERENT
**Suggested resolution:** Change NG3's route path from `/api/upload-asset` to `/api/upload`. (Or, if a route-path rename is desired, add it to D24 as an explicit additional cascade and update §1, NG3, OS3, IS6, IS7 consistently — but that would expand scope.)

---

### [M7] FR2 acceptance seed token list omits `collision-exhaustion`

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md §6 FR2 (line 127) ↔ `packages/server/src/upload-errors.ts:14-19`, `packages/server/src/api-extension.ts:4976`
**Issue:** FR2 acceptance lists upload-side seed tokens: `/errors/malformed-upload`, `/errors/storage-full`, `/errors/storage-readonly`, `/errors/storage-error`, `/errors/no-file-received`, `/errors/parent-doc-name-required`, `/errors/path-escape`, `/errors/method-not-allowed`. The first four match four of the five `UploadWriteReason` variants. The fifth variant — `collision-exhaustion` — is missing from the seed list, but it IS emitted: `api-extension.ts:4976`: `json(res, 500, { ok: false, error: 'collision-exhaustion' })`. Implementer building the seed `ProblemTypeSchema` from FR2 alone would miss this token.
**Evidence:** `packages/server/src/upload-errors.ts:14-19` defines the 5-variant union; `packages/server/src/api-extension.ts:4976` emits `collision-exhaustion`.
**Status:** CONTRADICTED (incomplete)
**Suggested resolution:** Add `/errors/collision-exhaustion` to FR2's upload-side seed list. (Or remove all upload-specific tokens from FR2 and replace with "all five UploadWriteReason variants plus the cross-handler shared tokens" pointing at upload-errors.ts as source of truth.)

---

### [M8] §8 "21 files" Zod count for cli/mcp/tools is wrong

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md §8 (line 169): "Zod v4 adoption: heavy in `cli/mcp/tools/*` (~21 files)"
**Issue:** `grep -lr "from 'zod'" packages/cli/src/mcp/tools/ | wc -l` returns 24 (verified by sub-agent). The "~21 files" claim is off by 3. The `~` hedge softens this but it's a literal undercount.
**Evidence:** Sub-agent verification.
**Status:** STALE / inaccurate
**Suggested resolution:** Update §8 to "(~24 files)" or remove the count and say "every MCP tool defines its own Zod schema". Doesn't affect any decision (Zod is broadly adopted in CLI either way), but the literal count is wrong.

---

### [M9] §1 Situation + §8 "30+ HTTP sites" understates by an order of magnitude

**Category:** FACTUAL
**Source:** T1 (own codebase), L7 (inline source attribution)
**Location:** SPEC.md §1 Situation (line 22), §8 (line 162); originated `evidence/_init_worldmodel.md` line 110
**Issue:** Worldmodel claim is **scoped** to three handlers: "Repo-wide error envelope convention is `{ ok: true, data... } | { ok: false, error: string }` — confirmed across api-extension.ts (~30+ sites just in handleAgentWriteMd / handleAgentPatch / handleAgentUndo)" (worldmodel line 110 — emphasis added; "just in" qualifier). SPEC §1 line 22 propagates as "`{ ok, error }` envelope across 30+ HTTP sites" — drops the 3-handler qualifier. SPEC §8 line 162: "(verified 30+ sites in `api-extension.ts`)" — same dropped qualifier. Actual counts: **256 error sites + 30 success sites = 286 sites total**. "30+" is technically not false (256 > 30) but is misleading: a reader computing migration scope from §1 alone might see "30+" and think it's a 30-row task; the migration math elsewhere (FR3, D22) correctly says ~256/~286.
**Evidence:** `grep -cE "json\(res, [0-9]+, \{ ok: false, error:" packages/server/src/api-extension.ts` → 256; `grep -cE "json\(res, [0-9]+, \{ ok: true," packages/server/src/api-extension.ts` → 30. Total = 286.
**Status:** STALE / misleading
**Suggested resolution:** §1 → "`{ ok, error }` envelope across **256 error sites** + 30 success sites in `api-extension.ts`"; §8 → same; or restore the worldmodel's original handler-scoped framing.

---

## Low Severity

### [L1] `crypto.randomUUID()` "4 places in repo" is undercounted

**Category:** FACTUAL
**Source:** T1
**Location:** `evidence/decision-grounding-q1-q6.md` §Q1 lines 54-60
**Issue:** Evidence claims "Already used 4 places in repo with no import" and lists 4 specific files. Actual count (excluding tests, comments, JSDoc): **7+** — including `packages/app/src/editor/image-upload/index.ts:284`, `packages/app/src/editor/tab-identity.ts:12`, beyond the 4 listed.
**Evidence:** `grep -rnE "crypto\.randomUUID\(\)" --include="*.ts" packages/` (filtered for non-test, non-comment).
**Status:** STALE / minor undercount
**Suggested resolution:** Update evidence to say "available globally; in current use across both server (config-persistence, persistence) and client (image-upload, tab-identity, etc.) code paths". Doesn't affect Q1 → D13 (UUID per emit).

---

### [L2] `ipc-channels.ts` "22 channels" claim is stale

**Category:** FACTUAL
**Source:** T1
**Location:** `evidence/_init_worldmodel.md` row S6 (citing the file's own comment); SPEC §8 line 168 doesn't pin a specific count, so SPEC itself is fine
**Issue:** Worldmodel relays the in-file comment "Currently 22 — past the trigger". Actual count of channel keys in `packages/desktop/src/shared/ipc-channels.ts` is **25** (verified by enumeration). The file's own comment is stale; the worldmodel propagates the stale comment without re-counting.
**Evidence:** `grep -cE "^\s+'ok:[a-z]" packages/desktop/src/shared/ipc-channels.ts` → 25.
**Status:** STALE
**Suggested resolution:** Update `evidence/_init_worldmodel.md` S6 row to "currently 25". Doesn't affect any decision (NG5/A1 still defer S6 to PR #354). The trip-wire framing (>20 → migrate) is unchanged. Note: the source-file comment is also stale, but updating that is out of scope for this audit.

---

### [L3] §13 IS3 says "update 3 call sites" but FR6 lists "1 reader + 1 method signature + 1 type def"

**Category:** COHERENCE / terminology
**Source:** L8
**Location:** SPEC.md §6 FR6 (line 131) ↔ §13 IS3 (line 336)
**Issue:** FR6 acceptance: "(verified: 1 reader at `dispatcher.ts:67`; 1 method signature at `registry.ts:29`; 1 type def at `types.ts:91` — see `evidence/verified-current-state.md` C2)". §13 IS3 proposed solution: "Rename type field; update 3 call sites." The "3 call sites" framing collides with FR6's enumeration, which counts a *reader*, a *method signature*, and a *type definition* as 3 sites. Evidence file C2 counts 4 sites (adds `registry.ts:18` import). Slight ambiguity about what counts as a "site" — but consistent if we accept that "call sites" = "occurrences of the field name". Mild imprecision.
**Status:** INCOHERENT (mild)
**Suggested resolution:** §13 IS3 → "Rename type field; update 3 textual occurrences (1 type def, 1 method signature, 1 reader; 1 type-import line touches the type by name only and needs no field-edit)". Or: simplify FR6 acceptance to count consistently with IS3.

---

### [L4] §5 P1.1.3 helper-call example uses old 3-arg signature + bare kebab token

**Category:** COHERENCE (terminology)
**Source:** L8
**Location:** SPEC.md §5 (lines 92-94) ↔ §6 FR3 (line 128)
**Issue:** §5 P1.1.3 example: `errorResponse(res, 400, 'malformed-input', 'Field X is required')` — 3 args after `res`/`status`, with bare kebab token `'malformed-input'`. FR3 specifies the helper signature as `errorResponse(res, status, type, title, detail?, instance?)` — 4 named args + 2 optional. The journey example uses pre-D22 signature with `code` (now `type`) and bare kebab (now should be `/errors/malformed-input` relative-URI).
**Status:** INCOHERENT (stale)
**Suggested resolution:** Update §5 P1.1.3 to: `errorResponse(res, 400, '/errors/malformed-input', 'Field X is required')` — 5-arg form with relative-URI token. (Detail/instance optional, omitted in example.)

---

### [L5] §13 deployment table "Single PR vs split PRs" row leaves a stale "single PR" framing in the column header

**Category:** COHERENCE (mild)
**Source:** L8
**Location:** SPEC.md §13 deployment table line 418
**Issue:** Row header reads "Single PR vs split PRs"; description begins "**Multiple stacked PRs** (D12 amends earlier 'single PR' plan)". The header is a vestige of the pre-D12 framing. After D12, the answer is unambiguously stacked; the "vs" framing in the header is misleading. Minor.
**Status:** INCOHERENT (mild)
**Suggested resolution:** Update header to "PR sequencing" or "Stacked-PR cadence". Body text already explains.

---

## Confirmed Claims (sample — coverage indicator)

The following load-bearing claims were verified against current code at HEAD `24ebab29c7c40bd214d69d4264ca8eca15d26249` (post-#270 squash-merge `fbfe9673` plus `24ebab29` spec scaffold) and check out:

- **57 handlers in `api-extension.ts`** (`grep -cE "^\s*async function handle[A-Z]\w+"` → 57). Migration scope claim verified.
- **256 error-shape emit sites** (`grep -cE "json\(res, [0-9]+, \{ ok: false,"` → 256). FR3 / D22 / D12 migration math verified.
- **331 total `json(res, ...)` sites** (`grep -cE "json\(res,"` → 331). evidence/decision-grounding-q1-q6.md migration table verified.
- **98 distinct error strings** (verified via grep + sort -u → 98). evidence/decision-grounding-q20-q22.md migration math verified.
- **`extractAgentIdentity` at `api-extension.ts:4728`** in upload handler. Worldmodel + SPEC §1 cross-pkg consumer claim verified.
- **`assertNeverDiskEvent` at `file-watcher.ts:82`**, used at `standalone.ts:932`. Single-site adoption claim verified.
- **`AssetViewerLookupResult` at `types.ts:91`**, reader at `dispatcher.ts:67`, method at `registry.ts:29`. FR6 + IS3 site count verified.
- **`image-upload/index.ts:323`** reads `body.message ?? body.error ?? \`Upload failed (${res.status})\`` as display string. C1 + IS5 framing verified.
- **`core/src/schemas/api.ts:54,92` `.loose()` convention.** D6 / FR1 convention claim verified.
- **`UploadWriteReason` 5-variant union at `upload-errors.ts:14-19`**: `collision-exhaustion`, `storage-full`, `storage-readonly`, `storage-error`, `malformed-upload`. Worldmodel S2 verified.
- **`agent-write-summary.ts:2`** "single truncation point" docstring. Convergence-target precedent verified.
- **`auth-token-schema.ts:26`** "Schema IS the single source of truth" docstring. Convergence-target precedent verified.
- **CLAUDE.md size 39965 / 40000 char hard cap**. D27 char-cap discipline verified.
- **PR #354 still draft** (last update 2026-04-28). A1 sequencing assumption + D29 still active.
- **PR #374 (Mermaid), #372 (Math) still OPEN, last updated 2026-04-30**. A2 sequencing assumption partially active.

## Unverifiable Claims

- **`error.cause` chain via Pino's std serializer surfaces underlying errno + path** (NFR Operability line 148). Behavior depends on Pino version + serializer config; not directly testable in audit. Reasonable based on PR #270 cycle-49 report.
- **"Two staff engineers would adopt RFC 9457 day one"** (D22 rationale). Judgment claim; ungrounded but not load-bearing.
- **"Stripe, GitHub, Microsoft Graph, AWS API Gateway adopt RFC 9457"** (D22). Web-verifiable; spot-checked ad-hoc, broadly accurate per public docs but exact version/scope of adoption varies. Not material to this hardening's correctness.
- **`Zod v4 native ~standard property is stable`** (A3). Per evidence; current Zod docs corroborate.
