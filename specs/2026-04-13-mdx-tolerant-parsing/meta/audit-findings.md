# Audit Findings

**Artifact:** `specs/2026-04-13-mdx-tolerant-parsing/SPEC.md`
**Audit date:** 2026-04-13
**Total findings:** 12 (3 High, 5 Medium, 4 Low)

---

## High Severity

### [H1] Serialize path ALSO uses `remarkMdx` — spec only addresses parse side

**Category:** COHERENCE / FACTUAL
**Source:** T1 (codebase), L5 (summary coherence), Phase-2 reader pass
**Location:** §9 R1 ("Agnostic MDX mode"); §13 "In scope"; §10 D1

**Issue:** The spec's R1 diff, §9 prose, and §13 In-scope list show a single swap in `pipeline.ts` (`.use(remarkMdx) → .use(remarkMdxAgnostic)`). But `packages/core/src/markdown/pipeline.ts` has TWO call sites that register `remarkMdx`:

1. `createParseProcessor()` at line 114 (the parse path — the spec addresses this).
2. `serializeMd()` at line 142 (the serialize path — **not addressed**).

**Current text:**
> "Then in `pipeline.ts`:
> ```diff
> - .use(remarkMdx)
> + .use(remarkMdxAgnostic)
> ```"

Only one unified processor is shown; the serialize processor that also registers `remarkMdx` is invisible to the spec.

**Evidence:** `packages/core/src/markdown/pipeline.ts:142`:
```typescript
const processor = unified()
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkGfm)
  .use(remarkMdx)          // <-- second site, unmentioned in SPEC
  .use(remarkDirective)
  .use(remarkStringify, { ... });
```

In today's code, the serialize path sees no `mdxJsx*` mdast nodes (the PM `jsxComponent` handler emits `{type:'html'}` at `index.ts:594`), so functionally swapping/not-swapping is currently indistinguishable. But:
- A reader implementing from this spec would plausibly miss the second site and leave strict mode half-active.
- Any future change that emits `mdxJsx*` on the serialize side (e.g., R9 follow-ons, T1 re-spec reading structured attributes) would silently re-activate acorn.
- The stated Goal G3 ("tolerant by default") is violated if one half of the pipeline is still strict.

**Status:** INCOHERENT
**Suggested resolution:** Extend R1 to explicitly swap BOTH processors. Add a bullet to §13 "In scope" listing the serialize-side `pipeline.ts:142` swap. Optionally: factor a single `createProcessor()` helper so only one plugin list exists.

---

### [H2] Prior-art link points to a report that does not exist

**Category:** COHERENCE
**Source:** T1 (codebase), L7
**Location:** Front-matter `Links:` block (line 7)

**Issue:** The spec's first link claims prior-art research at `reports/mdx-tolerant-parsing-architecture/REPORT.md`. That directory does not exist in this worktree.

**Current text:**
> "- Prior art: [reports/mdx-tolerant-parsing-architecture/](../../reports/mdx-tolerant-parsing-architecture/REPORT.md)"

**Evidence:** `ls reports/` shows only `mdx-crdt-roundtrip-fidelity/`, `mdx-text-editor-preview-approach/`, and `tinacms-production-architecture-beyond-mdx/` for MDX-related reports. No `mdx-tolerant-parsing-architecture/`.

**Status:** CONTRADICTED
**Suggested resolution:** Either (a) create/locate the missing report and include it under `specs/…/evidence/` or `reports/`, (b) remove the link, or (c) retitle the link to point at the actual supporting report (`mdx-crdt-roundtrip-fidelity/REPORT.md` already supplies the 22/23 number used in M5).

---

### [H3] Mike's draft spec reference is broken in this worktree

**Category:** COHERENCE
**Source:** T1 (filesystem)
**Location:** Front-matter `Links:` block (line 9); §16 "Relationship to other specs" subsection "Mike's tolerant parsing spec (PR #105)"

