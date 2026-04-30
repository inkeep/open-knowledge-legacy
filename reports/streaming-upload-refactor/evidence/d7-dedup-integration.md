# Evidence: D7 — Dedup integration with streaming

**Dimension:** How `findDuplicateAsset` (currently consumes a materialized `Buffer`) integrates with streaming upload. Three options analyzed, one recommended.
**Date:** 2026-04-22
**Sources:** D1 (current-state), D4 (hash-during-stream), D5 (temp-file lifecycle), OK source code.

---

## Current dedup flow

`packages/server/src/api-extension.ts:3400`:

```ts
const existing = findDuplicateAsset(destDir, sha, buffer.length);
```

- `sha` = `sha256Hex(buffer)` computed from the in-memory buffer at line 3399.
- `buffer.length` = exact size for dedup size pre-filter.
- `findDuplicateAsset(destDir, sha, expectedSize)` at `:281` scans destDir, size-prefilters candidates, hashes each, returns match.

If match: short-circuit return `{ ok: true, src: existingBasename, deduped: true }`. Skip write.

If no match: proceed to `writeUploadAtomic(destDir, sanitized, buffer)`.

---

## Integration options under streaming

**Option A: Stream → temp file + hash-during-stream → dedup scan AFTER file lands → link temp to final (if new) or delete temp (if dedup match).**

Flow:
1. Pipeline: busboy `file` → `HashingPassThrough` → `createWriteStream(tempPath)`. Await.
2. After pipeline: `sha = hasher.digest()`, `size = hasher.byteLength()`.
3. `existing = findDuplicateAsset(destDir, sha, size)`.
4. If match: `unlinkSync(tempPath)` + return existing path + `deduped: true`.
5. If no match: `linkSync(tempPath, destPath)` (collision-safe atomic), `unlinkSync(tempPath)`. Return new path.

**Trade-off:** Worst case (dedup hit), we wrote the tempfile for nothing — wasted disk I/O equal to filesize. For OK's use case (dedup hit rate is low — "user drops the same screenshot twice" — most uploads are novel), wasted I/O is rare. Acceptable.

**Option B: Stream → tempfile + hash-during-stream → dedup scan DURING stream (by polling-ahead-of-stream).**

Requires knowing the sha before the stream completes, which requires reading the stream twice (once to peek-hash, once to store) OR caching the whole stream in memory (defeats the refactor). Not viable.

**Option C: Persistent content-hash index (`Map<sha, path>`) maintained server-side.**

Shift dedup scan from "read sibling files" to "lookup in an index." Index rebuilt at startup + maintained via DiskEvents (same primitive CC1 uses for basename index).

- Pro: O(1) dedup check, no tempfile written for dedup hits.
- Con: Meaningful new subsystem. Another in-memory index + persistence + CC1 coordination.

**Option D: Bypass dedup entirely, let the content-hash collision be the user's problem.**

Not viable. OK's SPEC §6 FR-2 + D-B LOCKED make dedup + toast a product requirement.

---

## Recommendation

**Option A.** The extra tempfile write on a dedup hit is a non-issue in practice:

- Dedup hit rate is low — "same screenshot twice" is the motivating case, not a sustained pattern. Most uploads are novel content.
- The wasted I/O is ONE tempfile write per rare collision, then immediate unlink — negligible in the context of an already-streaming I/O pattern.
- Option C's content-hash index is a real architectural primitive. Worth scoping separately (a follow-on "persistent content-hash index" spec) if dedup-hit latency ever becomes a measurable problem.

**Implementation sketch:**

```ts
// Inside the busboy 'file' handler (streaming refactor):
const hasher = new HashingPassThrough();
const tempPath = join(tmpDir, `upload-${randomUUID()}`);

await pipeline(fileStream, hasher, createWriteStream(tempPath));

const sha = hasher.digest();
const size = hasher.byteLength();

// Dedup scan (existing logic, unchanged)
const existing = findDuplicateAsset(destDir, sha, size);
if (existing) {
  await fs.promises.unlink(tempPath);
  return { ok: true, src: existing, deduped: true, path: destDirRelative(existing) };
}

// Atomic collision-safe rename via linkSync + unlinkSync
const finalPath = await linkTempToFinalWithCollisionRetry(tempPath, destDir, sanitized);
return { ok: true, src: basename(finalPath), deduped: false, path: finalPath };
```

**Key subtlety — atomic rename collision loop:** POSIX `rename(2)` overwrites by default. OK's current `writeUploadAtomic` uses `openSync(dest, 'wx')` which throws `EEXIST` on collision — driving the `-1`, `-2`, …, `-99` suffix retry. In streaming refactor, replace `openSync + writeSync` with `linkSync(tempPath, testDestPath)`:

```ts
function linkTempToFinalWithCollisionRetry(
  tempPath: string, destDir: string, sanitized: string,
): Promise<string> {
  const ext = extname(sanitized);
  const stem = basename(sanitized, ext);

  for (let i = 0; i <= 99; i++) {
    const candidate = i === 0 ? sanitized : `${stem}-${i}${ext}`;
    const candidatePath = join(destDir, candidate);
    try {
      linkSync(tempPath, candidatePath);   // atomic create-if-not-exists
      unlinkSync(tempPath);                // success: tempfile consumed by link
      return candidatePath;
    } catch (err) {
      if (err.code === 'EEXIST') continue; // collision: try next suffix
      try { unlinkSync(tempPath); } catch {}
      throw err;                            // other error: propagate
    }
  }
  throw new UploadWriteError('collision-exhaustion');
}
```

`linkSync` is atomic across POSIX and works cross-platform. The retry semantic (99 attempts) is identical to the existing code.

---

## Key files / references

- OK source: `packages/server/src/api-extension.ts:281-371, :373-401, :3399-3444`
- Node.js `fs.linkSync`: https://nodejs.org/api/fs.html#fslinksyncexistingpath-newpath
- D1, D4, D5 evidence files (this report)

---

## Gaps / follow-ups

- **Persistent content-hash index** (Option C) worth a separate spec if the "tempfile-for-dedup-hit" cost is ever measured as latency-material. For now: Option A is strictly simpler and the pattern is reversible.
- **Cross-device `link(2)` failure (EXDEV).** `linkSync` fails with `EXDEV` if tmp and dest are on different mounts — same vulnerability as `rename`. Option 2 (D5 recommendation: tempfile in `.open-knowledge/tmp/`) puts both under `contentDir` so same-mount is guaranteed. The refactor's init asserts `statSync(tmpDir).dev === statSync(destDir).dev` at server start as a defensive check. If someone bind-mounts `.open-knowledge/` differently, fail loud at init rather than at upload time.
