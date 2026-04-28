# Evidence: D8 — VS Code Profiles Internals

**Dimension:** Mechanics, lifecycle, and edge cases of VS Code Profiles. Extends D2.6 / D2.12 / D2.13 with implementation depth.
**Date:** 2026-04-25
**Sources:** code.visualstudio.com release notes (v1_75 through v1_94); microsoft/vscode source (`userDataProfile.ts`, `extensionsScannerService.ts`, commit `1b291302`); GitHub issues #208710, #196718.

---

## Key files / pages referenced

- `https://code.visualstudio.com/updates/v1_75` — Profiles GA (Jan 2023), initial 6-category bundle
- `https://code.visualstudio.com/updates/v1_76` — Profile badge UI; per-workspace association mechanics
- `https://code.visualstudio.com/updates/v1_78` — Profile Templates (Python, Java, Data Science, etc.)
- `https://code.visualstudio.com/updates/v1_79` — Extension host restart on profile switch
- `https://code.visualstudio.com/updates/v1_81` — Partial Profiles (`useDefaultFlags`); "Apply to all Profiles"
- `https://code.visualstudio.com/updates/v1_92`–`v1_94` — Profiles Editor preview → GA → folder/workspace section
- `https://github.com/microsoft/vscode/blob/main/src/vs/platform/userDataProfile/common/userDataProfile.ts` — `IUserDataProfile`, `ProfileResourceType`, `StoredProfileAssociations`, `removeProfile()`
- `https://github.com/microsoft/vscode/issues/208710` — Profile Sync data-loss on delete-and-recreate (closed via PR #209343)
- `https://github.com/microsoft/vscode/issues/196718` — `isApplicationScoped` flag doesn't sync cleanly

---

## Findings

### Finding D8.1: Profiles GA in 1.75 (Jan 2023); the source-of-truth resource enum has grown to 8 categories
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/updates/v1_75`; `microsoft/vscode/src/vs/platform/userDataProfile/common/userDataProfile.ts`

```text
v1.75 release: "A Profile can include extensions, settings, keyboard shortcuts,
                UI state, tasks, and user snippets."  (6 categories at GA)

Current source enum:
export const enum ProfileResourceType {
  Settings = 'settings',
  Keybindings = 'keybindings',
  Snippets = 'snippets',
  Prompts = 'prompts',         // post-GA addition (chat/Copilot prompts)
  Tasks = 'tasks',
  Extensions = 'extensions',
  GlobalState = 'globalState', // always-present partition key, not user-visible
  Mcp = 'mcp'                  // post-GA addition
}

IUserDataProfile interface also carries: agentPluginsHome, cacheHome, isTransient, workspaces.
```

**Implication:** The parent report's D2.12 said "7 categories." Source-of-truth enum has 8. Two categories (`Prompts`, `Mcp`) were added post-GA as VS Code grew Copilot/agent and MCP support; `GlobalState` is a partition key not surfaced in the docs.

### Finding D8.2: Workspace-profile binding stored in user-data state service, opaque to the project tree
**Confidence:** CONFIRMED
**Evidence:** `microsoft/vscode/src/vs/platform/userDataProfile/common/userDataProfile.ts`

```text
protected static readonly PROFILE_ASSOCIATIONS_KEY = 'profileAssociations';

export type StoredProfileAssociations = {
  workspaces?: IStringDictionary<string>;    // workspace URI → profile id
  emptyWindows?: IStringDictionary<string>;  // window id      → profile id
};

this.stateService.setItem(PROFILE_ASSOCIATIONS_KEY, storedProfileAssociations);
```

**Implication:** Nothing in `.vscode/` indicates which Profile is bound. The user can't inspect the binding from the project tree, and the binding can't be checked into VCS. Structurally different from `.code-workspace`, which carries its own state in-band.

### Finding D8.3: Deleting a bound Profile silently orphans its workspaces — no automatic fallback record kept
**Confidence:** CONFIRMED
**Evidence:** `userDataProfile.ts` `removeProfile()` and `getProfileForWorkspace()`

```text
async removeProfile(profileToRemove: IUserDataProfile): Promise<void> {
  if (profileToRemove.isDefault) {
    throw new Error('Cannot remove default profile');
  }
  this.updateProfiles([], [profile], []);
}

getProfileForWorkspace(workspaceIdentifier): IUserDataProfile | undefined {
  // returns undefined if profile no longer exists — no fallback logic
}
```

The Default Profile cannot be deleted (hard error). For non-default deletion, subsequent `getProfileForWorkspace` calls for the orphaned workspace return `undefined`; the open-folder code path silently uses the Default Profile. The escape hatch is `Developer: Reset Workspace Profiles Associations`.

**Implication:** The parent report didn't address "what happens when bound profile is gone." Answer: silent degrade to Default. Not surfaced to the user.

### Finding D8.4: Per-profile filesystem layout is fixed; Partial Profiles flip per-resource pointers to the Default Profile
**Confidence:** CONFIRMED
**Evidence:** `userDataProfile.ts`

```text
this.profilesHome = joinPath(userRoamingDataHome, 'profiles');
// per profile location = joinPath(profilesHome, <id>)

settingsResource:    joinPath(location, 'settings.json')
keybindingsResource: joinPath(location, 'keybindings.json')
tasksResource:       joinPath(location, 'tasks.json')
extensionsResource:  joinPath(location, 'extensions.json')
mcpResource:         joinPath(location, 'mcp.json')
snippetsHome:        joinPath(location, 'snippets')
promptsHome:         joinPath(location, 'prompts')

// Partial Profile mechanism:
settingsResource: useDefaultFlags?.settings 
  ? defaultProfile.settingsResource 
  : joinPath(location, 'settings.json'),

export type UseDefaultProfileFlags = { [key in ProfileResourceType]?: boolean };
```

**Implication:** Each profile is fully self-contained at `…/User/profiles/<id>/{settings,keybindings,tasks,extensions,mcp}.json` plus `snippets/` and `prompts/` subdirs. "Apply to all Profiles" / Partial Profile flips per-resource pointers to the Default Profile's files (literal redirect, not a copy). Explains why "Apply Setting to all Profiles" is fast.

### Finding D8.5: MCP servers live at `…/User/profiles/<id>/mcp.json`; profile switch restarts the extension host (and therefore every MCP server)
**Confidence:** CONFIRMED (path); INFERRED (MCP-restart-on-switch from extension-host-restart)
**Evidence:** `userDataProfile.ts`; `code.visualstudio.com/updates/v1_79`

```text
mcpResource: joinPath(location, 'mcp.json')

v1.79 release: "when you switch profiles, VS Code restarts the extension host
                to handle running a different set of extensions for that profile."
```

For Default Profile, `mcp.json` lives at `…/User/mcp.json`. MCP server lifecycle is owned by the extension host, so a profile switch terminates running MCP servers and re-spawns them from the new profile's `mcp.json`.

**Implication:** Long-lived stateful MCP servers cannot survive a profile flip. Parent D2.13 noted MCP user-config is profile-bound but didn't surface this runtime cost.

### Finding D8.6: Extension binaries are shared on disk; per-profile state is a metadata manifest. "Apply to all Profiles" toggles `isApplicationScoped`
**Confidence:** CONFIRMED
**Evidence:** `microsoft/vscode/src/vs/platform/extensionManagement/node/extensionsScannerService.ts`; commit `1b291302df…`

```text
ExtensionsScannerService takes:
  - URI.file(environmentService.builtinExtensionsPath)   // shared
  - URI.file(environmentService.extensionsPath)          // shared user dir

Per-profile manifest: extensionsResource = joinPath(location, 'extensions.json')

Commit 1b291302 ("Apply Extension to all Profiles"):
  - new toggleApplicationScope() method
  - "iterate through each profile, updating metadata or copying the extension as needed"
  - isApplicationScoped flag on extension metadata controls scope
```

**Implication:** The `.vsix` payload sits once in the shared user extensions directory; each profile's `extensions.json` lists which IDs are "installed" in that profile. Switching profiles flips the manifest, not the disk content. Issue #196718: when sync runs across machines, "Apply to all Profiles" doesn't carry the `isApplicationScoped` flag cleanly.

### Finding D8.7: New profiles can be created from Empty / Template / Fork / `.code-profile` import — all routes use the same `createFromProfile` API; fork is a snapshot, not a live link
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/docs/configure/profiles`; `code.visualstudio.com/updates/v1_78`; `userDataProfile.ts` `IUserDataProfileImportExportService`

```text
Built-in Profile Templates (since 1.78): Python, Java, Data Science,
  Doc Writer, Node.js, Angular, Java General, Java Spring

Service signature:
  createFromProfile(from: IUserDataProfile, options: IUserDataProfileCreateOptions)
  resolveProfileTemplate(uri: URI)  // .code-profile URI or GitHub gist URL
```

A fork is a snapshot — subsequent edits in the source profile do NOT propagate, since per-resource files are copied at fork time. Exception: Partial Profiles, where `useDefaultFlags` keeps live pointers to Default Profile resources.

**Implication:** Four distinct routes converge on one API but have different semantics. Worth knowing for the parent report's "what does Profile creation actually do" question.

### Finding D8.8: `.code-profile` schema is `IUserDataProfileTemplate` — flat object, no version envelope
**Confidence:** CONFIRMED
**Evidence:** `microsoft/vscode/src/vs/workbench/services/userDataProfile/common/userDataProfile.ts`

```text
export interface IUserDataProfileTemplate {
  readonly name: string;        // required
  readonly icon?: string;       // optional
  readonly settings?: string;   // optional, JSON-serialized payload
  readonly keybindings?: string;
  readonly tasks?: string;
  readonly snippets?: string;
  readonly globalState?: string;
  readonly extensions?: string;
  readonly mcp?: string;
}
// validated via isUserDataProfileTemplate type guard

ExportFlags select which resource keys to populate:
  exportProfile(profile, exportFlags?: ProfileResourceTypeFlags)
```

**Implication:** Each resource field is a string (the file's serialized contents). No header / version / footer envelope. Tools could read/write `.code-profile` files without round-tripping through VS Code. Note: GlobalState IS exported even though not surfaced in the user-facing categories list.

### Finding D8.9: Profile-Sync identity is by NAME, not by ID — produces documented data-loss bugs on delete-and-recreate cycles
**Confidence:** CONFIRMED
**Evidence:** `github.com/microsoft/vscode/issues/208710`

```text
Issue 208710 ("Profile Sync keeps deleting my profiles"):
"When a profile is deleted and recreated on one machine, then synced to another
 machine, the recreation gets deleted during the subsequent sync cycle."

Closed via PR #209343, marked candidate-next-release, high-priority.

Issue 196718 ("Applying an extension to all Profiles does not sync properly"):
isApplicationScoped flag does not propagate cleanly across machines via Sync.
```

**Implication:** Sync treats profiles as named-keyed entities. Delete-on-A-then-recreate-on-B with the same name historically produced sync conflicts the resolver did not anticipate. Practical: cross-machine profile management is fragile to delete-and-recreate.

### Finding D8.10: Profile-resource changes apply live; profile switches restart the extension host (not a full window reload)
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/updates/v1_79`; `code.visualstudio.com/updates/v1_81`

```text
v1.79: "when you switch profiles, VS Code restarts the extension host..."
v1.81: "Preferences: Open User Settings (JSON)" command opens
       profile-specific files in non-default profiles ...
       "Preferences: Open Application Settings (JSON)" accesses
       application-scoped settings instead.
```

Editing a profile's `settings.json` applies live (same machinery as User settings). Profile switching is heavier — extension host restart, not full window reload. Profile rename, icon change, and Partial-Profile flag toggles are metadata-only and don't restart anything.

**Implication:** Disambiguates "Reload Required" semantics for profile operations. Full `window.reload()` is reserved for actions VS Code can't service in-place — engineered AWAY from for profile switching.

### Finding D8.11: Concurrent-window behavior — profile lifecycle changes propagate via typed IPC, but cross-window profile-binding changes always surface as a reload prompt, never a silent switch
**Confidence:** CONFIRMED for same-process (single Electron instance); INFERRED for separate-process / shared `--user-data-dir`
**Evidence:** Added 2026-04-26 from focused source-code investigation. Citations:
- `microsoft/vscode/src/vs/code/electron-main/app.ts:1235-1237` — IPC channel registration
- `microsoft/vscode/src/vs/platform/userDataProfile/common/userDataProfileIpc.ts:57-85` — renderer-side listener
- `microsoft/vscode/src/vs/workbench/services/userDataProfile/browser/userDataProfileManagement.ts:46-65, 177-210` — reload-prompt path
- `microsoft/vscode/src/vs/workbench/electron-browser/desktop.main.ts:266-268` — per-window snapshot at startup
- `microsoft/vscode/src/vs/platform/configuration/common/configurationModels.ts:505-527` — `IFileService` watch on `settingsResource`

```text
// app.ts (electron-main): main service exposed as IPC channel
mainProcessElectronServer.registerChannel('userDataProfiles', userDataProfilesService);

// userDataProfileIpc.ts (renderer, runs in every window):
this._register(this.channel.listen<DidChangeProfilesEvent>('onDidChangeProfiles')(e => {
  // re-revive URIs, update _profiles, fire local _onDidChangeProfiles
}));

// userDataProfileManagement.ts (eager singleton per window):
this._register(userDataProfilesService.onDidChangeProfiles(e => {
  if (e.removed.some(profile => profile.id === this.userDataProfileService.currentProfile.id)) {
    // ... reload prompt: "The current profile has been removed. Please reload..."
  }
  const updatedCurrentProfile = e.updated.find(p => this.userDataProfileService.currentProfile.id === p.id);
  if (updatedCurrentProfile) {
    // ... reload prompt: "The current profile has been updated. Please reload..."
  }
}));

// desktop.main.ts: per-window currentProfile is captured at window-open
const userDataProfileService = new UserDataProfileService(
  reviveProfile(this.configuration.profiles.profile, ...)
);
```

**Per-scenario answers (within one Electron instance):**

| Scenario | Behavior |
|----------|----------|
| Window A edits `settings.json` of the shared profile | Window B picks up the change live via `IFileService` watch on `settingsResource` — same path as for an external editor, no profile-specific IPC needed |
| Window A switches to a different profile (`Profiles: Switch Profile`) on shared workspace | Window B keeps its old `currentProfile`, receives `onDidChangeProfiles` (because the previous profile's `workspaces` array no longer contains this workspace), shows: *"The current workspace has been removed from the current profile. Please reload to switch back to the updated profile."* B does NOT silently switch |
| Window A deletes the profile that Window B has active | Window B sees `e.removed` containing its current profile, shows: *"The current profile has been removed. Please reload to switch back to default profile."* B keeps reading from the now-orphaned `profile.location` (which `removeProfile` does NOT delete — only `cacheHome` is removed; the location folder is cleaned by `cleanUp()` on a later startup) |
| Window A renames the profile that Window B has active | Goes through `updateProfile` → `e.updated`. Window B's name in UI updates only after reload; prompt fires: *"The current profile has been updated. Please reload to switch back to the updated profile."* |
| A new window opens the workspace whose binding was just changed in a third window | The new window calls `userDataProfilesMainService.getProfileForWorkspace(workspace)` at open time — latest binding wins. Already-open windows are unaffected until they reload |

**Mechanism summary:** Every renderer window subscribes to a typed IPC channel registered via `ProxyChannel.fromService(IUserDataProfilesMainService)`. The channel auto-broadcasts every `Event` property of the service — including `onDidChangeProfiles` — to all renderers. Renderer-side `UserDataProfilesService` re-fires the event into the workbench. The eager-singleton `UserDataProfileManagementService` per window decides reload-vs-restart-extension-host. Per-window `currentProfile` is a *snapshot* taken at window-open from `this.configuration.profiles.profile` and never re-derived from `profileAssociations` — so live binding propagation requires the IPC event path, not state-service polling.

**Multi-process / shared `--user-data-dir` scenario** (Linux/Windows can configure multi-instance; macOS default is single-instance): live propagation does NOT cross process boundaries. Each OS-level VS Code process instantiates its own `UserDataProfilesMainService`, reading from the same `state.json` once and invalidating `_profilesObject` only via same-process `updateStoredProfiles()` calls. There is no file watcher on the state file. Writes by one process are not seen by the other until that other process restarts. INFERRED from architecture (no test or issue directly covers it).

**Implication:** The "concurrent-window propagation" question collapses to: *settings edits live, profile binding changes via reload prompt, never silent switch*. The state-service binding being "per-workspace-URI not per-window" doesn't lead to surprise behavior because the per-window `currentProfile` snapshot decouples from the state at window-open. Cross-process is the one residual unknown.

---

## Negative searches

* **`.code-profile` JSON schema with explicit version field/envelope** — searched docs + `userDataProfile.ts` source. NOT FOUND. The format is a flat `IUserDataProfileTemplate` shape; no `version` / `schema` / `kind` envelope.
* **Per-OS path of `mcp.json` for Default Profile in MCP docs** — NOT FOUND in docs page. Inferred from `userDataProfile.ts`: Default Profile uses `…/User/mcp.json`, non-default `…/User/profiles/<id>/mcp.json`.
* **GitHub issues for concurrent-window profile-propagation hazards** — searched `microsoft/vscode` issues for `"two windows" + profile`, `"second window" + profile + concurrent`, `"another window" + "in use" + profile` (accessed 2026-04-25). No open or recently-closed bug specifically describing a concurrent-window propagation hazard. Confirms Finding D8.11 is solid: behavior is by-design (reload prompt, not silent switch) and not a known bug class.

---

## Gaps / follow-ups

* **Profile-name collision UX during sync conflict resolution** — issue #208710 is fixed but the conflict-resolution UI's behavior for "two profiles with same name on two machines" is undocumented.
* **`agentPluginsHome` and `prompts` directory contents** — in `IUserDataProfile` but not exposed in user-facing categories. What lives there (Copilot agent plugins? chat prompt files?) and whether they sync.
* **`isTransient` profile lifecycle** — transient profiles skip `saveStoredProfiles()` and are cleaned by `cleanUpTransientProfiles()`. When are they used (extension dev host? troubleshooting?).
* **Multi-process / shared `--user-data-dir` scenario** (D8.11 residual) — INFERRED from architecture; would need an upstream test or manual reproduction with two separately-launched processes to confirm "no live cross-process propagation."