**Issue:** The spec cites `specs/2026-04-13-markdown-mdx-tolerant-parsing/SPEC.md` (PR #105) as a load-bearing comparison point (explicit "Option C" mapping, Q1–Q5 cross-mapping, schema.nodeFromJSON adoption). That path does not exist in this worktree — `specs/` contains `2026-04-13-mdx-tolerant-parsing/` only.

**Evidence:** `ls specs/ | grep markdown-mdx` returns nothing. The referenced spec is presumably on an unmerged PR #105 branch, but the audited spec does not disclose this or quote the relevant content inline.

**Status:** UNVERIFIABLE (from this worktree)
**Suggested resolution:** Either (a) copy Mike's spec into `specs/` or its content into `evidence/mikes-spec-mapping.md` so the cross-references in §16 are verifiable, (b) mark the link explicitly as `(branch: PR #105, not yet merged)` so future readers know it may be unreachable, or (c) inline the Option C quote + Q1–Q5 text into §16 so the mapping is self-contained.

---

## Medium Severity

### [M1] Silent regression: ESM imports/exports in existing content become plain text under agnostic mode

**Category:** FACTUAL / SCOPE
**Source:** T2 (OSS source read), L3 (missing conditionality)
**Location:** §3 NG1; §9 R1 "What changes" / "What doesn't change"; §6 R8 / R11 non-functional; §14 Risks

**Issue:** `remark-mdx` is built on `micromark-extension-mdxjs`, which combines `mdxjsEsm + mdxExpression + mdxJsx + mdxMd`. `micromark-extension-mdx` (the agnostic variant) does **not** include `mdxjsEsm`. Consequence: any existing content containing `import X from 'y'` or `export const z = …` at document top-level will, after the swap, no longer parse as an `mdxjsEsm` mdast node — it will be tokenized as a plain paragraph / text.

The spec mentions in NG1 that "imports/exports… belong to a future 'strict MDX mode' opt-in" (non-goal for the feature). But the backward-compatibility consequence is not called out: existing MDX files that rely on ESM will silently change shape (structured void → literal text), the `handlers.mdxjsEsm` handler at `index.ts:450` becomes dead code, and a round-trip that was previously "raw in jsxComponent → html passthrough" may now diverge because the source is now parsed as prose.

**Evidence:**
- `~/.claude/oss-repos/mdx/packages/remark-mdx/lib/index.js` imports `mdxjs` from `micromark-extension-mdxjs`, which includes `mdxjsEsm(settings)`.
- `micromark-extension-mdx` readme: "does not support export/imports."
- `packages/core/src/markdown/index.ts:450` currently registers `handlers.mdxjsEsm`.

**Status:** INCOHERENT (scope vs. risk surface)
**Suggested resolution:** Add an explicit risk row to §14: "Existing content with `import`/`export` statements will re-parse as prose (no longer recognized as ESM) — behavior is acceptable per NG1, but authors may observe layout differences." Add a cleanup item to R4 or §13: "Remove dead `handlers.mdxjsEsm` handler in `index.ts` (or leave as defensive no-op)." Optionally enumerate in §7 a success metric / pre-merge probe: zero project files contain ESM today.

---

### [M2] R1 acceptance conflates `{1:1s}` (brace-wrapped) with `1:1s` (directive crash)

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §6 R1 acceptance ("no longer crash"); §8 "What breaks today" table; §11 Q2

**Issue:** The §8 breakage table lists `1:1s` in a table cell as failing because **`remark-directive`** claims `:1s` as a text directive — that is a directive-engine crash, independent of MDX mode. §6 R1's acceptance criterion then says `{ noServer: true }`, **`{1:1s}`**, `{ any prose with balanced braces }` "no longer crash." The brace-wrapped form `{1:1s}` is a different input from the unbraced `1:1s`. Q2 correctly acknowledges the directive crash is still open.

This is a coherence issue: readers may conclude agnostic mode solves "the 1:1s problem" end-to-end when in fact it only solves the brace-wrapped subset. Q2 is labeled P0/blocking, yet the crash it catches is never reflected in R1/R5/M1 acceptance criteria.

**Current text:**
- §8: "`1:1s` in table cell | RangeError … | remark-directive claims `:1s` as text directive inside table cell"
- §6 R1: "… `{1:1s}`, `{ any prose }` no longer crash."

**Status:** INCOHERENT
**Suggested resolution:** In §6 R1, replace `{1:1s}` with a true MDX-expression example. Separately add an acceptance criterion (or R#) that covers the unbraced directive-collision case once Q2 is resolved (e.g., "disable `remark-directive` in table cells," "scope directives to leaf/container forms," or "accept the crash and document as a known limit"). Keep Q2 as the resolver, but make the directive crash visible in the goals/requirements.

---

### [M3] "~95% coverage" is asserted repeatedly with no cited measurement

**Category:** COHERENCE (L7 inline attribution), FACTUAL
**Source:** L7
**Location:** §1 "Current workaround(s)" bullet 1; §9 "Why this order" paragraph; §9 Layer 3 box; §10 D4; §14 "R6 too complex" row

**Issue:** The number "~95%" is used five times in the spec as the residual-covered fraction after Layers 1–2, load-bearing for the D4 decision that R6 (block-level fallback) is "Should" not "Must." No evidence file, probe result, or sampled corpus supports the figure. The spec provides no definition of the denominator (crash classes? file count? affected byte range?).

**Status:** UNVERIFIABLE
**Suggested resolution:** Either (a) add an evidence file (`evidence/crash-class-coverage.md`) with a numbered crash taxonomy and which layer covers each, grounding the 95%, or (b) replace the percentage with a qualitative claim ("most observed crash classes"). Decisions keyed off the number (D4 in particular) should cite the evidence explicitly.

---

### [M4] `isolating: true` on atom nodes may be no-op/redundant — not the lever the spec describes

**Category:** FACTUAL
**Source:** T2 (prosemirror-model source), T3 (docs/discuss.prosemirror)
**Location:** §6 R10; §9 "R10: isolating: true on component nodes"; §10 D8; §16 "Block-editor-ux spec (T3)"

**Issue:** The spec presents `isolating: true` as the control that "prevents backspace/delete from leaking across component boundaries" for the already-`atom: true` `jsxComponent`/`jsxInline` nodes. The prosemirror-model TypeScript definition confirms `isolating` means "the sides of nodes of this type count as boundaries that regular editing operations, like backspacing or lifting, won't cross." The canonical example given in the reference is a **table cell** — a container with content.

For atom (leaf) nodes the cursor cannot enter the node, so most edit operations already stop at the node's sides by construction. `isolating` can still interact with `join`/`lift`/neighbor-merge, but the effect described in the spec ("prevents backspace from deleting into the component") is largely already provided by `atom: true` + default TipTap keymap (`joinBackward`/`selectNodeBackward`). The §16 claim that T3 depends on `isolating: true` for "keyboard navigation patterns that stop at component boundaries" therefore overstates what the flag adds on atoms.

Relevant prior art: discuss.prosemirror threads note that atom + isolating + inline combinations have subtle selection/re-render bugs — so there is also a minor risk that flipping this on has unintended effects.

**Evidence:** `node_modules/prosemirror-model/dist/index.d.ts` (NodeSpec.isolating JSDoc); `discuss.prosemirror.net/t/prevent-split-isolating-nodes/4900` and `…/the-weird-backspacing-functionality-with-inline-nodes/2128`.

**Status:** UNVERIFIABLE (claim is plausible but effect is overstated relative to what the flag guarantees on atoms)
**Suggested resolution:** Either (a) validate with a targeted test (two keyboard cases — arrow across boundary, backspace at adjacent paragraph start — with and without `isolating`) and record results in `evidence/isolating-effect.md`, or (b) soften R10/D8 to "defensive default for future non-atom evolution (T1 Layer 3 will make these non-atom)," which is the load-bearing reason the flag should already be on before the atom→non-atom schema migration.

---

### [M5] `handlers.mdxjsEsm` is left in the codebase with no cleanup task, despite becoming dead in agnostic mode

**Category:** COHERENCE
**Source:** L5, T1
**Location:** §6 R4; §9 "R4: Simplify parseSafe"; §13 "In scope"

**Issue:** R4 calls out one dead-code cleanup (the `parseSafe` brace-retry tier). It does not mention `handlers.mdxjsEsm` at `packages/core/src/markdown/index.ts:450`, which is only reachable when a real `mdxjsEsm` mdast node is produced by `remark-mdx`. Under agnostic mode, ESM tokens are never produced (see M1), so the handler is unreachable.

**Status:** INCOHERENT (partial cleanup — R4 is selective without saying so)
**Suggested resolution:** Add `index.ts:450 handlers.mdxjsEsm` to R4's cleanup list, or state explicitly "retain as defensive no-op in case future strict-mode opt-in re-introduces ESM parsing."

---

## Low Severity

### [L1] Plugin line count inconsistent (~10 vs. ~15 lines)

**Category:** COHERENCE
**Source:** L1
**Location:** §9 Layer 1 box ("~10-line plugin change"); §13 "In scope" ("~15 lines")

**Issue:** Minor inconsistency in described size of the new `remark-mdx-agnostic.ts` plugin.
**Status:** INCOHERENT
**Suggested resolution:** Pick one count and use it consistently. (The example in §9 is 10 lines of body plus imports, hence both can be true — worth stating as "~10 lines of body / ~15 lines total including imports" to resolve.)

---

### [L2] "Three gaps" list in §16 actually enumerates four items

**Category:** COHERENCE
**Source:** L1, Phase-2 reader pass
**Location:** §16 "Migration spec (PR #83)" subsection

**Issue:** Paragraph opens "This spec closes three gaps from the migration:" then lists four numbered bullets (1 jsxInline, 2 R8(h), 3 `{ }` crash class, 4 T1 compatibility).
**Status:** INCOHERENT
**Suggested resolution:** Either update to "closes four gaps" or merge two items (T1 compatibility is more of a downstream unlock than a migration gap).

---

### [L3] "R8(h) block children" is an unclear citation into the migration spec

**Category:** COHERENCE (L7)
**Source:** Cross-reference accuracy
**Location:** §16 "Migration spec (PR #83)" item 2

**Issue:** The audited spec cites "R8(h) block children — paired MDX renders as atom (known gap, partially addressed by making jsxInline available for inline cases)" from the migration spec. The migration spec's R1–R10 table does not contain an R8 with sub-label `(h)`. The nearest matching passage is line 637 of the migration spec's §19.3 caveats: "Block-level GFM (tables, tasklists) inside inline `<Note>...</Note>` silently flattens to inline text…" — that is a different concern (block-in-inline flattening) from "paired MDX renders as atom." The linkage is imprecise.

**Status:** INCOHERENT
**Suggested resolution:** Replace `R8(h)` with a concrete citation (migration SPEC.md:637 or the exact section title) and state the actual limitation being closed (or clarify that jsxInline only touches the inline-rendering half of that caveat, not block-in-inline flattening).

---

### [L4] M5 cites "22/23 MDX round-trip cases" — actual test file has 21 tests

**Category:** COHERENCE
**Source:** T1 (codebase)
**Location:** §7 M5

**Issue:** `packages/app/tests/fidelity/mdx-roundtrip.test.ts` contains 21 `test(…)` blocks. The 22/23 figure comes from `reports/mdx-crdt-roundtrip-fidelity/REPORT.md` ("Of 23 edge cases tested, 22 converge to a stable form"). The metric wording "22/23 MDX round-trip cases from mdx-crdt-roundtrip-fidelity report" is internally correct if read strictly, but implies a 23-case test file.
**Status:** INCOHERENT (minor; wording)
**Suggested resolution:** Reword M5 as "The 23 edge cases from the mdx-crdt-roundtrip-fidelity report (22 converge, 1 known-divergent) retain their current status." Add a line that maps to the 21 concrete tests in `mdx-roundtrip.test.ts` if needed.

---

## Confirmed Claims (coverage summary)

- **`micromark-extension-mdx` = agnostic (no acorn, balanced-brace expressions, supports JSX but not ESM):** CONFIRMED via OSS source read (`mdx/packages/remark-mdx/lib/index.js`, `micromark-extension-mdxjs/lib/index.js` showing acorn import, and web-fetched package readme for `micromark-extension-mdx`).
- **`remark-mdx` bundles `mdxjs`:** CONFIRMED (`remark-mdx/lib/index.js` imports `{mdxjs}`).
- **`MdxJsxFlowElement.name` field exists and can be `null` (fragments):** CONFIRMED (`mdast-util-mdx-jsx/index.d.ts`). R9 correctly defaults to `''`.
- **`parseSafe` is called from `persistence.ts:352` and `agent-sessions.ts:43`:** CONFIRMED.
- **`parseSafe` currently has three tiers (parse → `{` protect retry → raw-text fallback):** CONFIRMED (`packages/core/src/markdown/index.ts:122–139`).
- **`jsxComponent` today is `atom: true, group: 'block'` with `content` attr only:** CONFIRMED (`packages/core/src/extensions/jsx-component.ts`).
- **T1 historically depended on `@tiptap/markdown`, `marked.lexer`, `acorn`, custom `jsxTokenizer`:** CONFIRMED against `specs/2026-04-08-typed-component-nodes/SPEC.md:247,274,287,407,420,488,666,667,668`.
- **Migration spec §17.2 mentions jsxInline as specced:** CONFIRMED (line 420, "Inline nodes (6): … `jsxInline` (atom; `mdxJsxTextElement`)").
- **`protectFromMdx`/PUA sentinels (U+E000–E004) and their semantics:** CONFIRMED (`autolink-void-html-guard.ts:38–43`), matches NG9 in CLAUDE.md.
- **R23 guard retained unchanged is necessary because agnostic mode does not alter JSX tag commit:** CONFIRMED by reading `micromark-extension-mdx-jsx` (same package used by both mdx and mdxjs).

---

## Unverifiable Claims

- **"Layers 1-2 eliminate ~95% of failures"** (§9, §14, D4): see M3 — no measurement was provided or located.
- **"Block-level partial parse does not exist in production"** (§8 ecosystem table): could not be falsified via web search in the time available; plausible, but presented as a negative claim without a citation trail.
- **Mike's PR #105 Option C → this spec's Option C correspondence, Q1–Q5 mapping, and schema.nodeFromJSON adoption** (§16): see H3 — the referenced spec was not readable from this worktree.
- **"22/23 MDX round-trip cases still pass with agnostic mode"** (Q3, §7 M5): the claim is conditional on a probe that hasn't been run yet; Q3 acknowledges this. Not a finding, just noted so the finalizer knows the probe is still a gate.
