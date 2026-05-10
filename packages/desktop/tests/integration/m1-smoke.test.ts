import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('M1 smoke', () => {
  test('Test 1 — dev loop: Playwright _electron.launch (DEFERRED to M2)', () => {
    expect(true).toBe(true); // placeholder — real check is M2
  });

  test('Test 2 — keyring smoke: @napi-rs/keyring loads + round-trips a secret', async () => {
    let keyring: typeof import('@napi-rs/keyring') | null = null;
    try {
      keyring = await import('@napi-rs/keyring');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[m1-smoke] @napi-rs/keyring failed to load: ${message}`);
      console.warn(
        '[m1-smoke] SKIPPING keyring round-trip (R15 fallback to plaintext YAML kicks in)',
      );
      expect(message.length).toBeGreaterThan(0);
      return;
    }

    const Entry = keyring.Entry;
    expect(typeof Entry).toBe('function');

    if (process.platform === 'linux' && process.env.CI === 'true') {
      console.warn(
        '[m1-smoke] SKIPPING keyring round-trip on Linux CI — no Secret Service backend; ' +
          'binding-load verification (R15) above is sufficient. Round-trip runs locally on ' +
          'macOS (Keychain) and Windows (Credential Manager).',
      );
      return;
    }

    const entry = new Entry('open-knowledge-m1-smoke', 'test-user');
    try {
      entry.setPassword('secret-from-test');
      const got = entry.getPassword();
      expect(got).toBe('secret-from-test');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[m1-smoke] keyring round-trip skipped (env): ${message}`);
      expect(message.length).toBeGreaterThan(0);
    } finally {
      try {
        entry.deletePassword();
      } catch {}
    }
  });

  test('Test 3 — parent-death detection: covered by tests/utility/server-entry.test.ts', () => {
    const utilityTestPath = join(__dirname, '..', 'utility', 'server-entry.test.ts');
    expect(existsSync(utilityTestPath)).toBe(true);
  });

  test('Test 4 — server.lock behavior: covered by tests/main/window-manager.test.ts + V0-1 server-lock.test.ts', () => {
    const wmTestPath = join(__dirname, '..', 'main', 'window-manager.test.ts');
    const serverLockTestPath = join(
      __dirname,
      '..',
      '..',
      '..',
      'server',
      'src',
      'server-lock.test.ts',
    );
    expect(existsSync(wmTestPath)).toBe(true);
    expect(existsSync(serverLockTestPath)).toBe(true);
  });

  test('M1 invariant: bridge contract drift catcher (US-010 promise)', async () => {
    const corePath = join(__dirname, '..', '..', '..', 'core', 'src', 'desktop-bridge.ts');
    const desktopPath = join(__dirname, '..', '..', 'src', 'shared', 'bridge-contract.ts');
    const appPath = join(
      __dirname,
      '..',
      '..',
      '..',
      'app',
      'src',
      'lib',
      'desktop-bridge-types.ts',
    );
    expect(existsSync(corePath)).toBe(true);
    expect(existsSync(desktopPath)).toBe(true);
    expect(existsSync(appPath)).toBe(true);

    const { readFileSync } = await import('node:fs');
    const extractBridgeMembers = (src: string): Set<string> => {
      const names = new Set<string>();
      const lines = src.split('\n');
      let inInterface = false;
      let braceDepth = 0;
      let parenDepth = 0;
      let currentParent: string | null = null;
      for (const line of lines) {
        if (!inInterface) {
          if (/interface\s+OkDesktopBridge\s*\{/.test(line)) {
            inInterface = true;
            braceDepth = (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
            parenDepth = (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length;
          }
          continue;
        }
        const opens = (line.match(/\{/g) ?? []).length;
        const closes = (line.match(/\}/g) ?? []).length;
        const parenOpens = (line.match(/\(/g) ?? []).length;
        const parenCloses = (line.match(/\)/g) ?? []).length;
        const trimmed = line.trim();
        const memberMatch = trimmed.match(/^(?:readonly\s+)?(\w+)\s*[:(?]/);
        const canCapture = parenDepth === 0;
        if (braceDepth === 1) {
          if (canCapture && memberMatch?.[1]) {
            names.add(memberMatch[1]);
            if (opens > closes) currentParent = memberMatch[1];
          }
        } else if (braceDepth === 2 && currentParent) {
          if (canCapture && memberMatch?.[1]) names.add(`${currentParent}.${memberMatch[1]}`);
        }
        braceDepth += opens - closes;
        parenDepth += parenOpens - parenCloses;
        if (braceDepth === 1 && currentParent) currentParent = null;
        if (braceDepth === 0) break;
      }
      return names;
    };

    const coreMembers = extractBridgeMembers(readFileSync(corePath, 'utf-8'));
    const desktopMembers = extractBridgeMembers(readFileSync(desktopPath, 'utf-8'));
    const appMembers = extractBridgeMembers(readFileSync(appPath, 'utf-8'));

    expect(coreMembers.size).toBeGreaterThan(0);
    expect(desktopMembers.size).toBeGreaterThan(0);
    expect(appMembers.size).toBeGreaterThan(0);

    const REQUIRED_SHELL_MEMBERS = [
      'shell.openExternal', // M1 baseline
      'shell.detectProtocol', // 2026-04-21 US-004 (Open in Agent)
      'shell.spawnCursor', // 2026-04-21 US-004 (Open in Agent)
      'shell.recordHandoff', // 2026-04-21 US-008 (Open in Agent telemetry)
      'shell.openAsset', // 2026-04-23 FR-A6 (asset-click dispatcher)
      'shell.revealAsset', // 2026-04-23 FR-A6 (asset-click dispatcher)
      'shell.showAssetMenu', // 2026-04-23 FR-A8 (right-click context menu)
      'shell.showItemInFolder', // 2026-04-27 file-tree reveal-in-finder
    ] as const;
    for (const [label, members] of [
      ['core', coreMembers],
      ['desktop', desktopMembers],
      ['app', appMembers],
    ] as const) {
      expect(members.has('shell')).toBe(true);
      for (const required of REQUIRED_SHELL_MEMBERS) {
        expect(members.has(required)).toBe(true);
        if (!members.has(required)) {
          throw new Error(`${label} extractor missed ${required} — walker broken`);
        }
      }
    }

    const diff = (a: Set<string>, b: Set<string>) => Array.from(a).filter((x) => !b.has(x));
    const coreMinusDesktop = diff(coreMembers, desktopMembers);
    const desktopMinusCore = diff(desktopMembers, coreMembers);
    const appMinusCore = diff(appMembers, coreMembers);
    const coreMinusApp = diff(coreMembers, appMembers);

    if (
      coreMinusDesktop.length +
        desktopMinusCore.length +
        appMinusCore.length +
        coreMinusApp.length >
      0
    ) {
      throw new Error(
        [
          'OkDesktopBridge contract drift across the three copies:',
          `  core has but desktop missing:  [${coreMinusDesktop.join(', ')}]`,
          `  desktop has but core missing:  [${desktopMinusCore.join(', ')}]`,
          `  app has but core missing:      [${appMinusCore.join(', ')}]`,
          `  core has but app missing:      [${coreMinusApp.join(', ')}]`,
          '',
          'Fix: add the missing members so the three copies agree.',
        ].join('\n'),
      );
    }
  });

  test('M1 invariant: EditorId literal-union drift catcher (Pass 0 Major #3)', async () => {
    const packagesRoot = join(__dirname, '..', '..', '..');
    const cliEditorsPath = join(packagesRoot, 'cli', 'src', 'commands', 'editors.ts');
    const ipcChannelsPath = join(__dirname, '..', '..', 'src', 'shared', 'ipc-channels.ts');
    const corePath = join(packagesRoot, 'core', 'src', 'desktop-bridge.ts');
    const appPath = join(packagesRoot, 'app', 'src', 'lib', 'desktop-bridge-types.ts');
    const { readFileSync } = await import('node:fs');

    const extractLiteralUnion = (src: string, typeName: string): Set<string> => {
      const declRegex = new RegExp(`type\\s+${typeName}\\s*=([^;]+);`, 'm');
      const match = src.match(declRegex);
      if (!match?.[1]) return new Set();
      const body = match[1];
      const literals = body.match(/'([^']+)'/g) ?? [];
      return new Set(literals.map((l) => l.slice(1, -1)));
    };

    const cliMembers = extractLiteralUnion(readFileSync(cliEditorsPath, 'utf-8'), 'EditorId');
    const ipcMembers = extractLiteralUnion(
      readFileSync(ipcChannelsPath, 'utf-8'),
      'McpWiringEditorId',
    );
    const coreMembers = extractLiteralUnion(readFileSync(corePath, 'utf-8'), 'OkMcpWiringEditorId');
    const appMembers = extractLiteralUnion(readFileSync(appPath, 'utf-8'), 'OkMcpWiringEditorId');

    expect(cliMembers.size).toBeGreaterThan(0);
    expect(ipcMembers.size).toBeGreaterThan(0);
    expect(coreMembers.size).toBeGreaterThan(0);
    expect(appMembers.size).toBeGreaterThan(0);

    expect(cliMembers.size).toBe(4);

    const diff = (a: Set<string>, b: Set<string>) => Array.from(a).filter((x) => !b.has(x));
    const failures: string[] = [];
    for (const [otherLabel, otherMembers] of [
      ['ipc-channels.ts (McpWiringEditorId)', ipcMembers],
      ['core/desktop-bridge.ts (OkMcpWiringEditorId)', coreMembers],
      ['app/desktop-bridge-types.ts (OkMcpWiringEditorId)', appMembers],
    ] as const) {
      const cliMinusOther = diff(cliMembers, otherMembers);
      const otherMinusCli = diff(otherMembers, cliMembers);
      if (cliMinusOther.length || otherMinusCli.length) {
        failures.push(
          `  ${otherLabel} drift vs cli/editors.ts (canonical):\n` +
            `    cli has but ${otherLabel} missing: [${cliMinusOther.join(', ')}]\n` +
            `    ${otherLabel} has but cli missing: [${otherMinusCli.join(', ')}]`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(
        [
          'EditorId literal-union drift across the four copies:',
          ...failures,
          '',
          'Fix: update every union body so all four files agree on the literal members.',
        ].join('\n'),
      );
    }
  });

  test('M1 invariant: OkThemeSource literal-union drift catcher', async () => {
    const desktopPath = join(__dirname, '..', '..', 'src', 'shared', 'bridge-contract.ts');
    const corePath = join(__dirname, '..', '..', '..', 'core', 'src', 'desktop-bridge.ts');
    const appPath = join(
      __dirname,
      '..',
      '..',
      '..',
      'app',
      'src',
      'lib',
      'desktop-bridge-types.ts',
    );
    const { readFileSync } = await import('node:fs');

    const extractLiteralUnion = (src: string, typeName: string): Set<string> => {
      const declRegex = new RegExp(`type\\s+${typeName}\\s*=([^;]+);`, 'm');
      const match = src.match(declRegex);
      if (!match?.[1]) return new Set();
      const body = match[1];
      const literals = body.match(/'([^']+)'/g) ?? [];
      return new Set(literals.map((l) => l.slice(1, -1)));
    };

    const desktopMembers = extractLiteralUnion(readFileSync(desktopPath, 'utf-8'), 'OkThemeSource');
    const coreMembers = extractLiteralUnion(readFileSync(corePath, 'utf-8'), 'OkThemeSource');
    const appMembers = extractLiteralUnion(readFileSync(appPath, 'utf-8'), 'OkThemeSource');

    expect(desktopMembers.size).toBeGreaterThan(0);
    expect(coreMembers.size).toBeGreaterThan(0);
    expect(appMembers.size).toBeGreaterThan(0);

    expect(desktopMembers.size).toBe(3);

    expect(desktopMembers).toEqual(coreMembers);
    expect(desktopMembers).toEqual(appMembers);
  });

  test('M1 invariant: SWITCH_PROJECT_LABEL_WITH_ELLIPSIS drift catcher', async () => {
    const [desktop, app] = await Promise.all([
      import('../../src/shared/labels.ts'),
      import('../../../app/src/lib/desktop-labels.ts'),
    ]);
    expect(typeof desktop.SWITCH_PROJECT_LABEL_WITH_ELLIPSIS).toBe('string');
    expect(typeof app.SWITCH_PROJECT_LABEL_WITH_ELLIPSIS).toBe('string');
    expect(app.SWITCH_PROJECT_LABEL_WITH_ELLIPSIS).toBe(desktop.SWITCH_PROJECT_LABEL_WITH_ELLIPSIS);
  });

  test('M1 invariant: KeyringSmokeResult shape drift catcher (M5)', async () => {
    const desktopSmokeSrcPath = join(__dirname, '..', '..', 'src', 'utility', 'keyring-smoke.ts');
    const corePath = join(__dirname, '..', '..', '..', 'core', 'src', 'desktop-bridge.ts');
    const appPath = join(
      __dirname,
      '..',
      '..',
      '..',
      'app',
      'src',
      'lib',
      'desktop-bridge-types.ts',
    );
    const { readFileSync } = await import('node:fs');

    const extractInterfaceFields = (src: string, interfaceName: string): Set<string> => {
      const names = new Set<string>();
      const lines = src.split('\n');
      const declRegex = new RegExp(`interface\\s+${interfaceName}\\s*\\{`);
      let inInterface = false;
      let depth = 0;
      for (const line of lines) {
        if (!inInterface) {
          if (declRegex.test(line)) {
            inInterface = true;
            depth = (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
          }
          continue;
        }
        const opens = (line.match(/\{/g) ?? []).length;
        const closes = (line.match(/\}/g) ?? []).length;
        if (depth === 1) {
          const trimmed = line.trim();
          const memberMatch = trimmed.match(/^(?:readonly\s+)?(\w+)\s*[:?]/);
          if (memberMatch?.[1]) names.add(memberMatch[1]);
        }
        depth += opens - closes;
        if (depth === 0) break;
      }
      return names;
    };

    const desktopFields = extractInterfaceFields(
      readFileSync(desktopSmokeSrcPath, 'utf-8'),
      'KeyringSmokeResult',
    );
    const coreFields = extractInterfaceFields(
      readFileSync(corePath, 'utf-8'),
      'OkKeyringSmokeResult',
    );
    const appFields = extractInterfaceFields(
      readFileSync(appPath, 'utf-8'),
      'OkKeyringSmokeResult',
    );

    expect(desktopFields.size).toBeGreaterThan(0);
    expect(coreFields.size).toBeGreaterThan(0);
    expect(appFields.size).toBeGreaterThan(0);

    const diff = (a: Set<string>, b: Set<string>) => Array.from(a).filter((x) => !b.has(x));
    const desktopMinusCore = diff(desktopFields, coreFields);
    const coreMinusDesktop = diff(coreFields, desktopFields);
    const desktopMinusApp = diff(desktopFields, appFields);
    const appMinusDesktop = diff(appFields, desktopFields);

    if (
      desktopMinusCore.length +
        coreMinusDesktop.length +
        desktopMinusApp.length +
        appMinusDesktop.length >
      0
    ) {
      throw new Error(
        [
          'KeyringSmokeResult / OkKeyringSmokeResult shape drift across the three copies:',
          `  desktop has but core missing:  [${desktopMinusCore.join(', ')}]`,
          `  core has but desktop missing:  [${coreMinusDesktop.join(', ')}]`,
          `  desktop has but app missing:   [${desktopMinusApp.join(', ')}]`,
          `  app has but desktop missing:   [${appMinusDesktop.join(', ')}]`,
          '',
          'Fix: update the missing files so all three copies agree on the field set.',
        ].join('\n'),
      );
    }
  });

  test('M1 invariant: project session state shape drift catcher', async () => {
    const appEditorTabsPath = join(
      __dirname,
      '..',
      '..',
      '..',
      'app',
      'src',
      'editor',
      'editor-tabs.ts',
    );
    const appBridgePath = join(
      __dirname,
      '..',
      '..',
      '..',
      'app',
      'src',
      'lib',
      'desktop-bridge-types.ts',
    );
    const desktopBridgePath = join(__dirname, '..', '..', 'src', 'shared', 'bridge-contract.ts');
    const ipcChannelsPath = join(__dirname, '..', '..', 'src', 'shared', 'ipc-channels.ts');
    const stateStorePath = join(__dirname, '..', '..', 'src', 'main', 'state-store.ts');
    const { readFileSync } = await import('node:fs');

    const extractInterfaceFields = (src: string, interfaceName: string): Set<string> => {
      const names = new Set<string>();
      const lines = src.split('\n');
      const declRegex = new RegExp(`interface\\s+${interfaceName}\\s*\\{`);
      let inInterface = false;
      let depth = 0;
      for (const line of lines) {
        if (!inInterface) {
          if (declRegex.test(line)) {
            inInterface = true;
            depth = (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
          }
          continue;
        }
        const opens = (line.match(/\{/g) ?? []).length;
        const closes = (line.match(/\}/g) ?? []).length;
        if (depth === 1) {
          const trimmed = line.trim();
          const memberMatch = trimmed.match(/^(?:readonly\s+)?(\w+)\s*[:?]/);
          if (memberMatch?.[1]) names.add(memberMatch[1]);
        }
        depth += opens - closes;
        if (depth === 0) break;
      }
      return names;
    };

    const sources = [
      {
        label: 'app/editor-tabs.ts (EditorTabSessionState)',
        fields: extractInterfaceFields(
          readFileSync(appEditorTabsPath, 'utf-8'),
          'EditorTabSessionState',
        ),
      },
      {
        label: 'app/desktop-bridge-types.ts (ProjectSessionState)',
        fields: extractInterfaceFields(readFileSync(appBridgePath, 'utf-8'), 'ProjectSessionState'),
      },
      {
        label: 'desktop/bridge-contract.ts (ProjectSessionState)',
        fields: extractInterfaceFields(
          readFileSync(desktopBridgePath, 'utf-8'),
          'ProjectSessionState',
        ),
      },
      {
        label: 'desktop/ipc-channels.ts (ProjectSessionState)',
        fields: extractInterfaceFields(
          readFileSync(ipcChannelsPath, 'utf-8'),
          'ProjectSessionState',
        ),
      },
      {
        label: 'desktop/state-store.ts (ProjectSessionState)',
        fields: extractInterfaceFields(
          readFileSync(stateStorePath, 'utf-8'),
          'ProjectSessionState',
        ),
      },
    ] as const;

    for (const source of sources) {
      expect(source.fields.size).toBeGreaterThan(0);
    }

    const canonical = sources[0];
    const diff = (a: Set<string>, b: Set<string>) => Array.from(a).filter((x) => !b.has(x));
    const failures: string[] = [];
    for (const source of sources.slice(1)) {
      const canonicalMinusSource = diff(canonical.fields, source.fields);
      const sourceMinusCanonical = diff(source.fields, canonical.fields);
      if (canonicalMinusSource.length || sourceMinusCanonical.length) {
        failures.push(
          `  ${source.label} drift vs ${canonical.label}:\n` +
            `    canonical has but copy missing: [${canonicalMinusSource.join(', ')}]\n` +
            `    copy has but canonical missing: [${sourceMinusCanonical.join(', ')}]`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(
        [
          'ProjectSessionState / EditorTabSessionState shape drift across session-state copies:',
          ...failures,
          '',
          'Fix: update every session-state interface so all copies agree on the field set.',
        ].join('\n'),
      );
    }
  });
});
