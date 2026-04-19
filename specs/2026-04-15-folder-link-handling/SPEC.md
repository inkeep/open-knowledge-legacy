# SPEC: Folder Link Handling

**Status:** Draft — ready for implementation confirmation
**Last updated:** 2026-04-15
**Owner(s):** Mike
**Related:**
- `../2026-04-10-wiki-links-backlinks/SPEC.md`
- `../2026-04-14-v0-11-graph-surface-completion/SPEC.md`
- `../2026-04-14-file-folder-ux-polish/SPEC.md`
- Evidence: `./evidence/current-state.md`
- Evidence: `./evidence/live-folder-link-usage.md`

---

## 1) Problem statement

- **Who is affected:** Writers navigating the knowledge base through wiki-links, markdown links, backlinks, forward links, graph nodes, and the file tree.
- **What hurts today:** If a link target string names an existing folder but not an existing document, the app routes to a blank editor state and typing creates a phantom `.md` file in the wrong place.
- **Why it matters:** This breaks trust in navigation, teaches the wrong mental model, and makes multiple surfaces misrepresent what exists.
- **Evidence:** Real folder-intent links already exist in project markdown, especially to `projects/<slug>`, `specs/<slug>`, `reports/<slug>`, and `evidence/` folders.

## 2) Product principle

Folders are **navigable spaces with optional landing notes**.

When a user clicks a folder-like link, the product should route them to the best existing landing surface for that space. If a landing note exists, open it. If only the folder exists, open the folder as a folder. Never pretend a missing document exists just because the string was navigated to.

## 3) Goals

- **G1:** Clicking a folder-targeting link never opens the phantom blank-document flow.
- **G2:** Folder-like targets resolve consistently across wiki-links, markdown links, backlinks, forward links, graph, and sidebar folder navigation.
- **G3:** The product establishes one canonical created folder-note convention.
- **G4:** When only a folder exists, the user gets a delightful read-only folder overview with clear next actions.
- **G5:** “Create missing page” flows become folder-aware and create the note in the right place.
- **G6:** The implementation sets a clean precedent: typed navigation targets, not one-off folder checks scattered across the app.

## 4) Non-goals

- **NG1:** Re-architecting Open Knowledge into a full “every folder is a page” model.
- **NG2:** Auto-creating notes on click.
- **NG3:** Adding a new CRDT representation or schema concept for folders.
- **NG4:** Solving every folder analytics use case (aggregated backlinks, folder-level orphan semantics, etc.) in the first slice unless required for coherence.

## 5) Current state

### Product behavior today

- Hash navigation is the single source of truth, and `App.tsx` immediately calls `openDocument(docName)` from the hash.
- `DocumentContext` is doc-only; there is no typed concept of an active folder target.
- `PageListContext` knows only documents, not folders.
- Relative markdown-link resolution normalizes to a `docName` string but does not classify doc vs folder vs missing.
- File-tree folders are real UI objects, but folder clicks only expand/collapse; they do not navigate.

### Resulting failures

- Direct-hash navigation surfaces (graph, backlinks, some internal link paths) can open the phantom blank-doc state.
- Page-aware surfaces (forward links, inline link chips) misclassify real folders as missing pages and offer the wrong creation CTA.
- The app has a split world: folders are first-class in the sidebar and nonexistent in the rest of navigation.

## 6) Proposed solution

### 6.1 Shared target model

Introduce a shared resolved target kind at the app navigation layer:

- `doc`
- `folder-index`
- `folder`
- `missing`

This is resolved once from the current path, known docs, and known folder paths before anything calls `openDocument()`.

### 6.2 Resolution hierarchy

For a target like `reports`, resolve in this order:

1. Exact document `reports`
2. Canonical folder index `reports/index`
3. Legacy folder note `reports/reports`
4. Existing folder `reports/` -> open folder overview
5. Missing target -> normal missing-page flow

### 6.3 Why not auto-open repo-specific files like `SPEC.md` or `REPORT.md`

Live repo evidence shows authors sometimes link to folders whose practical landing file is `SPEC.md`, `REPORT.md`, or `PROJECT.md`. We will **not** hardcode those repo-specific conventions into core navigation semantics.

Instead:

- The product keeps one clean, teachable explicit rule for automatic landing-note resolution: canonical `index.md`, plus compatibility support for the legacy folder-note form.
- When a real folder lacks an explicit landing note, the folder overview becomes the truthful surface.
- The folder overview can still surface a likely “primary note” card (for example a root-level `SPEC.md` or `REPORT.md`) without making those filenames part of global navigation law.

This preserves product cleanliness while still making this repo feel good in practice.

### 6.4 Folder overview UX

When the resolved target is `folder`, the main pane shows a read-only folder overview instead of the editor.

Required characteristics:

- Header with folder icon, path/breadcrumb, and folder title
- Primary CTA: `Create index note`
- Secondary CTA: `New note in folder`
- Child folders first, child documents second
- Human-friendly titles where available; raw path only as secondary metadata
- Optional “primary note” card if the folder already contains an obvious top-level doc
- No editable cursor state and no typing path that can create files from this screen

### 6.5 Surface behavior

- **Wiki-links / markdown links:** use the shared resolver before navigation
- **Backlinks / graph / forward links:** clicking target uses the same shared resolver
- **Forward-links missing state:** known-folder targets show `Folder — create index note`
- **Sidebar folders:** clicking a folder row navigates to the same folder/index logic; disclosure affordance still expands/collapses
- **Editor header / area:** render folder-specific UI instead of “new file” UI when the active target is a folder

