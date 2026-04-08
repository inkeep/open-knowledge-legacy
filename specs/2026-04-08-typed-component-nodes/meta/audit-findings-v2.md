# Audit Findings (v2 — post scope-narrowing)

**Artifact:** specs/2026-04-08-typed-component-nodes/SPEC.md
**Audit date:** 2026-04-08
**Trigger:** Spec was narrowed in session 4 to "built-ins only" (no custom component discovery, no drop-in fumadocs support, no palette). This audit re-runs L1–L7 against the current spec state with focus on stale references introduced or left behind by the scope narrowing, plus a fresh code-trace of the Phase 1 extraction strategy against the actual installed `fumadocs-ui` package.
**Total findings:** 11 (2 high, 6 medium, 3 low)
**Prior audits:** `meta/audit-findings.md` (initial), `meta/post-merge-audit.md` (PR #7 integration). All prior findings logged as resolved in `meta/_changelog.md`.

---

## High Severity

### [H1] Phase 1 step 4 cannot extract props from `fumadocs-ui` as described — the npm package ships only `dist/*.js` + `*.d.ts`, no `.tsx` source

**Category:** FACTUAL (decision-implicating)
**Source:** T3 (3P dependencies — installed package inspection) + L4 (Evidence-synthesis fidelity)
**Location:** SPEC.md §4 Phase 1 step 4

**Issue:** Phase 1 step 4 says:

> "For fumadocs-ui components, point extraction at the installed `fumadocs-ui/src/components/*.tsx` paths (source is shipped with the package — confirmed from `reports/fumadocs-full-pipeline/evidence/d3-built-in-components.md`)."

This claim is wrong. The installed `fumadocs-ui` package's `package.json` declares `"files": ["dist/*", "css/*"]` — only the compiled `dist/` and `css/` directories ship to npm. There is **no `src/` directory** and **no `.tsx` source** in the installed package. The directory `dist/components/` contains `accordion.js`, `accordion.d.ts`, `accordion.d.ts.map`, etc. — compiled JavaScript with type declarations, no source.

The referenced evidence file (`reports/fumadocs-full-pipeline/evidence/d3-built-in-components.md`) is reading the **GitHub source repo** (`packages/radix-ui/src/components/`), not the installed package. Its top line literally says `**Sources:** fumadocs-ui (packages/radix-ui) source code`. The spec author conflated "source visible in the GitHub repo" with "source shipped to npm". They are not the same thing — the GitHub repo's `packages/radix-ui/src/components/*.tsx` files are not present in the installed `node_modules/fumadocs-ui/` tree.

**Why this breaks Phase 1:** `react-docgen-typescript` requires `.tsx` source — it cannot read `.d.ts` files (the spec already acknowledges this constraint for `@inkeep/docskit` in the same step). Of the 15 built-in components:
- **Fumadocs-ui (10 families):** unworkable as written. Same constraint as docskit. Needs hand-written PropDef.
- **Docskit (3):** already correctly handled via hand-written PropDef.
- **Shadcn-installed (2):** workable — shadcn copies `.tsx` files into `init_spike/src/components/`, which is local source. react-docgen-typescript can read these.

**Net effect:** Of the 15 built-ins, only 2 (Mermaid, Audio) are auto-extractable. The other 13 must be hand-written. This collapses the rationale for keeping `react-docgen-typescript` in Phase 1 — the design challenger's "manual PropDef for the spike's known components" alternative (rejected in session 3 with the rationale "user wants to validate full architecture pipeline") now applies to 13 of 15 components anyway.

**Evidence:**
- `/Users/edwingomezcuellar/projects/open-knowledge/docs/node_modules/fumadocs-ui/package.json`: `"files": ["dist/*", "css/*"]`
- `ls /Users/edwingomezcuellar/projects/open-knowledge/docs/node_modules/fumadocs-ui/dist/components/` shows only `*.js` + `*.d.ts` + `*.d.ts.map` files (no `.tsx`)
- `reports/fumadocs-full-pipeline/evidence/d3-built-in-components.md` lines 5, 11–12: explicitly references `packages/radix-ui/src/...` (GitHub source tree), not the installed package
- SPEC.md §3.2 lines 138–140 declares `propFilter: prop => { if (prop.parent?.fileName.includes('node_modules')) return false; ... }` — even if fumadocs-ui DID ship source, this filter would discard every prop declared inside `node_modules/fumadocs-ui/...` because `prop.parent.fileName` for an own-declared prop points to the file containing the declaring interface

**Status:** CONTRADICTED (factual claim about package contents is false)

**Suggested resolution (decision-implicating — escalate to user):**

Two viable paths, both reopen the session-3 design challenge decision:

1. **Hand-write PropDef for all 13 fumadocs+docskit built-ins, keep react-docgen-typescript only for the 2 shadcn components.** Update Phase 1 step 4 to: "For fumadocs-ui and docskit components, hand-write PropDef in `built-ins.ts` (these packages ship only `dist/*.js` + `*.d.ts`). For shadcn-installed components, react-docgen-typescript extracts from the locally-copied `.tsx` files." Drop the cache step (Phase 1 step 5) or scope it to only the shadcn components — overhead may not be worth it for 2 components.
2. **Drop react-docgen-typescript from Phase 1 entirely** and ship hand-written PropDef for all 15. Defer auto-extraction to Future Work, where it would naturally pair with custom component discovery (which already needs to handle the same node_modules-without-source case). This collapses the entire `src/server/component-introspection.ts` module out of P0.

Either way, also update §3.2's `propFilter` example so it doesn't suggest a node_modules filter is correct for the chosen extraction strategy. If react-docgen-typescript stays for shadcn components only, the filter is fine (shadcn components live in local `src/components/`). If it stays for fumadocs (option requires vendoring source), the filter must be changed.

Also update §11 R3 ("react-docgen-typescript fails on complex TypeScript types") — its likelihood/impact may need reassessment if extraction is now scoped to 2 components instead of 15.

---

### [H2] D15's resolution text still says "User components auto-discovered from project dir" — directly contradicts the new built-ins-only scope

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions) + L5 (Summary coherence)
**Location:** SPEC.md §9 Decision Log row D15 (line 709)

