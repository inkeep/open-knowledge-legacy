---
name: Current open-knowledge layout
description: Code-verified snapshot of the repo's layout, nested projects, and tooling at baseline fa3dd17
sources:
  - package.json
  - biome.jsonc
  - .gitignore
  - init_spike/package.json
  - init_spike/tsconfig.json
  - init_spike/vite.config.ts
  - docs/package.json
  - .github/workflows/ci.yml
  - .husky/pre-commit
  - .husky/pre-push
confidence: HIGH
---

# Current open-knowledge layout

## Root

- `package.json` — `"name": "open-knowledge"`, private, bun@1.3.11
  - devDeps: `@biomejs/biome ^2.4.10`, `husky ^9.1.7`, `lint-staged ^16.4.0`
  - Scripts: `lint: biome check .`, `format: biome check --write .`, `typecheck: cd docs && bun run typecheck`, `check: bun run typecheck && bun run lint`, `prepare: husky && chmod +x .husky/pre-commit .husky/pre-push`
  - lint-staged: biome check --write on `*.{ts,tsx,js,jsx,json,md}`
  - **No `workspaces` field** — not currently a monorepo
- `bun.lock` — 8495 bytes (tiny — just root tooling)
- `biome.jsonc` — single notable exclude at line 33: `!init_spike`. Also excludes `!specs`, `!reports`, `!evidence`, `!meta`, `!.claude`, `!docs/bun.lock`, `!**/node_modules`, `!**/dist`, `!**/.next`, `!**/.source`, `!**/.turbo`, `!**/tmp`, `!**/next-env.d.ts`
- `.gitignore` key lines: `node_modules/`, `dist/`, `tmp/`, `.next/`, `.source/`, `*.tsbuildinfo`, `.claude/pr-diff/`, and line 16: `init_spike/content/test-doc.md` (runtime fixture)
- `.husky/pre-commit`: `bun run lint-staged` (one line)
- `.husky/pre-push`: `bun run format && bun run lint` (one line)

### Root siblings (not code)

- `PROJECT.md`, `STORIES.md`, `ARCHITECTURE.md`, `README.md`
- `specs/`, `reports/`, `evidence/`, `meta/`, `tmp/`
- `.github/`, `.husky/`, `.claude/`, `.gitmodules`
- No `AGENTS.md`, no `CLAUDE.md` at the root

### Root children that ARE code

- `docs/` — Next.js + fumadocs site (details below)
- `init_spike/` — Vite + React editor prototype (details below)

## init_spike/ (nested self-contained project)

- `package.json:2` — `"name": "open-knowledge-init-spike"`, `"version": "0.0.1"`, private, bun@1.3.11
- Scripts: `dev: vite`, `build: tsc && vite build`, `typecheck: tsc --noEmit`, `lint: biome check .`, `format: biome check --write .`, `test: bun test --path-ignore-patterns 'tests/e2e'`, `check:fast: tsc --noEmit && biome check .`, `check: tsc --noEmit && biome check . && bun test && vite build`, `test:e2e: npx playwright test`
- Dependencies: codemirror 6 suite, @hocuspocus/provider+server 4.0.0-rc.1, @parcel/watcher 2.5.6, tiptap 3.x suite (core, collaboration, image, link, table, task-list, markdown, pm, react, starter-kit, y-tiptap), yjs 13.6.30, y-codemirror.next 0.3.5, react 19, react-dom 19, diff 7.0.0, simple-git 3.35.0, ws 8.0.0
- DevDeps: @biomejs/biome ^2.4.0, @playwright/test ^1.59.1, @types/react, @types/react-dom, @types/ws, @vitejs/plugin-react ^4.0.0, typescript ^5.7.0, vite ^6.0.0
- `package.json:55-58` — `overrides` block:
  ```json
  "overrides": {
    "@codemirror/state": "$@codemirror/state",
    "@codemirror/view": "$@codemirror/view"
  }
  ```
