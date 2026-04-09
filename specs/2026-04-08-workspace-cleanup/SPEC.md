# Workspace cleanup — align architecture with template precedent

**Status:** Approved — ready for implementation
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-08
**Baseline commit:** 278832b (origin/main — spec verified against this commit; drift check: clean — only `.gitignore` gained `.claude/worktrees/` line between earlier `1ec2e23` and current, unrelated to spec scope)
**Links:**
- Merged migration: PR #10 (`spec: CLI packaging as @inkeep/open-knowledge`, merge commit 8971f7c)
- Prior paused spec: `specs/2026-04-08-workspace-layout/` (PAUSED — pre-merge speculation)
- Evidence: `./evidence/`
- Audit: `./meta/audit-findings.md` (8 findings, 2 HIGH)
- Challenge: `./meta/design-challenge.md` (9 findings, 3 HIGH)

---

## 1) Problem statement

**Situation:** PR #10 merged a 4-package bun workspace migration (`packages/{core,server,cli,app}` + `docs/` at root, `"workspaces": ["packages/*", "docs"]`). The restructure landed cleanly. But because this is a green-field project, "cleanly landed" is the floor, not the ceiling — the shipped state diverges from both template repos (`~/openbolts` and `~/agents`) in ways that are evidence-backed architectural errors, not stylistic preferences. Eight gaps, all verified against live template repos and post-merge codebase state:

