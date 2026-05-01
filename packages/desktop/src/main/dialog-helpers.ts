
interface DialogLike {
  showOpenDialog(opts: {
    properties: ('openDirectory' | 'createDirectory' | 'openFile' | 'multiSelections')[];
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

export async function promptForFolder(dialogModule: DialogLike): Promise<string | null> {
  const result = await dialogModule.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0] ?? null;
}
