/**
 * Yjs binary sidecar — disposable recovery cache alongside the canonical
 * markdown file. See `reports/crdt-server-restart-recovery/REPORT.md` for
 * the full architecture rationale (Jupyter RTC's `.jupyter_ystore.db`
 * pattern, ported onto Hocuspocus's content dir).
 *
 * Layout on disk (per docName):
 *
 *   <contentDir>/<docName>.md                  ← canonical markdown (precedent #1)
 *   <contentDir>/.open-knowledge/ystate/<docName>.bin   ← this sidecar
 *
 * Byte format:
 *
 *   [4 bytes: big-endian uint32 = header JSON length N]
 *   [N bytes: UTF-8 JSON conforming to SidecarHeader]
 *   [M bytes: Y.encodeStateAsUpdate(doc) output]
 *
 * A fixed-width length prefix (4 bytes vs. varint) keeps parsing trivial
 * and aligns with Jupyter's own header-length precedent. At N < 4 GiB
 * the uint32 ceiling is forever-sufficient for a header of this size.
 *
 * Load semantics:
 *
 * - Corrupt header → return `null`, caller falls through to markdown.
 * - Version mismatch (yjs major or schema version bump) → return `null`,
 *   log a structured event, caller falls through.
 * - `Y.applyUpdate` hang (open Yjs #479 case; documented in research
 *   evidence/d2-yjs-format-durability.md) → defended by a 1s
 *   `Promise.race` timeout; returned as `null` with a load-failed log.
 * - Post-apply assertion (caller's responsibility) can still delete the
 *   sidecar via `deleteSidecar` and fall through — that's Commit 6's
 *   divergence-handling path.
 *
 * STOP: the sidecar IS NOT source of truth. Markdown is (precedent #1).
 * `writeSidecar` failures must NEVER bubble up and fail the L1 cycle —
 * callers should try/catch and log at warn.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as Y from 'yjs';
import { z } from 'zod';

/**
 * Relative path the sidecar lives in under `contentDir`. Matches the
 * Jupyter RTC `.jupyter_ystore.db` convention of keeping recovery state
 * out of the user's content listing + git working tree.
 */
export const SIDECAR_DIR = '.open-knowledge/ystate';

/**
 * Current Yjs version this codebase ships. Bumping Yjs MAJOR is a
 * sidecar-format break (binary layout is version-coupled) — CI should
 * read this constant and alert on diff.
 *
 * Keep in lock-step with `packages/server/package.json` yjs dep and the
 * `reports/crdt-server-restart-recovery/evidence/d2-yjs-format-durability.md`
 * research notes. Downgrading is never supported — a major shift means
 * all existing sidecars get nulled on load.
 */
export const CURRENT_YJS_VERSION = '13.6.30';

/** Bump when the header schema itself changes shape (field added/removed). */
export const CURRENT_SCHEMA_VERSION = 1;

/** Current format variant — bump if the body encoding changes. */
export const CURRENT_FORMAT_VARIANT = 'v1' as const;

/**
 * Timeout on the post-load `Y.applyUpdate` call. Defends against open Yjs
 * issue #479 (infinite loop on malformed updates). 1000ms is generous —
 * a legitimate update for doc sizes we ship (tens of KB) should apply in
 * under 10ms.
 */
const APPLY_UPDATE_TIMEOUT_MS = 1000;

/**
 * Zod schema for the sidecar header. All fields are required in v1 so
 * future-reader code can't silently accept a malformed file as current.
 *
 * Field guidance:
 * - `yjsVersion`: the Yjs semver this sidecar was written with. A reader
 *   on a newer MAJOR refuses (returns null); the reader on the same
 *   MAJOR accepts and applies.
 * - `formatVariant`: literal identifier to distinguish format families
 *   (v1 = plain update encoding; a future v2 might be delta log).
 * - `schemaVersion`: bumps when the header JSON's own shape changes.
 *   Decoupled from `formatVariant` so we can evolve header metadata
 *   without changing body encoding.
 * - `writtenAt`: ISO 8601 timestamp for observability. Not used to
 *   decide validity.
 * - `clientIdToWriter`: optional map for the future attribution-clean-up
 *   feature (out-of-scope for v1, included as a forward-compat hint).
 */
