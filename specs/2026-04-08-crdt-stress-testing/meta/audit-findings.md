# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/crdt-stress-hardening/specs/2026-04-08-crdt-stress-testing/SPEC.md`
**Audit date:** 2026-04-08
**Total findings:** 16 (5 high, 7 medium, 4 low)

Baseline checked against commit `9380859` (matches spec's recorded baseline). Evidence files and source code read from the `crdt-stress-hardening` worktree.

---

## High Severity

### [H1] Finding: Layer C invokes `helpers.*` functions that do not exist in the project

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §9 "Proposed solution" — Layer C sequence (SPEC.md L282-293), §6 FR4, D10
**Issue:** The Layer C multi-turn sequence uses `helpers.startConsoleCapture(page)`, `helpers.waitForDOMStabilization(page, ...)`, and `helpers.getConsoleErrors(consoleLogs)` as if they were pre-existing project helpers. Grep across the entire worktree finds **zero** occurrences of these names outside the spec itself. The existing Playwright tests (`init_spike/tests/e2e/sync.spec.ts`, `qa-scenarios.spec.ts`) define their own inline helpers (`resetDoc`, `openEditor`, `expectContent`, `typeInWysiwyg`) and do not import anything called `helpers`.
**Current text:** "3. Start `helpers.startConsoleCapture(page)` — catch silent errors" … "5. `helpers.waitForDOMStabilization(page, { selector: '.ProseMirror', stableMs: 1000 })`" … "11. Verify at the end: no console errors (`helpers.getConsoleErrors(consoleLogs).length === 0`) ..."
**Evidence:** The names come from the `/browser` skill's `API_REFERENCE.md` (`plugins/cache/inkeep-team-skills/eng/1.2.374/skills/browser/API_REFERENCE.md` L287-303) where they're documented as runtime helpers available via `require('./lib/helpers')` inside scripts launched by the skill's `run.js` wrapper. They are NOT part of `@playwright/test` and are NOT in `init_spike/tests/`. A file at `tests/e2e/crdt-stress.spec.ts` run by `npx playwright test` (the path FR4 declares) has no way to import them.
**Status:** CONTRADICTED
**Suggested resolution:** Either (a) explicitly state that Layer C will NOT be a `tests/e2e/*.spec.ts` file but instead a script executed through the `/browser` skill's run.js wrapper; or (b) port the needed helper functions into the project (`init_spike/tests/e2e/helpers.ts`) before the stress test is written and reference them locally; or (c) rewrite the sequence using only stock Playwright APIs (`page.on('console', ...)`, explicit `waitForTimeout`/`waitForFunction`/`waitForSelector` loops). The current wording implies the helpers already exist and will silently fail at import time.

---

### [H2] Finding: Layer C uses `fetch('/api/test-reset')` without specifying POST — endpoint returns 405

**Category:** FACTUAL
**Source:** T1
**Location:** §9 Layer C sequence step 1 (SPEC.md L283)
**Issue:** The spec's Layer C sequence begins with ``` `fetch('/api/test-reset')` ``` — which defaults to `GET`. The server-side handler in `init_spike/src/server/hocuspocus-plugin.ts` L398-403 rejects any non-POST method with `res.writeHead(405); res.end('Method not allowed');`. The Layer C sequence will fail at step 1 unless the method is corrected.
**Current text:** "1. `fetch('/api/test-reset')`"
**Evidence:** `hocuspocus-plugin.ts` L399: `if (req.method !== 'POST') { res.writeHead(405); res.end('Method not allowed'); return; }`. The existing test harness in `init_spike/tests/e2e/qa-scenarios.spec.ts` L21-26 does it correctly: `await fetch('/api/test-reset', { method: 'POST' })`.
**Status:** CONTRADICTED
**Suggested resolution:** Change the spec to `fetch('/api/test-reset', { method: 'POST' })`. Also audit the Layer B stress script plan (§9 Layer B) and evidence file `test-reset-isolation.md` to ensure all call sites use POST.

---

### [H3] Finding: Layer B's "open HocuspocusProvider client" plan does not address observer sync or cross-scenario state leakage

**Category:** COHERENCE / FACTUAL
**Source:** L3 (missing conditionality) + T1
**Location:** §9 "Proposed solution" — Layer B (SPEC.md L192-198, L239), D9
**Issue:** Layer B is described as "Standalone script ... Opens a single `HocuspocusProvider` client, calls HTTP agent API, reads state via `provider.document.getText('source').toString()` + `mdManager.serialize(yXmlFragmentToProsemirrorJSON(provider.document.getXmlFragment('default')))`." Two distinct load-bearing problems are silently elided:

1. **Observer responsibility is unassigned.** The server-side hocuspocus setup does NOT run `setupObservers`; it only runs persistence. Observers run exclusively in `TiptapEditor.tsx` (browser client). Agent writes via `/api/agent-write-md` mutate only `Y.Text('source')` on the server (hocuspocus-plugin.ts L279-289). Without a client running `setupObservers`, `Y.XmlFragment('default')` stays empty. The script's assertion `serialize(xmlFragment) === ytext.toString()` would therefore always fail — XmlFragment is empty, Y.Text has content. The spec must explicitly say the Layer B script itself calls `setupObservers` on the provider's doc (and acknowledge the added setup/cleanup responsibility per scenario).

2. **Cross-scenario state leakage defeats `/api/test-reset`.** The spec says "a single HocuspocusProvider client" for the whole run and calls test-reset between scenarios. After `hocuspocus.unloadDocument(doc)` + file clear, the server's Y.Doc is destroyed. But the script's local `provider.document` still holds the previous scenario's CRDT state. When the provider reconnects (or the next transaction fires), the client's state vector is sent to the server, which merges the client's pre-reset updates back into the freshly-loaded empty doc. Scenario N+1 therefore starts with scenario N's content, not empty. Either the script must create a fresh provider per scenario (and allow full reconnect-sync each time, with added flakiness and cost), or manually clear its local Y.Doc (hard — no clean API).
**Current text:** L192-198 (Layer B description) and L239 (assertion mechanics) — neither mentions `setupObservers` nor cross-scenario Y.Doc reset on the client side.
**Evidence:** Server-side observer absence: `hocuspocus-plugin.ts` has no `setupObservers` call. Observer setup is only in `TiptapEditor.tsx` L71-87 inside the `onSync` handler. Test-reset semantics: `hocuspocus-plugin.ts` L398-420 destroys the server-side doc; no client-side reset is performed. Y.Doc update semantics: Yjs updates are additive via CRDT merge — `Y.applyUpdate(destDoc, Y.encodeStateAsUpdate(srcDoc))` re-adds any state the destination lacked (yjs `src/utils/encoding.js` L500-533).
**Status:** INCOHERENT
**Suggested resolution:** Expand §9 Layer B and/or D9 to explicitly state (a) that the stress script calls `setupObservers` on its provider's Y.Doc and tears them down between scenarios, and (b) that scenario isolation uses a fresh provider per scenario OR an explicit client-side reset protocol (e.g., `provider.destroy()` + new provider after each `/api/test-reset`). Add this to Assumptions (A7?) with a verification plan.

---

### [H4] Finding: FR2 test-case count contradicts the scenario matrix and later layer counts

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions) + L5 (summary coherence)
**Location:** §6 FR2 (SPEC.md L92) vs §9 scenario matrix (L214-230) and Layer A breakdown (L234)
**Issue:** FR2 says the observer unit stress suite "Runs 4 scenarios × 4 scale tiers (16 test cases min)." But §9 specifies **7 scenarios** run in Layer A (S1-S5 + S7 + S8), and the Layer A breakdown explicitly counts **23 test cases**. The "4 scenarios × 4 tiers" framing is stale — it predates the addition of S7 (D12) and S8 (D14) and the per-scenario tier restrictions (S3/S4/S5 skip adversarial). A first-time reader hitting FR2 will get a materially wrong picture of Layer A's scope.
**Current text:** "FR2: Observer unit stress suite | Runs 4 scenarios × 4 scale tiers (16 test cases min). Asserts strict convergence..."
**Evidence:** §9 L234: "runs S1-S5 at all 4 tiers + S7/S8 at 3 realistic tiers — 23 test cases total (S1 ×4 + S2 ×4 + S3 ×3 + S4 ×3 + S5 ×3 + S7 ×3 + S8 ×3)"
**Status:** INCOHERENT
**Suggested resolution:** Update FR2 to read "Runs 7 scenarios across up to 4 scale tiers (23 test cases: see §9 scenario matrix)". Also update FR4b to say "at each realistic tier" instead of "at each tier" — the matrix shows S8 only at the 3 realistic tiers, not adversarial.

