/**
 * Binding harness hook — owns the `useForm<Config>` instance + the
 * `binding.subscribe → form.reset({keepDirtyValues:true})` bridge that
 * merges external Y.Text updates into form state without stomping the
 * user's in-progress edits.
 *
 * Resolver-less per spec D64 (LOCKED): `bindConfigDoc.patch` is the single
 * L1 safeParse gate; per-field rejections mirror via `form.setError` from
 * the rejection branch in `commitField`. `keepDirtyValues: true` is RHF's
 * native semantic for "remote updates land on non-dirty fields, leave
 * dirty fields alone" (D65 LOCKED).
 *
 * The pure helpers (`applyExternalUpdate`, `runCommit`,
 * `pickFirstIssueForPath`) are exported so unit tests exercise them
 * against a mock `ConfigBinding` (system boundary) without engaging a
 * React render context — repo convention is "no @testing-library/react,
 * no happy-dom". Stateful hook behavior is exercised at the Settings-pane
 * level via Playwright E2E.
 */

import {
  type Config,
  type ConfigBinding,
  type ConfigBindingPatchResult,
  type ConfigIssue,
  type ConfigPatch,
  type ConfigValidationError,
  humanFormat,
  isKnownConfigError,
} from '@inkeep/open-knowledge-core';
import { useEffect } from 'react';
import { type FieldPath, type UseFormReturn, useForm } from 'react-hook-form';
import { buildPatch } from './schema-walker';

interface UseConfigFormResult {
  form: UseFormReturn<Config>;
  commitField: (name: FieldPath<Config>) => boolean;
}

export function useConfigForm(binding: ConfigBinding): UseConfigFormResult {
  // Resolver-less per D64 — bindConfigDoc.patch is the single L1 safeParse.
  const form = useForm<Config>({
    defaultValues: binding.current() as Config,
    mode: 'onBlur',
  });

  useEffect(() => {
    return binding.subscribe((next) => {
      applyExternalUpdate(form, next);
    });
  }, [binding, form]);

  const commitField = (name: FieldPath<Config>): boolean => runCommit(form, binding, name);

  return { form, commitField };
}

// ---------------------------------------------------------------------------
// Pure-logic helpers — testable without a React render context.
// ---------------------------------------------------------------------------

/** Subset of `UseFormReturn` consumed by `applyExternalUpdate`. */
export type ApplyExternalUpdateForm<T extends Config = Config> = Pick<UseFormReturn<T>, 'reset'>;

/**
 * Bridge external Y.Text updates into form state. `keepDirtyValues: true`
 * leaves user-typed-but-uncommitted values intact while non-dirty fields
 * absorb the remote value.
 */
export function applyExternalUpdate<T extends Config = Config>(
  form: ApplyExternalUpdateForm<T>,
  next: T,
): void {
  form.reset(next, {
    keepDirtyValues: true,
    keepDirty: true,
    keepTouched: true,
  });
}

/** Subset of `UseFormReturn` consumed by `runCommit`. */
export type RunCommitForm<T extends Config = Config> = Pick<
  UseFormReturn<T>,
  'getValues' | 'setError' | 'clearErrors'
>;

/** Subset of `ConfigBinding` consumed by `runCommit` — the patch surface only. */
export interface RunCommitBinding {
  patch(patch: ConfigPatch): ConfigBindingPatchResult;
}

/**
 * Per-field commit. Reads the current form value at `name`, builds a
 * deep-partial patch, hands it to `binding.patch`. On success: clear any
 * existing error on that field. On failure: mirror the rejection into
 * `form.setError` (path-matched issue message preferred; `humanFormat`
 * fallback otherwise). Returns the patch outcome.
 */
export function runCommit<T extends Config = Config>(
  form: RunCommitForm<T>,
  binding: RunCommitBinding,
  name: FieldPath<T>,
): boolean {
  const value = form.getValues(name);
  const patch = buildPatch(splitFieldPath(name), value) as ConfigPatch;
  const result = binding.patch(patch);
  if (result.ok) {
    form.clearErrors(name);
    return true;
  }
  form.setError(name, {
    type: 'config-binding',
    message: pickFirstIssueForPath(result.error, name),
  });
  return false;
}

/**
 * Pick the message from the first SCHEMA_INVALID issue whose dotted path
 * matches `name`. Falls back to `humanFormat(error)` for non-SCHEMA_INVALID
 * errors (WRITE_ERROR, YAML_PARSE, etc.) or when no issue path matches.
 */
export function pickFirstIssueForPath(error: ConfigValidationError, name: string): string {
  if (isKnownConfigError(error) && error.code === 'SCHEMA_INVALID') {
    const matching = error.issues.find((iss) => issuePathMatches(iss, name));
    if (matching) return matching.message;
  }
  return humanFormat(error);
}

function issuePathMatches(issue: ConfigIssue, name: string): boolean {
  return issue.path.map(String).join('.') === name;
}

/**
 * Convert RHF's dotted field path (`'mcp.tools.search.maxResults'`) into
 * the segment array `buildPatch` expects (`['mcp', 'tools', 'search',
 * 'maxResults']`). Numeric segments stay strings — `buildPatch` coerces
 * back via `String(head)` when assembling the patch object.
 */
function splitFieldPath(name: string): string[] {
  return name.split('.');
}
