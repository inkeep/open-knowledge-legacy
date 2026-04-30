# Evidence: D2 — Peer-editor upload architecture survey

**Dimension:** How peer content editors handle file uploads — transport, library, stream-vs-buffer, caps, temp-file strategy, dedup, error handling.
**Date:** 2026-04-22
**Sources:** Official repos (GitHub), Obsidian Developer Docs, community bug reports.

---

## Key files / references

- Outline: `server/routes/api/attachments/attachments.ts`, `server/models/helpers/AttachmentHelper.ts`, `server/env.ts`
- AFFiNE: `packages/backend/server/src/core/workspaces/resolvers/blob.ts`, `packages/backend/server/src/base/utils/stream.ts`, `packages/backend/server/src/core/storage/wrappers/blob.ts`
- Docmost: `apps/server/src/core/attachment/attachment.controller.ts`, `apps/server/src/core/attachment/services/attachment.service.ts`, `apps/server/src/integrations/environment/environment.service.ts`, `apps/server/src/common/interceptors/file.interceptor.ts`
- HedgeDoc: `backend/src/api/private/media/media.controller.ts`, `backend/src/media/media.service.ts`
- SilverBullet: `server/fs.go`, `server/disk_space_primitives.go`
- TinaCMS: `packages/@tinacms/cli/src/server/routes/index.ts`, `packages/next-tinacms-cloudinary/src/handlers.ts`
- Obsidian: Official Developer Documentation — `DataAdapter.writeBinary`, `Vault.createBinary`
- Logseq: `src/main/frontend/handler/assets.cljs`
- Zettlr: `source/app/service-providers/assets/index.ts`
- Foam: VS Code FileSystem API

---

## Findings

