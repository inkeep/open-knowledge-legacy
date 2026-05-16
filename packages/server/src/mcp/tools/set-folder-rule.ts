import { z } from 'zod';
import { applyNestedFolderRulesUpsert } from '../../content/folder-rule-write.ts';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  outputSchemaWithText,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
} from './shared.ts';

export const DESCRIPTION = [
  '[Operates on disk; no running OK server required] Upsert one or more folder rules — writes nested `<folder>/.ok/frontmatter.yml` files.',
  '',
  'Folder rules apply default frontmatter to every doc inside `<folder>/` (and its descendants via cascade). Open shape — any YAML-representable key is accepted. Common keys: `title`, `description`, `tags` (the well-known three) plus arbitrary additions like `status`, `team`, `owners`, `review_cycle`. Use this tool to add a new rule, replace an existing one keyed by `match`, or rename via `new_match`.',
  '',
  '**Cascade merge semantics (D6 generalized):** scalars (string / number / boolean / null) replace last-wins along the leaf → root walk; arrays union-and-dedup with first-occurrence preserved; objects replace last-wins.',
  '',
  'Each `match` glob must resolve to a SINGLE target folder by walking leading literal segments — `"specs/**"` writes `specs/.ok/frontmatter.yml`. Multi-folder globs (e.g. `"specs/*/evidence/**"`, where the literal `evidence` follows `*`) are rejected with `MULTI_FOLDER_GLOB`; split into per-folder rules instead.',
  '',
  'Always pass an array — even for a single rule. Validation runs against every rule first; if any fails (e.g. `MULTI_FOLDER_GLOB`, `PATH_ESCAPE`), NO rules are applied to disk. Filesystem-level errors during the write phase (disk full, permissions) may leave a partial result — the error response includes `partiallyApplied` listing which rules already landed.',
  '',
  '**To remove a rule**, pass an empty `frontmatter: {}` — the merge collapses, the file is deleted, and `<folder>/.ok/` is auto-cleaned if no other tenant remains. To clear a SPECIFIC key while keeping others, set that key to `null` / `""` / `[]` in the patch.',
  '',
  '**Parameters:**',
  '- `rules` — Array of `{match, frontmatter, new_match?}`.',
  '  - `match` — Glob pattern that identifies the target folder (e.g. `"specs/**"`, `"meetings/prep-notes/**"`). Required.',
  '  - `frontmatter` — Open `Record<string, unknown>` of key/value defaults. Common: `{title?, description?, tags?: string[]}`. Any other key persists too (`status`, `team`, etc.).',
  "  - `new_match` — If set, move the rule from `match` to this new glob (deletes the old folder's frontmatter.yml + auto-cleans).",
  '- `cwd` (optional) — Project root.',
].join('\n');

interface SetFolderRuleDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
}

const FolderRuleUpsertInputSchema = z.object({
  match: z
    .string()
    .min(1)
    .describe(
      'Glob pattern (e.g. "specs/**", "meetings/prep-notes/**") that identifies the target folder.',
    ),
  frontmatter: z
    .record(z.string(), z.unknown())
    .refine(
      (obj) => {
        if ('title' in obj && obj.title !== null && typeof obj.title !== 'string') return false;
        if ('description' in obj && obj.description !== null && typeof obj.description !== 'string')
          return false;
        if ('tags' in obj && obj.tags !== null && !Array.isArray(obj.tags)) return false;
        return true;
      },
      {
        message:
          'Well-known keys must match expected types when present: `title` (string|null), `description` (string|null), `tags` (string[]|null).',
      },
    )
    .describe(
      'Default frontmatter to apply to matched docs. Open shape — any YAML-representable key. Common: `{title?, description?, tags?: string[]}`; arbitrary keys (`status`, `team`, `owners`, `review_cycle`, …) also persist. Pass `{}` to remove the rule (auto-cleans `.ok/` if empty). Pass `key: null | "" | []` to clear that specific key while keeping others.',
    ),
  new_match: z
    .string()
    .min(1)
    .optional()
    .describe(
      "If set, move the rule from `match` to this new folder (deletes the old folder's frontmatter.yml + auto-cleans).",
    ),
});

const InputSchema = {
  rules: z
    .array(FolderRuleUpsertInputSchema)
    .min(1)
    .describe(
      'One or more folder rules to upsert. Always an array — pass `[{...}]` for a single rule.',
    ),
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const AppliedEntrySchema = z.object({
  match: z.string(),
  path: z.string(),
  action: z.enum(['written', 'deleted']),
});

const SuccessOutputSchema = z.object({
  ok: z.literal(true),
  applied: z.array(AppliedEntrySchema),
});

const ErrorOutputSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum(['MULTI_FOLDER_GLOB', 'PATH_ESCAPE', 'BAD_PROJECT_DIR', 'WRITE_ERROR']),
    message: z.string(),
    rule: z.string().optional(),
  }),
  partiallyApplied: z.array(AppliedEntrySchema).optional(),
});

const OutputSchema = outputSchemaWithText({
  result: z.union([SuccessOutputSchema, ErrorOutputSchema]),
});

export function register(server: ServerInstance, deps: SetFolderRuleDeps): void {
  server.registerTool(
    'set_folder_rule',
    {
      description: DESCRIPTION,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    async (args: {
      rules: Array<{
        match: string;
        frontmatter: Record<string, unknown>;
        new_match?: string;
      }>;
      cwd?: string;
    }) => {
      const context = await resolveProjectConfigContext(deps.resolveCwd, deps.config, args.cwd);
      if (!context.ok) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error: ${context.error}` }],
        };
      }
      const { cwd } = context;

      const result = applyNestedFolderRulesUpsert({
        projectDir: cwd,
        rules: args.rules.map((r) => ({
          match: r.match,
          frontmatter: r.frontmatter ?? {},
          ...(r.new_match !== undefined ? { new_match: r.new_match } : {}),
        })),
      });

      if (!result.ok) {
        const payload = { result };
        return {
          isError: true,
          structuredContent: payload,
          content: [
            {
              type: 'text' as const,
              text: `${result.error.code}: ${result.error.message}`,
            },
          ],
        };
      }

      return textPlusStructured(JSON.stringify(result, null, 2), { result });
    },
  );
}
