---
date: 2026-04-30
sources:
  - reports/per-doc-body-templates-karpathy-journals/REPORT.md
  - reports/obsidian-karpathy-workflow-deep-dive/REPORT.md
  - reports/config-driven-folder-frontmatter/REPORT.md
  - packages/core/src/config/schema.ts
  - packages/core/src/config/apply-folder-rules-upsert.ts
  - packages/server/src/api-extension.ts (create-page handler ~line 4080-4187)
  - packages/server/src/seed/starter.ts (LOG_MD_TEMPLATE, STARTER_FOLDERS)
  - packages/cli/src/mcp/tools/exec.ts (folder-rule virtual overlay)
  - packages/cli/src/mcp/tools/read-document.ts (folder-rule virtual overlay)
  - packages/cli/src/mcp/tools/search.ts (folder-rule virtual overlay)
  - .open-knowledge/config.yml (live workspace config, 8 folder rules)
  - CLAUDE.md (STOP rules)
depth: full
---

# Worldmodel: per-doc body templates

## Surfaces (existing OK code points)

| Surface | Path | Role |
|---|---|---|
| Schema | `packages/core/src/config/schema.ts` | `FolderRuleSchema` = `{ match: string, frontmatter: FolderFrontmatter }`. Body field would extend this. |
| Schema shim | `packages/cli/src/config/schema.ts` | Re-export from core. New types must surface here. |
| Config loader | `packages/cli/src/config/loader.ts` (per prior research) | Deep-merge user→workspace, arrays-replace |
| Folder-rule edit primitive | `packages/core/src/config/apply-folder-rules-upsert.ts` | Edits `folders[]` *in config.yml* — NOT a runtime materialization site |
| Create-page HTTP handler | `packages/server/src/api-extension.ts:~4080-4187` | `POST /api/create-page`. Currently writes empty content (line 4133 `initialContent = ''`). **Primary insertion point for body-template materialization.** |
| Seed scaffolder | `packages/server/src/seed/starter.ts` | `STARTER_FOLDERS` (Karpathy 3-layer) + `LOG_MD_TEMPLATE` — existing precedent for "static body content per folder" |
| MCP exec / read-document / search | `packages/cli/src/mcp/tools/{exec,read-document,search}.ts` | Consume `config.folders` as **virtual overlay at read time** — folder frontmatter merged with file frontmatter in MCP responses |
| MCP write_document / set_folder_rule | `packages/cli/src/mcp/tools/` | Agent-write entry points; same materialization point as create-page if extended |
| Workspace config | `.open-knowledge/config.yml` | 8 commented `folders[]` rules already shipping (`specs/**`, `reports/**`, `stories/**`, etc.) |

## Connections & dependencies

