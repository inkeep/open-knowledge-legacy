/**
 * Typed IPC request channel map (renderer → main, request/response pattern).
 *
 * D14 (hand-rolled discriminated union, not tRPC/tipc): every channel name is
 * a top-level key in `RequestChannels`; each key maps to `{ args: [...]; result: T }`.
 * The preload-side `invoke<K>()` helper (see `./ipc-invoke.ts`) uses these
 * types for full autocomplete + compile-time safety. Grep-able channel names
 * are the primary observability — a channel name tells you exactly where the
 * handler lives in main and where the caller lives in renderer without touching
 * a debugger.
 *
 * Scale-match trigger (FU-3): at >20 channels, migrate baseline to
 * `@electron-toolkit/typed-ipc` or `@egoist/tipc`. Currently ~8 channels.
 */

import type { OkDesktopConfig } from './bridge-contract.ts';

/** Recent-project row as surfaced to the Navigator. */
export interface RecentProject {
  path: string;
  name: string;
  lastOpenedAt: string;
  /** true if the folder no longer exists on disk (rendered dimmed with "Missing" badge). */
  missing?: boolean;
}

/** Project-open request payload (IPC `ok:project:open`). */
export interface ProjectOpenRequest {
  path: string;
  /**
   * Per D3 revised: every project open spawns a new editor BrowserWindow.
   * `target: 'new-window'` is the only supported value in M1 — the field is
   * kept for forward-compat if a future spec re-introduces switch-in-current-window.
   */
  target: 'new-window';
}

export interface RequestChannels {
  /** Open native folder-picker (`showOpenDialog({ properties: ['openDirectory'] })`). */
  'ok:dialog:open-folder': { args: []; result: string | null };
  /** Open native folder-picker with create-directory enabled. */
  'ok:dialog:create-folder': { args: []; result: string | null };
  /** Outbound URL via `shell.openExternal` (D47 scheme allowlist enforced in main handler). */
  'ok:shell:open-external': { args: [url: string]; result: undefined };
  /** Clipboard text write (IPC-relay — renderer is sandboxed). */
  'ok:clipboard:write-text': { args: [text: string]; result: undefined };
  /** Read the current window's config (projectPath, collabUrl, etc.). */
  'ok:project:get-info': { args: []; result: OkDesktopConfig };
  /** Read the LRU-capped recent-projects list from app state. */
  'ok:project:list-recent': { args: []; result: RecentProject[] };
  /** Request main to open a project (always spawns new editor window per D3 revised). */
  'ok:project:open': { args: [request: ProjectOpenRequest]; result: undefined };
  /** Request main to close the current project's window. */
  'ok:project:close': { args: []; result: undefined };
}

export type RequestChannelName = keyof RequestChannels;
