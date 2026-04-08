# Design Challenge Findings — v2

**Artifact:** specs/2026-04-08-typed-component-nodes/SPEC.md
**Challenge date:** 2026-04-08
**Previous challenge:** meta/design-challenge.md (v1, 5 findings)
**Total findings:** 6 (3 high, 2 medium, 1 low)

**Scope change triggering re-challenge:** Session 4 narrowed P0 to built-ins only. Custom component discovery, drop-in fumadocs support, drag-and-drop palette, and MCP endpoint moved to Future Work. Phase 4 now generates `COMPONENTS.md` from the registry for agent discovery. The 15-component built-in set from revised D15 is unchanged from v1.

**Core thesis of this challenge:** The scope narrowing makes the spec look simpler but the resulting architecture cannot be validated against the declared reference corpus (agents-docs). Two of v1's findings (H1 react-docgen-typescript, M4 phased delivery) need to be re-examined under the new scope — and H1 in particular is strengthened by a new factual finding about how fumadocs-ui 16.1.0 is actually published.

---

## High Severity

### [H] Finding 1: Built-ins-only scope cannot validate the component system against the canonical reference corpus (agents-docs)

**Category:** DESIGN
**Source:** DC3 (Framing validity) + DC2 (Stakeholder gap — product)
**Location:** §1 Resolution, §2 Success Criteria, §6 In Scope / Out of Scope, D15 (built-in set)

**Issue:** The spec's evidence base repeatedly leans on `~/agents/agents-docs` as the reference real-world MDX corpus — `evidence/component-inventory-and-gaps.md` lists it as a primary source, the "drop-in fumadocs" Future Work item names it as the validation target, and the project memory's world model is built on analysis of that codebase. But the built-ins-only scope excludes **more than half** of the components that corpus actually uses. Empirically:

```
Component usage counts in agents-docs/content/**/*.mdx (measured 2026-04-08):

COVERED BY BUILT-INS (412 uses):
  Step (126), Tab (59), Steps (37), Tabs (26), Cards (26),
  Accordion (16), CodeGroup (13), Video (12), Callout (12),
  Accordions (7)  [plus ImageZoom implied by <Image> wrapper usage]

NOT COVERED — fall through to unregistered raw-string display (~500 uses):
  Note (79), Card (75 — see Finding 3 collision), Snippet (72),
  SkillRule (49), Tip (44), APIPage (43), ComparisonTable (41),
  AutoTypeTable (23), Image (35 — custom wrapper), Warning (7),
  OptionCard (5), OptionCards (2), InkeepSidebarChat (10),
  InkeepEmbeddedChat (5), InkeepChatButton (5), InkeepModalChat (4),
  BigVideo (1), NumberedStepsTOC (1), CompressionModelsTable (1), ...
```

Out of ~910 component occurrences in the reference corpus, only ~412 (~45%) would be rendered as typed component nodes. The other ~498 (~55%) — including the three most-used callout variants (Note, Tip, Warning) — would fall through to the unregistered raw-string path. That IS the Layer 1 experience the spec explicitly calls "opaque code snippets, not visual building blocks" (§1 Complication).

**Current design:** "P0 ships with built-in components only — the 15-component set from D15" (§4 Phase 1). "Any `<CustomComponent>` in content falls back to the unregistered raw-string renderer" (§6 Out of Scope).

**What this does to the Success Criteria:**

- **Primary ("Component editing feels native"):** Demonstrable only on synthetic test fixtures. Open a real agents-docs page and ~55% of blocks are raw-JSX code boxes — the editor feels like Layer 1 for more than half the content. The Primary criterion has no production-shape verification path in §7 Test Scenarios; every test scenario uses `<Callout>` or abstract "typed component."
- **Quaternary ("Component registry is extensible"):** Not even tested in P0 scope. Adding a new component requires modifying `built-ins.ts` editor source code — that is explicitly a developer workflow, not "write a React component and register it in one line" as §2 claims for the Quaternary promise. The promise is about user-land extensibility; the scope ships only editor-internal extensibility.

**Complication dimension check (DC3):** The Complication names five gaps: no prop editing UI, no component discovery, no type safety, no editable children, whole-string LWW. After the scope narrowing, the spec no longer addresses "no component discovery" — it replaces discovery with a hardcoded built-in set. Four of five dimensions still hold; one dimension has been removed from the Resolution, unacknowledged. The Resolution should be re-stated more narrowly, or the Complication's "no component discovery" line should be deleted.

