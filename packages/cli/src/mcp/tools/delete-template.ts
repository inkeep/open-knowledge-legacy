/**
 * `delete_template` MCP tool — remove a folder-scoped template.
 *
 * Thin wrapper around `applyTemplateDelete` from
 * `../../content/templates-write.ts`. Idempotent: deleting a non-existent
 * template returns success with `existed: false`.
 *
 * Auto-clean per D3: when removing the template empties
 * `<folder>/.ok/templates/`, the directory is removed; if `.ok/` is then
 * also empty, it is removed too.
 *
 * Spec: 2026-05-01-folder-level-metadata-and-templates §6.4, FR12.
 */

import { z } from 'zod';
import { applyTemplateDelete } from '../../content/templates-write.ts';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
} from './shared.ts';

export const DESCRIPTION = [
  '[Operates on disk; no running OK server required] Delete a folder-scoped template at `<folder>/.ok/templates/<name>.md`.',
  '',
  'Idempotent: deleting a template that does not exist returns success. Auto-cleans empty `<folder>/.ok/templates/` and `<folder>/.ok/` directories.',
  '',
  '**Parameters:**',
  '- `folder` — Project-root-relative folder. Empty / `.` means project root.',
  '- `name` — Template filename without `.md` extension.',
].join('\n');

const InputSchema = {
  folder: z.string().describe('Project-root-relative folder. Empty / `.` means project root.'),
  name: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9_-]+$/, 'Template name must use letters, digits, `_`, or `-` only.')
    .describe('Template filename without `.md` extension.'),
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const OutputSchema = {
  result: z.union([
    z.object({
      ok: z.literal(true),
      path: z.string(),
      existed: z.boolean(),
      cleanedEmpty: z.object({
        templatesDir: z.boolean(),
        okDir: z.boolean(),
      }),
    }),
    z.object({
      ok: z.literal(false),
      error: z.object({ code: z.string(), message: z.string() }),
    }),
  ]),
} as const;

interface DeleteTemplateDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
}

export function register(server: ServerInstance, deps: DeleteTemplateDeps): void {
  server.registerTool(
    'delete_template',
    {
      description: DESCRIPTION,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: true,
      },
    },
    async (args: { folder: string; name: string; cwd?: string }) => {
      const context = await resolveProjectConfigContext(deps.resolveCwd, deps.config, args.cwd);
      if (!context.ok) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error: ${context.error}` }],
        };
      }
      const { cwd } = context;

      const result = applyTemplateDelete({
        projectDir: cwd,
        folder: args.folder,
        name: args.name,
      });

      if (!result.ok) {
        const payload = { result };
        return {
          isError: true,
          structuredContent: payload,
          content: [
            { type: 'text' as const, text: `${result.error.code}: ${result.error.message}` },
          ],
        };
      }

      const lines = [
        result.existed
          ? `Deleted template at ${result.path}`
          : `Template at ${result.path} did not exist (no-op)`,
      ];
      if (result.cleanedEmpty.templatesDir) lines.push('Removed empty .ok/templates/ directory');
      if (result.cleanedEmpty.okDir) lines.push('Removed empty .ok/ directory');
      return textPlusStructured(lines.join('\n'), { result });
    },
  );
}
