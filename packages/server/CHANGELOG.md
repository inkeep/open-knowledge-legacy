# @inkeep/open-knowledge-server

## 0.4.0

### Minor Changes

- fbfe967: Asset-click parity closure (2026-04-24b amendment) — four defects closed end-to-end after dogfood surfaced a `.m4v` click flow that fell through to Vite's SPA fallback:

  - Serve-side: widen `ASSET_EXTENSIONS` to common user-drop extensions; add `Content-Disposition` dispatch in the Vite plugin's sirv middleware (inline for renderable, attachment for everything else); harden SPA fallback to 404 for asset-extension paths sirv didn't serve.
  - Renderer: FR-A5 `wikiLinkEmbed` NodeView (`packages/app/src/editor/extensions/wiki-link-embed.ts`) lands with InteractionLayer registration — drop-time chip clicks now route through `dispatchAssetClick` end-to-end.
  - Classifier guard: softened `internal-link.ts` asset-branch guard to catch `sourceForm === 'wikiembed'` + has-extension hrefs regardless of `classifyMarkdownHref` return kind; `resolveAssetProjectPath` accepts leading-slash paths as project-root-relative.
  - Security: widen `EXECUTABLE_BLOCKLIST_EXTENSIONS` with macOS installer classes (`.dmg`/`.pkg`/`.scpt`/`.applescript`/`.terminal`/`.prefpane`/`.mpkg`), URL-file classes (`.webloc`/`.inetloc`/`.fileloc`), cross-platform packages (`.jar`/`.appimage`/`.deb`/`.rpm`/`.msix`/`.appx`/`.ipa`/`.apk`), and Windows shortcut classes (`.pif`/`.scr`/`.lnk`/`.url`).

  Classifier taxonomy cleanup (moving the asset-ext branch above the leading-slash guard in `classifyMarkdownHref` itself) is deferred to a follow-up PR — see `specs/2026-04-16-editor-asset-and-embed-surface/evidence/classifier-taxonomy-cleanup.md` for the full Option A vs Option B trade-off + Docmost/Obsidian peer-editor comparison.

- fbfe967: feat(editor): asset upload + `![[file.ext]]` wiki-embed surface

  Any file drop is accepted by the editor — there is no user-facing byte cap. PDFs, video, audio, archives, and fonts stop hitting the old "Unsupported file type" dead-end. The emit shape is picked by extension: markdown files (`.md` / `.mdx`) emit as `[[basename]]` wiki-links (link-semantic, navigable on Cmd-click, resolved via `fileIndex` — markdown is a first-class OK doc, not an opaque asset); images + typed renderable files (PDF, MP4, WebM, MP3, WAV, OGG, M4A, MOV) emit as `![[file.ext]]` wiki-embeds; opaque files emit as `[name](path)` markdown links. Uploads stream to disk end-to-end (memory footprint is O(1), not O(fileSize)), so the only rejection axis is disk fullness (`storage-full` → HTTP 507). See [`reports/streaming-upload-refactor/REPORT.md`](reports/streaming-upload-refactor/REPORT.md) for the refactor rationale.

  Same-directory sha256 dedup returns existing paths on duplicate drops with a toast (`"Already at <path> — reusing."`). Renaming a doc that contains image refs recomputes the relative path; absolute refs and wiki-embed refs are untouched because the basename index resolves them dynamically.

  New HTTP surface on the server:

  - `POST /api/upload` — upload endpoint. Success response: `{ ok, src, path, deduped }` where `src` is the asset's basename and `path` is the contentDir-relative location (colocated with the referencing doc). Error responses carry a typed `error` reason (`malformed-upload` / `storage-full` / `storage-readonly` / `collision-exhaustion` / `storage-error`) plus a human-readable `message`.

  No user-facing `upload.*` config. Attachment placement (co-located), emit shape (`![[...]]` for supported extensions), same-directory sha256 dedup with a toast notice, and the wiki-embed extension list are fixed defaults. Every value is a module-level constant in `@inkeep/open-knowledge-core/constants/upload.ts`. One-shot Obsidian-vault migration CLI deferred to a future spec — OK does not read `.obsidian/app.json` at runtime; refugees whose vault uses non-default config shape wait for the future migrator. Legacy configs still carrying `upload.*` keys parse cleanly (unknown keys are silently stripped).

  File watcher now emits `asset-create` / `asset-delete` DiskEvents alongside the existing markdown events; CC1 `ch:'files'` signal coalesces both so file-sidebar and basename-index rebuilds piggyback on one broadcast. `sanitizeFilename` preserves Unicode code points (letters, digits, marks, punctuation, emoji) while stripping path separators and control bytes.

  Full spec + decision log (D1–D-M): [`specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`](specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md). Operator-facing guide: [Assets and embeds](docs/content/guides/assets-and-embeds.mdx).

  **Asset-click dispatcher + OS-integration surface (2026-04-23 amendment).** Click a `![[meeting.pdf]]` embed and the PDF opens predictably — a new browser tab in web, `shell.openPath` in Electron. Previously post-reload clicks routed through the doc-link navigator and failed silently (Gap 3b); Electron drop-time clicks replaced the editor window (Gap 4). Both gaps close.

  - `ClassifiedLinkTarget` gains a first-class `{kind: 'asset', url, ext}` variant; `resolveAssetProjectPath` resolves relative hrefs against the source doc's directory.
  - Renderer-side dispatcher + empty-at-landing viewer registry at `packages/app/src/editor/asset-dispatch/` — future PRs register PDF.js / image lightbox / video-audio viewers as ~40-60 LOC plugins without modifying the dispatch layer.
  - Three new Electron IPC channels (`ok:shell:open-asset`, `ok:shell:reveal-asset`, `ok:shell:show-asset-menu`). Main-process `openAssetSafely` enforces path containment (`realpath` + `isPathWithinProject`), existence, and an executable-extension blocklist (`.exe`/`.sh`/`.html`/`.svg`/…) source-verified from Obsidian 1.12.7. Renderer sends project-relative paths; containment fires at the IPC boundary.
  - Right-click any on-disk reference (asset chip, wiki-link chip, image) → native OS menu with Reveal in Finder / Show in Explorer + Open in default app + Copy link. Gesture-attested (main observes the click directly).
  - Defense-in-depth: `setWindowOpenHandler` + `will-navigate` on the editor webContents intercept any asset URL that escapes the renderer dispatcher (pasted `<a href>`, plugin content, drop-time `<a target="_blank">`). Same path containment + blocklist enforced on every entry point.

  Full amendment (US-A1..A6, FR-A1..A8, NG-A1..A6, D-A1..A12): [`specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`](specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md) §Post-finalization amendment (2026-04-23). Research: [`reports/electron-os-integration-patterns/`](reports/electron-os-integration-patterns/) + [`reports/editor-asset-embed-patterns-across-universe/`](reports/editor-asset-embed-patterns-across-universe/) D9.