**Alternative:**

Option A — **Narrow the built-in set and validate on real corpus.** Ship P0 with 5-6 carefully chosen built-ins that exercise every architectural dimension once (Callout for enum+reactnode children; Tabs+Tab for parent/child composition; Card for optional reactnode title; Steps+Step for ordered containers) — but with a **mandatory "real content" test track** using agents-docs pages. Accept that many blocks will show as raw-string fallback during testing; the P0 goal is proving the architecture, not covering the corpus. Expand the built-in set only after P0 ships.

Option B — **Cut the built-in set in half and move custom discovery INTO P0.** A minimal custom-discovery path (read a single editor-specific config file like `.openknowledge/components.ts` that exports a static map of `name → { componentPath, propDef }`) is smaller than building 15 built-ins. With this, the editor can be pointed at agents-docs, users register their 7 custom components, and the spec's claims are validated against ~90% of real usage.

Option C — **Restate the spec honestly.** Keep the built-ins-only scope, but rewrite §1, §2, and §6 to acknowledge that (a) the reference corpus (`agents-docs`) will NOT be the validation target, (b) the Quaternary "extensible" criterion is descoped to "editor-internal extensibility," and (c) a realistic P0 validation target is something like "a synthetic test fixture document exercising all 15 built-ins."

**Trade-off:**

| Option | Gained | Lost |
|---|---|---|
| A (narrow+validate) | Real-corpus validation, fewer integrations to ship, unblocks Success Criteria | Less visual impressiveness in demos; only 5-6 components work |
| B (custom discovery in P0) | Real-corpus validation, covers ~90% of agents-docs, Quaternary criterion delivered | Expands P0; the custom discovery mechanism is the part the team already decided to defer |
| C (honest restatement) | No scope change, just clarifies what's being shipped | Success criteria become noticeably weaker; spec becomes harder to sell as "product-grade" |

**Recommendation:** Option A is the smallest move that preserves the product claim. The spec has already identified the architectural patterns it wants to validate (enum, reactnode, children, parent/child containers, required props). 5-6 components exercise all of those exactly once. Shipping 15 built-ins that nobody has validated against real content is the wrong trade — it looks thorough but compounds risk across 15 integrations while doing nothing for validation.

**Why this challenges the Decision Log:** D15 chose 15 built-ins with rationale "no divergent implementations — fumadocs is canonical for any component it ships." That rationale is about **which components to pick if you're picking many** — not about **how many components are needed for P0 validation**. There is no decision-log entry that justifies "15 components in P0" over "5 components in P0." The inflation from v1's D15 (6 components: Callout + Tabs/Tab + Note/Warning/Tip) to revised D15 (15 components) happened as sourcing analysis, not as a scope decision. The spec should have a decision on **P0 built-in set size** separate from the **canonical source** decision.

**Status:** CHALLENGED
**Suggested resolution:** Add a new Decision (D17) on P0 built-in set size. Re-evaluate D15 under that lens. Either narrow the built-in set and add a real-corpus test track, or move minimal custom discovery into P0, or restate the Success Criteria honestly.

---

### [H] Finding 2: react-docgen-typescript cannot run against the installed fumadocs-ui package — prior H1 rejection reasoning has collapsed

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + factual verification
**Location:** §3.2, §4 Phase 1 step 4, D15, Tech Stack, `evidence/react-docgen-typescript-behavior.md`

**New factual evidence:** Phase 1 step 4 states:

> "For fumadocs-ui components, point extraction at the installed `fumadocs-ui/src/components/*.tsx` paths (source is shipped with the package — confirmed from `reports/fumadocs-full-pipeline/evidence/d3-built-in-components.md`)."

This is **factually incorrect** against the actually-installed fumadocs-ui 16.1.0 package. Direct verification:

```
$ ls .../fumadocs-ui@16.1.0/.../node_modules/fumadocs-ui/
css/  dist/  LICENSE  node_modules/  package.json  README.md
                                       ^^^^^^^^^^^^^^ no src/

$ ls .../fumadocs-ui/dist/components/
accordion.d.ts    accordion.d.ts.map    accordion.js
banner.d.ts       banner.d.ts.map       banner.js
callout.d.ts      callout.d.ts.map      callout.js
card.d.ts         ...                   card.js
...

$ find .../fumadocs-ui -name '*.tsx'
(empty — zero results)
```

