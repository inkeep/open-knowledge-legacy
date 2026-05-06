import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STORE_SRC = readFileSync(join(__dirname, 'update-notices-store.ts'), 'utf-8');

describe('update-notices-store install-time wiring', () => {
  test('imports addSchemaIncompatibilityNotice from UpdateNotices.shared', () => {
    expect(STORE_SRC).toMatch(/addSchemaIncompatibilityNotice/);
    expect(STORE_SRC).toMatch(/from ['"]@\/components\/UpdateNotices\.shared['"]/);
  });

  test('installUpdateNoticesBridge calls bridge.state.query()', () => {
    expect(STORE_SRC).toMatch(/bridge\.state\.query\(\)/);
  });

  test('non-null schemaIncompatibility branch invokes addSchemaIncompatibilityNotice', () => {
    expect(STORE_SRC).toMatch(/snapshot\.schemaIncompatibility/);
    expect(STORE_SRC).toMatch(
      /addSchemaIncompatibilityNotice\([\s\S]*?bridge[\s\S]*?addNotice[\s\S]*?dismissNotice/,
    );
  });

  test('still installs the event subscribers via attachUpdateSubscribers', () => {
    expect(STORE_SRC).toMatch(/attachUpdateSubscribers\(bridge, addNotice, dismissNotice\)/);
  });

  test('idempotent attached guard is preserved (HMR-safe)', () => {
    expect(STORE_SRC).toMatch(/if \(attached\) return;/);
    expect(STORE_SRC).toMatch(/attached = true;/);
  });
});
