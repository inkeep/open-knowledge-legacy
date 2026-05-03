import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import {
  tracedMkdirSync,
  tracedRenameSync,
  tracedRmdirSync,
  tracedRmSync,
  tracedWriteFileSync,
} from './fs-traced.ts';
import { safeContentPath } from './persistence.ts';

const MANAGED_RENAME_JOURNAL_FILENAME = 'managed-rename.json';

export interface ManagedRenameSnapshot {
  docName: string;
  content: string;
}

interface ManagedRenameAffectedDoc {
  from: string;
  to: string;
}

interface ManagedRenameRecoveryJournalV1 {
  version: 1;
  sourceDocName: string;
  destinationDocName: string;
  createdAt: string;
  snapshots: ManagedRenameSnapshot[];
}

interface ManagedRenameRecoveryJournalV2 {
  version: 2;
  fromPath: string;
  toPath: string;
  affectedDocs: ManagedRenameAffectedDoc[];
  createdAt: string;
  snapshots: ManagedRenameSnapshot[];
}

type ManagedRenameRecoveryJournal = ManagedRenameRecoveryJournalV1 | ManagedRenameRecoveryJournalV2;

interface ManagedRenameRecoveryResult {
  recovered: boolean;
  journal: ManagedRenameRecoveryJournal | null;
  restoredDocNames: string[];
}

type MaybePromise<T> = T | Promise<T>;

function journalDir(contentDir: string): string {
  return resolve(contentDir, '.ok');
}

export function managedRenameJournalPath(contentDir: string): string {
  return resolve(journalDir(contentDir), MANAGED_RENAME_JOURNAL_FILENAME);
}

export function createManagedRenameRecoveryJournal(args: {
  fromPath: string;
  toPath: string;
  affectedDocs: ManagedRenameAffectedDoc[];
  snapshots: ManagedRenameSnapshot[];
  createdAt?: string;
}): ManagedRenameRecoveryJournalV2 {
  return {
    version: 2,
    fromPath: args.fromPath,
    toPath: args.toPath,
    affectedDocs: args.affectedDocs,
    createdAt: args.createdAt ?? new Date().toISOString(),
    snapshots: args.snapshots,
  };
}

function isManagedRenameSnapshot(value: unknown): value is ManagedRenameSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<ManagedRenameSnapshot>;
  return typeof snapshot.docName === 'string' && typeof snapshot.content === 'string';
}

function isManagedRenameAffectedDoc(value: unknown): value is ManagedRenameAffectedDoc {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ManagedRenameAffectedDoc>;
  return typeof entry.from === 'string' && typeof entry.to === 'string';
}

function parseV2(value: Record<string, unknown>): ManagedRenameRecoveryJournalV2 {
  if (typeof value.fromPath !== 'string' || value.fromPath.length === 0) {
    throw new Error('Managed rename journal v2 is missing fromPath');
  }
  if (typeof value.toPath !== 'string' || value.toPath.length === 0) {
    throw new Error('Managed rename journal v2 is missing toPath');
  }
  if (typeof value.createdAt !== 'string' || value.createdAt.length === 0) {
    throw new Error('Managed rename journal v2 is missing createdAt');
  }
  if (
    !Array.isArray(value.affectedDocs) ||
    value.affectedDocs.length === 0 ||
    !value.affectedDocs.every(isManagedRenameAffectedDoc)
  ) {
    throw new Error('Managed rename journal v2 has invalid affectedDocs');
  }
  if (
    !Array.isArray(value.snapshots) ||
    value.snapshots.length === 0 ||
    !value.snapshots.every(isManagedRenameSnapshot)
  ) {
    throw new Error('Managed rename journal v2 has invalid snapshots');
  }
  for (const entry of value.affectedDocs as ManagedRenameAffectedDoc[]) {
    if (
      !(value.snapshots as ManagedRenameSnapshot[]).some(
        (snapshot) => snapshot.docName === entry.from,
      )
    ) {
      throw new Error(
        `Managed rename journal v2 is missing snapshot for affected doc: ${entry.from}`,
      );
    }
  }
  return {
    version: 2,
    fromPath: value.fromPath,
    toPath: value.toPath,
    affectedDocs: value.affectedDocs as ManagedRenameAffectedDoc[],
    createdAt: value.createdAt,
    snapshots: value.snapshots as ManagedRenameSnapshot[],
  };
}

function parseV1(value: Record<string, unknown>): ManagedRenameRecoveryJournalV1 {
  if (typeof value.sourceDocName !== 'string' || value.sourceDocName.length === 0) {
    throw new Error('Managed rename journal v1 is missing sourceDocName');
  }
  if (typeof value.destinationDocName !== 'string' || value.destinationDocName.length === 0) {
    throw new Error('Managed rename journal v1 is missing destinationDocName');
  }
  if (typeof value.createdAt !== 'string' || value.createdAt.length === 0) {
    throw new Error('Managed rename journal v1 is missing createdAt');
  }
  if (
    !Array.isArray(value.snapshots) ||
    value.snapshots.length === 0 ||
    !value.snapshots.every(isManagedRenameSnapshot)
  ) {
    throw new Error('Managed rename journal v1 has invalid snapshots');
  }
  if (
    !(value.snapshots as ManagedRenameSnapshot[]).some(
      (snapshot) => snapshot.docName === value.sourceDocName,
    )
  ) {
    throw new Error('Managed rename journal v1 must include the source document snapshot');
  }
  return {
    version: 1,
    sourceDocName: value.sourceDocName,
    destinationDocName: value.destinationDocName,
    createdAt: value.createdAt,
    snapshots: value.snapshots as ManagedRenameSnapshot[],
  };
}

