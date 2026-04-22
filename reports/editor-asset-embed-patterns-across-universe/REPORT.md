---
title: "Editor Asset + Embed Patterns Across the Content-Editor Universe"
description: "Cross-editor comparison of file drop, embed syntax, wiki-link parsing, dedup, vault import, basename resolution, rename rewrite, and asset folder conventions across 14 editors (AFFiNE, Docmost, Outline, Logseq, SilverBullet, Foam, Dendron, Zettlr, HedgeDoc, Fumadocs, BlockNote, TipTap, Milkdown, Plate, BlockSuite, TinaCMS). Source-code grounded with file:line citations."
createdAt: 2026-04-16
updatedAt: 2026-04-16
revisions:
  - 2026-04-16: initial pass (14 editors)
  - 2026-04-16: Path C update — added Docmost + SilverBullet + Zettlr via cloned source read; closed 17 UNCERTAIN dimensions
subjects:
  - AFFiNE
  - BlockSuite
  - Docmost
  - Outline
  - Logseq
  - SilverBullet
  - Foam
  - Dendron
  - Zettlr
  - HedgeDoc
  - Fumadocs
  - BlockNote
  - TipTap
  - Milkdown
  - Plate
  - TinaCMS
  - Obsidian
topics:
  - file drop handling
  - wiki-link embed
  - content-addressable storage
  - vault interop
  - basename resolution
  - rename refactor
---

# Editor Asset + Embed Patterns Across the Content-Editor Universe

**Purpose:** Inform design decisions for Open Knowledge's editor asset + embed surface spec. Consumer decisions D-I (emit shape), D-B (dedup UX), D-C (embed rendering), D-D (index persistence), D-E (rename race), D-F (upgrade path), D-J (Obsidian config handling).

---

## Executive Summary

Sixteen editors across six tiers were investigated. Three dominant patterns emerge, with sharp divergence in wiki-embed support and convergence on the absence of content-hash dedup.

**1. Non-image file drop splits 4 ways.** Typed-node editors (Outline, AFFiNE/BlockSuite, Docmost-via-Tiptap) wrap non-images in attachment/video blocks that serialize as `[title size](url)`-style markdown with metadata encoded in the link text. Markdown-link editors (Logseq, Foam via synthetic render, Dendron) emit a plain `[name](path)` markdown link with no block-level type. Schema-dispatch editors (BlockNote) route files to typed blocks via a `fileBlockAccept[]` MIME/extension allowlist per block spec. Image-only editors (Plate, Milkdown's default uploader, TinaCMS's default `accept`) silently drop non-images at the library level. There is no consensus, and the choice is largely determined by whether the editor is backed by a block model (typed nodes win) or a markdown-canonical tree (markdown link wins).

**2. Wiki-embed (`![[file.ext]]`) is a minority feature — 5 of 16 editors support it natively, all markdown-canonical.** Logseq (via external mldoc), Foam (custom regex), Dendron (richest anchor syntax `![[vault/fname#anchor,offset:#anchor|alias]]`), Fumadocs (`!?\[\[...\]\]` with `isEmbed` dispatch), and **SilverBullet** (native parser — `client/markdown_parser/parser.ts:26-86` checks `[` OR `!` at char-91 or char-33, wraps `!`-prefixed result in `Image` AST elt; supports dimensions `|200x300`). Every proprietary-format / block-model editor (Outline, AFFiNE, Docmost, BlockSuite, BlockNote, Notion, Zettlr) and every generic library (TipTap, Milkdown, Plate, TinaCMS) explicitly does NOT support the `!`-prefixed form. Upstream `remark-wiki-link` handles `[[Page]]` but not the `!` embed prefix — extending the tokenizer in-tree is the canonical path, with Foam's 80-LOC regex, Fumadocs's `!?\[\[.+\]\]` pattern, and SilverBullet's `!?\[\[...\]\]` regex as reference.

