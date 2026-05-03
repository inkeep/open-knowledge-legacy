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
  github: z
    .looseObject({
      oauthAppClientId: z
        .string()
        .register(fieldRegistry, {
          scope: 'either',
          agentSettable: false,
          defaultScope: 'user',
        })
        .default('Ov23liqlSd0V1MwR6rhI'),
    })
    .default({ oauthAppClientId: 'Ov23liqlSd0V1MwR6rhI' }),
  server: z
    .looseObject({
      host: z
        .string()
        .regex(/^[\w.\-:]+$/, 'Invalid hostname')
        .register(fieldRegistry, {
          scope: 'either',
          agentSettable: false,
          defaultScope: 'user',
        })
        .default('localhost'),
      openOnAgentEdit: z
        .boolean()
        .register(fieldRegistry, {
          scope: 'either',
          agentSettable: false,
          defaultScope: 'user',
        })
        .default(false),
    })
    .default({ host: 'localhost', openOnAgentEdit: false }),
  preview: z
    .looseObject({
      baseUrl: z
        .url()
        .register(fieldRegistry, { scope: 'project', agentSettable: false })
        .optional(),
    })
    .default({}),
  folders: z
    .array(FolderRuleSchema)
    .register(fieldRegistry, {
      scope: 'either',
      agentSettable: true,
      defaultScope: 'project',
    })
    .default([]),
  mcp: z
    .looseObject({
      autoStart: z
        .boolean()
        .register(fieldRegistry, {
          scope: 'either',
          agentSettable: false,
          defaultScope: 'user',
        })
        .default(true),
      tools: z
        .looseObject({
          read_document: z
            .looseObject({
              historyDepth: z
                .number()
                .int()
                .min(0)
                .register(fieldRegistry, {
                  scope: 'either',
                  agentSettable: true,
                  defaultScope: 'user',
                })
                .default(5),
            })
            .default({ historyDepth: 5 }),
          search: z
            .looseObject({
              maxResults: z
                .number()
                .int()
                .min(1)
                .register(fieldRegistry, {
                  scope: 'either',
                  agentSettable: true,
                  defaultScope: 'user',
                })
                .default(50),
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
      editorModeDefault: z
        .enum(['wysiwyg', 'source'])
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
          scope: 'project',
          agentSettable: false,
          defaultScope: 'project',
        })
        .optional(),
    })
    .optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export type ConfigPatch = DeepPartial<Config>;

type DeepPartial<T> =
  T extends Array<infer U>
    ? Array<U>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> | null }
      : T;
