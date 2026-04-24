---
title: "Editor View-Mode Persistence: Prior Art Across OSS Markdown Editors"
description: "How Obsidian, Logseq, Zettlr, SilverBullet, HedgeDoc, VS Code, Joplin, and block-canonical neighbors (Outline, AFFiNE, BlockNote, Milkdown, TinaCMS) persist the user's view/edit mode across sessions, tabs, windows, and documents. Covers storage locations (per-vault config files, user-global JSON, renderer localStorage, URL state), cross-window/cross-project stickiness semantics, first-paint FOUC handling patterns, URL-based override escape hatches, the Electron ecosystem's electron-store vs localStorage vs main-process IPC trade-offs, the per-page vs global scope taxonomy (5-tier scope axis, precedence semantics, Obsidian community-plugin frontmatter precedent `obsidianUIMode` / `obsidianEditingMode`), and cross-tab preference auto-sync adoption patterns across OSS editor-like projects (storage event listener in next-themes, BroadcastChannel in tldraw, focus-based re-check in Excalidraw, no-sync in VS Code desktop)."
createdAt: 2026-04-21
updatedAt: 2026-04-21
subjects:
  - Obsidian
  - Logseq
  - Zettlr
  - SilverBullet
  - HedgeDoc
  - VS Code
  - Joplin
  - Outline
  - AFFiNE
  - Milkdown
  - TinaCMS
  - BlockNote
  - Notion
  - JupyterLab
  - RStudio
  - electron-store
  - next-themes
  - tldraw
  - Excalidraw
  - Penpot
  - BroadcastChannel API
  - CodeMirror 6
  - TipTap
topics:
  - view-mode persistence
  - editor preference storage
  - cross-window stickiness
  - per-document scope
  - precedence semantics
  - FOUC prevention
  - URL-based mode override
  - Electron preferences
  - cross-tab sync
  - storage event listener
---

# Editor View-Mode Persistence: Prior Art Across OSS Markdown Editors

**Purpose:** Document how open-source markdown editors persist the user's view/edit mode across sessions, tabs, and windows. The reader is designing a persistence layer for a dual-mode editor (WYSIWYG + source) and wants to know what prior art exists, what storage mechanisms have been tried, what UX friction those mechanisms create, and what the Electron ecosystem recommends for shared-across-BrowserWindow user preferences. Report is factual; it does not recommend a path for the consuming spec.

**Baseline commit:** `c29a5a14`

---

## Executive Summary

View-mode persistence is a less-solved problem than the landscape suggests. Every surveyed editor that ships a dual-mode UI persists the user's choice *somewhere*, but the design space is sparse and the sharpest competitor (Obsidian) has a years-old unresolved pain point around the exact "sticky across windows/projects" scenario the consuming spec is trying to solve.

**Three structural takeaways:**

1. **Scope of the preference varies more than the storage mechanism.** Storage is nearly always a JSON file or localStorage — the interesting differences are in *boundary*: per-vault (Obsidian), per-workspace + user-tier (VS Code), user-global (Joplin / Zettlr), or URL-state-only (HedgeDoc). The boundary choice is the consequential one; the storage tech usually falls out of it.

2. **Obsidian's per-vault scope is the canonical anti-pattern for "one user, one preference, many projects."** Users have complained for years that Obsidian doesn't have a user-global config. Manual vault-to-vault syncing is documented as "cumbersome." VS Code's user-tier settings (syncable across machines) are the opposite design — and widely praised as a reference.

3. **URL-override + sticky-preference composition is NOT established prior art.** HedgeDoc has URL params (`?edit`/`?view`/`?both`) but no sticky default. Sticky-preference editors (Obsidian, Zettlr, Joplin, VS Code) have no URL-mode override. No surveyed editor ships both. Adding both is slight novelty and introduces precedence questions (URL wins vs default wins) that no one else has answered.

4. **Per-document override is an under-built pattern with one canonical precedent: Obsidian's community-plugin frontmatter keys (`obsidianUIMode` / `obsidianEditingMode`).** No surveyed editor natively ships per-document mode memory — Obsidian's 5-year-old feature request still has no official response. The community plugin demonstrates clean override-with-fallback semantics and two orthogonal axes (view vs editing mode). VS Code's workspace-tier `workbench.editorAssociations` offers per-pattern routing (rule-based, not memory-based). Notion's named-views pattern is a different design (named presets, not per-doc override). Scope is a 5-tier axis — session / document / project / user-global / cross-device — that composes via precedence rules; the naive "just one global preference" is the simplest subset.

**Key Findings:**