---

### [H5] Finding: D3 ("A + B + 1×C") was not updated after D15 added Layer D

**Category:** COHERENCE
**Source:** L1
**Location:** §10 Decision Log — D3 vs D15 (SPEC.md L357 vs L369)
**Issue:** D3 LOCKS the test infrastructure as "A + B + 1×C (observer unit + API + one Playwright E2E)" — "three files to build + maintain." D15 then adds Layer D (a fuzz harness, `observers.fuzz.test.ts`) as a fourth in-scope layer, creating a fourth file. D3's implications line still says "Three files to build + maintain," which is factually wrong given D15. D15's lock is stronger (later, with user confirmation) but D3 is not superseded or amended. A cold reader parsing the decision log and the implications column will be confused about scope. The Layer A count in §9 ("runs S1-S5 at all 4 tiers ...") also only talks about four layers via sub-headings, but the decision log makes the scope look like three.
**Current text:** D3: "Three files to build + maintain" (Implications); D15: "New file `observers.fuzz.test.ts`, ~200 lines, new test:stress runner target"
**Evidence:** Direct table comparison in §10. Also, §13 "In Scope" next actions don't mention Layer D file creation explicitly.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) edit D3's Implications column to say "Four files to build + maintain (A, B, C, D)" and reference D15; or (b) add a trailing note to D3: "Superseded in part by D15 which adds Layer D (fuzz)." Also add Layer D creation to §13 Next Actions and FR2/FR4a consistency.

