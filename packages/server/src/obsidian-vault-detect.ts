/**
 * Non-destructive Obsidian vault detection. SPEC §6 FR-4.
 *
 * If `<contentDir>/.obsidian/app.json` exists, parse it and return a partial
 * UploadConfig that mirrors the user's Obsidian "Files & Links" preferences.
 * Never writes to disk, never touches `.open-knowledge/config.yml` — the
 * caller (server boot) merges the partial into the user's authoritative
 * config, with user config winning on key conflicts.
 *
 * Schema source: evidence/inv1-obsidian-app-json-schema.md (7 sampled real
 * vaults plus community plugin source). Three target fields:
 *
 *   attachmentFolderPath  string   default "/"           1:1 passthrough (D-J)
 *   useMarkdownLinks      boolean  default false         maps to emitFormat
 *   newLinkFormat         string   default "shortest"    surfaced but unused
 *
 * Symlink safety: realpath-checks the json file against contentDir to keep
 * the upload-handler symlink-escape posture (R8). Returns null on missing
 * file (silent — "not an Obsidian vault"), and on parse error after a WARN
 * log so operators see the bad bytes without losing boot.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { EmitFormat, UploadConfig } from '@inkeep/open-knowledge-core';

/**
 * Subset of `.obsidian/app.json` fields we map. Surfaced separately so tests
 * can match on shape without consulting the parser.
 */
export interface ObsidianAppJson {
  attachmentFolderPath?: string;
  useMarkdownLinks?: boolean;
  newLinkFormat?: 'shortest' | 'relative' | 'absolute';
}

export type ObsidianVaultPartialConfig = Partial<
  Pick<UploadConfig, 'attachmentFolderPath' | 'emitFormat'>
> & {
  /** Surfaced for downstream consumers; OK does not act on it today. */
  newLinkFormat?: ObsidianAppJson['newLinkFormat'];
};

/** Resolve real path of a candidate file, returning null if it escapes the bound dir. */
function realPathWithinBoundary(candidatePath: string, boundary: string): string | null {
  let realCandidate: string;
  try {
    realCandidate = realpathSync(candidatePath);
  } catch {
    return null;
  }
  let realBoundary: string;
  try {
    realBoundary = realpathSync(boundary);
  } catch {
    realBoundary = boundary;
  }
  return realCandidate === realBoundary || realCandidate.startsWith(`${realBoundary}${sep}`)
    ? realCandidate
    : null;
}

/**
 * Read and parse `<contentDir>/.obsidian/app.json` and map the relevant
 * fields to a partial UploadConfig. Returns null when the vault marker
 * is absent or any safety check fails — callers should treat null as
 * "use defaults from the user's own config."
 */
export function detectObsidianVault(contentDir: string): ObsidianVaultPartialConfig | null {
  const resolvedContent = resolve(contentDir);
  const appJsonPath = resolve(resolvedContent, '.obsidian', 'app.json');

  if (!existsSync(appJsonPath)) return null;

  // Symlink-escape: refuse to read if .obsidian/app.json resolves outside contentDir.
  if (realPathWithinBoundary(appJsonPath, resolvedContent) === null) {
    console.warn(
      JSON.stringify({
        event: 'obsidian-vault-detect',
        reason: 'symlink-escape',
        path: appJsonPath,
      }),
    );
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(appJsonPath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify({
        event: 'obsidian-vault-detect',
        reason: 'read-failed',
        path: appJsonPath,
        message,
      }),
    );
    return null;
  }

  let parsed: ObsidianAppJson;
  try {
    parsed = JSON.parse(raw) as ObsidianAppJson;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify({
        event: 'obsidian-vault-detect',
        reason: 'parse-error',
        path: appJsonPath,
        message,
      }),
    );
    return null;
  }

  const partial: ObsidianVaultPartialConfig = {};

  if (typeof parsed.attachmentFolderPath === 'string' && parsed.attachmentFolderPath.length > 0) {
    // D-J: free-form 1:1 passthrough. We DO NOT translate `"/"` (Obsidian's
    // vault-root sentinel) to anything else — the operator may have OK and
    // Obsidian configured to point at the same vault root.
    partial.attachmentFolderPath = parsed.attachmentFolderPath;
  }

  if (typeof parsed.useMarkdownLinks === 'boolean') {
    const emit: EmitFormat = parsed.useMarkdownLinks ? 'markdown-image' : 'wikiembed';
    partial.emitFormat = emit;
  }

  if (
    typeof parsed.newLinkFormat === 'string' &&
    (parsed.newLinkFormat === 'shortest' ||
      parsed.newLinkFormat === 'relative' ||
      parsed.newLinkFormat === 'absolute')
  ) {
    // Surfaced for downstream tooling; OK uses Foam-style shortest by
    // default and does not yet branch on this value.
    partial.newLinkFormat = parsed.newLinkFormat;
  }

  return partial;
}
