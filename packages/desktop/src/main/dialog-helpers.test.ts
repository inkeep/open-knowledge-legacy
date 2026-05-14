import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { promptForExistingFolder } from './dialog-helpers.ts';

const ORIGINAL_SMOKE = process.env.OK_DESKTOP_E2E_SMOKE;
const ORIGINAL_PICKED = process.env.OK_DESKTOP_TEST_PICKED_PATH;

afterEach(() => {
  if (ORIGINAL_SMOKE === undefined) delete process.env.OK_DESKTOP_E2E_SMOKE;
  else process.env.OK_DESKTOP_E2E_SMOKE = ORIGINAL_SMOKE;
  if (ORIGINAL_PICKED === undefined) delete process.env.OK_DESKTOP_TEST_PICKED_PATH;
  else process.env.OK_DESKTOP_TEST_PICKED_PATH = ORIGINAL_PICKED;
});

describe('promptForExistingFolder', () => {
  beforeEach(() => {
    delete process.env.OK_DESKTOP_E2E_SMOKE;
    delete process.env.OK_DESKTOP_TEST_PICKED_PATH;
  });

  test('OS picker uses openDirectory + createDirectory (macOS shows New Folder button)', async () => {
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/picked'] }));
    const result = await promptForExistingFolder({ showOpenDialog });
    expect(result).toBe('/picked');
    expect(showOpenDialog).toHaveBeenCalledWith({
      properties: ['openDirectory', 'createDirectory'],
    });
  });

  test('OS picker returns null on cancel', async () => {
    const showOpenDialog = mock(async () => ({ canceled: true, filePaths: [] }));
    expect(await promptForExistingFolder({ showOpenDialog })).toBe(null);
  });

  test('OS picker returns null on empty filePaths', async () => {
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: [] }));
    expect(await promptForExistingFolder({ showOpenDialog })).toBe(null);
  });

  test('test seam returns env path when both gates set, never calls OS picker', async () => {
    process.env.OK_DESKTOP_E2E_SMOKE = '1';
    process.env.OK_DESKTOP_TEST_PICKED_PATH = '/tmp/seam';
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/never/used'] }));
    expect(await promptForExistingFolder({ showOpenDialog })).toBe('/tmp/seam');
    expect(showOpenDialog).not.toHaveBeenCalled();
  });

  test('test seam ignored when OK_DESKTOP_E2E_SMOKE missing — production safety', async () => {
    process.env.OK_DESKTOP_TEST_PICKED_PATH = '/tmp/should-not-fire';
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/real/pick'] }));
    expect(await promptForExistingFolder({ showOpenDialog })).toBe('/real/pick');
    expect(showOpenDialog).toHaveBeenCalled();
  });

  test('test seam ignored when OK_DESKTOP_TEST_PICKED_PATH empty', async () => {
    process.env.OK_DESKTOP_E2E_SMOKE = '1';
    process.env.OK_DESKTOP_TEST_PICKED_PATH = '';
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/real/pick'] }));
    expect(await promptForExistingFolder({ showOpenDialog })).toBe('/real/pick');
    expect(showOpenDialog).toHaveBeenCalled();
  });

  test('defaultPath threads through to showOpenDialog', async () => {
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/picked'] }));
    await promptForExistingFolder({ showOpenDialog }, { defaultPath: '/project/root' });
    expect(showOpenDialog).toHaveBeenCalledWith({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: '/project/root',
    });
  });

  test('omits defaultPath when not provided', async () => {
    const showOpenDialog = mock(async () => ({ canceled: false, filePaths: ['/picked'] }));
    await promptForExistingFolder({ showOpenDialog });
    expect(showOpenDialog).toHaveBeenCalledWith({
      properties: ['openDirectory', 'createDirectory'],
    });
  });
});
