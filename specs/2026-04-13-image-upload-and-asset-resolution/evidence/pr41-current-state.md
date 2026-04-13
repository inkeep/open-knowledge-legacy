---
name: PR #41 (implement/image-upload) current state
description: Factual catalog of what Sarah's open PR already ships, what survives into the target spec, and what must change to match the sibling + filter-reinterpretation direction.
sources:
  - https://github.com/inkeep/open-knowledge/pull/41
  - local diff at /tmp/pr41.diff (990 lines, +510/-6, 17 files)
type: current-state
---

# PR #41 — Current state snapshot

Branch: `implement/image-upload` (author: sarah-inkeep). State: OPEN, mergeable: CONFLICTING (needs rebase). 510 additions, 6 deletions across 17 files.

## What it ships

### 1. Upload endpoint — `POST /api/upload-image`
**File:** `packages/server/src/api-extension.ts` (+177 LOC).
- **Transport:** `multipart/form-data` via `busboy@^1.6.0` (single-file limit, fileSize cap).
- **Size cap:** `MAX_UPLOAD_BYTES = 10 * 1024 * 1024` (10 MB) — server-enforced; returns `413` on exceed.
- **MIME verification:** Magic-bytes check via `file-type@^22.0.1`. **Client-supplied mimeType ignored entirely** (good — prevents MIME spoofing). Rejects with `400` if detected MIME ∉ allowlist.
- **Allowlist:** `ALLOWED_IMAGE_MIME_TYPES` = `['image/jpeg','image/png','image/gif','image/webp']`. Exported as const from `@inkeep/open-knowledge-core`, shared with the frontend FileHandler + slash command.
- **Filename sanitization:** `sanitizeFilename()` strips path separators, keeps `[a-zA-Z0-9_\-.]` in stem, keeps `[a-zA-Z0-9_.]` in extension; fallback stem `"upload"`.
- **Collision strategy:** Atomic `openSync(path, 'wx')` attempt on base name; on `EEXIST`, numeric suffix `-1` through `-99` (hard ceiling at 100 attempts — throws if exhausted).
- **Response:** `{ ok: true, src: '<uploadsDir>/<destFilename>' }` — returns the **relative URL path**, NOT the disk path.

### 2. Config schema change
**Files:** `packages/cli/src/config/schema.ts`, `.open-knowledge/config.yml`.
```typescript
content: {
  dir: string,               // unchanged
  uploadsDir: string,        // NEW — default 'uploads'
  include: string[],
  exclude: string[],
}
```
`uploadsDir` is resolved against `contentDir` — e.g., `content/uploads/`.

### 3. Storage model — single flat dir
**File:** `packages/server/src/api-extension.ts:handleUploadImage`.
All uploads land in `<contentDir>/<uploadsDir>/<sanitized-filename>`. **Flat**, not sibling. Not per-note. Not per-directory. Not affected by which `.md` the user is editing.

### 4. Static serving — parallel to content-filter
**Files:** `packages/app/src/server/hocuspocus-plugin.ts`, `packages/cli/src/commands/start.ts`.
- Dev: Vite middleware mounts `sirv(join(contentDir, uploadsDir))` at `/${uploadsDir}`.
- Prod: CLI static handler catches `url.startsWith('/${uploadsDir}/')` and serves via a separate `sirv` instance.
- Both set `X-Content-Type-Options: nosniff`.
- **Bypasses `ContentFilter` entirely.** Uploads are not in the watcher's file index; they are served through a parallel namespace.

### 5. Editor surfaces
**Files:** `packages/app/src/editor/extensions/shared.ts`, `packages/app/src/editor/image-upload/index.ts`, `packages/app/src/editor/slash-command/items.ts`.
- `@tiptap/extension-file-handler` wired with `onDrop` + `onPaste` → `uploadAndInsert(file, editor, pos)`.
- Slash command `/image` (aliases `img`, `photo`) opens a file picker → `uploadAndInsert`.
- `uploadAndInsert`:
  1. Creates a skeleton DOM widget (`h-40 bg-muted animate-pulse`).
  2. Dispatches `uploadPluginKey` meta `{ type: 'add', id: uuid, pos, widget }` to render placeholder decoration.
  3. POSTs multipart to `/api/upload-image`.
  4. On success: `.setMeta({type:'remove', id})` + `.insert(mappedPos, imageNode.create({ src, alt }))` in one transaction.
  5. On error: removes decoration, shows `sonner` toast.
- Alt text derived from filename stem (extension stripped).

