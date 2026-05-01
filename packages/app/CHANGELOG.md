# @inkeep/open-knowledge-app

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

- f3ad7e9: feat(cb-v2): empty-state placeholder for canonical media descriptors

  Slash-inserting an `img`, `video`, or `audio` block now renders a
  Notion-style "Add an image / a video / audio" pill instead of the
  browser's broken-source UI. Clicking the pill opens the existing
  PropPanel popover with the relevant input autofocused; once the URL is
  filled in, the pill swaps for the rendered media.

  The pill is descriptor-driven, so future canonicals get the same
  empty-state UX automatically. A new optional field on `JsxComponentMeta`
  lets a descriptor override the default copy and icon when the generic
  fallback isn't natural English:

  ```ts
  placeholder?: { label?: string; icon?: string };
  ```

  The fallback ladder is:

  - **Label** — `descriptor.placeholder.label` falls back to
    `\`Add ${descriptor.displayName.toLowerCase()}\``.
  - **Icon** — `descriptor.placeholder.icon` falls back to
    `descriptor.icon`, then to `Box` if the icon name isn't registered in
    the lucide map.

  The pill renders only when an `autoFocus`-flagged required string prop
  is empty (`src === ''` for the media trio). Container descriptors
  (`hasChildren: true` — `Callout`, `Accordion`) keep their existing
  empty-state UX through `emptyChildName` and never show the pill.

  The pill spans the full doc-body width and sits above the regular
  hover-revealed chrome bar (gear, move-up / move-down, delete). The
  chrome stays visible in placeholder mode for parity with how the
  chrome's gear-hint UX already surfaces on any other unconfigured
  component (e.g. `<img alt="">`) — there is no special-cased hide.

  To keep the wrapper's HTML5 drag-to-reorder working through the pill,
  the placeholder is rendered as `<div role="button">` rather than a
  native `<button>`; native buttons capture mousedown for activation and
  prevent the wrapper's drag from initiating. Keyboard activation is
  covered by both the wrapper's existing `handleKeyDown` (Enter/Space
  when selected) and a local `onKeyDown` on the pill.

  This is a pure render-time addition. Storage shape, MDX serialization,
  and on-disk round-trip are unchanged — a fresh slash-inserted block
  still serializes to `<img src="" />` and round-trips byte-identically.

