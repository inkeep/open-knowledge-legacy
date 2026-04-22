---
title: JPEG images aren't supported on paste (it's actually all images — JPEG-biased by observation)
description: Investigation of why JPEGs "don't work" when pasted into the markdown editor. Root cause is in the clipboard dispatcher, not the upload pipeline, and the same bug affects PNG/GIF/WebP when the clipboard carries both a `File` object and a `text/html` payload.
tags: [report, editor, clipboard, paste, images]
---
# JPEG image paste support — investigation and proposed fix

## TL;DR

JPEG images **do** work through every code path that I could probe except one: **clipboard paste from macOS apps that put both a `File` and a `text/html` payload on the clipboard (Preview, Photos, Finder, Safari/Chrome "Copy image", etc.).** In that specific path, the paste dispatcher's HTML branch (`tryBranchHtml` in [[handle-paste]]) fires first, inserts a PM image node with the HTML fragment's `src` (typically `file:///…`), and returns `true` — which preempts the [[FileHandler]] plugin that would have uploaded the actual `File` via `/api/upload-image`. The image renders broken (`naturalWidth/Height == 0`) because the browser can't load `file://` from an `http://` origin.

**The bug is not JPEG-specific** — PNG, GIF, and WebP have the exact same failure in the same conditions. It *appears* JPEG-biased because the most common PNG-producing source on macOS (`Cmd+Shift+4` screenshots) puts a `File` on the clipboard **without** a `text/html` payload, so `createHandlePaste` falls through and `FileHandler` uploads it correctly. Most JPEG-producing sources (Preview, Photos, Finder, web browsers) do include HTML, so they trip the bug.

**Scope of what still works** (verified with Playwright against a live `bun run dev` server on this worktree):

| Path                                            | JPEG | PNG | Notes                                                                                                  |
| ----------------------------------------------- | ---- | --- | ------------------------------------------------------------------------------------------------------ |
| `/api/upload-image` endpoint                    | ✅    | ✅   | `file-type` magic-bytes detection returns `image/jpeg`; `ALLOWED_MIME_TYPES.has('image/jpeg')` is true |
| Markdown source reference `![alt](photo.jpg)`   | ✅    | ✅   | `sirv` serves the file with `Content-Type: image/jpeg`                                                 |
| Sibling-asset filter rule for `.jpg` / `.jpeg`  | ✅    | ✅   | `ASSET_EXTENSIONS` already contains both                                                               |
| Drag-and-drop of a JPEG onto the editor         | ✅    | ✅   | `FileHandler.handleDrop` runs regardless of `text/html` content                                        |
| Slash-command "Image" file picker               | ✅    | ✅   | `input.accept` includes `image/jpeg`                                                                   |
| Paste, clipboard has **only** `File`            | ✅    | ✅   | `createHandlePaste` returns `false`; `FileHandler.handlePaste` uploads                                 |
| Paste, clipboard has `File` **and** `text/html` | ❌    | ❌   | **Bug** — `tryBranchHtml` wins, file never uploaded                                                    |

The fix is a \~5-line guard in `createHandlePaste` that defers to `FileHandler` when `clipboardData.files` contains image files on the MIME allowlist.

---

## How I reproduced it

Worktree: `.claude/worktrees/jpeg-image-support-investigation` (branch `worktree-jpeg-image-support-investigation`). Dev server on `VITE_PORT=7733`.

I wrote four Playwright probes and drove them against the live dev server. The probes live under `evidence/` (see §Evidence). The failure case that matched the user's observation:

```js
// Clipboard: real JPEG File + text/html with <img src="file://...">
dt.setData('text/html', '<img src="file:///private/tmp/real.jpg" alt="photo">');
dt.items.add(new File([jpegBytes], 'photo.jpg', { type: 'image/jpeg' }));
// Dispatch 'paste' on .ProseMirror
```

Result:

- **Upload requests:** `0` (FileHandler never ran).
- **Inserted image:** `<img src="file:///private/tmp/real.jpg" alt="photo" natural="0x0" complete>` — browser couldn't fetch `file://` from `http://localhost:7733`.
- `event.defaultPrevented === true` (createHandlePaste swallowed the event via `view.dispatch` inside `applyJsonSlice`).

Same clipboard shape with a PNG File + HTML reproduces the identical failure — confirming the bug is not JPEG-specific.

