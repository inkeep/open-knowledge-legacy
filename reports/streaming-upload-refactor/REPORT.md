---
title: "Streaming Upload Refactor — removing upload.maxBytes by switching to stream-to-disk"
description: "Implementation-ready research for replacing Open Knowledge's buffer-to-memory multipart handler with a streaming + hash-during-stream pattern, so upload.maxBytes can be removed as a user-facing config without introducing OOM risk. Covers peer-editor architecture, Node.js/Bun primitive selection, on-the-fly SHA-256, temp-file lifecycle, error paths, dedup integration, config shape, and performance."
createdAt: 2026-04-22
updatedAt: 2026-04-22
subjects:
  - busboy
  - multer
  - @fastify/multipart
  - formidable
  - Bun
  - Outline
  - AFFiNE
  - Docmost
  - HedgeDoc
  - SilverBullet
  - TinaCMS
  - Obsidian
  - Logseq
  - Foam
  - Zettlr
  - Node.js
  - SHA-256
topics:
  - streaming uploads
  - multipart handling
  - memory safety
  - temp-file lifecycle
  - content-hash dedup
  - local-first architecture
---

# Streaming Upload Refactor

**Purpose.** Implementation-ready research for a follow-on PR that replaces Open Knowledge's buffer-to-memory multipart handler (`readUploadBody` + `chunks: Buffer[]` + `Buffer.concat` at `packages/server/src/api-extension.ts:410-482`) with a streaming-to-disk + hash-during-stream pattern, so `upload.maxBytes` can be removed as a user-facing config without introducing OOM risk. The reader wants concrete primitive selection, temp-file lifecycle, dedup integration, and peer-editor evidence that validates the architectural shape.

---

## Executive Summary

**Streaming is strictly better; the refactor is small; the config simplification is substantial.**

The current handler buffers the entire upload body into `chunks: Buffer[]` then materializes via `Buffer.concat`. Memory footprint is O(fileSize) with a transient 2× peak during concat. busboy's `limits.fileSize` exists purely as a memory-safety backstop — removing it without streaming means a 1 GB upload OOMs the server. That safety guard is why `upload.maxBytes` exists as a user-facing config today. Streaming breaks the dependency: memory becomes O(1), the guard becomes unnecessary, and the user-facing config field can be removed outright per greenfield / no-deferred-tech-debt.

**The primitive stays busboy** — its `'file'` event emits a Node Readable, and the refactor is idiomatic busboy-as-intended. **The hashing pattern is a 5-line `HashingPassThrough` Transform** composed into `stream.pipeline(fileStream, hashingTransform, writeStream)` — the canonical Node idiom, used by `@fastify/multipart` for the pipe structure and by formidable + git-lfs for the side-effecting-hash discipline. **The temp-file lives at `<contentDir>/.open-knowledge/tmp/upload-<uuid>`** — same filesystem as final destination (eliminates EXDEV on `rename`), isolated from user content, visible to boot-time orphan-sweep, aligned with OK's existing convention for internal state. **Dedup integrates via Option A**: stream → temp file + hash-during-stream → dedup scan → `linkSync` to final (collision-safe atomic) or unlink tempfile (dedup hit). **`upload.maxBytes` disappears from the config**, `/api/upload-config`, client toast, and SPEC P1.3 / QA-003.

Peer-editor evidence validates the architectural claim: local-first editors (Obsidian, Logseq-local, Foam, Zettlr) have no cap because bytes move via OS filesystem APIs, not HTTP. Among client-server peers, Docmost is the reference implementation — Fastify multipart `skipBuffer: true` + stream-to-storage, env-tunable 50 MB default. AFFiNE's single-shot path is essentially OK's current anti-pattern (buffer with quota interrupt); their resumable path uses presigned URLs. SilverBullet and TinaCMS ship with no cap at all but rely on reverse-proxy limits — not auditable.

**Key Findings:**