fumadocs-ui 16.1.0 ships **only** compiled `.js` + `.d.ts` in `dist/components/` — no `.tsx` source. react-docgen-typescript (which parses `.tsx` source using the TypeScript compiler) cannot extract props from this package.

The evidence file cited for "source is shipped" (`reports/fumadocs-full-pipeline/evidence/d3-built-in-components.md`) describes the **fumadocs GitHub repo** layout at `packages/radix-ui/src/components/*.tsx` — NOT the **published npm package** layout at `dist/components/*.d.ts`. This is a misread of the source evidence. A published npm package for a UI library compiling TypeScript → JS + .d.ts is completely standard; fumadocs-ui is not unusual here. The same is true for `@inkeep/docskit` (the spec already acknowledges docskit ships only `.d.ts`).

**Implications for the existing spec:**

| Component group | Count | Source available? | react-docgen-typescript works? |
|---|---|---|---|
| fumadocs-ui canonical 10 | 10 | ❌ `.d.ts` only | ❌ No |
| docskit gap-fill 3 | 3 | ❌ `.d.ts` only (spec already acknowledges) | ❌ No |
| shadcn Mermaid + Audio | 2 | ✅ `.tsx` copied into `src/components/` via `npx shadcn add` | ✅ Yes |
| **Total** | **15** | | **2 / 15 (13%)** |

**Current design:** "react-docgen-typescript auto-extracts prop schemas at project load" (§1 Resolution). Phase 1 step 4 tells the implementer to run extraction against fumadocs-ui source files that don't exist in the installed package.

**Alternative:** Hand-write PropDef for all 15 built-ins. The math shifts completely from the v1 H1 rejection:

- v1 rejection reasoning (per changelog session 2): "user wants to validate core architecture pipeline, not just the spike's known components — react-docgen-typescript stays."
- New reality: 13 of 15 built-ins need hand-written PropDef anyway. The "pipeline" only processes 2 components (Mermaid, Audio) — both of which are shadcn-installed files that the team controls. These are the only components where auto-extraction runs. For 13% of the component set, the toolchain adds: ~263KB dependency, TypeScript compiler at runtime, disk cache invalidation (`.openknowledge/component-cache.json`), schema-construction-order refactor (R12), propFilter workarounds, dual ReactNode detection, startup time (`OQ3`, dismissed as "non-issue for spike"), and an entire new failure mode (R3).

**Trade-off:**

| Gained by removing react-docgen-typescript in P0 | Lost |
|---|---|
| Kills R3 (extraction failure mode) | Need to hand-write 2 PropDefs (Mermaid, Audio) that would otherwise auto-generate |
| Kills OQ3 (startup perf concerns) | Lose the "auto-extraction pipeline" that custom discovery would eventually reuse |
| Kills the schema-construction-order refactor (R12) *partially* — the refactor is driven by "schema depends on registry" which stays, but the registry becomes a static import instead of an async load, so the server/browser split simplifies significantly | — |
| Removes a 263KB dependency and TypeScript compiler at runtime | — |
| Removes the `component-cache.json` machinery (invalidation, mtime checks, rebuild triggers) | — |
| Removes the "fumadocs source is shipped" assumption that is already proven false | — |
| Eliminates the confusion between "source in repo" vs "source in published package" for future contributors | — |

**Why this challenges the Decision Log:** There is no Decision Log entry for "auto-extraction vs manual PropDef" (same as v1). The original v1 H1 rejection was recorded in the session-2 changelog but was never elevated to a formal decision. The factual premise of the rejection ("validate the pipeline on all components") is now false on factual evidence: fumadocs-ui 10 components CANNOT flow through the pipeline in the installed-package world, so the pipeline is validated only on 2 components — which is not meaningfully "validating a pipeline."

**Note on v1 H1 relitigation rule:** The design-challenge-protocol says "Relitigate with no new evidence → if Decision Log shows thorough rejection with strong evidence, and you have no new data, the decision holds." This finding has NEW data: the factually-verified fumadocs-ui 16.1.0 published package layout. The v1 rejection was based on a misread evidence file. The new finding is not relitigation — it is a correction to the factual premise.

