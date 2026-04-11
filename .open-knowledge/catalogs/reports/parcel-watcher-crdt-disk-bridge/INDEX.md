---
title: parcel-watcher-crdt-disk-bridge
description: ""
generated: true
schema_version: 1
---

## Articles

- **[@parcel/watcher for Bidirectional Disk-CRDT Sync: Source-Level Implementation Analysis](reports/parcel-watcher-crdt-disk-bridge/REPORT.md)** — Deep technical analysis of using @parcel/watcher to detect external file changes (VS Code, Cursor) and sync them into a Hocuspocus + Yjs CRDT editor. Covers the FSEvents backend, content-hash feedback loop prevention with race condition analysis, Hocuspocus document lifecycle for force-loading, updateYFragment minimal-diff behavior, concurrent edit clobber scenarios, frontmatter handling, file create/delete lifecycle, editor save patterns, and performance at 1000-file scale.

## Subfolders

- **[evidence](.open-knowledge/catalogs/reports/parcel-watcher-crdt-disk-bridge/evidence/INDEX.md)** (6 articles)
