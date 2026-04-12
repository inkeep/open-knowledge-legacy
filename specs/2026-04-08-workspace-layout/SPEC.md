# Workspace Layout — graduate init_spike & docs into a root workspace

**Status:** Draft
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-08
**Baseline commit:** fa3dd17
**Links:**
- Evidence: ./evidence/
- Prior exploration: (in-conversation, captured under ./evidence/)

---

## 1) Problem statement

**Situation:** `open-knowledge/` is a git repo whose root contains strategy/docs (`PROJECT.md`, `STORIES.md`, `ARCHITECTURE.md`, `specs/`, `reports/`, `evidence/`, `meta/`) plus two self-contained nested TypeScript/Bun projects: `init_spike/` (the editor prototype — Vite + React + Hocuspocus, now ~100 tests, presence & awareness features, agent write flows) and `docs/` (a Next.js + fumadocs site). Each nested project has its own `package.json`, `bun.lock`, `node_modules/`, `biome.jsonc`, `tsconfig.json`, and build configs. The root has a minimal `package.json` (husky + biome + lint-staged only), its `biome.jsonc` explicitly excludes `!init_spike` at line 33, and its `typecheck` script delegates to `cd docs && bun run typecheck`. CI runs three separate `bun install --frozen-lockfile` calls (root, `working-directory: docs`, `working-directory: init_spike`). There is no root `AGENTS.md`/`CLAUDE.md` — the only agent-onboarding doc in the repo is `init_spike/CLAUDE.md` as a standalone file (not a symlink).

**Complication:** The nested "spike inside a docs repo" shape made sense when init_spike was a throwaway prototype, but it has graduated: it landed PR #7 (presence & awareness UX), ships real features, and is the product surface. The name "init_spike" is now misleading, the walled-off tooling means root lint/format/husky never touches its code, three lockfiles and three `node_modules/` create dependency drift risk, adding a second code package (e.g. a shared UI library) is awkward, and the latent path assumption at `init_spike/src/server/persistence.ts:26` (`PROJECT_DIR = resolve(..., '../..')` then `.git/index-wip`) expects a `.git/` that doesn't exist at the nested location. Meanwhile `docs/` has the same nested-project pathology. Both template repos the user flagged (`~/agents`, `~/openbolts`) solve exactly this with a workspace-at-root pattern — openbolts in particular is a clean 1:1 template (same package manager, same `docs/` shape, same sibling `specs/`/`reports/`).

**Resolution:** Migrate to a traditional bun workspace at the repo root, modeled on openbolts. `init_spike/` → `packages/<name>/` (name TBD). `docs/` → `packages/docs/`. Single root `bun.lock`, single root `node_modules/`, root `turbo.json` task graph, root `tsconfig.json` base that packages extend, unified root `biome.jsonc` (drop the `!init_spike` exclusion), root `AGENTS.md` + `CLAUDE.md` symlink carrying the dev cycle. CI collapses to one install + `turbo run <task>` calls. `init_spike/CLAUDE.md` content folds into root `AGENTS.md`.

## 2) Goals

- **G1** — Unify tooling: one lockfile, one `node_modules/`, one biome, one tsconfig base, one task runner. Lint/format/husky gates cover all code in the repo, not just the root sliver.
- **G2** — Remove the "spike" framing and make the editor project look like normal production code with a normal package name.
- **G3** — Establish a shape where adding a second code package (future UI library, shared types, evaluation harness, etc.) is a low-friction move — mirror the openbolts `packages/*` convention.
- **G4** — CI becomes a single install + a turbo task graph, not three independent `working-directory` blocks.
- **G5** — Ship a root `AGENTS.md` (symlinked to `CLAUDE.md`) that documents the dev cycle for the workspace, folding in the current `init_spike/CLAUDE.md` content.
- **G6** — Preserve all existing runtime behavior: dev server, tests (unit + E2E), Hocuspocus plugin, file watcher, agent-sim CLI, playwright, git commit pipeline. No regressions.

## 3) Non-goals

