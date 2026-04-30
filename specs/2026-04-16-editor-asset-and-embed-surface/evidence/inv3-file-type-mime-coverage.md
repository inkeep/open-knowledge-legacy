---
investigation: "INV3 — file-type MIME coverage for widened asset allowlist"
date: 2026-04-16
context: "Determining which target MIME types `file-type` can sniff via magic bytes, feeding decision D-A (strict magic-byte-only vs extension-fallback) for the asset-embed surface spec."
files-read:
  - "/Users/edwingomezcuellar/projects/open-knowledge/packages/server/package.json"
  - "/Users/edwingomezcuellar/projects/open-knowledge/bun.lock"
  - "/Users/edwingomezcuellar/projects/open-knowledge/packages/server/src/api-extension.ts"
  - "/Users/edwingomezcuellar/projects/open-knowledge/packages/core/src/constants/upload.ts"
  - "/Users/edwingomezcuellar/projects/open-knowledge/node_modules/file-type/package.json"
  - "/Users/edwingomezcuellar/projects/open-knowledge/node_modules/file-type/readme.md"
  - "/Users/edwingomezcuellar/projects/open-knowledge/node_modules/file-type/source/supported.js"
  - "/Users/edwingomezcuellar/projects/open-knowledge/node_modules/file-type/source/index.js"
  - "/Users/edwingomezcuellar/projects/open-knowledge/node_modules/file-type/source/detectors/zip.js"
urls-consulted:
  - "https://github.com/sindresorhus/file-type (README, v22.0.1 of installed package)"
  - "https://github.com/sindresorhus/file-type/releases (v22.0.0 breaking-change notes)"
---

# INV3 — file-type MIME coverage

## 1. Version confirmed

**The task brief's "file-type@8.x" premise is incorrect.** We are running a recent major.

- `packages/server/package.json` line 21: `"file-type": "^22.0.1"`
- `bun.lock`: `"file-type@22.0.1"` (exact resolved version)
- `node_modules/file-type/package.json`: `"version": "22.0.1"`, `"engines": { "node": ">=22" }`, ESM-only (`"type": "module"`)
- Call site: `packages/server/src/api-extension.ts:40` (`import { fileTypeFromBuffer } from 'file-type'`) used at line 3084 (baseline `2ad0177a`; earlier baseline `432a834b` had import at :38 and use site at :2535)

There is also an indirect `file-type@21.x` transitive dep via `just-bash`, but our direct usage resolves to v22.0.1.

All analysis below is for **v22.0.1**, the version actually in production. v22 added Apple iWork formats (`.key`, `.pages`, `.numbers`), dropped Node `stream.Readable` in favor of web `ReadableStream`, removed `file-type/core` sub-export, and bumped the engine floor to Node >=22 (see GitHub releases). None of these affect our `fileTypeFromBuffer` call site, which accepts `Uint8Array`.

## 2. Target MIME coverage table

Source of truth: `node_modules/file-type/source/supported.js` (`supportedMimeTypes` export) + per-format detectors in `source/index.js` and `source/detectors/`.

