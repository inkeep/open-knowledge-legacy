/**
 * US-028: Test harness migration — structural isPairedWriteOrigin checks.
 *
 * Verifies that attachBridgeInvariantWatcher fires for per-session origins
 * (F1 shape, unique object refs) via the structural isPairedWriteOrigin
 * predicate, not identity-based Set membership with AGENT_WRITE_ORIGIN.
 */

import { describe, expect, test } from 'bun:test';
import type { LocalTransactionOrigin } from '@hocuspocus/server';
import { isPairedWriteOrigin } from '@inkeep/open-knowledge-server';
import * as Y from 'yjs';

import { attachBridgeInvariantWatcher } from './test-harness';

/** Create a per-session origin matching the F1 shape (D2, D23). */
function makeSessionOrigin(sessionId: string): LocalTransactionOrigin {
  return Object.freeze({
    source: 'local' as const,
    skipStoreHooks: false,
    context: Object.freeze({
      origin: 'agent-write',
      paired: true as const,
      session_id: sessionId,
      principal: 'principal-test-abc',
    }),
  });
}

describe('US-028: test harness migration — structural isPairedWriteOrigin', () => {
  test('isPairedWriteOrigin returns true for two distinct per-session origins', () => {
    const o1 = makeSessionOrigin('conn-1');
    const o2 = makeSessionOrigin('conn-2');

    expect(isPairedWriteOrigin(o1)).toBe(true);
    expect(isPairedWriteOrigin(o2)).toBe(true);
    // Object-identity-unique per precedent #1
    expect(o1).not.toBe(o2);
  });

  test('attachBridgeInvariantWatcher fires on per-session origin-1 (structural check)', () => {
    const origin1 = makeSessionOrigin('conn-1');
    const doc = new Y.Doc();
    const ytext = doc.getText('source');

    const violations: unknown[] = [];
    const detach = attachBridgeInvariantWatcher(doc, {
      onViolation: (info) => violations.push(info),
    });

    try {
      // Mutate Y.Text without matching XmlFragment — invariant violation.
      // The watcher should fire because origin1 passes isPairedWriteOrigin.
      doc.transact(() => {
        ytext.insert(0, 'hello');
      }, origin1);
    } catch {
      // BridgeInvariantViolationError expected
      violations.push('caught');
    }

    detach();
    doc.destroy();

    expect(violations.length).toBeGreaterThan(0); // origin1 triggered the watcher
  });

  test('attachBridgeInvariantWatcher fires on per-session origin-2 (structural check)', () => {
    const origin2 = makeSessionOrigin('conn-2');
    const doc = new Y.Doc();
    const ytext = doc.getText('source');

    const violations: unknown[] = [];
    const detach = attachBridgeInvariantWatcher(doc, {
      onViolation: (info) => violations.push(info),
    });

    try {
      doc.transact(() => {
        ytext.insert(0, 'world');
      }, origin2);
    } catch {
      violations.push('caught');
    }

    detach();
    doc.destroy();

    expect(violations.length).toBeGreaterThan(0); // origin2 also triggered
  });

  test('watcher does NOT fire on undefined origin (WYSIWYG local typing)', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');

    let fired = false;
    const detach = attachBridgeInvariantWatcher(doc, {
      onViolation: () => {
        fired = true;
      },
    });

    try {
      // undefined origin = local WYSIWYG typing — deliberately excluded
      doc.transact(() => {
        ytext.insert(0, 'typing');
      }, undefined);
    } catch {
      // should not throw
    }

    detach();
    doc.destroy();

    expect(fired).toBe(false);
  });

  test('isPairedWriteOrigin rejects non-paired origin', () => {
    const nonPaired = {
      source: 'local' as const,
      skipStoreHooks: false,
      context: { origin: 'sync-from-tree' },
    };
    expect(isPairedWriteOrigin(nonPaired)).toBe(false);
    expect(isPairedWriteOrigin(undefined)).toBe(false);
    expect(isPairedWriteOrigin(null)).toBe(false);
    expect(isPairedWriteOrigin('agent-write')).toBe(false);
  });
});