- **Finding 1 (D3):** Keep busboy. It's already streaming-native; the current handler regressed it. Refactor is a one-function rewrite inside `readUploadBody`.
- **Finding 2 (D4):** Use a 5-line `HashingPassThrough` Transform + `stream.pipeline()`. Memory O(1), pipeline handles error propagation + cleanup automatically.
- **Finding 3 (D5):** Place tempfiles at `<contentDir>/.open-knowledge/tmp/upload-<uuid>`. Same-filesystem rename. Boot-time orphan sweep with 24h age threshold (matches `shadow-branch-gc.ts` precedent).
- **Finding 4 (D6):** `stream.pipeline()` + typed `UploadWriteError` union (already present) + `try/finally unlinkSync`. Error classification table unchanged; cleanup discipline gains.
- **Finding 5 (D7):** Dedup integration: stream to tempfile → hash-during-stream → dedup scan → `linkSync` to final (atomic collision-safe) or `unlinkSync` tempfile. Preserves 99-attempt retry.
- **Finding 6 (D8):** Remove `upload.maxBytes` from config, `/api/upload-config`, client, SPEC P1.3, QA-003. No user-facing cap. Internal busboy cap stays as `Number.MAX_SAFE_INTEGER` or effectively unlimited — cleanup handles adversarial streams.
- **Finding 7 (D9):** Streaming is strictly better across all dimensions: memory O(1) vs O(fileSize), event-loop responsiveness (no `concat` pause), large-file completability (disk-bound vs heap-bound). Throughput equivalent for small files, dominant for large.
- **Finding 8 (D2):** Local-first peers don't cap because they don't own the bytes (OS FS). Among client-server peers that own bytes: Docmost streams (Docmost-as-model), AFFiNE's primary path buffers (anti-pattern), SilverBullet / TinaCMS skip caps entirely (risky). OK should match Docmost's architecture.

---

## Research Rubric

(agreed with user 2026-04-22; see conversation log)

| # | Dimension | Priority | Depth |
|---|---|---|---|
| D1 | Current-state anchor — the exact surface being replaced | P0 | Light |
| D2 | Peer-editor upload architecture survey (OS vs HTTP, stream vs buffer, caps) | P0 | Deep |
| D3 | Node.js/Bun streaming multipart primitives comparison | P0 | Deep |
| D4 | On-the-fly SHA-256 patterns | P0 | Moderate |
| D5 | Temp-file lifecycle (location, cleanup, orphan recovery) | P0 | Moderate |
| D6 | Error paths (disk-full, abort, malformed, network truncation) | P0 | Moderate |
| D7 | Dedup integration with streaming | P0 | Moderate |
| D8 | User-facing config shape post-refactor | P0 | Light |
| D9 | Performance characteristics | P1 | Moderate |

**Non-goals (explicit):** 16-editor UX survey (separate report); CRDT binary storage; CDN / object-storage backends; MIME-allowlist re-evaluation (D-M locked); existing dedup-by-sha256 product decision; Git LFS / large-binary strategies (SPEC §15).

---

## Detailed Findings

### D1 — Current-state anchor

**Finding:** Four specific code paths in `packages/server/src/api-extension.ts` constitute the surface being replaced.

**Evidence:** [evidence/d1-current-state-anchor.md](evidence/d1-current-state-anchor.md)

Load-bearing file:line references:
- `:410-482` — `readUploadBody` buffers the entire request body via `chunks: Buffer[]` + `Buffer.concat`.
- `:281-371` — `findDuplicateAsset(destDir, sha, expectedSize)` — dedup scan that runs AFTER the buffer is materialized.
- `:373-401` — `writeUploadAtomic(destDir, sanitized, buffer)` — takes a `Buffer`, writes via `openSync('wx')` + `writeSync`, retries 99 collision suffixes.
- `:3400` — `findDuplicateAsset(destDir, sha, buffer.length)` call site.

Surfaces that stay byte-identical and are orthogonal to buffer-vs-stream:
- `sanitizeFilename` at `:188` — pure string transform.
- Path-escape guards at `:3311-3360` — operate on path strings, never payload bytes.
- SVG `<svg` extension-fallback at `:3088-3093` — operates on already-sniffed bytes; moves to inside the streaming pipeline.

**Implications:** Refactor scope is bounded. Two function rewrites (`readUploadBody`, `writeUploadAtomic`) + one call-site reordering (`findDuplicateAsset` moves from "after buffer materialized" to "after pipeline completes"). Everything else stays byte-identical.

---

### D2 — Peer-editor upload architecture survey

