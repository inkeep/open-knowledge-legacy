---
name: challenger-findings
description: Phase 5 challenger subprocess pressure-testing spec decisions, scope, and implementation
---

# Challenger findings

## Summary

The spec's decision-log reasoning is largely solid on the big-ticket items (D-Q5 retry+failOnFlakyTests, D-Q7 worker sizing, D-Q14 STOP-rule scope), but there is an accumulating evidence-vs-prose drift across §1, §6, §8, and the `evidence/` directory that already shipped meaningful dead work and is likely to generate more if /ship blindly executes the user stories as written. Three concrete issues stand out: (1) US-10 proposes to delete 5 `test.skip(webkit, ...)` calls that no longer exist in the tree as of commit `940d5a0a` — /ship would be executing on a stale world model; (2) AC-4 / §8 / US-17 / inventory-evidence claim 8 `waitUntil: 'networkidle'` occurrences when grep of `packages/app/tests/stress/*.e2e.ts` returns exactly 1; (3) source-polish.e2e.ts is allocated a migration user-story (US-16) for a `waitForTimeout` that was already removed. The §1 problem statement describes a world (3-browser matrix, webkit CORS skips) that no longer exists — the reshape landed in §5/§5b but not §1. These are not cosmetic; they directly change the actionable scope /decompose and /ship will see. Decision-level concerns are more nuanced and covered below.

## Angle 1 — Scope

### 1.1 §1 problem statement describes a world that no longer exists

§1 says: "cross-browser matrix of chromium + webkit + firefox", "3 slash-command tests and 1 accessibility describe block (5 tests total) are `test.skip(webkit, ...)`", "55 `page.waitForTimeout(N)`", and positions G3 as the "webkit CORS root-cause fix." All three claims are stale:

- `packages/app/playwright.config.ts` has no `projects` array — chromium is the default (commit `940d5a0a` "perf(ci): revert multi-browser to chromium-only"). §5 and §5c acknowledge chromium-only, but §1 was not rewritten.
- `grep -n "test\.skip" packages/app/tests/stress/slash-command.e2e.ts` returns empty. Commit `940d5a0a`'s commit message explicitly includes: "slash-command.e2e.ts: remove webkit-specific test.skip guards + unused browserName destructuring (dead code with single-browser config)." The 5 skips are already gone.
- §1 says 55, §8 says 73, AC-3 uses an exact-zero grep gate. These differ and 55 in §1 is the oldest snapshot.

This is not a cosmetic issue. The §1 SCR probes (particularly probe 1, "demand reality") build the case for the spec on problems that are mostly already solved. If a reader builds their mental model from §1, they will propose work that is dead.

### 1.2 US-10 mandates work that is already done

US-10: "G3 cleanup — remove dead `test.skip(browserName === 'webkit')` calls. 5 occurrences in slash-command.e2e.ts."