**Issue:** The last sentence of D15 reads:

> "...No divergent implementations — fumadocs is canonical for any component it ships. **User components auto-discovered from project dir.**"

This explicitly contradicts the session-4 scope narrowing. §6 In Scope (line 530) now states "15 components hardcoded in editor source, no user-facing custom component discovery." §6 Out of Scope (line 540) explicitly lists "Custom component discovery (user-defined components beyond the 15 built-ins) — P0 ships built-ins only." The Future Work table (line 567) describes custom component discovery as Explored/2-4 days.

D15 is the spec's authoritative reference for the built-in component set, and an implementer reading the Decision Log would see D15's last sentence and reasonably conclude that auto-discovery is in scope. The Decision Log is supposed to be the load-bearing specification for what gets built; this is exactly the kind of stale text that the audit lens L1 catches.

**Current text:** "...No divergent implementations — fumadocs is canonical for any component it ships. User components auto-discovered from project dir."

**Evidence:**
- §6 In Scope line 530: "Built-in components only — 15 components hardcoded in editor source, no user-facing custom component discovery."
- §6 Out of Scope line 540: "Custom component discovery (user-defined components beyond the 15 built-ins) — P0 ships built-ins only."
- §6 Future Work (Explored) line 567: "Custom component discovery ... 2–4 days ... When 'drop the editor into an existing fumadocs docs site' becomes a value prop"
- meta/_changelog.md Session 4: "Built-ins only in P0. Custom component discovery, drop-in fumadocs support, and drag-and-drop component palette all move to Future Work."

**Status:** INCOHERENT (Decision Log row contradicts the rest of the spec)

**Suggested resolution:** Delete the trailing sentence "User components auto-discovered from project dir." from D15. Replace with something like: "Custom component discovery is Future Work (see §6 Future Work, Explored tier)." Auto-fix.

---

## Medium Severity

### [M1] D5 still describes the pre-revision built-in set — superseded by D15 in the same Decision Log table

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** SPEC.md §9 Decision Log row D5 (line 699)

**Issue:** D5 reads: "Built-in components for P0 | **Callout + Tabs/Tab + 1-2 more** | Medium | Validates multi-prop, enum, boolean, children patterns". This is the original 5-component set before D15 expanded to the 15-component, 3-layer sourcing strategy. Both D5 and D15 are present in the Decision Log table. An implementer reading D5 would see contradicting guidance from D15 ten rows later.

