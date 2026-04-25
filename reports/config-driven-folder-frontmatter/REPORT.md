---
title: "Config-Driven Folder Frontmatter for Open Knowledge"
description: "Research landscape for attaching frontmatter-like metadata to folders in Open Knowledge via config.yml. Covers the existing 1P config loader + frontmatter pipeline, sibling-file prior art (Fumadocs meta.json, Docusaurus _category_.json, Nextra _meta, Hugo _index.md cascade, Obsidian folder-note plugins), config-driven prior art (VitePress, Docusaurus sidebars.js, Starlight, Astro content collections, Mintlify, Turborepo, Biome, Obsidian Bases), and the precedence/inheritance/consumer-surface design space."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - Open Knowledge
  - Fumadocs
  - Docusaurus
  - Nextra
  - Hugo
  - Obsidian
  - VitePress
  - Starlight
  - Astro
  - Mintlify
  - Turborepo
  - Biome
topics:
  - folder metadata
  - config.yml extension
  - frontmatter inheritance
  - path matching globs
  - navigation sidebar
  - sibling-file vs centralized config
---

# Config-Driven Folder Frontmatter for Open Knowledge

**Purpose:** Give a `/spec` author the landscape, prior art, and concrete option space for adding folder-level frontmatter to Open Knowledge, driven primarily by `config.yml`. The reader cares most about (a) where in `config.yml` this lives, (b) how path matching and inheritance work, (c) what consumer surfaces this unlocks, and (d) when a sibling-file escape hatch is worth the complexity.

---

## Executive Summary

Open Knowledge's `config.yml` is already architected for a new top-level block: Zod schema at `packages/cli/src/config/schema.ts`, deep-merged user→workspace loader, and two path-matching primitives (`picomatch`, `ignore`) already in the dependency graph via `ContentFilter`. Adding a `folders:` (or `frontmatter:`) block is mechanically small. The interesting decisions are semantic.

Across 11 unique systems surveyed (5 examined as sibling-file approaches, 8 as config-driven approaches; Docusaurus and Obsidian appear in both buckets), three findings dominate:

1. **Per-file frontmatter beats folder metadata for that page's own fields, universally.** Every system surveyed, with the one narrow exception of Hugo `cascade`, treats folder metadata as non-inherited — it describes the folder's own node (sidebar entry, landing-page shell) and never retroactively edits a child page's frontmatter. If Open Knowledge wants "default tags for all files in this folder" semantics, it is choosing **Hugo cascade territory** — a deliberately unusual design.

2. **Globs for navigation-tree config are essentially unused in doc frameworks.** No surveyed doc framework (VitePress, Docusaurus, Starlight, Mintlify) uses glob-arrays for sidebar/navigation rules. Globs appear only where the config drives file-walker inclusion (Astro Content Collections, Biome, Turborepo). Doc frameworks favor **explicit nested item lists** or a single **`directory:` autogenerate** string. For "set `icon: Book` on every folder matching `specs/**`" Open Knowledge is importing the Biome/Turborepo model into a space where doc frameworks deliberately didn't go.

3. **Open Knowledge already uses Fumadocs `meta.json` in its own `docs/` site.** This is not just prior art — it is **internal precedent**. `docs/content/meta.json`, `docs/content/guides/meta.json`, and `docs/content/internals/meta.json` each carry `{ title, icon, pages }`. Whatever the editor adopts for folder metadata should either align with or explicitly diverge from this already-shipping pattern.

The design space reduces to four concrete shapes, each with a clean intellectual precedent — the spec can choose among them. (A fifth shape, embedding metadata in a content-bearing `_index.md` / `INDEX.md` frontmatter à la Hugo, is **out of scope**: this exact pattern was rejected previously as D19 because it creates a "shadow folder structure in files" — see §D2.)

- **Shape A — Config-first with glob rules (Biome/Turborepo-style).** A `folders:` array in `config.yml` of `{ match: <glob>, metadata: {...} }` entries. Ordered precedence (first- or last-match), documented loudly. Novel in doc-frameworks; familiar in tooling.
- **Shape B — Config-first with explicit folder-path keys (Astro Content Collections / VitePress-style).** A `folders:` map keyed by folder path, not glob — each key is a folder literal. Less powerful; no cascade question; lowest learning cost.
- **Shape C — Dedicated sibling file, not config.yml (Fumadocs/Docusaurus-style).** `meta.json` or `.open-knowledge/meta.json` per folder. Not what the user asked for — but it's the one already shipping in `docs/`, it satisfies D19 ("colocated, not shadow-structured"), and it has the best ecosystem muscle memory.
- **Shape D — Hybrid: config-driven defaults + sibling-file overrides (Docusaurus-style).** Config rules set bulk defaults; an optional per-folder sibling file overrides where needed. Docusaurus already ships this (`sidebars.js` + `_category_.json`). Covers ~90% of both A and C's ergonomics; cost is two places users might look. Fleshed out in §D7.

