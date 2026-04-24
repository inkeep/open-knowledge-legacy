# Evidence: FU2.2 — micromark State Machine & Transition-Coverage Instrumentation

**Dimension:** Instrumenting micromark's state machine
**Date:** 2026-04-19
**Sources:** micromark OSS repo (commit 774a70c), Jazzer.js instrumentor source, V8 blog, academic papers

---

## Key files / pages referenced

- https://github.com/micromark/micromark/blob/774a70c6bae6dd94486d3385dbd9a0f14550b709/packages/micromark-util-types/index.d.ts — `State`, `Code`, `Effects`, `Construct`, `Tokenizer` types
- https://github.com/micromark/micromark/blob/main/packages/micromark-util-symbol/lib/codes.js — character code definitions
- https://github.com/micromark/micromark/blob/main/packages/micromark/dev/lib/create-tokenizer.js — driver (`main`, `go`, `consume`, `enter`, `exit`, `constructFactory`)
- https://github.com/micromark/micromark/blob/main/packages/micromark-core-commonmark/dev/lib/thematic-break.js — 4-state example
- https://github.com/micromark/micromark/blob/main/packages/micromark-core-commonmark/dev/lib/code-fenced.js — 13-state example
- https://github.com/micromark/micromark/blob/main/packages/micromark-core-commonmark/dev/lib/attention.js — 2-state + `resolveAll` post-pass
- https://v8.dev/blog/javascript-code-coverage — V8 Inspector coverage granularity
- https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/coverageVisitor.ts — Jazzer.js coverage visitor
- https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/functionHooks.ts — Jazzer.js function-entry hook pattern
- https://github.com/RUB-SysSec/ijon — state-annotation AFL++ extension (C/C++)

---

## Findings

### Finding: A micromark "state" is literally a function `(code: Code) => State | undefined`
**Confidence:** CONFIRMED
**Evidence:** `packages/micromark-util-types/index.d.ts` ~lines 546–561:
```typescript
export type State = (code: Code) => State | undefined
export type Code = number | null
```
Driver `create-tokenizer.js` `go(code)` invokes `state = state(code)` — the "current state" is a reassignable function variable.
**Implications:** Each state is a named, top-level, callable JS function. This is unusually clean for instrumentation — unlike a switch-based FSM, each state is independently wrappable.

### Finding: Core CommonMark constructs expose 2–13 named states each
**Confidence:** CONFIRMED
**Evidence:**
- `thematic-break.js` → 4 states: `start`, `before`, `atBreak`, `sequence`
- `attention.js` → 2 states: `start`, `inside` (+ `resolveAll` post-processor)
- `code-fenced.js` → ~13 states: `start`, `beforeSequenceOpen`, `sequenceOpen`, `infoBefore`, `info`, `metaBefore`, `meta`, `atNonLazyBreak`, `contentBefore`, `contentStart`, `beforeContentChunk`, `contentChunk`, `after` + nested states inside `tokenizeCloseStart` / `tokenizeNonLazyContinuation`

Full construct list at https://github.com/micromark/micromark/tree/main/packages/micromark-core-commonmark/dev/lib: attention, autolink, blank-line, block-quote, character-escape, character-reference, code-fenced, code-indented, code-text, content, definition, hard-break-escape, heading-atx, html-flow, html-text, label-end, label-start-image, label-start-link, line-ending, list, setext-underline, thematic-break (22 constructs).

**Implications:** A transition graph over core states is a manageable target — low-hundreds of state functions.

### Finding: V8 `Profiler.takePreciseCoverage`, c8, and nyc all capture block/function/branch granularity but NONE capture inter-state-function transitions
**Confidence:** CONFIRMED
**Evidence:**
- V8 blog: precise coverage (v5.9 function granularity; v6.2+ block granularity) returns source ranges with exec counts. https://v8.dev/blog/javascript-code-coverage
- c8 README: wraps `NODE_V8_COVERAGE`, produces Istanbul-format statements/branches/functions/lines.
- nyc README: Istanbul statements/branches/functions/lines.
- None expose a `(from-function, to-function)` edge event.
**Implications:** Running `start → inside → inside` vs `start → inside` produces identical coverage bitmaps under standard tooling. A state machine's "interesting" state is which transition path it walked, not which states were ever entered.

