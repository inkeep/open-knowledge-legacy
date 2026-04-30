/**
 * `set_folder_rule` MCP tool — fs-direct upsert into `folders[]`.
 *
 * Thin wrapper around `applyFolderRulesUpsert` from
 * `@inkeep/open-knowledge-core`. Always-array shape (even N=1): agents pass
 * `{rules: [{...}]}` for one rule and `{rules: [{...}, {...}]}` for multiple.
 * The same primitive backs the future right-click-folder UX for batch +
 * single-rule edits.
 *
 * Transactional all-or-nothing: validation runs against the merged config;
 * if any rule fails, NO writes happen — `writeConfigPatch`'s atomic
 * tmp+rename + Zod safeParse give transactional semantics for free.
 *
 * Removal goes through `set_config({patch: {folders: [<filtered>]}})` —
 * read-modify-write is fine for the rare removal case.
 *
 * Works without a running OK server (resolves cwd via
 * `resolveProjectConfigContext`, NOT `resolveProjectServerContext`).
 */

import {
  ConfigValidationErrorSchema,
  FolderFrontmatterSchema,
  humanFormat,
} from '@inkeep/open-knowledge-core';
import { applyFolderRulesUpsert } from '@inkeep/open-knowledge-core/server';
import { z } from 'zod';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
} from './shared.ts';

export const DESCRIPTION = [
  '[Operates on disk; no running OK server required] Upsert one or more folder rules in the project `folders[]` array.',
  '',
  'Folder rules apply default frontmatter (title / description / tags) to every doc whose path matches `match` (a glob like `specs/**` or `reports/*/**`). Use this tool to add a new rule, replace an existing one keyed by `match`, or rename via `new_match`.',
  '',
  'Always pass an array — even for a single rule. The tool runs all rules transactionally: if any rule produces an invalid merged config, NO rules are applied to disk.',
  '',
  '**To remove a rule**, use `set_config({patch: {folders: [<filtered-array>]}})` — read folders via `get_config({path: ["folders"]})`, drop the entry, then write back.',
  '',
  '**Parameters:**',
  '- `rules` — Array of `{match, frontmatter, new_match?}`.',
  '  - `match` — Glob pattern that identifies the rule (e.g. `"specs/**"`). Required.',
  '  - `frontmatter` — `{title?, description?, tags?: string[]}` to apply. Required (use `{}` for "match the rule but apply no frontmatter").',
  '  - `new_match` — If set, rename the rule keyed by `match` to this glob. If both already exist, the rename target is overwritten.',
  '- `cwd` (optional) — Project root.',
].join('\n');

interface SetFolderRuleDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  /**
   * Test-only: overrides `os.homedir()` for any user-scope write target.
   * Production callers omit this. (set_folder_rule writes project by
   * default, but the deps surface stays consistent across the three
   * config tools.)
   */
  homedirOverride?: string;
}

const FolderRuleUpsertInputSchema = z.object({
  match: z
    .string()
    .min(1)
    .describe('Glob pattern (e.g. "specs/**", "reports/*/**") that identifies the rule.'),
  frontmatter: FolderFrontmatterSchema.describe(
    'Default frontmatter to apply to matched docs: `{title?, description?, tags?: string[]}`.',
  ),
  new_match: z
    .string()
    .min(1)
    .optional()
    .describe('If set, rename the existing rule keyed by `match` to this new glob.'),
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

const SuccessOutputSchema = z.object({
  ok: z.literal(true),
  applied: z.array(z.string()),
  scope: z.literal('project'),
  path: z.string(),
  current: z.record(z.string(), z.unknown()),
});

const ErrorOutputSchema = z.object({
  ok: z.literal(false),
  error: ConfigValidationErrorSchema,
});

const OutputSchema = {
  result: z.union([SuccessOutputSchema, ErrorOutputSchema]),
} as const;

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
      rules: Array<{ match: string; frontmatter: Record<string, unknown>; new_match?: string }>;
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

      const result = await applyFolderRulesUpsert({
        cwd,
        rules: args.rules.map((r) => ({
          match: r.match,
          frontmatter: r.frontmatter,
          ...(r.new_match !== undefined ? { new_match: r.new_match } : {}),
        })),
        scope: 'project',
        ...(deps.homedirOverride !== undefined ? { homedirOverride: deps.homedirOverride } : {}),
      });

      if (!result.ok) {
        const payload = { result: { ok: false as const, error: result.error } };
        return {
          isError: true,
          structuredContent: payload,
          content: [
            {
              type: 'text' as const,
              text: `${humanFormat(result.error)}\n\nPlease fix and try again.`,
            },
          ],
        };
      }

      const success = {
        result: {
          ok: true as const,
          applied: result.appliedPaths,
          scope: 'project' as const,
          path: result.path,
          // Mirror set_config's shape: agents inspect the merged effective
          // config (here, the post-upsert `folders[]` array among other
          // fields) without a follow-up get_config roundtrip.
          current: result.effective as unknown as Record<string, unknown>,
        },
      };
      return textPlusStructured(JSON.stringify(success.result, null, 2), success);
    },
  );
}