**Key Findings:**
- **1P foundations are ready:** Zod schema extension, deep-merge loader, `picomatch` + `ignore` available. No new deps needed for Shape A or B. *(D1)*
- **1P frontmatter consumers are few today:** MCP `read_document` extracts title/description/tags; `page-identity` extracts title/aliases; the editor sidebar consumes **nothing** from frontmatter. Folder-frontmatter is a greenfield consumer surface. *(D2)*
- **Fumadocs `meta.json` is already in the repo** (`docs/content/*/meta.json`). Design decisions must acknowledge this existing 1P pattern. *(D2)*
- **Shallow per-field merge with file-overrides-folder is the near-universal pattern** across Fumadocs, Docusaurus, Nextra, Hugo (non-cascade), Starlight. Arrays always replace. VitePress is a deliberate exception: it has no folder-metadata-vs-file-frontmatter merge surface — its centralized config tree and per-page frontmatter are disjoint. *(D3, D4)*
- **Hugo is the only shipped system with true deep cascade among those surveyed** (descendant-frontmatter injection). It uses an explicit `cascade:` keyword with a `target:` sub-filter — cascade is opt-in, not implicit. Implicit deep inheritance is a pattern that **no surveyed system uses**. Adjacent cascade patterns in non-surveyed tools (Jekyll `_config.yml defaults: scope:`, Eleventy data cascade, Zola section cascade) would deserve their own probe before the spec locks cascade semantics. *(D3)*
- **Obsidian ships nothing for folder-level frontmatter inheritance** despite 1000+ plugins. Folder Notes plugins only do display-anchor. Metadata Menu inherits by `fileClass`, not by filesystem. *(D3)*
- **Precedence direction matters and is easy to get wrong.** Biome ships two opposite rules (first-match for `overrides`, last-match for `includes`) and documents them explicitly because users conflate them. This is the kind of decision that benefits from being surfaced in the config.yml comment rather than implicit in code. *(D4)*
- **No doc framework uses glob-arrays for sidebar/navigation config.** Globs in config-driven systems are file-walker primitives (Astro, Biome, Turborepo), not nav primitives. *(D4)*

---

## Research Rubric

| # | Dimension | Priority | Depth | Coverage |
|---|-----------|----------|-------|----------|
| D1 | 1P: `config.yml` architecture & extension points | P0 | Moderate | [evidence/d1-config-yml-architecture.md](evidence/d1-config-yml-architecture.md) |
| D2 | 1P: existing frontmatter pipeline → consumer surfaces | P0 | Moderate | [evidence/d2-frontmatter-pipeline.md](evidence/d2-frontmatter-pipeline.md) |
| D3 | 3P: sibling-file prior art (Fumadocs, Docusaurus, Nextra, Hugo, Obsidian) | P0 | Deep | [evidence/d3-sibling-file-prior-art.md](evidence/d3-sibling-file-prior-art.md) |
| D4 | 3P: config-driven prior art (VitePress, Docusaurus, Starlight, Astro, Mintlify, Turborepo, Biome, Obsidian Bases) | P0 | Deep | [evidence/d4-config-driven-prior-art.md](evidence/d4-config-driven-prior-art.md) |
| D5 | Precedence & inheritance mechanics synthesis | P0 | Synthesis | §D5 below |
| D6 | Consumer surfaces folder frontmatter unlocks | P1 | Synthesis | §D6 below |
| D7 | Config-driven vs sibling-file tradeoffs | P1 | Synthesis | §D7 below |

**Stance:** Factual. Synthesis sections below surface option shapes and tradeoffs; the spec picks one.

---

## Detailed Findings

### D1: Open Knowledge `config.yml` is ready for a new top-level block

**Finding:** The schema, loader, and path-matching primitives are all in place. A `folders:` (or equivalent) block is a drop-in extension — no new dependencies, no new precedence machinery.

**Evidence:** [evidence/d1-config-yml-architecture.md](evidence/d1-config-yml-architecture.md)

Key facts:
- **Schema** (`packages/cli/src/config/schema.ts`): Zod object with five existing top-level blocks (`content`, `server`, `persistence`, `preview`, `mcp`). Every block has `.default({...})`, so additions are non-breaking.
- **Loader** (`packages/cli/src/config/loader.ts`): deep-merge with arrays-replace, chain `Zod defaults → user → workspace → ENV → CLI flags`. Anything added to the schema inherits this discipline automatically.
- **Path-matching primitives already present**: `picomatch` (globs, used for `content.include`) and `ignore` (gitignore syntax, used for `content.exclude` + nested `.gitignore`). Both are used in `packages/server/src/content-filter.ts`.
- **Workspace config is commented-defaults by design**: any new block should ship with a commented example following the existing file's style.

