import { z } from 'zod';

export const ConfigSchema = z.object({
  content: z
    .object({
      dir: z.string().default('.'),
      include: z.array(z.string()).min(1).default(['**/*.md']),
      exclude: z.array(z.string()).default([]),
    })
    .default({
      dir: '.',
      include: ['**/*.md'],
      exclude: [],
    }),
  server: z
    .object({
      port: z.number().int().min(1).max(65535).default(3000),
      host: z
        .string()
        .regex(/^[\w.\-:]+$/, 'Invalid hostname')
        .default('localhost'),
    })
    .default({ port: 3000, host: 'localhost' }),
  persistence: z
    .object({
      debounceMs: z.number().int().min(0).default(2000),
      maxDebounceMs: z.number().int().min(0).default(10000),
    })
    .default({ debounceMs: 2000, maxDebounceMs: 10000 }),
  mcp: z
    .object({
      tools: z
        .object({
          read_document: z
            .object({
              history_depth: z.number().int().min(0).default(5),
            })
            .default({ history_depth: 5 }),
          search: z
            .object({
              max_results: z.number().int().min(1).default(50),
            })
            .default({ max_results: 50 }),
        })
        .default({
          read_document: { history_depth: 5 },
          search: { max_results: 50 },
        }),
    })
    .default({
      tools: {
        read_document: { history_depth: 5 },
        search: { max_results: 50 },
      },
    }),
});

export type Config = z.infer<typeof ConfigSchema>;
