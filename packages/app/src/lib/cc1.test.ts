import { describe, expect, test } from 'bun:test';
import {
  CC1_CHANNEL_BRANCH_SWITCHED,
  CC1_CHANNEL_DISK_ACK,
  CC1_CONTRACT_VERSION,
  dispatchCC1Stateless,
  parseCC1BranchSwitched,
  parseCC1DerivedView,
  parseCC1DiskAck,
} from './cc1';

describe('parseCC1DerivedView', () => {
  test('parses a valid files signal', () => {
    expect(
      parseCC1DerivedView(JSON.stringify({ v: CC1_CONTRACT_VERSION, ch: 'files', seq: 3 })),
    ).toEqual({
      v: CC1_CONTRACT_VERSION,
      ch: 'files',
      seq: 3,
    });
  });

  test('returns null for malformed JSON', () => {
    expect(parseCC1DerivedView('{')).toBeNull();
  });

  test('returns null for unknown contract versions', () => {
    expect(parseCC1DerivedView(JSON.stringify({ v: 2, ch: 'files', seq: 1 }))).toBeNull();
  });

  test('returns null for invalid payload shapes', () => {
    expect(
      parseCC1DerivedView(JSON.stringify({ v: CC1_CONTRACT_VERSION, ch: 1, seq: 1 })),
    ).toBeNull();
    expect(
      parseCC1DerivedView(JSON.stringify({ v: CC1_CONTRACT_VERSION, ch: 'files', seq: '1' })),
    ).toBeNull();
  });
});

describe('parseCC1BranchSwitched', () => {
  test('exports the CC1_CHANNEL_BRANCH_SWITCHED constant', () => {
    expect(CC1_CHANNEL_BRANCH_SWITCHED).toBe('branch-switched');
  });

  test('parses a valid branch-switched payload', () => {
    expect(
      parseCC1BranchSwitched(
        JSON.stringify({
          v: CC1_CONTRACT_VERSION,
          ch: CC1_CHANNEL_BRANCH_SWITCHED,
          seq: 1,
          branch: 'main',
        }),
      ),
    ).toEqual({
      v: CC1_CONTRACT_VERSION,
      ch: CC1_CHANNEL_BRANCH_SWITCHED,
      seq: 1,
      branch: 'main',
    });
  });

  test('preserves unknown wire fields (forward-compat via .loose())', () => {
    const payload = JSON.stringify({
      v: CC1_CONTRACT_VERSION,
      ch: CC1_CHANNEL_BRANCH_SWITCHED,
      seq: 7,
      branch: 'feature/auth',
      extra: 'whatever',
      nested: { lol: true },
    });
    expect(parseCC1BranchSwitched(payload)).toEqual({
      v: CC1_CONTRACT_VERSION,
      ch: CC1_CHANNEL_BRANCH_SWITCHED,
      seq: 7,
      branch: 'feature/auth',
      extra: 'whatever',
      nested: { lol: true },
    });
  });

  test('returns null for malformed JSON', () => {
    expect(parseCC1BranchSwitched('{')).toBeNull();
  });

  test('returns null for unknown contract versions', () => {
    expect(
      parseCC1BranchSwitched(
        JSON.stringify({ v: 2, ch: CC1_CHANNEL_BRANCH_SWITCHED, seq: 1, branch: 'main' }),
      ),
    ).toBeNull();
  });

  test('returns null for a different channel', () => {
    expect(
      parseCC1BranchSwitched(
        JSON.stringify({
          v: CC1_CONTRACT_VERSION,
          ch: 'files',
          seq: 1,
          branch: 'main',
        }),
      ),
    ).toBeNull();
  });

  test('returns null when branch field is missing or not a string', () => {
    expect(
      parseCC1BranchSwitched(
        JSON.stringify({ v: CC1_CONTRACT_VERSION, ch: CC1_CHANNEL_BRANCH_SWITCHED, seq: 1 }),
      ),
    ).toBeNull();
    expect(
      parseCC1BranchSwitched(
        JSON.stringify({
          v: CC1_CONTRACT_VERSION,
          ch: CC1_CHANNEL_BRANCH_SWITCHED,
          seq: 1,
          branch: 42,
        }),
      ),
    ).toBeNull();
  });

  test('returns null for non-object payloads', () => {
    expect(parseCC1BranchSwitched('null')).toBeNull();
    expect(parseCC1BranchSwitched('"string"')).toBeNull();
    expect(parseCC1BranchSwitched('123')).toBeNull();
  });
});

