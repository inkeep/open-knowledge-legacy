# Evidence: KB-in-Existing-Repo vs Standalone Repo Patterns

**Dimension:** D4 — KB-in-existing-repo vs standalone repo patterns
**Date:** 2026-04-08
**Sources:** Docusaurus/Fumadocs/Mintlify docs, Obsidian forums, git submodule critiques, git worktree guides, Turborepo/Nx docs, Storybook docs, docs-as-code topologies research

---

## Key files / pages referenced

- [Docusaurus Installation](https://docusaurus.io/docs/installation) + [Issue #3463](https://github.com/facebook/docusaurus/issues/3463)
- [Fumadocs workspace docs](https://www.fumadocs.dev/docs/mdx/workspace)
- [Mintlify monorepo setup](https://www.mintlify.com/docs/deploy/monorepo)
- [Obsidian gitignore discussion](https://forum.obsidian.md/t/what-should-i-gitignore-for-my-vaults-github-repository/101077)
- [HN: Why are submodules so bad?](https://news.ycombinator.com/item?id=31792303)
- [Claude Code worktree guide](https://claudefa.st/blog/guide/development/worktree-guide)
- [Passo.uno - Docs-as-code topologies](https://passo.uno/docs-as-code-topologies/)
- [Storybook configuration](https://storybook.js.org/docs/configure)
- [Turborepo structuring guide](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)

---

## Findings

### Finding: Four docs-as-code topologies exist; sidecar (same repo) is the default starting point
**Confidence:** CONFIRMED
**Evidence:** Ferri-Benedetti's taxonomy:

| Topology | Docs location | Best for |
|----------|---------------|----------|
| Sidecar | Same repo as code | Internal docs, API docs, early-stage |
| Orthogonal | Separate repo | Transitional; generally discouraged |
| Federated | Distributed, aggregated centrally | Large orgs (e.g., OpenTelemetry) |
| Specialized | Guides in docs repo, ref from code | Mature products with editorial teams |

**Implications:** Open-knowledge should support sidecar (subdir of existing repo) as the primary pattern, with standalone repo as an option.

### Finding: Obsidian's "open folder as vault" is the gold standard for non-destructive init
**Confidence:** CONFIRMED
**Evidence:** Point Obsidian at any existing folder → it adds only `.obsidian/` → all existing `.md` files immediately indexed. Zero disruption to existing content. Sub-second init.

**Implications:** `npx openknowledge init` in an existing repo should add only `.openknowledge/` + `AGENTS.md`, immediately treating existing markdown as KB content.

### Finding: Git submodules are universally disliked for content-in-code-repo
**Confidence:** CONFIRMED
**Evidence:** Seven distinct pain points documented across HN, blog posts, and practitioner guides: clone amnesia (need --recursive), detached HEAD trap, two-repo commit dance, branch switching breaks things, opaque merge conflicts, poor tool support, accidental reverts.

**Implications:** Do NOT use submodules for the KB-in-parent-repo pattern. Track KB files directly in the parent repo.

### Finding: Git worktrees are emerging as the pattern for agent branch isolation
**Confidence:** CONFIRMED
**Evidence:** Claude Code and Cursor use worktrees to give parallel AI agents isolated directories on separate branches. All worktrees share the same object store and refs. Maps to content drafting: author on `draft/new-guide` branch via worktree while engineers work on `main`.

**Implications:** This validates PROJECT.md's TQ22 decision (`.openknowledge/worktrees/` for draft branch isolation). The KB should use worktrees for draft/review, not separate repos.

### Finding: Storybook's init is the best model for "add tool to existing project"
**Confidence:** CONFIRMED
**Evidence:** `npx storybook@latest init` auto-detects framework from package.json, creates minimal `.storybook/` config, adds scripts to package.json, leaves everything else untouched. Co-location pattern (stories next to components) avoids a separate content directory.

**Implications:** `npx openknowledge init` should follow this pattern: detect existing content, create minimal config, don't restructure the project.

### Finding: The .gitignore convention is "committed = source of truth, ignored = derived"
**Confidence:** CONFIRMED
**Evidence:** Universal across tools: Docusaurus ignores `.docusaurus/` + `build/`, Fumadocs ignores `.next/` + `.source/`, Storybook ignores `storybook-static/`, Obsidian ignores `workspace.json` (UI state). Generated indexes that must exist before build create a "build before build" problem.

**Implications:** `.openknowledge/cache/` (backlink graph, component cache) should be gitignored. Catalog files (`_INDEX.md`) should be committed (they're useful for git readers too). Config (`.openknowledge/config.json`, `AGENTS.md`) should be committed.

### Finding: Nested .git is an anti-pattern — git creates broken gitlinks
**Confidence:** CONFIRMED
**Evidence:** `git init` inside a subdirectory of existing repo creates mode-160000 gitlinks, not trackable files. GitHub shows grey arrow icons. Fresh clones ignore the nested repo entirely.

**Implications:** The KB should NEVER have its own `.git` inside a parent repo. Either use the parent's git (sidecar) or be a fully standalone repo.

---

## Gaps / follow-ups

- How should `init` behave when run at a monorepo root vs a subdirectory?
- Should `.openknowledge/` be at repo root or can it be in a subdirectory (e.g., `docs/.openknowledge/`)?
