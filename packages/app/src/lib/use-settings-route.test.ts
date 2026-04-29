/**
 * Pure unit tests for the hash → settings-scope parser. The hook itself
 * (subscribing to `hashchange` + reading `window.location.hash`) is exercised
 * by Playwright in US-009/US-010 — repo convention is to keep DOM/event
 * coverage in stress tests and unit-test only the pure parser surface.
 */

import { describe, expect, test } from 'bun:test';
import { parseSettingsHash, settingsHash } from './use-settings-route';

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
