import {
  type ConfigPatch,
  type ConfigValidationError,
  ConfigValidationErrorSchema,
  type FieldMeta,
  getLeafFieldMeta,
  humanFormat,
  type WriteScope,
} from '@inkeep/open-knowledge-core';
import { inspectConfigPaths, writeConfigPatch } from '@inkeep/open-knowledge-core/server';
import { z } from 'zod';
import { ConfigSchema } from '../../config/schema.ts';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
} from './shared.ts';

export const DESCRIPTION = [
  '[Operates on disk; no running OK server required] Set fields in the Open Knowledge config (project + user-global YAML).',
  '',
  'Pass a deep-partial patch over the agent-settable allowlist. The server picks the write target (project vs user) automatically based on where the path is already set + per-field default scope.',
  '',
  '**Allowlist** (only these paths are agent-settable):',
  '- `folders[]` — folder-rule defaults (whole-array replace; for per-rule upsert use `set_folder_rule`)',
  '- `mcp.tools.grep.maxResults` — grep result cap',
  '- `mcp.tools.read_document.historyDepth` — number of history entries returned',
  '',
  'Other paths are rejected with `NOT_AGENT_SETTABLE`. To inspect what is currently set, call `get_config`.',
  '',
  '**Patch semantics:** RFC 7396 spirit (TypeScript-only — no wire format). Top-level keys present are written; absent keys are unchanged; `null` clears a field; nested objects merge recursively; arrays replace wholesale.',
  '',
  '**Mixed scope:** if leaves in a single patch resolve to different scopes (e.g., one project-only field + one user-only field), the call fails with `MIXED_SCOPE` — retry per-scope.',
  '',
  '**Parameters:**',
  '- `patch` — Deep-partial config patch over the allowlist (see above).',
  '- `cwd` (optional) — Project root.',
].join('\n');

interface SetConfigDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  homedirOverride?: string;
}

const InputSchema = {
  patch: z
    .looseObject({})
    .describe(
      'Deep-partial config patch over the agent-settable allowlist. See description for the 3 allowed paths. Null at any path clears the field; arrays replace wholesale.',
    ),
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const SuccessOutputSchema = z.object({
  ok: z.literal(true),
  applied: z.array(z.string()),
  scope: z.enum(['user', 'project']),
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

function collectPatchLeaves(patch: ConfigPatch): (string | number)[][] {
  const leaves: (string | number)[][] = [];

  function walk(value: unknown, path: (string | number)[]): void {
    if (value === undefined) return;
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      leaves.push(path);
      return;
    }
    for (const [key, subValue] of Object.entries(value as Record<string, unknown>)) {
      walk(subValue, [...path, key]);
    }
  }

  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    walk(value, [key]);
  }

  return leaves;
}

interface LeafWithMeta {
  path: (string | number)[];
  meta: FieldMeta | undefined;
}

function annotateLeaves(leaves: ReadonlyArray<readonly (string | number)[]>): LeafWithMeta[] {
  return leaves.map((path) => ({
    path: [...path],
    meta: getLeafFieldMeta(ConfigSchema, path),
  }));
}

function inferScopeForLeaf(
  _path: (string | number)[],
  presence: { user: boolean; project: boolean } | undefined,
  defaultScope: WriteScope | undefined,
): WriteScope {
  if (presence?.project) return 'project';
  if (presence?.user) return 'user';
  return defaultScope ?? 'user';
}

interface ScopeInferenceResult {
  scope: WriteScope;
  perLeaf: Array<{ path: (string | number)[]; scope: WriteScope }>;
}

function inferScopes(
  leaves: LeafWithMeta[],
  cwd: string,
  homedirOverride?: string,
): ScopeInferenceResult | { mixed: ConfigValidationError } {
  const inspection = inspectConfigPaths(
    leaves.map((leaf) => leaf.path),
    { cwd, ...(homedirOverride !== undefined ? { homedirOverride } : {}) },
  );

  const perLeaf = leaves.map((leaf) => {
    const presence = inspection.get(leaf.path.join('.'));
    return {
      path: leaf.path,
      scope: inferScopeForLeaf(leaf.path, presence, leaf.meta?.defaultScope),
    };
  });

  const distinct = new Set(perLeaf.map((entry) => entry.scope));
  if (distinct.size > 1) {
    return {
      mixed: {
        code: 'MIXED_SCOPE',
        paths: perLeaf.map(({ path, scope }) => ({
          path: path.map(String),
          scope,
        })),
      },
    };
  }

  const [scope] = distinct;
  return {
    scope: scope ?? 'user',
    perLeaf,
  };
}

function makeErrorResult(error: ConfigValidationError) {
  const payload = { result: { ok: false as const, error } };
  return {
    isError: true as const,
    structuredContent: payload,
    content: [
      {
        type: 'text' as const,
        text: `${humanFormat(error)}\n\nPlease fix and try again.`,
      },
    ],
  };
}

export function register(server: ServerInstance, deps: SetConfigDeps): void {
  server.registerTool(
    'set_config',
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
    async (args: { patch: Record<string, unknown>; cwd?: string }) => {
      const context = await resolveProjectConfigContext(deps.resolveCwd, deps.config, args.cwd);
      if (!context.ok) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error: ${context.error}` }],
        };
      }
      const { cwd } = context;

      const patch = args.patch as ConfigPatch;
      const leaves = collectPatchLeaves(patch);
      if (leaves.length === 0) {
        return makeErrorResult({
          code: 'SCHEMA_INVALID',
          issues: [
            {
              path: [],
              message: 'Patch is empty — pass at least one leaf value.',
              issueCode: 'empty_patch',
            },
          ],
        });
      }

      const annotated = annotateLeaves(leaves);
      const blocked = annotated.find((leaf) => leaf.meta?.agentSettable !== true);
      if (blocked) {
        return makeErrorResult({
          code: 'NOT_AGENT_SETTABLE',
          path: blocked.path.map(String),
        });
      }

      const inference = inferScopes(annotated, cwd, deps.homedirOverride);
      if ('mixed' in inference) {
        return makeErrorResult(inference.mixed);
      }

      const result = await writeConfigPatch({
        cwd,
        scope: inference.scope,
        patch,
        ...(deps.homedirOverride !== undefined ? { homedirOverride: deps.homedirOverride } : {}),
      });

      if (!result.ok) return makeErrorResult(result.error);

      const success = {
        result: {
          ok: true as const,
          applied: result.appliedPaths,
          scope: inference.scope,
          path: result.path,
          current: result.effective as unknown as Record<string, unknown>,
        },
      };
      return textPlusStructured(JSON.stringify(success.result, null, 2), success);
    },
  );
}

export { collectPatchLeaves };
