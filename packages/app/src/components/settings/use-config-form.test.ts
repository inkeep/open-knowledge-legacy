/**
 * Unit tests for the binding-harness pure helpers (`applyExternalUpdate`,
 * `runCommit`, `pickFirstIssueForPath`). The hook itself (`useConfigForm`)
 * is glue — its full stateful behavior is exercised at the Settings-pane
 * level (Playwright E2E + source-level guards in `SettingsPane.test.ts`).
 *
 * Repo convention (no @testing-library/react, no happy-dom): mock the
 * `ConfigBinding` system boundary; structure logic so it can be tested
 * against a `Pick<UseFormReturn>`-shaped mock instead of a live `useForm`.
 *
 * The single integration-style assertion is the keepDirtyValues semantic:
 * `applyExternalUpdate` must call `form.reset(next, { keepDirtyValues:
 * true, keepDirty: true, keepTouched: true })` — that exact options
 * triple is what `bindConfigDoc.subscribe → form.reset` relies on for the
 * "external update lands on non-dirty fields, leaves dirty fields alone"
 * contract (D65 LOCKED).
 */

import { describe, expect, mock, test } from 'bun:test';
import type {
  Config,
  ConfigBindingPatchResult,
  ConfigPatch,
  ConfigValidationError,
} from '@inkeep/open-knowledge-core';
import {
  type ApplyExternalUpdateForm,
  applyExternalUpdate,
  pickFirstIssueForPath,
  type RunCommitBinding,
  type RunCommitForm,
  runCommit,
} from './use-config-form';

// ---------------------------------------------------------------------------
// applyExternalUpdate — bridge contract for binding.subscribe → form.reset
// ---------------------------------------------------------------------------

describe('applyExternalUpdate', () => {
  test('calls form.reset with keepDirtyValues + keepDirty + keepTouched', () => {
    const reset = mock();
    const form: ApplyExternalUpdateForm<Config> = {
      reset: reset as unknown as ApplyExternalUpdateForm<Config>['reset'],
    };
    const next = { mcp: { autoStart: false } } as Config;

    applyExternalUpdate(form, next);

    expect(reset).toHaveBeenCalledTimes(1);
    const call = reset.mock.calls[0];
    expect(call?.[0]).toBe(next);
    expect(call?.[1]).toEqual({
      keepDirtyValues: true,
      keepDirty: true,
      keepTouched: true,
    });
  });
});

// ---------------------------------------------------------------------------
// runCommit — per-field commit + error mirroring
// ---------------------------------------------------------------------------

interface MockedRunCommitForm extends RunCommitForm<Config> {
  reset?: never;
}

function createMockForm(getValuesImpl: (name: string) => unknown): {
  form: MockedRunCommitForm;
  setError: ReturnType<typeof mock>;
  clearErrors: ReturnType<typeof mock>;
  getValues: ReturnType<typeof mock>;
} {
  const setError = mock();
  const clearErrors = mock();
  const getValues = mock(getValuesImpl);
  const form: MockedRunCommitForm = {
    getValues: getValues as unknown as MockedRunCommitForm['getValues'],
    setError: setError as unknown as MockedRunCommitForm['setError'],
    clearErrors: clearErrors as unknown as MockedRunCommitForm['clearErrors'],
  };
  return { form, setError, clearErrors, getValues };
}

function createMockBinding(patchImpl: (patch: ConfigPatch) => ConfigBindingPatchResult): {
  binding: RunCommitBinding;
  patch: ReturnType<typeof mock>;
} {
  const patch = mock(patchImpl);
  const binding: RunCommitBinding = {
    patch: patch as unknown as RunCommitBinding['patch'],
  };
  return { binding, patch };
}

describe('runCommit — success path', () => {
  test('builds deep-partial patch from name + value, calls binding.patch, returns true', () => {
    const { form, clearErrors } = createMockForm(() => 100);
    const { binding, patch } = createMockBinding(() => ({
      ok: true,
      effective: { mcp: { tools: { search: { maxResults: 100 } } } } as unknown as Config,
      appliedPaths: ['mcp.tools.search.maxResults'],
    }));

    const result = runCommit(form, binding, 'mcp.tools.search.maxResults');

    expect(result).toBe(true);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0]?.[0]).toEqual({
      mcp: { tools: { search: { maxResults: 100 } } },
    });
    expect(clearErrors).toHaveBeenCalledWith('mcp.tools.search.maxResults');
  });

  test('clears the field-level error after a successful patch', () => {
    const { form, clearErrors } = createMockForm(() => 'localhost');
    const { binding } = createMockBinding(() => ({
      ok: true,
      effective: {} as Config,
      appliedPaths: ['server.host'],
    }));

    runCommit(form, binding, 'server.host');

    expect(clearErrors).toHaveBeenCalledTimes(1);
    expect(clearErrors).toHaveBeenCalledWith('server.host');
  });
});

