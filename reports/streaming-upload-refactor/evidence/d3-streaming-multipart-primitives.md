# Evidence: D3 — Streaming multipart primitives

**Dimension:** Which multipart library fits a Bun 1.3 + Hocuspocus + Node.js stack for streaming uploads. Compare busboy (current), multer, @fastify/multipart, formidable, Bun native.
**Date:** 2026-04-22
**Sources:** Library READMEs, source code, official docs, GitHub issues.

---

## Key files / references

- busboy: https://github.com/mscdex/busboy — README + issues #375, #377
- multer: https://github.com/expressjs/multer — `storage/disk.js`
- @fastify/multipart: https://github.com/fastify/fastify-multipart — README + `index.js`
- formidable: https://github.com/node-formidable/formidable — `src/File.js` / `PersistentFile.js`
- Bun docs: https://bun.sh/docs/api/fetch — "Response buffering"
- OK current state: `packages/server/src/api-extension.ts:410-482`

---

## Findings

### Finding: busboy's `file` event emits a Readable stream — it's already streaming-native.
**Confidence:** CONFIRMED
**Evidence:** [busboy README](https://github.com/mscdex/busboy) — `'file'` event callback documented as `(fieldname, stream, info) => ...` where "`stream` is a Readable stream containing the file's data."

Canonical README example:

```js
bb.on('file', (name, file, info) => {
  const saveTo = path.join(os.tmpdir(), `busboy-upload-${random()}`);
  file.pipe(fs.createWriteStream(saveTo));
});
```

**Implications:** OK's current handler at `packages/server/src/api-extension.ts:410-482` is a regression on busboy's intended API — it calls `file.on('data', chunk => chunks.push(chunk))` and `Buffer.concat` in `'finish'` instead of piping. The refactor returns to idiomatic busboy.

### Finding: busboy's must-consume rule requires drain-on-reject.
**Confidence:** CONFIRMED
**Evidence:** busboy README: "If you listen for this event, you should always consume the `stream` whether you care about its contents or not (you can simply do `stream.resume();` if you want to discard/skip the contents), otherwise the `'finish'`/`'close'` event will never fire on the busboy parser stream."

**Implications:** After a mid-stream rejection (size limit, quota), the file stream must still be drained (`stream.resume()`) OR `req.unpipe(bb)` must tear down the pipe. OK's current handler correctly does `req.unpipe(bb)` on `file.on('limit')` (line 441). The refactor preserves this.

### Finding: busboy `limits.fileSize` emits a `'limit'` event; `stream.truncated` flips true.
**Confidence:** CONFIRMED
**Evidence:** busboy README. OK already wires this at `api-extension.ts:439-446`.

### Finding: busboy is Bun-compatible (issue #12074 closed) and actively maintained.
**Confidence:** CONFIRMED
**Evidence:** [oven-sh/bun#12074](https://github.com/oven-sh/bun/issues/12074) — "Compatibility with busboy (11M download)" — closed Apr 2025, no blocking bug. Busboy issues from Dec 2025 show active triage (e.g., #377).

**Caveat:** Issue [mscdex/busboy#377](https://github.com/mscdex/busboy/issues/377) (Dec 2025) — "Emitting 'error' from Multipart is undefined behaviour." Suggests error-path discipline matters: route errors through `bb.on('error', ...)` and file stream's `'error'` / `'limit'` events, not custom propagation.

### Finding: multer's `storage/disk.js` is reference implementation for "pipe to disk."
**Confidence:** CONFIRMED
**Evidence:** [multer storage/disk.js](https://github.com/expressjs/multer/blob/master/storage/disk.js)

`_handleFile(req, file, cb)` contract:
1. Resolve `destination` (default: `os.tmpdir()`) and `filename` (default: `crypto.randomBytes(16).toString('hex')`).
2. Open `fs.createWriteStream(path.join(destination, filename))`.
3. `file.stream.pipe(outStream)`.
4. Wire `outStream.on('error', cb)` and `outStream.on('finish', () => cb(null, {destination, filename, path, size: outStream.bytesWritten}))`.

`_removeFile(req, file, cb)` → `fs.unlink(file.path, cb)`, called by multer core on request error.

**Caveats for OK:**
- Multer is Express-middleware-shaped. OK uses Hocuspocus's bare `onRequest` hook on `node:http.IncomingMessage`. Adopting multer requires Express or reimplementing `StorageEngine` invocation — which ends up identical to "use busboy directly."
- Multer wraps busboy. No gain; extra indirection.
- v2.0.0 Jan 2025 after multi-year stagnation. In maintenance mode.

### Finding: @fastify/multipart is the cleanest reference implementation for `pipeline()` + cleanup hook.
**Confidence:** CONFIRMED
**Evidence:** [fastify-multipart](https://github.com/fastify/fastify-multipart) README + `index.js:9, 15, 537-569`

```js
const { pipeline: pump } = require('node:stream/promises')
const filepath = path.join(tmpdir, generateId() + path.extname(part.filename || ('file' + i++)))
const target = fs.createWriteStream(filepath)
await pump(part.file, target)
```

Auto-cleanup:
```js
fastify.addHook('onResponse', async (request) => { await request.cleanRequestFiles() })
```

**Caveat for OK:** Fastify-only. Adopting would swap HTTP frameworks — out of scope. **But the pattern (`pipeline(part.file, writeStream)`) is the canonical reference.** OK should emulate it with busboy.

### Finding: formidable writes to disk by default; has built-in `hashAlgorithm: 'sha256'`.
**Confidence:** CONFIRMED
**Evidence:** formidable README + `src/PersistentFile.js`

`PersistentFile.open()` creates the write stream; `write(buf)` updates any attached hash then `writeStream.write(buf)`; `destroy()` calls `writeStream.destroy()` then `setTimeout(() => fs.unlink(filepath), 1)` (1ms delay to let stream close).

`options.hashAlgorithm: 'sha256'` auto-attaches a per-chunk hash. Stored on `file.hash`. This is exactly the "on-the-fly SHA-256" pattern.

**Caveat:** New dep (~35 KB + types). Given OK already has busboy, this is strictly additive; the pattern (Pattern A in D4) can be implemented with 10 lines against busboy.

### Finding: Bun `Request.formData()` buffers the body to memory — NOT suitable for streaming refactor.
**Confidence:** CONFIRMED
**Evidence:** [Bun docs — Response buffering](https://bun.sh/docs/api/fetch)

Bun docs list `response.formData(): Promise<FormData>` alongside `.text()`, `.json()`, `.arrayBuffer()`, `.blob()`, `.bytes()` under the heading "Response buffering" — "the fastest way to read the response body."

`File.stream()` returns a `ReadableStream<Uint8Array>` that reads from the already-buffered bytes; it does not backpressure the incoming wire. Switching to `Bun.Request.formData()` would keep OK in the "materialize entire upload in memory" failure mode, just via a different code path.

**Implications:** Bun native FormData is wrong for this refactor. Keep busboy.

---

## Comparison matrix

| Library | Memory | API shape (streaming) | Bun 1.3 OK? | New dep? | Recommendation |
|---|---|---|---|---|---|
| **busboy** (current) | Streaming via `'file'` event Readable | `bb.on('file', (_, stream) => stream.pipe(dest))` | Yes (issue #12074 closed) | No (already installed) | **Keep — minimal diff** |
| multer | Streaming (wraps busboy) | Express-middleware `StorageEngine._handleFile(req, file, cb)` | Yes | Yes + Express | No — wrapper tax |
| @fastify/multipart | Streaming (wraps busboy) | `pipeline(part.file, writeStream)` + `onResponse` cleanup | Yes | Yes + framework swap | No — but emulate the pattern |
| formidable | Streaming (default to disk) | `PersistentFile.write()` + `hashAlgorithm` option | Yes | Yes (~35 KB) | No — OK has busboy already |
| `Bun.Request.formData()` | **Buffered to memory** | `FormData.get(name).stream()` reads from already-buffered Blob | Native | No | No — wrong memory semantics |

---

## Recommendation

**Keep busboy.** The refactor is a one-handler rewrite inside `readUploadBody`: replace `file.on('data', chunks.push)` + `Buffer.concat(chunks)` with `stream.pipeline(file, hashTransform, writeStream)` (see D4 for the hash pattern). Zero new deps, smallest diff, inherits busboy's already-shipped `limits.fileSize` + `'limit'` event wiring. The `@fastify/multipart` source is the line-for-line reference — their `pump(part.file, target)` pattern becomes `pipeline(file, hashTransform, writeStream)` in OK. Multer / formidable / Bun native all either add deps, impose a framework, or regress memory semantics.

---

## Gaps / follow-ups

- None material for D3. The primitive decision is clear.
- Mentioned in D6 tensions: future migration to `Bun.serve` would replace `IncomingMessage` with WHATWG `Request` + `ReadableStream` body; busboy needs `Readable.fromWeb(request.body)` or a different parser at that point. Out of scope for this refactor but worth noting in SPEC's "Not Now" section.
