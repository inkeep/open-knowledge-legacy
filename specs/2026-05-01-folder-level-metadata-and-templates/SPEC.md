---
title: "Folder-Level Metadata and Templates — Sparse Nested .ok/ Directories"
status: Draft
owner(s): Tim (founder)
created: 2026-05-01
updated: 2026-05-01
baseline_commit: 30291689
---
# Folder-Level Metadata and Templates — Spec

**Status:** Draft (rewritten 2026-05-01 against `30291689` post-`.open-knowledge/`→`.ok/` rename)
**Owner(s):** Tim (founder)
**Last updated:** 2026-05-01

> **One-line.** Introduce **opt-in sparse nested `.ok/` directories** that carry per-folder `frontmatter.yml` defaults and per-folder `templates/` assets. Templates are first-class — selectable by name as a `write_document({ template })` argument. **Explicitly supersedes NG10 [NEVER] in [config-edit-paths](../2026-04-25-config-edit-paths/SPEC.md)**; defines a coexistence/convergence path against the shipped `folders[]` mechanism in `.ok/config.yml`.

## 1. Problem

Two needs at folder granularity:

1. **Frontmatter defaults** — declare "documents in this folder get these tags / this title shape / this description" without per-file duplication.
2. **Templates** — markdown skeletons agents (and humans) instantiate for known doc shapes (meeting prep, research log, weekly review). The skeleton starts with the right frontmatter, headings, and tags so the agent is operating in the right context from byte zero.

Today (post-rename, baseline `30291689`):

- (1) is solved by `folders[]` in `.ok/config.yml`, edited via the `set_folder_rule` MCP tool ([config-edit-paths SPEC](../2026-04-25-config-edit-paths/SPEC.md) D38). NG10 [NEVER] explicitly forbids "OK-managed metadata files anywhere in the user's content tree outside `<contentDir>/.ok/**`."
- (2) is unsolved. There is no Templates feature today. Agents creating new docs hand-write the skeleton each time, and the per-folder voice/shape lives only in CLAUDE.md and skill prose.

**Why revisit (1) instead of just adding (2):** the user direction in conversation 2026-05-01 is to phase out the root `.ok/config.yml` over time. If folder rules continue to live only in that file, they'll need to relocate when the punt happens. Designing the relocation now — and giving templates a colocated home alongside it — is cheaper than two consecutive moves.

This is a strategic spec: the destination is sparse nested `.ok/` directories that travel with their folder. The convergence path against today's `folders[]` is part of scope.

## 2. Current state (baseline `30291689`)

What the merged main actually carries:

