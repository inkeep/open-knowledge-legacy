---
title: "Folder-Level Metadata and Templates — Sparse Nested .open-knowledge/ Directories"
status: Draft
owner(s): Tim (founder)
created: 2026-05-01
updated: 2026-05-01
---
# Folder-Level Metadata and Templates — Spec

**Status:** Draft
**Owner(s):** Tim (founder)
**Last updated:** 2026-05-01

> **One-line.** Replace today's single-root `.open-knowledge/config.yml` `folders:[]` mechanism with **opt-in nested `.open-knowledge/` directories** that exist only when a folder declares its own frontmatter defaults or templates. Templates are first-class: agents select one by name at doc-create time.

## 1. Problem

Open Knowledge needs two things at folder granularity:

1. **Frontmatter defaults** — declare "documents in this folder get these tags / this title shape / this description" without duplicating frontmatter on every child.
2. **Templates** — markdown skeletons agents (or humans) instantiate to start a new doc of a known shape (meeting prep notes, research log, weekly review, etc.) with the right starting frontmatter, headings, and tags.

Today both rely on a single root `.open-knowledge/config.yml` (`folders:[]`). That mechanism is being **punted**: the project no longer plans to ship a global declarative config. Folder-level metadata still needs a home.

## 2. Background — what we're replacing and why

Current state ([`specs/2026-04-25-config-edit-paths/SPEC.md`](../2026-04-25-config-edit-paths/SPEC.md)):

- Root `.open-knowledge/config.yml` carries `content.{dir,include,exclude}`, `persistence.*`, and `folders:[]` (per-folder frontmatter defaults via globs).
- Cascade rules: declaration order, last-match-wins for scalars, tags concat-and-dedup, file frontmatter wins per-scalar.
- STOP rule (CLAUDE.md, [`specs/2026-04-25-config-edit-paths/SPEC.md`](../2026-04-25-config-edit-paths/SPEC.md)): **no per-doc sidecars**, no `.frontmatter.yml`, no `_meta.json`, no `_index.md`. OK state lives only in `<contentDir>/.open-knowledge/`.

Why we're moving:

- Cross-cutting global config (`content.*`, transport, etc.) is being deferred to a later phase. Without root config.yml, the `folders:[]` block has no host file.
- Single-root cascades become a merge-conflict hotspot as the KB grows — every team touching a different subtree is editing the same YAML.
- Folder rename / move / clone-a-subtree should carry the metadata for free. Root-config `folders:[]` requires manual edits to two places (the folder + the root config).

## 3. Proposed mechanism — sparse nested `.open-knowledge/`

A `.open-knowledge/` directory MAY exist inside any folder under `content.dir`. It exists **only when needed** — never auto-scaffolded, never empty.

```
content-root/
├── meetings/
│   ├── .open-knowledge/                  ← exists: declares defaults + templates
│   │   ├── frontmatter.yml
│   │   └── templates/
│   │       └── meeting-notes.md
│   ├── prep-notes/
│   │   └── .open-knowledge/              ← exists: declares its own frontmatter
│   │       └── frontmatter.yml
│   ├── post-notes/                       ← no .open-knowledge/ — folder declares nothing
│   │   └── 2026-05-01-team-sync.md
│   └── 2026-04-30-roadmap.md
└── research/                             ← no .open-knowledge/ — declares nothing
    └── auth-providers.md
```

**Locked-in properties** (decided in conversation 2026-05-01):

- **Sparse / opt-in.** Most folders have no `.open-knowledge/`. A folder gets one only when it declares frontmatter defaults or carries templates.
- **Lazy lifecycle.** `.open-knowledge/` and `frontmatter.yml` are created on first write. `ok init` does NOT scaffold them.
- **Auto-clean when empty.** When the last frontmatter key is removed AND no templates remain, the directory is garbage-collected. Empty `.open-knowledge/` is leaked state.
- **Bounded contents (v1).** Only two members are sanctioned:
  - `frontmatter.yml` — folder-scoped frontmatter defaults applied at read time.
  - `templates/` — directory of markdown templates.
    Anything else (folder-scoped agent guidance, hooks, include/exclude overrides) is out-of-scope for v1 and gets its own decision.
