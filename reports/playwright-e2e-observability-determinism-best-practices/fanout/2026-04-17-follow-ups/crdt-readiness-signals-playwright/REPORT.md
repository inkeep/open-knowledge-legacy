---
title: "CRDT Readiness Signals in Playwright E2E Tests — OSS Landscape Survey"
description: "Factual survey of how 9 collaborative-editor OSS projects (Yjs/Hocuspocus/CRDT-based) wait for editor readiness in Playwright and Cypress E2E tests. Catalogs the concrete signals used instead of waitUntil:'networkidle' and page.waitForTimeout, grouped into five dimensions: page-load readiness, provider sync exposure, post-typing quiescence, cross-peer propagation, and anti-patterns. Primary-source evidence only."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - Tiptap
  - Hocuspocus
  - y-prosemirror
  - y-tiptap
  - BlockNote
  - Outline
  - tldraw
  - HedgeDoc
  - AFFiNE
  - Logseq
  - Playwright
  - Cypress
topics:
  - e2e testing
  - test determinism
  - CRDT sync
  - readiness signals
  - test flakiness
---

# CRDT Readiness Signals in Playwright E2E Tests — OSS Landscape Survey

**Purpose:** Document, with primary-source evidence, how collaborative-editor OSS projects using Yjs, Hocuspocus, y-prosemirror, and adjacent CRDT stacks signal "editor is ready for test input" and "test-visible mutation has propagated." This feeds a parent spec's design of a replacement for `waitUntil: 'networkidle'` and `page.waitForTimeout`.

---

## Executive Summary

Across nine surveyed projects — Tiptap, Hocuspocus, y-prosemirror, y-tiptap, BlockNote, Outline, tldraw, HedgeDoc, AFFiNE, and Logseq — **there is no common convention** for signaling CRDT readiness to E2E tests. What exists is a spectrum ranging from "rely on Cypress/Playwright implicit retry" (HedgeDoc, Tiptap core) to "ship dedicated hidden DOM elements carrying CRDT transaction counters" (Logseq). The discouraged `waitUntil: 'networkidle'` is still in use in places (BlockNote), `page.waitForTimeout` / Cypress `.wait(N)` is used heavily (84 occurrences in BlockNote E2E, multiple in Tiptap core, acknowledged "historically flaky" in tldraw), and documented guidance to contributors about preferred patterns is largely absent from every project's CONTRIBUTING.

The five signals that **do** appear, ranked by robustness:

1. **Logseq's `data-testid="rtc-tx"` hidden production DOM element** carrying `{local-tx, remote-tx}` counters — tests poll until the counters equal and exceed a pre-edit baseline. Applies to cross-peer convergence and post-mutation quiescence. The strongest pattern surveyed.
2. **Hocuspocus `provider.on('synced')` + `provider.synced` property + `hasUnsyncedChanges` / `unsyncedChanges` event** — the library exposes three equivalent consumption paths at the provider layer, paired with a `retryableAssertion` polling primitive.
3. **Outline's application-layer dual-state sync** (`isLocalSynced && isRemoteSynced`) — not test-exposed, but a reusable model for "both IndexeddbPersistence caught up and HocuspocusProvider synced."
4. **tldraw's `window.editor` global** for tests to call the editor's public API directly, bypassing DOM event simulation for setup/teardown.
5. **AFFiNE's `waitForEditorLoad(page)` named fixture** centralizing editor-ready semantics in a single helper.

**Key Findings:**