- **Obsidian ships 3 modes (Source / Live Preview / Reading) via a "Default editing mode" setting**, stored per-vault in `.obsidian/app.json`. New-tab UX: reads the default (not last-used). Per-file overrides are community-plugin only (frontmatter key `obsidian-ui-mode`), with a chicken-and-egg trap when the frontmatter itself can't be edited in the locked mode.
- **Joplin ships `editor.codeView: boolean` in its settings.json**, persisted globally per install. Known bug: new notes sometimes ignore the persisted choice — a flag that the read/write path consistency is load-bearing.
- **VS Code treats preview as a separate editor type**, not a mode. `workbench.editorAssociations` routes `*.md` to the preview editor by default. User-scope setting, syncs via Settings Sync across machines. Has a cold-start hole: `code file.md` from a non-running state ignores the association.
- **HedgeDoc uses URL query params as the sole mode-state carrier** — no sticky user default. The URL *is* the state. Good share-link UX; poor personal-preference UX.
- **Block-canonical editors (Outline, AFFiNE, BlockNote, Milkdown, TinaCMS) do not ship a source toggle at all**. The mode-persistence problem doesn't apply to them by design; they're relevant only as scope-narrowing signals.
- **Logseq does NOT ship a WYSIWYG/source toggle**. It's an outliner; the WYSIWYG request has been open since at least 2022. Don't treat it as prior art for this question.
- **For Electron multi-window stickiness, renderer `localStorage` is the lowest-friction pattern**: Chromium shares LevelDB-backed localStorage across BrowserWindows of the same origin automatically. electron-store is the ecosystem answer when you need schema validation, migrations, encryption, or cross-*process* writes (not just cross-window).
- **FOUC prevention converges on one pattern: a synchronous inline script that reads localStorage and applies a class/attribute before React hydrates** (next-themes). Works identically in web and Electron renderer contexts. Async-IPC-to-main-process preferences cause FOUC unless the main process preloads the value into the renderer before first paint.
- **Obsidian's `obsidian-force-view-mode-of-note` plugin uses two orthogonal frontmatter keys** — `obsidianUIMode: source | preview` (editable vs Reading) and `obsidianEditingMode: live | source` (Live Preview vs Source). Precedence is override-with-fallback: frontmatter → vault `defaultViewMode` / `livePreview` global config. Hook fires on `active-leaf-change`. Escape hatch (`ignoreForceViewAll`) exists for when the frontmatter lock is inconvenient.
- **The per-doc frontmatter pattern has a chicken-and-egg trap in Obsidian** — locking a note to Reading mode makes its frontmatter uneditable, requiring a plugin-settings-level override. Open Knowledge's equivalent trap is less severe because both dual-edit modes (`wysiwyg` / `source`) are editable; only a hypothetical Reading/preview-only mode would re-introduce the trap.
- **Cross-tab preference auto-sync via the localStorage `storage` event is mainstream React-ecosystem practice, not niche.** next-themes implements it in 16 lines (silent auto-apply, filtered by key). tldraw picks the modern alternative (`BroadcastChannel` for structured messaging). Excalidraw chose focus-based lazy re-check (explicit rejection of live-sync for mid-edit surprise avoidance). VS Code desktop does NOT sync across windows live — each window is an island, requiring `Developer: Reload Window`. Adoption pattern depends on data shape: simple prefs → storage event; structured diff-based state → BroadcastChannel; large live-edit state → focus-based or no-sync.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Mode-state inventory across OSS editors (Obsidian, Logseq, Zettlr, SilverBullet, HedgeDoc, VS Code, Joplin + negative exemplars) | Moderate | P0 |
| D2 | Storage-location patterns (per-project config files, user-global JSON, localStorage, URL state) | Deep | P0 |
| D3 | Cross-window / cross-tab / cross-project stickiness semantics | Deep | P0 |
| D4 | First-paint / FOUC handling (inline script, hydration, skeletons) | Moderate | P0 |
| D5 | URL-override escape hatches (HedgeDoc precedent) | Moderate | P0 |
| D6 | Electron ecosystem recommendations (electron-store vs localStorage vs IPC) | Moderate | P0 |
| D7 | Per-page vs global scope — 5-tier scope taxonomy, precedence semantics, per-doc override precedents (Obsidian frontmatter plugin, Notion named views, VS Code workspace rules) | Moderate | P0 |
| D8 | localStorage `storage` event cross-tab sync — adoption across OSS editor-like projects (next-themes, tldraw, Excalidraw, VS Code, Penpot), 4 observed UX patterns (storage event / BroadcastChannel / focus-based / no-sync) | Moderate | P0 |

**Non-goals:** 1P analysis of Open Knowledge codebase; toggle *mechanic* (covered by [`source-toggle-architecture`](../source-toggle-architecture/REPORT.md)); mobile apps; CRDT round-trip fidelity; product recommendations; proprietary SaaS (Notion, Confluence) except as cross-reference; Tier 3/4/5 of the wider content-editing universe (docs frameworks, agent-KB tools, retrieval infra).

---

## Detailed Findings

### D1: Mode-state inventory

**Finding:** Dual-mode designs fall into three shapes: **explicit mode enum** (Obsidian, Joplin, HedgeDoc), **rendering-flag** (Zettlr, SilverBullet — one primary mode plus on/off toggles for syntax rendering), and **separate-editor-type** (VS Code, where preview is a distinct editor registered to the file extension). Block-canonical editors (Outline, AFFiNE, BlockNote, Milkdown, TinaCMS) ship neither — they have WYSIWYG only by design, and the dual-mode problem doesn't apply.

**Evidence:** [evidence/d1-mode-state-inventory.md](evidence/d1-mode-state-inventory.md)

| Editor | Modes | Mode model | Source |
|---|---|---|---|
| Obsidian | Source / Live Preview / Reading | Enum (3-state) | Settings → Editor → Default editing mode |
| Joplin | Markdown / Rich Text / Split | Boolean flip + layout | `editor.codeView` in settings.json |
| HedgeDoc | edit / view / both | Enum (3-state) | URL query param |
| VS Code | Edit / Preview | Separate editor type | `workbench.editorAssociations` |
| Zettlr | `renderingMode: 'preview'` + distraction-free + ~11 `render*` flags | Primary + decoration toggles | electron userData config |
| SilverBullet | Live Preview (default) + markdown syntax rendering toggle | Boolean on/off | Editor plugin config |
| Logseq | (none — outliner only) | N/A | N/A |
| Outline / AFFiNE / BlockNote / Milkdown / TinaCMS | (none — WYSIWYG only) | N/A | N/A |

