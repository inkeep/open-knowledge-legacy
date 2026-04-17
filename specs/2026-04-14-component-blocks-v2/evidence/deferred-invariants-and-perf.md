# Deferred — Invariant tests I13-I17 + Perf tests PF01/PF02 + DOM harness

**Produced:** 2026-04-16 by the PR #165 component-blocks-v2 agent, after landing commits 1-2 of a planned 6-commit follow-up series. Commits 3-6 are deferred to a stacked follow-up PR.

**Purpose:** Full handoff context for the agent that picks up the deferred work — the scope gap between SPEC §7.1 + §6 (what PR #165 claimed it would ship) and the actually-shipped tree. All research, decisions, and reasoning captured here so the follow-up can execute without reconstructing context from scratch.

**Origin document:** `CONSIDER.md` (sibling of this SPEC) — handoff from the `markdown-pipeline-engineering-health` sister-spec agent. CONSIDER.md surfaced 6 findings; my `/assess-findings` pressure-test expanded those into the full scope-gap pattern captured below.

**Plan file:** `/Users/edwingomezcuellar/.claude/plans/ok-lets-do-a-lucky-pine.md` — the approved 6-commit plan. Commits 1-2 landed; commits 3-6 are the deferred scope below.

---

## What landed (commits 1-2)

| Commit | SHA | What |
|---|---|---|
| 1 | `73f3ed9d` | SPEC.md I-count references aligned to authoritative I12-I17 (fixed 4 stale references) + PF04 added as [NOT NOW] non-goal |
| 2 | `5bdc3870` | Canonical `fixtures/mdx/built-ins.json` (18 cases) + `fixtures/ng-pinned/component-blocks-v2.json` (10 NG12 probe cases) + two new loaders in `fixtures/index.ts` (`loadBuiltInFixtures()`, `loadNgPinnedCases()`) + 6-test smoke suite |

Plus, from the prior merge session:
- `9cd1aac4` — `origin/main` merged into PR #165 branch; server-authoritative observer architecture adopted (precedent #14); FR-22 parseWithFallback ported to `server-observers.ts`; precedents #12/#13/#14 renumbered to #18/#19/#20.

**What's missing vs SPEC §7.1:**

```
SPEC says: I12-I17 invariant tests fail CI via bun run test:fidelity
Actual:    I12 exists (jsx-pristine-byte-identity.test.ts).
           I13, I14, I15, I16, I17 — all missing test files.
```

**What's missing vs SPEC §6:**

```
SPEC says: PF01-PF06 perf tests in component-blocks.perf.test.ts
Actual:    PF03, PF05, PF06 exist. PF01, PF02 missing. PF04 formally deferred (commit 1).
```

---

## Deferred scope — 8 items

| # | Item | Effort | Depends on | Confidence |
|---|---|---|---|---|
| A | Refactor `jsx-pristine-byte-identity.test.ts` to consume `loadBuiltInFixtures()` | ~30 LOC delta | Fixture loader (landed) | HIGH |
| B | Extend `ng-pinned.test.ts` with NG12 section + populate `expectedOutput` in the JSON fixture from live pipeline output | ~40 LOC + 10 JSON populations | Fixture loader (landed) | HIGH |
| C | Implement I13 PBT — `jsx-edited-idempotence.test.ts` | ~150 LOC | A + B | HIGH |
| D | Implement I14 — `rawmdx-fallback-byte-identity.test.ts` + 20 malformed-MDX fixtures | ~160 LOC | Fixture loader | HIGH |
| E | Implement I15 — `jsx-cross-path-consistency.test.ts` (Observer B vs mdManager parity, extending I5 pattern) | ~100 LOC | Fixture loader | HIGH |
| F | Implement I16 PBT — `jsx-nested-dirty.test.ts` (effectiveDirty invariant) | ~120 LOC | Fixture loader | HIGH |
| G | Pre-flight DOM spike + DOM env setup (happy-dom + Bun preload + TipTap mocks) | ~80 LOC | None (gates H, I, J) | MEDIUM — spike outcome decides |
| H | Implement I17 — `content-visibility-invariant.test.ts` (novel DOM-rendered PBT harness) | ~200 LOC | G | MEDIUM |
| I | Implement PF01 — React.Profiler render-count (Bun: ordinal; Playwright: absolute ms) | ~100 LOC Bun + ~80 LOC Playwright | G | MEDIUM |
| J | Implement PF02 — useAncestorContexts timing (Bun: relative ratio; Playwright: absolute ms) | ~60 LOC Bun + ~60 LOC Playwright | G | MEDIUM |

**Total remaining effort:** ~1,000 LOC across ~12 new/modified files. Stacked follow-up PR base = `worktree-component-blocks-v2` HEAD after commits 1-2 land.

---

## Part 1 — Deferred fidelity tests

### A. Refactor `jsx-pristine-byte-identity.test.ts` to use the loader

**Context.** Commit 2 lifted the 18 fixtures out of inline string literals (lines 22-85 of the test file pre-refactor) into `fixtures/mdx/built-ins.json`. The test file still references the literals — until it's refactored, the JSON fixture is authoritative but unused.

**What to do.** Replace the inline `test('Callout with type attr', () => { assertByteIdentity(...) })` blocks with a generator loop:

```typescript
import { loadBuiltInFixtures } from '@inkeep/open-knowledge-core/markdown/fixtures';

describe('I12 — Pristine jsxComponent byte-identity (from canonical fixtures)', () => {
  for (const fixture of loadBuiltInFixtures()) {
    test(fixture.componentName, () => {
      assertByteIdentity(fixture.blockForm);
      if (fixture.inlineForm) assertByteIdentity(fixture.inlineForm);
    });
  }
});
```

**Watch for.** The existing test has separate `describe` blocks for "block form," "γ dirty-path," and "inline thin shape." After refactor, preserve those groupings — loop within the block-form describe; keep the γ dirty-path block as-is (it's not fixture-driven; it tests the dirty-rebuild logic directly).

**Verification.** `bun run test:fidelity` should show the same number of passing assertions as before the refactor. If any case fails, the fixture JSON has a typo relative to the original inline literal.

### B. Extend `ng-pinned.test.ts` with NG12 + populate `expectedOutput`

**Context.** Commit 2 landed `fixtures/ng-pinned/component-blocks-v2.json` with 10 probe cases, all with `expectedOutput: null`. The test harness must: (1) assert idempotence unconditionally, (2) assert `expectedOutput === actual` only when non-null.

**Two-step maturation.**

Step 1 — Write the test:

```typescript
import { loadNgPinnedCases } from '@inkeep/open-knowledge-core/markdown/fixtures';

describe('NG12 — JSX component normalization (idempotence)', () => {
  for (const c of loadNgPinnedCases()) {
    test(c.name, () => {
      const first = mdManager.serialize(mdManager.parse(c.input));
      const second = mdManager.serialize(mdManager.parse(first));
      // Idempotence — always-on contract
      if (c.idempotent) expect(second).toBe(first);
      // Byte-pin — regression guard when populated
      if (c.expectedOutput !== null) expect(first).toBe(c.expectedOutput);
    });
  }
});
```

Step 2 — Populate `expectedOutput` by running the test, capturing the live output for each of the 10 cases, and committing the JSON with the pins. This closes the loop: subsequent regressions (library bumps, handler changes) trigger a failing assertion.

**Highlighted cases (2, 5, 6, 7) are the ones most at risk.** These are the cases where `expectedOutput` matters most — a library-version bump of `mdast-util-mdx-jsx` could silently change single-to-double quote normalization, or our `mdxJsxFlowElementHandler` could emit different children separation. Pin these first.

**Case-by-case notes:**

- **Case 1** (`<Callout type="info">Hello world</Callout>\n`) — single-line, so parses as `mdxJsxTextElement` → jsxInline thin shape. Output is the source text verbatim.
- **Case 2** (highlighted) — `type='info'` → `type="info"`. Library normalizes single-quoted attrs to double-quoted.
- **Case 3** — expression attr `data={values}` preserves via `MdxJsxAttributeValueExpression.value`.
- **Case 4** — boolean shorthand (`disabled` with no value).
- **Case 5** (highlighted) — multi-line form parses as `mdxJsxFlowElement` → jsxComponent block. Our FR-6 `mdxJsxFlowElementHandler` (`packages/core/src/markdown/to-markdown-handlers.ts:326-352`) emits children **flush-left**, not 2-space-indented. Expected output is the same flush-left form as the input.
- **Case 6** (highlighted) — nested JSX container `<Steps><Step>...</Step><Step>...</Step></Steps>`. Flush-left handler emits blank-line separators between children. Expected may differ from input if input lacks blank lines (e.g., input without blank lines → output with blank lines, normalizing to the canonical flush-left + separator form).
- **Case 7** (highlighted) — dotted member-access component name `<Docs.Link>`. Preserves.
- **Case 8** — array literal expression `{[1,2,3]}`. Preserves via estree AST.
- **Case 9** — self-closing dotted name.
- **Case 10** — self-closing with trailing newline. Remark-stringify final-newline handling.

### C. I13 — `jsx-edited-idempotence.test.ts`

**Purpose.** SPEC §7.1 I13: `serialize(parse(serialize(parse(X_edited)))) === serialize(parse(X_edited))` for all 18 built-ins under each PropDef control's edited state. NG12 convergence on first serialize; double-round-trip stabilizes.

**Pattern.** Fast-check PBT. Arbitrary construction:

1. Pick a built-in from `loadBuiltInFixtures()`.
2. Look up its `JsxComponentMeta` in `packages/core/src/registry/built-ins.ts`.
3. For each `PropDef` (string / boolean / number / enum), generate a valid random value.
4. Parse the blockForm → PM JSON → locate the jsxComponent node → set `sourceDirty: true` + mutate one prop in `attrs.props` to the new value.
5. Serialize → parse → serialize again → compare.

**Template.** `jsx-pristine-byte-identity.test.ts:88-168` (existing γ dirty-path tests) shows the manipulation pattern:

```typescript
function dirtyRoundTrip(md: string): string {
  const json = mdManager.parse(md);
  function markDirty(node: JSONContent): void {
    if (node.type === 'jsxComponent' && node.attrs) {
      node.attrs.sourceDirty = true;
    }
    if (node.content) for (const child of node.content) markDirty(child);
  }
  markDirty(json);
  return mdManager.serialize(json);
}
```

For I13, extend this to: (a) mutate a random prop value before serializing, (b) assert double-round-trip stability on the output.

**Seed discipline.** Use fixed seed 42 per established convention (`invariant-i1.test.ts:34-50`). If any run is non-deterministic across seeds, investigate before shipping.

**Pair with NG12 cases.** Also run the 10 NG12 probe cases as regression pins alongside the PBT. The PBT catches property violations over a large input space; the example pins catch specific canonical-form drift.

### D. I14 — `rawmdx-fallback-byte-identity.test.ts`

**Purpose.** SPEC §7.1 I14: when a PM node is in rawMdxFallback state, `serialize(rawMdxFallback) === sourceRaw`. Pure passthrough; preserves NG4 (HTML), NG5 (entity references), NG9 (PUA sentinels).

**Pattern.**

1. Author 20 malformed-MDX fixtures:
   - 10 by lifting from `packages/core/src/markdown/fixtures/mdx/crash-taxonomy.json` where `expectedOutcome` involves rawMdxFallback (filter the 26 crash classes).
   - 10 fresh: unclosed tags (`<Foo>content`), tag-mismatch (`<Foo>...</Bar>`), malformed expression attrs (`<Comp data={unclosed`), nested unclosed (`<Tabs><Tab>...</Tabs>`), mixed text/broken-JSX (`prose <Foo> more prose <Bar/>`), invalid MDX expressions (`{...invalid}`), multi-line broken blocks, etc.

2. Store in new fixture file `fixtures/mdx/rawmdx-fallback.json` (follow the BuiltInFixture shape, swap the field name).

3. Test harness:
   ```typescript
   for (const fixture of loadRawMdxFallbackFixtures()) {
     test(fixture.name, () => {
       const json = mdManager.parseWithFallback(fixture.input);
       // Find the rawMdxFallback node
       const fallback = findNode(json, 'rawMdxFallback');
       expect(fallback).not.toBeNull();
       expect(fallback!.attrs!.sourceRaw).toBe(fixture.input); // or the matched portion
       // Serialize back
       const output = mdManager.serialize(json);
       expect(output).toBe(fixture.input);
     });
   }
   ```

4. Edge case: fixtures that produce PARTIAL rawMdxFallback (structural enumeration per FR-23 isolates the broken region while preserving surrounding structured content). For those, the assertion is: `sourceRaw` matches the broken region's source bytes.

**Watch for.** The R23 autolink-void-HTML guard (`packages/core/src/markdown/autolink-void-html-guard.ts`) uses PUA sentinels (U+E000-U+E004). Fixtures containing those characters may corrupt — CLAUDE.md NG9 documents this. If a fixture needs to test PUA preservation, verify the guard's restoration pass works.

### E. I15 — `jsx-cross-path-consistency.test.ts`

**Purpose.** SPEC §7.1 I15: agent-write path (Y.Text → Observer B → XmlFragment) and source-mode-edit path produce semantically identical PM trees.

**Template.** `packages/app/tests/fidelity/invariant-i5.test.ts:40-57` — existing Layer A vs Layer B test. I15 extends it to jsx-containing docs.

**Pattern.**

```typescript
// Layer A (mdManager direct)
const layerA = (md: string) => mdManager.parse(md);

// Layer B (Y.Text → server Observer B → XmlFragment)
const layerB = async (md: string) => {
  const { doc, xmlFragment, ytext } = createTestDoc();
  const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, scheduler, mdManager }));
  ytext.insert(0, md);
  scheduler.flush(); // drain Observer B
  const pmJson = yXmlFragmentToProsemirrorJSON(xmlFragment);
  cleanup();
  return pmJson;
};

for (const fixture of loadBuiltInFixtures()) {
  test(`I15 cross-path ${fixture.componentName}`, async () => {
    const a = layerA(fixture.blockForm);
    const b = await layerB(fixture.blockForm);
    expect(normalizePMJson(b)).toEqual(normalizePMJson(a));
  });
}
```

**Caveat.** After the server-authoritative migration, "source-mode-edit path" = server Observer B (not client). Use the test harness from `packages/server/src/server-observers.test.ts` for the Layer B setup. The manual scheduler pattern is already in that file.

**Caveat 2.** "Semantically identical" not byte-identical serialization — normalize PM JSON by ignoring transient attrs (`bridgeId` if set in PluginState, etc.). Don't over-strip.

### F. I16 — `jsx-nested-dirty.test.ts`

**Purpose.** SPEC §7.1 I16: for any PM tree where ≥1 jsxComponent descendant has `sourceDirty=true`, the enclosing pristine ancestors MUST reconstruct (not emit stale `sourceRaw`). No subtree edit is lost on save.

**Target code.** `packages/core/src/markdown/index.ts:265-282` — `effectiveDirty()` + `hasDirtyDescendant()`.

**Pattern.** PBT over `(tree, dirty-subset)` pairs.

Arbitrary:
1. Generate a nested tree of jsxComponents using `@fast-check/arbitrary.letrec` (for recursion). Depth 2-4. Each node is a built-in container (Cards, Steps, Tabs, Accordions) with children from the same set.
2. Random dirty subset: pick N nodes uniformly at random (1 ≤ N ≤ tree_size), mark `sourceDirty: true`.
3. Modify each dirty node's props: set a recognizable sentinel (e.g., `testMarker: 'EDIT-{idx}'`).

Assertion:
```typescript
const serialized = mdManager.serialize(tree);
const reparsed = mdManager.parse(serialized);
for (const dirtyNode of findDirtyNodes(tree)) {
  const matchingReparsedNode = findNodeByPath(reparsed, pathOf(dirtyNode));
  expect(matchingReparsedNode?.attrs?.props?.testMarker).toBe(dirtyNode.attrs.props.testMarker);
}
```

**Key property.** The test should FAIL if a change is made to `effectiveDirty` that breaks the ancestor-reconstruction rule. Example failure: if `effectiveDirty` returns false for a pristine ancestor whose descendant is dirty, the ancestor will emit its stale `sourceRaw` which lacks the descendant's edit → test's `findNodeByPath` sees the old value → assertion fails.

**Seed discipline.** Same as I13 — fixed seed 42, `NUM_RUNS` iterations per the helpers convention.

---

## Part 2 — Deferred perf tests

### G. DOM env setup (pre-flight spike + infrastructure)

**Research-backed decision.** Use `@happy-dom/global-registrator`. Canonical Bun-documented path; works for React 19. Research found jsdom also viable but not first-class in Bun. Playwright Component Testing was ruled out because it duplicates the existing E2E tier.

**Critical caveat from research.** Neither happy-dom nor jsdom runs CSS layout. **Timings from `React.Profiler.onRender` under happy-dom reflect Bun's JS runtime, not Chromium render cost.** Absolute ms thresholds must live in Playwright, not Bun tests. Bun tests get ordinal correctness + relative timing. This is how Linear, Next.js-scale teams actually gate perf.

**Pre-flight spike** (before committing any DOM infra): 20-min smoke test mounting a single `<JsxComponentView>` under happy-dom with a trivial Y.Doc. Verify:

1. React 19.2 hydrates — `createRoot` works, no version-mismatch errors
2. `useSyncExternalStore` fires on Y.Doc updates
3. **React Compiler parity** — the repo has React Compiler enabled via `babel-plugin-react-compiler` in Vite config. Verify the Babel plugin applies in Bun test runtime. If it doesn't, component render counts will diverge from production. Fix: add preload hooks or Babel config in `bunfig.toml`.
4. Radix Popover with `defaultOpen` doesn't throw on `floating-ui` portal — known issue per [radix-vue #904](https://github.com/radix-vue/radix-vue/issues/904) and [radix-ui/primitives #3612](https://github.com/radix-ui/primitives/issues/3612). Mitigation: drive prop edits via `editor.commands.updateAttributes()` callback, not PopoverUI interaction.

**Escape hatch.** If the spike fails, defer I17/PF01/PF02 permanently. Update SPEC.md to mark these as [NOT NOW]. Consider whether Playwright-only perf tests can ship without the Bun ordinal layer.

**TipTap layout mocks** (required per [TipTap #4008](https://github.com/ueberdosis/tiptap/discussions/4008)):

```typescript
// tests/dom/preload.ts
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

const fakeRect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) };
Range.prototype.getBoundingClientRect = () => fakeRect as DOMRect;
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
HTMLElement.prototype.getBoundingClientRect = () => fakeRect as DOMRect;
HTMLElement.prototype.getClientRects = () => [] as unknown as DOMRectList;
document.elementFromPoint = () => null;

// ResizeObserver + IntersectionObserver stubs — Radix-UI needs these
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
globalThis.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
```

**Bun preload.** Configure via `bunfig.toml`:
```toml
[test]
preload = ["./packages/app/tests/dom/preload.ts"]
```

Or scope to specific test files via `bun test --preload=...` in turbo tasks.

**devDep add.** `@happy-dom/global-registrator` into `packages/app/package.json`.

### H. I17 — `content-visibility-invariant.test.ts` (novel harness)

**Research finding.** No established editor-testing term for this invariant. Closest prior art: `fast-check-frontend` for PBT harness shape. Lexical, BlockNote, Plate all use example-based content tests, not PBT. I17 as defined is novel-to-this-codebase.

**Contract.** For any PM doc state (including ones with rawMdxFallback, unknown components, parse failures), every text-bearing node's text content is present in the rendered DOM — as visible text or as editable nested-CM content. `extractRenderedText(dom) ⊇ extractDocText(pmDoc)`.

**Two helpers (new file `tests/fidelity/helpers-dom.ts`):**

```typescript
/** Walk PM JSON; concatenate all `text` node values + `sourceRaw` from rawMdxFallback/jsxInline. */
export function extractDocText(pmDoc: JSONContent): string[] {
  const out: string[] = [];
  function walk(n: JSONContent) {
    if (n.type === 'text' && typeof n.text === 'string') out.push(n.text);
    if (n.type === 'rawMdxFallback' && typeof n.attrs?.sourceRaw === 'string') out.push(n.attrs.sourceRaw);
    if (n.type === 'jsxInline') {
      // jsxInline thin-shape: text is the source
      for (const child of n.content ?? []) walk(child);
    }
    for (const child of n.content ?? []) walk(child);
  }
  walk(pmDoc);
  return out;
}

/** Tree-walk the DOM, extracting text from elements whose ancestor chain does
 * NOT contain visibility-hiding markers on our own renderer elements.
 *
 * IMPORTANT: happy-dom cannot evaluate CSS. This catches `display:none` /
 * `visibility:hidden` set as inline styles or `hidden` attribute or
 * `aria-hidden="true"` on our own elements — NOT class-based CSS hiding.
 * Real-browser CSS hiding lives in Playwright (stacked follow-up if needed). */
export function extractRenderedText(root: HTMLElement): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let el: HTMLElement | null = node.parentElement;
      while (el) {
        if (
          el.hasAttribute('hidden') ||
          el.getAttribute('aria-hidden') === 'true' ||
          (el.style?.display === 'none' || el.style?.visibility === 'hidden')
        ) return NodeFilter.FILTER_REJECT;
        el = el.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let textNode = walker.nextNode();
  while (textNode) {
    parts.push(textNode.textContent ?? '');
    textNode = walker.nextNode();
  }
  return parts.join('\n');
}
```

**PBT shape.** Fast-check arbitrary produces randomized PM docs including all 5 kinds: registered-valid, unknown-component, render-error, rawMdxFallback, inline JSX. Mount each via `createRoot` + `act()`, extract text, assert inclusion.

**Critical limitation to document in test header.** Class-based CSS hiding (a Tailwind `hidden` utility class or a custom selector `.my-class { display: none }`) is NOT caught by this test — happy-dom has no CSS engine. The invariant is about our code's explicit attribute/inline-style choices. A Playwright equivalent test in a real browser can extend the invariant.

### I. PF01 — React.Profiler render-count

**Bun test (ordinal assertion, no absolute ms):**

```typescript
test('PF01 — editing one prop re-renders only that NodeView', () => {
  const renderCounts = new Map<string, { count: number; actualDurationSum: number }>();
  function trackRender(id: string, phase: string, actualDuration: number) {
    if (phase !== 'update') return; // Filter: nested-update can fire under Concurrent Mode
    const prev = renderCounts.get(id) ?? { count: 0, actualDurationSum: 0 };
    renderCounts.set(id, { count: prev.count + 1, actualDurationSum: prev.actualDurationSum + actualDuration });
  }
  
  // Mount 100 NodeViews, each wrapped in its own Profiler
  const editor = /* mount editor with 100 jsxComponents */;
  
  // Clear any mount-phase render counts
  renderCounts.clear();
  
  // Edit one prop on NodeView at index 42
  editor.commands.updateAttributes('jsxComponent', { props: { newValue: 'test' } }, { from: ..., to: ... });
  
  // Ordinal assertion:
  expect(renderCounts.get('node-42')?.count).toBe(1);
  for (let i = 0; i < 100; i++) {
    if (i === 42) continue;
    expect(renderCounts.get(`node-${i}`)?.count ?? 0).toBe(0);
  }
});
```

**Playwright test (absolute ms):** same scenario in Chromium via existing Vite dev server. Measure `performance.now()` around the prop-edit action. Assert `p99 < 50ms` per SPEC.

**Key gotchas** (from research):
- Filter by `phase === 'update'` (not `"nested-update"` under Concurrent Mode)
- Wrap EACH NodeView in its own `<Profiler id={idx}>` — if you wrap the list, `actualDuration` includes children
- Verify React Compiler applies in Bun test runtime (in pre-flight spike) — if not, render counts diverge from prod

### J. PF02 — useAncestorContexts timing

**Target code.** `packages/app/src/editor/context-bridge/hooks.tsx:60-96`.

**Bun test (relative ratio):**

```typescript
test('PF02 — ancestor walk scales linearly with depth (relative ratio)', () => {
  // Build 2 synthetic nested jsxComponent trees: depth 5 and depth 10
  // Instrument useAncestorContexts with performance.now() deltas
  // Run 100x each, compute average
  const ratio = avgDepth10 / avgDepth5;
  // Should scale close to linearly (depth 10 is roughly 2x depth 5)
  expect(ratio).toBeGreaterThan(1.5);
  expect(ratio).toBeLessThan(3); // not super-linear
});
```

**Playwright test (absolute ms):** same structure in Chromium. Assert `p99 < 10ms` at depth 10 per SPEC.

**Instrumentation approach.** The cleanest path is a test-only export: add a `measurementHook` parameter to `useAncestorContexts` that, when set, wraps the walk in performance.now() deltas. OR: extract the pure walk logic to a plain function `walkAncestors(editor, $pos)` and measure that directly.

### PF calibration decision — keep fixed thresholds

**Against CONSIDER §4 Option A.** Research confirms absolute ms thresholds don't belong in `bun test` under an emulator — happy-dom doesn't run CSS layout; timings reflect Bun runtime, not render cost. The `max(2σ, 10%)` variance-based formula from `packages/core/tests/perf/regression-gate.ts` stays scoped to parse/serialize ops. Component-blocks perf uses:

- **PF03, PF05, PF06** — keep existing fixed thresholds. These are non-DOM: PF03 is pure `parseWithFallback`, PF05 counts Y.Items, PF06 is store throughput. Fixed thresholds are correct.
- **PF01, PF02** — use ordinal + relative in Bun, absolute in Playwright. No `max(2σ, 10%)` adoption.
- **PF04** — formally [NOT NOW] in SPEC.

Rationale: adopting the variance formula broadly would add calibration overhead (new baseline.json per op, drift-recapture workflow) without fixing what `max(2σ, 10%)` was designed for (CI runner noise on absolute ms measurements). The layered approach (ordinal in Bun, absolute in Playwright) addresses the same underlying problem more directly.

---

## Part 3 — Declined items

### CONSIDER.md §3 — Standalone flush-left algorithm doc

**Decision.** Decline for this PR scope.

**Evidence.** `packages/core/src/markdown/to-markdown-handlers.ts:315-352` implements the `mdxJsxFlowElement` handler with ~12 lines of doc comments + ~25 lines of implementation. Handler has branches for self-closing and container. Uses `state.containerFlow` with synthetic `{type: 'root', children: ...}` — a subtle but commented workaround.

The handler plus the 10 probe cases in `serialize-roundtrip-probe.md` (now lifted to NG12 fixtures) together constitute a working contract.

**Rust-port timing.** The Rust port lives on a different worktree (`specs/2026-04-14-markdown-engine-rust-bridge/`) with no signal it's near-term. Without that timing, the current inline docstring is adequate. Pre-emptively building a standalone algorithm spec is over-engineering without a consumer.

**Re-raise trigger.** Revisit when (a) Rust port becomes near-term, OR (b) corner-case bugs appear that would've been caught by better docs.

### PF04 — Tier-timing regression gate

Formally [NOT NOW] in SPEC via commit 1. Rationale captured in SPEC non-goals section:
- Quarterly cadence not load-bearing for correctness
- Tier budgets drift slowly; caught by per-test gates before aggregating
- Custom turbo-timing capture infrastructure (parsing `.turbo/runs/*.json` or wrapping `time`) beyond PR scope
- Sister-spec perf regression gate already covers parse/serialize hot paths directly

---

## Dependencies

```
Commit 2 (landed) — fixture loaders
    │
    ├── Item A (pristine refactor) ─┐
    ├── Item B (NG12 extension)     ├── Items C, D, E, F (I13-I16 tests)
    └── Items C-F directly          │
                                    │
Item G (pre-flight spike + DOM)     │
    │
    ├── Item H (I17)
    └── Items I, J (PF01, PF02)
```

**Suggested order for the follow-up agent:**

1. A, B (refactor + NG12 extension — lowest risk, validates the loader end-to-end)
2. C, D, E, F in parallel (Bun-native, non-DOM)
3. G pre-flight spike (decision point)
4. If spike passes: H, I, J in parallel
5. If spike fails: downscope SPEC to mark I17/PF01/PF02 as [NOT NOW]

**Full gate verification after each step:** `bun run check` + `bun run test:perf`. Playwright suite after commit 6 (absolute-ms tests).

---

## Research references

### DOM env

- **Choice: `@happy-dom/global-registrator`.** Bun-native; canonical path per Bun docs. jsdom viable but not first-class in Bun. Playwright Component Testing was considered but duplicates existing E2E tier.
- **Cannot trust absolute timings** — happy-dom and jsdom don't run CSS layout. Use for ordinal correctness; put absolute ms in Playwright.

### React.Profiler

- Correct primitive for render-count assertions.
- **Filter by `phase === 'update'`** — nested-update under Concurrent Mode can fire.
- **Wrap each component under test individually** — `actualDuration` includes children.
- React 19.2 specific: no deprecations; still supported.

### TipTap + emulator

- 5 layout mocks required per [TipTap #4008](https://github.com/ueberdosis/tiptap/discussions/4008): `Range.prototype.getBoundingClientRect`/`getClientRects`, `HTMLElement.prototype.getBoundingClientRect`/`getClientRects`, `document.elementFromPoint`. Plus `editorProps.attributes = { role: "textbox" }` in the editor setup.

### Radix Popover + happy-dom

- Known floating-ui issues per [radix-vue #904](https://github.com/radix-vue/radix-vue/issues/904), [radix-ui/primitives #3612](https://github.com/radix-ui/primitives/issues/3612) (`pointer-events: none` regression).
- **Mitigation.** Drive PropPanel prop edits via `editor.commands.updateAttributes()` callback, not through simulated UI interaction. Render with `defaultOpen` + stub `ResizeObserver` / `IntersectionObserver`.

### I17 novelty

- No established editor-testing term. Closest prior art: [fast-check-frontend](https://github.com/mdubourg001/fast-check-frontend) for PBT harness shape.
- Lexical, BlockNote, Plate all use example-based content tests, not PBT.
- I17 as defined is novel-to-this-codebase — worth an explanatory header in the test file.

---

## Critical files (paths to open first)

**For items A-F (fidelity work):**
- `packages/app/tests/fidelity/helpers.ts` — reuse `mdManager`, `mdRoundTrip`, `normalize`, `NUM_RUNS`, `PBT_TIMEOUT_MS`, `assertAcrossSeeds`
- `packages/app/tests/fidelity/jsx-pristine-byte-identity.test.ts` — refactor target (item A)
- `packages/app/tests/fidelity/ng-pinned.test.ts` — extend for NG12 (item B)
- `packages/app/tests/fidelity/invariant-i5.test.ts` — template for I15 (item E)
- `packages/app/tests/fidelity/invariant-i1.test.ts` — fast-check PBT template (items C, F)
- `packages/core/src/markdown/fixtures/index.ts` — the loaders shipped in commit 2
- `packages/core/src/markdown/fixtures/mdx/built-ins.json` — 18 fixtures
- `packages/core/src/markdown/fixtures/ng-pinned/component-blocks-v2.json` — 10 NG12 cases
- `packages/core/src/registry/built-ins.ts` — 18 descriptor source of truth for I13 arbitraries
- `packages/core/src/markdown/index.ts:265-282` — `effectiveDirty` / `hasDirtyDescendant` (I16 target)
- `packages/core/src/markdown/fixtures/mdx/crash-taxonomy.json` — 26 crash classes (source material for I14 fixtures)
- `packages/server/src/server-observers.test.ts` — setupServerObservers test harness (I15 template)

**For items G-J (DOM + perf work):**
- `packages/app/tests/stress/component-blocks.perf.test.ts` — existing perf test template (extend with PF01, PF02)
- `packages/app/src/editor/context-bridge/hooks.tsx:60-96` — `useAncestorContexts` (PF02 target)
- `packages/app/src/editor/extensions/JsxComponentView.tsx` — main NodeView (DOM mount target)
- `packages/app/src/editor/components/PropPanel.tsx` — prop edit component (PF01 scenario)
- `packages/core/tests/perf/regression-gate.ts` — sister-spec gate (reference only; not adopted for jsx ops)

---

## Verification checklist for the follow-up agent

### After item A (pristine refactor)

```bash
bun test packages/app/tests/fidelity/jsx-pristine-byte-identity.test.ts 2>&1 | grep -E "^\s*[0-9]+ pass|fail"
# Expect same pass count as pre-refactor
```

### After item B (NG12 extension)

```bash
bun test packages/app/tests/fidelity/ng-pinned.test.ts 2>&1 | grep -E "pass|fail"
# Expect: NG1 + NG11 + 10 NG12 cases all pass
```

Also verify at least the 4 `highlighted:true` cases have `expectedOutput` populated:
```bash
bun -e "const fs = require('fs'); const cases = JSON.parse(fs.readFileSync('packages/core/src/markdown/fixtures/ng-pinned/component-blocks-v2.json', 'utf8')); console.log(cases.filter(c => c.highlighted).map(c => ({id: c.id, populated: c.expectedOutput !== null})))"
```

### After items C-F (I13-I16)

```bash
bun run test:fidelity 2>&1 | tail -10
# Expect: all I1-I11 pass, I12-I16 all pass (I17 pending item H)
ls packages/app/tests/fidelity/jsx-edited-idempotence.test.ts
ls packages/app/tests/fidelity/rawmdx-fallback-byte-identity.test.ts
ls packages/app/tests/fidelity/jsx-cross-path-consistency.test.ts
ls packages/app/tests/fidelity/jsx-nested-dirty.test.ts
```

### After item G (DOM env)

```bash
# Pre-flight spike smoke test passes
bun test packages/app/tests/dom/preload.test.ts
# Expect: a <Callout /> NodeView mounts and asserts textContent
```

### After items H-J (I17 + PF01 + PF02)

```bash
# Bun: ordinal/relative tests
bun run test:perf
# Expect: PF01 + PF02 + PF03 + PF05 + PF06 all pass (PF04 NOT-NOW)

# Playwright: absolute ms
bunx playwright test packages/app/tests/stress/component-blocks.perf.e2e.ts
# Expect: PF01 + PF02 absolute-ms assertions pass

# Fidelity completeness
bun run test:fidelity
# Expect: I1-I17 all pass
```

### Final scope-alignment sweep

```bash
# Every I12-I17 has a test file
for inv in I12:jsx-pristine-byte-identity I13:jsx-edited-idempotence I14:rawmdx-fallback-byte-identity I15:jsx-cross-path-consistency I16:jsx-nested-dirty I17:content-visibility-invariant; do
  name="${inv##*:}"
  test -f "packages/app/tests/fidelity/${name}.test.ts" || echo "MISSING: $inv"
done
# Expect: empty output

# Every PF0N has a test (except PF04)
grep -c "^\s*test(" packages/app/tests/stress/component-blocks.perf.test.ts
# Expect: ≥5
```

---

## Risks + open threads

1. **Pre-flight spike failure** — if happy-dom + React 19.2 + React Compiler don't compose in Bun test runtime, items H/I/J become permanently deferred. SPEC would need another [NOT NOW] update. Commits 1-2 and items A-F still have value as a standalone PR.

2. **React Compiler parity** — 20-min investigation inside the spike. Bun's default test runtime does not apply Babel transforms unless configured. If prod uses the Compiler and tests don't, render-count assertions will diverge. Fix: ensure `bunfig.toml` preload applies the Babel plugin (or verify via bun's integration with Vite's Babel pipeline).

3. **PBT seed stability** — use fixed seed 42 per established pattern (`invariant-i1.test.ts:34-50`). If any I13/I16 run is non-deterministic across seeds (42, 137, 2718 per `helpers.ts:50`), investigate before shipping.

4. **I14 fixture authorship** — 10 fresh malformed-MDX fixtures need care. Bad fixtures would hide regressions. Cross-reference `crash-taxonomy.json` categories for coverage; ensure the 10 fresh fixtures don't duplicate the 10 lifted ones.

5. **PR #165 review fatigue** — PR is already 82 files / +25k-ish. Adding ~1,000 more LOC on top of the merge commit could push reviewers past patience. If Miles or another reviewer pushes back, fallback: split items G-J into a second stacked PR.

6. **NG12 `expectedOutput` population** — the item-B step-2 loop (run test, capture output, commit) requires a human (or agent) to eyeball each of the 10 pinned outputs before committing. A blind "accept whatever came out" would silently pin bugs. Review each highlighted case in particular.

7. **I15 Observer B harness complexity** — the server-side Observer B test harness (`packages/server/src/server-observers.test.ts`) is complex. Make sure the reused test scaffolding in I15 correctly drains the observer debounce + handles scheduler DI.

8. **I17 novelty tax** — this is the first DOM-rendered PBT in the codebase. Expect ~1-2 days of harness-stabilization even after the spike passes. Property shrinking on DOM docs is non-trivial (fast-check's default shrinkers don't understand DOM).
