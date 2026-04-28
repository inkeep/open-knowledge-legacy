/**
 * Integration tests for principal-identity-in-presence (FR4, FR6, FR9, FR12).
 *
 * Tests awareness publication wire format and the dedupe behavior implemented
 * in dedupeHumansByPrincipalId. Awareness states are driven directly via
 * provider.awareness.setLocalStateField (same shape as TiptapEditor's
 * awareness effect) — no React required.
 *
 * Per-test docName isolation. Client lifecycle in try/finally per harness
 * conventions. Never hardcodes 'test-doc' — every docName is a random UUID.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { AwarenessUser } from '../../src/presence/identity';
import { dedupeHumansByPrincipalId, type HumanParticipant } from '../../src/presence/use-presence';
import { createTestClient, createTestServer, pollUntil, type TestServer } from './test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer({ keepaliveGraceMs: 150 });
});

afterAll(async () => {
  await server.cleanup();
});

function buildHumans(provider: HocuspocusProvider): HumanParticipant[] {
  const humans: HumanParticipant[] = [];
  const states = provider.awareness?.getStates() ?? new Map<number, unknown>();
  for (const [clientId, rawState] of states.entries()) {
    const s = rawState as Record<string, unknown>;
    if (!s.user || typeof s.user !== 'object') continue;
    const user = s.user as AwarenessUser;
    if (user.type !== 'human') continue;
    humans.push({
      kind: 'human',
      clientId,
      user,
      mode: (s.mode as HumanParticipant['mode']) ?? 'wysiwyg',
      tabCount: 1,
    });
  }
  return humans;
}

function getAwarenessUser(
  provider: HocuspocusProvider,
  clientId: number,
): AwarenessUser | undefined {
  const rawState = provider.awareness?.getStates().get(clientId) as
    | Record<string, unknown>
    | undefined;
  if (!rawState?.user || typeof rawState.user !== 'object') return undefined;
  return rawState.user as AwarenessUser;
}

describe('presence dedupe — same principalId', () => {
  test('two clients with same principalId collapse to one HumanParticipant with tabCount === 2', async () => {
    const docName = `presence-dedupe-${crypto.randomUUID()}`;
    const clientA = await createTestClient(server.port, docName);
    const clientB = await createTestClient(server.port, docName);
    try {
      const PID = 'principal-test-same';

      clientA.provider.awareness?.setLocalStateField('user', {
        type: 'human' as const,
        name: 'Miles Kaming-Thanassi',
        color: '#f0ece3',
        coeditor: 'standalone',
        tabId: 'tab-a',
        principalId: PID,
      });
      clientB.provider.awareness?.setLocalStateField('user', {
        type: 'human' as const,
        name: 'Miles Kaming-Thanassi',
        color: '#f0ece3',
        coeditor: 'standalone',
        tabId: 'tab-b',
        principalId: PID,
      });

      // Wait until clientA sees clientB's awareness state
      const clientAId = clientA.provider.awareness?.clientID ?? 0;
      const clientBId = clientB.provider.awareness?.clientID ?? 0;
      await pollUntil(() => clientA.provider.awareness?.getStates().has(clientBId) === true, 5000);
      await pollUntil(() => clientB.provider.awareness?.getStates().has(clientAId) === true, 5000);

      const humansFromA = buildHumans(clientA.provider);
      const deduped = dedupeHumansByPrincipalId(humansFromA);
      expect(deduped.length).toBe(1);
      expect(deduped[0].tabCount).toBe(2);
    } finally {
      await clientA.cleanup();
      await clientB.cleanup();
    }
  });

  test('when one of two deduped clients disconnects, tabCount transitions from 2 to 1', async () => {
    const docName = `presence-disconnect-${crypto.randomUUID()}`;
    const clientA = await createTestClient(server.port, docName);
    const clientB = await createTestClient(server.port, docName);
    const PID = 'principal-test-disconnect';

    clientA.provider.awareness?.setLocalStateField('user', {
      type: 'human' as const,
      name: 'Miles KT',
      color: '#f0ece3',
      coeditor: 'standalone',
      tabId: 'tab-a',
      principalId: PID,
    });
    clientB.provider.awareness?.setLocalStateField('user', {
      type: 'human' as const,
      name: 'Miles KT',
      color: '#f0ece3',
      coeditor: 'standalone',
      tabId: 'tab-b',
      principalId: PID,
    });

    const clientBId = clientB.provider.awareness?.clientID ?? 0;
    try {
      // Wait until clientA sees clientB
      await pollUntil(() => clientA.provider.awareness?.getStates().has(clientBId) === true, 5000);

      // Both visible → deduped tabCount should be 2
      const before = dedupeHumansByPrincipalId(buildHumans(clientA.provider));
      expect(before.length).toBe(1);
      expect(before[0].tabCount).toBe(2);

      // Disconnect clientB
      clientB.provider.destroy();

      // Wait until clientA no longer sees clientB's awareness entry
      await pollUntil(
        () => clientA.provider.awareness?.getStates().has(clientBId) === false,
        10_000,
      );

      const after = dedupeHumansByPrincipalId(buildHumans(clientA.provider));
      // Either clientA's own entry only, or no entries (if self not counted)
      const ownEntry = after.find((h) => h.user.principalId === PID);
      expect(ownEntry?.tabCount ?? 1).toBe(1);
    } finally {
      await clientA.cleanup();
      // clientB already destroyed above — call cleanup for idempotency (best-effort)
      try {
        await clientB.cleanup();
      } catch {
        /* already destroyed */
      }
    }
  });
});

