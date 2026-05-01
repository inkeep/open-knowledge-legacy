---
name: Test strategy — boundaries, tiers, and E2E budget
description: Composition-boundary mapping for FR-1 through FR-12, tier assignments, hermetic vs non-hermetic split, tracer-bullet sequence, edge-case enumeration, E2E test budget.
date: 2026-04-30
sources:
  - "/tdd skill methodology"
  - "SPEC.md §6 FR-1 through FR-12"
  - "evidence/q1-byte-preservation-matrix.md"
  - "evidence/q4-q6-q8-toclipboardhast-contract.md"
  - "evidence/q9-q10-q28-track-c-verify.md"
  - "evidence/q27-root-cause-analysis.md"
  - "Existing test infrastructure: packages/app/tests/integration/, packages/app/tests/fidelity/, packages/app/tests/stress/"
  - "CLAUDE.md '## Testing' conventions"
type: meta
---

# Test strategy

## Composition boundaries

Twelve composition boundaries the feature crosses. Eight are **hermetic** (in-process, deterministic, fast). Two are **non-hermetic** (real browser, cross-app destinations) — reserved for bug classes only those tiers reliably catch.

| # | Boundary | Hermetic? | Bug classes that live here |
|---|---|---|---|
| 1 | DOM clipboard event → dispatcher | yes | dispatcher branch-selection logic |
| 2 | Dispatcher → markdown parse path (FR-13 / B / E) | yes | mdManager.parse routing; descriptor identity preservation |
| 3 | Dispatcher → PM-native parseFromClipboard (Branch C) | yes | parseDOM rule matching; non-OK PM-editor interop |
| 4 | Dispatcher → htmlToMdast cleanup (Branch D) | yes | rehype plugin chain; vendor cleanup |
| 5 | Markdown → mdast → hast outbound pipeline | yes | mdast-to-hast handlers; toClipboardHast dispatch |
| 6 | mdast-to-hast handler dispatch site | yes | three-layer cascade (FR-6); descriptor lookup by name |
| 7 | PM tree → Y.XmlFragment commit (paste-side) | yes | bridge invariants under user-origin transactions |
| 8 | Y.XmlFragment ↔ Y.Text mirror | yes | not paste-specific but invariant must hold |
| 9 | PM schema parseDOM (FR-9 inbound round-trip via Branch C) | yes | data-attr matching; symmetric outbound shape |
| 10 | Cross-view (WYSIWYG ↔ Source) symmetry | yes | byte-identical text/plain + text/html across views |
| 11 | Browser-level clipboard MIMEs | **no** | real browser clipboard APIs; data-pm-slice auto-attach; cross-browser MIME survival |
| 12 | Cross-app destination rendering | **no** | Slack/Notion/Gmail/GitHub render fidelity; data-* stripping |

Boundaries 1-10 are the hermetic surface — narrow integration + unit cover them with full confidence. Boundaries 11-12 are E2E territory — keep minimal, only for bug classes nothing else catches.

## FR → tier mapping

