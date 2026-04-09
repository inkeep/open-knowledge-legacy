# Audit Findings — Monorepo Restructure (PR #10)

**Artifact:** `specs/2026-04-08-typed-component-nodes/SPEC.md` (868 lines, baseline `02c2211`)
**Audit date:** 2026-04-08
**Trigger:** PR #10 (`8971f7c spec: CLI packaging as @inkeep/open-knowledge`) restructured `init_spike/` into four packages (`packages/core`, `packages/server`, `packages/cli`, `packages/app`). Spec was written and finalized against the pre-restructure single-directory layout.
**Total findings:** 14 (5 High, 6 Medium, 3 Low)
**Bottom line:** The spec is **NOT** patchable with purely mechanical path rewrites. At least four load-bearing architectural assumptions are broken by the package split and require design decisions, not just path updates. The mechanical rewrites are straightforward, but the package-boundary rethink must happen first.

---

## High Severity

### [H1] `JsxComponent` extension is now split across `core` and `app` — spec's "single extension" design and `.extend()` chain may silently drop markdown hooks

**Category:** FACTUAL / architectural
**Source:** T1 (own codebase trace)
**Location:** SPEC.md §3.3 (TipTap Node Spec Evolution, OQ4 "single extension"), §3.5 (markdownTokenName), §3.9 (JsxComponentView Evolution), §4 Phase 2 steps 1-5, D6, D8 (two node types: `jsxComponentEditable` / `jsxComponentVoid`)
**Issue:** The spec treats `JsxComponent` as one monolithic TipTap extension that owns everything: schema, attributes, `parseMarkdown`, `renderMarkdown`, `markdownTokenName`, `parseHTML`, `renderHTML`, and (implicitly) `addNodeView`. The current monorepo splits this into two layers:
- `packages/core/src/extensions/jsx-component.ts:17-76` — `Node.create({ ... })` with `markdownTokenName: 'code'`, `parseMarkdown`, `renderMarkdown`, `parseHTML`, `renderHTML`, `addAttributes`, `addCommands`. **No React, no NodeView.**
- `packages/app/src/editor/extensions/jsx-component.ts:11-15` — `BaseJsxComponent.extend({ addNodeView() { return ReactNodeViewRenderer(JsxComponentView); } })`.
- `packages/app/src/editor/extensions/shared.ts:9-11` — swaps the core extension for the extended version via `.map()`.

The spec's entire Phase 2 design assumes one place to add `componentName`, dynamic prop attributes (D6), and two-type routing (D8 `jsxComponentEditable` vs `jsxComponentVoid`). With the current split:
1. `addAttributes()` lives in core but depends on the component registry (which is browser-only React-aware code). Core cannot `import` from the registry without breaking its "no React / browser+Node compatible" constraint (see CLAUDE.md "Key constraint").
2. `parseMarkdown` / `renderMarkdown` are non-standard fields supplied by `@tiptap/markdown`. It is **unverified** whether TipTap's `.extend()` preserves these fields or silently drops them; the PR #10 app extension only passes `addNodeView` to `.extend()`, so parse/render hooks must be inherited, but this has not been empirically confirmed for non-standard extension fields.
3. The "two node types" D8 design (`jsxComponentEditable` + `jsxComponentVoid`) would require TWO extensions in core, TWO `.extend()` calls in app, and TWO entries in the shared-extensions swap map. Current code has one `JsxComponent` with `name: 'jsxComponent'`.

**Current text (§3.3):** *"Single extension with formal attributes from registry. ... `parseHTML` reads `data-prop-*` attributes, `renderHTML` writes them."*
**Current text (Phase 2 step 2):** *"Two node types (D8): `jsxComponentEditable` (registered, non-atom for Phase 3) + `jsxComponentVoid` (unregistered, atom: true). Single parseMarkdown handler checks registry to decide type."*

**Evidence:**
- `packages/core/src/extensions/jsx-component.ts:17` — `name: 'jsxComponent'` (singular)
- `packages/core/src/index.ts:12` — only exports `JsxComponent` and `fenceFor`
- `packages/app/src/editor/extensions/jsx-component.ts:11-15` — app's `.extend({ addNodeView })` passes only the NodeView field
- CLAUDE.md (packages/core description): *"No React or Node.js server dependencies — browser + Node compatible"*

**Status:** INCOHERENT (single-extension design contradicts two-location layered architecture; registry-driven attributes cannot live in core per CLAUDE.md constraint)
**Suggested resolution:**
1. Decide where the registry lives (see H3). If it lives in `packages/app/`, core cannot own the attribute spec — the extension attribute set would need to be injected from app at schema construction time, which breaks D6.
2. Alternative: core exports a **factory** `createJsxComponentExtension(registry)` that returns a configured `Node.create(...)`. Both server and app would call the factory after loading their own registry instance.
3. Document that `.extend()` preserves `parseMarkdown`/`renderMarkdown`/`markdownTokenName` (needs empirical test), or stop using `.extend()` and fully reconstruct the extension in app.
4. If D8 is kept, export two extensions from core (`JsxComponentEditable`, `JsxComponentVoid`), and extend each separately in app.

