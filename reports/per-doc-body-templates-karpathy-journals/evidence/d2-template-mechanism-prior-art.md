# Evidence: Body-Template Mechanism Prior Art

**Dimension:** How tools mechanically implement "per-doc body template" — the trigger, variable substitution, frontmatter+body handling, folder-binding semantics
**Date:** 2026-04-30
**Sources:** Obsidian Daily Notes (core plugin) + Templater (community plugin) + Periodic Notes (community plugin), Hugo archetypes, Logseq journal templates, GitHub issue templates, JetBrains File and Code Templates, Notion database templates
**Note:** Several primary-source URLs returned non-fetchable responses (Twitter 402, Templater docs sub-page 404, Logseq docs page exceeded 10MB). Substance is captured from accessible alternates and the prior OK research reports.

---

## Key sources referenced

- Hugo Archetypes — https://gohugo.io/content-management/archetypes/ (fetched 2026-04-30)
- Obsidian Templater — https://github.com/SilentVoid13/Templater + https://silentvoid13.github.io/Templater/ (4.7K stars per prior OK research)
- Obsidian Periodic Notes — https://github.com/liamcain/obsidian-periodic-notes (1.3K stars, fetched 2026-04-30)
- Obsidian Daily Notes (core) — https://obsidian.md/help/plugins/daily-notes (rendered content not retrievable; substance from prior OK research + community wiki)
- Prior OK research: `reports/obsidian-karpathy-workflow-deep-dive/evidence/wiki-compilation.md` (Templater coverage)
- Prior OK research: `reports/config-driven-folder-frontmatter/REPORT.md` (existing folder-rule infrastructure in OK)

---

## Findings

### Finding: Hugo archetypes are the cleanest "frontmatter+body template, type-keyed, with substitution" precedent

**Confidence:** CONFIRMED (primary docs fetched)
**Evidence:** Hugo docs (fetched 2026-04-30): "An archetype is a template for new content." Archetypes live in `archetypes/`. Default file is `archetypes/default.md`; per-content-type files like `archetypes/posts.md` take precedence. Archetypes contain BOTH frontmatter and body. Substitution variables include `.Date` (RFC3339), `.File.ContentBaseName`, `.Type` (inferred from directory or `--kind` flag), and `.Site`.

```text
Lookup order:
1. Project-level type-specific archetype
2. Theme-level type-specific archetype
3. Project-level default archetype
4. Theme-level default archetype
5. Built-in default archetype
```

Trigger: `hugo new content <path>` (explicit command, not magic on filesystem write).

**Implications for OK:** This is the closest precedent. The "type-keyed" lookup is what OK's existing `folders[]` glob-rules already implement (path-based instead of type-based). Adopting `bodyTemplate:` as a sibling of `frontmatter:` inside each folder rule mirrors the archetype model 1:1 and reuses OK's existing precedence machinery. The trigger surface is the OK-native one — file creation in editor or via MCP `write_document`/`create_page` — rather than a special CLI verb.

### Finding: Obsidian Daily Notes (core) — template-path + moment.js date format + folder

**Confidence:** INFERRED (rendered docs page not retrievable in this pass; substance from prior OK research + community knowledge)
**Evidence:** Obsidian's Daily Notes core plugin has three settings: (1) **Date format** — moment.js format string (default `YYYY-MM-DD`), used for the filename, (2) **New file location** — vault folder path, (3) **Template file location** — path to a vault file whose contents are pasted into the new daily note's body. Substitution tokens inside the template include `{{date}}` (formatted by date-format setting), `{{date:YYYY-MM-DD}}` (with explicit moment format), `{{title}}`, `{{time}}`. If template path is empty, the new file is created empty.

**Implications for OK:** Two design decisions surface from this:
1. **Variable syntax** — `{{date}}` / `{{date:YYYY-MM-DD}}` is the de-facto convention in Obsidian-land. Adopting it in OK gets free familiarity.
2. **Filename pattern is its own concern** — Daily Notes separates the *filename pattern* (date-format) from the *body template* (file path). OK's existing folder-glob rule key is the filename match; adopting Daily Notes' separation cleanly: glob → filename pattern (already), `bodyTemplate:` → content (new).

### Finding: Obsidian Templater — folder template pairs are the per-doc body template surface

**Confidence:** CONFIRMED in concept (GitHub README fetched), MECHANISM details INFERRED from prior OK research
**Evidence:** GitHub README (fetched 2026-04-30): Templater "enables users to insert variables and functions results into your notes" and "execute JavaScript code." Variable syntax is `<% tp.* %>`. Plugin has 4.7K stars per prior OK research.

