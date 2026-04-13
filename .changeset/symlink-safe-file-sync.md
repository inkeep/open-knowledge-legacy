---
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge": minor
---

feat: symlink-safe file sync

Symlinks inside the content directory are now fully supported. The file watcher indexes documents by canonical path (`realpath`), deduplicating aliases that point to the same file into a single Y.Doc. Persistence writes target the canonical path so atomic rename never breaks symlink chains. Symlinks that escape the content directory are refused, cyclic symlinks are rejected, and broken symlinks fall back to direct writes. The `/api/documents` endpoint surfaces alias metadata (`isSymlink`, `canonicalDocName`, `targetPath`), and the file sidebar renders a Link2 badge with a hover tooltip for symlinked entries.