**Finding:** Local-first editors face zero upload-memory pressure because they use OS file APIs. Among client-server peers, only Docmost implements the "stream to storage" architectural shape. Others either use presigned URLs, buffer to memory, or skip caps entirely.

**Evidence:** [evidence/d2-peer-editor-upload-architecture.md](evidence/d2-peer-editor-upload-architecture.md)

| Editor | Transport | Stream or buffer | User cap |
|---|---|---|---|
| Outline | Presigned S3 POST | Server never sees bytes | 1 MB default (env-tunable) |
| AFFiNE (single-shot) | GraphQL Upload | **Buffer-to-memory** with quota interrupt | 500 KB generic / per-workspace quota |
| AFFiNE (resumable) | Presigned URLs | Server coordinates only | Workspace quota |
| Docmost | Fastify multipart | **Streams to storage** (`skipBuffer: true`) | 50 MB default (env-tunable) |
| HedgeDoc | multer memoryStorage | **Buffer-to-memory** | Not located |
| SilverBullet | HTTP PUT raw body | **Buffer-to-memory, unbounded** | **NONE** |
| TinaCMS | multer diskStorage | **Streams to disk** (no atomic rename) | **NONE** |
| Obsidian | OS filesystem | N/A (native FS) | None documented |
| Logseq (local) | OS filesystem | Native FS | None |
| Foam | VS Code FS API | Native FS | None |
| Zettlr | `node:fs.copyFile` | Native FS (zero-copy where supported) | None |

**Implications:**
- Architectural claim holds: local-first editors (Obsidian/Logseq/Foam/Zettlr) don't cap because they don't own the bytes. OK does own the bytes (HTTP multipart), so the cap question is real for OK.
- Docmost is the reference implementation to copy. Their `skipBuffer: true` flag on `@fastify/multipart` is the exact semantic OK needs.
- SilverBullet / TinaCMS ship with no cap, relying on reverse proxy. OK could do the same, but the better architecture is Docmost's — stream-to-disk with cleanup discipline.

