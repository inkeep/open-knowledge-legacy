import { describe, expect, test } from 'bun:test';
import {
  BridgeSetupError,
  DocumentNotFoundError,
  PreSyncDisconnectError,
  ServerCapabilityMismatchError,
  SyncTimeoutError,
} from '@/editor/sync-promise';
import { errorCopy } from './DocumentErrorBoundary';

describe('errorCopy', () => {
  test('SyncTimeoutError → "Couldn\'t load document" + doc name in summary', () => {
    const copy = errorCopy(new SyncTimeoutError('docs/guide', 30_000));
    expect(copy.title).toBe("Couldn't load document");
    expect(copy.summary).toContain('docs/guide');
    expect(copy.summary).not.toMatch(/\bsync/i);
  });

  test('PreSyncDisconnectError → "Connection dropped" + doc name in summary', () => {
    const copy = errorCopy(new PreSyncDisconnectError('notes/idea'));
    expect(copy.title).toBe('Connection dropped');
    expect(copy.summary).toContain('notes/idea');
    expect(copy.summary).not.toMatch(/\bsync/i);
  });

  test('DocumentNotFoundError → "Document not found" + doc name in summary', () => {
    const copy = errorCopy(new DocumentNotFoundError('missing.md'));
    expect(copy.title).toBe('Document not found');
    expect(copy.summary).toContain('missing.md');
  });

  test('BridgeSetupError → "Couldn\'t open document" + doc name in summary', () => {
    const copy = errorCopy(new BridgeSetupError('docs/troubled', new Error('observer wiring')));
    expect(copy.title).toBe("Couldn't open document");
    expect(copy.summary).toContain('docs/troubled');
  });

  test('ServerCapabilityMismatchError → "Server can\'t open documents" + restart hint', () => {
    const copy = errorCopy(new ServerCapabilityMismatchError('docs/lost', 'ws'));
    expect(copy.title).toBe("Server can't open documents");
    expect(copy.summary).toMatch(/restart/i);
    expect(copy.summary).not.toMatch(/\bsync/i);
  });

  test('unknown Error subclass → "Unknown error" + surfaced message', () => {
    const copy = errorCopy(new Error('wss handshake rejected'));
    expect(copy.title).toBe('Unknown error');
    expect(copy.summary).toContain('wss handshake rejected');
  });

  test('Error without message → "Unknown error" + fallback summary', () => {
    const copy = errorCopy(new Error());
    expect(copy.title).toBe('Unknown error');
    expect(copy.summary).toMatch(/unexpected/i);
  });

  test('non-Error thrown value → "Unknown error" + fallback summary', () => {
    const copy = errorCopy('just a string');
    expect(copy.title).toBe('Unknown error');
    expect(copy.summary).toMatch(/unexpected/i);
  });

  test('null thrown → "Unknown error" + fallback summary', () => {
    const copy = errorCopy(null);
    expect(copy.title).toBe('Unknown error');
    expect(copy.summary).toMatch(/unexpected/i);
  });
});
