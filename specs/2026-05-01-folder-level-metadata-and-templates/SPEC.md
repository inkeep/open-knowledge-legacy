---
title: "Folder-Level Metadata and Templates — Sparse Nested .ok/ Directories"
status: Draft
owner(s): Tim (founder)
created: 2026-05-01
updated: 2026-05-01
baseline_commit: 27303879
---
# Folder-Level Metadata and Templates — Spec

**Status:** Draft (clean rewrite — describes destination, not migration)
**Owner(s):** Tim (founder)
**Last updated:** 2026-05-01

> **One-line.** Introduce **opt-in sparse nested `.ok/` directories** that carry per-folder `frontmatter.yml` defaults and per-folder `templates/` assets. Templates are first-class — selectable by name as a `write_document({ template })` argument. Replaces today's root `folders[]` mechanism; supersedes NG10 [NEVER] in [config-edit-paths](../2026-04-25-config-edit-paths/SPEC.md).

---

## 0. In plain English

**The problem.** Making a new doc is slow because you have to remember the right tags, title shape, and structure every time. The only way today to declare "all docs in this folder should look like X" is one giant root config file (`.ok/config.yml` `folders[]`), and there's no concept of *templates* — starter shapes the agent can pick from when creating a new doc.

**The fix.** Let any folder optionally carry its own little hidden `.ok/` directory with two things:

- **`frontmatter.yml`** — folder defaults (title, description, tags) for docs in this folder.
- **`templates/`** — markdown starter shapes the agent picks from when creating a new doc.

Most folders won't have a nested `.ok/`. Folders that need something get one. The directory is auto-created on first write and auto-cleaned when emptied.

**What an agent does.**

```
You: "Make me meeting prep notes for tomorrow's roadmap sync."
Agent: list_documents("meetings/")    → sees `templates_available: [prep-notes, post-notes]`
Agent: write_document({               → instantiates the prep-notes template
  docName: "meetings/2026-05-02-roadmap-sync",
  template: "prep-notes",
})
```

The doc lands with the right title, headings, and tags — the agent didn't invent any of it.

**Three places things can be edited.**

| Who                | Folder defaults                           | Templates                                             |
| ------------------ | ----------------------------------------- | ----------------------------------------------------- |
| Agent              | `set_folder_rule({ ... })`                | `write_template({ folder, name, body, frontmatter })` |
| Human in IDE       | Open `<folder>/.ok/frontmatter.yml`, save | Open `<folder>/.ok/templates/foo.md`, save            |
| Human in editor UI | — Future Work —                           | — Future Work —                                       |

**`.ok/` is gitignored.** Per-machine local agent operating context. Templates and folder defaults don't sync via git. (D18.)

The rest of this document is the formal version.

---

## 1. Problem

Two needs at folder granularity:

1. **Frontmatter defaults** — declare "documents in this folder get these tags / this title shape / this description" without per-file duplication.
2. **Templates** — markdown skeletons agents (and humans) instantiate for known doc shapes (meeting prep, research log, weekly review). The skeleton starts with the right frontmatter, headings, and tags so the agent is operating in the right context from byte zero.

Today the root `folders[]` glob array in `.ok/config.yml` partially handles (1) and there's no answer for (2). This spec replaces both with a single mechanism.

## 2. What's there today (background context)

Full trace: [`reports/folder-config-current-state/REPORT.md`](../../reports/folder-config-current-state/REPORT.md). Brief recap:

- **Per-project state directory:** `.ok/` (`OK_DIR = '.ok'` in `packages/core/src/constants/ok-dir.ts`).
- **Path scoping:** `.okignore` at project root, gitignore syntax, nested `.okignore` honored at any depth.
- **`content.dir`** remains in `.ok/config.yml`.
- **Folder rules:** `folders[]` array in `.ok/config.yml`, edited via `set_folder_rule` MCP tool. Cascade via picomatch with `{ dot: true }`. **This mechanism is being replaced — see §6.1.**
- **Read merge:** `enrichPath` in `packages/cli/src/content/enrichment.ts` calls `resolveFolderFrontmatter`. Every read tool (`read_document`, `list_documents`, `exec("ls X")`, `search`) goes through this single helper.
- **`BUILTIN_SKIP_DIRS`:** `.ok/` is a member, but `isDirExcluded` only checks the top path segment — nested `.ok/` slips through. **FR-CF1 fixes this.**