The session-2 changelog confirms D15 explicitly superseded D5: "D15 revised (major): Expanded from 6 components to 3-layer sourcing strategy."

**Current text (D5):** "Built-in components for P0 | Callout + Tabs/Tab + 1-2 more | Medium"

**Evidence:**
- D15 (line 709): "Built-in component set (3-layer sourcing) | Fumadocs (canonical, 15) ... Docskit ... Shadcn ..."
- meta/_changelog.md Session 2: "D15 revised (major): Expanded from 6 components to 3-layer sourcing strategy"
- §6 In Scope: 15-component list
- §4 Phase 1: "the 15-component set from D15"

**Status:** INCOHERENT (superseded by D15, not removed or marked superseded)

**Suggested resolution:** Mark D5 as superseded with a strikethrough and pointer: "~~Built-in components for P0~~ → **Superseded by D15**". Or remove D5 entirely and renumber subsequent decisions. (Auto-fix; the supersession is unambiguous.)

---

### [M2] Phase 4 has duplicate step number "4" — and the second step references "Note/Warning/Tip" components that D15 explicitly excluded

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions) + reader pass (Phase 2 of audit protocol)
**Location:** SPEC.md §4 Phase 4 lines 483–484

**Issue:** Two distinct issues compounded:

1. **Numbering bug:** Phase 4 has two step "4"s — the new COMPONENTS.md generation step (line 483, added in session 4) and the pre-existing E2E test suite step (line 484). Subsequent steps (5, 6) renumber from there, leaving Phase 4 with steps 1, 2, 3, 4, 4, 5, 6.

2. **Stale component list:** Phase 4 step "4" (the second one, line 484) reads:
   > "Full E2E test suite covering all component types (**Callout, Tabs/Tab, Note/Warning/Tip**) × all edit paths..."

   `Note`, `Warning`, and `Tip` are docskit components that D15 explicitly excludes from the built-in set. From `evidence/component-inventory-and-gaps.md` (section "Docskit components NOT used"): "`Note` — Callout alias — would diverge from fumadocs Callout. Use `<Callout type="info">`. `Warning` — Callout alias — would diverge. Use `<Callout type="warning">`. `Tip` — Callout alias — would diverge. Use `<Callout type="idea">`."

   An implementer reading this Phase 4 step would either (a) try to register Note/Warning/Tip as P0 built-ins (violating D15) or (b) get confused that the test list doesn't match the registry. The list should reference the actual D15 built-ins — Callout, Tabs/Tab, plus a representative sampling of others (Card, Steps, Accordion, etc.).

**Current text:** "4. Full E2E test suite covering all component types (Callout, Tabs/Tab, Note/Warning/Tip) × all edit paths (WYSIWYG props, WYSIWYG children, source mode, agent write, disk bridge)."

**Evidence:**
- D15 (line 709) lists fumadocs-ui Callout (with multiple type values) as canonical, and explicitly excludes Note/Warning/Tip
- `evidence/component-inventory-and-gaps.md` lines 92–105: "Docskit components NOT used (avoiding divergence) — Note, Warning, Tip"
- Phase 4 numbering: lines 483 and 484 both start with "4."

**Status:** INCOHERENT (numbering + stale component list)

**Suggested resolution:** Renumber Phase 4 to 1, 2, 3, 4 (COMPONENTS.md), 5 (E2E suite), 6 (test-fixture), 7 (Verify). Update the E2E suite step's parenthetical to reflect actual built-ins, e.g.: "all component types from D15 (Callout, Tabs/Tab, Card/Cards, Steps/Step, Accordion, plus at least one each from docskit and shadcn — Video, Mermaid)" or similar representative coverage. Auto-fix.

---

### [M3] OQ1, OQ2, OQ3 resolutions still reference pre-narrowing project paths and superseded project decisions (TQ29, TQ31)

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions) + L5 (Summary coherence)
**Location:** SPEC.md §12 Open Questions table — OQ1 (line 752), OQ2 (line 753), OQ3 (line 754)

**Issue:** Three Open Questions still carry resolution text from earlier sessions that references either (a) the `src/components/` scan approach (now superseded by direct imports in `built-ins.ts`) or (b) project-level decision IDs (TQ29, TQ31) that are no longer the source of truth:

