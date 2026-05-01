
import { describe, expect, mock, test } from 'bun:test';
import { setTimeout as wait } from 'node:timers/promises';
import type { HandoffOutcome, HandoffPayload, HandoffTarget } from '@inkeep/open-knowledge-core';
import type {
  HandoffDispatchDeps,
  HandoffDispatchInput,
  ToastAction,
  ToastSurface,
} from './useHandoffDispatch';

function sampleInput(overrides: Partial<HandoffDispatchInput> = {}): HandoffDispatchInput {
  return {
    docContext: { relativePath: 'specs/foo/SPEC.md' },
    projectDir: '/Users/andrew/Documents/code/open-knowledge',
    docPath: '/Users/andrew/Documents/code/open-knowledge/specs/foo/SPEC.md',
    ...overrides,
  };
}

interface ErrorToastCall {
  readonly message: string;
  readonly action?: ToastAction;
}

interface RecordingToast extends ToastSurface {
  readonly successCalls: string[];
  readonly errorCalls: ErrorToastCall[];
}

function recordingToast(): RecordingToast {
  const successCalls: string[] = [];
  const errorCalls: ErrorToastCall[] = [];
  return {
    successCalls,
    errorCalls,
    success(message) {
      successCalls.push(message);
    },
    error(message, options) {
      errorCalls.push({ message, action: options?.action });
    },
  };
}

function buildDeps(
  overrides: Partial<HandoffDispatchDeps> = {},
): HandoffDispatchDeps & { toast: RecordingToast } {
  const toast = recordingToast();
  const defaults: HandoffDispatchDeps = {
    dispatchHandoff: mock(async (_payload: HandoffPayload) => ({ ok: true }) as HandoffOutcome),
    recordHandoff: mock(async (_line) => {}),
    toast,
    now: () => new Date('2026-04-22T03:00:00.000Z'),
    isElectronHost: () => true,
    getDisplayName: (target: HandoffTarget) =>
      target === 'claude-cowork'
        ? 'Claude Cowork'
        : target === 'claude-code'
          ? 'Claude Code'
          : target === 'codex'
            ? 'Codex'
            : 'Cursor',
    ensureCoworkSkillInstalled: mock(async () => ({ kind: 'already-installed' }) as const),
  };
  return { ...defaults, ...overrides, toast };
}

describe('useHandoffDispatch module surface', () => {
  test('exports the hook + helper + deps factory + copy helpers', async () => {
    const mod = await import('./useHandoffDispatch');
    expect(typeof mod.useHandoffDispatch).toBe('function');
    expect(typeof mod.runHandoffDispatch).toBe('function');
    expect(typeof mod.defaultHandoffDispatchDeps).toBe('function');
    expect(typeof mod.successToastMessage).toBe('function');
    expect(typeof mod.errorToastMessage).toBe('function');
    expect(typeof mod.getDisplayNameDefault).toBe('function');
    expect(typeof mod.isElectronHostDefault).toBe('function');
  });
});

describe('successToastMessage / errorToastMessage — exact copy', () => {
  test('success copy matches spec §5.1 E5a', async () => {
    const { successToastMessage } = await import('./useHandoffDispatch');
    expect(successToastMessage('Claude Cowork')).toBe('Opened in Claude Cowork.');
    expect(successToastMessage('Codex')).toBe('Opened in Codex.');
  });

  test('error copy uses plain ASCII apostrophe + em-dash on first attempt', async () => {
    const { errorToastMessage } = await import('./useHandoffDispatch');
    expect(errorToastMessage('Cursor')).toBe("Couldn't reach Cursor — try again?");
    expect(errorToastMessage('Cursor', 1)).toBe("Couldn't reach Cursor — try again?");
  });

  test('error copy escalates on attempt 2 (still-not-reached shape)', async () => {
    const { errorToastMessage } = await import('./useHandoffDispatch');
    expect(errorToastMessage('Cursor', 2)).toBe("Still couldn't reach Cursor — try one more time?");
  });

  test('error copy on final attempt omits the "try again?" question and names a retry delay', async () => {
    const { errorToastMessage, MAX_DISPATCH_ATTEMPTS } = await import('./useHandoffDispatch');
    expect(errorToastMessage('Cursor', MAX_DISPATCH_ATTEMPTS)).toBe(
      "Couldn't reach Cursor — please try again later.",
    );
  });

  test('retryActionLabel returns Retry / Try one more time / null across attempts', async () => {
    const { retryActionLabel, MAX_DISPATCH_ATTEMPTS } = await import('./useHandoffDispatch');
    expect(MAX_DISPATCH_ATTEMPTS).toBe(3);
    expect(retryActionLabel(1)).toBe('Retry');
    expect(retryActionLabel(2)).toBe('Try one more time');
    expect(retryActionLabel(3)).toBeNull();
    expect(retryActionLabel(4)).toBeNull();
  });
});

