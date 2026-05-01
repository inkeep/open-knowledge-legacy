
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test as base } from '@playwright/test';

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

async function waitForServerReady(baseURL: string, timeoutMs = 30_000): Promise<void> {
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
        await waitForServerReady(baseURL);
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