| OQ | Current resolution | Why stale |
|----|--------------------|-----------|
| OQ1 | "**Resolved** → Init-time scan of `src/components/`. Static during session..." | Phase 1 doesn't scan `src/components/`. It imports the 15 built-ins directly from `built-ins.ts`. There is no scan. |
| OQ2 | "**Resolved** → `src/components/` for spike. Fumadocs convention (`mdx-components.tsx` + `src/components/`). Layered discovery (TQ29) for P0." | The mdx-components.tsx convention and "layered discovery TQ29" are exactly what session 4 moved to Future Work. None of this happens in P0. |
| OQ3 | "**Resolved** → Non-issue for spike (4-5 components, <1s). Disk cache for P0 (TQ31)." | Phase 1 step 5 specifies the cache concretely. The TQ31 reference points to a project document that may or may not still describe this correctly; the Phase 1 step is now authoritative. Also "4-5 components" is wrong — the spike is now 15. (And see [H1] — extraction may be scoped to only 2 components if that finding is accepted, in which case react-docgen-typescript startup time is even less of a concern.) |

These three resolutions are the first thing an implementer planning Phase 1 reads when scanning the OQ table for design intent. They contradict the actual Phase 1 plan.

**Current text:** See above table.

**Evidence:**
- §4 Phase 1 step 2 (line 443): "Create `src/editor/components/built-ins.ts` — the canonical list of built-in components. Imports the 15 components from their sources..."
- §6 Out of Scope (line 540): Custom component discovery (the mdx-components.tsx path) is Future Work
- §4 Phase 1 step 5 (line 446): "Cache extracted PropDef to `.openknowledge/component-cache.json` (gitignored)..."

**Status:** INCOHERENT (resolution text predates session 4 narrowing)

**Suggested resolution:** Update all three:
- OQ1: "**Resolved** → Static (imported from `src/editor/components/built-ins.ts`). Schema construction deferred until after registry loads (see Phase 1 step 0, R12). Restart required to pick up new built-ins."
- OQ2: "**Resolved** → Built-ins live in `src/editor/components/built-ins.ts` (editor source code). Custom component discovery is Future Work (see §6 Future Work, Explored tier)."
- OQ3: "**Resolved** → Phase 1 step 5 caches extracted PropDef to `.openknowledge/component-cache.json`. (Note: cache is irrelevant for hand-written PropDef — see [H1] for the scoped extraction question.)"

Auto-fix M3 modulo H1's resolution.

---

### [M4] D15's "Fumadocs (canonical, 15)" count contradicts Phase 1's "fumadocs canonical 10"

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** SPEC.md §9 D15 (line 709), §4 Phase 1 scope (line 439), §6 In Scope (line 530)

**Issue:** D15 says "Fumadocs (canonical, 15): Callout, Tabs/Tab, Card/Cards, Steps/Step, Accordion/Accordions, ImageZoom, Files/File/Folder, TypeTable, Banner, InlineTOC". Phase 1's scope paragraph (line 439) says "the 15-component set from D15 (fumadocs canonical 10 + docskit gap fill 3 + shadcn gap fill 2)". §6 In Scope lists 10 fumadocs families.

If D15's "(canonical, 15)" is correct, the total is 15 + 3 + 2 = 20, not 15. If Phase 1's "(canonical, 10)" is correct, the total is 10 + 3 + 2 = 15 (which matches §6, "15 components hardcoded in editor source").

The list in D15 itself contains 10 entries when counted as families and 15 when sub-components are counted separately (Tabs+Tab, Card+Cards, Steps+Step, Accordion+Accordions, Files+File+Folder split into individual components add 5 sub-components on top of the 10 families). So D15 is using sub-component counting; everywhere else in the spec uses family counting. The total of 15 is internally consistent only with family counting throughout.