- **No reserved names** beyond the two above. Future members are non-breaking adds; reserving names we don't ship invites cargo-cult.
- **Hub docs (`INDEX.md`, `README.md`) carry no special status.** This mechanism does not depend on a hub-doc convention.

## 4. Read API — `ok_ls(folder)` merged view

`exec("ls <folder>")` and `read_document(<path>)` return frontmatter MERGED across the cascade:

1. Walk from content root down to the target folder.
2. At each level, if `.open-knowledge/frontmatter.yml` exists, apply its defaults.
3. Merge into per-file frontmatter (per-file always wins per-scalar — same rule as today's `folders:[]`).
4. Cascade rule for scalars and lists: **last-match-wins / replace** (see D6). Simple and predictable.

`exec("ls <folder>")` output additionally surfaces:

- **`templates_available`** — aggregated list walking from the target folder up to the content root: `{ name, description, path, source_folder }`. Closest-wins on filename collision. Aggregation gives the agent the full menu of relevant templates, not just the leaf folder's.
- **`frontmatter_defaults`** — the merged-in defaults at this folder, shown explicitly so agents can reason about what they're inheriting.

## 5. Write API — template selection as a first-class function argument

### 5.1 Doc creation: `write_document` gains a `template` param

```ts
write_document({
  docName: "meetings/2026-05-01-team-sync",
  template: "meeting-notes",       // optional: name resolved against the aggregated templates_available list
  position: "replace",
  markdown: "...",                  // optional override or augmentation; if omitted, template body is used as-is
  summary: "...",
})
```

Resolution:

1. If `template` is provided, the server resolves the name against the aggregated `templates_available` for the target doc's parent folder (closest-wins).
2. The template's body becomes the starting markdown. The agent's `markdown` field, if provided, is applied per `position` AFTER template instantiation.
3. Template's frontmatter is applied, then merged with folder frontmatter defaults, then merged with the agent's explicit frontmatter (agent wins per-scalar).

This makes templates **first-class**: the agent inspects `templates_available` from `ok_ls`, picks the right one for the doc shape, and passes the name as an argument. No `cp`-then-edit dance.

### 5.2 Folder frontmatter: `update_frontmatter(folder_path, patch)`

New MCP tool. Writes / merges into `<folder>/.open-knowledge/frontmatter.yml`.

- If `.open-knowledge/` doesn't exist → create it.
- If `frontmatter.yml` doesn't exist → create it with the patch.
- If both exist → deep-merge per cascade semantics (last-match-wins on keys; `unset` removes keys).
- After write, if the result is empty (all keys removed) → delete `frontmatter.yml`. If `templates/` is also absent → delete `.open-knowledge/`.

Patch shape: `{ set?: Record<key, value>, unset?: string[] }`.

## 6. Templates

- Live at `<folder>/.open-knowledge/templates/<name>.md`.
- Plain markdown files with optional YAML frontmatter — no templating engine in v1.
- Discoverable through `ok_ls` output (`templates_available`) and selectable as a `template` argument to `write_document`.
- **Aggregate walk-up** (D7): `templates_available` shows templates from the target folder AND all ancestors up to content root. Closest-wins on filename collision. A single "common templates" folder near the root gets inherited everywhere; a leaf folder can override by re-declaring the same filename.
- **Tags primarily live on templates** (D6): when an agent selects a template, the template's tags are applied to the new doc. Folder `frontmatter.yml`'s `tags` field cascades by simple replace (last-wins) and is meant for read-time enrichment of existing docs, not as a tag source for new ones.
- **Skill update** (downstream): the OK skill's "creating a new doc" guidance gains a step: "If a relevant template appears in `templates_available` from `ok_ls`, pass its name as the `template` arg to `write_document` instead of writing the skeleton from scratch."

**Why no engine.** Notion DB templates and Obsidian Templater both layer typed variables / scripting. We defer that — the simplest thing that could work is "markdown file the server copies into place." If demand emerges, we add a `${var}` substitution layer later.

> **Research note (TODO before locking v2):** confirm Obsidian Templater variable model + Notion DB template behavior so the v2 substitution layer doesn't paint into a corner. Sources to ingest: Obsidian Templater docs, Notion DB template docs.

## 7. Interaction with existing systems

- **CRDT / Hocuspocus.** `frontmatter.yml` and `templates/*.md` are NOT CRDT-managed. They're filesystem-only configuration / source assets. Reads happen at `exec` / `read_document` resolution time; no Y.Doc, no live sync. (If this proves wrong post-implementation — e.g., we want live multi-player editing of a folder's `frontmatter.yml` from a Settings UI — revisit.)
- **`.gitignore`.** Open question 9.1.
- **File watcher.** Adding/removing `.open-knowledge/frontmatter.yml` invalidates merged-frontmatter cache for the affected subtree. Adding/removing `templates/*.md` invalidates `ok_ls` output for any descendant folder whose `templates_available` walk-up resolves there.
- **Folder rename / move.** Renaming a folder carries its `.open-knowledge/` with it (it's part of the folder's contents on disk). Free win vs root-config `folders:[]`.

