# Evidence: D5 — Temp-file lifecycle

**Dimension:** Where to write temp files (OS tmp vs contentDir-local vs destination-dir); cleanup on success/error/abort; orphan recovery.
**Date:** 2026-04-22
**Sources:** multer, @fastify/multipart, formidable, write-file-atomic, OK's existing persistence patterns.

---

## Key findings

### Finding: Four placement options surveyed; `<contentDir>/.open-knowledge/tmp/` wins on atomicity + observability.
**Confidence:** CONFIRMED

| Option | Pro | Con |
|---|---|---|
| **1. OS tmp (`os.tmpdir()`)** | Default for busboy README, multer, formidable, @fastify/multipart. Linux tmpfs = fast writes. | **Critical:** `EXDEV` on `rename()` when `/tmp` is a different mount (common: Linux tmpfs, Docker, Windows). Fallback is copy+unlink, which doubles disk I/O and loses atomicity. Not visible to OK's startup orphan-scan. |
| **2. `<contentDir>/.open-knowledge/tmp/`** | Same filesystem as final dest → `rename()` always atomic, no EXDEV. Visible to existing OK sweep surface (`.open-knowledge/` already contains `server.lock`, `conflicts.json`, shadow repo per `packages/server/src/{server-lock,conflict-storage,shadow-repo}.ts`). Matches OK's convention for internal state. | Requires `mkdirSync(..., {recursive: true})` on first upload (trivial). |
| **3. Destination dir + `.upload-*` prefix** | Same-fs rename. Matches `persistence.ts:482-485` `<path>.tmp.<uuid>` + `rename` pattern. | Failed upload leaves `.upload-*` visible to file browser / git / sidebar until cleanup. Sidebar file-watcher sees create+delete churn. Higher-frequency churn than option 2. |
| **4. In-memory (current)** | None relevant | Buffer-to-memory = the bug we're fixing. |

