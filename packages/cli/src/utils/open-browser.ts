/**
 * Cross-platform browser launcher used by `open-knowledge start --open`.
 *
 * Picks the platform-native launcher (`open` on macOS, `xdg-open` on Linux,
 * `cmd /c start` on Windows) and shells out via `execFile`. Failure is
 * non-fatal: the caller has already printed the URL, so we surface a hint
 * and let the user open it manually rather than crashing the server.
 */
import { execFile } from 'node:child_process';

export function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  execFile(cmd, args, (err) => {
    if (err) console.warn(`Could not auto-open browser (${err.message}); visit ${url} manually`);
  });
}
