---
"@inkeep/open-knowledge-app": patch
---

fix(app): serve `/api/config` from the Vite dev plugin so `bun run dev` no longer relies on the 404 → same-origin fallback to resolve the collab URL. Matches the exact response shape served by `ok ui` in production (`{collabUrl, previewUrl, port}` with `cache-control: no-store` + `x-content-type-options: nosniff`). Eliminates the expected-but-alarming 404 in the dev Network tab and closes a timing race where an initial hash-nav could fire before `collabUrl` resolved, leaving the editor stuck at `EditorSkeleton`. Client-side 404 → absent → same-origin fallback is retained as defense-in-depth.