- **[NEVER]** NG1: Rewriting the editor architecture, CRDT model, or observer sync. This is a layout/tooling migration, not a code change.
- **[NEVER]** NG2: Adopting pnpm or yarn. Stays on bun — both the current setup and the closest template (`~/openbolts`) use `bun@1.3.11`.
- **[NOT NOW]** NG3: Publishing any package to a registry. The workspace is private-only. Revisit if we ever want to ship a library.
- **[NOT NOW]** NG4: Creating shared internal packages (e.g. `@open-knowledge/ui`, `@open-knowledge/types`). The migration makes this *possible* but doesn't do it. Revisit when the first candidate emerges.
- **[NOT NOW]** NG5: Adding changeset/release workflow. Revisit when we have something to release.
- **[NOT UNLESS]** NG6: Touching the CRDT `persistence.ts:26` latent bug substantively. Only if the migration directly breaks it — otherwise leave as-is and file a separate task. (See Risk R3.)
- **[NOT UNLESS]** NG7: Reorganizing `specs/`, `reports/`, `evidence/`, `meta/`, `PROJECT.md`, `STORIES.md`, `ARCHITECTURE.md`, `docs/` content. These stay as root-level siblings to `packages/`. Only touch if the workspace setup forces a change.

## 4) Personas / consumers

- **P1 — Nick (primary human contributor):** Runs `bun run dev` and `bun run check` from the repo root, expects one command to cover the whole repo. Currently has to `cd init_spike` then run.
- **P2 — Claude Code (AI agent — primary workflow user):** Reads `CLAUDE.md` on session start, needs a single canonical dev-cycle doc at the repo root. Currently has to discover `init_spike/CLAUDE.md`. Runs per-package commands via turbo filters or by `cd`-ing in — the migration should make the right idiom obvious.
- **P3 — CI (GitHub Actions):** Runs three `bun install`s and two `working-directory` blocks today. After migration, runs one install + turbo task graph.
- **P4 — Future contributors:** When they land, they should see a standard monorepo shape that matches industry convention (Nx/Turbo/workspaces) rather than a one-off nested layout.

## 5) User journeys

### P1/P2 — Developer / Agent dev cycle (happy path)

Today (nested):
1. `cd open-knowledge`
2. `cd init_spike` (mandatory)
3. `bun install` (inside init_spike)
4. `bun run dev` (Vite + Hocuspocus)
5. Edit code
6. `bun run check:fast` (inside init_spike)
7. `bun run check` before declaring done
8. Docs work requires a second `cd docs && bun install` + separate commands

After migration:
1. `cd open-knowledge`
2. `bun install` (once, at root — installs everything)
3. `bun run dev` (turbo-filters to the editor package, or `bun run dev --filter=@open-knowledge/editor`)
4. Edit code anywhere in the repo
5. `bun run check:fast` (root — runs typecheck + lint + test across all packages via turbo)
6. `bun run check` before declaring done (adds build + e2e)
7. Docs work is another package, same install, same gates

### Failure / recovery

- **Install fails because of peer conflict across packages:** Root `overrides` in `package.json` pins shared deps (inherits the codemirror state/view overrides currently in `init_spike/package.json:55-58`).
- **Turbo cache corruption:** `rm -rf .turbo && bun install` or `turbo clean` restores.
- **Per-package dev server collision:** Both packages define ports (editor: 5173 via vite default; docs: 3010 via next config). Turbo runs them in parallel if `bun run dev` at root — or use `--filter` to scope.
- **init_spike's Playwright `webServer` config** currently runs `bun run dev` with cwd=init_spike. After migration, per-package cwd is `packages/editor/` — unchanged from Playwright's perspective because it still runs from the package root.

### "Aha moment"

"I only have to run install once. I can lint everything at once. I don't have to remember which directory I'm in."

### Debug experience

