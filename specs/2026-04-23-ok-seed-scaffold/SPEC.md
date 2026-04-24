# `ok seed` — Knowledge-base Starter Scaffolder

**Status:** Scaffold (pre-`/spec` refinement)
**Spec dir:** `specs/2026-04-23-ok-seed-scaffold/`
**Research:** [`reports/cli-command-naming-brain/REPORT.md`](../../reports/cli-command-naming-brain/REPORT.md), [`reports/config-driven-folder-frontmatter/REPORT.md`](../../reports/config-driven-folder-frontmatter/REPORT.md)

---

## Problem

Open Knowledge's existing `ok init` scaffolds `.open-knowledge/` (config.yml + .gitignore + MCP registration + user-global skill install) but does **not** scaffold any content structure — no folders, no agent-readable instruction files, no populated `folders:` metadata block. The current `mcp__open-knowledge__init-content` MCP tool fills part of this gap by **instructing agents** to read the codebase and hand-write articles, but:

1. It's an agent-guided workflow, not a deterministic scaffold — every new project gets ad-hoc structure.
2. It lives as an MCP tool, which pollutes the agent's tool surface (per the branch theme `implement/mcp-guidance-no-project-pollution`).
3. It does not produce the "agent-readable folder instructions" surface the ecosystem is converging on (nested `AGENTS.md`, per AGENTS.md spec + Cursor rules + CLAUDE.md nesting).

**Goal:** Ship a CLI subcommand `ok seed` that deterministically scaffolds the Karpathy three-layer knowledge-base structure (`external-sources/` → `research/` → `articles/`) plus populates `config.yml` `folders:` with per-folder descriptions. Replaces the instructional `init-content` MCP tool. The same logic should be triggerable from the Electron app's UI post-init.

**Important precedent (D2 LOCKED, SPEC 2026-04-22 FR1):** `ok init` deliberately does NOT write root `AGENTS.md` / `CLAUDE.md`. Behavioral guidance for agents ships through three channels: (1) compressed MCP instructions handshake, (2) per-tool MCP tool descriptions, (3) the user-global Agent Skill installed via `installUserSkill`. `ok seed` follows this same precedent — **it does not emit AGENTS.md files**. Folder-purpose guidance lives in `config.yml` `folders:` entries via the `description:` field, which surfaces at every `exec("ls <folder>")` / `read_document` / `search` call.

## Goals

1. **`ok seed` CLI subcommand** — runs from CWD (default) or `<path>` arg, scaffolds the Karpathy three-layer folder structure + populates `config.yml` `folders:` block with per-layer descriptions. Idempotent (plan → diff → confirm → apply; re-run shows 0 changes).
2. **Electron UI trigger** — a button in FileSidebar's `+` menu that opens a "Seed your knowledge base" dialog, renders the scaffold plan as a simple list, user clicks Apply.
3. **Remove `init-content` MCP tool** — delete the tool + its registration + all references in `ok init` output + related docs.
4. **Shared implementation** — single TS module exposing `planSeed` / `applySeed`, consumed thinly by Commander CLI, Electron IPC, (future) MCP tool.

## Non-goals

- **NOT emitting AGENTS.md / CLAUDE.md files.** Per SPEC 2026-04-22 D2 LOCKED / FR1, root AGENTS.md / CLAUDE.md is NOT a delivery surface for agent behavioral guidance. Behavioral guidance lives in (1) MCP instructions handshake, (2) per-tool MCP descriptions, (3) user-global Agent Skill (`installUserSkill`). `ok seed` inherits this constraint. Folder-purpose guidance lives in `config.yml` `folders:` `description:` fields instead.
- **NOT emitting INDEX.md / README.md hub files.** Per SPEC D19 anti-pattern ("shadow folder structure in files"). `exec("ls <folder>")` returns the enriched catalog view live from `folders:` config + per-file frontmatter.
- **NOT content generation.** `ok seed` creates **empty folders + config.yml metadata** (+ optional `log.md`). It does NOT read the codebase, does NOT write knowledge articles, does NOT synthesize understanding. Agent-driven content bootstrapping remains an agent job (invoked naturally in Claude Code / Cursor / etc. via the `ingest` / `research` / `consolidate` workflow tools).
- **Not replacing `ok init`.** `ok init` stays as-is: scaffolds `.open-knowledge/`, registers MCP, installs user-global skill. `ok seed` is additive.
- **Not a schema change.** The `config.yml` `folders:` Zod schema is already implemented (Shape A with globs, `packages/cli/src/config/schema.ts:FolderRuleSchema`). The scaffolder just writes starter entries into it.
- **Not an MCP tool.** The scaffolder is CLI + Electron only for V1. If it needs an MCP surface later (agent-triggered seeding), that's a thin wrapper around the same shared module — out of scope now.
- **Not interactive folder-picking in V1.** V1 ships a fixed starter folder set (three Karpathy layers). V2 could allow `--folders ...` overrides or interactive selection.
- **Cross-tab awareness of seed state** (n/a — seed is a one-shot op, no state to sync across tabs).