- 7242822: feat(cb-v2): generalizable file-upload prop affordance + legacy image-slash removal

  Unifies the two parallel media-insertion paths that emerged on the lowercase media canonical pivot. The legacy `image` slash command (file-picker → `/api/upload-image` → inline image PM node) is removed; the descriptor-driven slash menu now carries the upload UX through the PropPanel `src` field.

  Two new optional fields on `PropDefString` declare the affordance:

  - **`accept?: readonly string[]`** — when set, the auto-rendered PropPanel control adds an upload icon-button next to the URL input. Wildcards (`image/*`) and `.ext` shortcuts are valid per the HTML `<input accept>` spec; the array is joined to a comma-string at the input boundary.
  - **`autoFocus?: boolean`** — focuses this prop's input on PropPanel mount. Mirrors the React DOM convention. First match in declared order wins.

  The `src` prop on each media descriptor (`htmlImgProps[0]`, `htmlVideoProps[0]`, `htmlAudioProps[0]`) carries both, so picking "Image" / "Video" / "Audio" from the slash menu now opens the PropPanel with `src` focused and an upload button ready.

  Server endpoints `/api/upload-video` and `/api/upload-audio` mirror `/api/upload-image`'s atomic-write + magic-byte MIME validation discipline. Per-endpoint allowlists:

  - `ALLOWED_VIDEO_MIME_TYPES`: `video/mp4`, `video/webm`, `video/ogg`
  - `ALLOWED_AUDIO_MIME_TYPES`: `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/webm`

  All three handlers share an internal `uploadMediaCore` helper — single source of truth for path validation, magic-byte sniffing, atomic write, and clipboard-paste filename synthesis. New uploads go through a generalized `uploadFile(file, accept) → Promise<{url}>` client helper that routes by MIME-type prefix (`image/`, `video/`, `audio/`).

  What changed for authors:

  - **Slash menu shows exactly 5 component-block entries**: Accordion, Audio, Callout, Image, Video. The old file-picker "Image" entry that uploaded directly is gone — the same UX now lives one click deeper, on the inserted block's PropPanel.
  - **PropPanel `src` field has an upload icon-button** for image/video/audio descriptors. Click → native file picker constrained to the descriptor's MIME types → upload → URL fills. Loading state shows a spinner; errors surface a toast.
  - **Drag-and-drop and paste-image flows are unchanged** — they still drop through `uploadAndInsert`, which now delegates the network round-trip to the new generalized `uploadFile` helper internally.

  Internal: `accept` and `autoFocus` are added to `PropDefString` only (not Boolean/Number/Enum/ReactNode — D3 LOCKED). The PropPanel computes `getAutoFocusedPropName(props)` once and threads `isAutoFocused` to each PropControl, which marks the matching `<Input>` with both `autoFocus={true}` and `data-prop-autofocus=""` (the data-attr makes SSR test assertions tractable since React 19's autoFocus is client-only at runtime).

- 7242822: feat: Component Blocks v2 — 5-pack foundation (Callout + Image + Video + Audio + Accordion)

  The editor now ships five built-in component primitives — `Callout`, `Image`,
  `Video`, `Audio`, and `Accordion` — each with a WYSIWYG settings panel, a
  slash-command insertion menu, and lossless on-disk round-trip for both the
  MDX form and the markdown form (where one exists). Every primitive is a
  DIY React component on Open Knowledge's own brand (shadcn / Tailwind); the
  editor bundle no longer pulls in `fumadocs-ui`'s React surface or its CSS
  variable bridge.

  What you get out of the box:

  - **Callout** — five GFM alert types (`note` / `tip` / `important` /
    `warning` / `caution`) plus optional `title` / `icon` / `color` / and
    Obsidian-style foldable chrome (`> [!NOTE]+` / `-`). Authoring works in
    any of three forms: GFM alert blockquote, foldable Obsidian opener, or
    `<Callout type="…">…</Callout>` MDX JSX. Common alias tokens
    (`success` → `tip`, `danger` → `caution`, etc.) fold to the GFM 5
    on disk.
  - **Image** — `<Image src=… alt=… width=… caption=… />` MDX, plus
    standard CommonMark `![alt](src)`. Both forms render through the same
    descriptor with click-to-zoom on by default; the MDX form additionally
    exposes `caption` (renders as `<figure>` + `<figcaption>`), explicit
    dimensions, and `loading` / `zoom` toggles.
  - **Video** — pure HTML5 `<video>` wrapper with native controls. No
    YouTube / Vimeo URL sniffing — embed services with a raw `<iframe>` in
    MDX (matches Mintlify's pattern). `<track>` and `<source>` children
    round-trip.
  - **Audio** — pure HTML5 `<audio>` wrapper with native controls always
    on. `<source>` and `<track>` children round-trip.
  - **Accordion** — standalone HTML5 `<details>` / `<summary>` substrate,
    no wrapper component required. Cross-browser exclusive grouping via
    HTML5 `<details name="…">` (Chrome 120+, Safari 17.2+, Firefox 130+).
    Authors can write either `<details><summary>X</summary>Y</details>` or
    `<Accordion title="X">Y</Accordion>` — both render the same descriptor.

  Other improvements:

  - Auto-generated settings panel from each component's prop types
    (string / boolean / number / enum) — no separate component prop docs
    required.
  - Slash-command insertion with sensible defaults; the settings panel
    auto-opens on insertion so required fields are filled in before you
    move on.
  - Hover chrome with move-up / move-down / delete / settings buttons.
  - Keyboard navigation throughout (Tab / Esc / arrow keys with
    context-aware handling).
  - Broken or unrecognized MDX components automatically open in an
    embedded source-code editor so authored content stays editable —
    nothing silently disappears.
  - Both pristine and dirty save paths preserve the on-disk shape:
    unedited blocks round-trip byte-for-byte; edited blocks canonicalize
    to the MDX JSX form.

  Breaking changes:

  - Both the inline MDX element node (`jsxInline`) and the block MDX
    component node (`jsxComponent`) changed PM-schema shape in this
    release. `jsxInline` drops its `attributes` and `sourceRaw` attrs —
    its text content IS the source of truth. `jsxComponent` widens from
    an atom with a raw-content attr to a non-atom block with `block*`
    children and new structured attrs (`componentName`, `kind`,
    `attributes`, `sourceRaw`, `sourceDirty`, `props`). This is a
    load-bearing change for collaborative editing — older clients
    coexisting with this version in the same live session substitute
    both nodes to `rawMdxFallback` (raw source preserved as editable
    text) via the y-tiptap schema-throw substitution patch. Upgrade all
    clients in a session together — both inline JSX authoring and
    component-block authoring are affected, not just inline. Persisted
    documents are unaffected; the on-disk MDX is preserved.
  - Content using component names that are no longer built in
    (`Tabs`, `Card`, `CardGroup`, `Steps`, `Banner`, `Files`,
    `TypeTable`, `InlineTOC`, `Mermaid`, `AudioPlaceholder`, `ImageZoom`)
    opens as an editable raw-source block. Content is preserved
    verbatim. Rename `<AudioPlaceholder />` → `<Audio />` and
    `<ImageZoom>` → `<Image>` to pick up the new descriptors.

  The compound-component tier (Tabs + Tab grouping, Accordion grouping
  with shared chrome, Steps + Step) is not built in today; it returns
  when concrete dev-docs / help-center authoring demand surfaces. No
  public API will change for existing 5-pack consumers when that
  happens.

  Bundle size:

  - Main app bundle stays flat (~210 kB gzipped) — the `fumadocs-ui`
    drop and 12-descriptor cut offset the 5-pack prop-surface widening
    and new selection-chrome plugins.
  - Total JS across lazy-loaded chunks grows ~100 kB gzipped (~978 kB →
    ~1.08 MB) to accommodate CB-v2 feature surface (descriptor-dispatch
    registry, V2 editor cache, SelectionStatePlugin + Breadcrumb +
    SelectionAnnouncer + BlockDragHandle, nested CodeMirror for
    `rawMdxFallback`, slash-command menu, canonical/compat descriptor
    split with three additional read-only source-form descriptors
    (GFMCallout, CommonMarkImage, HtmlDetailsAccordion) for round-trip
    preservation). The `all JS chunks combined` size-limit ceiling is
    raised 1050 → 1100 kB (~2% headroom) to match. Delivered via
    on-demand chunk loading — users don't pay the full bill on first
    paint.

- fd31cf2: Config Editing Paths — end-to-end UX for editing Open Knowledge configuration:

  - **Settings pane** in the editor area (Cmd-, / App menu / HelpPopover / Command Palette) with `This project` and `User` scope tabs. Each field auto-saves; per-field reset; modified-at-scope indicator on cross-scope fields.
  - **Real-time sync** — Settings pane is bound to two Y.Text-only synthetic Hocuspocus docs (`__config__/workspace`, `__user__/config.yml`). External edits via CLI, MCP, IDE hand-edit, or another `ok start` instance propagate via a chokidar file watcher into Y.Text and refresh any open pane within ~500ms.
  - **Three-layer defense-in-depth validation** — client walker (L1) → fs writer (L2) → persistence-hook (L3). Invalid mutations revert to LKG and surface a toast + brief field flash.
  - **MCP tools** — `set_config`, `get_config`, `set_folder_rule`. fs-direct (no running server required); auto-scope inference via the inspectConfig ladder; mixed-scope rejection.
  - **CLI** — `ok config validate` (exits 0/1 with source-located errors) + `ok config migrate` (idempotent codemod that drops `sync.*`, `persistence.{debounceMs,maxDebounceMs}`, `server.port`).
  - **`ok init`** scaffolds the workspace `config.yml` with a magic-comment `$schema` URL pinned to the schema major (`v0`) + `@latest` of the npm package — additive schema changes reach existing users automatically; breaking changes bump the path to `v1` and old majors stay published forever.
  - **Per-scope JSON Schemas** — `dist/schemas/v0/config.workspace.schema.json` and `…/config.user.schema.json` so VS Code's Red Hat YAML LSP only suggests fields valid AT the file's scope.
  - **Schema cleanup** — drops `sync.*` (7), `persistence.{debounceMs,maxDebounceMs}` (2), `server.port` (1); adds `appearance.theme` and `appearance.editorModeDefault` (user-scope, both UNSET by default; chrome `<ThemeToggle>` writes through `userBinding.patch` so localStorage stays a derived cache). `content.*` is workspace-scope-only.
  - **OTel** — five new `config.*` spans (`config.bind`, `config.patch`, `config.validate`, `config.persist`, `config.revert`) trace the full edit chain.

- 9f0daa2: feat(frontmatter-editing-ux): top-of-document property panel + per-key `Y.Map('metadata')` storage + `frontmatter_patch` MCP tool. Frontmatter is now editable inline in WYSIWYG mode through typed widgets, and concurrent edits from a human and an agent to _different_ properties merge at the field level instead of clobbering each other through document-level last-write-wins.

  - `@inkeep/open-knowledge-core` — new `packages/core/src/frontmatter/` module exporting `FrontmatterValueSchema`, `FrontmatterPatchSchema`, `FRONTMATTER_TYPES`, and the comment-preserving YAML codec (`parseFrontmatterYaml` / `serializeFrontmatterMap` over `yaml@2.x`'s `parseDocument`). Bridge readers/writers in `packages/core/src/bridge/frontmatter-y.ts` extended with `getFrontmatterMap`, `setFrontmatterFromYaml`, `setFrontmatterProperty`, and `composeFrontmatterForStore`. `getFrontmatter(doc)` now synthesizes from per-key entries when present, falls back to the legacy single-string slot otherwise — existing string-shape callers continue to compile unchanged.
  - `@inkeep/open-knowledge-server` — `Y.Map('metadata')` now carries one entry per frontmatter property (`Y.Text` for editable strings, `Y.Array<Y.Text>` for lists, primitives for atomics). New `POST /api/frontmatter-patch` route + `handleFrontmatterPatch` handler applies JSON Merge Patch (RFC 7396) atomically under a per-session, **not paired** `formOrigin`. Observer A's metaMap deep-observer recomposes YAML+body and propagates to `Y.Text` after settlement. `onLoadDocument` runs an eager-on-load migration; `applyExternalChange` (file watcher) and Observer B reconciliation use per-key diff so undoing a single property reverts only that property. `onStoreDocument`'s `composeFrontmatterForStore` writes the legacy YAML byte-string verbatim when the per-key map still matches it — comments, blank lines, and scalar styles round-trip losslessly. `agent-patch` (`/api/agent-patch`) returns HTTP 400 on FM-intersecting find/replace calls with a migration hint pointing at `frontmatter_patch`. New OTel spans `frontmatter.patch` + `frontmatter.form_write`; new counter `ok.frontmatter.edit_surface_total` labels writes by source (`form` / `mcp-patch` / `mcp-write` / `file-watcher` / `source-mode`).
  - `@inkeep/open-knowledge` — new `frontmatter_patch` MCP tool. Set / create / delete frontmatter properties with `{patch: {key: value | null}}`; optional `types` map overrides per-key widget inference (text / number / boolean / date / list); optional `summary` threads through to the per-contributor attribution journal under the same 80-char cap as the other write tools.
  - `@inkeep/open-knowledge-app` — new top-of-document Properties panel above the body in WYSIWYG mode. Five widget types (Text / Number / Boolean / Date / List), inline add / delete / rename, type picker dropdown, per-row hover chrome, collapse via chevron, empty-state seeded via the editor toolbar's Add Properties button. All form interactions wire through `POST /api/frontmatter-patch` with `source: 'form'`.

  Storage migration is automatic on document load — no user action required. The legacy single-string `metaMap.get('frontmatter')` slot is retained as a transitional byte-identical mirror so YAML comments and scalar styles survive `doc-load → no-op-edit → doc-save` round-trips. `frontmatter_patch` is the only MCP surface for frontmatter edits going forward; the soft-deprecation window for `agent-patch` FM-touching calls is closed and those now return HTTP 400.

  Full spec + decision log: [`specs/2026-04-24-frontmatter-editing-ux/SPEC.md`](https://github.com/inkeep/open-knowledge/blob/main/specs/2026-04-24-frontmatter-editing-ux/SPEC.md).

- 73a358d: feat(navigator): clone-from-GitHub end-to-end via IPC

  The Project Navigator (the launcher window with no backing API server) can
  now drive the full GitHub clone flow: Sign in via device-flow auth, browse
  your repositories, clone, and spawn the cloned project as a new editor
  window. Editor windows continue using the existing HTTP path — no
  regression.

  Server (`@inkeep/open-knowledge-server`):

  - New public API in `local-ops/`: `runDeviceFlowSubprocess`,
    `runCloneSubprocess`, `runAuthStatusSubprocess`, `runAuthReposSubprocess`,
    `validateCloneInputs`. Framing-agnostic subprocess runners shared by
    both the HTTP relay and the desktop IPC handlers — guarantees the two
    paths can't drift.
  - `CloneCompleteEvent.dir` is now required on the wire (was optional).
    The HTTP relay always emits it; tightening the type retires the silent
    no-op when downstream consumers checked `if (!dir) return`.

  Desktop (`@inkeep/open-knowledge-desktop`):

  - New IPC channels for streaming flows: `ok:local-op:auth:start` /
    `ok:local-op:clone:start` (with `:event` push + `:cancel` siblings).
  - New IPC channels for one-shot bounded queries:
    `ok:local-op:auth:status` and `ok:local-op:auth:repos`.
  - New bridge surface: `bridge.localOp.{auth.start, clone.start,
authStatus, authRepos}`.

  App (`@inkeep/open-knowledge-app`):

  - `CloneDialog` accepts pluggable `transport` (clone subprocess) and
    `authQueryTransport` (status + repos) props, defaulting to the existing
    HTTP path. Navigator passes the IPC equivalents.
  - `AuthModal` accepts a pluggable device-flow `transport`, same default
    pattern.

- 8a6cb2d: feat(rename): consolidate `/api/rename` and `/api/rename-path` into a single polymorphic endpoint, lift the link-rewrite spine, extend the recovery journal to v2, and add principal-attribution fallback for rename + rollback handlers.

  **Breaking change** — `POST /api/rename` is **removed**. Clients (UI, MCP, scripts) must use `POST /api/rename-path` with the polymorphic body shape:

  ```json
  { "kind": "file" | "folder", "fromPath": "<path>", "toPath": "<path>", ...identity, "summary": "..." }
  ```

  The MCP `rename_document` tool's outward API is unchanged (parameters, response shape, identity passthrough are all functionally equivalent) — only the internal HTTP target changed.

  **New capabilities:**

  - Folder rename now rewrites all inbound wiki-links and supported markdown links across linking docs (was previously a CONFIRMED gap — folder rename moved files but left link text untouched).
  - Folder rename is now crash-safe — process kill mid-batch is recoverable on next startup with no partial state.
  - File rename via the consolidated endpoint now updates the in-memory backlink index (was missing on the file branch of `/api/rename-path`).
  - UI-driven rename and rollback now attribute to the server-loaded principal (`principal-<uuid>`) when no agent identity is supplied. Body-supplied `principalId` is silently ignored — server's `getPrincipal()` is the only source of principal identity.

  The recovery journal schema is bumped from v1 (single source/destination) to v2 (multi-doc `affectedDocs[]`). The v1 parser is preserved alongside v2 — legacy v1 journals on disk at startup still recover correctly.

  Side-effect docs (backlink-rewrite cascades) remain anonymous for both agent-driven and principal-driven renames — only the renamed doc itself is attributed to the actor.

  **Other behavior changes worth noting:**

  - `POST /api/rollback` 500 responses no longer echo the underlying error message; clients now see a generic `Failed to roll back document` string. Eliminates a path / internal-state leak channel for an unauthenticated body endpoint.
  - `ok init` adds `state.json` to the bootstrapped `.ok/.gitignore` alongside `sync-state.json` and `principal.json` — covers newly-added local-runtime state at `<contentDir>/.ok/state.json` (also emitted as a separate `init-gitignore-consolidation` changeset for the broader scaffold rework, but the `state.json` line specifically lands here).

### Patch Changes

- 8b64fdb: fix(server): asset-event-driven embed re-render fallback

  When an asset is created or deleted outside a cross-branch git batch, the
  server now scans open docs for `[[<basename>]]` references and re-parses
  the doc's Y.Text source against the current `basenameIndex` via
  `applyDiskContentToDoc` (the pure-CRDT helper — no spurious file-system
  attribution, no reconciledBase advance, no disk read that would revert
  unsaved user edits). Makes embed resolution self-healing for asset moves
  that don't go through the head-watcher's cross-branch path — fixing a
  Linux-CI flake where T17's test-doc was byte-identical across branches
  and had no fallback re-render trigger when `parcel-watcher` missed the
  `.git/HEAD` event.

  Idempotent: `applyDiskContentToDoc`'s `updateYFragment` diffs against the
  live XmlFragment, so re-parsing the same Y.Text source with the same
  `basenameIndex` is a no-op on the Y.Doc. Skipped during cross-branch
  batches (events are buffered and discarded), preserving the existing
  reseed-then-reset ordering. Same-basename events firing in one parcel-
  watcher batch (e.g. `mv` produces `asset-delete` + `asset-create`)
  collapse into one re-render via a `setImmediate`-deferred dedup pass.

  Includes T17 test-design fix (poll on actual post-switch invariant instead
  of pre/post-equivalent embed count) and a new regression test
  (`asset-move-rerenders-embeds.test.ts`) that exercises the asset-event
  path independently of git.

- 5d916f4: Recover safely from stale browser CRDT caches after server restarts.

  This scopes client IndexedDB persistence by server epoch, adds server-side tripwires for duplicated persisted content, and records structured mismatch telemetry so stale-cache recovery is observable without replaying unsafe buffered edits.

- Updated dependencies [fbfe967]
- Updated dependencies [fbfe967]
- Updated dependencies [f3ad7e9]
- Updated dependencies [7242822]
- Updated dependencies [7242822]
- Updated dependencies [2732c81]
- Updated dependencies [7242822]
- Updated dependencies [fd31cf2]
- Updated dependencies [9f0daa2]
  - @inkeep/open-knowledge-core@0.4.0

## 0.3.0

### Minor Changes

- ddd4efc: feat(agent-writes): optional `summary` on all four MCP write tools — renders as collapsible bullets on the Timeline row so readers can scan agent intent without opening every diff.

  Agents calling `write_document`, `edit_document`, `rename_document`, or `rollback_to_version` can now pass an optional one-line `summary` describing the outcome of the edit (e.g. `"Fixed token-refresh race"`). Summaries persist per-contributor to the shadow-repo `ok-contributors:` JSON line and render under the author on the [[timeline]] WIP row — first bullet inline, the rest collapsed behind a "Show N more" expander matching the existing `WipGroup` pattern. The doc-list stays visible as ground truth alongside the bullets.

  - `@inkeep/open-knowledge-core` — `ShadowContributor` gains `summaries?: string[]` (flat per-contributor array, oldest-first). `parseContributors` accepts both legacy (no field) and new shapes; malformed `summaries` values drop just that field while preserving the contributor entry — a deliberate divergence from the whole-entry-skip convention so decorative loss (no bullets) never escalates to attribution loss.
  - `@inkeep/open-knowledge-server` — new `agent-write-summary.ts` exports `normalizeSummary` as the single API-boundary truncation point (80-char cap, U+2026 suffix when truncated; whitespace-only and empty strings classify as `absent`). `recordContributor` threads through the optional 5th-arg summary; `formatContributorsFrom` emits `summaries` on the `ok-contributors:` line only when non-empty so summary-less writes stay byte-identical to today. Five API handlers (`/api/agent-write`, `/api/agent-write-md`, `/api/agent-patch`, `/api/rename`, `/api/rollback`) accept the optional body field and return `summary: {value, truncatedFrom?}` + a human-readable hint when truncation fires. Three new metrics counters (`agentWriteCalls`, `summariesProvided`, `summariesTruncated`) track M1 adoption and M2 cap efficacy. `handleRename` and `handleRollback` now call `extractAgentIdentity` + `recordContributor` — **but only when the request body carries an explicit `agentId`** (D22 LOCKED), so the in-editor Restore button (which posts with no identity) stays anonymous on the timeline as it always has. MCP-driven rename and rollback calls get a server-generated default summary (`"Renamed <from> → <to>"` / `"Restored to <sha-short>"`) when the agent omits one.
  - `@inkeep/open-knowledge` — the four write MCP tools expose `summary` in their Zod schemas (Zod hard-cap of 200 chars as a transport-safety bound separate from the 80-char rendering cap); `rename_document` and `rollback_to_version` also thread agent identity (`agentId`/`agentName`/`clientName`/`colorSeed`) matching the pattern from `write-document.ts` so summary attribution lands correctly. Tool descriptions include the cap, the rename/rollback defaults, and a no-PII/secrets hint.
  - `@inkeep/open-knowledge-app` — `TimelinePanel` `EntryRow` renders the collapsible bullet list when any contributor on the row has `summaries`; zero regression for legacy rows without the field. The doc-list line stays as ground truth alongside the bullets.

  The `ok-contributors:` JSON line stays at `v: 1` — `summaries` is purely additive (precedent #9). Legacy commits (no field) and summary-less writes (field omitted) both remain byte-identical to pre-feature behavior. `exec` / `read_document` enrichment carries the field through automatically via `history.contributors[*].summaries`.

  Full spec + decision log (D1–D27, US-001–US-007): [`specs/2026-04-21-agent-write-summaries/SPEC.md`](specs/2026-04-21-agent-write-summaries/SPEC.md).

- 05c7e37: feat(desktop): Electron desktop M1 — native macOS app with persistent Navigator launcher, per-project editor windows, and attach-to-existing-server.

  New private package `@inkeep/open-knowledge-desktop` launches Open Knowledge as a native macOS Electron app (dev loop only — signing, notarization, DMG, auto-update, URL scheme, keyring, MCP wiring, CLI-on-PATH menu are M2–M7). `bun run dev --filter=@inkeep/open-knowledge-desktop` opens a Navigator window with three cards (Clone from GitHub, Open folder on disk, Start fresh) + Recent list; every project pick spawns a new editor window per D3/D24 revised (no switch-in-place).

  Process model: one BrowserWindow ↔ one `utilityProcess.fork` ↔ one `createServer` ↔ one `contentDir` (D6), with a second branch that attaches to a live same-host `server.lock` instead of colliding — so a running `npx open-knowledge start` CLI and the desktop app cooperate on the same project. Typed IPC channel map (D14), hand-rolled preload bridge with contextBridge listener wrappers (D38 + electron/electron#33328), `utilityProcess.fork` with `windowLifecycleBound: true` (D39), macOS poll-based parent-death detection (D49), `shell.openExternal` scheme allowlist (D47), sandbox-compatible CommonJS preload.

  Server + core refactors that landed alongside:

  - `@inkeep/open-knowledge-server` exports `bootServer(opts)` — the shared wrapper that composes `createServer()` + HTTP listener + server-lock port-write + optional `ok ui` sibling + idle-shutdown. CLI's `ok start` is now a thin wrapper over it; Electron's utility process calls it with `{ attachUiSibling: false, idleShutdownMs: null }`. Also emits permissive CORS headers for `/api/*` so cross-origin renderer fetches (Electron dev server → utility process) work.
  - `@inkeep/open-knowledge-core` gains `OK_DIR` (moved from CLI) and the canonical `OkDesktopBridge` interface.
  - `@inkeep/open-knowledge-app` ships `NavigatorApp.tsx` (Electron-only launcher), `WorkspaceSwitcher.tsx`, `CommandPalette.tsx` (Cmd+K), and `desktop-fetch.ts` — a renderer-side `/api/*` fetch rewriter that targets `window.okDesktop.config.apiOrigin` when present. `useCollabUrl` short-circuits on the same bridge config in Electron.
  - `@inkeep/open-knowledge` (CLI) is unchanged externally; internally `bootStartServer` delegates to `bootServer`.

  Web and CLI distributions are unaffected — `window.okDesktop` is undefined outside Electron, and every desktop-specific surface is gated on it.

  Full spec + decision log (D1–D52): `specs/2026-04-11-electron-desktop-app/SPEC.md`.

- 39fa932: feat(desktop): M3 — Auto-update (electron-updater + install-on-quit).

  Wires `electron-updater@6.8.4` (exact-pinned, paired with `electron-builder@^26.9.0` via shared `builder-util-runtime@9.6.0`) into the Electron main process behind the `app.isPackaged` gate. Adds `.zip` to `mac.target` in `electron-builder.yml` so Squirrel.Mac's ZIP-based swap path has the artifact it needs (`MacUpdater.ts:89` downloads `.zip`, not `.dmg`).

  Main-process module at `packages/desktop/src/main/auto-updater.ts` subscribes six `autoUpdater` events (`checking-for-update`, `update-available`, `update-not-available`, `download-progress` debug-only, `update-downloaded`, `error`) and explicitly skips `login`, `update-cancelled`, `appimage-filename-updated`. Classified errors (`ERR_UPDATER_*` / `HTTP_ERROR_*`) and bare Squirrel.Mac Errors both log silently and retry on the next launch per parent J7a — no dialog, no nag.

  Three renderer toasts via the existing sonner mount in `packages/app/src/main.tsx` (all `duration: Infinity`, user-dismissable):

  - **Toast A** — `"Update downloaded"` + `"Relaunch now"` action button, fires once per pending-update version.
  - **Toast B** — `"Updated to v${VERSION} — see what's new"` with a link to the GitHub Releases tag, once per version transition.
  - **Toast C** — D12 stuck-update escape hatch: after 7 consecutive calendar days without a successful update check, fires once per installation with a link to the manual-download page.

  Four new `AppState` fields persist the toast gates (`versionPendingInstall`, `lastSeenVersion`, `lastSuccessfulCheckAt`, `stuckHintShown`), backwards-compatible with pre-M3 `state.json` via the existing defensive-coercion pattern in `parseAppState`.

  Periodic check every 1 hour (matching Obsidian UX per D10 revised), singleton-per-launch, cleared on `app.on('will-quit')`. Relaunch-now button invokes `autoUpdater.quitAndInstall()`; if the user dismisses the toast instead, `autoInstallOnAppQuit = true` still installs at next natural quit.

  Release pipeline: new `.github/workflows/desktop-release.yml` triggers on `release: published` (fired by `release.yml`'s `gh release create`) and runs `electron-builder --mac --publish always` on `macos-14` to upload `.dmg`, `.dmg.blockmap`, `.zip`, `.zip.blockmap`, and `latest-mac.yml` to the existing GitHub Release. Workflow lints + parses but its real-world execution is gated on M2's Apple-creds procurement and the universal-merge SHA-parity fix (M2 FU-1 / FU-2).

  Dev-mode smoke: `packages/desktop/scripts/smoke-mock-update.mjs` spins a local HTTP server with a hand-crafted `latest-mac.yml` + fake `.zip` so the wiring can be exercised end-to-end (short of the signature-verified Squirrel.Mac swap) before signed DMGs exist.

  Version bootstrap is governed by the `changesets fixed` group — `@inkeep/open-knowledge-desktop@0.0.0` bumps lockstep with its peers at next `release.yml` run; no hand-edit to `package.json`.

  Full spec + decision log (D1–D12): `specs/2026-04-21-m3-electron-updater/SPEC.md`.

- 1f030ba: feat(presence): unify agent presence on `__system__` awareness (multi-agent)

  N concurrent agents (Claude + Cursor, two Claudes, etc.) now coexist in the presence bar as distinct badges. The previous per-content-doc awareness surface stomped because every Hocuspocus `Document` has one shared `Awareness` clientID — every agent's `setLocalState` overwrote the prior. Presence now lives on the `__system__` Y.Doc's awareness as a map-valued `agentPresence` field keyed by `agentId`.

  **Breaking (core):**

  - `AwarenessUser.type` narrowed from `'human' | 'agent'` to `'human'`. Agents no longer publish per-doc awareness — construct `AgentPresenceEntry` instead and call the server-side `AgentPresenceBroadcaster`. If you were reading `user.type === 'agent'` on per-doc awareness, that path is gone; read `agentPresence?` on `__system__.awareness` instead.
  - `AgentFocusEntry` type export removed. Use `AgentPresenceEntry` from `@inkeep/open-knowledge-core`.
  - `AwarenessState.agentFocus?` field removed. Replaced by `agentPresence?: Record<string, AgentPresenceEntry>` on the same type.

  **Breaking (server):**

  - `AgentFocusBroadcaster` renamed to `AgentPresenceBroadcaster`. API replaced: `setFocus`/`clearFocus`/`getFocusMap` → `setPresence(agentId, entry)`, `clearPresence(agentId)`, `touchMode(agentId, mode)`, `getPresenceMap()`. Entry shape now `{displayName, icon, color, currentDoc, mode, ts}` (was `{agentName, currentDoc, writeKind, ts}`).
  - `ServerInstance.agentFocusBroadcaster` renamed to `agentPresenceBroadcaster`.
  - `ApiExtensionOptions.agentFocusBroadcaster` renamed to `agentPresenceBroadcaster`.
  - New endpoint `GET /api/metrics/agent-presence` returns the presence map for operator diagnostics (not polled by the browser).

  **CLI:**

  - MCP keepalive URL now carries `&agentId=${connectionId}` so the server can deterministically clear presence on process exit. Older MCP clients without the param fall back gracefully to the 5s TTL filter.

  **Client:**

  - `PresenceBar` renders sectioned: current-doc agents + humans | divider | cross-doc agents (dimmed). Cross-doc agents are now keyboard-accessible — the avatar itself is a button with an aria-label describing the target doc; clicking navigates.
  - `-space-x-1.5` (overlapping avatars) replaced with `gap-1.5` so 2+ agents render side-by-side cleanly (triage #1 fix).

- 267c8ba: feat(handoff): "Open in Agent Desktop" — one-click handoff from Open Knowledge to Claude Cowork / Claude Code / OpenAI Codex Desktop / Cursor.

  A new "Open in…" dropdown surfaces from three places — the editor header action strip, the `Cmd+K` command palette ("Open in agent" group), and the file-tree right-click menu — routing every click through a single `dispatchHandoff` entry point (AC9 asserts no other dispatch sites). Each enabled row fires the target's canonical URL scheme through the existing `shell.openExternal` IPC (Electron host) or an anchor-click (web host), with a minimal auto-composed prompt that points the target agent at the doc plus a hint to use the `open-knowledge` MCP for backlinks + related context. Disabled rows render with a keyboard-reachable submenu — install link + `Open in claude.ai →` secondary affordance on Claude rows — instead of a non-interactive tooltip.

  Built on four pure URL builders in the new `packages/core/src/handoff/` (`claude-url.ts`, `codex-url.ts`, `cursor-url.ts`, `web-fallback-url.ts`) with an encoding discipline pinned against Cursor's two-pass-decode behavior (`text=` double-encoded, `workspace=` single-encoded basename, `mode=agent` literal). The Cursor two-step dispatcher (`cursor-two-step.ts`, Electron only per E4 DIRECTED) spawns the workspace first through a dedicated `ok:shell:spawn-cursor` IPC — distinct from the URL-scheme allowlist because the threat model is a command allowlist — then fires the `cursor://` prompt after a 1000–1500 ms settle. On macOS the spawn routes through `/usr/bin/open -a <bundle>` because `app.getApplicationInfoForProtocol('cursor://')` returns the `.app` bundle (a directory), not an executable.

  Install detection is unified across hosts: Electron uses `app.getApplicationInfoForProtocol(scheme)` per probe (with an `xdg-mime query default x-scheme-handler/<name>` fallback on Linux); web uses a new `GET /api/installed-agents` endpoint with a per-scheme 60 s server-side cache, a 10 s per-client refresh throttle, and the standard `checkLocalOpSecurity` loopback + Host-header gate. Windows probes the merged `HKCR` view so machine-scope (HKLM) installers are detected alongside user-scope. Web-host Cursor is always disabled-with-tooltip regardless of probe result (E4 DIRECTED — local-use-case only; the `/api/handoff/open-folder` cross-machine primitive is deferred).

  Security: `packages/desktop/src/main/shell-allowlist.ts` (D47) extended with `claude:`, `codex:`, `cursor:` behind per-scheme JSDoc and an exact-set test. A drift-detector in `shell-allowlist.test.ts` reads `KNOWN_TARGETS` and fails if any future target lands without an allowlist row. Every outbound URL is built by a typed pure function — never from user-supplied raw URL strings.

  Observability: `~/.open-knowledge/stats.jsonl` append-only per dispatch (zero phone-home per XQ3 LOCKED). Success/failure sonner toasts close the DC3/DC4/vendor-drift silent-failure gap, with a bounded retry (2–3 attempts; distinct copy on the final failure) per review M5. Full spec with decision log + test plan at `specs/2026-04-21-open-in-agent-desktop/SPEC.md`; end-user guide at `docs/content/guides/open-in-agent-desktop.mdx`.

- ba88a91: feat: OpenTelemetry instrumentation — opt-in end-to-end traces + metrics + log correlation across the browser → HTTP → Hocuspocus → persistence → shadow-repo → disk chain. Zero overhead when disabled (server default: `OTEL_SDK_DISABLED=true`; frontend default: `VITE_OTEL_ENABLED` unset, SDK dynamic-import-gated out of main bundle). Ships a local Grafana LGTM docker-compose stack at `docker/otel-dev/` (Grafana + Tempo + Loki + Prometheus + OTel Collector) with auto-provisioned datasources — no third-party subscriptions required. Adds `packages/server/src/fs-traced.ts` as the sanctioned path for instrumented disk writes (hand-rolled because `@opentelemetry/instrumentation-fs` is broken under Bun). Pino log records now carry `trace_id` / `span_id` / `trace_flags` via `otelMixin` for trace↔log correlation in Grafana.
- 48d4218: feat(shadow-repo): collapse dual-mode to single-mode at `<projectRoot>/.git/open-knowledge/`, auto-`git init` on first run when no parent repo exists, and rename legacy `.git/openknowledge/` shadows in place.

  The shadow repo (OK's attribution journal for WIP refs, upstream imports, checkpoints, and the rescue timeline) previously branched between `integrated` mode at `<root>/.git/openknowledge/` and `standalone` mode at `<root>/.openknowledge/`. Standalone mode had semantically distinct behavior — no parent `.git/HEAD` for the HEAD watcher, no real project branch for the `refs/wip/<branch>/<writer-id>` namespace, no upstream-import path — which forced every shadow-touching change through a two-mode test matrix for zero user-facing payoff. The dual-mode split is now gone: the shadow always lives at `<projectRoot>/.git/open-knowledge/`, projects without `.git/` get auto-`git init`'d by the new `ensureProjectGit` helper (fail-fast on missing git — no degraded fallback), and legacy `.git/openknowledge/` shadows are silently `renameSync`-migrated on first run so pre-spec users keep their attribution history.

  - `@inkeep/open-knowledge-core` — `resolveShadowDir(projectRoot: string): string` — return type collapses from `{ path, mode }` to a plain string; `ShadowRepoMode` and `ResolvedShadowDir` types are deleted. `OkDesktopBridge` gains `onGitInitNotice(cb)` alongside the existing `onProjectSwitched` / `onMenuAction` push-event surfaces.
  - `@inkeep/open-knowledge-server` — new `ensureProjectGit` + `ProjectGitInitError` exports (pre-listen fail-fast hook). `BootServerOptions` gains `ensureProjectGitFn`; `BootedServer` gains `didGitInit`. `initShadowRepo` carries a ~5-line R9 rename shim for legacy layouts. `skipAutoInit` now gates both `ensureProjectGitFn` and `autoInitFn`.
  - `@inkeep/open-knowledge` — `ok start` and `ok init` call `ensureProjectGit(cwd)` in the fresh-directory path; the CLI preview-block gate extends to `didAutoInit || didGitInit` and emits `Initialized git repo at <cwd>/.git/ (default branch: main)`. `ok mcp` is unchanged directly but inherits the side effect transitively when it auto-spawns `ok start` (opt out with `OK_MCP_AUTOSTART=0` or config `mcp.autoStart: false`). `.gitignore` auto-append of `.openknowledge/` is deleted; `.openknowledge` is removed from `enrichment.ts` / `mtime-scan.ts` scan-exclusion sets.
  - `@inkeep/open-knowledge-desktop` — utility process passes `ensureProjectGitFn` to `bootServer`; `UtilityReadyMessage` carries `didGitInit`. New `git-init-notice` push event on the preload bridge; main-side dispatch deferred until `webContents.once('dom-ready', ...)` to defeat the subscriber-mount race.
  - `@inkeep/open-knowledge-app` — renderer subscriber (`lib/install-git-init-toast.ts`, wired imperatively in `main.tsx`) routes `onGitInitNotice` to `toast.info(\`Initialized git repo at ${gitDir}\`)`. No-op outside Electron.

  Legacy `.openknowledge/` standalone-mode directories are silent orphans (no detection, no warning, no migration) — OK carries zero runtime reference to that path per D5/NG5. Worktree-specific semantics are out of scope for this change; they remain owned by a separate spec (NG6).

  Full spec + decision log (D1–D14, R1–R9): [`specs/2026-04-21-shadow-repo-single-mode/SPEC.md`](specs/2026-04-21-shadow-repo-single-mode/SPEC.md).

- 5444369: feat(skill, ingest): closed-loop grounding, broadened `ingest` trigger, log-discipline rule, and project-shape-neutral terminology.

  Three behavioral additions to the bundled `open-knowledge` Agent Skill and the `ingest` MCP tool, driven by a wiki author's diagnostic of two recurring lapses (citing web sources inline instead of ingesting them; not appending to the project log after KB-changing turns).

  - **Closed-loop grounding.** External sources don't get cited _out_ to the live web — they get pulled _in_ via `ingest`, then cited locally. A bare `[source](https://...)` URL inside a knowledge-base doc is now explicitly a TODO, not a finished citation. Self-fetched URLs (`WebFetch` / `WebSearch` from the agent itself) trigger `ingest` exactly like a user share does.
  - **Broadened `ingest` trigger.** Both the SKILL.md workflow-tools row and the MCP tool's discoverable `DESCRIPTION` now name agent-initiated fetches as a first-class trigger. Prior framing was user-share-only, which let agents downgrade to inline-URL citation when they did the fetch themselves.
  - **Log-discipline rule.** New SKILL.md section: after any turn that creates / edits / restructures KB content, check for a project `log.md` (project root or seed `rootDir`) and follow whatever its frontmatter `description:` and in-file comment say. The skill carries the **trigger**; the seeded file owns the **policy** (cadence, entry shape, categories) — so projects that don't run `ok seed` can opt out by simply not having a `log.md`. The seeded `LOG_MD_TEMPLATE` (`packages/server/src/seed/starter.ts`) now spells the contract out in its frontmatter description so it surfaces in every `exec("ls")` enrichment, and the example entry shape uses real markdown links (`[path](./path.md)`) instead of bare path strings — so log entries register in `get_backlinks` for the docs they reference and the audit trail compounds inside the doc graph.
  - **Project-shape-neutral terminology.** Open Knowledge knowledge bases serve multiple shapes — wiki, LLM brain, spec collection, research log, project notes. Replaced "wiki" with "knowledge base" / "KB doc" everywhere it had been used as a project-shape claim (skill grounding section, workflow-tools layer column, hub-candidates JSDoc). Kept the term where it's a legitimate technical reference (the `[[Page]]` "wiki-link" syntax, `ARCHITECTURE.md` competitive-landscape rows naming Notion/Confluence/Wiki.js).

  The change is additive on the install side: the skill `metadata.version` and `@inkeep/open-knowledge-server` package version both control the install gate (`~/.open-knowledge/skill-installed-version` sidecar), so this version bump triggers a fresh skill install in environments where 0.2.0 was previously cached.

### Patch Changes

- 5fdd555: feat(desktop): M5 — `@napi-rs/keyring` end-to-end verification in packaged build.

  Adds the verification layer that proves `@napi-rs/keyring` loads and round-trips inside `utilityProcess.fork()` in the packaged Electron app. The PR #166 auth substrate itself is unchanged — this milestone ships infrastructure for observing the substrate from outside the app (driver script) and from inside the renderer (gated debug IPC), so R15 (utilityProcess compat) and R16 (`CFBundleDisplayName` prompt + bundle-ID stability + upsert semantics) become empirically verifiable.

  New surfaces:

  - `packages/desktop/src/utility/keyring-smoke.ts` — `runKeyringSmoke(deps?)` primitive. Namespace-scoped round-trip (`open-knowledge-smoke` / `test-user`) via `@napi-rs/keyring`; cleans up on success. Injectable `deps` parameter allows AC3 YAML-fallback unit coverage without touching the production substrate (SPEC §9 SCOPE lock). Returns `KeyringSmokeResult = { ok, backend, durationMs, timestamp, error? }`.
  - `packages/desktop/src/main/debug-ipc.ts` — renderer↔main↔utility relay. Correlation-ID `Map<id, {resolve,reject,timer}>` with 5 s default timeout; `clearTimeout` fires on both resolve and timeout paths so the Map stays bounded.
  - `packages/desktop/src/utility/server-entry.ts` — extends the IPC protocol with `{ kind: 'debug-request' }` dispatch. Also adds a boot-time auto-smoke mode gated on `OK_DEBUG_KEYRING_SMOKE=1`: writes `KeyringSmokeResult` JSON to `OK_DEBUG_KEYRING_SMOKE_OUT`, exits `0` post-write when `OK_DEBUG_KEYRING_SMOKE_EXIT=1`. This is the only creds-free path that exercises the hardened-runtime + fuses + signed-binary loader on packaged builds.
  - `packages/desktop/src/shared/{ipc-channels.ts,bridge-contract.ts}` + `packages/core/src/desktop-bridge.ts` + `packages/app/src/lib/desktop-bridge-types.ts` — add the `ok:debug:keyring-smoke` channel and the optional `debug?: { keyringSmoke(): Promise<KeyringSmokeResult> }` bridge namespace. The namespace is gated at preload time: `!app.isPackaged || process.env.OK_DEBUG_KEYRING_SMOKE === '1'`. In normal packaged runs, `window.okDesktop.debug` is `undefined` and typos surface at TypeScript compile time, not runtime.
  - `scripts/verify-keyring-in-packaged-dmg.mjs` — driver for creds-free pre-flight. Accepts an `.app` or `.dmg`, launches the packaged app with the `OK_DEBUG_KEYRING_SMOKE*` env triplet, parses the result JSON, exits `0` on ok / `1` on smoke failure / `2` on 30 s boot timeout / `3` on pre-smoke crash.
  - `packages/cli/src/auth/token-store.test.ts` — extended with upsert-semantics characterization tests + YAML-fallback mocking strategy. The production `token-store.ts` substrate is **unchanged** per SPEC §9 SCOPE lock; the new tests document and guard the substrate's already-correct behavior.
  - `packages/desktop/tests/smoke/keyring-e2e.md` — 11-step creds-gated manual runbook covering AC4 (CFBundleDisplayName prompt), AC5 (relaunch persistence), AC6 (v0.1.0→v0.1.1 upgrade persistence), AC7 (`log show` caller-attribution). Executable once Apple Developer credentials are on the test machine.

  Web and CLI distributions are unaffected — the debug namespace and env-var auto-smoke only fire in the Electron utility process, and the token-store test changes don't touch runtime behavior.

  Creds-free ACs (AC1–AC3, AC8–AC10) land green in this changeset. Creds-gated ACs (AC4–AC7) execute manually via the runbook and will attach screenshots + `log show` output to a follow-up status update once Apple credentials are available on the test machine (same external dependency that gates M2's end-state DOD).

  Full spec: `specs/2026-04-21-m5-keyring-packaged-e2e/SPEC.md`; design decisions (D-M5-1 through D-M5-8): `specs/2026-04-21-m5-keyring-packaged-e2e/meta/investigation-findings.md`; parent milestone plan: `specs/2026-04-11-electron-desktop-app/SPEC.md` §14.

- fa8f5de: fix(outline): skip `#` comments inside fenced code blocks when extracting headings

  Previously, `extractHeadings` scanned line-by-line with a naive ATX regex and counted any `# …` as a heading — including lines inside ` ```yaml `, ` ```bash `, or ~~~ code blocks. TipTap's WYSIWYG DOM correctly renders those as code, so the outline's heading list grew one entry longer than the DOM, and every click after the first fenced `#` scrolled to the _next_ real heading instead of the intended one (most visibly: clicking "9) Risks / unknowns" in a spec with a YAML fence landed on "10) Decision Log").

  The source-mode outline click handler had the symmetric bug — its own line scan also double-counted fenced `#` lines.

  Both now delegate to a shared `createCodeFenceTracker` helper in core that follows CommonMark §4.5 fence semantics (3+ backticks or tildes, ≤3 leading spaces, closing fence matches opening char and length, no closing info string).

- 17d5a91: Handle final chunks from github stream buffer and bypass simple git auth check.
- Updated dependencies [ddd4efc]
- Updated dependencies [5fdd555]
- Updated dependencies [05c7e37]
- Updated dependencies [39fa932]
- Updated dependencies [3ab7ae9]
- Updated dependencies [1f030ba]
- Updated dependencies [267c8ba]
- Updated dependencies [fa8f5de]
- Updated dependencies [cb8901b]
- Updated dependencies [48d4218]
  - @inkeep/open-knowledge-core@0.3.0

## 0.2.0

### Minor Changes

- 7fb215b: feat(bridge): correctness guardrail, silent recovery UX, and settlement-based propagation for the dual-CRDT observer bridge (Y.XmlFragment ↔ Y.Text).

  **Paired-write symmetry (Bucket 0).** Adds a typed `context.paired: true` marker to the four origins that atomically write both CRDTs inside one `doc.transact()` block — `AGENT_WRITE_ORIGIN`, `FILE_WATCHER_ORIGIN`, `ROLLBACK_ORIGIN`, `MANAGED_RENAME_ORIGIN`. Server Observer A and Server Observer B now short-circuit symmetrically on paired-write drains via a semantic predicate (`context.paired === true`), closing the prior Observer-B asymmetry that could re-propagate RGA-level corruption under concurrent typing. `MANAGED_RENAME_ORIGIN` is now exported and included in `BRIDGE_ENFORCING_ORIGINS`.

  **Loud-on-content-loss merge (Bucket A).** `mergeThreeWay` now asserts a maximal-unique-line-substring post-condition with a weak order-preservation side-check (`assertContentPreservation`). Violations throw `BridgeMergeContentLossError` in tests so regressions surface; production swallows the error, emits a structured `bridge-merge-content-loss` JSON log, and queues a silent named checkpoint via the new `saveInMemoryCheckpoint` shadow-repo primitive so the editor keeps responding. Users can recover the pre-merge state via the existing TimelinePanel — no toast, no banner. The algorithm's academic-proven limits (Khanna-Kunal-Pierce 2007) are turned into observable, recoverable events rather than silent byte loss.

  **TimelinePanel kind-aware rendering.** Checkpoint rows render with distinct icon + label per kind: `Save Version` (diamond, existing), `bridge-merge-loss` (amber alert-triangle, "Before concurrent merge @ …"), `external-change-rescue` (sky file-archive, "External change recovered @ …"). Pure helpers `checkpointVariant` + `checkpointHeadlineLabel` are exported for tests.

  **Rescue-buffer consolidation.** Reconcile-delete and branch-switch rescue paths now write `external-change-rescue` checkpoints to `refs/checkpoints/<branch>/*` via `saveInMemoryCheckpoint`. `/api/rescue` + `/api/rescue/:docName` merge flat-file (shutdown-flush, retained) and timeline-ref (new) sources — response rows carry a `source: 'flat' | 'timeline'` discriminator.

  **Settlement-based observer dispatch (Bucket B).** Server Observer A + Observer B now run from `doc.on('afterAllTransactions', ...)` — one fire per outermost `doc.transact()` drain, Observer A before Observer B so any Y.Text write from A is visible to B. The 50 ms wall-clock debounce is gone. Client observer debounce machinery is deleted (per precedent #14, the client is baseline-only). A new grep gate (`packages/server/src/bridge-no-wallclock.test.ts`) fails CI if wall-clock `setTimeout` reappears in either bridge-observer file.

  **Telemetry.** New `bridgeMergeContentLoss` and `bridgeMergeCheckpointCreated` counters exposed via the existing `GET /api/metrics/reconciliation` endpoint. Structured log events (`bridge-merge-content-loss`, `bridge-merge-checkpoint-created`) follow the existing JSON-log convention.

  **Elevated fuzz coverage.** `bridge-convergence.fuzz.test.ts` now runs 200 seeds per PR (`STRESS_FUZZ_PR=1`, wired in `ci.yml`), 10 000 seeds nightly (`STRESS_FUZZ_NIGHTLY=1`, wired in `nightly.yml`), and logs the resolved seed count at startup for CI visibility. Default local runs remain 25 seeds to keep the dev loop fast.<br>_[Corrected 2026-04-19 post-ship: automated fuzz tier removed from CI and nightly per `specs/2026-04-19-ci-signal-quality/SPEC.md` (FR-2 / D-Q1 LOCKED). `STRESS_FUZZ_PR` and `STRESS_FUZZ_NIGHTLY` env wirings deleted from both workflows; the fuzz test file is preserved and invoked ad-hoc via `bun run measure:fuzz`.]_

  **Fuzz structural quiescence.** Tests now use `awaitDocQuiescence(doc)` instead of `wait(ms)` around `pauseSync`/`resumeSync` — race reproduction is event-ordered, not wall-clock.

  Precedents #1, #11(b), and #13(b) in `AGENTS.md` are updated to reflect the shipped behavior.

### Patch Changes

- Updated dependencies [7fb215b]
  - @inkeep/open-knowledge-core@0.2.0

## 0.1.1

### Patch Changes

- @inkeep/open-knowledge-core@0.1.1

## 0.1.0

### Minor Changes

- 1f72b85: feat: exclude git-ignored files from document system

  The file watcher now maintains a filtered in-memory file index, replacing the slow `readdirSync` in the documents API. Filtering uses a unified `ContentFilter` that combines `.gitignore` rules with `config.content.exclude` patterns. The `content.include` and `content.exclude` config fields are now wired end-to-end. Response time for `GET /api/documents` dropped from ~35s to ~2-5ms.

- 50a5d7f: feat: replace @tiptap/markdown with unified + remark pipeline

  - Swap markdown parsing/serialization from marked + @tiptap/markdown to unified + remark-parse + remark-gfm + remark-frontmatter + remark-mdx + @handlewithcare/remark-prosemirror
  - Rename ProseMirror schema nodes to mdast-canonical names: bold→strong, italic→emphasis, horizontalRule→thematicBreak, separate bulletList/orderedList→unified list+listItem
  - Add source-form fidelity preservation via position-slice walker (delimiter, fence, bullet marker recovery)
  - Add D20 escapeMark for backslash-escape round-trip of structurally-ambiguous characters
  - Add R23 autolink/void-HTML guard for remark-mdx coexistence
  - Public MarkdownManager.parse()/serialize() API preserved — no consumer changes required

- 81e2503: feat: add suggest_links discovery and precision patch targeting

  - add a `suggest_links` MCP tool and `/api/suggest-links` endpoint for deterministic missing-link discovery
  - add title-aware and alias-aware mixed live-or-disk scanning that skips already-linked and non-prose regions
  - add optional offset-aware `edit_document` patch targeting so follow-up edits can address an exact mention

- 29fc273: feat: symlink-safe file sync

  Symlinks inside the content directory are now fully supported. The file watcher indexes documents by canonical path (`realpath`), deduplicating aliases that point to the same file into a single Y.Doc. Persistence writes target the canonical path so atomic rename never breaks symlink chains. Symlinks that escape the content directory are refused, cyclic symlinks are rejected, and broken symlinks fall back to direct writes. The `/api/documents` endpoint surfaces alias metadata (`isSymlink`, `canonicalDocName`, `targetPath`), and the file sidebar renders a Link2 badge with a hover tooltip for symlinked entries.

### Patch Changes

- 3eb50c2: fix(bridge): close Bug-A (server-side `syncTextToFragment` destroying concurrent client XmlFragment) and Bug-B (client Observer A's remote-tx baseline refresh absorbing local changes). Server-side agent writes now follow the XmlFragment-authoritative pattern (`applyAgentMarkdownWrite` replaces `syncTextToFragment`). Client Observer A uses conditional baseline refresh when a local debounce is pending. Extracts `applyByPrefixSuffix` to `@inkeep/open-knowledge-core` for shared use. Hardens the bridge-testing harness (FR-11 invariant watcher, FR-12 origin probe, FR-15 Scheduler DI with clock unification, FR-16 network control, FR-17 multi-client convergence fuzzer with char-granular content oracle).
- e8f4dd8: Markdown pipeline engineering health — 21 P0 requirements landing across perf measurement, code refactors, fidelity fixes, test tightening, and CI infrastructure.

  **Perf measurement:** seeded synthetic benchmark corpus + committed harness with pinned methodology (10 warm-ups, `Bun.gc(true)`, `bun@1.3.11`); re-measured baseline at 7 block counts; per-stage profile harness + published findings; calibrated perf regression gate (`max(2× p99 variance, 10% floor)`) + parse-health gate (`parseFallback.wholeDoc === 0`) in tier-2 CI.

  **Code refactors:** R23 guard `O(n·m) → O(n log n)` via pre-indexed tag-offset map + binary search (568.88ms → 4.76ms on pathological corpus); processor caching at `MarkdownManager` construction + idempotency refactor for both `remarkMdxAgnostic` and `remarkWikiLink` attachers; 2-phase merged post-parse walker (Phase A restoration + Phase B merged dispatcher) gated by one-time byte-for-byte mdast diff validator on 714 fixtures; structural PM↔mdast fix — `hydrateMarks` outside-in greedy (library patch), `Code` mark `excludes: '_'` widened via `CodeMarkFidelity` (schema widening per precedent #9), context-aware backslash-before-entity policy.

  **Fidelity:** all 6 CommonMark serialization bugs fixed. CommonMark corpus 652/652 idempotent; `KNOWN_CRASH_CEILING` lowered from 50 to 0; all 19 formerly-NORMALIZE sections promoted to byte-identity idempotence assertion.

  **Test tightening:** NG1 + NG11 byte-identity pinning; I3's `markdownDoc` arbitrary parametric blank-line joiner; 6 new PBT invariants (emphasis-cumulation, backslash-idempotence, list-nesting, html-block-edge, link-edge, image-edge) green at 1K samples; `parseWithFallback` perf bound (≤5× happy-path) + parametric `MAX_SPLIT_DEPTH` boundary test.

  **Infrastructure:** all markdown fixtures consolidated into `packages/core/src/markdown/fixtures/{commonmark,gfm,mdx,wiki-links,frontmatter,ng-pinned,perf}/` with typed loader helpers; all 7 stale `@tiptap/markdown` references removed; three CI tiers (`ci.yml` / `nightly.yml` / `weekly.yml`) calibrated against measured baselines.

- 12ee3d6: Add a dead-link audit surface to the server API and expose it through the MCP tool surface.
- 0918570: Sidebar + editor UX polish:

  - File/folder rows get a Copy Path context action with Full Path + Relative Path submenu, backed by a new loopback-gated `GET /api/workspace` endpoint.
  - Sidebar header gains an Expand All / Collapse All dropdown (click-to-open, tooltip on hover); per-folder subtree variants in the row context menu. Bulk mutations wrap in `startTransition` so the close animation stays 60fps while hundreds of rows materialize.
  - Agent-file basename (`AGENTS.md` / `CLAUDE.md` / `SKILL.md`, case-insensitive) renders a muted `Bot` badge on the right of the row, matching the symlink `Link2` style. Tailwind v4 trailing-`!` defeats the nested-row color-override rule.
  - Theme toggle System icon: `Contrast` (was `Monitor`). Sidebar collapse tooltip: state-aware `Hide Files` / `Show Files`. Capital Case on all menu labels.
  - Internal refactor: `FileTreeHandle` imperative ref replaces the prior `createTrigger` seq-counter + `useEffect` pattern — React 19 ref-as-prop.

- Updated dependencies [3eb50c2]
- Updated dependencies [07161e2]
- Updated dependencies [e8f4dd8]
- Updated dependencies [50a5d7f]
  - @inkeep/open-knowledge-core@0.1.0