**Status:** CHALLENGED
**Suggested resolution:** Formally decide auto-extraction vs. manual PropDef as D17 with the corrected factual record. If keeping react-docgen-typescript, fix Phase 1 step 4 to describe what it actually does (extract only from shadcn-copied files in `src/components/`). If removing, simplify Phase 1 to hand-written PropDef for all 15 built-ins, drop the cache infrastructure, and move the dependency to Future Work (custom component discovery will need to re-evaluate the extraction approach against its own constraints).

---

### [H] Finding 3: Silent namespace collision — agents-docs custom `<Card>` has incompatible props with fumadocs `<Card>`

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — customer-facing engineer)
**Location:** §3.8 (Unregistered Component Fallback), §3.5 (Markdown Serialization parse flow), D4

**Issue:** The spec's unregistered-fallback path assumes: component name in content matches a registered name → render as typed node; otherwise → raw-string fallback. It does not define a policy for components whose tag name DOES match a built-in but whose prop shape is incompatible.

Concrete collision found in agents-docs:

```tsx
// agents-docs/src/components/mdx/card.tsx (CUSTOM)
interface CardProps {
  title: string;          // required STRING
  icon?: string;          // optional STRING (e.g., "brand/GitHub" → brand icon component)
  href?: string;
  children?: React.ReactNode;
  description?: React.ReactNode;
  external?: boolean;
  className?: string;
  color?: string;
}
```

```ts
// fumadocs-ui/dist/components/card.d.ts (BUILT-IN)
// Inferred from fumadocs Card API
interface CardProps {
  title: ReactNode;       // required REACTNODE
  icon?: ReactNode;       // optional REACTNODE
  href?: string;
  description?: ReactNode;
  children?: ReactNode;
}
```

Collisions:
1. `title`: string (custom) vs ReactNode (built-in) — string is assignable to ReactNode, works by accident
2. `icon`: string (custom, e.g., `"brand/GitHub"`) vs ReactNode (built-in) — string `"brand/GitHub"` renders as literal text, not as the brand icon component
3. `color`: exists in custom, not in built-in — falls off during round-trip, silently dropped
4. `external`: exists in custom, not in built-in — silently dropped
5. `description`: ReactNode in both, but custom one has specific rendering around it — works by accident

**Observable behavior** when the spec's built-ins-only editor opens an agents-docs page:

- `<Card title="GitHub" icon="brand/GitHub" href="/github" color="#F05032" external>` (the agents-docs shape) matches the registered built-in `Card`
- acorn parses the JSX, the parser sees matching name → promotes to `jsxComponentEditable` with attributes `{ componentName: 'Card', title: 'GitHub', icon: 'brand/GitHub', href: '/github', color: '#F05032', external: true }`
- The node view renders **fumadocs Card** with these attributes
- `icon` prop receives `"brand/GitHub"` as a string — fumadocs Card expects ReactNode, so it renders the literal string "brand/GitHub" instead of the branded icon
- `color` and `external` are either silently ignored (if the registered Card's PropDef doesn't list them) or stored as unknown attributes that pollute the node
- **Round-trip:** on save, `renderMarkdown` reconstructs `<Card>` JSX from the built-in's PropDef — if `color` and `external` aren't in the PropDef, they are **dropped from disk**. This is silent data loss.

**Current design:** "Components that appear in markdown but aren't in the registry fall back to Layer 1 behavior." But this logic is keyed on **component name**, not on **prop-shape compatibility**. The spec has no collision policy.

**Why built-ins-only scope makes this worse:** If custom discovery were in scope, the user's `Card` would be discovered from their `mdx-components.tsx`, auto-registered with the correct PropDef, and would override the built-in (or shadow it). With built-ins-only, the user's custom Card has no path into the registry — it can only be matched by name to the built-in, creating the collision.

**Alternative policies (spec must pick one):**

A. **Name + signature matching.** Registry lookup checks `componentName` AND a signature (e.g., hash of required prop names). If signature mismatches, fall back to unregistered raw-string path. Safe but may over-fallback.

B. **Built-in names are reserved.** The 15 built-in names (`Callout`, `Tabs`, `Tab`, `Card`, `Cards`, `Steps`, `Step`, `Accordion`, `Accordions`, `ImageZoom`, `Files`, `File`, `Folder`, `TypeTable`, `Banner`, `InlineTOC`, `Video`, `Frame`, `CodeGroup`, `Mermaid`, `Audio`) are treated as "owned" by the editor — user content using those tag names is expected to match the built-in shape. Documented loudly.