### Finding: Jazzer.js instrumentation inserts libFuzzer edge counters at `FunctionDeclaration` entry, `IfStatement`, `SwitchCase`, loops, `TryStatement`, `LogicalExpression`, `ConditionalExpression` — these are intra-function edges, not inter-function transitions
**Confidence:** CONFIRMED
**Evidence:** `@jazzer.js/instrumentor/plugins/coverageVisitor.ts` enumerates the visited AST node types; `codeCoverage.ts` calls `Fuzzer.coverageTracker.incrementCounter(edgeId)` via an `EdgeIdStrategy.nextEdgeId()`.
**Implications:** When micromark's `go()` does `state = state(code)`, Jazzer.js sees a function-entry event for `state` but does NOT record the `(prevFn, thisFn)` pair. Because states are exchanged through a reassigned indirect call in the driver, no branch inside the driver statically distinguishes the destination — so libFuzzer-style edge coverage collapses all state transitions into a single edge bucket.

### Finding: IJON demonstrates edge-coverage alone fails on deep state spaces, solved by state-annotation primitives — but no JS port exists
**Confidence:** CONFIRMED (C/C++); NOT FOUND (JS port)
**Evidence:**
- https://github.com/RUB-SysSec/ijon — repo with `IJON_STATE`, `IJON_SET`, `IJON_INC` primitives for `afl-clang-fast`.
- IJON paper (IEEE S&P 2020): reports >20× speedup vs plain AFL on maze/Super Mario benchmarks, and crashes on 10 of 22 CGC challenges.
- Searched: "IJON JavaScript Node.js adaptation", "state transition coverage fuzzer JavaScript parser", "@jazzer.js/instrumentor state annotation plugin" — NOT FOUND.
**Implications:** The most established technique for state-aware fuzzing (IJON) has no pure-JS analog. Any state-transition-aware fuzzing of micromark today would be first-of-kind.

### Finding: Three concrete instrumentation pathways exist for transition-pair coverage in micromark
**Confidence:** INFERRED (primitives confirmed; end-to-end harness not demonstrated in primary sources)
**Evidence:**
1. **Babel plugin cloning Jazzer's `functionHooks`** — `functionHooks.ts` demonstrates matching functions by "fully-qualified name and file path" and wrapping with `HookManager.callHook()`. A derivative plugin could match `State`-shaped functions in `micromark-core-commonmark/dev/lib/*.js` and emit `__recordTransition(hash(prev), hash(curr))`.
2. **Runtime Proxy wrap** — because the `State` signature is `(code) => State | undefined`, a consumer can return `new Proxy(nextFn, handlers)` to log transitions without modifying micromark source.
3. **V8 Inspector `Debugger.setBreakpoint`** — set conditional breakpoints on first statement of each state function. Higher overhead but zero source changes.
**Implications:** All three are feasible; none are published. Approach (2) requires no build toolchain and is the cheapest PoC path.

---

## Negative searches (for NOT FOUND)

- Searched: "function call sequence coverage JavaScript fuzzer" — no libraries.
- Searched: "state transition coverage npm" — no hits.
- Searched: "IJON port JavaScript Node.js" — no adaptation.
- Searched: Jazzer.js customHooks docs for "transition" or "call graph" — no primitive.

---

## Gaps / follow-ups

- No public empirical study quantifies the state-space of micromark (e.g., how many distinct state-pair transitions are reachable on a CommonMark 0.31 corpus). Answering this would require instrumenting micromark on the CommonMark spec test suite, which is beyond this research scope.
