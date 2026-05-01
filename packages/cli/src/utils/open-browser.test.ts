import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as cp from 'node:child_process';
import { openBrowser } from './open-browser.ts';

describe('openBrowser', () => {
  let execFileSpy: ReturnType<typeof spyOn>;
  const originalPlatform = process.platform;

  beforeEach(() => {
    execFileSpy = spyOn(cp, 'execFile').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    execFileSpy.mockRestore();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('uses "open" on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    openBrowser('http://localhost:3000');

    expect(execFileSpy).toHaveBeenCalledTimes(1);
    const [cmd, args] = execFileSpy.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('open');
    expect(args).toEqual(['http://localhost:3000']);
  });

  it('uses "xdg-open" on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    openBrowser('http://localhost:3000');

    expect(execFileSpy).toHaveBeenCalledTimes(1);
    const [cmd, args] = execFileSpy.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('xdg-open');
    expect(args).toEqual(['http://localhost:3000']);
  });

  it('uses "cmd /c start" on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    openBrowser('http://localhost:3000');

    expect(execFileSpy).toHaveBeenCalledTimes(1);
    const [cmd, args] = execFileSpy.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('cmd');
    expect(args).toEqual(['/c', 'start', '', 'http://localhost:3000']);
  });

  it('prints fallback message when launcher fails', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const consoleSpy = spyOn(console, 'warn').mockImplementation(() => {});

    execFileSpy.mockImplementation(((
      _cmd: string,
      _args: string[],
      callback: (err: Error | null) => void,
    ) => {
      callback(new Error('ENOENT'));
    }) as never);

    openBrowser('http://localhost:3000');

    expect(consoleSpy).toHaveBeenCalledWith(
      'Could not auto-open browser (ENOENT); visit http://localhost:3000 manually',
    );
    consoleSpy.mockRestore();
  });
});
