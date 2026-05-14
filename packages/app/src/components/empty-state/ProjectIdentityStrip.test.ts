import { describe, expect, test } from 'bun:test';
import SRC from './ProjectIdentityStrip?raw';

describe('ProjectIdentityStrip module', () => {
  test('exports ProjectIdentityStrip component', async () => {
    const mod = await import('./ProjectIdentityStrip');
    expect(typeof mod.ProjectIdentityStrip).toBe('function');
  });
});

describe('ProjectIdentityStrip source-level guards', () => {
  test('prefers Electron-supplied projectName over basename derivation', () => {
    expect(SRC).toContain('window.okDesktop?.config.projectName');
    const ipcIdx = SRC.indexOf('window.okDesktop?.config.projectName');
    const basenameIdx = SRC.indexOf('basenameOf(workspace.contentDir');
    expect(ipcIdx).toBeGreaterThan(-1);
    expect(basenameIdx).toBeGreaterThan(ipcIdx);
  });

  test('renders nothing while workspace hasnt resolved (no flash)', () => {
    expect(SRC).toMatch(/if\s*\(\s*!name\s*\)\s*return null/);
  });

  test('handles both POSIX and Windows path separators in basename derivation', () => {
    expect(SRC).toContain("'/' | '\\\\'");
  });
});