1. **No root `AGENTS.md` + `CLAUDE.md` symlink.** `CLAUDE.md` is a standalone real file; no `AGENTS.md`. Both templates use `AGENTS.md` real + `CLAUDE.md → AGENTS.md` symlink at root, no per-package files.
2. **No root `turbo.json`.** No task runner, no cross-package orchestration, no dependency graph. Both templates have one.
3. **Root `typecheck` script is `cd docs && bun run typecheck`.** Only covers `docs/`; the 4 code packages are invisible to `bun run check` at root — silent false-green gate.
4. **`.github/workflows/ci.yml` has 7 `working-directory` blocks** (5 per-package typecheck + 2 per-package build) instead of a single gate command. `~/openbolts/ci.yml` is 2 effective lines (`bun install` + `bun run check`). Still has dead `feat/init-spike` branch triggers at lines 5 and 7.
5. **Codemirror `overrides` live in `packages/app/package.json:62-65` — bun silently ignores child-workspace overrides** (confirmed: [bun docs](https://bun.sh/docs/install/overrides), [npm/cli#4517](https://github.com/npm/cli/issues/4517)). The override is dead config. Today it's inert but harmless: canonical lockfile resolution (`grep -E '^\s+"@codemirror/state":\s*\['`) shows exactly one resolved version (`@codemirror/state@6.6.0`), and `@codemirror/view@6.41.0` is also single — bun's solver reconciled all 7 distinct `@codemirror/view` range declarations across transitive deps into one version. Moving the override to root is correct location hygiene + latent-defect prevention (if a future dep adds a codemirror range that forces duplicate resolution, a working root-level override catches it).
6. **Dead config:** `biome.jsonc:38` `!init_spike`; `.gitignore` lines 8-9 and 24 `init_spike/**`; `.github/workflows/ci.yml` `feat/init-spike` branch triggers. `init_spike/` directory no longer exists.
7. **Duplicated `tsconfig.json` files:** `packages/core/tsconfig.json` and `packages/server/tsconfig.json` are byte-for-byte identical in compilerOptions. The "drift trigger" we would use to justify a shared base has already fired — in the opposite direction (convergence via copy-paste). Openbolts's shared `tsconfig.json` base is the direct precedent.
8. **`.gitignore` missing `.turbo/`.** Both templates ignore `.turbo/`. Once we add turbo, every contributor running `bun run check` will see untracked `.turbo/` directories.

**Complication:** Gap 3 makes `bun run check` a false-green gate for code packages — any TypeScript error in core/server/cli/app silently passes the pre-commit and local dev gate (CI currently catches them via bypass steps that we're also removing). Gap 5's dead override is inert *today* but represents a trip hazard: any future dep change that actually needs the override won't get it. Gap 8 ships broken immediately — first `bun run check` post-merge produces untracked `.turbo/` noise in every developer's `git status`. The remaining gaps are architectural drift that will compound as more packages, scripts, and CI steps are added.

**Resolution:** A single atomic cleanup PR that architecturally aligns open-knowledge with its closest template (`~/openbolts`): root `turbo.json` + shared `tsconfig.json` base (packages extend) + root `AGENTS.md`/`CLAUDE.md` symlink + root `package.json` scripts delegated through turbo (matching openbolts `check` verbatim: `typecheck && lint && test && test:integration`-shaped, no `build` in the gate) + CI collapsed to `bun install && bun run check` + codemirror overrides at root (using hoist anchors to make the `$` deferral syntax work) + dead config scrubbed from `biome.jsonc`, `.gitignore`, `ci.yml`, and `packages/app/package.json` phantom Playwright scripts. Zero runtime code changes. Zero changes to PR #10's package boundaries or naming.

## 2) Goals

- **G1** — Root `bun run check` is a real gate: typechecks all 5 packages (core, server, cli, app, docs), lints everything, runs tests. No false greens.
- **G2** — Dependency overrides live at the workspace root per bun/npm convention. Codemirror packages hoisted cleanly.
- **G3** — Root-canonical `AGENTS.md` + `CLAUDE.md` symlink matching both template repos; content migrated from current `CLAUDE.md` with dev cycle section updated to reference new root scripts.
- **G4** — Root `turbo.json` as the cross-package task runner with a minimal openbolts-shaped task graph.
- **G5** — Shared root `tsconfig.json` base; packages extend via `"extends": "../../tsconfig.json"`. Eliminates duplicated compilerOptions between core and server.
- **G6** — CI collapsed to `bun install && bun run check` — matches `~/openbolts/.github/workflows/ci.yml` shape.
- **G7** — All dead `init_spike` config scrubbed (biome, .gitignore, ci.yml). `.gitignore` adds `.turbo/`.
- **G8** — Phantom Playwright scripts in `packages/app/package.json` (`test:e2e`, `test`'s `--path-ignore-patterns 'tests/e2e'`) removed — the referenced directory doesn't exist.
- **G9** — Zero runtime behavior changes. Zero restructuring of PR #10's decisions. Only new dep is `turbo` itself.

## 3) Non-goals

- **[NEVER]** NG1: Changing package boundaries, naming, or the `packages/{core,server,cli,app}` + `docs/` layout established by PR #10.
- **[NEVER]** NG2: Touching any runtime code in `packages/*/src/` or `docs/src/`.
- **[NEVER]** NG3: Changing CLI behavior, MCP tool surface, config schema, or any customer-facing API.
- **[NOT NOW]** NG4: Turbo remote cache setup in CI. Optimization; copy from openbolts/agents if CI time crosses ~3 minutes. Revisit when that happens.
- **[NOT NOW]** NG5: Changesets release automation. `.changeset/` config exists but no release GitHub Action. When the CLI is ready to publish, add a release workflow as its own scope.
- **[NOT NOW]** NG6: Husky hook changes. Pre-commit (`bun run lint-staged`) and pre-push (`bun run format && bun run lint`) work fine with the root biome. After this PR lands, they get broader coverage for free because the `!init_spike` exclusion is gone.
- **[NOT NOW]** NG7: Reconcile `packages/app`'s standalone `check` script with the new root `check`. They'll diverge in what they verify after this PR. Not blocking; add to Future Work. Revisit when a contributor trips on the divergence.
- **[NOT UNLESS]** NG8: Adding ESLint, changing Biome rules, or any lint rule changes. Only if turbo adoption surfaces actual lint drift between packages.
- **[NOT UNLESS]** NG9: Restoring Playwright E2E infrastructure to `packages/app`. The scripts and the directory are both gone; restoring them is a feature, not a cleanup.

## 4) Personas / consumers

- **P1 — Nick (primary):** Runs `bun run check` at root and expects it to actually gate the whole repo. Today it's a no-op for code packages.
- **P2 — Claude Code (AI agent):** Reads `CLAUDE.md` on session start. After cleanup, `CLAUDE.md` is a symlink to `AGENTS.md` and contains the updated dev cycle section with root scripts. Agents following the `AGENTS.md` convention (not just Claude Code) gain a canonical root doc.
- **P3 — CI (GitHub Actions):** Today runs 7+ `working-directory` steps. After: 2-step workflow (install + check). Same coverage, fewer lines, matches openbolts template exactly.
- **P4 — Future contributor:** Clones the repo, runs `bun install && bun run check`, and everything works without any `cd package && ...` incantations.

## 5) User journeys

### P1/P4 — Local dev gate

**Today:**
```bash
bun run check
# → bun run typecheck → cd docs && bun run typecheck  (ONLY docs)
# → bun run lint → biome check .  (covers all packages, good)
# ↑ code packages (core, server, cli, app) are NEVER typechecked by this command
```

A developer or agent running `bun run check` locally gets a **false green**: TypeScript errors in any of the 4 code packages slip through.

**After:**
```bash
bun run check
# → turbo run typecheck  (all 5 packages in parallel, dependency-ordered)
# → bun run lint → biome check .  (all packages, unchanged)
# → turbo run test  (all 5 packages)
```

Note: `build` is intentionally NOT in the root `check` script — openbolts keeps builds out of the hot gate to preserve fast-feedback semantics. Invoke `bun run build` explicitly when needed.

### P3 — CI workflow

**Today (`.github/workflows/ci.yml`, 59 lines):** 7 `working-directory` blocks, 3+ install steps equivalent.

**After (~20 lines):**
```yaml
- run: bun install --frozen-lockfile
- run: bun run check
```

Matches `~/openbolts/.github/workflows/ci.yml` exactly. Zero `working-directory` blocks.

### Failure / recovery

- **Codemirror hoist anchors fail to take effect:** Verify root `package.json` has the codemirror packages in `devDependencies` (so the `$` deferral syntax has something to defer to). If still failing, replace with concrete version pins: `"@codemirror/state": "^6.6.0"`, `"@codemirror/view": "^6.41.0"` (values from `packages/app/package.json`). Document staleness: re-check when codemirror is bumped.
- **`turbo run typecheck` fails in a package:** Check that the package has a `typecheck` script. Under D13, core and server get `"typecheck": "tsc --noEmit"` added. If a new package lacks the script, turbo silently skips — add the script and re-run.
- **Husky hook blocks commit because root biome now covers new files:** Expected if `!init_spike` was masking anything real — verify the mask was dead (directory gone) before removing. `init_spike/` is already deleted, so this should not fire.
- **`bun run build` in CI fails because `packages/core` or `packages/server` has no build script:** Expected — core and server export source (`./src/index.ts`), not artifacts. Turbo skips packages without a `build` script.

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Root `package.json` has `overrides.@codemirror/state` and `overrides.@codemirror/view` | `grep -A2 '"overrides"' package.json` shows both keys | Dead-config consolidation |
| Must | Root `package.json` has `@codemirror/state` and `@codemirror/view` in `devDependencies` | Hoist anchors make `$` deferral syntax resolve | Evidence-based: bun docs don't explicitly document `$pkg` at root without direct dep; hoist anchors remove the uncertainty |
| Must | `packages/app/package.json` has no `overrides` block | Block removed entirely | — |
| Must | Canonical lockfile resolution shows single versions | `grep -E '^\s+"@codemirror/state":\s*\[' bun.lock` returns one line; same for view | Already true today; this requirement is a post-change verification gate |
| Must | Root `turbo.json` exists with minimal task graph | File present, defines `build`, `typecheck`, `lint`, `test` with `dependsOn: ["^build"]` on typecheck/test, `outputs: ["dist/**", ".next/**"]` on build | Matches `~/openbolts/turbo.json` shape |
| Must | Root `tsconfig.json` base exists | File present with compilerOptions only (no `include`), matches openbolts base shape | Openbolts precedent |
| Must | `packages/core/tsconfig.json` extends root | `"extends": "../../tsconfig.json"` present, local `compilerOptions` trimmed to package-specific fields | — |
| Must | `packages/server/tsconfig.json` extends root | Same | — |
| Must | `packages/cli/tsconfig.json` extends root | Same | — |
| Must | `packages/app/tsconfig.json` extends root | Same (preserve Vite-specific fields like `jsx`) | — |
| Must | `docs/tsconfig.json` extends root | Same (preserve Next.js-specific fields) | — |
| Must | `packages/core/package.json` gains `typecheck` and `test` scripts | `"typecheck": "tsc --noEmit"` and `"test": "bun test"` | Core has 4 test files (`src/extensions/*.test.ts`, `src/utils/identity.test.ts`) — adding script activates them under turbo |
| Must | `packages/server/package.json` gains `typecheck` and `test` scripts | Same | Server has 2 test files (`src/file-watcher.test.ts`, `src/persistence.test.ts`) |
| Must | `packages/app/package.json` stale Playwright references removed | `test` script loses `--path-ignore-patterns 'tests/e2e'` (refers to non-existent dir); `test:e2e` script removed | Phantom scripts that reference missing infrastructure — dead config |
| Must | Root `package.json` scripts delegate via turbo | `build: turbo run build`, `typecheck: turbo run typecheck`, `test: turbo run test`. No `dev` script at root (neither template has it naked — openbolts lacks it, agents filters it). | — |
| Must | Root `check` script matches openbolts verbatim | `"check": "bun run typecheck && bun run lint && bun run test"`. **No `build` in check.** Same shape as openbolts `typecheck && lint && test && test:integration` minus the non-applicable `test:integration`. | Corrected from earlier draft: openbolts does NOT include `build` |
| Must | Root `check:fast` = `check` minus any long-running | `"check:fast": "bun run typecheck && bun run lint && bun run test"`. For this project, `check:fast` and `check` are currently the same (no integration tests) | Openbolts convention |
| Must | Root `AGENTS.md` is a real file | `test -f AGENTS.md && test ! -L AGENTS.md` | Canonical content |
| Must | Root `CLAUDE.md` is a symlink → `AGENTS.md` | `readlink CLAUDE.md == AGENTS.md` (9-byte symlink, matches both template repos) | — |
| Must | `AGENTS.md` content migrates + updates dev cycle section | Sections preserved: monorepo structure, per-package (core/server/cli/app), research references, changesets. Dev cycle section rewritten to reference new root scripts (`bun run check` at root, not `cd packages/<pkg> && bunx tsc --noEmit`). | Not "zero content loss" — an explicit content update as part of the cleanup |
| Must | Root `biome.jsonc:38` no longer has `!init_spike` | `grep -c init_spike biome.jsonc` returns 0 | Dead config |
| Must | Root `.gitignore` no longer has any `init_spike` entries | `grep -c init_spike .gitignore` returns 0 | Lines 8-9 and 24 removed |
| Must | Root `.gitignore` has `.turbo/` entry | `grep -c '\.turbo' .gitignore` returns ≥1 | Required because turbo is new; matches openbolts/agents |
| Must | `.github/workflows/ci.yml` branch triggers are `[main]` only | No `feat/init-spike` on any line | Dead branch name |
| Must | CI workflow is ≤ 25 lines with zero `working-directory` blocks | `wc -l ci.yml` ≤ 25 AND `grep -c working-directory ci.yml` == 0 | Openbolts shape |
| Must | `bun install` at root produces clean state | From clean clone: `bun install --frozen-lockfile` exits 0 | — |
| Must | `bun run check` passes at root | Zero failures across all 5 packages | True gate |
| Must | Single atomic commit/PR | All changes ship together; D10 LOCKED | Ordering hazard avoidance |
| Should | CI run time ≤ current CI run time | Turbo parallelizes typecheck/test; should match or improve | Easy to verify post-merge |

### Non-functional requirements

- **Performance:** CI time should not regress. Turbo parallelizes; one `bun install` replaces three; net should be ≤ current.
- **Reliability:** Zero runtime regressions. Browser editor, CRDT sync, presence, agent-sim CLI, Hocuspocus server all unchanged (verified by not touching any `src/` or runtime config).
- **Security/privacy:** No dep additions except `turbo` itself (pinned version; both templates use it).
- **Operability:** Husky hooks unchanged. Changesets unchanged.
- **Cost:** None.

## 7) Success metrics & instrumentation

Binary gates (cleanup PR, not a product):

- **M1 — `bun run check` passes at root** and actually covers all 5 packages. Verifiable by introducing a deliberate `any` or type error in each package and confirming the root gate catches it.
- **M2 — Canonical lockfile resolution shows single versions** for `@codemirror/state` and `@codemirror/view` after clean install. (Idempotent verification; already true.)
- **M3 — CI workflow file is ≤ 25 lines** (down from 59), zero `working-directory` blocks.
- **M4 — `AGENTS.md` real file + `CLAUDE.md → AGENTS.md` symlink** at root (matches `~/agents`, `~/openbolts` exactly).
- **M5 — Zero `init_spike` references** in `.github/workflows/ci.yml`, `biome.jsonc`, or `.gitignore` (`grep -rc init_spike biome.jsonc .gitignore .github/workflows/ci.yml` returns 0s).
- **M6 — Root `tsconfig.json` exists** and all 5 packages extend it (`grep -l '"extends": "../../tsconfig.json"' packages/*/tsconfig.json` returns all 4; `grep -l '"extends": "./tsconfig.json"' docs/tsconfig.json` matches).
- **M7 — `.gitignore` ignores `.turbo/`** and running `bun run check` leaves `git status` clean of untracked `.turbo/` directories.
- **M8 — `packages/app/package.json` has no `test:e2e` script and no `--path-ignore-patterns` referencing non-existent `tests/e2e`.**

## 8) Current state (how it works today)

Post-audit baseline: commit `1ec2e23`. Drift check vs. spec-analyzed files: none.

### Root `package.json` (scripts block)

```json
"scripts": {
  "lint": "biome check .",
  "format": "biome check --write .",
  "typecheck": "cd docs && bun run typecheck",
  "check": "bun run typecheck && bun run lint",
  "prepare": "husky && chmod +x .husky/pre-commit .husky/pre-push 2>/dev/null || true",
  "changeset": "changeset",
  "version": "changeset version",
  "release": "changeset publish"
}
```

- No `build`, `test`, `dev` at root
- `typecheck` and `check` only cover `docs/` — false green for the 4 code packages
- `workspaces: ["packages/*", "docs"]` (docs is a top-level workspace member, not under `packages/`)

### Root `biome.jsonc` — line 38 still has `!init_spike`

Other excludes: `!**/node_modules`, `!**/dist`, `!**/.next`, `!**/.source`, `!**/.turbo`, `!**/tmp`, `!**/next-env.d.ts`, `!.claude`, `!specs`, `!reports`, `!evidence`, `!meta`, `!docs/bun.lock`. All valid.

### Root `.gitignore` (25 lines)

Dead init_spike entries (3):
- Line 8: `init_spike/src/**/*.js`
- Line 9: `init_spike/src/**/*.js.map`
- Line 24: `init_spike/content/test-doc.md`

**Missing:** `.turbo/` — required once turbo is added. Both templates have it.

### Root `CLAUDE.md` (6471 bytes, real file)

- Not a symlink (verified)
- No `AGENTS.md` sibling (verified)
- Content: monorepo structure, per-package sections (core/server/cli/app), dev cycle with per-package `cd` commands (e.g., `cd packages/<pkg> && bunx tsc --noEmit` at lines 29-30), conventions, research refs
- Dev cycle section will be rewritten during migration to reflect new root scripts

### `.github/workflows/ci.yml` (59 lines)

```yaml
on:
  push:
    branches: [main, feat/init-spike]   # line 5 — dead branch trigger
  pull_request:
    branches: [main, feat/init-spike]   # line 7 — dead branch trigger
jobs:
  check:
    steps:
      - checkout
      - setup-bun 1.3.11
      - bun install --frozen-lockfile
      - bun run lint
      - working-directory: packages/core → bunx tsc --noEmit
      - working-directory: packages/server → bunx tsc --noEmit
      - working-directory: packages/cli → bunx tsc --noEmit
      - working-directory: packages/app → bunx tsc --noEmit
      - working-directory: docs → bun run typecheck
      - bun test
      - working-directory: docs → bun run build
      - working-directory: packages/cli → bun run build
```

7 `working-directory` blocks total (5 typecheck + 2 build). Single install (good), but the per-package verbosity is what openbolts eliminates via turbo.

### `packages/app/package.json` — three dead-config issues

1. Lines 62-65: `overrides` block (inert — bun ignores child-level overrides)
   ```json
   "overrides": {
     "@codemirror/state": "$@codemirror/state",
     "@codemirror/view": "$@codemirror/view"
   }
   ```
2. Line 12: `"test": "bun test --path-ignore-patterns 'tests/e2e'"` — `tests/e2e` directory doesn't exist
3. Line 15: `"test:e2e": "npx playwright test"` — no `playwright.config.ts` in the package, no `tests/e2e/` directory

### `packages/core/tsconfig.json` ≡ `packages/server/tsconfig.json`

Byte-for-byte identical in compilerOptions. Confirmed via diff.

### `packages/core/package.json` and `packages/server/package.json` — zero scripts block

Both files have no `scripts` field at all. Core has 4 test files in `src/extensions/*.test.ts` + `src/utils/identity.test.ts`. Server has 2 test files in `src/file-watcher.test.ts` + `src/persistence.test.ts`. These tests currently run via CI's root `bun test` step (bun's recursive test runner finds them), but under turbo-based per-package invocation they need explicit `test` scripts.

### Root `bun.lock` — codemirror resolution (verified)

Canonical lockfile resolution via `grep -E '^\s+"@codemirror/state":\s*\['`:
```
"@codemirror/state": ["@codemirror/state@6.6.0", ...]
```
Exactly one resolved version.

Canonical resolution for `@codemirror/view`:
```
"@codemirror/view": ["@codemirror/view@6.41.0", ...]
```
Exactly one, despite 7 distinct range declarations in transitive dep metadata (`^6.0.0`, `^6.17.0`, `^6.23.0`, `^6.27.0`, `^6.35.0`, `^6.37.0`, `^6.41.0`). Bun's solver reconciled all 7 ranges to `6.41.0`. The child-level override in `packages/app` had no effect — the solver didn't need it.

### Template repos (re-verified this session)

| Pattern | `~/agents` | `~/openbolts` |
|---|---|---|
| Root `AGENTS.md` real + `CLAUDE.md` symlink | ✅ 32674 B + symlink | ✅ 65893 B + symlink |
| Root `turbo.json` | ✅ 181 lines | ✅ 24 lines |
| Root `typecheck` via turbo | ✅ `turbo typecheck --filter=...` | ✅ `turbo run typecheck` |
| Root `check` composition | `turbo check --filter=... && format:check && ...` | `typecheck && lint && test && test:integration` (no `build`) |
| CI shape | Complex ubuntu-32gb multi-stage with TURBO_TOKEN, merge-queue handling | 2-line core: `bun install` + `bun run check` |
| Root `tsconfig.json` base | ❌ No root tsconfig | ✅ Base, packages extend |
| Root overrides | ✅ `pnpm.overrides` at root (security + version pins) | ❌ No overrides |

**Framing correction (from audit):** The "both templates use X" framing from the earlier draft was wrong for CI shape and for root `check` composition. `~/openbolts` is the single template precedent for the 2-line CI + `typecheck && lint && test` check; `~/agents`'s CI is a fundamentally different beast due to scale. `~/openbolts` is the right template to follow.

### Bun override semantics (verified)

- Bun docs ([bun.sh/docs/install/overrides](https://bun.sh/docs/install/overrides)): "Bun currently only supports top-level `overrides`"
- npm convention (bun aims for compat): [npm/cli#4517](https://github.com/npm/cli/issues/4517) documents root-only behavior
- Child-level overrides in workspace packages are silently ignored
- The `$pkg-name` deferral syntax ("use the top-level dep's declared range") is documented at bun child level but not explicitly documented for root when root has no direct dep — hence the hoist-anchor approach below

## 9) Proposed solution (single atomic PR)

D10 is LOCKED to a single atomic PR. The ordering below is "diff assembly order" for the implementer's convenience, not a commit sequence.

### Step 1 — Move codemirror overrides to root + add hoist anchors

**Root `package.json`:**
```diff
  "devDependencies": {
    "@biomejs/biome": "^2.4.10",
+   "@codemirror/state": "^6.6.0",
+   "@codemirror/view": "^6.41.0",
    "@changesets/cli": "^2.29.7",
    "husky": "^9.1.7",
    "lint-staged": "^16.4.0",
+   "turbo": "^2.7.0"
+ },
+ "overrides": {
+   "@codemirror/state": "$@codemirror/state",
+   "@codemirror/view": "$@codemirror/view"
  }
```

**`packages/app/package.json`:**
```diff
- "overrides": {
-   "@codemirror/state": "$@codemirror/state",
-   "@codemirror/view": "$@codemirror/view"
- }
```

**Hoist anchor rationale:** The `$@codemirror/state` deferral syntax means "use the version resolved by the top-level direct dependency." Bun docs don't explicitly confirm this works when the workspace root has no direct codemirror dep. Adding `@codemirror/state` and `@codemirror/view` to root `devDependencies` guarantees the deferral has something to defer to, making the syntax definitionally work. Version ranges match `packages/app/package.json:19-20`. Minimal root devDep pollution; better than stale concrete pins.

**Verify post-install:**
```bash
rm -rf node_modules bun.lock
bun install
grep -E '^\s+"@codemirror/state":\s*\[' bun.lock   # → 1 line
grep -E '^\s+"@codemirror/view":\s*\[' bun.lock    # → 1 line
```

### Step 2 — Add root `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

Note: no `dev` task. Neither openbolts nor agents has a naked root `dev` script; both rely on per-package `cd packages/<x> && bun run dev` or agents' filtered variant. For a 2-package-with-dev-server repo (app + docs), explicit cd is clearer.

`turbo ^2.7.0` added to root `devDependencies` (see Step 1).

### Step 3 — Add root `tsconfig.json` base (evidence-backed, not deferred)

Evidence: `packages/core/tsconfig.json` and `packages/server/tsconfig.json` are byte-for-byte identical today. Duplication exists. The "drift trigger" has already fired — convergence via copy-paste. Openbolts is our closest template and uses a shared base. Greenfield project, so this is the architecturally correct default.

**New file: `tsconfig.json` (root):**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "exclude": ["node_modules", "dist"]
}
```

Shape matches `~/openbolts/tsconfig.json` verbatim.

**Update `packages/core/tsconfig.json`:**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Update `packages/server/tsconfig.json`:** Same shape.

**Update `packages/cli/tsconfig.json`:** Extends root, preserves `outDir` and any cli-specific fields.

**Update `packages/app/tsconfig.json`:** Extends root, preserves `jsx: "react-jsx"` and any vite-specific fields.

**Update `docs/tsconfig.json`:** Extends root (relative path: `"../tsconfig.json"`, not `"../../tsconfig.json"`, because docs is at repo root not under `packages/`), preserves Next.js-specific fields (`types: ["next"]`, `paths` for imports, etc.).

### Step 4 — Add scripts to `packages/core` and `packages/server`

Both currently have no `scripts` block. Add:
```json
"scripts": {
  "typecheck": "tsc --noEmit",
  "test": "bun test"
}
```

**Evidence for `test` safety:** Core has 4 test files; server has 2. Running `bun test` from their cwd finds and runs them. Current CI bypasses package scripts by running `bun test` at root (bun's recursive test runner), which finds the same files. Under turbo, per-package `test: bun test` invokes bun test with cwd = package root — finds the same tests via a different path. Net coverage unchanged.

**Note:** If a future package has no tests, the correct flag is `bun test --pass-with-no-tests` (verified: `bun@1.3.11` without it exits 1 on empty). For core and server, no flag needed — tests exist.

### Step 5 — Rewrite root `package.json` scripts

**Remove:**
```json
"typecheck": "cd docs && bun run typecheck",
"check": "bun run typecheck && bun run lint",
```

**Add:**
```json
"build": "turbo run build",
"typecheck": "turbo run typecheck",
"test": "turbo run test",
"lint": "biome check .",
"format": "biome check --write .",
"check:fast": "bun run typecheck && bun run lint && bun run test",
"check": "bun run typecheck && bun run lint && bun run test"
```

Key points:
- **No `build` in `check`.** Matches openbolts exactly. Corrected from the earlier draft that claimed "openbolts verbatim" while adding `build`.
- **No root `dev` script.** Neither template has a naked `turbo run dev`. Contributors run `cd packages/app && bun run dev` for the editor or `cd docs && bun run dev` for docs.
- `lint` and `format` stay as root biome calls (not through turbo) — both templates do this too. Biome is a single-pass root tool; turbo is for per-package tasks.
- `check:fast` and `check` are currently identical (no `test:integration`); separation kept for openbolts parity and future use.

### Step 6 — Create root `AGENTS.md` + `CLAUDE.md` symlink

```bash
git mv CLAUDE.md AGENTS.md
ln -s AGENTS.md CLAUDE.md
```

Then edit `AGENTS.md` to update the dev cycle section. Rewrite commands from per-package `cd` form:
```
cd packages/<pkg> && bunx tsc --noEmit  # OLD
cd packages/<pkg> && bun test           # OLD
```
to root form:
```
bun run check       # NEW — typechecks + lints + tests all 5 packages via turbo
bun run check:fast  # NEW — same as check for now (no integration tests)
bun run build       # NEW — builds packages with build scripts (cli, app, docs)
```

Preserve all other sections verbatim: monorepo structure, per-package sections (core/server/cli/app), conventions, research references, changesets.

**Verify:**
```bash
ls -la AGENTS.md CLAUDE.md
# AGENTS.md → -rw-r--r-- real file
# CLAUDE.md → lrwxr-xr-x CLAUDE.md -> AGENTS.md (9 bytes)
```

### Step 7 — Rewrite `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5 # v2.0.1
        with:
          bun-version: "1.3.11"
          cache: true
      - run: bun install --frozen-lockfile
      - run: bun run check
```

Zero `working-directory` blocks. Matches `~/openbolts/.github/workflows/ci.yml` exactly.

### Step 8 — Clean up dead config

**`biome.jsonc` line 38:**
```diff
-     "!init_spike",
```

**`.gitignore`:**
```diff
-
- # init_spike: accidental tsc JS emit beside src/ (sources are .ts/.tsx; .d.ts may live under src/types/)
- init_spike/src/**/*.js
- init_spike/src/**/*.js.map
+
+ # Turbo cache
+ .turbo/
  tmp/
  .DS_Store
  ...
- # Runtime content file — accumulates test artifacts from dev/agent-sim runs
- init_spike/content/test-doc.md
```

### Step 9 — Clean up `packages/app/package.json` phantom Playwright scripts

```diff
-   "test": "bun test --path-ignore-patterns 'tests/e2e'",
+   "test": "bun test",
    "check:fast": "tsc --noEmit && biome check .",
    "check": "tsc --noEmit && biome check . && bun test && vite build",
-   "test:e2e": "npx playwright test"
```

The `--path-ignore-patterns 'tests/e2e'` refers to a directory that doesn't exist in `packages/app`. The `test:e2e` script references `npx playwright test` but there's no `playwright.config.ts` — it's a phantom script.

### Step 10 — Validate end-to-end

```bash
rm -rf node_modules bun.lock packages/*/node_modules
bun install

# Canonical lockfile resolution
grep -E '^\s+"@codemirror/state":\s*\[' bun.lock   # → 1 line
grep -E '^\s+"@codemirror/view":\s*\[' bun.lock    # → 1 line

# Root gate covers all 5 packages
bun run check

# Introduce deliberate type errors in each package to verify gate catches them (smoke test)
# (revert after verification)

# Dev servers still start
cd packages/app && bun run dev  # manual: browser loads, CRDT sync works
cd docs && bun run dev           # manual: docs site loads

# Git status clean after bun run check
git status  # should not show .turbo/
```

### Step 11 — Single atomic commit + PR

All changes ship together (D10 LOCKED). Commit message template:
```
chore: align workspace with openbolts template precedent

- Consolidate codemirror overrides at workspace root (hoist anchors)
- Add root turbo.json (minimal openbolts-shaped task graph)
- Add root tsconfig.json base; packages extend it (core/server/cli/app/docs)
- Add typecheck/test scripts to packages/core and packages/server
- Rewrite root scripts to delegate via turbo; drop cd-based typecheck
- Adopt AGENTS.md canonical + CLAUDE.md symlink convention
- Update AGENTS.md dev cycle to reference new root scripts
- Collapse CI to bun install + bun run check
- Remove dead init_spike config (biome, .gitignore, ci.yml)
- Add .turbo/ to .gitignore
- Remove phantom Playwright scripts from packages/app/package.json
```

### Alternatives considered

- **Stale concrete version pins instead of hoist anchors for codemirror:** Fragile — requires manual update every time `packages/app` bumps codemirror. Hoist anchors keep version tracking automatic.
- **Drop the codemirror override entirely:** Valid today (bun's solver already reconciles), but loses latent-defect prevention. Any future dep that introduces a codemirror range conflict would need the fix again. Moving to root is cheaper than re-debugging later.
- **Keep `build` in root `check`:** Rejected — openbolts doesn't do this and it slows the hot gate. Separate `bun run build` is invokable explicitly.
- **5-commit bisect-friendly sequence:** Rejected (D10) — bisect value across tooling churn is low; atomicity prevents intermediate-broken-state bugs (core/server lacking turbo-visible `typecheck` scripts during intermediate commits).
- **Defer root `tsconfig.json` base:** Rejected (D8 flipped) — core/server tsconfigs are byte-identical today. "Revisit when drift happens" already fired as "convergence via copy-paste." Openbolts precedent is direct. Greenfield project → set the right architecture now.
- **Leave phantom Playwright scripts in place:** Rejected — consistent with "remove dead `init_spike` echoes" hygiene principle. Both are symbolic links to non-existent infrastructure.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way? | Rationale | Evidence |
|---|---|---|---|---|---|---|
| D1 | Move codemirror overrides to workspace root (dead-config cleanup, not bug fix) | Technical | LOCKED | No | Bun ignores child-level overrides (bun docs + npm/cli#4517). Current overrides are inert; lockfile shows bun's solver already reconciles to single versions. Moving is correct location + latent-defect prevention for future dep changes that would actually need the override. | `evidence/bun-overrides-root-only.md`, canonical lockfile resolution verified this session |
| D2 | Add root `turbo.json` | Technical | LOCKED | No | Both templates use turbo; openbolts's 24-line shape transfers directly; `dependsOn: ^build` semantics require a runner | `~/openbolts/turbo.json`, `~/agents/turbo.json` |
| D3 | Root `check` script = `typecheck && lint && test` (openbolts verbatim, no `build`) | Technical | LOCKED | No | Openbolts is `typecheck && lint && test && test:integration`. We don't have integration tests. Dropping `build` keeps `check` as fast feedback gate. Corrected from earlier "verbatim" claim that incorrectly added `build`. | `~/openbolts/package.json:13-24` verified this session |
| D4 | CI = `bun install` + `bun run check` (openbolts shape) | Technical | LOCKED | No | Openbolts CI is 2 lines core; agents is complex multi-stage due to scale. Openbolts is our closer template. | `~/openbolts/.github/workflows/ci.yml` verified this session |
| D5 | Root `AGENTS.md` real + `CLAUDE.md` symlink | Cross-cutting | LOCKED | No | Both templates use this convention; neither has per-package `AGENTS.md`/`CLAUDE.md` files. | `~/agents/CLAUDE.md → AGENTS.md`, `~/openbolts/CLAUDE.md → AGENTS.md` verified this session |
| D6 | `AGENTS.md` dev cycle content updated during migration (not zero-loss) | Product | LOCKED | No | Current dev cycle section has stale `cd packages/<pkg> && bunx tsc --noEmit` commands that contradict the new root scripts. Faithful-copy and content-update are incompatible; explicit content update matches the reality. | `CLAUDE.md:24-31` today |
| D7 | Remove `!init_spike` from `biome.jsonc:38`, `feat/init-spike` from `ci.yml:5,7`, and all `init_spike/` lines from `.gitignore` (lines 8-9, 24) | Technical | LOCKED | No | Directory removed; all references dead. Consistent hygiene principle. | Verified this session |
| D8 | Add root `tsconfig.json` base + have all 5 packages extend it | Technical | LOCKED | No | **Flipped from deferral.** Core and server tsconfigs are byte-identical; duplication is today's state. Openbolts precedent is direct. Greenfield project: architecturally correct default is shared base. | Challenger Finding 8 + verified diff this session |
| D9 | Defer turbo remote cache in CI | Technical | DIRECTED — NOT NOW | No | Optimization; CI is small today. Revisit when CI > 3 min. | — |
| D10 | Single atomic PR (not staged commits) | Process | LOCKED | No | Ordering hazard: D13's core/server scripts must exist before any turbo-dependent step. Bisect value across tooling churn is low. Atomicity is the safer default. | Challenger Finding 7 |
| D11 | Hoist anchors for codemirror overrides (add codemirror packages to root devDeps) | Technical | LOCKED | No | The `$@codemirror/state` deferral syntax requires a "top-level direct dep" to defer to. Bun docs don't explicitly confirm this works at root without a direct dep. Hoist anchors make the semantics definitionally work and avoid stale-pin staleness risk. | Challenger Finding 6 (suggested alternative fallback) |
| D12 | Scope is ~11 files total | Cross-cutting | LOCKED | No | Root (package.json, turbo.json, tsconfig.json, biome.jsonc, .gitignore, AGENTS.md, CLAUDE.md, ci.yml) + 4 package.json updates (core, server, cli, app) + 5 tsconfig.json updates (core, server, cli, app, docs) + bun.lock regen. Larger than original "7-9" estimate because tsconfig base promotion expanded scope. | — |
| D13 | Add `typecheck` and `test` scripts to `packages/core` and `packages/server` | Technical | LOCKED | No | Both packages ship with zero scripts today; without them, turbo silently skips those packages. Core has 4 test files; server has 2 — tests exist and activate under the new scripts. Rationale corrected from earlier "bun test will exit cleanly if no tests" (factually wrong: `bun@1.3.11` exits 1 without `--pass-with-no-tests`). In this case the tests exist so the script is safe as-is. | Verified test file count this session |
| D14 | No root `dev` script | Technical | LOCKED | No | Neither template has a naked `turbo run dev` at root (openbolts omits, agents filters to 5 packages). Naked version would start app and docs dev servers in parallel with no filter. Contributors run `cd packages/<x> && bun run dev`. | `~/openbolts/package.json` and `~/agents/package.json:14` verified this session |
| D15 | Remove phantom Playwright scripts from `packages/app/package.json` | Technical | LOCKED | No | `packages/app/playwright.config.*` doesn't exist; `packages/app/tests/e2e/` doesn't exist. `test:e2e` and `test`'s `--path-ignore-patterns` are symbolic references to missing infrastructure. Same hygiene principle as `!init_spike`. | Auditor Finding 1, verified this session via glob |
| D16 | Add `.turbo/` to `.gitignore` | Technical | LOCKED | No | Both templates ignore `.turbo/`. Required immediately because we're adding turbo; without it, first `bun run check` post-merge produces untracked `.turbo/` in every contributor's `git status`. | `~/openbolts/.gitignore`, `~/agents/.gitignore` verified |

## 11) Open questions

*All P0 questions resolved via audit + challenger + this session's verifications. No blocking open questions.*

| ID | Question | Resolution |
|---|---|---|
| Q1 | ~~Does `$@codemirror/state` deferral work at root without direct dep?~~ | **RESOLVED via D11:** Hoist anchors added to root `devDependencies` make the deferral syntax definitionally work. Eliminates the uncertainty. |
| Q2 | ~~Core consumed via source or dist?~~ | **RESOLVED:** Source — `exports` → `./src/index.ts`. No build step. Same for server. D13 adds only `typecheck` and `test` scripts, not `build`. |
| Q3 | ~~PR description or README section for dev cycle docs?~~ | **RESOLVED via D6:** AGENTS.md's dev cycle section is the canonical home. No separate README needed. |
| Q4 | ~~Atomic or staged commits?~~ | **RESOLVED via D10:** Single atomic. |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Status |
|---|---|---|---|---|
| A1 | Hoist anchors in root `devDependencies` make `$@codemirror/state` resolve correctly | HIGH | Clean `bun install`; verify canonical lockfile resolution shows single version and bun does not warn | Active |
| A2 | Turbo's `dependsOn: ^build` skips packages without a `build` script rather than erroring | HIGH | Openbolts has `docs` without build, works in turbo (verified by challenger running `bun run test` in `~/openbolts` live) | Active |
| A3 | `bun test` from `packages/core`'s cwd finds the 4 test files in `src/extensions/` and `src/utils/` | HIGH | Glob-verified this session; tests exist in the right locations | Active |
| A4 | `turbo run typecheck` + `turbo run test` covers the existing per-package coverage | HIGH | Current CI uses `bunx tsc --noEmit` per package + root `bun test` — equivalent coverage via different invocation path (package `test` script with cwd = package root finds same files) | Active |
| A5 | Husky hooks continue to work unchanged | HIGH | Hooks unchanged by this PR; root biome gains broader coverage when `!init_spike` is removed, which is desired | Active |
| A6 | `docs/` Next.js build works under turbo | HIGH | Openbolts has `packages/docs` (fumadocs) under turbo and it works | Active |
| A7 | `packages/app` vite build works under turbo | HIGH | Package has `"build": "tsc --noEmit && vite build"` script; turbo invokes it normally | Active |
| A8 | All 5 packages' tsconfigs can extend a shared base without Vite/Next breakage | HIGH | Openbolts has core + server + docs + adapter + engine-runtime + mcp all extending its root base; docs is fumadocs (same Next setup) | Active |

## 13) In Scope

- **Goal:** Architecturally correct tooling layer aligned with openbolts template. Zero runtime changes. Zero PR #10 reversal.
- **Non-goals:** §3.
- **Requirements:** §6.
- **Proposed solution:** §9 (11 steps).
- **Owner(s)/DRI:** Nick.
- **Next actions:**
  - Execute §9 steps 1-10
  - Local smoke test per Step 10
  - Open single atomic PR
- **Risks:** §14.
- **Instrumentation:** M1-M8 binary gates.

### Deployment / rollout

| Concern | Approach | Verify |
|---|---|---|
| Fresh install post-merge | `rm -rf node_modules bun.lock && bun install` | Single install step works, lockfile regenerates cleanly |
| CI cut-over | Single commit updates both config and workflow | First CI run post-merge passes |
| Contributors with stale clones | `git pull && bun install` | Normal workflow |
| `.turbo/` cache on first run | `.gitignore` has the entry before any turbo invocation | `git status` clean after `bun run check` |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| R1 — Hoist anchors in root devDeps cause bun to resolve differently than expected (e.g., duplicates across workspace) | Low | Medium | Clean install + canonical lockfile resolution check (M2). Fallback: replace `$` syntax with concrete version pins and accept staleness as tradeoff. |
| R2 — `packages/cli/tsconfig.json` has tsdown-specific fields that conflict with root base | Low | Low | Read file before extending; preserve any cli-specific compilerOptions that matter; the base is additive, packages override fields they need |
| R3 — `packages/app/tsconfig.json` Vite-specific `jsx: react-jsx` lost when extending base | Low | Medium | Explicitly preserve `jsx` and any other Vite-specific fields in the child tsconfig |
| R4 — `docs/tsconfig.json` Next.js-specific settings conflict with base | Low | Medium | Preserve `types: ["next"]`, `paths`, and Next.js plugin fields. Openbolts `packages/docs` has Next + fumadocs and works extending a base. |
| R5 — Turbo's `^build` dependency forces build of packages that have no build script | Very Low | Low | Verified: turbo silently skips (openbolts `docs` package works this way — challenger live-tested) |
| R6 — Content in `CLAUDE.md` mangled during git mv → AGENTS.md + content update | Low | High | Use `git mv` for rename (preserves history), edit in a separate step. `git log --follow AGENTS.md` verifies post-merge. |
| R7 — Biome starts catching errors in files previously masked | Low | Low | Only `!init_spike` exclusion is being removed (directory already gone); all other excludes remain |
| R8 — Removing phantom `test:e2e` script breaks a CI step that still invokes it | Very Low | Low | Grep CI for `test:e2e` before removing; if absent, safe |
| R9 — `bun run check` at root runs significantly slower than current CI | Low | Low | Turbo parallelizes typecheck/test; lint is already a single biome call. Should match or improve on current sequential per-package steps. |

## 15) Future Work

### Explored

- **Turbo remote cache in CI**
  - Openbolts doesn't have it; agents does (with `TURBO_TOKEN`/`TURBO_TEAM` secrets)
  - Copy agents's cache setup when CI runtime exceeds ~3 min or contributor count > 3
  - Pure optimization, no current pain
- **`bun test --pass-with-no-tests` flag for future script-less packages**
  - When a new package is added without tests, the correct `test` script is `bun test --pass-with-no-tests` (verified: bun 1.3.11 exits 1 on empty without the flag)
  - Not an issue for core/server today because tests exist
  - Document this in AGENTS.md's dev cycle conventions section as part of Step 6

### Identified

- **`packages/app`'s standalone `check` script divergence from root `check`:** After this PR, `cd packages/app && bun run check` runs `tsc --noEmit && biome check . && bun test && vite build` (includes vite build), while root `bun run check` runs `typecheck && lint && test` (no build). Two different guarantees. Contributors iterating in `packages/app` might think they've validated locally when they haven't. Fix: either rename package-level to `check:local`, or rewrite it to invoke the root script, or delete it. Low priority until someone trips on it.
- **Changesets release workflow:** `.changeset/` exists, scripts wired, no release GitHub Action. Add when CLI is ready to publish to npm.
- **Fix `packages/server/src/persistence.ts` `PROJECT_DIR` logic (if still present):** PR #10 R2.4 claimed "content dir from config not relative path" — verify this actually landed in the server extraction and the old `import.meta.dirname, '../..'` bug from init_spike is gone.

### Noted

- **Husky hook consolidation:** Pre-commit and pre-push both run biome. Could collapse. Low value.
- **Engine pin:** `engines.bun >= 1.3.11` already at root. No change.

## 16) Agent constraints

- **SCOPE:**
  - `package.json` (root) — add overrides, hoist anchors, turbo devDep, rewrite scripts
  - `turbo.json` (root, new)
  - `tsconfig.json` (root, new — openbolts shape)
  - `biome.jsonc` (root) — remove `!init_spike`
  - `.gitignore` (root) — remove init_spike lines, add `.turbo/`
  - `AGENTS.md` (root, new via `git mv CLAUDE.md AGENTS.md` + content update)
  - `CLAUDE.md` (root, becomes symlink)
  - `.github/workflows/ci.yml` — rewrite
  - `packages/core/package.json` — add scripts block
  - `packages/core/tsconfig.json` — extends root
  - `packages/server/package.json` — add scripts block
  - `packages/server/tsconfig.json` — extends root
  - `packages/cli/tsconfig.json` — extends root (preserve cli-specific fields)
  - `packages/app/package.json` — remove overrides + phantom Playwright scripts
  - `packages/app/tsconfig.json` — extends root (preserve Vite fields)
  - `docs/tsconfig.json` — extends root (preserve Next fields)
  - `bun.lock` (regenerated)
- **EXCLUDE:**
  - Any file in `packages/*/src/` or `docs/src/`
  - `PROJECT.md`, `STORIES.md`, `ARCHITECTURE.md`, `README.md`
  - `specs/`, `reports/`, `evidence/`, `meta/`, `docs/content/`
  - `.husky/pre-commit`, `.husky/pre-push` (unchanged)
  - Any CRDT / editor / server runtime behavior
  - `packages/cli/tsdown.config.ts` (build tool config, not tsconfig)
- **STOP_IF:**
  - `bun install` at root fails after hoist anchors + overrides added
  - Canonical lockfile resolution shows multiple versions of `@codemirror/state` or `@codemirror/view` post-install (A1 failed)
  - Any package's tsconfig breaks after extending the base (`tsc --noEmit` errors on previously-clean files) — surface and investigate before forcing
  - `bun run check` catches a real pre-existing error in an existing package — do NOT mask it; surface for separate fix
  - `git mv CLAUDE.md AGENTS.md` loses git history (verify with `git log --follow`)
  - `docs/tsconfig.json` extending root breaks Next.js build — revert just that file to standalone, keep other extensions
- **ASK_FIRST:**
  - Before changing any package's `exports` field
  - Before adding any dep other than `turbo` + codemirror hoist anchors
  - Before touching anything under `packages/*/src/`
  - Before deciding what to preserve vs. drop when extending per-package tsconfigs (R2, R3, R4)
