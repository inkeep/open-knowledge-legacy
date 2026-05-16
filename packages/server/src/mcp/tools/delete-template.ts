import { z } from 'zod';
import { applyTemplateDelete, type TemplateTarget } from '../../content/templates-write.ts';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  outputSchemaWithText,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
} from './shared.ts';

export const DESCRIPTION = [
  '[Operates on disk; no running OK server required] Delete a template.',
  '',
  '**Targets.** Mirrors `write_template`:',
  '- `target: "project"` (default) — deletes `<folder>/.ok/templates/<name>.md` from the current project.',
  '- `target: "user"` — deletes `~/.ok/templates/<name>.md` from the user-global library. The `folder` argument is ignored.',
  '',
  'Idempotent: deleting a template that does not exist returns success with `existed: false`. Auto-cleans empty `<folder>/.ok/templates/` and `<folder>/.ok/` directories.',
  '',
  '**Parameters:**',
  '- `folder` — Project-root-relative folder. Empty / `.` means project root. Ignored when `target: "user"`.',
  '- `name` — Template filename without `.md` extension.',
  '- `target` (optional) — `"project"` (default) or `"user"`.',
].join('\n');

const InputSchema = {
  folder: z
    .string()
    .describe(
      'Project-root-relative folder. Empty / `.` means project root. Ignored when `target: "user"`.',
    ),
  name: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9_-]+$/, 'Template name must use letters, digits, `_`, or `-` only.')
    .describe('Template filename without `.md` extension.'),
  target: z
    .enum(['project', 'user'])
    .optional()
    .describe(
      'Where the template lives. `"project"` (default) deletes from `<folder>/.ok/templates/`; `"user"` deletes from `~/.ok/templates/` (folder ignored).',
    ),
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const OutputSchema = outputSchemaWithText({
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
});

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
    async (args: { folder: string; name: string; target?: TemplateTarget; cwd?: string }) => {
      const context = await resolveProjectConfigContext(deps.resolveCwd, deps.config, args.cwd);
      if (!context.ok) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error: ${context.error}` }],
        };
      }
      const { cwd } = context;

      const deleteInput: Parameters<typeof applyTemplateDelete>[0] = {
        projectDir: cwd,
        folder: args.folder,
        name: args.name,
      };
      if (args.target !== undefined) deleteInput.target = args.target;
      const result = applyTemplateDelete(deleteInput);

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