**Decision triggers (when this matters):**
- If OK ever pivots to multi-tenant hosting, reintroduce `maxBytes` (matches Outline's pattern).
- If deployment context changes (Docker / reverse proxy with hard body limits), document the external cap boundary.

**Remaining uncertainty:**
- HedgeDoc v2's cap location not located — not decision-relevant.
- Outline's dedup strategy invisible in inspected paths — ID-based S3 keys suggest no content-hash dedup.

---

### D3 — Node.js/Bun streaming multipart primitives

**Finding:** Keep busboy. It's already streaming-native; OK's current handler is a regression on its intended API.

**Evidence:** [evidence/d3-streaming-multipart-primitives.md](evidence/d3-streaming-multipart-primitives.md)

| Library | Memory | API shape | Bun 1.3 OK? | New dep? | Recommendation |
|---|---|---|---|---|---|
| **busboy** (current) | Streaming via `'file'` event Readable | `bb.on('file', (_, stream) => stream.pipe(dest))` | Yes ([issue #12074](https://github.com/oven-sh/bun/issues/12074) closed) | No | **Keep** |
| multer | Streaming (wraps busboy) | Express-middleware `StorageEngine._handleFile` | Yes | Yes + Express | No — wrapper tax |
| @fastify/multipart | Streaming (wraps busboy) | `pipeline(part.file, writeStream)` | Yes | Yes + framework | No — but emulate the pattern |
| formidable | Streaming | `PersistentFile.write()` + `hashAlgorithm` | Yes | Yes (~35 KB) | No — busboy already installed |
| `Bun.Request.formData()` | **Buffered** (per [Bun docs](https://bun.sh/docs/api/fetch)) | `FormData.get().stream()` reads from already-buffered Blob | Native | No | No — wrong memory semantics |

**Implications:** Minimum diff is keeping busboy and pipelining its `'file'` event stream correctly. `@fastify/multipart`'s `pipeline(part.file, target)` pattern (`fastify-multipart/index.js:537-569`) is the line-for-line reference to emulate.

**Decision triggers:** None in this scope. A future migration to `Bun.serve`-native would swap `IncomingMessage` for WHATWG `Request` with `ReadableStream` body — busboy would need `Readable.fromWeb(request.body)` or replacement. SPEC should note this in "Not Now."

---

### D4 — On-the-fly SHA-256

**Finding:** A 5-line `HashingPassThrough` Transform stacked into `stream.pipeline()` is the canonical pattern. `createHash()` IS itself a `stream.Transform` ([Node docs](https://nodejs.org/docs/latest-v20.x/api/crypto.html#class-hash)) but emits the digest downstream, defeating the "hash AND write to disk" goal — the wrapper subclass is simpler.

**Evidence:** [evidence/d4-on-the-fly-sha256.md](evidence/d4-on-the-fly-sha256.md)

```ts
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

const hasher = new HashingPassThrough();
const tempPath = join(tmpDir, `upload-${randomUUID()}`);
await pipeline(fileStream, hasher, createWriteStream(tempPath));
const sha = hasher.digest();
const size = hasher.byteLength();
```

OSS convergence:
- formidable: [`PersistentFile.write`](https://github.com/node-formidable/formidable/blob/master/src/PersistentFile.js) does `this.hash.update(buf)` before `this.writeStream.write(buf)` — Pattern A inside its own write loop.
- git-lfs: `io.TeeReader(body, hasher)` — Go equivalent of Pattern B.
- minio-js: per-chunk `createHash('md5').update(chunk).digest()` inside its multipart loop — Pattern A at chunk level.
- `@aws-sdk/lib-storage`: delegates to S3 server-side checksums — not analogous to OK's use case.
- `@fastify/multipart`: no hashing — OK composes a Transform into the pipeline.

**Implications:** `stream.pipeline()` is strictly dominant over manual `.pipe()` for error handling ([Node docs](https://nodejs.org/api/stream.html)). Bun 1.3 implements `node:stream` and `node:crypto` per its compat docs — same code runs in both runtimes.

**Decision triggers:** None in scope. Remaining uncertainty: Bun `node:stream.Transform` is implied from Duplex support but not explicitly named in docs. Test suite must assert the pipeline + digest behavior in both Node and Bun explicitly.

---

### D5 — Temp-file lifecycle

**Finding:** `<contentDir>/.open-knowledge/tmp/upload-<uuid>` is the right placement. Same-filesystem rename eliminates EXDEV, isolates upload churn from user content, aligns with OK's existing internal-state convention. Boot-time orphan sweep modeled on `shadow-branch-gc.ts`.

**Evidence:** [evidence/d5-temp-file-lifecycle.md](evidence/d5-temp-file-lifecycle.md)

| Option | Pro | Con |
|---|---|---|
| OS tmp (`os.tmpdir()`) | Default pattern | **Critical:** `EXDEV` on `rename` when /tmp is a different mount — copy+unlink fallback loses atomicity |
| **`<contentDir>/.open-knowledge/tmp/`** | Same FS → atomic rename. Isolated from user content. Matches OK convention. | Lazy mkdir on first upload (trivial) |
| Destination dir + `.upload-*` | Same FS + matches `persistence.ts:482-485` markdown pattern | `.tmp.<uuid>` briefly visible to file browser / sidebar / file-watcher |

**Lifecycle protocol:**

1. On first upload per process: `mkdirSync('.open-knowledge/tmp', { recursive: true })`.
2. Per upload: `upload-${randomUUID()}`.
3. On pipeline success: `linkSync(tmpPath, destPath)` inside a 99-attempt collision-suffix retry loop; `unlinkSync(tmpPath)` when the link succeeds.
4. On pipeline error: `try/finally unlinkSync(tmpPath)` in a catch. `pipeline()`'s `await` guarantees streams are closed before unlink — no Windows EBUSY race.
5. On server boot: scan `.open-knowledge/tmp/upload-*`, unlink entries older than 24h. Add to existing boot sequence next to `shadow-branch-gc.ts`.

**Collision semantics (important subtlety):** POSIX `rename(2)` overwrites by default, breaking the existing "write-if-new-or-suffix-retry" semantic. Use `linkSync` instead — `link(2)` throws `EEXIST` on collision, is atomic, and cross-platform. The 99-attempt retry stays unchanged; only the write-buffer call swaps to `linkSync(tmpPath, testDestPath)`.

**Implications:** The refactor preserves OK's existing collision-retry contract while gaining atomic same-filesystem semantics.

**Decision triggers:** None in scope.

**Remaining uncertainty:** Windows EBUSY avoidance validated by `pipeline()` await semantics — but OK currently has no Windows CI. Worth a one-line assertion in the test suite asserting unlink succeeds after pipeline error, even if that test only meaningfully executes on Linux/macOS.

---

### D6 — Error paths

**Finding:** The existing `UploadWriteError` union classification is streaming-compatible unchanged. `stream.pipeline()` unifies error propagation; `try/finally unlinkSync` handles cleanup. Error classification table stays stable.

**Evidence:** [evidence/d6-error-paths.md](evidence/d6-error-paths.md)

| Error class | Detection | HTTP status | Kebab-case code | Cleanup |
|---|---|---|---|---|
| ENOSPC / EDQUOT | `writeStream` error with code | 507 | `storage-full` | unlink tempfile |
| EROFS / EACCES / EPERM | `writeStream` error with code | 500 | `storage-readonly` | unlink tempfile |
| Other write error | `writeStream` error, unknown code | 500 | `storage-error` | unlink tempfile |
| Size limit (if retained as internal guard) | `file.on('limit')` from busboy | 413 | `payload-too-large` | unlink tempfile, `req.unpipe(bb)` |
| Client aborted | `req.on('close')` + `!req.complete` | n/a (socket gone) | n/a | unlink tempfile |
| Malformed multipart | `bb.on('error')` | 400 | `malformed-upload` | unlink tempfile |
| Collision exhaustion | 99 link attempts failed | 500 | `collision-exhaustion` | unlink tempfile |

Pattern:

```ts
try {
  await pipeline(fileStream, hasher, createWriteStream(tempPath));
  // ... dedup + link ...
} catch (err) {
  try { unlinkSync(tempPath); } catch { /* best-effort */ }
  throw classify(err);  // existing UploadWriteError union
}
```

**Implications:** The classification logic at `api-extension.ts:3485-3493` already picks HTTP status from error reason and is refactor-compatible. New code only extends the union with `'malformed-upload'` (new) and moves `'payload-too-large'` from user-facing to internal-guard-only (see D8).

**Decision triggers:** None in scope.

**Remaining uncertainty:** busboy issue [#377](https://github.com/mscdex/busboy/issues/377) ("Emitting 'error' from Multipart is undefined behaviour") suggests edge cases exist. Treat any `bb.on('error')` as terminal; do not assume ordering. Test suite must exercise malformed-multipart + aborted + ENOSPC + size-over-limit paths explicitly.

---

### D7 — Dedup integration

**Finding:** Stream → tempfile + hash-during-stream → dedup scan → `linkSync` to final (atomic create-if-not-exists) or `unlinkSync` tempfile. Preserves 99-attempt collision retry via `linkSync` + `EEXIST`.

**Evidence:** [evidence/d7-dedup-integration.md](evidence/d7-dedup-integration.md)

Options considered:
- **Option A (recommended):** Stream to tempfile, hash during stream, dedup scan after pipeline, link-or-unlink.
- **Option B:** Dedup during stream (peek-hash before storing). Requires reading stream twice — not viable.
- **Option C:** Persistent content-hash index (`Map<sha, path>`). O(1) dedup check, but introduces a new subsystem. Worth a separate spec if dedup-hit latency ever measures as a problem.
- **Option D:** Remove dedup. Not viable — SPEC FR-2 + D-B lock dedup as a product requirement.

**Implications:** Option A adds O(tempfile-write) cost on dedup hits — negligible in practice because dedup hits are a rare "same screenshot twice" pattern. Simpler is better.

**Key subtlety:** `renameSync` overwrites; `linkSync` doesn't. The retry loop:

```ts
for (let i = 0; i <= 99; i++) {
  const candidate = i === 0 ? sanitized : `${stem}-${i}${ext}`;
  const candidatePath = join(destDir, candidate);
  try {
    linkSync(tempPath, candidatePath);
    unlinkSync(tempPath);
    return candidatePath;
  } catch (err) {
    if (err.code === 'EEXIST') continue;
    try { unlinkSync(tempPath); } catch {}
    throw err;
  }
}
throw new UploadWriteError('collision-exhaustion');
```

**Decision triggers:**
- If dedup-hit latency becomes user-visible: add persistent content-hash index (Option C) in a separate spec.
- If `linkSync` throws `EXDEV` (different mounts — should never happen with D5 Option 2, but defensive): fail loud at server init rather than at upload time.

**Remaining uncertainty:** None material.

---

### D8 — User-facing config shape post-refactor

**Finding:** Remove `upload.maxBytes` entirely. No user-facing cap. Internal busboy guard stays as a large constant (≈ `Number.MAX_SAFE_INTEGER`) purely for adversarial-stream cleanup — never a user-visible rejection.

**Evidence:** [evidence/d8-config-shape-post-refactor.md](evidence/d8-config-shape-post-refactor.md)

What's removed:

| Surface | Before | After |
|---|---|---|
| `upload.maxBytes` Zod field | `z.number().int().min(0).default(25 MB)` | ❌ removed |
| `/api/upload-config` response | Includes `maxBytes` | No `maxBytes` field |
| Client `UploadConfig` type | `maxBytes?: number` | ❌ removed |
| Client byte-size toast | `"File is 30 MB but upload limit is 25 MB."` | generic `"Upload failed"` on rare adversarial 413 |
| SPEC P1.3 scenario | Oversized rejection E2E | ❌ removed |
| QA-003 | validated P1.3 coverage | ❌ removed |
| Docs `configuration.mdx` | upload.maxBytes row | ❌ removed |
| Docs `assets-and-embeds.mdx` | 25 MB mention | ❌ removed |

What's kept:
- Dedup toast (SPEC D-B) — independent of maxBytes.
- All other upload errors — unchanged.
- Internal `UploadWriteError` `payload-too-large` classification — rarely triggered, never user-facing.

**Peer alignment:** Matches Obsidian, Logseq-local, Foam, Zettlr (no cap). Diverges from Docmost (50 MB default) — but Docmost is a Confluence-alternative multi-user hosted product, where per-user caps are a resource policy; OK is local-first where the user's own machine has no external actor.

**Implications:** Aligns with the user's framing ("it's in a user's own computer"). Removes 30+ lines of formatting code, one E2E scenario, one QA scenario, and one config field — net simplification.

**Decision triggers:** Revisit if OK pivots to multi-tenant hosting (same trigger as SPEC §15 `allowedMimeTypes` hard-block).

**Remaining uncertainty:** None material.

---

### D9 — Performance characteristics

**Finding:** Streaming is strictly better across memory, event-loop responsiveness, and large-file completability. Throughput equivalent for small files and dominant for large.

**Evidence:** [evidence/d9-performance-characteristics.md](evidence/d9-performance-characteristics.md)

| Dimension | Buffer (current) | Stream (refactor) |
|---|---|---|
| Memory | O(fileSize), transient 2× peak during `Buffer.concat` | O(1) — ~80 KB constant (chunk + hash state + writeStream highWaterMark) |
| Max completable upload | ~1 GB on 1.5 GB default heap | Disk-bound only |
| Event-loop occupation during 25 MB | 5–10 ms block during concat | Per-chunk microseconds |
| Small-file (≤ 64 KB) throughput | Equivalent | Equivalent (pipeline overhead negligible) |
| Large-file (> 100 MB) throughput | OOMs above heap | Disk-bound (~500 MB/s on SSD) |
| SHA-256 CPU cost | Identical (same bytes hashed) | Identical |

**Implications:** No performance counter-argument. Order-of-magnitude memory win; equivalent or better throughput; fewer event-loop hazards.

**Decision triggers:**
- Benchmark harness not included in refactor scope; optional addition to follow-on PR if team wants hard numbers.
- `fsync` for crash-safe tempfile durability: not required today (SPEC doesn't require crash-safe upload), worth revisiting if dogfood incident surfaces.

**Remaining uncertainty:** None material.

---

## Implementation plan (summary for the follow-on PR)

**Single-commit scope, ~150 LOC net.**

### Server-side changes (`packages/server/src/api-extension.ts`)

1. **Add `HashingPassThrough` class** (5 LOC) above `readUploadBody`.
2. **Rewrite `readUploadBody`** (~40 LOC replacing ~65 current LOC):
   - Replace `chunks: Buffer[]` + `Buffer.concat` with `pipeline(fileStream, hasher, createWriteStream(tempPath))`.
   - Return `{ filename, mimeType, parentDocName, tempPath, sha, size }` instead of `{ ..., buffer }`.
3. **Replace `writeUploadAtomic`** with `linkTempToFinalWithCollisionRetry`:
   - `linkSync(tmpPath, candidatePath)` with `EEXIST` retry loop.
   - `unlinkSync(tmpPath)` after successful link.
4. **Update handler call site at `:3279`** to work with the new `UploadResult` shape:
   - Run `findDuplicateAsset(destDir, sha, size)` using the hasher's output.
   - On dedup hit: `unlinkSync(tempPath)` + short-circuit return.
   - On new file: `linkTempToFinalWithCollisionRetry`.
5. **Add boot-time orphan sweep**: scan `.open-knowledge/tmp/upload-*`, unlink entries older than 24h. Wire into `standalone.ts` startup sequence.

### Config changes

1. **`packages/cli/src/config/schema.ts`**: delete `maxBytes` field from `UploadConfigSchema`; delete `DEFAULT_MAX_UPLOAD_BYTES` constant.
2. **`/api/upload-config` response**: stop emitting `maxBytes`.

### Client-side changes (`packages/app/src/editor/image-upload/index.ts`)

1. Delete `maxBytes` from `UploadConfig` type (line 181 + line 273).
2. Delete the byte-size-specific toast branch (lines 338-346). Replace with generic fallback.

### Test changes

1. **New integration test** `packages/server/src/api-extension-streaming.test.ts`:
   - Streaming correctness: upload a real 100 MB file, assert memory stays bounded (RSS check), assert sha matches.
   - Dedup integration: upload the same bytes twice, assert second returns `deduped:true`, assert no tempfile left behind.
   - Error paths: aborted mid-upload → no tempfile. Malformed multipart → 400 + cleanup. ENOSPC simulation (via quota-constrained tmpfs) → 507 + cleanup.
   - Orphan sweep: create stale tempfile, run boot sweep, assert deletion.
2. **Remove** P1.3 / QA-003 scenarios referencing `maxBytes` rejection.
3. **Update existing upload tests** that asserted `maxBytes` rejection shape.

### Docs changes

1. `docs/content/guides/assets-and-embeds.mdx`: remove 25 MB mention.
2. `docs/content/guides/configuration.mdx`: remove `upload.maxBytes` row.
3. `AGENTS.md` / `packages/server/README.md`: update upload-surface description.
4. `specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`: §3 NG6 annotated or amended (the NG6 "revisit trigger" was about Git LFS — unrelated to user-facing cap); §13 P1.3 removed; §6 FR-5 `maxBytes` field removed.

### Changeset entry

Separate minor-bump changeset describing the breaking removal of `upload.maxBytes` from the config schema + `/api/upload-config` response.

---

## Limitations & Open Questions

### Dimensions not fully covered

- None material. All P0 dimensions have primary-source evidence.

### Explicitly out of scope (per rubric non-goals)

- CRDT binary storage (Y.js binary docs) — unchanged.
- Git LFS integration — SPEC §15 Future Work, separate spec.
- MIME-allowlist re-evaluation — D-M LOCKED accept-all.
- Product-level dedup strategy — unchanged.
- Multi-tenant resource policy — no current product surface.

### Tensions worth flagging

- **busboy issue #377** ("Error emission from Multipart is undefined behaviour") — the refactor's test suite must exercise malformed-multipart explicitly, not just rely on `bb.on('error')` order. If test coverage reveals busboy edge cases we can't wrap cleanly, that's a signal to swap primitives — but current evidence doesn't support a swap now.
- **Bun stream parity** — not a red flag, but the refactor's test suite must assert the pipeline + digest behavior in both Node (turbo's `bun test`) and Bun explicitly. Document this requirement in the follow-on PR.
- **Future `Bun.serve` migration** — SPEC should note in "Not Now" that migrating to Bun-native HTTP would replace `IncomingMessage` with WHATWG `Request` + `ReadableStream` body, requiring `Readable.fromWeb(request.body)` before busboy or a replacement parser.

---

## References

### Evidence Files

- [evidence/d1-current-state-anchor.md](evidence/d1-current-state-anchor.md) — exact file:line surface being replaced.
- [evidence/d2-peer-editor-upload-architecture.md](evidence/d2-peer-editor-upload-architecture.md) — 11-editor survey with source citations.
- [evidence/d3-streaming-multipart-primitives.md](evidence/d3-streaming-multipart-primitives.md) — busboy/multer/@fastify/multipart/formidable/Bun comparison.
- [evidence/d4-on-the-fly-sha256.md](evidence/d4-on-the-fly-sha256.md) — Transform pattern, OSS examples.
- [evidence/d5-temp-file-lifecycle.md](evidence/d5-temp-file-lifecycle.md) — placement, cleanup, orphan recovery.
- [evidence/d6-error-paths.md](evidence/d6-error-paths.md) — error classification table.
- [evidence/d7-dedup-integration.md](evidence/d7-dedup-integration.md) — integration options.
- [evidence/d8-config-shape-post-refactor.md](evidence/d8-config-shape-post-refactor.md) — config removal impact analysis.
- [evidence/d9-performance-characteristics.md](evidence/d9-performance-characteristics.md) — perf delta.

### External Sources (primary)

- [busboy](https://github.com/mscdex/busboy) — the multipart library currently in use.
- [@fastify/multipart — index.js](https://github.com/fastify/fastify-multipart/blob/master/index.js) — reference implementation of `pipeline(part.file, writeStream)` + cleanup hook.
- [multer — storage/disk.js](https://github.com/expressjs/multer/blob/master/storage/disk.js) — `StorageEngine` contract.
- [formidable — PersistentFile.js](https://github.com/node-formidable/formidable/blob/master/src/PersistentFile.js) — built-in `hashAlgorithm` pattern.
- [Node.js crypto docs — Class: Hash](https://nodejs.org/docs/latest-v20.x/api/crypto.html#class-hash) — `createHash()` is a `stream.Transform`.
- [Node.js stream docs — stream.pipeline()](https://nodejs.org/api/stream.html) — error handling + cleanup semantics.
- [Bun docs — Response buffering](https://bun.sh/docs/api/fetch) — `Bun.Request.formData()` is buffering, not streaming.
- [npm/write-file-atomic](https://github.com/npm/write-file-atomic) — same-directory tempfile + rename pattern.
- [Outline — attachments.ts](https://github.com/outline/outline/blob/main/server/routes/api/attachments/attachments.ts) — presigned S3 POST model.
- [AFFiNE — blob.ts](https://github.com/toeverything/AFFiNE/blob/canary/packages/backend/server/src/core/workspaces/resolvers/blob.ts) + [stream.ts](https://github.com/toeverything/AFFiNE/blob/canary/packages/backend/server/src/base/utils/stream.ts) — `readBuffer` with streaming quota interrupt.
- [Docmost — attachment.service.ts](https://github.com/docmost/docmost/blob/main/apps/server/src/core/attachment/services/attachment.service.ts) — `skipBuffer: true` + stream-to-storage. Reference architecture.
- [HedgeDoc — media.service.ts](https://github.com/hedgedoc/hedgedoc/blob/develop/backend/src/media/media.service.ts) — `file.buffer` anti-pattern.
- [SilverBullet — fs.go](https://github.com/silverbulletmd/silverbullet/blob/main/server/fs.go) — `io.ReadAll` no-cap anti-pattern.
- [TinaCMS — CLI routes](https://github.com/tinacms/tinacms/blob/main/packages/%40tinacms/cli/src/server/routes/index.ts) — multer diskStorage, no `limits:`.
- [Obsidian DataAdapter.writeBinary](https://docs.obsidian.md/Reference/TypeScript+API/DataAdapter/writeBinary) — native OS FS.
- [Logseq — assets.cljs](https://github.com/logseq/logseq/blob/master/src/main/frontend/handler/assets.cljs) — local FS + optional RTC presigned URL.
- [Zettlr — assets/index.ts](https://github.com/Zettlr/Zettlr/blob/master/source/app/service-providers/assets/index.ts) — `fs.copyFile` + `fs.rename`.

### Related Research

- [reports/editor-asset-embed-patterns-across-universe/](../editor-asset-embed-patterns-across-universe/REPORT.md) — 16-editor UX survey (paste + rendering focus). Complementary to this report's server-side primitive focus.
- [reports/crdt-observer-bridge-latency-analysis/](../crdt-observer-bridge-latency-analysis/REPORT.md) — load on the CRDT side; unrelated to upload path but touches the same server.
