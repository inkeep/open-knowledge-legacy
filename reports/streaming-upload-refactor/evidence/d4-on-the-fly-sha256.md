# Evidence: D4 — On-the-fly SHA-256 patterns

**Dimension:** How to compute sha256 while bytes flow from multipart → disk. Compare Transform-stream, `createHash` as Writable, manual pipe, double-read.
**Date:** 2026-04-22
**Sources:** Node.js crypto docs, Node.js stream docs, minio-js, aws-sdk-js-v3, git-lfs, formidable, @fastify/multipart.

---

## Key findings

### Finding: Node's `crypto.Hash` IS a Transform stream.
**Confidence:** CONFIRMED
**Evidence:** [nodejs.org/api/crypto.html#class-hash](https://nodejs.org/docs/latest-v20.x/api/crypto.html#class-hash)

> Class: `Hash` — **Extends: `<stream.Transform>`**
>
> The `Hash` class is a utility for creating hash digests of data. It can be used in one of two ways:
> - As a stream that is both readable and writable, where data is written to produce a computed hash digest on the readable side, or
> - Using the `hash.update()` and `hash.digest()` methods to produce the computed hash.

Official docs example:

```js
const hash = createHash('sha256');
const input = createReadStream('test.js');
input.pipe(hash).setEncoding('hex').pipe(stdout);
```

**Implications:** You CAN pipe to `createHash()`, but the downstream data becomes the hex digest (fired on `end`), not the original bytes. For a "hash AND write to disk" pattern you need a `tee` (`PassThrough` branching) or a custom Transform that side-effects `.update()` while passing bytes through. The latter is simpler.

### Finding: `stream.pipeline()` is strictly dominant over manual `.pipe()` for error handling + cleanup.
**Confidence:** CONFIRMED
**Evidence:** [nodejs.org/api/stream.html#streampipelinesource-transforms-destination-callback](https://nodejs.org/api/stream.html)

Docs: `stream.pipeline()` "automatically handles errors across the entire chain — if any stream in the pipeline errors, all streams are properly destroyed," "cleans up resources," and "manages backpressure."

Promise variant:
```js
const { pipeline } = require('node:stream/promises');
await pipeline(source, transform, destination);
```

Manual `source.pipe(transform).pipe(destination)` needs separate `'error'` handlers on each stream and doesn't destroy downstream on upstream error — the classic "unpiped but not destroyed" orphan.

### Finding: The canonical industry pattern is a pass-through Transform that side-effects `.update()`.
**Confidence:** CONFIRMED
**Evidence:** formidable's `PersistentFile.write(buf)` calls `this.hash.update(buf)` before `this.writeStream.write(buf)`. git-lfs (Go) uses `io.TeeReader(body, hasher)` — exactly the "pass-through with side-effect" semantic. minio-js `src/internal/client.ts` uses `createHash('md5').update(chunk).digest()` per-chunk inside the multipart loop for ETag validation.

**Implications:** The 5-line custom Transform wins on simplicity AND is the pattern OSS converges on:

```ts
class HashingPassThrough extends Transform {
  private hash = createHash('sha256');
  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    this.hash.update(chunk);
    cb(null, chunk);
  }
  digest(): string { return this.hash.digest('hex'); }
}

// Usage:
const hasher = new HashingPassThrough();
await pipeline(busboyFile, hasher, createWriteStream(tempPath));
const sha = hasher.digest();
```

### Finding: aws-sdk-js-v3 `@aws-sdk/lib-storage` defers checksumming to S3, not local.
**Confidence:** CONFIRMED
**Evidence:** `@aws-sdk/lib-storage` `Upload` class docs — the `ChecksumAlgorithm` parameter (`CRC32`, `SHA256`) delegates to S3's per-part + aggregated checksums, handled by middleware.

**Implications:** NOT applicable to OK — OK needs the hash locally for dedup, not validation. minio-js is the closer analog (local per-chunk hashing).

### Finding: @fastify/multipart does not hash; hashing is an independent concern.
**Confidence:** CONFIRMED
**Evidence:** fastify-multipart README — the `pipeline(part.file, writeStream)` pattern is vanilla. Hashing is strictly additive.

**Implications:** OK is free to compose hashing into the pipeline as a Transform between busboy's `file` and `createWriteStream`. Zero library support needed.

---

## Pattern comparison

| Pattern | Description | Error handling | Idiomatic? |
|---|---|---|---|
| **A**: `.update(chunk)` in `'data'` handler | Manual pipe: `file.on('data', c => { hash.update(c); writeStream.write(c); })` | Must manage backpressure, `'drain'`, dual `'error'` handlers manually | Works but reimplements pipe |
| **B**: Custom `HashingPassThrough` Transform + `pipeline()` | `pipeline(file, hasher, writeStream)` — pass-through side-effecting `.update()` | `pipeline` handles errors + cleanup automatically | ✅ Canonical |
| **C**: `createHash()` as the Writable | `pipeline(file, createHash('sha256'))` — but downstream IS the digest | Works, but you can't also write to disk from the same branch | No — only useful when hash is terminal |
| **D**: Double-read | Write to disk, reopen, hash. | Simple error paths (two independent reads) | ❌ O(2×fileSize) disk I/O |

---

## OSS reference implementations

- **minio-js** [`src/internal/client.ts`](https://github.com/minio/minio-js) — per-chunk MD5 via `createHash('md5').update(chunk).digest()` inside the multipart upload loop. Pattern A at chunk level (they own the chunk-reading loop; no stream Transform needed).
- **formidable** [`src/PersistentFile.js`](https://github.com/node-formidable/formidable/blob/master/src/PersistentFile.js) — when `options.hashAlgorithm: 'sha256'`, `write(buf)` does `this.hash.update(buf)` before `this.writeStream.write(buf)`. Pattern A inside the library's own write loop.
- **git-lfs (Go)** — `io.TeeReader(body, hasher)` — Pattern B equivalent in Go.
- **@aws-sdk/lib-storage** — delegates to S3 server-side checksums. Not analogous.
- **@fastify/multipart** — vanilla `pipeline(part.file, writeStream)`, no hashing. OK composes a Transform into this.

---

## Recommendation

**Pattern B — custom `HashingPassThrough` Transform + `stream.pipeline()`.** It combines the pattern fastify-multipart uses for the pipe structure with formidable's / git-lfs's side-effecting-hash discipline into the canonical Node idiom. `createHash()` being a Transform itself is a nice curiosity but not useful here — the 5-line wrapper subclass is clearer. `pipeline()` gives unified error handling + cleanup-on-failure for free. Bun 1.3 implements `node:stream` and `node:crypto` per the official compat docs, so the same code runs in both runtimes — validate with a test that asserts the pipeline completes + digest matches a known sha256 in both Node and Bun.

**Implementation sketch:**

```ts
// packages/server/src/api-extension.ts (refactor of readUploadBody)
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';

class HashingPassThrough extends Transform {
  private hash = createHash('sha256');
  private bytes = 0;
  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    this.hash.update(chunk);
    this.bytes += chunk.length;
    cb(null, chunk);
  }
  digest(): string { return this.hash.digest('hex'); }
  byteLength(): number { return this.bytes; }
}

// Inside the busboy 'file' handler:
const hasher = new HashingPassThrough();
const tempPath = join(tmpDir, `upload-${randomUUID()}`);
await pipeline(fileStream, hasher, createWriteStream(tempPath));
const sha = hasher.digest();
const size = hasher.byteLength();  // replaces chunks.length + Buffer.concat pattern
```

---

## Gaps / follow-ups

- **Bun parity test.** The Bun docs say `node:stream` implements `Readable`, `Writable`, `Duplex` — Transform is a Duplex subclass but not explicitly named. No pre-emptive red flag, but the refactor's test suite should assert `pipeline(busboyFileStream, hashingTransform, writeStream)` + digest-matches-known in both Node and Bun explicitly. Integration test file: `packages/app/tests/integration/upload-streaming.test.ts` (new).
- **Concurrent-upload hash collisions.** Not a correctness concern (two identical files intentionally produce the same sha for dedup); noted only as a reminder that the tempfile name (UUID) must be unique per request, not per sha.
