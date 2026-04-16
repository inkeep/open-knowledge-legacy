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
    match: z.string().min(1),
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
  server: z
    .object({
      port: z.number().int().min(1).max(65535).default(3000),
      host: z
        .string()
        .regex(/^[\w.\-:]+$/, 'Invalid hostname')
        .default('localhost'),
      openOnAgentEdit: z.boolean().default(false),
    })
    .default({ port: 3000, host: 'localhost', openOnAgentEdit: false }),
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
      tools: {
        read_document: { historyDepth: 5 },
        search: { maxResults: 50 },
      },
    }),
});

export type Config = z.infer<typeof ConfigSchema>;
