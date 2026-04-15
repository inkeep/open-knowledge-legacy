# MDX Tolerant Parsing — Spec

**Status:** Ready for Implementation
**Owner(s):** Nick, Mike (spec contributor via PR #105)
**Last updated:** 2026-04-13
**Baseline commit:** db8a6d6 (rebased 2026-04-14; prior baseline 06e29bb)
**Links:**
- Prior art: [reports/tinacms-production-architecture-beyond-mdx/](../../reports/tinacms-production-architecture-beyond-mdx/REPORT.md) (D2 invalid_markdown, D6 dual-parser)
- Prior art: [reports/mdx-crdt-roundtrip-fidelity/](../../reports/mdx-crdt-roundtrip-fidelity/REPORT.md) (23 edge cases, 22 converging)
- Mike's draft: `specs/2026-04-13-markdown-mdx-tolerant-parsing/SPEC.md` — on branch PR #105, not merged; load-bearing content inlined in §16
- Predecessor: [specs/2026-04-12-remark-prosemirror-migration/](../2026-04-12-remark-prosemirror-migration/SPEC.md) (§17.2 jsxInline, R8, R23)
- Downstream: [specs/2026-04-08-typed-component-nodes/](../2026-04-08-typed-component-nodes/SPEC.md) (T1 Layer 2/3, needs re-spec against remark-mdx)
- Evidence: [evidence/y-prosemirror-failure-modes.md](evidence/y-prosemirror-failure-modes.md), [evidence/crash-taxonomy.md](evidence/crash-taxonomy.md), [evidence/P3-source-trace.md](evidence/P3-source-trace.md), [evidence/observability-pattern.md](evidence/observability-pattern.md)
- Meta: [meta/audit-findings.md](meta/audit-findings.md), [meta/design-challenge.md](meta/design-challenge.md), [meta/self-audit-final.md](meta/self-audit-final.md)

---

## 1) Problem statement

- **Who is affected:** Every user who opens a markdown file. PROJECT.md, ARCHITECTURE.md, and any "bring your own markdown" file that contains ordinary prose with `<`, `{`, or `:` characters — plus users authoring MDX components who hit any of the 26 residual crash classes catalogued in `evidence/crash-taxonomy.md`.
- **What pain:** Documents containing common prose patterns (`<50ms`, `{ noServer: true }`, `1:1s in a table`, `a < b`) and common MDX authoring errors (`<Callout>...</Calout>` tag mismatch, `<Foo attr=` mid-type) fail to load or collapse to unstructured text. Before PR #101, this meant blank documents. After PR #101, this means whole-document raw-text fallback (readable but unstructured — all headings, tables, formatting lost).
- **Why now:** Three converging signals:
  1. **Post-migration regressions** (PR #83 → #95 → #101): the remark-prosemirror migration introduced remark-mdx globally, surfacing prose-vs-MDX collisions that the old `marked` parser tolerated silently.
  2. **Growing guard complexity**: the R23 guard is ~300 lines of pattern-specific rules. I9/I11 PBT at 10K stress found and fixed 5 bugs in the guard itself. The guard works but its maintenance trajectory is a special-case treadmill.
  3. **Crash-taxonomy grounding**: `evidence/crash-taxonomy.md` enumerates 26 throw sites that survive R23 + agnostic mode. The dominant real-world failure — tag mismatch `<Foo>...</Bar>` — throws at mdast-build finalization and **cannot** be pre-empted by a pre-parse guard.

### What the product vision says

> **"One editor handles BOTH .md and .mdx."** (PROJECT.md:70, TQ3)
> **"Markdown-canonical storage; raw content passes through unchanged."** (AGENTS.md:531)
> **"Bring your own markdown files."** (ARCHITECTURE.md:31, U2)
> **"MDX scope is narrow: ~20 predefined components, simple props, no imports/expressions in real content."** (PROJECT.md:110, TQ27)

These create the design tension Mike correctly identified. The current parser resolves this tension the wrong way: it treats ALL `<` and `{` as potential MDX and validates expression content with acorn. The correct resolution: **markdown-first, MDX-tolerant** — prose is safe by default, recognized component patterns upgrade to structured nodes, and unrecoverable failures degrade per-block rather than collapsing the document.

---

## 2) Goals

- **G1.** No document ever loads blank or as unstructured raw text due to MDX parse failure.
- **G2.** Valid MDX components continue parsing as structured nodes with byte-identical round-trip for **unedited** MDX. Edits follow the source-mode → Observer B → re-parse path; `sourceRaw` is refreshed on every parse, so serialization always reflects the current authored source.
- **G3.** Replace the guard-based special-case treadmill with a parser configuration that is tolerant by default.
- **G4.** Inline MDX (`<Icon />` within a paragraph) renders inline, not as a block break.
- **G5.** When parse failure cannot be avoided, the editor degrades **per-block**, preserving surrounding structure, with a visible user-facing signal.
- **G6.** CRDT schema evolution is safe end-to-end: no silent data loss from `schema.node()` throws; additivity invariant enforced in CI.

---

## 3) Non-goals

- **NG1.** Full MDX language support (imports, exports, expression evaluation). Product scope per TQ27. Imports/exports/expression evaluation belong to a future "strict MDX mode" opt-in (§15).
- **NG2.** Changing the CRDT layer, observer bridge, or persistence architecture.
- **NG3.** Typed component editing (prop panels, editable children). That's the typed-component-nodes spec (T1, needs re-spec).
- **NG4.** Lint-time or publish-time MDX validation. Tolerant loading is about the editor; strict validation belongs to a lint/CI surface.
- **NG5.** Auto-repair of broken MDX. We render what we can parse; broken regions degrade with a clear "go to source mode to fix" affordance.
- **NG6.** MDX directives (`:::container`, `::leaf`, `:text`) as an alternative syntax to MDX components. **Product stance:** authors use `<Note>...</Note>` / `<Callout>...</Callout>` (MDX component syntax), not `:::note` / `:::callout` (directive syntax). Directive syntax renders as literal text under agnostic mode (per D14 removal of `remark-directive`). External files from ecosystems using directive syntax (Docusaurus admonitions, MyST, Quarto) can be migrated via a one-line find/replace. If product demand emerges for directive syntax, re-add `remark-directive` in a follow-up spec.

---

## 4) Personas

- **P1: Bring-your-own-markdown user.** Opens existing `.md` files with prose containing `<50ms`, `{ config }`, `a < b`. Expects content to render correctly.
- **P2: MDX component author.** Uses `<Callout>`, `<Tabs>`, `<Chart data={values} />`. Expects components to remain structured and round-trip byte-identically.
- **P3: Mid-type author.** Types `<Callou` and pauses to think. Document must not collapse. Finishes typing `t>content</Callout>` — document reflows to structured.
- **P4: Pipeline maintainer.** Needs a testable, documented parser contract instead of spelunking ad-hoc guard rules.

---

## 5) User journeys

- **P1 happy path:** Open PROJECT.md. All headings, tables, paragraphs render structured. Prose containing `{ noServer: true }` and `<50ms` renders as literal text.
- **P2 happy path:** Open a file with `<Callout type="warning">Important</Callout>`. Round-trips byte-identically.
- **P2 inline:** Text with `<Icon name="check" />` mid-paragraph. Renders inline (not as a block break).
- **P3 mid-type recovery (server path — persistence, agent-write, rollback):** File contains mid-type `<Callou`. `parseSafe`/`parseWithFallback` fires R6: the enclosing block becomes a `rawMdxFallback` with dashed-border + "raw" badge. Surrounding structure preserved. When the file is later saved with completed `<Callout>content</Callout>`, R6 no longer fires; structured Callout renders.
- **P3 mid-type recovery (client path — Observer B, live editing):** User types `<Callou` in source mode. Y.Text changes. Observer B tries to parse — fails. Observer B preserves the **last valid XmlFragment state** (no rawMdxFallback; no visual jitter). User sees the previous valid WYSIWYG state frozen while they type. User completes `t>content</Callout>` — Observer B parses successfully, XmlFragment updates, structured Callout appears. **This freeze-on-failure is intentional** — flashing rawMdxFallback on every 300ms debounce during typing would be visually disruptive. Source mode (CodeMirror) always shows the live content regardless of parse success.
- **P1/P2 failure/recovery:** File contains tag-mismatch (`<Foo>...</Bar>`) or unclosed attribute. The specific block degrades to `rawMdxFallback` with indicator. User clicks the badge → source mode opens scrolled to that region. User fixes. Switch back — block re-parses to structured.
- **Multi-client:** User A is fixing a broken region in source mode. User B is reading the same document in WYSIWYG. Observer B on User A's keystrokes propagates via Y.Doc sync. User B sees the rawMdxFallback region with the badge; when User A fixes it, User B's view reflows. User B's cursor position in other parts of the document is preserved.

### rawMdxFallback → valid state transition (explicit pathway)

When a document has a `rawMdxFallback` node (from server-side R6 on load, or from R13 patch substitution) and the user fixes the broken MDX in source mode:

1. **User types the fix** in CodeMirror → Y.Text changes via `y-codemirror.next` binding
2. **Observer B fires** on the Y.Text change
3. **Observer B calls `parse()`** (not `parseWithFallback` — freeze-on-failure is the live-typing UX, see R6 caller list)
4. **If `parse()` succeeds** (user completed the fix): Observer B produces a new PM tree with structured nodes; the old `rawMdxFallback` at that position is replaced via `updateYFragment`'s recurse-and-replace path. Badge disappears; structured content renders.
5. **If `parse()` fails** (user still mid-type): Observer B preserves the last valid XmlFragment state (which still has the `rawMdxFallback`). No visual jitter.

This works without giving Observer B an R6 path because `rawMdxFallback` is just a registered PM node — when structure succeeds, the diff algorithm replaces it with the new structured nodes naturally. No special "dissolve fallback" logic needed. M9 E2E test verifies this transition end-to-end.

---

## 6) Requirements

### Functional

| # | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| **R1** | Must | Agnostic MDX mode on **both** parse and serialize paths | Replace `remark-mdx` at `pipeline.ts:114` AND `pipeline.ts:142` with `remarkMdxAgnostic` (wraps `micromark-extension-mdx` + `mdxFromMarkdown` + `mdxToMarkdown`). Eliminates 4 acorn-specific throws. `{ noServer: true }`, `{ count + 1 }`, `{ any prose with balanced braces }` no longer crash. Valid JSX tags still parse. ESM `import`/`export` re-parses as prose (per NG1). |
| **R2** | Must | Retain R23 guard for `<`/`{` patterns | Agnostic mode doesn't change JSX tag commit behavior. R23 guard remains unchanged for bare `<` patterns and unmatched `{`. I9/I11 PBT must pass at 10K stress. |
| **R3** | Must | `jsxInline` PM node as `atom: false, content: 'inline*'` (Layer 3 target shape, read-only in WYSIWYG until T1) | Inline node for `mdxJsxTextElement`. Children populated from `mdxJsxTextElement.children` (already parsed by remark-mdx). No atom→non-atom migration ever needed — ships at T1 Layer 3 target shape from day one. `isolating: true` + `selectable: true`. **NodeView renders with `contenteditable: false`** (same pattern as R5 rawMdxFallback) — children render inline for visual fidelity but are NOT editable in WYSIWYG. Edits route through source mode → Y.Text → Observer B → fresh parse → new jsxInline with refreshed `sourceRaw`. **`sourceRaw` is canonical for serialization**; structured `attributes` are derived at parse time, never independently mutated. This transitional behavior (read-only children, source-mode-only edits) holds until T1 Layer 3 adds structured-editing UI + serialization. Closes migration spec §17.2 gap. |
| **R4** | Must | Simplify `parseSafe` + remove dead handlers + remove `remark-directive` | (a) Remove the `{` brace-retry tier from `parseSafe` (agnostic mode makes balanced braces always succeed — dead path). (b) Remove `handlers.mdxjsEsm` at `index.ts:447` (agnostic mode never produces `mdxjsEsm` nodes — ESM becomes prose). (c) **Remove `remark-directive` from `pipeline.ts:26` (parse) AND `pipeline.ts:143` (serialize)** + drop `containerDirective`/`leafDirective`/`textDirective` handlers at `index.ts:453-461` + drop directive cases in `position-slice.ts:192-194` + drop directive type imports. Reverses prior decision (migration spec D12) per D14 — directives are unused, produce identical PM output to MDX components, and cause the Q2 `:textDirective` crash class. `parseSafe` becomes: try parse → whole-doc raw text fallback (surfaced via R14 observability counter). |
| **R5** | Must | `rawMdxFallback` PM node (content-based shape) | New block node type. `group:'block', content:'text*', atom:false, isolating:true, selectable:true, defining:true`. Inner text node holds raw source. NodeView renders read-only (`contenteditable: false`). Content-based shape provides: (1) char-level Y.Text CRDT merge on concurrent edits to the same broken region, (2) finer undo granularity, (3) smaller sync messages, (4) consistency with R3 jsxInline pattern. See `evidence/P3-source-trace.md` + `evidence/y-prosemirror-failure-modes.md` Finding 5. Used by R6 block-level fallback AND by R13 patch for block-context schema throws. |
| **R6** | Must | Block-level fallback via split-then-rejoin | On parse failure with position info, split source at enclosing block boundary (MDX-aware for paired tags), replace failing block with `rawMdxFallback`, parse halves, merge. See §9 for algorithm. Handles 26 residual crash classes per `evidence/crash-taxonomy.md`. **Catch placement:** wraps the entire mdast→PM materialization chain (parser AND `remark-prosemirror` PM construction). **Callers:** `parseSafe` (server persistence + agent-sessions), **rollback endpoint** (`api-extension.ts:1414`, currently uses throwing `parse()` — must migrate to `parseWithFallback` so rollback to historical broken MDX degrades gracefully, not HTTP 500), and `external-change.ts:39` (currently throws + error swallowed; migrate to `parseWithFallback` so disk→CRDT bridge gets degraded content, not stale Y.Doc). **NOT Observer B** — Observer B's current "parse-or-freeze" behavior (catch error, preserve last valid XmlFragment) is intentional for live-typing UX and remains unchanged (see §5 P3 journey note). |
| **R7** | Must | Fallback visual indicator + source-mode CTA | WYSIWYG: dashed border + "raw" badge + hover tooltip "Parse failed — open source mode." Click → CodeMirror source opens scrolled to the fallback region. `contenteditable: false` on the raw region prevents WYSIWYG edits. |
| **R8** | Must | Unknown-mdast-type catch-all | mdast handlers that aren't registered map to safe PM nodes instead of throwing during PM materialization: block-level unknown types (`math` block, `footnoteDefinition`) → `rawMdxFallback { inner text: sourceRaw }`; inline-level unknown types (`inlineMath`, `footnoteReference`) → plain `text` node with sourceRaw. Prevents whole-doc parse failure when remark-gfm (already in pipeline) produces footnote/math nodes. |
| **R9** | Must | `isolating: true` on jsxComponent, jsxInline, rawMdxFallback | Correct PM default for opaque nodes. Meaningful for `jsxInline` (non-atom after R3) — prevents cursor escape on backspace into adjacent inline content. Marginal on current-atom jsxComponent (`prosemirror-commands/joinBackward:69` handles atoms via `before.isAtom` fallback) but cheap and correct. |
| **R10** | Must | Schema add-only invariant + enforcement test | **Invariant:** all schema attrs have `default` values; attrs are add-only forever (never renamed, never removed, never have `validate` narrowed); node types are add-only; content expressions never narrow. **Enforcement:** `packages/core/src/schema-invariant.test.ts` snapshot test captures current attr names + defaults + content expressions. CI fails on any narrowing change. Rationale: y-prosemirror destructively deletes `Y.Item`s whose `schema.node()` throws. Narrowing = silent multi-peer data loss. |
| **R11** | Must | Reference-definition hoisting across R6 splits | When R6 splits source at a fallback boundary, extract top-level `[label]: url` definitions from the first half and prepend to second-half source before reparsing. Prevents silent dangling-link regression. Excludes ref-def-looking lines inside code blocks. |
| **R12** | Must | All existing tests pass + new mid-type recovery E2E | Guard tests (81 cases), I8/I9/I10/I11 PBT at 1K default + 10K stress, fidelity suite (799 tests), bridge matrix, conversion fidelity, stress shards, playwright — all pass. Round-trip byte-identity preserved. New: `packages/app/tests/stress/mid-type-recovery.e2e.ts` Playwright test scripting character-by-character typing of `<Callout>...content...</Callout>`, asserting (a) surrounding heading/paragraph structure unchanged throughout, (b) broken region shows rawMdxFallback with R7 chrome during transient states, (c) structured Callout on completion. |
| **R13** | Must | `y-prosemirror` patch: schema-throw fallback substitution | `patches/y-prosemirror@1.3.7.patch` replaces destructive-delete paths at `sync-plugin.js:~801` (element) and `:~834` (text). Patch body: on `schema.node()` or `schema.text()` throw, if the failing node is block-context, substitute `rawMdxFallback` carrying `reason` attr and `el.nodeName` as inner text; if inline-context, log + `mapping.delete(el)` + `return null` (skip without destructive delete). Defensive fallthrough to original behavior only if substitution itself throws. **Cascade-aware:** when a failed node's `null` return propagates upward, the parent's content expression may then fail validation, triggering ANOTHER catch — patch must handle this by ensuring the substituted `rawMdxFallback` satisfies common parent content expressions (block-context fallbacks satisfy `block+`, etc.). Integration test (Q6): seed Y.Doc with known-invalid node shapes (unsupported attr, unknown node type, invalid content) AND parent-cascade scenarios (invalid child causing parent content-expression violation); verify (a) block-context renders fallback, (b) inline-context renders gap with console warn, (c) update stream contains NO `_item.delete` origin'd by `ySyncPluginKey`, (d) no render crash, (e) cascade scenarios don't degenerate to destructive delete via fallthrough. Applied via `patchedDependencies` in package.json; fails loud if upstream refactor invalidates. |
| **R14** | Must | Observability: structured stderr + aggregate counters | **Two channels, clean separation of concerns.** (a) **Structured `console.warn`** at each event site: R6 fire emits `{ event: 'mdx-block-fallback', docName, offset, reason }`; R13 fire emits `{ event: 'yprosemirror-schema-throw', nodeName, reason, cascade: boolean }`; `parseSafe` whole-doc fallback emits `{ event: 'mdx-whole-doc-fallback', docName, reason }`. Shape matches the conventional dev-tool stderr-JSON pattern (Outline's `Logger.error(category, message, extra)`; Biome/esbuild structured diagnostics). (b) **Aggregate counters** in `packages/core/src/metrics/parse-health.ts`: `parseFallback.{blockLevel, wholeDoc}`, `ypsMismatch.{block, inline}`. Exposed via `GET /api/metrics/parse-health` for tests + optional ops dashboarding. **Deliberately NOT a `Y.Map` per-doc event log** — parse events don't need CRDT convergence (each client re-parses independently and arrives at the same result), and writing them into Y.Doc would monotonically grow document state with a schema commitment that's harder to evolve than memory counters. Principled cut: Y.Doc holds document content; server memory holds operational counters; stderr holds developer-facing warnings. ~25 LoC total. |

### Non-functional

- **Performance:** Agnostic mode removes acorn — measurable parse speedup. R6's worst case is O(n · k) where k ≤ MAX_SPLIT_DEPTH = 20. Typical documents: single-digit ms overhead only on parse failure, zero on success path.
- **Reliability:** Five invariants: (R10) schema add-only; (R6) block-level fallback on parse failure; (R5) Y.Item identity preservation via content-based shape; (R13) schema-throw neutralization; (R8) catch-all for unknown mdast types.
- **Security:** No change to NG4 storage-layer contract. Raw content passes through unchanged. `rawMdxFallback` stores raw bytes in an inner text node and renders with `contenteditable: false` — XSS mitigation remains a render-layer concern (docs site DOMPurify).
- **Backward compatibility:** Existing valid MDX round-trips byte-identically. Existing `.md` with prose gains correctness. Existing ESM in content re-parses as prose (acceptable per NG1).
- **CRDT integrity:** `y-prosemirror@1.3.7` + R13 patch. Not pinned for behavior reasons; pinned because the R13 patch is verified against 1.3.7 source. Upgrade re-ports the patch + re-runs Q6 verification test.

---

## 7) Success metrics

- **M1:** PROJECT.md, AGENTS.md, ARCHITECTURE.md load with full structured content through production parse path.
- **M2:** Zero `parseSafe` whole-doc fallbacks on the project's own markdown files (everything either parses clean or degrades via R6 block-level).
- **M3:** I9 guard completeness PBT passes at 10K runs.
- **M4:** I11 guard precision PBT passes at 10K runs.
- **M5:** The MDX round-trip corpus retains byte-identity under agnostic mode. Baseline is `packages/app/tests/fidelity/mdx-roundtrip.test.ts` at the rebase-target HEAD (count fluctuates as the corpus grows — `a40ee65` added 2 image-inline fidelity cases; current count on origin/main is 21, may grow before merge). Verification: run the suite post-R1 and confirm 100% pass + byte-identity against pre-R1 output on all cases. The 1 known-divergent case per NG10 (`---` at doc start) remains divergent by design.
- **M6:** Crash-class coverage probe (pre-merge gate). Run agnostic + R23 + R6 against `evidence/crash-taxonomy.md`'s 26-class corpus + fumadocs fixtures + agents-docs real MDX + PROJECT.md git-history crash samples. Write `evidence/crash-class-coverage.md` with per-class pass rate. Target: ≥95% of residual crash classes degrade gracefully via R6 (preserved surrounding structure); 100% of PROJECT.md historical crashes pass.
- **M7:** R10 enforcement test in CI. Adding an attr without `default`, renaming, or removing a node type fails the gate before merge.
- **M8:** Multi-client Y.Item identity test. Two clients connected; A edits inside an active `rawMdxFallback` region character-by-character; B's WYSIWYG cursor stays in place in a non-fallback paragraph.
- **M9:** P3 mid-type recovery E2E test (R12). Scripted keystroke sequence through `<Callout>...</Callout>`; surrounding structure stable at every intermediate state.

---

## 8) Current state

### What exists today (after PR #83 + #95 + #101)

```
pipeline.ts (parse):
  remarkParse → remarkFrontmatter → remarkMdx (STRICT, acorn) →
  remarkDirective → remarkGfm → remarkWikiLink →
  [R23 guard: protectFromMdx / restoreFromMdx] →
  autolinkPromotion → docStartThematicFix → positionSlice →
  ensureNonEmptyDoc → remarkProseMirror

pipeline.ts (serialize):
  fromProseMirror → remarkFrontmatter → remarkGfm → remarkMdx (STRICT, acorn) →
  remarkDirective → remarkStringify
```

- **R23 guard** (`autolink-void-html-guard.ts`, 301 lines): Five PUA sentinels (U+E000–E004). Proven complete by I9 PBT at 10K and precise by I11 PBT.
- **`parseSafe()`** (`index.ts:122-139`): Three-tier fallback. Used by server persistence + agent-sessions.
- **Observer B** (`observers.ts:342+`): Catches SyntaxError, VFileMessage, RangeError during live editing.
- **jsxComponent**: Block atom, single `content: string` attr.

### What breaks today

Per `evidence/crash-taxonomy.md`:

| Input | Error | Root cause |
|---|---|---|
| `{ noServer: true }` in prose | VFileMessage: acorn parse failure | acorn rejects labeled statement |
| `1:1s` in table cell | RangeError: Invalid content for node | remark-directive claims `:1s` |
| `<50ms` in prose | VFileMessage: Unexpected character | JSX tokenizer commits on `<5`, crashes on `0` |
| `<Foo>...</Bar>` | VFileMessage: end-tag mismatch (`mdast-util-mdx-jsx:403`) | Tree-build finalization detects name mismatch |
| `<Callou` (mid-type) | VFileMessage: dangling tag at EOF (`:458,478`) | Unclosed flow element |
| `<Foo a=>` | VFileMessage: bad before-attr-value (`factory-tag:627`) | Expected attr value |
| `<Foo a="unclosed` | VFileMessage: mismatched quote (`:658`) | Attr value never closes |
| `text <Icon /> more` | Block break in WYSIWYG | `mdxJsxTextElement` maps to block `jsxComponent`; main's paragraph handler at `index.ts:181-195` lifts the block child out as a sibling (a general block-in-paragraph workaround also used for standalone images per `a40ee65`). This avoids the schema-violation crash but still renders the inline `<Icon />` as a block break, not inline. R3 eliminates this case properly by mapping `mdxJsxTextElement` to the inline `jsxInline` node. The lift-logic remains as a safety net for other block-in-paragraph cases (standalone images, future cases). |

### What the ecosystem offers

| Approach | Production evidence | Solves `<` crashes | Solves `{` crashes | Solves tag mismatch |
|---|---|---|---|---|
| Agnostic MDX (`micromark-extension-mdx`) | Official micromark package | No | **Yes (balanced)** | No |
| PUA guard (our R23) | Production | **Yes (most classes)** | Unmatched only | No |
| Document-level try-catch + fallback | next-mdx-remote, Tina, MDXEditor | Yes (doc-level) | Yes (doc-level) | Yes (doc-level) |
| Block-level split-then-rejoin | **Novel to this spec** | Yes (per-block) | Yes (per-block) | Yes (per-block) |

**MDXEditor correction** (per `evidence/crash-taxonomy.md`): MDXEditor throws on unrecognized mdast and forces whole-document source mode. Our R8 is novel, not inherited.

### mdast type × mode behavior matrix

Under agnostic mode (`micromark-extension-mdx`), the tokenizer produces a narrower set of mdast types than strict mode (`micromark-extension-mdxjs`):

| mdast type | Strict mode | Agnostic mode | PM node | Notes |
|---|---|---|---|---|
| `mdxJsxFlowElement` | produced | **produced** | `jsxComponent` | Block-level JSX: `<Callout>...</Callout>` |
| `mdxJsxTextElement` | produced | **produced** | `jsxInline` (R3) | Inline JSX: `<Icon />` in prose |
| `mdxFlowExpression` | produced | **produced** | `jsxComponent` (via `handlers.mdxFlowExpression` at `index.ts:439`) | Block-level `{expression}`; balanced braces only under agnostic (no acorn) |
| `mdxTextExpression` | produced | **produced** | `jsxComponent` (via `handlers.mdxTextExpression` at `index.ts:443`) | Inline `{expression}`; balanced braces only under agnostic |
| `mdxjsEsm` | produced | **NOT produced** | ~~jsxComponent~~ (handler removed per R4) | ESM `import`/`export` — tokenizer doesn't emit under agnostic; content re-parses as prose paragraph |
| `containerDirective` | produced | **NOT produced** (D14 removes `remark-directive`) | ~~jsxComponent~~ (handler removed per R4) | `:::note\n...\n:::` renders as literal text |
| `leafDirective` | produced | **NOT produced** (D14) | ~~jsxComponent~~ (handler removed per R4) | `::video[Title]{src}` renders as literal text |
| `textDirective` | produced | **NOT produced** (D14) | ~~jsxComponent~~ (handler removed per R4) | `:abbr[HTML]{title}` renders as literal text; `1:1s` etc. prose patterns no longer crash |

Expression handlers are **retained** under agnostic mode — they handle balanced-brace expressions like `{ noServer: true }` (which previously crashed on acorn; now parses as an expression node, routes to `jsxComponent` opaque block, preserves source verbatim).

---

## 9) Proposed solution

### Architecture: Four-layer tolerant parsing

```
Layer 1: Agnostic MDX mode (R1)
  ↓ Eliminates 4 acorn-specific throws
  ↓ ~15-line plugin change, swapped on BOTH parse and serialize paths

Layer 2: R23 PUA guard (already shipped, unchanged)
  ↓ Protects bare < patterns and unmatched { from tokenizer commit-then-crash
  ↓ 301 lines, proven by I9/I11 PBT at 10K stress

Layer 3: Unknown-mdast-type catch-all (R8)
  ↓ Block unknown → rawMdxFallback; inline unknown → text node with source
  ↓ ~30 LoC

Layer 4: Block-level split-then-rejoin (R6)
  ↓ On VFileMessage throw with position, split source at enclosing block boundary
  ↓ MDX-aware: enclosing paired tags expand the fallback region
  ↓ Reference-definition hoisting preserves cross-block link semantics
  ↓ Position-less errors fall through to whole-doc raw text + R14 signal
  ↓ ~123 LoC correctness floor

Defensive net: R13 y-prosemirror patch
  ↓ schema.node() throws → rawMdxFallback (block) or log+skip (inline)
  ↓ Neutralizes destructive-delete failure mode
```

### R1: Agnostic MDX mode (both parse and serialize)

```typescript
// packages/core/src/markdown/remark-mdx-agnostic.ts
import { mdx } from 'micromark-extension-mdx';
import { mdxFromMarkdown, mdxToMarkdown } from 'mdast-util-mdx';
import type { Processor } from 'unified';

export function remarkMdxAgnostic(this: Processor) {
  const data = this.data();
  const me = data.micromarkExtensions || (data.micromarkExtensions = []);
  const fm = data.fromMarkdownExtensions || (data.fromMarkdownExtensions = []);
  const tm = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
  me.push(mdx());
  fm.push(mdxFromMarkdown());
  tm.push(mdxToMarkdown());
}
```

`pipeline.ts` swap — **both sites** (`:114` parse, `:142` serialize):
```diff
- .use(remarkMdx)
+ .use(remarkMdxAgnostic)
```

### R3: jsxInline at T1 Layer 3 target shape

```typescript
// packages/core/src/extensions/jsx-inline.ts
export const JsxInline = Node.create({
  name: 'jsxInline',
  group: 'inline',
  inline: true,
  atom: false,                          // NOT atom — children are real inline nodes
  content: 'inline*',                   // populated from mdxJsxTextElement.children
  isolating: true,                      // R9
  selectable: true,
  addAttributes() {
    return {
      attributes: { default: [] },      // structured from mdast, serialization ignores
      sourceRaw: { default: '' },       // serialization authority
    };
  },
});
```

Children populated from `mdxJsxTextElement.children` which remark-mdx already parses as mdast. No atom-to-non-atom migration ever needed.

### R4: Simplify parseSafe + remove dead handlers

```diff
  parseSafe(markdown: string): JSONContent {
    try {
      return this.parse(markdown);
    } catch {
-     // Retry with all { protected
-     try {
-       const safeMd = markdown.replaceAll('{', GUARD_OPEN_BRACE);
-       return this.parse(safeMd);
-     } catch {
+       metrics.parseFallback.wholeDoc++;      // R14
        return {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: markdown }] }],
        };
-     }
    }
  }
```

Also remove `handlers.mdxjsEsm` at `index.ts:447` — agnostic mode never produces `mdxjsEsm` nodes.

### R5 + R7: rawMdxFallback node (content-based shape)

```typescript
// packages/core/src/extensions/raw-mdx-fallback.ts
export const RawMdxFallback = Node.create({
  name: 'rawMdxFallback',
  group: 'block',
  atom: false,                          // CRITICAL: not atom, for Y.Item identity
  content: 'text*',                     // inner text holds raw source
  isolating: true,                      // R9
  selectable: true,
  defining: true,
  addAttributes() {
    return {
      reason: { default: '' },          // e.g., "end-tag mismatch: <Foo>...</Bar>"
      originalSpan: { default: { start: 0, end: 0 } },
    };
  },
  renderHTML() {
    return [
      'div',
      {
        class: 'raw-mdx-fallback',
        contenteditable: 'false',
        'data-raw-badge': 'raw',
      },
      0,
    ];
  },
  addNodeView() {
    return () => ({
      dom: createFallbackChrome(),      // dashed border + "raw" badge + click handler
      contentDOM: innerTextContainer,
      ignoreMutation: () => true,
    });
  },
});
```

**Shape rationale:** content-based preserves char-level CRDT merge semantics for concurrent edits to the broken region, produces finer undo granularity, and matches the standard PM pattern for opaque-but-editable-via-source nodes (consistent with R3 jsxInline). Per `evidence/P3-source-trace.md`, Y.XmlElement Y.Item identity is preserved in BOTH content-based and attr-based shapes during in-place content changes — the `_item.delete` path at sync-plugin.js:1270 is only reached on node-name mismatch. (This corrects a prior overstated claim about per-keystroke Y.Item churn.) The decision for content-based stands, but for collaborative-semantics reasons, not identity-preservation reasons.

### R6: Block-level split-then-rejoin algorithm

```typescript
function parseWithFallback(source: string, depth = 0): Mdast {
  if (depth > MAX_SPLIT_DEPTH) {                      // MAX_SPLIT_DEPTH = 20
    metrics.parseFallback.wholeDoc++;
    return wholeDocRawText(source);
  }

  try {
    return parse(source);
  } catch (e) {
    const offset = extractErrorOffset(e);
    if (offset === undefined) {
      metrics.parseFallback.wholeDoc++;               // ~5% path (no position)
      return wholeDocRawText(source);
    }

    metrics.parseFallback.blockLevel++;
    const region = findFallbackRegion(source, offset); // MDX-aware
    const beforeSrc = source.slice(0, region.start);
    const brokenSrc = source.slice(region.start, region.end);
    const afterSrc  = source.slice(region.end);

    const beforeMdast = parseWithFallback(beforeSrc, depth + 1);
    const afterMdast  = parseWithFallback(
      hoistRefDefs(beforeSrc) + afterSrc,             // R11 ref-def hoisting
      depth + 1,
    );

    return mergeMdasts(
      beforeMdast,
      [fallbackMdastNode(brokenSrc, { reason: e.message })],
      afterMdast,
    );
  }
}

function extractErrorOffset(err: VFileMessage): number | undefined {
  const place = err.place;
  if (!place) return undefined;
  if (typeof place.offset === 'number') return place.offset;         // Point shape (tokenizer)
  if (place.start?.offset !== undefined) return place.start.offset;  // Position shape (mdast)
  return undefined;
}

// Inline helper — paired-tag scanner, fence-aware. ~50 LoC. Finds the
// enclosing <UpperCase>...</UpperCase> span covering errorOffset, if any.
// MUST skip fenced code regions (```) — a `<Callout>` inside a code fence
// is literal text, not a JSX tag. Uses the same `stripCodeFences` logic
// as R11's ref-def hoisting to identify fence boundaries before scanning.
function findEnclosingPairedTag(src: string, offset: number): Region | null {
  // 1. Identify fenced-code regions in src (reuse stripCodeFences)
  // 2. If offset is inside a fenced region, return null (error is in code, not JSX)
  // 3. Walk backward (skipping fenced regions) for unclosed `<UpperCase`
  // 4. Walk forward (skipping fenced regions) for matching `</UpperCase>`
  // 5. Return span if both found, null otherwise
  // Implementation in packages/core/src/markdown/parse-with-fallback.ts
}

function findFallbackRegion(src: string, errorOffset: number): Region {
  const enclosing = findEnclosingPairedTag(src, errorOffset);
  if (enclosing) return enclosing;

  const blockStart = nearestBlankLineBefore(src, errorOffset) ?? 0;
  const blockEnd   = nearestBlankLineAfter(src, errorOffset)  ?? src.length;
  return { start: blockStart, end: blockEnd };
}
```

**Correctness floor:**

| Item | Cost (LoC) |
|---|---|
| MAX_SPLIT_DEPTH recursion guard | 5 |
| Position-less error → whole-doc fallback | 3 |
| Reference definition hoisting (R11) | 15 |
| MDX-aware `findFallbackRegion` (inline helper, fence-aware — must skip fenced code to avoid false-matching `<Tag>` inside code blocks) | 50 |
| R23 re-application per split half (PUA byte-stable, no offset mapping). **Note:** R23's brace-stack tracker has paragraph/blockquote scope awareness; splitting mid-scope resets the stack, which may change protection decisions for `{`/`}` that span the split boundary. Q4 probe must include a cross-boundary brace fixture. | 10 |
| `rawMdxFallback` content-based node + NodeView (R5) | 25 |
| VFileMessage dual-shape handling | 5 |
| R10 schema add-only enforcement test | 30 |
| **Correctness floor subtotal** | **123** |
| R7 chrome (dashed border, badge, CTA) | 40 |
| R8 unknown-mdast catch-all (block fallback + inline text) | 30 |
| R14 observability counters + endpoint | 15 |
| R13 y-prosemirror patch + verification test | 20 patch + 30 test |
| R12 mid-type recovery E2E | 40 |
| Tests (unit + integration + PBT) | 200 |
| Handler registration + imports (2 new types) | 30 |
| `source-mode-navigate.ts` (CodeMirror scroll-to-region) | 15 |
| NodeView complexity delta (R5 addNodeView is ~45 LoC, not 25) | 20 |
| `hoistRefDefs` needs `stripCodeFences` helper | 15 |
| **Grand total** | **~478 LoC** |

*Note: estimate excludes import boilerplate, `package.json` edits, and `.patch` file formatting. Realistic range: 450-500 LoC implementation + 200-300 LoC tests.*

**Acceptable limitations** (document, don't implement):

- **L1** — Ordered list renumbers visually correctly but becomes two separate lists structurally if user deletes the fallback. Visual correctness preserved; structural split is edge-case quirk, not data loss.
- **L2** — 20+ split depth falls through to whole-doc raw-text + R14 counter. Users with 20+ broken regions are in disaster-recovery territory.
- **L3** — Reference definitions defined ONLY inside a broken region are dangling in surrounding text. R11 hoists top-level definitions; nested-in-broken-block refs are intrinsically ambiguous.

### R8: Unknown-mdast-type catch-all

```typescript
// packages/core/src/markdown/handlers.ts
const BLOCK_UNKNOWN_FALLBACK = (node: Node, source: string) => {
  const sourceRaw = source.slice(node.position.start.offset, node.position.end.offset);
  return n.rawMdxFallback.createAndFill(
    { reason: `Unhandled block mdast: ${node.type}`, originalSpan: ... },
    [schema.text(sourceRaw)],
  );
};

const INLINE_UNKNOWN_FALLBACK = (node: Node, source: string) => {
  // Inline unknown → just raw source as plain text node (no schema addition needed)
  const sourceRaw = source.slice(node.position.start.offset, node.position.end.offset);
  return schema.text(sourceRaw);
};

// Apply to: block-level math, footnoteDefinition + inline-level inlineMath, footnoteReference
// + wildcard catch-all by handler-shape detection
```

### R9: isolating: true

Applied to jsxComponent, jsxInline, rawMdxFallback. Meaningful for jsxInline post-R3 (non-atom; prevents cursor escape on backspace). Marginal on atoms (`joinBackward` handles via `before.isAtom` fallback) but correct PM default for opaque nodes.

### R10: Schema add-only invariant + enforcement test

```typescript
// packages/core/src/schema-invariant.test.ts
import { sharedExtensions } from './extensions/shared';
import expectedSnapshot from './schema-snapshot.json';

test('R10: schema is add-only (no attrs/types/defaults narrowed)', () => {
  const current = captureSchemaShape(sharedExtensions);
  for (const [nodeType, expected] of Object.entries(expectedSnapshot)) {
    const actual = current[nodeType];
    expect(actual).toBeDefined();                          // no node type removal
    for (const [attr, expectedDefault] of Object.entries(expected.attrs)) {
      expect(actual.attrs[attr]).toBeDefined();            // no attr removal
      expect(actual.attrs[attr].hasDefault).toBe(true);    // all attrs have default
    }
    expect(contentExprContains(actual.content, expected.content)).toBe(true);
  }
});
```

Developers adding new nodes/attrs regenerate the snapshot (additive deltas only). Removals and narrowings fail the gate.

### R11: Reference-definition hoisting

```typescript
function hoistRefDefs(src: string): string {
  const REF_DEF_RE = /^[ \t]{0,3}\[([^\]]+)\]:\s*(\S+)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/gm;
  const outsideCodeFence = stripCodeFences(src);
  return [...outsideCodeFence.matchAll(REF_DEF_RE)].map(m => m[0]).join('\n') + '\n';
}
```

### R13: y-prosemirror patch body

```diff
// patches/y-prosemirror@1.3.7.patch — sync-plugin.js:~801
 try {
   return schema.node(el.nodeName, attrs, children)
 } catch (e) {
-  el._item.delete(transaction)
-  mapping.delete(el)
-  return null
+  console.warn(`[y-prosemirror] schema.node(${el.nodeName}) threw:`, e.message)
+  const isInline = schema.nodes[el.nodeName]?.spec.inline
+  if (!isInline) {
+    try {
+      metrics.ypsMismatch.block++
+      return schema.node('rawMdxFallback', { reason: e.message }, [schema.text(el.nodeName)])
+    } catch { /* fallthrough */ }
+  } else {
+    metrics.ypsMismatch.inline++
+  }
+  mapping.delete(el)
+  return null
 }
```

Same pattern at `:834` for `schema.text()`.

**Properties:** Version-agnostic. Failure mode now: block throws → visible fallback; inline throws → inline gap + console warn + metric; Y.Doc integrity preserved in all cases; no destructive delete propagates to peers.

### R14: Observability — two channels, clean separation

```typescript
// packages/core/src/metrics/parse-health.ts
export const metrics = {
  parseFallback: { blockLevel: 0, wholeDoc: 0 },
  ypsMismatch:   { block: 0, inline: 0 },
};
export function incrementBlockFallback() { metrics.parseFallback.blockLevel++; }
// ... etc
export function getParseHealth() { return { ...metrics }; }

// At each event site (example, in parse-with-fallback.ts):
console.warn(JSON.stringify({
  event: 'mdx-block-fallback',
  docName,
  offset,
  reason: err.message,
}));
incrementBlockFallback();

// Exposed via packages/server/src/api-extension.ts
// GET /api/metrics/parse-health → JSON snapshot of metrics
```

**Architectural rationale** (explicit because the AI-generated codebase doesn't set a precedent worth following blindly):

- **`console.warn` with structured JSON** is the universal CLI dev-tool convention (Biome, esbuild, Vite, Astro, Prettier, ESLint, Obsidian all do this). Consumers: local developer sees it in dev-server output; hosted Hocuspocus deployments can pipe stderr to their own log aggregator. Non-replicated, per-process, no schema commitment.
- **Aggregate counters** match our existing `packages/server/src/metrics.ts` pattern for `reconciliation`. Consumer: tests (assert R6/R13 fired N times), hypothetical ops dashboard. Server memory, lost on restart — that's correct for runtime gauges.
- **NOT `Y.Map('parse-events')`** — would write observability data into the CRDT itself, which:
  1. Accumulates into document state monotonically (cost grows with every new peer's initial sync)
  2. Commits to a CRDT-backward-compatible event schema (migrations become a Y.js problem forever)
  3. Conflates document state (needs peer convergence) with observability (doesn't need convergence — each client reparses and arrives at the same result independently)

This mirrors how production CRDT editors handle parse/sync errors: Outline uses `winston` logs + StatsD counters + Sentry (never Y.Doc); BlockSuite throws and lets exceptions propagate; Milkdown/Tiptap throw without event emission. Nobody writes parse errors into the CRDT itself.

---

## 10) Decision log

| ID | Decision | Status | Rationale |
|---|---|---|---|
| **D1** | Agnostic MDX mode on both parse and serialize paths | **Locked** | Eliminates 4 acorn-specific throws. TQ27: no expression evaluation needed. Swap both sites to prevent future silent re-activation. |
| **D2** | Retain R23 guard unchanged | **Locked** | Agnostic mode doesn't alter `<` behavior. Guard proven by I9/I11 PBT. |
| **D3** | Ship jsxInline at T1 Layer 3 target shape now (`atom:false, content:'inline*'`) | **Locked** | Greenfield: avoids accumulating atoms that T1 Layer 3 must migrate on real user data. y-prosemirror destructively deletes nodes whose `schema.node()` throws — post-ship atom→non-atom migration would hit that path (R13 patch mitigates but user still sees content loss). |
| **D4** | Block-level fallback is **Must** | **Locked** | Residual crash surface per `evidence/crash-taxonomy.md` is larger than `~95%` claim implied. Tag-mismatch `<Foo>...</Bar>` (dominant real-world failure) throws at mdast finalization and cannot be pre-empted by R23. Obsidian's per-construct indicators (1.5M users) set the correctness bar. |
| **D5** | One parser profile (agnostic) for both `.md` and `.mdx` | **Locked** | NG1 (no import/export) means strict mode adds no value. Agnostic handles both correctly. Strict opt-in is §15 Future Work if product demand emerges. |
| **D6** | `parseSafe` simplified + `handlers.mdxjsEsm` removed in same PR | **Locked** | Agnostic mode + R23 + R6 make brace-retry and ESM handler dead code. Greenfield precedent #7 (remove broken capabilities). |
| **D7** | `isolating: true` on all component + fallback nodes | **Locked** | Correct PM default for opaque nodes. Primary value meaningful on jsxInline post-R3 (non-atom). |
| **D8** | Schema add-only invariant: all attrs have `default`, attrs/types are add-only, no narrowing | **Locked** | y-prosemirror destructively deletes on `schema.node()` throw. Stricter than typical ProseMirror projects because CRDT sync amplifies failures to permanent multi-peer data loss. |
| **D9** | Block-level fallback architecture = split-then-rejoin with MDX-aware region detection + ref-def hoisting | **Locked** | Novel. No production system does this per-block. Correctness floor enumerated in §9 grounds the approach. Inline `findEnclosingPairedTag` helper sized right for spec-local need; factor into shared helper only if `<Namespace.Component>` support emerges (see §15). |
| **D10** | `rawMdxFallback` node is content-based (not atom) | **Locked** | Char-level Y.Text CRDT merge on concurrent edits; finer undo granularity; smaller sync messages; consistency with R3 jsxInline pattern. Per `evidence/P3-source-trace.md`, both content-based and attr-based shapes preserve Y.XmlElement identity under in-place edits — the decision is about collaborative-editing semantics, not about identity preservation (which was a prior overstated claim). |
| **D11** | Unknown-mdast catch-all: block → `rawMdxFallback`; inline → text node | **Locked** | Minimum viable. Inline unknowns don't need a dedicated node type — raw source as literal text is degraded-but-visible. Specific handlers for math/footnotes are separate spec. |
| **D12** | `y-prosemirror` patched via `bun patch` | **Locked** | Neutralizes both 1.3.7 destructive-delete and HEAD throw-through at the source. Version-agnostic; upgrades re-port the patch. Follows existing `@handlewithcare/remark-prosemirror` patch pattern. |
| **D13** | R13 patch: block-context substitutes fallback; inline-context log + skip | **Locked** | Inline schema throws are rare (schema drift edge case) and don't warrant a dedicated inline fallback node. Log + skip preserves Y.Doc integrity; observability (R14) surfaces frequency. If inline path fires at non-negligible rate post-merge, reopen for dedicated inline fallback. |
| **D14** | Remove `remark-directive` from the pipeline | **Locked** | Reverses the prior migration-spec D12 (which registered remark-directive "from day one" for permissive parsing). Source-level analysis (`evidence/crash-taxonomy.md` + agent investigation): zero `:::container` / `::leaf` / `:text` syntax in any `.md` file across the worktree; all three directive types map to the SAME `jsxComponent` opaque block as MDX components — zero semantic distinction in PM output; `remark-directive`'s `:textDirective` claim is the root cause of Q2 `1:1s`-in-table crashes AND the broader `:` collision class (timestamps `9:00`, ratios `1:1`, versions `v2:beta`). Removal eliminates Q2 at the root rather than catching it via R6. Greenfield precedent #7 (remove unused capabilities). If a future product need emerges for `:::callout` syntax, re-add the dependency in a follow-up spec — the removal is reversible. |

---

## 11) Open questions

| ID | Question | Priority | Blocking? | Plan to resolve |
|---|---|---|---|---|
| Q1 | Do PUA sentinels compose cleanly with agnostic expression parser? | P0 | Yes | I9 PBT at 10K with agnostic mode active. PUA byte-stability confirmed; expected pass. |
| Q2 | ~~remark-directive `:1s` in table cells~~ | **Resolved** | — | Source analysis confirmed directive claim is MDX-orthogonal AND not scope-able via config. D14 resolves by removing remark-directive entirely. |
| Q3 | Full MDX round-trip suite under agnostic mode | P0 | Yes | Run `mdx-roundtrip.test.ts` with plugin swap. Also verify serialize-path edge: `mdxToMarkdown` (from `mdast-util-mdx`) internally bundles `mdast-util-mdxjs-esm` handlers even under agnostic mode — these are no-ops because the tokenizer doesn't emit ESM tokens, but confirm no unexpected ESM delimiter emission for content starting with `import` or `export` that was parsed as prose. |
| Q4 | Crash-class coverage probe (M6) | P0 | Yes | Build corpus from `evidence/crash-taxonomy.md` + fumadocs + agents-docs + git-history PROJECT.md. Write `evidence/crash-class-coverage.md`. |
| Q5 | Multi-client behavior under `rawMdxFallback` source edits (M8) | P1 | No | **Scope narrowed after P3 source trace.** Y.Item identity preservation is now CONFIRMED from source; runtime test is regression coverage only, not premise validation. Two-client harness still useful: (1) verifies char-level delta semantics on concurrent edits to the same broken region, (2) catches any future y-prosemirror or TipTap changes that would regress the recurse-and-update path. Downgraded from P0 Blocking to P1 because it no longer gates merge. |
| Q6 | R13 patch verification test | P0 | Yes | Seed Y.Doc with known-invalid node shapes; verify block→fallback, inline→gap+warn, no destructive delete, no crash. **Also test cascade scenario:** a paragraph whose only child is an unknown inline node. Paragraph content expression is `inline*` (confirmed from `@tiptap/extension-paragraph/src/paragraph.ts:54`), so empty paragraphs are valid — cascade stops. Include defensively to catch future content-expression narrowing in any parent node type. |

---

## 12) Assumptions

| ID | Assumption | Confidence | Verification |
|---|---|---|---|
| A1 | Product doesn't need JS expression validation in MDX | HIGH | TQ27 |
| A2 | `micromark-extension-mdx` stable enough for production | HIGH | 5.2M DL via sub-extensions; Q3 probe |
| A3 | R6 correctness floor handles 26-class residual | MEDIUM | Q4 probe measures per-class outcome |
| A4 | jsxInline at T1 Layer 3 shape has zero migration impact | HIGH | Shipped with eventual shape |
| A5 | `rawMdxFallback` content-based shape preserves Y.Item identity | HIGH | Q5 integration test |
| A6 | R10 add-only invariant enforceable via snapshot test | HIGH | Standard pattern |
| A7 | Position-less error rate — **two distinct classes:** (1) Micromark `VFileMessage` position-less: **0% through current pipeline** (R23 pre-empts the dangling-open-tag class before it reaches the parser). (2) PM-construction `RangeError` (e.g., "Invalid content for node"): carries NO `.place` at all (not a VFileMessage) — **separate error class, rate near-zero** (R8 catch-all prevents unknown-type construction errors; known-type construction errors require upstream-produced malformed mdast, currently not observed). Both classes fall to R6's whole-doc fallback path (no position → can't split). Both monitored by R14's `parseFallback.wholeDoc` counter. | HIGH (grounded by M6 probe) | M6 probe measured 0/10 VFileMessage-position-less through pipeline. PM-construction RangeErrors are structurally separate (no `.place`, no `.offset`, no VFileMessage at all — plain `RangeError` from `prosemirror-model/schema.ts:201`). Post-R1 (agnostic mode), dangling-tag remains R23-protected → VFileMessage position-less stays 0%. PM-construction rate depends on mdast well-formedness from pipeline — expected near-zero but fragile if upstream remark plugins change output shape. |

---

## 13) In scope

**Single PR, three sequential commits (each independently revertable):**

### Commit A: Agnostic mode + parser cleanup + directive removal
- `packages/core/src/markdown/remark-mdx-agnostic.ts` — new plugin (~15 lines)
- `packages/core/src/markdown/pipeline.ts` — swap `remarkMdx` → `remarkMdxAgnostic` at `:114` AND `:142`; **remove `remarkDirective` import + `.use(remarkDirective)` registration at `:26` (parse) AND `:143` (serialize)** (D14)
- `packages/core/src/markdown/index.ts` — simplify `parseSafe`; remove `handlers.mdxjsEsm`; **remove `containerDirective` / `leafDirective` / `textDirective` handlers (lines 453-461)**; remove directive type imports
- `packages/core/src/markdown/position-slice.ts` — **remove directive cases (lines 192-194)**
- `packages/core/src/markdown/mdast-augmentation.ts` — remove `mdast-util-directive` augmentation
- `packages/app/tests/fidelity/directive-passthrough.test.ts` — **delete** (obsolete under D14; plain-text rendering of removed-directive syntax is already covered by the CommonMark round-trip corpus — no new test needed)
- `packages/app/tests/fidelity/fail-fast-unknown-type.test.ts` — **update contract** (per F15 assessment). Pre-R8: asserts unknown mdast types cause a throw from `mdManager.parse()`. Post-R8: assert unknown mdast types produce a `rawMdxFallback` node in the PM tree AND emit a `console.warn` with structured event data AND do NOT throw. The stated intent ("loud failure, not data loss") is strengthened — content is preserved AND developer signal is louder (console.warn instead of throw), no silent drops. Update the test's description + assertions accordingly.
- `package.json` — drop `remark-directive` and `mdast-util-directive` from dependencies

### Commit B: Schema additions
- `packages/core/src/extensions/jsx-inline.ts` — new TipTap extension at Layer 3 shape (R3)
- `packages/core/src/extensions/raw-mdx-fallback.ts` — new extension, content-based block-only (R5)
- `packages/core/src/extensions/shared.ts` — register both
- `packages/core/src/markdown/index.ts` — jsxInline handler at inline content shape; rawMdxFallback serialize handler
- `packages/core/src/schema-snapshot.json` — initial add-only snapshot; **includes `sharedExtensions` array ordering** alongside attr shape (catches future reorderings that would shift CRDT schema ordering across client versions — CLAUDE.md warns "sharedExtensions MUST stay in sync between core, server, and app")
- `packages/core/src/schema-invariant.test.ts` — R10 enforcement (attr add-only + extension-array ordering)

### Commit C: Fallback infrastructure + patch + observability + caller migration
- `packages/core/src/markdown/parse-with-fallback.ts` — R6 split-then-rejoin + inline `findEnclosingPairedTag` helper
- `packages/server/src/api-extension.ts` — **migrate rollback endpoint** (line ~1414) from `mdManager.parse()` to `parseWithFallback()`. Prevents HTTP 500 on rollback to historical broken MDX.
- `packages/server/src/external-change.ts` — **migrate** (line ~39) from `mdManager.parse()` to `parseWithFallback()`. Ensures disk→CRDT bridge gets degraded content on broken file changes, not stale Y.Doc.

**Test fixtures — JSON format** (follows existing `fixtures/gfm-examples.json` precedent):
- `packages/app/tests/fidelity/fixtures/mdx-tolerant-crash-taxonomy.json` — 26 entries with `{id, input, class, r23Covers, expectedOutcome, note}`. Source of truth for R6 test corpus. Paired with the human-readable `evidence/crash-taxonomy.md` (markdown doc explains, JSON drives tests).
- `packages/app/tests/fidelity/fixtures/mdx-tolerant-refdef-corpus.json` — R11 ref-def hoisting fixtures: (a) ref-def in first half + reference in second half (hoist preserves), (b) ref-def only in second half (second half is self-contained), (c) ref-def inside broken region (documented L3 limitation — dangling ref), (d) ref-defs spanning code fences (must not be hoisted — stripCodeFences check).
- `packages/app/tests/fidelity/fixtures/mdx-tolerant-edge-cases.json` — empty input, whole-doc-unparseable, MAX_SPLIT_DEPTH-exceeds (20+ broken regions), degenerate paths. Ensures R6's position-less fallback path + recursion guards are covered. **Also includes nested-broken-tag scenarios**: `<Foo>valid <Bar>invalid</Baz></Foo>` (mismatched inner tag with valid outer wrapper — R6 must select innermost enclosing paired tag, not outermost, to preserve maximum surrounding structure); `<Foo>...</Foo>` with a malformed attribute inside a child (`<Bar a=>`); cross-block paired-tag where opening is in block N and closing is in block N+2 (R6's MDX-aware region detection spans block boundaries). Expected outcomes documented per fixture entry.
- `packages/app/tests/fidelity/fixtures/mdx-tolerant-midtype-corpus.json` — keystroke sequences for M9 P3 recovery E2E (partial `<Callou`, `<Foo a=`, `<Bar>...</Ba`).

**Test generators — reuse existing `arbitraries.ts`:** new PBT invariants (including R10's schema add-only test) MUST import from `packages/app/tests/fidelity/arbitraries.ts` rather than inline generators. That module already exports `safeWord`, `phrase`, `fidelityText`, `block`, etc.

**Test helper:** `packages/app/tests/fidelity/expect-parse-event.ts` — `expectParseEvent({event, docName?, reason?})` assertion helper. Captures `console.warn` calls during test, parses the structured JSON, matches against expected event shape. Shared by R6 tests, R13 tests, and `parseSafe` tier-3 tests (3+ callers justify factoring). ~20 LoC.
- `packages/core/src/markdown/ref-def-hoist.ts` — R11 reference-definition hoisting
- `packages/core/src/markdown/handlers.ts` — R8 unknown-mdast-type catch-all (block → fallback, inline → text)
- `packages/app/src/components/RawMdxFallbackChrome.tsx` — R7 visual indicator + source-mode CTA
- `packages/app/src/editor/source-mode-navigate.ts` — helper to scroll CodeMirror to a region on badge click
- `patches/y-prosemirror@1.3.7.patch` — R13 schema-throw fallback substitution
- `package.json` — add `patchedDependencies` entry
- `packages/core/src/metrics/parse-health.ts` — R14 counters
- `packages/server/src/api-extension.ts` — expose `/api/metrics/parse-health`
- Tests: unit for each module; integration harness for multi-client Y.Item identity (M8); crash-taxonomy corpus tests (M6); R13 patch verification (Q6); `packages/app/tests/stress/mid-type-recovery.e2e.ts` (M9)

**Dependencies:**
- `y-prosemirror@1.3.7` (R13 patch verified against 1.3.7; upgrade via separate PR)
- `remark-mdx` trio and `@handlewithcare/remark-prosemirror` unchanged

### Deployment / phasing

All three commits in one PR. Staged-commit structure supports granular revert; each commit's tests green in isolation.

---

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Agnostic mode changes round-trip for valid MDX | Low | High | Q3 probe pre-merge on full 22-case suite |
| PUA sentinels interact badly with agnostic expression parser | Low | Medium | Q1 I9 PBT at 10K; byte-stability confirmed |
| R6 `findFallbackRegion` non-termination on nested broken MDX | Low | Medium | MAX_SPLIT_DEPTH guard; termination proof via monotonic source reduction |
| R6 recursion O(n · k) on pathological input | Low | Low | MAX_SPLIT_DEPTH = 20 caps cost; whole-doc fallback when exceeded |
| Multi-client Y.Item churn in active source-mode editing | Mitigated | Medium | `rawMdxFallback` content-based shape (D10); Q5 integration test verifies |
| Rollback of parser swap requires full PR revert | Accepted | Low | Three-commit structure supports granular revert; Q1-Q6 pre-merge gates substitute for runtime flags |
| `y-prosemirror` schema.node throw → destructive delete / render crash | Mitigated | Critical | R10 add-only invariant + R13 patch substitutes fallback nodes. Version-agnostic. Q6 verifies. |
| ESM content re-parses as prose under agnostic mode | Known | Low | Per NG1; documented |
| External files using directive syntax (`:::callout`, `::embed`, `:abbr`) render literal colons after D14 removal | Known | Low | P1 persona ("bring your own markdown") from VitePress/Docusaurus/Fumadocs ecosystems may have `:::container` syntax. After D14 removal, this becomes literal text — cosmetic degradation, not data loss. Escape hatch: convert to `<Callout>...</Callout>` MDX or re-add `remark-directive` in a future spec if product demand materializes. |
| Upstream `y-prosemirror` refactor invalidates R13 patch | Low | Medium | `bun patch` fails loud at install. Upgrade re-ports + re-runs Q6. Bounded task. |

---

## 15) Future work

### Explored (clear paths, not in scope now)

- **Typed component nodes (T1 re-spec):** Component registry + prop panels + typed attrs. T1's original implementation targets deleted APIs; needs re-spec against remark-mdx. This spec is the prerequisite. `componentName` attr will be added here with its concrete caller (prop panel / registry lookup); R10 add-only guarantees safe addition.
- **T3 block-editor-ux:** Drag handles, block selection, keyboard navigation. Zero parser dependencies on this spec; depends on T1.
- **Strict MDX opt-in (`.mdx` files):** If product demand emerges for full JS expression evaluation (imports, exports, acorn validation), ship as opt-in parser profile per workspace config. NOT per file extension (conflicts with "one editor for both").

### Identified (needs own spec)

- **Additional mdast handlers:** native `math`, `footnoteDefinition`, `footnoteReference` handlers (currently fall through R8 catch-all). Would upgrade these from "opaque raw" to "structured editable." Separate spec because each requires schema addition + NodeView design + serialization handler.

- **Document-level schema versioning (Outline pattern):** R10 add-only prevents narrowing, but eventually the schema may need to genuinely evolve (deprecate a node type, merge two attrs, rename for clarity). Long-term answer: store `schemaVersion` attr on doc root; on Y.Doc load, migrate content through registered version-to-version transforms before y-prosemirror materializes. Operationalized by `remirror/prosemirror-migration` in the ProseMirror ecosystem. Trigger for this spec: first time R10 blocks a schema change that's architecturally correct but narrowing (e.g., we realize an attr was the wrong shape and want to replace it).

- **Inline-granularity diagnostics UX (Obsidian pattern):** R6 + R7 today produce block-level fallbacks with block-level chrome. Obsidian (1.5M users, state-of-art) shows per-construct inline indicators — a red squiggle under just the failing tag, not the whole block. Requires: parser that emits per-tag diagnostics rather than pass/fail, OR a post-parse error analyzer that walks mdast looking for anti-patterns (tag mismatch is detectable from mdast). Trigger: R14 observability data shows high R6 firing rate on single-tag errors (tag-mismatch #20 is estimated dominant).

- **Continuous crash-class probe (productize M6):** M6 is a pre-merge one-time probe. Productized version runs on every dependency bump (micromark, remark, mdast-util-mdx-jsx) and optionally on opt-in user content. Early warning for new crash classes introduced by upstream. Would have caught the PR #83 → #95 → #101 regression cycle. Trigger: next dependency bump that affects the parser pipeline.

- **R13 patch maintenance protocol:** explicit protocol for upgrading `y-prosemirror` past 1.3.7: (1) diff upstream sync-plugin.js against our patched version, (2) re-port the throw-handling branches to new source, (3) run Q6 verification test + the full M-suite, (4) update `patches/y-prosemirror@N.N.N.patch` filename. Separate doc under `docs/` or a runbook. Trigger: first y-prosemirror upgrade attempt.

- **R23 tag-matcher factoring (revisit trigger):** audit cut the refactor because R23's scanner and R6's inline helper serve complementary (not shared) purposes. Revisit if either surface gains support for `<Namespace.Component>` or other tag-shape variation — that's the point where divergence between the two scanners becomes real maintenance cost. Until then, inline helper is simpler.

- **Investigate `Y.Map` usage across the codebase for speculative / consumerless patterns.** The research pass grounding R14 (see `evidence/observability-pattern.md`) surfaced a concrete finding about `Y.Map('conflicts')` in `packages/server/src/standalone.ts:314,951` — shipped in PR #13 (dd23a4e, spec `2026-04-08-external-write-reconciliation`), written by the server on reconciliation, replicated to every peer via CRDT sync, and **read by nothing** (grep across `packages/app/src/`, `packages/core/src/`, `packages/cli/`, `docs/` returns zero consumers). This pays the CRDT replication cost (wire size, initial-sync payload growth, monotonic schema commitment) for zero benefit. A second instance of the same pattern is proposed in the parallel Observer A origin-aware-diff spec's `Y.Map('safety-events')` — explicitly described as "no render-path consumer in V0."
  
  **The systemic question:** is the `per-doc Y.Map` pattern being used without consumer analysis elsewhere? Candidates worth auditing: `Y.Map('lifecycle')` (server writes; unclear if client reads), `Y.Map('metadata')` (frontmatter cache — debatable whether CRDT replication is needed vs. server-side state), `Y.Map('safety-events')` (proposed).
  
  **Investigation scope:** (1) walk each `Y.Map('X')` usage in the codebase; (2) identify real consumer(s) and whether the consumer needs CRDT convergence specifically (vs. HTTP/server-owned state); (3) classify each as legitimate (e.g., `Y.Map('activity')` → real per-peer line-flash UI in `agent-flash-source.ts`), speculative-no-consumer (e.g., `conflicts`), or borderline; (4) propose migration for the speculative cases (either add the missing consumer, migrate to server-owned + HTTP, or delete).
  
  **Rule of thumb surfaced by research:** put in the Y.Doc only what needs multi-peer convergence. Observability, forensics, and server-authoritative state don't belong in the CRDT.
  
  **Trigger:** Candidate for a standalone spec when bandwidth permits. Not urgent (no user-visible bug) but real architectural debt that grows with every new `Y.Map` introduced on speculative grounds. The parallel Observer A spec review is a natural coordination point — ideally flag before `safety-events` ships so it isn't a third data point of the anti-pattern.

---

## 16) Relationship to other specs

### Mike's tolerant parsing spec (PR #105, not merged)

Mike's spec proposes Option C ("markdown-first tolerant load, then upgrade recognized MDX constructs"). This spec implements it:

- Agnostic MDX mode = "markdown-first"
- R23 guard = "upgrade recognized MDX constructs"
- R6 block-level fallback = "local degradation" (his Phase 2)

His open questions (Q1-Q5) map to our decisions: Q1 → D4, D9; Q2 → D5; Q3 → D1; Q4 → D4, D9, D10; Q5 → already adopted in PR #101.

### Typed-component-nodes spec (T1, PR #23 branch)

**Prerequisite.** Not a replacement. T1's implementation targets APIs deleted in PR #83; needs full re-spec against remark-mdx. Good news: remark-mdx natively provides what T1 was building manually (structured `mdxJsxFlowElement.attributes`, pre-parsed `children`, position-slice for byte-identical serialization).

**Compatibility:**
- This spec's jsxInline ships at T1 Layer 3 target shape (`atom:false, content:'inline*'`) — T1 consumes directly, no migration.
- T1 adds `componentName` attr with its own caller (prop panels / registry). R10 add-only guarantees safe addition.
- Byte-identity preserved: T1 reads mdast attributes for UI, STILL serializes via sourceRaw → html → verbatim.

### Block-editor-ux spec (T3)

Zero parser dependencies. Depends on T1. Our spec preserves the `isolating: true` default (R9) that T3's keyboard navigation patterns assume. `rawMdxFallback` is a block-level node; T3 drag-handles, selection, etc. apply uniformly.

### Migration spec (PR #83)

This spec closes four gaps:
1. **jsxInline** (§17.2 line 420) — shipped at Layer 3 target shape
2. **Block-in-inline caveat** (`migration SPEC.md:637`) — separates concerns via distinct jsxComponent (block) and jsxInline (inline)
3. **`{ }` crash class** — agnostic mode eliminates at parse time; R6 handles residual `{` that guard can't protect
4. **T1 compatibility** — this spec + T1 re-spec is the resolution path

---

## 17) Agent constraints

- **SCOPE:** `packages/core/src/markdown/`, `packages/core/src/extensions/`, `packages/core/src/metrics/`, `packages/app/src/components/RawMdxFallbackChrome.tsx`, `packages/app/src/editor/source-mode-navigate.ts`, `packages/core/src/schema-invariant.test.ts`, `packages/core/src/schema-snapshot.json`, `packages/server/src/api-extension.ts` (one endpoint addition), `patches/y-prosemirror@1.3.7.patch`, `package.json` (`patchedDependencies`).
- **DO NOT TOUCH:** CRDT sync layer, observer bridge (except via R5 test coverage), persistence layer, Hocuspocus, file watcher, unrelated UI components.
- **STOP rule:** If agnostic mode changes round-trip for ANY converging case in `packages/app/tests/fidelity/mdx-roundtrip.test.ts` (post-rebase count), STOP. Round-trip contract is load-bearing. The 1 known-divergent case per NG10 remains divergent by design. (NG10, defined in AGENTS.md §Storage-layer fidelity contract: `---` at document position 0 normalizes to `***` on serialize because it's indistinguishable from empty YAML frontmatter under `remark-frontmatter`.)
- **STOP rule:** If I9 or I11 PBT fails at 1K runs post-swap, STOP and investigate guard interaction.
- **STOP rule:** If Q5 multi-client Y.Item identity test shows cursor jumps on peer's keystrokes inside fallback region, STOP. `rawMdxFallback` content-based shape is the fix — verify NodeView setup doesn't inadvertently replace the whole node.
- **STOP rule:** Any schema change that removes an attr, renames an attr, or narrows validate / content expression MUST fail the R10 enforcement test. If the test allows such a change, the test is broken — fix the test, don't skip it.
- **STOP rule:** Do not upgrade `y-prosemirror` past `1.3.7` in this PR. The R13 patch is verified against 1.3.7 only. Upgrades require re-porting the patch + re-running Q6 verification in a separate PR.
