# Evidence: Agent-Readable Folder-Instruction Conventions

**Dimension:** D3 — Agent-readable folder instruction patterns (CLAUDE.md nested, AGENTS.md, .cursorrules, Zed .rules)
**Date:** 2026-04-23
**Sources:** agentsmd.net spec, Claude Code docs, Cursor docs, Zed docs, Windsurf docs, and cross-reference to existing report `reports/config-driven-folder-frontmatter/REPORT.md`

---

## Scope of this evidence file

D3 in the rubric is deliberately narrowed to **agent-readable folder-scoped instruction files** — NOT the navigation/sidebar folder-metadata question. The existing report [config-driven-folder-frontmatter](../../config-driven-folder-frontmatter/REPORT.md) already covers the navigation-metadata landscape (Fumadocs `meta.json`, Docusaurus `_category_.json`, Hugo `cascade`, Obsidian folder-notes, Shape A–D design space).

What that report did NOT cover: **how do tools express "instructions for an agent, scoped to this folder"** — which is the relevant question for an Open Knowledge scaffolder that wants to write folder-level guidance about *what the folder is for* and *how agents should treat documents inside it.*

---

## Key sources referenced

- [AGENTS.md specification, agentsmd.net](https://agentsmd.net/) — cross-vendor convention (OpenAI, Google, Anthropic, Cursor, Zed signatories)
- [Claude Code CLAUDE.md docs](https://docs.claude.com/en/docs/claude-code/memory) — Anthropic's proprietary nested-file convention
- [Cursor rules documentation](https://docs.cursor.com/context/rules) — the `.cursor/rules/` frontmatter-scoped pattern
- [Zed .rules file docs](https://zed.dev/docs/ai/rules) — simpler root-file pattern
- [Windsurf docs](https://docs.windsurf.com/context-awareness/memories) — `.windsurfrules`
- [GitHub Copilot custom instructions](https://docs.github.com/en/copilot/how-tos/custom-instructions) — `.github/copilot-instructions.md`
- Local repo: `/Users/timothycardona/inkeep/open-knowledge/CLAUDE.md` is a symlink to `AGENTS.md` (see memory `project_claude_md_symlink.md`), demonstrating the 1P preference

---

## Findings

### Finding: AGENTS.md is the emerging cross-vendor standard for agent-scoped instructions

**Confidence:** CONFIRMED
**Evidence:** [agentsmd.net](https://agentsmd.net) — the specification site explicitly lists signatories including OpenAI (Codex), Google (Jules / Gemini CLI), Cursor, Zed, Aider, and many others. Claude Code accepts `AGENTS.md` as an alternative to its proprietary `CLAUDE.md` (Anthropic announced support mid-2025).

```
AGENTS.md
A simple, open format for guiding coding agents.
Used by OpenAI Codex, Amp, Jules from Google, Cursor, and Factory.
Backwards compatibility:
Already have human docs like README.md? AGENTS.md complements—and doesn't
replace—your existing documentation.
```

**Implications:** Open Knowledge's scaffolder should probably emit `AGENTS.md` (not `CLAUDE.md`) at the repo root for cross-agent neutrality. This is already the 1P pattern — the repo's `CLAUDE.md` is a symlink to `AGENTS.md`.

---

### Finding: Folder-scoped AGENTS.md / CLAUDE.md is spec-supported and actively nested

**Confidence:** CONFIRMED
**Evidence:** The AGENTS.md spec supports nesting — a file at `/AGENTS.md` applies to the whole repo, `/api/AGENTS.md` narrows to the `/api/` subtree, and closer files override their parents. Claude Code's memory docs describe the same hierarchy for `CLAUDE.md` (user-level `~/.claude/CLAUDE.md`, project root, then recursively walked-down subdirectories).

```
Claude Code reads CLAUDE.md files recursively from the current working directory
upward to the project root, and also from subdirectories that are explicitly
added to context. This lets you scope instructions to specific parts of a
monorepo.
```

From [Cursor docs on project rules](https://docs.cursor.com/context/rules):

```
Rules at .cursor/rules apply to the project. Nested rules (subdirectories
with their own .cursor/rules folders) apply only when files in that
subdirectory are referenced.
```

**Implications:** The "folder-scoped agent instruction" pattern is already universal. Open Knowledge's scaffolder scaffolding a folder structure should emit an `AGENTS.md` per top-level content folder — exactly matches the emerging convention. No reinvention required.

---

### Finding: Cursor's .cursor/rules/*.mdc is the most sophisticated scoping mechanism

**Confidence:** CONFIRMED
**Evidence:** Cursor moved from a single `.cursorrules` (v0.45 era) to `.cursor/rules/<name>.mdc` where each file has YAML frontmatter that controls when it activates. The four activation modes from [Cursor rules docs](https://docs.cursor.com/context/rules):

```
---
description: Apply when editing API routes
globs:
  - app/api/**/*.ts
alwaysApply: false
---
```

Four modes:
- **Always** (`alwaysApply: true`) — loaded into every prompt
- **Auto-attached** (`globs:` matches the file being edited) — loaded when relevant
- **Agent-requested** (`description:` provided, `alwaysApply: false`, no globs) — the agent decides when to pull it
- **Manual** — explicitly mentioned via `@ruleName`

**Implications:** This is the most ergonomic pattern in the ecosystem today. If Open Knowledge wants folder frontmatter to say "apply these instructions when an agent is reading/writing inside this folder," the Cursor `.mdc` frontmatter model is the closest fit. The frontmatter keys — `description`, `globs`, `alwaysApply` — map directly onto what a knowledge-base folder's instructions would need.

---

### Finding: The Open Knowledge repo itself uses AGENTS.md as the canonical file, with CLAUDE.md as a symlink

**Confidence:** CONFIRMED
**Evidence:** From memory (`project_claude_md_symlink.md`, persisted in user memory) and repo state: `CLAUDE.md` in the repo root is a symlink to `AGENTS.md`. This is the 1P precedent — the team has already chosen AGENTS.md as primary.

**Implications:** The scaffolder should emit `AGENTS.md` (not `CLAUDE.md`) as the canonical agent-instruction file. If Claude-specific behavior is needed, symlink `CLAUDE.md → AGENTS.md`, matching the existing pattern.

---

### Finding: "Folder frontmatter" as agent-instruction is a novel synthesis, not a shipped pattern

**Confidence:** INFERRED
**Evidence:** No mainstream tool ships "YAML frontmatter on a folder itself" as a concept. The closest equivalents:

1. **Folder-level instruction file with frontmatter** — Cursor's `.cursor/rules/<folder>.mdc` scoped by `globs:` to a folder is the functional equivalent, but the frontmatter lives on the rule file, not "the folder."
2. **Sibling meta file with frontmatter-equivalent keys** — Fumadocs `meta.json`, Docusaurus `_category_.json` (but these are navigation metadata, not agent instructions, per the existing folder-frontmatter report).
3. **Folder-note with frontmatter** — Obsidian's folder-note plugin lets a note *representing* a folder carry frontmatter. This is the closest to "folder frontmatter" as a first-class concept. But it was rejected in Open Knowledge as D19 (see `config-driven-folder-frontmatter` report §D19 context: rejected because it creates a "shadow folder structure in files").

**Implications:** "Folder frontmatter with agent instructions" is a novel affordance worth designing deliberately. The existing report's Shape A (config-first glob rules) + the Cursor .mdc frontmatter model together constitute the cleanest composition. But the design space is not solved — there's room to invent here, which means the scaffolder's output is itself a design decision the /spec needs to make.

---

### Finding: No tool surveyed has a CLI subcommand that *writes* agent-instruction files

**Confidence:** INFERRED (from negative search)
**Evidence:** None of the following tools ship a CLI command that scaffolds agent-instruction files:
- Cursor has no CLI subcommand to bootstrap `.cursor/rules/` — users hand-author
- Claude Code has no CLI command to scaffold `CLAUDE.md` — users hand-author
- GitHub Copilot does not ship a scaffolder for `.github/copilot-instructions.md`
- Zed does not scaffold `.rules`

The only adjacent thing is [Cursor's "Rule Generator" UI](https://docs.cursor.com/context/rules) — inside the IDE, users can ask Cursor to generate a rule for them, but it's a chat-based UX, not a CLI.

Searched: "cursor rules cli" → no results. "cursor init" → refers to Cursor IDE setup, not rules. "claude code init agents.md" → refers to the `claude /init` Claude Code slash command that scaffolds CLAUDE.md, BUT this is a slash command *inside* Claude Code, not a CLI subcommand of `claude`.

**Implications:** An `ok <scaffolder> → AGENTS.md + per-folder AGENTS.md + config.yml folder-instruction hooks` command is **genuinely novel** in the ecosystem. There's no direct precedent to copy from — only adjacent patterns (Cursor rules, AGENTS.md spec) to build on. This is a mild positive: Open Knowledge is not competing with an incumbent, it's defining a new affordance.

---

## Synthesis: what the scaffolder should emit

Based on the ecosystem convergence (AGENTS.md nested, Cursor .mdc frontmatter scoping) and the existing folder-frontmatter report's Shape recommendations:

**Recommended output shape for the scaffolder:**

1. **Root `AGENTS.md`** — project-wide agent-readable instructions. Already the 1P precedent.
2. **Per-top-level-folder `AGENTS.md`** — scoped instructions (e.g., `specs/AGENTS.md`, `reports/AGENTS.md`, `projects/AGENTS.md`). Matches AGENTS.md nested convention.
3. **`config.yml` `folders:` block** — centralized metadata (title, icon, description, category) per top-level folder, Shape A/B from the existing report. Already landable via Zod schema extension per that report's §D1.
4. **Optional: frontmatter on per-folder `AGENTS.md` files** — `description`, `globs`, `alwaysApply` keys à la Cursor .mdc, to let the scaffolder emit pre-scoped instructions the agent can reason about at load time.

**What NOT to emit:**

- **Do NOT emit an `INDEX.md` or `_index.md` with folder-config frontmatter.** Explicitly rejected in Open Knowledge as D19 anti-pattern ("shadow folder structure in files"). Per `config-driven-folder-frontmatter` report.
- **Do NOT emit `CLAUDE.md`** as the primary — emit `AGENTS.md` and symlink if Claude-specific fallback is needed. Matches 1P precedent.

---

## Negative searches / gaps

- **Searched:** "CLI command to scaffold AGENTS.md" → no dedicated tool found; only Claude Code's in-app `/init` slash command.
- **Searched:** "cursor rules cli generator" → Cursor has an in-IDE rule generator, no CLI.
- **Gap:** How should folder frontmatter differ from a per-folder `AGENTS.md`? These may be two expressions of the same thing, OR one may be for humans (config.yml sidebar metadata) while the other is for agents (AGENTS.md). The /spec decision is punted.

---

## Relationship to existing research

This evidence file **extends** (does not duplicate) the existing `reports/config-driven-folder-frontmatter/REPORT.md`:

| Concern | Covered by | This file's delta |
|---|---|---|
| Navigation/sidebar metadata (title, icon, pages) | config-driven-folder-frontmatter, all dimensions | — |
| Shape A/B/C/D config-vs-sibling-file tradeoffs | config-driven-folder-frontmatter §D7 | — |
| D19 anti-pattern (overloaded INDEX.md) | config-driven-folder-frontmatter §D19 | — |
| Agent-readable instruction file conventions | Not covered | **New: AGENTS.md nested, Cursor .mdc frontmatter scoping, GitHub Copilot instructions, Zed .rules** |
| CLI-scaffolded agent-instruction files | Not covered | **New: no precedent; genuinely novel affordance** |

Downstream agents/readers consulting this research should read both files for the full picture. `config-driven-folder-frontmatter` owns "where does folder metadata live in config"; this file owns "how do we write agent-facing instructions that reference those folders."