| FR | Tier(s) | Why |
|---|---|---|
| FR-1: WYSIWYG dispatcher reorder (D5) | Unit + narrow integration + E2E | Branch-selection logic = unit. Full pipeline → PM tree assertion = integration. Real-browser clipboard = E2E (boundary 11). |
| FR-2: Source dispatcher symmetric reorder (D13) | Unit + narrow integration + E2E | Same as FR-1 for Source side. |
| FR-3: is-markdown.ts heuristic 5 signals (D8) | Unit + PBT | Pure compute — text → boolean. Adversarial corpus PBT for false-positive defense. |
| FR-4: is-markdown.ts raw-HTML-inline signal (D18) | Unit + PBT | Same as FR-3 — additional signal regex. |
| FR-5: toClipboardHast contract on JsxComponentMetaBase (D10) | Unit | TS contract enforcement — descriptor returns hast/null/throw → dispatch site behavior. |
| FR-6: Three-layer fallback cascade (D11) | Unit + narrow integration | Decision tree at dispatch site. Each layer transition is a unit test; full cascade verified by integration. |
| FR-7: Per-descriptor toClipboardHast — Callout / Accordion / GFMCallout / HtmlDetailsAccordion (D15) | Unit + narrow integration + E2E | Per-descriptor outputs = unit. Full markdownToHtml pipeline = integration. Cross-app render verification = E2E (boundary 12 — keep minimal). |
| FR-8: Telemetry contract (D12) | Unit | Capture telemetry events; assert event shape + bounded cardinality. |
| FR-9: jsxInline + rawMdxFallback outbound shape symmetry (D17) | Unit + narrow integration | Outbound emission = unit. Round-trip via Branch C parseDOM = integration. |
| FR-10: NG carve-out enumeration (D14) | PBT | Byte-identity property test that explicitly EXCLUDES NG1/NG3/NG9/NG10/NG11 normalizations from acceptance. |
| FR-11: D16 dist rebuild verification | Build hygiene + I19 PBT | One-time mechanical action (`bun run build`); I19 fidelity invariant 19/19 passing. |
| FR-12: Predecessor-spec corrigendum (D9) | Documentation-only | Not testable. Mechanical edit at finalize. |

## Test corpus organization

Following CLAUDE.md "## Testing" conventions:

```
packages/<pkg>/src/<file>.test.ts        — unit tests, co-located with source
packages/app/tests/integration/*.test.ts — narrow integration (real PM + real markdown pipeline)
packages/app/tests/fidelity/*.test.ts    — PBT + fidelity invariants (I1-I19+)
packages/app/tests/stress/*.e2e.ts       — Playwright E2E
```

**Test files this spec adds:**

| File | Tier | What it covers |
|---|---|---|
| `packages/app/src/editor/clipboard/is-markdown.test.ts` (extended) | Unit | FR-3 + FR-4 — 6 new signals + threshold formula + adversarial corpus |
| `packages/app/src/editor/clipboard/handle-paste.test.ts` (extended) | Unit | FR-1 — branch-selection logic with mocked clipboard data |
| `packages/app/src/editor/clipboard/source-clipboard.test.ts` (extended) | Unit | FR-2 — Source dispatcher branch-selection logic |
| `packages/core/src/registry/types.test.ts` (extended or new) | Unit | FR-5 — toClipboardHast TS contract |
| `packages/core/src/markdown/mdast-to-hast-handlers.test.ts` (extended) | Unit | FR-6 cascade + FR-9 outbound emission shape |
| `packages/core/src/registry/built-ins.test.ts` (extended or new) | Unit | FR-7 per-descriptor toClipboardHast outputs (Callout, Accordion, GFMCallout, HtmlDetailsAccordion) |
| `packages/app/src/editor/clipboard/instrument.test.ts` (extended) | Unit | FR-8 telemetry contract |
| `packages/app/tests/integration/clipboard-dispatcher-reorder.test.ts` (new) | Narrow integration | FR-1 + FR-2 full pipeline → PM tree assertion |
| `packages/app/tests/integration/toclipboardhast-cascade.test.ts` (new) | Narrow integration | FR-5 + FR-6 + FR-7 full markdownToHtml(md) → html assertion |
| `packages/app/tests/integration/cross-view-symmetry.test.ts` (extended or new) | Narrow integration | FR-7 + FR-9 cross-view byte-identity invariant |
| `packages/app/tests/fidelity/invariant-i19.test.ts` (existing) | PBT | FR-11 HtmlDetailsAccordion round-trip post-rebuild |
| `packages/app/tests/fidelity/invariant-i20-toclipboardhast.test.ts` (new) | PBT | FR-7 adversarial-attribute corpus (escape contract verification) |
| `packages/app/tests/fidelity/invariant-i21-byte-preservation.test.ts` (new) | PBT | FR-10 byte-identity modulo NG1/NG3/NG9/NG10/NG11 across J1-J4 |
| `packages/app/tests/stress/paste-fidelity.e2e.ts` (extended) | E2E | OK→OK paste preservation across descriptor matrix; cross-view symmetry; drag-and-drop |

