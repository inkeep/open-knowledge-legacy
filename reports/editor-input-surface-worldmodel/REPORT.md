# Editor Input Surface — Worldmodel & Findings Inventory

**Created:** 2026-04-16
**Owner:** Nick Gomez
**Baseline commit (main):** `fa0050a4`
**Baseline commit (spec worktree):** `fa0050a4` on `worktree-spec-editor-input-surface`
**Spec under review:** `specs/2026-04-08-editor-input-surface/SPEC.md` (30 locked decisions)
**Status:** Worldmodel complete; findings inventory ready for `/assess-findings` triage

---

## Executive summary

The editor-input-surface spec was drafted at baseline `cafed34` with 30 decisions locked across clipboard paste, drag-drop, file upload, asset storage, wiki-link embed parsing, and Obsidian vault import. Since baseline, **78 commits** landed on main — including a substantial image-upload pipeline (`POST /api/upload-image`, `@tiptap/extension-file-handler` wiring, widget-decoration placeholders, magic-byte MIME sniffing, ContentFilter refcount admission, filter-aware sirv serving). The shipped pipeline covers roughly **17 of the 30 decisions** in full or in spirit.

**Three categories remain:**

1. **Unimplemented deltas (S1-S5, 5 items)** — non-image file drop handling, sha256 content-hash dedup, `![[file.ext]]` embed parsing with file-basename index, Obsidian vault config auto-import, user-facing upload config fields. All absent from shipped code.

