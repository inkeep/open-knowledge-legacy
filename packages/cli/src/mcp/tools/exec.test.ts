import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  type Config,
  ConfigSchema,
  commitWip,
  initShadowRepo,
  type WriterIdentity,
} from '@inkeep/open-knowledge-server';
import simpleGit from 'simple-git';
import type { EnrichedMeta } from '../../content/enrichment.ts';
import { buildExecResult, DESCRIPTION, type ExecStructuredResult } from './exec.ts';
import { buildReadResult } from './read-document.ts';

describe('exec DESCRIPTION — STOP-rule anchoring (SPEC 2026-04-22 FR4 / US-007 / QA-009)', () => {
  test('total length fits Claude Code per-tool 2 KB cap', () => {
    expect(DESCRIPTION.length).toBeLessThanOrEqual(2048);
  });

  test('first 500 bytes contain STOP + (Read|Grep|Glob) + (.md|markdown)', () => {
    const head = DESCRIPTION.substring(0, 500);
    expect(head).toContain('STOP');
    const mentionsNativeTool =
      head.includes('Read') || head.includes('Grep') || head.includes('Glob');
    expect(mentionsNativeTool).toBe(true);
    const mentionsMarkdown = head.includes('.md') || head.includes('markdown');
    expect(mentionsMarkdown).toBe(true);
  });

  test('preserves pre-existing description shape (allowlist + cwd + examples)', () => {
    expect(DESCRIPTION).toContain('Allowlist: cat, ls, grep, find');
    expect(DESCRIPTION).toContain('cwd:');
    expect(DESCRIPTION).toContain('Examples:');
  });
});

const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

