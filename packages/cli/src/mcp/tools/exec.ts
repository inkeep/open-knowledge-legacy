/**
 * `exec` MCP tool — the enriched bash surface.
 *
 * Orchestrates:
 *   1. parseCommand (shell-quote + allowlist) — primary security boundary
 *   2. snapshotMtimes (pre) — defense-in-depth baseline
 *   3. execBash via just-bash + ReadWriteFs (sandbox)
 *   4. snapshotMtimes (post) + diff — abort on any mutation (FR21)
 *   5. extractReferencedPaths
 *   6. enrichPath per path (slim shape for multi-path; rich for single-cat)
 *   7. Format: raw stdout + markdown `### Referenced files` block +
 *      structuredContent `{ enrichedPaths, error? }`
 *
 * Soft cap: 500 lines / 50 KB with truncation marker (per D9).
 * Hard cap: 16 MB → `output_overflow` error (StdoutOverflowError).
 * NG8: binary content (non-text/markdown files in `cat` argv) triggers
 * a warning banner.
 *
 * Spec: SPEC.md FR1 + FR4 + FR5 + FR6 + FR8 + FR14 + FR21 + D10 + D21.
 */
import { z } from 'zod';
import { extractReferencedPaths } from '../../bash/extract-paths.ts';
import { createBashInstance, execBash, StdoutOverflowError } from '../../bash/index.ts';
import { diffMtimes, snapshotMtimes } from '../../bash/mtime-scan.ts';
import { type ErrorCategory, parseCommand, type Stage } from '../../bash/parse-command.ts';
import { type EnrichedMeta, enrichPath } from '../../content/enrichment.ts';
import type { ServerInstance } from './shared.ts';
import { textPlusStructured } from './shared.ts';

/** Soft output cap: lines. */
const SOFT_CAP_LINES = 500;
/** Soft output cap: rendered bytes. */
const SOFT_CAP_BYTES = 50 * 1024;

/** Non-text extensions that trigger the NG8 binary-content warning. */
const BINARY_EXT_RE = /\.(png|jpe?g|gif|webp|svg|pdf|zip|tar|gz|tgz|mp4|mov|mp3|wav|ico|bmp)$/i;

export const DESCRIPTION = [
  'Run a read-only bash-like command against the project content directory. Returns raw stdout plus enriched metadata for every wiki file referenced (frontmatter, backlink count, shadow-repo activity with agent/human attribution).',
  '',
  'Allowlist: cat, ls, grep, find, head, tail, wc, sort, uniq, cut. Pipes (|) work between stages. Redirections, subshells, and writes are rejected.',
  '',
  'Examples:',
  '- `exec("cat articles/auth.md")` — file contents + full enrichment',
  '- `exec("ls articles/")` — listing + per-file enrichment (slim)',
  '- `exec("grep -rn oauth articles/ | head -5")` — pipe with enrichment on matched files',
].join('\n');

export interface ExecDeps {
  projectDir: string;
  serverUrl: string | undefined;
}

export interface ExecStructuredResult {
  enrichedPaths: EnrichedMeta[];
  error?: { category: ErrorCategory; message: string };
}

interface CapResult {
  text: string;
  truncated: boolean;
  omittedLines: number;
}

function applySoftCap(stdout: string): CapResult {
  const lines = stdout.split('\n');
  // Trailing empty line from final newline: don't count it as "content".
  const contentLineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  if (contentLineCount <= SOFT_CAP_LINES && stdout.length <= SOFT_CAP_BYTES) {
    return { text: stdout, truncated: false, omittedLines: 0 };
  }
  const cutoff = Math.min(contentLineCount, SOFT_CAP_LINES);
  // Build up kept text by bytes too
  let keptBytes = 0;
  let keptLines = 0;
  for (let i = 0; i < cutoff; i++) {
    const line = lines[i];
    keptBytes += line.length + 1;
    if (keptBytes > SOFT_CAP_BYTES) break;
    keptLines++;
  }
  const kept = lines.slice(0, keptLines).join('\n');
  const omitted = contentLineCount - keptLines;
  return {
    text: `${kept}\n<truncated: ${omitted} more lines — re-run with a more-specific query>`,
    truncated: true,
    omittedLines: omitted,
  };
}

function detectBinaryArgs(stages: Stage[]): string[] {
  // Only cat args are dereferenced as content; ls/grep/find list paths.
  const hits: string[] = [];
  for (const s of stages) {
    if (s.command !== 'cat') continue;
    for (const arg of s.args.slice(1)) {
      if (arg.startsWith('-')) continue;
      if (BINARY_EXT_RE.test(arg)) hits.push(arg);
    }
  }
  return hits;
}

