/**
 * QA-009 / QA-020: Disk bridge integration test.
 *
 * Tests the LIVE end-to-end path: external file edit on disk →
 * @parcel/watcher FSEvent → startWatcher callback fires with
 * correct (docName, content) arguments.
 *
 * This test uses a real temp directory and real @parcel/watcher —
 * NOT mocks. It verifies:
 *   1. External write to a new .md file fires the callback (QA-020: add new component)
 *   2. External modification of an existing .md file fires the callback (QA-009: edit props)
 *   3. Self-writes (tracked via registerWrite) do NOT fire the callback
 *   4. pathToDocName correctly maps the file path to a Hocuspocus document name
 *   5. The received content matches the written content byte-for-byte
 *
 * These prove the watcher → callback path works. The rest of the chain
 * (callback → syncTextToFragment → Yjs broadcast → client render) is
 * covered by agent-sessions tests and the @hocuspocus transport layer.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

// @parcel/watcher relies on OS-level FSEvents (macOS) or inotify (Linux).
// GitHub Actions runners use overlayfs/tmpfs where filesystem event delivery
// is unreliable — the watcher starts but never fires callbacks. Skip on CI.
const isCI = !!process.env.CI;
const describeWatcher = isCI ? describe.skip : describe;
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AsyncSubscription } from './file-watcher.ts';
import { contentHash, registerWrite, startWatcher, writeTracker } from './file-watcher.ts';

// macOS symlinks /var → /private/var. @parcel/watcher reports the real
// (resolved) path in FSEvents. pathToDocName uses relative(), so contentDir
// must match the real path or the relative calculation breaks.
// We mkdir first, then realpathSync to get the canonical absolute path.
const RAW_DIR = join(tmpdir(), `ok-watcher-test-${Date.now()}`);
mkdirSync(RAW_DIR, { recursive: true });
const TEST_DIR = realpathSync(RAW_DIR);
let subscription: AsyncSubscription | null = null;

/** Collected callback invocations. */
const received: Array<{ docName: string; content: string }> = [];

/** Promise that resolves when the next callback fires. */
function waitForCallback(timeoutMs = 10000): Promise<{ docName: string; content: string }> {
  const startLen = received.length;
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (received.length > startLen) {
        clearInterval(interval);
        resolve(received[received.length - 1]);
      }
    }, 50);
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`Timed out waiting for file-watcher callback after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

beforeAll(async () => {
  // TEST_DIR is already created (module-level mkdirSync + realpathSync)
  writeFileSync(join(TEST_DIR, 'existing-doc.md'), '# Initial\n\nOriginal content.\n');

  // Start the watcher with a callback that records invocations
  subscription = await startWatcher(TEST_DIR, async (docName, content) => {
    received.push({ docName, content });
  });

  // Give @parcel/watcher time to initialize the FSEvent stream
  await new Promise((r) => setTimeout(r, 500));
});

afterAll(async () => {
  if (subscription) await subscription.unsubscribe();
  writeTracker.clear();
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
});

describeWatcher('disk bridge integration (QA-009 / QA-020)', () => {
  test('QA-020: external creation of a new .md file fires the callback', async () => {
    const content = '<Callout type="warning">\nNew component added externally.\n</Callout>\n';
    const filePath = join(TEST_DIR, 'new-component.md');

    // Write the file externally (simulates vim/VS Code save)
    writeFileSync(filePath, content);

    // Wait for the callback
    const result = await waitForCallback();
    expect(result.docName).toBe('new-component');
    expect(result.content).toBe(content);
  });

  test('QA-009: external modification of an existing .md file fires the callback', async () => {
    const newContent =
      '# Modified\n\n<Callout type="error">\nProp changed externally.\n</Callout>\n';
    const filePath = join(TEST_DIR, 'existing-doc.md');

    writeFileSync(filePath, newContent);

    const result = await waitForCallback();
    expect(result.docName).toBe('existing-doc');
    expect(result.content).toBe(newContent);
  });

  test('self-writes (tracked via registerWrite) are skipped — no callback', async () => {
    const content = '# Self write\n\nPersistence layer wrote this.\n';
    const filePath = join(TEST_DIR, 'self-write-doc.md');
    const hash = contentHash(content);

    // Pre-register with the REAL path (matching what @parcel/watcher reports)
    // On macOS, the watcher reports /private/var/... even if we wrote to /var/...
    // but since TEST_DIR is already realpathSync'd, filePath is already correct.
    registerWrite(filePath, hash);

    // Write the file — should match the registered hash → skip
    writeFileSync(filePath, content);

    // Wait briefly to confirm NO callback fires
    const prevLen = received.length;
    await new Promise((r) => setTimeout(r, 1500));
    expect(received.length).toBe(prevLen);
  });

  test('external write AFTER self-write of different content fires the callback', async () => {
    const selfContent = '# Self\n';
    const externalContent = '# External edit\n';
    const filePath = join(TEST_DIR, 'mixed-writes.md');

    // Register and write the "self" content
    registerWrite(filePath, contentHash(selfContent));
    writeFileSync(filePath, selfContent);

    // Wait for the self-write to be consumed
    await new Promise((r) => setTimeout(r, 800));

    // Now write different content (external edit)
    writeFileSync(filePath, externalContent);

    const result = await waitForCallback();
    expect(result.docName).toBe('mixed-writes');
    expect(result.content).toBe(externalContent);
  });

  test('non-.md files are ignored by the watcher', async () => {
    const prevLen = received.length;
    writeFileSync(join(TEST_DIR, 'data.json'), '{"key": "value"}');

    // Wait briefly to confirm NO callback fires
    await new Promise((r) => setTimeout(r, 1000));
    expect(received.length).toBe(prevLen);
  });
});
