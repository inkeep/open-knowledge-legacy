import {
  type DedupMode as CoreDedupMode,
  type DedupUIMode as CoreDedupUIMode,
  type EmitFormat as CoreEmitFormat,
  type UploadConfig as CoreUploadConfig,
  DEFAULT_UPLOAD_CONFIG,
} from '@inkeep/open-knowledge-core';
import { z } from 'zod';

export const FolderFrontmatterSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

export const FolderRuleSchema = z
  .object({
    match: z
      .string()
      .min(1, "`match` must be a non-empty glob pattern (e.g. 'specs/**' or 'reports/*/**')"),
    frontmatter: FolderFrontmatterSchema,
  })
  .strict();

export type FolderFrontmatter = z.infer<typeof FolderFrontmatterSchema>;
export type FolderRule = z.infer<typeof FolderRuleSchema>;

// Upload/asset surface config. SPEC §6 FR-5, D-M accept-all (2026-04-21).
// `dedup` is a nested object because SPEC declares the YAML path
// `upload.dedup.ui` — that requires `dedup` to be an object, not a string.
// The mode enum ('off' | 'same-dir') lives on `dedup.mode`.
//
// Value-imported from core's DEFAULT_UPLOAD_CONFIG so widening the list in
// one place flows to both the cli Zod default AND the core runtime
// fallback. Previously the two lists were literal duplicates, silently
// drifting apart when either side was edited in isolation.
const DEFAULT_WIKI_EMBED_EXTENSIONS: readonly string[] = DEFAULT_UPLOAD_CONFIG.wikiEmbedExtensions;

export const UploadDedupSchema = z
  .object({
    mode: z.enum(['off', 'same-dir']).default('same-dir'),
    ui: z.enum(['silent', 'toast', 'confirm']).default('toast'),
  })
  .default({ mode: 'same-dir', ui: 'toast' });

// `attachmentFolderPath` and `emitFormat` have NO Zod default (US-018).
// They're the two fields `detectObsidianVault` can supply — if Zod
// materialized a default here we could not distinguish "user kept default"
// from "user never set it", and vault detection would either override
// explicit user config or never get a chance to fill in. Keeping them
// optional at schema level means the resolved-config step in the CLI /
// dev-plugin boot path sees `undefined` when the user didn't set them
// and falls back to the vault partial (if present) or the canonical
// DEFAULT_UPLOAD_CONFIG. See resolveUploadConfig() in core.
//
// `maxBytes` was removed 2026-04-22 alongside the streaming-upload
// refactor (reports/streaming-upload-refactor/REPORT.md §D8). The
// buffer-to-memory guard it represented is obsolete under streaming;
// disk is the only bound. Legacy configs still containing
// `upload.maxBytes:` parse cleanly — Zod silently strips unknown keys
// since the object schema is not `.strict()`.
export const UploadConfigSchema = z
  .object({
    attachmentFolderPath: z.string().optional(),
    emitFormat: z.enum(['wikiembed', 'markdown-image']).optional(),
    dedup: UploadDedupSchema,
    wikiEmbedExtensions: z.array(z.string()).default([...DEFAULT_WIKI_EMBED_EXTENSIONS]),
  })
  .default({
    dedup: { mode: 'same-dir', ui: 'toast' },
    wikiEmbedExtensions: [...DEFAULT_WIKI_EMBED_EXTENSIONS],
  });

// Re-export so cli consumers (loader, commands) and server (via core) see
// the same UploadConfig identity. `UploadConfig` describes the **resolved**
// runtime shape — every field concrete — and is the contract consumers see
// after `resolveUploadConfig()` runs at the CLI / dev-plugin boundary.
//
// The on-disk / Zod-inferred shape differs: `attachmentFolderPath` and
// `emitFormat` are `| undefined` because they have no Zod default. That
// divergence is intentional and the reason the bidirectional structural
// check previously colocated here has been removed: the two shapes are
// deliberately NOT identical. Compile-time safety for the resolved shape
// lives in `resolveUploadConfig`'s return type — if any field drifts,
// the return-type annotation fails TypeScript.
export type UploadConfig = CoreUploadConfig;
export type EmitFormat = CoreEmitFormat;
export type DedupMode = CoreDedupMode;
export type DedupUIMode = CoreDedupUIMode;

// Narrow sanity check: the four always-resolved fields on the Zod shape
// must still match the resolved type. attachmentFolderPath + emitFormat
// are excluded because they are intentionally optional pre-resolution.
type _ResolvedFieldsMatch =
  Omit<z.infer<typeof UploadConfigSchema>, 'attachmentFolderPath' | 'emitFormat'> extends Omit<
    UploadConfig,
    'attachmentFolderPath' | 'emitFormat'
  >
    ? Omit<UploadConfig, 'attachmentFolderPath' | 'emitFormat'> extends Omit<
        z.infer<typeof UploadConfigSchema>,
        'attachmentFolderPath' | 'emitFormat'
      >
      ? true
      : never
    : never;
