import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  formatTrashFailureDetail,
  type TrashFailedTarget,
  TrashFailureModal,
} from './TrashFailureModal';

const SRC = readFileSync(join(__dirname, 'TrashFailureModal.tsx'), 'utf8');

describe('TrashFailureModal — exports', () => {
  test('exports the modal component + detail formatter + types', () => {
    expect(typeof TrashFailureModal).toBe('function');
    expect(typeof formatTrashFailureDetail).toBe('function');
  });
});

describe('TrashFailureModal — VSCode-parity copy (FR20)', () => {
  test('title is a short noun phrase fit for DialogTitle leading-none', () => {
    expect(SRC).toMatch(/<DialogTitle>\s*Couldn't move to Trash\s*<\/DialogTitle>/);
  });

  test('description preserves VSCode question phrasing', () => {
    expect(SRC).toContain('Do you want to permanently delete instead?');
  });

  test('Delete Permanently button label present and exact', () => {
    expect(SRC).toContain("'Delete Permanently'");
  });

  test('Retry button label present and exact', () => {
    expect(SRC).toContain("'Retry'");
  });

  test('Cancel button label present and exact', () => {
    expect(SRC).toMatch(/>\s*Cancel\s*</);
  });
});

describe('TrashFailureModal — button wiring + ordering', () => {
  test('button order in source is Cancel, Retry, Delete Permanently (left → right via flex-row)', () => {
    const cancel = SRC.indexOf('data-testid="trash-failure-modal-cancel"');
    const retry = SRC.indexOf('data-testid="trash-failure-modal-retry"');
    const del = SRC.indexOf('data-testid="trash-failure-modal-delete-permanently"');
    expect(cancel).toBeGreaterThan(-1);
    expect(retry).toBeGreaterThan(cancel);
    expect(del).toBeGreaterThan(retry);
  });

  test('Delete Permanently button uses destructive variant', () => {
    const idx = SRC.indexOf('data-testid="trash-failure-modal-delete-permanently"');
    expect(idx).toBeGreaterThan(-1);
    const buttonOpen = SRC.lastIndexOf('<Button', idx);
    expect(buttonOpen).toBeGreaterThan(-1);
    const buttonBlock = SRC.slice(buttonOpen, idx);
    expect(buttonBlock).toContain('variant="destructive"');
  });

  test('Retry button uses outline variant', () => {
    const idx = SRC.indexOf('data-testid="trash-failure-modal-retry"');
    const buttonOpen = SRC.lastIndexOf('<Button', idx);
    const buttonBlock = SRC.slice(buttonOpen, idx);
    expect(buttonBlock).toContain('variant="outline"');
  });

  test('Cancel button uses outline variant (safety-hierarchy parity with sibling DeleteConfirmation)', () => {
    const idx = SRC.indexOf('data-testid="trash-failure-modal-cancel"');
    const buttonOpen = SRC.lastIndexOf('<Button', idx);
    const buttonBlock = SRC.slice(buttonOpen, idx);
    expect(buttonBlock).toContain('variant="outline"');
    expect(buttonBlock).toContain('font-mono uppercase');
  });

  test('Retry button has font-mono uppercase class (parity with destructive primary)', () => {
    const idx = SRC.indexOf('data-testid="trash-failure-modal-retry"');
    const buttonOpen = SRC.lastIndexOf('<Button', idx);
    const buttonBlock = SRC.slice(buttonOpen, idx);
    expect(buttonBlock).toContain('font-mono uppercase');
  });

  test('each button routes to the matching callback prop', () => {
    const cancelIdx = SRC.indexOf('data-testid="trash-failure-modal-cancel"');
    expect(SRC.slice(SRC.lastIndexOf('<Button', cancelIdx), cancelIdx)).toContain(
      'onClick={onCancel}',
    );

    const retryIdx = SRC.indexOf('data-testid="trash-failure-modal-retry"');
    expect(SRC.slice(SRC.lastIndexOf('<Button', retryIdx), retryIdx)).toContain(
      'onClick={onRetry}',
    );

    const delIdx = SRC.indexOf('data-testid="trash-failure-modal-delete-permanently"');
    expect(SRC.slice(SRC.lastIndexOf('<Button', delIdx), delIdx)).toContain(
      'onClick={onDeletePermanently}',
    );
  });

  test('all three buttons disable while isSubmitting', () => {
    const occurrences = SRC.match(/disabled=\{isSubmitting\}/g) ?? [];
    expect(occurrences.length).toBe(3);
  });

  test('Retry button shows Retrying spinner copy when isSubmitting', () => {
    expect(SRC).toMatch(/animate-spin"\s*\/>\s*Retrying/);
  });

  test('Delete Permanently button shows Deleting spinner copy when isSubmitting', () => {
    expect(SRC).toMatch(/animate-spin"\s*\/>\s*Deleting/);
  });
});

describe('TrashFailureModal — multi-target aggregation', () => {
  test('renders a DialogBody list when failedTargets.length > 1', () => {
    expect(SRC).toContain('const isMulti = failedTargets.length > 1;');
    expect(SRC).toMatch(/\{isMulti \?\s*\(\s*<DialogBody>/);
  });

  test('maps each failedTarget into a list item with stable key + testid', () => {
    expect(SRC).toContain('failedTargets.map((target)');
    expect(SRC).toContain('key={target.path}');
    expect(SRC).toContain('data-testid="trash-failure-modal-target"');
  });

  test('single-target branch renders inline description (no DialogBody list)', () => {
    expect(SRC).toMatch(/Could not move "\$\{displayTargetName\(only\)\}"/);
  });

  test('Delete Permanently applies to the aggregated list (caller resolves; modal is pure)', () => {
    expect(SRC).not.toMatch(/onDeletePermanently\(target/);
  });
});

describe('TrashFailureModal — detail formatting', () => {
  test('formats reason + detail when detail present', () => {
    const target: TrashFailedTarget = {
      kind: 'file',
      path: 'notes/foo.md',
      name: 'foo.md',
      reason: 'permission-denied',
      detail: 'Operation not permitted',
    };
    expect(formatTrashFailureDetail(target)).toBe(
      'Reason: Permission denied (Operation not permitted)',
    );
  });

  test('formats reason without detail when detail absent', () => {
    const target: TrashFailedTarget = {
      kind: 'file',
      path: 'foo.md',
      name: 'foo.md',
      reason: 'not-found',
    };
    expect(formatTrashFailureDetail(target)).toBe('Reason: File not found');
  });

  test('maps every TrashFailureReason to a non-empty user-facing label', () => {
    const reasons = ['not-found', 'permission-denied', 'system-error', 'path-escape'] as const;
    for (const reason of reasons) {
      const out = formatTrashFailureDetail({
        kind: 'file',
        path: 'x.md',
        name: 'x.md',
        reason,
      });
      expect(out.startsWith('Reason: ')).toBe(true);
      expect(out.length).toBeGreaterThan('Reason: '.length);
    }
  });

  test('appends slash to folder display name (single-target description)', () => {
    expect(SRC).toContain("target.kind === 'folder'");
    expect(SRC).toMatch(/target\.name\}\/`/);
  });
});

describe('TrashFailureModal — shadcn Dialog primitives', () => {
  test('imports DialogContent / Title / Description / Body / Footer from shared dialog primitive', () => {
    expect(SRC).toMatch(/from '@\/components\/ui\/dialog'/);
    expect(SRC).toContain('DialogBody');
    expect(SRC).toContain('DialogContent');
    expect(SRC).toContain('DialogDescription');
    expect(SRC).toContain('DialogFooter');
    expect(SRC).toContain('DialogTitle');
  });

  test('uses Button primitive (sibling DeleteConfirmationDialog convention)', () => {
    expect(SRC).toMatch(/from '@\/components\/ui\/button'/);
  });
});

describe('TrashFailureModal — TrashFailureReason union', () => {
  test('union matches the IPC TrashItemReason from packages/desktop/src/main/ipc-handlers.ts', () => {
    expect(SRC).toContain(
      "type TrashFailureReason = 'not-found' | 'permission-denied' | 'system-error' | 'path-escape';",
    );
  });

  test('coerceTrashFailureReason coerces unknown IPC reasons to system-error (R7 trust boundary)', () => {
    expect(SRC).toMatch(
      /export function coerceTrashFailureReason\(reason: unknown\): TrashFailureReason/,
    );
    expect(SRC).toContain('TRASH_FAILURE_REASONS');
    expect(SRC).toMatch(/: 'system-error'/);
  });

  test('drift warning JSDoc explicitly names the three sibling bridge surfaces to keep in lockstep', () => {
    expect(SRC).toContain('DRIFT WARNING');
    expect(SRC).toContain('packages/desktop/src/shared/bridge-contract.ts');
    expect(SRC).toContain('packages/core/src/desktop-bridge.ts');
    expect(SRC).toContain('packages/app/src/lib/desktop-bridge-types.ts');
  });
});
