import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { OK_DIR } from '../constants.ts';
import { ensureOkExcludedFromGit } from './clone.ts';

describe('ensureOkExcludedFromGit', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `clone-exclude-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, '.git', 'info'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns "no-exclude" when .git/info/exclude does not exist', () => {
    rmSync(join(testDir, '.git'), { recursive: true, force: true });
    expect(ensureOkExcludedFromGit(testDir)).toBe('no-exclude');
  });

  it('appends OK_DIR/ to a fresh exclude file with default git template', () => {
    const excludePath = join(testDir, '.git', 'info', 'exclude');
    const defaultTemplate = `# git ls-files --others --exclude-from=.git/info/exclude
# Lines that start with '#' are comments.
# For a project mostly in C, the following would be a good set of
# exclude patterns (uncomment them if you want to use them):
# *.[oa]
# *~
`;
    writeFileSync(excludePath, defaultTemplate, 'utf-8');

    expect(ensureOkExcludedFromGit(testDir)).toBe('appended');
    const after = readFileSync(excludePath, 'utf-8');
    expect(after).toContain(`${OK_DIR}/`);
    expect(after.startsWith(defaultTemplate)).toBe(true);
  });

  it('appends OK_DIR/ to an empty exclude file', () => {
    const excludePath = join(testDir, '.git', 'info', 'exclude');
    writeFileSync(excludePath, '', 'utf-8');

    expect(ensureOkExcludedFromGit(testDir)).toBe('appended');
    expect(readFileSync(excludePath, 'utf-8')).toBe(`${OK_DIR}/\n`);
  });

  it('inserts a newline before appending when existing file has no trailing newline', () => {
    const excludePath = join(testDir, '.git', 'info', 'exclude');
    writeFileSync(excludePath, '*.tmp', 'utf-8');

    expect(ensureOkExcludedFromGit(testDir)).toBe('appended');
    expect(readFileSync(excludePath, 'utf-8')).toBe(`*.tmp\n${OK_DIR}/\n`);
  });

  it('is idempotent — re-running returns "already-present"', () => {
    const excludePath = join(testDir, '.git', 'info', 'exclude');
    writeFileSync(excludePath, `${OK_DIR}/\n`, 'utf-8');

    expect(ensureOkExcludedFromGit(testDir)).toBe('already-present');
    expect(readFileSync(excludePath, 'utf-8')).toBe(`${OK_DIR}/\n`);
  });

  it('recognizes leading-slash and no-trailing-slash variants', () => {
    const excludePath = join(testDir, '.git', 'info', 'exclude');
    for (const variant of [OK_DIR, `/${OK_DIR}`, `/${OK_DIR}/`]) {
      writeFileSync(excludePath, `${variant}\n`, 'utf-8');
      expect(ensureOkExcludedFromGit(testDir)).toBe('already-present');
    }
  });
});