- **No project surveyed uses `waitUntil: 'networkidle'` as a deliberate readiness signal for CRDT editors** — but BlockNote still uses it incidentally on page navigation in multiple test files.
- **`page.waitForTimeout` / `cy.wait(N)` dominates quiescence waits in most projects.** Only Logseq and Hocuspocus have structured alternatives wired through to E2E tests.
- **DOM-element existence (`waitForSelector('.ProseMirror')`) is the universal minimum but is insufficient** — an attached editor root does not imply the provider has synced or that the PM schema has been applied.
- **Tiptap's `onFirstRender` callback is distinct from `provider.synced`**: `onFirstRender` fires after y-prosemirror finishes CRDT → PM materialization (tighter bound); `synced` fires when the client has the server's state (looser bound). Neither is exposed to tests by default.
- **`setTimeout(..., 0)` deferred work is load-bearing** in y-prosemirror's sync plugin per an explicit code comment in its own test suite — one macrotask tick is the minimum post-dispatch wait for CRDT state to reflect a ProseMirror transaction.
- **Cross-peer E2E tests are rare.** Logseq is the only surveyed project with production-grade multi-peer convergence tests; BlockNote, tldraw, HedgeDoc, and AFFiNE have none at the E2E layer.

---

## Research Rubric

**Primary question:** What readiness signals do collaborative-editor OSS projects use in Playwright/Cypress E2E tests in place of `waitUntil: 'networkidle'` and `page.waitForTimeout`?

**Stance:** Factual. Document what these projects do; do not prescribe what the parent spec should adopt.

**Dimensions:**

| ID | Dimension | Depth |
|---|---|---|
| D1 | Readiness signal inventory — what tests wait for after `page.goto()` | P0 Deep |
| D2 | Provider sync signal exposure — how `provider.synced` reaches tests | P0 Deep |
| D3 | Post-typing quiescence — what follows `page.keyboard.type(...)` | P0 Deep |
| D4 | Cross-peer propagation waits — multi-client convergence patterns | P0 Moderate |
| D5 | Anti-patterns — what projects acknowledge as wrong or flaky | P0 Moderate |

**Non-goals (inherited from parent):** Per-test docName isolation, bridge-convergence fuzz testing, Playwright vs Cypress/WebdriverIO comparison, 1P Open Knowledge codebase analysis, mobile/real-device testing.

**Target projects surveyed (9):** Outline, BlockNote, tldraw, Tiptap, Hocuspocus, y-prosemirror, y-tiptap, y-codemirror.next (no tests), HedgeDoc, AFFiNE, Logseq.

---

## Project Inventory