## Acceptance criteria

### A. CLI — `ok seed`

- [ ] `ok seed` run from any directory containing `.open-knowledge/` computes a scaffold plan, prints it as a plain list with per-item status (create / skip), prompts `? Apply [Y/n]`, writes on confirm.
- [ ] `ok seed --yes` skips confirmation (for scripting / CI).
- [ ] `ok seed --dry-run` prints the plan and exits 0 without writing.
- [ ] `ok seed <path>` operates on `<path>` instead of CWD.
- [ ] Re-running `ok seed` on a fully-seeded project prints "nothing to do" and exits 0 (idempotent).
- [ ] If `.open-knowledge/` does not exist, print a clear error pointing to `ok init` and exit non-zero.
- [ ] If config.yml already has `folders:` entries for the three layer globs (`external-sources/**`, `research/**`, `articles/**`), skip those specific entries with a note in the plan; add any that are missing. Never overwrite an existing entry (preserve user edits).
- [ ] YAML writes preserve existing comments + ordering in config.yml. Use the `yaml` package's Document API.
- [ ] Plan output is colored per the existing CLI UI conventions (`packages/cli/src/ui/colors.ts`); respects `--no-color` / `NO_COLOR`.

### B. Electron UI

- [ ] A "Seed knowledge base" option appears in the FileSidebar `+` menu (alongside "New file" / "New folder"). **Locked:** FileSidebar mount point matches the existing `NewItemDialog` pattern.
- [ ] Clicking opens a `SeedDialog` React component that fetches the plan via IPC and renders it as a **simple list**: folders to create, config entries to add, optional log.md to seed. Each item has a one-line label + an expandable preview (for config entries, shows the YAML snippet; for folders, shows the description text).
- [ ] Dialog has "Apply" (primary) and "Cancel" (secondary) buttons.
- [ ] Apply triggers the IPC handler, which calls `applySeed`. On success, shows a toast and closes the dialog; sidebar refreshes to reflect the new folders.
- [ ] If there's nothing to do (idempotent re-run), the dialog shows "Your knowledge base is already seeded" with a read-only view of the existing entries.
- [ ] Errors (permissions, IO) surface in the dialog with a retry option.

### C. MCP tool removal

- [ ] `packages/cli/src/mcp/tools/init-content.ts` deleted.
- [ ] `packages/cli/src/mcp/tools/init-content.test.ts` deleted (or test suite restructured).
- [ ] `init-content` removed from the server's tool-registration list (`packages/cli/src/mcp/tools/index.ts` and `packages/cli/src/mcp/server.ts`).
- [ ] `WorkflowRole` type in `packages/cli/src/mcp/tools/shared.ts` narrowed to `'ingest' | 'research' | 'consolidate'` (drop `'init-content'`).
- [ ] `ok init` output text updated — the `Next steps` block no longer references `mcp__open-knowledge__init-content`.
- [ ] Server-bundled skill (`packages/server/assets/skills/open-knowledge/SKILL.md`) updated to reference `ok seed` instead of `init-content`.

### D. Shared module

- [ ] A single TS module at **`packages/cli/src/seed/`** (locked — simplest; Electron imports the CLI package for this surface, matching the precedent where Electron already imports from `@inkeep/open-knowledge-server`) exports:
  - `planSeed(opts: SeedOptions): Promise<ScaffoldPlan>` — pure, read-only, computes changes
  - `applySeed(plan: ScaffoldPlan, opts: SeedOptions): Promise<ApplyResult>` — performs writes with try/catch + rollback on partial failure
  - Types: `ScaffoldPlan`, `ApplyResult`, `SeedOptions`
- [ ] CLI (`packages/cli/src/commands/seed.ts`) is a thin Commander wrapper.
- [ ] Electron IPC handler (`packages/desktop/src/main/ipc/seed.ts`) uses `createHandler` / `createInvoker` from `packages/desktop/src/shared/ipc-*.ts` per the IPC discipline rule (CLAUDE.md §IPC discipline, D19).

### E. Tests

- [ ] Unit tests for `planSeed` and `applySeed` covering: fresh project, fully-seeded project, partial overlap (some entries exist), error paths, idempotency.
- [ ] CLI integration test for `ok seed` covering: happy path, `--dry-run`, `--yes`, missing `.open-knowledge/`, pre-existing `folders:` entry preservation.
- [ ] Electron IPC smoke test: renderer invokes `ok:seed:plan` + `ok:seed:apply`, receives structured results.
- [ ] Playwright E2E test for the SeedDialog flow (optional per /spec calibration).
- [ ] Test that the `init-content` MCP tool is no longer registered (update `packages/cli/src/mcp/server.test.ts` which currently asserts `'init-content'` IS present — invert to assert it is NOT).
- [ ] YAML preservation test: seed a config.yml with existing comments + overrides, apply seed, verify comments + user overrides preserved in output.