## 8. STOP rule changes

The current rule (CLAUDE.md): *"OK state lives in `<contentDir>/.open-knowledge/`; no per-doc sidecars (no `.frontmatter.yml`, `_meta.json`, `_index.md`). Folder defaults live in `config.yml`'s `folders[]`."*

Proposed amendment:

- ✓ **Keep** "no per-doc sidecars" — this spec does not introduce per-doc files.
- ✗ **Drop** "Folder defaults live in `config.yml`'s `folders[]`" — `config.yml` itself is being punted.
- ✓ **Add** "Folder defaults and templates live in `<folder>/.open-knowledge/{frontmatter.yml,templates/}` — sparse and opt-in. Empty `.open-knowledge/` directories are an error state and get auto-cleaned."

## 9. Open questions

### 9.1 Gitignored or committed?

Two coherent stances; pick one:

- **Personal / per-machine (gitignored).** `.open-knowledge/` is your local agent operating context. Templates and folder defaults don't sync across teammates or CI. Simpler model, lower coordination cost. Loses the "shared team conventions" use case.
- **Project policy (committed).** Templates and folder defaults are part of the repo, like `.editorconfig` or `.github/`. Teammates and CI agents see the same context. Standard for project-policy files. Couples them to the git workflow.

Tim's stated default in conversation: gitignored. Unresolved tension: this conflicts with "templates encode team writing conventions." Resolve before locking.

### 9.2 Structured frontmatter (JSON Schema) — defer to v2?

Plain framing: today, frontmatter is freeform YAML — any keys, any types. **Structured frontmatter** would let a folder declare a *schema* describing what fields its child docs must have, with types and validation. Example:

```yaml
# meetings/.open-knowledge/frontmatter.yml (with schema, hypothetical v2)
defaults:
  tags: [meeting]
schema:
  required: [attendees, date]
  properties:
    attendees: { type: array, items: { type: string } }
    date: { type: string, format: date }
    status: { enum: [scheduled, complete, cancelled] }
```

The schema would: validate frontmatter on save, auto-complete in the Settings UI / source-mode editor, surface type errors. Notion DB property schemas do this; Obsidian Properties (v1.4+) infers types from values across the vault but isn't strict-schema.

V1 ships **defaults only** — no schema, no validation. V2 could add an optional `schema:` key if demand emerges.

**Recommendation:** defer. Don't out-Obsidian Obsidian on day one. Confirm or push back.

### 9.3 Where do `content.dir` / `content.include` / `content.exclude` go after config.yml is punted?