| Target MIME | Supported? | Detector location | Notes |
| --- | --- | --- | --- |
| `application/pdf` | Yes | `index.js:855` | Magic bytes `%PDF-`. Third-party `@file-type/pdf` adds Illustrator sub-classification if needed later. |
| `video/mp4` | Yes | `index.js:1280-1328` | ISOBMFF `ftyp` box. Sub-brand dispatch returns `video/mp4` for `mp4`, `m4p`, `f4v`, `f4p`; `video/x-m4v` for `m4v`; `audio/mp4` for `m4a`/`m4b`. Comment at :1280-1281: "They all can have MIME `video/mp4` except `application/mp4` special-case which is hard to detect." |
| `audio/mpeg` (MP3) | Yes | `index.js:1889, 1897, 1905, 594` | MPEG-1 Audio Layer III. Also returned for `mp1`, `mp2`. Option `mpegOffsetTolerance` (README §Options) handles malformed syncs in the wild. |
| `audio/wav` | Yes | `index.js:1362` | RIFF `WAVE` chunk. Note: `supported.js:227` spells it `audio/wav` (not `audio/wave` or `audio/x-wav`). |
| `audio/ogg` | Yes | `index.js:737, 745, 753, 713` | OggS signature. Returns `audio/ogg; codecs=opus` when Opus codec is detected (line 713). Also `video/ogg`, `application/ogg`, `audio/ogg` for spx/oga variants. |
| `video/webm` | Yes | `detectors/ebml.js:109` | EBML/Matroska header peek distinguishes webm from mkv (returns `video/matroska` for the latter). |
| `application/zip` | Yes | `detectors/zip.js:641` | Fallback when no OOXML/iWork/OpenDocument/JAR/APK/EPUB signature is found inside the ZIP (peek-inside behavior — see §3). |
| `text/plain` (.txt) | **No** | — | README §intro: "This package is for detecting binary-based file formats, not text-based formats like `.txt`, `.csv`, `.svg`, etc." No magic bytes exist for plain text. |
| `text/csv` | **No** | — | Same. Explicitly rejected upstream: README footnote links to `sindresorhus/file-type#264` where Sindre closed CSV as out of scope. |
| `text/markdown` (.md) | **No** | — | No magic bytes. Also intentionally blocked at the product layer (NG from prior spec — markdown uploads would shadow wiki content). |
| `application/json` | **No** | — | No magic bytes (just `{` or `[`, ambiguous with many other text formats). |
| `font/woff` | Yes | `index.js:791` | wOFF header. |
| `font/woff2` | Yes | `index.js:804` | wOF2 header. |
| `font/ttf` | Yes | `index.js:1714` | TrueType sfnt. Also `font/otf` (OpenType), `font/collection` (ttc). |
| `image/jpeg` | Yes (current) | — | Already in shipped allowlist. |
| `image/png` | Yes (current) | — | Already in shipped allowlist. |
| `image/gif` | Yes (current) | — | Already in shipped allowlist. |
| `image/webp` | Yes (current) | `index.js:1348` | Already in shipped allowlist. |
| `image/svg+xml` | **No** by magic bytes | `api-extension.ts:3088-3093` | README explicitly excludes SVG. Shipped code already compensates with an extension-fallback branch: if `fileTypeFromBuffer` returns `undefined` and the filename ends in `.svg`, it sets `detectedMime = 'image/svg+xml'`. This is precedent for D-A option B (extension-fallback), already in production. |

### Shipped allowlist location

`packages/core/src/constants/upload.ts`:

```
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;
```

Consumed as a `Set<string>` at `api-extension.ts:168` and gate-checked at `api-extension.ts:3095`.

## 3. Ambiguous cases — ZIP-based formats

`file-type@22` **peeks inside** ZIP archives and returns the most specific MIME it can identify. Logic lives in `source/detectors/zip.js`.

**Dispatch order** (zip.js:639-642):

```js
return fileType                                   // First specific hit (OOXML by [Content_Types].xml, JAR by META-INF/, APK, EPUB, iWork, 3MF)
  ?? getOpenXmlFileTypeFromZipEntries(openXmlState)  // Fallback: OOXML by directory-name heuristic (word/, ppt/, xl/)
  ?? iWorkFileType                                   // Apple iWork fallback
  ?? { ext: 'zip', mime: 'application/zip' };        // Generic ZIP
```

**Specific OOXML MIMEs returned** (zip.js:210-241, 284-298):

