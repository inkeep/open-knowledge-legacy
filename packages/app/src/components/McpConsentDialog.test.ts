/**
 * McpConsentDialog pure-helper tests — repo convention is no
 * @testing-library/react; full DOM rendering behavior is exercised via the
 * US-010 Playwright smoke (mcp-wiring.e2e.ts).
 */
import { describe, expect, mock, test } from 'bun:test';
import type { OkMcpWiringEditorId, OkMcpWiringShowPayload } from '@/lib/desktop-bridge-types';
import {
  computeInitialSelection,
  McpConsentDialog,
  selectedIdsOrdered,
  type ToastImpl,
  toggleSelectedId,
} from './McpConsentDialog';

type EditorDetection = OkMcpWiringShowPayload['detectedEditors'][number];

const sampleDetection: readonly EditorDetection[] = [
  { id: 'claude', label: 'Claude Code', detected: true },
  { id: 'claude-desktop', label: 'Claude Desktop', detected: false },
  { id: 'cursor', label: 'Cursor', detected: true },
  { id: 'vscode', label: 'VS Code', detected: false },
  { id: 'windsurf', label: 'Windsurf', detected: false },
  { id: 'codex', label: 'Codex', detected: false },
];

describe('computeInitialSelection', () => {
  test('preselects every detected editor; skips undetected ones (OQ-14)', () => {
    const sel = computeInitialSelection(sampleDetection);
    expect(sel.has('claude')).toBe(true);
    expect(sel.has('cursor')).toBe(true);
    expect(sel.has('claude-desktop')).toBe(false);
    expect(sel.has('vscode')).toBe(false);
    expect(sel.has('windsurf')).toBe(false);
    expect(sel.has('codex')).toBe(false);
    expect(sel.size).toBe(2);
  });

  test('empty payload yields empty selection', () => {
    const sel = computeInitialSelection([]);
    expect(sel.size).toBe(0);
  });

  test('all-detected preselects all', () => {
    const sel = computeInitialSelection([
      { id: 'claude', label: 'Claude Code', detected: true },
      { id: 'vscode', label: 'VS Code', detected: true },
    ]);
    expect(sel.size).toBe(2);
  });

  test('none-detected preselects none', () => {
    const sel = computeInitialSelection([
      { id: 'claude', label: 'Claude Code', detected: false },
      { id: 'vscode', label: 'VS Code', detected: false },
    ]);
    expect(sel.size).toBe(0);
  });
});

describe('toggleSelectedId', () => {
  test('adds id when absent', () => {
    const next = toggleSelectedId(new Set<OkMcpWiringEditorId>(), 'claude');
    expect(next.has('claude')).toBe(true);
    expect(next.size).toBe(1);
  });

  test('removes id when present', () => {
    const prev = new Set<OkMcpWiringEditorId>(['claude']);
    const next = toggleSelectedId(prev, 'claude');
    expect(next.has('claude')).toBe(false);
    expect(next.size).toBe(0);
  });

  test('returns a new Set (does not mutate input — immutable-style)', () => {
    const prev = new Set<OkMcpWiringEditorId>(['claude']);
    const next = toggleSelectedId(prev, 'cursor');
    expect(prev.has('cursor')).toBe(false);
    expect(next.has('cursor')).toBe(true);
    expect(prev).not.toBe(next);
  });
});

describe('selectedIdsOrdered', () => {
  test('projects selection back into array preserving detection order', () => {
    const sel = new Set<OkMcpWiringEditorId>(['cursor', 'claude']);
    const out = selectedIdsOrdered(sel, sampleDetection);
    // Detection order is [claude, claude-desktop, cursor, vscode, windsurf, codex].
    // Projection keeps that order, dropping unselected entries.
    expect(out).toEqual(['claude', 'cursor']);
  });

  test('empty selection yields empty array', () => {
    const out = selectedIdsOrdered(new Set<OkMcpWiringEditorId>(), sampleDetection);
    expect(out).toEqual([]);
  });

  test('selected ids NOT in detection payload are dropped (defensive)', () => {
    const sel = new Set<OkMcpWiringEditorId>(['claude']);
    const truncated: readonly EditorDetection[] = [
      { id: 'vscode', label: 'VS Code', detected: false },
    ];
    const out = selectedIdsOrdered(sel, truncated);
    expect(out).toEqual([]);
  });

  test('all-selected yields full detection order', () => {
    const allIds = sampleDetection.map((d) => d.id);
    const sel = new Set<OkMcpWiringEditorId>(allIds);
    const out = selectedIdsOrdered(sel, sampleDetection);
    expect(out).toEqual(allIds);
  });
});