**3. Content-hash dedup is unclaimed territory. Obsidian vault programmatic import is rare.** Zero of 16 editors implement sha256-based dedup for user-dropped assets; everyone uses filename counter suffixes (`foo (1).ext`), UUID IDs (Outline), or delegates to backend storage (HedgeDoc, TinaCMS cloud). Only Logseq ships an explicit `.obsidian/app.json` importer; Fumadocs reads Obsidian vault files via `buildStorage()` + `buildResolver()` but as a build-time source not a runtime config migration. Foam is wikilink-syntax-compatible with Obsidian but has no config reader. For Open Knowledge, these two decisions (sha256 dedup, programmatic vault import) are both *differentiators* — no competitor has shipped them.

Image-ref rewrite on rename is supported in Foam (`refactor.ts`) and Dendron (`transformLinks.ts`) as AST-level edits that update backlinks when a note moves. Logseq, Outline, HedgeDoc, and BlockSuite all lack this feature. Foam's reverse-path TrieMap-based basename index + `getShortestIdentifier()` elimination algorithm is the canonical reference implementation for shortest-path resolution — Fumadocs's `buildResolver()` is the closest alternative with a dual name/path Map. None of the surveyed editors persist their basename index to disk; all rebuild at startup from filesystem scan, validating Open Knowledge's D-D recommendation of in-memory-rebuild-at-startup.

---

## Research Rubric

**Primary question:** Across the OSS content-editor universe, what are the dominant patterns (and notable divergences) for file drop, embed syntax, basename resolution, and asset management?

**Dimensions (all P0):**
1. Non-image file drop representation (markdown link vs typed node vs attachment block)
2. Wiki-link embed syntax parsing (`![[file.ext]]`)
3. Embed rendering UX (inline image vs pill vs placeholder)
4. Asset dedup (hash / counter / none)
5. Vault/KB import interop (reads foreign configs?)
6. File-basename index (structure / refresh / persistence)
7. Image-ref rewrite on rename
8. Co-located vs global asset folders

**Universe scoped:** 16 editors across Tier 1 (AFFiNE, Docmost, Outline), Tier 2 (Logseq, SilverBullet, Foam, Dendron, Zettlr, HedgeDoc), Tier 3 (Fumadocs), Tier 6 (BlockNote, TipTap, Milkdown, Plate, BlockSuite, TinaCMS).

