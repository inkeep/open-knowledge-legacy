/**
 * Shared native-dialog helpers for main-process surfaces.
 *
 * The IPC handler (`ok:dialog:create-folder`) and the File → Open Folder menu
 * item both need to show a native folder-picker with `openDirectory` +
 * `createDirectory` properties. Colocating the dialog options here gives us
 * exactly one definition of "what does Open Folder do" — future tweaks (e.g.,
 * adding `treatPackagesAsDirectories: true` for macOS behavior) land in one
 * place, not two.
 *
 * `Electron.Dialog` is injected so this module is unit-testable without a
 * real Electron runtime — the shape we consume is a single method.
 */

export interface DialogLike {
  showOpenDialog(opts: {
    properties: ('openDirectory' | 'createDirectory' | 'openFile' | 'multiSelections')[];
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

/**
 * Prompt the user for a folder (existing OR new — the dialog exposes a "New
 * Folder" button on macOS via `createDirectory`). Returns the selected path,
 * or `null` if the user cancelled or picked nothing.
 */
export async function promptForFolder(dialogModule: DialogLike): Promise<string | null> {
  const result = await dialogModule.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0] ?? null;
}
