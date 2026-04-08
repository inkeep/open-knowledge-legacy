import { z } from 'zod';

export const ConfigSchema = z.object({
  content: z
    .object({
      dir: z.string().default('./content'),
      exclude: z.array(z.string()).default([]),
    })
    .default({}),
  server: z
    .object({
      port: z.number().int().min(1).max(65535).default(3000),
      host: z.string().default('localhost'),
    })
    .default({}),
  git: z
    .object({
      enabled: z.boolean().default(true),
      autosave: z.boolean().default(true),
      commitDebounceMs: z.number().int().min(0).default(30000),
      wipRef: z.string().default('refs/wip/main'),
    })
    .default({}),
  persistence: z
    .object({
      debounceMs: z.number().int().min(0).default(2000),
      maxDebounceMs: z.number().int().min(0).default(10000),
    })
    .default({}),
  editor: z
    .object({
      defaultMode: z.enum(['wysiwyg', 'source']).default('wysiwyg'),
    })
    .default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
