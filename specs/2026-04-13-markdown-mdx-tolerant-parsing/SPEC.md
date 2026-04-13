# Markdown/MDX Tolerant Parsing — Spec

**Status:** Draft
**Owner(s):** engineering (TBD)
**Last updated:** 2026-04-13
**Links:**
- Evidence: [current parser behavior](./evidence/current-parser-behavior.md)
- Evidence: [product file model](./evidence/product-file-model.md)
- Tracking: n/a

---

## 1) Problem statement

- **Who is affected:** users bringing their own markdown files into Open Knowledge; authors editing project docs like `PROJECT.md`; agents and humans loading the same documents through the CRDT-backed editor.
- **What pain / job-to-be-done:** documents that contain ordinary Markdown prose can fail to load because the global `remark-mdx` parser claims prose as MDX syntax and throws. Current examples:
  - `<50ms` in prose
  - `ws.WebSocketServer({ noServer: true })` in prose
  - `1:1s` in a table cell
- **Why now:** the current stack has already started accumulating narrow parser guards. New failures in `PROJECT.md` show the issue is broader than the original `<...>` cases, and blank-document behavior violates the product’s stated file-ownership and storage-fidelity promises.
- **Current workaround(s):** hand-escape offending content in source files; add targeted parser guards for specific token shapes.

## 2) Goals

- **G1.** Loading a document must never degrade to a blank editor solely because the source contains malformed or ambiguous MDX-like syntax.
- **G2.** Preserve the product’s existing MDX/component story for valid, supported constructs.
- **G3.** Define a durable parser contract that is tolerant by default instead of relying on endless token-by-token special cases.
- **G4.** Keep the file model aligned with the repo’s stated product direction: one editor for `.md` and `.mdx`, bring-your-own-files, Markdown-canonical storage.
- **G5.** Establish the expected fallback semantics for malformed or unsupported MDX-ish content: literal text, raw/opaque node, source-only rendering, or some combination.

## 3) Non-goals

- **NG1.** Removing MDX/component support from the product.
- **NG2.** Re-scoping the broader editor architecture (TipTap, CodeMirror, observer bridge, CRDT, persistence).
- **NG3.** Solving every current markdown normalization/fidelity gap unrelated to tolerant loading.
- **NG4.** Designing publish-time linting, formatting, or content-quality enforcement. This spec is about editor/load-time behavior.

## 4) Personas / consumers

- **P1: Bring-your-own-markdown user.** Opens an existing folder of `.md` files and expects ordinary Markdown prose to remain safe and readable.
- **P2: MDX/component author.** Uses JSX/MDX-style components such as `<Callout>` and expects supported constructs to remain structured and editable.
- **P3: Internal contributor.** Maintains the markdown pipeline and needs a coherent, testable contract for what the parser accepts, upgrades, and degrades.

## 5) User journeys

- **P1 happy path:** open an existing Markdown file containing comparison prose, API snippets, and tables; the file loads successfully; prose remains prose; no blank document.
- **P1 failure/recovery path:** file contains malformed or unsupported MDX-like syntax; the editor still loads the file; unsupported regions degrade gracefully instead of aborting the whole parse.
- **P2 happy path:** open or write valid JSX/MDX component syntax; supported constructs remain structured and round-trip as expected.
- **P3 debug path:** investigate a parse issue through a small set of focused regression tests and a documented parser contract instead of spelunking ad hoc special cases.

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | No blank-document failure on malformed or ambiguous MDX-like input | `MarkdownManager.parse()` either succeeds directly or produces a tolerated fallback representation; persistence/editor load path never silently loads empty content for these cases | Applies to `.md` and `.mdx` unless the product explicitly chooses otherwise |
| Must | Supported MDX/component constructs remain recognized | Current valid MDX/JSX cases used by the product still parse as structured nodes | Final supported set must be stated explicitly |
| Must | Fallback semantics are specified | The spec must define what happens for malformed `{...}`, ambiguous `:` forms, invalid JSX openers, and other prose-vs-MDX collisions | “It throws” is not acceptable load behavior |
| Must | Parser behavior is covered by regression tests | Add focused tests for current failures (`<50ms`, `{ noServer: true }`, `1:1s`) plus any contract-level fallback tests introduced by the chosen design | The two new `PROJECT.md` regressions are already pinned |
| Should | One-off pre-parse guards stop being the main strategy | The design should explain why the chosen approach scales better than adding a new special case for each syntax collision | This is the architectural quality bar |
| Could | Load-time degradation is surfaced to the user or logs in a more legible way | If a region had to degrade to raw text/opaque form, the system may expose that for debugging | Not required for the first implementation |