---

## Medium Severity

### [M1] Finding: D13 ("every test case runs both assertions") is not implemented in the Layer D fuzz harness as specified

**Category:** COHERENCE
**Source:** L1
**Location:** §9 Layer D fuzz failure attribution (SPEC.md L264-275) vs D13 (L367)
**Issue:** D13 LOCKS the two-tier convergence assertion and says in its Implications column: "Every test case runs both assertions." The fuzz harness code block in §9 only runs the primary bridge invariant: `if (!bridgeInvariantHolds(doc)) { ... }`. The secondary `Y.encodeStateAsUpdate` + `Y.applyUpdate` round-trip is NOT mentioned anywhere in the fuzz section. So either D13 is too strong (should say "every deterministic scenario test case"), or the fuzz harness needs to run the round-trip check on some cadence (every iteration? end of run? on failure?).
**Current text:** D13: "Every test case runs both assertions" | §9 fuzz: `if (!bridgeInvariantHolds(doc)) { ... }`
**Evidence:** §9 L265-275 fuzz code block + D13 Implications column.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) amend D13 to scope the "every test case" claim to Layer A/B only and state explicitly that Layer D uses the primary invariant only (with justification: running encodeStateAsUpdate on every iteration adds significant cost and obscures attribution); or (b) add round-trip checking to the fuzz harness on some cadence (e.g., once at end of iteration batch) and document it in §9.

---

### [M2] Finding: `/api/test-reset` has a race condition with Hocuspocus's persistence debouncer

**Category:** FACTUAL
**Source:** T1 + T2 (hocuspocus source)
**Location:** `evidence/test-reset-isolation.md` and §9 Layer B/C reliance on test-reset for isolation (SPEC.md L302, Q5)
**Issue:** The evidence file and Q5 resolution claim "`/api/test-reset` is sufficient for test isolation" and "Full Y.Doc state reset (because the doc is unloaded; next access re-creates from disk — which is now empty)". Reading Hocuspocus source confirms a subtler reality: `unloadDocument()` first calls `shouldUnloadDocument()`, which returns `false` (and causes the unload to be skipped entirely) if there is a debounced `onStoreDocument-<docName>` task in flight, `isCurrentlyExecuting`, or if `document.saveMutex.isLocked()`.

Hocuspocus is configured in `hocuspocus-plugin.ts` L40-43 with `debounce: 2000, maxDebounce: 10000`. Any agent write within 2 seconds before `/api/test-reset` is called leaves a pending debounced `onStoreDocument` in the debouncer, causing `unloadDocument()` to return early. The test-reset handler still proceeds to write `''` to the content file (L412), but the server-side `Y.Doc` stays loaded in memory with the previous scenario's state. Subsequent requests hit the still-loaded doc and observe pre-reset content.
**Current text:** `evidence/test-reset-isolation.md`: "Full Y.Doc state reset (because the doc is unloaded; next access re-creates from disk — which is now empty)" | SPEC Q5: "Yes — verified via code read"
**Evidence:** `~/.claude/oss-repos/hocuspocus/packages/server/src/Hocuspocus.ts` L545-552 (shouldUnloadDocument) and L554-588 (unloadDocument early-returns if shouldUnloadDocument is false). `hocuspocus-plugin.ts` L40-43 (debounce config). The evidence file cites L398-420 for the handler but did not look at the Hocuspocus-internal unload semantics.
**Status:** STALE (verification was partial)
**Suggested resolution:** Update `evidence/test-reset-isolation.md` and Q5 to document the race window. Add a mitigation to the test-reset implementation OR to the stress harness: either call `hocuspocus.debouncer.executeNow('onStoreDocument-test-doc')` before unload, or poll `hocuspocus.documents.has('test-doc') === false` + file content after reset, or bracket scenarios with a wait longer than `maxDebounce` (10s — unrealistic) before reset. The cleanest fix is to make `/api/test-reset` force-flush pending debounced work before unloading.

