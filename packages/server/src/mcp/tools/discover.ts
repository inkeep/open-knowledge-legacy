import { z } from 'zod';
import { buildDiscoverBody } from './discover-body.ts';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';
import {
  outputSchemaWithText,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectConfigContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  'Set up an existing repo for Open Knowledge by extracting conventions from existing siblings + activating the link graph. Multi-step instructional body with seven phases and per-phase user-confirmation STOP gates.',
  '',
  '**Use when:**',
  '- First arrival at a repo that has existing markdown content AND no folder frontmatter / templates configured',
  '- `list_documents` returns empty `frontmatter_defaults` + empty `templates_available` for substantial folders',
  '- User explicitly asks to onboard / set up / configure an existing repo',
  '',
  '**Do NOT invoke when:**',
  '- The repo is empty (< 5 .md files) — use `ok seed` instead',
  '- The repo is already fully configured (every substantial folder has folder frontmatter + templates)',
  '',
  'One-shot per project. Idempotent on re-run — detects prior configuration and switches to "extend mode" (proposes additions only, never re-proposes existing artifacts). **Requires the OK Hocuspocus server running** — most primitives the body composes (`list_documents`, `read_document`, link-graph) hit the server. Phase 1 step 0 enforces this; if the server is down, the tool exits cleanly with a "run `open-knowledge start`" instruction. Only `exec`, `set_folder_rule`, `write_template`, and the `.okignore` write are fs-direct.',
  '',
  '**Composes existing primitives only** — no new MCP tools, no schema changes. Uses `exec`, `list_documents`, `read_document`, `search`, `set_folder_rule`, `write_template`, `get_orphans`, `get_hubs`, `get_dead_links`, `get_backlinks`, `get_forward_links`, `suggest_links`, `edit_document`.',
].join('\n');

interface DiscoverDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
}

const InputSchema = {
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const OutputSchema = outputSchemaWithText({
  previewUrl: z.null(),
});

export function register(server: ServerInstance, deps: DiscoverDeps): void {
  server.registerTool(
    'discover',
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
    async (args: { cwd?: string }) => {
      const context = await resolveProjectConfigContext(deps.resolveCwd, deps.config, args.cwd);
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const body = buildDiscoverBody(context.config.content.dir);
      return textPlusStructured(body, { previewUrl: null });
    },
  );
}