## 7) Requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | No phantom blank-doc path for existing folders | Clicking a folder-targeting link never opens the blank new-file editor when the folder exists | Core bug fix |
| Must | Canonical created folder note is `index.md` | Every product surface that creates a landing note for a real folder creates `<folder>/index.md` | Aligns with existing folder-creation precedent |
| Must | Legacy folder-note compatibility | If `<folder>/<leaf>.md` exists, it resolves as a landing note for that folder target | Obsidian-style compatibility |
| Must | Shared typed target resolution | App code can distinguish `doc`, `folder-index`, `folder`, and `missing` from the same central resolver | Prevents split-world behavior |
| Must | Folder overview replaces editor for folder targets | Existing-folder targets with no landing note show folder overview, not TipTap/CodeMirror | Product truthfulness |
| Must | Folder-aware create CTA | Known-folder targets never say “Missing page”; they offer “Create index note” and create it inside the folder | Fixes wrong-file-location bug |
| Should | Sidebar folder selection is navigational | Folder rows can become the active selection and reveal the corresponding overview/index | Closes sidebar/navigation gap |
| Should | Graph/forward-link presentation communicates folderness | Folder targets should not look identical to ordinary live docs when the client can detect the distinction | Light visual truthfulness |

## 8) Decision log

| ID | Decision | Type | Status | Rationale |
|---|---|---|---|---|
| D1 | The mental model is “folder = navigable space with optional landing note” | Product | Proposed | Best matches user intent without pretending every folder is a doc |
| D2 | Canonical created landing note is `<folder>/index.md` | Cross-cutting | Proposed | Already matches the repo’s folder-creation precedent in UI helpers |
| D3 | Support legacy `<folder>/<leaf>.md` folder notes as a compatibility fallback | Cross-cutting | Proposed | Smooths Obsidian-style usage without making it the new standard |
| D4 | Use a shared typed target resolver at the app navigation seam, not per-panel patches | Technical | Proposed | Cleanest architecture and least duplication |
| D5 | If only a folder exists, open a read-only folder overview in the main pane | Product | Proposed | Most delightful truthful fallback; avoids ghost-doc behavior |
| D6 | Do not hardcode repo-specific landing filenames (`SPEC.md`, `REPORT.md`, `PROJECT.md`) into core auto-resolution | Product | Proposed | Keeps product semantics clean; overview can still spotlight a likely primary note |
| D7 | Sidebar folder clicks adopt the same resolution logic as link clicks | Product | Proposed | Closes a visible mental-model inconsistency |

## 9) Open questions

| ID | Question | Type | Priority | Blocking? | Current recommendation |
|---|---|---|---|---|---|
| Q1 | Should the folder overview include aggregated subtree backlinks in this first slice? | Product | P1 | No | Not required for core coherence; can follow once folder target model exists |
| Q2 | Should the graph get a distinct folder icon/badge in this slice, or is correct click behavior enough? | Product | P1 | No | Prefer a light folder distinction if it is cheap once the client can classify targets |

## 10) In scope

- Shared folder-aware resolver used by all click/navigation surfaces
- Typed active-target state at the app navigation/editor layer
- Folder overview in the main pane
- Folder-aware create-index CTA and creation destination
- Sidebar folder navigation coherence
- Correct handling for both wiki-links and markdown links

## 11) Out of scope for this slice

- Folder-level orphan semantics
- New server-side entity type for folders
- Full folder analytics surface (hubs/backlinks/orphans) unless required by implementation for correctness

## 12) Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Folder logic gets patched separately in multiple panels | High | Centralize resolution and active-target typing |
| Folder overview becomes a disguised editor and reintroduces ghost creation paths | High | Make folder overview read-only; explicit CTA for creation only |
| Repo-specific filename heuristics leak into product semantics | Medium | Keep global auto-resolution narrow; surface likely primary notes inside the overview instead |
| Folder and doc selection drift in sidebar/header/editor | Medium | Route all surfaces through the same target model and active-target rendering |

## 13) Acceptance test plan

- `[[reports]]` where `reports.md` exists -> opens `reports.md`
- `[[reports]]` where `reports/index.md` exists -> opens `reports/index.md`
- `[[reports]]` where only `reports/reports.md` exists -> opens that legacy folder note
- `[[reports]]` where only `reports/` exists -> opens folder overview
- `[Reports](./reports/)` follows the same semantics as the wiki-link cases above
- Clicking a graph/backlink/forward-link target for an existing folder never opens the blank-doc editor
- Creating an index note from a folder-aware CTA creates `<folder>/index.md` and navigates there
- Clicking a folder row in the sidebar opens the same resolved target as clicking a folder-like link

## 14) Implementation shape

- Resolve folder-vs-doc-vs-missing before `openDocument()` is called
- Keep `ProviderPool` doc-only
- Widen app state from `activeDocName` only to a typed active target
- Derive known folder paths from the existing page/doc list rather than introducing a new persistence/index layer
- Add a dedicated `FolderOverview` surface rather than teaching the editor to pretend folders are docs

## 15) Future work

- **Explored:** Aggregated subtree backlinks for folder overview
- **Explored:** Stronger graph folder presentation once typed folder targets are live
- **Noted:** Repo-configurable landing-note filename conventions if we later need product-level customization beyond `index.md` and legacy folder notes
