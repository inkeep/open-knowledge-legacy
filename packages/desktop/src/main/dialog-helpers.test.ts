import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { promptForExistingFolder, promptForFolder } from './dialog-helpers.ts';

const ORIGINAL_SMOKE = process.env.OK_DESKTOP_E2E_SMOKE;
const ORIGINAL_PICKED = process.env.OK_DESKTOP_TEST_PICKED_PATH;

afterEach(() => {
  if (ORIGINAL_SMOKE === undefined) delete process.env.OK_DESKTOP_E2E_SMOKE;
  else process.env.OK_DESKTOP_E2E_SMOKE = ORIGINAL_SMOKE;
  if (ORIGINAL_PICKED === undefined) delete process.env.OK_DESKTOP_TEST_PICKED_PATH;
  else process.env.OK_DESKTOP_TEST_PICKED_PATH = ORIGINAL_PICKED;
});

describe('promptForFolder (createDirectory variant)', () => {
  test('OS picker returns first path on success', async () => {
    delete process.env.OK_DESKTOP_E2E_SMOKE;
    delete process.env.OK_DESKTOP_TEST_PICKED_PATH;
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/picked/path'] }));
    const result = await promptForFolder({ showOpenDialog });
    expect(result).toBe('/picked/path');
    expect(showOpenDialog).toHaveBeenCalledWith({
      properties: ['openDirectory', 'createDirectory'],
    });
  });

  test('OS picker returns null on cancel', async () => {
    delete process.env.OK_DESKTOP_E2E_SMOKE;
    delete process.env.OK_DESKTOP_TEST_PICKED_PATH;
    const showOpenDialog = mock(async () => ({ canceled: true, filePaths: [] }));
    expect(await promptForFolder({ showOpenDialog })).toBe(null);
  });

  test('OS picker returns null on empty filePaths', async () => {
    delete process.env.OK_DESKTOP_E2E_SMOKE;
    delete process.env.OK_DESKTOP_TEST_PICKED_PATH;
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: [] }));
    expect(await promptForFolder({ showOpenDialog })).toBe(null);
  });

  test('test seam returns env path when both gates set, never calls OS picker', async () => {
    process.env.OK_DESKTOP_E2E_SMOKE = '1';
    process.env.OK_DESKTOP_TEST_PICKED_PATH = '/tmp/test-pick';
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/never/used'] }));
    expect(await promptForFolder({ showOpenDialog })).toBe('/tmp/test-pick');
    expect(showOpenDialog).not.toHaveBeenCalled();
  });

  test('test seam ignored when OK_DESKTOP_E2E_SMOKE missing — production safety', async () => {
    delete process.env.OK_DESKTOP_E2E_SMOKE;
    process.env.OK_DESKTOP_TEST_PICKED_PATH = '/tmp/should-not-fire';
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/real/pick'] }));
    expect(await promptForFolder({ showOpenDialog })).toBe('/real/pick');
    expect(showOpenDialog).toHaveBeenCalled();
  });

  test('test seam ignored when OK_DESKTOP_TEST_PICKED_PATH empty', async () => {
    process.env.OK_DESKTOP_E2E_SMOKE = '1';
    process.env.OK_DESKTOP_TEST_PICKED_PATH = '';
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/real/pick'] }));
    expect(await promptForFolder({ showOpenDialog })).toBe('/real/pick');
    expect(showOpenDialog).toHaveBeenCalled();
  });

  test('defaultPath threads through to showOpenDialog', async () => {
    delete process.env.OK_DESKTOP_E2E_SMOKE;
    delete process.env.OK_DESKTOP_TEST_PICKED_PATH;
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/picked'] }));
    await promptForFolder({ showOpenDialog }, { defaultPath: '/project/root' });
    expect(showOpenDialog).toHaveBeenCalledWith({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: '/project/root',
    });
  });

  test('omits defaultPath when not provided', async () => {
    delete process.env.OK_DESKTOP_E2E_SMOKE;
    delete process.env.OK_DESKTOP_TEST_PICKED_PATH;
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/picked'] }));
    await promptForFolder({ showOpenDialog });
    expect(showOpenDialog).toHaveBeenCalledWith({
      properties: ['openDirectory', 'createDirectory'],
    });
  });
});

describe('promptForExistingFolder (no createDirectory)', () => {
  beforeEach(() => {
    delete process.env.OK_DESKTOP_E2E_SMOKE;
    delete process.env.OK_DESKTOP_TEST_PICKED_PATH;
  });

  test('OS picker uses openDirectory only', async () => {
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/picked'] }));
    const result = await promptForExistingFolder({ showOpenDialog });
    expect(result).toBe('/picked');
    expect(showOpenDialog).toHaveBeenCalledWith({ properties: ['openDirectory'] });
  });

  test('test seam fires identically to promptForFolder', async () => {
    process.env.OK_DESKTOP_E2E_SMOKE = '1';
    process.env.OK_DESKTOP_TEST_PICKED_PATH = '/tmp/seam';
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/never'] }));
    expect(await promptForExistingFolder({ showOpenDialog })).toBe('/tmp/seam');
    expect(showOpenDialog).not.toHaveBeenCalled();
  });

  test('cancel returns null', async () => {
    const showOpenDialog = mock(async () => ({ canceled: true, filePaths: [] }));
    expect(await promptForExistingFolder({ showOpenDialog })).toBe(null);
  });
});