describe('getDisplayNameDefault — KNOWN_TARGETS lookup', () => {
  test('maps each v0 target id to its SPEC §7.2 display name', async () => {
    const { getDisplayNameDefault } = await import('./useHandoffDispatch');
    expect(getDisplayNameDefault('claude-cowork')).toBe('Claude Cowork');
    expect(getDisplayNameDefault('claude-code')).toBe('Claude Code');
    expect(getDisplayNameDefault('codex')).toBe('Codex');
    expect(getDisplayNameDefault('cursor')).toBe('Cursor');
  });

  test('falls back to target id for an unknown cast value', async () => {
    const { getDisplayNameDefault } = await import('./useHandoffDispatch');
    expect(getDisplayNameDefault('zed' as HandoffTarget)).toBe('zed');
  });
});

describe('isElectronHostDefault — host classifier', () => {
  test('returns false when no windowLike is supplied in a non-DOM context', async () => {
    const { isElectronHostDefault } = await import('./useHandoffDispatch');
    expect(isElectronHostDefault(undefined)).toBe(false);
  });

  test('returns false when okDesktop is absent', async () => {
    const { isElectronHostDefault } = await import('./useHandoffDispatch');
    expect(isElectronHostDefault({})).toBe(false);
  });

  test('returns true when okDesktop is any non-nullish value', async () => {
    const { isElectronHostDefault } = await import('./useHandoffDispatch');
    expect(isElectronHostDefault({ okDesktop: { shell: {} } })).toBe(true);
  });
});

describe('runHandoffDispatch — success path', () => {
  test('renders success toast and records one ok stats line', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const deps = buildDeps();
    const input = sampleInput();

    const outcome = await runHandoffDispatch('claude-cowork', input, deps);

    expect(outcome).toEqual({ ok: true });
    expect(deps.toast.successCalls).toEqual(['Opened in Claude Cowork.']);
    expect(deps.toast.errorCalls).toEqual([]);
    expect(deps.recordHandoff).toHaveBeenCalledTimes(1);
    expect(deps.recordHandoff).toHaveBeenCalledWith({
      target: 'claude-cowork',
      host: 'electron',
      outcome: 'ok',
      ts: '2026-04-22T03:00:00.000Z',
    });
  });

  test('passes a fully-formed HandoffPayload (target + paths + composePrompt) to dispatchHandoff', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const deps = buildDeps();
    const input = sampleInput({
      docContext: { relativePath: 'specs/2026-04-21-open-in-agent-desktop/SPEC.md' },
      projectDir: '/tmp/demo-project',
      docPath: '/tmp/demo-project/specs/2026-04-21-open-in-agent-desktop/SPEC.md',
    });

    await runHandoffDispatch('codex', input, deps);

    expect(deps.dispatchHandoff).toHaveBeenCalledTimes(1);
    const [payload] = (deps.dispatchHandoff as ReturnType<typeof mock>).mock.calls[0] as [
      HandoffPayload,
    ];
    expect(payload.target).toBe('codex');
    expect(payload.projectDir).toBe('/tmp/demo-project');
    expect(payload.docPath).toBe(
      '/tmp/demo-project/specs/2026-04-21-open-in-agent-desktop/SPEC.md',
    );
    expect(payload.prompt).toBe(
      'Open Knowledge doc: specs/2026-04-21-open-in-agent-desktop/SPEC.md. Use the open-knowledge MCP tool for backlinks and related context.',
    );
  });

  test('records host="web" when isElectronHost() is false', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const deps = buildDeps({ isElectronHost: () => false });

    await runHandoffDispatch('codex', sampleInput(), deps);

    expect(deps.recordHandoff).toHaveBeenCalledTimes(1);
    expect(deps.recordHandoff).toHaveBeenCalledWith({
      target: 'codex',
      host: 'web',
      outcome: 'ok',
      ts: '2026-04-22T03:00:00.000Z',
    });
  });
});

