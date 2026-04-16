import { z } from 'zod';

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
