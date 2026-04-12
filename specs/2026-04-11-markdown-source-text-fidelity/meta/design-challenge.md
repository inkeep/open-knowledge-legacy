# Design Challenge Findings

**Artifact:** specs/2026-04-11-markdown-source-text-fidelity/SPEC.md
**Challenge date:** 2026-04-11
**Total findings:** 10 (5 high, 3 medium, 2 low)

---

## High Severity

### [H] Finding 1: The narrow wedge (Phase 1 alone) delivers ~80% of the value at ~30% of the cost

**Category:** DESIGN
**Source:** DC1
**Location:** §2 Goals, §9 Proposed solution, D10 Decision Log
**Issue:** The spec proposes ~2400 LOC across 5 tightly-coupled phases as a single PR. Phase 1 alone (~475 LOC production) fixes the three acute data-corruption bugs (entity encoding, backslash escape, frontmatter CRLF/empty) that cause Journeys J1–J3 to fail — plus adds PBT infrastructure, CommonMark/GFM corpus, and the 12 P0 test cases. Phases 2–3 address cosmetic fidelity (bullet marker `*` vs `-`, setext vs ATX heading, emphasis delimiter). The evidence (I1) shows 77/118 constructs already have whitespace-only diffs — these are normalizations, not data corruption. They primarily affect P3 (git-diff noise) not P1 (content loss).

**Current design:** "Ship maximalist source-text fidelity as an enforced invariant set across 5 phases in a single PR" (§1 Resolution)

**Alternative:** Ship Phase 1 as a standalone PR. It is self-contained: it fixes all P0 bugs, establishes PBT infrastructure, imports corpora, tightens the conversion-fidelity assertion, and passes `bun run check` independently. Phases 2–5 become follow-on PRs — each additive, each independently reviewable and revertable. This directly contradicts D10 but addresses its own highest-rated risk ("Single mega-PR stalls in review — Medium likelihood, High impact").

**Trade-off:**
- *Gained:* Faster time-to-value on the acute bugs. Lower review burden per PR. Each phase independently revertable. A1 assumption (team bandwidth for 2400 LOC review) becomes irrelevant for Phase 1 (~600 LOC total). The mega-PR's risk table mitigation ("fall back to hybrid if review >7 days") is a concession that incremental delivery is the fallback — why not start there?
- *Lost:* Phases 2–5 bear incremental rebase cost. Multiple CI runs instead of one. The "5 atomic commits in one PR" narrative is elegant but the risk profile favors delivery speed.

**Note on D10 rejection rationale:** D10 cites "worse rebase burden on Miles's open PR #39." This is contingent: if PR #39 merges before implementation (the spec's own deployment table says "our edits touch none of his 22 files"), the rationale evaporates. The spec should state what happens to D10 if PR #39 is no longer open at implementation time.

**Status:** CHALLENGED

**Suggested resolution:** Re-examine D10 with two questions: (1) Is PR #39 still open? If not, the rebase argument is moot. (2) Given A1 is MEDIUM confidence, is the mega-PR's risk profile (Medium likelihood × High impact of stalled review) truly better than 2–3 smaller PRs with Low impact of any individual stall?

---

### [H] Finding 2: Prototype monkey-patch (Option D) is strictly dominated by `bun patch` — a targeted patch file, not a fork

