---
dimension: D5 — Anti-patterns surfaced
date: 2026-04-16
sources: tldraw, blocknote, tiptap, logseq, affine, hocuspocus
---

# Evidence: D5 — Anti-patterns surfaced in E2E tests for CRDT editors

**Primary question:** What patterns do these projects call out as wrong? Where have flaky-wait practices been documented, gone wrong, or been worked around?

---

## Key files / pages referenced

- `tldraw/apps/examples/e2e/tests/test-rich-text-toolbar.spec.ts:395-396` — "historically flaky without the sleep"
- `tldraw/apps/examples/e2e/tests/test-camera.spec.ts:117-118` — `test.skip(true)` for flakiness
- `tldraw/apps/examples/e2e/tests/test-clipboard.spec.ts:8` — "skipped because flaky in CI"
- `tldraw/packages/editor/src/lib/editor/managers/TickManager/TickManager.ts:5-7` — test-env raf branch
- `blocknote/tests/src/end-to-end/basics/basicblocks.test.ts:10` — skip-due-to-flaky-timeout comment
- `blocknote/tests/src/unit/react/BlockNoteViewRapidRemount.test.tsx:84` — `setTimeout(r, 0)` race trigger
- `tiptap/tests/cypress/integration/core/pluginOrder.spec.ts:60-62` — `.wait(100)` Cypress anti-pattern
- `logseq/clj-e2e/src/logseq/e2e/graph.clj:91-92` — "I have no idea why search-and-click failed"
- AFFiNE issues #2722, PR #11530, PR #9974 — flaky test remediation

---

## Findings

### Finding: tldraw has multiple "historically flaky without the sleep" acknowledgments
**Confidence:** CONFIRMED
**Evidence:** `tldraw/apps/examples/e2e/tests/test-rich-text-toolbar.spec.ts:395-396, 499-500`

```ts
// historically this has been flaky without the sleep
await sleep(2000)
```

(identical comment at two separate locations in the same file)

And `test-clipboard.spec.ts:8`:

```ts
// these are skipped because they're flaky in CI :(
```

And `test-camera.spec.ts:117-118`:

```ts
// Test is flaky, disabling.
test.skip(true)
```

**Implications:** These are the strongest anti-pattern signals in the survey. tldraw's maintainers explicitly flagged flakiness and "solved" it with padding or skip. The admission "historically flaky without the sleep" identifies the failure mode without identifying the root cause — which is the pattern that time-based waits cement. 2000ms is well above any normal processing time; it's hope-based padding.

For a CRDT editor project, the equivalent of these comments would be: "historically flaky without waiting for provider.synced", "historically flaky without waiting for the observer bridge to quiesce." The absence of those comments in tldraw suggests the flakiness originated elsewhere (likely DOM/animation), not CRDT sync.

---

### Finding: tldraw special-cases `requestAnimationFrame` for test environments
**Confidence:** CONFIRMED
**Evidence:** `tldraw/packages/editor/src/lib/editor/managers/TickManager/TickManager.ts:5-7`

```ts
const throttleToNextFrame =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
    ? // At test time we should use actual raf and not throttle...
```

**Implications:** tldraw's ticking/animation logic has test-specific behavior. This is not itself an anti-pattern — it's a recognition that throttled animation makes tests non-deterministic. The presence of this branch validates the broader pattern: **production-timing constructs (debounces, throttles, rAF throttling) have to be defeated in test mode**, otherwise tests race the production timing. Exposing a DEV-gated way to drain queues is the idiomatic fix; pre-defining alternate behavior at compile time (as tldraw does here) is another.

---

### Finding: BlockNote has "FIXME-like" flaky skips in E2E
**Confidence:** CONFIRMED
**Evidence:** `blocknote/tests/src/end-to-end/basics/basicblocks.test.ts:10`

```ts
// Skip due to flaky timeout on locator.click
test.describe.skip("Check basic text block appearance", () => {
```

And a deliberately-raced unit test at `blocknote/tests/src/unit/react/BlockNoteViewRapidRemount.test.tsx:84`:

```ts
// yield to event loop to allow effects to run, triggering the race condition
await new Promise((r) => setTimeout(r, 0));
```

**Implications:** BlockNote's E2E maintainers skipped rather than fixed — a pragmatic choice that documents where the current test infrastructure is insufficient. The unit-test comment ("triggering the race condition") is instructive: `setTimeout(..., 0)` is used to **deliberately reproduce** races in tests, confirming that event-loop timing is load-bearing in the BlockNote code path. This also validates the y-prosemirror observation (D3): `setTimeout(..., 0)` is a real event in CRDT pipelines.

---

### Finding: Cypress's `.wait(100)` is used in Tiptap core tests
**Confidence:** CONFIRMED
**Evidence:** `tiptap/tests/cypress/integration/core/pluginOrder.spec.ts:60-62`

```ts
cy.get('.ProseMirror')
  .type('a')
  .wait(100)
```

