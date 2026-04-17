---
"@inkeep/open-knowledge": patch
---

Exclude `dist/**/*.map` from the published npm tarball. Source maps ship full TypeScript source via `sourcesContent`; dropping them from the tarball keeps maps available locally for debugging while the published package is ~46% smaller (3.9 MB → 2.1 MB, 1284 → 660 files).