## 3. Proposed mechanism — sparse nested `.ok/`

A `.ok/` directory MAY exist inside any folder under `content.dir`. It exists **only when needed** — never auto-scaffolded, never empty.

```
content-root/
├── .ok/                                  ← project root .ok/ (config.yml, cache, etc.)
│   ├── config.yml
│   └── ...
├── .okignore                             ← project-root path scoping
├── meetings/
│   ├── .ok/                              ← opt-in folder-scoped metadata dir
│   │   ├── frontmatter.yml               ← folder-scoped frontmatter defaults
│   │   └── templates/
│   │       ├── prep-notes.md
│   │       └── post-notes.md
│   ├── prep-notes/
│   │   └── .ok/                          ← exists: declares its own frontmatter
│   │       └── frontmatter.yml
│   ├── post-notes/                       ← no .ok/ — declares nothing
│   │   └── 2026-05-01-team-sync.md
│   └── 2026-04-30-roadmap.md
└── research/                             ← no .ok/ — declares nothing
    └── auth-providers.md
```

**Properties:**

- **Sparse / opt-in.** Most folders have no nested `.ok/`. A folder gets one only when it declares frontmatter defaults or carries templates.
- **Lazy lifecycle.** Created on first write. `ok init` does NOT scaffold them.
- **Auto-clean when empty.** Removing the last frontmatter key AND last template garbage-collects the directory.
- **Bounded contents (v1).** Two members only: `frontmatter.yml`, `templates/`. Anything else is out-of-scope.
- **No reserved names** beyond the two above.
- **Hub docs (`INDEX.md`, `README.md`) carry no special status.**
- **Hidden in listings.** `.ok/` directories do NOT appear as entries in `ls` / `list_documents` / `find` output. Their CONTENTS surface as structured fields (`frontmatter_defaults`, `templates_available`) on the parent folder's enriched record.
- **Gitignored by default** (D18). Per-machine local agent operating context. Users wanting shared team templates manually adjust `.gitignore`.

## 4. Cascade and walk direction

Two distinct directions, intentionally:

### 4.1 Frontmatter cascade — root → leaf, leaf wins

`frontmatter.yml` defaults compose top-down:

1. Walk from content root toward the target doc's folder.
2. At each level, if `<level>/.ok/frontmatter.yml` exists, apply its defaults.
3. Merge the file's own frontmatter (file wins per scalar).

Cascade rule for keys: **last-match-wins / replace** (D6). Tags follow the same rule (replace, not union). Tags primarily originate from templates at create time; cascade is for read-time enrichment of existing docs.

**Why root→leaf:** frontmatter is *inheritance*. The most-specific declaration (the leaf) overrides the more-general (the root).

### 4.2 Templates aggregation — leaf → root walk-up + bounded descent

`templates_available` from `list_documents(folder)` collects templates by:

1. **Walking from the target folder UP toward content root.** Templates from ancestors are inherited and freely usable in the target folder.
2. **Optionally descending N levels into subfolders** when the caller passes `depth: N` (D15 — see §5.1). Templates from descendants are surfaced for visibility but flagged with `scope: "descendant"`.

Scope rule:

```
A template at <X>/.ok/templates/foo.md is visible when you list <X> or any descendant of <X>.
NOT visible when listing an ancestor (unless depth includes <X>) or a sibling.
```

On filename collision within the inheritance chain, closest-wins.

**Why leaf→root walk-up:** templates are a *menu*, not an inheritance chain. The agent wants to see all available shapes — leaf templates plus inherited ones from ancestors.

The asymmetry (frontmatter root→leaf, templates leaf→root) is intentional: inheritance has direction (specific overrides general); a menu doesn't.

## 5. Read API — `list_documents(folder)` merged view

### 5.1 `depth` parameter (find -maxdepth semantics)

`list_documents(folder, { depth: N })` controls how far DOWN the listing descends, mirroring `find -maxdepth N`:

| Depth         | Behavior                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `1` (default) | THIS folder's `frontmatter_defaults` + `templates_available` (walk-up always shown) + immediate children listed    |
| `2`           | Above, PLUS each direct subfolder's `frontmatter_defaults` + their local templates (flagged `scope: "descendant"`) |
| `N`           | Recursively N levels deep                                                                                          |
| `Infinity`    | Full subtree                                                                                                       |