**Implications:**

- Open Knowledge's current design (`wysiwyg` / `source` / `diff` enum with `diff` ephemeral) is closest to Obsidian's 3-state model with Reading-as-ephemeral-preview.
- If the spec adds a "Reading" or "preview-only" mode later, the Obsidian design is the prior art to read.

**Decision triggers (when this matters):**

- If the spec's mode count stays at 2 (`wysiwyg` / `source`) and `diff` remains ephemeral, Joplin's boolean model is a closer template.
- If the spec later adds a render-only mode, Obsidian's 3-state enum is the better template.

---

### D2: Storage-location patterns

**Finding:** Every surveyed editor that persists the mode stores it in one of five places: **per-project config file** (Obsidian `.obsidian/app.json`, Logseq `config.edn`), **user-global JSON in OS data dir** (Joplin settings.json, Zettlr Electron userData, Logseq `~/.logseq/config/config.edn`), **hierarchical user + workspace settings** (VS Code), **renderer localStorage** (Electron apps using same-origin shared storage), or **URL query string** (HedgeDoc, session-only).

**Evidence:** [evidence/d2-storage-location-patterns.md](evidence/d2-storage-location-patterns.md)

**The storage mechanism is usually a consequence of the scope decision**, not an independent choice:

- "Per-project preference" → per-project config file.
- "User-global preference for a desktop app" → JSON in OS userData dir (electron-store or equivalent).
- "User-global preference for a web/Electron dual-distribution app" → localStorage (shared by Chromium origin automatically in Electron).
- "Share-this-view-once" → URL query param.

**Quote:** Obsidian's community-voted pain point:
> "There is no official user-level global config in Obsidian. Each vault maintains its own `.obsidian` configuration folder, requiring users to reconfigure settings for every new vault." — summarized from [forum thread 41789](https://forum.obsidian.md/t/global-settings-same-settings-themes-and-plugins-across-multiple-vaults/41789)

**Implications:**

- For a user-global sticky preference in a web + Electron app, the renderer-localStorage pattern is both simplest and the one Open Knowledge's codebase already uses for theme (`ok-theme-v1`) and pin state (`ok-pin-v1`).
- The per-vault scope model (Obsidian) is the *wrong* template if the spec's goal is "one preference, all projects."

**Decision triggers:**

- If preferences grow beyond a single value into a schema with migrations, electron-store's JSON-with-atomic-writes + validation becomes worthwhile.
- If the spec later needs a per-project override on top of user-global, a hierarchical scheme (VS Code user + workspace tiers) is the nearest template.

---

### D3: Cross-window / cross-tab / cross-project stickiness

**Finding:** Three stickiness regimes exist in the wild: **per-project isolation** (Obsidian vaults, VS Code workspaces), **user-global identity** (Joplin / Zettlr / VS Code user-tier, all windows share one pref), and **session-only / no stickiness** (HedgeDoc). Electron apps get user-global-sticky-across-windows "for free" from Chromium's same-origin localStorage sharing; most surveyed Electron apps exploit this or use equivalent ecosystem mechanisms (electron-store's `watch: true`).

**Evidence:** [evidence/d3-cross-window-stickiness.md](evidence/d3-cross-window-stickiness.md)

**Obsidian's specific pain point** — the exact scenario the consuming spec asks about ("2 windows, one for project A, one for project B, preference should be sticky") — is well-documented as unsolved:

> "Each vault maintains its own `.obsidian` configuration folder, requiring users to reconfigure settings for every new vault. The only workaround...is cumbersome."

Inside a single Obsidian vault, "sticky" is only session-local-per-pane:
> "If there is a new tab opened, the selected default mode on the last tab is set back to the permanent default 'Live Preview'"
> "Whatever mode you were in when you last opened a file or a link persists to the next link or file you open."

This means even within the vault, a restart doesn't remember which mode you were using — it rehydrates to the global default. That's weaker than what a "sticky" preference usually implies.

**VS Code's design is the contrasting reference**: user settings are shared across all windows by default (single `settings.json` at `~/.config/Code/User/settings.json`), and Settings Sync extends this across devices.

**Implications:**

- Open Knowledge's Electron multi-window requirement ("project A and project B windows both honor my preference") is NOT novel — it's the standard user expectation, and VS Code / Joplin / Zettlr all meet it out of the box. Obsidian is the outlier.
- Chromium-origin-shared localStorage satisfies the requirement with zero plumbing for the Electron distribution, AND the same code works for the web/CLI distribution without modification.

**Decision triggers:**

- If future work introduces per-project settings partitioning (`session.fromPartition('project-A')`), localStorage no longer shares across windows — electron-store becomes the right tool.
- If preferences need to sync across devices (not just across windows on one device), neither localStorage nor electron-store covers it; VS Code's Settings Sync model would need to be built.

---

### D4: First-paint / FOUC handling