function fileEntries(s: ExecStructuredResult): EnrichedMeta[] {
  return s.enrichedPaths.filter(
    (e): e is EnrichedMeta => (e as { type?: string }).type !== 'directory',
  );
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-exec-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function bootstrap(): Promise<string> {
  const project = resolve(tmpDir, 'project');
  mkdirSync(project, { recursive: true });
  const git = simpleGit(project);
  await git.init();
  await git.raw('config', 'user.name', 'Test');
  await git.raw('config', 'user.email', 't@t.test');
  writeFileSync(resolve(project, 'README.md'), '# probe\n');
  await git.add('README.md');
  await git.commit('init');
  return project;
}

interface ExecResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function structured(result: ExecResult): ExecStructuredResult {
  return result.structuredContent as unknown as ExecStructuredResult;
}

describe('exec — happy path', () => {
  test('cat single file returns raw stdout + enrichment block + structuredContent', async () => {
    const project = await bootstrap();
    const contentDir = resolve(project, 'content');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      resolve(contentDir, 'auth.md'),
      '---\ntitle: Auth\ndescription: OAuth\ntags:\n  - auth\n---\n\nBody\n',
    );

    const result = (await buildExecResult(
      { command: 'cat content/auth.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Body');
    expect(result.content[0].text).toContain('### Referenced files');
    expect(result.content[0].text).toContain('Auth');

    const s = structured(result);
    const files = fileEntries(s);
    expect(files.length).toBe(1);
    expect(files[0].path).toBe('content/auth.md');
    expect(files[0].title).toBe('Auth');
    // rich shape on single-path cat
    expect(files[0].historySource).toBe('shadow-repo-absent');
  });

  test('ls returns slim enrichment for each matched path', async () => {
    const project = await bootstrap();
    const contentDir = resolve(project, 'articles');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'auth.md'), '---\ntitle: Auth\n---\nBody');
    writeFileSync(resolve(contentDir, 'sso.md'), '---\ntitle: SSO\n---\nBody');

    const result = (await buildExecResult(
      { command: 'ls articles/' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    const files = fileEntries(s);
    expect(files.length).toBe(2);
    // Slim shape: rich fields null
    for (const m of files) {
      expect(m.backlinkCount).toBe(null);
      expect(m.history).toBe(null);
      expect(m.historySource).toBe(null);
    }
  });

  test('pipe works: grep | head with enrichment on matches', async () => {
    const project = await bootstrap();
    const contentDir = resolve(project, 'articles');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'a.md'), '---\ntitle: A\n---\noauth flow');
    writeFileSync(resolve(contentDir, 'b.md'), '---\ntitle: B\n---\noauth example');
    writeFileSync(resolve(contentDir, 'c.md'), '---\ntitle: C\n---\nunrelated');

    const result = (await buildExecResult(
      { command: 'grep -rn oauth articles/ | head -5' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    expect(result.isError).toBeFalsy();
    const s = structured(result);
    const paths = s.enrichedPaths.map((p) => p.path);
    expect(paths).toContain('articles/a.md');
    expect(paths).toContain('articles/b.md');
    expect(paths).not.toContain('articles/c.md');
  });

  test('ls surfaces directory entries with folder metadata', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    const specA = resolve(specs, 'spec-a');
    const specAEvidence = resolve(specA, 'evidence');
    mkdirSync(specAEvidence, { recursive: true });
    writeFileSync(resolve(specA, 'SPEC.md'), '---\ntitle: Spec A\n---\nBody\n');
    writeFileSync(resolve(specAEvidence, 'e1.md'), '---\ntitle: E1\n---\nBody\n');
    mkdirSync(resolve(specs, 'spec-b'), { recursive: true });
    writeFileSync(resolve(specs, 'spec-b', 'SPEC.md'), '---\ntitle: Spec B\n---\nBody\n');

    const result = (await buildExecResult(
      { command: 'ls specs/' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    expect(result.isError).toBeFalsy();
    const s = structured(result);
    const dirs = s.enrichedPaths.filter(
      (e): e is Extract<typeof e, { type: 'directory' }> =>
        (e as { type?: string }).type === 'directory',
    );
    // Parent `specs` + two children (`specs/spec-a`, `specs/spec-b`).
    expect(dirs.length).toBe(3);
    const parentEntry = dirs.find((d) => d.path === 'specs');
    expect(parentEntry).toBeDefined();
    const specAEntry = dirs.find((d) => d.path === 'specs/spec-a');
    expect(specAEntry).toBeDefined();
    expect(specAEntry?.directMdCount).toBe(1);
    expect(specAEntry?.recursiveMdCount).toBe(2);
    expect(specAEntry?.childDirCount).toBe(1);
    expect(specAEntry?.mostRecentMd).toBeDefined();
    // Content block renders folder summary
    expect(result.content[0].text).toContain('specs/spec-a/');
    expect(result.content[0].text).toContain('md file');
  });

  test('ls with explicit dir arg surfaces parent folder frontmatter', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '# Foo\n');

    const configWithRules: Config = ConfigSchema.parse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: { title: 'Specs', description: 'Specifications', tags: ['spec'] },
        },
      ],
    });

    const result = (await buildExecResult(
      { command: 'ls specs/' },
      { resolveCwd: async () => project, serverUrl: undefined, config: configWithRules },
    )) as ExecResult;

    const s = structured(result);
    const dirs = s.enrichedPaths.filter(
      (e): e is Extract<typeof e, { type: 'directory' }> =>
        (e as { type?: string }).type === 'directory',
    );
    const parent = dirs.find((d) => d.path === 'specs');
    expect(parent).toBeDefined();
    expect(parent?.title).toBe('Specs');
    expect(parent?.description).toBe('Specifications');
    expect(parent?.tags).toEqual(['spec']);
  });
});