Control cases (all pass, JPEG and PNG):

- Paste with file only (no HTML) → one POST to `/api/upload-image`, image rendered with `1x1` natural dimensions.
- Drop (drag-and-drop) with file only or file+HTML → upload happens via `FileHandler.handleDrop` (no `createHandlePaste` involvement).
- Markdown source `![x](photo.jpg)` → rendered correctly, `Content-Type: image/jpeg` on response.

## Root cause

File: `packages/app/src/editor/clipboard/handle-paste.ts`
Function: `createHandlePaste` (wired as `editorProps.handlePaste` in `packages/app/src/editor/TiptapEditor.tsx:138`)

ProseMirror calls paste handlers in priority order: `editorProps.handlePaste` **first**, then each plugin's `handlePaste` in registration order. If any handler returns `true`, the rest are skipped. `createHandlePaste` runs before `FileHandler`'s plugin, so if `createHandlePaste` returns `true` for a paste that has BOTH a file and HTML, `FileHandler.handlePaste` never gets to see the file.

Walking the dispatcher with a JPEG + HTML clipboard:

1. `dt && dt.types.length > 0` — true (`dt.types` contains `'Files'` and `'text/html'`).
2. `pasteShiftHeld` — false.
3. `isCursorInCodeBlock` — false.
4. Branch A (`vscode-editor-data`) — skipped (empty).
5. Branch B (`text/x-gfm`) — skipped (empty).
6. Branch C (`data-pm-slice` in HTML) — skipped (no marker).
7. FR-13 ambiguous paste (`plain && html && isMarkdown(plain)`) — skipped (no plain).
8. **Branch D (`html && tryBranchHtml(view, html, deps, source)`) — fires.** `htmlToMdast` parses `<img src="file:///…" alt="photo">`; `mdastToMarkdown` emits `![photo](file:///…)`; `mdManager.parse` produces a PM image node; `applyJsonSlice` inserts it via `view.dispatch(view.state.tr.replaceSelection(…))`.
9. Returns `true`. **The `File` on the clipboard is silently dropped.**

The dispatcher has no branch that inspects `dt.files`. It treats clipboards as text-only. That assumption holds for 99% of WYSIWYG paste sources but breaks the moment an image File is co-present with HTML markup.

### Why screenshot PNGs aren't affected

On macOS, `Cmd+Shift+4` (or `Cmd+Shift+Ctrl+4` direct-to-clipboard) produces a clipboard with:

- `public.png` / `Files`: the PNG bytes
- (no `public.html` / `text/html`)

Step 8 short-circuits to `html && …` being false; step 9 is `plain && …`, also false; `createHandlePaste` returns `false`. `FileHandler.handlePaste` then runs and uploads via `uploadAndInsert`.

### Why JPEG copies are affected

Sources that users typically use to get a JPEG on the clipboard all include `text/html`:

- **Preview\.app** "Copy" on a raster image → `public.tiff` + `public.html` (`<img src="file://…">`).
- **Finder** "Copy" on a `.jpg` file → Files entry + `public.html` with the file URL.
- **Photos.app** export/drag → similar.
- **Safari / Chrome** right-click "Copy Image" → `Files` (often converted to PNG by Chrome) + `text/html` (`<img src="data:…">` or an origin-scoped URL).
- **Slack / Notion / etc.** image copy → file + HTML fragment.

Because the shipped dispatcher's ordering is "HTML wins, then plain, then fall through," every one of these sources hits Branch D first and loses the file.

Note: Chrome's web-page "Copy Image" often delivers a `data:image/png;base64,…` HTML even when the original was a JPEG, because Chrome re-encodes clipboard images as PNG to match `image/png` clipboard MIME expectations. That's unrelated to our bug, but it's another reason the user may have seen "my JPEG became a PNG."

## Current state of the allowlist (not the bug, but worth documenting)

Everyone downstream of [[upload-constants]] (`packages/core/src/constants/upload.ts`) is already JPEG-ready:

```ts
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

export const ASSET_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
```

- `packages/server/src/api-extension.ts` `/api/upload-image` builds `ALLOWED_MIME_TYPES` from this list and uses `file-type` magic bytes — accepts JPEG with `ext: 'jpg'`.
- `packages/server/src/content-filter.ts` uses `ASSET_EXTENSIONS` for the sibling-asset rule — `.jpg` and `.jpeg` are both auto-included next to an included `.md`.
- `packages/app/src/editor/extensions/shared.ts` configures `FileHandler` with `allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES]` — JPEG passes the filter.
- `packages/app/src/editor/slash-command/items.ts` sets the slash-command `<input type=file>` `accept` attr from the same list.

