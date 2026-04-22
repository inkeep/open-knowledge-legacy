import { describe, expect, test } from 'bun:test';
import { KNOWN_TARGETS } from './targets.ts';

describe('KNOWN_TARGETS', () => {
  test('has exactly four targets in v0 (PQ2 + PQ3 LOCKED)', () => {
    expect(KNOWN_TARGETS.length).toBe(4);
  });

  test('ids cover the full HandoffTarget union', () => {
    const ids = new Set(KNOWN_TARGETS.map((t) => t.id));
    expect(ids).toEqual(new Set(['claude-cowork', 'claude-code', 'codex', 'cursor']));
  });

  test('claude-cowork + claude-code share the claude: scheme (single install state)', () => {
    const cowork = KNOWN_TARGETS.find((t) => t.id === 'claude-cowork');
    const code = KNOWN_TARGETS.find((t) => t.id === 'claude-code');
    expect(cowork?.schemes).toEqual(['claude:']);
    expect(code?.schemes).toEqual(['claude:']);
  });

  test('codex maps to codex: and cursor maps to cursor:', () => {
    const codex = KNOWN_TARGETS.find((t) => t.id === 'codex');
    const cursor = KNOWN_TARGETS.find((t) => t.id === 'cursor');
    expect(codex?.schemes).toEqual(['codex:']);
    expect(cursor?.schemes).toEqual(['cursor:']);
  });

  test('only claude-cowork + claude-code set hasWebFallback (PQ6 secondary affordance)', () => {
    for (const t of KNOWN_TARGETS) {
      if (t.id === 'claude-cowork' || t.id === 'claude-code') {
        expect(t.hasWebFallback).toBe(true);
      } else {
        expect(t.hasWebFallback).toBeFalsy();
      }
    }
  });

  test('every target has an https install URL', () => {
    for (const t of KNOWN_TARGETS) {
      expect(t.installUrl.startsWith('https://')).toBe(true);
    }
  });

  test('every target names a Lucide icon (Sparkles / Terminal / Bot / Code2)', () => {
    const icons = KNOWN_TARGETS.map((t) => t.icon);
    expect(new Set(icons)).toEqual(new Set(['Sparkles', 'Terminal', 'Bot', 'Code2']));
  });

  test('displayNames match SPEC §7.2 (PQ4 DIRECTED)', () => {
    const byId = new Map(KNOWN_TARGETS.map((t) => [t.id, t.displayName]));
    expect(byId.get('claude-cowork')).toBe('Claude Cowork');
    expect(byId.get('claude-code')).toBe('Claude Code');
    expect(byId.get('codex')).toBe('Codex');
    expect(byId.get('cursor')).toBe('Cursor');
  });
});
