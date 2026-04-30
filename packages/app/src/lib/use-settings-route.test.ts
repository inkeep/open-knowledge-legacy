/**
 * Pure unit tests for the hash → settings-scope parser. The hook itself
 * (subscribing to `hashchange` + reading `window.location.hash`) is exercised
 * by Playwright in US-009/US-010 — repo convention is to keep DOM/event
 * coverage in stress tests and unit-test only the pure parser surface.
 */

import { describe, expect, test } from 'bun:test';
import {
  isSettingsShortcut,
  parseSettingsHash,
  SETTINGS_OPEN_HASH,
  settingsHash,
} from './use-settings-route';

describe('parseSettingsHash', () => {
  test('empty hash → null', () => {
    expect(parseSettingsHash('')).toBeNull();
  });

  test('non-settings hash → null', () => {
    expect(parseSettingsHash('#/some-doc')).toBeNull();
    expect(parseSettingsHash('#install-claude-desktop')).toBeNull();
  });

  test('bare `#settings` → workspace (canonical synonym)', () => {
    expect(parseSettingsHash('#settings')).toBe('workspace');
  });

  test('`#settings/workspace` → workspace', () => {
    expect(parseSettingsHash('#settings/workspace')).toBe('workspace');
  });

  test('`#settings/user` → user', () => {
    expect(parseSettingsHash('#settings/user')).toBe('user');
  });

  test('typo / unrecognized scope → null', () => {
    expect(parseSettingsHash('#settings/global')).toBeNull();
    expect(parseSettingsHash('#settings/')).toBeNull();
  });

  test('hash without leading `#` is tolerated', () => {
    expect(parseSettingsHash('settings/workspace')).toBe('workspace');
  });
});

describe('settingsHash', () => {
  test('builds canonical hashes', () => {
    expect(settingsHash('workspace')).toBe('#settings/workspace');
    expect(settingsHash('user')).toBe('#settings/user');
  });

  test('round-trips with parseSettingsHash', () => {
    expect(parseSettingsHash(settingsHash('workspace'))).toBe('workspace');
    expect(parseSettingsHash(settingsHash('user'))).toBe('user');
  });
});

describe('SETTINGS_OPEN_HASH', () => {
  test('is the bare-`#settings` synonym (workspace tab on open)', () => {
    expect(SETTINGS_OPEN_HASH).toBe('#settings');
    expect(parseSettingsHash(SETTINGS_OPEN_HASH)).toBe('workspace');
  });
});

describe('isSettingsShortcut', () => {
  function ev(overrides: Partial<Parameters<typeof isSettingsShortcut>[0]> = {}) {
    return {
      target: null,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      key: ',',
      ...overrides,
    };
  }

  test('Cmd+, on macOS-shaped event → true', () => {
    expect(isSettingsShortcut(ev({ metaKey: true, key: ',' }))).toBe(true);
  });

  test('Ctrl+, on Windows/Linux-shaped event → true', () => {
    expect(isSettingsShortcut(ev({ ctrlKey: true, key: ',' }))).toBe(true);
  });

  test('plain "," (no modifier) → false', () => {
    expect(isSettingsShortcut(ev({ key: ',' }))).toBe(false);
  });

  test('Cmd+Alt+, → false (avoid hijacking other modifier combinations)', () => {
    expect(isSettingsShortcut(ev({ metaKey: true, altKey: true, key: ',' }))).toBe(false);
  });

  test('Cmd+. → false (different key)', () => {
    expect(isSettingsShortcut(ev({ metaKey: true, key: '.' }))).toBe(false);
  });

  test('suppresses inside <input>', () => {
    expect(isSettingsShortcut(ev({ metaKey: true, target: { tagName: 'INPUT' } }))).toBe(false);
  });

  test('suppresses inside <textarea>', () => {
    expect(isSettingsShortcut(ev({ metaKey: true, target: { tagName: 'TEXTAREA' } }))).toBe(false);
  });

  test('suppresses inside contenteditable host', () => {
    expect(isSettingsShortcut(ev({ metaKey: true, target: { isContentEditable: true } }))).toBe(
      false,
    );
  });

  test('fires on non-form targets (button, div, body)', () => {
    expect(isSettingsShortcut(ev({ metaKey: true, target: { tagName: 'BUTTON' } }))).toBe(true);
    expect(isSettingsShortcut(ev({ metaKey: true, target: { tagName: 'DIV' } }))).toBe(true);
    expect(isSettingsShortcut(ev({ metaKey: true, target: null }))).toBe(true);
  });
});
