# Evidence: D6 — Error paths

**Dimension:** How to classify and respond to disk-full, aborted uploads, malformed multipart, network truncation in a streaming upload pipeline.
**Date:** 2026-04-22
**Sources:** Node.js docs, multer, @fastify/multipart, formidable, OK's existing error union.

---

## Key findings

### Finding: `ENOSPC` / `EDQUOT` surface as `err.code` on writeStream `'error'`.
**Confidence:** CONFIRMED
**Evidence:** Node `fs` docs + OK's existing handling at `packages/server/src/api-extension.ts:391-397`.

OK already classifies:
- `ENOSPC` / `EDQUOT` → `storage-full` → HTTP 507 (Insufficient Storage, RFC 4918)
- `EROFS` / `EACCES` / `EPERM` → `storage-readonly` → HTTP 500
- Other write errors → `storage-error` → HTTP 500

The `UploadWriteError` union at `api-extension.ts:3485-3493` picks the HTTP status from the error reason. **This classifier is streaming-refactor-compatible** — the refactor only changes where the error surfaces (pipeline's rejection vs `fs.writeSync` catch), not the semantics.

### Finding: Node 18+ client-abort detection: `req.on('close')` + `!req.complete`.
**Confidence:** CONFIRMED
**Evidence:** [nodejs.org/api/http.html#messagecomplete](https://nodejs.org/api/http.html)

`request.aborted` is deprecated since v17.0.0. The canonical pattern is:

```js
req.on('close', () => {
  if (!req.complete) {
    // client disconnected mid-request
  }
});
```

`req.destroyed` = true once `.destroy()` called. `message.complete` = true only after full body parsed. `'close'` + `!req.complete` is the disconnect signal.

**Cleanup:** `stream.pipeline()` handles most of it — when `req` emits `'close'` without `'end'`, pipeline propagates an error through the chain, destroying the writeStream. Tempfile remains on disk → consumer must `unlink` in catch/finally.

### Finding: formidable's `setTimeout(unlink, 1)` pattern avoids Windows EBUSY on abort.
**Confidence:** CONFIRMED
**Evidence:** formidable `src/PersistentFile.js` `destroy()` method.

The 1ms delay lets the writeStream fully close before unlink. With `pipeline()` + `await`, this race is already handled — `pipeline()`'s promise only resolves/rejects after all streams close. Subsequent `unlinkSync` is safe without the timeout.

### Finding: busboy malformed-multipart surfaces via `bb.on('error')`.
**Confidence:** CONFIRMED
**Evidence:** OK already wires this at `api-extension.ts:473`. Per busboy issue [#377](https://github.com/mscdex/busboy/issues/377) (Dec 2025, open), nested Multipart parser error emission has "undefined behaviour" edge cases — treat any `bb` error as terminal; stop reading.

HTTP response: **400** with kebab-case `error: 'malformed-upload'`.

### Finding: `stream.pipeline()` unifies error propagation across the whole chain.
**Confidence:** CONFIRMED
**Evidence:** [nodejs.org/api/stream.html](https://nodejs.org/api/stream.html) — pipeline "automatically handles errors across the entire chain" and "cleans up resources." Each stream's `'error'` triggers destruction of all other streams in the pipeline.

For the streaming refactor:
```ts
try {
  await pipeline(fileStream, hashingTransform, writeStream);
} catch (err) {
  try { unlinkSync(tempPath); } catch { /* best-effort */ }
  throw classify(err);  // existing UploadWriteError union
}
```

---

## Error classification table (refactor target)

| Error class | Detection | HTTP status | Error code (kebab-case) | Cleanup |
|---|---|---|---|---|
| ENOSPC / EDQUOT | `writeStream` error with code | 507 | `storage-full` | unlink tempfile |
| EROFS / EACCES / EPERM | `writeStream` error with code | 500 | `storage-readonly` | unlink tempfile |
| Other write error | `writeStream` error, unknown code | 500 | `storage-error` | unlink tempfile |
| Size limit exceeded (if retained as internal guard) | `file.on('limit')` from busboy | 413 | `payload-too-large` (internal — not user-facing if maxBytes config removed) | unlink tempfile, `req.unpipe(bb)` |
| Client aborted | `req.on('close')` + `!req.complete` | (no response — socket gone) | n/a | unlink tempfile |
| Malformed multipart | `bb.on('error')` | 400 | `malformed-upload` | unlink tempfile |
| Collision exhaustion (existing) | 99 link attempts failed | 500 | `collision-exhaustion` | unlink tempfile |

All codes are kebab-case per OK's existing convention.

---

## Comparison with peer libraries

- **multer** routes request-error cleanup through `storage._removeFile(req, file, cb)`. 
- **@fastify/multipart** routes through `onResponse` hook + `cleanRequestFiles()`.
- **formidable** listens for the request's `'aborted'` event directly; also handles Windows EBUSY via 1ms setTimeout.

OK's target pattern — `try/pipeline/finally/unlink` with typed `UploadWriteError` classification — combines the cleanest elements: `pipeline()`'s automatic stream destruction (from @fastify/multipart) + typed error union (custom OK convention, already in place) + explicit `unlinkSync` in finally (simpler than setTimeout-based delay, safe given `pipeline()`'s await semantics).

---

## Key files / references

- Node.js docs: https://nodejs.org/api/stream.html, https://nodejs.org/api/http.html
- busboy issue #377: https://github.com/mscdex/busboy/issues/377
- OK internal: `packages/server/src/api-extension.ts:391-397, :3485-3493, :473`

---

## Gaps / follow-ups

- **busboy `'file'` must-consume rule + size-limit path.** If the file stream hits `limits.fileSize`, `file.on('limit')` fires, but the file stream still has buffered bytes upstream (inside busboy). OK's current handler does `req.unpipe(bb)` on limit — the refactor preserves this, and `pipeline()` handles the writeStream cleanup when `file.destroy(err)` is called. Integration test: "upload 26MB against a 25MB limit → assert 413 + no tempfile left behind."
- **Testing matrix.** The refactor's test file (`packages/server/src/api-extension.test.ts`) already exercises ENOSPC, EACCES, and 99-collision exhaustion. Streaming refactor adds:
  - "Client aborts mid-upload" — assert tempfile cleaned up.
  - "Malformed multipart" — assert 400 + `malformed-upload` code + tempfile cleaned.
  - "ENOSPC during stream" — assert 507 + `storage-full` + tempfile cleaned.
- **No evidence reviewed for `node:http2` / `uWebSockets.js`.** Not applicable — OK uses Hocuspocus's WebSocket + node:http.
