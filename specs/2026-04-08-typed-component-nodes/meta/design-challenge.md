# Design Challenge Findings

**Artifact:** specs/2026-04-08-typed-component-nodes/SPEC.md
**Challenge date:** 2026-04-08
**Total findings:** 5 (2 high, 2 medium, 1 low)

---

## High Severity

### [H] Finding 1: react-docgen-typescript is unnecessary complexity for a 20-component spike

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** Section 3.2 (react-docgen-typescript Integration), Section 5 (Tech Stack), Phase 1 (Implementation Order)
**Issue:** The spec introduces react-docgen-typescript as a build-time dependency to auto-extract prop schemas from TypeScript interfaces. This requires loading the TypeScript compiler API at project startup, adds disk caching logic (OQ3), and introduces a new failure mode (R3: "fails on complex TypeScript types"). For a greenfield spike with ~20 known components, the auto-extraction machinery is more complex than the problem it solves.
**Current design:** "react-docgen-typescript auto-extracts prop schemas at project load" (Section 1, Resolution); `extractComponentProps(filePaths): Map<string, PropDef[]>` server-side at startup (Section 3.2)
**Alternative:** Manual `PropDef[]` co-located with each component registration. Component authors declare their prop schema alongside the component export — a one-time ~5-line object per component. For 20 components, this is ~100 lines of hand-written schemas vs. an entire extraction pipeline (263KB dependency, TypeScript compiler at runtime, disk cache invalidation logic, propFilter workarounds for children/callbacks, dual ReactNode detection patterns per `evidence/react-docgen-typescript-behavior.md`).

Manual registry example:
```typescript
registerComponent('Callout', {
  component: Callout,
  props: [
    { name: 'type', type: 'enum', enumValues: ['warning', 'error', 'info', 'success', 'idea'], required: false, defaultValue: 'info' },
    { name: 'title', type: 'reactnode', required: false },
    { name: 'children', type: 'reactnode', required: true },
  ],
  displayName: 'Callout',
  category: 'content',
});
```

**Trade-off:**
- **Gained:** Eliminates react-docgen-typescript dependency (263KB + TypeScript compiler), removes OQ3 entirely (no startup time concern), removes R3 (no extraction failure mode), removes the `skipChildrenPropWithoutDoc: false` footgun, removes dual ReactNode detection logic, instant startup.
- **Lost:** Auto-discovery of user-defined components. Component authors must write ~5 lines of PropDef alongside their component. This is the Quaternary success criterion: "No schema files, no JSON config, no extension code. The TypeScript interface IS the schema."

**Why this challenges the Decision Log:** The spec doesn't have a Decision Log entry for "auto-extraction vs manual registry" — it's treated as a given (Section 1 Resolution, OQ1). The Quaternary success criterion ("The TypeScript interface IS the schema") assumes auto-extraction is the only path to low-friction component registration. But a manual co-located schema IS also low-friction — one object literal per component, no build step, no runtime compiler. The auto-extraction path can be added later as an optimization when the component count grows beyond what manual maintenance supports (50+), or when third-party/user plugin components need zero-config discovery.

**Status:** CHALLENGED
**Suggested resolution:** Re-evaluate whether react-docgen-typescript is a P0 requirement or a future optimization. Consider shipping with manual PropDef for the spike's 20 built-in components, deferring auto-extraction to when user-defined component discovery becomes a real requirement.

---

### [H] Finding 2: Children dedentation step is solving a non-problem and introduces parsing fragility

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — a careful implementer would flag this)
**Location:** Section 3.5 (Markdown Serialization), D10 (Decision Log), R4 and R8 (Risks)
**Issue:** The spec identifies children indentation inside JSX as a risk (R4, R8) and prescribes a `dedentCommonIndentation()` function before `marked.lexer()`. The stated reason: "2-space indent would approach code block threshold" (Section 3.5, line 289). This is factually incorrect per the CommonMark spec — code blocks require 4-space indentation, and 2-space indent is safe. The dedentation step adds complexity (nested indentation stacking, interaction with list indentation, edge cases with mixed indent/no-indent lines) to solve a problem that doesn't exist at 2-space indent depth.

Furthermore, real-world fumadocs and agents-docs MDX files use 2-space indented children inside JSX tags and compile correctly without any dedentation.

**Current design:** "Strips common indentation from children (critical — 2-space indent would approach code block threshold)" (Section 3.5 step 3); R8: "Indentation normalization breaks markdown semantics in children" (identified as Medium likelihood, Medium impact)
**Alternative:** Serialize children with 2-space indentation (matching existing fumadocs convention). Parse children as-is — the JSX tokenizer already extracts the full block before marked sees it, so marked.lexer() processes children in isolation where 2-space indent is harmless. If zero-indent is preferred for maximum safety, serialize children flush-left (valid MDX, less readable).

