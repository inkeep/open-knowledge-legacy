---
"@inkeep/open-knowledge": minor
---

Image upload + asset resolution: sibling-co-located storage, filter reinterpretation, shortest-path hybrid references, SVG support.

- **Storage**: Uploaded images land as siblings of the editing `.md` file (not a flat `uploads/` dir). Multiple `.md` files can reference the same image via relative paths.
- **Config**: `content.uploadsDir` removed. `content.include`/`content.exclude` schema unchanged — interpretation extended so allowlisted asset extensions (`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`) in directories containing ≥1 included `.md` file are auto-included. `exclude`/gitignore continues to supersede.
- **Serving**: Filter-aware `sirv` middleware over `contentDir` (both dev plugin and standalone CLI). Filter-excluded paths return 404. `X-Content-Type-Options: nosniff` preserved.
- **References**: Editor inserts bare filename for sibling uploads (`![](screenshot.png)`). New `shortestImageRef(assetPath, mdPath)` helper returns bare filename when co-located, else root-relative-with-leading-slash.
- **SVG**: Now accepted at upload — consistent with the storage-fidelity precedent. Rendered via `<img src>` only; inline `<svg>` embedding remains unsupported in the editor.
- **Security**: Upload endpoint requires `parentDocName` form field, normalizes it (rejects absolute paths, `..` segments, NUL), verifies destination is `isWithinContentDir`, and checks `realpathSync` on the destination directory to defeat symlink escape. Existing magic-bytes MIME check, 10 MB cap, atomic `openSync('wx')` write, and numeric-suffix collision retry preserved.
- **Paste naming**: Clipboard pastes without a meaningful filename synthesize `pasted-YYYYMMDD-HHMMSS.<ext>`.
- **Supersedes**: #41 (Sarah's original PR — every preserved contribution kept; three load-bearing decisions reworked per the spec).