**Implications:**
- For Shapes A, B, or (config-side of) C, the foundation is already built.
- The **array-replace** semantic is worth calling out: if folder rules are modeled as an array (`folders: [...]`), a workspace-level list completely supersedes a user-level list — there's no element-wise merge across precedence layers unless we explicitly key and collapse.
- If rules need to be keyed for element-wise merge (e.g. by `name` or `match`), the loader doesn't support that today — the schema would need to model rules as a *map* (`folders: { rule1: {...}, rule2: {...} }`) or the collapse logic would need to live in a post-load step.

**Decision triggers:**
- If the spec wants user-level baseline + workspace-level additions: the schema must use a map, not an array.
- If the spec wants pure workspace-authoritative rules: an array is fine.

**Remaining uncertainty:** None — 1P primitives are directly inspected.

---

### D2: Frontmatter in Open Knowledge is stored as a raw string; the editor sidebar consumes none of it

**Finding:** The CRDT bridge stores frontmatter as an opaque verbatim string on `Y.Map('metadata').get('frontmatter')`. Consumers decode it at read time for specific fields (title, description, tags, aliases). The editor's `FileSidebar` reads nothing from frontmatter today. Folder frontmatter is a greenfield UI surface — **and the docs site already uses Fumadocs `meta.json` for the same conceptual need.**

**Evidence:** [evidence/d2-frontmatter-pipeline.md](evidence/d2-frontmatter-pipeline.md)

Key facts:
- **Canonical storage:** `Y.Map('metadata')['frontmatter']` holds the raw delimited string (`---\n...\n---\n`). See `packages/core/src/bridge/frontmatter-y.ts:14-19`.
- **Shared parse utility:** `parseFrontmatter<Schema>()` in `packages/cli/src/utils/frontmatter.ts` is Zod-aware — the natural place to validate folder-default fields too.
- **Enumerated consumers today:** MCP `read_document` (title, description, tags), `page-identity` (title, aliases), `suggest-links` serializer (full string re-attach), server observers (full string round-trip). None of these reads any notion of "inherited frontmatter."
- **Editor sidebar is empty of frontmatter reads** — `FileSidebar.tsx` + `FileTree.tsx` currently render filenames only.
- **Docs site internal precedent:** `docs/content/meta.json`, `docs/content/guides/meta.json`, `docs/content/internals/meta.json` each carry `{ title, icon (lucide name), pages (ordered list) }`. This is Fumadocs' pattern, already in this repo.

**Implications:**
- A folder-frontmatter spec decides: is the **effective frontmatter** (file merged with folder defaults) a *derived view* computed per-read, or a *cached second slot* on `Y.Map('metadata')` (e.g. `'effectiveFrontmatter'`)? Derived is simpler; cached enables CRDT-observable reactivity.
- **Editor scope vs docs-site scope** is an open question. The docs site ships with `meta.json` today; unifying means either codegen (write `config.yml` → emit `meta.json` for docs build) or dual authoring. Keeping them independent means the editor adopts its own convention.
- `FileSidebar` is the natural first consumer — it has nothing to rename, nothing to migrate.

**Decision triggers:**
- If the editor sidebar should render folder `title` / `icon`: Shape A/B/C all work. Shape C (sibling `meta.json`) is zero-work because the file is already there in `docs/`.
- If the spec wants "write once, use in both editor *and* docs site": config-driven (Shape A or B) with codegen to `meta.json` is the only path that holds one source of truth.