**Trade-off:**
- **Gained:** Eliminates R8 entirely. Removes ~20-30 lines of dedentation logic + its test cases. Removes a class of edge-case bugs (what happens with mixed indentation? tabs vs spaces? nested components where indentation stacks to 4+?). Simplifies the parse pipeline.
- **Lost:** Nothing functional. Dedentation at 2-space depth provides no protection because 2 < 4 (CommonMark code block threshold).

**Nuance — nested indentation stacking IS a real concern:** If component A contains component B, and both serialize with 2-space indent, B's children are at 4 spaces. This DOES trigger code blocks. But the solution is NOT a general dedentation function — it's to serialize children flush-left (zero indent), which eliminates the stacking problem entirely. The spec's approach (indent then dedent) is a round-trip through unnecessary complexity.

**Status:** CHALLENGED
**Suggested resolution:** Choose one: (a) serialize children flush-left (zero indent), eliminating all indentation concerns, or (b) serialize with 2-space indent and skip dedentation since 2-space is safe for single-level nesting. For (a), nested components are safe at any depth. For (b), document that nested same-name components at depth 3+ may stack indentation past the code block threshold and handle that specific case.

---

## Medium Severity

### [M] Finding 3: Single-extension attribute namespace creates semantic confusion, not a CRDT problem

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** D6 (Decision Log), Section 3.3 (TipTap Node Spec Evolution), `evidence/tiptap-dynamic-attributes.md`
**Issue:** D6 resolves OQ4 by declaring ALL prop names from ALL registered components as top-level attributes on a single node type. Investigation confirmed that y-prosemirror only stores/syncs non-default attributes (no per-node CRDT bloat). However, the approach creates **semantic confusion**: a Callout node's schema permits setting `persist` (a Tabs prop) or `href` (a Card prop). Nothing prevents `editor.commands.updateAttributes('jsxComponentEditable', { href: 'foo' })` on a Callout node. The spec's PropPanel UI filters by component, but programmatic access (agent writes, source mode, tests) has no guardrails.

**Current design:** "Single extension with formal attributes derived from registry at init. Props are top-level schema attributes" (D6)
**Alternative:** Two approaches address this:
1. **Runtime validation in updateAttributes:** Wrap attribute updates with a registry check — reject attributes that don't belong to the node's `componentName`. Lightweight, no schema change.
2. **Store non-standard props in a single JSON `props` attribute:** Trade per-prop LWW for semantic cleanliness. The spec's Decision Log (OQ4 Option A) rejected this because it "loses attribute-level LWW." But for most real-world editing (one user editing one component), the LWW loss is immaterial — concurrent prop editing of the same component is a P1 scenario, not P0.

**Trade-off:**
- Option 1: Keeps attribute-level LWW. Adds ~10 lines of validation. No architectural change.
- Option 2: Simplifies the attribute model drastically (one `props: JSON` attribute). Loses concurrent prop editing (two users editing different props of the same component → LWW conflict). The spec rates concurrent editing as "Secondary" success criteria, but the attribute-level LWW is the architectural foundation for it.

**Status:** CHALLENGED
**Suggested resolution:** The current design is likely correct for the long-term architecture (attribute-level LWW is the right foundation). But add runtime validation (Option 1) to prevent semantic confusion in agent write paths and programmatic access. This is a documentation/guardrail gap, not a design gap.

---

### [M] Finding 4: The spec bundles Layer 2+3 but the risk profiles are asymmetric

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — a project manager would flag timeline risk)
**Location:** D16 (Decision Log), Section 8 (Fallback), Section 4 (Implementation Order)
**Issue:** D16 bundles Layer 2 (prop panels) and Layer 3 (inline children) into one spec. The rationale: "Children editing is what makes the component system feel real." The fallback (Section 8) acknowledges Layer 2 alone is viable. Investigation confirms Layer 3 is architecturally additive — Phase 3 changes don't break Phase 2.

However, the **risk profiles are asymmetric**:
- **Phase 2 (Layer 2):** Well-understood patterns. Registry, prop panel, slash commands. Prior art from 12 CMS systems (`evidence/cms-prior-art-synthesis.md`). All key assumptions confirmed (A1-A4). Estimated: 3-5 days.
- **Phase 3 (Layer 3):** ProseMirror content holes + children parsing + dedentation + nested JSX in children + fragment serialization. Partially-confirmed assumption A5. R4 and R8 are medium-likelihood risks. The `marked.lexer()` → `helpers.parseBlockChildren()` chain (D10) is a novel composition not used by any existing TipTap extension.

The spec's "Pace" section says "Moderate. Take care with ProseMirror node spec design." But Phase 3's specific risks (children parsing, indentation, nested components) are more than "take care" — they're the technically novel part.

