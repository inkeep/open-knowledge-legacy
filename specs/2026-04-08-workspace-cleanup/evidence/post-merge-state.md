---
name: open-knowledge post-merge state snapshot
description: Verified state at commit 0a14ba3 — what PR #10 actually shipped and where the gaps are
sources:
  - package.json
  - biome.jsonc
  - CLAUDE.md
  - .github/workflows/ci.yml
  - packages/app/package.json
  - packages/* structure
  - bun.lock
confidence: CONFIRMED
---

# Post-merge state at `0a14ba3`

## Repo layout

```
open-knowledge/
├── package.json                 ← workspace root (869 B)
├── bun.lock                     ← 288808 B (single hoisted lockfile)
├── bunfig.toml
├── biome.jsonc                  ← covers root; still has !init_spike exclusion
├── CLAUDE.md                    ← 6471 B, REAL FILE (not symlink)
├── tsconfig.json                ← NOT PRESENT at root
├── turbo.json                   ← NOT PRESENT at root
├── AGENTS.md                    ← NOT PRESENT at root
├── .changeset/                  ← changesets config, scripts wired
├── .husky/{pre-commit,pre-push} ← unchanged
├── .github/workflows/ci.yml     ← 60 lines, 7 working-directory blocks
├── ARCHITECTURE.md, PROJECT.md, STORIES.md, README.md
├── specs/, reports/, evidence/, meta/, tmp/
├── docs/                        ← Next.js + fumadocs site (workspace member)
│   └── package.json             ← @open-knowledge/docs
└── packages/
    ├── app/                     ← React editor (private)
    │   ├── package.json         ← open-knowledge-app — HAS DEAD overrides block
    │   ├── tsconfig.json
    │   ├── vite.config.ts
    │   ├── postcss.config.ts
    │   ├── src/, content/, public/, index.html
    ├── cli/                     ← @inkeep/open-knowledge (publishable)
    │   ├── package.json, tsconfig.json, tsdown.config.ts, src/
    ├── core/                    ← @inkeep/open-knowledge-core (private)
    │   ├── package.json, tsconfig.json, src/
    └── server/                  ← @inkeep/open-knowledge-server (private)
        ├── package.json, tsconfig.json, src/
```

## Root `package.json` (full, verbatim)

```json
{
  "name": "open-knowledge",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.3.11",
  "engines": {
    "bun": ">=1.3.11"
  },
  "workspaces": [
    "packages/*",
    "docs"
  ],
  "scripts": {
    "lint": "biome check .",
    "format": "biome check --write .",
    "typecheck": "cd docs && bun run typecheck",
    "check": "bun run typecheck && bun run lint",
    "prepare": "husky && chmod +x .husky/pre-commit .husky/pre-push 2>/dev/null || true",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "changeset publish"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json,md}": [
      "biome check --write --no-errors-on-unmatched --files-ignore-unknown=true"
    ]
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.10",
    "@changesets/cli": "^2.29.7",
    "husky": "^9.1.7",
    "lint-staged": "^16.4.0"
  }
}
```

### Gap analysis

- Line 9-12: `workspaces: ["packages/*", "docs"]` — docs is listed as a top-level workspace entry, not moved into `packages/`. This is PR #10's choice (consistent with its R1.1).
- Line 13-22: scripts have **no `build`, no `test`, no `dev`** at root
- Line 16: `"typecheck": "cd docs && bun run typecheck"` — only covers docs
- Line 17: `"check": "bun run typecheck && bun run lint"` — false green for code packages
- DevDeps: no `turbo`, no `typescript`

## Root `biome.jsonc`

Includes all of `**/*` except: `!**/node_modules`, `!**/dist`, `!**/.next`, `!**/.source`, `!**/.turbo`, `!**/tmp`, `!**/next-env.d.ts`, `!.claude`, **`!init_spike`** (line 38, dead), `!specs`, `!reports`, `!evidence`, `!meta`, `!docs/bun.lock`.

Also has `"css": { "parser": { "tailwindDirectives": true } }` (line 10-14) — for Tailwind in docs and app.

## Root `CLAUDE.md` (6471 B, real file)

Content structure:
1. Line 1 — `# Open Knowledge`
2. Line 5-14 — Monorepo structure diagram
3. Line 16-31 — Commands (per-package `cd` instructions)
4. Line 33-41 — Agent simulator commands
5. Line 43-49 — Conventions
6. Line 51-62 — Package: core (shared extensions + types)
7. Line 64-94 — Package: server (Hocuspocus + API endpoints table)
8. Line 96-120 — Package: cli (Commander.js v14 + config)
9. Line 122-155 — Package: app (editor architecture, presence, dev mode, key files)
10. Line 157-162 — Research references
11. Line 164-170 — Changesets

