import { z } from 'zod';

const WikiRootSchema = z.object({
  path: z.string(),
  label: z.string(),
});

const DEFAULT_ROOTS = [
  { path: './articles', label: 'Knowledge Articles' },
  { path: './external-sources', label: 'External Sources' },
  { path: './research', label: 'Research' },
];

export const ConfigSchema = z.object({
  content: z
    .object({
      dir: z.string().default('./content'),
    })
    .default({ dir: './content' }),
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
      roots: z.array(WikiRootSchema).min(1).default(DEFAULT_ROOTS),
      include: z.array(z.string()).default(['**/*.md']),
      exclude: z.array(z.string()).default([]),
    })
    .default({
      roots: DEFAULT_ROOTS,
      include: ['**/*.md'],
      exclude: [],
    }),
});

export type Config = z.infer<typeof ConfigSchema>;
export type WikiRoot = z.infer<typeof WikiRootSchema>;