### F. Docs

- [ ] `AGENTS.md` root (symlinked from `CLAUDE.md`): §Package: cli updated to document `ok seed` subcommand.
- [ ] `AGENTS.md` root: §Package: cli MCP Commands table updated — remove `init-content` from any tool list. Search + replace across the doc for `init-content` references.
- [ ] `packages/server/assets/skills/open-knowledge/SKILL.md` updated — replace `init-content` references with `ok seed`, and update the §"Workflow tools — when to invoke them" table (currently includes `init-content`; should be `ingest` / `research` / `consolidate` only + a new row/note pointing at `ok seed` for project-level scaffolding).
- [ ] `packages/cli/src/content/init.ts` `CONFIG_YML_CONTENT` template: update the commented-out `folders:` example to reflect the new Karpathy-aligned starter entries so users running `ok init` see the intended starter as documentation.

## Design (directional)

### What `ok seed` emits — starter pack (V1)

**Follows the [Karpathy three-layer knowledge-base pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)** — the same pattern the MCP workflow tools (`ingest` / `research` / `consolidate`) are already built around, and the same pattern referenced in the bundled user-global skill (`packages/server/assets/skills/open-knowledge/SKILL.md` §"Workflow tools") and the commented-out example in the `ok init` scaffold of `config.yml`.

**Folder set** (created as empty directories if missing):

| Folder | Karpathy layer | Workflow tool | Purpose |
|--------|----------------|---------------|---------|
| `external-sources/` | Raw sources (immutable) | `ingest` | Preserve URLs, PDFs, fetched content verbatim — no analysis. Takeaways go to the user in chat, not the file. |
| `research/` | Wiki, provisional | `research` | Investigate, compare alternatives, synthesize multiple sources. Produces `status: provisional` articles with a `sources:` list. |
| `articles/` | Wiki, canonical | `consolidate` | Committed source-of-truth after the team has decided. `status: canonical` with a `supersedes:` chain tying back to the research that preceded it. |

**Optional root `log.md`** — append-only chronological record of ingests / research / consolidations. Per the Karpathy pattern it's a useful orientation surface for new collaborators (and multi-agent audit trail), but the shadow repo's git history is always the authoritative record. Emit as a seeded empty log (just `# Work Log` header + date placeholder); user can delete if not wanted.

**`config.yml` `folders:` entries** are the **primary agent-guidance surface** for folder purpose. The `description:` field of each entry surfaces at every `exec("ls <folder>")` call and every `search` / `read_document` call — it is the canonical place for "what does this folder contain + what should agents do here" text. Writes into the existing schema (`FolderRuleSchema`, already implemented in `packages/cli/src/config/schema.ts`). Each entry includes `title`, `description`, and `tags`:

```yaml
folders:
  - match: 'external-sources/**'
    frontmatter:
      title: External Sources
      description: Raw preserved sources (URLs, PDFs, files). Immutable — captured verbatim via `ingest`. No analysis in these files; takeaways belong in `research/`.
      tags: [source, immutable, layer-ingest]
  - match: 'research/**'
    frontmatter:
      title: Research
      description: Provisional analysis synthesizing external sources. Produced by the `research` tool. Each article has `status: provisional` and a `sources:` list citing `external-sources/` or external URLs. Promoted to `articles/` via `consolidate` when the team decides.
      tags: [research, provisional, layer-research]
  - match: 'articles/**'
    frontmatter:
      title: Articles
      description: Canonical knowledge committed after a team decision. Produced by the `consolidate` tool. Carries `status: canonical` and a `supersedes:` chain tying back to the research that preceded it. Source-of-truth for the domain.
      tags: [article, canonical, layer-consolidate]
```