describe('exec — stdout provenance headers', () => {
  test('`ls <dir>/` prepends `<dir>/:` header to stdout', async () => {
    const project = await bootstrap();
    const contentDir = resolve(project, 'articles');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'auth.md'), '# Auth\n');

    const result = (await buildExecResult(
      { command: 'ls articles/' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    expect(s.stdout?.startsWith('articles/:\n')).toBe(true);
    expect(result.content[0].text).toContain('articles/:\n');
  });

  test('`ls .` emits no header (no explicit subject dir)', async () => {
    const project = await bootstrap();
    writeFileSync(resolve(project, 'top.md'), '# Top\n');

    const result = (await buildExecResult(
      { command: 'ls .' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    expect(s.stdout?.startsWith('./:')).toBe(false);
    expect(s.stdout?.startsWith('.:')).toBe(false);
  });

  test('`cat <file.md>` prepends `==> <file> <==` header to stdout', async () => {
    const project = await bootstrap();
    const contentDir = resolve(project, 'articles');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'auth.md'), '# Auth\n\nBody\n');

    const result = (await buildExecResult(
      { command: 'cat articles/auth.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    expect(s.stdout?.startsWith('==> articles/auth.md <==\n')).toBe(true);
  });

  test('multi-file `cat a.md b.md` emits no header (would imply false boundaries)', async () => {
    const project = await bootstrap();
    const contentDir = resolve(project, 'articles');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'a.md'), 'A\n');
    writeFileSync(resolve(contentDir, 'b.md'), 'B\n');

    const result = (await buildExecResult(
      { command: 'cat articles/a.md articles/b.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    expect(s.stdout).not.toContain('==>');
    // enrichedPaths still lists every file read, so provenance is preserved.
    const files = fileEntries(s);
    expect(files.map((f) => f.path).sort()).toEqual(['articles/a.md', 'articles/b.md']);
  });

  test('`head <file.md>` prepends file header AND enriches the file', async () => {
    const project = await bootstrap();
    const contentDir = resolve(project, 'articles');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'auth.md'), '---\ntitle: Auth\n---\nBody\n');

    const result = (await buildExecResult(
      { command: 'head -5 articles/auth.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    expect(s.stdout?.startsWith('==> articles/auth.md <==\n')).toBe(true);
    const files = fileEntries(s);
    expect(files.some((f) => f.path === 'articles/auth.md')).toBe(true);
  });

  test('`cat X | head -5` — cat header wins, head is a trimmer', async () => {
    const project = await bootstrap();
    const contentDir = resolve(project, 'articles');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'auth.md'), 'line 1\nline 2\nline 3\n');

    const result = (await buildExecResult(
      { command: 'cat articles/auth.md | head -2' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    expect(s.stdout?.startsWith('==> articles/auth.md <==\n')).toBe(true);
  });
});

describe('exec — folder-rule flow-through (US-005 / QA-001 / QA-002)', () => {
  test('ls on a folder with a matching rule surfaces folder fields (QA-001)', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '# Foo\n');

    const configWithRules: Config = ConfigSchema.parse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: { title: 'Specs', description: 'Specifications', tags: ['spec'] },
        },
      ],
    });

    const result = (await buildExecResult(
      { command: 'ls .' },
      { resolveCwd: async () => project, serverUrl: undefined, config: configWithRules },
    )) as ExecResult;

    const s = structured(result);
    const dirs = s.enrichedPaths.filter(
      (e): e is Extract<typeof e, { type: 'directory' }> =>
        (e as { type?: string }).type === 'directory',
    );
    const specsEntry = dirs.find((d) => d.path === 'specs');
    expect(specsEntry).toBeDefined();
    expect(specsEntry?.title).toBe('Specs');
    expect(specsEntry?.description).toBe('Specifications');
    expect(specsEntry?.tags).toEqual(['spec']);
  });

  test('cat merges file + folder frontmatter (QA-002)', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '---\ntitle: Foo\ntags:\n  - wip\n---\nBody\n');

    const configWithRules: Config = ConfigSchema.parse({
      folders: [{ match: 'specs/**', frontmatter: { title: 'Specs', tags: ['spec'] } }],
    });

    const result = (await buildExecResult(
      { command: 'cat specs/foo.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config: configWithRules },
    )) as ExecResult;

    const files = fileEntries(structured(result));
    expect(files.length).toBe(1);
    expect(files[0].title).toBe('Foo'); // file wins
    expect(files[0].tags).toEqual(['spec', 'wip']); // concat, file last, dedup
  });

  test('ls Referenced files text block renders folder-rule title/description/tags on directory rows', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '# Foo\n');

    const configWithRules: Config = ConfigSchema.parse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: {
            title: 'Specifications',
            description: 'Product + technical specs',
            tags: ['spec', 'wip'],
          },
        },
      ],
    });

    const result = (await buildExecResult(
      { command: 'ls .' },
      { resolveCwd: async () => project, serverUrl: undefined, config: configWithRules },
    )) as ExecResult;

    const text = result.content[0].text;
    // Leader should use the folder title, with path in parens
    expect(text).toContain('**Specifications** (specs/)');
    // Description rendered
    expect(text).toContain('Product + technical specs');
    // Tags rendered in the same format as file entries
    expect(text).toContain('tags: spec, wip');
  });

  test('ls Referenced files text block falls back to path label when no folder rule matches', async () => {
    const project = await bootstrap();
    const reports = resolve(project, 'reports');
    mkdirSync(reports, { recursive: true });
    writeFileSync(resolve(reports, 'report.md'), '# Report\n');

    // Rule exists but does not match the `reports/` folder.
    const configWithRules: Config = ConfigSchema.parse({
      folders: [{ match: 'specs/**', frontmatter: { title: 'Specs' } }],
    });

    const result = (await buildExecResult(
      { command: 'ls .' },
      { resolveCwd: async () => project, serverUrl: undefined, config: configWithRules },
    )) as ExecResult;

    const text = result.content[0].text;
    // No folder-rule title applied → falls back to path-label format
    expect(text).toContain('**reports/** (directory)');
    expect(text).not.toContain('**Specs** (reports/)');
  });

  test('empty folders config behaves identically to no folders (backwards compat QA-006)', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '---\ntitle: Foo\n---\nBody\n');

    const result = (await buildExecResult(
      { command: 'ls .' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    const dirs = s.enrichedPaths.filter(
      (e): e is Extract<typeof e, { type: 'directory' }> =>
        (e as { type?: string }).type === 'directory',
    );
    const specsEntry = dirs.find((d) => d.path === 'specs');
    expect(specsEntry).toBeDefined();
    expect(specsEntry?.title).toBeUndefined();
    expect(specsEntry?.description).toBeUndefined();
    expect(specsEntry?.tags).toBeUndefined();
  });
});

