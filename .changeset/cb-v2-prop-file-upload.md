---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge-app": minor
---

feat(cb-v2): generalizable file-upload prop affordance + legacy image-slash removal

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