- 7242822: feat(cb-v2): lowercase media canonicals + PropPanel Advanced section + cross-app clipboard fidelity

  Follow-up architectural pivot on the Component Blocks v2 5-pack. The three media canonicals are now lowercase HTML-tag-spelled — `img` / `video` / `audio` — replacing the capitalized `Image` / `Video` / `Audio` descriptors that shipped in the original 5-pack. PropPanel gains an "Advanced" collapsible section so the long tail of HTML-native attributes (`srcset`, `sizes`, `decoding`, `fetchpriority`, `crossorigin`, `referrerpolicy`, etc.) doesn't dominate the panel for common edits.

  The rule formalized in `built-ins.ts`: a canonical descriptor goes lowercase when (a) the HTML primitive carries a complete-enough attribute set that nothing OK-specific needs to live as a prop, and (b) compositional wrappers (Frame, Figure, etc.) are the canonical home for OK-specific affordances around the primitive. Capitalized canonicals stay capitalized when HTML has no covering primitive (`Callout`) or the closest one is a structural subset (`Accordion` vs `<details>`).

  What changed for authors:

  - **Slash menu labels remain capitalized** ("Image" / "Video" / "Audio") via `displayName`, so the authoring UX is unchanged. The descriptor name (and the MDX bytes on disk) flip lowercase: a slash-menu insert now writes `<img src="…" alt="…" />` instead of `<Image …/>`.
  - **`caption` and `zoom` are dropped** from the Image descriptor's prop surface. `zoom` becomes always-on inside the Image React component (click-to-zoom for every `<img>`); a future Frame v2 wrapper will host caption + border + decorations as a compositional element. `<figure>` / `<figcaption>` rendering is removed from the bare Image component.
  - **PropPanel "Advanced" collapsible** — common props (`src`, `alt`, `width`, `height`) render flat; the HTML-native attribute tail collapses behind an "Advanced" trigger. The panel remembers per-descriptor open/closed state in localStorage. A count badge surfaces non-default-set advanced props.
  - **Cross-app paste of media now lands as real `<img>` / `<video>` / `<audio>`** — the mdast→hast handler emits native HTML elements for lowercase media canonicals, so pasting from Open Knowledge into Slack / Notion / Gmail / Google Docs renders the actual asset instead of an escaped MDX source block (`<pre class="mdx-component"><code>&lt;img …&gt;</code></pre>`). Capitalized JSX (Callout, Accordion, custom components) continues to flow through the source-as-code shape until per-descriptor `toClipboardHast` lands as a follow-up.
  - **The `CommonMarkImage` compat descriptor reroutes through `img`** — `![alt](src)` source forms still round-trip byte-identically, rendering through the same React component as canonical `img`. Compat descriptors are pure read-only round-trip preservers; for canonical-only features (srcset/sizes/etc.), insert a fresh Image block from the slash menu.

  Internal: `imageProps` / `videoProps` / `audioProps` arrays are replaced with `htmlImgProps` (12 props) / `htmlVideoProps` (11 props) / `htmlAudioProps` (7 props), each split into common + advanced subsets. HTML attribute names use lowercase spelling on the descriptor side (`autoplay`, `playsinline`, `fetchpriority`) — the React components translate to camelCase at the JSX boundary so the emitted MDX matches the HTML spec exactly. The `autolink-void-html-guard.ts` PUA-protection layer gains a self-closing JSX-canonical exemption for `img` / `video` / `audio` so lowercase canonicals reach remark-mdx as `mdxJsxFlowElement` rather than being routed into raw-HTML protection.

  Breaking changes:

  - New slash-menu inserts emit lowercase `<img>` / `<video>` / `<audio>` to disk. Any pre-existing content written with capitalized `<Image>` / `<Video>` / `<Audio>` falls through to the wildcard fallback (`UnknownComponent` chrome) since those descriptor names are no longer registered. Greenfield posture: rename in place to recover the registered descriptor.
  - `caption` and `zoom` props removed from the Image descriptor. Pre-existing `<Image caption="…" zoom={false} />` content keeps the props as wildcard attributes (preserved verbatim, no longer interpreted) until renamed to `<img>` and rewritten through Frame v2.

  Bundle size: the all-JS-chunks ceiling raises from 1.15 MB → 1.2 MB to absorb the post-merge composition (this PR's lowercase pivot + PropPanel Advanced + Collapsible primitive on top of main's #311 client-side y-indexeddb buffer-and-replay, agent-activity-panel, statistics-footer). Main app bundle stays well under its 280 kB ceiling. Delivered via on-demand chunk loading — first-paint cost is unchanged.

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

- 2732c81: feat(clipboard): component contract + byte preservation across the paste matrix

  Restores byte-preservation across the OK→OK / OK→external / external→OK / cross-machine clipboard paste matrix. Three independent additive layers on the existing pipeline:

  1. **FR-13-first dispatcher reorder + heuristic extension.** The markdown-first ambiguity tiebreak now runs ahead of the `data-pm-slice` Branch C in both WYSIWYG and Source dispatchers — OK-canonical bytes route through `mdManager.parse` before PM-native parseFromClipboard can fight TipTap parseDOM rules. The `is-markdown.ts` heuristic gains six new signals (blockquote, inline code, paired emphasis, capitalized JSX, lowercase JSX-with-attr, raw-HTML-inline) so cross-machine markdown-text transport (raw `<Callout>` from email/Slack/file) recovers descriptor identity. The previous dispatcher order silently flipped `<img/>` JSX to `![alt](src)` (PR #310's lowercase pivot regression) and converted capitalized `<Callout>` to a `<pre class="mdx-component">` codeblock.

  2. **Live-DOM walker as default outbound text/html mechanism.** `clipboardSerializer.serializeFragment` walks the live editor DOM via `view.nodeDOM(pos)`, clones each top-level slice node, and inlines allowlisted computed styles via `getComputedStyle`. The React render IS the cross-app HTML shape — `<aside class="callout">` for Callout, native `<img>` / `<video>` / `<audio>` for media, real `<details><summary>` for Accordion. Per-descriptor `JsxComponentMetaBase.toClipboardHast` is an OPTIONAL override for descriptors with hidden state (Tabs with conditionally-rendered children, Canvas with bitmap state); the v1 5-pack uses zero overrides. Activity-hidden subtrees (`view.nodeDOM(pos) === null`) fall through to a per-descriptor static palette so the case isn't silently empty.

  3. **FR-20 escape contract at the walker boundary + build hygiene + chevron-as-real-DOM refactor.** The walker enforces four filter classes during the pairwise walk: computed-style allowlist, class blocklist, attribute blocklist, and URL-scheme allowlist via `isSafeWalkerUrl` for href/src/srcset/poster/formaction/xlink:href + `sanitizeEmbeddedUrlValue` for aria-label/aria-description/title + `sanitizeStyleAttrValue` for `style` payloads + `isDangerousEventHandlerAttr` for `on*`. Allowlist posture (not denylist) closes leading-whitespace bypass, srcset multi-URL bypass, novel-scheme fail-open, and `data:image/svg+xml` SVG-XSS host. `Callout.tsx` collapsible + `Accordion.tsx` chevron refactored from `::before` pseudo-element to real `<ChevronRight>` lucide icon (pseudo-elements don't survive `cloneNode`). `--conditions=development` dropped from per-package test scripts in `app`/`core`/`server`/`cli` so tests resolve to the same `dist/` artifact production consumers use.

  New public exports from `@inkeep/open-knowledge-core`:

  - `SAFE_URL_SCHEMES` — canonical scheme array (`['https', 'http', 'mailto', 'tel', 'ftp', 'sms']`); single source of truth for the URL allowlist used by the markdown pipeline (`isSafeUrl`), the clipboard walker (`isSafeWalkerUrl`), and the JSX-prop sanitizer (`URL_SCHEME_ALLOWLIST`).
  - `SAFE_URL_SCHEME_RE` — regex form derived from `SAFE_URL_SCHEMES`, with relative-URL path-prefix alternates (`/`, `#`, `?`, `./`, `../`).
  - `isSafeUrl(url)` — boolean classifier; trims leading whitespace before testing; treats empty strings as benign.
  - `ClipboardHastContext` — type for the optional `descriptor.toClipboardHast` override signature.

  Internal: `JsxComponentMetaBase` gains an OPTIONAL `toClipboardHast?` method. The clipboard module gains `clipboard-walker-fallback-fired`, `clipboard-walker-url-blocked`, and `clipboard-hast-override-invoked` (reserved) telemetry events. `RawMdxFallback.parseHTML` widens (additive per precedent #9) to accept both `div[data-raw-mdx-fallback]` (in-app NodeView) and `pre[data-raw-mdx-fallback]` (outbound walker shape) so OK→OK Branch C round-trip can reconstruct the rawMdxFallback node.

  No breaking changes — every change is additive or behavior-preserving. Pre-existing `paste-fidelity.e2e.ts` wiki-link assertions updated to match the new walker chip shape (`data-wiki-link` parseDOM marker is preserved; cross-app destinations strip class/data attrs and surface the alias text consistent with NG-S6 destination-stripping).

  **Cross-app render fidelity follow-up (post-Pass-5):**

  - **`oklch()` / `oklab()` / `lab()` / `lch()` → `rgb()` conversion at copy time.** Modern Chrome's `getComputedStyle()` returns CSS Color 4 function literals; destination HTML renderers (Gmail, Notion, Slack-class) cannot parse these and fall back to default colors — invisible chevrons, missing accent borders. The walker's `buildInlineStyleFrom` now passes every value through `convertCssColors` (new export from `@inkeep/open-knowledge-core` clipboard-sanitize leaf) before emitting. Pure regex + math implementation; no dep added.
  - **`OPT_OUT_ATTR` (`data-clipboard-omit`) promoted to public export.** First consumers wired: `JsxComponentView`'s chrome bar, stuck-state row, and add-child pill mark themselves so the walker drops the entire chrome subtree. `drag-handle.ts` opts out defensively. Editor toolbar SVGs (`lucide-trash2`, `lucide-settings2`, `lucide-arrow-up/down`) no longer leak into cross-app paste.
  - **Inline lucide SVG → Unicode glyph at walker emit.** No major paste destination preserves inline `<svg>` (Gmail's image proxy refuses, Outlook retired SVG support in Sept 2025, Notion / Slack / Google Docs strip on paste). The walker now substitutes a `<span aria-hidden="true">{glyph}</span>` for each mapped `lucide-*` SVG via `replaceLucideIconsWithGlyphs` (new export). Color survives via the parent's already-inlined `style="color: rgb(...)"`. Six icons mapped (chevron-right, info, lightbulb, message-square-warning, alert-triangle, alert-octagon) covering the v1 5-pack. Unmapped lucide-\* classes surface a once-per-process `clipboard-walker-unmapped-lucide-icon` telemetry event so future descriptors don't silently regress. In-app render is unchanged — walker-localized.

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

### Patch Changes

- 6dec4bc: fix(cb-v2): return DOM focus to editor on PropPanel close

  After the descriptor PropPanel popover closed via Escape (e.g. `/image` →
  fill `src` → Escape), the next keystroke vanished — Radix's FocusScope
  unmount restored focus to a stale `previouslyFocusedElement` (the gear
  button or a now-detached slash-menu element) instead of the editor body.
  The user had to click back into the editor before typing worked, breaking
  the Notion-style "fill prop → Escape → continue typing" loop.

  Override Radix's default close-time focus restore via `onCloseAutoFocus`
  on `<PopoverContent>`, gated on self-closing-leaf descriptors so
  containers (Callout/Accordion) keep the trigger-restore default. The
  override runs synchronously inside Radix's `setTimeout(0)` close-tick,
  beating the rAF-vs-setTimeout race the previous `editor.view.focus()`
  in `handleOpenChange`'s rAF couldn't reliably win.

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

- 53fd6a8: fix(editor-cache): walk pool.entries on demote so non-V2-cached providers disconnect

  `setActivityMountList`'s demote loop only consulted the V2 editor cache
  (`tiptapCache` + `cmCache`) to find a doc's provider. When a doc was
  `ProviderPool`-resident but not V2-cache-resident — defer-mounted +
  `BYTES_CACHE_THRESHOLD`-rejected, which happens for multi-MB docs at small
  `ACTIVITY_MOUNT_LIMIT` — the lookup returned null, the disconnect was
  silently skipped, and the provider kept draining peer bytes into the local
  Y.Doc forever. FR3b violated at limit=1.

  Stash the `ProviderPool` reference on `subscribePoolEviction` (cleared on
  its unsubscribe). The lookup now falls back to `pool.entries` so demote-
  path disconnects fire for the full set of pool-resident docs, not just the
  V2-cached subset.

  Production exposure is currently dormant — shipped `ACTIVITY_MOUNT_LIMIT`
  is 3, and the bug only manifests at limit=1 — but the silent-skip class is
  removed so the contract holds if the limit ever changes or an unrelated
  code path lands a doc in `pool.entries` without going through the cache.

- 63a72de: fix(editor-cache): clear undoManager.restore on park/evict to break TipTap+Yjs leak chain

  TipTap mount/destroy cycles were leaking ~30 MB per cycle on multi-MB
  documents (heap-snapshot probe: 10× PROJECT navigations retained 10 full
  editor DOM trees). Two cooperating upstream behaviors caused the chain —
  Yjs `UndoManager`'s constructor registers a `doc.on('destroy', …)`
  listener with no stable reference (so `UndoManager.destroy()` cannot
  deregister it; verified unfixed across `yjs@13.6.30`, `v14.0.0-rc.13`,
  and `main`), and `@tiptap/extension-collaboration`'s plugin-view destroy
  assigns `undoManager.restore = closure` capturing the entire `EditorView`

  - `ProsemirrorBinding` + `Editor` + PM document tree.

  The cache now captures the per-editor UndoManager via `yUndoPluginKey`
  before `editor.destroy()` and nulls `undoManager.restore` after destroy
  returns at both call sites (`parkTiptapEditor` `__uncached` branch and
  `evictTiptapEditor`). The leaked UndoManager itself remains in
  `Y.Doc._observers` but its retained payload drops from ~30 MB to a few
  hundred bytes per cycle — heap is now flat across PROJECT mount/destroy
  cycles (0.14 MB/cycle drift, well below the noise floor).

- Updated dependencies [fbfe967]
- Updated dependencies [fbfe967]
- Updated dependencies [f3ad7e9]
- Updated dependencies [7242822]
- Updated dependencies [7242822]
- Updated dependencies [8b64fdb]
- Updated dependencies [2732c81]
- Updated dependencies [7242822]
- Updated dependencies [fd31cf2]
- Updated dependencies [5d916f4]
- Updated dependencies [9f0daa2]
- Updated dependencies [73a358d]
- Updated dependencies [8a6cb2d]
  - @inkeep/open-knowledge-core@0.4.0
  - @inkeep/open-knowledge-server@0.4.0

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

- 3ab7ae9: feat(desktop): M4 `openknowledge://` URL scheme end-to-end.

  Closes M4's DOD in the Electron desktop app. Clicking `openknowledge://open?project=<abs-path>&doc=<name>` from any surface (Terminal `open`, Mail/Slack hyperlinks, MCP tool responses in Claude Desktop) routes the user to the right project window with the renderer navigated to the target doc. Unblocks M6: MCP `preview-url.ts` now emits `openknowledge://` URLs when running inside Electron (gated on `OK_ELECTRON_PROTOCOL_HOST=1`, set at utility fork), and falls through to `http://localhost/...` for CLI/bunx consumers.

  Implementation details: synchronous top-level `open-url` listener registration (per electron/electron#32600 — `open-url` can fire before `will-finish-launching` OR `ready` on macOS); VS Code-style queue-then-flush with 10 × 500ms retries; `second-instance` argv scan for CLI-style launches; `realpathSync`-canonicalized `windowsByPath` keys; `dom-ready`-gated `sendDeepLink` on cold spawns to defeat subscriber-mount races; dev-mode `setAsDefaultProtocolClient('openknowledge')` with `before-quit` cleanup via `removeAsDefaultProtocolClient` (prevents stale Launch Services bindings to deleted worktrees). Path-traversal defense rejects null bytes (pre-decode + post-decode for layered `%2500` shapes), URL-decodes, then checks the raw decoded string for `..` segments before normalization — `path.resolve`'s silent-flatten behavior makes equality-style gates insufficient. `shell.openExternal` scheme allowlist (`https`, `http`, `mailto`, `openknowledge`) enforced at the main-process boundary per D47. Nested doc names (`notes/meeting-2026`) round-trip correctly via `encodeURIComponent` on both producer (preview-url) and consumer (renderer hash nav) sides.

  macOS-only v0 per D51. Windows/Linux NG1/NG2 paths remain `NOT NOW`. Cold-start Apple-Event delivery requires signed DMG + Launch Services binding — deferred to M3/M7 and captured as a named `test.skip` in `deep-link.e2e.ts` for explicit CI visibility.

  See `specs/2026-04-21-m4-url-scheme/SPEC.md` and parent `specs/2026-04-11-electron-desktop-app/SPEC.md` §14.

- 19b51e4: feat(desktop): M6 CLI-on-PATH install + first-launch MCP consent.

  Closes M6's DOD on the Electron desktop app. Two phased deliverables on one branch:

  - **M6a — Install Command-Line Tools…** menu item (macOS only). Click → admin prompt → `/usr/local/bin/ok` + `/usr/local/bin/open-knowledge` symlinks pointing at the bundled wrapper. Wrapper uses `ELECTRON_RUN_AS_NODE=1` to host the CLI under the bundled Electron binary — no separate Node install required (D17 amendment flips `RunAsNode` fuse to `true`; VS Code / Atom precedent). Translocation guard refuses install from DMG mount; collision guard prompts before stomping foreign files; G5 launch-time repair offers re-link when symlinks point at a removed bundle.
  - **M6b — first-launch MCP consent dialog** (host-agnostic; renders in whichever window opens first per D-M6-R10). User-scoped marker at `~/.open-knowledge/mcp-status.json` fires the dialog exactly once per user per Mac. Detected editors preselected (Claude Code, Claude Desktop, Cursor, VS Code, Codex, Windsurf — `detectInstalledEditors` already global-scoped). Add → per-editor MCP config writes via NEW CLI export `writeUserMcpConfigs(opts)` (NOT `runInit` — `runInit` runs `ensureProjectGit` + `initContent` + `scaffoldLaunchJson` + `upsertRootInstructions` which would `git init /` from a packaged Electron app's `process.cwd()`). Hybrid `cliPath` per D-M6-R9: `/usr/local/bin/ok` when M6a installed AND ownership-checked, bundle-absolute `Resources/cli/bin/ok.sh` otherwise.

  Public-surface additions to `@inkeep/open-knowledge` (the published CLI):

  - `writeUserMcpConfigs(opts: UserMcpConfigsOptions): Promise<EditorMcpResult[]>` — new export. Writes per-editor MCP entries without `runInit`'s project-scoped side effects. Surface for Electron main; CLI `ok init` from terminal continues to use `runInit` unchanged.
  - `UserMcpConfigsOptions` interface — `{editors, force?:boolean|Set<EditorId>, cliPath?:string, home?:string}`.
  - `readExistingMcpEntry(target, cwd, home?)` — new export. Format-aware (JSON / TOML) tolerant reader. Never throws — returns `null` on absent / unparseable / shape-incompatible config.
  - `writeEditorMcpConfig` — promoted from private to exported (was already declared at `init.ts`, now available via the public surface).
  - `McpInstallOptions.cliPath?: string` — new optional field. Highest-precedence branch in `buildManagedServerEntry`: `{command: cliPath, args: ['mcp']}`. Backward-compatible — existing `ok init` calls without `cliPath` continue to produce the canonical `{command:'npx', args:['@inkeep/open-knowledge','mcp']}` shape.

  Notable implementation decisions:

  - `confirmHandler` returns `{ok:false, error: <user-readable>}` on partial-write failure — sonner toast surfaces the failure to the user since the dialog itself unmounts on result resolution. Marker stays absent (deferred-marker per OQ-19) so the dialog re-fires next launch for retry.
  - Renderer-ready handshake (D-M6-R10) registers a one-shot `ok:mcp-wiring:renderer-ready` invoke handler; main responds with `ok:mcp-wiring:show` to the same WebContents and removes the handler ONLY on successful dispatch — so a failed first dispatch keeps the handler armed for the next renderer's mount-ack.
  - POSIX-safe shell escape on the install-script command builders — apostrophes in bundle paths (renamed `.app`, account name with `'`, etc.) cannot inject root commands through the `osascript ... do shell script "..." with administrator privileges` chain.
  - Atomic marker writes via `tmp+rename` — mirrors `state-store.saveAppStateToDir` so power-loss between write and fsync can't leave a truncated marker.
  - macOS-only v0 per D51. Windows/Linux NG4 paths remain `NOT NOW`.

  See `specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md` and parent `specs/2026-04-11-electron-desktop-app/SPEC.md` §14.

- 267c8ba: feat(handoff): "Open in Agent Desktop" — one-click handoff from Open Knowledge to Claude Cowork / Claude Code / OpenAI Codex Desktop / Cursor.

  A new "Open in…" dropdown surfaces from three places — the editor header action strip, the `Cmd+K` command palette ("Open in agent" group), and the file-tree right-click menu — routing every click through a single `dispatchHandoff` entry point (AC9 asserts no other dispatch sites). Each enabled row fires the target's canonical URL scheme through the existing `shell.openExternal` IPC (Electron host) or an anchor-click (web host), with a minimal auto-composed prompt that points the target agent at the doc plus a hint to use the `open-knowledge` MCP for backlinks + related context. Disabled rows render with a keyboard-reachable submenu — install link + `Open in claude.ai →` secondary affordance on Claude rows — instead of a non-interactive tooltip.

  Built on four pure URL builders in the new `packages/core/src/handoff/` (`claude-url.ts`, `codex-url.ts`, `cursor-url.ts`, `web-fallback-url.ts`) with an encoding discipline pinned against Cursor's two-pass-decode behavior (`text=` double-encoded, `workspace=` single-encoded basename, `mode=agent` literal). The Cursor two-step dispatcher (`cursor-two-step.ts`, Electron only per E4 DIRECTED) spawns the workspace first through a dedicated `ok:shell:spawn-cursor` IPC — distinct from the URL-scheme allowlist because the threat model is a command allowlist — then fires the `cursor://` prompt after a 1000–1500 ms settle. On macOS the spawn routes through `/usr/bin/open -a <bundle>` because `app.getApplicationInfoForProtocol('cursor://')` returns the `.app` bundle (a directory), not an executable.

  Install detection is unified across hosts: Electron uses `app.getApplicationInfoForProtocol(scheme)` per probe (with an `xdg-mime query default x-scheme-handler/<name>` fallback on Linux); web uses a new `GET /api/installed-agents` endpoint with a per-scheme 60 s server-side cache, a 10 s per-client refresh throttle, and the standard `checkLocalOpSecurity` loopback + Host-header gate. Windows probes the merged `HKCR` view so machine-scope (HKLM) installers are detected alongside user-scope. Web-host Cursor is always disabled-with-tooltip regardless of probe result (E4 DIRECTED — local-use-case only; the `/api/handoff/open-folder` cross-machine primitive is deferred).

  Security: `packages/desktop/src/main/shell-allowlist.ts` (D47) extended with `claude:`, `codex:`, `cursor:` behind per-scheme JSDoc and an exact-set test. A drift-detector in `shell-allowlist.test.ts` reads `KNOWN_TARGETS` and fails if any future target lands without an allowlist row. Every outbound URL is built by a typed pure function — never from user-supplied raw URL strings.

  Observability: `~/.open-knowledge/stats.jsonl` append-only per dispatch (zero phone-home per XQ3 LOCKED). Success/failure sonner toasts close the DC3/DC4/vendor-drift silent-failure gap, with a bounded retry (2–3 attempts; distinct copy on the final failure) per review M5. Full spec with decision log + test plan at `specs/2026-04-21-open-in-agent-desktop/SPEC.md`; end-user guide at `docs/content/guides/open-in-agent-desktop.mdx`.

- ba88a91: feat: OpenTelemetry instrumentation — opt-in end-to-end traces + metrics + log correlation across the browser → HTTP → Hocuspocus → persistence → shadow-repo → disk chain. Zero overhead when disabled (server default: `OTEL_SDK_DISABLED=true`; frontend default: `VITE_OTEL_ENABLED` unset, SDK dynamic-import-gated out of main bundle). Ships a local Grafana LGTM docker-compose stack at `docker/otel-dev/` (Grafana + Tempo + Loki + Prometheus + OTel Collector) with auto-provisioned datasources — no third-party subscriptions required. Adds `packages/server/src/fs-traced.ts` as the sanctioned path for instrumented disk writes (hand-rolled because `@opentelemetry/instrumentation-fs` is broken under Bun). Pino log records now carry `trace_id` / `span_id` / `trace_flags` via `otelMixin` for trace↔log correlation in Grafana.
- 6839071: feat(desktop): file-tree right-click → "Reveal in Finder" / "Reveal in File Explorer" / "Open Containing Folder".

  A new entry on the file-tree row context menu (Electron host only) reveals the right-clicked file or folder in the OS file manager. Label adapts per platform — "Reveal in Finder" on macOS, "Reveal in File Explorer" on Windows, "Open Containing Folder" on Linux (matching VS Code's copy; the Linux verb asymmetry is intentional because no single Linux file manager has a stable brand to "Reveal in"). Hidden on the web variant where it would have no useful no-op.

  Wired through a new `ok:shell:show-item-in-folder` IPC channel that wraps Electron's `shell.showItemInFolder`. Path validation reuses the same `validateSpawnPath` + `isPathWithinProject` lexical guard the Cursor handoff already enforces — out-of-project, non-absolute, or null-byte-bearing paths are silently refused at the wire, with a main-process `console.warn` capturing the refusal reason (`invalid-format` / `no-project-bound` / `out-of-project`) for debugging. Disabled-with-hint when the renderer hasn't yet resolved the workspace metadata, mirroring the `Open in Agent` submenu's pattern.

- 48d4218: feat(shadow-repo): collapse dual-mode to single-mode at `<projectRoot>/.git/open-knowledge/`, auto-`git init` on first run when no parent repo exists, and rename legacy `.git/openknowledge/` shadows in place.

  The shadow repo (OK's attribution journal for WIP refs, upstream imports, checkpoints, and the rescue timeline) previously branched between `integrated` mode at `<root>/.git/openknowledge/` and `standalone` mode at `<root>/.openknowledge/`. Standalone mode had semantically distinct behavior — no parent `.git/HEAD` for the HEAD watcher, no real project branch for the `refs/wip/<branch>/<writer-id>` namespace, no upstream-import path — which forced every shadow-touching change through a two-mode test matrix for zero user-facing payoff. The dual-mode split is now gone: the shadow always lives at `<projectRoot>/.git/open-knowledge/`, projects without `.git/` get auto-`git init`'d by the new `ensureProjectGit` helper (fail-fast on missing git — no degraded fallback), and legacy `.git/openknowledge/` shadows are silently `renameSync`-migrated on first run so pre-spec users keep their attribution history.

  - `@inkeep/open-knowledge-core` — `resolveShadowDir(projectRoot: string): string` — return type collapses from `{ path, mode }` to a plain string; `ShadowRepoMode` and `ResolvedShadowDir` types are deleted. `OkDesktopBridge` gains `onGitInitNotice(cb)` alongside the existing `onProjectSwitched` / `onMenuAction` push-event surfaces.
  - `@inkeep/open-knowledge-server` — new `ensureProjectGit` + `ProjectGitInitError` exports (pre-listen fail-fast hook). `BootServerOptions` gains `ensureProjectGitFn`; `BootedServer` gains `didGitInit`. `initShadowRepo` carries a ~5-line R9 rename shim for legacy layouts. `skipAutoInit` now gates both `ensureProjectGitFn` and `autoInitFn`.
  - `@inkeep/open-knowledge` — `ok start` and `ok init` call `ensureProjectGit(cwd)` in the fresh-directory path; the CLI preview-block gate extends to `didAutoInit || didGitInit` and emits `Initialized git repo at <cwd>/.git/ (default branch: main)`. `ok mcp` is unchanged directly but inherits the side effect transitively when it auto-spawns `ok start` (opt out with `OK_MCP_AUTOSTART=0` or config `mcp.autoStart: false`). `.gitignore` auto-append of `.openknowledge/` is deleted; `.openknowledge` is removed from `enrichment.ts` / `mtime-scan.ts` scan-exclusion sets.
  - `@inkeep/open-knowledge-desktop` — utility process passes `ensureProjectGitFn` to `bootServer`; `UtilityReadyMessage` carries `didGitInit`. New `git-init-notice` push event on the preload bridge; main-side dispatch deferred until `webContents.once('dom-ready', ...)` to defeat the subscriber-mount race.
  - `@inkeep/open-knowledge-app` — renderer subscriber (`lib/install-git-init-toast.ts`, wired imperatively in `main.tsx`) routes `onGitInitNotice` to `toast.info(\`Initialized git repo at ${gitDir}\`)`. No-op outside Electron.

  Legacy `.openknowledge/` standalone-mode directories are silent orphans (no detection, no warning, no migration) — OK carries zero runtime reference to that path per D5/NG5. Worktree-specific semantics are out of scope for this change; they remain owned by a separate spec (NG6).

  Full spec + decision log (D1–D14, R1–R9): [`specs/2026-04-21-shadow-repo-single-mode/SPEC.md`](specs/2026-04-21-shadow-repo-single-mode/SPEC.md).

### Patch Changes

- 334720f: fix(app): hold the "Connecting — waiting for collab server…" banner behind a 500 ms grace window so it no longer flashes on normal page loads. The red terminal banner still surfaces immediately. Extracted `computeBannerMode` + `describeError` as pure helpers with a full state-matrix unit test.
- 1f2e5e4: chore(app): structured `[collab]` logs on the `bun run dev` upgrade path. Each `/collab` WebSocket upgrade now logs `upgrade received → handleUpgrade starting → handshake complete` with the request URL, `sec-websocket-protocol`, host, origin, and hocuspocus connection count. Synchronous throws from `wss.handleUpgrade` (e.g. "handleUpgrade called twice with same socket") are now caught and logged instead of escaping the listener. A `[collab] configureServer invocation=N` line is also logged so an unexpected re-run of the plugin's server-setup hook (which would orphan the previous upgrade listener) is loud in the dev console. Diagnostic-only — no behavior change on the happy path.
- 5901e1d: fix(app): serve `/api/config` from the Vite dev plugin so `bun run dev` no longer relies on the 404 → same-origin fallback to resolve the collab URL. Matches the exact response shape served by `ok ui` in production (`{collabUrl, previewUrl, port}` with `cache-control: no-store` + `x-content-type-options: nosniff`). Eliminates the expected-but-alarming 404 in the dev Network tab and closes a timing race where an initial hash-nav could fire before `collabUrl` resolved, leaving the editor stuck at `EditorSkeleton`. Client-side 404 → absent → same-origin fallback is retained as defense-in-depth.
- 57b5033: fix(app): route `/collab/keepalive` as a bare WS in the Vite dev plugin, mirroring `ok start`'s prod handling. `ok mcp` opens a persistent `/collab/keepalive?pid=<mcp-pid>` WebSocket to keep the collab server out of idle-shutdown (D-034). Before this fix, the Vite dev plugin's `/collab` path-prefix check also matched `/collab/keepalive` and routed it into `hocuspocus.handleConnection`, where Hocuspocus waited for a sync-step-1 message the keepalive never sends — leaving the socket in a half-initialized state in Hocuspocus's connection registry. With `ok mcp` + `bun run dev` running together (e.g., Claude Code against a local dev server), that half-open registry entry could coexist with real browser `/collab` WSs and starve them. Dev now branches on `startsWith('/collab/keepalive')` first and handles it identically to `packages/server/src/boot.ts:210-235` — bare WS handshake, 30s ping timer, no Hocuspocus routing.
- 8d0f423: feat(app): persist the editor-mode choice (`wysiwyg` / `source`) as a user-global preference. Each tab/window is its own session for its lifetime: the persisted value is read at load (refresh, new tab, new Electron window) and the header toggle writes to localStorage immediately, so the next tab or refresh picks up the last toggle. Open tabs do not update each other live — the simpler per-tab-session model avoids the surprise of a tab flipping mode on focus. Applied on first paint via a synchronous inline FOUC script in `packages/app/index.html` so users whose persisted mode is `source` no longer see a flash of WYSIWYG before the switch. Diff mode remains ephemeral: exiting diff still restores the session pre-diff mode via `modeBeforeDiffRef`.

  - New `src/editor/use-editor-mode.ts` hook owns the `localStorage` key `ok-editor-mode-v1` (matching the repo's `ok-theme-v1` / `ok-pin-v1` precedent). The hook reads localStorage once via its `useState` initializer; `setItem` failures are swallowed with a `[editor-mode]` bracket-prefix `console.warn` and the session continues in-memory.
  - `EditorPane.tsx` seeds session-local `editorMode` from the read-once persisted value on mount.
  - Only user-initiated header-toggle clicks persist. Tool-driven flips (`RAW_MDX_NAV_EVENT` forcing source mode to fix a broken MDX block) stay session-scoped.
  - No new npm dependencies. Implementation is ~40 lines of TypeScript (hook + inline FOUC script).
  - E2E coverage in `packages/app/tests/stress/editor-mode-persistence.e2e.ts` (seven tests: T1, T2, T3, T4, T6, T8, T9; wired into CI `test:e2e`).

  Full spec + decision log (D1–D9, where D9 "cross-window sync rejected entirely" supersedes D7's focus-based sync per post-ship user UX feedback): [`specs/2026-04-21-editor-mode-persistence/SPEC.md`](specs/2026-04-21-editor-mode-persistence/SPEC.md).

- 17d5a91: Handle final chunks from github stream buffer and bypass simple git auth check.
- Updated dependencies [ddd4efc]
- Updated dependencies [5fdd555]
- Updated dependencies [05c7e37]
- Updated dependencies [39fa932]
- Updated dependencies [3ab7ae9]
- Updated dependencies [1f030ba]
- Updated dependencies [267c8ba]
- Updated dependencies [ba88a91]
- Updated dependencies [fa8f5de]
- Updated dependencies [cb8901b]
- Updated dependencies [48d4218]
- Updated dependencies [5444369]
- Updated dependencies [17d5a91]
  - @inkeep/open-knowledge-core@0.3.0
  - @inkeep/open-knowledge-server@0.3.0

## 0.0.4

### Patch Changes

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

- Updated dependencies [7fb215b]
  - @inkeep/open-knowledge-core@0.2.0
  - @inkeep/open-knowledge-server@0.2.0

## 0.0.3

### Patch Changes

- @inkeep/open-knowledge-core@0.1.1
- @inkeep/open-knowledge-server@0.1.1

## 0.0.2

### Patch Changes

- 0918570: Sidebar + editor UX polish:

  - File/folder rows get a Copy Path context action with Full Path + Relative Path submenu, backed by a new loopback-gated `GET /api/workspace` endpoint.
  - Sidebar header gains an Expand All / Collapse All dropdown (click-to-open, tooltip on hover); per-folder subtree variants in the row context menu. Bulk mutations wrap in `startTransition` so the close animation stays 60fps while hundreds of rows materialize.
  - Agent-file basename (`AGENTS.md` / `CLAUDE.md` / `SKILL.md`, case-insensitive) renders a muted `Bot` badge on the right of the row, matching the symlink `Link2` style. Tailwind v4 trailing-`!` defeats the nested-row color-override rule.
  - Theme toggle System icon: `Contrast` (was `Monitor`). Sidebar collapse tooltip: state-aware `Hide Files` / `Show Files`. Capital Case on all menu labels.
  - Internal refactor: `FileTreeHandle` imperative ref replaces the prior `createTrigger` seq-counter + `useEffect` pattern — React 19 ref-as-prop.

- Updated dependencies [3eb50c2]
- Updated dependencies [07161e2]
- Updated dependencies [1f72b85]
- Updated dependencies [e8f4dd8]
- Updated dependencies [50a5d7f]
- Updated dependencies [12ee3d6]
- Updated dependencies [0918570]
- Updated dependencies [81e2503]
- Updated dependencies [29fc273]
  - @inkeep/open-knowledge-core@0.1.0
  - @inkeep/open-knowledge-server@0.1.0