- `.docx` → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `.xlsx` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `.pptx` → `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- `.ppsx`, `.xltx`, `.dotx`, `.potx`, macro-enabled variants — each distinct MIME
- `.odt`, `.ods`, `.odp`, `.odg`, OpenDocument templates — each distinct MIME
- `.epub` → `application/epub+zip` (zip.js:192)
- `.jar` → `application/java-archive` (zip.js:558)
- `.apk` → `application/vnd.android.package-archive` (zip.js:606)
- `.3mf` → `model/3mf`

**Implication for allowlist design:** if we whitelist `application/zip` we do *not* automatically accept DOCX/XLSX/PPTX — those return the specific OOXML MIME, so they'd need to be explicitly allowed (or denied). Conversely, if we allowlist only `application/zip`, a DOCX upload will be **rejected** because `fileTypeFromBuffer` returns the OOXML MIME, not `application/zip`. This is a feature (precise gating) not a bug, but it means the spec must explicitly decide whether OOXML is in scope.

There is one edge-case where a real DOCX/XLSX can fall through to `application/zip`: the zip-entry stream is truncated before `[Content_Types].xml` is parseable and the directory-name heuristic also fails (zip.js:310-319, 624-628). For magic-byte gating on upload (where we buffer the whole file before calling `fileTypeFromBuffer`), this won't happen in practice — we always feed the full bytes.

**LibreOffice quirk noted in source comment** (zip.js:624-626): LibreOffice-authored OOXML places `[Content_Types].xml` after content entries, so truncated reads fall back to directory-name heuristic. Not relevant for full-buffer calls.

## 4. Recommendation for D-A (strict vs extension-fallback)

### Summary

**Strict magic-byte-only works cleanly for everything we actually want except SVG, TXT, CSV, MD, JSON.** The library sniffs PDF, MP4, MP3, WAV, OGG, WebM, ZIP, WOFF/WOFF2/TTF reliably. The dividing line is binary-vs-text: `file-type` deliberately doesn't sniff text formats (README §intro + CSV issue #264).

### Three realistic decisions

**Option A — Strict magic-byte-only, binary-only allowlist (recommended).**
- Accept: images (current), PDF, MP4, MP3, WAV, OGG, WebM, ZIP, fonts.
- Reject: TXT, CSV, MD, JSON, SVG at the magic-byte path.
- Keep the current SVG extension-fallback branch (api-extension.ts:3088-3093) as a bounded, documented exception — it's already shipping.
- Pros: single trust boundary, no path-based spoofing risk for binary types, matches how most production uploaders do it (the gate is "is this really a PDF" not "did the client claim PDF").
- Cons: no text-file uploads. Given the product (wiki editor), markdown and txt embeds arguably belong in the document pipeline anyway, not as opaque asset attachments.

**Option B — Extension-fallback for a short text allowlist.**
- All of A plus: if `fileTypeFromBuffer` returns `undefined`, check filename extension against `{txt, csv, json, md?}` and accept with a MIME derived from the extension.
- Pros: supports txt/csv drop-in-as-attachment.
- Cons: adds a filename-trust surface (client can send a binary executable renamed `.txt`); widens attack surface; sets a precedent that extensions matter elsewhere.

**Option C — Hybrid: magic-byte for binary, DOMPurify+server-side validation for text.**
- For text formats, instead of extension-fallback, run a lightweight content-shape check (e.g., UTF-8 decode + null-byte check for txt, PapaParse dry-run for csv).
- Overkill for a first iteration.

### Recommendation

**Option A.** Evidence:
1. Our shipped code already exercises the Option A pattern — SVG has its own explicit fallback branch, not a generic extension-fallback.
2. `file-type`'s maintainer has closed CSV as out-of-scope (README footer + issue #264) because text sniffing is intrinsically ambiguous. We should not paper over this upstream decision at our layer.
3. The spec's core use case (drops of PDF/MP4/MP3/WAV/images as embedded/downloadable assets) is 100% covered by Option A with zero risk.
4. For `.txt` / `.csv` / `.md`, wiki-first framing says: paste into a page, don't attach as opaque bytes. This aligns with "markdown-primary" product direction from CLAUDE.md Tier 1.

If we later need txt/csv, gate that behind a separate decision with its own security review — don't fold it into INV3's magic-byte widening.

## 5. Upgrade path notes

We are already on the latest major (v22). No bump needed.

**Historical note for posterity** (from release page): v22 dropped Node `stream.Readable` in favor of web `ReadableStream`. Our code uses `fileTypeFromBuffer(Uint8Array)` which is unaffected. If we ever switch to streaming uploads with `fileTypeFromStream`, we'll need a `Readable.toWeb()` conversion per the README tip at line 129.

**Third-party detectors we could add later** (not needed now; listed for completeness from README §Custom detectors):
- `@file-type/xml` — would enable SVG magic-byte detection (drops the extension-fallback branch).
- `@file-type/av` — improves audio/video discrimination for weird containers.
- `@file-type/pdf` — sub-classifies Adobe Illustrator PDFs.
- `@file-type/cfbf` — enables legacy `.doc`/`.xls`/`.ppt`/`.msi` detection.

None of these change the v22 upgrade calculus; they'd be additive once we have a reason.

## Citations

- File-type v22 README bundled at `/Users/edwingomezcuellar/projects/open-knowledge/node_modules/file-type/readme.md` — §Supported file types (readme.md:390-577), §intro disclaimer (readme.md:9), §Options/mpegOffsetTolerance (readme.md:291-299).
- Source: `node_modules/file-type/source/supported.js:193-360` (full supported MIME list), `source/index.js:1280-1328` (MP4 dispatch), `source/detectors/zip.js:192-642` (OOXML/iWork/JAR/APK/EPUB peek).
- Call site: `packages/server/src/api-extension.ts:40,168,3084-3095` (baseline `2ad0177a`).
- Shipped allowlist: `packages/core/src/constants/upload.ts:1-9`.
- Upstream release notes: https://github.com/sindresorhus/file-type/releases (v22.0.0 entry).
- CSV out-of-scope rationale: https://github.com/sindresorhus/file-type/issues/264#issuecomment-568439196 (linked from readme.md:586).