Walk-up ancestors ALWAYS show regardless of depth. Depth only controls how far DOWN we descend.

`exec("find <folder> -maxdepth N")` already returns enriched paths today; with nested `.ok/frontmatter.yml` in the picture, the enrichment layer surfaces merged folder-frontmatter for each visited folder.

### 5.2 Structured response fields

Every folder's enriched record gains:

- **`frontmatter_defaults`** — merged-in defaults walking root→leaf.
- **`templates_available`** — array of `{ name, title, description, path, source_folder, scope }` aggregated per §4.2.

`scope` field (D19):

| Value          | Meaning                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `"local"`      | Template lives in THIS folder's `.ok/templates/`.                                                                                               |
| `"inherited"`  | Template lives in an ancestor's `.ok/templates/`. Freely usable when creating a doc here.                                                       |
| `"descendant"` | Template lives in a subfolder's `.ok/templates/`, surfaced because `depth > 1`. **Only valid when creating a doc in or below `source_folder`.** |

### 5.3 Concrete example

`list_documents("meetings/", { depth: 2 })`:

```json
{
  "path": "meetings/",
  "frontmatter_defaults": {
    "title": "Meetings",
    "description": "Meeting notes — prep, post, decisions.",
    "tags": ["meeting"]
  },
  "templates_available": [
    {
      "name": "prep-notes",
      "title": "Meeting Prep Notes",
      "description": "Use before a meeting to capture agenda, attendees, and what success looks like.",
      "path": "meetings/.ok/templates/prep-notes.md",
      "source_folder": "meetings/",
      "scope": "local"
    },
    {
      "name": "agenda",
      "title": "Detailed Agenda",
      "description": "For larger meetings — structured time-boxed agenda.",
      "path": "meetings/prep-notes/.ok/templates/agenda.md",
      "source_folder": "meetings/prep-notes/",
      "scope": "descendant"
    }
  ],
  "subfolders": [
    {
      "path": "meetings/prep-notes/",
      "frontmatter_defaults": { "title": "Prep Notes", "tags": ["meeting", "prep"] },
      "templates_available": [
        { "name": "agenda", "title": "Detailed Agenda", "scope": "local" }
      ]
    }
  ],
  "children": [...regular file listing...]
}
```

The `agenda` template appears once at `meetings/` flagged `descendant` AND once at `meetings/prep-notes/` flagged `local`. Same template, different scope label depending on viewing folder.

## 6. Write API

### 6.1 `set_folder_rule` — writes nested `frontmatter.yml`

`set_folder_rule` writes `<folder>/.ok/frontmatter.yml`. The `match` glob's leading non-glob path segments determine the target folder; trailing globs (`/**`) are stripped.

```ts
set_folder_rule({
  rules: [
    { match: "meetings/**",            frontmatter: { title: "Meetings", tags: ["meeting"] } },
    { match: "meetings/prep-notes/**", frontmatter: { title: "Prep Notes", tags: ["meeting", "prep"] } },
  ],
})
```

Resolution:

- `match: "meetings/**"` → writes `meetings/.ok/frontmatter.yml`.
- `match: "meetings/prep-notes/**"` → writes `meetings/prep-notes/.ok/frontmatter.yml`.
- Multi-folder globs that don't resolve to a single folder are rejected with a `MULTI_FOLDER_GLOB` error pointing at the cleanest fix (use multiple rules, one per folder).

Removal: same primitive, empty `frontmatter` patch — server unsets keys; auto-cleans on empty per §3.

### 6.2 `write_document` — `template` argument

```ts
write_document({
  docName: "meetings/2026-05-02-roadmap-sync",
  template: "prep-notes",       // optional; resolved against templates_available for parent folder
  position: "replace",
  markdown: "...",               // optional override; if omitted, template body is the doc body
  summary: "...",
})
```

Resolution:

1. If `template` is provided, server resolves the name against the leaf→root walk-up for the target doc's parent folder (closest-wins). If the matched template is `scope: "descendant"` for the target folder, server REJECTS with a clear error.
2. Template body becomes the starting markdown. Agent's `markdown` (if provided) is applied per `position` after instantiation.
3. Template's frontmatter is applied first, then merged with the cascade (§4.1), then with the agent's explicit frontmatter (agent wins per-scalar).

