/**
 * `get_config` MCP tool — fs-direct read of the effective merged config.
 *
 * Reads via `loadConfig` (defaults → user → workspace + ENV applied). No
 * allowlist gating on read — agents can inspect any field. Read-only,
 * idempotent.
 *
 * Tagged `[Operates on disk; no running OK server required]` because it
 * doesn't need Hocuspocus running. Used for mid-session re-reads when
 * state may have changed (file watcher detected an external edit, another
 * agent wrote, etc.).
 *
 * Input: `{ path?: string[], cwd?: string }` — path is the dotted segments
 *        (e.g. `["mcp", "tools"]`). Omit for full config.
 * Output: `structuredContent: { value }` + JSON-stringified `content[]`.
 */

import { z } from 'zod';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
} from './shared.ts';

export const DESCRIPTION = [
  '[Operates on disk; no running OK server required] Read the effective merged Open Knowledge config (defaults → user → workspace).',
  '',
  'Use this when you need to inspect the config mid-session — e.g., after a write that may have changed disk state, or to re-confirm the value of a field before composing a `set_config` patch.',
  '',
  'Read returns the FULL merged config or a sub-tree when `path` is provided. There is no allowlist on reads — every field is readable.',
  '',
  '**Parameters:**',
  '- `path` (optional) — Dotted-segments array. `["folders"]` returns the folders array; `["mcp", "tools"]` returns the mcp.tools sub-tree. Omit for full config.',
  '- `cwd` (optional) — Project root (see `cwd` description below).',
].join('\n');

interface GetConfigDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
}

const InputSchema = {
  path: z
    .array(z.string())
    .optional()
    .describe(
      'Dotted path as array of segments (e.g. ["mcp","tools","search"]). Omit to return the full merged config.',
    ),
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const OutputSchema = {
  value: z.unknown().describe('Resolved config value at the requested path (or full config).'),
  exists: z
    .boolean()
    .optional()
    .describe(
      'Whether the requested path resolved to a value. `false` distinguishes ' +
        '"path absent" from "path explicitly set to null"; absent on full-config reads.',
    ),
  path: z
    .array(z.string())
    .optional()
    .describe('Echo of the requested dotted path (empty when reading the full config).'),
} as const;

function readConfigPath(value: unknown, path: readonly string[]): unknown {
  let cur: unknown = value;
  for (const seg of path) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function register(server: ServerInstance, deps: GetConfigDeps): void {
  server.registerTool(
    'get_config',
    {
      description: DESCRIPTION,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args: { path?: string[]; cwd?: string }) => {
      const context = await resolveProjectConfigContext(deps.resolveCwd, deps.config, args.cwd);
      if (!context.ok) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error: ${context.error}` }],
        };
      }
      const path = args.path ?? [];
      const value = path.length > 0 ? readConfigPath(context.config, path) : context.config;
      // `JSON.stringify(undefined)` returns the JS value `undefined` rather
      // than a JSON string — agents would see ambiguous text content and
      // can't distinguish "path absent" from "path explicitly set to null".
      // Surface the absence as a structured `exists: false` payload + a
      // human-readable text body.
      if (path.length > 0 && value === undefined) {
        return textPlusStructured(`(no value at ${path.join('.')})`, {
          value: null,
          exists: false,
          path,
        });
      }
      return textPlusStructured(JSON.stringify(value, null, 2), { value, exists: true, path });
    },
  );
}
