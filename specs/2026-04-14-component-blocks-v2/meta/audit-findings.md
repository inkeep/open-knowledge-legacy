# Audit Findings

**Artifact:** specs/2026-04-14-component-blocks-v2/SPEC.md
**Audit date:** 2026-04-14 (second pass)
**Total findings:** 3 (0 high, 2 medium, 1 low)

**Audit scope:** Second-pass coherence + factual verification focused on new sections added after first-pass resolution: §9.0 Precedents #20/#21, §9.7 Option C4 ErrorBoundary, §9.7a CSS variable bridge, §9.14 Nested CodeMirror, §9.15 Context Bridge Registry, NG13 custom-components-deferred, Q9, D12/D13. First-pass findings (H1/H2/M1/M2/M3) are resolved per `meta/_changelog.md` and not re-flagged.

**Verification tiers executed:**
- T1 (own codebase): 13 claims verified across 3 subagent dispatches
- T2 (OSS repos / 3P): fumadocs-ui Tabs/Accordion context architecture verified against `~/.claude/oss-repos/fumadocs` + `node_modules`
- Coherence: All 7 lenses (L1-L7) applied

---

## Medium Severity

### [M1] Residual custom-component-in-P0 references after D9/D10 → NG13 flip

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §2 G3, §3 NG1, §4 P3, §5 user journey P3, §6 M3, §7a CC01-CC06, §9.2 searchTerms, §13 build-registry.ts
**Issue:** Nine locations in the spec still reference `.open-knowledge/components.ts` or custom-component registration as P0 scope, contradicting NG13 and the D9/D10 flip to "not-greenfield" status documented in the decision log (lines ~1326-1345). An implementer reading these sections without cross-referencing the decision log would build the deferred feature. The D9/D10 flip and NG13 entry correctly mark custom components as out-of-scope, but the body text was not fully scrubbed.

Specific locations:

| Section | Line area | Stale content |
|---|---|---|
| §2 G3 | ~47 | Goal references custom component registration |
| §3 NG1 | ~59 | Normative gap includes custom-component interaction |
| §4 P3 | ~77 | Persona P3 (Component contributors) includes end-user custom registration |
| §5 P3 journey | ~114 | User journey for "P3 adding a custom component" |
| §6 M3 | ~230 | Metric references custom component props |
| §7a CC01-CC06 | ~364-372 | Six test scenarios for custom component registration/de-registration |
| §9.2 searchTerms | ~647 | Note about custom component searchTerms |
| §13 In Scope | ~1984 | `build-registry.ts` description includes custom component scanning |

**Current text:** (multiple locations — see table above)
**Evidence:** D9 flip entry (line ~1326): "FLIPPED to NG-tier ... user directive: custom components are out of P0 scope." D10 flip entry (line ~1335): "FLIPPED to NG-tier ... custom components scoped out." NG13 (line ~69): "Custom component registration — deferred. See `evidence/custom-components-deferred.md`."
**Status:** INCOHERENT
**Suggested resolution:** Scrub all nine locations. For each: either (a) remove the custom-component content entirely (§5 P3 journey, §7a CC01-CC06, §13 build-registry.ts custom scanning), (b) add an explicit NG13 cross-reference qualifier ("built-ins only; custom components deferred per NG13"), or (c) narrow the text to built-ins-only scope (§2 G3, §4 P3, §6 M3). The `evidence/custom-components-deferred.md` file already preserves the deferred analysis — these body references are redundant and misleading.

---

### [M2] §9.15.4 `useAncestorContexts` wrapping order inverts Context shadowing for nested same-type compounds

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity) + manual algorithm trace
**Location:** §9.15 Context Bridge Registry, lines ~1834-1856
**Issue:** The `useAncestorContexts` loop iterates from `$pos.depth - 1` (nearest PM ancestor) down to `0` (document root). Each ancestor's entries are prepended via `collected.unshift(...e)`, so the outermost PM ancestor ends up at array index 0. `ContextBridgeProvider` then wraps from index 0 outward — `entries[0]` becomes the innermost React `<Context.Provider>`, and `entries[last]` becomes the outermost.