## Hermetic-test scope

The narrow-integration tier carries most of the load. These tests:

1. Spin up a real markdown pipeline (`mdManager.parse` + `markdownToHtml`).
2. Spin up a real PM schema (TipTap + custom extensions).
3. Mock the DOM clipboard event with synthetic `DataTransfer` objects.
4. Assert the resulting PM tree, mdast tree, or HTML string by structural equality.
5. Optionally serialize back through the bridge to assert disk bytes.

No real browser, no real clipboard, no Hocuspocus, no real Y.Doc network sync. Deterministic, fast (~10-100ms each), parallelizable.

**Pattern (skeleton):**

```ts
test("FR-1: OK→OK paste of <img> JSX preserves descriptor identity", () => {
  const dt = createDataTransfer({
    "text/plain": '<img src="x.png" />',
    "text/html": '<img src="x.png" data-pm-slice="0 0">',
  });

  const view = createTestEditor({ schema: testSchema });
  const handler = createHandlePaste({ mdManager: createTestMdManager() });

  handler(view, { clipboardData: dt } as ClipboardEvent);

  const pmJson = view.state.doc.toJSON();
  expect(pmJson.content[0].type).toBe('jsxComponent');
  expect(pmJson.content[0].attrs.componentName).toBe('img');

  const md = mdManager.serialize(pmJson);
  expect(md).toBe('<img src="x.png" />\n');
});
```

This tests **boundary 1+2** in one shot — clipboard event → dispatcher → markdown parse path → PM tree → markdown serialize. No mocks of internal collaborators. Real markdown pipeline. Real PM schema. Real (synthesized) DataTransfer.

## E2E test budget — 10 tests

Following the /tdd "if I could only write 10 E2E tests" thought experiment. Each earns its slot by covering boundary 11 or 12 — bug classes only the real browser catches.

| # | E2E test | Boundary | What it catches |
|---|---|---|---|
| 1 | OK→OK paste `<img>` JSX in WYSIWYG (Cmd+C → Cmd+V) | 11 | data-pm-slice auto-attach by PM; FR-13-first dispatcher reorder works in real browser |
| 2 | OK→OK paste `<Callout>` JSX with title + body | 11 | toClipboardHast emits semantic HTML; D5 routes through text/plain → byte-preserving |
| 3 | OK→OK paste `<details>` HtmlDetailsAccordion source form | 11 | post-rebuild details-accordion-promoter fires in production parse path (FR-11) |
| 4 | `<u>foo</u>` cross-view round-trip (WYSIWYG ↔ Source) | 11 | D18 raw-HTML-inline heuristic catches single-line; bytes preserved cross-view |
| 5 | Cross-machine D4: paste raw `<Callout>` text from Slack-like source (text/plain only) | 11 | D8 heuristic JSX signals catch it; descriptor restored |
| 6 | Drag-out from OK → drop into adjacent app | 11 | PM dragstart fires same hooks; toClipboardHast applies on drag |
| 7 | Drag-in from external → OK | 11 | parseFromClipboard → handlePaste path same as Cmd+V |
| 8 | Internal drag (within OK editor) preserves slice | 11 | view.dragging.slice fast path bypasses dispatcher |
| 9 | Cross-PM-editor: Linear-style HTML paste into OK | 11 | text/plain markdown via FR-13-first preserves Linear's structure; non-mappable nodes silently drop (acceptable) |
| 10 | Pre-PR-310 capitalized `<Image caption=…>` paste (wildcard descriptor) | 11 | wildcard descriptor restoration via D5 (Q14) |

**E2E tests intentionally NOT written** (covered by lower tiers or unfit for E2E):