describe('McpConsentDialog module shape', () => {
  test('exports the component + the three pure helpers + ToastImpl type', () => {
    expect(typeof McpConsentDialog).toBe('function');
    expect(typeof computeInitialSelection).toBe('function');
    expect(typeof toggleSelectedId).toBe('function');
    expect(typeof selectedIdsOrdered).toBe('function');
    // ToastImpl is a type; no runtime export — this assertion just ensures
    // the import resolves at type-check time. The shape is exercised by the
    // toast injection contract below.
    const toastShape: ToastImpl = { error: () => {} };
    expect(typeof toastShape.error).toBe('function');
  });

  test('Pass 0 Critical #1: ToastImpl interface accepts a sonner-shaped error fn', () => {
    // The dialog's `toast` prop is typed `ToastImpl` so the production
    // `defaultToast` (which wraps `sonnerToast.error`) can be substituted in
    // tests by any object with `error(msg: string): void`. This contract test
    // pins the surface so a future refactor that adds methods (warning,
    // success) signals the change explicitly.
    const recorded: string[] = [];
    const toast: ToastImpl = {
      error: (msg) => {
        recorded.push(msg);
      },
    };
    toast.error('test message');
    expect(recorded).toEqual(['test message']);
  });

  // The dialog's onAdd / onSkip behavior — fire toast.error on `!result.ok`
  // and stay silent on success — is integration-tested via the US-010 Playwright
  // smoke. The bun-test layer covers the types + the helper math; the runtime
  // wiring is asserted end-to-end against a real DOM in mcp-wiring.e2e.ts.
  // Re-asserting in bun-test would require @testing-library/react which the
  // repo does not use (and which would re-implement the rendering already
  // exercised by Playwright).
  test('mock module-level usage check: toast.error is invocable from a Set-like context', () => {
    // Smoke that the ToastImpl shape composes through `mock()` for callers
    // that want to inject a spy.
    const spy = mock((_msg: string) => {});
    const toast: ToastImpl = { error: spy };
    toast.error('hello');
    expect(spy.mock.calls.length).toBe(1);
    expect(spy.mock.calls[0]).toEqual(['hello']);
  });

  test('Pass 1 Major #1: onAdd / onSkip must reset `busy` on !result.ok so retry is possible', () => {
    // Behavioral regression guard for Review Pass 1 Major #1. The store now
    // preserves `currentRequest` on `ok:false` / thrown rejections so the
    // dialog stays mounted for same-boot retry. But if onAdd/onSkip don't
    // reset `busy`, the Add button stays disabled and the user has no way
    // to retry — the dialog is mounted but unusable. Without @testing-
    // library/react a full mount-and-interact test isn't practical under
    // the repo convention, so read the source and assert the pattern is in
    // place. A future refactor that drops the setBusy(false) call fires
    // this test (instead of silently reintroducing the locked-UI bug).
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(join(import.meta.dir, 'McpConsentDialog.tsx'), 'utf8');
    // Both onAdd and onSkip must reset `busy` inside their `!result.ok`
    // branch. Match non-greedily so a formatting change (line break between
    // toast.error and setBusy) doesn't break the regression guard.
    const onAddBlock = source.match(/async function onAdd\(\)\s*\{[\s\S]*?\n\s\s\}/);
    const onSkipBlock = source.match(/async function onSkip\(\)\s*\{[\s\S]*?\n\s\s\}/);
    expect(onAddBlock).not.toBeNull();
    expect(onSkipBlock).not.toBeNull();
    expect(onAddBlock?.[0]).toContain('if (!result.ok)');
    expect(onAddBlock?.[0]).toContain('setBusy(false)');
    expect(onSkipBlock?.[0]).toContain('if (!result.ok)');
    expect(onSkipBlock?.[0]).toContain('setBusy(false)');
  });
});
