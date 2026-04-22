/**
 * Desktop-main helper — resolve a project's `upload.*` config for the
 * utilityProcess boot. Mirrors the user-first merge shipped in both the
 * CLI (`packages/cli/src/commands/start.ts`) and the Vite dev plugin
 * (`packages/app/src/server/hocuspocus-plugin.ts`) so desktop users get
 * the same behavior from `.open-knowledge/config.yml` and
 * `.obsidian/app.json`.
 *
 * Pre-Major-2 fix: window-manager forked the utility without
 * `uploadConfig`, so `getUploadConfig` in the server returned
 * `DEFAULT_UPLOAD_CONFIG` and desktop silently ignored every operator
 * override + every Obsidian vault setting. SPEC M2 and M5 regressed on
 * Electron with no log signal.
 *
 * Loose YAML parse (not cli's Zod schema) to avoid an app → cli
 * workspace dependency. The types stay honest via `PartialUserUploadConfig`
 * from core — anything that doesn't match the expected shape is silently
 * dropped at the user > vault > default resolver step, matching the
 * dev-plugin semantics.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type PartialUserUploadConfig,
  resolveUploadConfig,
  type UploadConfig,
} from '@inkeep/open-knowledge-core';
import { detectObsidianVault } from '@inkeep/open-knowledge-server';
import { parse as parseYaml } from 'yaml';

/**
 * Extract the user's `upload.*` partial from `<projectPath>/.open-knowledge/config.yml`.
 * Missing / malformed file → empty partial (every field remains undefined
 * so resolveUploadConfig falls through to the vault partial / default).
 */
function loadUserUploadPartial(projectPath: string): PartialUserUploadConfig {
  const configPath = resolve(projectPath, '.open-knowledge', 'config.yml');
  if (!existsSync(configPath)) return {};
  let parsed: unknown;
  try {
    const raw = readFileSync(configPath, 'utf-8');
    parsed = parseYaml(raw);
  } catch {
    // Malformed YAML — fall through to defaults, don't crash the boot.
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const upload = (parsed as Record<string, unknown>).upload;
  if (!upload || typeof upload !== 'object') return {};
  const u = upload as Record<string, unknown>;

  const out: PartialUserUploadConfig = {};
  if (typeof u.attachmentFolderPath === 'string') {
    out.attachmentFolderPath = u.attachmentFolderPath;
  }
  if (u.emitFormat === 'wikiembed' || u.emitFormat === 'markdown-image') {
    out.emitFormat = u.emitFormat;
  }
  // Desktop mirror of the CLI loader deprecation WARN — post-streaming
  // (2026-04-22) `upload.maxBytes` is removed; legacy configs still carrying
  // the key parse cleanly here (we silently drop it) but we surface a one-
  // time note so users can clean up `config.yml`. See
  // reports/streaming-upload-refactor/REPORT.md §D8.
  if (u.maxBytes !== undefined) {
    console.warn(
      '[desktop] upload.maxBytes is deprecated and ignored — streaming uploads have no user-facing cap. Remove the key to silence this warning.',
    );
  }
  const dedup = u.dedup as Record<string, unknown> | undefined;
  if (dedup && typeof dedup === 'object') {
    const dedupPartial: PartialUserUploadConfig['dedup'] = {};
    if (dedup.mode === 'off' || dedup.mode === 'same-dir') {
      dedupPartial.mode = dedup.mode;
    }
    if (dedup.ui === 'silent' || dedup.ui === 'toast' || dedup.ui === 'confirm') {
      dedupPartial.ui = dedup.ui;
    }
    if (Object.keys(dedupPartial).length > 0) out.dedup = dedupPartial;
  }
  if (Array.isArray(u.wikiEmbedExtensions)) {
    const valid = (u.wikiEmbedExtensions as unknown[]).filter(
      (e): e is string => typeof e === 'string',
    );
    out.wikiEmbedExtensions = valid;
  }
  return out;
}

/**
 * Compose the fully-resolved `UploadConfig` the utilityProcess should
 * boot with. Precedence: user (`.open-knowledge/config.yml`) >
 * vault (`.obsidian/app.json`) > DEFAULT_UPLOAD_CONFIG.
 */
export function loadResolvedUploadConfig(projectPath: string): UploadConfig {
  const userPartial = loadUserUploadPartial(projectPath);
  const vaultPartial = detectObsidianVault(projectPath);
  return resolveUploadConfig(userPartial, vaultPartial);
}
