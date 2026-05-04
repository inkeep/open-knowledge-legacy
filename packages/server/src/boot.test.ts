import { describe as _bunDescribe, afterEach, beforeEach, expect, mock, test } from 'bun:test';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { OK_DIR } from '@inkeep/open-knowledge-core';
import { context, metrics, trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { bootServer } from './boot.ts';
import { ConfigSchema } from './config/schema.ts';
import { parseKeepaliveConnectionId } from './mcp-mount.ts';
import { shutdownTelemetry } from './telemetry.ts';

function seedOkScaffold(contentDir: string): void {
  const okDir = resolve(contentDir, OK_DIR);
  mkdirSync(okDir, { recursive: true });
  writeFileSync(resolve(okDir, 'config.yml'), '', 'utf-8');
  writeFileSync(resolve(okDir, '.gitignore'), '', 'utf-8');
}

const execFileAsync = promisify(execFile);
const TEST_CONFIG = ConfigSchema.parse({});

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-boot-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('bootServer — ensureProjectGitFn wiring (US-001)', () => {
  test('ensureProjectGitFn throw propagates — bootServer rejects before listen', async () => {
    const contentDir = resolve(tmpDir, 'fails');
    writeFileSync(resolve(tmpDir, 'placeholder'), '');

    const expectedError = new Error('simulated git-missing failure');
    const ensureProjectGitFn = mock(() => Promise.reject(expectedError));
    const autoInitFn = mock(() => true);

    await expect(
      bootServer({
        config: TEST_CONFIG,
        contentDir,
        port: 0,
        quiet: true,
        gitEnabled: false,
        ensureProjectGitFn,
        autoInitFn,
      }),
    ).rejects.toThrow('simulated git-missing failure');

    expect(ensureProjectGitFn.mock.calls.length).toBe(1);
    expect(autoInitFn.mock.calls.length).toBe(0);
  });

  test('didGitInit is populated from hook return value', async () => {
    const contentDir = mkdtempSync(resolve(tmpDir, 'bootdir-'));
    await execFileAsync('git', ['init', '--initial-branch=main', contentDir]);
    seedOkScaffold(contentDir);

    const ensureProjectGitFn = mock(() => Promise.resolve({ didInit: true }));

    const booted = await bootServer({
      config: TEST_CONFIG,
      contentDir,
      port: 0,
      quiet: true,
      gitEnabled: false,
      ensureProjectGitFn,
      idleShutdownMs: null,
      attachUiSibling: false,
    });

    try {
      expect(ensureProjectGitFn.mock.calls.length).toBe(1);
      expect(booted.didGitInit).toBe(true);
      expect(existsSync(resolve(contentDir, '.git/HEAD'))).toBe(true);
    } finally {
      await booted.destroy();
    }
  });

  test('skipAutoInit:true skips BOTH ensureProjectGitFn and autoInitFn', async () => {
    const contentDir = mkdtempSync(resolve(tmpDir, 'skip-'));
    await execFileAsync('git', ['init', '--initial-branch=main', contentDir]);
    seedOkScaffold(contentDir);

    const ensureProjectGitFn = mock(() => Promise.resolve({ didInit: true }));
    const autoInitFn = mock(() => true);

    const booted = await bootServer({
      config: TEST_CONFIG,
      contentDir,
      port: 0,
      quiet: true,
      gitEnabled: false,
      ensureProjectGitFn,
      autoInitFn,
      skipAutoInit: true,
      idleShutdownMs: null,
      attachUiSibling: false,
    });

    try {
      expect(ensureProjectGitFn.mock.calls.length).toBe(0);
      expect(autoInitFn.mock.calls.length).toBe(0);
      expect(booted.didGitInit).toBe(false);
      expect(booted.didAutoInit).toBe(false);
    } finally {
      await booted.destroy();
    }
  });

  test('omitting ensureProjectGitFn leaves didGitInit false (backward compat)', async () => {
    const contentDir = mkdtempSync(resolve(tmpDir, 'noop-'));
    await execFileAsync('git', ['init', '--initial-branch=main', contentDir]);
    seedOkScaffold(contentDir);

    const booted = await bootServer({
      config: TEST_CONFIG,
      contentDir,
      port: 0,
      quiet: true,
      gitEnabled: false,
      idleShutdownMs: null,
      attachUiSibling: false,
    });

    try {
      expect(booted.didGitInit).toBe(false);
    } finally {
      await booted.destroy();
    }
  });
});

describe('bootServer — MissingOkConfigError pre-listen check', () => {
  test('rejects with kind=okdir when .ok/ directory is absent (State A)', async () => {
    const contentDir = mkdtempSync(resolve(tmpDir, 'state-a-'));
    await execFileAsync('git', ['init', '--initial-branch=main', contentDir]);

    let caught: unknown;
    try {
      await bootServer({
        config: TEST_CONFIG,
        contentDir,
        port: 0,
        quiet: true,
        gitEnabled: false,
        idleShutdownMs: null,
        attachUiSibling: false,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const e = caught as Error & { kind?: string; contentDir?: string };
    expect(e.name).toBe('MissingOkConfigError');
    expect(e.kind).toBe('okdir');
    expect(e.contentDir).toBe(contentDir);
    expect(e.message).toContain('Open Knowledge config not found at .ok/config.yml');
    expect(e.message).toContain('Run ok init');
    expect(existsSync(resolve(contentDir, '.git/ok'))).toBe(false);
  });

  test('rejects with kind=config when .ok/ exists but config.yml is missing (State B)', async () => {
    const contentDir = mkdtempSync(resolve(tmpDir, 'state-b-'));
    await execFileAsync('git', ['init', '--initial-branch=main', contentDir]);
    const okDir = resolve(contentDir, '.ok');
    writeFileSync(resolve(contentDir, 'placeholder'), '');
    await execFileAsync('mkdir', [okDir]);

    let caught: unknown;
    try {
      await bootServer({
        config: TEST_CONFIG,
        contentDir,
        port: 0,
        quiet: true,
        gitEnabled: false,
        idleShutdownMs: null,
        attachUiSibling: false,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const e = caught as Error & { kind?: string };
    expect(e.name).toBe('MissingOkConfigError');
    expect(e.kind).toBe('config');
    expect(e.message).toContain('Open Knowledge config not found at .ok/config.yml');
    expect(existsSync(resolve(contentDir, '.git/ok'))).toBe(false);
  });

  test('proceeds and emits a one-time stderr warning when only .ok/.gitignore is missing (State C)', async () => {
    const contentDir = mkdtempSync(resolve(tmpDir, 'state-c-'));
    await execFileAsync('git', ['init', '--initial-branch=main', contentDir]);
    const okDir = resolve(contentDir, '.ok');
    await execFileAsync('mkdir', [okDir]);
    writeFileSync(resolve(okDir, 'config.yml'), '', 'utf-8');

    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    let booted: Awaited<ReturnType<typeof bootServer>> | null = null;
    try {
      booted = await bootServer({
        config: TEST_CONFIG,
        contentDir,
        port: 0,
        quiet: true,
        gitEnabled: false,
        idleShutdownMs: null,
        attachUiSibling: false,
      });
      const bootWarnings = warnings.filter((w) => w.startsWith('[boot]'));
      expect(bootWarnings.length).toBe(1);
      expect(bootWarnings[0]).toContain('.ok/.gitignore');
      expect(bootWarnings[0]).toContain('ok init');
    } finally {
      console.warn = originalWarn;
      if (booted) await booted.destroy();
    }
  });
});

describe('bootServer — ok.boot OTel span attributes', () => {
  let exporter: InMemorySpanExporter | null = null;
  let provider: BasicTracerProvider | null = null;

  beforeEach(() => {
    trace.disable();
    metrics.disable();
    context.disable();
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    await shutdownTelemetry();
    await provider?.shutdown();
    trace.disable();
    metrics.disable();
    context.disable();
    exporter = null;
    provider = null;
  });

  test('main worktree: ok.boot span has worktree.kind=main', async () => {
    const contentDir = mkdtempSync(resolve(tmpDir, 'span-main-'));
    await execFileAsync('git', ['init', '--initial-branch=main', contentDir]);
    seedOkScaffold(contentDir);

    const booted = await bootServer({
      config: TEST_CONFIG,
      contentDir,
      port: 0,
      quiet: true,
      gitEnabled: false,
      idleShutdownMs: null,
      attachUiSibling: false,
    });
    try {
      const spans = exporter?.getFinishedSpans() ?? [];
      const bootSpan = spans.find((s) => s.name === 'ok.boot');
      expect(bootSpan).toBeDefined();
      expect(bootSpan?.attributes['ok.worktree.kind']).toBe('main');
      expect(typeof bootSpan?.attributes['ok.worktree.gitdir']).toBe('string');
      const gitdirAttr = bootSpan?.attributes['ok.worktree.gitdir'] as string;
      expect(gitdirAttr.split('/').filter(Boolean).length).toBeLessThanOrEqual(3);
    } finally {
      await booted.destroy();
    }
  });

  test('linked worktree: ok.boot span has worktree.kind=linked', async () => {
    const repoRoot = mkdtempSync(resolve(tmpDir, 'span-linked-repo-'));
    await execFileAsync('git', ['init', '--initial-branch=main', repoRoot]);
    await execFileAsync('git', ['-C', repoRoot, 'config', 'user.email', 'test@example.com']);
    await execFileAsync('git', ['-C', repoRoot, 'config', 'user.name', 'Test']);
    writeFileSync(resolve(repoRoot, 'README.md'), '# test\n');
    await execFileAsync('git', ['-C', repoRoot, 'add', '.']);
    await execFileAsync('git', ['-C', repoRoot, 'commit', '-m', 'init']);

    const wtPath = mkdtempSync(resolve(tmpDir, 'span-linked-wt-'));
    await rm(wtPath, { recursive: true, force: true });
    await execFileAsync('git', [
      '-C',
      repoRoot,
      'worktree',
      'add',
      '-b',
      `wt-span-${Date.now()}`,
      wtPath,
    ]);
    seedOkScaffold(wtPath);

    const booted = await bootServer({
      config: TEST_CONFIG,
      contentDir: wtPath,
      port: 0,
      quiet: true,
      gitEnabled: false,
      idleShutdownMs: null,
      attachUiSibling: false,
    });
    try {
      const spans = exporter?.getFinishedSpans() ?? [];
      const bootSpan = spans.find((s) => s.name === 'ok.boot');
      expect(bootSpan).toBeDefined();
      expect(bootSpan?.attributes['ok.worktree.kind']).toBe('linked');
      const gitdirAttr = bootSpan?.attributes['ok.worktree.gitdir'] as string;
      expect(typeof gitdirAttr).toBe('string');
      expect(gitdirAttr.split('/').filter(Boolean).length).toBeLessThanOrEqual(3);
    } finally {
      await booted.destroy();
    }
  });

  test('boot failure (MissingOkConfigError): span still records the worktree kind', async () => {
    const contentDir = mkdtempSync(resolve(tmpDir, 'span-fail-'));
    await execFileAsync('git', ['init', '--initial-branch=main', contentDir]);

    let caught: unknown;
    try {
      await bootServer({
        config: TEST_CONFIG,
        contentDir,
        port: 0,
        quiet: true,
        gitEnabled: false,
        idleShutdownMs: null,
        attachUiSibling: false,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const spans = exporter?.getFinishedSpans() ?? [];
    const bootSpan = spans.find((s) => s.name === 'ok.boot');
    expect(bootSpan).toBeDefined();
    expect(bootSpan?.attributes['ok.worktree.kind']).toBe('main');
    expect(bootSpan?.status.code).toBe(2); // SpanStatusCode.ERROR
  });

  test('cross-invocation: main first, linked second — kinds flip correctly with no state leakage', async () => {
    const mainDir = mkdtempSync(resolve(tmpDir, 'flip-main-'));
    await execFileAsync('git', ['init', '--initial-branch=main', mainDir]);
    seedOkScaffold(mainDir);
    const bootedMain = await bootServer({
      config: TEST_CONFIG,
      contentDir: mainDir,
      port: 0,
      quiet: true,
      gitEnabled: false,
      idleShutdownMs: null,
      attachUiSibling: false,
    });
    await bootedMain.destroy();

    const repoRoot = mkdtempSync(resolve(tmpDir, 'flip-linked-repo-'));
    await execFileAsync('git', ['init', '--initial-branch=main', repoRoot]);
    await execFileAsync('git', ['-C', repoRoot, 'config', 'user.email', 'test@example.com']);
    await execFileAsync('git', ['-C', repoRoot, 'config', 'user.name', 'Test']);
    writeFileSync(resolve(repoRoot, 'README.md'), '# test\n');
    await execFileAsync('git', ['-C', repoRoot, 'add', '.']);
    await execFileAsync('git', ['-C', repoRoot, 'commit', '-m', 'init']);
    const wtPath = mkdtempSync(resolve(tmpDir, 'flip-linked-wt-'));
    await rm(wtPath, { recursive: true, force: true });
    await execFileAsync('git', [
      '-C',
      repoRoot,
      'worktree',
      'add',
      '-b',
      `wt-flip-${Date.now()}`,
      wtPath,
    ]);
    seedOkScaffold(wtPath);
    const bootedLinked = await bootServer({
      config: TEST_CONFIG,
      contentDir: wtPath,
      port: 0,
      quiet: true,
      gitEnabled: false,
      idleShutdownMs: null,
      attachUiSibling: false,
    });
    await bootedLinked.destroy();

    const spans = exporter?.getFinishedSpans() ?? [];
    const bootSpans = spans.filter((s) => s.name === 'ok.boot');
    expect(bootSpans.length).toBe(2);
    expect(bootSpans[0]?.attributes['ok.worktree.kind']).toBe('main');
    expect(bootSpans[1]?.attributes['ok.worktree.kind']).toBe('linked');
    expect(bootSpans[0]?.attributes['ok.worktree.gitdir']).not.toBe(
      bootSpans[1]?.attributes['ok.worktree.gitdir'],
    );
  });
});

describe('parseKeepaliveConnectionId', () => {
  test('returns null for undefined URL (defensive)', () => {
    expect(parseKeepaliveConnectionId(undefined)).toBeNull();
  });

  test('returns null for empty URL', () => {
    expect(parseKeepaliveConnectionId('')).toBeNull();
  });

  test('returns null when connectionId query param is absent', () => {
    expect(parseKeepaliveConnectionId('/collab/keepalive?pid=1234')).toBeNull();
  });

  test('returns null when connectionId is present but empty', () => {
    expect(parseKeepaliveConnectionId('/collab/keepalive?pid=1234&connectionId=')).toBeNull();
  });

  test('returns the connectionId when present (happy path)', () => {
    expect(parseKeepaliveConnectionId('/collab/keepalive?pid=1234&connectionId=uuid-A')).toBe(
      'uuid-A',
    );
  });

  test('rejects percent-encoded connectionId values that decode to invalid chars', () => {
    expect(
      parseKeepaliveConnectionId('/collab/keepalive?connectionId=user%2Fagent%3D1%262'),
    ).toBeNull();
  });

  test('rejects connectionId containing CR/LF (log-injection defense)', () => {
    expect(parseKeepaliveConnectionId('/collab/keepalive?connectionId=abc%0D%0Aadmin')).toBeNull();
  });

  test('tolerates query order', () => {
    expect(parseKeepaliveConnectionId('/collab/keepalive?connectionId=foo&pid=1')).toBe('foo');
  });

  test('tolerates a UUID-shaped connectionId', () => {
    expect(
      parseKeepaliveConnectionId(
        '/collab/keepalive?connectionId=abcdef12-3456-7890-abcd-ef1234567890',
      ),
    ).toBe('abcdef12-3456-7890-abcd-ef1234567890');
  });

  test('does not throw on a blatantly malformed URL', () => {
    expect(() => parseKeepaliveConnectionId('?connectionId=foo')).not.toThrow();
    expect(parseKeepaliveConnectionId('?connectionId=foo')).toBe('foo');
  });

  test('never throws on garbage input', () => {
    expect(() => parseKeepaliveConnectionId('not a url at all')).not.toThrow();
    expect(parseKeepaliveConnectionId('/collab/keepalive')).toBeNull();
  });
});
