---
title: bunx / npx / pnpm dlx Usage Audit — User-Facing Docs + Templates
description: Factual audit of package-runner guidance across README, docs site, scaffolded templates, init-generated MCP configs, and agent-facing tool descriptions. Identifies divergence between surfaces and gaps relative to [[specs/2026-04-20-cli-distribution-and-install-ux/SPEC|the CLI distribution spec]] D1.
tags: [audit, cli, install-ux, docs]
---
# bunx / npx / pnpm dlx Usage Audit

**Date:** 2026-04-20
**Scope:** User-facing installation and usage instructions — root [[README]], [[docs/content/overview|docs site]], scaffolded [[packages/cli/src/content/init|AGENTS.md templates]], [[packages/cli/src/commands/init|init-generated MCP configs]], [[packages/cli/src/mcp/tools/init-content|agent-facing MCP tool descriptions]], and [[packages/plugin/README|plugin README]]. Intentionally excluded: repo-internal developer docs ([[CLAUDE]], [[AGENTS]], package READMEs for `@inkeep/open-knowledge-server`) and repo-internal `bunx tsc` / `bunx playwright` invocations — those are contributor commands for this Bun monorepo, not end-user install guidance.
**Related spec:** [[specs/2026-04-20-cli-distribution-and-install-ux/SPEC]] — D1 LOCKED: "docs must show both forms in every install snippet"; G5: discoverability via repo-root docs.
**Related research:** [[reports/mastra-speakeasy-cli-install-recommendations/REPORT]] — 9-dimension comparative evidence for CLI install UX.

---

## TL;DR

There is a **primary-runner divergence** between two equally-discoverable entry points for new users:

| Entry point                                  | Primary runner | Alternates shown                     |
| -------------------------------------------- | -------------- | ------------------------------------ |
| Root `README.md` Quick Start                 | `bunx`         | `npx`, `pnpm dlx` (one-line mention) |
| `docs/content/` guides (Fumadocs site)       | `npx`          | **None**                             |
| `packages/plugin/README.md` "Browser editor" | `bunx`         | **None**                             |