### Finding: `write-file-atomic` uses same-directory tempfile + rename, with error-path unlink.
**Confidence:** CONFIRMED
**Evidence:** [npm/write-file-atomic README](https://github.com/npm/write-file-atomic)

> "The file is initially named `filename + "." + murmurhex(__filename, process.pid, ++invocations)`."
>
> "If it encounters errors at any of these steps it will attempt to unlink the temporary file and then pass the error back to the caller."

In-memory invocation counter ensures unique tempfile names across concurrent writes to the same target.

### Finding: multer, @fastify/multipart, formidable all handle cleanup differently but converge on "always cleanup temp on failure."
**Confidence:** CONFIRMED

- **multer**: `_removeFile(req, file, cb)` → `fs.unlink(file.path, cb)`, called by multer core on request error. On success, no cleanup — the file IS the final file.
- **@fastify/multipart**: [`onResponse` hook](https://github.com/fastify/fastify-multipart/blob/master/index.js#L355-L357) → `request.cleanRequestFiles()` iterates stored temp paths and `unlink`s each with error logging. Runs on any response, 2xx or 4xx/5xx.
- **formidable**: `PersistentFile.destroy()` → `this.writeStream.destroy()` → `setTimeout(() => fs.unlink(this.filepath), 1)` — the 1ms delay lets the stream fully close before unlink (avoids EBUSY on Windows).

### Finding: Industry-standard orphan recovery: boot-time scan with age threshold.
**Confidence:** CONFIRMED
**Evidence:** MinIO and SeaweedFS both scan their staging directories at startup with age-based filters (documented in their operational guides). `write-file-atomic` relies on pid+counter uniqueness rather than cleanup — OK'd for single-run but brittle across crash/restart.

OK already has a precedent:
- **`packages/server/src/server-lock.ts`** — stale-lock detection via PID liveness check + corrupt-file recovery at boot.
- **`packages/server/src/shadow-branch-gc.ts`** — GC with 24h grace period.

Same mental model transfers to orphan-tmp recovery. On server start: scan `.open-knowledge/tmp/upload-*`, unlink any older than 24h (matching shadow-branch-gc's threshold).

### Finding: OK's `persistence.ts:482-485` already uses same-directory tempfile + rename for markdown writes.
**Confidence:** CONFIRMED
**Evidence:** OK's internal precedent. The existing pattern is `<canonicalPath>.tmp.<uuid>` + `renameSync` + `unlinkSync(tmpPath)` on error. This is Option 3 applied to markdown persistence.

**Implications:** Uploads and markdown saves could share the pattern (Option 3) for symmetry. But markdown files are content-directory tenants (`.md` under the user's tree) — the `.tmp.<uuid>` briefly appearing alongside is expected collateral. Upload assets live in the same tree but via `asset-extensions` filtered by content-filter; the file-watcher sees them. Option 2 (`.open-knowledge/tmp/`) isolates upload churn entirely from the user's content dir.

---

## Recommendation

**Option 2: `<contentDir>/.open-knowledge/tmp/upload-<uuid>`.**

Rationale:
- Inherits same-filesystem atomicity for `rename()` (solves EXDEV).
- Isolates upload churn from user's content dirs (unlike Option 3, which briefly surfaces `.tmp.<uuid>` files under `docs/`).
- Parks tempfiles in the directory OK already owns and sweeps at boot (`.open-knowledge/` is home to `server.lock`, `conflicts.json`, shadow repo).
- Aligns with OK's internal-state convention.

**Lifecycle protocol:**

1. **On request entry:** `mkdirSync(tmpDir, { recursive: true })` lazily — first upload per process creates the dir.
2. **Per request:** tempfile name `upload-${randomUUID()}`. No additional suffix needed because dedup + collision handling happen at the final-path layer.
3. **On pipeline success:** `renameSync(tmpPath, finalPath)` — or `linkSync(tmpPath, finalPath)` + `unlinkSync(tmpPath)` for collision-safe atomicity (see D7 recommendation below).
4. **On pipeline error:** `try/finally` around `pipeline()` that `unlinkSync(tmpPath)` on any error. EBUSY race on Windows: `pipeline()`'s promise resolves only after all streams close, so subsequent unlink is safe.
5. **On server boot:** scan `<tmpDir>/upload-*`, unlink any file with `mtime` older than 24h. Add this to the existing boot sequence in `standalone.ts` next to `shadow-branch-gc.ts`'s trigger.

**Collision semantics at rename (important subtlety):**

OK's existing `writeUploadAtomic` loop (`api-extension.ts:373-401`) uses `openSync(dest, 'wx')` which throws `EEXIST` on collision — driving the `-1`, `-2`, …, `-99` suffix retry. In streaming refactor, `renameSync(tmpPath, destPath)` overwrites by default on POSIX — breaking the collision-retry semantic.

Two options, both atomic:

- **`linkSync(tmpPath, destPath)`** — POSIX `link(2)` atomic create-if-not-exists. Throws `EEXIST` on collision. After success, `unlinkSync(tmpPath)`. Works cross-platform. **Recommended.**
- **`renameat2(… , RENAME_NOREPLACE)`** — Linux 3.15+ only. Not portable to macOS.

The `linkSync` path preserves the existing 99-attempt retry loop semantics unchanged; only the write-buffer call (`writeSync(fd, buffer)`) swaps to `linkSync(tmpPath, testDestPath)`.

---

## Key files / references

- [multer storage/disk.js](https://github.com/expressjs/multer/blob/master/storage/disk.js)
- [fastify-multipart index.js](https://github.com/fastify/fastify-multipart/blob/master/index.js)
- [formidable PersistentFile.js](https://github.com/node-formidable/formidable/blob/master/src/PersistentFile.js)
- [write-file-atomic README](https://github.com/npm/write-file-atomic)
- OK internal: `packages/server/src/persistence.ts:482-485`, `packages/server/src/server-lock.ts`, `packages/server/src/shadow-branch-gc.ts`, `packages/server/src/api-extension.ts:373-401`

---

## Gaps / follow-ups

- **Orphan-scan perf.** For a user with 10 successful uploads mid-session that were subsequently cleaned, the tmp dir is empty on boot — scan is O(0). Worst case: process SIGKILL mid-upload bursts could leave handfuls of tempfiles; scan is O(n) where n is uncleaned count. Age threshold (24h) means stale tempfiles get reaped eventually; no growth concerns.
- **Windows `EBUSY`.** The `pipeline()` await + subsequent unlink pattern avoids the classic race. Test suite should exercise this on Windows CI if coverage warrants (currently OK CI is Linux-only via GitHub Actions `ubuntu-latest`; Windows coverage would be net-new and probably not justified for this surface).
