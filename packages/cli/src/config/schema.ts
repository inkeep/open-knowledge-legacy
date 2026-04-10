import { z } from 'zod';

export const ConfigSchema = z.object({
  content: z
    .object({
      dir: z.string().default('./content'),
      exclude: z.array(z.string()).default([]),
    })
    .default({ dir: './content', exclude: [] }),
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
  wiki: z
    .object({
      articles_path: z.string().default('./articles'),
      external_sources_path: z.string().default('./external-sources'),
      research_path: z.string().default('./research'),
    })
    .default({
      articles_path: './articles',
      external_sources_path: './external-sources',
      research_path: './research',
    }),
});

export type Config = z.infer<typeof ConfigSchema>;
