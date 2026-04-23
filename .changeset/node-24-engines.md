---
"@inkeep/open-knowledge": minor
---

chore: complete the Node.js 24 floor rollout — `@types/node` aligned to `^24.7.0` for the CLI.

Follows #296 which raised `engines.node` from `>=22` to `>=24` on the CLI. This change finishes the rollout by bumping the CLI's `@types/node` dev type definitions so TypeScript sees the same Node 24 API surface the declared `engines.node` advertises. Companion desktop/root engine additions and the user-facing `Node.js >= 24` prerequisite in `docs/content/guides/getting-started.mdx` ship in the same PR but are private-package changes, so they do not emit their own changeset entries.

CI already pins `node-version: "24"` across every workflow (`ci.yml`, `release.yml`, `nightly-e2e-stability.yml`, `desktop-build.yml`, `desktop-release.yml`, `bundle-size.yml`). The Bun-first development path (`bun install`, `bun run dev`, `bun run check`) is unchanged — `engines.node` only gates consumers who run the published CLI under Node directly.