Plain framing: punting `config.yml` removes the home for **global** settings — "what counts as a knowledge-base file in this project" (which directories, which extensions), transport settings (port, persistence cadence), etc. This spec covers **folder-level** metadata; it doesn't replace those globals.

Out-of-scope for THIS spec. Flagging adjacent so we don't pretend the gap doesn't exist. Likely answers: hardcoded conventions (`**/*.md` + `**/*.mdx` under repo root, ignore `.git`/`node_modules`) + CLI flags for overrides; or a separate, narrower config file just for globals; or env vars. Decision needed before / alongside this spec lands.

**Recommendation:** if you want, drop this section from the spec entirely — it's tangential. I left it because the punt is fresh and the gap shouldn't get lost. Confirm and I'll cut it.

## 10. Non-goals (v1)

- **Templating engine** with variable substitution (`${user}`, `${date}`). Markdown-file-and-copy only.
- **JSON Schema validation** of frontmatter (see 9.2).
- **Multi-player editing** of `frontmatter.yml` from a Settings UI. Filesystem-only.
- **Folder-scoped agent guidance / instructions.** Stays in CLAUDE.md / skills for v1.
- **Folder-scoped `include` / `exclude` overrides.** Pending the global config-replacement story (see 9.3).
- **Migration tool from `folders:[]`.** Punted with the rest of `config.yml`.

## 11. Decision log

| #  | Date       | Decision                                                                                                                                    | Rationale                                                                                                                                    |
| -- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 | 2026-05-01 | Sparse / opt-in nested `.open-knowledge/` directories, not single-root cascade                                                              | Root config.yml is being punted; nested model gives folder-rename portability + reduces merge-conflict surface                               |
| D2 | 2026-05-01 | v1 contents bounded to `frontmatter.yml` + `templates/`                                                                                     | Avoid kitchen-sink directory; new members are non-breaking adds                                                                              |
| D3 | 2026-05-01 | Lazy creation, auto-clean when empty                                                                                                        | An empty `.open-knowledge/` is leaked state and confuses non-OK users browsing the repo                                                      |
| D4 | 2026-05-01 | Hub docs (`INDEX.md`, `README.md`) get no special status                                                                                    | Mechanism stands on its own; doesn't depend on hub-doc convention                                                                            |
| D5 | 2026-05-01 | No templating engine in v1                                                                                                                  | Simplest thing; defer engine until demand emerges                                                                                            |
| D6 | 2026-05-01 | Tags originate from templates at create time, not from cascade. Cascade rule for `frontmatter.yml` (all keys) is simple last-wins / replace | The contextual decision "what tags should this doc have" belongs to the agent picking a template, not to a passive cascade                   |
| D7 | 2026-05-01 | `templates_available` aggregates across the walk-up to content root, closest-wins on collision                                              | Maximizes agent visibility into available shapes; collision resolution stays predictable                                                     |
| D8 | 2026-05-01 | No reserved names inside `.open-knowledge/` beyond `frontmatter.yml` + `templates/`                                                         | Reserving names we don't ship invites cargo-cult; future adds are non-breaking                                                               |
| D9 | 2026-05-01 | Template is a first-class function argument to `write_document` (`template: string`)                                                        | Replaces the `cp`-then-edit dance with a typed selection; the agent reasons over `templates_available` and hands the name to the create call |

## 12. Next steps

1. Resolve open questions 9.1, 9.2, 9.3 with Tim before implementation.
2. Research notes (per Grounding rule, ingest before locking v2 work): Obsidian Templater variable model; Notion DB template behavior; Logseq namespace properties.
3. Prototype the **read path** first — `ok_ls(folder)` returning merged frontmatter + aggregated `templates_available`. No writes until the read story is solid.
4. Add the `template` argument to `write_document` once read is stable.
5. Skill update — extend OK skill with:
   - "If creating a new doc, check `templates_available` from `ok_ls` of the parent folder; pass the name as `template:` to `write_document` if a template matches."
   - Replace today's `folders:[]` guidance with the nested mechanism.
6. CLAUDE.md STOP-rule amendment per §8.