C. **Preserve unknown attributes.** Even when name matches a built-in, preserve unknown attributes as additional node attributes so round-trip doesn't drop data. Render with the known subset. Logs a warning.

D. **Fallback on any unknown attribute.** If the JSX has any attribute not in the built-in's PropDef, fall back to unregistered raw-string. Avoids collision but makes built-ins brittle to minor prop additions.

**Recommendation:** C is the minimal safe fix (no data loss) combined with B (documented reservation). C preserves round-trip byte-identity even when the user's component is semantically different from the built-in. B tells users that the 15 built-in names are reserved and they should name their custom components differently (e.g., `ProjectCard`, `AgentsDocsCard`) — this is a sharp edge but is honest about the built-ins-only scope.

**Trade-off:**
- **Gained:** No silent data loss on round-trip. No silent visual regression (C preserves attributes; a future custom-discovery path can then pick the right component).
- **Lost:** Editor renders the built-in Card when the user expected their custom Card. But this is inevitable with built-ins-only — the user's Card can't be in the registry.

**Status:** CHALLENGED
**Suggested resolution:** Add a decision on collision policy (C + B recommended). Add to §3.8 an explicit description of the collision case. Add a test scenario ("RT07: Component matching built-in name but with extra/incompatible props — attributes preserved, no data loss on round-trip"). Add to §6 Out of Scope an explicit note: "P0 does NOT detect semantic incompatibility between a content component and a built-in of the same name — users should rename custom components that share names with the 15 built-ins, or defer to custom discovery (Future Work)."

---

## Medium Severity

### [M] Finding 4: COMPONENTS.md is strictly worse than committing `component-cache.json` for agent discovery

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** §4 Phase 4 step 4, Future Work "MCP endpoint" item

**Issue:** The spec already generates structured PropDef data in `component-cache.json` (Phase 1 step 5). Phase 4 step 4 adds a second artifact — `init_spike/COMPONENTS.md` — regenerated from the same registry, as the "cheap near-term alternative" to the MCP endpoint. Linked from CLAUDE.md/AGENTS.md for agent discovery. But COMPONENTS.md has four problems that `component-cache.json` does not:

1. **Lossy.** Markdown prose for structured data loses precision. An agent parsing "Type: `'warning' | 'error' | 'info'`" from markdown is one string format away from a parse break. JSON with `{ "type": "enum", "enumValues": ["warning", "error", "info"] }` is unambiguous.
2. **Redundant.** The same information exists in `component-cache.json`. Two sources of truth for the same data invites drift — especially since the cache is gitignored (per Phase 1 step 5) but COMPONENTS.md is committed.
3. **Stale-prone.** The spec says "Regenerated at build time" but doesn't specify which build: `bun run check`? `vite dev`? A manual script? A git pre-commit hook? None of these is "the build" in a Bun/TipTap project. If the regeneration trigger isn't wired automatically on every code path that changes the registry, COMPONENTS.md decays silently while `built-ins.ts` changes.
4. **Not queryable.** An agent asking "what are the valid values for `Callout.type`?" has to: (a) know COMPONENTS.md exists, (b) read it, (c) grep for the Callout section, (d) parse the markdown to find the enum. An agent reading `component-cache.json` uses standard JSON parsing. For an MCP-compatible workflow, JSON is already the serialization format.

**Current design:** Phase 4 step 4 — generate `COMPONENTS.md`, link from `CLAUDE.md` / `AGENTS.md`. Phase 1 step 5 — generate `component-cache.json`, add to `.gitignore`.

**Alternative — three flavors, ordered by preference:**

A. **Commit `component-cache.json` instead of gitignoring it.** Remove the gitignore line. Change the file from a caching artifact to a committed manifest. Add a brief comment at the top: "GENERATED FROM `built-ins.ts` — do not edit by hand." Update CLAUDE.md/AGENTS.md to point at `component-cache.json` directly. Agents parse JSON natively; no lossy markdown conversion needed. If COMPONENTS.md is still desired for human readability, generate it FROM the committed JSON during docs build (where "docs build" is a separate concern from the editor runtime).