| Project | Editor stack | E2E framework | Test location | Multi-peer E2E? |
|---|---|---|---|---|
| [BlockNote](https://github.com/TypeCellOS/BlockNote) | Tiptap + Yjs (opt-in) | Playwright | `tests/src/end-to-end/` | No |
| [Outline](https://github.com/outline/outline) | ProseMirror + Yjs + Hocuspocus | None (unit tests only) | — | No |
| [tldraw](https://github.com/tldraw/tldraw) | Custom store + `@tldraw/sync-core` | Playwright | `apps/examples/e2e/`, `apps/dotcom/client/e2e/` | No |
| [Tiptap](https://github.com/ueberdosis/tiptap) | ProseMirror + (optional) Yjs | Cypress | `tests/cypress/integration/` | No |
| [Hocuspocus](https://github.com/ueberdosis/hocuspocus) | Yjs server + provider | AVA (not browser) | `tests/provider/`, `tests/server/` | Yes (in-process, two providers) |
| [y-prosemirror](https://github.com/yjs/y-prosemirror) | PM ↔ Yjs bridge | lib0/testing + JSDOM | `tests/` | Yes (in-memory Y.Doc pairs) |
| [y-tiptap](https://github.com/yjs/y-tiptap) | Tiptap ↔ Yjs bridge | lib0/testing + JSDOM | `tests/` | Yes (in-memory) |
| y-codemirror.next | CM6 ↔ Yjs bridge | (no tests directory) | — | — |
| [HedgeDoc](https://github.com/hedgedoc/hedgedoc) | CodeMirror + (Yjs in 2.x) | Cypress | `frontend/cypress/e2e/` | No |
| [AFFiNE](https://github.com/toeverything/AFFiNE) | BlockSuite + y-octo | Playwright | `tests/affine-local/e2e/`, `tests/kit/` | Not in surveyed files |
| [Logseq](https://github.com/logseq/logseq) | Custom + CRDT (RTC worker) | Clojure + Playwright (Wally) | `clj-e2e/test/logseq/e2e/` | **Yes — full convergence primitives** |

---

## Detailed Findings

### D1 — Readiness signals after page load

**Finding:** DOM-element existence (`waitForSelector('.ProseMirror')`, `getByTestId(...)`) is the universal minimum across every Playwright/Cypress project surveyed. No project relies on `waitUntil: 'networkidle'` alone as a sufficient readiness signal, but BlockNote still passes it on navigation in several test files.

**Evidence:** [evidence/d1-readiness-signals.md](evidence/d1-readiness-signals.md)

**Signal catalog (D1):**

| Pattern | Example | Where seen |
|---|---|---|
| DOM element existence | `await page.waitForSelector('.tl-canvas')` | tldraw, BlockNote, AFFiNE |
| `locator.waitFor({state: 'attached'})` | `editor.locator(selector).waitFor({state: 'attached', timeout: 1000})` | BlockNote `waitForSelectorInEditor` |
| `expect(...).toBeVisible().toPass()` | `await expect(async () => { await expect(...).toBeVisible() }).toPass()` | tldraw dotcom fixtures |
| Named editor-load fixture | `await waitForEditorLoad(page)` | AFFiNE |
| Composite DOM + evaluate | `waitForSelector` + `page.evaluate(() => editor.user.update...)` | tldraw `setupPage` |
| Production status DOM element | `w/wait-for "button.cloud.on.idle" {:timeout 20000}` | Logseq |
| `waitForLoadState('domcontentloaded')` | dotcom HomePage fixture | tldraw |
| `waitUntil: 'networkidle'` (anti-pattern) | `page.goto(BASE_URL, { waitUntil: "networkidle" })` | BlockNote (still present) |
| In-page `setTimeout` polling loop | `waitUntilElementExists` 500ms recursion | Tiptap demos |

**Implications for "what signal to wait for":** DOM attachment is necessary but not sufficient. Projects that do CRDT collaboration at E2E level (only Logseq) supplement DOM waits with provider-level or RTC-level signals. The tldraw approach — expose the editor as a `window` global and call its public API — sidesteps the "wait for setup" problem for setup/teardown without addressing per-edit quiescence (see D3).

**Decision triggers:**
- If the editor is opaque (no accessible public API) → DOM + provider-sync signal is the minimum.
- If the editor is exposed as a window global → setup/reset can bypass simulation entirely; quiescence still needs a separate signal.
- If the project has multiple sync layers (e.g., IndexedDB + WebSocket) → a composite signal (like Outline's `isLocalSynced && isRemoteSynced`) is required to declare "ready."

**Remaining uncertainty:** AFFiNE's internal implementation of `waitForEditorLoad` was not captured. It may be DOM-only, provider-sync-aware, or a composite.

---

### D2 — Provider sync signal exposure

**Finding:** Two distinct patterns exist: (1) provider-level APIs (Hocuspocus, via `provider.on('synced')`, `provider.synced` property, and `onSynced` constructor callback); (2) production DOM elements with test-ids carrying sync state (Logseq's `<div.hidden data-testid="rtc-tx">`). No surveyed project exposes provider state via `window.__provider` / `window.__hocuspocus` window globals — that convention was not observed in any test file.

**Evidence:** [evidence/d2-provider-sync-exposure.md](evidence/d2-provider-sync-exposure.md)

**Signal catalog (D2):**

| Pattern | Example | Where seen |
|---|---|---|
| Event listener on provider | `provider.on('synced', handler)` | Hocuspocus tests, Outline app |
| Property polling | `provider.synced === true` | Hocuspocus (available) |
| Constructor callback | `new HocuspocusProvider({ onSynced() { ... } })` | Hocuspocus tests |
| App-layer composite sync state | `isLocalSynced && isRemoteSynced` | Outline `MultiplayerEditor.tsx` |
| Tiptap extension-layer callback | `new Collaboration({ onFirstRender() { ... } })` | Tiptap `extension-collaboration` |
| Hidden DOM + test-id + text content | `<div.hidden data-testid="rtc-tx">{:local-tx N :remote-tx M}</div>` | **Logseq (strongest pattern)** |
| `hasUnsyncedChanges` property + event | `provider.on('unsyncedChanges', ...)` + `retryableAssertion` polling | Hocuspocus tests |
| `window.__provider` / `window.__hocuspocus` | — | **NOT FOUND in any surveyed project** |
| `data-synced` DOM attribute | — | **NOT FOUND** (Logseq's `rtc-tx` is counter-carrying, not boolean) |

**Key distinction — `provider.synced` vs. `onFirstRender`:**

- `provider.synced`: set to `true` when the client has received SyncStep2 from the server. Guarantees CRDT state is current but does NOT guarantee PM schema has been applied to the XmlFragment.
- `onFirstRender` (Tiptap collaboration extension): fires after y-prosemirror finishes initial CRDT → ProseMirror materialization. Tighter bound — guarantees the editor's document is rendered.

For "ready for keystroke input," `onFirstRender` is the correct signal on a Tiptap stack. For a minimum-viable "CRDT is current" signal, `provider.synced` suffices. Neither is exposed to tests by default; each would require the application to surface it via a window global, DOM attribute, or similar.

**The Logseq pattern is worth dwelling on:**

Source: [`logseq/src/main/frontend/components/rtc/indicator.cljs:176`](https://github.com/logseq/logseq)

```clojure
[:div.hidden {"data-testid" "rtc-tx"} (pr-str {:local-tx local-tx :remote-tx remote-tx})]
```

Consumer: [`logseq/clj-e2e/src/logseq/e2e/rtc.clj:9-12`](https://github.com/logseq/logseq)

```clojure
(defn get-rtc-tx
  []
  (let [loc (w/get-by-test-id "rtc-tx")]
    (edn/read-string (w/text-content loc))))
```

Properties of this approach:
- **Not DEV-gated** — ships in production. Tradeoff: ~30 bytes of hidden DOM for all users.
- **Carries structured state** — counters, not a boolean. Enables "mutation converged" (counters equal and increased) vs. just "some sync happened."
- **Framework-agnostic** — Playwright reads it via `getByTestId(...).textContent()`; any test runner that can query DOM works.
- **Decoupled from provider identity** — doesn't require exposing the Y.Doc or provider object; only requires the app to emit what it already computes.

**Decision triggers:**
- Single-sync-layer (WebSocket only, no IndexedDB) → provider event/property is sufficient.
- Multi-sync-layer (IndexedDB + WebSocket, or dual-CRDT) → composite state (like Outline) or counter-based (like Logseq) is required.
- Counter-based signals enable per-mutation convergence assertions; boolean `synced` only supports initial-load assertions.

---

### D3 — Post-typing quiescence

**Finding:** Projects handle post-typing quiescence in three distinct ways: (A) bare `waitForTimeout` / `sleep(N)` padding (tldraw, BlockNote — the modal pattern), (B) wait for the observable effect (BlockNote's `waitForSelectorInEditor(h1-block-selector)`, a generally-idiomatic Playwright pattern), (C) bypass keystroke simulation via direct state API (HedgeDoc's `cy.setCodemirrorContent`). Only Hocuspocus has a structured "mutation has fully propagated" signal (`hasUnsyncedChanges === false`). y-prosemirror's own test suite documents that a minimum 1-macrotask wait is required after a PM dispatch because the sync plugin defers work via `setTimeout(..., 0)`.

**Evidence:** [evidence/d3-post-typing-quiescence.md](evidence/d3-post-typing-quiescence.md)

**Canonical primary source — y-prosemirror documents the `setTimeout(..., 0)` requirement:**

[`y-prosemirror/tests/suggestions.test.js:57-66`](https://github.com/yjs/y-prosemirror):

```js
/**
 * Dispatch a transaction to a ProseMirror view and wait a tick so that any
 * deferred sync-plugin follow-up work (e.g. adjustments scheduled via
 * `setTimeout(..., 0)`) has a chance to run before the test proceeds.
 */
const safeDispatch = async (view, tr) => {
  view.dispatch(tr)
  await promise.wait(1)
}
```

**Signal catalog (D3):**

| Pattern | Example | Where seen |
|---|---|---|
| Bare timeout padding | `await sleep(2000)` with "historically flaky" comment | tldraw |
| `page.waitForTimeout(500)` after keystrokes | `await page.keyboard.type(...); await page.waitForTimeout(500);` | BlockNote (84 occurrences) |
| Wait for DOM effect of typing | `await waitForSelectorInEditor(page, H_ONE_BLOCK_SELECTOR)` after slash-command | BlockNote |
| `hasUnsyncedChanges` event + poll | `provider.on('unsyncedChanges', ...)` → `retryableAssertion(t => t.is(provider.hasUnsyncedChanges, false))` | Hocuspocus |
| Mode-state settling | `(k/esc); (assert/assert-non-editor-mode)` | Logseq `exit-edit` |
| Direct state API (bypass typing) | `cy.setCodemirrorContent('# Title')` | HedgeDoc |
| Cypress `.wait(100)` after type | `.type('a').wait(100)` | Tiptap core tests |
| Minimum macrotask yield | `await promise.wait(1)` after PM dispatch | y-prosemirror `safeDispatch` |

**Calibration data from in-memory tests:** y-tiptap tests use `promise.wait(10)` to `promise.wait(50)` after transactions. This bounds the pure CRDT settling window at under 10ms in a JSDOM environment without network or persistence. Longer waits in Playwright tests reflect overhead from DOM rendering, persistence debounce, and WebSocket roundtrips — not CRDT-state settling itself.

**Implications:** The y-prosemirror `setTimeout(..., 0)` comment is load-bearing knowledge that is only documented in test code, not in y-prosemirror's README or sync-plugin source. Any test against a y-prosemirror-backed editor that dispatches transactions needs to account for at least one macrotask tick before CRDT state reflects the PM transaction.

**Decision triggers:**
- Testing input rules or side-effects that materialize new DOM → wait for the DOM effect (pattern B), not a fixed timeout.
- Testing CRDT state changes → use provider-level event (Hocuspocus `hasUnsyncedChanges`) or counter-based signal (Logseq `rtc-tx`).
- Testing state-machine transitions (e.g., exit-edit mode) → assert on mode state (Logseq `assert-non-editor-mode`).
- No structured signal available → document with a "historically flaky without sleep" comment, use explicit padding, and prioritize exposing a structured signal as follow-up work.

---

### D4 — Cross-peer propagation waits

**Finding:** Cross-peer E2E testing is rare. Only Logseq ships production-grade primitives for it; BlockNote, tldraw, HedgeDoc, and AFFiNE have none at the E2E layer. Hocuspocus tests exercise multi-provider scenarios but in-process (not browser), using awareness-change callbacks or `retryableAssertion` polling. y-prosemirror and y-tiptap test multi-Y.Doc convergence via synchronous `Y.applyUpdate` in-memory — no network, no waits needed.

**Evidence:** [evidence/d4-multi-peer-waits.md](evidence/d4-multi-peer-waits.md)

**Canonical primary source — Logseq's `with-wait-tx-updated` macro:**

[`logseq/clj-e2e/src/logseq/e2e/rtc.clj:14-37`](https://github.com/logseq/logseq):

```clojure
(defmacro with-wait-tx-updated
  "exec body, then wait for the rtc-tx update."
  [& body]
  `(let [m# (get-rtc-tx)
         local-tx# (or (:local-tx m#) 0)
         remote-tx# (or (:remote-tx m#) 0)
         tx# (max local-tx# remote-tx#)]
     ~@body
     (loop [i# 15]
       ...
       (util/wait-timeout 500)
       (w/wait-for "button.cloud.on.idle" {:timeout 35000})
       (util/wait-timeout 1000)
       (let [new-m# (get-rtc-tx)
             new-local-tx# (or (:local-tx new-m#) 0)
             new-remote-tx# (or (:remote-tx new-m#) 0)]
         (if (and (= new-local-tx# new-remote-tx#)
                  (> new-local-tx# tx#))
           {:local-tx new-local-tx# :remote-tx new-remote-tx#}
           (recur (dec i#)))))))
```

The pattern:
1. Capture pre-edit tx state.
2. Execute mutation body.
3. Poll until counters (a) are equal to each other and (b) exceed the pre-edit baseline.
4. Additionally gate on the production `button.cloud.on.idle` element being visible — a two-signal convergence check.

Total wait budget: 15 iterations × (500 + wait-for + 1000) ms ≈ 22.5s-plus.

**Signal catalog (D4):**

| Pattern | Example | Where seen |
|---|---|---|
| Counter-based convergence | `local-tx == remote-tx && > baseline` | **Logseq (the gold standard)** |
| Cross-peer `wait-tx-update-to` | Peer B polls until its `local-tx ≥ Peer A's captured value` | Logseq |
| Awareness-based signal | `onAwarenessChange: ({states}) => states.filter(s.name === 'player2').length > 0` | Hocuspocus tests |
| In-memory `Y.applyUpdate` sync | `Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))` | y-prosemirror, y-tiptap |
| Network partition + restart | `with-stop-restart-rtc [page1] [page1 ...]` | Logseq |
| `expect.poll(() => peer2...)` | — | **NOT FOUND** in any surveyed E2E test |
| Dual browser context | `w/make-page` × 2, `reset! *page1 *page2` | Logseq `open-2-pages` |
| Multi-provider in-process | `newHocuspocusProvider(t, server)` × 2 + awareness | Hocuspocus tests |

**Implications:** Logseq's approach demonstrates that rigorous cross-peer convergence testing requires (a) production code to emit progress state (tx counters), (b) a polling primitive with an upper bound, (c) fixtures for dual-browser orchestration. None of these exist in the JavaScript-ecosystem surveyed projects except Hocuspocus at the in-process layer. The gap is not technical capability but absence of the primitive to hook into.

**Decision triggers:**
- Cross-peer convergence is only testable at E2E fidelity when counter-based progress signals are exposed (like `rtc-tx`).
- `provider.on('synced')` is insufficient for mid-session cross-peer waits — it's initial-load only.
- For purely in-memory or mocked scenarios, synchronous `Y.applyUpdate` obviates the wait entirely.

---

### D5 — Anti-patterns surfaced

**Finding:** Multiple surveyed projects ship E2E code that admits its own flakiness via "historically flaky without the sleep" comments (tldraw, twice), test skips ("flaky in CI" — tldraw clipboard tests), or heavy use of `page.waitForTimeout` (BlockNote — 84 occurrences). Cypress's own `.wait(N)` anti-pattern appears in Tiptap's core tests. No surveyed project ships written contributor guidance about preferred wait patterns — none of the CONTRIBUTING docs or READMEs discuss `expect.poll`, `locator.waitFor`, or web-first assertions. Playwright's discouragement of `networkidle` has not propagated to project-level guidance in any surveyed repo.

**Evidence:** [evidence/d5-anti-patterns.md](evidence/d5-anti-patterns.md)

**Catalog of acknowledged flakiness:**

| Acknowledgment | Source | Response |
|---|---|---|
| `// historically this has been flaky without the sleep` | tldraw `test-rich-text-toolbar.spec.ts:395, 499` | `await sleep(2000)` |
| `// these are skipped because they're flaky in CI :(` | tldraw `test-clipboard.spec.ts:8` | `test.skip(...)` |
| `// Test is flaky, disabling.` | tldraw `test-camera.spec.ts:117` | `test.skip(true)` |
| `// Skip due to flaky timeout on locator.click` | BlockNote `basicblocks.test.ts:10` | `test.describe.skip(...)` |
| `// I have no idea why search-and-click failed to auto-wait sometimes.` | Logseq `graph.clj:91` | `(util/wait-timeout 1000)` |
| Flaky test remediation effort | AFFiNE PR #11530, PR #9974 (trace uploads) | Active |

**Meta-observation:** The strongest test suite (Logseq) still has "I don't know why" waits — but those are the exception, not the default. The fallback waits exist inside a broader infrastructure that uses structured signals as the happy path. The weaker test suites (BlockNote, tldraw) have structured signals as the exception and padding as the default.

**Negative findings:**
- No surveyed project ships written contributor guidance about preferred wait patterns (`expect.poll`, `locator.waitFor`, web-first assertions).
- No surveyed project documents a test-readiness playbook for CRDT-editor contributors.
- No project's CONTRIBUTING calls out `waitUntil: 'networkidle'` as discouraged.

---

## Cross-Dimension Summary Matrix

| Dimension | BlockNote | Outline | tldraw | Tiptap | Hocuspocus | y-prosemirror | HedgeDoc | AFFiNE | **Logseq** |
|---|---|---|---|---|---|---|---|---|---|
| D1: Readiness | `waitForSelector` + `networkidle` (still) | No E2E | `waitForSelector` + `page.evaluate(editor.*)` | In-page 500ms poll | `retryableAssertion` (non-browser) | — | Cypress auto-wait (15s) | `waitForEditorLoad` fixture | `assert-graph-loaded?` + `cloud.on.idle` |
| D2: Provider sync | Not exposed | `isLocalSynced && isRemoteSynced` (app) | Not exposed | `onFirstRender` callback | `synced` event + property + callback + `hasUnsyncedChanges` | Not provider-aware | Not exposed | Not exposed in tests | **`rtc-tx` hidden prod DOM** |
| D3: Post-typing | `waitForTimeout(500)` modal | — | `sleep(2000)` "historically flaky" | `.wait(100)` | `unsyncedChanges` event + poll | `safeDispatch` + `promise.wait(1)` | `cy.setCodemirrorContent` (bypass) | No explicit waits | `press-seq` + `exit-edit` |
| D4: Multi-peer | None | None | None | None | Yes (in-process) | Yes (in-memory) | None | None in surveyed tests | **Full — `with-wait-tx-updated`** |
| D5: Anti-patterns | 84 `waitForTimeout` occurrences | — | Skipped tests, 2000ms padding, acknowledged "historically flaky" | `.wait(100)` in core tests | `TODO` comment on reconnect timeout | None documented | None documented | One "I have no idea why" wait | — |

---

## Limitations & Open Questions

### Dimensions covered but with residual uncertainty

- **AFFiNE's `waitForEditorLoad` implementation** — surveyed via GitHub URLs but the helper's internals were not fetched. It may be DOM-only, provider-aware, or composite.
- **y-octo's sync-state exposure** — AFFiNE uses y-octo (Rust Yjs port); the JS-side API for "provider synced" was not traced to source.
- **Tiptap collaboration E2E testing** — Tiptap's own test suite (Cypress) is relatively lightweight and does not exercise collaboration end-to-end. Downstream projects (Outline, BlockNote) are the only practical source of Tiptap-collaboration test patterns, and Outline has no E2E tests.

### Out of scope (per rubric)

- Per-test docName isolation (parent's sibling spec owns this)
- Bridge-convergence fuzz testing
- Playwright vs Cypress/WebdriverIO framework comparison
- 1P Open Knowledge codebase analysis
- Mobile / iOS real-device testing

### Not found (negative searches)

- `window.__provider`, `window.__hocuspocus`, `window.__yDoc` window-global naming conventions — not observed in any surveyed test file.
- `DEV-gated` test-hook exposure (`if (NODE_ENV === 'development') window.X = ...`) — not observed in any surveyed test file as the mechanism for exposing provider state to Playwright.
- Written contributor guidance about `expect.poll` / `locator.waitFor` / web-first assertions — not present in any surveyed CONTRIBUTING or README.
- `data-synced` / `data-provider-ready` / `data-doc-ready` DOM-attribute conventions — not observed. Logseq's `data-testid="rtc-tx"` is structurally different (carries state via text content, not a boolean flag).

---

## References

### Evidence Files
- [evidence/d1-readiness-signals.md](evidence/d1-readiness-signals.md) — DOM-existence waits, editor-load fixtures, production status elements
- [evidence/d2-provider-sync-exposure.md](evidence/d2-provider-sync-exposure.md) — Hocuspocus `synced` event/property, Logseq `rtc-tx` DOM, Outline dual-state, Tiptap `onFirstRender`
- [evidence/d3-post-typing-quiescence.md](evidence/d3-post-typing-quiescence.md) — y-prosemirror `safeDispatch`, Hocuspocus `hasUnsyncedChanges`, sleep-based padding
- [evidence/d4-multi-peer-waits.md](evidence/d4-multi-peer-waits.md) — Logseq counter-convergence, Hocuspocus awareness, in-memory `Y.applyUpdate`
- [evidence/d5-anti-patterns.md](evidence/d5-anti-patterns.md) — "historically flaky" comments, skipped tests, heavy `waitForTimeout` usage

### External Sources (primary)

**Source code repositories surveyed:**
- [Tiptap](https://github.com/ueberdosis/tiptap) — Cypress tests in `tests/cypress/integration/`
- [Hocuspocus](https://github.com/ueberdosis/hocuspocus) — AVA tests in `tests/provider/`, `tests/server/`, `tests/utils/`
- [y-prosemirror](https://github.com/yjs/y-prosemirror) — lib0/testing suite in `tests/`
- [y-tiptap](https://github.com/yjs/y-tiptap) — lib0/testing suite in `tests/`
- [BlockNote](https://github.com/TypeCellOS/BlockNote) — Playwright tests in `tests/src/end-to-end/`
- [Outline](https://github.com/outline/outline) — Application code in `app/scenes/Document/components/MultiplayerEditor.tsx`
- [tldraw](https://github.com/tldraw/tldraw) — Playwright tests in `apps/examples/e2e/` and `apps/dotcom/client/e2e/`
- [HedgeDoc](https://github.com/hedgedoc/hedgedoc) — Cypress tests in `frontend/cypress/e2e/`
- [AFFiNE](https://github.com/toeverything/AFFiNE) — Playwright tests in `tests/affine-local/e2e/`
- [Logseq](https://github.com/logseq/logseq) — Clojure + Playwright (Wally) tests in `clj-e2e/`

**Playwright / framework documentation referenced:**
- [Playwright Page API — waitUntil](https://playwright.dev/docs/api/class-page#page-goto) (discourages `networkidle`)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) (discourages `page.waitForTimeout`)
- [Playwright Test Assertions — web-first assertions](https://playwright.dev/docs/test-assertions)

**Yjs / ecosystem references:**
- [Yjs y-websocket sync event timing issue #81](https://github.com/yjs/y-websocket/issues/81)
- [AFFiNE flaky test issue #2722](https://github.com/toeverything/AFFiNE/issues/2722)
- [AFFiNE flaky embed iframe fix PR #11530](https://github.com/toeverything/AFFiNE/pull/11530)
- [AFFiNE upload flaky test traces PR #9974](https://github.com/toeverything/AFFiNE/pull/9974)