The "folder templates" feature (per prior OK research, `reports/obsidian-karpathy-workflow-deep-dive/evidence/wiki-compilation.md:137`): when a file is created in folder X, Templater automatically applies template Y. Settings stored as `folder_template_pairs` array of `{folder, template}` objects. Most-specific-folder-match wins.

Common helpers per prior OK research:
- `<% tp.date.now("YYYY-MM-DD") %>` — current date with moment.js format
- `<% tp.file.title %>` — filename without extension
- `<% tp.file.cursor() %>` — cursor placement marker
- `<% tp.system.prompt("Mood?") %>` — interactive prompt-for-input at creation time
- `<% tp.web.daily_quote() %>` — external API call (bypasses CORS)

**Implications for OK:**
- **Folder-binding via path is the canonical pattern.** OK's existing folder-glob rules align directly. The `folder_template_pairs` structure is the same shape as a `bodyTemplate:` field per rule.
- **Variable substitution in body, not just frontmatter.** Templater is the proof point that users want body-level dynamic content.
- **`tp.system.prompt` is a tempting feature but a 2-way door.** Interactive prompts at file-creation time require an editor-modal surface, not just a config.yml field. Recommend MVP omits this; adding later doesn't break the model.
- **JS execution is a deliberate non-goal.** Templater's JS execution is its biggest power but also its security surface ("Templater allows you to execute arbitrary JavaScript code and system commands"). OK should NOT mirror this in MVP — variable substitution only, no expression evaluation.

### Finding: Periodic Notes plugin — daily/weekly/monthly only, NOT quarterly/yearly

**Confidence:** CONFIRMED (GitHub README fetched 2026-04-30)
**Evidence:** liamcain/obsidian-periodic-notes README: supports **three** periods (daily / weekly / monthly). Each period has independent settings for folder, template, format. README quote: "The Periodic Notes plugin expands on the idea of daily notes and introduces weekly and monthly notes." Examples include filename formats like `gggg-[W]ww` (weekly) and substitution tokens like `{{sunday:YYYY-MM-DD}}`.

**Implications for OK:** The user's request mentioned "daily/journal patterns" — three periods covers the realistic scope. OK doesn't need to invent a "period" abstraction in MVP; the existing folder-glob system handles per-period folders (`journals/daily/**`, `journals/weekly/**`, `journals/monthly/**`) trivially. The period abstraction is a higher-level convenience the spec can defer.

### Finding: Filename-pattern dynamism is a separable concern from body-template dynamism

**Confidence:** CONFIRMED (Daily Notes + Periodic Notes both architect this way)
**Evidence:** In both Obsidian plugins, the *filename* (e.g., `2026-04-30.md`) is generated by a date-format string applied to "today"; the *body* is generated by the template file. Two distinct settings.

**Implications for OK:** OK already does filename matching via `folders[].match` glob. The body template is the new piece. **Filename generation** ("when the user clicks 'open today's daily note', what file does it open?") is a *different feature* — a "current document for today" command. The spec should explicitly scope body templates to: "given that a file is being created at path X, what content does it start with?" — and explicitly exclude the "today" command from MVP scope (cleanly addable later).

### Finding: Logseq journal templates — "default" template applied to journal pages

**Confidence:** INFERRED (docs page exceeded 10MB fetch limit; substance well-known in Logseq community)
**Evidence:** Logseq creates one page per day in `journals/` named `YYYY_MM_DD.md`. Templates in Logseq are blocks anywhere in the graph annotated with `template:: name` properties. A template named `default` is automatically applied to new journal pages. Variable substitution uses `<% today %>`, `<% yesterday %>`, `<% tomorrow %>`.

**Implications for OK:** The "named default template auto-applied to a folder" pattern is one OK *should not* adopt — it conflates per-block template definitions with per-folder bindings. OK's `folders[]` glob-rule structure is cleaner: the binding is explicit in config, not implicit by template name.

### Finding: GitHub issue templates — `.github/ISSUE_TEMPLATE/*.md` with frontmatter

**Confidence:** CONFIRMED (well-known GitHub feature)
**Evidence:** GitHub supports per-repo issue templates as markdown files in `.github/ISSUE_TEMPLATE/`. Each file has frontmatter (`name:`, `about:`, `title:`, `labels:`, `assignees:`) plus body. When a user opens "New issue," GitHub presents a chooser of available templates. No variable substitution — body is pasted verbatim. There's also the YAML "issue forms" variant for structured input.

**Implications for OK:** GitHub's *chooser* model is interesting — when a folder has multiple body templates, give the user a chooser at creation time. But it's a UX-second feature; MVP can ship with one template per folder rule (most-specific match wins, like `frontmatter:` already does) and add chooser semantics later.