describe('runHandoffDispatch — failure path', () => {
  test('renders error toast with Retry action and records error stats line', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const deps = buildDeps({
      dispatchHandoff: mock(
        async (_p: HandoffPayload) => ({ ok: false, reason: 'not-installed' }) as HandoffOutcome,
      ),
    });

    const outcome = await runHandoffDispatch('cursor', sampleInput(), deps);

    expect(outcome).toEqual({ ok: false, reason: 'not-installed' });
    expect(deps.toast.successCalls).toEqual([]);
    expect(deps.toast.errorCalls).toHaveLength(1);
    const errorCall = deps.toast.errorCalls[0];
    expect(errorCall).toBeDefined();
    if (!errorCall) throw new Error('unreachable'); // narrow for TS
    expect(errorCall.message).toBe("Couldn't reach Cursor — try again?");
    expect(errorCall.action?.label).toBe('Retry');
    expect(typeof errorCall.action?.onClick).toBe('function');

    expect(deps.recordHandoff).toHaveBeenCalledTimes(1);
    expect(deps.recordHandoff).toHaveBeenCalledWith({
      target: 'cursor',
      host: 'electron',
      outcome: 'error',
      ts: '2026-04-22T03:00:00.000Z',
      reason: 'not-installed',
    });
  });

  test('retry action re-invokes dispatchHandoff with the same payload', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const dispatch = mock(async (_p: HandoffPayload) => ({ ok: true }) as HandoffOutcome);
    let firstCall = true;
    (
      dispatch as unknown as { mockImplementation: (fn: typeof dispatch) => void }
    ).mockImplementation?.((async (_p: HandoffPayload) => {
      if (firstCall) {
        firstCall = false;
        return { ok: false, reason: 'not-installed' } as HandoffOutcome;
      }
      return { ok: true } as HandoffOutcome;
    }) as typeof dispatch);

    const deps = buildDeps({ dispatchHandoff: dispatch });
    const input = sampleInput();

    const first = await runHandoffDispatch('cursor', input, deps);
    expect(first.ok).toBe(false);
    expect(deps.recordHandoff).toHaveBeenCalledTimes(1);

    const action = deps.toast.errorCalls[0]?.action;
    expect(action).toBeDefined();
    action?.onClick();

    await wait(0);

    expect(dispatch).toHaveBeenCalledTimes(2);
    const firstPayload = (dispatch as ReturnType<typeof mock>).mock.calls[0]?.[0] as HandoffPayload;
    const secondPayload = (dispatch as ReturnType<typeof mock>).mock
      .calls[1]?.[0] as HandoffPayload;
    expect(secondPayload).toEqual(firstPayload);

    expect(deps.recordHandoff).toHaveBeenCalledTimes(2);
    expect(deps.toast.successCalls).toEqual(['Opened in Cursor.']);
  });

  test('third consecutive failure drops the Retry action (Review M5 bounded retry)', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const dispatch = mock(
      async (_p: HandoffPayload) => ({ ok: false, reason: 'dispatch-error' }) as HandoffOutcome,
    );
    const deps = buildDeps({ dispatchHandoff: dispatch });
    const input = sampleInput();

    await runHandoffDispatch('cursor', input, deps);
    expect(deps.toast.errorCalls).toHaveLength(1);
    expect(deps.toast.errorCalls[0]?.message).toBe("Couldn't reach Cursor — try again?");
    expect(deps.toast.errorCalls[0]?.action?.label).toBe('Retry');

    const firstAction = deps.toast.errorCalls[0]?.action;
    expect(firstAction).toBeDefined();
    firstAction?.onClick();
    await wait(0);
    expect(deps.toast.errorCalls).toHaveLength(2);
    expect(deps.toast.errorCalls[1]?.message).toBe(
      "Still couldn't reach Cursor — try one more time?",
    );
    expect(deps.toast.errorCalls[1]?.action?.label).toBe('Try one more time');

    const secondAction = deps.toast.errorCalls[1]?.action;
    expect(secondAction).toBeDefined();
    secondAction?.onClick();
    await wait(0);
    expect(deps.toast.errorCalls).toHaveLength(3);
    expect(deps.toast.errorCalls[2]?.message).toBe(
      "Couldn't reach Cursor — please try again later.",
    );
    expect(deps.toast.errorCalls[2]?.action).toBeUndefined();

    expect(deps.recordHandoff).toHaveBeenCalledTimes(3);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });

  test('web-host-cursor-unsupported reason flows through to telemetry + toast', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const deps = buildDeps({
      dispatchHandoff: mock(
        async (_p: HandoffPayload) =>
          ({
            ok: false,
            reason: 'web-host-cursor-unsupported',
          }) as HandoffOutcome,
      ),
      isElectronHost: () => false,
    });

    await runHandoffDispatch('cursor', sampleInput(), deps);

    expect(deps.recordHandoff).toHaveBeenCalledWith({
      target: 'cursor',
      host: 'web',
      outcome: 'error',
      ts: '2026-04-22T03:00:00.000Z',
      reason: 'web-host-cursor-unsupported',
    });
    expect(deps.toast.errorCalls[0]?.message).toBe("Couldn't reach Cursor — try again?");
  });
});

