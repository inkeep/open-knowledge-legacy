import {
  type ComponentEntryFull,
  getAgentCanonicalDescriptors,
  projectFull,
} from '@inkeep/open-knowledge-core';
import { z } from 'zod';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import { outputSchemaWithText, ROUTED_CWD_DESCRIPTION, textPlusStructured } from './shared.ts';

const ID_CARDINALITY_CAP = 32;

export const DESCRIPTION = [
  '[Operates on registry data; no running OK server required] Return full per-entry details for the canonical components an agent picked from the inventory rendered in the `write_document` / `edit_document` tool descriptions.',
  '',
  'Each entry carries: literal source-form `example` (copy-pasteable) + form-aware `params` (every prop, with `type` / `values?` / `required` / `defaultValue?` / `description`). Unmatched ids surface in `notFound` rather than failing the call.',
  '',
  '**Parameters:**',
  `- \`ids\` — Array of canonical ids picked from the write-tool inventory (e.g. \`["Callout", "Tabs"]\`). Max ${ID_CARDINALITY_CAP} ids per call. Case-sensitive — must match the inventory exactly (\`Callout\` not \`callout\`; \`img\` not \`Image\`).`,
  '- `cwd` (optional) — Project root (see `cwd` description below).',
].join('\n');

interface GetComponentsDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
}

const InputSchema = {
  ids: z
    .array(z.string().min(1))
    .max(ID_CARDINALITY_CAP)
    .describe(
      `Array of canonical ids to fetch. Max ${ID_CARDINALITY_CAP} ids per call. Empty array returns an empty components list.`,
    ),
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const ParamSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'boolean', 'number', 'enum', 'reactnode']),
  values: z.array(z.string()).optional(),
  required: z.boolean(),
  defaultValue: z.union([z.string(), z.boolean(), z.number()]).optional(),
  description: z.string().optional(),
  omitOnDefault: z.literal(true).optional(),
  advanced: z.literal(true).optional(),
  language: z
    .enum(['mermaid', 'latex', 'html', 'json', 'yaml', 'javascript', 'markdown'])
    .optional(),
  accept: z.array(z.string()).optional(),
});

const ComponentEntrySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  kind: z.enum(['jsx-block', 'jsx-void']),
  example: z.string(),
  params: z.array(ParamSchema),
});

const OutputSchema = outputSchemaWithText({
  version: z.literal(1).describe('Schema version stamp — bump for breaking shape changes.'),
  components: z
    .array(ComponentEntrySchema)
    .describe('Full per-entry details for ids that matched.'),
  notFound: z.array(z.string()).describe('Ids that did not match any canonical descriptor.'),
});

export function register(server: ServerInstance, _deps: GetComponentsDeps): void {
  server.registerTool(
    'get_components',
    {
      description: DESCRIPTION,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args: { ids: string[]; cwd?: string }) => {
      void args.cwd;
      const canonicals = getAgentCanonicalDescriptors();
      const byId = new Map(canonicals.map((d) => [d.name, d]));
      const components: ComponentEntryFull[] = [];
      const notFound: string[] = [];
      const seen = new Set<string>();
      for (const id of args.ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const descriptor = byId.get(id);
        if (descriptor === undefined) {
          notFound.push(id);
          continue;
        }
        components.push(projectFull(descriptor));
      }
      const payload = { version: 1 as const, components, notFound };
      return textPlusStructured(JSON.stringify(payload, null, 2), payload);
    },
  );
}
