interface DialogLike {
  showOpenDialog(opts: {
    properties: ('openDirectory' | 'createDirectory' | 'openFile' | 'multiSelections')[];
    defaultPath?: string;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

interface PromptForFolderOpts {
  /** Initial directory shown in the picker. Pass the project root so the user
   *  doesn't have to navigate to it. */
  defaultPath?: string;
}

function readTestPickedPath(): string | null {
  if (process.env.OK_DESKTOP_E2E_SMOKE !== '1') return null;
  const picked = process.env.OK_DESKTOP_TEST_PICKED_PATH;
  if (typeof picked !== 'string' || picked.length === 0) return null;
  return picked;
}

export async function promptForExistingFolder(
  dialogModule: DialogLike,
  opts: PromptForFolderOpts = {},
): Promise<string | null> {
  const testSeam = readTestPickedPath();
  if (testSeam !== null) return testSeam;
  const result = await dialogModule.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    ...(opts.defaultPath !== undefined ? { defaultPath: opts.defaultPath } : {}),
  });
  if (result.canceled) return null;
  return result.filePaths[0] ?? null;
}
