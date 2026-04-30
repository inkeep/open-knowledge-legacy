# Design Challenge — Editor Asset + Embed Surface (Session 2 finalize re-run)

**Artifact:** `specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`
**Challenge date:** 2026-04-21
**Baseline:** `2ad0177a`
**Total findings:** 10 (0 HIGH, 5 MODERATE, 5 LOW) + 3 STRONG-revisits (1 still holds, 1 weakens, 1 resolved)

---

## Executive summary

This is the **Session 2 re-run** after F8+F9 absorption and D-L addition. Session 1's challenge file (preserved via the `_changelog.md` audit trail; see 2026-04-17 Session 3 entry) surfaced 3 STRONG challenges. The user resolved them in Session 2b (LOCKED D-K with 12-month + GC commitment) but did NOT act on STRONG-1 (D-I auto-emit framing) or STRONG-3 (scope split). This re-run asks whether the absorption reopens or forecloses those.

**Revisits of Session 1 STRONG challenges:**

- **STRONG-1 (D-I auto-emit framing)** — weakens to **LOW**. F8 absorption (markdown-image relative-path emit correctness) makes the opt-out escape hatch (`emitFormat: 'markdown-image'`) reliably functional. Prior challenge leaned on "opt-out is always available"; now that opt-out actually produces correct paths. Concern survives only as a product-positioning question (GitHub/VS Code users who never flip the config see broken images) — not a code-correctness question.

- **STRONG-2 (D-K drift trigger)** — **resolved** in Session 2b LOCKED with "12-month revisit + paired `openknowledge gc` commitment." No new challenge. Session 1's language ("passive revisit trigger") is now addressed.

- **STRONG-3 (scope split)** — **still holds**. F8+F9 absorption is orthogonal to splittability. The bundle rationale ("coherent surface") was never evidence-backed; the challenger concern (review bandwidth, de-risking auto-emit against real P1 usage before committing to the wiki-embed write-path) is unaddressed. See M5 below.

**New Session 2 challenges (5 MODERATE, 5 LOW):**

The focus of this re-run is the D-L rejection copy rule, the E2E scenarios evidence file, and the absorption's second-order effects on FR-7. The most load-bearing findings are:

- **M1 — D-L two-message rule has an admin-narrowed UX dead-end** — users hitting Message B on an admin-narrowed install have no reachable fix path, and D-L's principle "never expose internal structure" prevents improving the message.
- **M2 — E2E top-10 omits P1.3 oversized-file rejection** — the byte-size rejection path is distinct from "unsupported type" (different message, different HTTP status) and has no acceptance-tier guard.
- **M3 — `warnBytes` soft-limit is declared in FR-5 but has no behavior contract** — config field with no journey, no acceptance criteria, no scenario.
- **M4 — D-E markdown-image race has no eventual-consistency regression guard** — P5.2 tests wiki-embed immunity (happy path); `emitFormat: 'markdown-image'` opt-out is undefended at acceptance tier.
- **M5 — Scope split (revisit of STRONG-3)** — F8+F9 absorption doesn't foreclose split; the "one coherent surface" framing is aspirational, not evidence-backed.

All 5 MODERATE findings are DESIGN-class (judgment calls the user must resolve), not FACTUAL.

---

## Moderate Severity

### [M1] D-L two-message rule has an admin-narrowed rejection dead-end

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — operator/user boundary)
**Location:** SPEC.md §6 FR-1 (line 157), §10 D-L (line 263), evidence/e2e-acceptance-scenarios.md P1.2 + P4.1 (line 201)
**Status:** CHALLENGED

**Issue.** The two-message rule splits rejection copy into:
- **Message A** (text-ext `.txt/.csv/.json/.md/.yml/.yaml/.toml`): *"Text files (CSV, TXT, JSON, MD) aren't supported as binary drops. To include contents, paste into a code fence. To link to a text file in the repo, reference it with a regular markdown link."*
- **Message B** (all other non-sniffable or admin-narrowed): *"This file type isn't supported. Try a different file, or reference it with a markdown link: [label](path/to/file)."*

D-L's pinned principle: *"never expose internal structure (MIME names, config keys, allowlists) to non-operator users."* The scenarios file P4.1 invariant 1 has Message B firing when an operator narrows `allowedMimeTypes` and a user drops a type that's in the SHIPPED defaults but not in the admin's subset (e.g. operator restricted to image-only; user drops a legitimate PDF).

The admin-narrowed case has a materially different user situation than "this file type was never supported":

| Case | User's actual situation | Message B text |
|---|---|---|
| Shipped defaults don't cover the type (e.g. drop `.dmg`) | "Try a different file" is accurate | Fits |
| Admin narrowed below defaults (e.g. PDF dropped on image-only install) | Fixing this requires talking to admin; "Try a different file" is misleading — a different PDF won't work either | Misleading |