**Finding:** The convergent FOUC-prevention pattern is a **synchronous inline script in the HTML head that reads the persisted value from localStorage and applies a class or attribute to `<html>` before React hydrates**. next-themes (widely adopted in the React ecosystem and used by Open Knowledge for theme) implements this via its `ThemeScript` component. Async IPC-based preference fetches (the default path when using electron-store from a renderer) cannot be made FOUC-free without a main-process preload that injects the value synchronously.

**Evidence:** [evidence/d4-first-paint-fouc.md](evidence/d4-first-paint-fouc.md)

next-themes injection:
```tsx
<script dangerouslySetInnerHTML={{
  __html: `(${script.toString()})(${scriptArgs})`
}} />
```

The inline script runs blocking-synchronous, reads `localStorage.getItem(storageKey)`, applies the resolved value via `document.documentElement.setAttribute(...)` or `classList.add(...)`. localStorage access is microseconds; total added first-paint time is imperceptible.

**Implications:**

- Same pattern ports to editor mode: inline script → read `ok-editor-mode-v1` → set `data-editor-mode` attribute or emit to a module-level variable that React reads on first render.
- localStorage-as-source-of-truth is the enabler: its synchronous access is what makes FOUC-free first paint possible with ~10 lines of code. electron-store's main-process-only default breaks this.

**Decision triggers:**

- If the spec chooses localStorage: FOUC is solved trivially. Add an inline script or emit one from the React tree.
- If the spec chooses electron-store or any async-IPC preference: either accept FOUC (bad UX), add main-process preload plumbing, or mirror to localStorage (two sources of truth).

---

### D5: URL-override escape hatches

**Finding:** HedgeDoc is the **only surveyed editor** with URL-based mode selection. Its model is bare-query-key (`?edit`, `?view`, `?both`) parsed by the frontend at mount. No sticky user default is documented — the URL is the state. **No surveyed editor ships BOTH a sticky user preference AND a URL-override escape hatch.** The composition is novel territory.

**Evidence:** [evidence/d5-url-override-patterns.md](evidence/d5-url-override-patterns.md)

Editor-by-editor URL-override status:

| Editor | Sticky pref? | URL override? |
|---|---|---|
| Obsidian | Per-vault | No (`obsidian://open` has no `mode` param) |
| Zettlr / Joplin | User-global | No |
| VS Code | User + workspace tiers | No (`code file.md` from cold start ignores `workbench.editorAssociations`) |
| HedgeDoc | No (URL is state) | Yes (`?edit` / `?view` / `?both`) |

**Implications:**

- Adding a URL override on top of a sticky preference is a design the consuming spec would be inventing, not borrowing. Precedence semantics (URL wins → override one-shot? URL wins → update sticky? default wins?) would need explicit design.
- HedgeDoc's share-link UX is the strong use case; the spec's intake already classified URL overrides as P2 / Future Work, which aligns with the rarity of the pattern in prior art.

**Decision triggers:**

- If shareable "open this doc in view-only" becomes a first-class need, HedgeDoc's URL scheme is the reference. Bare-query-key (`?source`) vs keyed (`?mode=source`) is a secondary choice; keyed is more extensible.
- If the spec stays at "sticky only," nothing needs to be designed for URL overrides now.

---

### D6: Electron ecosystem recommendations

**Finding:** The ecosystem-canonical library for Electron preferences is **electron-store** (JSON in `app.getPath('userData')`, atomic writes, migrations, cross-process watch). However, **for preferences that are renderer-only, single-value, and FOUC-sensitive, renderer localStorage is simpler, already shared across BrowserWindows of the same origin, and compatible with the next-themes FOUC pattern.** The choice between the two is driven by whether the preference needs schema/validation/migrations/encryption — not by whether the app is Electron.

**Evidence:** [evidence/d6-electron-ecosystem-patterns.md](evidence/d6-electron-ecosystem-patterns.md)

Decision table:

| Requirement | Pattern |
|---|---|
| Simple boolean / enum, renderer-only, web + Electron parity | `localStorage` with versioned key |
| Structured object, schema-validated, migrations, encryption | `electron-store` |
| Preference touched by main process (menu, tray, multi-window coordination) | `electron-store` or custom IPC |
| Preference must survive localStorage corruption | `electron-store` (atomic writes via `write-file-atomic`) |
| Preference shared across *different-origin* BrowserWindows | `electron-store` with `watch: true` |

**Chromium localStorage semantics in Electron** (quoted from the ecosystem search):
> "Each window shares localStorage by default if they have the same origin (domain/port)."
> "In Electron, localStorage and sessionStorage are stored in LevelDB across Windows, macOS, and Linux, but both are limited to approximately 5 MB per origin."

**Implications:**

- For a single editor-mode preference in Open Knowledge's web + Electron dual distribution, localStorage matches the existing `ok-theme-v1` / `ok-pin-v1` repo pattern, gives cross-window stickiness in Electron for free, and composes with the next-themes FOUC pattern.
- Upgrading to electron-store later is always available if preferences become structured.

**Decision triggers:**

- If Open Knowledge adds per-project session partitioning via `session.fromPartition`, localStorage stops being cross-window-shared → electron-store becomes necessary.
- If preferences grow beyond the single-key-versioned model into an object with fields that need schema enforcement, electron-store (or a hand-rolled schema-validated store) becomes warranted.

---

### D7: Per-page vs global scope

