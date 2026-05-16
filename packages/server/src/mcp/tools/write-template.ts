import { z } from 'zod';
import {
  applyTemplateWrite,
  type TemplateFrontmatter,
  type TemplateTarget,
} from '../../content/templates-write.ts';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  outputSchemaWithText,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
} from './shared.ts';

export const DESCRIPTION = [
  '[Operates on disk; no running OK server required] Create or update a template.',
  '',
  'Templates are markdown starter shapes that agents pick from when creating a new doc — `write_document({ template: <name> })` resolves the name against the folder cascade and instantiates the body + frontmatter.',
  '',
  '**Targets.** A template can live in one of two locations:',
  '- `target: "project"` (default) — folder-scoped within the current project at `<folder>/.ok/templates/<name>.md`. The `folder` argument selects which project folder owns it (project-wide via `folder: ""`, or scoped to a subfolder).',
  '- `target: "user"` — user-global at `~/.ok/templates/<name>.md`, available across every OK project the same user opens. The `folder` argument is ignored when `target` is `"user"` — user templates live in a single flat location.',
  '',
  '**`title` is required** in the frontmatter — it is the menu surface agents pick from. Missing or empty title returns `TEMPLATE_TITLE_REQUIRED`. `description` is recommended (soft warning when absent) — it disambiguates similarly-named templates.',
  '',
  '**Substitution allowlist.** The body MAY contain `{{date}}` (today, ISO-8601) and `{{user}}` (calling principal display name). Any other `{{...}}` token is rejected at write time with `TEMPLATE_UNKNOWN_VARIABLE`. Substitution happens at instantiation time (when `write_document({ template })` materializes the doc), not at template-write time — templates on disk show the raw `{{date}}` token.',
  '',
  '**Parameters:**',
  '- `folder` — Project-root-relative folder (e.g. `"meetings"`, `"meetings/prep-notes"`). Empty / `.` means project root. Ignored when `target` is `"user"`.',
  '- `name` — Template filename without `.md`. Letters, digits, `_`, `-` only.',
  '- `body` — Markdown body. May use `{{date}}` / `{{user}}` substitution tokens. Other placeholder text in `{shape}` form (e.g. `{Meeting Title}`) is LITERAL — agents fill it in via subsequent `edit_document` calls.',
  '- `frontmatter` — `{title (required), description?, tags?: string[]}` for the template menu.',
  '- `target` (optional) — `"project"` (default) or `"user"`. Selects where the template lives.',
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
    .regex(
      /^[A-Za-z0-9_-]+$/,
      'Template name must use letters, digits, `_`, or `-` only (no slashes, dots, or spaces).',
    )
    .describe('Template filename without `.md` extension.'),
  body: z.string().describe('Markdown body for the template.'),
  frontmatter: z
    .object({
      title: z
        .string()
        .min(1, 'Template `title` is required — it is the menu surface agents pick from.')
        .describe(
          'Required. The menu surface agents pick from. Empty / missing returns TEMPLATE_TITLE_REQUIRED.',
        ),
      description: z
        .string()
        .optional()
        .describe(
          'Recommended. Disambiguates similarly-named templates. Soft warning when absent.',
        ),
      tags: z
        .array(z.string())
        .optional()
        .describe('Optional. Concatenated with cascade tags at instantiation time.'),
    })
    .describe(
      'Template menu metadata. `title` MUST be present (hard error if missing). `description` SHOULD be present (warning).',
    ),
  target: z
    .enum(['project', 'user'])
    .optional()
    .describe(
      'Where the template lives. `"project"` (default) writes to `<folder>/.ok/templates/`; `"user"` writes to `~/.ok/templates/` (folder ignored).',
    ),
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const OutputSchema = outputSchemaWithText({
  result: z.union([
    z.object({
      ok: z.literal(true),
      path: z.string(),
      created: z.boolean(),
      warnings: z.array(z.string()),
    }),
    z.object({
      ok: z.literal(false),
      error: z.object({ code: z.string(), message: z.string() }),
    }),
  ]),
});

interface WriteTemplateDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
}

export function register(server: ServerInstance, deps: WriteTemplateDeps): void {
  server.registerTool(
    'write_template',
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
      folder: string;
      name: string;
      body: string;
      frontmatter: TemplateFrontmatter;
      target?: TemplateTarget;
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

      const writeInput: Parameters<typeof applyTemplateWrite>[0] = {
        projectDir: cwd,
        folder: args.folder,
        name: args.name,
        body: args.body,
        frontmatter: args.frontmatter,
      };
      if (args.target !== undefined) writeInput.target = args.target;
      const result = applyTemplateWrite(writeInput);

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

      const lines = [`${result.created ? 'Created' : 'Updated'} template at ${result.path}`];
      if (result.warnings.length > 0) {
        lines.push('', 'Warnings:');
        for (const w of result.warnings) lines.push(`  - ${w}`);
      }
      return textPlusStructured(lines.join('\n'), { result });
    },
  );
}