function formatEnrichedBlock(enriched: EnrichedMeta[]): string {
  if (enriched.length === 0) return '';
  const lines: string[] = ['', '### Referenced files', ''];
  for (const m of enriched) {
    const title = m.title ?? m.path;
    const parts: string[] = [`**${title}** (${m.path})`];
    if (m.description) parts.push(m.description);
    if (m.tags.length > 0) parts.push(`tags: ${m.tags.join(', ')}`);
    if (m.backlinkCount !== null) parts.push(`backlinks: ${m.backlinkCount}`);
    if (m.history && m.history.length > 0) {
      const entries = m.history.map((h) => {
        const who =
          h.writerClassification === 'agent'
            ? `agent: ${h.writerName}`
            : h.writerClassification === 'human'
              ? `human: ${h.writerName}`
              : `${h.writerClassification}: ${h.writerName}`;
        return `${h.hash.slice(0, 7)} [${who}] ${h.message}`;
      });
      parts.push(`recent: ${entries.join(' · ')}`);
    }
    lines.push(`- ${parts.join(' — ')}`);
  }
  return lines.join('\n');
}

function errorCategoryResult(category: ErrorCategory, message: string) {
  const structured: ExecStructuredResult = {
    enrichedPaths: [],
    error: { category, message },
  };
  return textPlusStructured(message, structured, true);
}

export async function buildExecResult(
  args: { command: string },
  deps: ExecDeps,
): Promise<ReturnType<typeof textPlusStructured>> {
  // 1. Parse + validate
  const parsed = parseCommand(args.command);
  if ('error' in parsed) {
    return errorCategoryResult(parsed.error.category, parsed.error.message);
  }
  const stages = parsed.stages;

  // 2. Pre-exec mtime snapshot (FR21 baseline)
  const pre = await snapshotMtimes(deps.projectDir);

  // 3. Execute via just-bash
  const bash = createBashInstance(deps.projectDir);
  let stdout = '';
  let stderr = '';
  try {
    const result = await execBash(bash, args.command);
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err) {
    if (err instanceof StdoutOverflowError) {
      return errorCategoryResult(
        'output_overflow',
        `Output exceeded 16 MB buffer. Narrow the command (e.g., add a more specific grep pattern, use head, restrict the path).`,
      );
    }
    return errorCategoryResult(
      'shell_construct_blocked',
      `exec failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 4. Post-exec mtime check (FR21 backstop)
  const post = await snapshotMtimes(deps.projectDir);
  const mtimeDiff = diffMtimes(pre.snapshot, post.snapshot);
  if (mtimeDiff.changed.length > 0) {
    return errorCategoryResult(
      'security_invariant_violation',
      `Security invariant violated: file(s) in the content directory were modified during a read-only exec call: ${mtimeDiff.changed.join(', ')}. This indicates a parser bug; the command has been logged.`,
    );
  }

  // 5. Apply soft cap to stdout
  const capped = applySoftCap(stdout);

  // 6. Extract referenced wiki paths + enrich
  const paths = extractReferencedPaths(stdout, stages);
  // Single-path cat enrichment gets rich fields; all others get slim.
  const isSinglePathCat = stages.length === 1 && stages[0].command === 'cat' && paths.length === 1;
  const enriched: EnrichedMeta[] = await Promise.all(
    paths.map((p) =>
      enrichPath(
        p,
        { projectDir: deps.projectDir, serverUrl: deps.serverUrl },
        {
          includeRichFields: isSinglePathCat,
        },
      ).catch(
        (): EnrichedMeta => ({
          path: p,
          tags: [],
          backlinkCount: null,
          history: null,
          historySource: null,
        }),
      ),
    ),
  );

  // 7. Format output
  const binaryHits = detectBinaryArgs(stages);
  const banners: string[] = [];
  if (binaryHits.length > 0) {
    banners.push(
      `File${binaryHits.length > 1 ? 's' : ''} ${binaryHits.join(', ')} appear${binaryHits.length === 1 ? 's' : ''} to be binary (image/PDF/etc.) — exec returns text only (NG8). For binary retrieval, use native Read.`,
    );
  }
  if (stderr) {
    banners.push(`stderr: ${stderr.trim()}`);
  }

  const bannerText = banners.length > 0 ? `${banners.join('\n')}\n\n` : '';
  const stdoutText = capped.text;
  const enrichmentBlock = formatEnrichedBlock(enriched);
  const content = `${bannerText}${stdoutText}${enrichmentBlock}`;

  const structured: ExecStructuredResult = { enrichedPaths: enriched };
  return textPlusStructured(content, structured);
}

export function register(server: ServerInstance, deps: ExecDeps): void {
  server.tool(
    'exec',
    DESCRIPTION,
    {
      command: z
        .string()
        .describe(
          'Read-only bash command (allowlist: cat, ls, grep, find, head, tail, wc, sort, uniq, cut; pipes OK)',
        ),
    },
    async (args: { command: string }) => {
      try {
        return await buildExecResult(args, deps);
      } catch (err) {
        const message = `exec handler error: ${err instanceof Error ? err.message : String(err)}`;
        return errorCategoryResult('shell_construct_blocked', message);
      }
    },
  );
}
