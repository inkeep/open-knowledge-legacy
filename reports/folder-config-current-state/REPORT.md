---
title: "How Folder Config Works in Open Knowledge Today"
description: "Plain-English end-to-end trace of the shipped folder-rule mechanism — schema, MCP tool, cascade merge, read surfaces, HTTP/CRDT transport, Settings pane, file watcher. Reader: someone evaluating evolution paths who wants to know exactly what exists right now (baseline 30291689)."
createdAt: 2026-05-01
updatedAt: 2026-05-01
subjects:
  - Open Knowledge
topics:
  - folder rules
  - frontmatter merge
  - config.yml
  - MCP tool surface
  - 1P codebase
---
# How Folder Config Works in Open Knowledge Today

**Baseline:** commit `30291689` (post-`.open-knowledge/`→`.ok/` rename, post-config-edit-paths).
**Audience:** Tim, evaluating evolution paths.
**Goal:** trace the shipped mechanism end-to-end, in plain English, before designing what comes next.

> **TL;DR.** A `folders:` array in `.ok/config.yml` carries glob-keyed entries. Each entry says "files matching `specs/**` get tags `[spec]` and the title `Specifications`." When anyone reads a doc — via MCP, HTTP, the editor sidebar, search — a single helper called `enrichPath` merges the file's own frontmatter with the matching folder rules. Editing the rules has three paths: agents call `set_folder_rule`, the Settings pane edits a live CRDT-backed copy, and humans can hand-edit the YAML. All three converge on the same on-disk file. A chokidar watcher reloads everything when the file changes.

---

## 1. What a folder rule actually looks like

The schema is dead simple ([`packages/core/src/config/schema.ts`](../../packages/core/src/config/schema.ts)):

```yaml
# .ok/config.yml
folders:
  - match: "specs/**"
    frontmatter:
      title: Specifications
      description: Product + technical specs — scoping, decisions, and implementation plans.
      tags: [spec]

  - match: "reports/**"
    frontmatter:
      title: Research Reports
      description: Prior-art research on tech stack, architecture, competitive landscape, and related topics.
      tags: [report]
```

A rule is just `{ match: <glob>, frontmatter: { title?, description?, tags?: string[] } }`. The frontmatter shape is intentionally narrow — only those three keys are first-class today.

The repo's own `.ok/config.yml` ships eight rules: five top-level (`specs/**`, `reports/**`, `stories/**`, `projects/**`, `tech-probes/**`) plus three subtree overrides (e.g., `specs/*/evidence/**`).

The `folders:` array is **agent-settable** — agents can write to it via MCP. `content.dir`, server settings, etc. are not.

---

## 2. The end-to-end picture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EDIT (three entry points)                    │
├─────────────────────────────────────────────────────────────────────┤
│  Agent           │  Human editor       │  Human in IDE              │
│  ↓               │  ↓                  │  ↓                         │
│  set_folder_rule │  Settings pane      │  Edit .ok/config.yml       │
│  (MCP, fs-direct)│  (CRDT-backed live) │  directly                  │
│  ↓               │  ↓                  │  ↓                         │
│  applyFolder…    │  Y.Text doc →       │  chokidar fires            │
│  RulesUpsert     │  Hocuspocus         │                            │
│  ↓               │  ↓                  │  ↓                         │
│  writeConfigPatch (atomic tmp+rename, validates with Zod)           │
│  ↓                                                                  │
│  .ok/config.yml on disk                                             │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
                      (file watcher fires)
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      READ (one merge function)                      │
├─────────────────────────────────────────────────────────────────────┤
│  enrichPath(relPath, { folderRules, ... })                          │
│    → mergeFileAndFolder(fileFrontmatter, folderRules, relPath)      │
│      → resolveFolderFrontmatter(folderRules, relPath) [picomatch]   │
│        → returns { title?, description?, tags } merged with file    │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
            All consumers call enrichPath under the hood:
  list_documents · read_document · exec("ls X") · search · sidebar
```

That's the whole system. The rest of this report is just zooming into each box.

---

## 3. Reading: how the merge actually works

One function does the real work: `resolveFolderFrontmatter(rules, relPath)` in [`packages/cli/src/content/folder-rules.ts`](../../packages/cli/src/content/folder-rules.ts).

The rules:

- **Matching** uses [picomatch](https://github.com/micromatch/picomatch) with `{ dot: true }` (dotfiles match too).
- **Scalars** (`title`, `description`): walk every rule in declaration order, the **last matching** rule wins.
- **Tags**: walk every rule in declaration order, **concat** all matching tags, then **dedupe preserving first-occurrence**.

Then a thin outer step (`mergeFileAndFolder`) merges the folder result with the file's own frontmatter:

- **Scalars**: file value wins when set; folder fills in the blank.
- **Tags**: folder tags FIRST, then file tags, dedupe.

### Concrete walkthrough

Imagine you have these rules (the actual repo today):

```yaml
folders:
  - match: "specs/**"
    frontmatter:
      title: Specifications
      tags: [spec]
  - match: "specs/*/evidence/**"
    frontmatter:
      title: Spec Evidence
      tags: [evidence]