(Side note: D15's list includes "Files/File/**Folder**" but the canonical evidence file `evidence/component-inventory-and-gaps.md` and the corresponding fumadocs source list only `Files` and `File` — no `Folder` component. This is a separate minor staleness — see [L2].)

**Current text:**
- D15: "Fumadocs (canonical, 15)"
- Phase 1: "fumadocs canonical 10 + docskit gap fill 3 + shadcn gap fill 2"
- §6 In Scope: lists 10 fumadocs families

**Evidence:**
- §6 In Scope line 530–533 shows the canonical 10 fumadocs families
- `evidence/component-inventory-and-gaps.md` lines 24–43 lists 15 individual sub-components (no Folder), grouped into 10 families

**Status:** INCOHERENT (counting unit varies between rows)

**Suggested resolution:** Standardize on family counting throughout. Update D15 to "Fumadocs (canonical, 10 families / 15 sub-components)". Or pick one number consistently. Auto-fix.

---

### [M5] §3.2 prop filter excludes `node_modules` — this directly contradicts Phase 1 step 4 even before considering [H1]

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions) + T3 (3P dependencies)
**Location:** SPEC.md §3.2 lines 138–144 (propFilter code) and §4 Phase 1 step 4

**Issue:** §3.2 declares the `propFilter`:

```ts
propFilter: (prop) => {
  // Hide internal React props
  if (prop.parent?.fileName.includes('node_modules')) return false;
  // Hide callback props (onClick, onChange, etc.)
  if (prop.type.name.startsWith('(')) return false;
  return true;
}
```

This is the standard "filter inherited HTML/React props" pattern, designed for the case where the components-being-extracted live in the user's local `src/` and the filter rejects props inherited from `@types/react`'s `HTMLAttributes`. It works fine for that case.

But Phase 1 step 4's strategy (independent of [H1]) is to "point extraction at the installed `fumadocs-ui/src/components/*.tsx` paths" — i.e., to extract from files that themselves live inside `node_modules`. For a fumadocs Callout component, the prop `type` is declared in `CalloutProps` interface in `node_modules/fumadocs-ui/src/components/callout.tsx`. Its `prop.parent.fileName` would contain `node_modules/...` → the filter returns `false` → the prop is dropped.

So the filter is doubly broken for the fumadocs path:
1. It can't filter inherited props from fumadocs-ui's own components from desired props (both have `node_modules` in the path)
2. It would reject every own-declared fumadocs prop, leaving an empty PropDef list

This is a smaller problem than [H1] (which says fumadocs source isn't shipped at all), but it's a separate contradiction within the spec that needs fixing regardless of how [H1] is resolved.

**Current text:** Code block in §3.2 lines 135–145.

**Evidence:**
- `evidence/react-docgen-typescript-behavior.md` line 38: "forwardRef adds `ref` and `key` from `@types/react` (filterable via `prop.parent?.fileName`)" — confirms parent.fileName is set to the file declaring the parent interface
- §4 Phase 1 step 4 contradicts this filter for any extraction from node_modules

**Status:** INCOHERENT

**Suggested resolution:** Couple this with [H1]'s resolution. If extraction is scoped to local files only (shadcn-installed in `src/components/`), the filter is correct as-is. If any extraction from `node_modules` survives, the filter must be rewritten to filter only `@types/react`-style inherited DOM props (e.g., `prop.parent?.fileName.includes('@types/')` or a more specific list). Update the code example in §3.2 to match the chosen path.

---

### [M6] OQ2's "Leaning" text in §3.2 still proposes "Option C — Both built-in components ship with the editor, user components are in the project"

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** SPEC.md §3.2 lines 160–164 (the OQ2 inline discussion, separate from the OQ12 table row)

**Issue:** Inside §3.2, immediately after the propFilter code block, there's an inline discussion of OQ2 with three options and a "Leaning":

> "OQ2: Where do component .tsx files live?
> - Option A: `init_spike/src/editor/components/` (co-located with editor code)
> - Option B: `init_spike/content/.openknowledge/components/` (user-land, in the content project)
> - Option C: Both — built-in components ship with the editor, user components are in the project
> - **Leaning:** Option C matches PROJECT.md: 'Built-in just means ships pre-installed. Users add custom components the same way.'"

The "Leaning: Option C" is now stale on two counts:
1. P0 doesn't support user-added custom components — that's the entire scope-narrowing decision
2. The PROJECT.md quote about "Users add custom components the same way" describes the approach moved to Future Work

This is a duplicate of the OQ2 row in §12, but it's the *prose* version inside §3.2 and an implementer reading top-to-bottom would encounter it before they get to §12. The session-1 audit (audit-findings.md M2) caught the table-row version of this issue at OQ2, but the inline version in §3.2 was not addressed and was not in scope for that earlier audit.

**Current text:** Lines 160–164 (see quote above).

**Evidence:**
- §6 Out of Scope line 540: "Custom component discovery"
- meta/_changelog.md Session 4: "Built-ins only in P0"

**Status:** INCOHERENT (predates scope narrowing)

**Suggested resolution:** Replace the "OQ2" inline discussion in §3.2 with a single resolved sentence: "Built-in components live in `src/editor/components/built-ins.ts` (editor source code). Custom component discovery is Future Work (§6)." Or remove the OQ2 discussion from §3.2 entirely and let the §12 table row carry it (after [M3] also fixes that row). Auto-fix.

---

## Low Severity

### [L1] Phase 4 step 4 (COMPONENTS.md generation) is vague on what "build time" means in this project

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity) + actionability check
**Location:** SPEC.md §4 Phase 4 step 4 (line 483)

