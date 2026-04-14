import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createManagedRenameRecoveryJournal,
  managedRenameJournalPath,
  recoverPendingManagedRename,
  withManagedRenameRecovery,
  writeManagedRenameJournal,
} from './managed-rename-journal.ts';

let tmpDir = '';

function setupTmpDir(): string {
  tmpDir = mkdtempSync(join(tmpdir(), 'ok-managed-rename-journal-'));
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = '';
  }
});

describe('managed rename recovery journal', () => {
  test('writes the journal before mutations and clears it after success', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'alpha.md'), '# Alpha\n', 'utf-8');

    let sawJournalBeforeMutation = false;
    await withManagedRenameRecovery(
      dir,
      createManagedRenameRecoveryJournal({
        sourceDocName: 'alpha',
        destinationDocName: 'beta',
        snapshots: [{ docName: 'alpha', content: '# Alpha\n' }],
      }),
      () => {
        sawJournalBeforeMutation = existsSync(managedRenameJournalPath(dir));
        renameSync(join(dir, 'alpha.md'), join(dir, 'beta.md'));
      },
    );

    expect(sawJournalBeforeMutation).toBe(true);
    expect(existsSync(managedRenameJournalPath(dir))).toBe(false);
    expect(existsSync(join(dir, 'alpha.md'))).toBe(false);
    expect(readFileSync(join(dir, 'beta.md'), 'utf-8')).toBe('# Alpha\n');
  });

  test('replays a pending journal back to the pre-rename vault state', () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'beta.md'), '# Alpha\n', 'utf-8');
    writeFileSync(join(dir, 'referrer.md'), 'See [[beta]].\n', 'utf-8');

    const journal = createManagedRenameRecoveryJournal({
      sourceDocName: 'alpha',
      destinationDocName: 'beta',
      snapshots: [
        { docName: 'alpha', content: '# Alpha\n' },
        { docName: 'referrer', content: 'See [[alpha]].\n' },
      ],
    });
    writeManagedRenameJournal(dir, journal);

    const recovery = recoverPendingManagedRename(dir);

    expect(recovery.recovered).toBe(true);
    expect(recovery.restoredDocNames).toEqual(['alpha', 'referrer']);
    expect(readFileSync(join(dir, 'alpha.md'), 'utf-8')).toBe('# Alpha\n');
    expect(readFileSync(join(dir, 'referrer.md'), 'utf-8')).toBe('See [[alpha]].\n');
    expect(existsSync(join(dir, 'beta.md'))).toBe(false);
    expect(existsSync(managedRenameJournalPath(dir))).toBe(false);
  });
});