- `picomatch` is the glob library used by `ContentFilter` (`packages/server/src/content-filter.ts:13`). Folder-rule glob matching for body templates should use the same library to keep semantics consistent.
- Writer-ID taxonomy (precedent #25): `agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`. `{{user}}` template variable resolves via principal identity.
- `extractAgentIdentity` is called at every mutating route entry per attribution-sweep coverage test. Body-template materialization must run AFTER agent identity is established (so `{{user}}` resolves correctly).
- YAML config-edit pipeline (`reports/config-edit-paths/`) uses `yaml@2` (eemeli/yaml) with comment preservation. Editor "set body template" UI would route through this — but UI is out of MVP scope.

## Entities & terminology

- **Folder rule**: an entry in `config.yml` `folders:` array, shape `{ match: <glob>, frontmatter: {...} }`. Spec adds `body:` and `bodyPath:` siblings.
- **Materialize-at-create**: writing template-resolved content to disk at file-creation time. **NEW behavior** — no existing OK feature does this.
- **Virtual overlay**: merging folder-rule data into MCP responses at read time without modifying the file on disk. **EXISTING behavior** — the current `frontmatter:` field works this way.
- **Substitution context**: the variables resolved at template-application time (`date`, `title`, `path`, `user`).

## Patterns observed

- **OK pattern: `folders[].frontmatter` is virtual overlay, NOT materialized.** Confirmed by reading `packages/cli/src/mcp/tools/exec.ts:496`, `read-document.ts:144`, `search.ts:150` and the QA-002 test in `exec.test.ts:350` ("cat merges file + folder frontmatter — file wins for scalars, tags concatenate"). The `applyFolderRulesUpsert` primitive only edits config.yml itself.
- **OK pattern: existing body-template-shaped feature is hardcoded.** `LOG_MD_TEMPLATE` in `seed/starter.ts:70-99` is a static string written exactly once when `ok seed` runs. The new feature generalizes this to per-folder-rule configurability.
- **OK pattern: skill carries mechanism, seeded files carry policy.** Per memory `feedback_skill_vs_policy_split.md`. Body templates are POLICY (cadence, shape) and therefore belong in `config.yml` (workspace-scoped, opt-in), not in the skill.
- **STOP rule: no OK sidecars in user-content paths.** Templates must live in `config.yml` (inline) or `.open-knowledge/templates/` (file-ref). Never in user content folders.

## Personas & audiences

| Persona | JTBD | Body-template angle |
|---|---|---|
| Daily-journal user (Obsidian-refugee) | Open today's note, dump thoughts, search later | Wants every new file in `journals/daily/**` to start with the same H1 + sections + frontmatter |
| Karpathy-style ingest user | Save raw external sources with consistent metadata | Wants every new file in `raw/`/`external-sources/**` to start with `source:`/`clipped:` frontmatter + section scaffold |
| LLM agent (MCP client) | Create new docs at predictable paths with predictable shape | Template applies on `create_page`/`write_document` so the structure is predictable for downstream tools |
| Open-source contributor seeding a new KB | `ok seed` produces a working starter | Templates extend the existing seed model — `STARTER_FOLDERS` could ship `body:` defaults for `external-sources/`, `research/`, `articles/` |

## 3P landscape (covered fully in research report)

- Hugo archetypes — closest precedent (frontmatter+body, type-keyed, lookup precedence)
- Obsidian Daily Notes (core) + Periodic Notes (community) + Templater (community)
- Logseq journal templates, GitHub issue templates, JetBrains File and Code Templates, Notion DB templates

## Prior research

| Report | Coverage |
|---|---|
| `reports/per-doc-body-templates-karpathy-journals/REPORT.md` | THE grounding report. MVP shape, locked decisions, deferrals. |
| `reports/obsidian-karpathy-workflow-deep-dive/REPORT.md` | Karpathy's 6-stage workflow, Obsidian plugin landscape |
| `reports/config-driven-folder-frontmatter/REPORT.md` | The existing `folders[]` design space. **Outdated claim**: report says frontmatter "materialized to disk at create"; actual code is virtual overlay only. |
| `reports/config-edit-paths/REPORT.md` | YAML round-trip with comment preservation |
| `reports/preview-nav-agent-contract/REPORT.md` | Agent UX contract for OK MCP |
| Memory: `feedback_skill_vs_policy_split.md` | Mechanism vs policy split — informs where body templates live |

## Current state (existing behavior)

- `folders[].frontmatter` is defined in schema, edited via `applyFolderRulesUpsert`, surfaced as virtual overlay in MCP read-side tools (exec/read_document/search). NOT materialized to files on disk.
- `POST /api/create-page` writes empty file content (`initialContent = ''`).
- MCP `write_document` accepts arbitrary body content — already has its own behavior.
- `ok seed` writes `LOG_MD_TEMPLATE` content to `log.md` (one-shot, hardcoded).

## Unresolved / adjacent

- **Whether to migrate `folders[].frontmatter` from virtual overlay to materialize-at-create.** This is a key spec-time decision (see SPEC §10 D2). The asymmetry (frontmatter virtual, body materialized) is confusing; aligning them is cleaner but is a 1-way door for an existing semantic.
- **`{{user}}` resolution at create time** — needs investigation of when principal identity is available in the create-page request flow vs MCP write_document flow.
- **Cursor-placement marker** (`{{cursor}}` or similar) — useful for editor UX but requires editor-side support beyond the materialization layer; deferred.
- **Recurring schedule / "open today's note" command** — separable feature, future spec.