---

### [M3] Finding: Adversarial tier timeout (60s) is within an order of magnitude of worst-case `diffLines` cost at 50K lines

**Category:** FACTUAL / LOGICAL
**Source:** T3 (diff library) + L3 (missing conditionality)
**Location:** Q2 resolution (SPEC.md L377), Scale tiers table (L207-211), A2
**Issue:** Q2 sets adversarial timeout at 60s. The spec's A2 assumption says "diffLines performance is O(n·m) but acceptable at 10K lines." This claim is only true for mostly-aligned inputs; Myers diff worst case for two sequences of length N is `O(N × D)` where D is the edit distance, and pathological inputs (e.g., completely different or many interleaved inserts/deletes) push D close to N, giving `O(N²)`. At 50K lines × 50K lines in the worst case, this is ~2.5B comparisons. Even at ~10ns per comparison this is ~25s; at ~100ns (realistic with V8 string overhead) it's ~250s — well past the 60s timeout. Adversarial tier S2 ("concurrent user typing + agent write") is specifically an interleaved scenario and could hit this worst case.

Separately, at 10K lines (large-realistic), the 30s Q2 timeout is also tight: ~100M comparisons × 100ns = 10s of pure diff cost, leaving little headroom for observer flush, markdown parse/serialize, and fragment update.
**Current text:** Q2: "Start 10s for realistic tiers, 30s for large-realistic, 60s for adversarial"; A2: "diffLines performance is O(n·m) but acceptable at 10K lines"
**Evidence:** Myers diff complexity (the industry-standard algorithm used by `diff` v7 `diffLines`). Spec's own §14 Risks row 3 flags this: "`diffLines` O(n·m) behavior makes large-realistic tests too slow to tolerate" but assumes it's low likelihood.
**Status:** UNVERIFIABLE (requires running, which is the whole point of the harness) — but the stated timeouts may be too tight
**Suggested resolution:** Caveat Q2 that the timeouts are initial guesses based on expected content (aligned inputs). Add a note that adversarial S2 may require a larger timeout if it's interleaved-intensive. Consider dropping S2 at adversarial tier, OR moving adversarial-tier failures to a "did not converge in time" bucket distinct from "converged but assertion failed" — both are informational per D5 but the distinction matters for debugging.

---

### [M4] Finding: The `mdManager.serialize` "strips trailing newlines" characterization is imprecise

**Category:** FACTUAL / COHERENCE
**Source:** L4 (evidence-synthesis fidelity) + T3 (@tiptap/markdown source)
**Location:** `evidence/mdmanager-determinism.md` "Important caveat — trailing newline stripping" and SPEC Q10 resolution (L385)
**Issue:** The evidence file says "`mdManager.serialize` **strips trailing newlines** from its output" and cites a runtime example with 102→101 char diff. Reading `@tiptap/markdown@3.22.0` `src/MarkdownManager.ts` L268-294 shows the `serialize` method does NOT explicitly strip trailing newlines via trim/replace — it does `renderNodes(doc, doc)` and returns the result directly (except for `isEmptyOutput` detection). The "stripping" behavior is actually "the per-node renderers for paragraph/heading/list/codeBlock never emit a trailing newline after the LAST node." This is a subtle but meaningful distinction: if an extension's `renderMarkdown` handler emits a trailing `\n`, `serialize` will keep it — there's no global strip. Downstream convergence assertion logic that relies on "serialize always returns a string that never ends in `\n`" may be fragile if a custom extension (JsxComponent? user additions?) emits trailing newlines.
**Current text:** `evidence/mdmanager-determinism.md`: "`mdManager.serialize` strips trailing newlines from its output"
**Evidence:** `@tiptap/markdown/src/MarkdownManager.ts` L268-276 — no explicit strip; and L978-994 — `renderNodes` just recurses into per-node `renderMarkdown`. Spec also uses custom `JsxComponent` extension (init_spike/src/editor/extensions/jsx-component.ts) whose `renderMarkdown` behavior would need to be audited.
**Status:** CONTRADICTED (the "strip" framing is wrong; the result happens to lack a trailing newline for the current extension set)
**Suggested resolution:** Rewrite the evidence caveat to: "`mdManager.serialize` output does not end in `\n` for the current extension set because each node-renderer in `sharedExtensions` terminates its own block without a trailing newline. This is convention, not a guarantee — stress assertions should normalize trailing whitespace on both sides rather than relying on serialize having a consistent terminator." Same fix in Q10.