`GENERIC_PASTE_NAMES` (`/^(image\.(png|jpe?g|gif|webp)|Clipboard.*|Untitled.*)$/i`) also covers `jpg` and `jpeg`, so pasted-from-clipboard generic-named files get the `pasted-YYYYMMDD-HHMMSS.${ext}` rename.

Everything else is consistent. The bug is narrowly in the paste dispatcher's branch ordering.

## Proposed fix

The narrow change is to inspect `clipboardData.files` in `createHandlePaste` and return `false` (let other handlers run) when image files are present. That lets [[FileHandler]]'s `handlePaste` plugin pick them up and call `uploadAndInsert`.

```diff
--- a/packages/app/src/editor/clipboard/handle-paste.ts
+++ b/packages/app/src/editor/clipboard/handle-paste.ts
@@
 import type { MarkdownManager } from '@inkeep/open-knowledge-core';
-import { htmlToMdast, mdastToMarkdown } from '@inkeep/open-knowledge-core';
+import {
+  ALLOWED_IMAGE_MIME_TYPES,
+  htmlToMdast,
+  mdastToMarkdown,
+} from '@inkeep/open-knowledge-core';
 import type { JSONContent } from '@tiptap/core';
 import type { EditorView } from '@tiptap/pm/view';
@@
 export function createHandlePaste(deps: PasteDispatcherDeps) {
   return (view: EditorView, event: ClipboardEvent): boolean => {
     const dt = event.clipboardData;
     if (!dt || dt.types.length === 0) return false;

+    // Defer to FileHandler when the clipboard carries an image File.
+    // Many sources (Preview, Photos, Finder, browser "Copy image") bundle
+    // a File with an accompanying text/html fragment whose <img src> is
+    // typically a `file://` URL or a data: URL this editor cannot load.
+    // Without this guard, Branch D (tryBranchHtml) inserts the broken
+    // HTML image and swallows the event, starving FileHandler of its
+    // chance to upload the actual File.
+    if (hasAllowlistedImageFile(dt)) return false;
+
     const start = performance.now();