### 6. Markdown form written
The `imageNode.create({ src, alt })` where `src = '<uploadsDir>/<filename>'` — e.g., `src="uploads/screenshot.png"`. This is a **root-relative** path (no leading `/`), resolved by the browser against the current page URL base.

### 7. Upload UX — placeholder + error handling
- Skeleton widget with `role="status"` + `aria-label="Uploading image..."`.
- `.ProseMirror img.ProseMirror-selectednode` adds outline via `globals.css`.
- `sonner@^2.0.7` for toast notifications on upload error.
- Added `Placeholder` extension (likely orthogonal to images — unrelated editor polish).

### 8. Dependencies added
- **app:** `@tiptap/extension-file-handler`, `sonner`.
- **server:** `busboy`, `@types/busboy`, `file-type`, `sirv` (already present via Vite plugin, now also in CLI path).
- Core: new constant file `packages/core/src/constants/upload.ts` exporting the MIME allowlist.

## Deltas vs the target spec design

| Dimension | PR #41 | Target spec | Action |
|---|---|---|---|
| Storage location | Single flat `<uploadsDir>/` | Sibling of editing `.md` | **CHANGE** |
| Config schema | Adds `content.uploadsDir` | Unchanged include/exclude; extension allowlist hardcoded (or in default config) | **CHANGE** — remove `uploadsDir` OR redefine its meaning |
| Inclusion mechanism | Parallel sirv namespace bypassing content-filter | Filter reinterpretation: auto-include non-md assets matched by allowlist in dirs with included `.md` | **CHANGE** — requires filter work |
| Serving path | Dedicated `/${uploadsDir}/*` middleware | `/api/asset/*path` read-through OR content-dir static mount | **LIKELY CHANGE** — needs D9 decision |
| Allowlist location | MIME types in `@core/constants/upload.ts` | Extension allowlist (discussed). MIME-based is also viable. | **REFINE** — reconcile MIME vs ext |
| Filename collision | Numeric suffix (up to 99) | Locked D8 (a): numeric suffix for drops; (b) timestamp stem for pastes | **MINOR** — add paste-specific naming |
| Upload transport | multipart/busboy | D10 lean: multipart | **KEEP** |
| Size cap | 10 MB server hard cap | D11: 10 MB reasonable default | **KEEP** |
| MIME magic-bytes check | Yes, via `file-type` | Not yet discussed but strong prior-art | **KEEP** (call out in spec as security invariant) |
| Editor surfaces | FileHandler onDrop/onPaste + slash `/image` | Aligned | **KEEP** |
| Placeholder UX | Skeleton widget via PM decoration | Not yet specified | **KEEP** (document as design precedent) |
| Error UX | Sonner toast | Not yet specified | **KEEP** |
| Reference path style | Root-relative `<uploadsDir>/<file>` | D7 lean (a): relative to editing `.md` | **CHANGE** — see bug below |
| MCP asset-write tool | Not present | D13: out of v1 | **ALIGNED** |
| Undo policy | File stays on disk | D14 lean (a): orphan-on-undo | **ALIGNED** |
| Move UI | Absent | D2: out of v1 | **ALIGNED** |

## Latent bug in PR #41 (needs confirm)

The editor inserts `![alt](uploads/screenshot.png)` — **root-relative without leading slash**. The browser resolves this relative to the current page URL. This works only when the editor renders content at URL path `/`. On the docs site (Fumadocs/Next.js), a page rendered at `/docs/guide` would resolve `uploads/screenshot.png` → `/docs/uploads/screenshot.png`, which does NOT exist (the sirv mount is at `/uploads/*` at root). Confirmed-by-inspection; needs a browser test to be 100% sure.

Fix options:
- Prepend `/` → absolute URL path. Works for editor + docs site both, but couples the markdown to the serving topology.
- Make the src sibling-relative to the `.md` (e.g., same-folder ⇒ just filename; parent-folder ⇒ `../`). Matches Hugo/Zola convention. Decouples markdown from serving.

## What this means for the spec

Most of the server-side heavy lifting exists. The spec's load-bearing decisions are mostly UNCHANGED by PR #41 — but the spec will drive a **rework of the storage model** (flat `uploadsDir` → sibling-of-editing-md), a **rework of inclusion** (parallel sirv namespace → content-filter reinterpretation with extension allowlist), and a **rework of the reference path** (root-relative → relative-to-editing-md). Upload transport, size cap, MIME verification, editor surfaces, placeholder UX can be preserved as-is.

This shifts the spec from "net new feature" to "retarget PR #41 to the sibling-co-located model." Scope is unchanged; implementation cost is lower than from zero.