B. **Drop COMPONENTS.md entirely.** Accept that agent discovery needs a queryable source, skip the near-term markdown stopgap, and commit `component-cache.json` (per A). The MCP endpoint in Future Work becomes a simple HTTP wrapper around reading this file.

C. **Keep both files but make `COMPONENTS.md` a pre-commit hook output from the committed cache.** Eliminates drift — the markdown is derived from the JSON, the JSON is the source of truth, the pre-commit hook enforces sync.

**Trade-off:**
- **A:** Smallest change. One gitignore line removed, one Phase 4 step simplified. No lossy conversion.
- **B:** Even smaller — deletes Phase 4 step 4 entirely.
- **C:** Preserves human-readable docs while fixing the drift problem. Slightly more setup.

**Recommendation:** A. The argument for COMPONENTS.md is human readability in the git repo, but `component-cache.json` is also human-readable when pretty-printed — and it's what an agent can actually query. The file size is trivial (~3KB for 15 components with PropDef), so the "cache" framing is a red herring for the built-ins-only scope.

**Why this challenges the Decision Log:** Phase 4 step 4 is described as "the cheap near-term alternative to the MCP endpoint" — but the cheaper alternative is a committed JSON file, which is even closer to what the MCP endpoint will eventually serve. COMPONENTS.md is introducing a new artifact format that will need to be deprecated when the MCP endpoint ships. A committed JSON file is forward-compatible with the MCP endpoint.

**Status:** CHALLENGED
**Suggested resolution:** Replace Phase 4 step 4 with "Commit `init_spike/.openknowledge/components.json` (rename from `component-cache.json` for clarity). Remove the gitignore entry. Update `CLAUDE.md` and create/update `AGENTS.md` to point at this file for component registry discovery. The file is the source of truth for agent component knowledge; MCP endpoint (Future Work) will serve it via HTTP."

---

### [M] Finding 5: Fumadocs `mdx-components.tsx` reuse (Future Work direction) has architectural mismatches the spec doesn't address

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — implementer of Future Work)
**Location:** §6 Future Work "Custom component discovery", §6 Future Work "Drop-in fumadocs project support", changelog Session 4 rationale

**Issue:** The scope narrowing is presented as "defer custom component discovery to Future Work, reuse fumadocs `mdx-components.tsx` when we get there" — which sounds clean but has architectural mismatches the spec hasn't audited. These matter NOW because the P0 built-ins-only architecture is being built on assumptions that the Future Work direction is implementable.

Direct verification from agents-docs/src/mdx-components.tsx (which the spec names as the canonical example):

```tsx
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,          // spread: which components?
    APIPage,                          // config wrapper, not a component def
    AutoTypeTable: (props) => (       // WRAPPED: source file unknowable
      <AutoTypeTable ... {...props} generator={generator} />
    ),
    Image: (props) => (               // WRAPPED: injects defaults
      <ImageZoom alt={props.alt ?? 'Image'} {...props} ... />
    ),
    ...components,                    // caller-supplied override
    img: (props) => (<img ... />),    // HTML-level wrapper
    Accordion, Accordions,            // plain imports — extractable
    // ... more
  };
}
```

Problems this creates for the Future Work approach:

1. **It's a function, not a static map.** Walking imports from a JavaScript function body — through a spread, a conditional, a wrapped arrow function, a second spread — is fundamentally harder than scanning a static `components.ts` export. The spec handwaves "walk the import graph" but doesn't audit the complexity.