describe('runCommit — failure path', () => {
  test('mirrors path-matched SCHEMA_INVALID issue into form.setError, returns false', () => {
    const { form, setError, clearErrors } = createMockForm(() => 'fast');
    const error: ConfigValidationError = {
      code: 'SCHEMA_INVALID',
      issues: [
        {
          path: ['mcp', 'tools', 'search', 'maxResults'],
          message: 'Expected number, received string',
          issueCode: 'invalid_type',
        },
      ],
    };
    const { binding } = createMockBinding(() => ({ ok: false, error }));

    const result = runCommit(form, binding, 'mcp.tools.search.maxResults');

    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledTimes(1);
    const [name, errArg] = setError.mock.calls[0] ?? [];
    expect(name).toBe('mcp.tools.search.maxResults');
    expect(errArg).toMatchObject({
      type: 'config-binding',
      message: 'Expected number, received string',
    });
    expect(clearErrors).not.toHaveBeenCalled();
  });

  test('falls back to humanFormat when no SCHEMA_INVALID issue path matches the field name', () => {
    const { form, setError } = createMockForm(() => 'localhost');
    // Generic WRITE_ERROR (no path-keyed issues) — humanFormat fallback
    // must produce a non-empty message.
    const error: ConfigValidationError = {
      code: 'WRITE_ERROR',
      detail: 'EACCES: permission denied',
    };
    const { binding } = createMockBinding(() => ({ ok: false, error }));

    const result = runCommit(form, binding, 'server.host');

    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledTimes(1);
    const errArg = setError.mock.calls[0]?.[1] as { message?: string } | undefined;
    expect(errArg?.message).toBeDefined();
    expect(errArg?.message).toContain('EACCES');
  });
});

// ---------------------------------------------------------------------------
// pickFirstIssueForPath — message selection contract
// ---------------------------------------------------------------------------

describe('pickFirstIssueForPath', () => {
  test('returns the issue.message when an issue path matches the field name', () => {
    const error: ConfigValidationError = {
      code: 'SCHEMA_INVALID',
      issues: [
        {
          path: ['server', 'host'],
          message: 'Bad host string',
          issueCode: 'invalid_type',
        },
        {
          path: ['mcp', 'autoStart'],
          message: 'Expected boolean',
          issueCode: 'invalid_type',
        },
      ],
    };
    expect(pickFirstIssueForPath(error, 'mcp.autoStart')).toBe('Expected boolean');
    expect(pickFirstIssueForPath(error, 'server.host')).toBe('Bad host string');
  });

  test('falls back to humanFormat for SCHEMA_INVALID with no matching path', () => {
    const error: ConfigValidationError = {
      code: 'SCHEMA_INVALID',
      issues: [
        {
          path: ['preview', 'baseUrl'],
          message: 'invalid url',
          issueCode: 'invalid_string',
        },
      ],
    };
    const out = pickFirstIssueForPath(error, 'server.host');
    // humanFormat for SCHEMA_INVALID renders the full multi-line summary —
    // assert it isn't the bare path-matched message (which doesn't exist
    // for `server.host`) and isn't empty.
    expect(out).not.toBe('invalid url');
    expect(out.length).toBeGreaterThan(0);
  });

  test('falls back to humanFormat for non-SCHEMA_INVALID errors', () => {
    const error: ConfigValidationError = {
      code: 'YAML_PARSE',
      detail: 'unexpected token at line 5',
    };
    const out = pickFirstIssueForPath(error, 'mcp.autoStart');
    expect(out).toContain('unexpected token at line 5');
  });

  test('handles forward-compat tail variant by falling back to humanFormat', () => {
    const error = {
      code: 'FUTURE_ERROR_CODE',
      message: 'something the current client does not know about',
    } as unknown as ConfigValidationError;
    const out = pickFirstIssueForPath(error, 'server.host');
    expect(out).toContain('something the current client does not know about');
  });
});

// ---------------------------------------------------------------------------
// Smoke test for the hook's exported interface — the hook function itself
// can't be invoked outside a render context (RHF requires it), so we
// verify it's a function and the typed result names match the contract.
// ---------------------------------------------------------------------------

describe('useConfigForm module shape', () => {
  test('exports useConfigForm as a function', async () => {
    const mod = await import('./use-config-form');
    expect(typeof mod.useConfigForm).toBe('function');
    expect(typeof mod.applyExternalUpdate).toBe('function');
    expect(typeof mod.runCommit).toBe('function');
    expect(typeof mod.pickFirstIssueForPath).toBe('function');
  });
});