describe('parseCC1DiskAck', () => {
  // Helper: minimal valid base64 of a 4-byte payload.
  const validBase64 = Buffer.from(new Uint8Array([0xde, 0xad, 0xbe, 0xef])).toString('base64');

  test('parses a valid disk-ack and decodes sv to Uint8Array', () => {
    const result = parseCC1DiskAck(
      JSON.stringify({
        v: CC1_CONTRACT_VERSION,
        ch: CC1_CHANNEL_DISK_ACK,
        seq: 1,
        docName: 'notes/intro',
        sv: validBase64,
      }),
    );
    if (result === null) throw new Error('expected parsed disk-ack');
    expect(result.docName).toBe('notes/intro');
    expect(result.sv).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.sv)).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  // Contract test: the module docstring promises "null on parse failure,
  // never throws — the stateless listener sees a steady stream of payloads
  // and must skip ones it doesn't recognize without surfacing exceptions
  // to React." atob() throws on invalid base64; this test locks the
  // try/catch in parseCC1DiskAck — a future refactor that drops the
  // catch (e.g., relying on Zod's z.string().base64() check) breaks the
  // test BEFORE the React error boundary surface notices.
  test('returns null on malformed base64 in sv (does NOT throw)', () => {
    const malformed = JSON.stringify({
      v: CC1_CONTRACT_VERSION,
      ch: CC1_CHANNEL_DISK_ACK,
      seq: 1,
      docName: 'notes/intro',
      sv: 'not-valid-base64!!!',
    });
    expect(() => parseCC1DiskAck(malformed)).not.toThrow();
    expect(parseCC1DiskAck(malformed)).toBeNull();
  });

  test('returns null on malformed JSON', () => {
    expect(parseCC1DiskAck('{')).toBeNull();
  });

  test('returns null for unknown contract version', () => {
    expect(
      parseCC1DiskAck(
        JSON.stringify({
          v: 2,
          ch: CC1_CHANNEL_DISK_ACK,
          seq: 1,
          docName: 'notes/intro',
          sv: validBase64,
        }),
      ),
    ).toBeNull();
  });

  test('returns null for a different channel', () => {
    expect(
      parseCC1DiskAck(
        JSON.stringify({
          v: CC1_CONTRACT_VERSION,
          ch: 'files',
          seq: 1,
          docName: 'notes/intro',
          sv: validBase64,
        }),
      ),
    ).toBeNull();
  });

  test('returns null when docName is missing or empty', () => {
    expect(
      parseCC1DiskAck(
        JSON.stringify({
          v: CC1_CONTRACT_VERSION,
          ch: CC1_CHANNEL_DISK_ACK,
          seq: 1,
          sv: validBase64,
        }),
      ),
    ).toBeNull();
    expect(
      parseCC1DiskAck(
        JSON.stringify({
          v: CC1_CONTRACT_VERSION,
          ch: CC1_CHANNEL_DISK_ACK,
          seq: 1,
          docName: '',
          sv: validBase64,
        }),
      ),
    ).toBeNull();
  });

  test('returns null when sv is missing or empty', () => {
    expect(
      parseCC1DiskAck(
        JSON.stringify({
          v: CC1_CONTRACT_VERSION,
          ch: CC1_CHANNEL_DISK_ACK,
          seq: 1,
          docName: 'notes/intro',
          sv: '',
        }),
      ),
    ).toBeNull();
    expect(
      parseCC1DiskAck(
        JSON.stringify({
          v: CC1_CONTRACT_VERSION,
          ch: CC1_CHANNEL_DISK_ACK,
          seq: 1,
          docName: 'notes/intro',
        }),
      ),
    ).toBeNull();
  });
});