2. **Wrapped components lose their source file.** `AutoTypeTable: (props) => <AutoTypeTable {...props} generator={generator} />` — the outer arrow function has no associated source file; the inner import has lost its name in the MDX map (it's now `AutoTypeTable` the outer, not `AutoTypeTable` the import). react-docgen-typescript would need to trace through the wrapper body to find the wrapped component, then extract props from the wrapped component's source file, then map them back to the outer name. This is an AST walker, not a file parser.

3. **Configuration mixed with components.** `APIPage = createAPIPage(openapi)` is a **configuration** — it's `createAPIPage` called once at module load. Extracting props from this is meaningless; the real definition is in `fumadocs-openapi/ui`. A registry discovery tool would have to distinguish "value assigned to map" from "component definition" and this distinction isn't mechanical.

4. **Depends on `defaultMdxComponents` spread.** `...defaultMdxComponents` pulls in a flat object from fumadocs-ui — which components, with which props, at which versions? The spread happens at runtime; a static analyzer can't know the result without importing and executing.

5. **Assumes fumadocs is installed.** Users with a pile of `.md` + local components and no fumadocs setup have no `mdx-components.tsx` file to reuse. The promise "reuse the existing convention" becomes "require fumadocs."

6. **Name collision policy still unaddressed (relates to Finding 3).** If the user's `mdx-components.tsx` re-imports fumadocs Callout/Tabs/Card — the same components we registered as built-ins — which version is authoritative? The spec's "last-wins override semantics" language doesn't tell the implementer which one is last.

7. **`img`, `h1-h6`, `a` are HTML tag wrappers.** These register against lowercase tag names. The editor's JSX tokenizer only intercepts uppercase tags (per D11). So `img` wrapper in mdx-components.tsx is silently unreachable by the spec's registry mechanism. This is a pre-existing architectural commitment the spec hasn't audited against the Future Work convention.

**Current design:** §6 Future Work "Custom component discovery": "Read existing fumadocs `mdx-components.tsx` convention (confirmed via `reports/fumadocs-full-pipeline/evidence/d4-custom-component-registration.md`) to discover user-defined components. Walk the import graph from the file to resolve each component's source `.tsx` path, then run `react-docgen-typescript` for prop extraction. Merge into the registry alongside built-ins with last-wins override semantics."

**Alternative:** A dual-track discovery. **Track 1** — editor-specific static config (e.g., `.openknowledge/components.ts`) exporting a flat map of `{ name, componentPath, propDef? }`. This is the authoritative source for custom components. **Track 2** — optional fumadocs `mdx-components.tsx` import mirror for drop-in compatibility, where the editor reads the file's import statements (NOT the function body) and auto-imports the static imports into the registry. The function body — with its wrappers, spreads, and configurations — is ignored.

Track 2 gives 80% of the drop-in promise (static imports like `import { Accordion } from '@inkeep/docskit/mdx'`) without trying to analyze a runtime function. Wrapped/configured components fall back to Track 1 (user lists them manually).

**Trade-off:**
- **Gained:** Custom discovery becomes implementable without a function-body walker. No framework lock-in (Track 1 works for any React codebase). Drop-in story preserved for plain-import cases.
- **Lost:** Pure zero-config drop-in for agents-docs-shape projects, where wrapped components (`AutoTypeTable`, `Image`, `img`) still require manual registration. Partial drop-in instead of total drop-in.

**Why this matters NOW even though it's Future Work:** The built-ins-only scope commits to a specific registry architecture (`built-ins.ts` + static imports + optional `react-docgen-typescript` extraction). The Future Work path assumes this architecture extends to custom discovery via mdx-components.tsx. But the extensions are non-trivial and some don't work. If we ship P0 and then discover the Future Work path is harder than assumed, we either (a) build a different custom discovery mechanism (the dual-track above, or `.openknowledge/components.ts`) and abandon the "reuse fumadocs convention" promise, or (b) invest in the function-body walker. Both are painful retractions.

**Status:** CHALLENGED
**Suggested resolution:** Either (a) audit the mdx-components.tsx reuse strategy now with a minimal prototype (walk `agents-docs/src/mdx-components.tsx` and enumerate how many of its 24 components are discoverable with a static-import scanner), or (b) add a decision that P0 does NOT commit to the fumadocs-reuse Future Work path, and list dual-track discovery as an alternative to be evaluated when custom discovery enters scope. The worst outcome is shipping P0 with the Future Work assumed and then discovering it's harder than assumed.

---

## Low Severity

### [L] Finding 6: Hand-written PropDef drift detection is unspecified

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — maintenance)
**Location:** §4 Phase 1 step 4, `evidence/react-docgen-typescript-behavior.md`

**Issue:** Phase 1 step 4 currently says docskit components need hand-written PropDef because docskit ships no source. Under Finding 2, this also applies to all 10 fumadocs-ui components. That means 13 of 15 built-ins have PropDef maintained by hand in `built-ins.ts`. There is no mechanism for detecting drift between the hand-written PropDef and the actual component TypeScript interface when:

- `fumadocs-ui` releases 16.2.0 with a new prop on `Callout` (e.g., `collapsible?: boolean`)
- `@inkeep/docskit` changes `Video.props` from `fullView?: boolean` to `display?: 'full' | 'inline'`
- A required prop becomes optional (or vice versa)

