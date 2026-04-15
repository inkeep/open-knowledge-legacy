import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { safeContentPath } from './persistence.ts';

const MANAGED_RENAME_JOURNAL_VERSION = 1;
const MANAGED_RENAME_JOURNAL_FILENAME = 'managed-rename.json';

export interface ManagedRenameSnapshot {
  docName: string;
  content: string;
}

export interface ManagedRenameRecoveryJournal {
  version: 1;
  sourceDocName: string;
  destinationDocName: string;
  createdAt: string;
  snapshots: ManagedRenameSnapshot[];
}

export interface ManagedRenameRecoveryResult {
  recovered: boolean;
  journal: ManagedRenameRecoveryJournal | null;
  restoredDocNames: string[];
}

type MaybePromise<T> = T | Promise<T>;

function journalDir(contentDir: string): string {
  return resolve(contentDir, '.open-knowledge');
}

export function managedRenameJournalPath(contentDir: string): string {
  return resolve(journalDir(contentDir), MANAGED_RENAME_JOURNAL_FILENAME);
}

export function createManagedRenameRecoveryJournal(args: {
  sourceDocName: string;
  destinationDocName: string;
  snapshots: ManagedRenameSnapshot[];
  createdAt?: string;
}): ManagedRenameRecoveryJournal {
  return {
    version: MANAGED_RENAME_JOURNAL_VERSION,
    sourceDocName: args.sourceDocName,
    destinationDocName: args.destinationDocName,
    createdAt: args.createdAt ?? new Date().toISOString(),
    snapshots: args.snapshots,
  };
}

function isManagedRenameSnapshot(value: unknown): value is ManagedRenameSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Partial<ManagedRenameSnapshot>;
  return typeof snapshot.docName === 'string' && typeof snapshot.content === 'string';
}

function parseManagedRenameRecoveryJournal(value: unknown): ManagedRenameRecoveryJournal {
  if (!value || typeof value !== 'object') {
    throw new Error('Managed rename journal must be an object');
  }

  const journal = value as Partial<ManagedRenameRecoveryJournal>;
  if (journal.version !== MANAGED_RENAME_JOURNAL_VERSION) {
    throw new Error(`Unsupported managed rename journal version: ${String(journal.version)}`);
  }
  if (typeof journal.sourceDocName !== 'string' || journal.sourceDocName.length === 0) {
    throw new Error('Managed rename journal is missing sourceDocName');
  }
  if (typeof journal.destinationDocName !== 'string' || journal.destinationDocName.length === 0) {
    throw new Error('Managed rename journal is missing destinationDocName');
  }
  if (typeof journal.createdAt !== 'string' || journal.createdAt.length === 0) {
    throw new Error('Managed rename journal is missing createdAt');
  }
  if (!Array.isArray(journal.snapshots) || journal.snapshots.length === 0) {
    throw new Error('Managed rename journal is missing snapshots');
  }
  if (!journal.snapshots.every(isManagedRenameSnapshot)) {
    throw new Error('Managed rename journal has invalid snapshots');
  }
  if (!journal.snapshots.some((snapshot) => snapshot.docName === journal.sourceDocName)) {
    throw new Error('Managed rename journal must include the source document snapshot');
  }

  return {
    version: journal.version,
    sourceDocName: journal.sourceDocName,
    destinationDocName: journal.destinationDocName,
    createdAt: journal.createdAt,
    snapshots: journal.snapshots,
  };
}

export function readManagedRenameJournal(contentDir: string): ManagedRenameRecoveryJournal | null {
  const path = managedRenameJournalPath(contentDir);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  return parseManagedRenameRecoveryJournal(JSON.parse(raw) as unknown);
}

export function writeManagedRenameJournal(
  contentDir: string,
  journal: ManagedRenameRecoveryJournal,
): void {
  const path = managedRenameJournalPath(contentDir);
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, JSON.stringify(journal, null, 2), 'utf-8');
  renameSync(tempPath, path);
}

export function clearManagedRenameJournal(contentDir: string): void {
  rmSync(managedRenameJournalPath(contentDir), { force: true });
}

/**
 * Persist the pre-rename recovery journal, run the managed rename operation,
 * then clear the journal only if the operation completes successfully.
 *
 * If the operation throws, the journal remains on disk so the next server
 * startup can restore the pre-rename state. Do not wrap this in `try/finally`
 * or the crash-recovery guarantee is lost.
 */
export async function withManagedRenameRecovery<T>(
  contentDir: string,
  journal: ManagedRenameRecoveryJournal,
  operation: () => MaybePromise<T>,
): Promise<T> {
  writeManagedRenameJournal(contentDir, journal);
  const result = await operation();
  clearManagedRenameJournal(contentDir);
  return result;
}

export function recoverPendingManagedRename(contentDir: string): ManagedRenameRecoveryResult {
  const journal = readManagedRenameJournal(contentDir);
  if (!journal) {
    return { recovered: false, journal: null, restoredDocNames: [] };
  }

  const restoredDocNames = new Set<string>();
  const failedDocNames: string[] = [];
  for (const snapshot of journal.snapshots) {
    try {
      const filePath = safeContentPath(snapshot.docName, contentDir);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, snapshot.content, 'utf-8');
      restoredDocNames.add(snapshot.docName);
    } catch (err) {
      failedDocNames.push(snapshot.docName);
      console.warn(`[managed-rename] Failed to restore ${snapshot.docName}:`, err);
    }
  }

  if (failedDocNames.length > 0) {
    console.warn(
      `[managed-rename] Recovery incomplete; keeping journal for retry (${failedDocNames.join(', ')})`,
    );
    throw new Error(
      `Managed rename recovery incomplete; failed to restore: ${failedDocNames.join(', ')}`,
    );
  }

  if (!restoredDocNames.has(journal.destinationDocName)) {
    try {
      rmSync(safeContentPath(journal.destinationDocName, contentDir), { force: true });
    } catch (err) {
      console.warn(
        `[managed-rename] Recovery incomplete; failed to clean destination ${journal.destinationDocName}:`,
        err,
      );
      throw new Error(
        `Managed rename recovery incomplete; failed to clean destination: ${journal.destinationDocName}`,
      );
    }
  }

  clearManagedRenameJournal(contentDir);

  return {
    recovered: true,
    journal,
    restoredDocNames: [...restoredDocNames].sort((a, b) => a.localeCompare(b)),
  };
}