**Category:** DESIGN
**Source:** DC1 / DC2
**Location:** §9 Proposed solution, D4 Decision Log, I5 evidence §8
**Issue:** The spec locks Option D (runtime prototype monkey-patch on `MarkdownManager.prototype.encodeTextForMarkdown`) and rejects "fork @tiptap/markdown" in the alternatives (I5 §8.5: "maintenance burden of a fork exceeds the burden of targeted patches"). But the rejection conflates a *full fork* (maintain an entire package copy) with a *patch file* (10–30 lines of diff applied at install time). `bun patch` is available in bun 1.3.11 (confirmed — this repo's exact version) and provides:

| Dimension | Prototype monkey-patch | `bun patch` file |
|-----------|----------------------|------------------|
| Version-controlled | Patch code in a .ts file, yes | .patch file in `patches/`, yes |
| Survives `bun install` | Must be imported and executed at module load | Applied automatically by bun lockfile |
| Type safety | None — accesses private methods via `['name']` | Full — modifies source directly |
| Debugging | Stack traces show patched prototype, opaque | Stack traces show original file paths |
| Upgrade path | Developer must manually compare old vs new method | `bun patch --update` shows clean conflict markers |
| Runtime cost | No-op function call at module load per spec | Zero — changes are in node_modules at install |
| Build-time assertion | Needed (checks property exists) | Not needed — if patch fails to apply, `bun install` itself fails |

The spec's build-time assertion ("MarkdownManager.prototype.encodeTextForMarkdown exists") is a workaround for monkey-patching fragility. `bun patch` makes the assertion unnecessary — a failed patch surfaces at install time, not at build time (earlier, louder, blocking).

**Current design:** "Option D monkey-patch on MarkdownManager.prototype" (§9 Phase 1)

**Alternative:** `bun patch @tiptap/markdown@3.22.3` to create a .patch file modifying `encodeTextForMarkdown` (line 910) and `parseInlineTokens` (line 647+) directly in `MarkdownManager.ts`. Same targeted changes, better tooling.

**Trade-off:**
- *Gained:* Type safety, cleaner upgrade story, fail-loud at install time, no runtime overhead, no private-method access pattern.
- *Lost:* Introduces patch infrastructure (one-time cost: `patches/` directory, lockfile entry). Slightly unfamiliar to developers who haven't used `bun patch`. Patch is still fragile across upstream changes — but so is monkey-patching, with worse diagnostics.

**Status:** CHALLENGED

**Suggested resolution:** Evaluate `bun patch` as the implementation mechanism for the same logical changes. If the team is unfamiliar with `bun patch`, a 5-minute spike confirms it works. The spec's monkey-patch code sketches become the patch file content instead.

---

### [H] Finding 3: linkRefDef Option A (doc-footer node) — the 1-way door schema risk is under-examined relative to Option C

**Category:** DESIGN
**Source:** DC1 / DC2
**Location:** D7 Decision Log, I4 evidence (T3-2), §9 Phase 3
**Issue:** D7 locks Option A (new `linkRefDef` atom node in ProseMirror schema) and rejects Option C (per-link attribute) for "latent correctness bug on WYSIWYG link-edit." The rejection is qualitative — I4 doesn't quantify the bug's frequency or severity. Meanwhile, Option A introduces a new node type to the Y.Doc schema, which is a 1-way door acknowledged by D7 itself. Investigation reveals:

1. **No schema versioning exists.** The codebase has no `schemaVersion` field, no migration mechanism, no compatibility detection (confirmed by codebase search).
2. **ProseMirror silently drops unknown node types.** If a Y.Doc containing `linkRefDef` nodes is opened by an older client (pre-Phase 3), `schema.nodeFromJSON()` silently discards the unknown nodes. The reference definitions vanish with no error, no warning, no log.
3. **Mixed-version client risk.** During rollout or if a user pins an older CLI version, Y.Docs created after Phase 3 would lose linkRefDef content when opened by a pre-Phase 3 client. This is a collaboration scenario the spec's current deployment table doesn't address.
4. **Option C's "latent correctness bug"** is a graceful degradation: a reference link still works, it just retains the old URL until the user manually updates the definition attribute. The link remains functional; it points to a stale URL. Option A's silent node drop is a *data loss* scenario: the definitions disappear entirely.

**Current design:** "linkRefDef = Option A (doc-footer invisible node)" (D7, LOCKED, 1-way door)

**Alternative:** Option C (per-link `refDef` attribute on existing link marks). No new node type, no schema migration risk, no silent node drops. The link-edit corruption case requires investigation: how often do users edit link URLs in WYSIWYG? In a knowledge base (P1 persona), links are usually inserted once and rarely re-pointed. The "latent correctness bug" may be a rare edge case whose impact (stale URL, still functional) is lower than Option A's failure mode (definitions silently vanish).

**Trade-off:**
- *Gained:* No new schema node (avoids 1-way door entirely). No mixed-version client risk. Simpler implementation (~40 LOC on existing mark vs ~40 LOC new node + serialization coordination).
- *Lost:* The link-edit edge case exists. Option A is cleaner for *serialization* (definitions appear as block nodes in document order, easy to emit at doc footer). Option C requires the serializer to reconstruct definitions from scattered link attrs at render time — more complex serialization logic.

**Status:** CHALLENGED

**Suggested resolution:** Quantify Option C's link-edit bug. How often do users change a link's target URL via WYSIWYG (not via source mode, where they'd edit the definition directly)? If rare (likely in a knowledge-base product), Option C's lower schema risk may dominate. At minimum, the spec should acknowledge the silent-node-drop risk of Option A and describe a mitigation (e.g., schema compatibility check, logging when unknown nodes are dropped).

---

### [H] Finding 4: No production observability for patch-induced fidelity regressions

**Category:** DESIGN
**Source:** DC2
**Location:** §6 R1, §6 R14, §7 Success metrics, §14 Risks
**Issue:** The spec's entire observability story is test-time: PBT catches bugs in CI, corpus tests catch regressions, build-time assertion catches property existence. There is zero production-time observability for when the patches produce wrong results. Investigation of the current codebase reveals:

- `serialize()` failures in `persistence.ts:onStoreDocument` propagate as uncaught exceptions — but logical errors (wrong output, not exceptions) are invisible.
- Observer A/B sync errors use `console.warn`/`console.error` — no structured logging, no metrics.
- The existing metrics endpoint (`/api/metrics/reconciliation`) tracks reconciliation counts but nothing about fidelity.
- The `onSyncError` callback in `observers.ts` is wired but only fires on exceptions, not on logical corruption.

What's missing from the spec:

1. **No runtime fidelity check.** If `encodeTextForMarkdown`'s replacement subtly misbehaves on a token type the PBT generator didn't cover, the corruption is silent until a user reports garbled content or a git diff reveals entity encoding.
2. **No logging for patch application.** When the prototype patch is applied at module load, success/failure is not logged. A silently-failing patch would revert to upstream entity-encoding behavior with no signal.
3. **M4 (git-diff noise reduction) is "manual check on 5 real docs."** This is a one-time verification, not ongoing observability. If a regression is introduced in 3 months, there's no automated detection.
4. **No graceful degradation.** If the patch can't be applied at runtime (property missing, minified build, tree-shaking), the spec specifies a build-time assertion that fails the build. But in production, the fallback should be: apply patch → verify behavior → if verification fails → log warning + use original behavior. The current design is: fail hard at build, nothing at runtime.

**Current design:** Build-time assertion + test-time PBT + manual git-diff check (§7 M4, M5)

**Alternative:** Add lightweight runtime observability:
- Log a structured message at module load confirming patch application (one line).
- Add an optional `assert-fidelity` endpoint or periodic check that round-trips a known test string through the pipeline and verifies byte identity (canary pattern).
- Wire fidelity-related warnings into the existing pino logger (`packages/server/src/logger.ts`) rather than console.warn.

**Trade-off:**
- *Gained:* Production visibility. Silent regressions become detectable. Debugging fidelity issues shifts from "reproduce the user's report" to "check the logs."
- *Lost:* ~20 LOC and a minor runtime cost (negligible — one round-trip of a known string on startup or periodic interval).

**Status:** CHALLENGED

**Suggested resolution:** Add a requirement for runtime patch-application logging and consider a startup canary check (round-trip a known fidelity-sensitive string, verify byte identity, log pass/fail). This is cheap insurance given the spec's central bet is on a monkey-patch that modifies a private upstream method.

---

### [H] Finding 5: Mega-PR (D10) is locked on contingent evidence and contradicts the spec's own risk assessment

**Category:** DESIGN
**Source:** DC1 / DC3
**Location:** D10 Decision Log, §14 Risks row 7, A1 Assumption
**Issue:** D10 locks "single mega-PR with 5 atomic commits" and is the only decision in the log that contradicts its own risk table. The risk assessment says:

> "Single mega-PR stalls in review — Medium likelihood, High impact. Mitigation: Fall back to hybrid (Phase 1 alone first) if review >7 days."

This mitigation is an admission that incremental delivery is the correct fallback. The question is: why not start with the fallback? The spec's evidence for D10:

1. **"PR #38 precedent"** — a single past mega-PR worked. Sample size of 1.
2. **"Worse rebase burden on Miles's PR #39"** — contingent on PR #39 being open. The deployment table (§13) says "our edits touch none of his 22 files," meaning conflict risk is already low regardless of PR strategy.

Meanwhile, A1 ("team has bandwidth for ~2400 LOC single-PR review") is MEDIUM confidence. The spec doesn't mention the review burden on cognitive load — a reviewer processing 5 conceptually distinct phases in one diff is more likely to rubber-stamp later phases than to review each with equal rigor.

**Current design:** "Single mega-PR with 5 atomic commits" (D10, LOCKED)

**Alternative:** Phase 1 as standalone PR (fixes all P0 bugs, establishes infra). Phases 2–3 as second PR (additive attribute/node changes). Phases 4–5 as third PR (cross-path tests + docs). Three PRs, three reviews, three independent revert points.

**Trade-off:**
- *Gained:* Phase 1 ships faster. Each PR is independently reviewable with focused cognitive load. Each PR is independently revertable. A1 assumption becomes irrelevant. The "Medium likelihood × High impact" stall risk drops to "Low likelihood × Low impact" per PR.
- *Lost:* 2 extra branches, 2 extra CI runs, potential minor rebase if Phases 2–3 branch conflicts with another PR. The "elegant 5-commit narrative" is lost.

**Status:** CHALLENGED

**Suggested resolution:** Downgrade D10 to DIRECTED ("prefer mega-PR but implementer may split if review velocity is slow") or re-lock as "Phase 1 standalone, Phases 2–5 bundled." The current LOCKED status forecloses the adaptive strategy the spec's own risk table recommends.

---

## Medium Severity

### [M] Finding 6: NG4 "no storage-layer sanitization" is tagged [NEVER] but should be [NOT UNLESS]

**Category:** DESIGN
**Source:** DC2
**Location:** §3 Non-goals NG4, §15 Future Work (render-layer sanitization)
**Issue:** NG4 states: "Storage-layer sanitization of raw HTML. Security against XSS is a render-layer concern (DOMPurify in docs site). Storage is lossless." Tagged [NEVER]. But:

1. The product already supports multi-user CRDT collaboration. The gap between "trusted collaboration" and "untrusted authorship" is one feature away (invite links, public editing, guest access).
2. Future Work §15 explicitly lists "render-layer sanitization specification" with trigger "before any untrusted-authorship features." This acknowledges the risk exists.
3. Storage-layer sanitization isn't about changing what's stored — it's about validating or flagging what's stored. A [NEVER] tag on validation implies the storage layer is architecturally committed to treating all content as trusted indefinitely.
4. The [NEVER] tag per spec convention means this "never needs doing under any foreseeable condition." That's false — the spec itself describes the foreseeable condition (untrusted authorship).

**Current design:** "[NEVER] NG4: Storage-layer sanitization of raw HTML." (§3)

**Alternative:** Retag as "[NOT UNLESS] NG4: Storage-layer sanitization of raw HTML. **Only if:** untrusted authorship is introduced (guest editing, public access, external content import without review)."

**Trade-off:**
- *Gained:* Accurate signal to future contributors. A [NOT UNLESS] tag with a clear trigger is a design guardrail; a [NEVER] tag is a footgun.
- *Lost:* Nothing. The work doesn't change — this is a documentation accuracy issue.

**Status:** CHALLENGED

**Suggested resolution:** Retag NG4 from [NEVER] to [NOT UNLESS] with the trigger from Future Work §15.

---

### [M] Finding 7: PBT 1000 runs (D9) — justified pragmatically but claimed with false precision

**Category:** DESIGN
**Source:** DC3
**Location:** D9 Decision Log, §6 R6, I2 evidence
**Issue:** D9 locks 1000 generative runs as the default. The evidence (I2) provides performance budgets (10k runs in ~10s) and a generator strategy, but no empirical analysis of how many runs are needed to surface known bugs. The claim of "dense bug density" is asserted but not demonstrated.

For the P0 bugs (entity encoding, backslash escape), failure is *deterministic* — any input containing `&`, `<`, `>`, `\*`, `\_` fails 100% of the time. PBT catches these at 1 run. The value of 1000 runs is for *structural* bugs (rare construct combinations that trigger edge cases in `parseInlineTokens`). But the spec doesn't present data on the failure probability distribution for structural bugs.

The difference between 100 and 1000 runs matters only if failure probability per case is between 0.1% and 1%. Below that range, even 1000 misses most failures. Above it, 100 catches most. Without empirical data, 1000 is a reasonable default — but presenting it as a calculated sufficiency threshold (via "dense bug density") overstates the evidence.

**Current design:** "PBT at 1000 runs default, 10k at STRESS_FIDELITY=1 nightly" (D9, LOCKED)

**Alternative:** No change to the number — 1000 is fine as a pragmatic default. But the Decision Log should acknowledge this is a pragmatic choice (balances CI speed vs coverage), not a statistically justified threshold. The "dense bug density" claim should be supported by empirical data or softened to "expected to surface most structural edge cases based on generator coverage."

**Trade-off:**
- *Gained:* Honest confidence calibration. Future contributors won't over-trust the 1000 number.
- *Lost:* Nothing material — the run count doesn't change.

**Status:** CHALLENGED

**Suggested resolution:** Update D9 rationale: "1000 runs chosen as a pragmatic default balancing CI time (~7s) against coverage. For deterministic bugs (entity encoding, backslash escape), 1 run suffices. For structural edge cases, 1000 provides moderate coverage of the generator's state space. Increase via STRESS_FIDELITY for deeper probing."

---

### [M] Finding 8: Paste-UX fork (D8) creates awareness-without-agency — the middle ground is the worst option

**Category:** DESIGN
**Source:** DC1 / DC3
**Location:** D8 Decision Log, §6 R10, §15 Future Work
**Issue:** D8 defers paste-UX behavior changes to a separate spec. Phase 4 includes V1 Playwright tests that *document current paste behavior*. This creates a specific organizational dynamic:

1. V1 tests will immediately reveal paste fidelity gaps (e.g., pasting `# Heading` from a terminal produces a text node, not a heading node — confirmed by I3).
2. These test results will be visible to the team in CI output.
3. Team members will naturally want to fix the documented broken behavior.
4. But the fix lives in an unfunded separate spec with no timeline, no owner, and no trigger beyond "after this spec ships."

This is awareness-without-agency — the tests create pressure to act without providing a sanctioned path to act. The alternatives are cleaner:

- **True deferral:** Don't test paste behavior in this spec at all. Paste fidelity is a separate concern (the spec says so). Testing it creates exactly the coupling the deferral was supposed to avoid.
- **Minimal inclusion:** Include markdown paste detection (`clipboardTextParser`) in this spec — I3 confirms it's ~30 LOC + the handler already exists in `tiptap-markdown`. This directly improves P1's paste experience without the full paste-UX investigation.

**Current design:** "Paste-UX forks to separate spec; this spec ships V1 tests as baseline only" (D8, §6 R10)

**Alternative A:** Remove R10 (V1 Playwright paste tests) from this spec entirely. True deferral.
**Alternative B:** Include minimal markdown paste detection (clipboard text → mdManager.parse) in Phase 1. ~30 LOC, directly improves P1 experience, doesn't require the full paste-UX investigation.

**Trade-off:**
- *Alternative A gained:* Cleaner scope boundary. No awareness-without-agency dynamic.
- *Alternative A lost:* No regression baseline for paste behavior. Future paste spec starts from zero.
- *Alternative B gained:* The single most impactful paste improvement ships with the fidelity work. P1 authors pasting markdown from terminals get heading nodes instead of literal text.
- *Alternative B lost:* Contradicts D8 scope boundary. Opens the door to "just one more paste fix."

**Status:** CHALLENGED

**Suggested resolution:** Choose one of the three positions (current, A, or B) with explicit acknowledgment of the awareness-without-agency risk. If keeping R10, document in the spec that V1 test failures are *expected and accepted* — they document current behavior, not regressions.

---

## Low Severity

### [L] Finding 9: @tiptap/markdown mid-implementation release scenario — "re-assess" is underspecified

**Category:** DESIGN
**Source:** DC2
**Location:** §16 Agent Constraints STOP_IF, §14 Risks row 1
**Issue:** The STOP_IF list includes: "@tiptap/markdown minor bump drops in mid-implementation (re-run probe, verify patches, re-assess)." The risk table rates this as "Low likelihood, Medium impact" with mitigation "pin exact version + build-time assertion."

What "re-assess" means is not specified. Does implementation pause? Continue on the pinned version (safe, since version is pinned)? Evaluate whether the new version fixes our bugs upstream (making patches unnecessary)? The answer matters because it determines whether a STOP_IF event triggers a 15-minute check or a multi-day re-investigation.

Given the version is pinned exact (R14), the most likely scenario is: implementation continues unaffected because `bun install` doesn't bump a pinned version. The STOP_IF trigger would only fire if someone manually bumps the pin — in which case the probe protocol (R15) applies. The STOP_IF entry is internally redundant with R14's pinning discipline and could be simplified.

**Current design:** "re-run probe, verify patches, re-assess" (§16 STOP_IF)

**Alternative:** Clarify: "If someone bumps the pinned @tiptap/markdown version during implementation, pause to re-run the 118-case probe. If all patches still apply and tests pass, continue. If not, assess whether the upstream change addresses our bugs (reducing patch scope) or introduces new conflicts (expanding it). Budget: 1 hour for the check."

**Trade-off:** Specificity reduces ambiguity for the implementer at no cost.

**Status:** CHALLENGED

**Suggested resolution:** Expand the STOP_IF entry with a 2-sentence protocol specifying what "re-assess" concretely means and what the time budget is.

---

### [L] Finding 10: No graceful degradation if monkey-patch application fails at runtime

**Category:** DESIGN
**Source:** DC2
**Location:** §6 R1, §6 R14, §14 Risks row 1
**Issue:** The spec specifies a build-time assertion that `MarkdownManager.prototype.encodeTextForMarkdown` exists. This catches the case where a version bump removes the property. But two scenarios are unaddressed:

1. **The property exists but its signature changed** (e.g., new parameter added). The prototype patch may apply but behave incorrectly. The build-time assertion checks existence, not behavioral compatibility.
2. **Tree-shaking or minification in production** removes or renames the method. Build-time assertion runs against unminified source; production may differ.

These are low-probability scenarios (especially with version pinning), but the mitigation is trivial: after applying the prototype patch, immediately call the patched function with a known test input and assert the expected output. If the assertion fails, log a warning and fall back to unpatched behavior (entity encoding returns). This costs ~5 LOC and catches all three failure modes (missing, changed signature, behavioral regression).

Note: if Finding 2 is accepted (switch to `bun patch`), this finding becomes moot — patch files modify source pre-build, so signature changes and minification are non-issues.

**Current design:** Build-time assertion on property existence (R14)

**Alternative:** Add behavioral assertion: `const test = patched.encodeTextForMarkdown('a&b', {type:'text'}, {type:'paragraph'}); assert(test === 'a&b', 'Patch verification failed')`. Log result. Fall back to original on failure.

**Trade-off:** ~5 LOC for runtime safety. No downside.

**Status:** CHALLENGED

**Suggested resolution:** Add a behavioral smoke-test assertion after patch application (regardless of whether the mechanism is prototype patch or `bun patch`).

---

## Confirmed Design Choices (summary)

**DC1 (simpler alternative):**
- **Patch the serialize layer rather than migrate** (I1 decision matrix): Holds strongly. All three migration alternatives (remark, markdown-it, custom serializer) have higher cost with marginal benefit. The evidence is thorough and the decision is well-justified.
- **Import CommonMark + GFM corpora** (D1): Clean, low-cost, high-coverage. The decision to use them as round-trip tests (not parse→HTML tests) is a smart repurposing.
- **Structured PBT generator** (I2): Correct — string-soup PBT on markdown is useless. The structured block-composition approach produces valid documents that actually test the pipeline.
- **Tier 2 attr preservation using `token.raw`** (I4): Sound. All 7 Tier 2 items rely on marked's `raw` field, which is documented and stable. No custom tokenizers needed.

**DC2 (stakeholder gap):**
- **Version pinning** (R14): Necessary regardless of patch mechanism.
- **5-tier test strategy** (D5): Well-designed. The invariant × corpus × regression × Playwright × integration split is thorough without being redundant.
- **Phase 1 addresses all P0 data-corruption bugs**: The priority ordering (entity encoding → backslash escape → frontmatter regex) is correct.

**DC3 (framing validity):**
- **The Complication's core claim holds**: The gap is real, tests are currently blind to it, and upstream won't fix it. The seven-invariant framework is a useful organizing principle. The intersection of "no upstream fix" + "current tests blind" + "39 material-difference constructs" genuinely justifies the investment.
- **The SCR's Situation is accurate**: Multiple evidence files corroborate the 2/118 byte-identical finding and the root-cause localization to `encodeHtmlEntities` + `parseInlineTokens`.