Net effect: for two nested instances of the same compound (e.g., Tabs-in-Tabs), the great-grandparent's Context value shadows the immediate parent's — the inverse of correct React Context resolution, where the nearest ancestor Provider wins.

The inline comment at line ~1845 says `// innermost ancestor closest to children` but the `unshift` achieves the opposite: outermost ancestor closest to children in the React tree.

**Current text:**
```typescript
if (e) collected.unshift(...e); // innermost ancestor closest to children
```

**Evidence:** Manual trace with Tabs(outer) > Tabs(inner) > Tab(leaf):
1. Loop visits depth `$pos.depth - 1` (inner Tabs) first → `unshift` puts inner's 3 entries at indices [0,1,2]
2. Loop visits lower depth (outer Tabs) → `unshift` puts outer's 3 entries at indices [0,1,2], pushing inner's to [3,4,5]
3. `ContextBridgeProvider` wraps from index 0: outer Tabs contexts become innermost React providers → leaf Tab sees outer TabsContext, not inner TabsContext.

Correct behavior requires `collected.push(...e)` (or reversing the `ContextBridgeProvider` loop), so the nearest PM ancestor's contexts are innermost in the React provider chain.

**Status:** INCOHERENT
**Suggested resolution:** Change `collected.unshift(...e)` to `collected.push(...e)`. This places nearest-ancestor entries at the end of the array; `ContextBridgeProvider`'s wrap-from-start loop makes them the innermost React providers — matching real React Context shadowing. Update the comment to reflect the corrected semantics. This is a latent bug: it won't surface in P0 (no built-in compound nests inside the same compound type), but it would break any future Tabs-in-Tabs or Accordion-in-Accordion scenario and any custom compound nesting.

---

## Low Severity

### [L1] §9.7a `@source` CSS directive path resolves one directory short of `node_modules`

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §9.7a CSS variable bridge, line ~1102
**Issue:** The spec proposes adding `@source "../../node_modules/fumadocs-ui/dist/**/*.js"` to `packages/app/src/globals.css`. Tailwind v4's `@source` directive resolves relative to the CSS file's location. From `packages/app/src/globals.css`, `../../` resolves to `packages/` — but `fumadocs-ui` is hoisted to the repo-root `node_modules/`, not `packages/node_modules/`. The correct relative path is `../../../node_modules/fumadocs-ui/dist/**/*.js` (three levels up to repo root).

**Current text:** `@source "../../node_modules/fumadocs-ui/dist/**/*.js";`
**Evidence:** `realpath` from `packages/app/src/` confirms `../../` → `packages/`. `fumadocs-ui` confirmed at repo-root `node_modules/fumadocs-ui` (Bun hoists to workspace root). No `packages/node_modules/` or `packages/app/node_modules/` directory contains fumadocs-ui.
**Status:** INCOHERENT
**Suggested resolution:** Update path to `../../../node_modules/fumadocs-ui/dist/**/*.js`. Alternatively, use Tailwind v4's `@source` with an absolute path or a path relative to the Tailwind config root if one is configured.

---

## Confirmed Claims (summary)

### T1 Codebase Verification — §9.14 CodeMirror dependencies

All CM6 packages referenced in §9.14 (`@codemirror/view`, `@codemirror/state`, `@codemirror/language`, `@codemirror/lang-markdown`) confirmed present in `packages/app/package.json`.

### T1 Codebase Verification — §9.7 ErrorBoundary and §9.7a CSS claims

| Claim | Status |
|---|---|
| `observers.ts:461` — Observer B bare `mdManager.parse` with try/catch | CONFIRMED |
| `EditorContent.tsx` renders NodeViews as sibling React portals (breaking Context inheritance) | CONFIRMED — TipTap's `ReactNodeViewRenderer` uses `ReactDOM.createPortal` |
| `schema-invariant.test.ts` exception allowing `bridgeId` addition | CONFIRMED — additive attr with `default: ''` follows R10 |
| fumadocs-core `<Accordions>` without context = graceful degradation | CONFIRMED — fumadocs-core checks context with fallback |
| `fumadocs-ui/style.css` line count ~3296 | CONFIRMED |
| `fumadocs-ui/css/preset.css` line count ~312 with `@variant dark` | CONFIRMED |

