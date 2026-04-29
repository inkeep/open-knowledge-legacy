# CB-v2 — generalizable file-upload prop affordance

## §1 Problem

The CB-v2 lowercase media pivot (PR #310, in flight) has two parallel insertion paths for media:

1. **Legacy slash command** (`packages/app/src/editor/slash-command/items.ts:147-166`) — `name: 'image'`, calls `uploadAndInsert(file, editor, insertPos)`: opens file picker → POSTs to `/api/upload-image` → inserts an inline `image` PM node with the resolved URL. Great UX (one-click upload).
2. **Descriptor-driven slash menu** (`component-items.ts:202`) — iterates registered canonical descriptors and inserts an empty `<img />` componentBlock at the cursor. User then fills `src` via PropPanel by pasting a URL. No upload affordance.

The lowercase pivot's stance was "no two ways to do the same thing." This duplication contradicts that — and the descriptor path lacks the upload UX users expect from media insertion.

## §3 Goals

- **G1** Unify media insertion through the descriptor-driven slash menu. Delete the legacy `image` slash item.
- **G2** Generalize "this prop accepts a file upload" as a metadata declaration on `PropDef`, not a per-descriptor handler. Future descriptors (Frame v2 caption, video poster, custom integrations) reuse the same affordance.
- **G3** Generalize "focus this prop first when the panel opens" as a metadata declaration on `PropDef`. Removes per-component focus-imperatively-on-mount logic.
- **G4** Server endpoints support image, video, and audio uploads with the same atomic-write + MIME-validation discipline already in place for image.

## §5 User journeys

**Happy path — image insert with upload:**

1. User opens a markdown doc, types `/`, picks "Image" from slash menu.
2. Empty `<img />` componentBlock inserts at cursor.
3. PropPanel auto-opens; cursor lands in the `src` input (declared `autoFocus: true`).
4. User clicks the upload icon-button next to the URL field; native file picker opens, restricted to `accept` MIME types (`image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`).
5. User selects an image; client POSTs to `/api/upload-image`; server saves to `<contentDir>/uploads/` (or current convention) and returns `{ url: "uploads/foo-abc123.png" }`.
6. PropPanel writes the URL into the `src` prop. The `<img>` block now renders the uploaded image inline.

**Happy path — video / audio insert with upload:** identical flow, picks "Video" or "Audio" from slash menu, file picker is restricted to video/audio MIME types, server POSTs to `/api/upload-video` or `/api/upload-audio`.

**Happy path — paste URL instead of upload:** User clicks "Image", PropPanel opens, user pastes a URL into the `src` field. No upload triggered. Same insertion outcome.

**Failure path — upload rejected by MIME validation:** User picks a file that doesn't match the `accept` set (e.g., a `.pdf` for image upload). Server responds 400 with descriptive error. PropPanel surfaces a toast: `"Upload failed: file type not allowed (got application/pdf, expected image/*)"`. The `src` field remains empty; user can try again.

**Failure path — upload exceeds size limit:** Server enforces 10 MB cap (existing constant in `image-upload`). Response 413 with `"File too large (max 10 MB)"`. Toast surfaces; field remains empty.

**Failure path — network error during upload:** Fetch throws. PropPanel surfaces toast: `"Upload failed: network error"`. Loading spinner clears. Field remains empty.

## §6 Functional requirements

- **FR-1** `PropDefString` gains two new optional fields: `accept?: readonly string[]` (MIME types and/or `.ext` shortcuts; wildcards like `image/*` are valid per HTML spec) and `autoFocus?: boolean`.
- **FR-2** PropPanel's string-input control renders an upload icon-button alongside the text input when `accept` is set on the prop. The button opens a native `<input type="file">` with `accept={accept.join(',')}`.
- **FR-3** PropPanel's mount logic focuses the input for the prop where `autoFocus === true` (if any). Only the first such prop is auto-focused (deterministic).
- **FR-4** Upload mechanism: a single `uploadFile(file: File, accept: readonly string[]): Promise<{ url: string }>` helper at `packages/app/src/editor/image-upload/upload-file.ts` (or similar) routes to the right server endpoint based on the file's MIME type prefix (`image/` → `/api/upload-image`; `video/` → `/api/upload-video`; `audio/` → `/api/upload-audio`).
- **FR-5** Server: add `/api/upload-video` and `/api/upload-audio` endpoints mirroring `/api/upload-image`'s atomic-write + MIME validation discipline. New constants `ALLOWED_VIDEO_MIME_TYPES` and `ALLOWED_AUDIO_MIME_TYPES` in `packages/core/src/constants/upload.ts`.
- **FR-6** `htmlImgProps[0]` (`src`) carries `accept: ALLOWED_IMAGE_MIME_TYPES` and `autoFocus: true`. Same for `htmlVideoProps[0]` (`accept: ALLOWED_VIDEO_MIME_TYPES`) and `htmlAudioProps[0]` (`accept: ALLOWED_AUDIO_MIME_TYPES`).
- **FR-7** Upload state UX: while upload is in flight, the upload button shows a spinner and is disabled; on error, a toast appears (existing `sonner` toast lib) and the button returns to ready state; on success, the URL writes into the prop field.
- **FR-8** Delete the legacy `image` slash item at `packages/app/src/editor/slash-command/items.ts:147-166`. Slash menu shows only the 5 descriptor-driven entries (Accordion, Audio, Callout, Image, Video).
- **FR-9** `uploadAndInsert` (the legacy helper) — DELETE if no remaining callers; KEEP and refactor to call `uploadFile` internally if other consumers exist (e.g., drag-and-drop). Verify call sites first.

## §6.1 Non-functional requirements

- **NFR-1 (security)** Upload endpoints validate MIME against the per-endpoint allowlist (server-side, not just client-side `accept`). Reject with 400 on mismatch. The client `accept` is a UX hint only; never trust it for security.
- **NFR-2 (security)** File size cap of 10 MB on all three endpoints (matches existing image-upload constraint).
- **NFR-3 (atomic write)** All three endpoints use the existing atomic-write pattern (write to `.tmp` file, fsync, rename) so partial uploads can't corrupt content.
- **NFR-4 (filename collision)** Generate unique filenames with content-hash suffix (existing convention) to prevent overwrite of pre-existing uploads.
- **NFR-5 (test coverage)** Unit tests for `uploadFile` helper (MIME-prefix routing). PropPanel tests for the upload button affordance + autoFocus behavior. Server endpoint tests for video/audio mirroring image's existing test pattern.

## §8 Current state

- **`packages/core/src/constants/upload.ts`** — defines `ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml']` and `MAX_UPLOAD_BYTES = 10 * 1024 * 1024`.
- **`packages/server/src/api-extension.ts:4151-4270`** — `handleUploadImage` server endpoint. Uses `fileTypeFromBuffer` for MIME validation, atomic write via `wx` flag, returns `{ url }`.
- **`packages/app/src/editor/image-upload/index.ts:104-181`** — `uploadAndInsert(file, editor, insertPos)` helper. Adds skeleton decoration plugin, POSTs to `/api/upload-image`, inserts inline `image` PM node.
- **`packages/app/src/editor/slash-command/items.ts:147-166`** — legacy `image` slash item that calls `uploadAndInsert`. **Out-of-scope post-pivot**.
- **`packages/app/src/editor/components/PropPanel.tsx`** — auto-renders prop controls. Switch on PropDef.type: `string→Input`, `boolean→Switch`, `enum→select`, `number→Input`, `reactnode→hidden`. ~221 lines. No focus-management or upload affordance today.
- **`packages/core/src/registry/types.ts`** — PropDef discriminated union (`string | boolean | number | enum | reactnode`). PropDefBase has `name`, `description?`, `required?`, `defaultValue?`, `hidden?`, `advanced?` (PR #310 just added `advanced`). Symmetric place to add `autoFocus`.
- **`packages/core/src/registry/built-ins.ts`** — `htmlImgProps`/`htmlVideoProps`/`htmlAudioProps` arrays. `htmlImgProps[0]` is the `src` prop (string, required).

## §9 Proposed solution

### Type extension (PropDefString only)

```ts
// packages/core/src/registry/types.ts
interface PropDefStringExtra {
  /** Allowed MIME types for file upload. When set, the panel input renders an
   *  upload affordance alongside the URL field. Joined to comma-string at the
   *  `<input accept>` boundary; MIME wildcards (`image/*`) and `.ext` shortcuts
   *  are both valid per the HTML spec. (See: MDN Web/HTML/Element/input/file#accept) */
  accept?: readonly string[];
  /** When the prop panel opens, focus this prop's input first. Mirrors the
   *  React DOM `autoFocus` convention. Only one prop per descriptor should set
   *  this; first match wins if multiple. */
  autoFocus?: boolean;
}
```

These are added to `PropDefString` only — `PropDefBoolean`, `PropDefNumber`, `PropDefEnum`, `PropDefReactNode` don't accept files or auto-focus URL-style inputs.

### Upload helper

```ts
// packages/app/src/editor/image-upload/upload-file.ts (new)
export interface UploadResult { url: string }

const ENDPOINT_BY_MIME_PREFIX: Record<string, string> = {
  'image/': '/api/upload-image',
  'video/': '/api/upload-video',
  'audio/': '/api/upload-audio',
};

/** Upload a file via the appropriate endpoint inferred from the file's MIME
 *  type prefix. The `accept` arg is a UX hint only — final MIME validation
 *  happens server-side. Returns the resolved relative URL on success. Throws
 *  on failure (caller surfaces toast). */
export async function uploadFile(
  file: File,
  accept: readonly string[],
): Promise<UploadResult> { ... }
```

Endpoint resolution: take the file's `type` (browser-reported MIME), match against `ENDPOINT_BY_MIME_PREFIX`. If no match, throw with a descriptive error. The `accept` hint is informational (the helper doesn't re-validate; server does).

### Server endpoints

`/api/upload-video` and `/api/upload-audio` are clones of `/api/upload-image` with different MIME allowlists:

```ts
// packages/core/src/constants/upload.ts
export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/ogg'];
export const ALLOWED_AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'];
```

Same atomic-write, same content-hash filename, same 10 MB cap.

### PropPanel UI

When rendering the string PropControl:

```tsx
function StringPropControl({ propDef, value, onChange, onUploadError }) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="flex gap-1">
      <Input value={value ?? ''} onChange={...} autoFocus={propDef.autoFocus} />
      {propDef.accept && (
        <UploadButton
          accept={propDef.accept}
          onUpload={(url) => onChange(url)}
          onError={onUploadError}
          uploading={uploading}
          setUploading={setUploading}
        />
      )}
    </div>
  );
}
```

The hidden file input is mounted inside `UploadButton`; clicking the button triggers a programmatic click on the file input.

### autoFocus

PropPanel's render: walk `descriptor.props`; the FIRST string prop with `autoFocus === true` gets `autoFocus={true}` on its underlying `<Input>`. React DOM handles the actual focus-on-mount.

### Cleanup

Delete `items.ts:147-166`. Verify `uploadAndInsert` callers — if none remain after the deletion, delete the helper itself; if drag-and-drop or paste-image is still using it, refactor to call `uploadFile` internally.

## §10 Decision log

- **D1 LOCKED `accept?: readonly string[]`** (not `string`). Schema-level convention is array (BlockNote's `fileBlockAccept: string[]`); HTML attribute boundary is comma-string (`<input accept="...">`). Join with `.join(',')` at the `<input>` site. Array is more TS-ergonomic and matches the survey of editor-framework prior art.
- **D2 LOCKED `autoFocus?: boolean`** (not `primary`, not `firstEdit`). Matches React DOM convention exactly ("focus on mount"); avoids overload with Storybook's "primary story" sense and design-system "primary action button" sense.
- **D3 LOCKED accept on PropDefString only**. PropDefBoolean/Number/Enum/ReactNode don't accept files; adding the field on the base type would invite misuse.
- **D4 LOCKED upload pipeline at the editor-context layer, not on PropDef**. PropDef declares the constraint (`accept`); the upload mechanism is a separate `uploadFile()` helper. Don't put `onUploadProgress` / `onUploadError` callbacks on PropDef — that conflates metadata with behavior. (BlockNote's pattern; matches research recommendation.)
- **D5 LOCKED MIME-prefix routing in the helper**. The helper picks the endpoint based on `file.type.startsWith('image/' | 'video/' | 'audio/')`. Keeps the public surface single-purpose; adding new media types later is a one-line change.
- **D6 NOT NOW `acceptDescription?: string`** (human-readable picker hint). None of BlockNote, Storybook, TipTap, TinaCMS provide one. Browsers render their own picker hint from `accept`. Skip until proven necessary.
- **D7 LOCKED delete legacy `image` slash item**. The descriptor-driven slash menu post-FR-2 covers the same UX (insert + auto-focus + upload) without the duplication. Lowercase pivot's stance carried over: no two ways to do the same thing.
- **D8 LOCKED trim the Convert button + `convertibleTo` machinery from compat descriptors**. The Convert UX leaks the canonical/compat distinction to users who don't have a vocabulary for it (a user who wrote `> [!NOTE]` sees a styled Callout in WYSIWYG and reads "Convert to Callout" — *"to what? It's already a Callout"*). Compat descriptors keep their *only* essential job — round-trip identity preservation across edit cycles — and lose the upgrade-shortcut UI. The post-trim user-facing model: the canonical/compat distinction becomes a pure implementation detail the user never sees. Authoring path determines descriptor identity (markdown → compat; slash menu → canonical); each path serializes back to its authored form on save. A user who outgrows compat features deletes-and-reinserts via slash menu — same friction as adding any other block. This is an architectural cleanup: ~80-100 LoC removed, the conceptual surface tightens, and the "no two ways to do the same thing" stance from the lowercase pivot extends to in-place upgrades. **Reverse direction (canonical→compat) was already out of scope** in §11 of the cb-v2-md-foundation spec; this trim removes the forward direction (compat→canonical) for symmetry and conceptual cleanliness.

## §11 Non-goals

- **NG1** **Drag-and-drop file insertion is OUT OF SCOPE**. The dnd path may already exist via `@tiptap/extension-file-handler` or paste handlers — that's separate from the slash-menu insertion flow this spec covers. If drag-and-drop currently routes through `uploadAndInsert`, it will be refactored in FR-9 to call `uploadFile` internally.
- **NG2** **Multi-file upload (selecting many files at once)** — out of scope. The file picker is single-file. Future enhancement could allow `<input type="file" multiple>` for `srcset` auto-generation.
- **NG3** **Progress bars / percent indicators** — out of scope. Loading spinner is sufficient feedback; upload sizes are bounded at 10 MB.
- **NG4** **Cloud storage / S3 / external URL signing** — out of scope. Uploads land in the project's content directory via the existing atomic-write pattern.
- **NG5** **Custom upload endpoints per-descriptor** (e.g., letting a descriptor declare its own endpoint URL) — out of scope. The MIME-prefix routing in the helper covers all current and foreseeable cases.
- **NG6** **PropDef-level upload progress / error callbacks** — explicit decision (D4). The PropPanel UI manages local upload state.
- **NG7** **Refactoring drag-and-drop / paste-image** — separate spec if needed. This spec focuses on the slash-menu insertion path.

## §13 Deployment / rollout

Greenfield posture (no migrations). Pre-existing content with manually-typed `<img src="https://...">` URLs is unaffected — they round-trip byte-identically. The new upload affordance is purely additive on the prop-edit side.

CI gates (existing): `bun run check` (lint + typecheck + unit + integration + fidelity). Bundle-size limit is unaffected — additions are small.

Verification: post-merge manual smoke (open `showcase/02-image.mdx`, click an `<img>`, verify upload icon appears in PropPanel `src` field, click it, upload a real PNG, verify URL fills, verify file lands in `<contentDir>/uploads/` or wherever the existing image upload writes).
