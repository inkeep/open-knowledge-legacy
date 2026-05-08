import { z } from 'zod';
import { fieldRegistry } from './field-registry.ts';

export const FolderFrontmatterSchema = z.looseObject({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const FolderRuleSchema = z.looseObject({
  match: z
    .string()
    .min(1, "`match` must be a non-empty glob pattern (e.g. 'specs/**' or 'reports/*/**')"),
  frontmatter: FolderFrontmatterSchema,
});

export type FolderFrontmatter = z.infer<typeof FolderFrontmatterSchema>;
export type FolderRule = z.infer<typeof FolderRuleSchema>;

export const ConfigSchema = z.looseObject({
  content: z
    .looseObject({
      dir: z
        .string()
        .register(fieldRegistry, {
          scope: 'project',
          agentSettable: false,
          defaultScope: 'project',
        })
        .default('.'),
    })
    .default({
      dir: '.',
    }),
  preview: z
    .looseObject({
      baseUrl: z
        .url()
        .register(fieldRegistry, { scope: 'project', agentSettable: false })
        .optional(),
    })
    .default({}),
  appearance: z
    .looseObject({
      theme: z
        .enum(['light', 'dark', 'system'])
        .register(fieldRegistry, {
          scope: 'user',
          agentSettable: false,
          defaultScope: 'user',
        })
        .optional(),
    })
    .default({}),
  autoSync: z
    .looseObject({
      enabled: z
        .boolean()
        .register(fieldRegistry, {
          scope: 'project-local',
          agentSettable: false,
          defaultScope: 'project-local',
        })
        .nullable()
        .default(null),
    })
    .default({ enabled: null }),
});

export type Config = z.infer<typeof ConfigSchema>;

export type ConfigPatch = DeepPartial<Config>;

type DeepPartial<T> =
  T extends Array<infer U>
    ? Array<U>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> | null }
      : T;