**D19 context (product-owner-confirmed, 2026-04-16):** The `read-document.ts:15` comment `"folder INDEX.md frontmatter was deprecated in D19"` refers to a rejected design that proposed using an `INDEX.md` file's own frontmatter to carry folder-scoped metadata. The rejection reason: that pattern creates a **"shadow folder structure in files"** — a markdown file pretending to be the folder, conflating document content with folder configuration. The preferred discipline is folder metadata **colocated with the folder itself**, not embedded in an overloaded content document. This rules out **Hugo's `_index.md`** pattern (same anti-pattern) but does NOT rule out Fumadocs `meta.json` / Docusaurus `_category_.json` (dedicated sibling files, not overloaded docs) nor `config.yml`-driven rules (centralized, not masquerading as a doc). See [evidence/d2-frontmatter-pipeline.md#d19-context](evidence/d2-frontmatter-pipeline.md) for the full implications.

---

### D3: Sibling-file prior art — Fumadocs is the closest architectural fit; Hugo is alone in offering true cascade

**Finding:** Five systems surveyed. All use a sibling file per folder (filename conventions: `meta.json`, `_category_.json`, `_meta.json|js`, `_index.md`, none). Per-field shallow merge with file-overrides-folder is near-universal for *that folder's own representation*. Deep cascade to descendant files is a Hugo-only pattern, and it is opt-in via an explicit `cascade:` keyword — never implicit.

**Evidence:** [evidence/d3-sibling-file-prior-art.md](evidence/d3-sibling-file-prior-art.md)

| System | Filename | Schema surface | Inheritance to descendants | Merge with page frontmatter | Primary consumer |
|---|---|---|---|---|---|
| **Fumadocs** | `meta.json` (or `.yaml`/`.ts`) | Zod: `{ title, pages[], description, root, defaultOpen, icon }` — all optional | **None** — each folder independent | Shallow: `meta.title ?? index.title`, `meta.icon ?? index.icon` (for the folder's own node) | Page-tree / sidebar |
| **Docusaurus** | `_category_.json` / `_category_.yml` | `{ label, position, className, collapsed, link, description, customProps }` | **None** | `_category_` overrides `index.md` `sidebar_*` frontmatter for the folder's node | Autogenerated sidebar |
| **Nextra** | `_meta.{js,ts,json}` | `Record<key, string \| { title, type, theme, display, href, ... }>` | **None** — per folder only | `_meta` label/order beats page frontmatter in sidebar | Sidebar + nav |
| **Hugo** | `_index.md` | Full page frontmatter + optional `cascade:` block with `target:` filter | **Yes, opt-in via `cascade`** — descendant pages inherit cascaded fields, can override per-page | Cascade injects into descendants; page frontmatter overrides per-page | Rendering, SEO, taxonomies, params |
| **Obsidian** (Folder Notes / alx-folder-note plugins) | `<folder>.md` anchor | Plugin-specific; UI-level only | **None** (Metadata Menu inherits by `fileClass`, not by folder) | Plugin-dependent; no universal merge rule | Visual anchor for folder |

**Convergence points:**
1. **Dedicated sibling file per folder, reserved-prefixed name** (underscore or fixed word — never an ambiguous name that could collide with real docs).
2. **Primary consumer is always navigation/sidebar.** Hugo is the only one extending to rendering/SEO/taxonomies.
3. **Folder metadata beats index-doc frontmatter for the folder's sidebar node** (Fumadocs `meta.title ?? index.title`; Docusaurus explicit override).
4. **Merge is shallow and per-field.** Arrays replace. Only Hugo's `params` does recursive map merge, and only when explicitly cascaded.
5. **File frontmatter always wins for that page's own fields** (except Hugo cascade, which is opt-in).

**Most surprising divergences:**
1. **Hugo `cascade` is alone.** No other surveyed system offers true deep inheritance of frontmatter into descendant files. If Open Knowledge wants "every doc under `specs/` gets `type: spec` by default," it is building Hugo's cascade model — deliberately unusual in the doc-framework space.
2. **Obsidian has nothing native.** Despite a huge plugin ecosystem, no mature plugin ships filesystem-folder-based frontmatter cascade. Metadata Menu inherits by declared `fileClass`, not by location.
3. **Hugo overloads `_index.md`** as both the folder's landing page AND the folder metadata carrier — same markdown file. Every other surveyed system uses a dedicated non-markdown data file to avoid this double duty. **Important for Open Knowledge:** this exact shape ("shadow folder structure in files") was previously rejected in OK via D19 — see §D2 above and evidence file. Any spec that proposes this pattern would be re-litigating D19.

**Most architecturally similar to Open Knowledge:** **Fumadocs.**
- Zod schema with `.extend()` for user-provided extra fields — mirrors OK's existing `ConfigSchema` + `parseFrontmatter<Schema>()` pattern.
- Shallow per-field merge — mirrors how `Y.Map('metadata')` already works.
- Tight default field set (`title`, `pages[]`, `icon`, `description`, `root`, `defaultOpen`) — small enough to adopt, general enough to be useful.
- **Already in the repo** in `docs/`.
- `pages[]` grammar includes globs-adjacent features: `"..."` (splat rest), `"!file"` (negate), `"---separator---"` — these could port to OK's picomatch-based world cleanly if the spec wants richer ordering than explicit list.

**Implications:**
- If Open Knowledge wants **deep cascade** (folder default → descendant file defaults): Hugo is the only prior art and it's an explicit `cascade:` keyword, not implicit. The spec should model cascade the same way — opt-in, typed, with a `target:` filter.
- If Open Knowledge wants **folder-node-only metadata** (affects sidebar/nav rendering, not descendant frontmatter): shallow per-field merge with file-overrides-folder is near-universal and low-surprise.
- Adopting Fumadocs `meta.json` *directly* in the editor (alongside the docs site that already uses it) is the zero-divergence path — at the cost of being sibling-file-based rather than config-driven.

**Remaining uncertainty:** None — Fumadocs source was read directly in `node_modules/fumadocs-mdx/dist/config/index.js:11-18`. Others confirmed from official docs.

---

### D4: Config-driven prior art — doc frameworks favor explicit lists + `directory:` autogenerate, not globs

**Finding:** Eight systems surveyed, split into two camps by config location: TS/JS-config (engineer-facing) vs JSON/YAML-with-schema (validation-facing). Three path-matching idioms: (a) explicit nested item lists, (b) `directory:` autogenerate, (c) glob-arrays. Doc frameworks overwhelmingly pick (a) or (b). Glob-arrays show up only where the config drives file-walker inclusion (Astro, Biome, Turborepo), not nav.

**Evidence:** [evidence/d4-config-driven-prior-art.md](evidence/d4-config-driven-prior-art.md)

| System | Config location | Folder-rule shape | Precedence | Merge with page frontmatter |
|---|---|---|---|---|
| **VitePress** | `.vitepress/config.ts` — `themeConfig.sidebar` | URL-prefix-keyed object; explicit nested items | Longest URL prefix wins | Page frontmatter suppresses self only (`sidebar: false`); never adds to tree |
| **Docusaurus** | `sidebars.ts` + optional `_category_.json` | Explicit categories OR `type: 'autogenerated', dirName: '…'` OR `type: 'doc', id: '…'` | Explicit order; autogenerated reads `_category_.json` | `_category_.json` fields override `index.md` sidebar fields |
| **Starlight** | `astro.config.mjs` — `starlight.sidebar` | Explicit groups OR `{ autogenerate: { directory: 'guides' } }` | Explicit order | Per-page `sidebar.label` / `sidebar.order` frontmatter overrides config |
| **Astro Content Collections** | `src/content.config.ts` — `defineCollection({ loader: glob({ pattern, base }), schema })` | One schema *per collection* (one folder root) | N/A — one rule per folder | Zod-validated frontmatter per page; collection schema is *the* schema |
| **Mintlify** | `docs.json` — `navigation.tabs/groups/pages` | Fully explicit nested tree by page path | Explicit order | Page frontmatter `title` beats config unless `sidebarTitle` set |
| **Turborepo** | `turbo.json` — `tasks.<name>.inputs/outputs` + `pipeline` | Glob-arrays per task; negation via `!` | Most-specific-task-wins (by task name) | N/A — not a docs system; pattern reference only |
| **Biome** | `biome.json` — `files.includes` (globs) + `overrides[].includes` | Glob-arrays; negation supported | `files.includes`: last-match. `overrides`: **first-match**. Opposite directions documented explicitly. | N/A — pattern reference |
| **Obsidian Bases** | `<name>.base` YAML | Query-like filters (`file.inFolder()`, tag matches, property filters) | Filter evaluation order | Reads file frontmatter; does not mutate it |

**Dominant patterns:**
1. **Engineer-facing docs tools** (VitePress, Starlight, Astro, Docusaurus) pick TS/JS configs for compile-time inference.
2. **Editor-facing or validation-driven tools** (Mintlify, Turborepo, Biome, Obsidian Bases) pick JSON(C) or YAML with runtime schema validation.
3. **Explicit trees** are more common than **directory-autogenerate**, which is more common than **glob-arrays** for nav.
4. **Merge direction is unanimous:** per-file frontmatter overrides central config — config supplies defaults and structure, frontmatter overrides per-page.

**Path-matching:** **No surveyed doc framework uses glob-arrays for sidebar/nav rules.** Globs appear only in file-walker contexts (Astro's `loader: glob()`, Biome's `files.includes`, Turborepo's `inputs`). The doc-framework rationale is likely that glob-arrays carry **precedence footguns** — Biome ships two opposite conventions (`files.includes` = last-match, `overrides` = first-match) and has to document them loudly. A nav sidebar is an *ordered structural list*; a glob-array is an *unordered match set*. Using globs for nav implicitly requires picking a deterministic ordering on top of the matches (filesystem order? rule-declaration order?), which every surveyed doc framework avoids by making the config tree explicit.

**Most idiomatic for Open Knowledge:** Given the stack (Zod + picomatch + YAML config) and the user's bias toward config-driven, the **Biome model** is the closest fit in precedent: YAML-with-schema, ordered glob-array, explicit first-match precedence. **Astro Content Collections** is the closest *doc-framework* precedent — one schema per folder root, Zod-validated. Its limitation: one rule per collection (no deep cascade question to answer). If OK wants per-folder rules at arbitrary depths, Biome's shape applies; if OK is content with "one set of defaults per top-level folder," Astro's shape suffices.

**Precedence-direction observation (from Biome's case):** Biome ships two opposite precedence conventions in one product (first-match for `overrides`, last-match for `files.includes`) and documents them explicitly because users conflate them. Whichever direction OK picks, surfacing it in the config.yml comment and schema `.describe()` reduces the same confusion class.

**Remaining uncertainty:** Verbatim type-file quotes were not obtained for VitePress / Docusaurus / Starlight (WebFetch was denied in the subagent sandbox); paraphrased from converging doc-page excerpts. A spec author may want to double-check exact field names in the official `.d.ts` / schema files before settling on terminology.

---

### D5: Precedence & inheritance synthesis

**Finding:** Three axes define the precedence design space. The spec must pick one position on each.

**Axis 1 — Scope of inheritance to descendants**

| Position | Systems exemplifying | What it means for OK |
|---|---|---|
| **No cascade.** Folder metadata describes the folder's own node only. | Fumadocs, Docusaurus, Nextra, VitePress, Starlight, Astro (effectively) | Cheapest, most familiar. Covers "sidebar title/icon," "default-open," "ordering." Does NOT cover "every file in `specs/` has `type: spec`." |
| **Opt-in deep cascade.** Explicit keyword in each rule declares cascade. | Hugo (`cascade:` with `target:`) | Powerful; covers default-tags/type/access. Requires modeling `cascade` as a first-class concept — opt-in per rule, with a `target:` sub-filter to scope which descendants receive it. |
| **Implicit deep cascade.** All folder metadata cascades to descendants. | **No surveyed system** | Would be novel; high risk of surprise — page owners can't tell from their own file why it has `type: spec` applied. |

**Axis 2 — Merge with per-file frontmatter**

Near-universal pattern across all surveyed systems: **file frontmatter wins for that page's own fields**. The only meaningful variation is *which subset of fields cascades* — Hugo cascades arbitrary frontmatter fields; Fumadocs/Docusaurus cascade **nothing** (folder metadata never affects a page's own frontmatter, only the folder's sidebar node).

The spec's position here shapes user expectations: if file-overrides-folder is absolute, users trust that editing a file is always authoritative for that file. If certain folder fields are locked (not overridable per-file), that invariant breaks — and no surveyed system does this. The spec picks whether to follow the near-universal convention or deliberately diverge.

**Axis 3 — Precedence among folder rules themselves**

If OK uses globs, multiple rules can match the same folder. Two viable conventions (with a third pattern noted for completeness):

| Convention | Example | Tradeoff |
|---|---|---|
| **First-match wins** | Biome `overrides`, many CI tools | Intuitive for "specific before general" ordering. Forces users to order rules carefully. |
| **Last-match wins** | Biome `files.includes`, `.gitignore` | Familiar from gitignore. Matches the mental model that later rules "override" earlier ones. |
| **Most-specific wins** (longest glob prefix, fewest wildcards) | None in surveyed systems; CSS-specificity-like | Carries specification-complexity footguns (tie-breaking between equally-specific globs is non-obvious) and has no surveyed precedent in this problem space. |

**Consistency consideration:** OK's existing `ContentFilter` 4-step rule evaluation is first-match-style (gitignore → include → sibling-asset → else). Picking first-match for folder rules aligns with the existing precedence direction in the codebase; picking last-match aligns with `.gitignore` muscle memory (which users already know from `content.exclude`). Either is defensible — this is a trade-off between codebase consistency and end-user mental-model consistency.

**Concrete evidence:** Biome's `overrides` documented at https://biomejs.dev/guides/configure-biome/ (first-match); Biome's `files.includes` at https://biomejs.dev/reference/configuration/ (last-match). See [evidence/d4-config-driven-prior-art.md](evidence/d4-config-driven-prior-art.md) §Biome.

---

### D6: Consumer surfaces folder frontmatter unlocks

**Finding:** Nine concrete consumer surfaces exist; four are zero-new-code once the resolver is in place. The rest are adjacent features that become easy to add.

**Zero-new-code consumers (read folder metadata on first render):**

1. **Editor sidebar (`FileSidebar` / `FileTree`).** Folder `title`, `icon`, `pages[]` ordering. Currently renders filenames only — trivial to read resolved folder metadata. *(D2)*
2. **MCP `read_document` response.** An `effectiveFrontmatter` field (file merged with folder defaults) would help agents understand document context without re-reading the config. Insertion point: `packages/cli/src/mcp/tools/read-document.ts`. *(D2)*
3. **`hub-candidates` / orphan-doc nudges.** Folder metadata could declare a canonical `hub:` filename for a folder, replacing the hardcoded `['INDEX', 'README', 'REPORT', 'SPEC']` heuristic. See `packages/server/src/hub-candidates.ts`. *(D2)*
4. **`write_document` / `create-page` default-frontmatter injection.** New files in `specs/**/` could auto-receive `type: spec, status: draft` written into their *own* frontmatter at create time. **This is distinct from cascade (§D5 Axis 1):** cascade injects defaults at *read* time without values being present in the file; create-time injection writes values into the file's own frontmatter so the reader sees them as the file's own state. The two mechanisms can coexist — or the spec can ship create-time injection while picking "no cascade" on Axis 1 (they are independent). *(D2)*

**Adjacent-feature consumers:**

5. **Docs site navigation.** If config-driven folder metadata emits `meta.json` at build time (codegen), the docs site reads it directly via Fumadocs' existing pipeline. *(D3, D4)*
6. **Search filtering.** Folder-inherited `tags` / `type` fields let agents filter by folder-semantic categories (`type: spec`, `type: report`, `type: external-source`).
7. **Access/visibility rules.** Per-folder `visibility: internal|public` inherited by descendants — trivially gates MCP tools or docs-site publication.
8. **Sidebar ordering + grouping.** Fumadocs `pages[]` grammar (`"..."` splat, `"!file"` negate, `"---separator---"`) ports well to picomatch-backed config. *(D3)*
9. **Backlinks / typed-link filtering.** The existing backlink index could filter by folder-inherited `type` to produce "backlinks from specs" vs "backlinks from reports."

**Scope observations for the spec:**
- Consumers (1)–(3) are 1P-only, low-risk, and do not force cascade decisions. Any of Shapes A/B/C/D supports them without semantic commitments beyond "file-overrides-folder for that folder's own node."
- Consumer (4) (default-frontmatter on create) is independent of cascade (see corrected characterization above); it only requires the create-handler to consult the folder rule. The spec can ship it alongside (1)–(3) or defer it without affecting the cascade decision.
- Consumers (5)–(9) each add their own surface area (docs-site codegen, search-index schema, access-gate wiring, backlink filtering). They compose well with (1)–(4) but expand the spec's scope proportionally.

---

### D7: Config-driven vs sibling-file tradeoff

**Finding:** A concrete decision matrix — not a recommendation. The user's bias is config-driven; this section documents when sibling-file wins, so the spec can be informed rather than reactive.

| Dimension | Config-driven (`folders:` in config.yml) | Sibling-file (`meta.json` per folder) |
|---|---|---|
| **Bulk rules across many folders** (e.g. "every folder matching `specs/**`") | ✅ Natural — one glob rule | ❌ Requires duplicating the file in each folder |
| **Per-folder overrides** (e.g. "this one folder has a custom icon") | ⚠️ Requires most-specific rule or dedicated entry; precedence matters | ✅ Natural — create the file |
| **User-editable from within the editor** | ❌ Config lives in `.open-knowledge/config.yml`, outside the content tree — needs a separate UI affordance | ✅ The file IS a doc; editable like any other |
| **Survives repo-rename / subtree-copy** (moving `specs/` into another repo) | ❌ Rules in parent config don't move with the subtree | ✅ Metadata travels with the folder |
| **Single source of truth across editor + docs site** | ✅ One config, codegen `meta.json` for docs | ⚠️ Depends — if editor adopts the same `meta.json` convention, yes; otherwise two sources |
| **Schema validation** | ✅ Zod + workspace loader — unified | ✅ Zod (Fumadocs pattern) |
| **"Default frontmatter for new files"** (cascade) | ✅ Rule location scales | ❌ No surveyed sibling-file system does this except Hugo (where the file is `_index.md`, half-doc) |
| **Discoverability for new contributors** | ⚠️ Config file away from content tree — requires `grep` or docs | ✅ Sibling file in the folder — naturally discovered |
| **Merge-conflict volume during collaboration** | ⚠️ Central file → more conflicts | ✅ Decentralized — conflicts localized to one folder |
| **Matches OK's existing `docs/` site** | ❌ Different shape from shipping `meta.json` pattern | ✅ Same pattern as `docs/content/meta.json` |

**Hybrid option (Shape D, emerges naturally):** config-driven rules provide **defaults for bulk cases**; optional sibling `meta.json` **overrides per folder**. Fumadocs' approach when users want both: the schema is `.extend()`-able, and explicit per-folder files take precedence over any computed defaults. Docusaurus already does this implicitly — `sidebars.js` + `_category_.json` coexist. This would mean 90% of the ergonomic benefit of both approaches, at the cost of two places users might look.

**When sibling-file clearly wins:**
- When the spec already commits to editor-based folder-metadata editing (user edits the metadata *inside the editor*).
- When OK wants one convention that matches `docs/content/meta.json` without codegen.
- When the expected usage pattern is "each folder is unique; no bulk rules."

**When config-driven clearly wins:**
- When the expected pattern is "many folders follow the same schema" (e.g. `specs/**` all behave the same, `reports/**` all behave the same).
- When the spec wants cascade (default frontmatter for new files in a subtree).
- When "single source of truth" ergonomics matter more than "metadata travels with the folder."

---

## Limitations & Open Questions

### Dimensions not fully covered

- **Subagent sandbox caveat on D4:** WebFetch/curl/gh-api were denied in the subagent environment; D4 schemas are paraphrased from convergent documentation excerpts, not verbatim `.d.ts` / schema files. A spec author settling on specific field names (e.g. VitePress's exact `SidebarMulti` keys) should spot-check against source type files before finalizing.
- **D19 context captured:** The prior deprecation reason was clarified by the product owner: D19 rejected using a markdown file's (INDEX.md's) frontmatter as the folder-metadata carrier, because it creates a "shadow folder structure in files" — conflating a content doc with folder config. Any new spec must NOT re-propose embedding folder metadata in an overloaded content file (so Hugo `_index.md` is out); dedicated sibling files and config.yml-driven rules both satisfy the discipline. See §D2 and [evidence/d2-frontmatter-pipeline.md](evidence/d2-frontmatter-pipeline.md).
- **Sanity / Payload / TinaCMS** — the user flagged these during scoping as potentially worth a D3.5 but then didn't add them to the rubric. If the spec cares about headless-CMS analogues specifically, they're worth a brief follow-on probe.

### Out of scope (per rubric)

- Editor UI design for folder-property editing panels
- Full docs-site navigation implementation
- Search-facet product design
- Repo migration tooling (e.g. "convert existing `docs/content/*/meta.json` to `config.yml` folder rules")

---

## References

### Evidence Files

- [evidence/d1-config-yml-architecture.md](evidence/d1-config-yml-architecture.md) — 1P: schema, loader, path-match primitives
- [evidence/d2-frontmatter-pipeline.md](evidence/d2-frontmatter-pipeline.md) — 1P: frontmatter storage, parsers, consumers, `docs/` internal precedent
- [evidence/d3-sibling-file-prior-art.md](evidence/d3-sibling-file-prior-art.md) — Fumadocs, Docusaurus, Nextra, Hugo, Obsidian
- [evidence/d4-config-driven-prior-art.md](evidence/d4-config-driven-prior-art.md) — VitePress, Docusaurus, Starlight, Astro, Mintlify, Turborepo, Biome, Obsidian Bases

### External Sources (primary)

- [Fumadocs `metaSchema`](https://github.com/fuma-nama/fumadocs) — Zod definition read from `node_modules/fumadocs-mdx/dist/config/index.js:11-18`
- [Docusaurus autogenerated sidebar](https://docusaurus.io/docs/sidebar/autogenerated) — `_category_.json` field reference
- [Nextra `_meta` file](https://nextra.site/docs/file-conventions/meta-file) — shape and supported extensions
- [Hugo `cascade`](https://gohugo.io/content-management/front-matter/) + [cascade configuration](https://gohugo.io/configuration/cascade/) — the one cascade system in production
- [VitePress sidebar](https://vitepress.dev/reference/default-theme-sidebar) + [types](https://github.com/vuejs/vitepress/blob/main/types/default-theme.d.ts)
- [Starlight sidebar](https://starlight.astro.build/reference/configuration/#sidebar)
- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/) + [content loader reference](https://docs.astro.build/en/reference/content-loader-reference/)
- [Mintlify navigation](https://mintlify.com/docs/navigation)
- [Biome configuration](https://biomejs.dev/reference/configuration/) — precedence-direction case study
- [Turborepo configuration](https://turborepo.dev/docs/reference/configuration)

### Related Research (see-also)

- [reports/frontmatter-schema-conventions-for-agent-readable-docs/](../frontmatter-schema-conventions-for-agent-readable-docs/) — per-file frontmatter field vocabulary across 8 systems; adjacent to this report but not redundant (this report is about *folder*-level metadata, that one is about *per-file* field names).
- [reports/kb-index-navigation-patterns-for-agents/](../kb-index-navigation-patterns-for-agents/) — navigation patterns for agent-native KBs; touches frontmatter-metadata as navigation substrate.