export const SidecarHeaderSchema = z.object({
  yjsVersion: z.string(),
  formatVariant: z.literal('v1'),
  schemaVersion: z.number().int(),
  writtenAt: z.string(),
  clientIdToWriter: z.record(z.string(), z.string()).optional(),
});

export type SidecarHeader = z.infer<typeof SidecarHeaderSchema>;

function sidecarPathFor(contentDir: string, docName: string): string {
  return join(contentDir, SIDECAR_DIR, `${docName}.bin`);
}

function headerBuffer(header: SidecarHeader): Buffer {
  return Buffer.from(JSON.stringify(header), 'utf-8');
}

function withLengthPrefix(header: Buffer, body: Uint8Array): Buffer {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(header.byteLength, 0);
  return Buffer.concat([prefix, header, Buffer.from(body)]);
}

/**
 * Atomically write the sidecar for `docName`. Writes to a `.tmp.<uuid>`
 * sibling, then renames — the same pattern persistence uses for markdown.
 * Atomicity matters less here (sidecars are disposable) but keeps the
 * operation crash-safe: a partial write can never be mistaken for a
 * valid file.
 *
 * `crypto.randomUUID()` for the tmp suffix is intentional — avoids
 * collisions under concurrent writers (test harness, agent flood).
 */
export async function writeSidecar(contentDir: string, docName: string, doc: Y.Doc): Promise<void> {
  const path = sidecarPathFor(contentDir, docName);
  await mkdir(dirname(path), { recursive: true });
  const header: SidecarHeader = {
    yjsVersion: CURRENT_YJS_VERSION,
    formatVariant: CURRENT_FORMAT_VARIANT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    writtenAt: new Date().toISOString(),
  };
  const headerBytes = headerBuffer(header);
  const bodyBytes = Y.encodeStateAsUpdate(doc);
  const full = withLengthPrefix(headerBytes, bodyBytes);

  const tmpPath = `${path}.tmp.${crypto.randomUUID()}`;
  try {
    await writeFile(tmpPath, full);
    await rename(tmpPath, path);
  } catch (err) {
    // Best-effort cleanup of the orphaned tmp file.
    try {
      await unlink(tmpPath);
    } catch {
      // Already gone, or permissions — nothing more we can do.
    }
    throw err;
  }
}

/**
 * Shape returned from `readSidecar` on happy path. Callers typically:
 *   1. `Y.applyUpdate(liveDoc, result.doc)` via the wrapper `applyFn`.
 *   2. Assert post-apply invariants (disk markdown ≡ fragment serialize).
 *   3. On failure, call `deleteSidecar` and fall through to markdown.
 *
 * We return the raw body as `bodyBytes` (not a pre-constructed Y.Doc) so
 * the caller decides which live doc to apply into — Hocuspocus owns the
 * live Y.Doc identity and we don't want to build a disposable copy.
 */
export interface SidecarReadResult {
  header: SidecarHeader;
  bodyBytes: Uint8Array;
  /**
   * Apply the sidecar body to `doc`, wrapped in a 1s timeout + try/catch.
   * Resolves to `true` on clean apply, `false` on timeout or throw.
   * Commit 6 uses the return value to decide between "proceed with
   * post-apply assertion" and "delete sidecar, fall through to markdown."
   */
  applyFn: (doc: Y.Doc) => Promise<boolean>;
}

/**
 * Read the sidecar for `docName`, validate the header, and return a
 * result object with the body bytes + a bounded-apply helper.
 *
 * Returns `null` when:
 *   - The sidecar file doesn't exist.
 *   - The file is truncated (length prefix > file size).
 *   - The header JSON is unparseable or fails Zod validation.
 *   - The `formatVariant` is not `'v1'` (future-incompatible).
 *   - The `yjsVersion` major digit mismatches ours (hard break).
 *
 * Does NOT fail for a minor/patch Yjs skew — Yjs guarantees forward-
 * compat within a major. `applyFn` is the place where real apply
 * failures (timeout, throw) surface.
 */