- Own `bun.lock` (68137 bytes)
- Own `node_modules/` (116 top-level entries observed via ls)
- `tsconfig.json` — standalone, no `extends`; `jsx: react-jsx`, `moduleResolution: bundler`, `verbatimModuleSyntax: true`, `include: ["src"]`, `exclude: ["node_modules", "dist", "src/v7-test"]`
- `vite.config.ts` — Vite + `hocuspocusPlugin` (embedded Hocuspocus via `src/server/hocuspocus-plugin`)
- `playwright.config.ts` — testDir `./tests/e2e`, `baseURL: 'http://localhost:5173'`, `webServer: { command: 'bun run dev', port: 5173, reuseExistingServer: true }`
- `index.html` — Vite entry point
- `biome.jsonc` — own
- `CLAUDE.md` — real file, 7679 bytes, NOT a symlink, NOT accompanied by AGENTS.md
- `dist/` — build output (gitignored)
- `src/` tree: `App.tsx`, `main.tsx`, `editor/` (TiptapEditor.tsx, SourceEditor.tsx, observers.ts, observers.test.ts, three-way-merge.ts, extensions/, plugins/), `server/` (hocuspocus-plugin.ts, agent-sim.ts, persistence.ts, persistence.test.ts, file-watcher.ts), `presence/` (identity.ts + test, PresenceBar.tsx, AgentUndoButton.tsx, use-presence.ts), `components/ui/`, `lib/utils.ts`, `icons/`, `globals.css`, `types/`, `v1a-roundtrip-test.ts`, `v1b-roundtrip-test.ts`, `v7-test/`
- `tests/` tree: `e2e/sync.spec.ts`, `e2e/qa-scenarios.spec.ts`, `jsx-tokenizer.test.ts`
- `content/` — runtime markdown fixtures; `content/test-doc.md` is gitignored (runtime-written)

## docs/ (nested self-contained Next.js project)

- `package.json:2` — `"name": "@open-knowledge/docs"` (already scoped), private, bun@1.3.11
- Deps: fumadocs-core ~16.1.0, fumadocs-mdx ~14.0.3, fumadocs-ui ~16.1.0, lucide-react ^0.503.0, mermaid ^11.12.3, next ^16, react ^19, react-dom ^19, zod ^4.3.6
- DevDeps: @tailwindcss/postcss ^4, @types/node ^24.0.7, @types/react ^19, @types/react-dom ^19, fumadocs-typescript ~4.0.13, remark-mdx-snippets ^0.3.3, tailwindcss ^4, typescript ^5.7
- Scripts: `dev: next dev --port 3010`, `build: next build`, `start: next start --port 3010`, `typecheck: next typegen && tsc --noEmit`, `postinstall: fumadocs-mdx`
- Own `bun.lock`, own `node_modules/`
- Own `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `source.config.ts`, `tailwind.config.ts`, `next-env.d.ts`
- `src/`, `content/`, `_snippets/`
- No CLAUDE.md, no AGENTS.md

## `.github/workflows/ci.yml`

- Triggers: push/PR on `main` and `feat/init-spike` branches
- Steps:
  1. checkout
  2. setup-bun 1.3.11
  3. `bun install --frozen-lockfile` (at repo root)
  4. `bun install --frozen-lockfile` with `working-directory: docs`
  5. `bun run lint` (root — biome over non-excluded paths; does NOT cover init_spike)
  6. `bun run typecheck` with `working-directory: docs`
  7. `bun run build` with `working-directory: docs`
  8. `bun install --frozen-lockfile` with `working-directory: init_spike`
  9. `bun run test` with `working-directory: init_spike`
- **Observation:** Three separate `bun install` calls. Two hardcoded `working-directory` blocks. Root lint does not cover init_spike source.

## Count: lockfiles and node_modules

- `bun.lock` files: 3 (root, docs, init_spike)
- `node_modules/` directories: 3 (root, docs, init_spike)
- `biome.jsonc` files: 2 (root, init_spike) — docs uses root biome because it's not excluded
- `tsconfig.json` files: 2 (docs, init_spike) — no root tsconfig exists
