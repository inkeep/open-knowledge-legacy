/**
 * `write_template` MCP tool — create / update a folder-scoped template.
 *
 * Thin wrapper around `applyTemplateWrite` from
 * `../../content/templates-write.ts`. Templates are filesystem-only assets
 * (NOT CRDT-managed — spec §11), so the write goes fs-direct via tmp+rename.
 *
 * Idempotent: calling twice with the same `(folder, name)` overwrites the
 * existing template. Lazy-creates `<folder>/.ok/` and `<folder>/.ok/templates/`
 * if missing. Soft-warns when `frontmatter.title` or `frontmatter.description`
 * is absent (D14 soft contract — agents pick from these).
 *
 * Spec: 2026-05-01-folder-level-metadata-and-templates §6.3, FR11.
 */

import { z } from 'zod';
import { applyTemplateWrite, type TemplateFrontmatter } from '../../content/templates-write.ts';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
} from './shared.ts';

export const DESCRIPTION = [
  '[Operates on disk; no running OK server required] Create or update a folder-scoped template at `<folder>/.ok/templates/<name>.md`.',
  '',
  'Templates are markdown starter shapes that agents pick from when creating a new doc — `write_document({ template: <name> })` resolves the name against the folder cascade and instantiates the body + frontmatter.',
  '',
  '**Strongly recommended:** include `title` + `description` in the frontmatter. Agents pick templates from the menu using these fields; missing them undermines the menu UX (D14 soft contract — surfaced as a warning, not an error).',
  '',
  '**Parameters:**',
  '- `folder` — Project-root-relative folder where the template lives (e.g. `"meetings"`, `"meetings/prep-notes"`). Empty / `.` means the project root.',
  '- `name` — Template filename without `.md`. Letters, digits, `_`, `-` only.',
  '- `body` — Markdown body (placeholders like `{Meeting Title}` are LITERAL text — there is no variable substitution engine in v1).',
  '- `frontmatter` — `{title?, description?, tags?: string[]}` for the template menu.',
].join('\n');

const InputSchema = {
  folder: z.string().describe('Project-root-relative folder. Empty / `.` means project root.'),
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
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .describe('Template menu metadata. SHOULD include title + description (D14).'),
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const OutputSchema = {
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
} as const;

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

      const result = applyTemplateWrite({
        projectDir: cwd,
        folder: args.folder,
        name: args.name,
        body: args.body,
        frontmatter: args.frontmatter,
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

      const lines = [`${result.created ? 'Created' : 'Updated'} template at ${result.path}`];
      if (result.warnings.length > 0) {
        lines.push('', 'Warnings:');
        for (const w of result.warnings) lines.push(`  - ${w}`);
      }
      return textPlusStructured(lines.join('\n'), { result });
    },
  );
}
