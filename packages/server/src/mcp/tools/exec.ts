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
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { argsOf, extractReferencedPaths, nonFlagArgs } from '../../bash/extract-paths.ts';
import { createBashInstance, execBash, StdoutOverflowError } from '../../bash/index.ts';
import { diffMtimes, snapshotMtimes } from '../../bash/mtime-scan.ts';
import {
  augmentStagesWithExcludes,
  type ErrorCategory,
  parseCommand,
  type Stage,
  serializeStages,
} from '../../bash/parse-command.ts';
import {
  type DirectoryMeta,
  type EnrichedEntry,
  type EnrichedMeta,
  enrichDirectory,
  enrichPath,
  fetchBacklinkCountsBatch,
  pathToDocName,
} from '../../content/enrichment.ts';
import {
  buildListResolver,
  docNameFromPath,
  type PreviewUrlSource,
  type UiInfo,
} from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import { resolveProjectServerContext, textPlusStructured } from './shared.ts';

const SOFT_CAP_LINES = 500;
const SOFT_CAP_BYTES = 50 * 1024;

const BINARY_EXT_RE = /\.(png|jpe?g|gif|webp|svg|pdf|zip|tar|gz|tgz|mp4|mov|mp3|wav|ico|bmp)$/i;

export const DESCRIPTION = [
  "**STOP — native tools on in-scope markdown (when project has `.ok/`).** When the active project contains `.ok/`, do NOT use your host's native `Read`, `Grep`, or `Glob` on `.md` / `.mdx` paths inside OK's content directory — use `exec` (this tool) instead. Native file tools skip frontmatter, backlinks, shadow-repo activity, and project git history that `exec` returns for every matched wiki file. Reserve native `Read`/`Grep`/`Glob` for source code, non-markdown paths, and projects without `.ok/`.",
  '',
  'Run a read-only bash-like command against the project content directory. Returns raw stdout plus enriched metadata for every wiki file referenced (frontmatter, backlink/forward-link counts, shadow-repo activity with agent/human attribution).',
  '',
  'Allowlist: cat, ls, grep, find, head, tail, wc, sort, uniq, cut. Pipes (|) work between stages. Redirections, subshells, and writes are rejected.',
  '',
  "cwd: the command runs in the explicit absolute `cwd` you pass, or in the MCP client's only advertised root when there is exactly one. If the client has zero or multiple roots, pass `cwd` explicitly. Paths inside the command resolve relative to that cwd; traversal above it is rejected.",
  '',
  'Stdout provenance headers (GNU-style): `ls <dir>/` prepends `<dir>/:`, single-file `cat`/`head`/`tail` prepends `==> <path> <==`, so the subject of the command is visible in raw output. Multi-file `cat a b` emits no header — the `enrichedPaths` array still lists every file. `head`/`tail` used as pipe trimmers (no file arg) defer to the upstream producer.',
  '',
  'Examples:',
  '- `exec({ command: "cat articles/auth.md" })` — file contents + full enrichment',
  '- `exec({ command: "ls articles/" })` — listing + per-file enrichment (slim)',
  '- `exec({ command: "grep -rn oauth articles/ | head -5" })` — pipe with enrichment on matched files',
  '- `exec({ command: "ls", cwd: "/abs/path/to/other-repo" })` — run in a different project',
].join('\n');

interface ExecDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
}

type ExecEnrichedEntry = EnrichedEntry & {
  previewUrl: string | null;
  previewUrlSource?: PreviewUrlSource;
};

export interface ExecStructuredResult {
  enrichedPaths: ExecEnrichedEntry[];
  ui?: UiInfo;
  cwd?: string;
  stdout?: string;
  warnings?: string[];
  stdoutTruncated?: boolean;
  error?: { category: ErrorCategory; message: string };
}

interface CapResult {
  text: string;
  truncated: boolean;
  omittedLines: number;
}