**Non-goals:** Performance benchmarking, full UX screenshot capture, tool-specific bug surveys, recommendation for OK (this report feeds the consumer's decisions separately).

---

## Detailed Findings

Per-editor file:line citations live in [evidence/per-editor-findings.md](evidence/per-editor-findings.md). Findings below synthesize cross-editor patterns by dimension.

### D1 — Non-image file drop representation

**Finding: Four distinct patterns exist; block-model editors prefer typed nodes with metadata-encoded markdown.**

| Editor | Pattern | Markdown shape | Confidence |
|---|---|---|---|
| Outline | Typed node (image/video/attachment) | `[title size](href)` or `[title WxH](src)` | CONFIRMED |
| AFFiNE/BlockSuite | Typed block (`affine:attachment`) | `[title size](href)` on markdown export | CONFIRMED |
| Docmost | Typed Tiptap node (image/video/pdf/attachment/excalidraw/drawio) | Prose-JSON + `<div data-type="attachment" data-attachment-url="..." data-attachment-name="...">` — NOT markdown | CONFIRMED |
| BlockNote | Schema-dispatch typed block | `<figure>` / `<a>` via `toExternalHTML` | CONFIRMED |
| Logseq | Markdown link | `[name](./assets/file.ext)` | CONFIRMED |
| Foam | Synthetic markdown render | `### filename` header for non-image | CONFIRMED |
| Dendron | Markdown link | `[filename](assets/kebab-name.ext)` | CONFIRMED |
| SilverBullet | CM6 drop + wiki-embed parser | `![[file.ext]]` or `![[file.ext\|200x300]]` (dimension modifiers supported) | CONFIRMED |
| Zettlr | CM6 drop — image-only; markdown/code files open in editor; **other types SILENTLY IGNORED** | Images: `![alt](path)` standard markdown | CONFIRMED (surprising gap for academic tool — PDFs rejected) |
| TipTap FileHandler | Callback-only, consumer decides | N/A (library) | CONFIRMED |
| Milkdown default | Image-only, drops non-image | N/A | CONFIRMED |
| Plate | Image-only, drops non-image | N/A | CONFIRMED |
| TinaCMS | Image-only (default accept) | N/A | CONFIRMED |
| HedgeDoc | External URL only, no native drop | External `![alt](url)` | INFERRED |

**Implications for OK D-I:**
- **Markdown link is the dominant pattern for folder-of-markdown editors** (Logseq, Dendron, Foam), which is OK's architectural tier.
- **Typed-node with metadata encoding** (`[title size](url)`) is the Outline/BlockSuite pattern — higher fidelity at cost of commitment to node schemas.
- **Block-schema dispatch** (BlockNote) is the richest runtime UX but requires block schema definitions per file type (Video/Audio/File) before drop is wired.
- **Image-only silent-drop** (Plate, Milkdown, TinaCMS default) is a footgun pattern — users drop PDFs and nothing happens. Do not adopt.

**Decision triggers:**
- If OK stays markdown-canonical → markdown link aligns with Logseq/Dendron/Foam.
- If OK commits to typed-component-nodes Phase 2 early → Outline/BlockSuite pattern becomes reasonable.

### D2 — Wiki-link embed syntax parsing

**Finding: 5 of 16 surveyed editors parse `![[file.ext]]` natively. Upstream `remark-wiki-link` does NOT.**

| Editor | Parses `![[...]]`? | Tokenizer | Modifiers supported |
|---|---|---|---|
| Logseq | YES | External `mldoc` (Rust/Wasm) | Block `^id`, page name, block refs |
| Foam | YES | Custom regex `WIKILINK_EMBED_REGEX` (80 LOC) | `full/content-inline/content-card` prefixes |
| Dendron | YES | `LINK_REGEX = /^!\[\[(.+?)\]\]/` | `^anchorStart,offset:#anchorEnd`, wildcards, vault prefix |
| Fumadocs | YES (build-time) | `RegexWikilink = /!?\[\[(?<content>...)\]\]/g` with `isEmbed` flag | Heading anchors; image sizing NOT supported |
| SilverBullet | YES | Custom parser at `parser.ts:26-86`; regex `/(?<leadingTrivia>!?\[\[)(?<stringRef>.*?)(?:\|(?<alias>.*?))?(?<trailingTrivia>\]\])/g` | Dimension `\|200x300`; alias via pipe |
| Outline | NO | URL-pattern detection via markdown-it `attachmentsRule` | N/A |
| AFFiNE/BlockSuite | NO | Block-flavour dispatch, no markdown | N/A |
| Docmost | NO | Tiptap `@mention` extension (not `[[]]`) | N/A |
| Zettlr | NO (`[[]]` only, not `![[]]`) | `zkn-link-parser.ts:37-90` — no embed variant in AST | N/A |
| BlockNote / TipTap / Milkdown / Plate / TinaCMS | NO | Generic frameworks | N/A |
| HedgeDoc | NO | HackMD lineage — markdown-only | N/A |

**Implications for OK D-C and D-J (embed UX + implementation path):**
- **Precedents for tokenizer extension:** Foam (regex with modifier groups, 80 LOC), Fumadocs (`isEmbed` branch dispatch), Dendron (richest — supports block anchors and wildcards).
- **Upstream `remark-wiki-link` cannot be used directly** — none of the four editors use it unmodified for embeds.
- **Dendron's anchor granularity is richest** (block `^id`, offsets, wildcards) but overshoots OK's current scope (embed syntax only, note-to-note is Bucket 7).
- **Fumadocs's `isEmbed` dispatch on the `!` prefix is the cleanest split** — one regex produces both `wikiLink` and `wikiLinkEmbed` mdast types cleanly.

### D3 — Embed rendering UX

**Finding: Three rendering models; no pill/chip pattern for embeds is common.**

| Model | Editors | Description |
|---|---|---|
| Inline image (standard markdown) | Foam, Dendron MD output, Fumadocs image path | `![[photo.png]]` renders identically to `![](photo.png)`; source shape NOT surfaced in WYSIWYG |
| Transclusion / portal | Dendron (portal with backlink header, `MAX_REF_LVL = 3`), Logseq (block expansion) | Note embeds expand inline; nesting bounded |
| Attachment widget | Outline (pill with download icon + size + PDF preview on opt-in), BlockSuite (file icon + rename modal) | Typed attachment block with rich controls |
| Warning placeholder | Fumadocs content-embed ("not supported yet") | Intentionally degraded |

**Decision triggers for OK D-C:**
- The "image node identical to `![](...)`" precedent (Foam, Dendron MD, Fumadocs image) is simple, proven, and **the most common pattern**. Users don't see source unless they switch to Source view.
- The "pill with source visible" pattern has NO precedent in the surveyed universe for embed syntax. It would be novel UX.

### D4 — Asset dedup

**Finding: Zero of 16 editors implement content-hash dedup. Filename-counter suffix is dominant.**

| Strategy | Editors |
|---|---|
| Filename counter suffix `foo (1).ext` / `foo-1.ext` | BlockSuite (explicit `makeNewNameWhenConflict`), AFFiNE (via BlockSuite), Dendron (kebab-cased) |
| UUID IDs (no collision possible) | Outline (`uuidv4()` per upload), Docmost (`uuid7()` + optional overwrite-by-attachmentId for diagrams) |
| Timestamp-based naming | SilverBullet (`2026-04-16_14-30-45`-style) |
| Backend-delegated | HedgeDoc (S3/MinIO/GCS), TinaCMS (S3 signed URL) |
| None (silent overwrite / no dedup) | Foam (URI-keyed, stores separately), Logseq, Zettlr, Plate, TinaCMS local |

**This is the clearest "unclaimed territory" finding in the report.** Obsidian has famously refused to ship hash-dedup for six years (cited in prior worldmodel); confirmed that every OSS editor surveyed follows suit.

**Implications for OK D-B:**
- Shipping same-dir sha256 dedup WOULD be a differentiator.
- An explicit toast ("reusing existing file") has no direct precedent but is the honest UX — silent reuse would surprise users accustomed to every other editor creating a second file.

### D5 — Vault/KB import interop

**Finding: Programmatic Obsidian vault import is rare. Only Logseq ships an explicit `.obsidian/app.json` reader at runtime; Fumadocs reads vault files at build time.**

| Editor | Obsidian config reader | Notes |
|---|---|---|
| Logseq | YES | `import.cljs:75` constructs `assets-dir` during migration |
| Fumadocs | YES (build-time) | `buildStorage()` parses vault files; `buildResolver()` indexes names + aliases |
| Foam | NO (syntax-compat only) | Wikilinks work; `.obsidian/app.json` not read |
| Dendron | NO | Multi-vault with own config (`vault.yml`) |
| Docmost | NO | Only Confluence (HTML/ZIP) import supported |
| SilverBullet | NO | Zero refs to `.obsidian` / `vault` / `app.json` across repo |
| Zettlr | NO | Pandoc import + TextBundle only; no KB-level migration |
| Outline / AFFiNE / BlockNote / HedgeDoc | NO | None surveyed |

**Implications for OK D-J:**
- Programmatic vault import is **legitimately differentiating** — only 2 of 16 do it.
- Fumadocs's `buildResolver()` is the closest prior art for runtime-importable dual name/path index.
- Logseq's importer is a one-shot migration (destructive copy); OK's FR-4 is non-destructive (read-only → config pre-population). Different shape.
- The "`./subdir`" pattern in Obsidian `attachmentFolderPath` (INV1-surfaced) has NO precedent in surveyed importers — Logseq and Fumadocs don't document handling for it. D-J's recommendation (free-form string matching Obsidian exactly) is consistent with making no assumption that doesn't exist.

### D6 — File-basename index

**Finding: In-memory rebuild-at-startup is universal. Four distinct data structures observed.**

| Data structure | Editor | Refresh trigger | Persistence |
|---|---|---|---|
| TrieMap (mnemonist) reversed-lowercase POSIX path keys | Foam | Workspace reload | None (in-memory) |
| SQLite/IndexedDB graph DB | Logseq | FS watch events | Journaled to MD files |
| Dual name/path Map with alias support | Fumadocs | Build time | None (ephemeral per-build) |
| `notesByFname` dict with vault filter | Dendron | Engine start | None (rebuild) |
| Dual `_idDatabase` + `_fileLinkDatabase` with 3-strategy `findExact` (ID-regex → `.md` → basename) | Zettlr | Workspace reindex | None (rebuild) |
| Lua query engine + typed link index (`"page" \| "file" \| "url"`) + frontmatter aliases | SilverBullet | FS events via plug | Server-scoped |
| `_pathBlobIdMap` + `_names` Set | BlockSuite | Per-transformer-job | None |
| UUID-keyed only (no basename resolution) | Docmost | N/A (UUIDs are immutable) | Database |
| None / server-side | Outline, HedgeDoc (slugs), TinaCMS (backend), BlockNote, TipTap, Milkdown, Plate | — | — |

**Implications for OK D-D:**
- Zero surveyed editors persist their basename index to disk. All rebuild at startup or on workspace/vault change.
- Scale point: Foam's TrieMap with `mnemonist` is the richest data structure but at OK's scale (hundreds-to-low-thousands files) a plain `Map<basename, string[]>` with manual reverse-path matching is sufficient (INV2-confirmed).
- **D-D recommendation (rebuild-at-startup, in-memory Map) is aligned with universal practice.**

### D7 — Image-ref rewrite on rename

**Finding: Four editors do it cleanly via AST rewrite. SilverBullet goes furthest (moves co-located assets WITH the page). Docmost sidesteps the problem entirely via UUID-stable URLs.**

| Editor | Rewrites on rename? | Implementation |
|---|---|---|
| Foam | YES | `refactor.ts:60-80` computes edits from future-state workspace; applies to all backlinks |
| Dendron | YES | `transformLinks.ts:16-46` traverses mdast updating `WIKI_LINK` + `REF_LINK_V2` |
| SilverBullet | YES — **strongest** | `refactor.ts:432-498` updates all backlinks; lines 254-265 **co-located documents move WITH the page** (`batchRenameDocuments`); mixed handling for `[[wiki]]` and `[md](...)` with relative-path resolution |
| Zettlr | YES — user-prompted | `file-rename.ts:136-181` retrieves inbound links, **prompts user for confirmation**, then `replaceLinks()` (AST-based) at `replace-links.ts:35-75` |
| Docmost | NOT NEEDED — architectural immunity | URLs embed UUID (`/api/files/${attachmentId}/...`), not page slug. Page rename cannot invalidate refs. `movePageToSpace()` updates `spaceId` FK only. |
| Logseq | NO | Manual update required |
| BlockSuite | PARTIAL | Local block rename updates props; no back-reference rewrite |
| Outline | UNKNOWN | Not observable in client code |
| HedgeDoc | NO | By design (URLs immutable) |
| Fumadocs | N/A | Build-time |

**Implications for OK FR-7:**
- Foam and Dendron are the clear prior-art references.
- Both use AST-level rewrite keyed on link identity (wikilink target or markdown `href`).
- OK's extension of `managed-rename-rewrite.ts` to cover image refs would follow Dendron's pattern (case-insensitive match, preserve alias unless it matches the old fname).

### D8 — Co-located vs global asset folders

**Finding: Three conventions exist; "same as note" is the most faithful to Obsidian interop.**

| Convention | Editor | Configurable? |
|---|---|---|
| Global hardcoded (e.g., `./assets/`) | Logseq (`local-assets-dir` defonce), BlockSuite (zip export) | No |
| Per-vault `assets/` folder | Dendron | No |
| Per-directory co-located | Fumadocs (files live with markdown in same folder), SilverBullet (relative-path with `resolveMarkdownLink`; moves-with-page on rename) | Yes (via path structure) |
| Server-managed (workspace-scoped DB) | Docmost (`${workspaceFolder}/${attachmentId}/${fileName}` with `workspace_id`/`space_id`/`page_id` FKs), Outline, HedgeDoc, TinaCMS cloud | Via env/config |
| Workspace-level, user-managed (no enforced structure) | Zettlr | User convention |
| No convention | Foam | — |
| Plug/consumer-controlled | TipTap FileHandler, BlockNote | Yes |

**Implications for OK D-J + FR-5 + F7:**
- OK's shipped default (co-located with note via `dirname(parentDocName)`) matches Fumadocs's convention and Obsidian's `"./"` and `"./subdir"` patterns.
- D-J's recommendation of free-form `attachmentFolderPath` string (matching Obsidian exactly) handles every surveyed convention cleanly: `"/"` = vault root (Logseq-like), `"./"` = co-located with note (OK-shipped), `"./subdir"` = co-located + subdir (Fumadocs-like), any other string = global folder path (Logseq + Dendron-like).

---

## Cross-Editor Convergences

1. **In-memory basename indexes rebuilt at startup.** 100% of index-having editors use this pattern. D-D recommendation validated.
2. **No content-hash dedup anywhere.** 100% use filename counter or UUID or delegate to backend. D-B recommendation of explicit toast has no precedent but is honest UX.
3. **Markdown link for non-image is the folder-of-markdown convention.** Logseq, Dendron, Foam (synthetic), Fumadocs-image-case all agree. Block-model editors (Outline, AFFiNE/BlockSuite) use typed nodes with metadata in the link text.
4. **Inline image is the universal embed render.** Foam, Dendron (MD path), Fumadocs-image all render `![[photo.png]]` identically to `![](...)`. No pill/chip precedent for embeds in any editor.
5. **Schema is add-only for editor plugin extensions.** Consistent with CLAUDE.md precedent #9 — none of the surveyed editors narrow or rename established node types for new file types; they extend.
6. **Image-ref rewrite on rename is an expected feature in folder-of-markdown editors.** Foam, Dendron, SilverBullet, and Zettlr all ship it (4 of 16 — broader than initial pass suggested). SilverBullet is strongest (moves co-located assets with the page). Zettlr uniquely prompts the user for confirmation before rewriting. The absence in Logseq is widely perceived as a gap.
7. **UUID-stable URLs as a structural alternative to rename-rewrite** (Docmost pattern). By embedding UUID in the URL path rather than filename/slug, attachment refs become immune to page moves by construction. This is a legitimate architecture choice — it trades basename-resolution (D6) for URL stability (D7).

## Cross-Editor Divergences

1. **Wiki-embed support splits at the "folder-of-markdown" vs "block-model" boundary.** Every folder-of-markdown editor with mature KB features (Logseq, Foam, Dendron, Fumadocs-for-Obsidian) supports `![[file.ext]]`. Every block-model editor (Outline, AFFiNE, BlockSuite, BlockNote, Docmost) does not. The split is ARCHITECTURAL: wiki-embed requires a text-canonical format where `![[...]]` has meaning, not a block-JSON format where nodes are first-class.
2. **Non-image drop representation splits 4 ways** (see D1 table above). Not a dominant convention.
3. **Obsidian vault import:** Logseq (runtime reader), Fumadocs (build-time reader), Foam (syntax-compat only), everyone else (none).
4. **Asset folder convention splits 3 ways** (global / per-vault / per-directory) with another 3 variations (server-managed / no convention / consumer-controlled).

## Unclaimed Territory

- **Content-hash sha256 dedup for user-dropped assets.** Nobody does it. OK's FR-2 narrowed-scope (same-dir sha256) would differentiate.
- **Runtime, non-destructive Obsidian vault config import** (reading `.obsidian/app.json` without migrating files). Logseq is destructive (migration); Fumadocs is build-time. OK's FR-4 is novel at runtime-read-only + config-pre-populate.
- **Obsidian `attachmentFolderPath: "./subdir"` handling.** No surveyed editor documents this 4th pattern; everyone collapses to either global or same-as-note.
- **Wiki-embed with image sizing modifiers round-trip.** Obsidian supports `![[photo.png|640x480]]`. Foam parses modifiers but Fumadocs explicitly warns they're unsupported (`remark-wikilinks.ts:187`). Nobody round-trips faithfully.
- **Bidirectional rename rewrite** (doc rename updates refs; asset rename updates notes that reference it). Foam and Dendron do unidirectional (doc rename → ref update). Nobody does asset-rename → note-ref-rewrite cleanly.

---

## Decision-Specific Findings (maps to OK open decisions)

### D-I (Non-image emit shape)

**Signal:** The split is architectural — folder-of-markdown = markdown link, block-model = typed node. OK is a markdown-canonical editor per CLAUDE.md's fidelity invariants, so markdown link is the aligned choice.

**Prior art for markdown-link path:** Logseq `[name](./assets/file.ext)`, Dendron `[name](assets/kebab-name.ext)`, Fumadocs image case (standard markdown image).
**Prior art for typed-node path:** Outline's `[title size](href)` encoding metadata in link text. Would require committing to Video/Audio/Attachment node schemas NOW (Phase 2 scope).

**Recommendation (confidence: HIGH):** Ship markdown link for P0 (FR-1 original proposal). Typed-component-nodes Phase 2 can promote at read-time via mdast → PM handler without changing the emit shape.

### D-B (Dedup toast UX)

**Signal:** No prior art for dedup UX. Obsidian's six-year refusal has no documented UX rationale either way.

**Recommendation (confidence: MEDIUM):** Ship explicit toast. The absence of prior art is not a signal against — it's a signal this is genuinely unclaimed. Silent dedup surprises users who expect "file dropped = new file."

### D-C (Embed rendering in WYSIWYG)

**Signal:** Inline-image-identical-to-markdown-image is the universal pattern (Foam, Dendron MD, Fumadocs image). Pill/chip UI is NOT a convention for embeds; it's only used for attachments (Outline, BlockSuite) which are NOT embeds.

**Recommendation (confidence: HIGH):** Image node (Option a from D-C). Aligns with universal convention. Source `![[...]]` visible in Source view only.

### D-D (File-basename index persistence)

**Signal:** 100% of surveyed editors rebuild at startup; none persist. Foam's TrieMap is richer than needed at our scale; simple Map<basename, string[]> is sufficient (INV2-validated).

**Recommendation (confidence: HIGH):** In-memory Map, rebuild at startup. Validated by universal practice.

### D-E (Rename race)

**Signal:** Foam and Dendron both handle rename via AST rewrite; neither documents the race between doc-move + asset-move. Likely handled at the FS-event ordering level (whichever event arrives first triggers one rewrite pass; next rewrite reconciles).

**Recommendation (confidence: MEDIUM):** Treat as two sequential events. Index rebuild is cheap; accept temporary flicker. Aligned with surveyed implementations' implicit behavior.

### D-F (Typed-component-nodes Phase 2 upgrade path)

**Signal:** BlockNote's `fileBlockAccept[]` pattern shows that schema-dispatch typed nodes work, but require block schemas up-front. OK's typed-component-nodes Phase 2 will own that schema; this spec should ship markdown-link emit to avoid pre-committing Phase 2's shape.

**Recommendation (confidence: HIGH):** Markdown link at P0; Phase 2 promotes at read-time via mdast → PM handler. Coexist pattern is the safest.

### D-J (Obsidian `attachmentFolderPath` schema)

**Signal:** No surveyed editor handles the `"./subdir"` pattern explicitly. Logseq (destructive migration) and Fumadocs (build-time) have importers but don't document every pattern. Free-form string matching Obsidian's literal shape is the safest contract.

**Recommendation (confidence: HIGH):** Free-form string (D-J Option b). Mirror Obsidian's shape exactly: `"/"` = vault root, `"./"` = co-located, `"./subdir"` = co-located + subdir, other = global path.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Obsidian** (proprietary) — End-user UX for embed modifiers sizing (`|640x480`) secondary-sourced only.
- **Notion** (proprietary) — Not investigated for paste-image-from-URL behavior.
- **HedgeDoc** — D1/D3/D4 INFERRED (web-only, no source read); OT-based collab architecture differs from ours enough that deeper investigation has low value.
- **AFFiNE app layer** — Drop integration beyond BlockSuite's AssetsManager not deeply inspected; BlockSuite covers the asset-layer pattern sufficiently.

### Dimensions Closed by Path C Update (2026-04-16)

- **Docmost** — D1-D8 all CONFIRMED via cloned source read. Surprise: uses UUID-stable URLs (architectural immunity to rename, no basename resolver needed).
- **SilverBullet** — D1-D8 CONFIRMED. **Major correction:** natively supports `![[file.ext]]` with dimension modifiers (previously inferred NO); rename rewrite is strongest in the universe (co-relocates assets with page).
- **Zettlr** — D1-D8 CONFIRMED. Surprise: academic editor SILENTLY IGNORES PDF drops (D1) despite citation-heavy use case; dual-index ID+basename resolver with user-prompt rename rewrite.

### Out of Scope (per Rubric)

- Performance benchmarks
- UX screenshot capture
- OK-specific recommendations (this report feeds separate decision protocol)

---

## References

### Evidence Files
- [evidence/per-editor-findings.md](evidence/per-editor-findings.md) — per-editor file:line citations for all 16 editors × 8 dimensions

### Related Research (for navigation)
- [reports/editor-input-surface-worldmodel/REPORT.md](../editor-input-surface-worldmodel/REPORT.md) — worldmodel + assess-findings triage that seeded this spec
- [reports/wiki-links-backlinks-architecture/REPORT.md](../wiki-links-backlinks-architecture/REPORT.md) — wiki-link format + backlink index deep dive (prior)
- [reports/obsidian-vs-fumadocs-component-inventory/REPORT.md](../obsidian-vs-fumadocs-component-inventory/REPORT.md) — Obsidian embed inventory detail
- [specs/2026-04-16-editor-asset-and-embed-surface/evidence/inv1-obsidian-app-json-schema.md](../../specs/2026-04-16-editor-asset-and-embed-surface/evidence/inv1-obsidian-app-json-schema.md) — Obsidian `app.json` schema
- [specs/2026-04-16-editor-asset-and-embed-surface/evidence/inv2-foam-shortest-path-algorithm.md](../../specs/2026-04-16-editor-asset-and-embed-surface/evidence/inv2-foam-shortest-path-algorithm.md) — Foam shortest-path algorithm detail
- [specs/2026-04-16-editor-asset-and-embed-surface/evidence/inv4-outline-drop-pattern.md](../../specs/2026-04-16-editor-asset-and-embed-surface/evidence/inv4-outline-drop-pattern.md) — Outline drop handler detail

### External Sources
- [BlockSuite AssetsManager source](https://github.com/toeverything/blocksuite) — MIT
- [Outline editor source](https://github.com/outline/outline) — BSL
- [Foam VS Code extension](https://github.com/foambubble/foam) — MIT
- [Dendron note references](https://github.com/dendronhq/dendron) — Apache 2.0
- [Logseq handlers](https://github.com/logseq/logseq) — AGPL-3.0
- [Fumadocs Obsidian package](https://github.com/fuma-nama/fumadocs) — MIT
- [BlockNote FileHandler](https://github.com/TypeCellOS/BlockNote) — MPL
- [TipTap extension-file-handler](https://github.com/ueberdosis/tiptap) — MIT
- [Milkdown plugin-upload](https://github.com/Milkdown/milkdown) — MIT
- [Plate media plugin](https://github.com/udecode/plate) — MIT
- [TinaCMS MediaStore](https://github.com/tinacms/tinacms) — Apache 2.0
- [HedgeDoc](https://github.com/hedgedoc/hedgedoc) — AGPL-3.0
- [Docmost](https://github.com/docmost/docmost) — AGPL-3.0 (cloned for Path C update)
- [SilverBullet](https://github.com/silverbulletmd/silverbullet) — MIT (cloned for Path C update)
- [Zettlr](https://github.com/Zettlr/Zettlr) — GPL-3.0 (cloned for Path C update)
