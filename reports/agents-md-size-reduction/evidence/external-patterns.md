---
title: External patterns for shrinking agent instruction files
description: Full research report on agents.md spec, Anthropic guidance, and community patterns for size reduction
tags:
  - agents-md
  - research
  - evidence
---

# Shrinking Agent Instruction Files: An Evidence-Based Guide

**Audience:** maintainers of monorepo `CLAUDE.md` / `AGENTS.md` files that have grown beyond the recommended budget. This report is sourced from primary documentation (Anthropic, OpenAI, the `agents.md` spec) and from maintainers who have publicly described concrete before/after splits. Where a claim has no strong source, it is flagged.

## 1. The agents.md spec and Anthropic's own guidance

### 1.1 What the official `agents.md` spec says

The [AGENTS.md specification](https://agents.md/) ([repo](https://github.com/agentsmd/agents.md)) is deliberately minimal. It imposes **no required structure, no mandated sections, no line or byte caps**. Quoting directly: "AGENTS.md is just standard Markdown. Use any headings you like; the agent simply parses the text you provide."

Recommended (not required) sections: project overview, build/test commands, code style, testing instructions, security considerations, commit/PR conventions, deployment steps. The spec's framing is "anything you'd tell a new teammate belongs here too." Critically, it supports **nested AGENTS.md files** — agents read the closest one in the directory tree, which means subpackages can carry their own tailored instructions rather than inflating the root.

### 1.2 OpenAI Codex's concrete byte cap

[OpenAI's Codex AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md) is the one official document that names a number: **`project_doc_max_bytes` defaults to 32 KiB** (≈ 32,768 bytes). "Codex skips empty files and stops adding files once the combined size reaches the limit." Files from the root down to the current working directory are merged, with **proximity determining precedence** — closer files override earlier ones because they appear later in the combined prompt.

For a 159k-char monorepo file, this is decisive evidence: you are ~5× over the Codex-enforced budget. Any Codex user working in the repo is already having content silently truncated.

### 1.3 Anthropic's Claude Code guidance

[Claude Code best practices](https://code.claude.com/docs/en/best-practices) does not publish a hard byte cap, but the guidance is unambiguous:

> "There's no required format for CLAUDE.md files, but **keep it short and human-readable**... CLAUDE.md is loaded every session, so only include things that apply broadly."
>
> "For each line, ask: *Would removing this cause Claude to make mistakes?* If not, cut it. **Bloated CLAUDE.md files cause Claude to ignore your actual instructions!**"

The [Claude Code memory docs](https://code.claude.com/docs/en/memory) give a concrete target:

> "**Size: target under 200 lines per CLAUDE.md file.** Longer files consume more context and reduce adherence."

And an important mechanical detail: **`@path` imports do not reduce context cost.** "Imported files are expanded and loaded into context at launch alongside the CLAUDE.md that references them... Splitting into `@path` imports helps organization but does not reduce context, since imported files load at launch."

### 1.4 Community consensus on the ceiling

Corroborating numbers from practitioners:

- [HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md): "At HumanLayer, our root `CLAUDE.md` file is **less than sixty lines**." General consensus they cite: "< 300 lines is best, and shorter is even better."
- [A Complete Guide to AGENTS.md](https://www.aihero.dev/a-complete-guide-to-agents-md): cites research that frontier LLMs follow "**~150–200 instructions with reasonable consistency**" and notes Claude Code's system prompt already contains ~50, leaving limited instruction budget for your file.
- [agentsmd.net best-practices](https://agentsmd.net/): recommends **under 150 lines when possible**, splitting into subdirectories when exceeded.

Convergent target: **200 lines / ~32 KiB is the upper edge of the "safe" zone.** 500+ lines is "performance degrades, Claude ignores half of it" territory.

## 2. Progressive disclosure / link-out patterns

Three mechanisms exist. They are NOT equivalent — choosing the wrong one preserves your bloat problem.

### 2.1 Nested CLAUDE.md / AGENTS.md (load-on-demand)

Both specs support subdirectory instruction files that load **only when the agent works in that directory**. Claude Code docs: "Claude also discovers `CLAUDE.md` and `CLAUDE.local.md` files in subdirectories under your current working directory. Instead of loading them at launch, they are included when Claude reads files in those subdirectories."

[A monorepo case study](https://dev.to/anvodev/how-i-organized-my-claudemd-in-a-monorepo-with-too-many-contexts-37k7) reports an **80% root-file reduction** this way:

| File | Size |
|---|---|
| Before: single CLAUDE.md | 47,000 words |
| After: root CLAUDE.md | 8,902 chars |
| `frontend/CLAUDE.md` | 8,647 chars |
| `backend/CLAUDE.md` | 7,892 chars |
| `core/CLAUDE.md` | 7,277 chars |

The insight: "each service doesn't need all context at once." Frontend rules don't load when Claude is editing server code. This is the single highest-leverage pattern available.

### 2.2 Skills (on-demand loading of procedures)

[Claude Code's skills feature](https://code.claude.com/docs/en/skills) is Anthropic's preferred mechanism for "rules that don't apply every session." Quote from the docs:

> "Create a skill when you keep pasting the same playbook, checklist, or multi-step procedure into chat, **or when a section of CLAUDE.md has grown into a procedure rather than a fact**. Unlike CLAUDE.md content, a skill's body loads only when it's used, so long reference material costs almost nothing until you need it."

Skills use [three-level progressive disclosure](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices): (1) frontmatter metadata (`name` + `description`, ≤ 1,536 chars) is always loaded so Claude can discover the skill; (2) SKILL.md body loads when invoked; (3) linked reference files load only when SKILL.md references them. Anthropic's guidance: **"Keep SKILL.md under 500 lines. Move detailed reference material to separate files."**

### 2.3 Path-scoped rules (`.claude/rules/`)

[Claude Code's rules feature](https://code.claude.com/docs/en/memory) supports YAML-frontmatter `paths:` globs. A rule with `paths: ["src/api/**/*.ts"]` only enters context when Claude touches a matching file. This is the middle ground between always-on CLAUDE.md and fully on-demand skills.

### 2.4 Plain prose references (the cheapest option)

The [monorepo split case study](https://dev.to/anvodev/how-i-organized-my-claudemd-in-a-monorepo-with-too-many-contexts-37k7) notes a critical distinction that many CLAUDE.md authors miss:

> "**@ Import (embed content):** improves organization but **doesn't reduce load** — the referenced content still loads into memory at startup.
>
> **Plain references (load on demand):** The principle is to **point, not embed**. Instead of `@path/to/big-doc.md`, write 'For migration procedures, see `docs/migrations.md`.' Claude reads it when it needs the information."

This is the same insight reflected in Anthropic's own wording in [Claude Code best practices](https://code.claude.com/docs/en/best-practices): "Detailed API documentation (link to docs instead)."

## 3. What actually causes bloat (with receipts)

Reviewing large CLAUDE.md files against Anthropic's official ❌ Exclude list, the HumanLayer / aihero.dev / TurboDocx analyses, the following categories account for ~80%+ of the bloat in large agent files. Each has a clear better home.

### 3.1 Post-mortem narrative

Example pattern: "We fixed Bug-A in PR #X; here's the mechanism." The Claude Code guide explicitly flags this: "Information that changes frequently" and "Long explanations or tutorials" are on the exclude list.

**Better home:** `specs/` or `evidence/`, referenced from CLAUDE.md by name only.

### 3.2 Architectural diagrams

ASCII trees showing file relationships, system topology, dataflow. Claude Code's guide: "**File-by-file descriptions of the codebase**" — exclude.

**Better home:** `ARCHITECTURE.md` or a skill loaded when Claude works in the affected dir. HumanLayer specifically notes: "Tell Claude about the tech... to give Claude a map of the codebase" — a map is different from an exhaustive diagram.

### 3.3 Invariant lists / property-test contracts

Long enumerations like "I1: identity — serialize(parse(md)) === md" etc. These are spec artifacts, not session-level guidance.

**Better home:** the spec file itself (already linked), surfaced by one-line pointer: "Markdown fidelity invariants live in `packages/core/src/markdown/README.md`."

### 3.4 Precedent / pattern registries

Enumerating N rules with rationale when the repo already has `PRECEDENTS.md`. The inline listing is redundant with the canonical home.

**Better home:** `PRECEDENTS.md`. Keep only precedents that actually cause repeat mistakes on every task.

### 3.5 Test-writing tutorials

Step-by-step "how to write a new integration test" guides. [Anthropic explicitly](https://code.claude.com/docs/en/best-practices): "Long explanations or tutorials" — exclude.

**Better home:** A skill named `writing-integration-tests` that loads when Claude is writing tests. Or `packages/app/tests/integration/README.md`.

### 3.6 STOP rules for rarely-touched subsystems

Every STOP rule has a cost — it consumes context tokens on every session regardless of relevance.

**Better home:** path-scoped rules (`.claude/rules/<subsystem>.md` with `paths: [...]`) or nested CLAUDE.md files in the affected packages.

### 3.7 Fully-enumerated API tables, env-var tables, key-file indexes

These are reference material, not behavior drivers.

**Better home:** `README.md` or per-package docs. In CLAUDE.md, keep only: "HTTP API endpoints documented in `packages/server/README.md`."

### 3.8 "Why this exists" ritual context

Multi-paragraph rationale ("This is load-bearing because..."). Load-bearing claims matter at the moment of deciding whether to change something — but most sessions don't touch these subsystems.

**Better home:** Inline code comments at the actual call site. Or the spec that locked the decision.

## 4. Concrete patterns for a <40k budget

### 4.1 Target shape for a 40k (~6000 words / ~200–300 lines) file

Based on convergent guidance from [Anthropic](https://code.claude.com/docs/en/best-practices), [HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md), and [TurboDocx](https://www.turbodocx.com/blog/how-to-write-claude-md-best-practices):

| Section | Target size | Content |
|---|---|---|
| Project one-liner + tech stack | 5–10 lines | "Bun monorepo, CRDT collab server + editor" — the role-prompt. |
| Commands cheat sheet | 15–30 lines | `bun install`, `bun run check`, `bun run dev` — commands Claude can't guess. |
| Workspace map | 10–20 lines | One line per package. Pointer to each package's own CLAUDE.md or README. |
| Quality gates | 10–15 lines | "Run `bun run check` before every push." Which test file lives where. |
| Top 5–10 STOP rules | 30–60 lines | Only the STOP rules that fire on every session. |
| Project-specific conventions | 20–40 lines | ESM, Biome, co-located tests, `workspace:*` deps — stuff Claude won't guess. |
| Pointers ("see X for details") | 15–30 lines | One-line links to specs/, reports/, PRECEDENTS.md, per-package READMEs. |

Everything else — architecture deep dives, precedent enumerations, protocol specs, observer dispatch tables, post-mortem breadcrumbs — moves to:
- Per-package CLAUDE.md files (load on demand)
- Path-scoped rules for specific hot-button files
- Skills for procedures
- Plain references to existing `specs/` and `reports/` documents

### 4.2 How to phrase "see X for details" without duplicating content

**Anti-pattern (duplicates context):**
> The bridge uses hybrid diff3+DMP three-way merge with per-document baseline tracking via `lastSyncedXmlMd` in `server-observers.ts`. Observer A dispatches via `afterAllTransactions`... [200 more lines]
> See [specs/.../SPEC.md](...) for the full design.

**Pattern (just the pointer):**
> **Cross-CRDT bridge:** Y.XmlFragment ↔ Y.Text sync is server-authoritative. Before changing `packages/server/src/server-observers.ts` or anything under `packages/core/src/bridge/`, read [specs/.../SPEC.md](...).

The pointer tells Claude **when it matters** (the file list) and **where to go** (the spec). Claude Code best practices explicitly endorse this: "Point Claude to the source that can answer a question" rather than embedding the answer.

### 4.3 Symlink vs separate files

Community consensus across [Kaushik Gopal](https://kau.sh/blog/agents-md/), [Onur Solmaz](https://solmaz.io/log/2025/09/08/claude-md-agents-md-migration-guide/), and [SSW Rules](https://www.ssw.com.au/rules/symlink-agents-to-claude):

- **AGENTS.md is the canonical content**, CLAUDE.md is a symlink (`ln -s AGENTS.md CLAUDE.md`). Git tracks symlinks natively; Claude Code follows them transparently.
- Anthropic's own [memory docs recommend the inverse](https://code.claude.com/docs/en/memory): CLAUDE.md with `@AGENTS.md` at the top. Both work. Symlink avoids a tiny context-cost for the import directive.
- **Avoid two separate files.** Every author who has tried it reports the files drift apart and the team gets inconsistent behavior depending on which tool they use.

## 5. Tradeoffs — where slimming hurts

### 5.1 Repeat foot-guns that only the inline STOP rule prevents

A STOP rule that exists because the wrong form compiles and runs silently. If the rule moves to a path-scoped file that only loads when editing the enforced file, a session that touches a different file + the enforced file as a secondary read may miss it.

**Mitigation:** Keep the highest-frequency STOP rules inline; move subsystem-specific STOPs to path-scoped rules with generous globs.

### 5.2 "Why this weird pattern exists" context

Losing the inline rationale for quirky patterns means a future Claude may delete them during a refactor.

**Mitigation:** Inline *code comments* are the right home for rationale (they're right next to the thing being protected). This is zero-context-cost at agent-load time and maximum-context-proximity at edit time.

### 5.3 Discoverability for new Claude sessions

A new session with a lean CLAUDE.md doesn't know that `specs/X/` exists. The large file served as an implicit index.

**Mitigation:** Keep an explicit pointers section at the bottom — "See also" with one line per major doc.

### 5.4 Out-of-date pointers

When a file is renamed, a `@docs/foo.md` import breaks loudly; a prose pointer breaks silently.

**Mitigation:** Prefer `@imports` for files that rarely change path; prefer prose for broad "see the specs/ directory" pointers. Add a pre-commit hook that validates import paths if you go heavy on `@` imports.

## Top 10 concrete recommendations (for any repo)

1. **Delete enumerated precedent/pattern registries that have a canonical home.** If `PRECEDENTS.md` exists, replace the inline list with one-line pointer.
2. **Move per-package deep content to per-package CLAUDE.md files.** Claude Code loads them on demand.
3. **Move test-writing tutorials to `<package>/tests/README.md`.** Keep a one-line pointer in root.
4. **Move architecture deep dives to a skill.** Skills load only when invoked. Anthropic's guidance: "a section of CLAUDE.md that has grown into a procedure" is the trigger.
5. **Keep only 5–8 top-priority STOP rules inline.** Move subsystem-specific STOPs to path-scoped rules.
6. **Convert load-bearing rationale into inline code comments.** Rationale at the call site > rationale in CLAUDE.md.
7. **Replace fully-enumerated API / config / CLI tables with one-line pointers to READMEs.**
8. **Delete post-mortem and corrigendum narrative.** These are troubleshooting guides, not session-level rules.
9. **Rename root file to AGENTS.md and symlink CLAUDE.md.** Consensus tool-neutral pattern.
10. **Add a 20-line "See also" pointer section at the bottom.** Index of where deep content lives without paying to load it.

## Sources

- [AGENTS.md specification](https://agents.md/) — official spec site
- [agentsmd/agents.md on GitHub](https://github.com/agentsmd/agents.md)
- [Anthropic — Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Anthropic — Claude Code memory / CLAUDE.md documentation](https://code.claude.com/docs/en/memory)
- [Anthropic — Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Anthropic — Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Anthropic engineering — Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [OpenAI — Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md) — the 32 KiB `project_doc_max_bytes` limit
- [HumanLayer — Writing a good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- [A Complete Guide to AGENTS.md — aihero.dev](https://www.aihero.dev/a-complete-guide-to-agents-md)
- [agentsmd.net best practices](https://agentsmd.net/)
- [How I Organized My CLAUDE.md in a Monorepo with Too Many Contexts](https://dev.to/anvodev/how-i-organized-my-claudemd-in-a-monorepo-with-too-many-contexts-37k7) — 47k→9k word case study
- [TurboDocx — How to Write a CLAUDE.md File That Actually Works](https://www.turbodocx.com/blog/how-to-write-claude-md-best-practices)
- [Kaushik Gopal — Keep your AGENTS.md in sync](https://kau.sh/blog/agents-md/)
- [Onur Solmaz — CLAUDE.md to AGENTS.md Migration Guide](https://solmaz.io/log/2025/09/08/claude-md-agents-md-migration-guide/)
- [SSW Rules — Do you symlink your AGENTS.md and skills to .claude?](https://www.ssw.com.au/rules/symlink-agents-to-claude)
- [Rushi — Sharing AI Agent Configs Between Cursor and Claude with Symlinks](https://www.rushis.com/sharing-ai-agent-configs-between-cursor-and-claude-with-symlinks/)
