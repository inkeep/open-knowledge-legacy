import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-core';
import { test as base } from '@playwright/test';
import * as Y from 'yjs';

const HELPERS_DIR = dirname(fileURLToPath(import.meta.url));
const APP_PACKAGE_ROOT = resolve(HELPERS_DIR, '..', '..', '..');

export interface WorkerServer {
  port: number;
  baseURL: string;
  contentDir: string;
}

export interface AgentIdentity {
  agentId: string;
  agentName: string;
  clientName?: string;
  colorSeed?: string;
}

export interface ApiHelpers {
  createPage(path: string): Promise<void>;
  replaceDoc(docName: string, markdown: string): Promise<void>;
  writeAsAgent(docName: string, markdown: string, identity: AgentIdentity): Promise<void>;
  testReset(docName?: string): Promise<void>;
  seedDocs(docs: Array<{ name: string; markdown: string }>): Promise<void>;
}

type WorkerFixtures = {
  workerServer: WorkerServer;
};

type TestFixtures = {
  api: ApiHelpers;
};

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

async function waitForHttpReady(baseURL: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseURL}/`, { signal: AbortSignal.timeout(1000) });
      if (res.status === 200 || res.status === 404) return;
      lastErr = new Error(`unexpected status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await wait(250);
  }
  throw new Error(
    `Worker server at ${baseURL} did not become ready within ${timeoutMs}ms. Last error: ${String(lastErr)}`,
  );
}

async function checkApiConfig(baseURL: string, timeoutMs = 2_000): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${baseURL}/api/config`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new Error(`/api/config did not respond within ${timeoutMs}ms: ${String(err)}`);
  }
  if (res.status !== 200) {
    throw new Error(`/api/config returned status ${res.status}, expected 200`);
  }
  let body: {
    collabUrl?: unknown;
    previewUrl?: unknown;
    port?: unknown;
  } | null;
  try {
    body = (await res.json()) as typeof body;
  } catch (parseErr) {
    throw new Error(`/api/config returned 200 but body is not valid JSON: ${String(parseErr)}`);
  }
  if (
    !body ||
    typeof body.port !== 'number' ||
    (typeof body.collabUrl !== 'string' && body.collabUrl !== null)
  ) {
    throw new Error(`/api/config returned unexpected body shape: ${JSON.stringify(body)}`);
  }
}

async function checkCollabSync(port: number, timeoutMs = 10_000): Promise<void> {
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: `ws://localhost:${port}/collab`,
    name: SYSTEM_DOC_NAME,
    document: doc,
    connect: false,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`/collab sync round-trip did not complete within ${timeoutMs}ms`));
      }, timeoutMs);
      provider.on('synced', () => {
        clearTimeout(timer);
        resolve();
      });
      provider.connect();
    });
  } finally {
    try {
      provider.destroy();
    } catch {}
    try {
      doc.destroy();
    } catch {}
  }
}

async function waitForServerReady(baseURL: string, port: number): Promise<void> {
  await waitForHttpReady(baseURL);
  await checkApiConfig(baseURL);
  await checkCollabSync(port);
}

function seedRequiredFixtureFiles(contentDir: string): void {
  writeFileSync(join(contentDir, 'test-doc.md'), '', 'utf-8');
  mkdirSync(join(contentDir, 'sidebar-folder'), { recursive: true });
  writeFileSync(join(contentDir, 'sidebar-folder', 'nested-doc.md'), '', 'utf-8');
}

async function killGracefully(proc: ChildProcess, timeoutMs = 5000): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => {
    proc.once('exit', () => resolve());
  });
  proc.kill('SIGTERM');
  const timer = wait(timeoutMs);
  await Promise.race([exited, timer]);
  if (proc.exitCode === null && proc.signalCode === null) {
    proc.kill('SIGKILL');
    await exited;
  }
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  workerServer: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires an object-destructuring pattern for the fixtures arg; this fixture has no dependencies so the destructure is empty by design.
    async ({}, use, workerInfo) => {
      const port = await getFreePort();
      const contentDir = mkdtempSync(join(tmpdir(), `ok-w${workerInfo.workerIndex}-`));
      seedRequiredFixtureFiles(contentDir);
      const baseURL = `http://localhost:${port}`;

      const proc = spawn('bun', ['run', '--silent', 'dev'], {
        cwd: APP_PACKAGE_ROOT,
        env: {
          ...process.env,
          VITE_PORT: String(port),
          OK_TEST_CONTENT_DIR: contentDir,
          OK_TEST_GIT_ENABLED: '1',
          NO_COLOR: process.env.NO_COLOR ?? '1',
        },
        stdio: ['ignore', 'ignore', 'inherit'],
      });

      proc.on('error', (err) => {
        console.error(`[fixture w${workerInfo.workerIndex}] spawn error:`, err);
      });

      try {
        await waitForServerReady(baseURL, port);
      } catch (err) {
        await killGracefully(proc);
        rmSync(contentDir, { recursive: true, force: true });
        throw err;
      }

      await use({ port, baseURL, contentDir });

      await killGracefully(proc);
      rmSync(contentDir, { recursive: true, force: true });
    },
    { scope: 'worker', timeout: 60_000 },
  ],

  baseURL: async ({ workerServer }, use) => {
    await use(workerServer.baseURL);
  },

  api: async ({ workerServer }, use) => {
    const { baseURL } = workerServer;
    const helpers: ApiHelpers = {
      async createPage(path: string): Promise<void> {
        const res = await fetch(`${baseURL}/api/create-page`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });
        if (res.status === 409) return;
        if (!res.ok) {
          throw new Error(`create-page failed for ${path}: ${res.status}`);
        }
      },
      async replaceDoc(docName: string, markdown: string): Promise<void> {
        const res = await fetch(`${baseURL}/api/agent-write-md`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docName, markdown, position: 'replace' }),
        });
        if (!res.ok) {
          throw new Error(`agent-write-md failed for ${docName}: ${res.status}`);
        }
      },
      async writeAsAgent(docName: string, markdown: string, identity): Promise<void> {
        const res = await fetch(`${baseURL}/api/agent-write-md`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            docName,
            markdown,
            position: 'replace',
            agentId: identity.agentId,
            agentName: identity.agentName,
            clientName: identity.clientName,
            colorSeed: identity.colorSeed,
          }),
        });
        if (!res.ok) {
          throw new Error(
            `writeAsAgent failed for ${docName} / ${identity.agentId}: ${res.status}`,
          );
        }
      },
      async testReset(docName?: string): Promise<void> {
        const url = docName
          ? `${baseURL}/api/test-reset?docName=${encodeURIComponent(docName)}`
          : `${baseURL}/api/test-reset`;
        const res = await fetch(url, { method: 'POST' });
        if (!res.ok) {
          throw new Error(`test-reset failed${docName ? ` for ${docName}` : ''}: ${res.status}`);
        }
      },
      async seedDocs(docs: Array<{ name: string; markdown: string }>): Promise<void> {
        await helpers.testReset();
        for (const d of docs) await helpers.createPage(`${d.name}.md`);
        for (const d of docs) await helpers.replaceDoc(d.name, d.markdown);
      },
    };
    await use(helpers);
  },
});

export { expect } from '@playwright/test';