2. **Design divergences (DIFF1-DIFF5, 5 items)** — spec and shipped code disagree on transport (multipart vs raw-body), asset location (co-located vs global `assets/`), markdown-ref emit shape (basename/absolute vs relative), filename sanitization (ASCII-only vs unicode-preserving), and paste decision heuristic (Archetype D always-parse vs Outline's 6-step tree). Asset location is marked as a **1-way door** in the spec.

3. **Adjacent concerns (A1-A3, 3 items)** — surfaced during the worldmodel pass, not in the original spec: CC1 broadcaster as invalidation transport for a file-basename index; image-ref rewrite coverage on parent-doc rename; Guard 5 (`validate` specs) coverage on custom nodes shipped since spec baseline.

Cross-channel prior art highlights three findings worth flagging explicitly to any triage:

- **`remark-wiki-link` does NOT parse `![[file.ext]]` embed syntax** — only `[[Page]]` text links. Fumadocs and Foam add this via custom micromark extensions. The spec's D5 implementation path is **not** a drop-in upstream integration.
- **No surveyed OSS tool implements content-hash dedup for user-dropped assets.** All use filename + numeric suffix. SHA-256 dedup would differentiate but has no UX-validated prior art.
- **No surveyed OSS tool programmatically imports `.obsidian/app.json`.** Fumadocs integrates with Obsidian via file discovery, not config parsing. The field schema remains UNRESOLVED from web + OSS probes; direct vault inspection is the next channel.

This report is the artifact for `/assess-findings` to classify the 13 findings into actionable categories before shaping a new spec.

---

## Context

### What shipped (main, `cafed34..fa0050a4`)

**Server surfaces:**

- `POST /api/upload-image` at `packages/server/src/api-extension.ts:2465-2580` — multipart+busboy transport, 10MB hard cap, magic-byte MIME detection via `file-type@8.x` for raster formats plus manual `<svg` sniff, client MIME discarded, client-supplied `parentDocName` required with path-escape guards (`\x00`, `..`, leading `/`, realpath symlink-escape check).
- `ALLOWED_IMAGE_MIME_TYPES` at `packages/core/src/constants/upload.ts:1-7` — `{image/jpeg, image/png, image/gif, image/webp, image/svg+xml}`. Non-image MIMEs return 400 "Unsupported file type."
- Filename sanitization at `api-extension.ts:127-134` — strips `/\`, replaces `[^a-zA-Z0-9_\-.]+` with `_`, fallback stem `'upload'`. Destroys CJK/Arabic/Cyrillic.
- Paste-name synthesis at `api-extension.ts:2554-2566` — regex `/^(image\.(png|jpe?g|gif|webp)|Clipboard.*|Untitled.*)$/i` triggers timestamp stem `pasted-YYYYMMDD-HHMMSS.{ext}`.
- Storage at `api-extension.ts:2505, 2568-2571` — writes to `dirname(parentDocName)` (sibling/co-located). Collision: atomic suffix loop `original-1.png → original-99.png → 500 error`.
- `ContentFilter.dirCount` at `packages/server/src/content-filter.ts:125-192` — refcount map of included `.md` per dir; asset admitted only if sibling `.md` count ≥ 1. Lifecycle hooks `incrementMdDir()` / `decrementMdDir()` at lines 179-192.
- Filter-aware sirv at `packages/cli/src/commands/start.ts:116-157` — asset priority chain: `/api/*` → `/{asset}` if not excluded → SPA fallback. `X-Content-Type-Options: nosniff` header.

**Client surfaces:**

- FileHandler wiring at `packages/app/src/editor/extensions/shared.ts:32-44` — `@tiptap/extension-file-handler` with `allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES]`; both `onDrop(editor, files, pos)` and `onPaste(editor, files, _html)` route to `uploadAndInsert`.
- Upload decoration plugin at `packages/app/src/editor/image-upload/index.ts:27-79` — ProseMirror plugin tracking uploads by UUID; skeleton widget with `animate-pulse`; position mapping across remote transactions.
- `uploadAndInsert()` at `image-upload/index.ts:104-181` — FormData POST, error-toast on fail, image-node creation on success.
- `shortestImageRef()` at `image-upload/index.ts:91-96` — same dir → basename; else → `/absolute-path`. Not a POSIX-relative `../foo/bar` emit.
- Image slash command at `packages/app/src/editor/slash-command/items.ts` (commit `4b6cf843`).
- Canonical mdast clipboard pipeline at commit `07161e26` — reference to "four clipboard paths" suggesting a structured paste dispatcher already landed.

**Test coverage:**

- `api-extension.test.ts:63-227` — 165 LOC covering happy path, missing parentDocName, path-escape attempts, MIME spoofing (EXE renamed to PNG), SVG acceptance, collision suffix loop, symlink escape rejection, paste timestamp synthesis.
- `shortestImageRef.test.ts:4-20` — 4 cases for ref shape.
- No explicit Playwright E2E for upload observed.

### What's locked in the spec (D1-D30)

- **D1-D9:** product-level commitments — accept-all files, global `assets/`, relative refs, sha256 dedup, `![[file.ext]]` embed support, standard-markdown emit default, unicode-preserving filename sanitization, rename-rewrite, publishing-out-of-scope.
- **D10-D20:** transport + wiring — raw-body POST, client-side insertion inheriting PR #7 attribution, widget decorations, multi-file sequential placeholders + parallel uploads, error recovery, `@tiptap/extension-file-handler` adoption, disk-bridge asset event handler addition, asset-serving middleware, PR #13 shadow-repo coordination, 5MB/25MB size limits, 6-guard input-path XSS defense.
- **D21-D30:** paste + edge cases — Outline's 6-step tree with fresh `isMarkdown()`, paste JSX → plain text, draft-branch asset inheritance, code-block paste bypass, drop-onto-image adjacent insert, drop-md reject, Wiki-link resolver scope Option MID (file-basename index, ~330 LOC, embed-only; Bucket 7 owns note-to-note separately), config schema `assetLocation` default, Obsidian vault detection, AVIF/WebP/SVG image format acceptance.

---

## Findings inventory (13 items)

**Triage input for `/assess-findings`. Each finding below is a candidate scope item for a follow-on spec. Evidence cited by channel: `[code]`, `[oss]`, `[web]`, `[reports]`, `[spec]`.**

### Category A: Unimplemented spec deltas (5)

#### F1. Non-image file drop handling (spec D1, absence verified)

**Spec stance:** Drop any file; images render inline, others become standard markdown links. Dead-ends-on-PDF was flagged as minute-one dogfood failure.

**Shipped reality:** MIME allowlist excludes non-images; FileHandler's `allowedMimeTypes` is pinned to `ALLOWED_IMAGE_MIME_TYPES`; server rejects non-images with "Unsupported file type". `[code]`

**Prior art:**
- BlockNote dispatches non-image drops to typed blocks via `fileBlockAccept` at `handleFileInsertion.ts:71-196` (matches MIME/extension → typed block spec). `[oss]`
- Obsidian's default accepts all files; attaches via the same path as images. `[web]`
- No surveyed editor characterizes non-image drop UX in a matrix. Clipboard report explicitly scopes binary drop OUT (§Non-goals). `[reports]`

**Open questions for triage:**
- Inline-link vs typed-block representation — aligns with typed-component-nodes spec's Phase 2 Video/Audio/PDFViewer nodes. What's the representation right now for a PDF dropped today? (Rejected, per shipped MIME allowlist.)
- Do we widen the allowlist, open-up to all MIMEs, or switch to a per-type dispatch?

---

#### F2. Content-hash dedup (spec D4, absence verified)

**Spec stance:** sha256 on save; collision-resolved without `-2`/`-3` suffixes. Framed as Obsidian's 6-year-unresolved feature-request polish win.

**Shipped reality:** Filename suffix-loop collision only (`original.png → original-1.png → … → original-99.png → error`). No hash function calls visible. `[code]`

**Prior art:**
- **No OSS tool inspected implements content-hash dedup for user-dropped assets.** BlockSuite's `AssetsManager` uses `(n)` suffix (line 10-19). Obsidian has historically refused hash-based dedup. `[oss]`
- SHA-256 dedup at scale: Hugging Face Xet, LLVM CAS. Node.js streaming-sha256 recipes documented (Transloadit). `[web]`
- SHA-256 birthday bound: ~2^128 collision security; practically collision-free to exabyte scales. `[web]`
- No report addresses asset-level content-hash dedup directly. `[reports]`

**Open questions for triage:**
- Do we differentiate on "dedup where Obsidian refuses" with no UX-validated prior art?
- Hash-the-bytes vs hash-the-normalized-content (e.g., strip EXIF)?
- Collision UX: surface dedup to user ("this looks like an existing file"), or silent?

---

#### F3. `![[file.ext]]` embed parsing + file-basename index (spec D5 + D27)

**Spec stance:** Read-path support for `![[photo.png]]` embed syntax only. Minimal file-basename index at `packages/core/src/utils/path-resolve.ts` (~330 LOC), whole-vault shortest-path. Disjoint from Bucket 7's future page-title index. D27 is marked 1-way door.

**Shipped reality:** `packages/core/src/markdown/wiki-link-micromark.ts` tokenizes `[[...]]` uniformly; no `!` prefix branch. No `path-resolve.ts`. No file-basename index. `[code]`

**Critical prior-art finding:**
- **`remark-wiki-link` (the upstream we depend on) does NOT support `![[...]]` embed syntax** — per OSS inspection of `src/index.js:36-98`, only the `[[...]]` tokenizer is exposed. `[oss]`
- **Fumadocs handles both:** `remark-wikilinks.ts:15` uses `!?\[\[...]]`; if `isEmbed=true`, resolves to image or `mdxJsxFlowElement`. `[oss]`
- **Foam handles `![[image.png|modifier]]`:** `wikilink-embed.ts:28` uses `WIKILINK_EMBED_REGEX_GROUPS`. `[oss]`
- **Foam's shortest-path algorithm:** `getShortestIdentifier()` at `workspace.ts:463-492`. Splits on `/`, reverses, iteratively eliminates haystack items that don't match needle tokens from end. Canonical pattern. `[oss]`
- Obsidian's three resolution modes — shortest-path (default), relative, absolute-vault. Case-insensitive with space/hyphen/underscore normalization. `[reports]`
- Reports concur Foam-style Map + Obsidian case-insensitive normalization is the canonical shape. `[reports]`

**Open questions for triage:**
- Implementation path: extend `wiki-link-micromark.ts` in-tree with `!` prefix branch, or switch to a Fumadocs-style remark plugin?
- Embed modifiers (`|300`, `|640x480`) — round-trip-preserving or drop?
- Index invalidation transport: reuse CC1 `ch: 'files'`, or new channel `ch: 'asset-index'`?

---

#### F4. Obsidian vault detection (spec D29)

**Spec stance:** On project open, read `.obsidian/app.json`; pre-populate `assetLocation` from `attachmentFolderPath`, `emitFormat` from `useMarkdownLinks` (false → wikilink, true → standard-markdown) + `newLinkFormat`. Non-destructive — never modify `.obsidian/`.

**Shipped reality:** Zero matches on `.obsidian`, `app.json`, `attachmentFolderPath` across the codebase. `[code]`

**Prior art:**
- **No surveyed OSS tool programmatically imports `.obsidian/app.json`** — not Fumadocs, not Foam, not obsidian-git, not Dendron. `[oss]`
- Web probes confirm `.obsidian/` dir structure and setting names but not the literal JSON schema: **UNRESOLVED.** `[web]`
- Reports position "format compatibility with Obsidian as migration strategy" but don't document the field schema. `[reports]`

**Open questions for triage:**
- Field schema: need a direct inspection of a real vault to lock the parser contract. One-time spike.
- Detection trigger: every `open-knowledge start`, or only on init/first-run?
- Conflict resolution: if user has existing `.open-knowledge/config.yml` and Obsidian settings disagree, which wins?

---

#### F5. User-facing upload config (spec D28 + operator knobs)

**Spec stance:** `.open-knowledge/config.yml` exposes `assetLocation` default `assets/` and `emitFormat` default `standard-markdown`. (Implicit: max upload size, MIME allowlist might also be operator-configurable.)

**Shipped reality:** `packages/cli/src/config/schema.ts` exposes `content.dir/include/exclude`, `server.port/host`, `persistence.debounce`, `mcp.tools.*`. **No upload-related config.** Constants are hardcoded: `MAX_UPLOAD_BYTES = 10MB`, `ALLOWED_IMAGE_MIME_TYPES` in `packages/core/src/constants/upload.ts`. `[code]`

**Prior art:**
- Obsidian exposes `attachmentFolderPath`, `newLinkFormat`, `useMarkdownLinks` — maps 1:1 to our `assetLocation` and `emitFormat`. `[web]`
- Logseq's default `assets/` is the most-cited community convention; Obsidian's literal vault-root default is "universally the first setting users change." `[spec]` `[web]`

**Open questions for triage:**
- What's the minimum viable config shape: 2 keys (D28) or 4+ (+ maxSize + MIME allowlist)?
- Schema migration: if we add keys, do existing `.open-knowledge/config.yml` files still parse?

---

### Category B: Design divergences between spec and shipped code (5)

#### F6. Transport: multipart shipped vs raw-body spec'd (D10)

**Spec rationale (D10):** "Every ProseMirror-based editor uses raw body. Multipart is only needed for 'upload file + JSON metadata in one request'; we don't need that. Zero new dependencies for transport. Bun has known `Request.formData()` bugs with binary data."

**Shipped reality:** Multipart + busboy at `api-extension.ts:166-238`. FormData field `parentDocName` + file field. `[code]`

**Evidence:**
- Spec's "every editor uses raw body" claim was not corroborated by this worldmodel pass. Outline/S3/Vercel-Blob/R2 likely raw-body; TipTap community recipes (`slava-vishnyakov` gist) use ad-hoc patterns. `[web]`
- Multipart is conventional; adds busboy dependency. Shipped has been running fine; no Bun binary bug observed.
- Shipped actually needs `parentDocName` metadata alongside the file, which is precisely the "+ JSON metadata" case multipart handles — the spec's D10 rationale rules out this case without noticing that it applies.

**Open questions for triage:**
- Keep multipart (working, conventional), migrate to raw body (spec-aligned, one less dep), or headers-metadata variant (raw body + `X-Parent-Doc: …`)?
- Does the shipped `parentDocName` field drive any path traversal fragility that raw-body + header would ameliorate?

---

#### F7. Asset location: co-located shipped vs global spec'd (D2) **[1-way door per spec]**

**Spec rationale (D2):** Global `assets/` at project root. Matches Obsidian community best practice. Git-friendly, dedup-friendly. Marked 1-way door because markdown refs commit to path.

**Shipped reality:** `dirname(parentDocName)` sibling-storage. An image dropped in `docs/guide.md` lands at `docs/photo.png`, not `assets/photo.png`. `[code]`

**Evidence (ecosystem is split three ways):**
- **Typora** uses co-located `.assets/` per-note folder — canonical co-located precedent. `[web]`
- **Obsidian default** is single global folder, configurable between 3 modes (vault root / specified folder / same as note). Default is vault root, "universally first setting users change." `[web]`
- **Community** wants container-folder-per-note (each `.md` becomes a folder holding its embeds). Forum feature request exists. `[web]`
- Reports: Obsidian "stores alongside notes" philosophically. `[reports]`
- **Shipped direction aligns with Typora/Obsidian-same-as-note. Spec direction aligns with Obsidian-community-consensus / Logseq default.**

**Open questions for triage:**
- **Is this still a 1-way door now that code is co-located?** Changing emit shape later means rewriting every ref. But shipped code has been running without this being a dogfood issue — how many refs exist in our own content?
- **Does our own usage strongly prefer one?** If we've been co-locating successfully, spec D2 may be wrong on merits, not just wrong on timing.
- **Publishing future-proofing (§NG5):** the spec reframed publishing as speculative; does that reframe reduce the weight of "global `assets/` is portable"?

---

#### F8. Ref emit shape: basename/absolute shipped vs relative spec'd (D3)

**Spec rationale (D3):** Relative markdown refs from note dirname (e.g., `../assets/photo.png`). Most portable across Vite, Obsidian, GitHub, VS Code, Cursor, fumadocs. Absolute refs require framework-specific serving.

**Shipped reality:** `shortestImageRef()` emits `photo.png` (same dir) or `/docs/photo.png` (absolute-from-project-root). No `../` relative emit. `[code]`

**Evidence:**
- Tightly coupled to F7 — co-located shipping means most refs are same-dir basenames, which is maximally portable per-directory. Absolute-path fallback for cross-dir refs is the portability-break mode.
- Obsidian renders absolute-from-vault-root `![[vault-relative/path]]` style; fumadocs/GitHub render relative `../` paths but not `/absolute`. The shipped absolute-path mode is the least-portable choice on paper.

**Open questions for triage:**
- Does `/docs/photo.png` render correctly in GitHub's markdown preview? (Likely NO — GitHub treats leading-slash as root-of-repo, which may or may not match the contentDir.)
- Should we backfill `../` relative emit for cross-dir refs, keeping same-dir basenames as-is?

---

#### F9. Filename sanitization: ASCII-only shipped vs unicode-preserving spec'd (D7)

**Spec rationale (D7):** Preserve unicode letters/digits. Strip `../`, `/`, `\`, null bytes, control chars. Max 200 chars. Explicitly "sanitize not slugify" — standard libs transliterate unicode to ASCII and destroy CJK/Arabic/Cyrillic.

**Shipped reality:** `[^a-zA-Z0-9_\-.]+ → _` at `api-extension.ts:127-134`. Destroys all non-ASCII by replacing with underscores. `[code]`

**Evidence:**
- **This is a regression specifically called out in the spec's Risk R12.** Non-ASCII vaults (Japanese, Chinese, Arabic) will lose filename information.
- Wiki-link resolver normalization uses case-insensitive space/hyphen/underscore equivalence — does NOT require unicode-stripping. `[reports]`
- No report surveys filename sanitization systematically. `[reports]`

**Open questions for triage:**
- **This looks like a one-line fix** — change regex to `[^\p{L}\p{N}_\-.]+` (Unicode letters + numbers). Is there any reason the current restriction is intentional?
- Max length: spec says 200 chars with hash suffix; shipped doesn't cap. Add?
- Disallow-list vs allow-list: current is allow-list (ASCII safe chars); unicode should widen.

---

#### F10. Paste heuristic: always-parse shipped vs Outline 6-step spec'd (D21)

**Spec rationale (D21):** Port Outline's 6-step decision tree with fresh `isMarkdown()` regex. 6-step architecture locked; regex is tunable.

**Shipped reality:** `clipboardTextParser` unconditionally parses all `text/plain` as markdown. Source comment cites "R18, Archetype D" (always-parse). `[code]`

**Evidence:**
- **Reports converge on Archetype D as the right choice for markdown-canonical editors** — both `tiptap-clipboard-round-trip-markdown` and `markdown-editor-paste-and-html-survey` arrive there independently. Schema acts as structural filter; unrecognized syntax becomes text nodes, not corruption. `[reports]`
- Outline's 6-step tree with `isMarkdown()` signal-scoring is the highest-fidelity dispatcher, but optimized for a non-markdown-canonical backend.
- BlockNote chose a simpler MIME-priority cascade. `[oss]`
- No editor uses a confirmation toast. `[reports]`
- **This is the strongest divergence case where shipped code appears architecturally correct and spec appears over-engineered.**

**Open questions for triage:**
- **Is D21 refuted by evidence that post-dated the spec?** Spec was drafted before the canonical mdast clipboard pipeline (commit `07161e26`) landed. "Four clipboard paths" was unknown at spec time.
- Do we need ANY heuristic layering for the code-block-paste-bypass / VSCode-metadata special cases? Or has the canonical mdast pipeline already solved them?
- Shift+Cmd+V escape hatch — wired? (ProseMirror's `plainText` flag.)

---

### Category C: Adjacent concerns (3)

#### A1. CC1 broadcaster as file-basename-index invalidation transport

**Observation:** The shipped CC1 broadcaster (`cc1-broadcast.ts`) is a pure-signal push over `__system__` Y.Doc (`{v:1, ch:string, seq:number}`, 100ms debounce). It currently fires `ch:'files'` on `create | delete | rename` DiskEvents. A file-basename index (F3) needs invalidation signaling; reusing `ch:'files'` vs adding `ch:'asset-index'` is a wiring decision.

**Spec coverage:** Not in the editor-input-surface spec. D16 mentions "~20 LOC asset event handler addition to `file-watcher.ts`" but predates CC1's existence.

**Open questions for triage:**
- Reuse `ch:'files'` (coarser, simpler) vs new channel `ch:'asset-index'` (surgical, one more channel)?
- Does reuse contaminate the signal's semantics — does "file list changed" imply asset index needs rebuild?

---

#### A2. Image-ref rewrite on parent-doc rename (spec D8 coverage unverified)

**Observation:** Commit `f5e19dd2` ("Implement managed rename with backlink rewrite") added `rewriteMarkdownLinksForDocumentRename()` and `rewriteWikiLinksForDocumentRename()` to `packages/server/src/managed-rename-rewrite.ts`. **Whether image refs (`![alt](src)`) are covered by the markdown-link rewrite path was not directly verified in this worldmodel pass.** `[code]` UNRESOLVED.

**Spec coverage:** D8 ("auto-update refs on rename/move, default on") is locked.

**Open questions for triage:**
- Read `managed-rename-rewrite.ts` test coverage to verify image-ref handling.
- If images ARE rewritten on rename: does the rewrite handle the co-located dirname flip correctly (e.g., move `docs/guide.md` → `other/guide.md` — does `![](photo.png)` resolve correctly afterward)?

---

#### A3. Guard 5 (validate specs) coverage on custom nodes shipped since spec baseline

**Observation:** Spec D20 requires `validate` specs on every custom node attribute (CVE-2024-40626 class mitigation). Between spec baseline and now, these custom nodes shipped: `JsxComponent`, `JsxInline`, `RawMdxFallback`, `FlatList` (the unified list extension), `EscapeMark`, `*-fidelity` extensions. CLAUDE.md's architectural precedents require `validate` specs (precedent #9 schema-is-add-only; #10 opaque-but-content-bearing nodes). **Whether every shipped custom node attribute has a `validate` spec was not directly audited.** `[code]` UNRESOLVED.

**Spec coverage:** D20 locked + §17.1 post-rebase review checklist item.

**Open questions for triage:**
- Grep audit: every `addAttributes()` call in `packages/core/src/extensions/` + `packages/app/src/editor/extensions/`. Add missing `validate` specs. Strictly additive — no backcompat concerns.
- Is this a pre-existing-spec concern (audit owned by this scope), or does it belong in a separate hardening spec?

---

## Convergences (non-prescriptive)

1. **Markdown as canonical source + schema as structural filter** — `[reports] [spec] [code]` converge. Shipped Archetype D is evidence-aligned; spec D21's 6-step tree may not be.
2. **FileHandler callbacks + integrator-owned storage** — TipTap/BlockNote/Outline + shipped OK all follow this. `[oss] [web] [code]`
3. **Foam's reverse-split shortest-path algorithm is the canonical file-basename resolver** — `[oss] [reports]` converge. No alternative pattern surfaced.
4. **Render-time sanitization, not storage-time** — CLAUDE.md NG4 aligned with all reports and OSS survey. Input-path 6-guard defense is the correct boundary.
5. **Wiki-link alias convention `[[Page|Alias]]`** — Foam, Dendron, Fumadocs, remark-wiki-link converge.

## Divergences (flag prominently)

1. **Asset storage location** — three incompatible patterns in ecosystem (Typora co-located, Obsidian-configurable-default-vault-root, community container-per-note). Shipped co-located vs spec'd global. (F7)
2. **Embed syntax support in upstream packages** — `remark-wiki-link` does NOT handle `![[...]]`; Fumadocs + Foam add via custom extensions. Implementation path is not a drop-in. (F3)
3. **Paste heuristic** — Outline's 6-step tree vs BlockNote's simpler cascade vs always-parse (Archetype D). Shipped chose D; spec chose 6-step. Reports suggest D is correct for our architecture. (F10)
4. **Dedup strategy** — NONE of surveyed tools implement hash-dedup. Spec proposes it. Differentiator-or-folly TBD. (F2)
5. **Obsidian vault config import** — NONE of surveyed tools do it. Spec proposes it. Differentiator-or-folly TBD. (F4)

## Unclaimed territory

- Content-hash dedup for user-dropped assets (F2)
- Automatic Obsidian vault config import (F4)
- Embed modifier round-trip (sizing, anchor, alias) — Fumadocs drops them; Obsidian one-way
- Sub-second file-basename index rebuild via push-signal (A1 + F3)

## Incompleteness

- `.obsidian/app.json` field schema — UNRESOLVED across web + OSS. Direct vault inspection recommended.
- Obsidian's stance against hash-dedup (6-year refusal) — UNRESOLVED. Obsidian forum search next.
- Image-ref rewrite on rename coverage (A2) — UNRESOLVED. Read `managed-rename-rewrite.ts` tests.
- Foam's file-basename index rebuild trigger — UNRESOLVED. VS Code extension host code.
- "Four clipboard paths" (commit `07161e26`) — ADJACENT. Worth a targeted commit read before shaping the new spec, to know what already ships on the paste side.
- Logseq's wiki-embed handling — UNRESOLVED. Clojure-literate reader required.

---

## Provenance

| Channel | Depth | Highlights |
|---|---|---|
| **Web** (3 probes) | Full | Obsidian attachment settings, TipTap/Milkdown/BlockNote paste+drop, content-addressable storage |
| **Code** (Explore subagent) | Medium | Full surface inventory of shipped upload pipeline with file:line citations; DIFF verification |
| **OSS** (Explore subagent) | Full | Tier 1: Outline, Foam, BlockNote, TipTap, Milkdown, MDXEditor, remark-wiki-link, obsidian-git, Dendron, Logseq. Tier 2: BlockSuite, Fumadocs, prosemirror-remark |
| **Reports** (catalogue scan) | Full | 7 reports read synthesizing paste archetypes, wiki-link architecture, Obsidian behavior |
| **User source** (inline) | Full | SPEC.md lines 1-590 read; 30 decisions catalogued |

**Channels unavailable:** Open Knowledge MCP (not registered for this session); catalog skills (not installed in this project).

**Supporting artifacts:**
- `evidence/` (in this report dir) — reserved for future deep-dives on UNRESOLVED items
- Spec's own `evidence/` dir at `.claude/worktrees/spec-editor-input-surface/specs/2026-04-08-editor-input-surface/evidence/` — has prior-art files D1-D30 reference
- Spec's `meta/audit-findings.md` + `meta/design-challenge.md` — prior assessment artifacts

---

## Consumer guidance

This report is the input artifact for `/assess-findings`. The 13 findings are grouped to support three triage questions:

1. **Category A (F1-F5):** Is each unimplemented delta still valuable now that 78 commits have changed the landscape? Are any superseded? Which are cheap wins vs ambitious bets?
2. **Category B (F6-F10):** For each divergence between spec and shipped code, **which side is correct on merits** — spec's original decision, or shipped's current behavior? Changing shipped code is reversible only if the data hasn't calcified (F7's 1-way door caveat applies).
3. **Category C (A1-A3):** Are the adjacent concerns in-scope for any follow-on spec, or do they belong in separate hardening work?

The new spec to be shaped from the triage output should pick from Category A (likely yes), a subset of Category B (probably flip some to "accept shipped reality" and drop the spec decision), and decide scope on Category C.

No recommendations in this report — /assess-findings is where the judgment happens.
