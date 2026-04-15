/**
 * `get_preview_url` MCP tool.
 *
 * Agents call this right before editing a doc so they can navigate the
 * preview browser to the target URL first — the edit then
 * streams live into the already-open editor. Primary pre-edit surface
 * per D3.
 *
 * Returns `{ previewUrl: string, previewUrlSource: 'env' | 'lock' | 'config' }`
 * when resolvable, `{ previewUrl: null }` when no source resolves (NOT an
 * error — agent may proceed without navigation).
 *
 * Rejects docNames that fall outside the configured `content.include` glob
 * patterns, mirroring the filter used by `search` and the wiki-write tools.
 */
import { createContentFilter } from '@inkeep/open-knowledge-server';
import { z } from 'zod';
import { resolveContentDir, resolveLockDir } from '../../config/paths.ts';
import type { Config } from '../../config/schema.ts';
import { resolvePreviewUrl } from './preview-url.ts';
import type { ServerInstance } from './shared.ts';
import { normalizeDocName, textPlusStructured, textResult } from './shared.ts';

export const DESCRIPTION = [
  'Return a browser URL for the given wiki docName. Agents should call this IMMEDIATELY BEFORE `write_document` / `edit_document` so they can navigate the preview browser to the doc first and watch the CRDT edit land live.',
  '',
  '**Parameters:**',
  '- `docName` — Wiki doc name, typically without extension.',
  '',
  'Returns `{ previewUrl, previewUrlSource }` (source: `env` / `lock` / `config`). When no source is configured, returns `{ previewUrl: null }` and the agent may proceed without navigation.',
].join('\n');

export interface GetPreviewUrlDeps {
  /** Async resolver for per-call cwd; see `ResolveCwd` in tools/index.ts. */
  resolveCwd: (explicit?: string) => Promise<string>;
  config: Config;
}

export interface GetPreviewUrlResult {
  previewUrl: string | null;
  previewUrlSource?: 'env' | 'lock' | 'config';
}

export async function buildGetPreviewUrlResult(
  args: { docName: string },
  deps: GetPreviewUrlDeps,
): Promise<{ ok: true; result: GetPreviewUrlResult; text: string } | { ok: false; error: string }> {
  const normalized = normalizeDocName(args.docName);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }
  const docName = normalized.docName;

  // Content-include check — mirrors search.ts / wiki-write tools. Try both
  // canonical extensions (.md, .mdx) since docNames are extension-less.
  const cwd = await deps.resolveCwd();
  const contentDir = resolveContentDir(deps.config, cwd);
  let filter: ReturnType<typeof createContentFilter>;
  try {
    filter = createContentFilter({
      projectDir: cwd,
      contentDir,
      includePatterns: deps.config.content.include,
      excludePatterns: deps.config.content.exclude,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Cannot evaluate content filter: ${msg}` };
  }

  // `isExcluded` returns true when a path is either outside include OR in exclude.
  // A docName is "wiki-included" iff at least one plausible extension is NOT
  // excluded. We test both .md and .mdx.
  const candidates = [`${docName}.md`, `${docName}.mdx`];
  const included = candidates.some((rel) => !filter.isExcluded(rel));
  if (!included) {
    return {
      ok: false,
      error: `Error: docName "${docName}" is not inside content.include globs (${deps.config.content.include.join(', ')}). This tool only returns URLs for wiki-tracked docs.`,
    };
  }

  const lockDir = resolveLockDir(contentDir);
  const resolved = resolvePreviewUrl(docName, {
    config: deps.config,
    lockDir,
  });
  if (!resolved) {
    return {
      ok: true,
      result: { previewUrl: null },
      text: `No preview URL resolvable for "${docName}". The server is likely not running yet. Start it with \`open-knowledge start\` (or \`preview_start\`), then **call \`get_preview_url\` again** — the server writes a lock file that this tool reads to resolve the URL. NEVER guess or manually construct the preview URL. Alternatively, set \`OPEN_KNOWLEDGE_PREVIEW_BASE_URL\` or add \`preview.baseUrl\` to .open-knowledge/config.yml.`,
    };
  }
  return {
    ok: true,
    result: { previewUrl: resolved.url, previewUrlSource: resolved.source },
    text: `Preview URL for "${docName}" (source: ${resolved.source}):\n${resolved.url}`,
  };
}

export function register(server: ServerInstance, deps: GetPreviewUrlDeps): void {
  server.tool('get_preview_url', DESCRIPTION, { docName: z.string().min(1) }, async (args) => {
    const outcome = await buildGetPreviewUrlResult(args, deps);
    if (!outcome.ok) {
      return textResult(outcome.error, true);
    }
    return textPlusStructured(outcome.text, outcome.result);
  });
}