export async function readSidecar(
  contentDir: string,
  docName: string,
): Promise<SidecarReadResult | null> {
  const path = sidecarPathFor(contentDir, docName);
  if (!existsSync(path)) return null;

  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    return null;
  }
  if (bytes.byteLength < 4) return null;

  const headerLen = bytes.readUInt32BE(0);
  if (headerLen <= 0 || 4 + headerLen > bytes.byteLength) return null;

  let parsedHeader: unknown;
  try {
    parsedHeader = JSON.parse(bytes.subarray(4, 4 + headerLen).toString('utf-8'));
  } catch {
    return null;
  }

  const headerParse = SidecarHeaderSchema.safeParse(parsedHeader);
  if (!headerParse.success) return null;
  const header = headerParse.data;

  // Hard break on Yjs MAJOR mismatch. Minor/patch skew is Yjs-forward-compat
  // territory — don't reject it here. Splitting on '.' is sufficient given
  // semver major-only comparison; pinning to string equality would force
  // operators to bump this file on every Yjs patch.
  const headerMajor = header.yjsVersion.split('.')[0];
  const currentMajor = CURRENT_YJS_VERSION.split('.')[0];
  if (headerMajor !== currentMajor) return null;

  if (header.schemaVersion > CURRENT_SCHEMA_VERSION) {
    // Future header from a newer writer — we might not know every field.
    // Conservative: refuse. This mirrors the Zod strict-parse behavior for
    // header fields we know about.
    return null;
  }

  const bodyBytes = new Uint8Array(bytes.subarray(4 + headerLen));

  const applyFn = async (doc: Y.Doc): Promise<boolean> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          Y.applyUpdate(doc, bodyBytes);
          resolve();
        }),
        new Promise<void>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('sidecar applyUpdate exceeded timeout'));
          }, APPLY_UPDATE_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  return { header, bodyBytes, applyFn };
}

/**
 * Remove the sidecar for `docName`. Silently no-ops when the file is
 * already absent — callers treat a missing sidecar as benign (fresh
 * cache, or a prior delete). Any other error is logged by the caller.
 */
export async function deleteSidecar(contentDir: string, docName: string): Promise<void> {
  const path = sidecarPathFor(contentDir, docName);
  try {
    await unlink(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return;
    throw err;
  }
}

/**
 * Remove EVERY sidecar under `contentDir`. Used by Commit 7's branch-
 * switch composition: when HEAD moves across branches, all sidecars go
 * stale (content forks) so we wipe the directory. Fresh sidecars
 * regenerate on the next L1 debounce.
 *
 * No-op when the sidecar dir doesn't exist. Non-recursive delete via
 * `rm { recursive: true }` so subdirectory sidecars (future hierarchical
 * layout) are also caught.
 */
export async function deleteSidecarsForBranch(contentDir: string): Promise<void> {
  const dir = join(contentDir, SIDECAR_DIR);
  if (!existsSync(dir)) return;
  // Blow away the entire ystate/ directory. Faster and simpler than
  // readdir + unlink per entry, and tolerant of subdirectories.
  await rm(dir, { recursive: true, force: true });
  // Recreate the empty dir so subsequent writeSidecar calls don't race
  // on mkdir creation under concurrent L1 flushes.
  await mkdir(dir, { recursive: true });
}

/**
 * List the basenames of sidecars currently on disk. Used by tests to
 * verify write/delete behavior without reaching into the private
 * `sidecarPathFor` helper. Returns doc names (without `.bin` suffix).
 */
export async function listSidecars(contentDir: string): Promise<string[]> {
  const dir = join(contentDir, SIDECAR_DIR);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  return entries.filter((e) => e.endsWith('.bin')).map((e) => e.slice(0, -'.bin'.length));
}