describe('exec — categorized errors', () => {
  test('unknown_command when first token not in allowlist', async () => {
    const project = await bootstrap();
    const result = (await buildExecResult(
      { command: 'awk BEGIN{}' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    expect(result.isError).toBe(true);
    const s = structured(result);
    expect(s.error?.category).toBe('unknown_command');
    expect(s.error?.message).toContain('allowlist');
  });

  test('write_blocked on redirection', async () => {
    const project = await bootstrap();
    const result = (await buildExecResult(
      { command: 'grep x . > out.txt' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    expect(result.isError).toBe(true);
    expect(structured(result).error?.category).toBe('write_blocked');
  });

  test('shell_construct_blocked on subshell', async () => {
    const project = await bootstrap();
    const result = (await buildExecResult(
      { command: 'cat `ls`' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    expect(result.isError).toBe(true);
    expect(structured(result).error?.category).toBe('shell_construct_blocked');
  });
});

describe('exec — binary file NG8 warning', () => {
  test('cat on an image path produces warning banner', async () => {
    const project = await bootstrap();
    const contentDir = resolve(project, 'assets');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'diagram.png'), 'PNG\x00binary');

    const result = (await buildExecResult(
      { command: 'cat assets/diagram.png' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    expect(result.content[0].text).toContain('appears to be binary');
    expect(result.content[0].text).toContain('native Read');
  });
});

describe('exec — CC9 parity with read_document', () => {
  test('enrichment fields match read_document output for same path', async () => {
    const project = await bootstrap();
    const shadow = await initShadowRepo(project);
    const contentDir = resolve(project, 'articles');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      resolve(contentDir, 'parity.md'),
      '---\ntitle: Parity\ndescription: Test\ntags:\n  - x\n---\n\nBody\n',
    );
    const writer: WriterIdentity = { id: 'agent-x', name: 'X', email: 'x@t.test' };
    const branch = (await simpleGit(project).revparse(['--abbrev-ref', 'HEAD'])).trim();
    await commitWip(shadow, writer, contentDir, 'wrote parity', branch);

    // exec("cat articles/parity.md") → pulls rich enrichment
    const execResult = (await buildExecResult(
      { command: 'cat articles/parity.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;
    const execMeta = fileEntries(structured(execResult))[0];

    // read_document("articles/parity.md") — same data source (enrichPath)
    const readOutput = await buildReadResult(
      { path: 'articles/parity.md' },
      {
        resolveCwd: async () => project,
        serverUrl: undefined,
        config: DEFAULT_CONFIG,
      },
    );

    // CC9 parity: exec's structuredContent fields should be derivable from
    // read_document's rendered output (both go through the shared enrichPath).
    expect(execMeta.title).toBe('Parity');
    expect(execMeta.tags).toEqual(['x']);
    expect(execMeta.historySource).toBe('shadow-repo');
    expect(execMeta.history?.length).toBe(1);
    expect(execMeta.history?.[0].writerClassification).toBe('agent');

    expect(readOutput).toContain('## Parity');
    expect(readOutput).toContain('**Description:** Test');
    expect(readOutput).toContain('**Tags:** x');
    expect(readOutput).toContain('### Recent activity');
    expect(readOutput).toContain('[agent: X]');
    expect(readOutput).toContain('wrote parity');
  });
});

describe('exec — head/tail truncation banner', () => {
  async function seed(project: string, nFiles: number, linesPerFile: number): Promise<void> {
    const content = resolve(project, 'content');
    mkdirSync(content, { recursive: true });
    for (let i = 0; i < nFiles; i++) {
      const body = Array.from({ length: linesPerFile }, (_, j) => `line ${j} needle`).join('\n');
      writeFileSync(resolve(content, `doc${String(i).padStart(3, '0')}.md`), `${body}\n`);
    }
  }

  test('warns when `grep | head -N` hits its cap', async () => {
    const project = await bootstrap();
    await seed(project, 5, 20); // 5 files × 20 lines = 100 matching lines, capped to 10

    const result = (await buildExecResult(
      { command: 'grep -rn needle content/ | head -10' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toMatch(/Output hit `head -10` cap/);
    expect(text).toMatch(/grep -rl PATTERN <dir>/);
  });

  test('does NOT warn when output is below the head cap', async () => {
    const project = await bootstrap();
    await seed(project, 1, 3); // only 3 matches, below head -10 default

    const result = (await buildExecResult(
      { command: 'grep -rn needle content/ | head' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).not.toMatch(/Output hit/);
  });

  test('does NOT warn on single-stage commands (no head/tail at end)', async () => {
    const project = await bootstrap();
    await seed(project, 3, 5);

    const result = (await buildExecResult(
      { command: 'grep -rn needle content/' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).not.toMatch(/Output hit/);
  });

  test('warns on `tail -N` truncation too', async () => {
    const project = await bootstrap();
    await seed(project, 5, 10);

    const result = (await buildExecResult(
      { command: 'grep -rn needle content/ | tail -5' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toMatch(/Output hit `tail -5` cap/);
  });

  test('recognizes `-n N` flag form', async () => {
    const project = await bootstrap();
    await seed(project, 5, 10);

    const result = (await buildExecResult(
      { command: 'grep -rn needle content/ | head -n 8' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toMatch(/Output hit `head -8` cap/);
  });
});

describe('exec — structuredContent mirrors stdout + warnings (Desktop fix)', () => {
  async function seed(project: string, nFiles: number, linesPerFile: number): Promise<void> {
    const content = resolve(project, 'content');
    mkdirSync(content, { recursive: true });
    for (let i = 0; i < nFiles; i++) {
      const body = Array.from({ length: linesPerFile }, (_, j) => `line ${j} needle`).join('\n');
      writeFileSync(resolve(content, `doc${String(i).padStart(3, '0')}.md`), `${body}\n`);
    }
  }

  test('structuredContent.stdout contains the raw output', async () => {
    const project = await bootstrap();
    const content = resolve(project, 'content');
    mkdirSync(content, { recursive: true });
    writeFileSync(resolve(content, 'a.md'), '---\ntitle: A\n---\n\nalpha body\n');

    const result = (await buildExecResult(
      { command: 'cat content/a.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    expect(typeof s.stdout).toBe('string');
    expect(s.stdout).toContain('alpha body');
    expect(s.stdoutTruncated).toBe(false);
  });

  test('structuredContent.warnings includes head-cap truncation banner', async () => {
    const project = await bootstrap();
    await seed(project, 5, 20);

    const result = (await buildExecResult(
      { command: 'grep -rn needle content/ | head -10' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    expect(s.warnings).toBeDefined();
    expect(s.warnings?.some((w) => /Output hit `head -10` cap/.test(w))).toBe(true);
  });

  test('structuredContent.warnings absent when no banner fires', async () => {
    const project = await bootstrap();
    const content = resolve(project, 'content');
    mkdirSync(content, { recursive: true });
    writeFileSync(resolve(content, 'tiny.md'), 'only a few lines\n');

    const result = (await buildExecResult(
      { command: 'cat content/tiny.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    expect(s.warnings).toBeUndefined();
  });

  test('stdoutTruncated true when soft-cap applies', async () => {
    const project = await bootstrap();
    const content = resolve(project, 'content');
    mkdirSync(content, { recursive: true });
    const body = Array.from({ length: 600 }, (_, i) => `line ${i}`).join('\n');
    writeFileSync(resolve(content, 'big.md'), `${body}\n`);

    const result = (await buildExecResult(
      { command: 'cat content/big.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    expect(s.stdoutTruncated).toBe(true);
  });
});

describe('exec — per-row previewUrl + top-level ui block (FR-2.2 / FR-2.6)', () => {
  test('emits previewUrl per enriched file + ui block when config provided', async () => {
    const project = await bootstrap();
    const originalEnv = process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    try {
      const contentDir = resolve(project, 'articles');
      mkdirSync(contentDir, { recursive: true });
      writeFileSync(resolve(contentDir, 'auth.md'), '---\ntitle: Auth\n---\nBody');
      writeFileSync(resolve(contentDir, 'sso.md'), '---\ntitle: SSO\n---\nBody');

      const result = (await buildExecResult(
        { command: 'ls articles/' },
        { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
      )) as ExecResult;

      const s = structured(result);
      const files = fileEntries(s);
      expect(files.length).toBe(2);
      for (const f of files) {
        const docName = f.path.replace(/\.(md|mdx)$/i, '');
        expect((f as unknown as { previewUrl: string }).previewUrl).toBe(
          `https://env.example/#/${docName}`,
        );
        expect((f as unknown as { previewUrlSource: string }).previewUrlSource).toBe('env');
      }
      expect(s.ui).toEqual({ baseUrl: null, port: null });
    } finally {
      if (originalEnv === undefined) delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
      else process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = originalEnv;
    }
  });

  test('previewUrl null when resolver returns null', async () => {
    const project = await bootstrap();
    const contentDir = resolve(project, 'articles');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'auth.md'), '---\ntitle: Auth\n---\nBody');

    const result = (await buildExecResult(
      { command: 'ls articles/' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    )) as ExecResult;

    const s = structured(result);
    const files = fileEntries(s);
    expect(files.length).toBe(1);
    expect((files[0] as unknown as { previewUrl: string | null }).previewUrl).toBeNull();
    expect(s.ui).toEqual({ baseUrl: null, port: null });
  });

  // Removed after merge: "without config" back-compat test. Post-merge, main's
  // folder-rule work made `config` required on ExecDeps (it's threaded through
  // to `enrichPath` for folder-frontmatter resolution), so the optional-config
  // path no longer exists. Callers always pass config via tools/index.ts.
});