### 6.3 `write_template` (NEW) — create / update a template

```ts
write_template({
  folder: "meetings/",
  name: "prep-notes",
  body: "# {Meeting Title}\n\n**Attendees:**\n...",
  frontmatter: {
    title: "Meeting Prep Notes",                  // SHOULD be present (D16 soft contract)
    description: "Use before a meeting...",       // SHOULD be present (D16 soft contract)
    tags: ["meeting", "prep"],
  },
})
```

Behavior:

- Creates `<folder>/.ok/templates/<name>.md`. Lazy-creates `<folder>/.ok/` and `<folder>/.ok/templates/` if missing.
- Idempotent: if the template exists, it's overwritten.
- Validates frontmatter is parseable YAML and body is parseable markdown.
- Emits a structured warning (NOT an error) when `frontmatter.title` or `frontmatter.description` is missing.

### 6.4 `delete_template` (NEW) — remove a template

```ts
delete_template({ folder: "meetings/", name: "prep-notes" })
```

Behavior:

- Deletes `<folder>/.ok/templates/<name>.md`.
- If `<folder>/.ok/templates/` is now empty, removes the directory.
- If `<folder>/.ok/` is now empty, removes the directory (auto-clean per §3).
- Idempotent: deleting a non-existent template returns success.

### 6.5 No other new MCP surface

No `update_frontmatter` (would collide with parked `frontmatter_patch`). No `list_templates` (covered by `list_documents` + `depth`).

## 7. Templates

### 7.1 Anatomy

- **Live at** `<folder>/.ok/templates/<name>.md`. Plain markdown with optional YAML frontmatter.
- **No templating engine in v1** (D5). No `${var}` substitution. Placeholder text in the body (`{Meeting Title}`) is LITERAL — the agent edits it after instantiation.
- **Discoverable** via `list_documents` `templates_available` (per §5).
- **Selectable** via `write_document({ template })`.
- **Aggregated** leaf→root walk-up for inheritance, optionally descended via `depth` parameter (§4.2).
- **Tags primarily live on templates** (D6): when an agent picks a template, the template's tags become the doc's tags. Folder `frontmatter.yml`'s `tags` cascade by simple replace and is meant for read-time enrichment of existing docs — NOT as a tag source for new ones.

### 7.2 Metadata convention (D16 — soft contract)

Templates SHOULD carry `title` + `description` in their frontmatter. These power the agent's pick decision in `templates_available`.

```markdown
---
title: Meeting Prep Notes
description: Use before a meeting to capture agenda, attendees, and what success looks like.
tags: [meeting, prep]
---
# {Meeting Title}

**Attendees:** 
**Date:** 
**Goal:** 
...
```

A template missing `title` or `description` is FUNCTIONAL but undermines the menu UX. Both `write_template` (§6.3) and `list_documents` warn on absence (structured warning in tool output, not a hard error).

### 7.3 End-to-end walkthrough

A complete trace of a template's life.

#### Step 1 — Authoring

Agent calls:

```ts
write_template({
  folder: "meetings/",
  name: "prep-notes",
  body: "# {Meeting Title}\n\n**Attendees:** \n**Date:** \n**Goal:** \n\n## Agenda\n- \n\n## Pre-read\n- \n",
  frontmatter: {
    title: "Meeting Prep Notes",
    description: "Use before a meeting to capture agenda, attendees, and what success looks like.",
    tags: ["meeting", "prep"],
  },
})
```

Server creates `meetings/.ok/templates/prep-notes.md`:

```markdown
---
title: Meeting Prep Notes
description: Use before a meeting to capture agenda, attendees, and what success looks like.
tags: [meeting, prep]
---
# {Meeting Title}

**Attendees:** 
**Date:** 
**Goal:** 

## Agenda
- 

## Pre-read
- 
```

If `meetings/.ok/` doesn't exist yet, server creates it. If `templates/` doesn't exist yet, server creates it. The file watcher picks up the new file; subsequent `list_documents` calls see it.

#### Step 2 — Discovery

A different agent (or the same one later) wants to create a meeting doc and calls `list_documents("meetings/")`. The response carries:

```json
"templates_available": [
  {
    "name": "prep-notes",
    "title": "Meeting Prep Notes",
    "description": "Use before a meeting to capture agenda, attendees, and what success looks like.",
    "scope": "local",
    "source_folder": "meetings/",
    "path": "meetings/.ok/templates/prep-notes.md"
  }
]
```

