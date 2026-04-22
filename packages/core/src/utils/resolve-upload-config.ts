import { DEFAULT_UPLOAD_CONFIG, type UploadConfig } from '../constants/upload.ts';

/**
 * Shape of a user's `upload.*` config as it arrives from YAML: every field
 * is optional because two of the six (`attachmentFolderPath`, `emitFormat`)
 * have no Zod default, and the rest might be absent when the schema hasn't
 * materialized defaults (e.g. the Vite dev plugin parses YAML directly).
 */
export interface PartialUserUploadConfig {
  attachmentFolderPath?: string;
  emitFormat?: UploadConfig['emitFormat'];
  maxBytes?: number;
  dedup?: {
    mode?: UploadConfig['dedup']['mode'];
    ui?: UploadConfig['dedup']['ui'];
  };
  wikiEmbedExtensions?: readonly string[];
}

/**
 * Resolve a concrete {@link UploadConfig} from an optional user partial and
 * an optional vault-detected partial.
 *
 * Precedence (US-018): `user ?? vault ?? default` — user's explicit config
 * wins over any Obsidian vault detection; vault fills in where the user was
 * silent; hardcoded defaults are the final fallback.
 *
 * Only `attachmentFolderPath` and `emitFormat` accept vault input — those
 * are the fields `detectObsidianVault` maps from `.obsidian/app.json`. The
 * other four fields (`maxBytes`, `dedup.mode`, `dedup.ui`,
 * `wikiEmbedExtensions`) resolve from user config or fall to defaults.
 *
 * The return type is the fully resolved {@link UploadConfig}, so downstream
 * consumers (the `/api/upload-config` handler, upload handler, client emit
 * dispatch) never see `undefined`.
 */
export function resolveUploadConfig(
  user: PartialUserUploadConfig | undefined,
  vault: PartialUserUploadConfig | null | undefined,
): UploadConfig {
  const userDedup = user?.dedup;
  return {
    attachmentFolderPath:
      user?.attachmentFolderPath ??
      vault?.attachmentFolderPath ??
      DEFAULT_UPLOAD_CONFIG.attachmentFolderPath,
    emitFormat: user?.emitFormat ?? vault?.emitFormat ?? DEFAULT_UPLOAD_CONFIG.emitFormat,
    maxBytes: user?.maxBytes ?? DEFAULT_UPLOAD_CONFIG.maxBytes,
    dedup: {
      mode: userDedup?.mode ?? DEFAULT_UPLOAD_CONFIG.dedup.mode,
      ui: userDedup?.ui ?? DEFAULT_UPLOAD_CONFIG.dedup.ui,
    },
    wikiEmbedExtensions: user?.wikiEmbedExtensions
      ? [...user.wikiEmbedExtensions]
      : [...DEFAULT_UPLOAD_CONFIG.wikiEmbedExtensions],
  };
}