function applySoftCap(stdout: string): CapResult {
  const lines = stdout.split('\n');
  const contentLineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  if (contentLineCount <= SOFT_CAP_LINES && stdout.length <= SOFT_CAP_BYTES) {
    return { text: stdout, truncated: false, omittedLines: 0 };
  }
  const cutoff = Math.min(contentLineCount, SOFT_CAP_LINES);
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

function extractHeadTailLimit(args: string[]): number {
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const longEq = arg.match(/^--lines=(\d+)$/);
    if (longEq) return Number(longEq[1]);
    if (arg === '--lines' && i + 1 < args.length) {
      const n = Number(args[i + 1]);
      if (Number.isFinite(n)) return n;
    }
    if (arg === '-n' && i + 1 < args.length) {
      const n = Number(args[i + 1]);
      if (Number.isFinite(n)) return n;
    }
    const nJoined = arg.match(/^-n(\d+)$/);
    if (nJoined) return Number(nJoined[1]);
    const shortN = arg.match(/^-(\d+)$/);
    if (shortN) return Number(shortN[1]);
  }
  return 10;
}

function detectHeadTailTruncation(stages: Stage[], stdout: string): { banner: string } | null {
  if (stages.length < 2) return null; // need at least one upstream stage
  const last = stages[stages.length - 1];
  if (last.command !== 'head' && last.command !== 'tail') return null;
  const limit = extractHeadTailLimit(last.args);
  const rawLines = stdout.split('\n');
  const contentLineCount =
    rawLines[rawLines.length - 1] === '' ? rawLines.length - 1 : rawLines.length;
  if (contentLineCount < limit) return null;
  const countedLines = rawLines.slice(0, contentLineCount);
  const uniqueFiles = new Set(
    countedLines.map((l) => {
      const colon = l.indexOf(':');
      return colon > 0 ? l.slice(0, colon) : l;
    }),
  ).size;
  const upstream = stages
    .slice(0, -1)
    .map((s) => s.command)
    .join(' | ');
  return {
    banner:
      `Output hit \`${last.command} -${limit}\` cap (${contentLineCount} lines, ${uniqueFiles} unique file${uniqueFiles === 1 ? '' : 's'}). ` +
      `The \`${upstream}\` stage may have had more matches that never reached stdout. ` +
      `For existence checks across many files, prefer \`grep -rl PATTERN <dir>\` (list files only, no head). ` +
      `For enumeration, drop the \`| ${last.command}\` or widen the cap.`,
  };
}

function isDirectoryMeta(e: EnrichedEntry): e is DirectoryMeta {
  return (e as DirectoryMeta).type === 'directory';
}

function formatDirectoryEntry(d: DirectoryMeta): string {
  const leader = d.title ? `**${d.title}** (${d.path}/)` : `**${d.path}/** (directory)`;
  const parts: string[] = [leader];
  if (d.description) parts.push(d.description);
  if (d.tags && d.tags.length > 0) parts.push(`tags: ${d.tags.join(', ')}`);
  const counts: string[] = [];
  counts.push(`${d.recursiveMdCount} md file${d.recursiveMdCount === 1 ? '' : 's'}`);
  if (d.childDirCount > 0) {
    counts.push(`${d.childDirCount} subdir${d.childDirCount === 1 ? '' : 's'}`);
  }
  parts.push(counts.join(', '));
  if (d.mostRecentMd) {
    parts.push(
      `most recent: ${d.mostRecentMd.title ?? d.mostRecentMd.path} (${d.mostRecentMd.path})`,
    );
  }
  if (d.truncated) parts.push('scan truncated');
  return `- ${parts.join(' — ')}`;
}

function formatFileEntry(m: EnrichedMeta): string {
  const title = m.title ?? m.path;
  const parts: string[] = [`**${title}** (${m.path})`];
  if (m.description) parts.push(m.description);
  if (m.tags.length > 0) parts.push(`tags: ${m.tags.join(', ')}`);
  if (m.backlinkCount !== null) parts.push(`backlinks: ${m.backlinkCount}`);
  if (m.forwardLinkCount !== null) parts.push(`forward links: ${m.forwardLinkCount}`);
  if (m.history && m.history.length > 0) {
    const entries = m.history.map((h) => {
      const who =
        h.writerClassification === 'agent'
          ? `agent: ${h.writerName}`
          : h.writerClassification === 'principal'
            ? `human: ${h.writerName}`
            : `${h.writerClassification}: ${h.writerName}`;
      return `${h.hash.slice(0, 7)} [${who}] ${h.message}`;
    });
    parts.push(`OK edits: ${entries.join(' · ')}`);
  }
  if (m.projectHistory && m.projectHistory.length > 0) {
    const entries = m.projectHistory.map(
      (c) => `${c.hash.slice(0, 7)} ${c.authorName}: ${c.subject}`,
    );
    parts.push(`commits: ${entries.join(' · ')}`);
  }
  return `- ${parts.join(' — ')}`;
}

