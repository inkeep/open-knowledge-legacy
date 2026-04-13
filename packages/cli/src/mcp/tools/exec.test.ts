import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { commitWip, initShadowRepo, type WriterIdentity } from '@inkeep/open-knowledge-server';
import simpleGit from 'simple-git';
import { buildExecResult, type ExecStructuredResult } from './exec.ts';
import { buildReadResult } from './read-document.ts';

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
      { projectDir: project, serverUrl: undefined },
    )) as ExecResult;

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Body');
    expect(result.content[0].text).toContain('### Referenced files');
    expect(result.content[0].text).toContain('Auth');

    const s = structured(result);
    expect(s.enrichedPaths.length).toBe(1);
    expect(s.enrichedPaths[0].path).toBe('content/auth.md');
    expect(s.enrichedPaths[0].title).toBe('Auth');
    // rich shape on single-path cat
    expect(s.enrichedPaths[0].historySource).toBe('shadow-repo-absent');
  });

  test('ls returns slim enrichment for each matched path', async () => {
    const project = await bootstrap();
    const contentDir = resolve(project, 'articles');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'auth.md'), '---\ntitle: Auth\n---\nBody');
    writeFileSync(resolve(contentDir, 'sso.md'), '---\ntitle: SSO\n---\nBody');

    const result = (await buildExecResult(
      { command: 'ls articles/' },
      { projectDir: project, serverUrl: undefined },
    )) as ExecResult;

    const s = structured(result);
    expect(s.enrichedPaths.length).toBe(2);
    // Slim shape: rich fields null
    for (const m of s.enrichedPaths) {
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
      { projectDir: project, serverUrl: undefined },
    )) as ExecResult;

    expect(result.isError).toBeFalsy();
    const s = structured(result);
    const paths = s.enrichedPaths.map((p) => p.path);
    expect(paths).toContain('articles/a.md');
    expect(paths).toContain('articles/b.md');
    expect(paths).not.toContain('articles/c.md');
  });
});

describe('exec — categorized errors', () => {
  test('unknown_command when first token not in allowlist', async () => {
    const project = await bootstrap();
    const result = (await buildExecResult(
      { command: 'awk BEGIN{}' },
      { projectDir: project, serverUrl: undefined },
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
      { projectDir: project, serverUrl: undefined },
    )) as ExecResult;

    expect(result.isError).toBe(true);
    expect(structured(result).error?.category).toBe('write_blocked');
  });

  test('shell_construct_blocked on subshell', async () => {
    const project = await bootstrap();
    const result = (await buildExecResult(
      { command: 'cat `ls`' },
      { projectDir: project, serverUrl: undefined },
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
      { projectDir: project, serverUrl: undefined },
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
      { projectDir: project, serverUrl: undefined },
    )) as ExecResult;
    const execMeta = structured(execResult).enrichedPaths[0];

    // read_document("articles/parity.md") — same data source (enrichPath)
    const readOutput = await buildReadResult(
      { path: 'articles/parity.md' },
      {
        projectDir: project,
        serverUrl: undefined,
        // biome-ignore lint/suspicious/noExplicitAny: test-only config stub
        config: { mcp: { tools: { read_document: { historyDepth: 5 } } } } as any,
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