---

### [M5] Finding: `tests/e2e/crdt-stress.spec.ts` placement means it will be executed by stock `npx playwright test`, not by `bun test:stress` alone

**Category:** FACTUAL / COHERENCE
**Source:** T1
**Location:** §6 FR4, FR6, §9 Layer C path assignment (L199-201, L282)
**Issue:** `package.json` currently has `"test": "bun test --path-ignore-patterns 'tests/e2e'"` and `"test:e2e": "npx playwright test"`. Any file at `init_spike/tests/e2e/crdt-stress.spec.ts` will be picked up by the existing `bun test:e2e` run — so the stress Playwright test ships into the "all e2e" bucket by default and slows every QA run, defeating FR6's "opt-in" framing. The spec's `test:stress` script is described as "Runs observer stress suite + API script + Playwright stress test" — that's fine, but the spec does NOT also update the default `test:e2e` script to exclude `crdt-stress.spec.ts`, meaning both scripts will run it (once opt-in, once by default).

Also: Layer A's file (`init_spike/src/editor/observers.stress.test.ts`) lives in `src/editor/` which is NOT in the default `bun test` ignore list. It will be picked up by normal `bun test` runs on every developer commit, contradicting FR6's "opt-in" intent.
**Current text:** FR4: "`init_spike/tests/e2e/crdt-stress.spec.ts`"; FR6: "New `bun run test:stress` script in `init_spike/package.json`. Runs observer stress suite + API script + Playwright stress test."
**Evidence:** `init_spike/package.json` scripts block (already verified); current `bun test` command has path-ignore only for `tests/e2e`.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) update `test` to ignore `.stress.` files (e.g., `--path-ignore-patterns 'tests/e2e' --path-ignore-patterns '**/*.stress.test.ts'`), update `test:e2e` to ignore `crdt-stress.spec.ts`, and make `test:stress` the only runner; or (b) move Layer A file outside `src/` (e.g., `init_spike/tests/stress/observers.stress.test.ts`) and Layer C outside `tests/e2e/` (e.g., `init_spike/tests/stress/crdt-stress.spec.ts` with its own `playwright.config.ts`). Either way, the spec needs to commit to a physical layout that matches the "stress runs are opt-in" non-functional intent.

---

### [M6] Finding: S4 "gap 2 at scale" framing conflates two distinct bugs

**Category:** FACTUAL / COHERENCE
**Source:** L4 + T1
**Location:** §9 scenario S4 (SPEC.md L219) and §14 Risks row 6 (L429)
**Issue:** S4 is described as "Agent undo during active user typing (gap 2 at scale)." §14 says S4 is specifically "a scaled version of the gap 2 scenario explicitly." But §8 defines the "gap 2 bug" as: "`applyUserDelta` used `diffLines` which produced spurious `removed: X` + `added: X + Y` pairs for unterminated final lines." The gap 2 fix was about line-boundary normalization (`oldPadded` / `newPadded` + prefix-trim) — NOT specifically about undo during typing. Undo-during-typing is a *related* flow that happens to hit `applyUserDelta` (because Observer A runs during concurrent typing), but it's a distinct scenario.