function buildStdoutProvenance(
  stages: Stage[],
  dirByPath: Map<string, DirectoryMeta>,
  fileByPath: Map<string, EnrichedMeta>,
): string {
  let stage: Stage | null = null;
  for (let i = stages.length - 1; i >= 0; i--) {
    const s = stages[i];
    const cmd = s.command;
    if (cmd === 'ls' || cmd === 'cat') {
      stage = s;
      break;
    }
    if ((cmd === 'head' || cmd === 'tail') && nonFlagArgs(argsOf(s)).length > 0) {
      stage = s;
      break;
    }
  }
  if (!stage) return '';

  const pathArgs = nonFlagArgs(argsOf(stage));

  if (stage.command === 'ls') {
    const dirArg = pathArgs[pathArgs.length - 1];
    if (!dirArg || dirArg === '.') return '';
    let n = dirArg.replace(/\/+/g, '/');
    if (n.startsWith('./')) n = n.slice(2);
    if (n.endsWith('/')) n = n.slice(0, -1);
    if (!n || !dirByPath.has(n)) return '';
    return `${n}/:\n`;
  }

  const wikiFiles = pathArgs.filter((p) => /\.(md|mdx)$/.test(p) && fileByPath.has(p));
  if (wikiFiles.length !== 1) return '';
  return `==> ${wikiFiles[0]} <==\n`;
}

function formatEnrichedBlock(enriched: EnrichedEntry[]): string {
  if (enriched.length === 0) return '';
  const lines: string[] = ['', '### Referenced files', ''];
  for (const e of enriched) {
    lines.push(isDirectoryMeta(e) ? formatDirectoryEntry(e) : formatFileEntry(e));
  }
  return lines.join('\n');
}

async function classifyPaths(
  cwd: string,
  paths: string[],
): Promise<{ files: string[]; dirs: string[] }> {
  const files: string[] = [];
  const dirs: string[] = [];
  await Promise.all(
    paths.map(async (p) => {
      try {
        const st = await stat(resolve(cwd, p));
        if (st.isDirectory()) {
          dirs.push(p);
        } else if (st.isFile()) {
          files.push(p);
        }
      } catch {
        if (/\.(md|mdx)$/i.test(p)) files.push(p);
      }
    }),
  );
  return { files, dirs };
}

function errorCategoryResult(category: ErrorCategory, message: string) {
  const structured: ExecStructuredResult = {
    enrichedPaths: [],
    error: { category, message },
  };
  return textPlusStructured(message, structured, true);
}

function withPreviewUrls(
  entries: EnrichedEntry[],
  resolve: (docName: string) => { url: string; source: PreviewUrlSource } | null,
): ExecEnrichedEntry[] {
  return entries.map((entry) => {
    const docName = docNameFromPath(entry.path);
    const resolved = resolve(docName);
    const withFields: ExecEnrichedEntry = {
      ...entry,
      previewUrl: resolved?.url ?? null,
      ...(resolved ? { previewUrlSource: resolved.source } : {}),
    } as ExecEnrichedEntry;
    return withFields;
  });
}