```

And this file `specs/2026-04-25-config-edit-paths/evidence/foo.md`:

```yaml
---
title: My Custom Title
tags: [draft]
---
# foo
```

What does `read_document` return?

1. `resolveFolderFrontmatter` walks both rules. Both match.
2. Title: rule 1 sets it to "Specifications", rule 2 overrides to "Spec Evidence" (last-wins). → `"Spec Evidence"`
3. Tags: concat → `[spec, evidence]`. → `[spec, evidence]`
4. `mergeFileAndFolder` then merges with the file:
   - Title: file says "My Custom Title" — file wins → `"My Custom Title"`
   - Tags: folder tags first → `[spec, evidence, draft]`

Result: `{ title: "My Custom Title", tags: [spec, evidence, draft] }`.

That's it. There's no inheritance walking from folder to subfolder — picomatch evaluates against the FULL relative path, and rules apply purely by glob match.

---

## 4. Where the merge surfaces

Every read tool funnels through `enrichPath` in [`packages/cli/src/content/enrichment.ts`](../../packages/cli/src/content/enrichment.ts). The user-facing surfaces:

| Surface                               | What it shows                                                       |
| ------------------------------------- | ------------------------------------------------------------------- |
| `read_document(<path>)`               | Single doc with merged title/description/tags + backlinks + history |
| `list_documents` / `exec("ls <dir>")` | Per-child enriched listing                                          |
| `search`                              | Per-result metadata enrichment                                      |
| Editor sidebar                        | Reads frontmatter via the same enrichment                           |
| HTTP `/api/docs/*`                    | Same thing under the hood                                           |

You never see `folders[]` directly. Consumers see merged frontmatter, period. The folder rules are invisible plumbing — which is the design intent.

---

## 5. Editing: three write paths, one file

### Path A — Agents: `set_folder_rule` MCP tool

Implementation: [`packages/cli/src/mcp/tools/set-folder-rule.ts`](../../packages/cli/src/mcp/tools/set-folder-rule.ts).

```ts
set_folder_rule({
  rules: [
    { match: "meetings/**", frontmatter: { tags: ["meeting"] } },
    { match: "meetings/prep-notes/**", frontmatter: { tags: ["prep"], title: "Prep Notes" } },
  ],
})
```

Properties worth knowing:

- **Always-array shape**, even for one rule. (Lets the same primitive cover N=1 and N=many — including the future right-click-folder UX.)
- **Transactional**. The whole batch is validated against the merged config — if any rule is invalid, NO rules get written.
- **Upsert by `match`**. Adding a rule with an existing `match` replaces the entry. Renaming a rule uses `new_match`. Removing a rule is NOT this tool — you call `set_config({ patch: { folders: [<filtered>] } })` (read-modify-write).
- **Doesn't need a running OK server.** Resolves cwd via `resolveProjectConfigContext` and writes fs-direct.

The actual write goes through `applyFolderRulesUpsert` ([`packages/core/src/config/apply-folder-rules-upsert.ts`](../../packages/core/src/config/apply-folder-rules-upsert.ts)) which builds the new `folders[]` and hands it to `writeConfigPatch` (atomic tmp+rename, full Zod validation).

### Path B — Humans: Settings pane (CRDT-live)

The Settings pane in the editor doesn't have a special folder-rules UI. It uses a generic schema-walker (`packages/app/src/components/settings/use-config-form.ts` + `schema-walker.ts`) that introspects the Zod config schema and renders fields automatically. Edits flow through a Y.Text-backed config doc (`__config__/project`) over Hocuspocus, which streams the YAML change to the server. The server validates ([`packages/server/src/config-persistence.ts`](../../packages/server/src/config-persistence.ts)) and atomically writes to disk.

This is the only "live multi-player" path — two people editing the Settings pane see each other's keystrokes. The MCP and CLI paths are headless / one-shot.

### Path C — Humans: edit `.ok/config.yml` by hand

The chokidar watcher ([`packages/server/src/config-file-watcher.ts`](../../packages/server/src/config-file-watcher.ts)) fires on save. The persistence layer reads, validates, and updates the in-memory config. The Settings pane subscribers see the change live (over Hocuspocus). Reads (next `enrichPath` call) pick up the new rules.

There's a clever loop-breaker: a per-server LKG ("last known good") cache. When the server itself just wrote the file, the watcher fires anyway, but the persistence layer notices the read content matches the LKG entry and short-circuits — no double-application.

---

## 6. The two-track write model (why it exists)

Worth its own paragraph because it's the spot most people get confused.

- **Headless writers** (MCP `set_folder_rule`, CLI `ok config`, seed): write directly to `.ok/config.yml` via `writeConfigPatch`. No CRDT, no server required.
- **Live-multi-player writer** (Settings pane): edits a Y.Text-backed config doc over Hocuspocus. The server writes to disk on validation success.

Both converge on the same on-disk file. The chokidar watcher feeds disk changes back into the live Y.Text doc so all paths stay coherent. Three layers of validation — Modal walker (L1), `writeConfigPatch` (L2), `applyConfigPersistence` server-side (L3) — provide defense-in-depth.

---

## 7. What invalidates / reloads

When `.ok/config.yml` changes:

1. **chokidar** picks up the change (`awaitWriteFinish` debounces atomic-rename writes).
2. **Persistence layer** validates + updates the in-memory LKG cache.
3. **Live Y.Text config doc** updates, which means any Settings pane sees the change.
4. **`folderRules` reload** propagates to subsequent `enrichPath` calls. (Per-doc enrichment is computed on each read — there's no long-lived per-path cache to invalidate; new rules apply immediately to the next read.)
5. **The browser editor sidebar** re-renders affected listings on the next paint cycle.

There is no per-document on-disk frontmatter rewriting. The merge is pure read-time projection.

---

## 8. What today's mechanism does NOT cover

These are the gaps that motivated the SPEC at PR #407:

- **Templates.** Folder rules carry `{ title, description, tags }` only — no concept of a "starter shape" for new docs in a folder. Agents creating new docs hand-write skeletons.
- **Other frontmatter keys.** The schema is `{ title?, description?, tags? }`. If a folder wants to suggest defaults for `status`, `owner`, or anything else, there's no machinery for it.
- **Folder-scoped agent guidance.** "Docs in `meetings/` should be terse." Lives in CLAUDE.md or skill prose; not in folder rules.
- **Per-folder schema validation.** "Every doc in `meetings/` MUST have an `attendees:` field." No mechanism.
- **Folder rename portability.** Rename a folder and its glob rules don't move with it; you edit `.ok/config.yml` to update the match string.

---

## 9. Files to read if you want to go deeper

| Concern                                       | File                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Schema (`FolderRule`, `ConfigSchema`)         | [`packages/core/src/config/schema.ts`](../../packages/core/src/config/schema.ts)                                       |
| MCP tool (`set_folder_rule`)                  | [`packages/cli/src/mcp/tools/set-folder-rule.ts`](../../packages/cli/src/mcp/tools/set-folder-rule.ts)                 |
| Upsert helper (`applyFolderRulesUpsert`)      | [`packages/core/src/config/apply-folder-rules-upsert.ts`](../../packages/core/src/config/apply-folder-rules-upsert.ts) |
| Atomic write (`writeConfigPatch`)             | `packages/core/src/config/write-config-patch.ts`                                                                       |
| Cascade resolver (`resolveFolderFrontmatter`) | [`packages/cli/src/content/folder-rules.ts`](../../packages/cli/src/content/folder-rules.ts)                           |
| File↔folder merge                             | [`packages/cli/src/content/enrichment.ts:350`](../../packages/cli/src/content/enrichment.ts)                           |
| Settings UX (no folder-specific UI)           | [`packages/app/src/components/settings/SettingsPane.tsx`](../../packages/app/src/components/settings/SettingsPane.tsx) |
| Live config transport                         | [`packages/server/src/config-persistence.ts`](../../packages/server/src/config-persistence.ts)                         |
| File watcher                                  | [`packages/server/src/config-file-watcher.ts`](../../packages/server/src/config-file-watcher.ts)                       |
| Original spec                                 | [`specs/2026-04-25-config-edit-paths/SPEC.md`](../../specs/2026-04-25-config-edit-paths/SPEC.md)                       |

---

## 10. Related research

- [`reports/config-driven-folder-frontmatter/`](../config-driven-folder-frontmatter/) — 2026-04-16 landscape report on folder-frontmatter prior art (Fumadocs, Docusaurus, Nextra, Hugo, VitePress, Starlight, Astro, Mintlify, Turborepo, Biome, Obsidian). Frames the "Shape A vs B vs C vs D" decision; the shipped system is essentially Shape A (config-first with glob rules, Biome/Turborepo lineage).
- [`reports/frontmatter-editing-ux-patterns/`](../frontmatter-editing-ux-patterns/) — UX patterns for editing frontmatter.
- [`reports/frontmatter-schema-conventions-for-agent-readable-docs/`](../frontmatter-schema-conventions-for-agent-readable-docs/) — schema conventions for agent-consumed frontmatter.

---

## 11. One-paragraph summary for handoff

Open Knowledge has a single source of truth — `folders:[]` in `.ok/config.yml` — for "default frontmatter for every file matching a glob." Three editors converge on it (an MCP tool, the editor's Settings pane, and direct YAML edit). Reads pass through one helper (`enrichPath`) that calls one matcher (`resolveFolderFrontmatter`) that walks rules in declaration order — last-wins for scalars, concat-and-dedupe for tags — and then layers the file's own frontmatter on top. There is no per-file sidecar, no nested folder-config files, and no concept of templates. The mechanism is small, well-tested, and load-bearing in \~50 dogfood docs today. Evolving it means either extending the schema (more keys per rule) or relocating the storage (out of one root YAML, into something else); either way, the read-time `enrichPath` indirection means consumers don't have to change.
