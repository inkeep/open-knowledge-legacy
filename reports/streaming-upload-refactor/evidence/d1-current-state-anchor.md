# Evidence: D1 — Current-state anchor

**Dimension:** Current-state anchor — the exact surface being replaced
**Date:** 2026-04-22
**Sources:** Open Knowledge repo at HEAD on `finalize/asset-embed-surface` (commits `56e77846`..`82082e6c`)

---

## Key files / references

- `packages/server/src/api-extension.ts:410` — `readUploadBody(req, maxBytes)` — busboy-wrapped multipart reader that accumulates the entire file into a `Buffer[]` then `Buffer.concat`s to materialize.
- `packages/server/src/api-extension.ts:414` — busboy config: `limits: { fileSize: maxBytes, files: 1 }`.
- `packages/server/src/api-extension.ts:436` — the load-bearing buffer pattern: `chunks.push(chunk)`.
- `packages/server/src/api-extension.ts:469` — `Buffer.concat(chunks)` materializes the whole file in memory at `'finish'`.
- `packages/server/src/api-extension.ts:281` — `findDuplicateAsset(destDir, sha, expectedSize)` — scans the destDir, reads candidate files, hashes them, compares. Currently called AFTER the upload buffer is materialized.
- `packages/server/src/api-extension.ts:373` — `writeUploadAtomic(destDir, sanitized, buffer)` — takes a `Buffer`, writes tmp, renames. Signature requires a materialized buffer today.
- `packages/server/src/api-extension.ts:188` — `sanitizeFilename(name)` — pure string function, unaffected by buffer vs stream shape.
- `packages/server/src/api-extension.ts:3279` — `uploadResult = await readUploadBody(req, maxBytes)` — sole call site in the handler.
- `packages/server/src/api-extension.ts:3311–3360` — path-escape guard sequence (`isWithinContentDir` + `realpath`) — runs on the destination path, independent of buffer shape.
- `packages/server/src/api-extension.ts:3400` — `findDuplicateAsset(destDir, sha, buffer.length)` call site: dedup happens AFTER the buffer is in memory.
- `packages/cli/src/config/schema.ts:41, :63, :68` — `DEFAULT_MAX_UPLOAD_BYTES` + `maxBytes: z.number().int().min(0).default(...)` in `UploadConfigSchema`.
- `packages/app/src/editor/image-upload/index.ts:181, :273, :338, :341, :346` — client-side `maxBytes` consumption: config type, rejection toast, byte-size formatting for P1.3.

---

## Findings

### Finding: The current upload path buffers the entire request body into a single allocated `Buffer` before any write or hash.
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/api-extension.ts:410-472`

```ts
function readUploadBody(req: IncomingMessage, maxBytes: number): Promise<UploadResult> {
  return new Promise((resolveP, reject) => {
    let bb: ReturnType<typeof busboy>;
    try {
      bb = busboy({ headers: req.headers, limits: { fileSize: maxBytes, files: 1 } });
    } catch (err) { reject(err); return; }
    // ...
    const chunks: Buffer[] = [];
    let exceeded = false;
    // ...
    bb.on('file', (_fieldname, file, info) => {
      // ...
      file.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      file.on('limit', () => {
        exceeded = true;
        req.unpipe(bb);
        if (!settled) { settled = true; reject(new Error('Payload too large')); }
      });
      // ...
    });
    bb.on('finish', () => {
      // ...
      resolveP({ filename, mimeType, buffer: Buffer.concat(chunks), parentDocName });
    });
  });
}
```

**Implications:**
- Memory footprint during upload = O(fileSize). A 1 GB upload allocates ~1 GB in the Node heap.
- `limits.fileSize = maxBytes` is a memory-safety backstop. Without it, busboy lets the body grow unbounded.
- Default Node heap is ~1.5–2 GB, so any upload within a few hundred MB of that will crash the server process on OOM.
- This is the sole OOM guard; removing it without streaming means pathological uploads take the server down.

### Finding: Dedup reads the full buffer to compute sha256 AFTER the buffer is materialized; it doesn't require streaming hashing.
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/api-extension.ts:3400` (call site), `:244-246` (`sha256Hex` helper), `:281-371` (`findDuplicateAsset` scan loop).

```ts
const existing = findDuplicateAsset(destDir, sha, buffer.length);
```

`sha256Hex(buf: Buffer)` calls `createHash('sha256').update(buf).digest('hex')` on the materialized buffer. Streaming refactor must compute the same hash during the stream so dedup can be consulted BEFORE the temp file is finalized.

**Implications:** Streaming refactor needs hash-during-stream (`Transform` or `.update(chunk)` fed from `data` events). Dedup lookup is a hot path — it runs on every upload; streaming must not add latency there.

### Finding: `writeUploadAtomic` currently takes a `Buffer`, not a path.
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/api-extension.ts:373`

```ts
function writeUploadAtomic(destDir: string, sanitized: string, buffer: Buffer): string {
```

**Implications:** Signature changes to `writeUploadAtomic(destDir, sanitized, tempPath)` OR a companion `finalizeFromTemp(tempPath, destDir, sanitized)` helper. Either way it becomes a rename + fsync, not a write + rename.

### Finding: Path-escape guards, `sanitizeFilename`, and config loading are orthogonal to buffer-vs-stream shape.
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/api-extension.ts:3311-3360` — all guards operate on the `destDir` and `finalFilename` strings; they never touch the payload bytes.

**Implications:** The refactor touches `readUploadBody`, `writeUploadAtomic`, `findDuplicateAsset` call ordering, and (if `maxBytes` removal lands) the config schema + client toast code. Everything else (sanitize, path-escape, realpath, SVG sniff) stays byte-identical.

---

## Gaps / follow-ups

- Whether `writeUploadAtomic` should be refactored to accept a tempPath vs deleted in favor of inline rename — depends on streaming primitive choice (D3).
- Whether the dedup flow should invert to "hash first, then rename temp→final OR rename temp→dedup-match-path" — depends on dedup-integration strategy (D7).

Both resolved in later dimensions.