export async function buildExecResult(
  args: { command: string; cwd?: string },
  deps: ExecDeps,
): Promise<ReturnType<typeof textPlusStructured>> {
  const context = await resolveProjectServerContext(
    deps.resolveCwd,
    deps.config,
    deps.serverUrl,
    args.cwd,
  );
  if (!context.ok) {
    return errorCategoryResult('shell_construct_blocked', `exec failed: ${context.error}`);
  }
  const { cwd, config, url: resolvedServerUrl } = context;

  const parsed = parseCommand(args.command);
  if ('error' in parsed) {
    return errorCategoryResult(parsed.error.category, parsed.error.message);
  }
  const stages = augmentStagesWithExcludes(parsed.stages);
  const effectiveCommand = serializeStages(stages);

  const pre = await snapshotMtimes(cwd);

  const bash = createBashInstance(cwd);
  let stdout = '';
  let stderr = '';
  try {
    const result = await execBash(bash, effectiveCommand);
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

  const post = await snapshotMtimes(cwd);
  const mtimeDiff = diffMtimes(pre.snapshot, post.snapshot);
  if (mtimeDiff.changed.length > 0) {
    return errorCategoryResult(
      'security_invariant_violation',
      `Security invariant violated: file(s) in the content directory were modified during a read-only exec call: ${mtimeDiff.changed.join(', ')}. This indicates a parser bug; the command has been logged.`,
    );
  }

  const capped = applySoftCap(stdout);

  const paths = extractReferencedPaths(stdout, stages);
  const { files, dirs } = await classifyPaths(cwd, paths);
  const isSinglePathCat = stages.length === 1 && stages[0].command === 'cat' && files.length === 1;
  const fileEnriched: EnrichedMeta[] = await Promise.all(
    files.map((p) =>
      enrichPath(
        p,
        { projectDir: cwd, serverUrl: resolvedServerUrl },
        {
          includeRichFields: isSinglePathCat,
        },
      ).catch(
        (): EnrichedMeta => ({
          path: p,
          tags: [],
          frontmatter: {},
          backlinkCount: null,
          backlinks: null,
          forwardLinkCount: null,
          forwardLinks: null,
          history: null,
          historySource: null,
          projectHistory: null,
          projectHistorySource: null,
        }),
      ),
    ),
  );
  const dirEnriched: DirectoryMeta[] = await Promise.all(
    dirs.map((p) =>
      enrichDirectory(p, { projectDir: cwd }).catch(
        (): DirectoryMeta => ({
          path: p,
          type: 'directory',
          directMdCount: 0,
          recursiveMdCount: 0,
          childDirCount: 0,
          truncated: false,
        }),
      ),
    ),
  );
  if (!isSinglePathCat && resolvedServerUrl && fileEnriched.length > 0) {
    const docNames = fileEnriched.map((f) => pathToDocName(f.path));
    const counts = await fetchBacklinkCountsBatch(resolvedServerUrl, docNames).catch(() => null);
    if (counts) {
      for (const f of fileEnriched) {
        const c = counts.get(pathToDocName(f.path));
        if (typeof c === 'number') f.backlinkCount = c;
      }
    }
  }
  const fileByPath = new Map(fileEnriched.map((e) => [e.path, e]));
  const dirByPath = new Map(dirEnriched.map((e) => [e.path, e]));
  const enriched: EnrichedEntry[] = [];
  for (const p of paths) {
    const f = fileByPath.get(p);
    if (f) {
      enriched.push(f);
      continue;
    }
    const d = dirByPath.get(p);
    if (d) enriched.push(d);
  }

  const binaryHits = detectBinaryArgs(stages);
  const banners: string[] = [];
  if (binaryHits.length > 0) {
    banners.push(
      `File${binaryHits.length > 1 ? 's' : ''} ${binaryHits.join(', ')} appear${binaryHits.length === 1 ? 's' : ''} to be binary (image/PDF/etc.) — exec returns text only (NG8). For binary retrieval, use native Read.`,
    );
  }
  const truncation = detectHeadTailTruncation(stages, stdout);
  if (truncation) {
    banners.push(truncation.banner);
  }
  if (stderr) {
    banners.push(`stderr: ${stderr.trim()}`);
  }

  const bannerText = banners.length > 0 ? `${banners.join('\n')}\n\n` : '';
  const provenance = buildStdoutProvenance(stages, dirByPath, fileByPath);
  const stdoutText = provenance + capped.text;
  const enrichmentBlock = formatEnrichedBlock(enriched);
  const content = `${bannerText}${stdoutText}${enrichmentBlock}`;

  const { resolve, ui } = await buildListResolver({
    config,
    resolveCwd: async () => cwd,
  });
  const enrichedWithPreview: ExecEnrichedEntry[] = withPreviewUrls(enriched, resolve);
  const uiBlock: UiInfo | undefined = ui;

  const structured: ExecStructuredResult = {
    enrichedPaths: enrichedWithPreview,
    stdout: stdoutText,
    stdoutTruncated: capped.truncated,
    cwd,
    ...(uiBlock ? { ui: uiBlock } : {}),
    ...(banners.length > 0 ? { warnings: banners } : {}),
  };
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
      cwd: z
        .string()
        .optional()
        .describe(
          'Absolute host path to run the command from. Defaults only when the MCP client advertises exactly one root; otherwise pass `cwd` explicitly.',
        ),
    },
    async (args: { command: string; cwd?: string }) => {
      try {
        return await buildExecResult(args, deps);
      } catch (err) {
        const message = `exec handler error: ${err instanceof Error ? err.message : String(err)}`;
        return errorCategoryResult('shell_construct_blocked', message);
      }
    },
  );
}