Calling S4 "gap 2 at scale" creates false confidence that running S4 at 10K lines is sufficient regression coverage for the gap 2 fix. If the fix only hit the diffLines prefix-trim path when `oldXmlMd` has an unterminated final line, S4 may not actually exercise that specific code path at all — depending on how the synthetic generator constructs content (which, per Q3, is deterministic and probably always ends in a terminating newline → bypassing the gap 2 path entirely).
**Current text:** §9 S4: "Agent undo during active user typing (gap 2 at scale)"; §14: "Include a scaled version of the gap 2 scenario explicitly (S4 at medium-realistic)"
**Evidence:** §8 gap 2 bug description vs observers.ts L131-184 `applyUserDelta` — the fix is in the `oldPadded`/`newPadded` newline padding (L135-136) and the prefix-trim loop (L146-184). Neither code path is specifically tied to undo.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) rename S4 to "Agent undo during active user typing" and add a separate S4b "applyUserDelta unterminated-final-line regression" that constructs specifically the gap 2 trigger condition (content without trailing newline); or (b) specify in FR1 (synthetic generator) that it MUST produce at least one test case where `lastSyncedXmlMd` ends without `\n` so the gap 2 path is exercised. The current framing risks "we ran S4 at 2000 lines, gap 2 is covered" without that being factually true.

---

### [M7] Finding: Layer B's dependency on `@hocuspocus/provider` in Node misses a version-dependent WebSocket polyfill concern

**Category:** FACTUAL
**Source:** T2 (hocuspocus source)
**Location:** §9 Layer B (L192-198), D9
**Issue:** The Layer B plan opens "a single HocuspocusProvider client" from a standalone script ("`init_spike/scripts/stress-api.ts`"). This is nominally feasible but has a quiet dependency on the runtime: `@hocuspocus/provider@4.0.0-rc.1` reads `configuration.WebSocketPolyfill ?? WebSocket` (`HocuspocusProviderWebsocket.ts` L179-181). It uses the browser global `WebSocket`, not `ws`. In practice: Bun has native WebSocket since early versions, so `bun run scripts/stress-api.ts` works without extra config. Node.js 22+ has native WebSocket. Node 20 and earlier do NOT — the script will throw "WebSocket is not defined" at construction time. The spec doesn't pin the runtime and doesn't mention `WebSocketPolyfill`.
**Current text:** D9: "standalone script opens its own provider via `@hocuspocus/provider`" (no runtime caveat)
**Evidence:** `~/.claude/oss-repos/hocuspocus/packages/provider/src/HocuspocusProviderWebsocket.ts` L179-181; test utility at `hocuspocus/tests/utils/newHocuspocusProviderWebsocket.ts` L15 has a comment: "Node.js 22+ has native WebSocket support."
**Status:** STALE / incomplete
**Suggested resolution:** Add a parenthetical to Layer B or D9: "Script must run under Bun or Node 22+ (native WebSocket). If another runtime is ever used, pass `WebSocketPolyfill: require('ws')` to `HocuspocusProvider`." Alternatively, the stress-api.ts script can import `ws` and pass it as `WebSocketPolyfill` unconditionally to be robust.

---

## Low Severity

### [L1] Finding: Playwright test count claim is slightly off (23 vs 24)

**Category:** FACTUAL
**Source:** T1
**Location:** §8 "Existing test coverage" (SPEC.md L177)
**Issue:** The spec says "23 Playwright E2E tests in `tests/e2e/`". Actual count via grep of `test(` calls at top-level: `qa-scenarios.spec.ts` has 12, `sync.spec.ts` has 12, total = 24. Off by one.
**Current text:** "23 Playwright E2E tests in `tests/e2e/` — sync behavior, multi-tab, cross-mode. Small content."
**Evidence:** grep `^\s*test\(` in `init_spike/tests/e2e/*.spec.ts` → 12 + 12 = 24.
**Status:** CONTRADICTED
**Suggested resolution:** Either correct to "24" or (if one test is `.skip` or `.todo`) document the skip. Low-stakes but the exact count doesn't affect anything load-bearing.

---

### [L2] Finding: `tmp/ship/qa-progress.json` reference is ambiguous — file is worktree-local and gitignored