The agent reads `title` + `description`, decides "this is the right shape." That's why those fields matter — without them the agent has only the filename to go on.

#### Step 3 — Instantiation

```ts
write_document({
  docName: "meetings/2026-05-02-roadmap-sync",
  template: "prep-notes",
  position: "replace",
})
```

Server resolution:

1. Look up `prep-notes` in `templates_available` for the target's parent folder (`meetings/`). Found.
2. Read `meetings/.ok/templates/prep-notes.md`. Get its frontmatter + body.
3. Assemble the new doc's frontmatter: template frontmatter + folder cascade (`meetings/.ok/frontmatter.yml`) + agent's explicit overrides if any. Agent wins per-scalar; template-tags overlay onto folder-tags; file frontmatter (none yet) wins last.
4. Write the result to `meetings/2026-05-02-roadmap-sync.md`.

#### Step 4 — The doc lands

`meetings/2026-05-02-roadmap-sync.md`:

```markdown
---
title: Meeting Prep Notes
description: Use before a meeting to capture agenda, attendees, and what success looks like.
tags: [meeting, prep]
---
# {Meeting Title}

**Attendees:** 
**Date:** 
**Goal:** 

## Agenda
- 

## Pre-read
- 
```

The placeholders (`{Meeting Title}`, blank `**Attendees:**`) are LITERAL — there's no engine substituting them. The agent fills them in afterward via normal `edit_document` calls.

#### Why no engine

We deliberately don't have `${date}` or `${user}` substitution. The agent already knows today's date and who's calling — it just edits the doc after instantiation. Less machinery, less to teach, no DSL to debug, no failure modes from missing variables.

> **Research note (TODO before locking v2):** confirm Obsidian Templater variable model + Notion DB template behavior so a future substitution layer doesn't paint into a corner. Out-of-scope for v1.

## 8. NG10 supersession

This spec **supersedes NG10 [NEVER]** in [config-edit-paths SPEC](../2026-04-25-config-edit-paths/SPEC.md) §3. NG10 forbade per-folder metadata sidecars and asserted `folders[]` was the sole source of truth.

**What changed:**

1. **Templates are a new use case** that NG10 didn't anticipate. Templates are folder-scoped *assets* (markdown files with their own content), not just defaults. A single root `.ok/templates/` either loses folder-context or forces folder names into filenames — worse design than colocation.
2. **`folders[]` cascade is brittle at scale.** Single-root cascade rules become a merge-conflict hotspot as the KB grows.
3. **Folder rename / move portability.** Nested `.ok/` carries metadata with the folder for free.

**What of NG10 survives:**

- **No PER-DOC sidecars.** This spec introduces no `.<filename>.metadata.json`, no `_meta.json`, no `_index.md`, no `.frontmatter.yml` next to a single doc.
- **No implicit hub-doc convention.** `INDEX.md` / `README.md` carry no special status.
- **OK pollutes nothing visible.** `.ok/` is dot-prefixed AND hidden from OK's enriched listings (D16).

**The cutover.** The implementation rewrites `folders[]` use sites to read from nested `.ok/frontmatter.yml`. Existing `folders[]` entries in any user's `.ok/config.yml` get migrated as part of the implementation PR (mechanical: each entry's `match` glob resolves to a target folder, write nested file, drop the entry from `folders[]`). After cutover, the `folders[]` schema entry is removed. There is no "transitional" period in the spec.

NG10's text in config-edit-paths SPEC will need a corrigendum annotation pointing at this spec (per the CLAUDE.md "Post-ship corrigendum annotations" rule). That edit is part of implementation.

## 9. Content-filter changes — `BUILTIN_SKIP_DIRS` at any depth

**Current bug:** `isDirExcluded(relativePath)` in `packages/server/src/content-filter.ts:223` checks only `topSegment` against `BUILTIN_SKIP_DIRS`. A path like `meetings/.ok/templates/foo.md` returns `false` — nested `.ok/` content gets indexed as ordinary user content.

**Fix (FR-CF1):** check ALL path segments against `BUILTIN_SKIP_DIRS` in `isDirExcluded`. Two-line change. Also fixes the analogous case for nested `node_modules/foo/node_modules/...`, etc.

