# Contributing to Open Knowledge

Open Knowledge is developed in Inkeep's internal monorepo and mirrored to this public repository with Copybara. Public contributions should still start here: open a pull request against `inkeep/open-knowledge-legacy`.

## How Public PRs Flow

1. Open a PR against this repository.
2. Automation mirrors the PR into `inkeep/agents-private` under `public/open-knowledge/`.
3. Maintainers review and merge the internal PR.
4. Copybara syncs the accepted change back to this repository.

The public PR may be updated or closed by automation after the internal sync completes. Review and merge decisions happen in the internal mirror so that public and internal development stay on the same history.

## Development Setup

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

## Useful Commands

```bash
bun run format       # Format with Biome
bun run lint         # Lint with Biome
bun run typecheck    # TypeScript checks through Turbo
bun run test         # Test through Turbo
bun run build        # Build all workspaces
bun run check        # Public PR gate: lint, typecheck, and tests
```

For targeted work, run package commands from the package directory, for example:

```bash
cd packages/app
bun run test
```

## Contribution Guidelines

- Keep PRs focused and small enough to review.
- Include tests or a clear manual verification note for behavior changes.
- Run `bun run check` before requesting review.
- Commit `bun.lock` when dependency changes require it.
- Run `bun run notices` and include `THIRD_PARTY_NOTICES.md` changes when dependency changes affect third-party notices.
- Do not include secrets, credentials, customer data, local machine paths, or generated debug artifacts.

## Public Export Boundary

Only source code, public docs, and build or development scripts are exported here. Internal planning notes, reports, specs, and agent workspace files are intentionally not part of the public mirror.