### Non-functional requirements

- **Performance:** tolerant behavior must not introduce obviously worse typing/load latency for normal documents.
- **Reliability:** ambiguous or malformed source must not cause document loss or empty state on load.
- **Security/privacy:** no change to the storage-layer contract that raw content is preserved and sanitization remains a render-layer concern.
- **Operability:** failures should remain diagnosable through targeted tests and logging; “blank UI” should be replaced by a classified, observable fallback path.
- **Cost:** prefer a design that reduces future parser-maintenance cost, not one that institutionalizes a growing exception list.

## 7) Success metrics & instrumentation

- **M1:** zero known blank-load regressions for the current fixture set (`<50ms`, `{ noServer: true }`, `1:1s`, plus the rest of `PROJECT.md`).
- **M2:** `PROJECT.md` and `AGENTS.md` load successfully through the production parse path without manual content edits solely for parser appeasement.
- **M3:** the chosen implementation introduces a contract-level fallback path rather than only adding more token-specific guards.
- **M4:** supported valid MDX cases still parse successfully after the change.
- **What we will log/trace:** parse fallback classification, source shape that triggered fallback, and whether the fallback was whole-document or region-local.
- **How we’ll know value:** fewer editor-load failures on existing Markdown content; less need to manually “fix” prose to satisfy the parser.

## 8) Current state (how it works today)

- The markdown pipeline is global and MDX-aware for all documents: `remark-parse -> remark-frontmatter -> remark-mdx -> remark-directive -> remark-gfm -> ...` in [`packages/core/src/markdown/pipeline.ts`](../../packages/core/src/markdown/pipeline.ts).
- The system currently includes one narrow tolerant recovery path for invalid JSX openers like `<50ms`: if `micromark-extension-mdx-jsx` throws `unexpected-character`, the parser protects the offending literal `<` and retries.
- Equivalent tolerant handling does **not** exist for MDX expression parsing (`{ ... }`) or the `1:1s`-style namespaced/JSX collision inside table cells.
- On load, persistence still treats an uncaught parse failure as “document will load empty” in [`packages/server/src/persistence.ts`](../../packages/server/src/persistence.ts).
- This conflicts with the documented product/file model:
  - one editor handles both `.md` and `.mdx`
  - users bring their own Markdown files
  - storage is Markdown-canonical and raw content should pass through unchanged
- The repo’s migration and product docs intentionally chose global `remark-mdx` to support MDX/component authoring, not extension-gated parsing.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **Editor load contract:** documents load even when some regions are malformed or ambiguous under the MDX grammar.
- **Source semantics:** prose remains prose unless it is confidently recognized as supported MDX/component syntax.
- **Failure UX:** blank editor due to parse failure is replaced by tolerated degradation. The exact degraded form is still an open design decision.

### System design

#### Recommended direction (current hypothesis)

Treat Markdown as the fail-open base language and MDX as an upgrade layer, not the global gate that decides whether the whole document is valid.

Concretely, that implies three contract-level rules:

1. **Whole-document load must be tolerant.**
   - Invalid or ambiguous MDX-like regions cannot abort the entire parse.

2. **Supported MDX must stay structured.**
   - Valid JSX/component constructs that the product cares about should still map to structured PM nodes.

3. **Unsupported or malformed MDX-like regions must degrade locally.**
   - Prefer literal text or an opaque/raw node over a thrown error.

#### Candidate implementation families

- **Option A: keep strict global `remark-mdx`, keep adding targeted recoveries**
  - Practical effect: fastest local fixes, but maintenance grows with every newly discovered collision.
  - Risk: institutionalizes whack-a-mole behavior.

- **Option B: split parse mode by extension (`.md` vs `.mdx`)**
  - Practical effect: plain Markdown becomes safer, but this conflicts with the current product direction that one editor handles both and that `.md` content may still contain JSX component syntax.
  - Risk: creates a split-world model the current product docs do not describe.

- **Option C: markdown-first tolerant load, then upgrade recognized MDX constructs**
  - Practical effect: ordinary Markdown remains safe; supported MDX still works; malformed constructs degrade locally.
  - Risk: more design work now; must define the supported MDX subset and fallback representation clearly.

- **Option D: strict parse first, tolerant raw/source fallback on failure**
  - Practical effect: easiest way to stop blank docs without fully redesigning the parser contract.
  - Risk: if fallback is whole-document and source-only, it may preserve availability but not the unified editing story.

