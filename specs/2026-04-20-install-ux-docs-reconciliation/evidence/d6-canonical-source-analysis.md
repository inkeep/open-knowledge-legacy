---
title: D6 — Canonical-source mechanism analysis
spec: specs/2026-04-20-install-ux-docs-reconciliation/SPEC.md (D6, G6)
date: 2026-04-20
sources:
  - packages/cli/specs/2026-04-20-install-ux-docs-reconciliation/SPEC.md §9 system design + §10 D6
  - docs/source.config.ts (existing remark-mdx-snippets configuration)
  - docs/package.json (fumadocs-mdx@~14.0.3 → installed 14.0.4)
  - docs/_snippets/.gitkeep (empty dir, plumbing present)
  - node_modules/fumadocs-mdx/dist/config/index.d.ts (exports remarkInclude)
  - node_modules/fumadocs-mdx/dist/chunk-FBLMK4RS.js:64-209 (remarkInclude source)
  - node_modules/remark-mdx-snippets/index.js (existing plugin internals)
  - https://www.fumadocs.dev/docs/mdx/include (feature documentation, fetched)
  - packages/cli/tsdown.config.ts (CLI bundler configuration)
  - packages/cli/package.json (files: ["dist"] — repo-root files NOT in tarball)
  - packages/cli/src/content/init.ts:9-97 (AGENTS_MD_CONTENT template literal)
  - README.md / docs/content/overview.mdx / docs/content/guides/getting-started.mdx (drift samples)
confidence: HIGH
---

# D6 — Canonical-source mechanism analysis for the install-path matrix

## Question

Where does the canonical install-path matrix live, and how does it propagate to each of the six user-facing surfaces without drift?

- S1. `README.md` (repo root, plain Markdown, GitHub-rendered)
- S2. `docs/content/overview.mdx` (Fumadocs MDX)
- S3. `docs/content/guides/getting-started.mdx` (Fumadocs MDX)
- S4. `docs/content/guides/cli-reference.mdx` + other guides (Fumadocs MDX, ~7 files touch install)
- S5. `packages/plugin/README.md` (plain Markdown, rendered by GitHub + Claude Code plugin page)
- S6. `packages/cli/src/content/init.ts` `AGENTS_MD_CONTENT` template literal, baked into `dist/cli.mjs`

Three options were scoped in §9:
- **A** — Fumadocs partial/MDX import, canonical lives in docs tree.
- **B** — Plain markdown snippet + build-time injection into README / AGENTS.md.
- **C** — Structured constants in `packages/cli/src/content/install-path.ts` + rendered output.

## Key findings (evidence-backed)

### F1 — Fumadocs already has first-class content reuse shipping in our pinned version