describe('presence dedupe — different principalIds', () => {
  test('two clients with different principalIds produce two distinct HumanParticipants', async () => {
    const docName = `presence-distinct-${crypto.randomUUID()}`;
    const clientA = await createTestClient(server.port, docName);
    const clientB = await createTestClient(server.port, docName);
    try {
      clientA.provider.awareness?.setLocalStateField('user', {
        type: 'human' as const,
        name: 'Miles KT',
        color: '#f0ece3',
        coeditor: 'standalone',
        tabId: 'tab-a',
        principalId: 'principal-user-a',
      });
      clientB.provider.awareness?.setLocalStateField('user', {
        type: 'human' as const,
        name: 'Nick D',
        color: '#dce8fa',
        coeditor: 'standalone',
        tabId: 'tab-b',
        principalId: 'principal-user-b',
      });

      const clientBId = clientB.provider.awareness?.clientID ?? 0;
      await pollUntil(() => clientA.provider.awareness?.getStates().has(clientBId) === true, 5000);

      const deduped = dedupeHumansByPrincipalId(buildHumans(clientA.provider));
      // Two distinct principals → two entries
      expect(deduped.length).toBe(2);
      expect(deduped.every((h) => h.tabCount === 1)).toBe(true);
    } finally {
      await clientA.cleanup();
      await clientB.cleanup();
    }
  });
});

