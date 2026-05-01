# Open Knowledge Agent Guide

This is the public mirror of Open Knowledge. Keep changes compatible with the internal source path `public/open-knowledge/` in `inkeep/agents-private`.

## Start Here

- Read [README.md](./README.md) for the project overview.
- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before changing public PR flow, dependencies, or exported docs.
- Use Bun 1.3.13 or newer and Node.js 24 or newer.

For maintainers working inside `inkeep/agents-private`, start Open Knowledge agent sessions from `public/open-knowledge/` when possible. If launched at the monorepo root, first read `public/open-knowledge/AGENTS.md`, then run Bun/build/test commands with cwd set to `public/open-knowledge`.

## Commands

```bash
bun install
bun run check
bun run build
```

Use these during development:

```bash
bun run format
bun run lint
bun run typecheck
bun run test
```

Run local apps:

```bash
bun run --filter @inkeep/open-knowledge-app dev

cd docs
bun run dev
```

## Repo Layout

- `packages/app` - web app and editor UI
- `packages/cli` - CLI and package entrypoint
- `packages/core` - shared domain logic
- `packages/desktop` - Electron desktop app
- `packages/plugin` - agent integration package
- `packages/server` - local collaboration server
- `docs` - documentation site

## Public Mirror Rules

- This repo is generated from an allowlist. Do not rely on hidden internal folders being present.
- Public PRs are mirrored into `inkeep/agents-private` for review and merge, then synced back here.
- Top-level public docs such as `README.md`, `CONTRIBUTING.md`, and `AGENTS.md` are overlay files. Keep them public-safe and standalone.
- Do not add secrets, private customer context, internal-only specs, local paths, or generated debug artifacts.
- Keep dependency updates paired with `bun.lock`. Run `bun run notices` when third-party notices may change.

## Before Finishing

Run the smallest relevant check while iterating, then run:

```bash
bun run check
```

For UI or editor changes, also run the affected package tests from `packages/app`.