Drift is detected only when a user (a) upgrades the dependency, (b) tries to use the new prop via the prop panel, (c) observes it missing, (d) reports it. Between upgrade and report, users see a visibly-out-of-date prop panel.

**Current design:** "hand-write PropDef manually and reference it from `built-ins.ts`" (Phase 1 step 4). No verification story.

**Alternative — cheap drift detection:**

1. **`.d.ts` shallow parse.** Even though fumadocs-ui and docskit don't ship `.tsx` source, they DO ship `.d.ts` type declarations. A lightweight type-declaration parser (e.g., TypeScript compiler API on the `.d.ts` file) can extract the prop interface without the full react-docgen-typescript toolchain. This is a middle ground: simpler than react-docgen-typescript on source, richer than hand-writing. The spec's rejection of this path was never explicit — it jumped from "source not available → hand-write."

2. **CI smoke test.** A small test that imports each built-in's type interface and checks that every key in the hand-written PropDef exists in the interface (and that every required-in-interface key is also required-in-PropDef). Runs on every CI build; breaks when upstream types change. Doesn't auto-generate the PropDef but flags drift.

3. **Defer it.** Accept that 15 components × occasional upstream changes = a manageable manual-review burden.

**Trade-off:**
- **1** (`.d.ts` parse): Small tool, upfront investment, replaces much of the "hand-write forever" future maintenance.
- **2** (CI smoke): Minimal code, catches drift when it happens, no auto-generation.
- **3** (defer): No cost now, higher latent cost.

**Recommendation:** #2 is the minimum safe path and costs ~50 lines of test code. Explicitly deferring (#3) is acceptable if the spec acknowledges it as an accepted maintenance risk.

**Status:** CHALLENGED
**Suggested resolution:** Add a CI smoke test as a Phase 1 step (type-level drift check for all hand-written PropDef). Alternatively, add an explicit note in §11 Risks that hand-written PropDef drift is an accepted maintenance risk and will be monitored via user reports.

---

## Confirmed Design Choices (summary)

Design choices that held up under this challenge (v2 re-audit of v1-survived decisions):

**DC1 (Simpler alternative):**
- **Raw JSX on disk (D1 revised):** Still holds. Fumadocs compatibility is a hard requirement regardless of component set size. Evidence unchanged.
- **Two node types (D8):** Still holds. The built-ins-only scope doesn't change the need for a registered-vs-unregistered split.
- **acorn+acorn-jsx (D7):** Still holds. Even with 15 built-ins, JSX parsing is still required at parse time.
- **Version B tokenizer (D12):** Still holds.
- **Attribute-level LWW (D2) + children as content (D3):** Still hold. These are architectural foundations unaffected by scope narrowing.

**DC2 (Stakeholder gap):**
- **Phase 0 byte-identity gate (OS06, OS07):** Still holds. Post-merge audit added this correctly; built-ins-only doesn't weaken it.
- **Prop panel typing-defer protocol (§3.6, R9, CE05):** Still holds.

**DC3 (Framing validity):**
- **Layer 2+3 ship together (D16):** Holds structurally — Layer 3 remains architecturally additive. The v1 Finding 4 (phased delivery) is re-dismissed; user direction on D16 "no fallback" is clear.
- **Problem statement's five Complication dimensions:** Four of five hold. The fifth ("no component discovery") has been removed from the Resolution — see Finding 1.

---

## Notes on v1 findings and their current status

- **v1 H1 (react-docgen-typescript unnecessary):** Previously rejected. **RE-ACTIVATED as v2 H2** with new factual evidence that fumadocs-ui 16.1.0 ships only `.d.ts` + `.js`. The factual premise of the v1 rejection ("validate the pipeline on all components") is false against the actual installed package. This is not relitigation per the design-challenge-protocol — it is a correction.
- **v1 H2 (dedentation solves non-problem):** Accepted in v1 (switched to flush-left). No change.
- **v1 M3 (attribute namespace confusion):** Deferred to Phase 4 polish in v1. Not re-audited in v2 (still deferrable).
- **v1 M4 (reframe D16 as phased delivery):** Rejected in v1. User direction clear. Not re-audited.
- **v1 L5 (STOP_IF clarification):** Accepted in v1. No change.