---

### [H2] Schema construction order refactor now has 9 sites, not 2 — Phase 1 Step 0 is under-scoped

**Category:** FACTUAL / architectural
**Source:** T1 (own codebase trace)
**Location:** SPEC.md §4 Phase 1 step 0 ("Refactor schema construction order (REQUIRED by PM-M3)"), R12
**Issue:** The spec identifies two `getSchema(sharedExtensions)` sites to refactor: `TiptapEditor.tsx:53` and `persistence.ts:28`. Current tree has **nine** such sites across four packages:

| # | File | Line | Package |
|---|------|------|---------|
| 1 | `packages/app/src/editor/TiptapEditor.tsx` | 53 | app |
| 2 | `packages/app/src/editor/observers.test.ts` | 15 | app |
| 3 | `packages/app/src/editor/observer-sync.test.ts` | 20 | app |
| 4 | `packages/app/src/server/hocuspocus-plugin.ts` | 34 | app (Vite plugin) |
| 5 | `packages/app/src/server/agent-flow.test.ts` | 24 | app |
| 6 | `packages/server/src/standalone.ts` | 32 | server |
| 7 | `packages/server/src/persistence.ts` | 34 | server |
| 8 | `packages/server/src/agent-sessions.ts` | 32 | server |
| 9 | `packages/core/src/extensions/jsx-component.test.ts` | 8 | core |

Each call wraps `sharedExtensions` — and since the spec wants `sharedExtensions` to change shape based on the registry (D6), **every one of these sites** either (a) must defer schema construction until after the registry loads, or (b) must use the same registry-aware `sharedExtensions`.

Worse: app has its own `sharedExtensions` at `packages/app/src/editor/extensions/shared.ts` that swaps in the React-extended `JsxComponent`. Server packages use the unswapped core `sharedExtensions`. **This is already two divergent shapes** — the spec does not acknowledge this divergence.

Also: the spec's R12 says *"browser loads via JSON manifest bundled at build time"* — but in the current architecture the server also loads the manifest, and the `persistence.ts` MarkdownManager (which the persistence layer runs at every document save) must use the same registry-aware schema. Otherwise server-side save uses a different schema than client-side edit → attribute-level LWW breaks silently.

**Status:** STALE / INCOHERENT (the refactor scope is ~5x larger than spec describes, and the server/app `sharedExtensions` divergence is already present)
**Suggested resolution:**
1. Update R12 and Phase 1 Step 0 to enumerate all 9 sites and commit to a single pattern (factory or module-scoped lazy init).
2. Decide whether `packages/app/src/editor/extensions/shared.ts` (React-extended) or `packages/core/src/extensions/shared.ts` is the source of truth for schema. Servers must use whichever shape the client uses, or both sides must produce byte-identical serialization.
3. Move the registry load + schema factory into `packages/core/` (as a pure function) so both server and app can call it; document that core remains React-free by taking the registry as a parameter.

---

### [H3] Component registry has no unambiguous home in the new package layout

**Category:** FACTUAL / architectural
**Source:** T1 (own codebase trace) + L1 (cross-finding contradictions)
**Location:** SPEC.md §3.1 (`src/editor/components/registry.ts`), §3.2 (`src/server/component-introspection.ts`), §4 Phase 1 steps 3-4, §6 Future Work ("MCP endpoint: component registry query")
**Issue:** The spec places the registry in `src/editor/components/registry.ts` and the introspection in `src/server/component-introspection.ts`. Neither directory exists. With the restructure, "`src/editor/`" maps to `packages/app/src/editor/` (React) and "`src/server/`" maps to `packages/server/src/` (Node). Placing the registry in each creates a conflict:

- **If the registry lives in `packages/app/`:** server's persistence layer (which serializes/deserializes JSX to markdown via `MarkdownManager` — see `packages/server/src/persistence.ts:33-34`, `standalone.ts:31-32`, `agent-sessions.ts:31-32`) cannot import it without taking a dependency on the React editor package. The current dependency direction is `cli → server → core` and `app → server + core` (CLAUDE.md); `server → app` is forbidden.
- **If it lives in `packages/core/`:** core imports React components (the `ComponentMeta.component: React.ComponentType<any>` field from §3.1). This **directly violates** core's documented constraint *"No React or Node.js server dependencies"* (CLAUDE.md).
- **If it lives in `packages/server/`:** the React NodeView in `packages/app/src/editor/extensions/JsxComponentView.tsx` cannot import React components from a server package (Node-only; the server package brings `@hocuspocus/server`, `simple-git`, `@parcel/watcher` into the browser bundle).
- **If it lives in `packages/cli/`:** cli is a separate published package downstream of server; server cannot import from cli.

