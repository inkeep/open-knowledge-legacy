
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { tracedMkdirSync } from './fs-traced.ts';
import { getLogger } from './logger.ts';

export type ConfigFileWatcherUnsubscribe = () => Promise<void>;

export async function startConfigFileWatcher(
  absPath: string,
  onChange: (content: string) => void,
): Promise<ConfigFileWatcherUnsubscribe> {
  const log = getLogger('config-file-watcher');
  const { watch } = await import('chokidar');

  const watchDir = dirname(absPath);
  try {
    tracedMkdirSync(watchDir, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') {
      log.warn({ err, watchDir }, 'failed to create watch directory; watcher may be inert');
    }
  }

  const watcher = watch(watchDir, {
    ignoreInitial: true,
    depth: 0, // only direct children — sibling subdirectories irrelevant
    usePolling: true,
    interval: 200,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    ignored: (p) => p !== watchDir && p !== absPath,
  });

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