const _shapeCheck: _ResolvedFieldsMatch = true;
void _shapeCheck;

// US-018 precedence guard: `attachmentFolderPath` and `emitFormat` MUST
// stay `.optional()` — if a future contributor "fixes" the optional
// fields by giving them defaults (`z.string().default('./')`), the
// Zod-inferred type would no longer include `undefined` and
// `resolveUploadConfig`'s `user ?? vault ?? default` chain would never
// fall through to the vault partial. Every Obsidian refugee would
// silently lose their vault's `attachmentFolderPath` mapping with no
// compile error. These guards assert `undefined` is still assignable
// to each field's type; adding a Zod `.default()` removes `undefined`
// from the inferred union and trips this line at `bun run typecheck`.
type _AttachmentFolderPathStaysOptional = undefined extends z.infer<
  typeof UploadConfigSchema
>['attachmentFolderPath']
  ? true
  : never;
type _EmitFormatStaysOptional = undefined extends z.infer<typeof UploadConfigSchema>['emitFormat']
  ? true
  : never;
const _us018Guard1: _AttachmentFolderPathStaysOptional = true;
const _us018Guard2: _EmitFormatStaysOptional = true;
void _us018Guard1;
void _us018Guard2;

export const ConfigSchema = z.object({
  content: z
    .object({
      dir: z.string().default('.'),
      include: z.array(z.string()).min(1).default(['**/*.md', '**/*.mdx']),
      exclude: z.array(z.string()).default([]),
    })
    .default({
      dir: '.',
      include: ['**/*.md', '**/*.mdx'],
      exclude: [],
    }),
  github: z
    .object({
      oauthAppClientId: z.string().default('Ov23liqlSd0V1MwR6rhI'),
    })
    .default({ oauthAppClientId: 'Ov23liqlSd0V1MwR6rhI' }),
  sync: z
    .object({
      /** Auto-detect from remote presence when absent; override to explicitly enable/disable. */
      enabled: z.boolean().optional(),
      /** Seconds between push cycles. Default 60. ±15% jitter applied per cycle. */
      pushIntervalSeconds: z.number().int().min(1).default(60),
      /** Seconds between pull/fetch cycles. Default 30. ±15% jitter applied per cycle. */
      pullIntervalSeconds: z.number().int().min(1).default(30),
      /** Automatically commit local changes at L2 flush. */
      autoCommit: z.boolean().default(true),
      /** Automatically push after each commit. */
      autoPush: z.boolean().default(true),
      /** Automatically pull remote changes each cycle. */
      autoPull: z.boolean().default(true),
      /**
       * Commit message for auto-commits.
       * "auto" = match shadow ("WIP auto-save <ISO timestamp>").
       * Any other string is used as a template.
       */
      commitMessage: z.string().default('auto'),
    })
    .default({
      pushIntervalSeconds: 60,
      pullIntervalSeconds: 30,
      autoCommit: true,
      autoPush: true,
      autoPull: true,
      commitMessage: 'auto',
    }),
  server: z
    .object({
      // Default 0 asks the kernel to pick a free port; `ok start` writes the
      // resolved port into server.lock so MCP clients can discover it. Explicit
      // values (config.yml / --port / PORT env) still bind that port.
      port: z.number().int().min(0).max(65535).default(0),
      host: z
        .string()
        .regex(/^[\w.\-:]+$/, 'Invalid hostname')
        .default('localhost'),
      openOnAgentEdit: z.boolean().default(false),
    })
    .default({ port: 0, host: 'localhost', openOnAgentEdit: false }),
  persistence: z
    .object({
      debounceMs: z.number().int().min(0).default(2000),
      maxDebounceMs: z.number().int().min(0).default(10000),
    })
    .default({ debounceMs: 2000, maxDebounceMs: 10000 }),
  preview: z
    .object({
      baseUrl: z.url().optional(),
    })
    .default({}),
  folders: z.array(FolderRuleSchema).default([]),
  upload: UploadConfigSchema,
  mcp: z
    .object({
      // Controls whether `ok mcp` detach-spawns `ok start` when `server.lock`
      // is absent/stale. `OK_MCP_AUTOSTART=0` env var wins over this setting.
      autoStart: z.boolean().default(true),
      tools: z
        .object({
          // Tool names stay snake_case (they match MCP tool names on the wire).
          // Setting names inside each tool use camelCase to match sibling config
          // sections (persistence.debounceMs, etc.).
          read_document: z
            .object({
              historyDepth: z.number().int().min(0).default(5),
            })
            .default({ historyDepth: 5 }),
          search: z
            .object({
              maxResults: z.number().int().min(1).default(50),
            })
            .default({ maxResults: 50 }),
        })
        .default({
          read_document: { historyDepth: 5 },
          search: { maxResults: 50 },
        }),
    })
    .default({
      autoStart: true,
      tools: {
        read_document: { historyDepth: 5 },
        search: { maxResults: 50 },
      },
    }),
});

export type Config = z.infer<typeof ConfigSchema>;