- Per-package logs remain isolated per package (turbo shows per-task output).
- `bun install` at root surfaces all peer/version mismatches at once instead of the current "install A, then install B, hope they don't conflict."
- First run of the unified `bun run lint` will report a backlog of biome findings across `packages/editor/` source code (currently unlinted — `biome.jsonc:33` excludes `!init_spike`). Expect a cleanup pass before the migration PR is green.

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Single root lockfile | Only `<repo>/bun.lock` exists after migration; `packages/*/bun.lock` do not | — |
| Must | Single root `node_modules/` | Only `<repo>/node_modules/` exists; `packages/*/node_modules/` do not exist after root install | Bun workspaces hoist by default |
| Must | Root `package.json` declares workspaces | `"workspaces": ["packages/*"]` present | openbolts pattern |
| Must | Root turbo task graph | `turbo.json` at root with `build`, `dev`, `typecheck`, `lint`, `test`, `test:e2e` tasks | Matches openbolts shape |
| Must | Root biome covers all packages | `!init_spike` removed from `biome.jsonc:33`; `bun run lint` at root passes on all packages/*/src | Expect cleanup pass |
| Must | Root `tsconfig.json` base | Base config exists; each package extends via `"extends": "../../tsconfig.json"` | openbolts pattern (agents doesn't do this — openbolts is cleaner) |
| Must | Package naming follows `@open-knowledge/<name>` | `docs/` → `@open-knowledge/docs` (already this name!); editor → `@open-knowledge/<decided>` | docs already has the right scoped name |
| Must | Root `AGENTS.md` exists with dev cycle docs | File present, contains the unified dev cycle section; CLAUDE.md symlinks to it | Matches agents + openbolts convention |
| Must | init_spike/CLAUDE.md content is not lost | All Architecture / Key files / Research references sections migrated to root AGENTS.md or to `packages/editor/README.md` | — |
| Must | Existing dev commands still work | `bun run dev` (from root or via turbo), `bun run check`, Playwright E2E, agent-sim CLI, git commit pipeline all functional | — |
| Must | CI passes green after migration | Single `bun install` at root; turbo tasks replace hardcoded `working-directory` blocks | `.github/workflows/ci.yml` rewrite |
| Must | `content/test-doc.md` gitignore path updated | `.gitignore:16` `init_spike/content/test-doc.md` → `packages/editor/content/test-doc.md` (or new name) | Low-risk mechanical |
| Should | Husky pre-commit/pre-push stay functional | Hooks continue to run lint-staged + format/lint at root; now cover all packages | Expect initial lint failures on first run |
| Should | Turbo caching works for CI | Turbo cache setup in CI (optional optimization; copy openbolts/agents if they have it) | — |
| Could | Root package manager version pinned | `"packageManager": "bun@1.3.11"` at root (already the per-package value) | — |

### Non-functional requirements

- **Performance:** CI install time should not regress. Expected improvement from one install instead of three. Turbo's task cache is optional but available.
- **Reliability:** Zero runtime regressions. All existing tests pass on post-migration main. E2E Playwright suite passes.
- **Security/privacy:** No new deps introduced. `overrides` for codemirror versions migrate intact.
- **Operability:** Agent sim CLI (`bun run src/server/agent-sim.ts`) must still work with correct cwd resolution.
- **Cost:** None (tooling migration).

## 7) Success metrics & instrumentation

Binary success metrics (this is a one-shot migration, not a measurable product feature):

- **M1 — CI green on post-migration main:** all existing workflow jobs pass.
- **M2 — `bun run check` at root passes:** typecheck + lint + test + build across the full workspace.
- **M3 — Playwright E2E passes:** both `sync.spec.ts` and `qa-scenarios.spec.ts` still complete successfully.
- **M4 — Root `bun install` from clean works:** no manual `cd packages/*/` install step needed.
- **M5 — One canonical `AGENTS.md` at repo root** with the dev cycle section (verifiable by file existence + symlink check).
- **M6 — No references to `init_spike/` remain in runtime code, CI, or tooling configs** (docs/specs references can stay or get updated — see D7).

## 8) Current state (how it works today)

- **Root layout** (`fa3dd17`):
  - `package.json` — minimal: husky/biome/lint-staged only, `"name": "open-knowledge"`, no `workspaces` field
  - `bun.lock` — 8495 bytes (tiny, just root tooling)
  - `biome.jsonc` — excludes `!init_spike`, `!specs`, `!reports`, `!evidence`, `!meta`, `!.claude`, `!docs/bun.lock`
  - Docs/strategy: `PROJECT.md`, `STORIES.md`, `ARCHITECTURE.md`
  - Data dirs: `specs/`, `reports/`, `evidence/`, `meta/`, `tmp/`
  - Two nested projects: `init_spike/`, `docs/`
  - Hooks: `.husky/pre-commit` runs `bun run lint-staged`; `.husky/pre-push` runs `bun run format && bun run lint`
- **init_spike/** (nested, self-contained):
  - Own `package.json` (`open-knowledge-init-spike`, private, bun 1.3.11), `bun.lock` (68137 bytes), `node_modules/`, `tsconfig.json`, `biome.jsonc`, `vite.config.ts`, `playwright.config.ts`
  - `src/`: `App.tsx`, `main.tsx`, `editor/`, `server/`, `presence/`, `components/`, `lib/`, `types/`, `v1a-roundtrip-test.ts`, `v1b-roundtrip-test.ts`, `v7-test/`
  - `tests/`: `e2e/` (Playwright), `jsx-tokenizer.test.ts`
  - `content/` (runtime fixtures), `dist/` (build output)
  - CLAUDE.md (real file, not a symlink; 7679 bytes)
  - `package.json:55-58` has `overrides` for `@codemirror/state` and `@codemirror/view`
  - Path assumptions (verified in prior /explore):
    - `src/server/persistence.ts:25` — `CONTENT_DIR = resolve(import.meta.dirname, '../../content')` → `init_spike/content`
    - `src/server/persistence.ts:26` — `PROJECT_DIR = resolve(import.meta.dirname, '../..')` → `init_spike/` (latent bug: line 51 expects `.git/index-wip` at this path; init_spike has no `.git`)
    - `src/server/hocuspocus-plugin.ts:30-32, :405` — same `../../content` resolution
    - `tests/e2e/sync.spec.ts:17`, `qa-scenarios.spec.ts:16` — `resolve(__dirname, '../../content')`
    - `src/server/persistence.test.ts:7` — `resolve(import.meta.dirname, '../../content')`
  - `CLAUDE.md:141-148` — markdown links to `../../reports/`, `../../specs/` (relative from init_spike/)
- **docs/** (nested, self-contained):
  - `package.json` — `@open-knowledge/docs` (already scoped), Next 16, React 19, fumadocs-core/mdx/ui 16.1, tailwind 4
  - Own `bun.lock`, `node_modules/`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `source.config.ts`, `postcss.config.mjs`
  - `src/`, `content/`, `_snippets/`
  - Dev port: 3010 (`next dev --port 3010`)
  - Zero imports from `init_spike/` (verified); init_spike has zero imports from `docs/` (verified)
- **CI (`.github/workflows/ci.yml`):**
  - Lines 28-29, 35-36, 39-40: three `working-directory: docs` steps (install, typecheck, build)
  - Lines 42-48: two `working-directory: init_spike` steps (install, test)
  - Lines 5-7: branch filter includes `feat/init-spike` (cosmetic; unrelated to migration)
- **Husky:**
  - `pre-commit`: `bun run lint-staged` → biome over non-excluded files → never touches init_spike
  - `pre-push`: `bun run format && bun run lint` → same walled-off story
- **Template repos (code-verified):**
  - `~/openbolts`: bun 1.3.11, `"workspaces": ["packages/*"]`, all packages in `packages/*`, root `tsconfig.json` base (packages extend), root `biome.jsonc` covers all, root `turbo.json` task graph, root `AGENTS.md` (real) + `CLAUDE.md` (symlink → AGENTS.md). Packages: `core`, `engine-runtime`, `mcp`, `docs`, `adapter-vercel-ai`. No per-package AGENTS/CLAUDE files.
  - `~/agents`: pnpm 10.10.0 + `pnpm-workspace.yaml`, top-level dirs as primary packages (`agents-api`, `agents-manage-ui`, ...) plus `packages/*` for shared libs, **no root tsconfig** (each package self-contained), root `biome.jsonc`, root `turbo.json`, root `AGENTS.md` + `CLAUDE.md` symlink. No per-package AGENTS/CLAUDE files.

### Key constraints

- Must remain on bun (per NG2 and the overall bias toward the openbolts template).
- Must not break the CRDT observer sync, Hocuspocus plugin, or agent sim CLI.
- Must preserve the `specs/`/`reports/`/`evidence/`/`meta/`/`PROJECT.md`/`STORIES.md`/`ARCHITECTURE.md` root-level sibling layout (per NG7).
- Git history should be preserved with `git mv` where possible for rename-tracking.

### Known gaps/bugs discovered during exploration

- `init_spike/src/server/persistence.ts:26` references `PROJECT_DIR/.git/index-wip` but `PROJECT_DIR` resolves to `init_spike/` which has no `.git/`. Latent bug (likely unreached or assumes user cd's to repo root). Orthogonal to migration but worth noting in the PR — see Risk R3.
- `init_spike/package.json:55-58` codemirror `overrides` are currently scoped to init_spike's lockfile. Must migrate to root `overrides` in the new workspace layout or they silently stop working.

## 9) Proposed solution (vertical slice)

### Target shape (openbolts-flavored)

```
open-knowledge/
├── package.json                ← workspace root: "workspaces": ["packages/*"]
├── bun.lock                    ← ONLY lockfile
├── node_modules/               ← ONLY node_modules (bun hoists)
├── tsconfig.json               ← base compilerOptions; packages extend
├── biome.jsonc                 ← covers all packages; !init_spike removed
├── turbo.json                  ← task graph: build, dev, typecheck, lint, test, test:e2e
├── AGENTS.md                   ← dev cycle + architecture pointers + research references
├── CLAUDE.md                   → AGENTS.md (symlink)
├── .husky/{pre-commit,pre-push}  ← unchanged commands; now cover everything
├── .github/workflows/ci.yml    ← single install + turbo run <task>
├── PROJECT.md, STORIES.md, ARCHITECTURE.md, README.md  ← unchanged location
├── specs/, reports/, evidence/, meta/, tmp/            ← unchanged location
└── packages/
    ├── editor/                 ← was init_spike/
    │   ├── package.json        ← @open-knowledge/editor (name TBD — see D1)
    │   ├── tsconfig.json       ← extends ../../tsconfig.json
    │   ├── biome.jsonc?        ← optional per-package override (probably not needed)
    │   ├── vite.config.ts
    │   ├── playwright.config.ts
    │   ├── src/                ← unchanged contents
    │   ├── tests/              ← unchanged contents
    │   ├── content/            ← unchanged contents (runtime fixtures)
    │   └── README.md           ← package-specific context
    └── docs/                   ← was docs/
        ├── package.json        ← @open-knowledge/docs (already scoped)
        ├── tsconfig.json       ← extends ../../tsconfig.json
        ├── next.config.ts, tailwind.config.ts, source.config.ts
        ├── src/, content/, _snippets/
        └── README.md
```

### Migration sequence (vertical slice)

1. **Scaffold root workspace tooling**
   - Add `"workspaces": ["packages/*"]` to root `package.json`
   - Create root `turbo.json` (copy from openbolts, adapt task names)
   - Create root `tsconfig.json` base
   - Update root `biome.jsonc` to drop `!init_spike` and add `!packages/*/dist`, `!packages/*/.next`, `!packages/*/node_modules`
2. **Move `init_spike/` → `packages/<name>/`**
   - `git mv init_spike packages/<name>`
   - Update `packages/<name>/package.json` name to `@open-knowledge/<name>`
   - Update `packages/<name>/tsconfig.json` to `extends: "../../tsconfig.json"` + trim overlapping fields
   - Keep per-package `vite.config.ts`, `playwright.config.ts` as-is
   - Delete `packages/<name>/bun.lock`
   - Delete `packages/<name>/node_modules` (hoist will recreate on root install)
   - Delete `packages/<name>/biome.jsonc` if it's now a subset of root (or keep as minimal override)
   - Delete `packages/<name>/CLAUDE.md` (content migrates to root AGENTS.md)
3. **Move `docs/` → `packages/docs/`**
   - `git mv docs packages/docs`
   - Update `packages/docs/tsconfig.json` to extend root
   - Delete `packages/docs/bun.lock`, `packages/docs/node_modules/`
4. **Merge overrides into root**
   - Move `@codemirror/state` + `@codemirror/view` overrides from the moved package's `package.json` into root `package.json` under `overrides`
5. **Write root `AGENTS.md`**
   - Dev cycle section (commands, task graph, package list)
   - Migrated content from `init_spike/CLAUDE.md`: architecture overview, key files (with new paths), research references (links rewrite from `../../reports/` to `./reports/` since root-relative)
   - Symlink `CLAUDE.md` → `AGENTS.md`
6. **Rewrite CI workflow**
   - Replace the three install steps with one root `bun install --frozen-lockfile`
   - Replace `working-directory: init_spike` + `bun run test` with `bun run test --filter=@open-knowledge/<name>` (or just `bun run test` if turbo config is set up)
   - Same for docs build
   - Remove the `feat/init-spike` branch trigger (dead branch)
7. **Update `.gitignore`**
   - `init_spike/content/test-doc.md` → `packages/<name>/content/test-doc.md`
8. **Initial lint fix pass**
   - First time root biome covers the editor source. Expect findings. Fix in the migration PR.
9. **Validate**
   - `rm -rf node_modules packages/*/node_modules && bun install`
   - `bun run check` at root — must pass
   - Playwright E2E — must pass
   - Manual smoke: `bun run dev`, open browser, verify editor loads + presence works + agent-sim writes
10. **Commit + PR**

### Alternatives considered

- **Option B — Flat hoist:** Move `init_spike/*` to repo root (src/, tests/, package.json at root; no packages/). Docs stays nested OR also moves to some other top-level. Rejected because (a) it collides with the existing root-level `docs/` without a clear place to put it; (b) the `../../`-relative paths in `persistence.ts` would resolve above the repo root and break; (c) doesn't leave room for future packages; (d) doesn't match the user's stated openbolts reference. **Foreclosed by D1 selection.**
- **Option C — Rename init_spike in place:** `git mv init_spike packages/editor` but keep root minimal, no workspace wiring. Rejected because it's the worst of both: adds path depth without any tooling benefit. **Foreclosed.**
- **Option D — pnpm instead of bun:** Matches `~/agents` exactly. Rejected by NG2 — the current codebase is on bun, openbolts also uses bun, migration cost isn't justified.
- **Option E — agents-flavored (top-level package dirs, no `packages/*`):** `editor/` and `docs/` as top-level siblings to `specs/` and `reports/`. Considered but rejected because (a) it puts package dirs next to data dirs (specs, reports) which is a category mix; (b) openbolts's `packages/*` convention is cleaner for a small-package-count repo; (c) the user asked about both references — openbolts is the closer fit.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | openbolts-flavored bun workspace at root | Cross-cutting | LOCKED (pending user confirmation of alternatives) | Semi (hard to unwind without a second migration) | Same bun version, same lockfile tool, same `docs/`-as-package precedent; ~/agents shape adds pnpm cost with no benefit | evidence/openbolts-template.md, evidence/agents-template.md | Sets package layout, lockfile strategy, tsconfig strategy |
| D2 | Move docs/ into packages/ in the same PR | Cross-cutting | LOCKED (pending user confirmation) | No | Both are nested self-contained projects with the same pathology; sweeping both is less churn than two migrations; docs already has the scoped name | evidence/current-layout.md | Scope expands beyond init_spike; expect more files to touch in the PR |
| D3 | Package name for the editor | Technical | **OPEN — see Q1** | Semi (changes are painful once code depends on the name) | Current name `open-knowledge-init-spike` is misleading; needs to match the product framing | — | Determines `@open-knowledge/<?>` and folder name under `packages/` |
| D4 | Root tsconfig.json as a shared base (openbolts pattern) | Technical | LOCKED | No | Small package count; DRY base config reduces drift between packages/editor and packages/docs | evidence/openbolts-template.md, evidence/agents-template.md | Each package gets a 5-line tsconfig that extends root |
| D5 | Root biome.jsonc covers everything (drop !init_spike) | Technical | LOCKED | No | Unifying the lint gate is a goal; can't have two biomes of truth | evidence/husky-ci-assumptions.md | Expect cleanup pass — first-time lint coverage of editor code |
| D6 | Root AGENTS.md canonical, CLAUDE.md symlink | Cross-cutting | LOCKED | No | Matches both ~/agents and ~/openbolts; no per-package AGENTS/CLAUDE in either template | evidence/agents-md-convention.md | `init_spike/CLAUDE.md` content migrates into root AGENTS.md; standalone init_spike/CLAUDE.md deleted |
| D7 | Update markdown doc links from `../../reports/` to `./reports/` in migrated CLAUDE.md content | Technical | DIRECTED | No | Root AGENTS.md is at repo root, so `./reports/` is correct | — | Mechanical find+replace during content migration |
| D8 | Leave PROJECT.md, STORIES.md, ARCHITECTURE.md, specs/, reports/, evidence/, meta/ at repo root | Cross-cutting | LOCKED | No | These are strategy/data, not code; openbolts keeps `specs/`, `reports/` at root as siblings to `packages/` | evidence/openbolts-template.md | — |
| D9 | Remove `feat/init-spike` branch filter from CI | Technical | DELEGATED | No | Cosmetic; dead branch name | evidence/husky-ci-assumptions.md | One line removed in ci.yml |
| D10 | Leave persistence.ts:26 latent bug as-is (NG6) | Technical | DIRECTED | No | Not caused by migration; avoid scope creep | — | File separate follow-up task |
| D11 | Name of the spec directory | Technical | LOCKED | No | `2026-04-08-workspace-layout` — factual, tool-neutral | — | Already created |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | What should the editor package be named? | Product | P0 | Yes (blocks D3 + folder move) | User judgment call — surfaced in §4 of presentation | Open |
| Q2 | Confirm openbolts-flavored (D1) vs agents-flavored vs flat-hoist | Cross-cutting | P0 | Yes (shape-of-everything) | Present alternatives in §4; recommendation: openbolts | Open |
| Q3 | Include docs/ in the migration PR, or separate PR? | Product | P0 | Yes (scope of PR) | Recommendation: same PR (D2); confirm | Open |
| Q4 | Should the migration PR also address the initial lint fix pass, or split? | Technical | P0 | No (can be done either way) | Recommendation: same PR, as "the cost of including `packages/editor` in root biome coverage" | Open |
| Q5 | Should a package-level README.md live in packages/editor/, or fold everything into root AGENTS.md? | Product | P0 | Yes (AGENTS.md content strategy) | Recommendation: root AGENTS.md has the dev cycle; packages/editor/README.md has architecture + key files (code-specific). Confirm. | Open |
| Q6 | Turbo cache setup in CI — in scope or defer? | Technical | P0 | No | Recommendation: defer (NOT NOW) — simpler migration, cache is optimization | Open |
| Q7 | Does root `package.json` get the `packageManager: "bun@1.3.11"` field? | Technical | P0 | No | Trivial — yes, matches openbolts. | Open (trivial) |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Bun workspaces hoist `node_modules` correctly when both packages have overlapping deps (React 19, tiptap, etc.) | HIGH | Run `bun install` at root after scaffolding; verify no ERESOLVE-class errors; verify `packages/*/node_modules/` doesn't repopulate | Before migration PR | Active |
| A2 | Turbo `dev` task can run both packages in parallel without port collision (editor 5173, docs 3010) | HIGH | Both ports are already configured; just verify `turbo run dev` starts both | Before finalization | Active |
| A3 | The codemirror `overrides` in init_spike/package.json correctly migrate to root `package.json` under `overrides` in bun | MEDIUM | Verify bun docs + test: after `bun install` at root, check lockfile resolution of `@codemirror/state` matches current | Before migration PR | Active |
| A4 | Playwright's `webServer: { command: 'bun run dev' }` still works when cwd is `packages/editor/` | HIGH | Run `bun run test:e2e` from packages/editor/ after migration; Playwright runs from cwd of its config, which stays colocated | Before finalization | Active |
| A5 | Initial lint pass over `packages/editor/` will produce findings but they'll be mechanical to fix | MEDIUM | Run `bun run lint` at root once biome covers it; count findings; categorize | Before migration PR | Active |
| A6 | Husky hooks continue to work with turbo-based scripts | HIGH | Verify `pre-push` still runs after migration | Before migration PR | Active |
| A7 | Bun 1.3.11 correctly handles `"workspaces": ["packages/*"]` (not a bun workspaces bug waiting) | HIGH | openbolts uses this exact version + shape and works today | Before migration PR | Active |

## 13) In Scope (implement now)

- **Goal:** Migrate to bun workspace root; move init_spike and docs into `packages/*`; unify tooling; update AGENTS.md/CLAUDE.md; keep runtime behavior green.
- **Non-goals:** See §3.
- **Requirements:** See §6.
- **Proposed solution:** See §9 migration sequence.
- **Owner(s)/DRI:** Nick Gomez.
- **Next actions:**
  - Resolve Q1-Q7 (below)
  - Execute §9 migration sequence
  - Run /audit + /challenger on the spec before implementation
- **Risks + mitigations:** See §14.
- **Instrumentation:** M1-M6 binary gates; nothing runtime.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| First install after merge | `rm -rf node_modules packages/*/node_modules && bun install` at root | Single node_modules + lockfile exists |
| CI cache from old setup | CI installs fresh per run; no cache to invalidate | First CI run post-merge passes |
| Contributors with stale clones | Add note to PR body; `git clean -fdx && bun install` as recovery | — |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| R1 — Bun workspace hoisting breaks a transitive dep resolution (e.g. codemirror overrides don't propagate) | Low | High (breaks editor) | A3 verification before merge; root overrides match per-package overrides | Nick |
| R2 — Initial lint pass surfaces massive backlog | Medium | Medium (delays PR merge) | Fix in same PR; if extensive, could temporarily add `packages/editor/src/**` to excludes and follow up — but prefer in-PR fix | Nick |
| R3 — persistence.ts:26 latent bug becomes active because of path change | Low | Medium | Verified: `../..` from `packages/editor/src/server/` resolves to `packages/editor/` — same invariant as before, still no `.git/` there. No net change. D10 leaves as-is. | Nick |
| R4 — Markdown doc links in migrated CLAUDE.md content are now broken | Medium | Low | D7: mechanical find+replace during migration; link check after | Nick |
| R5 — Husky hook fires first-time lint errors on files not previously covered, blocking commits | Medium | Low | Fix lint errors pre-merge; if hook fires mid-migration, can temporarily `HUSKY=0 git commit` | Nick |
| R6 — Playwright webServer path assumptions break | Low | Medium | A4 verification; playwright config uses `reuseExistingServer` + port-based check, should be resilient | Nick |
| R7 — Agent simulator CLI (`bun run src/server/agent-sim.ts`) path breaks | Low | Low | Run once post-migration; path is relative to package cwd, unchanged | Nick |
| R8 — CI workflow has branch trigger for `feat/init-spike` that interferes with new branches | Low | Low | D9 removes this filter | Nick |
| R9 — Git history for moved files becomes hard to trace | Medium | Low | Use `git mv` for all moves; `git log --follow` still works | Nick |
| R10 — `docs/` move breaks Next.js's fumadocs config path assumptions | Low | Medium | Test `bun run dev` + `bun run build` in packages/docs/ post-migration; fumadocs resolves via `source.config.ts` which is package-local | Nick |

## 15) Future Work

### Explored

- **Shared packages (`packages/ui`, `packages/types`):**
  - What we learned: The workspace layout makes this trivial to add later; init_spike/CLAUDE.md notes "Design system (copied from ~/agents)" — shared UI could live here
  - Recommended approach: Extract `src/components/ui/*` and `src/lib/utils.ts` from packages/editor into a shared package when the second consumer appears
  - Why not in scope now: No second consumer today
  - Triggers to revisit: A second code package (e.g. an admin UI, a CLI) needs the same components
- **Turbo remote cache (in CI):**
  - What we learned: Both reference repos have `turbo:setup-cache` scripts; reduces CI install/build time
  - Recommended approach: Copy openbolts's setup if/when CI starts to feel slow
  - Why not in scope now: Simpler migration without it; CI is currently fast enough
  - Triggers to revisit: CI install+build > 3min or frequent contributors

### Identified

- **Publishing strategy (changesets, semver):**
  - What we know: Both templates have changesets workflows; openbolts is private, agents publishes to npm
  - Why it matters: If any package becomes a library for external consumers
  - What investigation is needed: Which package, what stability level, what audience
- **Fix `persistence.ts:26` PROJECT_DIR latent bug:**
  - What we know: The `.git/index-wip` path is wrong at this resolution location; either unreached code or depends on cwd
  - Why it matters: Silent breakage if someone depends on it
  - What investigation is needed: Who calls this code, under what cwd, what the intended behavior is

### Noted

- **Rename the repo slug itself?** — Currently `open-knowledge/`; `open-knowledge-init-spike` naming artifact was from the project's earlier framing
- **Split the `docs/` site into user docs vs contributor docs** — orthogonal to this migration
- **Evaluate Nx vs Turbo** — openbolts and agents both use Turbo; no reason to deviate

## 16) Agent constraints

- **SCOPE:**
  - `package.json` (root)
  - `tsconfig.json` (root, new file)
  - `turbo.json` (root, new file)
  - `biome.jsonc` (root, edit)
  - `.github/workflows/ci.yml`
  - `.gitignore`
  - `.husky/pre-commit`, `.husky/pre-push` (only if hook commands change)
  - `AGENTS.md`, `CLAUDE.md` (new at root)
  - Contents of `init_spike/` → `packages/<name>/`
  - Contents of `docs/` → `packages/docs/`
- **EXCLUDE:**
  - Do not modify runtime code behavior in `src/` of either package
  - Do not touch `specs/`, `reports/`, `evidence/`, `meta/`, `PROJECT.md`, `STORIES.md`, `ARCHITECTURE.md` content
  - Do not address `persistence.ts:26` latent bug (D10)
  - Do not add new dependencies
  - Do not change tiptap, yjs, hocuspocus, codemirror, fumadocs, next versions
- **STOP_IF:**
  - Bun install fails at root after hoisting (R1)
  - Lint fix pass is larger than ~50 mechanical findings (R2) — stop and reassess scope
  - Playwright E2E fails post-migration (indicates path assumption broken)
  - Fumadocs build fails post-migration (docs path assumption)
- **ASK_FIRST:**
  - Before renaming the editor package (Q1 answer required)
  - Before removing init_spike/CLAUDE.md without confirming content fully migrated to root AGENTS.md
  - Before changing any `overrides` semantics
  - Before introducing a per-package `biome.jsonc` override