The walker (`loadNestedGitignores` line 323 already correctly checks `entry.name`) is unaffected.

Test added in same PR: `content-filter.test.ts` exercises `isDirExcluded('meetings/.ok/templates/foo.md')` returns `true`.

## 10. Interaction with existing systems

- **CRDT / Hocuspocus.** `frontmatter.yml` and `templates/*.md` are NOT CRDT-managed. Filesystem-only configuration / source assets. Reads happen at `list_documents` / `read_document` resolution time; no Y.Doc, no live sync.
- **`.gitignore`.** `.ok/` (root + nested) is gitignored by default (D18). `ok init` adds the entry.
- **File watcher.** Adding/removing `<folder>/.ok/frontmatter.yml` invalidates merged-frontmatter cache for the affected subtree. Adding/removing a `templates/*.md` invalidates `list_documents` `templates_available` for any descendant whose walk-up resolves there.
- **Folder rename / move.** Renaming a folder carries its `.ok/` with it (it's part of the folder's contents on disk).
- **Settings pane.** No change in v1. Future work could add a tab for nested-frontmatter editing AND template editing; out of scope.

## 11. Open questions

### 11.1 Structured frontmatter (JSON Schema) — defer to v2 **[RESOLVED 2026-05-01 → D20]**

Today: frontmatter is freeform YAML. *Structured frontmatter* would let a folder declare a typed schema (`status: enum[draft|review|shipped]`, `attendees: string[]`, etc.), validated on save. Notion DB property schemas do this; Obsidian Properties (v1.4+) infers types from values vault-wide but isn't strict-schema.

**Recommendation:** defer. V1 ships defaults only. V2 can add an optional `schema:` key in `frontmatter.yml`.

## 12. Non-goals (severity-tagged)

- **[NEVER]** NG-T1: Templating engine with variable substitution (`${user}`, `${date}`). The template is a starting point, not a macro. Agents reason about variable content; macros are structurally lower-leverage than letting the agent edit after instantiation.
- **[NEVER]** NG-T2: Per-doc metadata sidecars (`.<filename>.metadata.json`, `_meta.json`, etc.). NG10's anti-per-doc-clutter survives this supersession.
- **[NEVER]** NG-T3: Hub-doc-as-metadata-carrier (`INDEX.md` / `README.md` frontmatter as folder defaults). Mechanism stays in `.ok/frontmatter.yml`; hub docs are content.
- **[NEVER]** NG-T4: `.ok/` directories appearing as visible folder entries in any listing surface (`ls`, `list_documents`, `find`, sidebar). Their contents surface as structured fields on the parent folder's record.
- **[NOT NOW]** NG-T5: JSON Schema validation of frontmatter (D20). Revisit only when a concrete user demand surfaces — e.g. "every doc in meetings/ MUST have an attendees: field." Defaults-only handles \~90% of the actual work; templates handle the soft-scaffolding case.
- **[NOT NOW]** NG-T6: Settings-pane UI for editing nested `frontmatter.yml` or templates. Filesystem + MCP only in v1. Revisit when the editor grows a folder-management surface.
- **[NOT NOW]** NG-T7: Folder-scoped agent guidance (a `.ok/agents.md` or similar). Stays in CLAUDE.md / skills for v1.
- **[NOT NOW]** NG-T8: Folder-scoped `.okignore` overrides expressed in `.ok/frontmatter.yml`. Path scoping continues via nested `.okignore` files.

## 13. Decision log

