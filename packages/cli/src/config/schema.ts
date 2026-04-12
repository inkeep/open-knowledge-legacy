import { z } from 'zod';

export const ConfigSchema = z.object({
  content: z
    .object({
      dir: z.string().default('.'),
      uploadsDir: z.string().default('uploads'),
      include: z.array(z.string()).min(1).default(['**/*.md']),
      exclude: z.array(z.string()).default([]),
    })
    .default({
      dir: '.',
      uploadsDir: 'uploads',
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
});

export type Config = z.infer<typeof ConfigSchema>;
