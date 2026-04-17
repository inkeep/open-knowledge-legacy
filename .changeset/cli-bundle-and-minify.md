---
"@inkeep/open-knowledge": patch
---

Bundle and minify the published CLI. `tsdown` now produces two minified bundles (`dist/cli.mjs` for the `bin`, `dist/index.mjs` for the `exports` field) with third-party deps inlined, replacing the previous 148-file unbundled output. Native addon deps (`@parcel/watcher`, `chokidar`, `simple-git`) stay external so their `.node` binaries resolve at runtime. Tarball drops from 2.1 MB → 1.6 MB packaged and 660 → 40 files.