Direct grep confirms zero `test.skip(browserName === 'webkit')` calls in the tree today. `940d5a0a` removed them. AC-5 ("`grep -rn "test.skip(browserName === 'webkit'" packages/app/tests/stress/*.e2e.ts` returns **empty**") passes today — before any `/ship` work. This is an unambiguous zero-value story. /decompose will produce a `spec.json` entry for US-10 and /ship will report "nothing to do" — noise, not value.

### 1.3 AC-4 and US-17 are sized against 8 `waitUntil: 'networkidle'` that aren't there

Direct grep across `packages/app/tests/stress/*.e2e.ts`:

```
$ grep -rn "waitUntil: 'networkidle'" packages/app/tests/stress/*.e2e.ts
packages/app/tests/stress/slash-command.e2e.ts:38
```

Exactly 1 occurrence. The baseline commit `432a834b` had 3 (all in slash-command.e2e.ts — verified via `git show`). The inventory evidence file `current-state-inventory.md` claims 8, and §8 echoes "8 other navigation paths across the suite." Neither is grep-verifiable against the current tree or the stated baseline. US-17 ("Replace 8 occurrences across the suite") is 7-occurrence overcount. That matters because it's one of the user stories that /decompose will ship as a "walk the files and replace" task — if the author expected 8 and there is 1, the difference may mask real coverage gaps or push /ship to find "work that matches the pattern" by over-reaching into adjacent code.

### 1.4 US-16 proposes migration for a file that has 0 `waitForTimeout` calls

US-16: "G1 — `source-polish.e2e.ts` + `mid-type-recovery.e2e.ts` migration. Replace 1 `waitForTimeout` in each."

`grep -c "page.waitForTimeout(" packages/app/tests/stress/source-polish.e2e.ts` → 0. The only match in the file is in a comment: `// or the timeout expires — no manual waitForTimeout needed.` The _changelog's Phase 5 entry notes "inventory correction" from 74 → 73 because "source-polish now has 0," but US-16 was not halved accordingly — it still lists both files. Half of US-16's mechanical work is fiction.

### 1.5 `fr-7a-disconnect-source-mode.e2e.ts` is enumerated but not user-storied

§8 and §6c correctly note `fr-7a-disconnect-source-mode.e2e.ts` has 0 `waitForTimeout`. But there is no story for "keep it passing under the new retries=2 + failOnFlakyTests regime." The evidence's `main-ci-failure-inventory.md` omits it entirely (18 listed failures, fr-7a not in the top 18). Yet the file uses `page.routeWebSocket` (a Playwright 1.48+ API) for a disconnect-simulation pattern that is timing-sensitive in exactly the way this spec is meant to stabilize. Under `failOnFlakyTests: true`, a single retry-success in fr-7a will fail CI. The spec should either audit this file explicitly or acknowledge it as an uncovered surface.

### 1.6 CORS mitigation pattern could recur

§1 identifies the `waitUntil: 'networkidle'` + `pageerror`-throws-on-`/api/documents`-race as a pattern. The spec's §5c explicitly says "orthogonal improvements in touched files remain out of scope (no kitchen-sinking)." But CORS-like races are not webkit-specific — they are about `networkidle` as a readiness signal being underspecified. With chromium-only, the specific webkit error goes away, but:

- The underlying brittleness of `networkidle` as an "app ready" signal remains; Playwright docs mark it DISCOURAGED for all browsers.
- Any future test that adds a `pageerror` listener + `waitUntil: 'networkidle'` re-introduces the pattern.

US-17's migration is the real protection, but the framing as "8 occurrences to remove" is too narrow. The spec should explicitly STOP-rule `page.reload({ waitUntil: 'networkidle' })` and `page.goto(..., { waitUntil: 'networkidle' })` with the AC-4 grep — which it technically does through D-Q14. OK here.

### 1.7 The spec under-specifies how `waitForActiveProviderSynced` composes with new `fullyParallel: true` + `retries: 2`

`docs-open.e2e.ts`'s reference-pattern helper does `expect.poll(async () => page.evaluate(() => window.__activeProvider?.isSynced === true))`. Under `fullyParallel: true` with `workers: 4`, each worker mounts a fresh React tree in a fresh page — so `window.__activeProvider` is scoped per-page naturally. But the spec does not name this invariant (one window per page context, `__activeProvider` is window-scoped). If future helpers deviate (e.g., a worker-scoped broadcast channel), the pattern breaks silently. Worth a sentence in the shared-helpers doc.

## Angle 2 — Decisions

### D-Q5 — `retries: 2` + `failOnFlakyTests: true`

**Strongest alternative:** `retries: 0` + `failOnFlakyTests: false` on CI. Rationale for alternative: `retries: 2` triples the worst-case CI runtime of genuinely failing tests (the flake absorbs 3× the wall-clock before reporting failure). With `failOnFlakyTests: true`, the only surviving value of retries is to **diagnose** (does retry-2 succeed? implies flake) rather than **absorb** (retry-2 succeeded = green). That's a diagnostic signal, not a reliability gate.

**Failure mode on 110-test suite under `retries: 2` + `failOnFlakyTests: true`:** If ONE test flakes at 10% per-run rate under `workers: 4`, expected probability of at least one retry-success across the suite is significant; each retry-success fails the PR but after having consumed up to 3× the timing budget for that test. The 15-min Playwright timeout gets pressure from both directions: slower-per-test (retries) + need-to-retry-on-flake. A single 120s test that retries twice burns 6 minutes — ~40% of the budget. That is the realistic cost of `retries: 2`.

**Recommended sharpening:** Spec should acknowledge the 15-min timeout is under pressure from D-Q5 choices. AC-12 says "≤15 min CI budget" — this needs runtime validation once `retries: 2` is on, not claimed in decision log.

### D-Q6 — Artifact retention 14 days

Solid. Community norm 7-14d, 14d covers sprint-review, storage math clears free tier. No finding.

### D-Q7 — `workers: 4` on CI

**Strongest alternative:** `workers: 2`. The evidence the spec cites for `workers: 4` is "GitHub runners have 4 cores on free-tier Ubuntu" — but this is not load-bearing. GitHub Actions `ubuntu-latest` is 2 vCPU / 7GB RAM on the **free** tier (what a private repo's default runner looks like), or 4 vCPU / 16GB on `ubuntu-latest-4-cores` or on public repos. The spec does not confirm which runner class Open Knowledge uses. If it's 2 vCPU, `workers: 4` will be memory-contended + CPU-oversubscribed and produce MORE flakes from scheduling jitter, not fewer.

**Evidence for investigation:** Compare median test duration at `workers: 1`, `2`, `4` across 3 clean runs. The spec commits to `workers: 4` without this measurement. Playwright-stability's spec made the same `workers: 4` choice without evidence — this is a shared uncalibrated number.

**Where this becomes a real problem:** Under `retries: 2`, worker contention increases flake rate; flake rate triggers more retries; retries extend per-test wall-clock; budget pressure from AC-12 (15 min) becomes real. D-Q7 and D-Q5 are coupled in a way §10 doesn't acknowledge.

### D-Q9 — Video 1280×720

Valid. Trade-off acknowledged (2-3× file size, absorbable via 14d retention + failure-only upload). No finding.

### D-Q11 — Domain-grouped helpers vs flat

**Break-even point analysis:** Domain-grouped (`_helpers/sidebar.ts`, `_helpers/editor.ts`, `_helpers/clipboard.ts`, `_helpers/provider.ts`, `_helpers/index.ts` barrel) adds 5 files for ~6-8 helpers anticipated day-one. That's ~1.5 helpers/file. Community convention says domain-grouping wins at ~15+ helpers per D-Q42's own threshold.

**Import churn risk if a helper moves categories:** Likely. Imagine `waitForEditorEmpty` — does it belong in `editor.ts` or `provider.ts`? If a test uses `waitForEditorEmpty` and the helper moves from one to the other, all consumers need import updates. With a flat `_helpers/index.ts` and named re-exports, the movement is invisible to consumers.

**Recommended sharpening:** The spec should name the barrel-re-export as the import-surface: consumers import from `./\_helpers` (resolves to `index.ts`), never from `./\_helpers/sidebar`. That cauterizes the churn risk. §9's prose implies this but neither §6b US-2 nor D-Q11 state it explicitly.

### D-Q29 — `page.clock` only for "debounce-settled" waits

**Is "debounce-settled" a crisp boundary?** No. The spec defines it narrowly via examples (Observer A 50ms, Observer B 300ms, persistence 2s) but also excludes "connection-lifecycle." The existing QA-015 test in `docs-open.e2e.ts:740` uses `page.clock.runFor(5_000)` to advance past `RECYCLE_DEBOUNCE_MS = 4000` — provider-pool recycle timer on sustained WS disconnect. By the spec's own classification, RECYCLE_DEBOUNCE is both "debounce-settled" (it's a `setTimeout` inside `provider-pool`) AND "connection-lifecycle" (it's driven by WS disconnect). The boundary is fuzzy.

**What happens when a test mixes debounce + network in one flow?** D-Q29 gives no guidance. Example: typing-defer (300ms) + CRDT sync over WebSocket. Install clock, advance past 300ms, then wait for real WebSocket message — `page.clock.install()` freezes ALL timers including the WebSocket heartbeat. Tests that mix are fragile without an explicit protocol. The spec should document "install clock → advance → uninstall → await real-async" as the mixed pattern.

**Recommended sharpening:** D-Q29 should state: "`page.clock` is compatible only with timers owned by the local JS event loop (setTimeout, setInterval, rAF, debounce). It is INCOMPATIBLE with any real-async wait (network, WebSocket message, CRDT propagation across peers). Tests that need both must install+advance+uninstall sequentially, or use real time throughout." This is implied by §11 Q4 + D-Q4 but not codified in the primary decision.

### D-Q40 — Start with grep, escalate to AST if circumvented

**Can grep miss something biome/AST would catch?** Yes, trivially:
- `const waitMs = 300; await page.waitForTimeout(waitMs);` — caught by substring match (the call is still visible).
- `const fn = 'waitForTimeout'; await page[fn](300);` — NOT caught by substring for `page.waitForTimeout(`. This requires AST.
- `await Promise.race([page.waitForSelector(...), new Promise(r => setTimeout(r, 300))])` — NOT caught; wrapped inside a Promise constructor. Requires the second pattern in D-Q14 (`new Promise(resolve => setTimeout(resolve,`).
- `await page.evaluate(() => new Promise(r => setTimeout(r, 300)))` — NOT caught; inside `page.evaluate`'s string-interpolated callback, grep cannot statically see through. Requires AST + cross-domain reasoning.

Only the last is non-trivial to circumvent. Adversarial circumvention is unlikely because the STOP rule's target audience is agents following the path-of-least-resistance — any future contributor who circumvents intentionally is outside the rule's design scope.

**Recommended sharpening:** D-Q14 already covers `new Promise(resolve => setTimeout(resolve,` — good. The spec should explicitly accept the `page.evaluate(string)` gap with "AST deferred until observed" rather than leaving it implicit under D-Q40's YAGNI. One-line comment in the STOP-rule test file, not a new decision.

### D-Q32 (and D-Q7) — local `workers: undefined`

`workers: process.env.CI ? 4 : undefined` → local default is 1 worker per Playwright default on a dev machine with no CI env var set. Acknowledged trade-off (ergonomic single-test debug). Good as-is.

### D-Q33 — QA-046 reversal

QA-046 is the clipboard spec's §13 commitment to "Chrome, Safari, Firefox tested via Playwright (desktop)". D-Q33 annotates that spec's §13 to mark QA-046 "Deferred." But QA-046 ≠ §13 — I searched the clipboard spec and found no mention of "QA-046" at all. The clipboard spec uses FR-numbers and §13 is "In Scope (implement now)." §13's Deployment subsection table literally has "Cross-browser | Chrome, Safari, Firefox tested via Playwright (desktop) + BrowserStack (optional) | paste-fidelity.e2e runs on all three." That is what gets reversed — and the reversal is non-trivial because §13 is NOT a deferred/noted item, it is the spec's in-scope implementation commitment.

**The follow-up plan (D-Q33: "update §13 in a follow-up to this PR, not blocking merge") is risky:**
- If this spec's PR merges first and removes the webkit/firefox projects, but the clipboard spec's §13 has not been annotated, any future reader of the clipboard spec will believe cross-browser testing is active and be surprised when a clipboard bug slips through.
- "Not blocking merge" defers documentation debt. That is exactly the pattern CLAUDE.md's greenfield directive rules out. D-Q33 is a contradiction of the very precedent the spec uses to justify other LOCKED decisions (e.g., D-Q10 "no test.fixme markers").

**Recommended sharpening:** Either block the merge on clipboard spec annotation (LOCKED), or redefine the reversal as a pure code change with the clipboard spec's §13 table-row updated in this same PR. Not a follow-up.

### D-Q41 — Post-migration monitoring deferred to built-ins

The spec's greenfield adherence is weakest here. "Built-ins first" → relies on GitHub's PR annotation when `failOnFlakyTests` fires. That annotation is a temporary signal (fails the PR, blocks merge). There is no flake-trend dashboard, no week-over-week regression detection, no ratchet on post-merge stability. If a flake appears and gets retried-to-green across 10 merges, the 10 PRs each saw it, none of them blocked, and there is no memory. This is "YAGNI"-framed deferred debt.

The alternative is Tier 2 nightly "repeat-each=10" scheduling — catches drift that PR-time retries absorb. Cost is ~one workflow file.

## Angle 3 — Implementation risk

### US-11 — slash-command 44 waitForTimeout → condition waits

**Is each site's replacement trivially derivable from existing code, or will /ship need judgment calls?**

From the `waitForTimeout-inventory.md` evidence file's "Representative patterns" section:

- Menu-open after `/` (pattern: `page.keyboard.type('/'); await page.waitForTimeout(300);`) — derivable to `waitForSelector('[role="listbox"]')` mechanically.
- Menu-filtered after keystroke (pattern: `page.keyboard.type('/heading'); await page.waitForTimeout(300);`) — NOT derivable. The inventory note says "need a signal that keystroke has been processed and options list reflects the filter. Candidate: `expect.poll(() => menu.optionCount)` stabilizes or a `data-filter-query` attribute." That is a judgment call (which is the real signal?) and potentially requires new DOM instrumentation.
- Insertion landed after Enter (pattern: `waitForTimeout(300)` after `page.keyboard.press('Enter')`) — partially derivable via `waitForFunction(() => document.querySelector('.ProseMirror').textContent.includes(expected))` but the `expected` differs per-test. The `expected` values are embedded in the test's assertion logic.

44 sites × some-share-of-judgment-calls × /ship's parallel subprocesses = significant fan-out. **Recommended sharpening:** For slash-command specifically, US-11 should include a pre-mapping table (site-by-site signal-replacement plan) committed as evidence before /ship begins. The per-test audit is mentioned in D-Q1 "per-site audit happens at migration time" but that's too late for a decompose gate.

### US-19 — sidebar-folder flake investigation with 4 hypotheses

**Priority order of hypotheses:**
(a) locator strict-mode — quick to rule out (check if `page.getByRole('button', { name: 'sidebar-folder' })` matches multiple nodes). 5 min of reading `ux-interactions.e2e.ts:209-263` + a simple assertion in a reproducer.
(b) file-watcher indexing race — quick to rule out via `curl /api/documents` post-setup and comparing against what sidebar renders.
(c) shared-fixture contention — longest to diagnose because it requires running the test under `--workers=4 --repeat-each=10` and comparing stack traces per-worker. Expected cost: an hour.
(d) React commit-phase race with Activity mount — most speculative; requires adding tracing to understand timing of Activity mounts vs sidebar mounts.

The spec does not name the order. **Recommended sharpening:** /ship Phase 3 should start with (a) then (b) before investing in (c)/(d). The spec is silent on priority, but /ship's investigation budget is finite; ordering matters.

### US-21 — QA-022 baseline-relative: "capture p50Baseline from a clean run"

**Whose clean run?** §6 US-21 says `tests/stress/perf-baseline.json` with `p50Baseline` "captured from a clean run." Three unclear axes:
- **Environment**: Local (Nick's machine: faster?) or CI (GitHub runner)? Runner variance is the concern — a baseline from a dev machine over-constrains CI; a baseline from CI over-relaxes local.
- **Which clean run**: a snap-in-time run? A median of N runs? The spec says "one clean run" but QA-022 is a 60fps perf test where even "clean" can swing.
- **Baseline-update protocol**: when does it get refreshed? The spec says "Baseline-update protocol documented alongside" — but that protocol is itself undocumented in this spec. Placeholder for `/ship` to define. Is it daily? Every merge? Once per refactor?

The CLAUDE.md perf-gate precedent (`max(2× p99 variance, 10% absolute floor)`) has a baseline at `packages/core/tests/perf/baseline.json`. That has a proven pattern; US-21 should reference it explicitly rather than invent a parallel process.

### US-22 — Mechanical STOP rule test — is `wysiwyg-stop-rule.test.ts` a good template?

I read `packages/app/src/editor/clipboard/wysiwyg-stop-rule.test.ts`. The shape:
- Reads ONE source file (`TiptapEditor.tsx`).
- Checks 4 distinct regex patterns (negated for 3, positive for 1).
- Uses `describe` + `test` blocks with clear precedent-reference in the docstring.

**Is it a good template for e2e-stop-rules.test.ts?** Partially. The template's strength is the per-pattern `test(...)` block, so a failure message reads "TiptapEditor.tsx does NOT register handleDOMEvents.copy — FAIL" — easy to act on. Applied to e2e-stop-rules, each of the 13 E2E files × 3-4 patterns is a lot of test() assertions. Two shapes are reasonable:

1. **Per-pattern**: one `test()` per (pattern × file), ~52 assertions. Verbose but pinpoint.
2. **Aggregate**: one `test()` per pattern, with the failure listing all violating files. Compact but hides which file.

The spec gives no guidance. **Recommended sharpening:** Name the shape in US-22. Per-pattern (the template's default) is the more discoverable option and survives the adversarial "one new file slipped in" case better.

**Structural mismatch:** `wysiwyg-stop-rule.test.ts` is colocated next to its enforced file. e2e-stop-rules lives in `packages/app/tests/integration/` and enforces `packages/app/tests/stress/*.e2e.ts`. Location discovery for a future developer will be slightly harder — they'll need to learn the convention.

## Angle 4 — Architectural correctness

### Precedent #13 — bridge invariants auto-enforced + property-verified

This spec's STOP rule (D-Q14/D-Q15) is philosophically aligned — "grep-enforced mechanical assertion, no allowlist, fails CI." But there are two weaker aspects:

1. **No property-based component.** Precedent #13(d) says "Example-based coverage is a floor, not a ceiling" — bridge fuzzers sample the race space. The STOP rule is example-based (grep for specific patterns). For mechanical STOP rules about test code shape, this is reasonable (the pattern IS the invariant), but worth acknowledging. A property-verified version would be: "For every CI failure, the video+trace artifact must include ≥N DOM snapshots." No current decision says this, and the artifact-upload is silently best-effort.
2. **Watcher-level enforcement missing.** Precedent #13(a) says watchers are primary; manual `assertBridgeInvariant` is reinforcement. This spec's STOP rule is "manual grep assertion in CI"; there is no per-commit pre-commit hook or live watcher. Adding `bun run check` integration (which D-Q14 names) is the intended watcher, but the pattern of "check-before-push" vs "check-during-test-run" is load-bearing in the bridge work and not matched here.

Overall the spec's STOP rule design fits precedent #13 reasonably but does not claim precedent #13 by name. The spec's US-23 ("AGENTS.md precedent #20") would benefit from explicitly citing #13's lineage.

### Precedent #1 — typed transaction origins

This spec adds no Y.js transaction-origin surfaces, so #1 is not directly relevant. But: any new `_helpers/provider.ts` function that constructs a `LocalTransactionOrigin` for test-side writes should follow #1 (object refs, not strings). D-Q13 says "zero net-new hooks" so this is likely fine, but not explicitly acknowledged. If US-18's `installClockAfterSync` ends up sharing state with an existing origin, #1 applies.

### Precedent #9 — schema is add-only forever

The spec's US-3 documents `a.wiki-link[data-target]` parseHTML rule divergence from `span[data-wiki-link]`. The divergence is additive (new parseHTML rule with `priority: 100`, not a narrowing of an existing rule). Precedent #9 is respected.

### Precedent #18 — hybrid Activity + Suspense

Not directly in scope. But: tests of the `EditorActivityPool` / `ACTIVITY_MOUNT_LIMIT` behavior (docs-open.e2e.ts §F-series) rely on the `__activeProvider` hook which is DEV-gated per #18(d)'s module-level promise cache pattern. The spec's G1 migration touches `docs-open.e2e.ts` (2 waitForTimeout) — /ship needs to avoid introducing per-Activity assumptions that break under `fullyParallel: true`. Minor; probably fine.

### Contradiction with CLAUDE.md greenfield directive

CLAUDE.md's greenfield directive says: "no deferred tech debt, resolve findings in-scope." D-Q33 defers clipboard-spec §13 annotation to a follow-up ("not blocking merge"). D-Q41 defers post-migration monitoring to "built-ins first." These are both deferred work explicitly tagged as separate commits. Both can be pulled into this PR with minimal extra cost.

## Angle 5 — Cross-spec

### D-Q33 vs clipboard spec §13

The clipboard spec's §13 Deployment table literally commits to cross-browser. D-Q33 says this spec reverses it, with documentation as a follow-up. Two issues:

1. **QA-046 does not exist as a label in the clipboard spec.** I searched. No "QA-046" string anywhere. D-Q33 and the challenger prompt both reference "QA-046" but the canonical location in the clipboard spec is §13 Deployment + §13 Next Actions step 8 ("Extend paste-fidelity E2E test ... with cross-view + cross-source scenarios" — implicitly browser-matrix). The terminology "QA-046" appears in this spec's commit history and related artifacts but not in the clipboard SPEC.md. /ship cannot "update §13 to re-classify QA-046" because there is no such item to re-classify.
2. **Follow-up sequencing risk.** If e2e-observability merges first with cross-browser removed, and the clipboard spec's §13 Deployment table still says "paste-fidelity.e2e runs on all three," every reader sees a contradiction. Pull the clipboard spec annotation INTO this PR's diff. That's the only way the precedent-discipline is maintained.

### Clipboard spec §5 Out-of-Scope overlap

Clipboard spec §3 Non-goals don't overlap with this spec's scope — they are about clipboard features (BlockNote-style MIME, Cmd+Shift+C, Word list reconstruction). No conflict. Clipboard's §5 User Journeys reference WYSIWYG+Source clipboard paths that this spec's US-11/US-12 migrate timing for — no SCOPE conflict but there is a file overlap. If /ship's US-12 paste-fidelity migration conflicts with a pending clipboard-spec improvement, rebase risk. Low probability given clipboard-spec is at `Approved` status; likely already merged.

## Angle 6 — Greenfield adherence

### §15 Future Work — DEV-gating for `__agentFlashState`/`__graphHarness`

CLAUDE.md precedent #19(b) + DocumentContext.tsx establishes `import.meta.env.DEV` gating for all test hooks. `TiptapEditor.tsx:277` sets `window.__agentFlashState = state` unconditionally. `GraphView.tsx:796` sets `window.__graphHarness = harness` unconditionally. Both ship in production bundles.

Is this "separate concerns" or "deferred debt"?
- **If** the scope is "E2E observability + determinism," DEV-gating window hooks is adjacent. Arguable "separate concerns."
- **But** the greenfield directive says no deferred debt. The fix is ~6 lines per file (wrap in `if (import.meta.env.DEV) { ... }`). The claimed cost is "~20 LoC + a grep-test STOP rule." 20 LoC is not "kitchen-sinking." Under greenfield, absorb.

§15's framing ("surfaced opportunity, not deferred debt") is motivated reasoning. It is deferred debt that happens to be surfaced. Either absorb it or explicitly accept the violation with a one-line rationale ("defer because X"). Currently the §15 bullet evades the question.

### "Start with grep, escalate to AST" as YAGNI

D-Q40: "AST-based rule deferred until circumvention observed" — reasonable YAGNI. NOT deferred debt because grep covers 99%+ of agent-in-path-of-least-resistance behavior and the circumvention cost rises with `page.evaluate(string)` rather than AST. This one holds up.

### "Post-migration monitoring deferred to built-ins first" — YAGNI or debt?

D-Q41. Under greenfield, "built-ins first" is reasonable IF the built-ins cover the gap. GitHub's `failOnFlakyTests` fails PRs — that's coverage. The post-merge stability question is:
- Does main's CI stay green week-over-week?
- Are there PRs that merged with quiet flakes that now show as drift?

GitHub's built-in answer is "re-run the workflow" which provides no aggregated stability signal. This is a genuine gap. Recommend committing to a minimum viable Tier 2 nightly `repeat-each=3` job in this spec, or acknowledge the gap explicitly as "accepted, revisit after 4 weeks on main."

## Strongest individual concern

**D-Q33 (QA-046 reversal) + stale §1 problem statement + dead-work user stories (US-10, half of US-16).**

These are one integrated concern: the spec was partially rewritten to reflect the chromium-only + PR #188 + post-#185 reshape, and the rewrite is incomplete. If /ship begins tomorrow:
- US-10 will be a no-op (zero `test.skip(webkit)` to remove in the tree).
- Half of US-16 will be a no-op (source-polish has 0 `waitForTimeout`).
- AC-4 / §8 claim 8 `waitUntil: 'networkidle'` when grep returns 1.
- §1 describes a 3-browser world that no longer exists.
- D-Q33's clipboard-spec annotation is a follow-up, not in this PR's diff.

The cumulative effect is that /decompose produces a spec.json with a meaningful fraction of the user stories resolving to "nothing to do" — wasted /ship cycles, noise in the PR, and loss of author credibility when reviewers see US-10 proposing deletion of code that isn't there.

**Recommended sharpening before /ship begins:** Re-grep every quantitative claim against the current tree (`packages/app/tests/stress/**` at current HEAD), correct §1 and §6 to match reality, remove US-10 entirely, halve US-16 to just mid-type-recovery, and either pull D-Q33's clipboard-spec annotation into this PR's diff or LOCK the annotation as a blocking merge requirement.

## What survived scrutiny

1. **D-Q5 retries + failOnFlakyTests** — correct "tolerant runner, strict verdict" design. Concern is coupling with D-Q7 worker sizing and 15-min budget, not the decision itself.
2. **D-Q14/D-Q15 STOP-rule scope + zero-tolerance** — aligned with precedent #13's philosophy. Grep-based mechanical gate with no allowlist holds.
3. **D-Q6 14-day retention** — well-grounded in community norm and storage math.
4. **D-Q29 `page.clock` only for debounce-settled** — right *direction* even if the boundary needs sharpening. `page.clock` in QA-015 (docs-open) is a proof-by-existence that the pattern works; this spec extends it explicitly.
5. **D-Q16/D-Q17/D-Q18 (PR #188 absorbed fix verification)** — solid, source-verified. `resolved: false` hardcoding is correct given the two parseHTML rules serve different sources. `wrapAsInlineCode` scoping to code-only mark handler is source-verified.
6. **D-Q31 spec title stability** — correct. Renaming would lose git-log signal and change artifact IDs.
7. **§5b PR #188 scope takeover** — clean absorption with clear per-fix status. The obsolete Fix 1 is correctly noted.
8. **Cluster 5/6/7 deferral to /ship investigation spikes** — pragmatic. "Reproduce first, then fix" is the right protocol for load-dependent flakes.
9. **US-18 `installClockAfterSync` helper precedent-setting** — good. Ships the pattern even without immediate adopter so future tests have the template. Matches precedent #11/§12's "bridge between write surfaces is one place" discipline.
10. **AC-12 15-min budget AC** — right instinct to gate on budget. Under-specified with respect to D-Q5/D-Q7 coupling (see Angle 2), but naming the gate is better than not.