**Issue:** The new step says "Regenerated at build time from the registry, so the file is always in sync with `built-ins.ts` — no manual maintenance." The intent is clear (auto-generated from the registry, never edited by hand), but "build time" is ambiguous in a Vite + Bun spike where the development workflow doesn't have a traditional production build hook before deployment. An implementer would need to choose:

- `package.json` `prebuild` script (only runs on `bun run build`, not on `bun run dev`)
- `package.json` `postinstall` script (runs once after `bun install`)
- Vite plugin hook (runs on dev server start)
- Standalone script (`bun run gen:components`) that the user must remember to run
- Server-side: triggered as part of `loadComponentRegistry()` startup (runs when the editor server boots)

The spec doesn't pick one. This is a Phase 4 polish step so vagueness is tolerable, but the section also commits to "the file is always in sync with `built-ins.ts`" — that *promise* depends on which trigger you pick. A `prebuild` script doesn't keep the file in sync during development; only a server-startup hook would.

Also: the step says to "create AGENTS.md if it doesn't exist" but doesn't say what AGENTS.md should *contain* beyond the link to COMPONENTS.md. AGENTS.md is a known convention (Aider/Cursor/Claude Code), but the spec doesn't reference that convention, so the implementer would have to research the appropriate template.

**Current text:** Line 483 (Phase 4 step 4).

**Evidence:** No tooling spec exists; implementation requires implementer choice.

**Status:** INCOHERENT (action description has a soft promise that depends on an unspecified mechanism)

**Suggested resolution:** Specify the trigger. Recommended: server-side, in `loadComponentRegistry()` after react-docgen-typescript runs (or after hand-written PropDef are loaded, depending on [H1] resolution). This guarantees freshness on every dev server boot. Add: "Generation runs as part of `loadComponentRegistry()` server startup, so COMPONENTS.md is regenerated whenever the editor server boots — no separate build step needed." For AGENTS.md, either reference the existing convention (e.g., "follow the AGENTS.md convention from agents.md/Aider/Cursor") or punt to "create a minimal stub if it doesn't exist".

Optional: confirm whether COMPONENTS.md should be committed (so agents reading the repo via `cat`/`Read` see the current state) or gitignored (and regenerated locally). Convention is to commit generated docs.

---

### [L2] D15 lists "Files/File/**Folder**" but the canonical evidence file lists only Files + File

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity)
**Location:** SPEC.md §9 D15 (line 709)

**Issue:** D15's fumadocs canonical list reads "Files/File/Folder". The corresponding entries in `evidence/component-inventory-and-gaps.md` (lines 38–39) list only `Files` (file tree container) and `File` (individual file node) — no Folder component. The fumadocs-ui source has `files.tsx` exporting `Files`, `File`, and `Folder` (per `reports/fumadocs-full-pipeline/evidence/d3-built-in-components.md`), so Folder *exists* in fumadocs-ui — but the spec's evidence file omits it, and the spec's §6 In Scope list omits it too:

> "Fumadocs (canonical): Callout, Tabs/Tab, Card/Cards, Steps/Step, Accordion/Accordions, ImageZoom, **Files/File/Folder**, TypeTable, Banner, InlineTOC"

Wait — §6 In Scope DOES include Folder. Let me re-check.