| #   | Date       | Type | Decision                                                                                                                     | Rationale                                                                                                                                                                                                                                   |
| --- | ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 2026-05-01 | T    | Sparse / opt-in nested `.ok/` directories                                                                                    | Folder-rename portability + reduced merge-conflict surface; templates need a folder-scoped home that single-root can't provide                                                                                                              |
| D2  | 2026-05-01 | T    | v1 contents bounded to `frontmatter.yml` + `templates/`                                                                      | Avoid kitchen-sink directory; new members are non-breaking adds                                                                                                                                                                             |
| D3  | 2026-05-01 | T    | Lazy creation, auto-clean when empty                                                                                         | Empty `.ok/` is leaked state                                                                                                                                                                                                                |
| D4  | 2026-05-01 | P    | Hub docs (`INDEX.md`, `README.md`) get no special status                                                                     | Mechanism stands on its own                                                                                                                                                                                                                 |
| D5  | 2026-05-01 | T    | No templating engine in v1 — body-and-merge only                                                                             | Simplest thing; agents reason about variable content; defer engine until demand emerges                                                                                                                                                     |
| D6  | 2026-05-01 | T    | Tags originate from templates at create time, not from cascade. Cascade rule for all keys = simple last-wins / replace       | Agent picks template; passive cascade doesn't decide tags                                                                                                                                                                                   |
| D7  | 2026-05-01 | T    | `templates_available` aggregates leaf→root walk-up, with optional bounded descent via `depth`                                | Templates are a menu; leaf-first surfaces most-locally-relevant first                                                                                                                                                                       |
| D8  | 2026-05-01 | P    | No reserved names inside `.ok/` beyond the two v1 members                                                                    | Reserving names we don't ship invites cargo-cult                                                                                                                                                                                            |
| D9  | 2026-05-01 | T    | Template is a first-class function argument to `write_document`                                                              | Replaces `cp`-then-edit                                                                                                                                                                                                                     |
| D10 | 2026-05-01 | X    | Supersede NG10 [NEVER] in config-edit-paths SPEC                                                                             | Templates are new; cascade is brittle at scale; folder portability win                                                                                                                                                                      |
| D11 | 2026-05-01 | T    | Reuse `set_folder_rule` (existing tool) — writes nested `.ok/frontmatter.yml`. No `storage:` arg, no legacy split.           | Avoid `update_frontmatter` collision with parked `frontmatter_patch`; one tool, one storage location, no phasing complexity                                                                                                                 |
| D12 | 2026-05-01 | T    | Fix `BUILTIN_SKIP_DIRS` check to walk all path segments (FR-CF1)                                                             | Closes the indexing gap nested `.ok/` would expose; collateral fix for nested `node_modules/...`                                                                                                                                            |
| D13 | 2026-05-01 | T    | `list_documents` accepts `depth: number` (default `1`), mirroring `find -maxdepth`                                           | Agents already know `find` semantics; one parameter covers both "ls this folder" and "find templates anywhere"                                                                                                                              |
| D14 | 2026-05-01 | P    | Templates SHOULD carry `title` + `description` in frontmatter (soft contract — warning, not error)                           | Powers agent-pick decision; soft warning surfaces convention without blocking                                                                                                                                                               |
| D15 | 2026-05-01 | T    | New MCP tools `write_template` and `delete_template` for template lifecycle                                                  | No existing tool fits — templates are filesystem-only, not CRDT docs                                                                                                                                                                        |
| D16 | 2026-05-01 | P    | `.ok/` directories hidden from default listings (`ls`, `list_documents`, `find`). Contents surface as structured fields      | Treat `.ok/` as plumbing; eliminate clutter                                                                                                                                                                                                 |
| D17 | 2026-05-01 | T    | `templates_available` entries carry a `scope` field: `"local" \| "inherited" \| "descendant"`                                | Critical for agent pick correctness — prevents picking descendant-scoped template at parent folder                                                                                                                                          |
| D18 | 2026-05-01 | P    | `.ok/` gitignored by default                                                                                                 | Per-machine local agent operating context; users wanting shared templates manually adjust `.gitignore`                                                                                                                                      |
| D19 | 2026-05-01 | X    | No phasing / legacy convergence story. Spec describes destination; implementation cuts over `folders[]` to nested in one PR. | "Ignore legacy stuff — we are actively designing this project" (Tim, 2026-05-01)                                                                                                                                                            |
| D20 | 2026-05-01 | X    | Defer JSON Schema validation of frontmatter to v2 (resolves 11.1)                                                            | Obsidian Properties is type-inference, not schema; Notion DB schemas are typed but not filesystem-backed. Defaults + templates handle \~90% of need. Non-breaking to add `schema:` key in v2 when a user actually asks for hard validation. |

## 14. Functional requirements

