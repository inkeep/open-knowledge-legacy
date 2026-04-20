# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/reports/e2e-isolation-and-broadcaster-lifecycle/REPORT.md`
**Audit date:** 2026-04-18
**Total findings:** 9 (2 High, 4 Medium, 3 Low)

Independent audit covering Track A (test isolation) and Track B (broadcaster lifecycle). Verified against:
- Local OSS clone `~/.claude/oss-repos/hocuspocus/` (Connection.ts, Document.ts, RELEASE_NOTES_V4.md, tests/utils/newHocuspocus.ts)
- Local OSS clones `~/.claude/oss-repos/outline/` (collaboration.ts:82-108, logging/sentry.ts:50) and `~/.claude/oss-repos/docmost/` (ws-socket-wrapper.ts)
- `gh CLI` fetches of GitHub issues ueberdosis/hocuspocus#1017, #1032, websockets/ws#1017, #1172, #2148
- `WebFetch` verification of `remix-run/react-router/integration/playwright.config.ts`
- Local file inspection of `packages/app/playwright.config.ts`, `packages/app/tests/integration/test-harness.ts`, `packages/app/tests/stress/*.e2e.ts`

---

## High Severity

### [H] Finding 1: Fabricated user-setup quote in key-finding attribution (ws#2148)

**Category:** FACTUAL
**Source:** T4 (web verification via gh CLI against primary source)
**Location:** REPORT.md:50 (key findings bullet); evidence/b3-tcp-async-race.md:22-24 (source)

**Issue:** REPORT.md's Track B key-finding quote conflates a user statement with a maintainer statement, attributes both to "@lpinca," and the user portion does not appear in the cited thread. The evidence file that constructed this quote also does not match the actual #2148 discussion.

