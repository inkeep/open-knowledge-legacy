import { z } from 'zod';

const FolderFrontmatterSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

const FolderRuleSchema = z
  .object({
    match: z
      .string()
      .min(1, "`match` must be a non-empty glob pattern (e.g. 'specs/**' or 'reports/*/**')"),
    frontmatter: FolderFrontmatterSchema,
  })
  .strict();

export type FolderFrontmatter = z.infer<typeof FolderFrontmatterSchema>;
export type FolderRule = z.infer<typeof FolderRuleSchema>;

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