**Finding:** Scope axes in the wild form a **5-tier taxonomy** — session / document / project / user-global / cross-device. Most surveyed editors implement 2-3 tiers (session-local + one durable tier, optionally cross-device). The **per-document tier is under-built**: only Obsidian offers it, and only via a community plugin with two orthogonal frontmatter keys (`obsidianUIMode` + `obsidianEditingMode`). No surveyed editor implements per-document override natively. VS Code's workspace-tier is rule-based (per-pattern routing) rather than per-file-memory-based. Notion uses named-view-presets, a different design pattern. Precedence semantics across tiers follow 5 observed patterns: override-with-fallback, hierarchical inheritance, session-on-top-of-durable, URL-authoritative, and named-presets.

**Evidence:** [evidence/d7-per-page-vs-global-scope.md](evidence/d7-per-page-vs-global-scope.md)

**Scope taxonomy (5-tier):**

| Tier | Scope | Durable? | Examples |
|---|---|---|---|
| 1 | Session-only (per-pane / per-tab / per-URL-load) | No | Obsidian pane last-used, VS Code tab editor type, HedgeDoc URL |
| 2 | Per-document (persistent) | Yes | Obsidian frontmatter plugin — **community only, no native support in surveyed editors** |
| 3 | Per-project / per-workspace | Yes | Obsidian vault `app.json`, VS Code workspace settings, Logseq graph config.edn |
| 4 | User-global (per-install) | Yes | Joplin, Zettlr, VS Code user settings, Electron renderer localStorage |
| 5 | Cross-device | Yes | VS Code Settings Sync, Obsidian Sync plugin (paid; per-vault) |

**Obsidian plugin precedent — two orthogonal frontmatter keys:**
```yaml
---
obsidianUIMode: source      # or "preview" — editable vs Reading-mode-render
obsidianEditingMode: live   # or "source" — Live Preview vs Source within editing view
---
```

