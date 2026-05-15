import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { resolveSelfSpawn } from './self-spawn.ts';

describe('resolveSelfSpawn', () => {
  const originalArgv1 = process.argv[1];
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv[1] = originalArgv1;
    warnSpy.mockRestore();
  });

  it('re-execs the current binary when argv[1] is populated', () => {
    const result = resolveSelfSpawn();
    expect(result.command).toBe(process.execPath);
    expect(result.prefixArgs).toEqual([process.argv[1]]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to npx -y @inkeep/open-knowledge@latest when argv[1] is empty', () => {
    process.argv[1] = '';
    const result = resolveSelfSpawn();
    expect(result.command).toBe('npx');
    expect(result.prefixArgs).toEqual(['-y', '@inkeep/open-knowledge@latest']);
    expect(warnSpy).toHaveBeenCalled();
  });
});
