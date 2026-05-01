/**
 * Chokidar single-file watcher for `.ok/config.yml` paths.
 *
 * Watches a single absolute path. On `add` or `change`, reads the file and
 * fires `onChange(content)`. The caller wires `onChange` to
 * `applyExternalConfigChange` in `config-persistence.ts`, which validates +
 * mutates Y.Text under `CONFIG_FILE_WATCHER_ORIGIN`.
 *
 * `awaitWriteFinish: { stabilityThreshold: 100 }` debounces atomic-rename
 * writes (write tmp → rename) into a single change event — chokidar would
 * otherwise emit unlink + add for the rename, which we'd have to coalesce
 * ourselves.
 *
 * Self-write feedback loop is broken by the persistence layer's LKG cache:
 * `applyExternalConfigChange` short-circuits when the read content matches
 * the LKG entry (i.e., we just wrote it ourselves). The chokidar event
 * still fires, but the handler returns early before mutating Y.Text.
 *
 * @see packages/server/src/config-persistence.ts `applyExternalConfigChange`
 */

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { tracedMkdirSync } from './fs-traced.ts';
import { getLogger } from './logger.ts';

/** Cleanup function returned by `startConfigFileWatcher`. Idempotent. */
export type ConfigFileWatcherUnsubscribe = () => Promise<void>;

/**
 * Start watching a single absolute path. Resolves once chokidar's initial
 * scan is complete (`ready` event), so callers can immediately trigger
 * test writes without racing the first event.
 *
 * Behavior:
 * - Watches the absolute path; chokidar handles non-existent paths by
 *   waiting for them. First `add` fires when the file appears.
 * - On `add` / `change`: reads file synchronously, fires `onChange(content)`.
 *   Read errors (file deleted between event and read) are logged + dropped.
 * - On `unlink`: logged at debug; `onChange` NOT fired (Y.Text retains
 *   current state). The next `add` (if file reappears) is treated as a
 *   normal change.
 * - On chokidar `error`: logged warn; watcher remains running.
 *
 * Returns an idempotent cleanup function. `await cleanup()` waits for
 * chokidar's underlying handle to release before resolving.
 */
export async function startConfigFileWatcher(
  absPath: string,
  onChange: (content: string) => void,
): Promise<ConfigFileWatcherUnsubscribe> {
  const log = getLogger('config-file-watcher');
  const { watch } = await import('chokidar');

  // Watch the parent directory rather than the file itself. Chokidar's
  // single-file watch does not reliably emit `add` when the file is
  // created after the watcher starts (a known v5 limitation across
  // platforms). Watching the parent + filtering to the target filename
  // is the robust pattern: chokidar's directory watch sees `add`,
  // `change`, and `unlink` for any child, and we drop everything that
  // isn't the file we care about.
  const watchDir = dirname(absPath);
  // mkdir -p the parent so chokidar has something to watch even when
  // the user-global `~/.ok/` directory hasn't been created
  // yet. Cheap, idempotent, mode 0o755 (default).
  try {
    tracedMkdirSync(watchDir, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') {
      log.warn({ err, watchDir }, 'failed to create watch directory; watcher may be inert');
    }
  }

  // usePolling is the only mode that works uniformly across (a) macOS
  // dev with FSEvents, (b) Linux dev with inotify, (c) sandboxed CI
  // where neither is available. The CPU cost is negligible for 2 config
  // files at 200ms — we're not watching content directories with
  // thousands of files where event-driven matters. Reliability >
  // efficiency for this code path.
  const watcher = watch(watchDir, {
    ignoreInitial: true,
    depth: 0, // only direct children — sibling subdirectories irrelevant
    usePolling: true,
    interval: 200,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    // chokidar v5 supports a function predicate for `ignored`; returning
    // true means "skip this path." Always allow the watch root + the
    // target file; ignore everything else.
    ignored: (p) => p !== watchDir && p !== absPath,
  });

  // Wait for the initial scan to complete so callers (and tests) can
  // immediately trigger writes without losing the first event.
  await new Promise<void>((resolve) => {
    watcher.once('ready', () => resolve());
  });

  const handler = (path: string): void => {
    if (path !== absPath) return;
    let content: string;
    try {
      content = readFileSync(path, 'utf-8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        log.debug({ path }, 'config file disappeared between event and read; dropping');
        return;
      }
      log.warn({ err, path }, 'config file read failed; dropping event');
      return;
    }
    try {
      onChange(content);
    } catch (err) {
      log.warn({ err, path }, 'config file change handler threw');
    }
  };

  watcher.on('add', handler);
  watcher.on('change', handler);
  watcher.on('unlink', (path) => {
    if (path !== absPath) return;
    log.debug({ path }, 'config file unlinked; Y.Text retained at current state');
  });
  watcher.on('error', (err) => {
    log.warn(
      { err, watchDir, absPath },
      `[config-file-watcher] chokidar error while watching ${absPath}`,
    );
  });

  let closed = false;
  return async () => {
    if (closed) return;
    closed = true;
    await watcher.close();
  };
}