**Current design:** *"never expose internal structure (MIME names, config keys, allowlists) to non-operator users"* — D-L rationale line 263.

**Alternative:** Three-message rule (Message A + Message B + Message C where C fires on admin-narrowed case):

- **Message C** (admin-narrowed): *"This file type is restricted in this workspace. Contact the workspace administrator if you need support for this format."*

The server distinguishes the case easily: Message C fires iff `(detectedMime is in shipped default allowlist) AND (detectedMime NOT in operator config allowedMimeTypes)`. No internal structure is exposed to the user — "administrator" is the abstraction. The user has a clear action path (talk to admin) instead of a dead-end ("try a different file" — but which one?).

**Trade-off:** Gains actionability for admin-narrowed rejection (a real subset on self-host installs that customize the default). Loses message-count simplicity (2 → 3). The "operator might customize" case is presumably rare in P0 dogfood (Nick's install ships defaults) but P2 self-host admins will narrow for policy.

**Why Session 1 didn't catch this:** D-L didn't exist in Session 1; this is a Session 2 addition.

**Suggested resolution.** Two options, both reversible:

1. **Accept and document the dead-end.** Add a SPEC note: "Message B in the admin-narrowed case is intentionally non-actionable at the user surface; operator documentation (Future Work: operator runbook) carries the admin-facing fix path." Principle holds; user support burden rises.

2. **Promote to three-message rule.** Add Message C for admin-narrowed case. Server-side detection is ~5 LOC. Copy is specific without exposing config keys. P4.1 scenario would grow to assert Message B (unknown-type) vs Message C (admin-narrowed), exercising both paths.

Recommendation: **option 2 is cheap and reduces a real support gap.** But the user's call — the "no deferred tech debt on greenfield" principle that drove F8+F9 absorption arguably applies here: fix the rejection-UX completeness now rather than deferring.

---

### [M2] E2E top-10 omits P1.3 (oversized-file rejection) — a distinct bug class

**Category:** DESIGN (test coverage judgment)
**Source:** DC2 (stakeholder gap — user-facing failure modes)
**Location:** evidence/e2e-acceptance-scenarios.md P1.3 (line 84), "If I only had 10 E2E tests" (line 326)
**Status:** CHALLENGED

**Issue.** The scenarios file defines P1.3 (oversized-file rejection) at lines 84-96 with invariants covering 413 status, byte-size-specific toast, no-orphan-file-on-disk, no-placeholder-lingering. But P1.3 is NOT in the top-10 budget (line 326-338).

The top-10 list's implied replacement for P1.3 is "covered by other scenarios." That's not accurate:

- P1.1 (Drop PDF) asserts happy-path acceptance. Doesn't exercise size-reject code path.
- P1.2 (Drop CSV + .xyz) asserts D-L rejection copy but for `file-type` sniff failure, not size.
- P4.1 (Operator config) asserts size-cap CHANGE takes effect, not size-cap REJECTION message.

P1.3 guards a distinct code path: `readUploadBody` at `api-extension.ts:176` handles multipart streaming, and the size check happens at a different layer than the MIME check. A regression where size-check fires AFTER bytes are written to disk (bytes written then failed → orphan file) is not caught by any test in the top-10.

Additionally: the "byte-size-specific toast" (invariant 2: *"Toast includes both the attempted file size AND the configured limit — not a generic 'too large'"*) is a UX contract that has no regression guard at acceptance tier.

**Current design:** P1.3 exists in the full scenarios inventory but is cut from the top-10 budget.

**Alternative:** Restore P1.3 to the top-10 at the expense of a sibling. Candidates for removal:

- **P6.2 (Multi-user CC1 invalidation)** — tests FR-6 correctness end-to-end, but the bug class (file-watcher doesn't emit asset DiskEvents) is also caught at narrow-integration tier (mentioned as push-down at line 357). Dropping P6.2 to narrow-integration would make room for P1.3.
- **P5.1a (Wiki-embed NO-rewrite sibling)** — tests that FR-7 leaves wiki-embeds alone. This IS a distinctive regression guard (FR-7's exclusion removal could accidentally start rewriting wiki-embeds), but could be covered by a focused narrow-integration test on `managed-rename-rewrite.ts`.

Neither drop is ideal. The honest assessment: P1.3 is the 11th test. The top-10 budget is a constraint, and the constraint forces a real cut.

**Trade-off:** Currently: size-reject path has no acceptance-tier guard. Adding P1.3 to top-10: loses one of P6.2 / P5.1a. Adding P1.3 as 11th: the "top 10" claim becomes 11.

**Suggested resolution.** Re-examine whether the top-10 is truly a hard budget. If it's a soft guide, promote P1.3 to 11th with rationale (distinct bug class, important user-facing error). If it's hard, be explicit about the cut rationale: "P1.3 pushed to narrow-integration because [reason]" — currently the push-down list doesn't name oversized-file as a cut item.

---

### [M3] `warnBytes` soft-limit has no behavior contract

**Category:** DESIGN (specification completeness)
**Source:** DC1 (simpler alternative — delete what you don't spec)
**Location:** SPEC.md §6 FR-5 (line 165), §13 In Scope (line 306), no appearance in §5 journeys or evidence/e2e-acceptance-scenarios.md
**Status:** CHALLENGED

**Issue.** FR-5 declares `warnBytes` (default 5MB) as part of the `upload.*` config schema. The config field is listed but the behavior is not specified anywhere:

- No user journey exercises a 5MB-7MB file drop (between `warnBytes` and `maxBytes`).
- No acceptance criterion says what "warn" means: toast? console log? server header?
- No scenario in `evidence/e2e-acceptance-scenarios.md` tests the soft-limit.
- Push-down list does not push it to lower-tier tests either.

A config field with no behavior contract is either dead code (delete it) or latent UX (specify it). The default 5MB is suggestive: files in the 5-25MB range get... something. What?

Possibilities:
- **Interpretation A: Warning toast during upload** — "This file is 18MB. Large files may slow collaboration sync." User still proceeds; no reject.
- **Interpretation B: Confirm dialog** — modal "Upload 18MB file?" Yes/No.
- **Interpretation C: Server-side observability only** — log warning, no user surface.
- **Interpretation D: Dead field** — inherited from old spec D19 (5MB/25MB pair), no UX attached.

Under the greenfield principle (no deferred tech debt), declaring a field you don't use is tech debt. Either commit to a behavior or remove the field.

**Current design:** Field declared in FR-5 config schema, behavior unspecified.

**Alternative:** Either
1. **Remove `warnBytes` from FR-5.** Keep only `maxBytes`. Simpler, fewer lies.
2. **Add acceptance criteria.** "When `size > warnBytes && size <= maxBytes`, toast fires 'Upload proceeding; file is large — collaboration sync may be slower.' Upload continues." Add P1.3b scenario to E2E siblings. Write unit test for toast-fires-in-range.

**Trade-off.** Option 1 gives up a potential UX nuance; Option 2 adds ~20 LOC + 1 test. Both are better than the current state where the field exists without contract.

**Suggested resolution.** If the team intends to ship the warn UX in P0, add explicit acceptance criteria + a scenario. If not, delete `warnBytes` from FR-5 and note in Future Work: "Explored — soft-limit warn UX deferred pending dogfood signal on whether 5-25MB uploads produce perceptible sync lag."

---

### [M4] D-E markdown-image rename race has no eventual-consistency regression guard

**Category:** DESIGN (test coverage for accepted-risk path)
**Source:** DC2 (stakeholder gap — accepting an incoherent intermediate state without defending the eventual state)
**Location:** SPEC.md §10 D-E (line 258), evidence/e2e-acceptance-scenarios.md P5.2 (line 244), "Resolved-in-session notes" (line 381 — "Skip markdown-image bound")
**Status:** CHALLENGED

**Issue.** D-E LOCKED accepts "temporary incoherence for markdown-image during bursts" because Foam/Dendron/SilverBullet all rely on fs-event ordering with "no documented pathology." P5.2 tests wiki-embed immunity (architecturally race-free per D-I storage). The scenarios file explicitly skips a markdown-image bound test (line 381): *"Skip markdown-image bound (inherently flaky under real fs-events; D-E accepts temporary incoherence)."*

The skip is defensible for a STRICT "no intermediate incoherence" assertion — that WOULD be flaky. But there's a weaker assertion that's NOT flaky and DOES guard against regression:

**Eventual-consistency assertion:** After all fs-events drain (quiescence), all refs resolve correctly. Intermediate transient "broken image" is allowed; permanent "broken after settling" is not.

This is the same discipline Foam/Dendron/SilverBullet implicitly maintain — they don't guarantee zero intermediate flicker, but they DO guarantee post-settlement correctness. The current scenarios have no equivalent assertion for the markdown-image path.

**Why it matters.** Users who opt out to `emitFormat: 'markdown-image'` (F8-absorbed path — now made reliable by the absorption) have NO acceptance-tier guard for rename + asset-move race. A regression that breaks post-settlement correctness (e.g., an off-by-one in FR-7's path recompute that only fires under concurrent fs-events) would land silently. The wiki-embed path is immune (P5.2 guards it), so the regression surface shifts entirely to the less-tested opt-out path.

**Current design:** P5.2 covers wiki-embed immunity. Markdown-image path covered by FR-7 unit/narrow-integration tests only.

**Alternative:** Add P5.3 Eventual-consistency under concurrent rename+asset-move for markdown-image mode:

```
P5.3 Markdown-image eventual consistency under concurrent events

Setup. Config has `emitFormat: 'markdown-image'`. Doc `docs/notes.md`
contains `![alt](photo.png)`. Asset `docs/photo.png` exists.

Action. In rapid sequence (within one fs-event burst): (a) rename doc
to `archive/notes.md`, (b) create second asset `docs/diagram.png`.

Quiesce. Wait for managed-rename transactions to settle AND CC1 asset
signals to drain. Use condition-based wait (precedent #20(a)), not a
time-based sleep.

Invariants.
1. Post-quiescence: `archive/notes.md` body contains correctly
   recomputed relative path to `docs/photo.png`.
2. Image renders (fetch succeeds, bytes match).
3. The new `docs/diagram.png` is indexed and reachable.
4. No orphan asset at old doc location.
```

This is **not flaky** because quiescence is well-defined (condition-based wait). It catches a real regression class.

**Trade-off.** Adds one E2E scenario (~50 LOC of Playwright code). Removes a currently-undefended regression surface. Fits the "no deferred tech debt" principle the spec has committed to.

**Suggested resolution.** Add P5.3 as a sibling of P5.2 with eventual-consistency framing. If the top-10 budget is hard, push it to #11 (same ordering question as M2's P1.3).

---

### [M5] Scope split still holds — F8+F9 absorption doesn't foreclose it

**Category:** DESIGN (scope composition)
**Source:** DC1 (simpler alternative) — revisit of Session 1 STRONG-3
**Location:** SPEC.md §1 Resolution (line 37), §13 In Scope (line 296), meta/_changelog.md Session 3 STRONG-3 entry
**Status:** CHALLENGED (session 1 challenge surfaced; not acted on)

**Issue.** Session 1 surfaced STRONG-3: the 8 FRs contain two independently-valuable sub-features:

- **Bucket A — Upload widening:** FR-1 + FR-2 + FR-5 + FR-8 + NFR-3 (now includes F9 absorption)
- **Bucket B — Wiki-embed + vault:** FR-1a + FR-3 + FR-4 + FR-6 + FR-7 (now includes F8 absorption)

Session 2's F8+F9 absorption naturally partitions cleanly:
- **F9** (unicode-safe sanitizeFilename) lives in NFR-3, applies to all upload paths including Bucket A. Goes with Bucket A.
- **F8** (shortestImageRef relative-path fix) lives in FR-1a, applies only to the markdown-image emit branch in Bucket B. Goes with Bucket B.

The absorption is **orthogonal** to the split decision. If anything, it makes the split cleaner — Bucket A's F9 is independently shippable (`sanitizeFilename` fix + MIME widening), and Bucket B's F8 naturally travels with its FR-1a owner.

**Why the split still matters post-session-1:**

1. **De-risking the riskiest decision (D-I auto-emit) against real usage.** D-I is flagged as the "genuinely first-mover" write behavior (Session 1 STRONG-1). Bucket A ships without committing to `![[...]]` auto-emit; 48 hours of dogfood feedback on PDF/MP4/ZIP accept surfaces whether users want the wiki-embed emit OR prefer markdown-link (for GitHub compat). Bucket B then ships D-I with calibrated confidence.

2. **Review bandwidth.** 8 FRs + ~10 test-scenario files + ~3 new modules is a week-plus of implementation and a tough single review. Two bundles of ~4 FRs each are reviewable.

3. **Rollback granularity.** If D-I auto-emit surfaces a problem post-ship, rolling back Bucket B alone is cleaner than unbundling a single PR.

4. **Session 1's counter-argument (FR-7 depends on FR-3b) is still valid — but applies INSIDE Bucket B, not across buckets.** Bucket A has no internal cross-dependency. Bucket B's internal dependencies (FR-3b → FR-7 → FR-4) are a linear chain, shippable as one PR.

**Current design:** Single bundled ship, 8 FRs + 2 absorbed fixes.

**Alternative:** Two sequential PRs. Bucket A first (~2-3 days: config + allowlist + dedup + endpoint rename + F9), land, dogfood. Bucket B second (~4-5 days: wiki-embed tokenizer + basename index + Obsidian detection + FR-7 rewrite + F8 + FR-1a), land with real feedback on Bucket A.

**Trade-off.**
- Split gains: de-risking D-I; review bandwidth; rollback granularity.
- Split loses: coordination overhead (two PRs, one merge queue entry each); the "one coherent surface" framing; ~1-2 days wall-clock (dogfood interval).
- Bundle loses: all the above gains.
- Bundle gains: one-shot finality (user says "ship it," done); coherent presentation.

**Why Session 1's challenge was acknowledged but not acted on:** The spec's final state (LOCKED with all 11 decisions) was presented as "ready to ship"; scope split would unwind that finality. But that's a process-convenience argument, not an evidence argument. No scope-split DISADVANTAGE was surfaced as evidence against the split.

**Suggested resolution.** If the user has NOT yet committed to a single PR for implementation, revisit the split explicitly. The trade-offs are real but the evidence for "one coherent ship" remains framing, not substance. If the user HAS committed to single PR (e.g., implementation branch already exists with mixed-bucket commits), note that foreclosed foreclosure as a durable project memory.

---

## Low Severity

### [L1] F8 absorption framing: "one-line fix" understates the algorithmic change

**Category:** FACTUAL (minor)
**Source:** DC3 (framing validity)
**Location:** SPEC.md §9 D3 (line 220), §13 In Scope (line 311), meta/_changelog.md 2026-04-21 entry ("both fixes are one-line")
**Status:** CHALLENGED (framing accuracy)

**Issue.** The changelog says "both fixes are one-line." Verified:

**F9 — sanitizeFilename** (packages/server/src/api-extension.ts:172-179 at baseline `2ad0177a`):
```ts
const safeStem = stem.replace(/[^a-zA-Z0-9_\-.]/g, '_') || 'upload';
```
Unicode-preserving replacement is genuinely one-line (swap regex to `/[^\p{L}\p{N}\p{M}\p{P}\-_.]/gu` or similar). F9 framing accurate.

**F8 — shortestImageRef** (packages/app/src/editor/image-upload/index.ts:91-96 at baseline `2ad0177a`):
```ts
export function shortestImageRef(assetPath: string, mdPath: string): string {
  if (parentDir(assetPath) === parentDir(mdPath)) {
    return basename(assetPath);
  }
  return `/${assetPath}`;
}
```
Current implementation is BINARY: same-dir returns basename; otherwise returns absolute path from content root (`/${assetPath}`). The spec's FR-1a acceptance criteria demand 4 cases:
- same-dir → basename ✓ (already works)
- parent-dir → `../<path>` ✗ (currently returns absolute)
- deeper-dir → `./<subpath>/<basename>` ✗ (currently returns absolute)
- cross-tree → `../.../<basename>` ✗ (currently returns absolute)

Moving from binary logic to 4-case relative-path computation is a **function rewrite** (probably 8-15 lines with `path.posix.relative()` + normalization), not a one-line change. The test matrix is 4 cases minimum.

**Current design:** Changelog frames both absorptions as "one-line"; test requirement is framed as "dirname-matrix test" without acknowledging the implementation delta.

**Alternative:** Update changelog language to be precise:
- F9: one-line regex change + unit test.
- F8: algorithmic rewrite to use relative-path computation + 4-permutation dirname-matrix test.

**Trade-off.** Pure framing accuracy; implementation is unchanged. But understating scope by framing an algorithmic rewrite as "one-line" may bias the implementer toward a minimal change that doesn't actually fix the full permutation matrix.

**Suggested resolution.** Edit changelog + §13 In Scope F8 bullet to reflect algorithmic scope. Low impact but defends against "I patched the function in one line" surprise at code-review time.

---

### [L2] FR-7 rewrite is silent on absolute-path refs from pre-F8 emit

**Category:** COHERENCE (second-order effect of F8 absorption)
**Source:** DC2 (stakeholder gap — upgrade path for pre-existing content)
**Location:** SPEC.md §6 FR-7 (line 167), §5 P5 (line 142)
**Status:** CHALLENGED

**Issue.** Current `shortestImageRef` (pre-F8) emits `/${assetPath}` (absolute from content root) for any non-same-dir case. Any existing docs in dogfood vaults, early-adopter repos, etc. already contain absolute-path `![alt](/docs/photo.png)` refs.

F8 absorption changes emit to relative paths. FR-7's rewrite-on-doc-rename extends to `readImageRef` branch. But what does FR-7 do with EXISTING absolute-path refs when their containing doc moves?

Options:
- **Leave absolute paths alone** — they're location-independent; no rewrite needed. This is the right behavior.
- **Recompute as relative from new doc location** — breaks absolute refs (they'd change shape for no gain).

The spec's FR-7 acceptance says "Recompute relative path from new doc dirname." Doesn't specify what to do with existing absolute-path source. An implementer who reads FR-7 literally might recompute absolute refs too — silently rewriting `![alt](/docs/photo.png)` to `![alt](../docs/photo.png)` even though the absolute form was fine.

**Current design:** FR-7 is silent on the absolute-vs-relative distinction.

**Alternative:** Add to FR-7 acceptance criteria: "`readImageRef` detects absolute-path refs (`/...`) and leaves them unchanged; only relative-path refs (`./...`, `../...`, bare-name) are recomputed."

**Trade-off.** Specification precision. Zero code impact if the implementer gets it right; bug-catching if they don't.

**Suggested resolution.** Add the bullet to FR-7 + a unit-test case to the push-down list: "`managed-rename-rewrite` regex fixtures must include an absolute-path ref that survives rename unchanged."

---

### [L3] STRONG-1 D-I auto-emit framing: weakens but not foreclosed by F8 absorption

**Category:** DESIGN (revisit of prior STRONG challenge)
**Source:** DC3 (framing validity — Session 1 concern's current status)
**Location:** SPEC.md §10 D-I (line 262), §14 R9 (line 333)
**Status:** CHALLENGED (weakened)

**Issue.** Session 1 STRONG-1 argued D-I's "6-editor convergence" conflates READ with WRITE: 6 editors READ `![[...]]`; 1 editor (SilverBullet) AUTO-EMITS on drop. The opt-out escape hatch (`emitFormat: 'markdown-image'`) was proposed as the mitigation.

F8 absorption **makes the opt-out reliably functional.** Before F8 absorption, users flipping to `emitFormat: 'markdown-image'` would get correct same-dir refs but broken relative paths in any non-same-dir case. Now the opt-out produces minimal-correct relative paths across all permutations. So the "opt-out is available" rationale in D-I is now genuinely load-bearing.

However, the UNDERLYING concern remains: **most users will never flip the config.** Users who open an OK wiki in GitHub, VS Code markdown preview, Cursor, Claude Code, or any general-purpose markdown viewer see `![[photo.png]]` as literal text. The fidelity invariants I1/I4 hold (round-trip byte-identity), but the rendering in external tools is broken.

The spec R9 acknowledges this ("accepted tradeoff — Obsidian + OK + Fumadocs parity prioritized; GitHub preview is secondary to in-editor/publish paths"). This is a product call, made with awareness. Not a bug.

**Current design:** D-I LOCKED wiki-embed default; opt-out reliable post-F8.

**Alternative (Session 1 proposal):** Flip default to markdown-image; Obsidian refugees opt in via FR-4 detection.

**Trade-off.**
- Flip default: lose Obsidian refugee out-of-box fidelity (FR-4 detection recovers it); gain GitHub/VS Code/agent-read default rendering.
- Stay locked: Obsidian refugees "just work"; non-Obsidian consumers see literal text.

**Why it weakens from STRONG to LOW:** The F8-absorbed opt-out is now a real escape hatch. Prior challenge was "the config flag is there but broken for real repos"; now the flag works. Absent a concrete product signal that GitHub-readability trumps Obsidian parity, D-I's product call holds.

**Suggested resolution.** No action required IF the product call (Obsidian-parity over GitHub-compat) is locked. Consider adding to R9: "F8-absorbed relative-path correctness makes `emitFormat: 'markdown-image'` a viable whole-vault opt-out for users prioritizing external-tool rendering."

---

### [L4] Phase 2 coordination protocol creates cross-spec coupling

**Category:** DESIGN (coordination debt)
**Source:** DC1 (simpler alternative)
**Location:** evidence/e2e-acceptance-scenarios.md "Phase 2 coordination" (line 361)
**Status:** CHALLENGED

**Issue.** The scenarios file's protocol for Phase 2 coordination (typed-component-nodes spec):

> When Phase 2 lands, update THESE assertions in THIS file (and corresponding test code) to assert the typed-component render instead of plain-link fallback. Do not rewrite scenarios; do not make current assertions Phase-2-agnostic. The typed-component-nodes spec's In-Scope list should include "update E2E assertions in `specs/2026-04-16-editor-asset-and-embed-surface/evidence/e2e-acceptance-scenarios.md` at [marked lines]."

This is **cross-spec coupling by convention.** Phase 2 spec (not yet drafted, per `specs/2026-04-08-typed-component-nodes/`) is expected to edit THIS spec's evidence file. Two failure modes:

1. **Phase 2 author forgets.** Phase 2 ships, typed components render, but this spec's P1.1 invariant 5 still asserts "plain-link fallback visible" → test fails after Phase 2. Or worse: it's skipped in pre-release, silently drifts.
2. **File refactor loses markers.** Someone reformats the scenarios file, inlines the *(Phase 2)* markers differently, and the "marked lines" pointer becomes ambiguous.

**Current design:** Phase 2 takes responsibility for editing this file's assertions.

**Alternative:** Two cleaner patterns:

- **(A) Permanent fallback markers.** Rewrite assertions to `[P0-phase1-fallback]` per-invariant. Phase 2 ADDS new typed-component scenarios to its OWN spec; phase-1 scenarios persist in this spec as "fallback-path regression guards" (under a future `upload.phase2Promotion: false` flag, or indefinitely).
- **(B) Spec-level handoff.** Make P0 assertions Phase-2-agnostic with a conditional: "assert the media is rendered via its configured renderer (plain-link in P0; typed-component in P2)." Uses the same test code; what's asserted changes based on what's shipped.

Option (A) is cleaner because it preserves Phase 1 coverage as a historical regression guard (someone could accidentally break fallback later). Option (B) reduces test code but requires threading a runtime flag through tests.

**Trade-off.** Current protocol works IF Phase 2 author is diligent. Alternative (A) removes the coupling at the cost of maintaining dual assertions. Alternative (B) reduces test count but adds a config dimension.

**Suggested resolution.** Add to Phase 2's In-Scope BEFORE this spec ships — as a concrete item in `specs/2026-04-08-typed-component-nodes/` draft, even at placeholder-stub level. That way the coupling is documented bidirectionally. Alternatively: flip to option (A) now (persist phase-1 assertions, add phase-2 separately) and eliminate the coupling.

---

### [L5] R9 user-facing gotcha acknowledged but not in user-visible surface

**Category:** DESIGN (user-facing communication gap)
**Source:** DC2 (stakeholder gap — first-time wiki viewer)
**Location:** SPEC.md §14 R9 (line 333), evidence/e2e-acceptance-scenarios.md P2.2 (line 150)
**Status:** CHALLENGED

**Issue.** R9: default `![[photo.png]]` emit breaks GitHub preview. Accepted tradeoff per product call. P2.2 tests the `useMarkdownLinks: true` opt-in path as GitHub-compat validator.

But no user-visible surface communicates this to a new OK user who pushes their vault to GitHub and sees broken image previews. They'll assume the wiki-embed is a bug, file an issue, or silently move to another tool.

Possible surfaces:
- **CLI `open-knowledge init` startup message** — one-liner: "OK uses `![[file.ext]]` syntax by default. For GitHub-rendered previews, set `upload.emitFormat: 'markdown-image'` in `.open-knowledge/config.yml`."
- **Docs page on "External tool compatibility"** — covers GitHub, VS Code, Cursor, Claude Code read paths.
- **In-editor one-time tip on first drop** — subtle hint at first-time upload experience.
- **Nothing** — let the issue emerge via support channels.

None of these are in P0 scope. All belong to Future Work (Noted or Identified).

**Current design:** Tradeoff acknowledged in R9; no user-visible surface communicates.

**Alternative:** Add a Future Work Identified entry: "External-tool compatibility guide (docs + `init` message): explain `![[...]]` vs `![alt](...)` trade-off, link to `emitFormat` config. Trigger: first support inquiry or PR from a user who hit this."

**Trade-off.** Documentation debt is cheap; real user confusion is expensive. Zero code change.

**Suggested resolution.** Add the Future Work entry. Trigger ("first support inquiry") is concrete enough to be actionable without committing now.

---

## Cross-cutting re-observations

### Framing concern revisited: "markdown-canonical" is still used load-bearingly in 3 distinct ways

Session 1 challenge (Session 1 Concern 1) flagged: D-I, D-A, D-C all invoke "markdown-canonical" as justification, but each invocation is load-bearing differently (storage contract, type filter, render invariant). The spec hasn't been edited since Session 1 to clarify the three invocations.

This is a **held-over LOW concern** — not new, not resolved. If the spec does another polish pass, a clarifying paragraph on what "markdown-canonical" means in each of D-I / D-A / D-C would reduce reader drift.

### New framing concern: "no deferred tech debt on greenfield" as a principle

Session 2 introduced this principle to justify F8+F9 absorption. It's now a LOAD-BEARING principle the spec acts on. But it's not articulated in SPEC.md as a governing rule — it's only in `meta/_changelog.md` (2026-04-21 entry) and the user's memory file.

Other decisions the principle would arguably reopen (surfaced in Session 2):
- **M1 admin-narrowed rejection copy** — if F8+F9 are "not tech debt to defer," is "admin-narrowed case has no user-actionable path" also not tech debt to defer?
- **M3 warnBytes** — if F8+F9 are "fix it now or remove it," does the unspecified warnBytes field get the same treatment?
- **L5 R9 user-facing communication** — is "we'll document the GitHub-preview gotcha later" tech debt the principle says not to defer?

The principle cuts both ways. Applying it consistently would expand scope (toward completeness); applying it selectively is a judgment call that should be documented. The spec currently does the latter implicitly.

**Not a challenge per se — a meta-observation that the principle needs either consistent application or explicit carving-out.**

---

## Confirmed Design Choices (held under this pass)

### STRONG-2 D-K drift trigger

Session 1 surfaced passive "revisit when drift becomes a real complaint" as inadequate. Session 2b LOCKED D-K with:
- Concrete revisit trigger: 12-month orphan-density audit
- Paired commitment: ship `openknowledge gc` (moved from Noted to Identified)

The rewrite is load-bearing and addresses Session 1's concern in kind. **Confirmed.**

### D-B dedup toast UX

Session 1 WEAK: toast is the right middle ground. Still holds. The `upload.dedup.ui` config escape hatch remains. **Confirmed.**

### F9 absorption

Genuinely one-line. Defensibly absorbed per greenfield principle. **Confirmed.**

### D-C + D-F Phase 2 read-time promotion

Session 1 MODERATE concern on P0 UX gap (plain-link fallback vs Outline's typed nodes). L4 flags a coordination risk in the Phase 2 handoff mechanism, but the architectural decision (storage shape never migrates; render-layer dispatch) remains sound. **Confirmed with L4 flag.**

### Round-trip fidelity coverage

NFR-5 now cites I1/I4/I5/I7 (updated from Session 1 audit M1). PBT coverage via push-down list is appropriate. **Confirmed.**

### D-A strict magic-byte-only

Session 1 MODERATE. D-L rejection copy (Session 2) now provides actionable rejection UX for the text-ext case (Message A covers CSV/TXT's most-common user intent). SVG fallback preserved via STOP_IF. **Confirmed.**

---

## Summary table

| # | Finding | Severity | Category | Source | Suggested action |
|---|---|---|---|---|---|
| M1 | D-L admin-narrowed dead-end | MODERATE | DESIGN | DC2 | Consider 3rd message (Message C) or explicit accept-dead-end note |
| M2 | E2E top-10 omits P1.3 | MODERATE | DESIGN | DC2 | Promote P1.3 or make top-10 a soft cap |
| M3 | warnBytes no behavior contract | MODERATE | DESIGN | DC1 | Specify behavior OR delete field |
| M4 | Markdown-image race: no eventual-consistency guard | MODERATE | DESIGN | DC2 | Add P5.3 |
| M5 | Scope split still holds (STRONG-3 revisit) | MODERATE | DESIGN | DC1 | Re-examine split commitment |
| L1 | F8 "one-line" framing is inaccurate | LOW | FACTUAL | DC3 | Edit changelog language |
| L2 | FR-7 silent on absolute-path refs | LOW | COHERENCE | DC2 | Add FR-7 bullet + unit test |
| L3 | STRONG-1 weakens post-F8 | LOW | DESIGN (revisit) | DC3 | No action if product call locked |
| L4 | Phase 2 coordination coupling | LOW | DESIGN | DC1 | Document bidirectionally or flip to permanent markers |
| L5 | R9 user-facing gotcha silent | LOW | DESIGN | DC2 | Add Future Work Identified entry |

---

## What held up (due-diligence dismissals)

- **"F9 absorption is wrong tier — should be separate PR."** Checked: F9 is a regex swap; unit test is trivial; it gates G2 Obsidian refugee UX (unicode filenames). Absorption is defensible and F9 really is one-line. **Dismissed.**
- **"D-L Message B wording should cite the config key."** Checked: D-L principle explicitly prohibits this. The MODERATE concern is the admin-narrowed case (M1 above), not the wording itself. **Dismissed as wording concern; elevated as M1 class.**
- **"P7.1 regression guard doesn't prove new emit shape doesn't regress OLD users."** Checked: P7.1 invariant 3 explicitly asserts "Emit is `![[foo.png]]` — CHANGED from pre-FR `![alt](foo.png)`, but intentionally per D-I. The NEW shape is the assertion." So the intentional-change is tested. **Dismissed.**
- **"ZIP widening enables zip-bomb DoS."** Checked: file-type@22.0.1 peeks bytes 0-X for magic number; does not decompress. 25MB cap + no decompression = no zip-bomb vector. **Dismissed.**
- **"font/woff2 widening enables font-exploit DoS."** Checked: OK serves files; doesn't auto-load as `@font-face`. Font bytes treated as generic attachment. **Dismissed.**

---

## Re-run delta from Session 1

| Challenge | Session 1 severity | Session 2 status |
|---|---|---|
| STRONG-1 D-I auto-emit framing | STRONG | Weakens to LOW (L3) — F8 absorption makes opt-out reliable |
| STRONG-2 D-K drift trigger | STRONG | RESOLVED in Session 2b (12-month + GC pairing) |
| STRONG-3 Scope split | STRONG | **Still holds** — F8+F9 absorption is orthogonal (M5) |
| MODERATE D-A rejection UX | MODERATE | RESOLVED by D-L Message A (specific text-ext guidance) |
| MODERATE D-C+D-F Phase 2 fallback UX | MODERATE | Confirmed with new L4 coordination-coupling flag |
| MODERATE D-J schema brittleness | MODERATE | No change (Session 1 "strengthen evidence" not acted on) |
| MODERATE FR-2 scrapbook case | MODERATE | No change |
| WEAK D-B/D-D/D-G/D-H/NG4 | WEAK | All confirmed |

**Net new challenges:** M1 (D-L), M2 (E2E top-10), M3 (warnBytes), M4 (markdown-image race guard), L1 (F8 framing), L2 (FR-7 absolute refs), L4 (Phase 2 coupling), L5 (R9 UX).

**Net new LOCKED decisions validated:** D-L (two-message rule) — PASSED with M1 reservation; F8+F9 absorption — PASSED with L1 framing nit.