describe('FR3 awareness payload shape', () => {
  test('state (a): principal not yet resolved — no principalId in payload, type===human', async () => {
    const docName = `presence-fr3-a-${crypto.randomUUID()}`;
    const clientA = await createTestClient(server.port, docName);
    const clientB = await createTestClient(server.port, docName);
    try {
      // State (a): no principal — random fallback, no principalId
      clientA.provider.awareness?.setLocalStateField('user', {
        type: 'human' as const,
        name: 'Curious Squirrel',
        color: '#f9e1db',
        coeditor: 'standalone',
        tabId: 'tab-state-a',
        // NO principalId
      });

      const clientAId = clientA.provider.awareness?.clientID ?? 0;
      await pollUntil(() => clientB.provider.awareness?.getStates().has(clientAId) === true, 5000);

      const user = getAwarenessUser(clientB.provider, clientAId);
      expect(user?.type).toBe('human');
      expect(user?.coeditor).toBe('standalone');
      expect('principalId' in (user ?? {})).toBe(false);
    } finally {
      await clientA.cleanup();
      await clientB.cleanup();
    }
  });

  test('state (b): git-config — principalId present, type===human, coeditor preserved', async () => {
    const docName = `presence-fr3-b-${crypto.randomUUID()}`;
    const clientA = await createTestClient(server.port, docName);
    const clientB = await createTestClient(server.port, docName);
    try {
      // State (b): git-config principal
      clientA.provider.awareness?.setLocalStateField('user', {
        type: 'human' as const,
        name: 'Miles Kaming-Thanassi',
        color: '#f0ece3',
        coeditor: 'cursor',
        tabId: 'tab-state-b',
        principalId: 'principal-git-config-id',
      });

      const clientAId = clientA.provider.awareness?.clientID ?? 0;
      await pollUntil(() => clientB.provider.awareness?.getStates().has(clientAId) === true, 5000);

      const user = getAwarenessUser(clientB.provider, clientAId);
      expect(user?.type).toBe('human');
      expect(user?.coeditor).toBe('cursor');
      expect(user?.principalId).toBe('principal-git-config-id');
    } finally {
      await clientA.cleanup();
      await clientB.cleanup();
    }
  });

  test('state (c): synthesized — no principalId, type===human, coeditor preserved (FR9)', async () => {
    const docName = `presence-fr3-c-${crypto.randomUUID()}`;
    const clientA = await createTestClient(server.port, docName);
    const clientB = await createTestClient(server.port, docName);
    try {
      // State (c): synthesized — random name, no principalId per FR9
      clientA.provider.awareness?.setLocalStateField('user', {
        type: 'human' as const,
        name: 'Brave Bird',
        color: '#dce8fa',
        coeditor: 'standalone',
        tabId: 'tab-state-c',
        // NO principalId per FR9
      });

      const clientAId = clientA.provider.awareness?.clientID ?? 0;
      await pollUntil(() => clientB.provider.awareness?.getStates().has(clientAId) === true, 5000);

      const user = getAwarenessUser(clientB.provider, clientAId);
      expect(user?.type).toBe('human');
      expect(user?.coeditor).toBe('standalone');
      expect('principalId' in (user ?? {})).toBe(false);
    } finally {
      await clientA.cleanup();
      await clientB.cleanup();
    }
  });
});

describe('FR9 — synthesized users do not false-dedupe', () => {
  test('two synthesized users without principalId render as two separate participants', async () => {
    const docName = `presence-synthesized-${crypto.randomUUID()}`;
    const clientA = await createTestClient(server.port, docName);
    const clientB = await createTestClient(server.port, docName);
    try {
      // Two different browser profiles: distinct random names, NO principalId
      clientA.provider.awareness?.setLocalStateField('user', {
        type: 'human' as const,
        name: 'Curious Squirrel',
        color: '#f9e1db',
        coeditor: 'standalone',
        tabId: 'tab-profile-1',
      });
      clientB.provider.awareness?.setLocalStateField('user', {
        type: 'human' as const,
        name: 'Brave Bird',
        color: '#dce8fa',
        coeditor: 'standalone',
        tabId: 'tab-profile-2',
      });

      const clientBId = clientB.provider.awareness?.clientID ?? 0;
      await pollUntil(() => clientA.provider.awareness?.getStates().has(clientBId) === true, 5000);

      const deduped = dedupeHumansByPrincipalId(buildHumans(clientA.provider));
      // No principalIds → no dedupe → 2 participants
      expect(deduped.length).toBe(2);
      expect(deduped.every((h) => h.tabCount === 1)).toBe(true);
    } finally {
      await clientA.cleanup();
      await clientB.cleanup();
    }
  });
});