Similarly, `react-docgen-typescript` is a Node.js build-time tool — it cannot run in the browser bundle. The introspection code (§3.2) must live in a Node-only location, but the registry that **consumes** introspection results needs to be readable by both server (for MarkdownManager) and app (for React NodeView).

**Current text (§3.1):** *"// src/editor/components/registry.ts"*
**Current text (§3.2):** *"// src/server/component-introspection.ts (runs server-side at startup)"*

**Evidence:**
- `packages/core/package.json` — no React, no react-docgen-typescript dependency
- `packages/server/package.json` — no React, no react-docgen-typescript dependency
- `packages/app/package.json` — React present, no react-docgen-typescript
- CLAUDE.md (core description): *"No React or Node.js server dependencies"*
- CLAUDE.md (dependency direction): `app → server + core`, `cli → server → core`

**Status:** INCOHERENT (there is no package in the current layout that can own both the React components AND the extracted PropDefs AND be reachable from both server and app)
**Suggested resolution:**
1. **Split the registry into two layers:**
   - `packages/core/` owns `PropDef`, `ComponentMeta` *without* the `component` field, and the `.openknowledge/components.json` JSON schema. Pure types + data.
   - `packages/app/` owns the React `componentMap: Record<string, React.ComponentType>` and the NodeView-side `getComponent()` that merges the JSON manifest with the React map.
   - `packages/server/` reads only the JSON manifest (for `MarkdownManager` schema construction via core).
2. Put `component-introspection.ts` in **a new Node-only location**. Options:
   - `packages/cli/` if it runs as a CLI build step (`open-knowledge build-registry`)
   - A separate dev script under `packages/app/scripts/` that runs at build time (Vite plugin)
   - A new `packages/build-tools/` package
3. The generated JSON manifest must be importable by both server (for schema) and app (for NodeView) — commit it under `packages/core/` so both can import it via workspace alias.

---

### [H4] `syncTextToFragment` moved from `hocuspocus-plugin.ts:148` to `packages/server/src/agent-sessions.ts:39` — all R14/CE05/§3.6 cross-references are broken

**Category:** FACTUAL / path
**Source:** T1 (own codebase trace)
**Location:** SPEC.md §2 Tertiary ("Agent writes use server-side `syncTextToFragment()` (`hocuspocus-plugin.ts:148`)"), §3.6 (Prop Panel — agent-write race), R14, CE05 notes
**Issue:** The spec cites `hocuspocus-plugin.ts:148` as the home of `syncTextToFragment()`. That function now lives in `packages/server/src/agent-sessions.ts:39-50`. It is **exported** from `@inkeep/open-knowledge-server` (see `packages/server/src/index.ts:6`) and consumed by `packages/server/src/api-extension.ts:15,79,160`.

The old `hocuspocus-plugin.ts` no longer contains agent write logic at all — `packages/app/src/server/hocuspocus-plugin.ts` is now a 160-line Vite plugin that instantiates `Hocuspocus`, imports `AgentSessionManager` + `createApiExtension` from the server package, and wires websockets. It has no `syncTextToFragment` definition.

This breaks:
- §2 Tertiary's file-line citation
- R14's "Server-side `syncTextToFragment()` (`hocuspocus-plugin.ts:148`)"
- The CE05 test scenario's "Exercises ... server-side `syncTextToFragment` merge" — which layer owns this is now ambiguous
- Anyone searching for the race mitigation in `hocuspocus-plugin.ts` will find nothing

**Status:** STALE (path + line number + owning file all wrong)
**Suggested resolution:** Rewrite every reference to cite `packages/server/src/agent-sessions.ts:39` (definition) and `packages/server/src/api-extension.ts:79,160` (call sites). Note that the function is now **public API of `@inkeep/open-knowledge-server`**, so test code can import it directly rather than reaching through the Vite plugin.

---

### [H5] `.openknowledge/` directory name conflicts with CLI spec's `.open-knowledge/` convention

**Category:** FACTUAL / L1 (cross-finding contradiction between specs)
**Source:** T1 + cross-spec read
**Location:** SPEC.md §3.2 (`.openknowledge/components.json`), §4 Phase 1 step 5, §4 Phase 4 step 4, §6 In Scope
**Issue:** The spec commits to `.openknowledge/components.json` (no hyphen). The CLI packaging spec at `specs/2026-04-08-cli-packaging/SPEC.md` established `.open-knowledge/` (with hyphen) as the config directory convention:
- CLI spec line 201: *"Zod defaults → ~/.open-knowledge/config.yml → ./.open-knowledge/config.yml → ENV → CLI flags"*
- CLI spec line 232: *"`open-knowledge init [path]` | Scaffold `.open-knowledge/config.yml` + `content/`"*
- CLAUDE.md: *"Hierarchical YAML in `.open-knowledge/` directories"*

