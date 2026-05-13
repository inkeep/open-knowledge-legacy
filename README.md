# Open Knowledge

Open Knowledge is a local-first knowledge base for teams that want docs, help-center content, SOPs, and agent-facing knowledge to live in one structured editing system.

The project includes a desktop app, web app, server, CLI, shared core packages, and docs site. It uses Bun workspaces and Turbo for builds.

## Repository Model

This public repository is mirrored from Inkeep's internal monorepo with Copybara. The internal source path is `public/open-knowledge/` in `inkeep/agents-private`.

Public pull requests are welcome. When a public PR opens here, automation mirrors it into the internal monorepo for review and merge. After the internal PR lands, Copybara syncs the accepted change back to this repository.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contribution flow and [AGENTS.md](./AGENTS.md) for agent-facing development guidance.

## Prerequisites

- Bun 1.3.13 or newer (pinned in [`.bun-version`](./.bun-version))
- Node.js 24 or newer (pinned in [`.node-version`](./.node-version))
- Git

If you use a Node version manager, pin Node 24 with `fnm install`, `volta install node@24`, or `mise install`. Earlier Node versions fail `engines` checks during `bun install`.

## Quick Start

```bash
bun install
bun run check
```

Run the app locally:

```bash
bun run --filter @inkeep/open-knowledge-app dev
```

Run the docs site locally:

```bash
cd docs
bun run dev
```

## Monorepo Layout

- `packages/app` - web app and editor UI
- `packages/cli` - command-line entrypoint
- `packages/core` - shared domain logic
- `packages/desktop` - Electron desktop app
- `packages/plugin` - agent integration package
- `packages/server` - local server
- `docs` - documentation site

## Development

```bash
bun run format
bun run lint
bun run typecheck
bun run test
bun run build
```