function parseManagedRenameRecoveryJournal(value: unknown): ManagedRenameRecoveryJournal {
  if (!value || typeof value !== 'object') {
    throw new Error('Managed rename journal must be an object');
  }
  const journal = value as Record<string, unknown>;
  if (journal.version === 2) return parseV2(journal);
  if (journal.version === 1) return parseV1(journal);
  throw new Error(`Unsupported managed rename journal version: ${String(journal.version)}`);
}

export function readManagedRenameJournal(contentDir: string): ManagedRenameRecoveryJournal | null {
  const path = managedRenameJournalPath(contentDir);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    return parseManagedRenameRecoveryJournal(JSON.parse(raw) as unknown);
  } catch (err) {
    throw new Error(
      `Managed rename journal at ${path} is corrupt: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function writeManagedRenameJournal(
  contentDir: string,
  journal: ManagedRenameRecoveryJournalV2,
): void {
  const path = managedRenameJournalPath(contentDir);
  tracedMkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp`;
  tracedWriteFileSync(tempPath, JSON.stringify(journal, null, 2), 'utf-8');
  tracedRenameSync(tempPath, path);
}

function clearManagedRenameJournal(contentDir: string): void {
  tracedRmSync(managedRenameJournalPath(contentDir), { force: true });
}

export async function withManagedRenameRecovery<T>(
  contentDir: string,
  journal: ManagedRenameRecoveryJournalV2,
  operation: () => MaybePromise<T>,
): Promise<T> {
  writeManagedRenameJournal(contentDir, journal);
  const result = await operation();
  clearManagedRenameJournal(contentDir);
  return result;
}

function destinationsToCleanV1(journal: ManagedRenameRecoveryJournalV1): string[] {
  return [journal.destinationDocName];
}

function destinationsToCleanV2(journal: ManagedRenameRecoveryJournalV2): string[] {
  return journal.affectedDocs.map((entry) => entry.to);
}

function pruneEmptyAncestors(filePath: string, contentDir: string): void {
  const root = resolve(contentDir);
  const boundary = `${root}${sep}`;
  let cur = dirname(filePath);
  while (cur.startsWith(boundary) && cur !== root) {
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch (err) {
      console.warn(`[managed-rename] pruneEmptyAncestors: cannot read ${cur}:`, err);
      return;
    }
    if (entries.length > 0) return;
    try {
      tracedRmdirSync(cur);
    } catch (err) {
      console.warn(`[managed-rename] pruneEmptyAncestors: cannot rmdir ${cur}:`, err);
      return;
    }
    cur = dirname(cur);
  }
}

export function recoverPendingManagedRename(contentDir: string): ManagedRenameRecoveryResult {
  const journal = readManagedRenameJournal(contentDir);
  if (!journal) {
    return { recovered: false, journal: null, restoredDocNames: [] };
  }

  const restoredDocNames = new Set<string>();
  const restoreFailures: Array<{ docName: string; cause: unknown }> = [];
  for (const snapshot of journal.snapshots) {
    try {
      const filePath = safeContentPath(snapshot.docName, contentDir);
      tracedMkdirSync(dirname(filePath), { recursive: true });
      tracedWriteFileSync(filePath, snapshot.content, 'utf-8');
      restoredDocNames.add(snapshot.docName);
    } catch (err) {
      restoreFailures.push({ docName: snapshot.docName, cause: err });
      console.warn(`[managed-rename] Failed to restore ${snapshot.docName}:`, err);
    }
  }

  if (restoreFailures.length > 0) {
    const failedNames = restoreFailures.map((f) => f.docName).join(', ');
    console.warn(
      `[managed-rename] Recovery incomplete; keeping journal for retry (${failedNames})`,
    );
    const causes = restoreFailures.map((f) =>
      f.cause instanceof Error ? f.cause : new Error(String(f.cause)),
    );
    throw new AggregateError(
      causes,
      `Managed rename recovery incomplete; failed to restore: ${failedNames}`,
    );
  }

  const destinationsToClean =
    journal.version === 2 ? destinationsToCleanV2(journal) : destinationsToCleanV1(journal);
  const cleanupFailures: Array<{ destination: string; cause: unknown }> = [];
  for (const destination of destinationsToClean) {
    if (restoredDocNames.has(destination)) continue;
    const destinationPath = safeContentPath(destination, contentDir);
    try {
      tracedRmSync(destinationPath, { force: true });
      pruneEmptyAncestors(destinationPath, contentDir);
    } catch (err) {
      if (existsSync(destinationPath)) {
        console.warn(
          `[managed-rename] Both source and destination files exist after partial recovery for ${destination}`,
        );
      }
      console.warn(
        `[managed-rename] Recovery incomplete; failed to clean destination ${destination}:`,
        err,
      );
      cleanupFailures.push({ destination, cause: err });
    }
  }

  if (cleanupFailures.length > 0) {
    const failedNames = cleanupFailures.map((f) => f.destination).join(', ');
    const causes = cleanupFailures.map((f) =>
      f.cause instanceof Error ? f.cause : new Error(String(f.cause)),
    );
    throw new AggregateError(
      causes,
      `Managed rename recovery incomplete; failed to clean destinations: ${failedNames}`,
    );
  }

  clearManagedRenameJournal(contentDir);

  return {
    recovered: true,
    journal,
    restoredDocNames: [...restoredDocNames].sort((a, b) => a.localeCompare(b)),
  };
}