Both directories would coexist if the spec is implemented as written — `./open-knowledge/` for CLI config AND `./.openknowledge/` for component manifests. This is confusing, inconsistent, and no technical reason to diverge.

Additionally, the spec does not commit to a repo location: is `.openknowledge/components.json` at the repo root (alongside `package.json`), per-package (`packages/app/.openknowledge/`, `packages/core/.openknowledge/`), per-workspace (`./.open-knowledge/components.json` alongside CLI config), or user-level? Every option has different reachability implications from server/app code.

**Status:** INCOHERENT (directory name conflicts with established convention)
**Suggested resolution:**
1. Rename `.openknowledge/` to `.open-knowledge/` (match CLI spec) OR commit to a clearly different directory like `packages/core/src/generated/components.json` that is not a dotfile.
2. Pick a concrete location and update every spec reference (§3.2, Phase 1 step 5, Phase 4 step 4, §6 In Scope).
3. If the manifest is meant to be committed per the spec, put it in a location that both `packages/server/persistence.ts` and `packages/app/src/editor/` can import via workspace alias — recommendation: `packages/core/src/generated/components.json` (bundled with core, accessible from all downstream packages).

---

## Medium Severity

### [M1] Every `init_spike/...` path in the spec is stale — exhaustive rewrite table

**Category:** FACTUAL / path
**Source:** T1 (own codebase trace)
**Location:** SPEC.md header (§ "Location") + §4 Phase 1 step 1 + §4 Phase 4 step 4
**Issue:** Three direct `init_spike/` references in the spec prose, plus ~30+ implicit `src/...` paths that were understood as `init_spike/src/...`. Exhaustive mapping:

| # | Spec reference | OLD path | NEW path |
|---|----------------|----------|----------|
| 1 | Header §: Location | `init_spike/` | No single directory — spans `packages/core`, `packages/server`, `packages/app`, `packages/cli` |
| 2 | §4 Phase 1 step 1 | `init_spike/src/components/` (shadcn install target) | `packages/app/src/components/` (for React-only shadcn) |
| 3 | §4 Phase 4 step 4 | `init_spike/.openknowledge/components.json` | See [H5] — location undecided |
| 4 | §4 Phase 4 step 4 | `init_spike/CLAUDE.md` | `CLAUDE.md` (repo root — already exists, no `init_spike/CLAUDE.md`) |
| 5 | §4 Phase 4 step 4 | `init_spike/AGENTS.md` | Does not exist. Repo root? `packages/core/AGENTS.md`? Not decided. |
| 6 | §3.1 comment | `src/editor/components/registry.ts` | See [H3] — no unambiguous home |
| 7 | §3.2 comment | `src/server/component-introspection.ts` | See [H3] — cannot live in `packages/server/` (needs React?) or needs decision |
| 8 | §3.6 | `src/editor/observers.ts` (for `markUserTyping` import) | `packages/app/src/editor/observers.ts:66` (confirmed) — but spec's `import { markUserTyping } from '@/editor/observers'` alias needs update because the `@` alias is now `packages/app/src` |
| 9 | §2 Tertiary | `observers.ts:125-253` (delta logic line range) | `packages/app/src/editor/observers.ts` — file is now 389 lines; `applyUserDelta` is at line 125 (unchanged); verify against current file |
| 10 | §2 Tertiary | `hocuspocus-plugin.ts:148` | See [H4] — `packages/server/src/agent-sessions.ts:39` |
| 11 | §4 Phase 0 step 4 | `test-fixture.md` (edit to raw JSX) | `packages/app/content/test-fixture.md` (confirmed exists) |
| 12 | §4 Phase 2 step 8 | `JsxComponentView.tsx` | `packages/app/src/editor/extensions/JsxComponentView.tsx` |
| 13 | §4 Phase 0 step 1 / D11 | markdownTokenizer in core | `packages/core/src/extensions/jsx-tokenizer.ts` (already exists — spec is unaware tokenizer PROTOTYPE already landed) |
| 14 | R10 / evidence/raw-jsx-tokenizer-proof.md | `observers.ts:288-301` (early-exit) | `packages/app/src/editor/observers.ts:287-315` (±5 lines) |
| 15 | PM-H3 / A7 | `observers.ts:125-174` (applyUserDelta) | `packages/app/src/editor/observers.ts:125-174` (unchanged offset — current impl still there) |
| 16 | §3.2 | `fumadocs-ui/dist/components/*.d.ts` extraction | Unchanged (external path); but requires react-docgen-typescript to run from a Node context — see [H3] |

**Status:** STALE (paths correct at time of writing, now all wrong)
**Suggested resolution:** Global find-replace is insufficient because most paths require decisions from [H1], [H2], [H3]. Create a path-rewrite table in the spec's §4 front-matter AND update every prose reference.

---

### [M2] Spec's "single source of truth" claim for `sharedExtensions` is already violated