Actually, §6 In Scope (line 532) reads: `Files/File/Folder, TypeTable, Banner, InlineTOC` — Folder IS listed in §6. The discrepancy is between:
- D15 ✓ + §6 In Scope ✓ (both list Folder)
- `evidence/component-inventory-and-gaps.md` ✗ (does not mention Folder)

So the evidence file is the stale one. Either the evidence file should be updated to include Folder as a sub-component, or D15/§6 should drop Folder. Given that fumadocs-ui's `files.tsx` does export Folder (per the upstream evidence in `reports/fumadocs-full-pipeline/evidence/d3-built-in-components.md` line 61), the sound fix is to update `evidence/component-inventory-and-gaps.md`.

**Current text:**
- D15 + §6: "Files/File/Folder"
- `evidence/component-inventory-and-gaps.md` line 38–39: lists only Files + File

**Evidence:** See above.

**Status:** INCOHERENT (evidence file omits a sub-component that the spec includes)

**Suggested resolution:** Add a row to `evidence/component-inventory-and-gaps.md`:
```
| **Folder** | Folder node inside Files tree | GREEN (client) | — |
```
Auto-fix.

---

### [L3] `evidence/component-inventory-and-gaps.md` "agents-docs Custom Components (auto-discovered by registry)" section still says auto-discovery is the mechanism

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity)
**Location:** `evidence/component-inventory-and-gaps.md` lines 134–147

**Issue:** The evidence file has a final section titled "agents-docs Custom Components (auto-discovered by registry)" that lists OptionCard, BigVideo, SkillRule, ComparisonTable, NumberedStepsTOC, AutoTypeTable and concludes:

> "These exist in `~/agents/agents-docs/src/components/mdx/` and are NOT built-in. The registry auto-discovers them from the user's component directory."
>
> "These validate the registry's extensibility — no special handling needed. If their .tsx files are in the component discovery path, they appear automatically."

Both sentences describe the auto-discovery mechanism that session 4 moved to Future Work. An implementer reading this evidence file (which the SPEC.md still cites in D15 and §6) would think auto-discovery is implemented in P0.

**Current text:** Lines 134–147 of `evidence/component-inventory-and-gaps.md`.

**Evidence:**
- §6 Out of Scope (SPEC.md line 540): "Custom component discovery ... P0 ships built-ins only"
- §6 Future Work (Explored, line 567): "Custom component discovery ... 2-4 days"
- The agents-docs custom components ARE the canonical example listed in the Future Work entry as the reference corpus for "Drop-in fumadocs project support"