**Not a symlink** — verified via `ls -la`. No `AGENTS.md` sibling.

## `.github/workflows/ci.yml`

59 lines (corrected from earlier "60" — `wc -l` verified), key excerpts:

```yaml
on:
  push:
    branches: [main, feat/init-spike]   # line 5 — DEAD branch trigger
  pull_request:
    branches: [main, feat/init-spike]   # line 7 — DEAD branch trigger

jobs:
  check:
    steps:
      - checkout
      - setup-bun 1.3.11
      - name: Install all deps (workspaces)
        run: bun install --frozen-lockfile    # line 24-25 — GOOD: single install
      - name: Lint (biome)
        run: bun run lint                     # line 27-28
      - name: Typecheck (core)                # line 30-32
        working-directory: packages/core
        run: bunx tsc --noEmit
      - name: Typecheck (server)              # line 34-36
        working-directory: packages/server
        run: bunx tsc --noEmit
      - name: Typecheck (cli)                 # line 38-40
        working-directory: packages/cli
        run: bunx tsc --noEmit
      - name: Typecheck (app)                 # line 42-44
        working-directory: packages/app
        run: bunx tsc --noEmit
      - name: Typecheck (docs)                # line 46-48
        working-directory: docs
        run: bun run typecheck
      - name: Test (all packages)             # line 50-51
        run: bun test
      - name: Build (docs)                    # line 53-55
        working-directory: docs
        run: bun run build
      - name: Build (cli)                     # line 57-59
        working-directory: packages/cli
        run: bun run build
```

**Observations:**
- Single install: ✅ (good — root hoists)
- Single lint at root: ✅
- But: 5 separate `working-directory` typecheck steps + 2 separate build steps
- `bun test` at root runs everything (line 51) — good
- Zero turbo usage
- Dead branch triggers still present

## `packages/app/package.json:62-65` — the bug

```json
"overrides": {
  "@codemirror/state": "$@codemirror/state",
  "@codemirror/view": "$@codemirror/view"
}
```

- Same block that existed in the old `init_spike/package.json:55-58` pre-migration
- Carried over verbatim during the migration
- Silently ignored by bun (see `evidence/bun-overrides-root-only.md`)

## `bun.lock` — codemirror resolution (corrected)

**Earlier draft error:** an earlier version of this file claimed "two distinct version ranges → duplicate resolved versions." That methodology was wrong — `grep -o '"@codemirror/state": "[^"]*"' bun.lock | sort -u` extracts **transitive dep range declarations** from other packages' metadata, not the canonical resolved-package entries. The audit and challenger subagents both flagged this; the challenger independently verified the correct state.

**Canonical resolution grep (what to actually check):**

```bash
$ grep -E '^\s+"@codemirror/state":\s*\[' bun.lock
"@codemirror/state": ["@codemirror/state@6.6.0", "", { ... }, "sha512-..."]

$ grep -E '^\s+"@codemirror/view":\s*\[' bun.lock
"@codemirror/view": ["@codemirror/view@6.41.0", "", { ... }, "sha512-..."]
```

Exactly one resolved version per package. Bun's solver reconciled all transitive range declarations (7 distinct ranges for `@codemirror/view`, 2 for `@codemirror/state`) to a single version each. The child-level override in `packages/app` has been ignored the whole time and has had zero effect on resolution.

**What this means for the cleanup:** moving the override to root is dead-config cleanup and latent-defect prevention, NOT a bug fix. No current CRDT sync issue, no y-codemirror.next StateField binding break. See `evidence/bun-overrides-root-only.md`.

## `packages/app/package.json` scripts (verbatim)

```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "typecheck": "tsc --noEmit",
  "lint": "biome check .",
  "format": "biome check --write .",
  "test": "bun test --path-ignore-patterns 'tests/e2e'",
  "check:fast": "tsc --noEmit && biome check .",
  "check": "tsc --noEmit && biome check . && bun test && vite build",
  "test:e2e": "npx playwright test"
}
```

- Has `typecheck`, `test`, `build`, `dev` — ready for turbo invocation
- `check` exists at package level too (redundant with future root check)

## Packages not yet inspected in detail

`packages/{core,server,cli}` directory contents confirmed via `ls`, but their `package.json` files not fully read in this pass. Q1/Q2 in the spec pick this up.