**Implications:** Cypress's `.wait(ms)` is the Cypress equivalent of `page.waitForTimeout`. Documented by Cypress as a smell ("Anti-Pattern: Using cy.wait(Number)") in its own best-practices guide. Its presence in Tiptap's tests suggests that even the library producing the editor has not found a universally-reliable quiescence signal — the 100ms is likely tuned for local machine timing and will be fragile in CI.

---

### Finding: Logseq candidly admits "I have no idea why"
**Confidence:** CONFIRMED
**Evidence:** `logseq/clj-e2e/src/logseq/e2e/graph.clj:91-92`

```clojure
;; new graph can blocks the ui because the db need to be created and restored,
;; I have no idea why `search-and-click` failed to auto-wait sometimes.
(util/wait-timeout 1000)
```

**Implications:** Even in the most sophisticated surveyed test suite (Logseq has full RTC convergence primitives, see D4), there are still "I don't know why" waits. This is worth flagging not as a criticism but as grounding: **even well-designed test suites hit corner cases where no structured signal exists and padding is the fallback**. The important property of Logseq's approach is that these fallback waits are the **exception**, used only where specific flakiness was observed; the default path uses the `rtc-tx` DOM signal.

---

### Finding: AFFiNE has ongoing flaky-test remediation effort
**Confidence:** CONFIRMED
**Evidence:** Public GitHub issues/PRs:

- Issue #2722 "Flaky test 'create multi workspace in the workspace list'" (closed, minimal description): `github.com/toeverything/AFFiNE/issues/2722`
- PR #11530 "test(editor): fix flaky embed iframe e2e test" (merged April 8, 2025): `github.com/toeverything/AFFiNE/pull/11530`
- PR #9974 "chore(core): upload flaky test traces": `github.com/toeverything/AFFiNE/pull/9974`

**Implications:** PR #9974 upload-traces-on-flake is a pragmatic recognition that flakiness is a distinct failure class deserving dedicated telemetry. The workflow is: CI uploads traces of flaky runs as separate artifacts (not mingled with genuine-failure artifacts), allowing maintainers to identify timing-sensitive tests post-hoc. This acknowledges flakiness is an infrastructure problem rather than a per-test bug.

---

### Finding: `waitForTimeout` count is high in BlockNote E2E suite (84 occurrences)
**Confidence:** CONFIRMED
**Evidence:** Subagent grep of `blocknote/tests/src/end-to-end/` for `waitForTimeout(` — 84 matches across files.

Representative sample (`tests/src/end-to-end/ai/ai.test.ts:17,30,41,45,64`):

```ts
await page.waitForSelector(EDITOR_SELECTOR);
await page.waitForTimeout(200);
await page.waitForTimeout(100);
await page.waitForTimeout(300);
await page.waitForTimeout(300);
```

**Implications:** `page.waitForTimeout` is an anti-pattern by Playwright's own documentation. 84 occurrences in BlockNote's E2E suite is a telltale quantity — it's not one or two edge cases, it's the dominant strategy. Playwright's [Best practices guide](https://playwright.dev/docs/best-practices) says: "Don't use `page.waitForTimeout`, it makes your tests flaky. ... You're either waiting too long or not long enough." BlockNote's test suite either does not have, or does not use, a structured alternative.

This is not a criticism — BlockNote is a young project and E2E tests pre-dating collaborative feature stabilization have their own priorities. But for a survey of "what signals are used instead of timeouts," **BlockNote's state is evidence that the alternatives aren't well-known or well-exposed**.

---

### Finding: Hocuspocus provider has a TODO about timing coupling
**Confidence:** CONFIRMED
**Evidence:** `hocuspocus/packages/provider/src/HocuspocusProviderWebsocket.ts:122`

```ts
// TODO: this should depend on awareness.outdatedTime
messageReconnectTimeout: 30000,
```

**Implications:** Not an E2E testing anti-pattern per se, but relevant: production timing constants in the provider (`messageReconnectTimeout: 30000`) are hardcoded rather than derived from the relevant semantic property (awareness outdated-time). Tests that interact with reconnection behavior will be coupled to this hardcoded value. When designing test-readiness primitives, exposing the underlying semantic property (not the derived timeout) avoids this coupling.

---

## Negative searches

- Explicit documented preference for web-first assertions over `waitForTimeout` in any project's README or CONTRIBUTING: **NOT FOUND**. No surveyed project ships written guidance to their contributors about avoiding `waitForTimeout` or using `expect.poll` / `locator.waitFor` instead.
- "Don't use networkidle" comments in any project: **NOT FOUND**. Playwright's own discouragement of `networkidle` hasn't propagated to project-level CONTRIBUTING docs in the surveyed repos.

---

## Gaps / follow-ups

- None of the surveyed projects shipped a WRITTEN test-readiness playbook or decision tree for contributors. The patterns are discoverable only via reading existing tests — which means new contributors perpetuate the modal pattern (timeouts or selectors), not the gold-standard pattern (provider.synced + convergence counters).
- Playwright's maintainer-endorsed patterns (web-first assertions, `expect.poll`, `locator.waitFor`) are not universally adopted even in actively-maintained OSS editors, suggesting the gap is documentation/tooling rather than capability.
