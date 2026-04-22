import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  COMMIT_SUBJECT_MAX_LEN,
  composeCommitSubject,
  formatChangeNoteBody,
  formatCheckpointBodyLine,
  formatCheckpointSubject,
  formatImportSubject,
  formatOkActor,
  formatParkSubject,
  formatReconcileSubject,
  formatRenameSubject,
  formatRollbackSubject,
  formatWipSubject,
  getShadowRepoPath,
  getWipRefPattern,
  type OkActorEntry,
  parseCheckpoint,
  parseContributors,
  parseOkActor,
  parseWriterId,
} from './shadow-repo-layout.ts';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(resolve(tmpdir(), 'ok-shadow-layout-test-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('parseContributors', () => {
  test('empty string → []', () => {
    expect(parseContributors('')).toEqual([]);
  });

  test('body with no contributor lines → []', () => {
    expect(parseContributors('WIP auto-save 2026-04-01T00:00:00.000Z')).toEqual([]);
  });

  test('parses a single valid contributor line', () => {
    const body = '\nok-contributors: {"id":"agent-abc","name":"Claude","docs":["articles/foo"]}';
    const result = parseContributors(body);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'agent-abc', name: 'Claude', docs: ['articles/foo'] });
  });

  test('parses multiple contributor lines', () => {
    const body = [
      '',
      'ok-contributors: {"id":"agent-a","name":"Alice","docs":["a"]}',
      'ok-contributors: {"id":"agent-b","name":"Bob","docs":["b","c"]}',
    ].join('\n');
    const result = parseContributors(body);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('agent-a');
    expect(result[1].id).toBe('agent-b');
    expect(result[1].docs).toEqual(['b', 'c']);
  });

  test('parses versioned format (v:1)', () => {
    const body = '\nok-contributors: {"v":1,"id":"agent-x","name":"X","docs":["d"]}';
    const result = parseContributors(body);
    expect(result).toHaveLength(1);
    expect(result[0].v).toBe(1);
  });

  test('parses colorSeed field when present', () => {
    const body =
      '\nok-contributors: {"id":"agent-a","name":"A","colorSeed":"my-seed","docs":["x"]}';
    const result = parseContributors(body);
    expect(result).toHaveLength(1);
    expect(result[0]?.colorSeed).toBe('my-seed');
  });

  test('silently skips malformed JSON', () => {
    const body = '\nok-contributors: {not valid json}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry missing id field', () => {
    const body = '\nok-contributors: {"name":"Claude","docs":["x"]}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry missing name field', () => {
    const body = '\nok-contributors: {"id":"agent-a","docs":["x"]}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry missing docs field', () => {
    const body = '\nok-contributors: {"id":"agent-a","name":"A"}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry where docs is not an array (type guard)', () => {
    const body = '\nok-contributors: {"id":"agent-a","name":"A","docs":"not-an-array"}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry where id is not a string (type guard)', () => {
    const body = '\nok-contributors: {"id":123,"name":"A","docs":["x"]}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry where name is not a string (type guard)', () => {
    const body = '\nok-contributors: {"id":"agent-a","name":null,"docs":["x"]}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry where colorSeed is not a string', () => {
    const body = '\nok-contributors: {"id":"agent-a","name":"A","colorSeed":123,"docs":["x"]}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry where docs contains non-string elements', () => {
    const body = '\nok-contributors: {"id":"agent-a","name":"A","docs":["a",1,"b"]}';
    expect(parseContributors(body)).toEqual([]);
  });
});

describe('parseWriterId (D34 taxonomy)', () => {
  test('agent-<id> → agent classification, isAgent true', () => {
    const p = parseWriterId('agent-claude-code-7x');
    expect(p.classification).toBe('agent');
    expect(p.isAgent).toBe(true);
    expect(p.id).toBe('agent-claude-code-7x');
  });

  test('principal-<id> → principal classification, isAgent false', () => {
    const p = parseWriterId('principal-tim');
    expect(p.classification).toBe('principal');
    expect(p.isAgent).toBe(false);
  });

  test('"file-system" → classified-file-system, isAgent null', () => {
    const p = parseWriterId('file-system');
    expect(p.classification).toBe('classified-file-system');
    expect(p.isAgent).toBe(null);
  });

  test('"git-upstream" → classified-git-upstream, isAgent null', () => {
    const p = parseWriterId('git-upstream');
    expect(p.classification).toBe('classified-git-upstream');
    expect(p.isAgent).toBe(null);
  });

  test('"openknowledge-service" → classified-openknowledge-service, isAgent null', () => {
    const p = parseWriterId('openknowledge-service');
    expect(p.classification).toBe('classified-openknowledge-service');
    expect(p.isAgent).toBe(null);
  });

  // Legacy ids → unknown (eligible for GC by US-018 allowlist sweep)
  test('legacy "human-<id>" → unknown (D34: human- prefix dropped)', () => {
    const p = parseWriterId('human-tim');
    expect(p.classification).toBe('unknown');
    expect(p.isAgent).toBe(null);
  });

  test('legacy "upstream" → unknown (D34: replaced by git-upstream)', () => {
    const p = parseWriterId('upstream');
    expect(p.classification).toBe('unknown');
    expect(p.isAgent).toBe(null);
  });

  test('legacy "server" → unknown (D34: replaced by openknowledge-service)', () => {
    const p = parseWriterId('server');
    expect(p.classification).toBe('unknown');
    expect(p.isAgent).toBe(null);
  });

  test('unknown prefix → unknown classification, isAgent null', () => {
    const p = parseWriterId('bot-xyz');
    expect(p.classification).toBe('unknown');
    expect(p.isAgent).toBe(null);
  });

  test('empty string → unknown', () => {
    const p = parseWriterId('');
    expect(p.classification).toBe('unknown');
    expect(p.isAgent).toBe(null);
  });

  test('agent- prefix without a suffix → unknown (regex requires non-empty suffix)', () => {
    const p = parseWriterId('agent-');
    expect(p.classification).toBe('unknown');
    expect(p.isAgent).toBe(null);
  });

  test('slash in id → unknown (would be a malformed ref)', () => {
    const p = parseWriterId('agent-abc/def');
    expect(p.classification).toBe('unknown');
    expect(p.isAgent).toBe(null);
  });
});

describe('getWipRefPattern', () => {
  test('main branch', () => {
    expect(getWipRefPattern('main')).toBe('refs/wip/main/');
  });
  test('branch with slash', () => {
    expect(getWipRefPattern('feat/exec-mcp')).toBe('refs/wip/feat/exec-mcp/');
  });
});

describe('getShadowRepoPath', () => {
  test('returns null when no shadow repo exists', () => {
    expect(getShadowRepoPath(tmp)).toBe(null);
  });

  test('always resolves to <projectRoot>/.git/open-knowledge/', () => {
    const project = resolve(tmp, 'project');
    mkdirSync(resolve(project, '.git/open-knowledge'), { recursive: true });
    writeFileSync(resolve(project, '.git/open-knowledge/HEAD'), 'ref: refs/heads/main\n');
    expect(getShadowRepoPath(project)).toBe(resolve(project, '.git/open-knowledge'));
  });

  test('never returns legacy .git/openknowledge/ path (single-mode layout)', () => {
    const project = resolve(tmp, 'project');
    // Simulate old integrated-mode location — layout helper does NOT see it
    mkdirSync(resolve(project, '.git/openknowledge'), { recursive: true });
    writeFileSync(resolve(project, '.git/openknowledge/HEAD'), 'ref: refs/heads/main\n');
    // Legacy path is ignored — getShadowRepoPath reads through resolveShadowDir
    // which always returns .git/open-knowledge/. The R9 rename shim in
    // initShadowRepo handles the on-disk migration at server start.
    expect(getShadowRepoPath(project)).toBe(null);
  });

  test('never returns .openknowledge/ (standalone path deleted)', () => {
    const project = resolve(tmp, 'project');
    mkdirSync(resolve(project, '.openknowledge'), { recursive: true });
    writeFileSync(resolve(project, '.openknowledge/HEAD'), 'ref: refs/heads/main\n');
    expect(getShadowRepoPath(project)).toBe(null);
  });

  test('returns null when .git/open-knowledge exists but HEAD is missing', () => {
    const project = resolve(tmp, 'project');
    mkdirSync(resolve(project, '.git/open-knowledge'), { recursive: true });
    expect(getShadowRepoPath(project)).toBe(null);
  });
});

describe('parseCheckpoint / formatCheckpointBodyLine (bridge-correctness SPEC §6 R7d)', () => {
  test('round-trips bridge-merge-loss with enriched docName + size', () => {
    const line = formatCheckpointBodyLine({
      kind: 'bridge-merge-loss',
      docName: 'notes/foo.md',
      size: 1234,
      metadata: { lostSubstrings: ['a', 'b', 'c'] },
    });
    const body = `checkpoint: X\n\n${line}`;
    const parsed = parseCheckpoint(body);
    expect(parsed?.kind).toBe('bridge-merge-loss');
    if (parsed?.kind === 'bridge-merge-loss') {
      expect(parsed.metadata.lostSubstrings).toEqual(['a', 'b', 'c']);
      expect(parsed.docName).toBe('notes/foo.md');
      expect(parsed.size).toBe(1234);
    }
  });

  test('round-trips external-change-rescue with enriched docName + size', () => {
    const line = formatCheckpointBodyLine({
      kind: 'external-change-rescue',
      docName: 'root.md',
      size: 42,
      metadata: { incomingDiskSha: 'deadbeef' },
    });
    const body = `checkpoint: Y\n\n${line}`;
    const parsed = parseCheckpoint(body);
    expect(parsed?.kind).toBe('external-change-rescue');
    if (parsed?.kind === 'external-change-rescue') {
      expect(parsed.metadata.incomingDiskSha).toBe('deadbeef');
      expect(parsed.docName).toBe('root.md');
      expect(parsed.size).toBe(42);
    }
  });

  test('backward-compat: pre-enrichment body without docName/size returns nulls', () => {
    // Simulates a checkpoint commit written before the docName/size enrichment
    // (bridge-correctness review iteration 5). The rescue read path's fallback
    // branch handles this case via ls-tree.
    const legacyLine =
      'ok-checkpoint-v1: {"kind":"external-change-rescue","metadata":{"incomingDiskSha":"abc"}}';
    const body = `checkpoint: Legacy\n\n${legacyLine}`;
    const parsed = parseCheckpoint(body);
    expect(parsed?.kind).toBe('external-change-rescue');
    if (parsed?.kind === 'external-change-rescue') {
      expect(parsed.docName).toBe(null);
      expect(parsed.size).toBe(null);
    }
  });

  test('returns null for empty body', () => {
    expect(parseCheckpoint('')).toBe(null);
  });

  test('returns null for body without the ok-checkpoint-v1 prefix', () => {
    expect(parseCheckpoint('checkpoint: Save Version\n\nok-contributors: {...}')).toBe(null);
  });

  test('returns null for malformed JSON', () => {
    expect(parseCheckpoint('\nok-checkpoint-v1: {not json')).toBe(null);
  });

  test('returns null for unknown kind', () => {
    expect(parseCheckpoint('\nok-checkpoint-v1: {"kind":"something-else","metadata":{}}')).toBe(
      null,
    );
  });

  test('returns null when metadata shape does not match kind', () => {
    // bridge-merge-loss expects lostSubstrings; missing it → null
    expect(
      parseCheckpoint('\nok-checkpoint-v1: {"kind":"bridge-merge-loss","metadata":{"other":"x"}}'),
    ).toBe(null);
  });

  test('parseContributors tolerates sibling ok-checkpoint-v1 lines (Q7)', () => {
    const body = [
      'checkpoint: some label',
      '',
      'ok-contributors: {"id":"human-a","name":"Alice","docs":["a.md"]}',
      'ok-checkpoint-v1: {"kind":"bridge-merge-loss","docName":"x.md","size":10,"metadata":{"lostSubstrings":["x"]}}',
      'ok-contributors: {"id":"human-b","name":"Bob","docs":["b.md"]}',
    ].join('\n');

    const contributors = parseContributors(body);
    expect(contributors.map((c) => c.id)).toEqual(['human-a', 'human-b']);

    const checkpoint = parseCheckpoint(body);
    expect(checkpoint?.kind).toBe('bridge-merge-loss');
  });
});

// ─── US-015: parseOkActor / formatOkActor / formatWipSubject ─────────────────

describe('formatWipSubject', () => {
  test('empty docs → wip: auto-save', () => {
    expect(formatWipSubject([])).toBe('wip: auto-save');
  });

  test('one doc → wip: <docName>', () => {
    expect(formatWipSubject(['notes/ideas.md'])).toBe('wip: notes/ideas.md');
  });

  test('two docs → wip: 2 docs', () => {
    expect(formatWipSubject(['a.md', 'b.md'])).toBe('wip: 2 docs');
  });

  test('five docs → wip: 5 docs', () => {
    const docs = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'];
    expect(formatWipSubject(docs)).toBe('wip: 5 docs');
  });
});

describe('parseOkActor / formatOkActor (US-015, FR-8, D13)', () => {
  const baseEntry: OkActorEntry = {
    v: 1,
    principal: null,
    agent_session: 'conn-abc123',
    agent_type: 'claude-3-5-sonnet',
    client_name: 'claude-code',
    client_version: '1.0.0',
    label: 'My agent',
    display_name: 'Claude (abc1)',
    color_seed: 'conn-abc123',
    docs: ['notes.md', 'ideas.md'],
  };

  test('round-trips a full OkActorEntry', () => {
    const line = formatOkActor(baseEntry);
    const body = `wip: notes.md\n\n${line}`;
    const parsed = parseOkActor(body);
    expect(parsed).not.toBeNull();
    expect(parsed?.v).toBe(1);
    expect(parsed?.agent_session).toBe('conn-abc123');
    expect(parsed?.agent_type).toBe('claude-3-5-sonnet');
    expect(parsed?.client_name).toBe('claude-code');
    expect(parsed?.display_name).toBe('Claude (abc1)');
    expect(parsed?.color_seed).toBe('conn-abc123');
    expect(parsed?.docs).toEqual(['notes.md', 'ideas.md']);
    expect(parsed?.principal).toBeNull();
    expect(parsed?.label).toBe('My agent');
  });

  test('round-trips an entry with all nullable fields null', () => {
    const sparse: OkActorEntry = {
      v: 1,
      principal: null,
      agent_session: null,
      agent_type: null,
      client_name: null,
      client_version: null,
      label: null,
      display_name: 'Open Knowledge (service)',
      color_seed: 'openknowledge-service',
      docs: [],
    };
    const line = formatOkActor(sparse);
    const parsed = parseOkActor(`wip: auto-save\n\n${line}`);
    expect(parsed).not.toBeNull();
    expect(parsed?.agent_session).toBeNull();
    expect(parsed?.docs).toEqual([]);
  });

  test('returns null for empty body', () => {
    expect(parseOkActor('')).toBeNull();
  });

  test('returns null when ok-actor: line is absent', () => {
    expect(parseOkActor('wip: auto-save\n\nok-contributors: {...}')).toBeNull();
  });

  test('returns null for malformed JSON', () => {
    expect(parseOkActor('ok-actor: {not json')).toBeNull();
  });

  test('rejects v:0 (schema version must be 1)', () => {
    const line = 'ok-actor: {"v":0,"display_name":"X","docs":[]}';
    expect(parseOkActor(line)).toBeNull();
  });

  test('rejects missing display_name', () => {
    const line = 'ok-actor: {"v":1,"docs":[]}';
    expect(parseOkActor(line)).toBeNull();
  });

  test('rejects missing docs array', () => {
    const line = 'ok-actor: {"v":1,"display_name":"X"}';
    expect(parseOkActor(line)).toBeNull();
  });

  test('tolerates sibling ok-contributors: and ok-checkpoint-v1: lines (coexistence)', () => {
    const actorLine = formatOkActor(baseEntry);
    const body = [
      'wip: notes.md',
      '',
      'ok-contributors: {"v":1,"id":"agent-abc","name":"Claude","docs":["notes.md"]}',
      actorLine,
    ].join('\n');
    const parsed = parseOkActor(body);
    expect(parsed?.display_name).toBe('Claude (abc1)');
    // contributor parsing is unaffected
    const contributors = parseContributors(body);
    expect(contributors).toHaveLength(1);
    expect(contributors[0]?.id).toBe('agent-abc');
  });

  test('color_seed defaults to "unknown" when missing in stored JSON', () => {
    const line = 'ok-actor: {"v":1,"display_name":"X","docs":[]}';
    const parsed = parseOkActor(line);
    expect(parsed?.color_seed).toBe('unknown');
  });
});

// ─── US-015: Subject-prefix format helpers (D53, FR-13) ──────────────────────

describe('Subject-prefix format helpers (D53, FR-13)', () => {
  test('formatReconcileSubject', () => {
    expect(formatReconcileSubject('notes.md')).toBe('reconcile: notes.md');
    expect(formatReconcileSubject('docs/guide.md')).toBe('reconcile: docs/guide.md');
  });

  test('formatRollbackSubject trims sha to 7 chars', () => {
    expect(formatRollbackSubject('notes.md', 'abcdef1234567890')).toBe(
      'rollback: notes.md to abcdef1',
    );
  });

  test('formatRollbackSubject with short sha (already <= 7)', () => {
    expect(formatRollbackSubject('plan.md', 'abc1234')).toBe('rollback: plan.md to abc1234');
  });

  test('formatParkSubject', () => {
    expect(formatParkSubject('main', 'feat/new-ui')).toBe('park: main -> feat/new-ui');
    expect(formatParkSubject('feat/old', 'main')).toBe('park: feat/old -> main');
  });

  test('formatRenameSubject', () => {
    expect(formatRenameSubject('intro.md', 'getting-started.md')).toBe(
      'rename: intro.md -> getting-started.md',
    );
  });

  test('formatCheckpointSubject', () => {
    expect(formatCheckpointSubject('Save progress')).toBe('checkpoint: Save progress');
    expect(formatCheckpointSubject('pre-rollback')).toBe('checkpoint: pre-rollback');
  });

  test('formatImportSubject with oldHead', () => {
    expect(formatImportSubject('aabbccddeeff0011', '1122334455667788')).toBe(
      'import: from aabbccdd..11223344',
    );
  });

  test('formatImportSubject without oldHead (initial import)', () => {
    expect(formatImportSubject(null, '1122334455667788')).toBe('import: initial at 11223344');
  });

  test('all prefixes are distinct and match their action kind', () => {
    const subjects = [
      formatWipSubject(['doc.md']),
      formatReconcileSubject('doc.md'),
      formatRollbackSubject('doc.md', 'abc1234abcd'),
      formatParkSubject('main', 'feat/x'),
      formatRenameSubject('a.md', 'b.md'),
      formatCheckpointSubject('save'),
      formatImportSubject('aabbccdd', 'eeff0011'),
    ];
    const prefixes = subjects.map((s) => s.split(':')[0]);
    expect(new Set(prefixes).size).toBe(subjects.length);
  });
});

// Agent change-notes follow-up spec — FR-5 subject composition
describe('composeCommitSubject (change-notes subject rules)', () => {
  test('zero summaries: returns base subject unchanged', () => {
    expect(composeCommitSubject('wip: notes.md', [])).toBe('wip: notes.md');
  });

  test('single short summary: appends with em-dash separator', () => {
    expect(composeCommitSubject('wip: notes.md', ['added auth design'])).toBe(
      'wip: notes.md — added auth design',
    );
  });

  test('single summary fits exactly at 72 chars: no truncation', () => {
    const base = 'wip: a.md';
    const summary = 'x'.repeat(COMMIT_SUBJECT_MAX_LEN - base.length - ' — '.length);
    const subject = composeCommitSubject(base, [summary]);
    expect(subject.length).toBe(COMMIT_SUBJECT_MAX_LEN);
    expect(subject.endsWith(summary)).toBe(true);
  });

  test('single oversize summary: truncated with trailing ellipsis, base preserved', () => {
    const base = 'wip: notes.md';
    const summary =
      'this is a very long change-note that goes on and on well past seventy-two characters total';
    const subject = composeCommitSubject(base, [summary]);
    expect(subject.length).toBe(COMMIT_SUBJECT_MAX_LEN);
    expect(subject.startsWith('wip: notes.md — ')).toBe(true);
    expect(subject.endsWith('…')).toBe(true);
  });

  test('two summaries: N-edits suffix, does not embed individual summaries in subject', () => {
    const subject = composeCommitSubject('wip: notes.md', ['first', 'second']);
    expect(subject).toBe('wip: notes.md (2 edits)');
  });

  test('three summaries: N-edits suffix with correct count', () => {
    const subject = composeCommitSubject('wip: a.md', ['a', 'b', 'c']);
    expect(subject).toBe('wip: a.md (3 edits)');
  });

  test('works with non-wip subject prefixes (rename:, rollback:, etc.)', () => {
    expect(composeCommitSubject('rename: a.md -> b.md', ['clarifying scope'])).toBe(
      'rename: a.md -> b.md — clarifying scope',
    );
    expect(composeCommitSubject('rollback: doc.md to abc1234', ['reverting deletion'])).toBe(
      'rollback: doc.md to abc1234 — reverting deletion',
    );
  });
});

describe('formatChangeNoteBody', () => {
  test('zero summaries: empty string (no body)', () => {
    expect(formatChangeNoteBody([])).toBe('');
  });

  test('single summary: empty string (summary carried in subject, not body)', () => {
    expect(formatChangeNoteBody(['only one'])).toBe('');
  });

  test('two summaries: markdown bullet list in call order', () => {
    expect(formatChangeNoteBody(['first', 'second'])).toBe('- first\n- second');
  });

  test('preserves original call order (no sort, no dedup at this layer)', () => {
    expect(formatChangeNoteBody(['z-later', 'a-earlier', 'm-middle'])).toBe(
      '- z-later\n- a-earlier\n- m-middle',
    );
  });
});

describe('OkActorEntry summaries round-trip (FR-4)', () => {
  test('formatOkActor elides summaries field when empty', () => {
    const entry: OkActorEntry = {
      v: 1,
      principal: null,
      agent_session: null,
      agent_type: null,
      client_name: null,
      client_version: null,
      label: null,
      display_name: 'Claude',
      color_seed: 'claude',
      docs: ['a.md'],
    };
    const line = formatOkActor(entry);
    expect(line).not.toContain('summaries');
  });

  test('formatOkActor elides summaries field when explicitly empty array', () => {
    const entry: OkActorEntry = {
      v: 1,
      principal: null,
      agent_session: null,
      agent_type: null,
      client_name: null,
      client_version: null,
      label: null,
      display_name: 'Claude',
      color_seed: 'claude',
      docs: ['a.md'],
      summaries: [],
    };
    const line = formatOkActor(entry);
    expect(line).not.toContain('summaries');
  });

  test('formatOkActor includes summaries when non-empty', () => {
    const entry: OkActorEntry = {
      v: 1,
      principal: null,
      agent_session: null,
      agent_type: null,
      client_name: null,
      client_version: null,
      label: null,
      display_name: 'Claude',
      color_seed: 'claude',
      docs: ['a.md'],
      summaries: ['added auth', 'fixed typo'],
    };
    const line = formatOkActor(entry);
    expect(line).toContain('"summaries":["added auth","fixed typo"]');
  });

  test('parseOkActor round-trips summaries', () => {
    const entry: OkActorEntry = {
      v: 1,
      principal: 'principal-abc',
      agent_session: 'conn-xyz',
      agent_type: 'claude',
      client_name: 'claude-code',
      client_version: '1.5.2',
      label: null,
      display_name: 'Claude (xyz)',
      color_seed: 'claude-code',
      docs: ['a.md', 'b.md'],
      summaries: ['first note', 'second note'],
    };
    const body = formatOkActor(entry);
    const parsed = parseOkActor(body);
    expect(parsed?.summaries).toEqual(['first note', 'second note']);
  });

  test('parseOkActor treats missing summaries field as undefined (pre-spec commits)', () => {
    // Simulate a commit body emitted before this follow-up shipped.
    const legacyBody =
      'ok-actor: {"v":1,"principal":null,"agent_session":null,"agent_type":null,"client_name":null,"client_version":null,"label":null,"display_name":"Claude","color_seed":"claude","docs":["a.md"]}';
    const parsed = parseOkActor(legacyBody);
    expect(parsed).not.toBeNull();
    expect(parsed?.summaries).toBeUndefined();
  });

  test('parseOkActor filters non-string entries defensively', () => {
    const corruptBody =
      'ok-actor: {"v":1,"principal":null,"agent_session":null,"agent_type":null,"client_name":null,"client_version":null,"label":null,"display_name":"Claude","color_seed":"claude","docs":["a.md"],"summaries":["good",42,null,"also good"]}';
    const parsed = parseOkActor(corruptBody);
    expect(parsed?.summaries).toEqual(['good', 'also good']);
  });
});