**Current design:** "Layer 2+3 ship together" (D16, Medium confidence)
**Alternative:** Spec Layer 2 as P0 with a hard ship gate. Spec Layer 3 as P0.5 (same spec, separate completion criteria). This isn't deferral — it's phased delivery with a fallback checkpoint. If Phase 2 takes longer than expected, Layer 3 can be deprioritized without the spec being incomplete.

**Trade-off:**
- **Gained:** Explicit acknowledgment that Phase 3's risk profile differs. Clear checkpoint between phases. Implementer can ship Layer 2 value early.
- **Lost:** Nothing — the spec already has this fallback in Section 8. The challenge is that D16 frames it as a backup plan rather than a planned phasing strategy.

**Status:** CHALLENGED
**Suggested resolution:** Reframe D16 from "ship together, fall back if needed" to "ship in phases, Layer 2 first with explicit checkpoint before Layer 3." The implementation order (Phase 0→1→2→3→4) already supports this. The change is framing, not architecture.

---

## Low Severity

### [L] Finding 5: Agent Constraints EXCLUDE clause may be too broad for observer sync changes

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 13 (Agent Constraints)
**Issue:** The EXCLUDE clause states: "The server-side persistence and observer layers should require ZERO changes (if they do, something is wrong with the serialization compatibility)." The STOP_IF clause reinforces: "Observer sync tests from PR #6 start failing → serialization format has changed → debug before proceeding."

Investigation confirmed that observer sync IS transparent because MarkdownManager dispatches to each extension's renderMarkdown(). However, the observer tests from PR #6 likely test the OLD serialization format (fenced code blocks). Phase 0 changes the format to raw JSX. These tests WILL need updates — not because observers changed, but because the expected markdown output changed. The Agent Constraint "ZERO changes to observer layer" is correct, but the STOP_IF trigger ("observer sync tests start failing") will fire during Phase 0 and the implementer needs to know this is expected, not a regression.

**Current design:** "Observer sync tests from PR #6 start failing → serialization format has changed → debug before proceeding"
**Alternative:** Clarify that Phase 0 test fixture updates (from fenced blocks to raw JSX) are expected — the STOP_IF should read: "Observer sync tests from PR #6 start failing *after* Phase 0 test fixture migration → debug before proceeding." Phase 0's own step 6 ("Verify observer sync") already accounts for this, but the Agent Constraint doesn't.

**Trade-off:** Purely a documentation clarification. No architectural impact.

**Status:** CHALLENGED
**Suggested resolution:** Update the STOP_IF clause to distinguish between expected format migration (Phase 0) and unexpected observer breakage (Phases 1-4).

---

## Confirmed Design Choices (summary)

**DC1 (Simpler alternative):**
- **Raw JSX on disk (D1 revised):** Holds. Fumadocs compatibility is a hard requirement. The fenced format is genuinely incompatible with the MDX ecosystem. Evidence is thorough (`evidence/fumadocs-serialization-compatibility.md`).
- **Two node types (D8):** Holds. Universal CMS pattern confirmed across 12 systems. Single-node-type alternatives are either unreliable (runtime atom toggling) or architecturally inferior (Option B from `evidence/node-type-split-architecture.md`).
- **acorn+acorn-jsx (D7):** Holds. 6x smaller than @babel/parser with identical correctness. No credible simpler alternative exists for JSX parsing.
- **Version B tokenizer (D12):** Holds. Version A has a known latent bug with nested same-name tags. Version C (acorn) adds no benefit over Version B for tokenization. The ~80-line regex approach is genuinely the sweet spot.
- **Attribute-level LWW (D2):** Holds. This is the correct foundation for concurrent editing. The CRDT overhead concern (attribute bloat) was investigated and found to be schema-level only — y-prosemirror's delta-based sync means unused attributes consume no per-node storage or network traffic.
- **Children as structural content, not props (D3, D9):** Holds. Universal consensus from 12 CMS systems. Storybook's attempt to put children in prop panels has been a bug farm since 2020.

**DC2 (Stakeholder gap):**
- **Observer sync transparency:** Verified. MarkdownManager dispatches to extension-provided renderMarkdown() — observer layer is format-agnostic.
- **Unregistered component fallback (D4):** Sound. Ensures any MDX file opens without errors regardless of component availability.

**DC3 (Framing validity):**
- **Problem statement:** The five complication dimensions (no prop editing, no discovery, no type safety, no children editing, whole-string LWW) are independently verifiable from the current Layer 1 code. The intersection is genuine — fixing any one without the others leaves the editor feeling like "markdown with code fences." The Resolution (Layer 2+3 together) follows from the Complication. Removing any single dimension doesn't invalidate the proposed solution.
- **Urgency:** Real. The spec builds on proven foundation (PR #6, 23 E2E + 22 server tests). The cost of inaction is remaining at Layer 1 indefinitely — usable but not productizable.