describe('defaultHandoffDispatchDeps — production wiring', () => {
  test('returns a full deps object with every slot populated', async () => {
    const { defaultHandoffDispatchDeps } = await import('./useHandoffDispatch');
    const deps = defaultHandoffDispatchDeps();
    expect(typeof deps.dispatchHandoff).toBe('function');
    expect(typeof deps.recordHandoff).toBe('function');
    expect(typeof deps.toast.success).toBe('function');
    expect(typeof deps.toast.error).toBe('function');
    expect(deps.now()).toBeInstanceOf(Date);
    expect(typeof deps.isElectronHost()).toBe('boolean');
    expect(deps.getDisplayName('claude-cowork')).toBe('Claude Cowork');
    expect(typeof deps.ensureCoworkSkillInstalled).toBe('function');
  });
});

describe('runHandoffDispatch — Cowork install gate', () => {
  test('first click + bridge ran: shows install toast and skips URL dispatch', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const deps = buildDeps({
      ensureCoworkSkillInstalled: mock(
        async () => ({ kind: 'installed-now', path: '/tmp/openknowledge.skill' }) as const,
      ),
    });

    const outcome = await runHandoffDispatch('claude-cowork', sampleInput(), deps);

    expect(outcome).toEqual({ ok: true });
    expect(deps.dispatchHandoff).not.toHaveBeenCalled();
    expect(deps.recordHandoff).not.toHaveBeenCalled();
    expect(deps.toast.successCalls).toEqual([
      'Open Knowledge skill saved. Upload it in Claude Desktop, then click Cowork again.',
    ]);
  });

  test('install-failed: surfaces error toast and returns dispatch-error outcome', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const deps = buildDeps({
      ensureCoworkSkillInstalled: mock(
        async () =>
          ({
            kind: 'install-failed',
            reason: 'open-failed',
            message: 'Claude Desktop not found',
          }) as const,
      ),
    });

    const outcome = await runHandoffDispatch('claude-cowork', sampleInput(), deps);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('dispatch-error');
      expect(outcome.detail).toContain('install-failed');
    }
    expect(deps.dispatchHandoff).not.toHaveBeenCalled();
    expect(deps.toast.errorCalls[0]?.message).toBe(
      "Couldn't install Open Knowledge skill — Claude Desktop not found",
    );
  });

  test('already-installed: falls through to URL dispatch (default test path)', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const deps = buildDeps(); // default ensureCoworkSkillInstalled → already-installed

    await runHandoffDispatch('claude-cowork', sampleInput(), deps);

    expect(deps.dispatchHandoff).toHaveBeenCalledTimes(1);
    expect(deps.toast.successCalls).toEqual(['Opened in Claude Cowork.']);
  });

  test('host-unsupported (web): falls through to URL dispatch unchanged', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const deps = buildDeps({
      isElectronHost: () => false,
      ensureCoworkSkillInstalled: mock(async () => ({ kind: 'host-unsupported' }) as const),
    });

    await runHandoffDispatch('claude-cowork', sampleInput(), deps);

    expect(deps.dispatchHandoff).toHaveBeenCalledTimes(1);
    expect(deps.toast.successCalls).toEqual(['Opened in Claude Cowork.']);
  });

  test('non-Cowork target: install gate is never consulted', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const ensureSpy = mock(async () => ({ kind: 'already-installed' }) as const);
    const deps = buildDeps({ ensureCoworkSkillInstalled: ensureSpy });

    await runHandoffDispatch('codex', sampleInput(), deps);
    await runHandoffDispatch('claude-code', sampleInput(), deps);
    await runHandoffDispatch('cursor', sampleInput(), deps);

    expect(ensureSpy).not.toHaveBeenCalled();
  });

  test('retry attempt skips the install gate (only first attempt invokes it)', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const ensureSpy = mock(async () => ({ kind: 'already-installed' }) as const);
    const deps = buildDeps({ ensureCoworkSkillInstalled: ensureSpy });

    await runHandoffDispatch('claude-cowork', sampleInput(), deps, 2);

    expect(ensureSpy).not.toHaveBeenCalled();
    expect(deps.dispatchHandoff).toHaveBeenCalledTimes(1);
  });

  test('install gate throws: surfaces error toast + dispatch-error outcome (no unhandled rejection)', async () => {
    const { runHandoffDispatch } = await import('./useHandoffDispatch');
    const deps = buildDeps({
      ensureCoworkSkillInstalled: mock(async () => {
        throw new Error('IPC channel closed');
      }),
    });

    const outcome = await runHandoffDispatch('claude-cowork', sampleInput(), deps);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('dispatch-error');
      expect(outcome.detail).toContain('install-error');
      expect(outcome.detail).toContain('IPC channel closed');
    }
    expect(deps.dispatchHandoff).not.toHaveBeenCalled();
    expect(deps.toast.errorCalls[0]?.message).toBe(
      "Couldn't install Open Knowledge skill — IPC channel closed",
    );
  });
});

