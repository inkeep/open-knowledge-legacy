import type {
  DedupMode as CoreDedupMode,
  DedupUIMode as CoreDedupUIMode,
  EmitFormat as CoreEmitFormat,
  UploadConfig as CoreUploadConfig,
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
const DEFAULT_WIKI_EMBED_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'pdf',
  'mp4',
  'webm',
  'mov',
  'mp3',
  'wav',
  'ogg',
  'm4a',
] as const;

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const UploadDedupSchema = z
  .object({
    mode: z.enum(['off', 'same-dir']).default('same-dir'),
    ui: z.enum(['silent', 'toast', 'confirm']).default('toast'),
  })
  .default({ mode: 'same-dir', ui: 'toast' });

export const UploadConfigSchema = z
  .object({
    attachmentFolderPath: z.string().default('./'),
    emitFormat: z.enum(['wikiembed', 'markdown-image']).default('wikiembed'),
    maxBytes: z.number().int().min(0).default(DEFAULT_MAX_UPLOAD_BYTES),
    dedup: UploadDedupSchema,
    wikiEmbedExtensions: z.array(z.string()).default([...DEFAULT_WIKI_EMBED_EXTENSIONS]),
  })
  .default({
    attachmentFolderPath: './',
    emitFormat: 'wikiembed',
    maxBytes: DEFAULT_MAX_UPLOAD_BYTES,
    dedup: { mode: 'same-dir', ui: 'toast' },
    wikiEmbedExtensions: [...DEFAULT_WIKI_EMBED_EXTENSIONS],
  });

// Re-export so cli consumers (loader, commands) and server (via core) see the
// same UploadConfig identity. Compile-time `satisfies` below catches drift if
// the Zod schema's inferred shape ever diverges from core's interface.
export type UploadConfig = CoreUploadConfig;
export type EmitFormat = CoreEmitFormat;
export type DedupMode = CoreDedupMode;
export type DedupUIMode = CoreDedupUIMode;

type _UploadConfigShapeMatches =
  z.infer<typeof UploadConfigSchema> extends UploadConfig
    ? UploadConfig extends z.infer<typeof UploadConfigSchema>
      ? true
      : never
    : never;
const _shapeCheck: _UploadConfigShapeMatches = true;
void _shapeCheck;

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