### Finding: JetBrains File and Code Templates — Velocity templating, project-level + IDE-level

**Confidence:** INFERRED from broad familiarity (not fetched in this pass)
**Evidence:** JetBrains IDEs ship a File and Code Templates feature: per-file-type templates with Velocity macros (`#parse`, `#if`, `${VARIABLE}`). Templates exist at project level and IDE level. Variables include `${NAME}`, `${PACKAGE_NAME}`, `${DATE}`, `${USER}`. Triggered via "New > File from Template" command.

**Implications for OK:** Confirms that the "project-level template" abstraction is widely useful. Velocity is overkill for MVP; OK should stay with simple `{{var}}` substitution.

### Finding: Notion database templates — per-database, recurring, "every new page in this DB starts with..."

**Confidence:** CONFIRMED (well-known Notion feature)
**Evidence:** Notion lets a database define one or more templates. When a user creates a new page in the database, they pick a template (or default is auto-applied). Templates can be set to recur on a schedule (e.g., "create a new daily journal entry every day at 9am"). Templates support frontmatter-equivalent properties + body content.

**Implications for OK:**
- The **database = folder** mapping is a clean parallel — Notion's "every page in this DB" maps directly to OK's "every file matching this folder rule."
- The **recurring schedule** is a power feature out of MVP scope but worth flagging in the spec's "future directions" section.
- The **multi-template-per-DB** pattern reinforces the chooser feature noted under GitHub issue templates.

---

## Comparison table

| Tool | Trigger | Variable syntax | Folder/scope binding | Frontmatter + body | Multi-template | JS exec |
|---|---|---|---|---|---|---|
| Hugo archetypes | `hugo new content <path>` CLI | Go template `{{ .Date }}` | Type (filename), via `archetypes/<type>.md` | Both | One per type | No |
| Obsidian Daily Notes | "Open today's note" cmd | `{{date}}`, `{{date:FORMAT}}` | Single global folder | Body via template file path | One global | No |
| Obsidian Periodic Notes | Period nav cmd | `{{date}}`, `{{sunday:FORMAT}}` | Folder per period (D/W/M) | Body via template file path | One per period | No |
| Obsidian Templater | File-create event in folder | `<% tp.* %>` | Folder→template pairs (literal paths) | Both | One per folder pair | **Yes** |
| Logseq | Auto on journal page creation | `<% today %>` | Implicit (journal pages, "default" template name) | Both via block content | "default" implicit | No |
| GitHub issue templates | "New issue" UI chooser | None | Repo-level (`.github/ISSUE_TEMPLATE/`) | Both | Multiple, chooser | No |
| JetBrains | "New > File from Template" cmd | Velocity `${VAR}` | File-type, project + IDE level | Both | Multiple, chooser | No |
| Notion DB templates | "New page" with chooser | None (manual props) | Per-database | Both (props + body) | Multiple, chooser | No |

---

## Cross-cutting observations

1. **All surveyed tools separate filename generation from body content.** OK's existing `folders[].match` glob handles the path side; `bodyTemplate:` would handle the content side.
2. **`{{var}}` is the dominant variable syntax** for tools without expression evaluation (Daily Notes, GitHub, Mustache-derived stacks). `<% %>` is Templater/EJS-style. Hugo uses Go templates. **Recommendation: adopt `{{var}}` for OK — lowest cognitive cost.**
3. **JS execution is the bright line.** Templater allows it (and warns); every other surveyed tool refuses it. **OK should refuse it.**
4. **Most-specific-match precedence is the canonical rule.** OK's existing folder-frontmatter rules use last-match-wins (declaration order, specific last). Body templates should follow the same rule for consistency.
5. **Multi-template-per-folder + chooser** is a future-directions feature, not MVP. Single template per glob match keeps the mental model clean.
6. **Variable inventory** — date is universal. Title, time, and user/author are common. Prompt-for-input is power-user only and requires editor-modal UX.

## Negative searches

- Templater's `folder_template_pairs` exact JSON shape — sub-doc URL 404'd. Substance preserved from prior OK research; spec should verify against current Templater settings.ts before locking field names.
- Logseq templates docs page — exceeded 10MB content limit. Substance from community knowledge; Logseq is not a primary precedent for OK so this is acceptable.
- A direct empirical study on "best journal template shape for LLM retrieval" — none found.

## Gaps / follow-ups

- The spec should pull a concrete Templater settings JSON sample from the current codebase before locking the OK config field name (`bodyTemplate` vs `template` vs `body`).
- Consider whether OK's body templates should be **inline strings** (in `config.yml`) or **file references** (path to a template `.md` file in the workspace). Inline is simpler for short templates; file-ref scales to long templates and lets users edit templates in OK itself. Spec decision.