### Finding: Outline never touches upload bytes on the server — presigned S3 POST.
**Confidence:** CONFIRMED
**Evidence:** [Outline attachments.ts](https://github.com/outline/outline/blob/main/server/routes/api/attachments/attachments.ts)

The `attachments.create` endpoint validates metadata (`size`, `contentType`, `preset`), then returns presigned POST form fields (`attachments.ts:141`: `FileStorage.getPresignedPost(ctx, key, acl, maxUploadSize, contentType)`). The browser uploads directly to S3-compatible storage; the server only issues credentials.

**Caps.** `AttachmentHelper.presetToMaxUploadSize(preset)` (`server/models/helpers/AttachmentHelper.ts:103-116`) returns preset-specific limits. Default `FILE_STORAGE_UPLOAD_MAX_SIZE = 1,000,000` bytes ≈ **1 MB** (`server/env.ts:648-651`). Enforced twice: (1) pre-signed metadata check returning 413-ish error before issuing credentials (`attachments.ts:111-119`), (2) baked into the presigned-POST policy so S3 rejects oversize uploads at upload time.

**Implications:** Outline's cap is the S3 policy limit, not a Node.js process memory limit. The "cap for memory safety" pressure OK faces doesn't apply to Outline at all.

### Finding: AFFiNE has TWO upload paths — single-shot buffer-to-memory with quota interrupt, and resumable browser-to-storage direct.
**Confidence:** CONFIRMED
**Evidence:** [AFFiNE blob.ts](https://github.com/toeverything/AFFiNE/blob/canary/packages/backend/server/src/core/workspaces/resolvers/blob.ts), [stream.ts (readBuffer)](https://github.com/toeverything/AFFiNE/blob/canary/packages/backend/server/src/base/utils/stream.ts)

**Single-shot `setBlob` mutation:**

```ts
// packages/backend/server/src/base/utils/stream.ts:13-53
export async function readBuffer(
  stream: Readable,
  checkExceeded: (size: number) => void,
): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    stream.on('data', (chunk) => {
      totalSize += chunk.length;
      try { checkExceeded(totalSize); } catch (e) { reject(e); }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks, totalSize)));
    stream.on('error', reject);
  });
}
```

Functionally buffer-to-memory (chunks accumulate), but with a streaming-quota interrupt: `checkExceeded` runs after each chunk and throws `BlobQuotaExceeded` mid-stream. Generic `readBufferWithLimit` defaults to **500 KB** (`stream.ts:55-63`).

**Multipart/resumable path (`createBlobUpload` + `commitBlobUpload`):** client uploads chunks directly to object storage via presigned URLs. Large files flow through this path; server only coordinates.

**Implications:** AFFiNE buffered approach is basically OK's current design, with one improvement (quota enforced per-chunk so rejection is fast). The architectural "right answer" for large files is their resumable path — same pattern as Outline.

### Finding: Docmost streams Fastify multipart straight to storage, no buffer.
**Confidence:** CONFIRMED
**Evidence:** [Docmost attachment.service.ts](https://github.com/docmost/docmost/blob/main/apps/server/src/core/attachment/services/attachment.service.ts), [attachment.controller.ts](https://github.com/docmost/docmost/blob/main/apps/server/src/core/attachment/attachment.controller.ts), [environment.service.ts](https://github.com/docmost/docmost/blob/main/apps/server/src/integrations/environment/environment.service.ts)

```ts
// attachment.service.ts:53-55
const preparedFile = await prepareFile(filePromise, { skipBuffer: true });
// ...
// :87-91
const { stream, getBytesRead } = createByteCountingStream(preparedFile.multiPartFile.file);
await this.uploadToDrive(filePath, stream);
// :94
fileSize = getBytesRead();
```

`skipBuffer: true` keeps the Fastify multipart file stream unbuffered; it's piped through a byte-counting transform straight into the storage driver (`uploadToDrive`). Bytes never fully materialize in the Node heap.

**Caps.** Default **50 MB**, env-configurable: `FILE_UPLOAD_SIZE_LIMIT = '50mb'` (`environment.service.ts:86-88`). Passed to `limits: { fileSize: maxFileSize, fields: 3, files: 1 }` on `req.file({ limits: {...} })` (`attachment.controller.ts:95-97`). Avatars hard-capped at 10 MB.

**Error handling.** 413 → `BadRequestException('File too large. Exceeds the ${limit} limit')` thrown at both the `req.file` catch and post-write check (`attachment.controller.ts:98-104`, `155-163`).

**Implications:** Docmost is the architecturally cleanest model for OK to copy — it owns the HTTP body, streams it through a byte-counter into storage, and classifies errors at the multipart boundary. This is the target shape.

### Finding: HedgeDoc buffers to memory via multer's default `memoryStorage`.
**Confidence:** CONFIRMED
**Evidence:** [HedgeDoc media.controller.ts](https://github.com/hedgedoc/hedgedoc/blob/develop/backend/src/api/private/media/media.controller.ts), [media.service.ts](https://github.com/hedgedoc/hedgedoc/blob/develop/backend/src/media/media.service.ts)

```ts
// media.controller.ts:91
return await this.mediaService.saveFile(file.originalname, file.buffer, userId, noteId);
```

`file.buffer` is multer's memoryStorage output — entire file in Node heap. Service signature: `saveFile(fileName, fileBuffer: Buffer, ...)` (`media.service.ts:102-107`). `FileType.fromBuffer(fileBuffer)` detection runs on the buffer (`media.service.ts:109`).

**Caps.** Not located in survey scope. v1.x used `uploads.max_size`; v2 rewrite's cap is likely in a module provider not inspected.

**Implications:** Same anti-pattern as OK's current handler. No lesson worth adopting.

### Finding: SilverBullet has NO upload cap at the server layer.
**Confidence:** CONFIRMED
**Evidence:** [SilverBullet fs.go](https://github.com/silverbulletmd/silverbullet/blob/main/server/fs.go), [disk_space_primitives.go](https://github.com/silverbulletmd/silverbullet/blob/main/server/disk_space_primitives.go)

```go
// server/fs.go:97
body, err := io.ReadAll(r.Body)
// :104
spaceConfig.SpacePrimitives.WriteFile(path, body, ...)
// server/disk_space_primitives.go:262
os.WriteFile(localPath, data, 0644)
```

`io.ReadAll` has no limit and no `http.MaxBytesReader` wrapper. A gigabyte request allocates a gigabyte.

**Implications:** Deployment relies on reverse-proxy / container-runtime limits. SilverBullet accepts the same memory risk OK currently has but with no application-layer guard at all. This is a data point, not a recommendation.

### Finding: TinaCMS multer is streaming (`diskStorage`) but has no `limits:` configured.
**Confidence:** CONFIRMED
**Evidence:** [TinaCMS CLI server routes](https://github.com/tinacms/tinacms/blob/main/packages/%40tinacms/cli/src/server/routes/index.ts), [Cloudinary handler](https://github.com/tinacms/tinacms/blob/main/packages/next-tinacms-cloudinary/src/handlers.ts)

```js
// packages/@tinacms/cli/src/server/routes/index.ts:17-41
const storage = multer.diskStorage({
  destination: mediaFolder,
  filename: (req, file, cb) => { ... }
});
const upload = multer({ storage });  // no limits: {...}
```

`multer.diskStorage` pipes the stream directly to the destination (that IS the final path — no temp+rename).

**Implications:** TinaCMS confirms the "stream to disk" shape is the industry default when you're not using presigned URLs. Absence of `limits:` is a practical risk, not a recommendation.

### Finding: All local-first editors (Obsidian, Logseq, Foam, Zettlr) copy via OS filesystem, no HTTP upload path.
**Confidence:** CONFIRMED
**Evidence:**
- [Obsidian DataAdapter.writeBinary](https://docs.obsidian.md/Reference/TypeScript+API/DataAdapter/writeBinary) — `writeBinary(normalizedPath, data: ArrayBuffer, options?)` — native Electron/Capacitor, no HTTP.
- [Logseq assets.cljs](https://github.com/logseq/logseq/blob/master/src/main/frontend/handler/assets.cljs) — local path uses `fs/write-asset-file!` (line 277). Optional RTC sync uses `http/put put-url` (line 320) with presigned URL — same pattern as Outline.
- Foam — VS Code `workspace.fs.writeFile(uri, Uint8Array)` via extension host API.
- [Zettlr assets service](https://github.com/Zettlr/Zettlr/blob/master/source/app/service-providers/assets/index.ts) — `fs.copyFile(source, target)` at `:346`, `fs.rename` at `:300`, `fs.writeFile` at `:269`. All Node FS in Electron main.

**Implications:** The architectural claim holds verbatim. Local-first editors face ZERO upload-memory pressure because they never read bytes into their process — the OS copies the file. OK is structurally different (client-server, HTTP multipart), so OK cannot borrow their "no cap" freedom without a different architecture (streaming, per Docmost).

### Finding: Obsidian's `writeBinary` has documented memory issues on large files (buffer-based API).
**Confidence:** INFERRED
**Evidence:** Obsidian `DataAdapter.writeBinary(data: ArrayBuffer)` signature (official docs above) + community bug reports (forum.obsidian.md) reporting `adapter.writeBinary` on large files "never resolves and repeatedly appends data" on Android.

**Implications:** Even Obsidian's architecturally-advantaged local-first model hits buffer-based limits when the plugin API forces a full `ArrayBuffer` through the renderer process. The streaming vs buffer distinction is a general architectural lesson, not OK-specific.

---

## Peer comparison table

| Editor | Transport | Library | Stream or buffer | User cap | Temp-file strategy | Dedup/hash |
|---|---|---|---|---|---|---|
| Outline | Presigned S3 POST | `@aws-sdk/s3-presigned-post` | N/A — server never sees bytes | 1 MB default, env-tunable | N/A | None visible; ID-based S3 keys |
| AFFiNE (`setBlob`) | HTTP multipart (GraphQL Upload) | `graphql-upload` | **Buffer-to-memory** with streaming quota interrupt | 500 KB generic / per-workspace quota | None (direct storage provider put) | Client-provided content-hash filename |
| AFFiNE (resumable) | Presigned URLs, client→storage | Custom `createBlobUpload`/`commitBlobUpload` | N/A — server coordinates only | Per-workspace quota | N/A | Client-provided |
| Docmost | HTTP multipart (Fastify) | `@fastify/multipart` | **Streams to storage** (`skipBuffer: true`) | 50 MB default, env-tunable | Not visible; driver-dependent | None; UUIDv7 IDs |
| HedgeDoc | HTTP multipart | `multer` (memoryStorage) | **Buffer-to-memory** | Not located | Driver-dependent (filesystem/imgur/S3/…) | None; UUIDv7 |
| SilverBullet | HTTP PUT (raw body) | Go `io.ReadAll` | **Buffer-to-memory, unbounded** | **NONE** | None (direct `os.WriteFile`) | None |
| TinaCMS (self-hosted) | HTTP multipart | `multer` (diskStorage) | **Streams to disk** | **NONE** (`limits:` not set) | Directly to final dest (not atomic) | None |
| Obsidian | OS filesystem | Electron/Capacitor native | Buffer (ArrayBuffer API) | None documented | N/A (OS handles) | N/A |
| Logseq (local) | OS filesystem | ClojureScript `fs/write-asset-file!` | Native FS | None | N/A | Client-side checksum (`checksum` param) |
| Logseq (RTC) | Presigned URL, client→storage | `cljs-http-missionary` PUT | Client→storage direct | Server policy | N/A | Client-computed checksum |
| Foam | VS Code FS API | Extension host `workspace.fs.writeFile` | Native FS | None | N/A | None |
| Zettlr | OS filesystem | `node:fs.copyFile` / `fs.rename` | Native FS (zero-copy where supported) | None | Same-fs atomic rename | None |

---

## Gaps / follow-ups

- HedgeDoc v2's actual upload cap location not located in the inspected files. Likely in a NestJS pipe/interceptor; not load-bearing for OK's decision.
- Outline's dedup strategy (if any) is invisible in the inspected path — key naming is ID-based. The conceptual pattern "content-hash dedup" does not appear in any surveyed peer's upload handler.
- AFFiNE's resumable path internals not inspected in detail; the single-shot path is sufficient to characterize the "buffer with quota interrupt" pattern.

---

## Headline synthesis

**The architectural claim holds with nuance.** Local-first editors (Obsidian, Logseq-local, Foam, Zettlr) face zero upload-memory pressure because bytes move browser/process → disk via OS file APIs, not HTTP multipart. OK's memory pressure is architectural — client-server + HTTP multipart means OK must read the HTTP body.

**Among client-server peers, strategies split three ways:**
1. **Presigned URL** (Outline, AFFiNE resumable, Logseq RTC) — server never sees bytes. Cap enforced by storage policy.
2. **Stream to storage** (Docmost) — server pipes Fastify multipart `file` stream straight into storage driver, no buffer. Cap enforced at multipart `limits:`. **This is OK's target architecture.**
3. **Buffer to memory** (HedgeDoc, AFFiNE single-shot, SilverBullet, and OK today) — full request body in Node heap before write. Cap mandatory as OOM guard.

**Caps where they exist** cluster at 1 MB (Outline) → 10 MB (Docmost avatar) → 25 MB (OK current default) → 50 MB (Docmost default). **SilverBullet has no cap at all** and relies on the reverse proxy — not an approach worth copying (deployment-dependent, unauditable).

**Temp-file + atomic rename at the application layer is rare.** TinaCMS writes to the final dest directly (not atomic). Docmost delegates to the storage driver. Only OK's existing markdown persistence path (`packages/server/src/persistence.ts:482-485`) uses the `<path>.tmp.<uuid>` + `rename` pattern — the precedent is internal, not peer-inherited.
