import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveContentConfig } from './hocuspocus-plugin.ts';

const createdDirs: string[] = [];

function mkTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ok-hocuspocus-plugin-'));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveContentConfig', () => {
  test('no config.yml: defaults to projectRoot', () => {
    const projectRoot = mkTmp();
    const config = resolveContentConfig(projectRoot);
    expect(config.dir).toBe(projectRoot);
  });

  test('config.yml without content.dir: defaults to projectRoot', () => {
    const projectRoot = mkTmp();
    mkdirSync(join(projectRoot, '.ok'), { recursive: true });
    writeFileSync(join(projectRoot, '.ok/config.yml'), 'server:\n  host: 0.0.0.0\n', 'utf-8');
    const config = resolveContentConfig(projectRoot);
    expect(config.dir).toBe(projectRoot);
  });

  test('config.yml with content.dir: resolves relative to projectRoot', () => {
    const projectRoot = mkTmp();
    mkdirSync(join(projectRoot, '.ok'), { recursive: true });
    writeFileSync(join(projectRoot, '.ok/config.yml'), "content:\n  dir: 'content'\n", 'utf-8');
    const config = resolveContentConfig(projectRoot);
    expect(config.dir).toBe(join(projectRoot, 'content'));
  });
});

describe('hocuspocusPlugin.configureServer middleware ordering', () => {
  let origEnv: string | undefined;
  beforeEach(() => {
    origEnv = process.env.OK_TEST_CONTENT_DIR;
  });
  afterEach(() => {
    if (origEnv !== undefined) process.env.OK_TEST_CONTENT_DIR = origEnv;
    else delete process.env.OK_TEST_CONTENT_DIR;
    mock.restore();
  });

  test('registers asset + api middlewares synchronously, no post-hook returned', async () => {
    const testContentDir = mkTmp();
    process.env.OK_TEST_CONTENT_DIR = testContentDir;

    let innerAssetCalls = 0;
    const innerAssetFn = (..._args: unknown[]) => {
      innerAssetCalls += 1;
    };
    const createAssetServeMiddlewareSpy = mock(() => innerAssetFn);

    mock.module('@inkeep/open-knowledge-server', () => ({
      createAssetServeMiddleware: createAssetServeMiddlewareSpy,
      createServer: () => ({
        lockDir: testContentDir,
        contentFilter: { isPathIgnored: () => false },
        hocuspocus: {
          hooks: async () => {},
          getConnectionsCount: () => 0,
          handleConnection: () => ({
            handleMessage: () => {},
            handleClose: () => {},
          }),
        },
        sessionManager: { closeAllForAgent: async () => {} },
        agentFocusBroadcaster: { clearFocus: () => {} },
        agentPresenceBroadcaster: { clearPresence: () => {}, bumpPresenceTs: () => {} },
        destroy: async () => {},
      }),
      handleCollabSocketError: () => false,
      parseKeepaliveConnectionId: () => null,
      releaseServerLock: () => {},
      toBroadcasterKey: (id: string) => `agent-${id}`,
      updateServerLockPort: () => {},
    }));

    const { hocuspocusPlugin } = await import('./hocuspocus-plugin.ts?ordering-test');

    const httpServer = new EventEmitter() as EventEmitter & {
      prependListener: (event: string, fn: (...args: unknown[]) => void) => unknown;
      address: () => null;
    };
    httpServer.prependListener = httpServer.on.bind(httpServer);
    httpServer.address = () => null;

    const registered: Array<(req: unknown, res: unknown, next: () => void) => void> = [];
    const viteServerStub = {
      httpServer,
      middlewares: {
        use: (fn: (req: unknown, res: unknown, next: () => void) => void) => {
          registered.push(fn);
          return viteServerStub.middlewares;
        },
      },
    };

    const plugin = hocuspocusPlugin();
    expect(typeof plugin.configureServer).toBe('function');

    // biome-ignore lint/suspicious/noExplicitAny: minimal Vite ViteDevServer stub for the structural assertion
    const result = await (plugin.configureServer as any).call(plugin, viteServerStub);

    expect(result).toBeUndefined();

    expect(createAssetServeMiddlewareSpy).toHaveBeenCalledTimes(1);

    expect(registered).toHaveLength(2);

    const assetWrapper = registered[0];
    if (!assetWrapper) throw new Error('asset wrapper not registered');

    for (const bypassUrl of [
      '/src/editor/slash-command/preview-assets/image-preview.png?import',
      '/favicon.svg',
      '/@vite/client',
      '/@fs/path/to/file.ts',
      '/@id/some-virtual',
      '/@react-refresh',
      '/node_modules/some-dep/index.js',
      '/index.html?html-proxy&index=0.css',
    ]) {
      let nextCalled = false;
      assetWrapper({ url: bypassUrl }, {}, () => {
        nextCalled = true;
      });
      expect(nextCalled, `bypass should fire for ${bypassUrl}`).toBe(true);
    }

    expect(innerAssetCalls).toBe(0);

    for (const nonBypassUrl of [
      '/photo.png',
      '/photo.png?reimport=1',
      '/photo.png?importMode=auto',
      '/photo.png?html-proxy-ish=1',
    ]) {
      assetWrapper({ url: nonBypassUrl }, {}, () => {});
    }
    expect(innerAssetCalls).toBe(4);
  });
});