**Current text (REPORT.md:50):**
> **Track B — EPIPE is a kernel-level TCP race, not a library bug.** [ws maintainer @lpinca, issue #2148](https://github.com/websockets/ws/issues/2148): *"`readyState` pre-check doesn't help. Those are probably buffered writes that can't go through."* No userspace library can eliminate EPIPE from TCP socket writes.

**Evidence of the fabrication:**

Direct fetch of `websockets/ws#2148` via `gh issue view 2148 --repo websockets/ws --comments`:
- The lpinca quote *"Those are probably buffered writes that can't go through. There is not much to do apart from checking the `websocket.bufferedAmount` and stop writing if it grows too much."* is **CONFIRMED VERBATIM**.
- The claimed user quote *"We do have an explicit check before the `ws.send` that is `if (ws.readyState !== ws.OPEN) {`, but that doesn't seem to help"* **DOES NOT APPEAR** in the thread. A full-text grep for "readyState" and "OPEN" in the 323-line thread returns only user code examples (`ws.onopen = function...`) and an unrelated maintainer remark about `'close'` event emission — nothing matching the attributed quote.
- The #2148 thread is about `ERR_STREAM_DESTROYED` / `Cannot call write after a stream was destroyed` triggered by 200K-message flooding, not about a pre-`send` `readyState` guard.

The inferential conclusion ("userspace readyState pre-check is insufficient") is still supportable from other primary sources (ws#1172 maintainer quote, the general behavior of `net.Socket` documented in nodejs/node#6083/#24111/#11918). But the specific composite quote as framed in REPORT.md is a misattribution.

**Status:** CONTRADICTED (primary-source verification of issue thread)

**Suggested resolution:**
Replace the composite quote with the real lpinca quote from #2148 (the "buffered writes" quote) and separately cite the ws#1172 quote ("EPIPE means you're writing to a socket when the other end has terminated the connection. It's a runtime error and there is nothing you can do to avoid it") for the "nothing userspace can do" framing — which the evidence file *does* attribute correctly to #1172. Then update evidence/b3-tcp-async-race.md line 22-24 to remove the fabricated user-setup turn and keep only the maintainer quote.

---

### [H] Finding 2: "Key-finding" line 50 attribution error compounds because REPORT reader won't see evidence disaggregation

**Category:** COHERENCE
**Source:** L7 (inline source attribution) + L4 (evidence-synthesis fidelity) — tightly coupled to Finding 1

**Location:** REPORT.md:50 — "Key Findings" bullet; Evidence cross-ref b3-tcp-async-race.md:11-27

**Issue:** Even if Finding 1 is resolved at the evidence layer, the REPORT.md-level "Key Findings" bullet is a **single sentence with a single citation** that presents a composite quote — a reader relying only on the executive summary and key-finding bullets has no signal that the quote was reconstructed from two different sources. Because the quote is presented as a single exchange from "@lpinca, issue #2148", the reader cannot assess credibility without opening the evidence file and then the raw GitHub threads. The L7 lens (can a reader assess credibility of quantitative/verbatim claims without opening evidence?) fails here.

**Current text (REPORT.md:50, full bullet):**
> **Track B — EPIPE is a kernel-level TCP race, not a library bug.** [ws maintainer @lpinca, issue #2148](https://github.com/websockets/ws/issues/2148): *"`readyState` pre-check doesn't help. Those are probably buffered writes that can't go through."* No userspace library can eliminate EPIPE from TCP socket writes.

The phrase "`readyState` pre-check doesn't help" in quotation form looks like a direct maintainer statement; the report does not flag it as paraphrase. This is the single most load-bearing factual claim supporting "no userspace filter can prevent" (REPORT.md:42, exec summary).

**Evidence:** Same as Finding 1.

**Status:** INCOHERENT (report surface misrepresents evidence layer; evidence layer itself has factual error per Finding 1)

**Suggested resolution:**
Either (a) rewrite the bullet to cite two distinct primary sources with separate quote blocks ("#1172: *'EPIPE means ... nothing you can do to avoid it.'* + #2148: *'Those are probably buffered writes that can't go through.'*"), OR (b) paraphrase the composite claim and cite both issue URLs without a merged quoted string. Either keeps the load-bearing inference intact while eliminating the misattribution.

---

## Medium Severity

### [M] Finding 3: "Simplest migration" claim glosses over Tier 1 harness interaction

**Category:** COHERENCE (missing dimension) + FACTUAL (imprecision)
**Source:** L3 (missing conditionality) + audit prompt dimension-6 (missing dimensions)
**Location:** REPORT.md:40 (exec summary), 192 (A4 cost table "Already implemented in Tier 1 harness"), 146 (A2 "same pattern as Tier 1"), 407 (Track A migration shape)

**Issue:** The report claims Option A "reuses the existing `getFreePort()` utility already present in Tier 1 integration harnesses" (line 40) and that the Tier 1 harness pattern ports directly. In reality, two distinct uses of `getFreePort()` coexist and the report never addresses the interaction:

- **Tier 1 integration harness** (`packages/app/tests/integration/test-harness.ts:62`): allocates a free port, then spawns Hocuspocus **in-process** via `createTestServer()`. Reference comment at `test-harness.ts:10-11`: *"getFreePort() pre-allocates a port because Hocuspocus Server.listen(port) has `if(port)` guard that's falsy for 0."*
- **Option A (proposed)**: allocates a free port, then spawns `bun run dev` as a **child process**.

These are structurally different integrations with the same utility. The report's "reuses the utility" claim is correct at the function-call level but incorrect at the architectural-reuse level — Option A does not reuse the Tier 1 harness's in-process server wiring. Additionally, the report does not discuss:
- Whether per-worker Vite child processes and Tier 1 in-process Hocuspocus instances can co-exist in the same CI run without port-pool exhaustion
- Whether the migration shape needs to update `test-harness.ts` (answer: no, but the report should say so explicitly)
- Whether the existing `OK_TEST_CONTENT_DIR` plumbing (referenced in CLAUDE.md's "Worktree isolation" section) is already compatible with the worker-scoped fixture

**Status:** INCOHERENT / MISSING DIMENSION

**Suggested resolution:** Add a subsection under A4 or the migration shape (line 400-408) explicitly clarifying: (a) `getFreePort()` as a utility is reused; the Tier 1 in-process harness is NOT touched; (b) both patterns may run in the same CI job without conflict because ports are kernel-assigned per allocation; (c) `OK_TEST_CONTENT_DIR` already exists as the env var for tmpdir scoping — per-worker fixture just needs to set it per worker instead of per Playwright config.

---

### [M] Finding 4: "for consumers not affected by that specific recursion" conditional is un-adjudicated

**Category:** COHERENCE (missing conditionality → decision gap)
**Source:** L3 (missing conditionality) + L5 (summary coherence)
**Location:** REPORT.md:42 (exec summary), 359 (B5 "Decision triggers"), 415 (Track B ranked recommendation)

**Issue:** The Track B recommendation is conditional on whether the consumer (Open Knowledge) is affected by Hocuspocus #1017 recursion. The report never performs the adjudication — the reader is handed a conditional ("Pattern A if not affected; Pattern B if affected") without a test or evidence-backed answer for the consumer's actual status.

**Current text (REPORT.md:42):**
> *"Alternative wrapper designs (Docmost's `WebSocketLike` wrapper) exist and are stronger against a documented recursion bug (Hocuspocus #1017), but for consumers not affected by that specific recursion, the defensive-listener pattern is sufficient."*

**Current text (REPORT.md:422):**
> **Optional upgrade path: Pattern B (`WebSocketLike` wrapper)** if:
> - Affected by Hocuspocus #1017 recursion (symptoms: double `onDisconnect` fires).

The report states the symptom ("double onDisconnect fires") but does not direct the reader to check for it, nor does it cite prior grep/log inspection of the Open Knowledge codebase confirming whether the symptom has been observed. For a staff-level reader weighing architectural choices, this is a decision gap — they'd have to run an independent investigation to answer "am I affected?" before acting on the recommendation.

**Evidence:** Report does not cite any Open Knowledge production/CI log excerpts confirming or denying the double-disconnect symptom.

**Status:** INCOHERENT (conclusion-bearing recommendation but missing the gating test)

**Suggested resolution:** Either (a) add a one-paragraph diagnostic procedure ("before acting: `grep -c onDisconnect` on recent server logs; if count suggests double-fires on single disconnects, adopt Pattern B") OR (b) explicitly flag this as a Limitations/Open Question and pre-classify Open Knowledge based on what's known (e.g. "no double-disconnect symptom observed in 2026-04 CI logs → Pattern A recommended for Open Knowledge specifically; Pattern B remains the right choice if symptoms later emerge").

---

### [M] Finding 5: Executive summary asserts PR-206 "residual flakes" without citing evidence

**Category:** COHERENCE (unbacked assertion)
**Source:** L7 (inline source attribution) + Phase 2 reader-pass signal
**Location:** REPORT.md:40 ("residual test flakes even after test-logic fixes (the PR-206-class residual)")

**Issue:** The executive summary asserts as a matter of fact that single shared `webServer` creates cross-worker CPU contention "that manifests as residual test flakes even after test-logic fixes (the PR-206-class residual)." This is a load-bearing claim supporting the Track A recommendation — without the residual-flake claim, the "per-worker is architecturally-correct" conclusion reduces to theoretical fit rather than empirical necessity.

The report never cites PR #206 in full (no URL, no commit hash, no flake-rate metric). Evidence file A5 notes "the actual post-per-worker flake rate is empirical — must be measured after landing. No prior-art data on this specific transition exists." The exec summary's assertion outruns the evidence: A5 is explicit that the transition's improvement is observable-only, but the exec summary presents the "shared webServer causes residual flakes" claim as established.

**Evidence:**
- REPORT.md:40: *"Single shared `webServer` creates cross-worker CPU contention that manifests as residual test flakes even after test-logic fixes"*
- REPORT.md:218: *"Evidence: Cross-reference with PR #206 observations + the debug report."* — named but not cited inline
- REPORT.md:441: *"Empirical post-per-worker flake rate is not measurable without landing Option A."*

**Status:** INCOHERENT (exec summary stronger than evidence file) — the inner A5 section is honest; the exec summary overstates.

**Suggested resolution:** Reframe the exec-summary assertion as conditional ("the debug trigger for this report was a PR-206-class residual suspected to stem from cross-worker contention") or cite the PR/debug-report URL inline with a concrete flake-rate datum so a reader can assess credibility without opening the debug report.

---

### [M] Finding 6: #1017 "fixed by #1032 pointer inapplicable" claim is correct but the characterization "recursion is still present on main" needs a line pointer

**Category:** FACTUAL (precision)
**Source:** T2 (direct source read) + T4 (gh CLI verification)
**Location:** REPORT.md:329, evidence/b4-upstream-status.md:51-52

**Issue:** The report's claim that PR #1032's "fixed by" pointer is inapplicable to #1017's recursion is **correct** — verified via `gh pr view 1032 --json files`:
```
files: [
  {path: ".gitignore", additions: 1, deletions: 0},
  {path: "packages/extension-redis/src/Redis.ts", additions: 9, deletions: 2}
]
```
PR #1032 touches only `.gitignore` and `packages/extension-redis/src/Redis.ts` — not `packages/server/src/Connection.ts`. So the inapplicability claim is factually sound.

HOWEVER, the subsequent claim that "the recursion in `Connection.send` is **still present on main**" (REPORT.md:329) is presented without a line pointer to the current main-branch source. My direct read of `~/.claude/oss-repos/hocuspocus/packages/server/src/Connection.ts:154-168` confirms the send method body is:

```ts
send(message: Uint8Array): void {
  if (readyState === Closing || readyState === Closed) {
    this.close();  // ← the recursion-entry call
    return;
  }
  try {
    this.webSocket.send(message);
  } catch (exception) {
    this.close();  // ← the second recursion-entry call
  }
}
```

The recursion happens because `close()` fires onClose callbacks which may trigger awareness updates which call `send()` again. The claim is accurate but unverifiable from the report alone — a reader cannot assess "still present on main" without opening the repo. A short code snippet or permalink to the current main-branch lines would close this gap.

**Status:** CONFIRMED CORRECT but imprecise presentation

**Suggested resolution:** Add a GitHub permalink to the current `Connection.ts:154-168` on main (e.g. `https://github.com/ueberdosis/hocuspocus/blob/main/packages/server/src/Connection.ts#L154-L168`) or embed the snippet inline in the report. Evidence file b4 could additionally note that PR #1032 fixes the *trigger* of the crash (Redis extension's zero-connection awareness publish) but does not address the underlying send-side recursion — the two are at different layers.

---

## Low Severity

### [L] Finding 7: Inconsistent Hocuspocus #1017 framing between exec summary and B4

**Category:** COHERENCE (stance consistency)
**Source:** L1 (cross-finding contradiction, minor) + L6 (stance consistency)
**Location:** REPORT.md:42 (exec summary) vs REPORT.md:329 (B4) vs REPORT.md:423 (ranked recs)

**Issue:** The exec summary (line 42) frames #1017 as "a documented recursion bug." B4 (line 329) frames it as "the recursion in Connection.send is still present on main" (implicitly: an unfixed bug). The ranked recommendation (line 423) phrases it as "the #1017 recursion" (assumed factual). Three slightly different framings of the same upstream state.

None of these are wrong individually, but a staff-level reader may notice the terminology shift: "documented bug" (observed/acknowledged), "still present" (unfixed), "the recursion" (existing). The report would read more tightly if all three surfaces converged on a single framing.

**Status:** INCOHERENT (minor, stance drift)

**Suggested resolution:** Pick one framing — "a known unfixed recursion in `Connection.send` on Hocuspocus main as of 2026-04-18 (upstream #1017)" — and use it in all three locations.

---

### [L] Finding 8: "13+ test files" is fine but "4 workers" understates isCI config

**Category:** FACTUAL (precision, imprecision)
**Source:** T1 (codebase verification)
**Location:** REPORT.md:47

**Issue:** REPORT.md:47 claims "With 4 workers running 13+ test files, per-worker Vite cold-start (~2s each = 8s one-time) amortizes over the full suite — ~1-2% CI overhead vs the flake tax it eliminates."

- 13 test files confirmed: `find packages/app/tests/stress -name "*.e2e.ts" | wc -l` returns exactly 13. "13+" is fine.
- 4 workers confirmed: `playwright.config.ts:59` reads `workers: isCI ? 4 : undefined`.
- The "~1-2% CI overhead" figure is presented without derivation. The 8s / total CI minutes ratio depends on CI suite wall-time which is not stated. If the full Playwright suite wall-time is ~8 minutes (not unreasonable), then 8s / 480s = 1.7% which fits "~1-2%." But the report doesn't show this math.

**Status:** CONFIRMED but with undisclosed derivation

**Suggested resolution:** Add a one-liner derivation: "8s cold start / ~[X] min wall-time = ~1-2% overhead." This strengthens the A4 cost table at line 188.

---

### [L] Finding 9: "Stronger" description of Pattern B ambiguous vs "sufficient" of Pattern A

**Category:** COHERENCE (prose precision)
**Source:** Phase 2 reader pass + audit prompt dimension-4 (recommendation coherence)
**Location:** REPORT.md:42, 351, 413-430

**Issue:** The audit prompt notes: "The report recommends Pattern A (defensive listener + error-code filter) over Pattern B (WebSocketLike wrapper). Is the reasoning sound given that Pattern B is described as 'stronger'?"

The report consistently describes Pattern B as "stronger" (lines 42, 346, 354, 411). It also describes Pattern A as "sufficient" for consumers not affected by #1017 (lines 42, 358, 415). The language is internally consistent but invites a reasonable reader question: "If B is strictly stronger, why would I not prefer it?"

The report's answer is implicit: cost/blast-radius. Pattern A = 5 LOC (line 417); Pattern B = "refactor the upgrade handler to pass a wrapper" (line 113 of b5-consumer-patterns.md) which the report doesn't quantify in LOC or risk. A reader would benefit from an explicit cost-comparison line in the ranked recommendation, not buried in the evidence file.

**Status:** INCOHERENT (minor — reasoning sound but not surfaced)

**Suggested resolution:** In the "Optional upgrade path: Pattern B" section at line 422, add a one-liner cost comparison: "Pattern B involves refactoring the upgrade handler to inject a `WebSocketLike` wrapper (~30-50 LOC + upgrade-path rewrite) vs Pattern A's ~5-LOC error-code filter. Choose Pattern A unless one of the triggers above applies."

---

## Confirmed Claims (summary)

All of the following were verified against primary sources and stand as stated in the report:

**T2/T4 (Hocuspocus source code, local clone):**
- `Connection.ts:154-168` contents: `Connection.send()` pre-filters by `readyState === Closing || Closed`, calls `this.close()` + returns, wraps `webSocket.send` in try/catch. **Matches REPORT.md:49, 248-260 exactly.**
- `Document.ts:238-251` `broadcastStateless` signature accepts optional filter callback applied before connection iteration. **Matches REPORT.md:52 + evidence/b1:20-44.**
- `ClientConnection.ts:277-295` post-upgrade `readyState` fast-close check. **Matches evidence/b2:85-99.**
- `types.ts` `WebSocketLike` interface `{send, close, readyState}`. **Matches evidence/b1:93-101.**
- `tests/utils/newHocuspocus.ts` per-test port-0 allocation pattern. **Matches evidence/a2-a3:23-35.**
- `RELEASE_NOTES_V4.md` `crossws` migration, `WebSocketLike` interface, session awareness default, ordered message processing. **Matches REPORT.md:53, 332-334, evidence/b4:60-71.**

**T2/T4 (Outline / Docmost source, local clones):**
- `outline/server/services/collaboration.ts:82-108` `socket.on("error", …)` + `error.code === "ECONNRESET" return;`. **Matches evidence/b5:20-33.**
- `outline/server/logging/sentry.ts:50` `if (error.code === "EPIPE" || error.code === "ECONNRESET") return;`. **Matches evidence/b5:35-38.**
- `docmost/apps/server/src/collaboration/extensions/redis-sync/ws-socket-wrapper.ts` `WsSocketWrapper extends EventEmitter` with `readyState` tracking, no-op send on non-OPEN. **Matches evidence/b5:50-75.**

**T4 (GitHub issues, gh CLI):**
- Hocuspocus #1017: marked as closed, original report describes `Connection.send → close → awareness → send` recursion pattern. **Matches REPORT.md:42 framing.**
- Hocuspocus #1017 resolution: janthurau pointer says "fixed by #1032"; PR #1032 touches only `.gitignore` and `packages/extension-redis/src/Redis.ts`. **Matches REPORT.md:329 inapplicability claim.**
- ws#1172 lpinca quote "EPIPE means you're writing to a socket when the other end has terminated the connection. It's a runtime error and there is nothing you can do to avoid it." **CONFIRMED VERBATIM** — correctly attributed in evidence/b3:20.
- ws#2148 lpinca quote "Those are probably buffered writes that can't go through. There is not much to do apart from checking the `websocket.bufferedAmount`" **CONFIRMED VERBATIM**.

**T4 (WebFetch of primary source):**
- `remix-run/react-router/integration/playwright.config.ts` has no `webServer:` key at any nesting level. **Matches REPORT.md:46, 168, evidence/a2-a3:79-89.**

**T1 (consumer codebase, current state):**
- `packages/app/playwright.config.ts`: `retries: isCI ? 2 : 0`, `failOnFlakyTests: isCI`, `workers: isCI ? 4 : undefined`, webServer present. **Matches premise of the report.**
- `packages/app/tests/integration/test-harness.ts:62` defines `getFreePort()` utility; comment explains the `if(port)` guard on `Server.listen`. **Matches REPORT.md:40 "reuses existing getFreePort" claim at function level (see Finding 3 for architectural-reuse nuance).**
- 13 `*.e2e.ts` files in `packages/app/tests/stress/`. **Matches REPORT.md:47 "13+ test files."**

**Stance consistency (L6):**
- "Conclusions-bearing" stance in Research Rubric (line 74) is honored throughout — Tracks A and B each produce a ranked recommendation.
- Non-goals statement at line 76 is honored — no coverage of Playwright vs alternatives, CI strategy, CRDT correctness.

---

## Unverifiable Claims

**Empirical post-migration flake rate** (REPORT.md:233, 441): Cannot be confirmed or denied without landing Option A and measuring. The report correctly flags this as an open question at line 441. No finding filed — this is correctly hedged.

**"~50-80 MB per worker" memory footprint for Vite+Hocuspocus** (REPORT.md:191): Presented as estimate "based on comparable Vite documentation." I did not independently measure; the report flags this as unmeasured at line 443 ("Measuring in a staging environment before committing is advisable"). Correctly hedged.

**"zero public patchfile results for `@hocuspocus/server`"** (REPORT.md:42, 340, evidence/b5:87-96): Report describes this as a zero-result search. I did not independently re-run the search. Claim stands as presented but cannot be verified without replicating the search.

**Hocuspocus v5 roadmap** (REPORT.md:442): Report correctly flags as non-public / unknown. No finding.