describe('buildHandoffInput — shared surface helper (US-011)', () => {
  test('null docName returns null', async () => {
    const { buildHandoffInput } = await import('./useHandoffDispatch');
    expect(
      buildHandoffInput({
        docName: null,
        workspace: { contentDir: '/repo', pathSeparator: '/' },
      }),
    ).toBeNull();
  });

  test('null workspace returns null', async () => {
    const { buildHandoffInput } = await import('./useHandoffDispatch');
    expect(buildHandoffInput({ docName: 'specs/foo/SPEC', workspace: null })).toBeNull();
  });

  test('POSIX: composes relativePath + projectDir + docPath', async () => {
    const { buildHandoffInput } = await import('./useHandoffDispatch');
    const input = buildHandoffInput({
      docName: 'specs/foo/SPEC',
      workspace: { contentDir: '/Users/andrew/repo', pathSeparator: '/' },
    });
    expect(input).toEqual({
      docContext: { relativePath: 'specs/foo/SPEC.md' },
      projectDir: '/Users/andrew/repo',
      docPath: '/Users/andrew/repo/specs/foo/SPEC.md',
    });
  });

  test('Windows: rewrites relativePath slashes to backslash for docPath', async () => {
    const { buildHandoffInput } = await import('./useHandoffDispatch');
    const input = buildHandoffInput({
      docName: 'specs/foo/SPEC',
      workspace: { contentDir: 'C:\\repo', pathSeparator: '\\' },
    });
    expect(input?.docContext.relativePath).toBe('specs/foo/SPEC.md');
    expect(input?.projectDir).toBe('C:\\repo');
    expect(input?.docPath).toBe('C:\\repo\\specs\\foo\\SPEC.md');
  });

  test('empty-string docName is treated as no active doc (null return)', async () => {
    const { buildHandoffInput } = await import('./useHandoffDispatch');
    expect(
      buildHandoffInput({
        docName: '',
        workspace: { contentDir: '/repo', pathSeparator: '/' },
      }),
    ).toBeNull();
  });
});