**Status:** STALE (evidence section describes a path that's no longer in P0)

**Suggested resolution:** Either (a) delete the "agents-docs Custom Components" section from the evidence file (it's no longer relevant to P0), or (b) reframe it as "Reference corpus for Future Work — these will be auto-discovered when custom component discovery ships (see SPEC.md §6 Future Work)". Option (b) preserves the inventory for when Future Work is picked up. Auto-fix; recommend (b) to keep the inventory data alive.

---

## Confirmed Claims (summary)

**T1 (Own codebase, post-PR-#7):**
- Phase 1 step 0 (refactor schema construction order) accurately reflects the current `TiptapEditor.tsx:53` and `persistence.ts:28` constraint — CONFIRMED via prior post-merge audit and code trace
- Phase 0 byte-identity test (OS06, OS07) correctly addresses Observer B early-exit dependency — CONFIRMED via post-merge audit's PM-H2 resolution
- §3.6 prop panel typing-defer protocol is correctly specified — CONFIRMED via post-merge audit's PM-H1 resolution

**T3 (3P dependencies — installed package inspection):**
- `@inkeep/docskit` does ship only `dist/*.js` + `*.d.ts` — CONFIRMED in spec's own evidence (and acknowledged in Phase 1 step 4 with hand-written PropDef workaround)
- shadcn install pattern copies `.tsx` files into local `src/components/` — CONFIRMED standard pattern
- `react-docgen-typescript` requires `.tsx` source — CONFIRMED in `evidence/react-docgen-typescript-behavior.md`

**Test scenario coverage (post scope-narrowing):**
- PP01–PP06 (Prop Panel): all use Callout (a built-in) — sound for built-ins-only scope
- IC01–IC06 (Inline Children): all use Callout — sound
- RT01–RT06 (Round-Trip): mix of Callout + generic — sound
- OS01–OS08 (Observer Sync): Callout + generic, post-merge additions cover the new race conditions — sound
- CE01–CE06 (Concurrent Editing): generic + post-merge additions — sound
- CR01–CR06 (Component Registry): use Callout and "component with X" generics — sound. Note: CR02 says "Props match: type (enum: warning|error|info)" which is a 3-value subset of Callout's actual 6 types per evidence — but this is a representative test sample, not load-bearing, and matches PP01's spec language.
- AW01–AW03 (Agent Write): Callout + generic — sound
- DB01–DB02 (Disk Bridge): generic — sound

**No test scenarios assume custom component discovery.** All test IDs use either named built-ins or "component with X" generics. The scope narrowing is internally consistent at the test layer.

**Risk and assumption cascade after scope narrowing:**
- R3 ("react-docgen-typescript fails on complex TypeScript types") — should be reassessed after [H1] resolution. If extraction scopes to 2 components, R3 is much smaller. If it stays at 15 (with vendored fumadocs source), R3 is unchanged.
- R12 (schema construction order) — unaffected by scope narrowing; still applies because the registry must load before schema construction regardless of source.
- A1 (react-docgen-typescript ReactNode detection) — unaffected by scope narrowing; still validated.
- A6, A7, A8 — unaffected by scope narrowing; still pending Phase 0/2 verification.

**No new risks or assumptions surfaced** by the scope narrowing beyond [H1]. The scope change is genuinely "remove scope", not "remove and add".

---

## Unverifiable Claims

| Claim | What was checked | Why unverifiable |
|---|---|---|
| Whether `@inkeep/docskit` ships source via a separate `@inkeep/docskit/src` subpath export | Checked installed package files in `~/agents/node_modules/@inkeep/docskit/dist/` (per evidence file) | Did not run `npm view @inkeep/docskit files` to enumerate published files. Spec already commits to hand-written PropDef for docskit, so this doesn't affect H1's resolution. |
| Whether `bun add fumadocs-ui` would set up a different package layout than the `docs/node_modules/fumadocs-ui/` instance I inspected | Inspected only the existing `docs/node_modules/fumadocs-ui` instance (different sub-project, but same npm package) | The npm package is the same regardless of which workspace installs it; package.json `files` field is authoritative. Unlikely to differ. |
| Whether the "fumadocs canonical 15" count in D15 refers to a future expansion that includes Folder + 4 others not in the evidence file | Searched evidence file and §6 In Scope | Inconsistent counting unit (families vs sub-components) is the more parsimonious explanation. Recorded as M4 + L2. |

---

## Routing recommendation for /assess-findings

**Pure corrections (auto-fix after verifying severity):**
- [H2], [M1], [M2], [M3], [M4], [M5], [M6], [L1], [L2], [L3] — all coherence/staleness fixes that don't change the spec's design intent. The session-4 changelog is the source of truth for the intended scope; these findings just align the spec text with that intent.

**Decision-implicating (escalate to user before auto-fix):**
- **[H1]** is the only finding that requires user judgment. It is not a wording fix — it invalidates Phase 1 step 4's mechanical plan and partially reopens the design challenger's session-3 finding ("react-docgen-typescript is unnecessary complexity for a 20-component spike"). At session 3, that challenge was rejected with the rationale "user wants to validate the core architecture pipeline." But the rationale assumed react-docgen-typescript would be exercised against ~15 components. The factual reality (only 2 of 15 are auto-extractable) substantially weakens the rationale. The user should pick:
  1. **Hand-write PropDef for fumadocs+docskit (13 components), keep extraction for shadcn (2)** — minimal disruption, but the "validate full pipeline" rationale now applies to a 2-component test
  2. **Drop react-docgen-typescript from P0 entirely, hand-write all 15** — collapses an entire module, simplifies Phase 1, defers extraction to Future Work alongside custom component discovery
  3. **Vendor fumadocs-ui source into the spike** (e.g., copy the 10 fumadocs `.tsx` files into `src/editor/components/vendored/fumadocs-ui/`) — keeps extraction but adds maintenance burden and licensing/update considerations

After the user picks, [M5] and [L1] (and possibly [M3]'s OQ3 update) should be revised to align with the chosen path.