### Alternatives considered

- **Continue with pure targeted guards only:** likely insufficient; current failures now span JSX opener parsing, expression parsing, and paragraph/table structural failures.
- **Remove MDX support:** conflicts with explicit product and migration decisions already in the repo.
- **Accept parse failures and rely on manual source edits:** directly conflicts with bring-your-own-files and tolerant-loading expectations.

## 10) Decision log

| ID | Decision | Type (P/T/X) | 1-way door? | Status | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Blank-document behavior on parse failure is unacceptable | X | No | Proposed | Violates file-ownership and storage-fidelity intent | [`current parser behavior`](./evidence/current-parser-behavior.md) | Any chosen design must replace blank load with tolerated fallback |
| D2 | Extension-gated `.md` vs `.mdx` parsing is in tension with the current product direction | X | Yes | Proposed | Repo docs repeatedly state one editor handles both `.md` and `.mdx` and use `.md` + JSX together as part of the product story | [`product file model`](./evidence/product-file-model.md) | If we choose extension gating, we are changing product direction, not just parser behavior |
| D3 | The long-term direction should favor contract-level tolerance over growing syntax-specific guards | T | No | Proposed | Current regressions span multiple MDX sub-parsers; the issue is architectural, not one token class | [`current parser behavior`](./evidence/current-parser-behavior.md) | Biases toward Option C or D over A |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | What is the product-level contract for malformed or ambiguous MDX-like content: literal text, opaque/raw node, source-only fallback, or mixed strategy? | X | P0 | Yes | Decide expected degraded behavior before implementation | Open |
| Q2 | Do we preserve global `.md` + `.mdx` parity, or intentionally split parser behavior by extension? | X | P0 | Yes | Compare against current product docs and get explicit product judgment if changing course | Open |
| Q3 | What is the supported MDX subset that must remain structured under tolerant loading? | X | P0 | Yes | Derive from current product docs, migration spec, and actual content usage | Open |
| Q4 | Is the best first implementation whole-document tolerant fallback, region-local fallback, or a hybrid? | T | P0 | Yes | Evaluate against editor/source-mode and persistence implications | Open |
| Q5 | Where should fallback classification and observability live: parser only, parser + persistence, or surfaced to UI? | T | P1 | No | Decide after the core contract is chosen | Open |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | The product still intends one editor to handle both `.md` and `.mdx` files | HIGH | Confirm against current product direction during this spec | Before scope freeze | Active |
| A2 | Users will continue bringing ordinary Markdown files with unescaped `<`, `{`, and `:` patterns | HIGH | Supported by current docs and live regressions | Before scope freeze | Active |
| A3 | A design centered on literal/raw fallback is more aligned with product goals than one centered on strict MDX validation | MEDIUM | Resolve through decision batch in this spec | Before scope freeze | Active |

## 13) In Scope (implement now)

- Define the parser/load contract for malformed or ambiguous MDX-like content.
- Choose the high-level implementation direction for tolerant loading.
- Define the supported MDX subset that must remain structured.
- Define the regression suite and acceptance criteria for this change.

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| We keep adding narrow guards and never resolve the architectural cause | High | High | Prefer a contract-level tolerant strategy | engineering |
| We over-correct and break supported MDX/component authoring | Medium | High | Explicitly define the supported MDX subset before implementing | engineering |
| We choose extension-gated parsing and silently change product direction | Medium | High | Treat `.md` vs `.mdx` split as a product decision, not an implementation detail | engineering + product |
| Whole-document fallback preserves availability but degrades UX too far | Medium | Medium | Compare whole-document vs region-local fallback explicitly in the spec | engineering |

## 15) Future Work

### Explored

- **Publish-time or lint-time strict MDX validation**
  - What we learned: load-time strictness conflicts with bring-your-own-markdown expectations.
  - Recommended approach: if strict MDX validation is valuable, move it to an explicit lint/publish surface rather than editor load.
  - Why not in scope now: current problem is editor availability and tolerant loading.
  - Triggers to revisit: once tolerant load behavior is settled and the product wants stronger author feedback.

### Identified

- **UI surfacing for degraded/raw regions**
  - What we know: tolerant load is the core requirement; visibility into degraded regions may still matter for debugging and editing.
  - Why it matters: avoids silent loss of structure when regions fall back.
  - What investigation is needed: editor/UI design after parser contract is settled.

### Noted

- **Broader markdown-first parser architecture cleanup** — may become relevant if the chosen solution moves beyond the current remark-mdx-centered load path.