**Category:** FACTUAL
**Source:** T1
**Location:** §8 "Existing test coverage" (SPEC.md L178)
**Issue:** The spec references "38 QA scenarios in `tmp/ship/qa-progress.json`." `tmp/` is listed in `.gitignore` — the file does not exist in the `crdt-stress-hardening` worktree and exists only in sibling worktrees (`presence-awareness-ux`). A cold reader running the stress suite in a different worktree or on CI will not find the file.
**Current text:** "38 QA scenarios in `tmp/ship/qa-progress.json`. Small content."
**Evidence:** `.gitignore` line: `tmp/`; `find ... -name qa-progress.json` returns the path only inside `presence-awareness-ux` worktree. The count of 38 verified against the sibling worktree's file.
**Status:** STALE (context-bound)
**Suggested resolution:** Either cite the path with its worktree context ("38 QA scenarios documented during the presence-awareness-ux work in `tmp/ship/qa-progress.json` — not checked in, ephemeral state") or cite the shipped evidence instead (e.g., the PR #7 description or a more durable location).

---

### [L3] Finding: `window.__hocuspocusProvider` is set lazily — Layer C reads may race with first render

**Category:** FACTUAL
**Source:** T1
**Location:** §9 Layer C state read step 11 (SPEC.md L293), D10
**Issue:** D10 claims `window.__hocuspocusProvider` "already exposed in browser" and Layer C reads state via `page.evaluate(() => window.__hocuspocusProvider.document.getText('source').toString())`. The variable is set inside `TiptapEditor.tsx` L92 — but only after React has mounted the component AND the lazy `getProvider()` singleton runs AND the `HocuspocusProvider` constructor returns. If `page.evaluate` runs too early (e.g., immediately after `page.goto()`), `window.__hocuspocusProvider` may be `undefined`, and `undefined.document` throws. Existing `sync.spec.ts` avoids this by gating on `page.waitForSelector('.tiptap')` first. Layer C's sequence does include `waitForDOMStabilization` (which itself doesn't exist per H1), but Layer A reads may still race if the `selector: '.ProseMirror'` wait isn't conservative enough (the `.ProseMirror` element appears before `__hocuspocusProvider` in some mount orderings).
**Current text:** Layer C step 11 reads state directly without an explicit `page.waitForFunction(() => window.__hocuspocusProvider)` guard.
**Evidence:** `TiptapEditor.tsx` L60-96 — `getProvider()` sets `window.__hocuspocusProvider` inside the `if (!singletonProvider) { ... }` branch, only after constructing the `HocuspocusProvider`.
**Status:** INCOHERENT (would likely be caught during implementation, but spec sequence implies otherwise)
**Suggested resolution:** Add an explicit `await page.waitForFunction(() => Boolean((window as any).__hocuspocusProvider))` before any `page.evaluate` that reads from it.

---

### [L4] Finding: Server-side UndoManager is not exercised by Layer A (stated implicitly, not explicitly)

**Category:** COHERENCE
**Source:** L3
**Location:** §9 Layer A (SPEC.md L186-190), §8 "Where the bugs live" (L170)
**Issue:** §8 identifies the server-side per-origin UndoManager as one of the three "novel things in our stack" and says test variety should concentrate there. But Layer A is unit-level with no Hocuspocus server — there is NO server-side UndoManager in Layer A at all. Any `UndoManager` used in Layer A S3/S4 must be a locally-instantiated `Y.UndoManager` on the same process, which is structurally the same class but doesn't exercise any of the server-only concerns (DirectConnection lifecycle, agent session persistence, trackedOrigins across WebSocket transactions). Layer B exercises the real server-side UndoManager via HTTP, but Layer A does NOT — and the spec doesn't say this explicitly. A reader may assume S3/S4 at medium-realistic in Layer A is covering the "genuinely uncharted territory" the spec flagged.
**Current text:** §8: "Server-side per-origin `UndoManager` with concurrent 'users' ... genuinely uncharted territory" paired with Layer A S3/S4 scenarios that run locally.
**Evidence:** `hocuspocus-plugin.ts` L72-85 (server-side UndoManager creation happens only inside `getAgentUndoManager`, which is only called from `getAgentSession`, which is only called from HTTP agent API handlers). `observers.test.ts` shows how existing unit tests instantiate `new Y.UndoManager(...)` locally.
**Status:** INCOHERENT (claim scope vs actual coverage)
**Suggested resolution:** Add a note in §9 Layer A: "S3 and S4 use a local `Y.UndoManager(ytext, { trackedOrigins: new Set(['agent-write']), captureTimeout: 0 })` that mirrors the server's setup. The real server-side UndoManager is only exercised by Layer B." Separately, consider whether the "genuinely uncharted territory" warrants a dedicated Layer B scenario (e.g., "S3b: server-side undo chain via HTTP").

---

## Confirmed Claims (summary)

The following load-bearing claims were checked and confirmed:

**Codebase structure (T1):**
- `observers.ts` contains 450 lines; `setupObservers` returns a cleanup function.
- `DEBOUNCE_MS = 50` and `TYPING_DEFER_MS = 300` are the actual constants used by Observer A and Observer B.
- `applyUserDelta` performs `oldPadded`/`newPadded` newline padding (L135-136) and prefix-trim loop (L146-184) — gap 2 fix is in place.
- `lastSyncedXmlMd` is updated by Observer B after propagation (both early-exit path L366 and post-updateYFragment path L389) — matches spec §8's "from gap 2 fix" note.
- `observers.test.ts` has exactly **26** top-level `test(...)` calls — matches spec claim.
- `hocuspocus-plugin.ts` defines `agentSessions`, `agentUndoManagers`, and the `/api/agent-write-md`, `/api/agent-undo`, `/api/agent-undo-status`, `/api/agent-redo`, `/api/test-reset` endpoints as the spec describes. `captureTimeout: 0` is used (L79) with an inline comment acknowledging the Q11 spec divergence.
- `window.__hocuspocusProvider = provider` is set at `TiptapEditor.tsx` L92 (spec's cited location is correct).
- `sync.spec.ts` L343-347 demonstrates the exact pattern of reading `provider.document.getText('source').toString()` from `page.evaluate` — validates the D10 technique.
- `data-undo-state="ready"` attribute is set on the undo button at `AgentUndoButton.tsx` L126 — Layer C click selector is valid.

**Third-party APIs (T2/T3):**
- `@hocuspocus/provider@4.0.0-rc.1` exposes `HocuspocusProvider` and an internal `WebSocketPolyfill` configuration point.
- `Y.encodeStateAsUpdate(doc)` and `Y.applyUpdate(freshDoc, update)` both exist and are synchronous (`yjs/src/utils/encoding.js` L500-533, `yjs/src/index.js` L45-50). The round-trip technique in S7/D12 is a canonical yjs pattern.
- Yjs `applyRandomTests` + `TestConnector` pattern cited in Layer D and `evidence/yjs-stress-patterns.md` exists in `yjs/tests/testHelper.js` (4 call sites across y-text/y-map/y-array test suites).
- `Y.XmlFragment` inherits a `push()` method from the shared `YType` class at `yjs/src/ytype.js` L1216-1218 — Layer D's `pushXmlParagraph` mutator signature is valid.

**Document internals (T1):**
- The 38 QA scenarios claim matches `tmp/ship/qa-progress.json` in the parent presence-awareness-ux worktree (though see [L2]).
- `observers.test.ts` uses `bun:test` as the test framework (not vitest/jest) — Layer A's runner choice matches.

**Decision log internal consistency:**
- D1 through D16 (excluding D3 vs D15, see H5) are internally consistent with each other's stated rationale and 1-way-door classification.
- D9's "real HocuspocusProvider" rationale is consistent with D10's `page.evaluate` state read technique; both rely on the same `window.__hocuspocusProvider` hook.
- D14's "dedicated S8 for Unicode attribution" is consistent with the §9 scenario table (S8 runs at 3 realistic tiers, separate from S1-S5 propagation testing).

**Prior-art claims (T5):**
- The evidence file `yjs-stress-patterns.md` accurately describes the Yjs/y-prosemirror/y-codemirror.next stress testing convention (confirmed by direct source reads of `yjs/tests/testHelper.js`, etc., per the file's own source list). The "BlockSuite skipped CRDT-layer fuzzing" anti-pattern citation is directionally correct.

---

## Unverifiable Claims

- **A1:** "Current observer architecture scales linearly with content size up to large-realistic (10K lines)" — this is the spec's open question; it's literally what the stress suite is designed to answer. Correctly labeled MED confidence with "the stress suite itself will verify."
- **A4:** "Playwright can drive keyboard events fast enough to exercise typing race conditions" — plausible (Playwright's `page.keyboard.type({ delay: 5 })` gives ~200 WPM effective) but not verified empirically. Spec's verification plan ("Try it during iterate") is appropriate.
- **M3 baseline:** The spec's performance bar ("< 60s for observer stress alone") can't be verified without running. Correctly labeled "Baseline: Unknown."
- **Q10 runtime test:** The evidence file claims "verified by runtime test" but does not include the reproducer script or output. The determinism claim is plausible (the MarkdownManager `serialize` path is pure for a given extension set) but the specific 102→101 char example isn't reconstructable from the evidence alone. Low-stakes — the implementation will catch it either way.
- **Layer D fuzz iteration cost:** The spec sets scale ladder as 10/50/200/500 iterations but does not predict how long each takes. Without profiling data, the runtime and flakiness characteristics are unknown — which is fine for a fuzz harness (that's what FR8 timing reports are for) but the spec should not assume the "500 iter nightly probe" is actually runnable in under a minute or two without checking.