- ~~Cross-app render in real Slack/Notion/Gmail (boundary 12)~~ — Hermetic snapshot tests of the HTML output cover it; trust destinations do their part. Real-destination tests would be flaky and slow without proportional bug-catching.
- ~~Per-descriptor toClipboardHast output structure~~ — Unit + narrow integration tests cover it.
- ~~Heuristic signal correctness~~ — Unit + PBT cover it.
- ~~Telemetry event shape~~ — Unit covers it.
- ~~Bridge invariants under paste~~ — Existing bridge invariant tests cover the broader contract.

## Property-based test (PBT) coverage

Beyond the 6 unit + 4 narrow integration test files, three new PBTs lock invariants:

**I20 — toClipboardHast adversarial-attribute corpus** (FR-7 escape contract).
- Property: for any descriptor with `toClipboardHast` defined, given an adversarial input (e.g., `<script>alert(1)</script>` in Callout title, `javascript:` in img src, U+E000-U+E004 PUA bytes anywhere), the emitted hast contains no unescaped `<script>` substring AND no dangerous URL scheme survives.
- Coverage: 10K samples; per-descriptor (Callout, Accordion, GFMCallout, HtmlDetailsAccordion).
- Existing precedent: similar pattern at `mdast-to-html.test.ts:92-99` for FR-20.

**I21 — Byte-preservation modulo NG carve-outs** (FR-10).
- Property: for any disk markdown bytes B containing only canonical/compat OK constructs, `paste(copy(parse(B))) === normalize(B, NG_excluded)` where `normalize` applies only the NG1/NG3/NG9/NG10/NG11 transformations (parameterized).
- Coverage: 10K samples; J1-J3 sources (excluding J4 rich-HTML which is best-effort by design).
- Failure mode caught: any clipboard-introduced lossy normalization beyond NG1-NG11.

**Existing I19 — HtmlDetailsAccordion round-trip** (FR-11).
- Already exists; 19/19 passing post-rebuild verified.

## Tracer-bullet implementation sequence

Vertical slices, one tracer bullet at a time. Each slice is `RED → GREEN`:

1. **Tracer 1: FR-3 + FR-4 heuristic.** Pure unit. Adds 6 signals. PBT corpus passes. Smallest possible slice.
2. **Tracer 2: FR-1 dispatcher reorder.** Narrow integration. Move FR-13 ahead of Branch C in `handle-paste.ts`. Single integration test: OK→OK `<img>` paste preserves descriptor → fail before reorder, pass after.
3. **Tracer 3: FR-5 contract.** Unit. Add `toClipboardHast?` to `JsxComponentMetaBase`. Test with mock descriptor.
4. **Tracer 4: FR-6 cascade.** Unit + narrow integration. Add cascade in `mdxJsxFlowHandler`/`mdxJsxTextHandler`. Three transitions: descriptor returns hast → emit; descriptor returns null → cascade; descriptor throws → telemetry + cascade.
5. **Tracer 5: FR-7 Callout (canonical).** Unit + narrow integration. Implement `Callout.toClipboardHast`. Test outputs against fixture.
6. **Tracer 6: FR-7 Accordion (canonical).** Same pattern.
7. **Tracer 7: FR-7 GFMCallout (compat).** Narrow integration. Verify `callout-transformer.ts` re-promotion lets dispatch site invoke `GFMCallout.toClipboardHast`. Outputs match GitHub markdown-alert convention.
8. **Tracer 8: FR-7 HtmlDetailsAccordion (compat).** Same pattern. **Pre-flight: `bun run build` in `packages/core` (FR-11).**
9. **Tracer 9: FR-2 Source dispatcher reorder.** Narrow integration. Same as Tracer 2 for Source side.
10. **Tracer 10: FR-9 jsxInline + rawMdxFallback symmetry.** Unit + narrow integration. Outbound emits BOTH class + data-attr.
11. **Tracer 11: FR-8 telemetry contract.** Unit.
12. **Tracer 12: I20 + I21 PBTs.** Property-based.
13. **Tracer 13: 10 E2E tests.** Sequenced post-implementation; written one at a time.
14. **Tracer 14: FR-12 predecessor corrigendum.** Mechanical edit.

