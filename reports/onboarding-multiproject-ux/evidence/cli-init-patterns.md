# Evidence: CLI Init/Scaffolding Patterns

**Dimension:** D1 — CLI init/scaffolding patterns in comparable tools
**Date:** 2026-04-08
**Sources:** Obsidian docs, Mintlify docs/CLI, Fumadocs docs, Docusaurus docs, Turborepo docs, Next.js docs, Astro docs, Cursor docs, clig.dev, Thoughtworks CLI guidelines, Atlassian CLI principles

---

## Key files / pages referenced

- [Obsidian Help - Manage Vaults](https://obsidian.md/help/manage-vaults) — vault-from-folder flow
- [Mintlify CLI Installation](https://www.mintlify.com/docs/installation) — `mint new` command
- [Fumadocs Quick Start](https://www.fumadocs.dev/docs) — manual install path for existing projects
- [Docusaurus Installation](https://docusaurus.io/docs/installation) — `create-docusaurus` CLI
- [Turborepo - Add to existing repository](https://turborepo.dev/docs/getting-started/add-to-existing-repository) — additive init
- [Next.js - create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app) — interactive prompts incl. AGENTS.md
- [Astro - Install and Setup](https://docs.astro.build/en/install-and-setup/) — `create astro` DX
- [Cursor - Rules](https://docs.cursor.com/context/rules) — `.cursor/rules/*.mdc` format
- [clig.dev](https://clig.dev/) — CLI design guidelines
- [Atlassian 10 CLI Design Principles](https://www.atlassian.com/blog/it-teams/10-design-principles-for-delightful-clis)
- [Kaushik Gopal - Build your own /init](https://kau.sh/blog/build-ai-init-command/) — Claude Code /init pattern

---

## Findings

### Finding: Tools fall on a spectrum from "own the directory" to "add a config sidecar"
**Confidence:** CONFIRMED
**Evidence:** Comparison of 8 tools

| Tool | Additive Init? | Min Files Created | Config Format |
|------|---------------|-------------------|---------------|
| Obsidian | YES (gold standard) | `.obsidian/` dir (~6 JSON) | JSON |
| Mintlify | NO (overwrites) | ~12 files + dirs | `docs.json` |
| Fumadocs | NO (manual alt path) | Full Next.js app | `source.ts` |
| Docusaurus | Partial (subdir) | ~15 files + dirs | `docusaurus.config.js` |
| Turborepo | YES (manual path) | `turbo.json` + dep | `turbo.json` |
| Next.js | NO | ~8 files | `next.config.ts` |
| Astro | NO | ~5 files | `astro.config.mjs` |
| Cursor | YES (fully additive) | `.cursor/rules/*.mdc` | MDC (md + YAML) |

**Implications:** For init-in-existing-repo, the Obsidian/Cursor model (hidden config directory, zero disruption) is the lowest-friction pattern.

### Finding: The evolution from single file to config directory is universal
**Confidence:** CONFIRMED
**Evidence:** Cursor (.cursorrules → .cursor/rules/*.mdc), Mintlify (mint.json → docs.json with $ref splitting), Claude Code (CLAUDE.md → .claude/rules/*.md). Every tool that starts with a single config file eventually moves to a directory as needs grow.

**Implications:** Open-knowledge should start with `.openknowledge/` directory from day one rather than a single config file.

### Finding: Interactive prompts must always have flag alternatives
**Confidence:** CONFIRMED
**Evidence:** clig.dev guidelines: "If stdin is not a TTY, skip prompts entirely." Astro provides `--yes`/`-y` (accept all defaults), `--no`/`-n` (decline all), `--dry-run`. Next.js has flags for every prompt (`--ts`, `--tailwind`, `--app`, etc.).

**Implications:** `npx openknowledge init` should work non-interactively with `--yes` or equivalent.

### Finding: Next.js now scaffolds AGENTS.md alongside code
**Confidence:** CONFIRMED
**Evidence:** `create-next-app` (2025+) includes "Would you like to include AGENTS.md?" prompt. Scaffolds AI-agent-facing documentation alongside human-facing code.

**Implications:** Init scaffolding is evolving to serve both human and AI consumers. Open-knowledge's init should scaffold AGENTS.md as a first-class artifact.

### Finding: Two-track onboarding (greenfield CLI + manual existing-project) is common but suboptimal
**Confidence:** CONFIRMED
**Evidence:** Fumadocs has `create-fumadocs-app` (greenfield) + manual installation guide (existing). Turborepo has `create-turbo` (greenfield) + manual additive docs (existing). Docusaurus has `create-docusaurus` (greenfield) + GitHub issue #3463 requesting better existing-repo docs.

**Implications:** A single `init` command that handles both cases (detects existing content, scaffolds additively) would be differentiated.

---

## Gaps / follow-ups

- How do tools handle `init` when the directory already has an `.openknowledge/` or equivalent? (idempotency)
- What's the exact UX for `init` detecting existing markdown files and offering to adopt them?
