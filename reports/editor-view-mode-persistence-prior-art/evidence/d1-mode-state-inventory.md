# Evidence: D1 — Mode-state inventory across OSS editors

**Dimension:** D1 — What mode states exist across surveyed OSS editors, including negative exemplars
**Date:** 2026-04-21
**Sources:** Obsidian docs + forum; Logseq discuss + GitHub; Zettlr GitHub; SilverBullet docs + GitHub; HedgeDoc docs + GitHub; VS Code docs; Joplin forum + GitHub; Outline / AFFiNE / Milkdown / TinaCMS / BlockNote GitHub + docs

---

## Key files / pages referenced

- [Obsidian forum: Globally set Editor's default Mode](https://forum.obsidian.md/t/globally-set-editors-default-mode-source-mode-live-preview-reading/48322) — confirms 3 modes
- [Obsidian forum: Help with default view mode option](https://forum.obsidian.md/t/help-with-default-view-mode-option/14694) — per-vault scope
- [Obsidian forum: Remember view mode per file](https://forum.obsidian.md/t/remember-view-mode-per-file/7069) — per-file memory is community-plugin only
- [Force note view mode plugin](https://www.obsidianstats.com/plugins/obsidian-view-mode-by-frontmatter) — frontmatter-based override
- [SilverBullet: Live Preview](https://silverbullet.md/Live%20Preview) — "Toggle Markdown Syntax Rendering" command
- [Logseq Discuss: WYSIWYG editing mode feature request](https://discuss.logseq.com/t/wysiwyg-editing-mode/2216) — confirms WYSIWYG not in Logseq
- [Logseq: Option to toggle blocks between MD and WYSIWYG modes](https://discuss.logseq.com/t/option-to-toggle-blocks-between-md-and-wysiwyg-modes/1650)
- [Zettlr config template](https://github.com/Zettlr/Zettlr/blob/master/source/app/service-providers/config/get-config-template.ts) — `renderingMode: 'preview'`
- [HedgeDoc URL scheme](https://docs.hedgedoc.org/references/url-scheme/) — `?edit`/`?view`/`?both`
- [Joplin forum: How to set Markup editor by default](https://discourse.joplinapp.org/t/how-to-set-markup-editor-by-default/23477) — `editor.codeView`
- [Outline rich-markdown-editor README](https://github.com/outline/rich-markdown-editor) — WYSIWYG-only
- [AFFiNE README](https://github.com/toeverything/AFFiNE) — blocks + edgeless only
- [TinaCMS Discussion #2571: toggle raw markdown / mdx](https://github.com/tinacms/tinacms/discussions/2571) — NOT shipped

---

## Findings

### Finding: Obsidian ships 3 canonical user-visible modes — Source / Live Preview / Reading

**Confidence:** CONFIRMED
**Evidence:** Obsidian forum user threads + Obsidian help

> "Settings > Editor > Default editing mode" lets users choose between Source Mode, Live Preview, and Reading mode. ([forum.obsidian.md/48322](https://forum.obsidian.md/t/globally-set-editors-default-mode-source-mode-live-preview-reading/48322))

Live Preview and Source are both *edit* modes (cursor can type); Reading is a render-only mode. So the "edit mode" axis is binary (Source vs Live Preview), and Reading is an orthogonal "view only" state. This is a 3-state design, not 3 parallel modes.

**Implications:** Obsidian treats view-only as a first-class mode distinct from the editing modes. Compare with Open Knowledge's current `wysiwyg` / `source` / `diff` — `diff` is ephemeral preview (like Obsidian's Reading) but for timeline entries, not for current content.

---

### Finding: Obsidian per-file mode override requires a community plugin; frontmatter key is `obsidian-ui-mode`

**Confidence:** CONFIRMED
**Evidence:** [forum.obsidian.md/t/remember-view-mode-per-file/7069](https://forum.obsidian.md/t/remember-view-mode-per-file/7069)

> "Developer bwydoogh created the 'obsidian-force-view-mode-of-note' plugin, which uses YAML front matter to control individual file display modes."

Frontmatter usage:
```yaml
---
obsidian-ui-mode: editor
---
```
or
```yaml
---
obsidian-ui-mode: render
---
```

Alternative plugin "Current View" lets you set per-folder or per-pattern rules, also via frontmatter.

**Notable UX trap** (from the forum): "if a note is locked in Preview Mode via the plugin, editing its YAML frontmatter becomes problematic within Obsidian itself" — you can't edit the key that locks the view.

**Implications:** Native Obsidian has NO per-file mode memory. The ecosystem answer is frontmatter-based, with a chicken-and-egg UX pitfall.

---

### Finding: Obsidian new-tab behavior resets to the global default — known UX friction

**Confidence:** CONFIRMED
**Evidence:** [forum.obsidian.md/48322](https://forum.obsidian.md/t/globally-set-editors-default-mode-source-mode-live-preview-reading/48322)

> "If there is a new tab opened, the selected default mode on the last tab is set back to the permanent default 'Live Preview'"

But also:
> "Whatever mode you were in when you last opened a file or a link persists to the next link or file you open."

Apparent rule: mode persists *within* a tab when you navigate to another file (same pane), but a *new* tab/pane starts from the global default.

**Implications:** Obsidian made an explicit design choice to separate "last used in this pane" (session-local) from "default for new panes" (global setting). Open Knowledge's current reset-on-refresh is the worst of both — neither sticky nor session-consistent.

---

### Finding: Logseq does NOT ship a WYSIWYG vs source toggle — it's an outliner with one view mode

**Confidence:** CONFIRMED
**Evidence:** [discuss.logseq.com: WYSIWYG editing mode request](https://discuss.logseq.com/t/wysiwyg-editing-mode/2216), [plugin: toggle-document-mode](https://github.com/dashed/logseq-plugin-toggle-document-mode)

WYSIWYG editing is an open community feature request, not a shipped feature. There's a "document mode" toggle (outliner flow vs bullet view) via a community plugin, but that's a different axis from "source vs preview."

**Implications:** Logseq is a **negative exemplar** for this research question — the dual-mode design problem doesn't apply because Logseq is single-mode-with-outliner-ergonomics. Do not treat Logseq as prior art for mode persistence.

---

### Finding: Zettlr has `renderingMode` as an app-level config with default `'preview'`, plus distraction-free as a separate mode

**Confidence:** CONFIRMED
**Evidence:** [Zettlr get-config-template.ts](https://github.com/Zettlr/Zettlr/blob/master/source/app/service-providers/config/get-config-template.ts)

```typescript
renderingMode: 'preview'
hideToolbarInDistractionFree: false
previewModeShowSyntaxWhenCursorIsAdjacent: true
muteLines: true
```

Plus ~11 granular `render*` flags (renderImages, renderMath, renderLinks, etc.) — decoration-level toggles rather than mode switches.

Zettlr is CM6-based and does CM6-style decoration-swap (like Obsidian Live Preview) — not a serialize-on-toggle dual-CRDT like Open Knowledge.

**Implications:** Zettlr's `renderingMode: 'preview'` is a global app config that persists (Electron userData). Doesn't help much for the "sticky per-user" question — their model is "one user one install, no multi-window friction" because there's no per-vault scope.

---

### Finding: SilverBullet ships Live Preview as default + "Toggle Markdown Syntax Rendering" command; state is persisted to editor config

**Confidence:** CONFIRMED
**Evidence:** [silverbullet.md/Live Preview](https://silverbullet.md/Live%20Preview), [SilverBullet GitHub](https://github.com/silverbulletmd/silverbullet)

> "Live Preview is an experience where your text looks clean, but you can still see what's under the covers and edit it directly, as opposed to WYSIWYG."

> "You can reveal the underlying markdown code, or reveal it permanently with the Toggle Markdown Syntax Rendering command."

State location (from search result): "markdownSyntaxRendering (Live Preview) state is restored from editor configuration in plugs/editor/editor.ts."

**Implications:** SilverBullet is 2-state (Live Preview on/off) with persistence via its plugin config store. CM6-based, decoration-swap model — not dual-CRDT.

---

### Finding: HedgeDoc has 3 modes (edit/view/both) selected via URL query param; no persistent default found in docs

**Confidence:** CONFIRMED (modes), UNCERTAIN (persistence)
**Evidence:** [docs.hedgedoc.org/references/url-scheme/](https://docs.hedgedoc.org/references/url-scheme/)

> "pad.example.com/longnoteid?edit — Full-screen markdown editor for the content"
> "pad.example.com/longnoteid?view — Full-screen view of the note without the editor"
> "pad.example.com/longnoteid?both — markdown editor and view mode side-by-side"

URL scheme doc provides no information about whether mode persists across sessions or is one-shot per URL. The doc reads as URL-is-the-state.

**Implications:** HedgeDoc is the ONLY surveyed editor with URL-based mode selection. It's a **share-URL mechanism** first, not a user-preference mechanism. Session-scoped or one-shot semantics — we'd need to read source to confirm.

---

### Finding: VS Code treats markdown-preview as a **separate editor type**, not a toggle mode; `workbench.editorAssociations` sets default editor per file pattern

**Confidence:** CONFIRMED
**Evidence:** [VS Code Issue #192954](https://github.com/microsoft/vscode/issues/192954)

```jsonc
"workbench.editorAssociations": {
  "*.md": "vscode.markdown.preview.editor"
}
```

"Open Preview to the Side" opens a new editor tab, not a mode toggle on the same tab.

Known limitation: `workbench.editorAssociations` "only works if VS Code is already running" — launching `code file.md` from cold start ignores it.

Setting is user-scoped (syncs via Settings Sync across machines and windows) OR workspace-scoped (per-project override).

**Implications:** VS Code's mental model differs: preview is an editor, not a mode. Interesting as a design point, less useful as a direct template because Open Knowledge has a single-editor-with-modes model.

---

### Finding: Joplin has `editor.codeView: boolean` in settings.json; persistence is buggy for new notes

**Confidence:** CONFIRMED
**Evidence:** [Joplin forum: How to set Markup editor by default](https://discourse.joplinapp.org/t/how-to-set-markup-editor-by-default/23477)

> "`editor.codeView`: true = Markdown editor, false = Rich text editor"
> "This should be persisting by default." — Joplin community (Daeraxa)

> "Changed 'editor.codeView': true false to true...then it was in markdown mode but after switching to html mode backforth then it stop showing markdown mode on new note creation mode." — bug report from user

Community plugin "Persist Editor Layout" exists to force-pin the choice per-note via tags.

**Implications:** Joplin has the closest analog to Open Knowledge's question — single boolean setting, persisted globally. Quality-of-implementation matters: their bug is exactly the "new note resets to default" pattern Obsidian also has. If Open Knowledge does this, these bugs are the surface area to guard against.

---

### Finding: Outline / AFFiNE / BlockNote / Milkdown / TinaCMS do NOT ship a source-mode toggle

**Confidence:** CONFIRMED
**Evidence:**

- **Outline:** [rich-markdown-editor README](https://github.com/outline/rich-markdown-editor) — "React and Prosemirror based markdown editor... this project is not attempting to be an all-purpose Markdown editor." WYSIWYG-only, markdown shortcuts inline, markdown export.
- **AFFiNE:** [AFFiNE README](https://github.com/toeverything/AFFiNE) — block editor + edgeless (whiteboard) mode. "AFFiNE is the one that treats a block editor and a whiteboard as two views of the same underlying document" — different mode axis (canvas vs page), not source vs WYSIWYG.
- **BlockNote:** Notion-style block editor on TipTap. No source toggle in README/docs.
- **Milkdown:** [milkdown.dev](https://milkdown.dev/) — "plugin driven WYSIWYG markdown editor framework." No first-class source mode.
- **TinaCMS:** [GitHub Discussion #2571](https://github.com/tinacms/tinacms/discussions/2571) — "Allow the rich-text editor to toggle raw markdown / mdx" is an OPEN feature request, not implemented.

**Implications:** Block-canonical editors intentionally reject dual-mode. Cross-referencing `reports/source-toggle-architecture/`: this is a known pattern and the "no source toggle" design is a deliberate choice. For the persistence research, these are just confirmations that the problem space doesn't apply there.

---

## Negative searches

- Searched for "Obsidian defaultViewMode" as app.json key — found indirectly via forum answers; not quoted in official schema docs.
- Searched for Outline source mode — found NOT FOUND (by design).
- Searched for AFFiNE source mode — found NOT FOUND; edgeless toggle is the only axis.
- Searched for SilverBullet source toggle syntax — found it's called "Toggle Markdown Syntax Rendering" (command palette command), not a mode switcher.

---

## Gaps / follow-ups

- **HedgeDoc persistence semantics** — docs say nothing about mode stickiness. Reading source would confirm whether URL param is one-shot (session-only) or whether there's a server-side per-user or per-note default. Low priority for spec; flag if spec decides URL overrides are in scope.
- **Obsidian Sync** — does Obsidian Sync (paid plugin) sync the Editor default across devices? Relevant if Open Knowledge ever syncs preferences across devices (Future Work).