describe('dispatchCC1Stateless', () => {
  // Helper: minimal valid base64 of a 4-byte payload.
  const validBase64 = Buffer.from(new Uint8Array([0xde, 0xad, 0xbe, 0xef])).toString('base64');

  test('routes server-info to onServerInfo', () => {
    let received: string | null = null;
    dispatchCC1Stateless(
      JSON.stringify({
        v: CC1_CONTRACT_VERSION,
        ch: 'server-info',
        seq: 0,
        serverInstanceId: 'abc-123',
      }),
      { onServerInfo: (p) => (received = p.serverInstanceId) },
    );
    expect(received).toBe('abc-123');
  });

  test('routes branch-switched to onBranchSwitched', () => {
    let received: string | null = null;
    dispatchCC1Stateless(
      JSON.stringify({
        v: CC1_CONTRACT_VERSION,
        ch: CC1_CHANNEL_BRANCH_SWITCHED,
        seq: 1,
        branch: 'feature/auth',
      }),
      { onBranchSwitched: (p) => (received = p.branch) },
    );
    expect(received).toBe('feature/auth');
  });

  test('routes disk-ack to onDiskAck with decoded sv', () => {
    let receivedDoc: string | null = null;
    let receivedSv: Uint8Array | null = null;
    dispatchCC1Stateless(
      JSON.stringify({
        v: CC1_CONTRACT_VERSION,
        ch: CC1_CHANNEL_DISK_ACK,
        seq: 1,
        docName: 'notes/intro',
        sv: validBase64,
      }),
      {
        onDiskAck: (p) => {
          receivedDoc = p.docName;
          receivedSv = p.sv;
        },
      },
    );
    expect(receivedDoc).toBe('notes/intro');
    expect(receivedSv).toBeInstanceOf(Uint8Array);
  });

  test('routes derived-view to onDerivedView', () => {
    let received: string | null = null;
    dispatchCC1Stateless(JSON.stringify({ v: CC1_CONTRACT_VERSION, ch: 'files', seq: 3 }), {
      onDerivedView: (p) => (received = p.ch),
    });
    expect(received).toBe('files');
  });

  test('routes unparseable payload to onUnknown', () => {
    let received: string | null = null;
    dispatchCC1Stateless('{not-json', { onUnknown: (raw) => (received = raw) });
    expect(received).toBe('{not-json');
  });

  test('omitted handler is a no-op (no throw, no consumer fires)', () => {
    // Harness pattern: subscribe to disk-ack but not branch-switched.
    // A branch-switched payload should silently drop without throwing.
    let diskAckFired = false;
    expect(() => {
      dispatchCC1Stateless(
        JSON.stringify({
          v: CC1_CONTRACT_VERSION,
          ch: CC1_CHANNEL_BRANCH_SWITCHED,
          seq: 1,
          branch: 'main',
        }),
        { onDiskAck: () => (diskAckFired = true) },
      );
    }).not.toThrow();
    expect(diskAckFired).toBe(false);
  });

  test('parsers are mutually exclusive — disk-ack payload does NOT fire onDerivedView', () => {
    // disk-ack and derived-view both have a `ch` field; the schema's
    // ch-literal pinning makes them mutually exclusive.
    let diskAckFired = false;
    let derivedFired = false;
    dispatchCC1Stateless(
      JSON.stringify({
        v: CC1_CONTRACT_VERSION,
        ch: CC1_CHANNEL_DISK_ACK,
        seq: 1,
        docName: 'd',
        sv: validBase64,
      }),
      {
        onDiskAck: () => (diskAckFired = true),
        onDerivedView: () => (derivedFired = true),
      },
    );
    expect(diskAckFired).toBe(true);
    expect(derivedFired).toBe(false);
  });
});
