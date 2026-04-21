---
"@inkeep/open-knowledge": minor
---

feat(cli): register `ok` as a short bin alias alongside `open-knowledge`. Both bins point to the same CLI entrypoint (`./dist/cli.mjs`); existing `open-knowledge` invocations are unchanged. Users installing globally (`bun i -g`, `npm i -g`, `pnpm add -g`) now have `ok init` / `ok start` / `ok mcp` available as the short form. One-shot runners (`bunx`, `npx`, `pnpm dlx`) continue to default to the package-name-matching `open-knowledge` bin — use `npx -p @inkeep/open-knowledge ok <cmd>` (or the bunx / pnpm equivalents) to select the short bin from an ephemeral install.

README install-path matrix expanded to cover all three package managers (bun / npm / pnpm) for both global installs and dlx runners, and the lifecycle-commands table now shows long / short pairs.

Decision rationale and peer precedent (Mastra + Speakeasy neither register a short alias because their product names are already short; open-knowledge at 14 chars justifies the alias) are captured in the companion research report at `reports/mastra-speakeasy-cli-install-recommendations/` and codified as `specs/2026-04-20-cli-distribution-and-install-ux/` D1.