```

Plus the helper:

```ts
function hasAllowlistedImageFile(dt: DataTransfer): boolean {
  if (!dt.files || dt.files.length === 0) return false;
  for (const f of dt.files) {
    if ((ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(f.type)) return true;
  }
  return false;
}
```

Why this placement (inside `createHandlePaste`, above every other branch):

- It runs after the "empty clipboard" guard (same trivial short-circuit behavior).
- It runs before the Cmd+Shift+V escape hatch intentionally — a user doing Cmd+Shift+V with image bytes on the clipboard is still a file-upload, not a plain-text insert. (FR-17's purpose is plain-text from text-bearing clipboards; image-only clipboards don't produce text anyway.)
- It runs before `isCursorInCodeBlock` intentionally — dropping a file into a code block should upload it, not be coerced into text.
- FR-10 / FR-17 unit tests don't exercise `clipboardData.files`, so they continue to pass.
- It runs before Branch D's telemetry — no conversion-fail events emitted for a paste we deliberately skipped. Consistent with "deferred to FileHandler" semantics.

### Alternative placements considered

1. **Return early inside Branch D (`tryBranchHtml`) when files are present** — narrower, but still lets Branch A/B fire first if, e.g., someone crafts a clipboard with `text/x-gfm` + files. Probably fine in practice but introduces a coupling between `tryBranchHtml` and `FileHandler` that's harder to reason about.
2. **Reorder plugin priority so `FileHandler.handlePaste` runs before `editorProps.handlePaste`** — NOT possible; `editorProps` is always highest-priority in ProseMirror. Would require moving `createHandlePaste` into a plugin with a carefully-ordered priority. Larger blast radius; rejected.
3. **Let both handlers run and de-dupe** — not possible; first-returns-true stops dispatch. Rejected.
4. **Stop using `tryBranchHtml` for `<img>`-only HTML** — plausible follow-up but doesn't fix clipboards that carry mixed `<img>` + real rich-text content. Insufficient.

Recommend option 1 as documented in the diff above. Small, local, well-scoped.

## Test plan

Add a unit test in `packages/app/src/editor/clipboard/handle-paste.test.ts`:

```ts
test('returns false when clipboardData.files has an allowlisted image', () => {
  const view = fakeView();
  const evt = fakeDT({ 'text/html': '<img src="file:///x.jpg">' });
  // Attach a real File to the fake DataTransfer
  Object.defineProperty(evt.clipboardData, 'files', {
    value: [new File([new Uint8Array([0xff, 0xd8, 0xff])], 'x.jpg', { type: 'image/jpeg' })],
  });
  const dispatcher = createHandlePaste({ mdManager: mockMdManager });
  expect(dispatcher(view, evt)).toBe(false);
  // view.dispatch should NOT have been called — the HTML branch did not fire
  expect(view.dispatchCalls).toHaveLength(0);
});

test('still fires Branch D for non-image file clipboards', () => {
  const evt = fakeDT({ 'text/html': '<p>hi</p>' });
  // no files, or a non-image file (e.g. text/plain):
  Object.defineProperty(evt.clipboardData, 'files', { value: [] });
  const dispatcher = createHandlePaste({ mdManager: mockMdManager });
  expect(dispatcher(fakeView(), evt)).toBe(true); // HTML branch still handles it
});
```

Add a Playwright test in `packages/app/tests/stress/paste-image.e2e.ts` (new file) covering:

- JPEG File + `text/html` → exactly one `POST /api/upload-image`, rendered `<img>` has `naturalWidth > 0`.
- PNG File + `text/html` → same invariant (regression-guards the non-JPEG case).
- File only, no HTML → still uploads (control).
- HTML only, no files → still inserts via Branch D (control — the pure-HTML paste path must stay intact).

The two Playwright probes I wrote during investigation (`evidence/jpeg-mixed-paste-probe.mjs` + `jpeg-paste-probe.mjs`) can be adapted directly; they already exercise the failure + happy paths.

## Out of scope for this fix

- Chrome's "Copy Image" re-encoding JPEG → PNG on the clipboard. That's browser behavior; if the user needs byte-identical JPEG fidelity on paste they have to drag-and-drop or use the slash-command file picker.
- [[SVG]] paste handling — SVG is already text-bearing (`image/svg+xml` with `<svg>…</svg>` content). The guard above uses MIME and would correctly defer SVG-as-File to FileHandler; inline `<svg>` in an HTML fragment still goes through Branch D (which is fine — [[upload-asset-resolution-spec]] rejects inline SVG embedding via the TipTap schema).
- Data-URL images in pasted HTML. The `Image.configure({ inline: true })` setting leaves `allowBase64: false` (the TipTap default), so `<img src="data:image/jpeg;base64,…">` is filtered at `parseHTML`. This is working as intended per storage-fidelity policy; out of scope for this fix.
- Replacing `createHandlePaste`'s HTML branch with something smarter for image-heavy pages. That's a much larger [[paste-dispatcher]] design question.

## Evidence

Artifacts produced during the investigation (all in this worktree):

- `jpeg-browser-probe.mjs` — Opens `tmp-jpeg-test`, verifies a markdown-source JPEG reference renders correctly (natural `1x1`).
- `jpeg-paste-probe.mjs` — JPEG paste with file-only clipboard; verifies upload happens.
- `jpeg-mixed-paste-probe.mjs` — JPEG paste with file + HTML clipboard; **reproduces the bug**.
- `png-mixed-paste-probe.mjs` — Same shape with PNG; confirms bug is not JPEG-specific.
- `jpeg-drop-probe.mjs` — Drag-and-drop of JPEG; verifies `FileHandler.handleDrop` works.

These should move into `reports/jpeg-image-paste-support/evidence/` as part of the PR that lands the fix (or be deleted once the Playwright e2e test described above exists).

## Related

- [[upload-asset-resolution-spec]] — `specs/2026-04-13-image-upload-and-asset-resolution/SPEC.md` documents the upload allowlist and sibling-asset rule. No change needed there; the allowlist is already correct.
- [[FileHandler]] — `@tiptap/extension-file-handler` — third-party extension whose `handlePaste` the fix re-enables.
- [[handle-paste]] — `packages/app/src/editor/clipboard/handle-paste.ts` — single file the fix modifies.