Reference implementation ([obsidian-force-view-mode-of-note/main.ts](https://github.com/bwydoogh/obsidian-force-view-mode-of-note/blob/master/main.ts)):
- Hook: `workspace.on("active-leaf-change", ...)` — fires when opening or navigating to a note.
- Fallback: per-doc frontmatter → `vault.config.defaultViewMode` / `vault.config.livePreview` (Obsidian app.json keys).
- Escape hatch: `ignoreForceViewAll` plugin setting to globally disable the override.
- Orthogonality: `obsidianUIMode` and `obsidianEditingMode` applied independently.

**Confirmed Obsidian `app.json` keys** (from the plugin's fallback code path):
- `defaultViewMode: "source" | "preview"` — view-mode default.
- `livePreview: boolean` — within the editing view, picks Live Preview vs Source.

This is more precise than D2's original evidence (which described the default-editing-mode setting abstractly).

**Precedence patterns observed across the surveyed landscape:**

| Pattern | Description | Examples |
|---|---|---|
| Override-with-fallback | Higher tier wins if present; otherwise fall back | Obsidian plugin: frontmatter → app.json |
| Hierarchical inheritance | Each tier can override lower tier; cascading | VS Code: folder → workspace → user |
| Session-on-top-of-durable | Session-local override layered on top of durable; discarded on close | Obsidian pane last-used |
| URL-authoritative | No fallback; URL is the state | HedgeDoc `?edit`/`?view`/`?both` |
| Named-presets | Multiple parallel named views; user picks | Notion database views |

**Not observed in the landscape** — per-user per-document override in a collaborative editor. Notion's "personal view changes only apply to you and won't affect other people's views" is the closest analog, but operates at the named-view level, not the mode-toggle level.

**Implications:**

- The current spec decision (D1 = global user preference only) implements tier 4. This is the simplest subset, matches Joplin / Zettlr / VS Code user-tier precedent, and composes cleanly with the cross-window-sticky-via-localStorage pattern from D3/D6.
- If per-document override becomes in-scope later, the Obsidian plugin is the reference precedent. Frontmatter-declared override is compatible with Open Knowledge's existing YAML frontmatter infrastructure.
- If per-project override becomes in-scope (different projects, different defaults), VS Code's workspace tier is the reference — but it's a larger change (requires per-project config plumbing, precedence resolver).

**Decision triggers (when this matters):**

- If the spec stays at "one global preference for all projects/docs/windows," tier 4 is enough. No new taxonomy work.
- If a "this file should always open in Source" user request surfaces after launch, Obsidian's community plugin is the pattern to borrow (frontmatter key + leaf-change hook + fallback-to-global).
- If multi-project multi-preference ("I want Source for code projects, WYSIWYG for prose projects") surfaces, the spec needs a per-project tier, which is a larger architectural change.
- If the collaboration model evolves to per-user per-doc preferences, Notion's "personal views" pattern becomes the reference — but this is a future-direction design, not a v1 feature.

**Design options catalog (factual, for spec consumption):**

- **X1 — No per-doc override** (current spec D1). Single global preference. Ships fastest.
- **X2 — Frontmatter-declared override** (Obsidian plugin precedent). Per-doc `ok-editor-mode` key overrides global. Composes with existing frontmatter.
- **X3 — Hierarchical project → user** (VS Code precedent). Per-project config layer with user-global fallback.
- **X4 — Per-doc session memory** (Obsidian pane last-used). In-memory per-doc map, discarded on restart. Weakest option — users want durability.
- **X5 — Named presets** (Notion precedent). User defines "coding mode" = Source preset. Future direction.

---

### D8: localStorage `storage` event cross-tab sync adoption

**Finding:** Cross-tab preference sync is a **mainstream pattern in the React/web ecosystem**, implemented across multiple OSS editor-like projects via four distinct mechanisms. The `storage` event listener pattern (next-themes) is the lightest-weight and idiomatic for simple preferences. `BroadcastChannel` (tldraw) is the modern structured-messaging alternative. `focus`-based lazy re-check (Excalidraw) is the "don't surprise the user mid-edit" alternative for large-state editors. VS Code desktop is the notable negative exemplar — windows are independent islands, no live cross-window sync.

**Evidence:** [evidence/d8-storage-event-cross-tab-sync.md](evidence/d8-storage-event-cross-tab-sync.md)

**Pattern taxonomy:**

| Pattern | Mechanism | UX characteristic | Surveyed example | Code shape |
|---|---|---|---|---|
| A. **storage event listener** | `window.addEventListener('storage', ...)` filtering by key | Silent, immediate auto-apply | [next-themes](https://github.com/pacocoursey/next-themes/blob/main/next-themes/src/index.tsx) | ~16 lines; filter by storageKey, call setThemeState(e.newValue) |
| B. **BroadcastChannel** | `new BroadcastChannel(name)` with typed messages | Immediate auto-apply + structured diffs | [tldraw](https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/utils/sync/TLLocalSyncClient.ts) | Typed `diff` / `announce` message shapes; per-persistence-key channel; origin-ID tracking |
| C. **focus-based re-check** | `focus` event → version check in localStorage → re-render if out-of-sync | Lazy; only syncs when user returns to tab | [Excalidraw (post-#4545)](https://github.com/excalidraw/excalidraw/issues/2791) | Check scene version on focus; rerender if newer |
| D. **No cross-window sync** | N/A; explicit "Reload Window" command | Each window is independent | [VS Code desktop](https://code.visualstudio.com/docs/configure/settings-sync) | Settings Sync is machine-to-machine, not window-to-window |

**next-themes reference implementation** (16 lines from lines 211-227):
```tsx
const handleStorage = (e: StorageEvent) => {
  if (e.key !== storageKey) {
    return
  }
  if (!e.newValue) {
    setTheme(defaultTheme)
  } else {
    setThemeState(e.newValue)
  }
}

window.addEventListener('storage', handleStorage)
return () => window.removeEventListener('storage', handleStorage)
```

No debounce, no user notification, no confirm-before-apply. The storage event fires only in *other* tabs (never the originating tab — browser guarantee), so no self-echo concern. When the key matches and `newValue` is non-null, call the same state setter the local toggle uses.

**tldraw deliberate choice to use BroadcastChannel instead:**
- Channel name: `tldraw-tab-sync-${persistenceKey}` — scoped per workspace.
- Message types: `{ type: 'diff', storeId, changes, schema }` and `{ type: 'announce', schema }`.
- Per-tab unique origin ID to filter out own broadcasts (BroadcastChannel, unlike storage event, *does* echo to sender).
- Apply remote diff transactionally: `store.mergeRemoteChanges(() => store.applyDiff(msg.changes))`.

**Excalidraw explicit rejection of live-sync:**
The issue proposer wrote: *"Check localStorage scene version on focus and rerender if out of sync."* PR #4545 merged this pattern. Trade-off: no live cross-tab sync, but no surprise re-renders mid-edit. Makes sense for the scene-graph state of a drawing tool; overkill for simple preferences.

**VS Code desktop negative exemplar:**
> "Tabs in one window won't update in real-time if modified in another. Additionally, each window maintains its own state (e.g., open files, split editors)."
> "Settings Sync operates on a machine-to-machine basis (synchronizing across different computers), but does not provide live hot-reload synchronization between multiple VS Code windows on the same machine."

To pick up settings changes in another window, the user must run `Developer: Reload Window`. File-backed settings (`settings.json`) + no file-watcher-live-apply = each window is a sealed session.

**Implications:**

- For simple primitive preferences (single enum, single boolean) in a React/web context, the storage event listener pattern is the idiomatic, lightest-weight choice. It's not niche — every next-themes app in the wild is doing this, often unbeknownst to its developers.
- Editor mode persistence fits the "simple primitive preference" shape exactly: one enum value, no diff state, no mid-edit destructive apply. Pattern A (storage event) is the natural fit.
- The "auto-sync is disruptive" concern Excalidraw addressed is real for *large document state*, not for *simple preferences*. Preference sync flipping a CSS class or swapping a visible editor is low-disruption; the content doesn't change.
- VS Code's "each window is an island" design is consistent with its workspace-isolated model — and is the exception, not the rule, in web/web-tech apps.

**Decision triggers:**

- If Open Knowledge stays with simple global preference → Pattern A (storage event listener) is the natural fit, matches next-themes' precedent, 16 lines of code.
- If preferences later grow into a multi-field structured object with schema → Pattern B (BroadcastChannel) becomes worthwhile for typed diff messaging.
- If editor mode persistence ever expands to include large in-memory state (e.g., scrollTop + selection + folded-ranges), Pattern C (focus-based) becomes a defensible alternative — but none of that fits the current spec.
- If Open Knowledge decides each window should be an independent island (it has said the opposite via the "sticky through there too" ask), Pattern D — but this contradicts user intent.

---

## Cross-Cutting Patterns: What Converges, What Diverges

**What converges across the landscape:**

1. **JSON as the serialization layer.** `app.json`, `settings.json`, `config.json`, `workspace.json` — every surveyed editor uses JSON for its preference file. EDN (Logseq) is an outlier but structurally analogous.
2. **Versioned storage keys in localStorage are the norm.** Open Knowledge's `ok-*-v1` pattern is industry standard (next-themes uses the same shape).
3. **Inline-script FOUC mitigation.** next-themes is the canonical pattern; no surveyed web-distribution editor does anything fundamentally different.
4. **Write on user action, read on mount.** No editor tries to persist mid-mode-transition (obvious but worth noting — the storage layer is trailing-edge on user choice, not leading).

**Where editors diverge:**

1. **Preference scope.** The single biggest axis of variation. Per-vault (Obsidian) is universally lamented; user-global (Joplin, Zettlr, VS Code user-tier) is universally praised; hierarchical user + workspace (VS Code) is the richest model but requires scope plumbing.
2. **New-tab / new-pane behavior.** Obsidian resets to global default (friction). VS Code opens each markdown file via its `workbench.editorAssociations` rule (consistent). Joplin *should* remember but reportedly has bugs for new notes.
3. **Per-file override.** Obsidian via community plugins with two orthogonal frontmatter keys (`obsidianUIMode` + `obsidianEditingMode`) using override-with-fallback precedence. VS Code workspace-tier does per-pattern rule-routing (not per-file memory). Others don't support it at all. No surveyed editor implements per-document mode memory *natively*.
4. **URL-based override.** HedgeDoc is the lone example; every other surveyed editor uses settings-only.
5. **Scope tier composition.** Most editors implement 2-3 of the 5 possible scope tiers (session / doc / project / user-global / cross-device). The gaps are deliberate design choices — Zettlr skips project and doc tiers because it's single-user-single-install; VS Code skips doc-level because its editor-per-file model doesn't need it; Obsidian lacks user-global because its vault-scoped identity is the product differentiator.
6. **Cross-tab auto-sync mechanism.** The four patterns (storage event / BroadcastChannel / focus-based / no-sync) are genuine alternatives — not just "did they think of it." React/web editors tend toward live-sync (Patterns A/B); document-state editors choose lazy sync (Pattern C) to avoid mid-edit disruption; desktop-feeling editors (VS Code) choose window-isolation (Pattern D). The design choice depends on what's being synced (primitive vs structured) and when surprise is acceptable (preferences: fine; live document: not fine).

**Anti-pattern inventory (what the landscape teaches NOT to do):**

- **Don't scope preferences per-project when users expect user-global** (Obsidian's lesson; open complaint for years).
- **Don't make new-tab/new-note behavior diverge from the user's visible last-used mode** (Obsidian + Joplin friction).
- **Don't put the mode behind a chicken-and-egg UX lock** (Obsidian plugin "lock in preview mode" prevents editing the frontmatter that unlocks it). If Open Knowledge introduces per-doc override, ensure both toggleable modes are editable (avoid locking into a read-only mode from which the user can't escape without a plugin-level setting).
- **Don't couple mode state to URL when users want it to persist** (HedgeDoc's UX model — "URL is the state" — is great for shareables, poor for preference).
- **Don't async-fetch the preference after render** (FOUC — the spec says "apply on mount").
- **Don't conflate "named-view-presets" with "per-doc mode override"** (Notion's multiple-saved-views and Obsidian's per-doc-frontmatter are different design patterns with different composition semantics).

---

## Limitations & Open Questions

### Dimensions covered at moderate depth (could go deeper)

- **Obsidian Sync** — whether it syncs `app.json` (and thus the default editing mode) across devices for the same vault. Not pursued because spec scope is single-install.
- **HedgeDoc frontend source** — whether URL is re-read on every render vs only on mount. Not pursued because URL override is P2 in the rubric.
- **VS Code Settings Sync behavior for `workbench.editorAssociations` specifically** — high likelihood it syncs (user-tier, and Settings Sync covers user tier) but not verified against Settings Sync's exclusion list.
- **Joplin's "new note resets" bug root cause** — would be valuable to read the source and understand whether it's an ordering issue (read after first render) or a logic issue (wrong default for new notes).
- **SilverBullet plug system** — SilverBullet's plug-based architecture could conceivably allow a plug to declare "this page always opens in raw markdown mode" via page metadata. Not confirmed; would require reading their plug runtime.
- **MarkText and other Electron OSS markdown editors not surveyed** — would confirm whether per-document frontmatter mode is a unique-to-Obsidian pattern or appears elsewhere natively.

### Not pursued (per rubric non-goals)

- Mobile app behavior (Obsidian mobile, Logseq mobile).
- CRDT round-trip fidelity implications of mode switching.
- Performance of mode transitions.
- Product recommendations (factual stance).

### Genuine UNCERTAIN items

- **HedgeDoc mode persistence across page reloads.** The docs say nothing. The pattern implies session-only; reading source would confirm.
- **Exact Logseq mode-preference storage key**, if one exists for the block-level document-mode plugin. Low signal; Logseq is a negative exemplar for this research.

---

## References

### Evidence Files

- [evidence/d1-mode-state-inventory.md](evidence/d1-mode-state-inventory.md) — Per-editor mode inventory, including negative exemplars
- [evidence/d2-storage-location-patterns.md](evidence/d2-storage-location-patterns.md) — Where each editor persists the mode preference
- [evidence/d3-cross-window-stickiness.md](evidence/d3-cross-window-stickiness.md) — Multi-window, multi-project, multi-tab stickiness semantics
- [evidence/d4-first-paint-fouc.md](evidence/d4-first-paint-fouc.md) — next-themes pattern + Electron FOUC implications
- [evidence/d5-url-override-patterns.md](evidence/d5-url-override-patterns.md) — HedgeDoc's URL scheme + comparison to others
- [evidence/d6-electron-ecosystem-patterns.md](evidence/d6-electron-ecosystem-patterns.md) — electron-store vs localStorage vs IPC
- [evidence/d7-per-page-vs-global-scope.md](evidence/d7-per-page-vs-global-scope.md) — 5-tier scope taxonomy, precedence patterns, Obsidian frontmatter plugin source-level analysis, Notion/JupyterLab/RStudio contrast
- [evidence/d8-storage-event-cross-tab-sync.md](evidence/d8-storage-event-cross-tab-sync.md) — `storage` event adoption survey across next-themes, tldraw, Excalidraw, VS Code, Penpot; 4 cross-tab sync patterns with primary-source code

### External Sources

- [Obsidian help: Configuration folder](https://obsidian.md/help/configuration-folder)
- [Obsidian forum: Globally set Editor's default Mode](https://forum.obsidian.md/t/globally-set-editors-default-mode-source-mode-live-preview-reading/48322)
- [Obsidian forum: Remember view mode per file](https://forum.obsidian.md/t/remember-view-mode-per-file/7069)
- [Obsidian forum: Global Settings across multiple vaults](https://forum.obsidian.md/t/global-settings-same-settings-themes-and-plugins-across-multiple-vaults/41789)
- [obsidian-force-view-mode-of-note plugin](https://www.obsidianstats.com/plugins/obsidian-view-mode-by-frontmatter)
- [HedgeDoc URL scheme](https://docs.hedgedoc.org/references/url-scheme/)
- [HedgeDoc GitHub](https://github.com/hedgedoc/hedgedoc)
- [Joplin forum: How to set Markup editor by default](https://discourse.joplinapp.org/t/how-to-set-markup-editor-by-default/23477)
- [Zettlr get-config-template.ts](https://github.com/Zettlr/Zettlr/blob/master/source/app/service-providers/config/get-config-template.ts)
- [SilverBullet: Live Preview](https://silverbullet.md/Live%20Preview)
- [SilverBullet GitHub](https://github.com/silverbulletmd/silverbullet)
- [Logseq Discuss: WYSIWYG editing mode feature request](https://discuss.logseq.com/t/wysiwyg-editing-mode/2216)
- [VS Code Settings Sync](https://code.visualstudio.com/docs/configure/settings-sync)
- [VS Code settings.json docs](https://code.visualstudio.com/docs/configure/settings)
- [VS Code Issue #192954: workbench.editorAssociations for markdown preview](https://github.com/microsoft/vscode/issues/192954)
- [Outline rich-markdown-editor](https://github.com/outline/rich-markdown-editor)
- [AFFiNE GitHub](https://github.com/toeverything/AFFiNE)
- [Milkdown](https://milkdown.dev/)
- [TinaCMS Discussion #2571: toggle raw markdown](https://github.com/tinacms/tinacms/discussions/2571)
- [electron-store](https://github.com/sindresorhus/electron-store)
- [next-themes (pacocoursey)](https://github.com/pacocoursey/next-themes)
- [obsidian-force-view-mode-of-note plugin source](https://github.com/bwydoogh/obsidian-force-view-mode-of-note) — canonical per-doc frontmatter precedent
- [Notion Help: Views, filters, sorts & groups](https://www.notion.com/help/views-filters-and-sorts) — named-view-presets pattern
- [Notion Developer Guides: Working with views](https://developers.notion.com/guides/data-apis/working-with-views)
- [JupyterLab nbformat docs](https://nbformat.readthedocs.io/en/latest/format_description.html) — per-document JSON metadata precedent
- [R Markdown integration in RStudio IDE](https://rmarkdown.rstudio.com/articles_integration.html) — YAML `output` as render-target declaration
- [Zettlr YAML Frontmatter docs](https://docs.zettlr.com/en/editor/yaml-frontmatter/) — confirmed absence of per-file mode override
- [next-themes storage handler source](https://github.com/pacocoursey/next-themes/blob/main/next-themes/src/index.tsx) — canonical storage-event cross-tab sync implementation
- [tldraw TLLocalSyncClient.ts](https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/utils/sync/TLLocalSyncClient.ts) — BroadcastChannel-based alternative
- [tldraw user preferences docs](https://tldraw.dev/sdk-features/user-preferences) — cross-tab pref sync description
- [Excalidraw Issue #2791: Sync state between tabs](https://github.com/excalidraw/excalidraw/issues/2791) — focus-based re-check pattern + rationale

### Related Research

- [reports/source-toggle-architecture/REPORT.md](../source-toggle-architecture/REPORT.md) — Architecture-layer companion covering the mechanic of WYSIWYG ↔ source toggle (serialize-on-toggle vs dual-CRDT) that this report deliberately scopes out. Read together for a complete picture of dual-mode editor design.
