---
title: Persistence layer nested path support
sources:
  - packages/server/src/persistence.ts
  - packages/server/src/file-watcher.ts
  - packages/server/src/persistence.test.ts
  - packages/server/src/file-watcher.test.ts
---

## safeContentPath — already supports nested docNames

`safeContentPath('sub/nested', contentDir)` → `resolve(contentDir, 'sub/nested.md')`.
Test on persistence.test.ts:28 confirms this.

Path traversal protection: validates `filePath.startsWith(\`${contentDir}/\`)`.

## pathToDocName — inverse mapping works for nested paths

`pathToDocName('/app/content/docs/guide.md', '/app/content')` → `'docs/guide'`.
Test on file-watcher.test.ts:122 confirms this.

Uses `relative()` + strips `.md` — perfect inverse.

## File watcher watches recursively

- `seedLastKnownHashes()` (file-watcher.ts:289-308) recursively walks subdirs
- `@parcel/watcher` watches recursively by default
- `classifyEvents()` uses `pathToDocName()` consistently for all event types

## CRITICAL BUG: onStoreDocument missing mkdir for nested paths

persistence.ts line 363:
```typescript
await writeFile(tmpPath, markdown, 'utf-8');
```
Node.js `writeFile` throws ENOENT if parent directory doesn't exist.
First save of a nested doc like `articles/my-doc` fails.

**Fix needed:** Add `await mkdir(dirname(filePath), { recursive: true })` before writeFile.

The rescue buffer code already does this correctly (standalone.ts:305, 527):
```typescript
mkdirSync(dirname(rescuePath), { recursive: true });
```