Generated artifacts (`.claude/launch.json`, per-editor `mcp.json`) and agent-facing tool strings uniformly use `npx` (hardcoded at [[packages/cli/src/commands/editors#L23]] + [[packages/cli/src/commands/init#L233]]). Scaffolded AGENTS.md and inline MCP tool descriptions also uniformly reference `npx`. This is consistent with spec D5 (Pattern A for runtime) and reasonable for cross-install robustness, but it is never explained anywhere, and it contradicts the root README's `bunx`-first presentation.

Additional gaps surfaced during the audit:

1. Docs site has no mention of the `ok` short-bin alias. The spec's D1 implication says "docs must show both forms in every install snippet" — [[reports/cli-command-name-ok-okb/REPORT|the ok/okb report]] and [[specs/2026-04-20-cli-distribution-and-install-ux/SPEC|the install-UX spec]] both assume this is already true across user-facing docs. It is not true on the docs site.
2. Prerequisites disagree: root README lists only Bun >= 1.3.11; docs site lists `Bun >= 1.3.11` OR `Node.js >= 22`. The latter matches the install-path matrix (which includes npm-family runners) that the root README itself introduces immediately below.
3. Scaffolded AGENTS.md and the live MCP-server "initial instructions" both reference `open-knowledge <subcommand>` forms in free prose, which only work after a global install. Users who invoked via `bunx`/`npx` one-shot see instructions they cannot directly execute.
4. The docs site's `internals/` pages use `ok start` / `ok ui` / `ok mcp` in prose while the `guides/` pages use `npx @inkeep/open-knowledge <cmd>` in all code blocks — internal-to-docs inconsistency.

None of this is a correctness bug. All of it is user-facing inconsistency that a contributor touching any one of these surfaces would have no way to notice without doing this audit.

---

## Methodology

1. Read [[specs/2026-04-20-cli-distribution-and-install-ux/SPEC]] to establish the LOCKED decisions (D1 dual-bin, D2 npm-only distribution, D5 NEVER postinstall, D7 programmatic opt-out) + G5 discoverability goal.
2. `grep -rn "bunx\|npx\|pnpm dlx\|pnpm exec"` across: root `README.md`, `packages/*/README.md`, `docs/content/**`, `packages/cli/src/**` (excluding `*.test.ts` noise).
3. Classified each occurrence by audience (end-user install, contributor/dev, agent-facing, generated artifact) and by surface (prose vs code block vs hardcoded string).
4. Cross-checked consistency against the spec's G1/G5 goals and D1 implications.

Scope explicitly excluded:

- **Internal contributor docs** ([[CLAUDE|CLAUDE.md]], [[AGENTS|AGENTS.md]]) — `bunx tsc`, `bunx playwright test` are correct repo-internal commands and not user-facing install guidance.
- **Sub-package library READMEs** ([[packages/server/README|@inkeep/open-knowledge-server]]) — these are library-consumer docs, not CLI install docs.
- **Test files** (`*.test.ts`) — 30+ `npx` mentions are test assertions on generated MCP config shape (they verify `command: 'npx'`, the LOCKED choice).

---

## Findings

### F1 — Root README uses `bunx` as primary; docs site uses `npx` as primary

**Root `README.md` lines 12-18:**

```
cd your-project
bunx @inkeep/open-knowledge init      # Scaffold .open-knowledge/ + register MCP config for every detected editor
bunx @inkeep/open-knowledge start     # Start Hocuspocus collab; auto-spawns ok ui on http://localhost:3000
```

> Use `npx @inkeep/open-knowledge …` or `pnpm dlx @inkeep/open-knowledge …` if you prefer npm or pnpm.

**`docs/content/overview.mdx` lines 34-38:**

```
npx @inkeep/open-knowledge clone https://github.com/company/docs  # Clone + start
npx @inkeep/open-knowledge init     # Or: scaffold on an existing project
npx @inkeep/open-knowledge start    # Hocuspocus collab; auto-spawns the editor at http://localhost:3000
npx @inkeep/open-knowledge preview  # Show which files the watcher will track
```

No mention of `bunx` or `pnpm dlx`. Same pattern holds across `docs/content/guides/*.mdx` — **every code block uses `npx`**:

- `docs/content/guides/getting-started.mdx` — 17 `npx @inkeep/open-knowledge …` examples (L22, L45, L99, L107–109, L182, plus the MCP config snippet at L66–77).
- `docs/content/guides/cli-reference.mdx` — 13 `npx @inkeep/open-knowledge …` examples, one per subcommand (L9, L27–28, L45, L60, L89, L102, L117, L130, L142, L157, L167, L181, L193, L205, L215).
- `docs/content/guides/configuration.mdx` — L113, L121.
- `docs/content/guides/content-filtering.mdx` — L89.
- `docs/content/guides/github-sync.mdx` — L24–25, L58, L72–76, L178–180.
- `docs/content/guides/mcp-integration.mdx` — L20, L93.

**Confidence:** Code-verified by grepping both surfaces.

**Spec tension:** Spec D1's implication says "Docs must show both forms in every install snippet" (referring to `open-knowledge` + `ok`). By analogy and by G5 ("discoverability via repo-root docs"), the bun/npm/pnpm matrix that lives in the root README should be visible on the docs site too — it is the first thing a user reading docs.inkeep.com/... sees, and the install-UX spec treats `bunx @inkeep/open-knowledge` as a first-class entrypoint ([[specs/2026-04-11-zero-config-bunx-packaging/SPEC]] LOCKED).

---

### F2 — `packages/plugin/README.md` shows `bunx` as the only runner

[[packages/plugin/README|`packages/plugin/README.md`]] line 38:

```bash
bunx @inkeep/open-knowledge
```

No alternatives. A Claude-Code-plugin user who doesn't have Bun installed sees an invocation that won't work for them and no guidance toward `npx` / `pnpm dlx` / `open-knowledge start` (direct bin after global install). This is the only CLI invocation in the plugin README.

**Confidence:** Code-verified.

---

### F3 — `ok` short-alias absent from docs site

The dual-bin decision ([[specs/2026-04-20-cli-distribution-and-install-ux/SPEC]] D1 LOCKED) registered both `open-knowledge` and `ok` as bin entries. Root README documents both explicitly (lines 37–45):

```
bun  install -g @inkeep/open-knowledge   # or: npm install -g, or: pnpm add -g
ok init                                  # short alias
ok start                                 # equivalent to `open-knowledge start`
```

> The package ships two bins — `open-knowledge` (long form) and `ok` (short alias).

The docs site `guides/` pages never mention the `ok` alias. Zero occurrences of `\bok \b` as a command in any file under `docs/content/guides/` (all `ok <subcommand>` mentions on the docs site are in `docs/content/internals/*.mdx` prose discussing server lifecycle, not in user-facing install/usage guides).

**Confidence:** Code-verified (`grep -n "\bok \|open-knowledge " docs/content/guides/cli-reference.mdx` returns only non-command mentions).

**Spec tension:** D1 implication "docs must show both forms in every install snippet" is unsatisfied on the docs site.

---

### F4 — Prerequisites disagree between root README and docs site

- **Root `README.md` L7:** `- [Bun](https://bun.sh) >= 1.3.11` (Bun only).
- **`docs/content/guides/getting-started.mdx` L7:** `- **Bun >= 1.3.11** or **Node.js >= 22**`.

The docs-site version is consistent with the install-path matrix (bun + npm + pnpm all work). The root README's "Bun only" prereq contradicts its own install matrix at line 40 (`bun install -g` / `npm install -g` / `pnpm add -g`) — the npm/pnpm flavors require Node, not Bun.

**Confidence:** Code-verified.

---

### F5 — Generated artifacts hardcode `npx`

Five hardcoded `npx` string constants drive every artifact the CLI generates:

- [[packages/cli/src/commands/editors|`packages/cli/src/commands/editors.ts`]] L23: `const MCP_SERVER_COMMAND = 'npx';`
  - Consumed by every per-editor MCP config (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.codex/config.toml`, Windsurf, Claude Desktop) that `ok init` writes.
- [[packages/cli/src/commands/init|`packages/cli/src/commands/init.ts`]] L233: `runtimeExecutable: 'npx'`
  - The Claude Code `.claude/launch.json` entry `open-knowledge-ui` gets `runtimeExecutable: 'npx'` + `runtimeArgs: ['@inkeep/open-knowledge', 'ui']`.
- [[packages/cli/src/commands/self-spawn|`packages/cli/src/commands/self-spawn.ts`]] L45: fallback when `process.argv[1]` is empty: `{ command: 'npx', prefixArgs: ['@inkeep/open-knowledge'] }`.

These are consistent with D2 (npm-only distribution) and the reliability rationale documented at L7–L13 of `self-spawn.ts` ("`npx` with an unpinned lockfile…"). However the rationale is never surfaced to the user: a pure-Bun user who invoked via `bunx @inkeep/open-knowledge init` ends up with an `npx`-wired MCP config with no warning. If their machine does not have Node/npm installed, the MCP server will fail to spawn with `spawn npx ENOENT` (a real failure mode exercised in `packages/cli/src/commands/mcp.test.ts` L356).

**Confidence:** Code-verified across five source files + one test file.

---

### F6 — Scaffolded AGENTS.md and agent-facing MCP tool descriptions reference `npx`-only

[[packages/cli/src/content/init|`packages/cli/src/content/init.ts`]] L78 (injected into every scaffolded `.open-knowledge/AGENTS.md`):

> This directory was scaffolded by running `open-knowledge init` (or `npx @inkeep/open-knowledge init`) in the project root.

[[packages/cli/src/mcp/tools/init-content|`packages/cli/src/mcp/tools/init-content.ts`]] L32–39 (tool description surfaced to agents via MCP `tools/list`):

```bash
open-knowledge init
# or:  npx @inkeep/open-knowledge init
```

> If you have `Bash` tool access, you can shell out: `bash` → `npx @inkeep/open-knowledge init`, then prompt the user to reconnect.

The same pattern in the CLAUDE\_MD\_SECTION injected at L201–252: multiple prose references to `open-knowledge start` / `open-knowledge ui` / `open-knowledge init` as bare commands — correct for a global install, broken for a `bunx`/`npx` one-shot user.

**Confidence:** Code-verified.

---

### F7 — Docs site internal inconsistency: `internals/` uses `ok <cmd>`, `guides/` uses `npx @inkeep/open-knowledge <cmd>`

- `docs/content/internals/server-lifecycle.mdx` L7, L144, L148, L150, L152 — uses `ok start` / `ok ui` freely in prose.
- `docs/content/internals/service-topology.mdx` L11–16, L136–149 — uses `ok start` / `ok ui` / `ok mcp` in tables and prose.
- `docs/content/overview.mdx` L43 — uses `ok mcp` and `ok start` in prose.
- `docs/content/guides/*.mdx` — **every** code block uses `npx @inkeep/open-knowledge <cmd>`; zero `ok` commands.

A reader who moves from Getting Started → Service Topology sees the command name shift from `npx @inkeep/open-knowledge start` to `ok start` with no bridge. The `ok` alias is load-bearing for internals prose (readable process names) but absent from the user's first exposure to the CLI.

**Confidence:** Code-verified.

---

### F8 — `reports/` references a legacy "zero-config-bunx-cli-packaging" report name

[[packages/cli/CHANGELOG]] L154 and [[docs/content/internals/lifecycle|`docs/content/internals/lifecycle.mdx`]] L62 + root `README.md` L125 all reference `reports/zero-config-bunx-cli-packaging/REPORT.md` (or similar). This is the legacy research-report path; the shipped spec is [[specs/2026-04-11-zero-config-bunx-packaging/SPEC]]. Verification of whether the report path still resolves is out of scope for this audit — flagged for the consumer to check if doing a cleanup.

**Confidence:** Inferred (paths referenced; resolution not verified).

---

## Connection map

```
            ┌──────────────────────────┐
            │ Spec D1 LOCKED:          │
            │ "docs must show both     │
            │ `open-knowledge` + `ok`  │
            │ in every install snippet"│
            └────────────┬─────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
     root README.md ✅         docs/content/guides/ ❌
     (bunx primary,            (npx-only, no ok alias,
      npx/pnpm alt,             no bun/pnpm matrix)
      ok alias shown)                   │
            │                           │
            │                           │ F3 (no ok),
            │                           │ F1 (no bunx/pnpm),
            │                           │ F4 (prereq mismatch),
            │                           │ F7 (internal prose uses ok)
            │                           │
            ▼                           ▼
    packages/plugin/        Generated MCP configs
    README.md ❌            + scaffolded AGENTS.md
    (bunx only, F2)         + agent tool descs
                            all npx-only, F5+F6
                            (hardcoded via
                            editors.ts:L23,
                            init.ts:L233,
                            self-spawn.ts:L45)
```

The spec ([[specs/2026-04-20-cli-distribution-and-install-ux/SPEC|D1 + G5]]) positions the root README as the source of truth for the install-path matrix. Every downstream surface (plugin README, docs site, generated configs, scaffolded templates) either contradicts it (F1, F2) or is silent about it (F3, F5, F6).

---

## Gaps

- **Consumer decision: is the "runner-hardcoding" of generated artifacts deliberately documented anywhere?** The `self-spawn.ts` comment at L7–L13 has a rationale ("`npx` with an unpinned lockfile-ABI drift"), but this is never surfaced to the user reading `README.md` or docs. Not clear whether the intent is (a) hardcode `npx` and document why, (b) detect the invoking runner and match, or (c) re-derive later.
- **Out of scope, noted in passing:** the `.changeset/README.md` was not audited — may contain install instructions for changeset consumers. Single file, low risk.
- **Not verified:** whether `reports/zero-config-bunx-cli-packaging/REPORT.md` (referenced by README.md L125 and lifecycle.mdx L62) still resolves or has been renamed to match `specs/2026-04-11-zero-config-bunx-packaging/`.

---

## What this audit does NOT recommend

Per `/explore` scope, this is factual. No recommendations on:

- Whether the docs site should switch to `bunx` primary, keep `npx` primary, or show all three.
- Whether `MCP_SERVER_COMMAND` should remain hardcoded `npx` or become runner-aware.
- Whether the `ok` alias should be added to every `guides/` example or whether a one-time callout would suffice.
- Whether plugin README should match root README's matrix or stay minimal.

Those are product/spec decisions for the consumer of this report. The spec ([[specs/2026-04-20-cli-distribution-and-install-ux/SPEC|D1 implications]]) already points toward consistency; the gap between spec intent and implemented surfaces is what this audit surfaces.

---

## Evidence provenance

All findings F1–F7 are code-verified against the current worktree HEAD. F8 is inferred (path references not resolved). Line numbers correspond to the `main` branch baseline commit this worktree forked from.

Grep commands used (reproducible):

```bash
grep -rn "bunx\|npx\|pnpm dlx\|pnpm exec" README.md packages/*/README.md
grep -rn "bunx\|npx\|pnpm dlx" docs/content/
grep -rn "bunx\|npx\|pnpm dlx" packages/cli/src/ | grep -v "\.test\."
grep -n "\bok \|open-knowledge " docs/content/guides/cli-reference.mdx
grep -n "install -g\|install --global\|\bok init\|\bok start" docs/content/
```