Total: ~14 tracer-bullet cycles. Each `RED → GREEN` should take 30 minutes to a few hours.

## Edge cases — explicit enumeration

Per /tdd "explicit enumeration" rule. For each FR, what are the boundary cases that need test coverage?

**FR-3 + FR-4 heuristic:**
- Empty string → false (no signals).
- Single-line plain prose → false.
- Single-line `<img src="x.png" />` → true (lowercase JSX-with-attr matches).
- Single-line `<Callout type="note">body</Callout>` → true (capitalized JSX matches).
- Single-line `Some <u>foo</u> text` → true (raw-HTML-inline matches).
- Multi-line plain prose with `**incidental** *stars*` → false on short input (1 signal, threshold ≥1 returns true... wait, that's a false positive).
  - Actually with `Math.max(1, threshold)` floor, single signal triggers. Need to verify A2 (threshold formula) doesn't over-fire. Adversarial test: paragraph with one bold word.
- Plain prose containing `1.` (numbered-list marker) → check threshold scales with line count to avoid over-firing.
- Multi-line markdown with 5+ signals → true.

**FR-1 + FR-2 dispatcher:**
- No clipboard data → no-op, return false.
- Only text/plain → Branch E.
- Only text/html → Branch D.
- Both, plain looks like markdown → FR-13 (post-reorder).
- Both, plain doesn't look like markdown, html has data-pm-slice → Branch C.
- Both, plain doesn't look like markdown, html doesn't have data-pm-slice → Branch D.
- vscode-editor-data MIME → Branch A.
- text/x-gfm MIME → Branch B.
- Cmd+Shift+V (escape hatch) → verbatim plaintext.
- Cursor in codeBlock → verbatim plaintext.
- Empty selection on copy → no clipboard write.

**FR-7 per-descriptor:**
- Callout: 5 GFM types (note/tip/important/warning/caution) + invalid type (clamp to 'note'). Title with adversarial chars (`<script>`, `&`, `"`, ` `). Empty body.
- Accordion: open=true / open=false / open absent. name="" + multiple in same doc with same name. Adversarial title/description.
- GFMCallout: same 5 types. Multi-line body. Nested blockquotes inside body.
- HtmlDetailsAccordion: nested `<details>` (rare but possible). Empty summary. Attributes other than `open`/`name`/`id`.

**FR-9 jsxInline + rawMdxFallback symmetry:**
- jsxInline outbound emits both `class="mdx-inline"` AND `data-jsx-inline=""`.
- rawMdxFallback outbound emits both `class="mdx-fallback"` AND `data-raw-mdx-fallback=""`.
- Cross-app destination strips data-* — class survives — verify by snapshot.
- Branch C inbound parseDOM matches — verify by integration test.

**Cross-view symmetry:**
- WYSIWYG vs Source view of the same doc → byte-identical text/plain on copy.
- Same selection in both views → byte-identical text/html on copy (modulo data-pm-slice value differences which are slice-shape-dependent).

**Bridge invariants under paste:**
- Single-CRDT user-origin transaction.
- No `paired:true` marker.
- No OBSERVER_SYNC_ORIGIN.
- Y.UndoManager attribution preserved through paste.

**Drag-and-drop:**
- Drag-out: PM dragstart fires same hooks as copy. Drag dataTransfer carries text/plain + text/html.
- Drag-in: parseFromClipboard fires same dispatcher.
- Internal drag: view.dragging.slice fast path; dispatcher not invoked.

**Activity-hidden:**
- Editor in Activity-hidden subtree may be destroyed; clipboard handlers fire on active view only.
- Race: paste in-flight when Activity flips hidden? — Should not crash; verify defensive null checks.

## Coverage matrix vs Q1 byte-preservation matrix

The Q1 audit at `evidence/q1-byte-preservation-matrix.md` enumerated 36 cells. The test plan covers them as follows:

| Q1 cells | Test tier |
|---|---|
| J1.A.1-12 (WYSIWYG ↔ WYSIWYG OK→OK) | Narrow integration + 5 of 10 E2E tests |
| J1.B/C/D (cross-view) | Cross-view symmetry narrow integration + 1 of 10 E2E tests |
| J3.1-12 (markdown-canonical sources) | Narrow integration with synthesized DataTransfer per source signature |
| J4.1-8 (rich-HTML sources) | Existing 9-vendor cleanup plugin tests cover (no new tests needed unless regression) |

Every Q1 cell maps to at least one test in the plan. No cell is uncovered.

## Hermetic-test discipline

- **Real dependencies inside the test process.** Real markdown pipeline, real PM schema, real registry. Not mocks of internal collaborators.
- **Synthesize external boundaries.** DataTransfer mocks for clipboard events. No real browser.
- **Per-test unique data.** No shared fixture state — each test creates its own doc, slice, clipboard payload.
- **Deterministic.** No `setTimeout`, no `sleep`, no real-time waits. If async behavior matters, use the existing event-driven harness (`awaitDocQuiescence`, etc., per CLAUDE.md "Integration harness").

## Non-hermetic test discipline (E2E only)

- Each Playwright test creates its own unique doc via `POST /api/create-page` (per CLAUDE.md STOP rule "do not hardcode `'test-doc'` in Playwright tests").
- Seed via `POST /api/agent-write-md` with explicit `docName` + `position: 'replace'`.
- `failOnFlakyTests: false` per CLAUDE.md (PR tier); persistent-flake detection via nightly.
- Use `getByRole` / `getByLabelText` / `data-*` attributes, not CSS selectors.
- Auto-waiting selectors over fixed-duration waits.

## Implementation order summary

```
Pre-implementation:
  1. Run `bun run build` in packages/core (FR-11 dist rebuild — unblocks I19)

Tracer cycles 1-12 (TDD):
  ...as enumerated above

Tracer 13: E2E harness extension
  Extend paste-fidelity.e2e.ts with 10 new test cases (one per E2E budget item)

Tracer 14: Predecessor corrigendum (FR-12)
  Mechanical edit at finalize
```

## Open test-strategy questions

- **Q31:** Do we need a regression test for the Q29 stale-dist class of bug? E.g., a CI step that asserts `dist/index.mjs` mtime ≥ source mtime? — DEFERRED to Q29 Future Work.
- **Q32:** Should the cross-app rendering verification (boundary 12) be done via snapshot tests of HTML strings, or via a real-Slack/Notion/Gmail E2E harness? — Recommendation: snapshot. Real destinations are too flaky and slow. Trust the HTML output is what destinations render.
- **Q33:** Should I20/I21 PBTs run at PR tier or nightly? — PR tier at default 1K samples; nightly at 10K samples. Matches existing fidelity invariant tier discipline (CLAUDE.md "## Testing").

## Confidence assessment

With this plan executed:
- **HIGH confidence** on FR-1 through FR-10 — narrow integration covers the composition-boundary surface with minimal mocks.
- **HIGH confidence** on FR-11 — I19 + post-rebuild verification.
- **HIGH confidence** on cross-view symmetry, byte-identity round-trip, descriptor identity preservation.
- **MEDIUM confidence** on cross-app destination rendering (boundary 12) — snapshot tests; real destinations not exercised.
- **MEDIUM confidence** on edge cases not enumerated above (long-tail) — PBT 10K samples catch most; some adversarial inputs may slip.
- **LOW** confidence on Activity-hidden race conditions — single-test coverage; would benefit from chaos-test extension if it becomes a recurring source of bugs.

The MEDIUM-on-cross-app and LOW-on-Activity-hidden are honest acknowledgments. Cross-app render verification is genuinely outside the test budget; chaos testing for editor-teardown races is a future concern.