Preserve user comments + formatting in `config.yml` (YAML preservation via a diff-friendly writer — use the [`yaml`](https://www.npmjs.com/package/yaml) package (eemeli), which supports round-trip preservation of comments and ordering via its Document API).

### Architecture

```
packages/cli/src/seed/                    ← shared module (locked per D3)
  plan.ts       ← planSeed(opts): ScaffoldPlan
  apply.ts      ← applySeed(plan, opts): ApplyResult
  starter.ts    ← starter pack data (folder names, descriptions, tags, log.md seed content)
  types.ts      ← ScaffoldPlan, ApplyResult, SeedOptions

packages/cli/src/commands/seed.ts         ← Commander wrapper
packages/desktop/src/main/ipc/seed.ts     ← typed IPC handler (createHandler)
packages/app/src/components/SeedDialog.tsx ← React dialog + Apply button
packages/app/src/components/FileSidebar.tsx ← add "Seed knowledge base" menu entry
```

### `ScaffoldPlan` shape (directional)

```ts
type ScaffoldPlan = {
  created: {
    path: string;       // relative to project root
    kind: 'folder' | 'file';
    contentPreview?: string;  // for files, first N lines
  }[];
  skipped: {
    path: string;
    reason: 'already-exists' | 'user-content' | 'glob-collision';
  }[];
  configEdits: {
    path: string;       // '.open-knowledge/config.yml'
    diff: string;       // unified diff of the YAML change
  }[];
  warnings: string[];
};
```

### Idempotency guarantee

- Fresh project: plan has `created.length > 0`, `configEdits.length > 0`.
- Fully-seeded project: plan has `created.length === 0`, `configEdits.length === 0`, exit cleanly with "nothing to do."
- Partially-seeded: plan has the delta.

### Removal of `init-content`

Mechanical deletion + references. The MCP tool is **purely instructional** (emits text, no side effects), so removing it has no runtime surface-area impact. Only concern is agents that might have memorized the tool name — the user-global Agent Skill + updated `ok init` output point them at `ok seed` instead.

## Decisions (locked)

All open questions from the scaffold have been resolved:

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Folder set: `external-sources/` + `research/` + `articles/` (Karpathy three-layer).** Plus optional root `log.md`. | Matches the existing workflow tools (`ingest` / `research` / `consolidate`), the commented-out config.yml example, and the bundled `SKILL.md` §"Workflow tools" table. |
| D2 | **NO `AGENTS.md` files emitted.** | Per SPEC 2026-04-22 D2 LOCKED / FR1: root AGENTS.md is not a delivery surface. Behavioral guidance lives in MCP instructions + user-global skill. Per-folder guidance lives in `config.yml` `folders:` `description:` fields. |
| D3 | **Shared module at `packages/cli/src/seed/`.** | Simplest location. Electron already imports from `@inkeep/open-knowledge-server`; importing from CLI follows the same precedent. Keeps seed logic out of `core` (which reserves that package for no-Node-server-dep shared code). |
| D4 | **Electron mount point: FileSidebar `+` menu.** | Matches the existing `NewItemDialog` pattern (`New file` / `New folder`). Low-surprise, discoverable without a new UI surface. |
| D5 | **Diff rendering: simple list with expandable previews.** | Full side-by-side diff is overkill for a first-time scaffold (most users apply once, re-run is a no-op). A plain list with per-item expansion matches the app's existing UX density. |
| D6 | **YAML library: [`yaml`](https://www.npmjs.com/package/yaml) (eemeli).** | Round-trip preservation of comments and key ordering via its Document API. Industry-standard; active maintenance. Add as a dep if not already present. |
| D7 | **One PR** — `ok seed` + `init-content` removal. | Logically linked (new CLI replaces the removed MCP tool). `init-content` is purely instructional (no runtime behavior); removal blast radius ~5 files. Same-PR shipping makes the intent obvious in git log. |

## Test plan (directional)

- **Unit (Bun test)** — `packages/cli/src/seed/plan.test.ts`, `apply.test.ts`, table-driven with fixtures in `seed/__fixtures__/`.
- **CLI integration** — `packages/cli/src/commands/seed.test.ts`, shell out to `ok seed --dry-run` against a tmpdir.
- **Electron IPC smoke** — `packages/desktop/tests/ipc/seed.test.ts`, exercise `createInvoker` handler with mock main process.
- **Playwright E2E** — optional, `packages/app/tests/stress/seed-dialog.e2e.ts`, full CI tier via `bun run check:full:parallel`.
- **Regression** — assert `init-content` is not in the registered tool list (add to `packages/cli/src/mcp/server.test.ts` that currently lists `'init-content'` as expected).

## References

- Research: [`reports/cli-command-naming-brain/REPORT.md`](../../reports/cli-command-naming-brain/REPORT.md)
- Research: [`reports/config-driven-folder-frontmatter/REPORT.md`](../../reports/config-driven-folder-frontmatter/REPORT.md)
- Existing init: `packages/cli/src/commands/init.ts` (runInit)
- Existing init-content MCP tool: `packages/cli/src/mcp/tools/init-content.ts`
- Config schema: `packages/cli/src/config/schema.ts` (FolderRuleSchema, FolderFrontmatterSchema already implemented)
- Initial config.yml comment-doc: `packages/cli/src/content/init.ts` (CONFIG_YML_CONTENT)
- Electron IPC discipline: `CLAUDE.md` §Package: desktop §IPC discipline (D19)
- User-global Agent Skill: `packages/server/assets/skills/open-knowledge/SKILL.md`
- AGENTS.md ecosystem convention: [agentsmd.net](https://agentsmd.net)