- **Per-project state directory: `.ok/`** (renamed from `.open-knowledge/` per [PR #401 / rename spec](../2026-04-30-ok-dir-rename-and-okignore/SPEC.md)). Holds `config.yml`, `server.lock`, `cache/`, etc. `OK_DIR = '.ok'` constant in `packages/core/src/constants/ok-dir.ts`.
- **Path scoping: `.okignore`** at project root (gitignore syntax, `ignore` library, nested `.okignore` honored at any folder depth — mirrors `.gitignore`'s nested mechanic). Replaces the removed `content.include` / `content.exclude` config keys (rename spec G3, NG3 [NEVER]).
- **`content.dir` remains** in `.ok/config.yml` (rename spec D12) — names the root of content, not a pattern.
- **Folder rules: `folders[]`** in `.ok/config.yml` carries per-folder frontmatter defaults via globs. Cascade: declaration order, last-match-wins for scalars, tags concat-and-dedup, file frontmatter wins per-scalar. MCP edit surface: `set_folder_rule` (config-edit-paths SPEC D38). HTTP: `POST /api/config/folders/upsert`. Removal goes via `set_config({ patch: { folders: [<filtered>] } })`.
- **NG10 [NEVER]** ([config-edit-paths SPEC](../2026-04-25-config-edit-paths/SPEC.md) §3): "Writing OK-managed metadata files anywhere in the user's content tree outside `<contentDir>/.ok/**`. No per-folder `.frontmatter.yml` sidecars; no per-doc `.<filename>.metadata.json` companions; no implicit `_meta.json` / `_index.md`. Folder defaults live in `config.yml`'s `folders[]` array — sole source of truth. **Per-machine principle: OK pollutes nothing in user content.**"
- **`BUILTIN_SKIP_DIRS`** in `packages/server/src/content-filter.ts:53` — `'.ok'` is a member (rename spec D9, FR14). The walker skips `'.ok'` at any directory descent (`entry.name === '.ok' → continue`). However, `isDirExcluded(relativePath)` checks ONLY the top path segment (line 223: `BUILTIN_SKIP_DIRS.has(topSegment)`), so a path like `meetings/.ok/templates/foo.md` returns `false` from `isDirExcluded` — the file watcher treats nested `.ok/` content as ordinary content. **This is the indexing gap that nested templates would expose; FR-CF1 fixes it.**
- **Per-document MCP tools that touch frontmatter:** `edit_document` (general edit; rejects find/replace intersecting frontmatter); `frontmatter_patch` (parked — its HTTP transport was removed; see `tools/index.ts:37,245`). No `update_frontmatter` symbol exists today as a per-doc tool, but the slot is conceptually claimed by the per-doc `frontmatter_patch` lineage; folder-level should not reuse the bare `update_frontmatter` name.

## 3. Proposed mechanism — sparse nested `.ok/`

A `.ok/` directory MAY exist inside any folder under `content.dir`. It exists **only when needed** — never auto-scaffolded, never empty.

```
content-root/
├── .ok/                                  ← project root .ok/ (config.yml, cache, etc.) — SHIPPED
│   ├── config.yml
│   └── ...
├── .okignore                             ← project-root path scoping — SHIPPED
├── meetings/
│   ├── .ok/                              ← NEW: opt-in folder-scoped metadata dir
│   │   ├── frontmatter.yml               ← folder-scoped frontmatter defaults
│   │   └── templates/
│   │       └── meeting-notes.md
│   ├── prep-notes/
│   │   └── .ok/                          ← exists: declares its own frontmatter
│   │       └── frontmatter.yml
│   ├── post-notes/                       ← no .ok/ — declares nothing
│   │   └── 2026-05-01-team-sync.md
│   └── 2026-04-30-roadmap.md
└── research/                             ← no .ok/ — declares nothing
    └── auth-providers.md
```

**Properties (locked in conversation 2026-05-01, D1–D9):**

- **Sparse / opt-in.** Most folders have no nested `.ok/`. A folder gets one only when it declares frontmatter defaults or carries templates.
- **Lazy lifecycle.** Created on first write. `ok init` does NOT scaffold them.
- **Auto-clean when empty.** Removing the last frontmatter key AND last template garbage-collects the directory. Empty `.ok/` is leaked state.
- **Bounded contents (v1).** Two members only: `frontmatter.yml`, `templates/`. Anything else (folder-scoped agent guidance, hooks, schema validation) is out-of-scope.
- **No reserved names** beyond the two above.
- **Hub docs (`INDEX.md`, `README.md`) carry no special status.**

## 4. Cascade and walk direction

Two distinct directions, intentionally:

### 4.1 Frontmatter cascade — root → leaf, leaf wins

`frontmatter.yml` defaults compose top-down:

1. Walk from content root toward the target doc's folder.
2. At each level, if `<level>/.ok/frontmatter.yml` exists, apply its defaults.
3. Then merge the file's own frontmatter (file wins per scalar — same rule as today's `folders[]`).

Cascade rule for keys: **last-match-wins / replace** (D6). Tags follow the same rule (replace, not union). The contextual decision "what tags should this doc have" is delegated to template selection at create time; cascade is for read-time enrichment of existing docs.

**Why root→leaf:** frontmatter is *inheritance*. The most-specific declaration (the leaf) overrides the more-general (the root). Standard inheritance direction.

### 4.2 Templates aggregation — leaf → root, closest wins on collision

`templates_available` from `list_documents(folder)` collects templates by walking from the target folder UP toward content root:

1. Start at the target folder.
2. Walk upward, collecting `<level>/.ok/templates/*.md` at each step.
3. On filename collision, the closest folder wins (leaf-most).

**Why leaf→root:** templates are a *menu*, not an inheritance chain. The agent wants to see all available shapes — leaf templates plus inherited ones from ancestors. Leaf-first iteration order surfaces the most-locally-relevant templates first; closest-wins on collision keeps overrides predictable.

The asymmetry is intentional: inheritance has direction (specific overrides general); a menu doesn't (you want all options visible, leaf-first).

## 5. Read API — `list_documents(folder)` merged view

Existing tool (`list_documents`) gains structured fields:

- `frontmatter_defaults` — merged-in defaults at this folder, walking root→leaf, shown explicitly so agents can reason about what they're inheriting.
- `templates_available` — array of `{ name, description, path, source_folder }` aggregated leaf→root, closest-wins on collision.

`read_document(<path>)` and `exec("ls <folder>")` already return per-file enriched frontmatter; that path now sources its defaults from the cascade in §4.1 instead of (or alongside, during convergence — §9) the shipped `folders[]`.

**Note for reviewers:** an earlier draft of this spec referenced a phantom `ok_ls` tool. The canonical name is `list_documents`. `exec("ls <folder>")` is the convenient enriched listing surface and uses the same merge.

## 6. Write API

### 6.1 `set_folder_rule` (existing) — extended to write nested `frontmatter.yml`

`set_folder_rule` is the canonical tool today; it writes `folders[]` in `.ok/config.yml`. We extend it to ALSO be able to write to a nested `<folder>/.ok/frontmatter.yml` instead. Selection is a tool argument, not a name change:

```ts
set_folder_rule({
  match: "meetings/**",
  frontmatter: { tags: ["meeting"] },
  storage: "nested" | "config-folders",   // new arg, default per migration phase (§9)
})
```

This avoids the reviewer-flagged `update_frontmatter` naming collision with the parked per-doc `frontmatter_patch` tool, and it keeps the user's right-click-folder UX (D38 in config-edit-paths) on a single primitive across both storage backends.

Removal of a nested `frontmatter.yml`: same primitive, empty patch — server unsets keys; auto-cleans on empty per §3.

### 6.2 `write_document` — `template` argument

```ts
write_document({
  docName: "meetings/2026-05-01-team-sync",
  template: "meeting-notes",       // optional; resolved against templates_available for parent folder
  position: "replace",
  markdown: "...",                  // optional; if omitted, template body is the doc body
  summary: "...",
})
```

Resolution:

1. If `template` is provided, server resolves the name against the leaf→root walk-up for the target doc's parent folder (closest-wins).
2. Template body becomes the starting markdown. Agent's `markdown` (if provided) is applied per `position` after instantiation.
3. Template's frontmatter is applied first, then merged with the cascade (§4.1), then with the agent's explicit frontmatter (agent wins per-scalar — same rule as everywhere else).

Templates are first-class: the agent inspects `templates_available` from `list_documents`, picks one, hands the name as an argument. No `cp`-then-edit dance.

### 6.3 New MCP tool surface — none beyond §6.1/§6.2

No `update_frontmatter` tool, no `list_templates` tool. Templates are discoverable via the existing `list_documents` and instantiable via the existing `write_document`. The folder-rule tool (`set_folder_rule`) is reused.

## 7. Templates

- **Live at** `<folder>/.ok/templates/<name>.md`. Plain markdown with optional YAML frontmatter.
- **No templating engine in v1** (D5). No `${var}` substitution. The agent reasons about variable content; the template is a starting point, not a macro.
- **Discoverable** via `list_documents` `templates_available`.
- **Selectable** via `write_document({ template })`.
- **Aggregated** leaf→root walk-up (§4.2, D7).
- **Tags primarily live on templates** (D6): when an agent picks a template, the template's tags become the doc's tags. Folder `frontmatter.yml`'s `tags` field cascades by simple replace and is meant for read-time enrichment of existing docs — NOT as a tag source for new ones.

> **Research note (TODO before locking v2):** confirm Obsidian Templater variable model + Notion DB template behavior so a future substitution layer doesn't paint into a corner. Sources to ingest: Obsidian Templater docs, Notion DB template docs. Out-of-scope for v1 implementation.

## 8. NG10 supersession

This spec **supersedes NG10 [NEVER]** in [config-edit-paths SPEC](../2026-04-25-config-edit-paths/SPEC.md) §3. Required because the NG10 invariants — "no per-folder metadata sidecars" + "folders[] is sole source of truth" — are exactly what this spec relaxes.

**What changed since NG10 was written:**

1. **Templates are a new use case** that NG10 didn't anticipate. Templates are folder-scoped *assets* (markdown files with their own content), not just defaults. Forcing them into a single root `.ok/templates/` either loses folder-context (unscoped global templates) or forces folder names into filenames (`<root>/.ok/templates/_meetings_prep-notes/notes.md`) — a worse design than colocation.
2. **`folders[]` cascade is brittle at scale.** Single-root cascade rules become a merge-conflict hotspot as the KB grows; every team touching a different subtree edits the same YAML. Folder rename / move requires manual edits in two places (the folder + the root config). Nested `.ok/` carries metadata with the folder for free.
3. **The user-direction-stated punt of `.ok/config.yml`** removes the host file for `folders[]` long-term. NG10 assumed `folders[]` was permanent; that assumption is being reversed.

**What of NG10 survives:**

- **No PER-DOC sidecars.** This spec introduces no `.<filename>.metadata.json`, no `_meta.json`, no `_index.md`, no `.frontmatter.yml` next to a single doc. Per-folder `.ok/frontmatter.yml` is metadata for the FOLDER, not for any one doc. The NG10 instinct against per-doc clutter still applies.
- **No implicit hub-doc convention.** Hub docs (`INDEX.md`, `README.md`) carry no special status (D4). NG10's anti-`_index.md` instinct is preserved.
- **OK pollutes nothing visible.** `.ok/` is dot-prefixed (hidden in standard file managers and `ls`). The "OK pollutes nothing in user content" principle weakens from "no OK files in content paths at all" to "no OK files visible in standard listings of content paths." That weakening is acknowledged and accepted; the alternative (single-root `folders[]` forever) is worse on the dimensions above.

**Concrete change:**

| Surface                         | NG10 (today)                         | This spec                                                                                            |
| ------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Per-folder frontmatter defaults | `folders[]` in `.ok/config.yml` only | Nested `<folder>/.ok/frontmatter.yml` (canonical post-migration); `folders[]` during transition (§9) |
| Per-folder templates            | (does not exist)                     | Nested `<folder>/.ok/templates/*.md`                                                                 |
| Per-doc metadata sidecars       | Forbidden                            | Still forbidden (unchanged)                                                                          |
| Hub-doc as metadata carrier     | Forbidden                            | Still no special status (unchanged)                                                                  |

NG10's text in config-edit-paths SPEC will need a corrigendum annotation pointing at this spec (per the CLAUDE.md "Post-ship corrigendum annotations" rule). That edit is part of implementation.

## 9. Convergence story for shipped `folders[]`

Today: `folders[]` in `.ok/config.yml` ships with seven dogfood entries (`specs/**`, `reports/**`, `stories/**`, `projects/**`, `tech-probes/**`, plus subtree overrides). Real production use.

Three transition phases:

### Phase A — coexist (v1 ships)

Both mechanisms live. Read merge order:

1. **Apply `folders[]` rules** (declaration order, today's rules).
2. **Apply nested `<level>/.ok/frontmatter.yml`** root→leaf on top.
3. **Apply file's own frontmatter** (file wins per-scalar).

Nested wins over `folders[]` on key collision (most-specific wins). `set_folder_rule` writes to nested `.ok/frontmatter.yml` by default for new rules (Phase A choice — could flip per migration ergonomics; see open question 12.3).

### Phase B — migrate

A migrator (separate spec, NOT this one) reads `folders[]` and writes corresponding nested `<glob-resolved-folder>/.ok/frontmatter.yml` files. Most `folders[]` matches resolve to a single folder (e.g., `specs/**` → `specs/.ok/frontmatter.yml`). Glob matches that span multiple top-level folders fan out.

**Edge case:** nested `**` patterns that match multiple non-adjacent folders (e.g., `specs/*/evidence/**`). Resolution: the migrator skips these and leaves them in `folders[]` for human review.

### Phase C — `folders[]` retired

Once `folders[]` is empty (or only carries patterns the migrator couldn't resolve), the schema entry is removed and `set_folder_rule`'s `storage: "config-folders"` branch is deleted. Aligns with the broader `.ok/config.yml` punt.

**This spec ships Phase A only.** Phases B and C are tracked as Future Work.

## 10. Content-filter changes — `BUILTIN_SKIP_DIRS` at any depth

**Current bug** (relevant to this spec because nested `.ok/` is now in user content): `isDirExcluded(relativePath)` in `packages/server/src/content-filter.ts:223` checks only `topSegment` against `BUILTIN_SKIP_DIRS`. A path like `meetings/.ok/templates/foo.md` returns `false` — nested `.ok/` content gets indexed as ordinary user content. Templates would show up in search, in `ls`, in the document graph.

**Fix (FR-CF1):** check ALL path segments against `BUILTIN_SKIP_DIRS` in `isDirExcluded`. Two-line change. Also fixes the analogous case for nested `node_modules/foo/node_modules/...`, `dist/foo/dist/...`, etc. — the existing topSegment-only check has been a latent bug.

The walker (`loadNestedGitignores` line 323 already correctly checks `entry.name`) is unaffected — its per-descent check already skips nested `.ok/`.

Test added in same PR: `content-filter.test.ts` exercises `isDirExcluded('meetings/.ok/templates/foo.md')` returns `true`.

## 11. Interaction with existing systems

- **CRDT / Hocuspocus.** `frontmatter.yml` and `templates/*.md` are NOT CRDT-managed. Filesystem-only configuration / source assets. Reads at `list_documents` / `read_document` resolution time; no Y.Doc, no live sync. (Future Settings-pane editing of folder frontmatter is a separate UX decision.)
- **`.gitignore` / `.okignore`.** With FR-CF1, nested `.ok/` is excluded from indexing at every depth. Whether `.ok/` is also gitignored is open question 12.1.
- **File watcher.** Adding/removing `<folder>/.ok/frontmatter.yml` invalidates merged-frontmatter cache for the affected subtree. Adding/removing a `templates/*.md` invalidates `list_documents` `templates_available` for any descendant whose walk-up resolves there.
- **Folder rename / move.** Renaming a folder carries its `.ok/` with it (it's part of the folder's contents on disk). Free win vs `folders[]` glob editing.
- **Settings pane.** No change in v1. The existing `folders[]` Modal continues to work in Phase A. Future work could add a tab for nested-frontmatter editing; out of scope.

## 12. Open questions

### 12.1 Gitignored or committed? **[OPEN]**

Two coherent stances:

- **Personal / per-machine (gitignored).** `.ok/` (project root + nested) is local agent operating context. Templates and folder defaults don't sync across teammates or CI. Simpler, lower coordination. Loses shared team conventions.
- **Project policy (committed).** Templates and folder defaults are part of the repo, like `.editorconfig` or `.github/`. Standard for project-policy files. Couples to git workflow.

**Reviewer-flagged tension:** per-machine framing conflicts with "templates encode shared team conventions." Resolve before locking. Tim's stated default in conversation: gitignored. Spec recommends revisiting once a real second-user pulls the repo and discovers their templates aren't there.

### 12.2 Structured frontmatter (JSON Schema) — defer to v2? **[OPEN — likely defer]**

Today: frontmatter is freeform YAML. *Structured frontmatter* would let a folder declare a typed schema (`status: enum[draft|review|shipped]`, `attendees: string[]`, etc.), validated on save. Notion DB property schemas do this; Obsidian Properties (v1.4+) infers types from values vault-wide but isn't strict-schema.

**Recommendation:** defer. V1 ships defaults only. V2 can add an optional `schema:` key in `frontmatter.yml`.

### 12.3 Phase A default for `set_folder_rule` storage **[OPEN]**

When an agent calls `set_folder_rule` without an explicit `storage:` arg in Phase A, does it default to:

- (a) `nested` (write the new `.ok/frontmatter.yml`) — encourages migration; surprises agents that expect `folders[]`
- (b) `config-folders` (write `folders[]` as today) — preserves existing agent muscle memory; slows migration

Recommendation: (a) for new rules, with a one-time migration tool (Phase B) to lift existing `folders[]` entries.

### 12.4 Convergence ambiguity — same key in both `folders[]` and nested `frontmatter.yml`

Phase A merge says nested wins (most-specific-wins). But what if a `folders[]` rule matches `specs/2026-04-30-foo/**` (very specific) and a nested `specs/.ok/frontmatter.yml` also applies (very general but nested)? Glob specificity vs nesting depth — which wins?

Recommendation: **nesting depth wins** (always). Simpler rule, predictable, aligns with the migration direction (folders[] is being phased out). Edge case: if Phase A users hit this, they migrate the conflicting `folders[]` rule to nested.

## 13. Non-goals (severity-tagged)

- **[NEVER]** NG-T1: Templating engine with variable substitution (`${user}`, `${date}`). The template is a starting point, not a macro. — Reasoning: agents reason about variable content; macros are structurally lower-leverage than letting the agent edit after instantiation.
- **[NEVER]** NG-T2: Per-doc metadata sidecars (`.<filename>.metadata.json`, `_meta.json`, etc.). NG10's anti-per-doc-clutter survives this supersession.
- **[NEVER]** NG-T3: Hub-doc-as-metadata-carrier (`INDEX.md` / `README.md` frontmatter as folder defaults). Mechanism stays in `.ok/frontmatter.yml`; hub docs are content.
- **[NOT NOW]** NG-T4: JSON Schema validation of frontmatter. See 12.2; revisit when a concrete pain point emerges.
- **[NOT NOW]** NG-T5: Multi-player editing of `frontmatter.yml` from a Settings UI. Filesystem-only in v1. Revisit if the user direction adds Settings UI for folder metadata editing.
- **[NOT NOW]** NG-T6: Folder-scoped agent guidance (a `.ok/agents.md` or similar). Stays in CLAUDE.md / skills for v1. Revisit if folder-scoped agent prompts become demanded.
- **[NOT NOW]** NG-T7: Folder-scoped `.okignore` overrides expressed in `.ok/frontmatter.yml`. Path scoping continues via nested `.okignore` files (rename spec FR7). Revisit only if a real ergonomic case emerges.
- **[NOT NOW]** NG-T8: Migration tool from `folders[]` to nested `.ok/frontmatter.yml`. Phase B; tracked as separate spec.
- **[NOT NOW]** NG-T9: Phase C `folders[]` schema removal. Tracked as separate spec.

## 14. Decision log

| #   | Date       | Type | Decision                                                                                                               | Rationale                                                                                                                                                                      |
| --- | ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | 2026-05-01 | T    | Sparse / opt-in nested `.ok/` directories, not single-root `folders[]` cascade                                         | Long-term destination for folder metadata; folder-rename portability + reduced merge-conflict surface; templates need a folder-scoped home that single-root can't provide      |
| D2  | 2026-05-01 | T    | v1 contents bounded to `frontmatter.yml` + `templates/`                                                                | Avoid kitchen-sink directory; new members are non-breaking adds                                                                                                                |
| D3  | 2026-05-01 | T    | Lazy creation, auto-clean when empty                                                                                   | Empty `.ok/` is leaked state and confuses non-OK users browsing the repo                                                                                                       |
| D4  | 2026-05-01 | P    | Hub docs (`INDEX.md`, `README.md`) get no special status                                                               | Mechanism stands on its own; preserves NG10's anti-implicit-hub instinct                                                                                                       |
| D5  | 2026-05-01 | T    | No templating engine in v1 — body-and-merge only                                                                       | Simplest thing; agents reason about variable content; defer engine until demand emerges                                                                                        |
| D6  | 2026-05-01 | T    | Tags originate from templates at create time, not from cascade. Cascade rule for all keys = simple last-wins / replace | Contextual decision "what tags should this doc have" belongs to the agent picking a template, not to a passive cascade                                                         |
| D7  | 2026-05-01 | T    | `templates_available` aggregates leaf→root, closest-wins on collision                                                  | Templates are a menu, not an inheritance chain; leaf-first ordering surfaces most-locally-relevant first                                                                       |
| D8  | 2026-05-01 | P    | No reserved names inside `.ok/` beyond the two v1 members                                                              | Reserving names we don't ship invites cargo-cult; future adds are non-breaking                                                                                                 |
| D9  | 2026-05-01 | T    | Template is a first-class function argument to `write_document`                                                        | Replaces `cp`-then-edit; agent reasons over `templates_available` and hands the name to the create call                                                                        |
| D10 | 2026-05-01 | X    | Supersede NG10 [NEVER] in config-edit-paths SPEC                                                                       | Templates are a new use case NG10 didn't anticipate; `.ok/config.yml` is being phased out, removing the host for `folders[]`; nested `.ok/` is the cleaner long-term home (§8) |
| D11 | 2026-05-01 | T    | Phase A coexist: read merge stacks `folders[]` then nested; nested wins on collision                                   | Lets the migration roll without breaking shipped folder rules                                                                                                                  |
| D12 | 2026-05-01 | T    | Reuse `set_folder_rule` with a `storage:` arg, NOT a new `update_frontmatter` tool                                     | Avoids reviewer-flagged collision with parked per-doc `frontmatter_patch`; one primitive across both storage backends; keeps right-click-folder UX (D38) on a single tool      |
| D13 | 2026-05-01 | T    | Fix `BUILTIN_SKIP_DIRS` check to walk all path segments (FR-CF1)                                                       | Closes the indexing gap nested `.ok/` would expose; collateral fix for nested `node_modules/...` etc.                                                                          |
| D14 | 2026-05-01 | T    | Nesting depth wins on cascade collision                                                                                | Simpler than glob-specificity scoring; aligns with `folders[]` phase-out direction                                                                                             |

## 15. Functional requirements (v1)

| Priority | ID     | Requirement                                                                                        | Acceptance                                                                        |
| -------- | ------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Must     | FR1    | `<folder>/.ok/` directories supported as opt-in metadata carriers, sparse, lazy-create, auto-clean | Integration test: create + delete cycle leaves no empty `.ok/`                    |
| Must     | FR2    | `<folder>/.ok/frontmatter.yml` cascades root→leaf, last-wins per key                               | Cascade unit tests; collision tests vs `folders[]`                                |
| Must     | FR3    | `<folder>/.ok/templates/*.md` aggregates leaf→root, closest-wins on filename collision             | Aggregation + collision unit tests                                                |
| Must     | FR4    | `list_documents(folder)` returns `frontmatter_defaults` + `templates_available` per §5             | Tool integration test                                                             |
| Must     | FR5    | `write_document({ template })` resolves name via aggregation, instantiates body + frontmatter      | Tool integration test                                                             |
| Must     | FR6    | `set_folder_rule({ storage: "nested" })` writes nested `frontmatter.yml`; default per 12.3         | Tool integration test                                                             |
| Must     | FR7    | Phase A merge (nested wins over `folders[]` per D11)                                               | Cascade integration test                                                          |
| Must     | FR-CF1 | `isDirExcluded` checks ALL path segments against `BUILTIN_SKIP_DIRS`, not just topSegment          | `content-filter.test.ts`: nested `.ok/` excluded; nested `node_modules/` excluded |
| Must     | FR8    | NG10 in `specs/2026-04-25-config-edit-paths/SPEC.md` gets a corrigendum annotation pointing here   | Manual review                                                                     |
| Should   | FR9    | CLAUDE.md STOP rule "Folder defaults live in `config.yml`'s `folders[]`" updated to reflect §8     | Manual review                                                                     |

## 16. Next steps

1. **Resolve open questions** 12.1 (gitignore), 12.3 (Phase A storage default) with Tim before implementation.
2. **Confirm D10 supersession** with config-edit-paths owners (Andrew, Nick) — this spec retroactively reverses an NEVER from a Finalized spec; that's worth one synchronous ack.
3. **Implementation order:**
   - FR-CF1 first (content-filter fix is independently useful and unblocks nested `.ok/`).
   - FR1–FR4 (read paths) before FR5–FR7 (write paths).
   - FR8 + FR9 (doc / corrigendum updates) at PR-merge time.
4. **Phase B migrator** — separate spec, after v1 ships and there's signal on Phase A ergonomics.
5. **Skill update (downstream):**
   - Replace OK skill's `folders[]`-first guidance with nested `.ok/frontmatter.yml` + the Phase A coexistence rule.
   - Add: "If creating a new doc, check `templates_available` from `list_documents` of the parent folder; pass the name as `template:` to `write_document` when a template matches."

## 17. Research notes (TODO before locking v2)

Per the OK skill grounding rule, ingest before citing:

- Obsidian Templater variable model (for v2 substitution decisions).
- Notion DB template behavior (for v2 substitution + typed-property decisions).
- Logseq namespace property model (for cascade-vs-namespace alternative consideration).

