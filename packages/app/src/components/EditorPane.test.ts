import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_PATH = join(__dirname, 'EditorPane.tsx');
const src = readFileSync(SRC_PATH, 'utf-8');

describe('EditorPane module', () => {
  test('exports the EditorPane component', async () => {
    const mod = await import('./EditorPane');
    expect(typeof mod.EditorPane).toBe('function');
  });
});

describe('AutoSync onboarding modal gate', () => {
  test('reads projectLocalConfig + projectLocalSynced from useConfigContext', () => {
    expect(src).toMatch(
      /const\s*\{\s*projectLocalConfig,\s*projectLocalSynced\s*\}\s*=\s*useConfigContext\(\)/,
    );
  });

  test('gate requires projectLocalSynced === true (flash-free guard)', () => {
    expect(src).toContain('projectLocalSynced === true');
  });

  test('gate uses === null sentinel (not === undefined)', () => {
    expect(src).toContain('projectLocalConfig.autoSync?.enabled === null');
    const gateBlock = src.split('showAutoSyncOnboarding')[1] ?? '';
    const gateBody = gateBlock.split(';')[0] ?? '';
    expect(gateBody).not.toContain('=== undefined');
    expect(gateBody).not.toContain('projectConfig.autoSync');
  });

  test('gate is composed in the documented precedence order (dismissed → remote → synced → present → null)', () => {
    const assignStart = src.indexOf('const showAutoSyncOnboarding =');
    expect(assignStart).toBeGreaterThan(-1);
    const tail = src.slice(assignStart);
    const gateEnd = tail.indexOf(';');
    expect(gateEnd).toBeGreaterThan(-1);
    const gate = tail.slice(0, gateEnd);

    const dismissedIdx = gate.indexOf('!autoSyncOnboardingDismissed');
    const remoteIdx = gate.indexOf('syncStatus?.hasRemote === true');
    const syncedIdx = gate.indexOf('projectLocalSynced === true');
    const configIdx = gate.indexOf('projectLocalConfig !== null');
    const nullIdx = gate.indexOf('projectLocalConfig.autoSync?.enabled === null');
    expect(dismissedIdx).toBeGreaterThanOrEqual(0);
    expect(remoteIdx).toBeGreaterThan(dismissedIdx);
    expect(syncedIdx).toBeGreaterThan(remoteIdx);
    expect(configIdx).toBeGreaterThan(syncedIdx);
    expect(nullIdx).toBeGreaterThan(configIdx);
  });

  test('AutoSyncOnboardingDialog open prop is bound to the gate', () => {
    expect(src).toContain('AutoSyncOnboardingDialog');
    expect(src).toMatch(/<AutoSyncOnboardingDialog\s+open=\{showAutoSyncOnboarding\}/);
  });
});
