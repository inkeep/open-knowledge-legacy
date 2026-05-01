/**
 * D24 layer (e) — malformed-YAML fuzz layer covering FR9 (panel last-valid +
 * banner), D31 (Y.Text IS the FM source of truth), and FR10 (no bridge
 * regression). After deleting the L3 hook (D10), this is the only verification
 * of the new threat model: malformed bytes round-trip through Y.Text without
 * blocking the editor.
 *
 * The four entry points the spec calls out (D24 layer e):
 *   1. UI commit through `bindFrontmatterDoc` (refused at L1).
 *   2. Source-mode keystroke producing transient invalid YAML in Y.Text.
 *   3. File-watcher delivering malformed disk content.
 *   4. Concurrent two-client interleaving producing unparseable merge state.
 *
 * Entry points 3 and 4 require a live Hocuspocus instance; the asserts run in
 * `applyExternalChange.test.ts` and the multi-client integration suite. This
 * file covers entries 1 and 2 plus the binding-side malformed-region read
 * contract (panel renders last-valid + banner).
 */

import { describe, expect, test } from 'bun:test';
import {
  applyPatchToFm,
  bindFrontmatterDoc,
  type FrontmatterDocProvider,
  parseFmRegion,
  readFmRegionWithError,
} from '@inkeep/open-knowledge-core';
import * as fc from 'fast-check';
import * as Y from 'yjs';

function makeProvider(initial = ''): FrontmatterDocProvider & {
  emitSynced: () => void;
} {
  const document = new Y.Doc();
  if (initial) {
    document.getText('source').insert(0, initial);
  }
  const handlers = new Set<() => void>();
  return {
    document,
    on(event, listener) {
      if (event === 'synced') handlers.add(listener);
    },
    off(event, listener) {
      if (event === 'synced') handlers.delete(listener);
    },
    emitSynced() {
      for (const h of handlers) h();
    },
  };
}

describe('FR9 malformed YAML — read-time graceful degradation', () => {
  test('parseFmRegion returns parseError on malformed input', () => {
    const result = parseFmRegion(': : : invalid');
    expect(result.map).toBeNull();
    expect(result.parseError).toBeDefined();
  });

  test('readFmRegionWithError returns map: {} + parseError for malformed Y.Text', () => {
    const ytextSnapshot = '---\n: : : invalid\n---\n# Body\n';
    const { map, parseError } = readFmRegionWithError(ytextSnapshot);
    expect(map).toEqual({});
    expect(parseError).toBeDefined();
  });

  test('binding.current() surfaces parseError without throwing', () => {
    const provider = makeProvider('---\n: : : invalid\n---\n');
    const binding = bindFrontmatterDoc(provider);
    const snapshot = binding.current();
    expect(snapshot.map).toEqual({});
    expect(snapshot.parseError).toBeDefined();
    binding.dispose();
  });
});

describe('FR9 + D31 — UI commits refused while YAML is malformed', () => {
  test('binding.patch refuses to mutate Y.Text when the region is unparseable', () => {
    const provider = makeProvider('---\n: : : invalid\n---\n');
    const binding = bindFrontmatterDoc(provider);
    const ytextBefore = provider.document.getText('source').toString();

    const result = binding.patch({ title: 'New' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_ERROR');
    }
    expect(provider.document.getText('source').toString()).toBe(ytextBefore);
    binding.dispose();
  });

  test('binding.rename refuses to mutate Y.Text when the region is unparseable', () => {
    const provider = makeProvider('---\n: : : invalid\n---\n');
    const binding = bindFrontmatterDoc(provider);
    const ytextBefore = provider.document.getText('source').toString();

    const result = binding.rename('any', 'other');

    expect(result.ok).toBe(false);
    expect(provider.document.getText('source').toString()).toBe(ytextBefore);
    binding.dispose();
  });

  test('binding.reorder refuses to mutate Y.Text when the region is unparseable', () => {
    const provider = makeProvider('---\n: : : invalid\n---\n');
    const binding = bindFrontmatterDoc(provider);
    const ytextBefore = provider.document.getText('source').toString();

    const result = binding.reorder(['a', 'b']);

    expect(result.ok).toBe(false);
    expect(provider.document.getText('source').toString()).toBe(ytextBefore);
    binding.dispose();
  });

  test('source-mode-style direct Y.Text edits to malformed YAML round-trip verbatim (D31)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    const ytext = provider.document.getText('source');

    const malformed = '---\nstatus: [unterminated\n---\n# Body\n';
    provider.document.transact(() => {
      ytext.insert(0, malformed);
    });

    // Y.Text holds the malformed bytes verbatim (D31 — Y.Text IS the FM
    // source of truth, including malformed bytes).
    expect(ytext.toString()).toBe(malformed);

    // The binding surfaces the parseError so the panel can render a banner.
    expect(binding.current().parseError).toBeDefined();
    binding.dispose();
  });
});

describe('applyPatchToFm fuzz — never throws on malformed YAML', () => {
  test('arbitrary malformed bytes inside the fence produce a parse_failed error envelope', () => {
    const malformedFragment = fc.oneof(
      fc.constant(': : : invalid'),
      fc.constant('[unterminated'),
      fc.constant('"unbalanced quote'),
      fc.constant('  - unbalanced\nlist'),
      fc.constant('key: [a, b'),
      fc.constant('key: {x: 1'),
    );
    fc.assert(
      fc.property(malformedFragment, (frag) => {
        const fenced = `---\n${frag}\n---\n`;
        const result = applyPatchToFm(fenced, { newKey: 'x' });
        expect(result.ok).toBe(false);
        // Specifically the parse_failed envelope, not a runtime exception.
        if (!result.ok) {
          expect(result.error.kind).toBe('parse_failed');
        }
      }),
      { numRuns: 20 },
    );
  });
});