**Finding.** `fumadocs-mdx@14.0.4` (installed; pinned as `~14.0.3` in `docs/package.json:31`) exports `remarkInclude` from `fumadocs-mdx/config`. The feature documents at [fumadocs.dev/docs/mdx/include](https://www.fumadocs.dev/docs/mdx/include) and the plugin source lives at `node_modules/fumadocs-mdx/dist/chunk-FBLMK4RS.js:64-209`.

**Verified capabilities (reading the plugin source directly):**
- Tag syntax: `<include>./path/to/file.mdx</include>` in `.mdx`, `::include[./path/to/file.mdx]` in `.md` (the `.md` form requires adding `remark-directive` to `mdxOptions.remarkPlugins`).
- Paths resolve **relative to the including file** by default. An explicit `cwd` attribute overrides.
- Frontmatter of the included file IS stripped via `fumaMatter(content)` (line ~155 in the bundle) — included files can carry frontmatter for their own standalone rendering without polluting the consumer.
- HMR dependency tracking via `data._compiler?.addDependency(file)` — Fumadocs reruns the compile when the included file changes.
- Partial inclusion: `./file.mdx#heading-id` extracts content under that heading; `<section id="xxx">` (MDX) or `:::section{#xxx}` (Markdown) extracts a named region; `./code.ts#a` extracts a `//#region a` block from source files.
- Non-md/mdx files become syntax-highlighted code blocks (uses `params.lang` or file extension).

**Implication.** Option A (Fumadocs-native partial) is a solved problem for surfaces S2-S4. It needs **no new dependency**, **no new build step**, and no pattern invention.

### F2 — The repo already ships a competing snippet plugin that has not been adopted

**Finding.** `docs/source.config.ts:5,22` wires `remark-mdx-snippets` with `snippetsDir: path.resolve(process.cwd(), '_snippets')`. The `_snippets/` dir exists but contains only `.gitkeep` — grep for `<Snippet ` across `docs/content/` returns zero results. `remark-mdx-snippets` is listed as a `devDependency` in `docs/package.json:49`.

**Why two plugins?** `remark-mdx-snippets@0.3.3` pre-dates Fumadocs's native `remarkInclude`. The README at `node_modules/remark-mdx-snippets/readme.md` shows a Mintlify-inspired `<Snippet file="snippet.mdx" />` tag with remote-URL fetching. It was likely added before the maintainer upgraded Fumadocs to a version that ships `remarkInclude`.

**Implication.** If we pick Option A, we should converge on `remarkInclude` and delete the unused `remark-mdx-snippets` config + devDep. Two overlapping mechanisms invite future drift.

### F3 — `_snippets` has no precedent, no imports, no prior examples in the repo

**Finding.** `grep -rn "^import\|<Snippet\|<include" docs/content/` returns zero matches. No file in `docs/content/` currently imports another MDX file or uses any snippet tag. Existing component imports live in `docs/src/mdx-components.tsx` (Card, Callout, Steps, Tabs) and are injected via the Fumadocs component-provider pattern — not raw MDX imports.

**Implication.** This is **greenfield pattern** for the repo. The LOCKED decision sets a convention for all future shared-content work (release notes, glossary entries, etc.). That's an argument for picking the mechanism that minimizes moving parts, since the next contributor will copy whatever the install-path matrix did.

### F4 — The CLI's npm tarball does NOT include any file outside `dist/`, and tsdown supports text-extension loaders

**Finding.** `packages/cli/package.json:21-24` sets `"files": ["dist", "!dist/**/*.map"]`. Any canonical-source file at the repo root, in `docs/`, or elsewhere outside `packages/cli/dist/` is NOT in the published `@inkeep/open-knowledge` tarball. So Surface S6 (`AGENTS_MD_CONTENT` in `init.ts`) cannot `readFileSync` a relative path at runtime — the file would not exist in the user's `node_modules`.

**What works for S6:**
1. **Keep it a template literal in a .ts file** — trivially bundled (current state).
2. **Import from another .ts module** — bundled inline by tsdown (`unbundle: false`, `tsdown.config.ts:5`).
3. **Import a `.md` file as text via tsdown's `loader` option.** Verified from the tsdown discussion at [rolldown/tsdown#631](https://github.com/rolldown/tsdown/discussions/631): `loader: {'.md': 'text'}` causes tsdown to inline the file contents as a default-export string at build time. This is rolldown-backed and production-capable, though tsdown does not yet support `?raw` query-parameter imports.

**What does NOT work for S6:**
- Runtime `readFileSync('.../canonical.md', 'utf8')` — the file is not in the tarball.
- Runtime fetch — would require network on `ok init`, which is offline-hostile and violates the CLI's local-first posture.

**Implication.** The S6 constraint does NOT rule out any of Options A/B/C — all three can feed S6 via build-time inlining. But it does rule out "one file at repo root that everything reads at runtime." The canonical content MUST be duplicated into `dist/cli.mjs` during `cd packages/cli && bun run build`.

### F5 — Existing build pipeline has no snippet-injection precedent, but turbo+bun handles prebuild hooks fine

**Finding.** `turbo.json:4-7`: `build` task has `dependsOn: ["^build"]` and `outputs: ["dist/**", ".next/**"]`. No prebuild / postbuild hooks exist in the repo. `docs/package.json` has a `postinstall: "fumadocs-mdx"` script that regenerates the `.source/` cache, but nothing similar for content injection. Root `package.json` uses turbo for orchestration.

**Adding a codegen step.** A script like `scripts/sync-install-matrix.ts` could:
1. Read canonical content from its location (docs-site partial, `.ts` constants, or `.md` file).
2. Inject it into `README.md` and `packages/plugin/README.md` between marker comments (e.g. `<!-- install-matrix:begin --> … <!-- install-matrix:end -->`, mirroring the `OK_MARKER_BEGIN` pattern already used in `init.ts:5-7`).
3. Run in turbo-aware fashion either as a dedicated `turbo run sync:install-matrix` task, a pre-commit / pre-push lint-staged step, or simply as `bun run sync:install-matrix` that developers run + CI checks are clean.

**Precedent for marker-based injection.** `packages/cli/src/content/init.ts:5-7` already defines `OK_MARKER_BEGIN` / `OK_MARKER_END` comment pairs and uses them to rewrite a managed section inside `AGENTS.md` files on user machines. The exact same pattern scales to `README.md` / `plugin/README.md` for the install-matrix block.

### F6 — Prior art: inject-markdown is the canonical OSS implementation of Option B

**Finding.** [`streetsidesoftware/inject-markdown`](https://github.com/streetsidesoftware/inject-markdown) and [`SimonCropp/MarkdownSnippets`](https://github.com/SimonCropp/MarkdownSnippets) are the two OSS tools that solve "inject fragments into an outer `.md` file via marker comments." Turborepo, Vite, Vitest, Mastra, and Tauri all solve the README-vs-docs-duplication problem by **making their README trivially minimal** (one install command, then "see docs for details") — they do not use snippet injection because their README doesn't carry a matrix.

**Mastra's README** ([github.com/mastra-ai/mastra](https://github.com/mastra-ai/mastra/blob/main/README.md)) has one install command: `npm create mastra@latest`. Tauri's README ([raw.githubusercontent.com/tauri-apps/tauri](https://github.com/tauri-apps/tauri)) has one: `npm create tauri-app@latest`. Vitest's README points to `https://vitest.dev/guide/` for the full matrix and shows only `npx vitest`. **Their strategy is "push the matrix off the README entirely."**

**Implication.** "Just don't put the matrix in the README" is a real fourth option worth naming — call it Option D (dodge). We should acknowledge it but probably reject it: the parent spec's D1 implication "docs must show both forms in every install snippet" (bunx/npx/pnpm dlx + `ok` + `open-knowledge`) is driven by our heterogeneous audience (Bun self-identity + Node-majority dev population + pnpm monorepo users), not by copy-paste inertia.

### F7 — Drift is already present in the current snapshot, confirming the problem is real

**Finding.** `grep -n "bunx @inkeep\|npx @inkeep" README.md docs/content/ packages/plugin/README.md`:
- `README.md:14-18` uses **`bunx` primary**, mentions `npx` / `pnpm dlx` as alternates.
- `docs/content/overview.mdx:35-39` uses **`npx` only**, no mention of `bunx` or `pnpm dlx`.
- `docs/content/guides/getting-started.mdx:23,45,99,107-109,182` uses **`npx` throughout**.
- `packages/plugin/README.md:13,17,38` uses **`claude plugin add` + `bunx @inkeep/open-knowledge`** (no matrix at all).
- `packages/cli/src/content/init.ts:78` scaffolded AGENTS.md says **"`open-knowledge init` (or `npx @inkeep/open-knowledge init`)"**, no matrix.

**Implication.** Every single surface is currently divergent. G6 is not a speculative problem; the audit (F8 in the spec intake) has already characterized it, and this investigation confirms the audit was code-verified.

### F8 — CI drift check has three cheap shapes, each with trade-offs

Given any choice of canonical source, the enforcement mechanism options are:

| Approach | Implementation | Pros | Cons |
|----------|---------------|------|------|
| **(a) Marker-block regex check in CI** | `scripts/check-install-matrix.sh` greps for the marker pair in each consumer, diffs the enclosed block against canonical. One Bash script, one CI job. | Cheapest; no new deps; easy to understand. | Brittle if markers get moved; requires exact whitespace match unless the script normalizes. |
| **(b) Bun test file** | `packages/cli/tests/install-matrix.test.ts` reads each consumer file + canonical source and asserts content equality. | Uses existing `bun test` tier-1 runner; failure surfaces in the same check as other unit tests; IDE-integrated. | Adds a test that isn't testing product behavior (it's testing docs); slight semantic mismatch with the test-tier philosophy. |
| **(c) Pre-commit hook via husky** | Extend existing `.husky/pre-commit` with the check. | Fails locally before push. | Doesn't protect against PRs that bypass hooks (some developers disable them). |
| **(d) Codegen + commit-check** | The sync script regenerates files; CI runs it + fails if `git diff` is non-empty. | No regex brittleness — the generator is authoritative. | Every PR that modifies any of the 6 surfaces needs to regen + commit; minor contributor papercut. |

**Best combination for this repo:** (d) primary + (a) as a lightweight secondary CI check that catches accidental marker corruption. Aligns with `init.ts`'s existing marker-management discipline.

## Option evaluation

### Option A — Fumadocs `<include>` for docs site + marker-sync for README/plugin/S6

**Shape.**
- Canonical file: `docs/content/_partials/install-path.mdx` (contains the matrix as pure MDX — tables, code blocks, Fumadocs components).
- Each of S2, S3, S4 consumes it via `<include>./_partials/install-path.mdx</include>` (or `<include>./../_partials/install-path.mdx</include>` depending on the including file's location).
- For S1 (root README), S5 (plugin README), S6 (AGENTS.md in `init.ts`): either
  - A1: hand-synced + marker-block CI drift check (F8(a)+(b)).
  - A2: a `scripts/sync-install-matrix.ts` script reads the MDX partial, strips Fumadocs-specific components (or uses only plain-markdown constructs inside the partial), and injects between marker comments (F8(d)).

**Cost.**
- Zero new dependencies.
- ~40 lines of Fumadocs `<include>` configuration + the partial file itself.
- ~80 lines of sync script if going the A2 path, or ~50 lines of CI regex check if going A1.
- One-time migration pass across the 7 MDX files + S1 + S5 + S6.

**Pros.**
- Uses shipped Fumadocs feature — no invention.
- MDX partial can include Fumadocs components (`<Callout>`, `<Tabs>`) for rich rendering on the docs site.
- HMR works automatically; editing the partial in dev mode hot-reloads every consumer.
- Frontmatter stripping is free (F1).
- Sets a forward-compatible precedent for future shared content.

**Cons.**
- If we include Fumadocs components in the partial (`<Tabs>` for bin variants, say), those components don't render in plain GitHub Markdown — so the sync script into `README.md` / plugin README / AGENTS.md must strip / transform them. This pushes Option A toward Option A2 (scripted sync), which is approximately equivalent to Option B in cost.
- **OR** we constrain the partial to plain Markdown only (fenced code blocks + tables), losing some docs-site polish for the sake of simpler sync.

### Option B — Plain Markdown snippet + build-time injection into all 6 surfaces

**Shape.**
- Canonical file: `docs/content/_partials/install-path.md` (plain CommonMark + GFM tables, no Fumadocs components).
- `scripts/sync-install-matrix.ts` reads it + injects between marker comments into S1, S5, S6, and emits the MDX-wrapped form into S2-S4 (or S2-S4 also use `<include>`-with-markdown via `remark-directive`).

**Cost.**
- Zero new Fumadocs config changes (don't need `remark-directive` if MDX files use `<include>` via the existing config).
- ~100 lines of sync script.
- One CI check asserting `git diff --exit-code` post-sync.

**Pros.**
- Single shape across all 6 surfaces — the partial is "just markdown," which is what the audience ultimately consumes.
- Docs site uses `<include>./install-path.md</include>` (requires `remark-directive`) — still uses Fumadocs's native mechanism.
- AGENTS.md template in S6 gets the plain-markdown canonical content at CLI build time (tsdown `loader: {'.md': 'text'}` inlines the string into `dist/cli.mjs`).

**Cons.**
- Losing Fumadocs components in the partial means the docs-site rendering of the install matrix is plain markdown (no `<Tabs>`, no `<Callout>`). Acceptable if we render an outer MDX wrapper around the `<include>` that adds the components at the call sites.
- Adds a new build-time script; turbo caching needs to account for it (treat as input; add to `turbo.json`).
- Two subtly different include-mechanism paths: `<include>` for docs site, marker-block for README + plugin README + `.md` import for S6.

### Option C — Structured TS constants + render step

**Shape.**
- Canonical: `packages/cli/src/content/install-path.ts` exports an object like `{ bins: ['ok', 'open-knowledge'], runners: ['bunx', 'npx', 'pnpm dlx'], globalInstall: [...], ... }`.
- `scripts/render-install-matrix.ts` consumes the constants and renders:
  - A `.md` file for README / plugin README.
  - An `.mdx` file for docs site.
  - The `AGENTS_MD_CONTENT` variable for S6.

**Cost.**
- ~50 lines of TS data + Zod schema.
- ~150 lines of rendering logic (three output formats).
- One CI check asserting `git diff --exit-code` post-render.

**Pros.**
- Strongest semantic model — the data is typed, validated by Zod, and can evolve with schema migrations.
- Enables programmatic queries (e.g. "list all bins" for a test helper, "list all runners" for the preview command).
- The CLI can theoretically consume `install-path.ts` directly for S6 — no string-parsing needed.

**Cons.**
- Most-complex: three render paths, each with templating logic.
- Install-matrix content is not naturally structured data — it's prose + tables + code blocks. Forcing it into a schema adds ceremony without proportional benefit (the content isn't computed against, it's just displayed).
- Harder to edit: contributor wanting to tweak a phrase has to edit TS data, run the renderer, and verify three output diffs. With Option A/B they edit one `.md` / `.mdx` file and the rendering is trivial inclusion.
- Higher cognitive load for future contributors — sets a precedent that shared content must go through a data-modeling exercise.

## Hybrid variant worth naming

**Option A+B hybrid** — canonical is `docs/content/_partials/install-path.mdx` (Fumadocs partial), constrained to plain Markdown + optionally wrapped in Fumadocs components at **consumer** call sites (e.g. `<Tabs><Tab>{{include>install-path.mdx#bunx}}</Tab>...</Tabs>`). The sync script for S1/S5/S6 strips nothing because the partial itself has nothing to strip — it's plain markdown. Consumers decide locally whether to render it plainly or dress it up in components.

This is effectively Option B with the canonical file living under `docs/content/_partials/` rather than a sibling `docs/shared/` dir. Net cost is identical; the filesystem location is a bikeshed.

## Cross-cutting concerns

### Surface-6 (AGENTS.md template) coupling deserves a concrete mechanism choice

For any of A/B/C to propagate to S6, the CLI build needs to inline the canonical content into the bundled `dist/cli.mjs`. Three mechanisms work:

1. **tsdown `loader: {'.md': 'text'}`** — add to `packages/cli/tsdown.config.ts`, then `import installMatrixMd from '../../../docs/content/_partials/install-path.md'` in `init.ts`. Works at build time, no runtime reads. Clean.
2. **Generated `.ts` module committed to the repo** — the sync script emits `packages/cli/src/content/install-matrix.generated.ts` exporting a const string; `init.ts` imports it; build bundles it. Slightly more moving parts (a generated file lives in git) but works with zero tsdown config changes and makes the dependency explicit in imports.
3. **Direct build-time string substitution** — tsdown has `define` for compile-time constant replacement. Requires the sync script to run before `tsdown`; error-prone.

Mechanism (1) or (2) both work. (2) has the advantage of being greppable — `git grep "install-matrix.generated"` finds every consumer; the generated file is plain TS, IDE-navigable.

### Docs-site rendering flexibility

None of A / B / C block using Fumadocs `<Tabs>` for runner variants at the docs-site call sites — consumers can wrap the include in whatever MDX structure they want. The partial just provides the canonical text; the surrounding presentation is local. This is a strong argument for picking the simplest canonical form (plain markdown, per Option B) and deferring presentation to each consumer.

### Drift-check shape (independent of A/B/C choice)

Regardless of which option wins, the CI check should be **"run the sync script; assert `git diff --exit-code`"**. This is robust to marker-comment corruption (the script is authoritative), integrates with turbo caching (sync script is an input to a new `sync:install-matrix` task), and fails loudly in PR review rather than silently.

## Recommendation

**Option B (plain Markdown canonical + build-time injection), located at `docs/content/_partials/install-path.mdx`**, with these concrete bindings:

1. **Canonical file:** `docs/content/_partials/install-path.mdx` — written as plain Markdown (tables + fenced code blocks) that renders correctly both in GitHub Markdown (for S1/S5) and Fumadocs MDX (S2-S4). No Fumadocs-exclusive components inside the partial.
2. **Docs site consumers (S2-S4):** use Fumadocs's native `<include>./_partials/install-path.mdx</include>` — zero new dependencies, HMR-aware, frontmatter-stripped.
3. **README + plugin README (S1, S5):** injected between `<!-- install-matrix:begin --> … <!-- install-matrix:end -->` markers by `scripts/sync-install-matrix.ts`. CI runs the script and asserts `git diff --exit-code`.
4. **AGENTS.md template in init.ts (S6):** two equally-valid bindings — (a) tsdown `loader: {'.md': 'text'}` + direct import of the partial, or (b) `scripts/sync-install-matrix.ts` additionally writes `packages/cli/src/content/install-matrix.generated.ts` that `init.ts` imports. Prefer (b) for greppability and zero new tsdown-config risk.
5. **Delete the unused `remark-mdx-snippets` wiring** from `docs/source.config.ts` + `docs/package.json`. Converge on Fumadocs's native `remarkInclude` as the single docs-site include mechanism.
6. **Drift enforcement:** one new turbo task `sync:install-matrix` + one CI job `check:install-matrix` that runs the script and `git diff --exit-code`. Skip pre-commit / pre-push hooks to avoid developer papercuts.

**Confidence:** HIGH that this combination works mechanically. All three pieces (Fumadocs `<include>`, tsdown text loader, marker-block sync scripts) are either already in the codebase or shipped in installed dependencies with verified feature support.

**Confidence on ergonomics:** MEDIUM. The sync script is ~100 lines and the new marker-block discipline has to propagate into PR review practice — reviewers need to spot an accidental hand-edit inside a marker block and redirect to the partial. Mitigated by the CI check catching it regardless.

### Why not Option A pure

- Fumadocs components inside the partial force the sync script to strip/transform them for `README.md` / plugin README / AGENTS.md. That's a bigger surface than "read a markdown file and inject."
- Constraining the partial to plain Markdown yields Option B anyway.

### Why not Option C

- Install-matrix content is prose + tables, not structured data we query. The schema + render layer pays taxes without delivering programmatic leverage.
- Contributor ergonomics regress — four edit paths (TS data + three renderers) vs one edit path (one `.mdx` file).
- Future contributors will take Option C as a precedent and over-engineer the next shared-content opportunity (release notes, changelog, etc.). Plain-markdown canonical is the right default.

### Why not Option D (dodge / kill the matrix)

- Parent spec D1 LOCKED implication requires both bin forms + multiple runners to be visible. The audience bridges Bun-monorepo self-identity and Node-majority developer base; erasing one form alienates a segment.
- The audit proved the status quo is broken (drift across all 6 surfaces, F7).

## What would change my mind

- **If Fumadocs v15+ drops `remarkInclude`** or renames it incompatibly — revisit with an eye to `remark-mdx-snippets` (still maintained at 0.3.3) as the docs-site include mechanism. Would push toward Option B with `<Snippet file="..." />` syntax instead of `<include>`. Not a major shift; the canonical partial location stays.
- **If the content of the install matrix grows programmatic consumers** (e.g. a `preview --install-help` CLI command that renders the matrix + config detection, or a telemetry-free onboarding prompt that iterates runners) — shift toward Option C so the data is queryable. Today no such consumer exists.
- **If CI drift checks prove insufficient** (contributors keep landing hand-edits that bypass the sync script because the marker discipline is forgotten) — escalate from "run script + diff-clean CI" (F8 option (d)) to a git pre-push hook OR to Option A's pure Fumadocs include everywhere + a smaller S1/S5/S6 transformation surface.
- **If `tsdown` drops or breaks the `loader` option** — fall back to the committed `install-matrix.generated.ts` mechanism (Option B mechanism #2), which requires zero bundler features beyond default TypeScript import.
- **If a third OSS project in the same shape (AI-native CLI + Fumadocs docs + code-gen templates) publishes an opinionated canonical pattern** — revisit. Currently, Mastra / Tauri / Vitest all dodge the problem by keeping READMEs minimal, which is a valid architecture we chose not to adopt because parent spec D1 requires matrix visibility.
