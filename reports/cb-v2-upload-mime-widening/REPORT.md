# Image / video / audio upload allowlist widening

**Date:** 2026-04-28
**Status:** Research complete — recommendation locked
**Branch context:** `cb-v2-md-foundation` (PR #310). Sister PR #270 (`finalize-asset-embed-surface`) takes the broader attachment surface; this report scopes the **inline-render** allowlist for the three lowercase canonical descriptors.

> **Provenance:** This report synthesizes a `/research --headless --fanout` subagent run from 2026-04-28 06:00 UTC (subagent id `ab9eaf88a7e4cd0bd`). The subagent's harness blocked it from writing report .md files and returned findings inline — recovered via `find-claude` and reconstructed here without semantic edit.

---

## Executive Summary

Eighteen candidate MIME types were evaluated across browser native rendering (Chrome / Firefox / Safari / Edge in late 2026), `file-type@22.0.1` magic-byte detection, format-specific CVE reachability, `<img>`/`<video>`/`<audio>` render semantics, and mobile-camera default behavior.

**Three principles drive the recommendations:**

1. **The MIME `file-type` returns is the only one that matters.** `fileTypeFromBuffer` ignores the client-supplied `Content-Type` and returns its own canonical string. The allowlist must contain what `file-type` returns.
   - **Five candidate names from the prompt fail this test:** `image/heif` (returns `image/heic`), `image/vnd.microsoft.icon` (returns `image/x-icon`), `audio/x-m4a` (returns `audio/mp4`), `audio/x-aiff` (returns `audio/aiff`), `video/avi` (returns `video/x-msvideo`).
   - **Two more — `video/x-ms-wmv` and `audio/x-ms-wma` — are completely undetected** by file-type@22.0.1, so allowlisting them would be **dead code** (the magic-byte detection returns `undefined` and the upload 400's before the allowlist is consulted).

2. **The two iPhone-default formats are the high-value cases.** iPhone Camera saves to `image/heic` (since iOS 11, 2017) and records video to `video/quicktime` (every iOS version). These produce the highest-frequency "I can't upload from my phone" friction. Shipping both is the largest UX win in the candidate set, even though HEIC renders only in Safari (acceptable: broken-icon on Chrome/Firefox/Edge, with the file safely stored and served).

3. **Server-side never decodes — decoder-CVE reachability is structurally low.** `uploadMediaCore` reads bytes, magic-byte-detects, allowlist-gates, persists, serves with `Content-Disposition: inline`. No Sharp / ImageMagick / libheif invocation. The libheif CVE cluster (CVE-2025-61147, CVE-2025-68431, CVE-2023-49460+) and libavif CVE-2025-48174 (severity 9.1) hit server-side image-processing pipelines that decode bytes — not us. Browser-side decoders are sandboxed and patched on rapid cadence. Security cost of widening is materially lower than for a thumbnail-generating CMS.

**Recommendation:** ship +11 MIMEs across image/video/audio (one conditional on Safari-only render). Every entry corresponds to what `fileTypeFromBuffer` actually returns from the v22.0.1 dispatch table.

---

## Per-class ship/skip table

### Image (current allowlist: `image/jpeg, image/png, image/gif, image/webp, image/svg+xml`)

| Candidate | file-type returns | Browser render via `<img>` | Recommendation | Rationale |
|-----------|-------------------|----------------------------|----------------|-----------|
| `image/avif` | `image/avif` | All major (94.9% global) | **SHIP** | Chrome v85+, FF v93+, Safari v16.4+, Edge v121+. Sister PR #270 ships it too. Modern format, broader support than WebP at WebP's rollout. |
| `image/apng` | `image/apng` | All major (96.0% global) | **SHIP** | Chrome v59+, FF v3+ (since 2008), Safari v8+, Edge v79+. Rides on PNG decoder. Trivial cost. |
| `image/bmp` | `image/bmp` | All major (universal) | **SHIP** (low value) | MDN: avoid for file-size reasons; CVE-2025-57803 is server-side ImageMagick → not reachable for us. |
| `image/x-icon` | `image/x-icon` | All major | **SHIP** (low value) | Universal modern-browser support. **Do NOT add `image/vnd.microsoft.icon`** — file-type doesn't return that variant. |
| `image/heic` | `image/heic` | **Safari only** (16.15% global) | **CONDITIONAL SHIP** | iPhone Camera default since iOS 11; Samsung Galaxy S23+ default. Storing user uploads (with broken-icon on non-Safari) beats refusing them with 400. |
| `image/heif` | re-MIMEs to `image/heic` | n/a | **SKIP** | Dead code — file-type buckets HEIF brand into `image/heic`. |
| `image/tiff` | `image/tiff` | **Safari only** | **SKIP** | MDN: "Browser support: Safari only." No mobile-default ergonomic case to justify the broken-render hit. |
| `image/jxl` | `image/jxl` | Safari partial only | **SKIP** | Chrome removed JXL 2022, no path back; FF disabled-by-default; Safari v17+ partial. |

### Video (current allowlist: `video/mp4, video/webm, video/ogg`)

| Candidate | file-type returns | Browser render via `<video>` | Recommendation | Rationale |
|-----------|-------------------|------------------------------|----------------|-----------|
| `video/quicktime` | `video/quicktime` | Safari yes; Chrome H.264-MOV informal; FF rare | **SHIP** | iPhone records to `.mov` in every iOS version. Container caveats apply (HEVC profile depends on hardware) but worst case = "file uploaded, may not play in some browsers" not "upload refused." |
| `video/x-m4v` | `video/x-m4v` | All major (MP4-equivalent) | **SHIP** | Apple variant of MP4; plays wherever MP4 plays. Trivial cost. |
| `video/x-matroska` (MKV) | `video/x-matroska` | None reliably; FF experimental in 2026 | **SKIP** | Mozilla bug 1422891 still tracking; Chrome plays some MKV informally but declines explicit `video/x-matroska` MIME. Inline render unreliable. |
| `video/x-msvideo` (AVI) | `video/x-msvideo` | None reliably | **SKIP** | MDN doesn't list AVI as supported for any major browser. **Note:** file-type returns `video/x-msvideo`, NOT `video/avi`. |
| `video/x-ms-wmv` | **NOT DETECTED** | None | **SKIP** | Dead code: file-type@22.0.1 has no WMV detection. |
| `video/3gpp` | `video/3gpp` | iOS Safari + FF Android only | **SKIP** | 2010-era feature-phone container; near-zero 2026 frequency. |

### Audio (current allowlist: `audio/mpeg, audio/wav, audio/ogg, audio/webm`)

| Candidate | file-type returns | Browser render via `<audio>` | Recommendation | Rationale |
|-----------|-------------------|------------------------------|----------------|-----------|
| `audio/mp4` (M4A) | `audio/mp4` (NOT `audio/x-m4a`) | All major (>97% global) | **SHIP** | iPhone Voice Memos default; iTunes/Apple Music export default. **Critical:** allowlist must contain `audio/mp4` — listing `audio/x-m4a` is dead code. |
| `audio/aac` | `audio/aac` | All major (~97%) | **SHIP** | Chrome v50+ for bare AAC ADTS; FF/Safari via OS decoders. |
| `audio/flac` | `audio/flac` | All major (>96%) | **SHIP** | Chrome v56+, FF v51+, Safari v13+, Edge v16+. Lossless workflow. |
| `audio/opus` | `audio/opus` | All major (>96%) | **SHIP** | Bare `.opus` files; complements current `audio/webm` (Opus-in-WebM) and `audio/ogg` (Opus-in-Ogg) entries. |
| `audio/aiff` | `audio/aiff` (NOT `audio/x-aiff`) | **Safari only** | **SKIP** | caniuse: 0 results. Safari only. No mobile-default ergonomic case. |
| `audio/x-ms-wma` | **NOT DETECTED** | None | **SKIP** | Dead code. |

---

## Recommended new allowlist constants

```ts
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // additions
  'image/avif',
  'image/apng',
  'image/bmp',
  'image/x-icon',
  'image/heic',  // Safari-only render; iPhone-default
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  // additions
  'video/quicktime',  // iPhone-default
  'video/x-m4v',
] as const;

export const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  // additions
  'audio/mp4',     // M4A — NOT 'audio/x-m4a' (dead string)
  'audio/aac',
  'audio/flac',
  'audio/opus',
] as const;
```

**Tally:** +5 image MIMEs (one conditional), +2 video MIMEs, +4 audio MIMEs. Every entry corresponds to what `fileTypeFromBuffer` actually returns from the v22.0.1 dispatch table.

---

## Detailed Findings

### Image formats

**AVIF / `image/avif`** — SHIP. caniuse global support **94.9%**: Chrome v85+ (Aug 2020), Firefox v93+, Safari v16.4+ (Mar 2023), Edge v121+. file-type returns `image/avif`. Server doesn't decode → libavif CVE-2025-48174 (severity 9.1, integer overflow in `makeRoom`) isn't reachable; browser-side AVIF decode (Chromium's libgav1/dav1d, Firefox's dav1d, Safari's ImageIO) is sandboxed.

**APNG / `image/apng`** — SHIP. caniuse 96.02%; supported in Chrome since v59, Firefox since v3 (2008), Safari v8+, Edge v79+. Where unsupported (Opera Mini), only the first frame displays — graceful degradation. PNG-decoder-derived; no format-specific CVE class.

**BMP / `image/bmp`** — SHIP, low expected usage. MDN: "Browser support: Chrome, Edge, Firefox, IE, Opera, Safari" (every modern browser). MDN's discouragement is purely on file-size grounds — uncompressed format. CVE-2025-57803 (ImageMagick BMP encoder integer overflow → heap corruption, HIGH) is server-side; not reachable since we don't decode.

**ICO / `image/x-icon`** — SHIP, low expected usage. file-type returns `image/x-icon` (not the IANA-registered `image/vnd.microsoft.icon`). All major modern browsers render `<img src="*.ico">` correctly. **Do NOT add `image/vnd.microsoft.icon` to the allowlist** — file-type doesn't return it from magic bytes; the entry would be dead.

**HEIC / `image/heic`** — CONDITIONAL SHIP. caniuse global support **16.15%** — **Safari only** since v17.0. iPhone Camera default since iOS 11 (2017); Samsung Galaxy S23+ default in 2026. Recent libheif CVE cluster (CVE-2025-61147 libde265 null-pointer DoS; CVE-2025-68431 libheif heap buffer over-read; 2025 unnamed Ubuntu 24.04 libheif heap overflow; 2023 cluster CVE-2023-49460/49462/49463/49464) — all server-side; not reachable for us. Decision: ship `image/heic` so the upload succeeds without confusing 400. Document the Safari-only render. Sister PR #270 takes the same posture.

**HEIF / `image/heif`** — SKIP. file-type@22.0.1 buckets HEIF-brand variants (`mif1`, `msf1`) into `image/heic`; no separate `image/heif` MIME is returned. Allowlist entry would be dead code.

**TIFF / `image/tiff`** — SKIP. MDN: "Browser support: Safari only." Use case (precision-editing/printing) doesn't match inline-embed. Sister PR #270 admits TIFF in the broader asset-attachment surface (download path), but that's not our inline-render allowlist.

**JPEG XL / `image/jxl`** — SKIP. caniuse global usage 16.15%. Chrome removed JXL support in 2022; no announced re-enablement in 2026. Firefox + Edge disabled-by-default. Safari v17+ partial only.

### Video formats

**MOV / `video/quicktime`** — SHIP. Apple Developer documentation lists `.mov` as Safari-supported. iPhone records video to MOV in every iOS version since iOS 1 (codec is HEVC since iOS 11, H.264 before; container stays MOV either way). Community-tested: Chrome plays H.264/AAC `.mov` informally; Firefox does not play `.mov` reliably; Safari yes (excluding ProRes profile). Render path uses `<video src="...">` (no explicit `type=`), so browser sniffs the container — Chrome auto-detects and plays H.264-MOV.

**M4V / `video/x-m4v`** — SHIP. MDN: "M4V: Yes (MP4 variant)" across Chrome / Firefox / Safari / Edge. m4v is structurally MP4 with optional FairPlay DRM extensions; non-DRM .m4v files (most of them) play wherever MP4 plays.

**MKV / `video/x-matroska`** — SKIP. MDN doesn't list Matroska as a `<video>` container. Mozilla bug 1422891 tracks "Add MKV support to Firefox" — experimental in 2026 nightly, not stable. Chrome plays some MKV files informally but declines the explicit `video/x-matroska` MIME type. Skip on inline-render reliability grounds; if MKV-as-attachment is a real user need, it's sister PR #270's surface.

**AVI / `video/x-msvideo`** — SKIP. MDN doesn't list AVI as supported for any major browser. **Note:** file-type returns `video/x-msvideo`, NOT `video/avi`.

**WMV / `video/x-ms-wmv`** — SKIP, dead code. file-type@22.0.1 doesn't detect WMV at all.

**3GP / `video/3gpp`** — SKIP. 2010-era feature-phone container. Inconsistent native render (iOS Safari yes, FF-Android via OS framework, others mostly no). Near-zero 2026 frequency.

### Audio formats

**M4A / `audio/mp4`** — SHIP, **highest-value audio addition**. MDN: "M4A (MP4 audio): Yes" across Chrome v12+, Firefox v22+ (platform-dependent), Safari v4+, Edge v12+. iPhone Voice Memos default; iTunes/Apple Music export default. **file-type returns `audio/mp4` — NOT `audio/x-m4a`.** Allowlist must contain `audio/mp4`.

**AAC / `audio/aac`** — SHIP. caniuse 97.01% support. Chrome v50+ for bare-AAC (ADTS framing); Firefox/Safari via OS-supplied decoders. Closes the gap between AAC-in-MP4 (admitted via M4A) and bare AAC streams.

**FLAC / `audio/flac`** — SHIP. caniuse 96.42% support: Chrome v56+ (Feb 2017), Firefox v51+ (Jan 2017), Safari v13+ (Sep 2019), Edge v16+ (Oct 2017). Lossless without forcing wav (uncompressed, ~10× larger).

**Opus / `audio/opus`** — SHIP. caniuse 96.70% (full + partial). Bare `.opus` files; current allowlist covers Opus-in-WebM (`audio/webm`) and Opus-in-Ogg (`audio/ogg`) only. Closes the gap.

**AIFF / `audio/aiff`** — SKIP. caniuse 0 results indexed. Safari only across community-tested browsers. file-type returns `audio/aiff` (NOT `audio/x-aiff`). Same Safari-only situation as TIFF / HEIC, but unlike HEIC there's no mobile-default ergonomic case justifying the broken-render hit.

**WMA / `audio/x-ms-wma`** — SKIP, dead code. file-type@22.0.1 doesn't detect WMA.

---

## Security Profile Summary

Per-format CVE record assessed against the OK threat model:

| Format | Recent CVEs | Reachability for OK |
|--------|-------------|--------------------|
| AVIF | CVE-2025-48174 (libavif heap overflow, sev 9.1), CVE-2025-48175 | NOT REACHABLE — server doesn't invoke libavif |
| HEIC | CVE-2025-61147 (libde265 DoS), CVE-2025-68431 (libheif heap over-read), 2025 unnamed libheif heap overflow, CVE-2023-49460/62/63/64 cluster | NOT REACHABLE — server doesn't invoke libheif |
| BMP | CVE-2025-57803 (ImageMagick stride overflow → heap corruption, HIGH) | NOT REACHABLE — server doesn't invoke ImageMagick |
| TIFF | Long historical libtiff tail (continues 2026); occasional ImageMagick patches | NOT REACHABLE — server doesn't decode |
| JXL | Limited record (low adoption = low attacker interest) | n/a (skipped) |
| APNG, ICO, MOV, M4V, M4A, AAC, FLAC, Opus | No format-specific browser-decoder CVE class in recent record | n/a |

The dominant risk vectors for our specific pipeline remain:

1. Stored-XSS via SVG (already in allowlist; existing concern, separate work)
2. Filename traversal (not format-related)
3. Browser renderer-process exploits via crafted media (mitigated by sandboxing + browser patch cadence)

Widening to the SHIP candidates does not add reachable server-side decoder CVE classes.

---

## Limitations & Open Questions

- **Mobile HEIC AirDrop fallback:** Apple docs note iOS auto-converts HEIC → JPEG when AirDrop'd to non-Apple devices. Direct file-picker from Files.app preserves HEIC. We haven't tested whether iOS Safari's `<input type="file">` triggers conversion or preserves HEIC during web upload — empirical test recommended before launching HEIC documentation.
- **Chrome HEVC-MOV on Linux:** Chrome v107+ added HEVC playback but with hardware-decode requirements that vary by OS. Real iPhone-recorded `.mov` (HEVC since iOS 11) on Chrome-on-Linux without HEVC hardware acceleration may not play. Mitigation is upstream-only.
- **MOV / MKV / 3GP browser support is "informally working"** rather than formally documented in caniuse / MDN compatibility tables. We've cross-referenced multiple independent community sources but the precise behavior across browser-version × OS-version × codec-profile combinations isn't deterministic. The recommendation reflects the worst-case "user uploads file → file is stored, possibly fails to render in some browsers" — never "user uploads file → security incident."

---

## Cross-references

- `packages/core/src/constants/upload.ts` — current allowlist (this PR)
- `packages/server/src/api-extension.ts` — `uploadMediaCore` validation pipeline (calls `fileTypeFromBuffer`)
- `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/finalize-asset-embed-surface/packages/core/src/constants/upload.ts` — sister PR #270's broader asset surface (admits TIFF, MKV, AVI for download-as-attachment; admits HEIC/AVIF/APNG/BMP/ICO for inline render — same posture as our SHIP recommendations)
- `bun.lock` — pins `file-type@22.0.1`

**Key external sources:**

- [file-type v22.0.1 README](https://github.com/sindresorhus/file-type)
- caniuse pages: [AVIF](https://caniuse.com/avif), [APNG](https://caniuse.com/apng), [HEIF](https://caniuse.com/heif), [JPEG XL](https://caniuse.com/jpegxl), [AAC](https://caniuse.com/aac), [FLAC](https://caniuse.com/flac), [Opus](https://caniuse.com/opus)
- [MDN Image format guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)
- [MDN Container guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers)
- [Apple HEIF/HEVC support](https://support.apple.com/en-us/116944)
- [Mozilla MKV bug 1422891](https://bugzilla.mozilla.org/show_bug.cgi?id=1422891)
- [GitHub Advisory libavif CVE-2025-48174](https://github.com/advisories/GHSA-f6x7-5x3c-j3rg)
