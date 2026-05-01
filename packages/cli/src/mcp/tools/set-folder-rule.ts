/**
 * `set_folder_rule` MCP tool — fs-direct upsert into nested
 * `<folder>/.ok/frontmatter.yml` files.
 *
 * Always-array shape (even N=1): agents pass `{rules: [{...}]}` for one
 * rule and `{rules: [{...}, {...}]}` for multiple. The same primitive
 * backs the future right-click-folder UX for batch + single-rule edits.
 *
 * Resolution: each rule's `match` glob is reduced to a single target
 * folder by walking leading literal segments. Globs (`*`, `**`) are
 * accepted at the trailing position; literal segments after a glob (e.g.
 * `specs/[STAR]/evidence/**`) resolve to multiple folders and are
 * rejected with `MULTI_FOLDER_GLOB`. Agents split such cases into
 * one rule per folder.
 *
 * Transactional all-or-nothing: every rule is validated first; only
 * commits to disk once all resolve cleanly.
 *
 * Removal: pass an empty `frontmatter: {}` (or omit fields entirely) —
 * the merge collapses, the file is deleted, and `<folder>/.ok/` is
 * auto-cleaned per D3 if empty (templates/ may keep it alive).
 *
 * Works without a running OK server (resolves cwd via
 * `resolveProjectConfigContext`, NOT `resolveProjectServerContext`).
 *
 * Spec: 2026-05-01-folder-level-metadata-and-templates §6.1, FR6, D11.
 */

import { FolderFrontmatterSchema } from '@inkeep/open-knowledge-core';
import { z } from 'zod';
import { applyNestedFolderRulesUpsert } from '../../content/folder-rule-write.ts';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
} from './shared.ts';

export const DESCRIPTION = [
  '[Operates on disk; no running OK server required] Upsert one or more folder rules — writes nested `<folder>/.ok/frontmatter.yml` files.',
  '',
  'Folder rules apply default frontmatter (title / description / tags) to every doc inside `<folder>/` (and its descendants via cascade). Use this tool to add a new rule, replace an existing one keyed by `match`, or rename via `new_match`.',
  '',
  'Each `match` glob must resolve to a SINGLE target folder by walking leading literal segments — `"specs/**"` writes `specs/.ok/frontmatter.yml`. Multi-folder globs (e.g. `"specs/*/evidence/**"`, where the literal `evidence` follows `*`) are rejected with `MULTI_FOLDER_GLOB`; split into per-folder rules instead.',
  '',
  'Always pass an array — even for a single rule. Validation runs against every rule first; if any fails, NO rules are applied to disk.',
  '',
  '**To remove a rule**, pass an empty `frontmatter: {}` (or with only undefined values) — the merge collapses, the file is deleted, and `<folder>/.ok/` is auto-cleaned if no other tenant remains.',
  '',
  '**Parameters:**',
  '- `rules` — Array of `{match, frontmatter, new_match?}`.',
  '  - `match` — Glob pattern that identifies the target folder (e.g. `"specs/**"`, `"meetings/prep-notes/**"`). Required.',
  '  - `frontmatter` — `{title?, description?, tags?: string[]}` to apply.',
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
  frontmatter: FolderFrontmatterSchema.describe(
    'Default frontmatter to apply to matched docs: `{title?, description?, tags?: string[]}`. Empty object removes the folder rule (auto-cleans `.ok/` if empty).',
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
        rules: args.rules.map((r) => {
          const fm = r.frontmatter ?? {};
          const out: {
            match: string;
            frontmatter: { title?: string; description?: string; tags?: string[] };
            new_match?: string;
          } = {
            match: r.match,
            frontmatter: {
              ...(typeof fm.title === 'string' ? { title: fm.title } : {}),
              ...(typeof fm.description === 'string' ? { description: fm.description } : {}),
              ...(Array.isArray(fm.tags)
                ? { tags: fm.tags.filter((t): t is string => typeof t === 'string') }
                : {}),
            },
          };
          if (r.new_match !== undefined) out.new_match = r.new_match;
          return out;
        }),
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