**Category:** FACTUAL / L1 (self-contradiction with current code)
**Source:** T1 (own codebase trace)
**Location:** SPEC.md §3.3, §4 Phase 1 Step 0, implicit throughout Phases 1-3
**Issue:** The spec assumes one `sharedExtensions` array. The current tree has **two**:
- `packages/core/src/extensions/shared.ts` — core's base (line 11-23): `JsxComponent` (no NodeView), `StarterKit`, `Table*`, `Image`, `TaskList`, `TaskItem`
- `packages/app/src/editor/extensions/shared.ts` — app's version (lines 5-11): same array but with `JsxComponent` swapped for the React-extended version

Server-side code (`persistence.ts`, `standalone.ts`, `agent-sessions.ts`, `hocuspocus-plugin.ts`) imports from `@inkeep/open-knowledge-core`. Browser-side code (`TiptapEditor.tsx:17`) imports from `./extensions/shared.ts` (the app version). When the spec says "add a new attribute to `sharedExtensions`," it is ambiguous which file to edit.

CLAUDE.md explicitly acknowledges this risk: *"`sharedExtensions` MUST stay in sync between core, server, and app — drift causes silent data corruption."* The spec does not mention the divergence.

**Status:** STALE / INCOHERENT (the "one array" model never existed post-PR #10)
**Suggested resolution:** Update §3.3 and §4 to explicitly list the two files, and add a new phase 0 step: "any shape change to `sharedExtensions` must be applied to BOTH `packages/core/src/extensions/shared.ts` and `packages/app/src/editor/extensions/shared.ts`, and both files must produce semantically identical schemas (divergence limited to `addNodeView`)."

---

### [M3] `bun run check` and `bun run check:fast` are no longer root-level commands

**Category:** FACTUAL / ecosystem
**Source:** T1 (own codebase trace)
**Location:** SPEC.md §4 Phase 0 step 10, Phase 1 step 8, Phase 2 step 13, Phase 3 step 8, Phase 4 step 8, STOP_IF clause
**Issue:** The spec's verification protocol uses `bun run check` (green) and `bun run check:fast` (Phase 1 step 8) as phase exit gates. In the current monorepo:
- Root `package.json` defines `check` as `bun run typecheck && bun run lint` where `typecheck` is just `cd docs && bun run typecheck` — it does not touch the typed-component work at all.
- Neither `check` nor `check:fast` at the root runs `packages/app` tests, `packages/core` tests, `packages/server` tests, or builds.
- `packages/app/package.json` has both `check` (`tsc --noEmit && biome check . && bun test && vite build`) and `check:fast` (`tsc --noEmit && biome check .`) — these are **per-package** commands.
- `packages/core`, `packages/server`, `packages/cli` do not define `check` or `check:fast` at all.

Any automation or CI referencing "run `bun run check`" from the repo root will pass trivially without actually checking the app code. A STOP_IF clause gated on that command does not protect anything.

**Status:** STALE (command ran a unified suite pre-restructure; now only checks docs typecheck + lint)
**Suggested resolution:**
1. Add a root-level meta-script that runs `bun run check` in every package: `"check": "bun run --filter './packages/*' check"` (or similar bun workspace incantation).
2. OR update the spec to say "`cd packages/app && bun run check` + `cd packages/core && bun run check` + `cd packages/server && bun run check`" explicitly.
3. Verify the per-package `check:fast` exists in all packages you'll run it in (Phase 1 step 8 uses it — currently only `packages/app` has it).

---

### [M4] `react-docgen-typescript` has no viable host package in the current dependency graph

**Category:** FACTUAL / architectural
**Source:** T1 (own codebase + package.json scan)
**Location:** SPEC.md §4 Phase 1 step 1, §5 Tech Stack
**Issue:** `react-docgen-typescript` is a Node-only build tool. Spec §4 Phase 1 step 1 says *"Add `react-docgen-typescript`, `acorn`, `acorn-jsx` dependencies"* but does not say which package owns the dependency.

Dependency analysis:
- `packages/core/`: should remain React-free and Node-free per CLAUDE.md. Adding react-docgen-typescript violates that constraint (it's Node-only).
- `packages/server/`: Node. Does not depend on React. Adding react-docgen-typescript is feasible but `server` currently has no reason to know about React components.
- `packages/app/`: React + browser. Adding react-docgen-typescript puts a Node build tool in a browser bundle — Vite will either fail or treeshake it.
- `packages/cli/`: Node. This is the only package that already has both Node tools and a build step (`tsdown`), but it is a published CLI downstream of server and core; it should not own types that server/core need to import.

`acorn` + `acorn-jsx` are isomorphic — they can go in core. But the parsed JSX string consumer is the markdown parser hook inside `JsxComponent`, which currently lives in `packages/core/` (so acorn should live there too — feasible).

The current tree already has a `jsx-tokenizer.ts` in `packages/core/src/extensions/` that the spec is unaware of (see M5 below) — the tokenizer exists but does not import acorn.

**Status:** UNVERIFIABLE / needs decision (no package in the current layout is an obvious host for react-docgen-typescript without rethinking the boundary)
**Suggested resolution:**
1. Put react-docgen-typescript in **a new `packages/tools/` or dev-only script location** that runs at build time and emits the JSON manifest. The manifest becomes the only thing that crosses the boundary.
2. Or put it in `packages/cli/` if the CLI owns a `build-registry` subcommand (§6 Future Work hints at this direction with "MCP endpoint: component registry query").
3. Do NOT put it in `packages/core/` or `packages/app/`.

---

### [M5] Spec is unaware the `jsxTokenizer` prototype already landed in `packages/core/`

**Category:** FACTUAL / STALE
**Source:** T1 (own codebase trace)
**Location:** SPEC.md §4 Phase 0 step 1, §4 Phase 0 step 5, D11, D12
**Issue:** Phase 0 step 1 says *"Build the markdownTokenizer (D11, D12): Version B tokenizer (~80 lines) with tag-counting for nested same-name components. Register as `markdownTokenName: 'jsxBlock'`"*. The current tree already has `packages/core/src/extensions/jsx-tokenizer.ts` exported from core (`packages/core/src/index.ts:14-21`) with `jsxTokenizerA`, `jsxTokenizerB`, `jsxTokenizerC`, `jsxStart`, `createJsxBlockExtension`. There is also `packages/core/src/extensions/jsx-tokenizer-prototype.test.ts`.

The spec treats this as work to do in Phase 0. It is partly done — Version B tokenizer already exists as a stand-alone export, but the current `JsxComponent` in core **still uses `markdownTokenName: 'code'`** (not `'jsxBlock'`) and still emits fenced `jsx-component` code blocks (see `packages/core/src/extensions/jsx-component.ts:48-62`). The tokenizer is orphaned from the extension.

**Status:** STALE (tokenizer prototype landed but not yet wired into `JsxComponent`; spec should update Phase 0 to "wire existing tokenizer into extension" rather than "build tokenizer")
**Suggested resolution:** Update Phase 0 step 1 to: "Wire the existing `jsxTokenizerB` (exported from `@inkeep/open-knowledge-core` per `packages/core/src/index.ts:14-21`) into `JsxComponent` by changing `markdownTokenName` from `'code'` to `'jsxBlock'` and adding the tokenizer registration. Delete the orphaned `fenceFor` helper (`packages/core/src/extensions/jsx-component.ts:12-15`) once migration completes."

---

### [M6] `src/components/*.tsx` shadcn install target is ambiguous in monorepo

**Category:** FACTUAL / path + ecosystem
**Source:** T1 (own codebase trace)
**Location:** SPEC.md §4 Phase 1 step 1 ("Install shadcn components ... into `init_spike/src/components/` via `npx shadcn@latest add`")
**Issue:** shadcn/ui CLI uses `components.json` at the project root to decide where to write files. With the monorepo, `components.json` would need to live in `packages/app/` (since components are React) and the install target would be `packages/app/src/components/`. But `npx shadcn@latest add` must be run from inside `packages/app/`, not from repo root.

Additionally, the spec adds *"fumadocs-ui, @inkeep/docskit as peer deps for built-in imports"* — these need to be dependencies of `packages/app/` (React) for runtime rendering AND dependencies of whichever package owns `component-introspection.ts` (for `.d.ts` extraction via `require.resolve('fumadocs-ui/package.json')`). The current tree has no `fumadocs-ui` or `@inkeep/docskit` anywhere.

**Status:** STALE + UNRESOLVED
**Suggested resolution:** Update Phase 1 step 1 to "Install shadcn components into `packages/app/src/components/` by running `cd packages/app && npx shadcn@latest add ...`. Create `packages/app/components.json` (shadcn config, not the generated registry manifest) pointing at `src/components/ui`. Add `fumadocs-ui` + `@inkeep/docskit` to `packages/app/package.json` dependencies; the introspection tool (see [M4]) reads their `.d.ts` files via `require.resolve` from wherever the tool runs."

---

## Low Severity

### [L1] Spec references to "init_spike" in prose feel historical but are never corrected

**Category:** COHERENCE / L3 (missing conditionality)
**Source:** reader pass
**Location:** SPEC.md header "Location" field, §4 Phase 1 step 1, §4 Phase 4 step 4
**Issue:** The spec has only three direct `init_spike/` mentions (confirmed via grep: 3 matches). All three are in editable prose and could be rewritten mechanically. The header field "Location: init_spike/" is the most load-bearing — anyone reading the spec cold will assume that directory still exists.
**Status:** STALE
**Suggested resolution:** Replace the header's "Location" with "Location: `packages/core/` (extensions) + `packages/app/` (editor UI) + TBD for registry" and remove the two Phase 4 `init_spike/` references.

### [L2] Observer line-number references are off by 5-25 lines but still roughly accurate

**Category:** FACTUAL / L4 (evidence-synthesis fidelity)
**Source:** T1
**Location:** SPEC.md §2 Tertiary (`observers.ts:125-253`), R10 (`observers.ts:288-301`), PM-H3 / A7 (`observers.ts:125-174`)
**Issue:** `observers.ts` is still 389 lines; `applyUserDelta` still starts at line 125; `applyIncrementalDiff` is at 93; early-exit is at 287-315 (spec says 288-301 — close but off). All references are close enough that a reader can find the right block but will occasionally read a different line than the spec cites. None of this affects design decisions.
**Status:** STALE (cosmetic)
**Suggested resolution:** Re-grep line numbers during spec patching.

### [L3] Spec's `import { markUserTyping } from '@/editor/observers'` example uses unconfigured alias

**Category:** FACTUAL / ecosystem
**Source:** T1 (vite.config.ts read)
**Location:** SPEC.md §3.6 code example
**Issue:** The spec code sample writes `import { markUserTyping } from '@/editor/observers'`. The `@` Vite alias now resolves to `packages/app/src` (see `packages/app/vite.config.ts:10-12`). The alias is valid only inside `packages/app/`. Any code outside `packages/app/` (server, core, cli) that wants to import `markUserTyping` cannot — but `markUserTyping` is a browser-only function, so this is fine in practice. The example is correct if interpreted as "this code runs inside packages/app". Worth noting that the alias is package-local and non-portable.
**Status:** LOW / acceptable with clarification
**Suggested resolution:** Add a parenthetical: "(inside `packages/app/`, where the `@/*` alias resolves to `packages/app/src/*`)."

---

## Confirmed Claims (summary)

Spec claims that **still hold** against the current tree:
- Observer A/B architecture, local-only gating, TYPING_DEFER_MS = 300, early-exit logic — all intact at `packages/app/src/editor/observers.ts` (just moved)
- `markUserTyping()` is exported from observers.ts:66 (exact line match)
- The "agent writes use server-side updateYFragment, clients skip remote" claim from §2 Tertiary — still true, just the implementation moved to `packages/server/src/agent-sessions.ts:39` and is called from `packages/server/src/api-extension.ts:79,160`
- `sharedExtensions` principle (single source of truth for schema) — still **intended** but violated in practice (see M2)
- 23 E2E tests / 22 server-side tests baseline — not verified in this audit; test file locations changed but counts are not audited
- D11/D12 tokenizer versions A/B/C — prototype code exists in core (M5)
- Core's `packages/core/src/extensions/jsx-component.ts` still uses `markdownTokenName: 'code'` with fenced `jsx-component` output (Layer 1 shape preserved) — matches the spec's "current state" description in §3.3

Spec claims **not re-verified** in this audit (would need empirical test):
- Disk bridge feedback loop fix (`b289cc6`) — persistence/file-watcher split across packages; needs re-verification
- Yjs CRDT merge semantics for concurrent tree replacement (R14) — unchanged, no code movement
- `updateYFragment` behavior — third-party library, not audited
- `@tiptap/markdown` preservation of non-standard fields through `.extend()` — critical unknown for H1

---

## Unverifiable Claims

- **`.extend()` preserves `markdownTokenName`/`parseMarkdown`/`renderMarkdown`:** The app's `JsxComponent.extend({ addNodeView })` adds only the NodeView. Whether TipTap's `.extend()` preserves non-standard fields added by `@tiptap/markdown` is not documented in spec sources and `node_modules` was not available for inspection in this audit run. If `.extend()` drops these fields, H1 escalates to a critical bug (app editor would lose markdown handling entirely). Needs a 10-line smoke test before Phase 2.
- **Where `.openknowledge/components.json` would actually be reachable from at runtime** — depends on bundler + workspace resolution, requires empirical test once the file exists.
- **Whether `packages/server/` persistence.ts `MarkdownManager` and `packages/app/` TiptapEditor.tsx `MarkdownManager` produce byte-identical serialization today** — one uses core's `sharedExtensions`, the other uses app's React-swapped version. If JsxComponent's `renderMarkdown` is intact in both, they match. If `.extend()` drops it, they diverge silently. This is the most dangerous unknown.

---

## Invariant Re-Verification Table

Per the four-category breakdown requested by the audit prompt:

| # | Invariant claim (spec) | Location claim (spec) | Current tree location | Status |
|---|------------------------|----------------------|----------------------|--------|
| I1 | Observer A processes local XmlFragment only | `observers.ts:125-253` | `packages/app/src/editor/observers.ts` (~125-253) | **Preserved** |
| I2 | Observer B processes local Y.Text only, early-exits on byte-match | `observers.ts:288-301` | `packages/app/src/editor/observers.ts:287-315` | **Preserved** (off by 5 lines) |
| I3 | `markUserTyping()` defers Observer B | `observers.ts:66` | `packages/app/src/editor/observers.ts:66` | **Preserved** (exact) |
| I4 | `syncTextToFragment()` writes both trees server-side | `hocuspocus-plugin.ts:148` | `packages/server/src/agent-sessions.ts:39` + called from `api-extension.ts:79,160` | **Preserved but moved** — H4 |
| I5 | Disk bridge has per-path hash queue | `b289cc6` commit | `packages/server/src/file-watcher.ts` + `persistence.ts:23` (`contentHash, registerWrite`) | **Likely preserved** — not re-verified |
| I6 | `sharedExtensions` is single source of truth | implicit | Two divergent copies at `packages/core/src/extensions/shared.ts` + `packages/app/src/editor/extensions/shared.ts` | **Broken by construction** — M2 |
| I7 | `editorSchema = getSchema(sharedExtensions)` lives at module top-level in 2 sites | `TiptapEditor.tsx:53` + `persistence.ts:28` | 9 sites across 4 packages (see H2 table) | **Broken** — H2 |
| I8 | `JsxComponent` is one extension | §3.3 OQ4 | Split across `core` (schema+markdown) + `app` (NodeView) via `.extend()` | **Architectural mismatch** — H1 |
| I9 | `MarkdownManager` instances share `sharedExtensions` | implicit | 10+ `new MarkdownManager({ extensions: sharedExtensions })` sites, but two different `sharedExtensions` imports | **Broken silently** — M2 |
| I10 | Raw JSX cycle-1 byte-identity (OS06) | evidence/raw-jsx-tokenizer-proof.md | Current `JsxComponent` still emits fenced — no raw JSX output to test yet | **Needs empirical re-check** after tokenizer wire-in (M5) |
| I11 | Test fixture lives at `test-fixture.md` | Phase 0 step 4 | `packages/app/content/test-fixture.md` (confirmed) | **Preserved but moved** |
| I12 | Byte-identity across persistence → disk | Phase 0 step 7 | `packages/server/src/persistence.ts` uses core's `sharedExtensions` (no React NodeView); `packages/app/src/editor/TiptapEditor.tsx` uses app's swapped version | **Needs empirical re-check** — if NodeView-less version serializes the same markdown, OK; if not, silent corruption |

---

## Grouping by restructure category

Per the audit prompt's requested five-section grouping:

### Category 1 — Mechanical path rewrites

- **M1** (exhaustive path table — 16 entries)
- **L1** (spec header "Location" field)
- **L2** (observer line numbers)
- **L3** (`@/` alias scope)
- **H4** (`syncTextToFragment` file path — has its own finding because it's load-bearing)

### Category 2 — Architectural mismatches forced by the restructure

- **H1** (`JsxComponent` split across core/app, `.extend()` preservation unknown)
- **H2** (schema construction refactor is 9 sites, not 2)
- **H3** (component registry has no unambiguous package home)
- **M2** (two divergent `sharedExtensions` arrays)
- **M4** (`react-docgen-typescript` has no viable host package)
- **M6** (shadcn install target + fumadocs peer deps location)

### Category 3 — Invariants to re-verify

See the Invariant Re-Verification Table above. Summary:
- **Likely preserved:** I1, I2, I3, I5
- **Preserved but moved (rewrite references):** I4, I11
- **Broken by construction:** I6, I7, I8, I9
- **Needs empirical re-check:** I10, I12

### Category 4 — New concerns from the monorepo boundary

- **H3** (cross-package import direction for registry)
- **M2** (sharedExtensions divergence — core vs app)
- **M3** (`bun run check` is no longer a unified gate)
- **M4** (react-docgen-typescript host decision)
- **H5** (`.openknowledge/` vs `.open-knowledge/` — cross-spec conflict with CLI spec)
- **Unverifiable** claims section above (`.extend()` field preservation, runtime reachability of `components.json`, server/app schema byte-identity)

### Category 5 — Final verdict

**Can this spec be patched with mechanical path rewrites alone? No.**

At least four architectural questions must be decided **before** Phase 0 starts, because they change the shape of the code the spec asks to be written:

1. **Where does the component registry live?** (H3) — decides where `PropDef` types, React component map, and introspection tool each go. Blocks Phase 1 entirely.
2. **Does `JsxComponent.extend()` in app preserve markdown hooks?** (H1 + Unverifiable) — empirical 10-line test. If no, Phase 2 needs a different factory pattern. If yes, spec's "single extension" story needs explicit documentation of the split.
3. **Is there ONE `sharedExtensions` or TWO?** (M2) — if two, Phase 0 must teach every spec section to update both. If unifying, a core/app integration is required first.
4. **Where does `.openknowledge/components.json` live, and does it conflict with CLI spec's `.open-knowledge/`?** (H5) — trivial rename decision, but unblocks docs + Phase 4.

Once those four decisions land, the path rewrites (M1) and per-package `bun run check` fix (M3) are mechanical. Everything else should follow.
