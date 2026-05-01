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
  // `content.dir` is PROJECT-scope — names the root of the project's
  // knowledge graph. `content.include` / `content.exclude` were removed:
  // path rules now live in `.okignore` files (gitignore syntax) at the
  // project root and at any folder depth. The YAML loader rejects the
  // removed keys with a source-located REMOVED_KEY error directing the
  // user to `.okignore`.
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
      // `scope: 'project'` (strict): per spec §9.5.4, `baseUrl` at user-global
      // scope is the only ❌-marked placement (each project has its own deployed
      // wiki URL). The Settings pane disables this field on the user tab; the
      // loader rejects it with a source-located error if hand-set in user YAML.
      baseUrl: z
        .url()
        .register(fieldRegistry, { scope: 'project', agentSettable: false })
        .optional(),
    })
    .default({}),
  // `folders` was removed in spec 2026-05-01-folder-level-metadata-and-templates
  // (FR8 / D1). Folder defaults now live in nested `<folder>/.ok/frontmatter.yml`
  // files — sparse, opt-in, lazy-create. Edit via the `set_folder_rule` MCP
  // tool or by hand. The `FolderRuleSchema` + `FolderFrontmatterSchema` exports
  // above stay in place for the helpers in `set_folder_rule` and any external
  // tooling that constructs folder-rule shapes; they no longer correspond to
  // a top-level config field.
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
  // `appearance.theme` and `appearance.editorModeDefault` default to UNSET in
  // config.yml (no `'system'` / `'wysiwyg'` default). The chrome FOUC scripts
  // read localStorage as the cache; the first explicit Settings-pane write of
  // `appearance.*` canonicalizes the value into config.yml.
  //
  // Both are USER-scope: theme is a personal preference, not a project-
  // shared setting. A project `appearance.theme` would force every
  // collaborator into the project owner's mode, which is a misuse
  // pattern and not what users expect from the chrome toggle. The
  // Settings pane hides these fields on the "This project" tab via
  // `isFieldVisibleAtScope`; SchemaStore validation flags them in
  // project YAML; chrome toggle always writes via `userBinding.patch()`.
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
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Deep-partial input shape for patch operations against `ConfigSchema`.
 *
 * Used by `writeConfigPatch` / `ConfigBinding.patch` callers (MCP tools,
 * Settings pane, CLI) to describe partial updates. Null at any path means
 * "clear this field" (RFC 7396 spirit, TypeScript-only — no wire format).
 */
export type ConfigPatch = DeepPartial<Config>;

type DeepPartial<T> =
  T extends Array<infer U>
    ? Array<U>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> | null }
      : T;