### T1 Codebase Verification — CSS variable claims

| Claim | Status |
|---|---|
| `fumadocs-ui/css/preset.css` declares `--color-fd-*` CSS variables | CONFIRMED |
| `fd-steps`/`fd-step` utility classes in fumadocs preset | CONFIRMED |
| Callout oklch values in fumadocs code match spec's description | CONFIRMED |
| `globals.css` currently has no fumadocs-specific CSS variable bridge | CONFIRMED (clean — bridge is spec-proposed, not yet implemented) |

### T2 3P Verification — fumadocs Context architecture

| Claim | Status |
|---|---|
| fumadocs-ui Tabs uses React Context (TabsContext with 3 context entries) | CONFIRMED — `createContext(null)` in fumadocs-ui tabs source |
| fumadocs-ui Accordion root uses ~4 context entries | CONFIRMED — Radix Accordion primitives use `createContextScope` with AccordionContext + CollapsibleContext |
| Radix `createContextScope` creates scope-specific Contexts with `__scopeTabs`/`__scopeAccordion` props | CONFIRMED — pattern verified in `@radix-ui/react-context` source |

### Coherence — Confirmed consistency

| Check | Status |
|---|---|
| §9.0 Precedent #25 (Context Bridge Registry) consistent with §9.15 design body | CONFIRMED |
| §9.0 Precedent #24 (Nested CodeMirror in ProseMirror) consistent with §9.14 design body | CONFIRMED |
| D12 (Context Bridge Registry) locked decision consistent with §9.15 | CONFIRMED |
| D13 (CM-in-PM direct dispatch) locked decision consistent with §9.14 | CONFIRMED |
| Q9 (React Compiler + dynamic Context.Provider chains) correctly identified as open | CONFIRMED |
| NG13 (custom components deferred) consistent with D9/D10 flip and evidence file | CONFIRMED (body text inconsistencies flagged as M1) |
| §9.7 Option C4 ErrorBoundary: `key` prop on primitiveProps for auto-retry | CONFIRMED — standard React error-recovery pattern |
| §9.14 `updating` flag for CM↔PM loop prevention | CONFIRMED — matches prosemirror-codemirror-block and CodeMirror 6 docs |
| FR-22 through FR-28 requirement numbering sequential and non-overlapping | CONFIRMED |

## Unverifiable Claims

### §9.15 Context Bridge Registry — `useSyncExternalStore` reactivity guarantees

The spec claims `useSyncExternalStore` subscription to the context bridge store will cause consumer NodeViews to re-render when a publisher ancestor mounts/unmounts. This is architecturally sound (React guarantees re-render on snapshot change), but the actual reactivity depends on the store implementation correctly triggering subscriptions. Not verifiable without implementation.

### §9.14 Nested CodeMirror — `computeChange` performance for large code blocks

The spec references the `computeChange` function (from prosemirror-codemirror-block prior art) for computing minimal CM transactions from PM updates. Performance for very large code blocks (10K+ lines) is untested. The claim of "minimal mutations" is directionally correct but unquantified.

### §9.7a CSS variable bridge — ~80 LoC estimate

The spec estimates the CSS variable bridge at "~80 LoC in globals.css." This is a design-time estimate for not-yet-implemented code. The actual line count will depend on implementation choices (how many variables are bridged, whether dark-mode overrides are separate, etc.).

### Q9 — React Compiler interaction with dynamic Context.Provider chains

Correctly flagged as an open question. The spec acknowledges uncertainty about whether React Compiler will optimize or deoptimize the `ContextBridgeProvider` pattern. Not verifiable without implementation and profiling.
