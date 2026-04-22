# Evidence: D7 — Per-page vs global preference scope

**Dimension:** D7 — Who owns the preference: user (global), project, document, session, or URL? UX for expressing per-doc choice. Precedence semantics (override vs overlay vs session-only).
**Date:** 2026-04-21 (added in Path C update; see meta/_changelog.md)
**Sources:** obsidian-force-view-mode-of-note source code + README; Obsidian developer docs; VS Code docs; Notion Help Center; Zettlr docs + GitHub; JupyterLab nbformat docs; RStudio rmarkdown docs

---

## Key files / pages referenced

- [obsidian-force-view-mode-of-note — main.ts](https://github.com/bwydoogh/obsidian-force-view-mode-of-note/blob/master/main.ts) — primary source; shows frontmatter read + fallback logic
- [obsidian-force-view-mode-of-note repo](https://github.com/bwydoogh/obsidian-force-view-mode-of-note)
- [Obsidian Help: Configuration folder](https://help.obsidian.md/configuration-folder)
- [Notion Help: Views, filters, sorts & groups](https://www.notion.com/help/views-filters-and-sorts)
- [Zettlr YAML Frontmatter docs](https://docs.zettlr.com/en/editor/yaml-frontmatter/)
- [Zettlr Issue #2307 — Make YAML Frontmatter Block toggeable](https://github.com/Zettlr/Zettlr/issues/2307)
- [JupyterLab nbformat docs](https://nbformat.readthedocs.io/en/latest/format_description.html)
- [R Markdown integration in RStudio IDE](https://rmarkdown.rstudio.com/articles_integration.html)

---

## Findings

### Finding: Scope axes in the wild fall into 5 tiers, from most ephemeral to most durable

**Confidence:** CONFIRMED (across D1, D2, D3, and D5 evidence files + D7 new sources)
**Evidence:** synthesized from D1-D6 plus the Obsidian plugin source

| Tier | Scope | Durable? | Surveyed examples |
|---|---|---|---|
| 1. Session-only | Per-pane / per-tab / per-URL-load | No | Obsidian pane "last used mode," VS Code tab editor type, HedgeDoc URL query |
| 2. Per-document (persistent) | The document owns its mode | Yes | Obsidian `obsidianUIMode` / `obsidianEditingMode` frontmatter (community plugin only) |
| 3. Per-project / per-workspace | Scope is the project container | Yes | Obsidian vault `app.json`, VS Code workspace settings, Logseq graph config.edn |
| 4. User-global (per-install) | One preference across everything on this install | Yes | Joplin `editor.codeView`, Zettlr `renderingMode`, VS Code user settings, localStorage in Electron |
| 5. Cross-device | User identity spans devices | Yes | VS Code Settings Sync, Obsidian Sync plugin (paid; vault-level) |

No surveyed editor implements all five. Most implement 1 (session) + one of 3/4 (durable) + optionally 5 (cross-device).

**Implications:** Scope tiers compose — session-local override on top of durable preference is the norm in UX. Mixing tiers is where precedence questions arise (see next finding).

---

### Finding: Obsidian's `obsidian-force-view-mode-of-note` plugin is the canonical per-document precedent — two orthogonal frontmatter keys with documented override semantics

**Confidence:** CONFIRMED
**Evidence:** [obsidian-force-view-mode-of-note/main.ts](https://github.com/bwydoogh/obsidian-force-view-mode-of-note/blob/master/main.ts), [plugin README](https://github.com/bwydoogh/obsidian-force-view-mode-of-note)

**Two orthogonal axes** (from plugin README + main.ts):
- `obsidianUIMode: source | preview` — "view mode" axis (editable vs Reading-mode-render).
- `obsidianEditingMode: live | source` — "editing mode" axis (Live Preview vs Source within the editing view).

Example frontmatter:
```yaml
---
obsidianUIMode: source
obsidianEditingMode: live
---
```
Result: opens in Live Preview edit mode.

**Code excerpt — frontmatter read:**
```typescript
const fileDeclaredUIMode =
    fileCache !== null && fileCache.frontmatter
    ? fileCache.frontmatter[this.OBSIDIAN_UI_MODE_KEY]
    : null;

const fileDeclaredEditingMode =
    fileCache !== null && fileCache.frontmatter
    ? fileCache.frontmatter[this.OBSIDIAN_EDITING_MODE_KEY]
    : null;
```

**Code excerpt — application:**
```typescript
if (fileDeclaredUIMode) {
    state.state.mode = fileDeclaredUIMode;
}
if (fileDeclaredEditingMode) {
    state.state.source = (fileDeclaredEditingMode == 'source');
}
```

**Code excerpt — hook mechanism:**
```typescript
this.registerEvent(
    this.app.workspace.on(
        "active-leaf-change",
        this.settings.debounceTimeout === 0
        ? readViewModeFromFrontmatterAndToggle
        : debounce(readViewModeFromFrontmatterAndToggle, ...)
    )
);
```

**Code excerpt — fallback when frontmatter absent:**
```typescript
const defaultViewMode = this.app.vault.config.defaultViewMode ?
    this.app.vault.config.defaultViewMode : "source";
const defaultEditingModeIsLivePreview =
    this.app.vault.config.livePreview === undefined ? true :
    this.app.vault.config.livePreview;
```

**Implications:**

1. **Obsidian's `app.json` has two keys**: `defaultViewMode` ("source" | "preview") and `livePreview` (boolean). These are concrete stable keys, confirmed from the plugin source (the plugin reads them for fallback). This is more precise than what D2's evidence documented.

2. **Two orthogonal axes are a clean design.** `obsidianUIMode` = editable-vs-Reading. `obsidianEditingMode` = LP-vs-Source within the editing view. Open Knowledge's analog: `wysiwyg | source` is the editing-mode axis; `diff` is ephemeral so not a third axis; if a future "read-only" or "preview-only" mode is added, it would be the UI-mode axis.

3. **Precedence model is override-with-fallback.** Per-doc frontmatter wins if present; otherwise fall back to global `app.json` default. Not overlay (no "two states visible simultaneously"). Not session-only. Clean override semantics. An `ignoreForceViewAll` escape hatch exists at the plugin-settings tier.

4. **Hook point is `active-leaf-change`.** Fires when the user opens or switches notes. Expensive operations debounced via config. For Open Knowledge: the analog is a mount-time read of frontmatter in `EditorPane`, or an effect that runs on `activeDocName` change.

---

### Finding: Native Obsidian does NOT support per-file mode — the feature request has been open since 2021 with no staff response

**Confidence:** CONFIRMED (absence)
**Evidence:** [forum.obsidian.md/t/remember-view-mode-per-file/7069](https://forum.obsidian.md/t/remember-view-mode-per-file/7069)

The community plugin is the only production solution. No Obsidian-developer commitment to building it natively. Five years of user demand has not moved the native roadmap — suggests Obsidian team sees per-file mode as "plugin territory," not core.

**Implications:** If Open Knowledge decides per-doc override is in scope (either immediately or as Future Work), the Obsidian plugin is the reference precedent — including the frontmatter-key naming convention (`obsidianUIMode` / `obsidianEditingMode` in their namespace). For OK, a parallel key in the OK namespace (e.g., `ok-editor-mode: wysiwyg | source`) would be a direct port.

---

### Finding: The Obsidian plugin's frontmatter-lock has a documented chicken-and-egg UX trap

**Confidence:** CONFIRMED
**Evidence:** [forum.obsidian.md/t/remember-view-mode-per-file/7069](https://forum.obsidian.md/t/remember-view-mode-per-file/7069)

> "if a note is locked in Preview Mode via the plugin, editing its YAML frontmatter becomes problematic within Obsidian itself"

When a note is forced into Preview (Reading) mode via frontmatter, the user cannot edit the frontmatter that forced them into Preview — because Preview is read-only. The escape hatch is: plugin settings panel has "Ignore force for this note" button, OR global `ignoreForceViewAll`.

**Implications:** If per-doc override is introduced in Open Knowledge, the UX must handle the lock-in-read-only scenario. Options:
- Always allow the frontmatter region to be editable, even when the rest is preview (Obsidian doesn't do this — preview is all-or-nothing).
- Provide a "unlock" UI gesture at all times.
- Only allow "force mode" for the editable modes (wysiwyg ↔ source), never the Reading/diff mode.

For OK, since the `diff` mode is timeline-preview only and doesn't correspond to a per-doc "this doc is locked to read-only" semantic, this trap is less relevant — OK's per-doc scope (if introduced) would toggle between `wysiwyg` and `source`, both of which are editable.

---

### Finding: VS Code's per-file-pattern scope is via workspace-tier `workbench.editorAssociations`, not per-file metadata

**Confidence:** CONFIRMED
**Evidence:** [VS Code Issue #192954](https://github.com/microsoft/vscode/issues/192954), [User and workspace settings docs](https://code.visualstudio.com/docs/configure/settings)

Workspace settings.json:
```json
{
  "workbench.editorAssociations": {
    "*.md": "vscode.markdown.preview.editor",
    "CHANGELOG.md": "default"
  }
}
```

The second entry overrides the first for a specific file pattern — same workspace, different defaults for different files.

But: **no per-file memory**. Opening `report.md` in preview and then `notes.md` in edit doesn't teach VS Code that `report.md` should re-open in preview next time. The association is rule-based, not memory-based.

**Implications:** VS Code's design is declarative (rules) rather than behavioral (memory). For a spec designing per-doc scope, this is a cleaner pattern than "remember what the user chose last" — declaring `this file opens this way` avoids the "did I actually intend that or was it a one-off?" ambiguity.

---

### Finding: Notion uses per-"view" scoping — multiple named views of the same database, each with its own layout and filters — but not an "edit vs view mode" axis

**Confidence:** CONFIRMED (Notion is proprietary; Notion help docs are the primary source for what UX pattern is exposed)
**Evidence:** [Notion: Views, filters, sorts & groups](https://www.notion.com/help/views-filters-and-sorts), [Notion: Working with views](https://developers.notion.com/guides/data-apis/working-with-views)

Key facts from the docs:
- Each database can have N named views (table, board, calendar, timeline, gallery, list, form, chart, map, dashboard).
- Each view has its own filters, sorts, layout.
- "Settings applied to one database view won't be applied across all other database views automatically."
- "Personal view changes only apply to you and won't affect other people's views."

**Implications:** Notion's design isn't a per-doc mode override — it's per-NAMED-VIEW-instance. A single underlying database has multiple parallel views; users pick which named view to open, and each one has its own config. This is a different design pattern:

- "I want this file to open in Source mode" (per-doc override) is a single-user-single-preference axis.
- "I want a 'code review' view of this database and a 'casual browse' view" (Notion) is multiple-named-preferences axis.

For Open Knowledge, the analog to Notion's model would be saved "view presets" on a per-user basis — out of scope for current spec but worth noting as a future-direction pattern.

Notion's "personal view changes only apply to you" is also relevant: in a collaborative editor (OK's context), per-user per-doc preferences make sense. One user's preferred mode shouldn't push another user's editor into that mode.

---

### Finding: JupyterLab stores per-document metadata in nbformat JSON but has no "edit vs view" mode axis

**Confidence:** CONFIRMED (structural, not a mode analog)
**Evidence:** [nbformat format_description](https://nbformat.readthedocs.io/en/latest/format_description.html)

> "Jupyter notebook files are simple JSON documents, containing text, source code, rich media output, and metadata."
> "At the notebook level, kernelspec metadata includes fields like `name`, `language`, and `display_name`."
> "All cells have the following basic structure with metadata: cell_type, metadata (an object), and source."
> "Metadata is a place that you can put arbitrary JSONable information about your notebook, cell, or output, and custom metadata should use a sufficiently unique namespace."

nbformat is a structural precedent for document-level metadata storing preferences, but it doesn't define an "edit vs view mode" field. Notebooks are always editable-with-execution; there's no separate "read-only view" mode toggle.

**Implications:** Structural precedent for per-doc metadata stored IN the document (rather than in a sidecar config file). Open Knowledge already uses YAML frontmatter (`.md` files) which is the same pattern. Per-doc mode override via frontmatter is consistent with this precedent.

---

### Finding: RStudio R Markdown YAML `output:` field selects render target, not edit mode

**Confidence:** CONFIRMED (not a direct analog)
**Evidence:** [R Markdown integration in RStudio](https://rmarkdown.rstudio.com/articles_integration.html)

The `output` YAML key picks between `html_document`, `pdf_document`, `word_document`, etc. — this is a *render target*, not an *editor view mode*. RStudio's edit view is always source markdown; the render button produces the output format.

**Implications:** Not a per-doc-edit-mode precedent. Relevant only as another example of "YAML frontmatter declares doc-level rendering preference" — a structural pattern, not a behavioral one for this research.

---

### Finding: Zettlr has no per-file YAML frontmatter mode override — all mode settings are global

**Confidence:** CONFIRMED (absence)
**Evidence:** [Zettlr YAML Frontmatter docs](https://docs.zettlr.com/en/editor/yaml-frontmatter/), search of Zettlr issue tracker

Zettlr's frontmatter documentation covers title, author, keywords, tags, and similar bibliographic metadata — no mode/view/distraction-free keys. Zettlr's `renderingMode: 'preview'` is a global config only.

**Implications:** Zettlr is single-user-single-install, so per-file override is less relevant. Confirms that per-doc mode override is not a common feature — Obsidian's community plugin is the outlier precedent.

---

### Finding: The precedence taxonomy observed across surveyed editors

**Confidence:** CONFIRMED (synthesis)
**Evidence:** across D1-D6 + D7 findings above

When multiple scope tiers are in play, observed precedence patterns:

| Pattern | Description | Examples |
|---|---|---|
| Override-with-fallback | Higher tier (doc-level) wins if present; otherwise fall back to global | Obsidian plugin: frontmatter → app.json |
| Hierarchical (inheritance) | Each tier can override lower tier; no single-file memory needed | VS Code: folder → workspace → user |
| Session-on-top-of-durable | Session-local override layered on top of durable setting; discarded on close | Obsidian pane last-used (within app lifetime) |
| URL-as-authoritative | No fallback; URL is the state | HedgeDoc `?edit`/`?view`/`?both` |
| Named-presets | Multiple parallel named views, user picks which to open | Notion database views |

**Implications for Open Knowledge:**

If per-doc override is introduced, **override-with-fallback** is the cleanest precedent — per-doc frontmatter wins when set, otherwise global `localStorage` pref applies, otherwise app default (`wysiwyg`). This is what Obsidian's community plugin implements and what matches user mental model of "I can pin this file's mode, but my preference applies everywhere else."

---

## Per-page scope design options (for the consuming spec)

Drawing together the taxonomy and precedents, the design options for per-doc scope are:

**Option X1: No per-doc override (current spec D1 decision).**
Single global preference. Simple. Matches Joplin, Zettlr, VS Code user-tier (as the "no workspace override" subset). No new UX surface.

**Option X2: Frontmatter-declared override (Obsidian plugin precedent).**
Add `ok-editor-mode: wysiwyg | source` (or similar) to YAML frontmatter. File opens in declared mode; otherwise global default applies. Requires: frontmatter parse on doc mount, precedence resolver, UX for setting the key (either manual YAML editing or a UI gesture that writes the key).

**Option X3: Hierarchical (project → user).**
User-level global + per-project override (second-tier localStorage key or per-project `.open-knowledge/config.yml` field). Matches VS Code. Requires: per-project config layer; precedence resolver.

**Option X4: Per-doc session memory + user default.**
Remember the last mode used per doc for the current session; durable global default otherwise. Discarded on close. Matches Obsidian pane-last-used. Requires: in-memory session map; no persistence beyond current app lifetime.

**Option X5: Named presets (Notion-style).**
User creates named view presets ("my coding mode" = Source; "my writing mode" = WYSIWYG) and applies them. Overkill for current scope; future direction.

**Tradeoffs summary** (factual, not prescriptive — spec decides):

- X1 is simplest, matches the rubric decisions, ships fastest.
- X2 (frontmatter) has 5+ years of prior-art demand in Obsidian, a concrete reference implementation, and composes cleanly with OK's existing frontmatter infrastructure.
- X3 (project-tier) maps to Electron multi-project reality but introduces per-project config complexity.
- X4 (session memory) is what Obsidian users actually complain about (they want durability, not session-only stickiness).
- X5 is a future-state pattern, not a v1 feature.

---

## Negative searches

- Searched for native Obsidian per-file mode memory — NOT FOUND (5-year-old feature request, no staff response).
- Searched for Typora per-file mode override — NOT FOUND (Typora is single-mode by design).
- Searched for SilverBullet per-page mode in frontmatter — NOT FOUND in docs; SilverBullet's "page metadata" supports frontmatter but not view-mode key specifically.
- Searched for Zettlr per-file distraction-free frontmatter — NOT FOUND.
- Searched for Logseq page property for display mode — NOT FOUND; page properties are content metadata, not view preferences.

---

## Gaps / follow-ups

- **SilverBullet page metadata deep read** — SilverBullet uses frontmatter for plugin-plug behavior; unclear if a plug could declare "open this page in raw markdown mode." Not pursued; would require reading their plug system source.
- **MarkText per-file mode** — MarkText is another Electron OSS markdown editor not surveyed in D1. Quick check would tell us if the community-plugin pattern for per-file mode is unique to Obsidian or appears elsewhere natively. Low priority.
- **Exact `obsidian-ui-mode` plugin install base** — not captured here; would tell us how much adoption the frontmatter pattern has. Low signal for spec; the existence of the plugin + 5-year-old feature request is signal enough.