| Priority | ID     | Requirement                                                                                                                                                                                             | Acceptance                                                                        |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Must     | FR1    | `<folder>/.ok/` directories supported as opt-in metadata carriers, sparse, lazy-create, auto-clean                                                                                                      | Integration test: create + delete cycle leaves no empty `.ok/`                    |
| Must     | FR2    | `<folder>/.ok/frontmatter.yml` cascades root→leaf, last-wins per key                                                                                                                                    | Cascade unit tests                                                                |
| Must     | FR3    | `<folder>/.ok/templates/*.md` aggregates leaf→root, closest-wins on filename collision                                                                                                                  | Aggregation + collision unit tests                                                |
| Must     | FR4    | `list_documents(folder)` returns `frontmatter_defaults` + `templates_available` per §5                                                                                                                  | Tool integration test                                                             |
| Must     | FR5    | `write_document({ template })` resolves name via aggregation, instantiates body + frontmatter; rejects `descendant`-scoped templates for the target folder                                              | Tool integration test, including descendant-rejection case                        |
| Must     | FR6    | `set_folder_rule` writes nested `<folder>/.ok/frontmatter.yml`. Multi-folder globs rejected with `MULTI_FOLDER_GLOB`                                                                                    | Tool integration test                                                             |
| Must     | FR-CF1 | `isDirExcluded` checks ALL path segments against `BUILTIN_SKIP_DIRS`, not just topSegment                                                                                                               | `content-filter.test.ts`: nested `.ok/` excluded; nested `node_modules/` excluded |
| Must     | FR7    | NG10 in `specs/2026-04-25-config-edit-paths/SPEC.md` gets a corrigendum annotation pointing here                                                                                                        | Manual review                                                                     |
| Must     | FR8    | `folders[]` removed from `ConfigSchema`. `set_folder_rule` reads existing `folders[]` from any project's `.ok/config.yml` once and rewrites as nested files (mechanical migration in implementation PR) | Schema field-registry test; migration integration test                            |
| Must     | FR9    | `list_documents` accepts `depth: number` (default `1`); `subfolders[]` populated up to N levels                                                                                                         | Depth-2 integration test                                                          |
| Must     | FR10   | `templates_available` entries carry `scope: "local" \| "inherited" \| "descendant"`                                                                                                                     | Tool integration test                                                             |
| Must     | FR11   | `write_template({ folder, name, body, frontmatter })` MCP tool — lazy-creates `.ok/templates/`, idempotent, structured warning on missing `title`/`description`                                         | Tool unit + integration tests                                                     |
| Must     | FR12   | `delete_template({ folder, name })` MCP tool — removes template, auto-cleans empty `templates/` and `.ok/`                                                                                              | Tool unit + integration tests                                                     |
| Must     | FR13   | `.ok/` directories do NOT appear as entries in `ls` / `list_documents` / `find` output                                                                                                                  | Listing tool tests                                                                |
| Must     | FR14   | `ok init` adds `.ok/` to project `.gitignore` (D18)                                                                                                                                                     | Init drift-guard test                                                             |
| Should   | FR15   | `exec("find <folder> -maxdepth N")` returns enriched paths with merged folder-frontmatter at each visited folder                                                                                        | Find integration test                                                             |
| Should   | FR16   | CLAUDE.md STOP rule "Folder defaults live in `config.yml`'s `folders[]`" updated to reflect §8                                                                                                          | Manual review                                                                     |

## 15. Next steps

1. **Confirm D10 supersession** with config-edit-paths owners (Andrew, Nick) — this spec retroactively reverses an NEVER from a Finalized spec; one synchronous ack closes the loop.
2. **Implementation order:**
   - FR-CF1 first (content-filter fix is independently useful and unblocks nested `.ok/`).
   - FR1–FR4 + FR9 + FR10 + FR13 (read paths) before FR5 + FR6 + FR8 + FR11 + FR12 (write paths).
   - FR8 (mechanical migration) sits in the implementation PR, not a separate spec.
   - FR7 + FR16 (doc / corrigendum updates) at PR-merge time.
3. **Skill update (downstream):**
   - Replace OK skill's `folders[]`-first guidance with nested `.ok/frontmatter.yml`.
   - Add: "If creating a new doc, check `templates_available` from `list_documents` of the parent folder; pass the name as `template:` to `write_document` when a template matches."
   - Add: "If asked to add a template for a folder, use `write_template`. SHOULD set `title` + `description` in frontmatter."

## 16. Research notes (TODO before locking v2)

Per the OK skill grounding rule, ingest before citing:

- Obsidian Templater variable model (for v2 substitution decisions).
- Notion DB template behavior (for v2 substitution + typed-property decisions).
- Logseq namespace property model (for cascade-vs-namespace alternative consideration).
