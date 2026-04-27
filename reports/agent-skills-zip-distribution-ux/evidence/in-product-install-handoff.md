# Evidence: In-Product Install Hand-off Patterns for Skills Distribution

**Captured:** 2026-04-24
**Dimension covered:** Dim 4 (In-product install hand-off patterns)
**Confidence summary:** HIGH on the negative verdict for Claude Desktop/Cowork automation hooks; HIGH on adjacent-ecosystem UX patterns (all first-party documented); MEDIUM on the "is there something Anthropic will ship next" forward-look (drawn from open issues, no roadmap commitment).

---

## Primary sources consulted

### Anthropic / Claude Desktop / Claude Cowork
- [Use Skills in Claude (support article)](https://support.claude.com/en/articles/12512180-use-skills-in-claude) — canonical human-UI install path for personal skills ("Customize > Skills > +").
- [How to create custom Skills](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills) — ZIP packaging and validation errors surfaced to the user.
- [Provision and manage Skills for your organization](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization) — org-admin upload-or-GitHub-sync path (Team/Enterprise only).
- [Building Desktop Extensions with MCPB](https://support.claude.com/en/articles/12922929-building-desktop-extensions-with-mcpb) — the `.mcpb` install dialog in Claude Desktop.
- [One-click MCP server installation for Claude Desktop (Anthropic engineering)](https://www.anthropic.com/engineering/desktop-extensions) — double-click / drag-drop / Settings install paths for `.mcpb`.
- [Claude Desktop: custom URL schemes are not opened by OS — Issue #26952](https://github.com/anthropics/claude-code/issues/26952) — confirms Claude Desktop's link handler is filtered to `http(s)://` only; closed as not-planned.
- [Add deep linking support — Issue #10366](https://github.com/anthropics/claude-code/issues/10366) — proposed `vscode://anthropic.claude-code/chat/<id>`; closed as not-planned.
- [Desktop Extension MCP servers not passed to Cowork VM — Issue #26259](https://github.com/anthropics/claude-code/issues/26259) — stdio bridge bug, open (referenced by parent report).
- [gh skill as remote skill source — Issue #50148](https://github.com/anthropics/claude-code/issues/50148) — explicitly confirms "Desktop users currently have no remote source option at all."

### Cross-ecosystem
- [Cursor — MCP install links](https://cursor.com/docs/context/mcp/install-links) — `cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=<base64>`.
- [Cursor security advisory GHSA-r22h-5wp2-2wfv](https://github.com/cursor/cursor/security/advisories/GHSA-r22h-5wp2-2wfv) — explicit hardening of the install-dialog as a security surface.
- [VS Code — Extension Marketplace](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace) — Marketplace + VSIX sideload + `--install-extension` CLI.
- [VS Code — MCP API guide (extension-guides/ai/mcp)](https://code.visualstudio.com/api/extension-guides/ai/mcp) — `vscode:mcp/install?<url-encoded-json>` + `code --add-mcp`.
- [Raycast — Deeplinks API](https://developers.raycast.com/information/lifecycle/deeplinks) — `raycast://extensions/<author>/<ext>/<cmd>` + mandatory confirmation dialog.
- [Raycast — Install an Extension](https://developers.raycast.com/basics/install-an-extension) — "Install Extension" button on the web store.
- [Obsidian — Community plugins help](https://obsidian.md/help/community-plugins) — in-app browser install.
- [Obsidian — Manually add a community plugin (forum)](https://forum.obsidian.md/t/manually-add-a-community-plugin/65053) — manual `.obsidian/plugins/<id>/` install.
- [Mozilla — Install Firefox add-ons](https://support.mozilla.org/en-US/kb/find-and-install-add-ons-add-features-to-firefox) — Add to Firefox button + "Install Add-on from file" (manual).
- [Mozilla — Temporary installation in Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) — `about:debugging` unsigned load.
- [MCPB — modelcontextprotocol/mcpb](https://github.com/modelcontextprotocol/mcpb) — MCPB (ex-DXT) bundle format and install mechanics.
- [Anthropic — Desktop Extensions engineering post](https://www.anthropic.com/engineering/desktop-extensions) — double-click + drag-drop + Settings install path.
- [Chrome — Inline-installation deprecation FAQ](https://developer.chrome.com/docs/extensions/mv2/inline-faq) — evidence for the 2018 removal of off-store `chrome.webstore.install()`.
- [Chrome — Install and manage extensions](https://support.google.com/chrome_webstore/answer/2664769) — standard "Add to Chrome" UX.
- [Chrome — External install docs (dev)](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions) — preferences-file + registry external install, Developer-mode "Load unpacked", CRX restrictions.
- [Zed — Installing Extensions](https://zed.dev/docs/extensions/installing-extensions) — Extension Gallery + "Install Dev Extension" sideload path.
- [Zed — CLI Reference](https://zed.dev/docs/reference/cli) — `cli: install` command-palette action.
- [Apple — Import shortcuts on Mac](https://support.apple.com/guide/shortcuts-mac/import-shortcuts-apd02bffbaac/mac) — double-click / drag-drop `.shortcut` import.
- [Apple — Open a shortcut using URL scheme](https://support.apple.com/guide/shortcuts-mac/apda283236d7/mac) — `shortcuts://` + `shortcuts://import-shortcut/?url=<url>` (with optional silent flag).
- [Electron — `app.setAsDefaultProtocolClient`](https://www.electronjs.org/docs/latest/api/app) — macOS Info.plist requirement, Windows/Linux differences.
- [Electron — `shell.showItemInFolder`](https://www.electronjs.org/docs/latest/api/shell) — "reveal file in Finder / Explorer" primitive available to our own Electron app.
- [Figma — Open links in the desktop app](https://help.figma.com/hc/en-us/articles/360039824334-Open-links-in-the-desktop-app) — `figma://` URL scheme pattern.

### Cross-harness registries / installers (cross-referenced from parent report)
- [supermemoryai/install-mcp](https://github.com/supermemoryai/install-mcp) — CLI installer across 7 harnesses.
- [neondatabase/add-mcp](https://github.com/neondatabase/add-mcp) — the other cross-harness installer.
- [smithery-ai/cli](https://github.com/smithery-ai/cli) — commercial registry.
- [vercel-labs/skills](https://github.com/vercel-labs/skills) — the `skills` npm package our CLI already shells out to.

---

## Claude Desktop / Cowork capability surface

### URL schemes registered by Claude Desktop

**Finding:** Claude Desktop does register some URL schemes, but **no MCP-install or Skills-install scheme exists**, and even its existing schemes are minimal in scope.

Evidence:

- **Issue #26952 (closed "not planned")** is the canonical signal. The bug report was not a feature request for `claude://mcp/install` — it was that Claude Desktop's **outbound** "Open external link" dialog filters to only `http(s)://`, dropping *inbound* clicks on custom schemes that MCP tool responses return (e.g. `carebrief://`). Anthropic closed it without accepting a fix. Quote from the issue: *"Clicking 'Open link' should pass the URL to the OS via `shell.openExternal()` (Electron), which hands it to the registered URL scheme handler. The native app should open."* Anthropic declined.
- **Issue #10366** specifically proposed a deep-link scheme (`vscode://anthropic.claude-code/chat/<session-id>`) to open Claude Code chats programmatically. Also **closed as not planned** — Anthropic declined to wire up session-level deep-links even for their own VS Code integration.
- Evidence from the `url-handler-napi` NAPI package *does* show Claude Code (the terminal CLI) has a `claude://resume?session=...` handoff scheme for handing OAuth flows and session hand-offs from the CLI to the Claude Desktop app ([deepwiki/audio-modifiers-and-url-handler](https://deepwiki.com/claude-code-best/claude-code/12.2-audio-modifiers-and-url-handler); confidence MEDIUM — deepwiki is a community wiki, not first-party). Crucially: this scheme targets **session resume and OAuth callback**, NOT extension/MCP/Skill install. The URL Handler app on macOS installs to `~/Applications/` and recreates itself every ~24 hours (issue #41015).
- Parent report's `deeplinks-and-registries.md` summarizes: *"Anthropic has not shipped a `claude://mcp/install` deep-link. Claude Desktop's Electron shell doesn't forward custom URL schemes at all."*

**Implication:** There is no `claude://` install endpoint Open Knowledge can route users through for Skills. Even if we wanted to build something like `claude://install-skill?url=<zip-url>`, no handler exists and Anthropic has twice (#26952, #10366) closed adjacent feature requests as not-planned.

### Filesystem drop-target for Skills

**Finding:** The **canonical filesystem path for Skills (`~/.claude/skills/<name>/SKILL.md`) works for Claude Code CLI, but NOT Claude Cowork**. For Cowork there is no deterministic drop-target a third-party can write.

Evidence (cross-referenced from parent report `cowork-skills-surface-update-2026-04-24.md`):

- Our existing `skill-install.ts` uses `npx skills@~1.5.0 add <path> --agent '*' -g -y --copy`, which writes into `~/.claude/skills/` for the `claude-code` target. Claude Code picks these up at next session.
- **Cowork does NOT read from `~/.claude/skills/`.** The Cowork VM is a per-session synthetic filesystem. Issue [#31422](https://github.com/anthropics/claude-code/issues/31422) documents the actual path layout:
  - Built-in (read-only): `~/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/.../skills/` on macOS — Anthropic-reserved for the 6 built-in skills.
  - User-session-ephemeral: `~/.config/Claude/local-agent-mode-sessions/.../local_<uuid>/.claude/skills/` — wiped on session cleanup.
  - The per-session UUID prefix is allocated at session start, so no third-party installer can pre-populate a deterministic location.
- Issue #31422 original reporter claims they *"successfully symlinked skills from a centralized `~/.claude/skills/` directory into Cowork's skills-plugin directory and verified they were readable inside the VM"* — but this is a **single-reporter, undocumented internal directory** hack with zero Anthropic engagement, and #26998 reports the Windows skills directory is "empty or inaccessible" at all, so the symlink is not cross-platform.
- Anthropic's only **sanctioned** install paths for Cowork are manual ZIP upload via `Customize > Skills > +` (personal) or org-admin upload / GitHub-sync (Team+ only; Owner role) — both human-UI-only, both affected by open "metadata registered but SKILL.md not mounted" bugs (#26254, #31542, #39400) with zero Anthropic staff engagement.

**Implication:** For Cowork, we cannot "drop a file and have it load." The only path is the UI.

### File-association behavior (.zip "Open with Claude")

**Finding:** Claude Desktop has NO registered file association for `.zip` (or for a dedicated `.skill.zip`). The `.mcpb` extension IS registered — but `.mcpb` is a different format from Skills and is for MCP servers, not Skills.

Evidence:

- The Claude support article [Use Skills in Claude](https://support.claude.com/en/articles/12512180) describes only the UI upload path: *"navigate to Customize > Skills, click the + button, then + Create skill and upload a ZIP file."* No "double-click the ZIP" or "drag into Claude Desktop" path is documented for Skills.
- The Anthropic engineering post [Desktop Extensions](https://www.anthropic.com/engineering/desktop-extensions) documents **only the MCPB install dialog**. Quote: *"Download a `.mcpb` file, double-click to open with Claude Desktop, click 'Install'."* The dialog is MCPB-specific, not a generic "install this file as a skill" surface. There is no equivalent flow for `.skill.zip` or Skills ZIPs.
- Cross-checking the MCPB docs ([support.claude.com/12922929](https://support.claude.com/en/articles/12922929-building-desktop-extensions-with-mcpb), [github.com/modelcontextprotocol/mcpb](https://github.com/modelcontextprotocol/mcpb)): MCPB IS an install-via-double-click format. The install dialog is invoked via (1) double-click in Finder, (2) drag onto Claude Desktop window, (3) Settings → Extensions → Advanced → Install Extension. **MCPB is Claude-Desktop-only (Chat tab)** — Cowork does not accept MCPB for Skills. MCPB installs MCP *servers*, not Skills, and the formats are distinct (MCPB has `manifest.json` + server code; Skills ZIPs have `SKILL.md` YAML frontmatter + optional reference files).
- No Anthropic doc describes a `.skill` or `.skill.zip` file association. Issue #50148 explicitly states: *"Desktop users currently have no remote source option at all."*

**Implication:** Even if we renamed our bundle to `ok-skill.mcpb`, MCPB installs MCP servers into Desktop Chat's connector system, not Skills into Cowork — wrong target. Skills have no file-association install path.

### Deep-link to Customize > Skills panel

**Finding:** No documented deep-link exists to open Claude Desktop directly to the Skills panel. We cannot URL-scheme the user to "already focused on the upload button."

Evidence:

- Searched Anthropic docs + claude-code GitHub issues for any `claude://settings`, `claude://customize`, `claude://skills`, or equivalent hash-path into the Electron app. **NOT FOUND.**
- Claude Code CLI has `claude://resume?session=...` for session handoff; no `/settings/*` paths are documented.
- Even for existing deep-links, the user's Claude Desktop *window* may not be visible — Electron apps get `open-url` events but must explicitly focus their own windows. There is no documentation that Claude Desktop's handler focuses the Customize > Skills panel.

**Implication:** The best we can do via URL scheme is open Claude Desktop generically — the user still has to manually click `Customize > Skills > +`. And even that generic-open would rely on Claude Desktop's existing schemes, which don't accept app-navigation hashes.

### Documented install-skill URL

**Finding:** NOT FOUND. There is no documented `claude://install-skill?url=...`, no `--install-skill` CLI flag on any Anthropic binary, and no programmatic API (HTTP / MCP tool / Anthropic SDK) for installing a skill into Claude Desktop or Cowork from a third-party process.

Evidence:

- Parent report's `cowork-skills-surface-update-2026-04-24.md` Finding 3 (CONFIRMED): *"The only Anthropic-sanctioned install paths for Cowork skills are (a) UI upload and (b) org-admin ZIP / GitHub-sync provisioning."*
- Issue [#50148 (gh skill)](https://github.com/anthropics/claude-code/issues/50148) explicitly confirms: *"Claude Desktop: No remote source option"*. This is a 2026-04-open feature request, and its existence is itself evidence that no programmatic install mechanism currently exists.

### Net verdict: what automation is possible

**ZERO.** For personal users on Claude Desktop (including Cowork sessions), the only install path for an Open Knowledge skill is:

1. User downloads `openknowledge.skill.zip` from our website / CLI / desktop app.
2. User opens Claude Desktop.
3. User clicks `Customize > Skills` in the sidebar.
4. User clicks `+` then `+ Create skill`.
5. User clicks `Upload a skill`.
6. User selects the downloaded ZIP.
7. Claude validates the ZIP (ZIP root structure, `SKILL.md` present, name matches folder, valid YAML frontmatter).
8. Skill appears in the user's Skills list with a toggle.

Every step requires a human in the UI. **We can do NOTHING with automation except pre-stage the download and show the user where to click.** The one automation we can add is: our Electron app can `shell.showItemInFolder(downloadPath)` (Electron API) to reveal the ZIP in Finder at the exact moment the user needs to pick it, and `shell.openExternal("<our-documentation-with-screenshots-url>")` to show the step sequence.

For org-admin provisioning (Team/Enterprise Owner role), Anthropic offers a second path via `Organization settings > Plugins` where Owners can upload a ZIP or GitHub-sync a marketplace repo (`owner/repo` format). That path, too, is UI-only and affected by open mount-bug class #26254/#31542/#39400.

---

## Adjacent ecosystems — UX patterns

### 1. Chrome Web Store + unpacked sideload

**Canonical in-store flow ("Add to Chrome"):**

1. User visits the extension's Web Store page (`chromewebstore.google.com/detail/<id>`).
2. Clicks blue **"Add to Chrome"** button.
3. Chrome shows a native **confirmation dialog** listing the extension's requested permissions ("Read and change data on websites you visit"; "Access your tabs"; etc.).
4. User clicks **"Add extension"** (or "Cancel").
5. On confirmation, Chrome downloads and installs the `.crx` atomically. No restart required.
6. Chrome briefly animates the toolbar icon and surfaces an "Extension added" toast with a link to pin it.

Source quote ([support.google.com/chrome_webstore/2664769](https://support.google.com/chrome_webstore/answer/2664769)): *"When you try to install an extension, a dialog appears. Some extensions will let you know if they need certain permissions or data, and to approve, you select Add extension."*

**Key historical fact (relevant to Claude):** Prior to 2018, developers could embed an "Add to Chrome" button on their *own* website and invoke `chrome.webstore.install()` to trigger the dialog without leaving their site — called *inline install*. Google **removed this in December 2018** for security reasons. Per [developer.chrome.com/docs/extensions/mv2/inline-faq](https://developer.chrome.com/docs/extensions/mv2/inline-faq): *"users who move to install an extension from a third-party site will be automatically redirected to the Chrome Web Store to complete the installation."* This is directly analogous to Claude's current position — Anthropic-controlled UI is the only install surface, developers cannot host the install flow on their own site.

**Sideload paths (dev/enterprise):**

- **Unpacked (developer mode):** User enables Developer mode toggle on `chrome://extensions`, clicks **"Load unpacked"**, navigates to the extension's source folder, clicks OK. Extension loads immediately, marked with a dev badge, shows "This extension is unpacked" warnings.
- **`.crx` double-click:** **Disallowed** by Chrome on macOS (since Chrome 44) and Windows (since Chrome 33). Per [developer.chrome.com install-extensions doc](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions): *"As of Chrome 33, no external installs are allowed from a path to a local CRX file on Windows... As of Chrome 44, no external installs are allowed from a path to a local CRX file on Mac OS."* On Linux, the only supported path is preferences-file registration, not double-click.
- **Enterprise policies:** Admins can force-install via `ExtensionInstallForcelist` in `/etc/opt/chrome/policies/managed/` (Linux) or equivalent registry keys (Windows). User cannot decline.

**Can the source site deep-link into Chrome's UI?** Partially: Chrome Web Store URLs open in browser; the "Add to Chrome" button is browser-native because the page is `chromewebstore.google.com` (privileged origin). Off-store pages **cannot** trigger install.

**Acknowledgement back to source?** None. Third-party sites cannot detect whether install succeeded.

**Takeaway for Skills:** Chrome's 2018 inline-install removal is the **closest historical analogue** to Claude's current UI-only posture. Chrome solved this by making "click button → redirects to Chrome Web Store → user clicks Add to Chrome again" the canonical flow. The user traverses two URLs and two confirmation clicks, and that's accepted industry practice.

### 2. Firefox Add-ons (AMO) + manual .xpi

**Canonical AMO flow:**

1. User visits `addons.mozilla.org/addon/<name>`.
2. Clicks blue **"+ Add to Firefox"** button.
3. Firefox downloads the signed `.xpi`, then shows a **permissions dialog** ("This extension will have permission to: access tabs, read your browsing history...").
4. User clicks **"Add"** → extension installs.
5. Firefox shows a follow-up toast ("Private browsing: Allow this extension to run in Private Windows?") and pins the icon.

Per [support.mozilla.org — Find and install add-ons](https://support.mozilla.org/en-US/kb/find-and-install-add-ons-add-features-to-firefox): *"When you install an extension from addons.mozilla.org or a developer's website, Firefox will automatically download and install a file with a .xpi extension."*

**Off-AMO (signed) install:** Firefox uniquely allows *developer websites* to host and trigger `.xpi` installs directly, because Firefox accepts any `.xpi` signed by Mozilla — the signing is detached from AMO distribution. User clicks an install link on the vendor's site → Firefox shows the same permissions dialog.

**Manual .xpi install:**

1. Download the signed `.xpi` file to local disk.
2. Open Firefox, navigate to `about:addons`.
3. Click the gear icon, select **"Install Add-on from file…"**.
4. Pick the `.xpi`.
5. Standard permissions dialog appears.

**Unsigned .xpi (development only):**

- **Temporary install:** `about:debugging` → **"This Firefox"** → **"Load Temporary Add-on"** → pick `manifest.json` or `.xpi`. Removed on Firefox restart.
- **Permanent install in Developer Edition / Nightly:** set `xpinstall.signatures.required = false` in `about:config`, then drag the `.xpi` into `about:addons`. NOT possible in release Firefox.

**Acknowledgement:** None back to source site.

**Takeaway for Skills:** Firefox's *signed* off-AMO install path is what Skills would look like if Anthropic allowed a `.skill.zip` file association. The user clicks a link on our site; browser hands the file to Claude Desktop; Claude shows a permission dialog analogous to the Skill's YAML frontmatter. Today, Anthropic does not support this.

### 3. VS Code Extension install (marketplace + .vsix sideload + URL scheme)

**Marketplace flow:**

1. User presses `Cmd+Shift+X` (or clicks Extensions in Activity Bar).
2. Searches for extension name.
3. Clicks **Install** button.
4. **First-install from a publisher shows a "trust the publisher" dialog.** Per [code.visualstudio.com Marketplace doc](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace): *"When you first install an extension from a third-party publisher, VS Code shows a dialog prompting you to confirm that you trust the extension publisher."*
5. Extension installs hot — no restart.

**.vsix sideload (manual):**

1. Open Extensions view.
2. Click `...` menu → **"Install from VSIX..."**.
3. Pick the `.vsix` file.
4. Extension installs. *Auto-update is disabled* for VSIX-installed extensions.

**CLI:**

```
code --install-extension ms-python.python
code --install-extension /path/to/ext.vsix
```
Fully non-interactive. No confirmation.

**URL scheme — `vscode:extension/<id>`:** Opens VS Code → focuses the extension's Marketplace page inside the Extensions view. User still clicks Install.

**URL scheme — `vscode:mcp/install?<json>`** (MCP-specific, newer):

Format: `vscode:mcp/install?${encodeURIComponent(JSON.stringify({name, command, args, env}))}`

Per [VS Code MCP API guide](https://code.visualstudio.com/api/extension-guides/ai/mcp): *"install MCP servers from the command line with the `--add-mcp` VS Code command-line option."*

- Consent dialog always shown. Not silently installable.
- Matches Cursor's `cursor://...install` pattern, but with URL-encoded JSON rather than base64.

**Can the source site deep-link?** YES — VS Code registers `vscode://` on all platforms. The "Install" badge on Marketplace pages and many vendor sites emits `vscode:extension/<id>`.

**Acknowledgement:** None back to source.

**Takeaway for Skills:** VS Code has the *fullest* spectrum of install hooks of any editor in this survey — badge URL scheme + marketplace button + CLI flag + VSIX sideload. The pattern Claude Desktop would need to reach parity is: a `claude-desktop:skill/install?url=<zip-url>` URL handler that opens Claude Desktop, shows a permissions dialog pre-populated from the SKILL.md frontmatter, and writes to the user's skill library.

### 4. Cursor deeplink (MCP install)

Already covered extensively in parent report `deeplinks-and-registries.md`. Summary with UX emphasis:

**URL format:** `cursor://anysphere.cursor-deeplink/mcp/install?name=<name>&config=<base64-json>`

**Exact UX steps:**

1. User clicks a link on a vendor's website (e.g., `https://my-mcp.com/install` with the `cursor://...` anchor).
2. Browser prompts "Open Cursor?" (macOS standard protocol-handler confirmation).
3. User confirms → Cursor Desktop opens (launches if not running, focuses otherwise).
4. Cursor **confirmation dialog** shows:
   - Server name
   - The full `config` JSON (command, args, env) — explicitly shown in plain text
   - Two buttons: "Install" / "Cancel"
5. User clicks Install → config appended to `~/.cursor/mcp.json`.
6. Server becomes available in Cursor's MCP picker.

**Security-hardening:** [GHSA-r22h-5wp2-2wfv](https://github.com/cursor/cursor/security/advisories/GHSA-r22h-5wp2-2wfv) hardened the dialog to **always display full `args` and `env`** after an exploit where attackers constructed configs that truncated the visible display. The "one click" is architectural, not optional.

**Can the source site deep-link?** YES. The entire pattern is source-site-originated.

**Acknowledgement back to source?** None. The vendor does not know whether the user clicked Install or Cancel.

**Cancel/error path:** Standard — user clicks Cancel in the dialog; no state changes.

**Takeaway for Skills:** This is the **gold standard** for an install-handoff URL scheme we'd want Anthropic to ship. `claude://install-skill?url=<zip-url>&sig=<hmac>` would map 1:1 to this UX. It does not exist today.

### 5. DXT/MCPB bundle install (Claude Desktop Chat only)

**Canonical UX (per [anthropic.com/engineering/desktop-extensions](https://www.anthropic.com/engineering/desktop-extensions)):**

Three entry points:

1. **Double-click `.mcpb` in Finder / Explorer** — OS launches Claude Desktop, installation dialog appears.
2. **Drag-drop** the `.mcpb` file into Claude Desktop's window.
3. **Settings → Extensions → Advanced settings → Install Extension…** — file picker opens, user selects `.mcpb`.

**Installation dialog content:**

- Extension name, description, author (from `manifest.json`)
- Required permissions (declared in manifest)
- Configuration fields with validation (MCPB spec lets authors declare required config like API keys)
- **"Install"** button

After install → extension appears in Settings → Extensions, can be toggled on/off, server auto-starts with Claude Desktop.

**Browser "Open with Claude" hand-off:** Chrome remembers the user's prior "Always open files of this type" preference, so *after the first manual dialog dismissal*, subsequent `.mcpb` downloads auto-open Claude Desktop. Safari behaves similarly but more permissively.

**Scope:** **Claude Desktop Chat tab only.** Cowork does NOT use MCPB bundles for Skills — MCPB is for MCP connectors. Skills have no equivalent bundle-install format.

**CLI install?** NOT documented. `@anthropic-ai/mcpb` CLI only supports authoring (`mcpb init`, `mcpb pack`), not installing. There is no `claude install-mcpb` subcommand.

**Takeaway for Skills:** MCPB proves Anthropic CAN register a file association in Claude Desktop — they've done it for `.mcpb`. They have not done it for `.skill.zip`. A reasonable roadmap ask: unify these into one install surface (or ship a parallel `.skill` extension).

### 6. Raycast extensions

**Web store install:**

1. User visits `raycast.com/store/<ext-slug>`.
2. Clicks the **"Install Extension"** button in the top-right.
3. Browser prompts "Open Raycast?"
4. Raycast shows its confirmation dialog, then downloads + installs.

Per [developers.raycast.com/basics/install-an-extension](https://developers.raycast.com/basics/install-an-extension): *"press the Install Extension button in the top right corner and follow the steps in Raycast."*

**Deeplinks API (raycast://):**

Format: `raycast://extensions/<author>/<extension>/<command>`

**Crucially, deeplinks only LAUNCH commands — they do NOT install.** Per [developers.raycast.com — Deeplinks](https://developers.raycast.com/information/lifecycle/deeplinks): *"Deeplinks are Raycast-specific URLs you can use to launch any command, **as long as it's installed and enabled in Raycast**."*

**Confirmation:** Always shown. *"Whenever a command is launched using a Deeplink, Raycast will ask you to confirm that you want to run the command."*

**Takeaway for Skills:** Raycast's pattern is two URL scheme roles: one for install (tied to the store site's "Install Extension" button), one for run-only (for third-party integrations). A plausible Claude equivalent would be `claude://install-skill` vs `claude://run-skill?name=...`.

### 7. Obsidian community plugins + manual install

**In-app flow:**

1. Settings → **Community plugins** → Browse.
2. Search for plugin name.
3. Click the plugin tile → detail view.
4. Click **Install**.
5. Click **Enable** (separate step from install).

**Manual install (when plugin is not on the official registry):**

1. Download `main.js`, `manifest.json`, and optionally `styles.css` from the plugin's GitHub release (or build from source).
2. Create `<vault>/.obsidian/plugins/<plugin-id>/` folder where `<plugin-id>` matches the `id` field in `manifest.json`.
3. Copy the three files into that folder.
4. Optionally edit `<vault>/.obsidian/community-plugins.json` to add the plugin ID to the enabled-array: `["obsidian-rtl", ...]`.
5. In Obsidian, go to Settings → Community plugins → toggle the plugin on.

Per [forum.obsidian.md — Manually add a community plugin](https://forum.obsidian.md/t/manually-add-a-community-plugin/65053): the three essential files are `main.js`, `manifest.json`, and optionally CSS. Plugin must be toggled on manually after the drop-in.

**Hot-reload?** Obsidian picks up plugins on Settings → Community plugins view load. Some users report needing a full Obsidian restart if the plugin was added while Obsidian was running.

**Can the source site deep-link?** Obsidian has `obsidian://` URL scheme — it DOES support an `obsidian://install-plugin?id=<plugin-id>` variant that routes into the in-app community-plugin browser. For **non-registry** plugins, there's no equivalent.

**BRAT (Beta Reviewer's Auto-update Tool):** Community plugin that automates the "manual install from GitHub" path — users install BRAT once via the in-app store, then BRAT can install any `<user>/<repo>` from GitHub. Popular workaround for plugins that don't want to go through Obsidian's registry approval.

**Takeaway for Skills:** Obsidian models the fullest "manual drop-in" flow we could want, because their format (`main.js`+`manifest.json`+`styles.css`) is so lightweight that users *can* do it by hand. For Claude Skills, if Anthropic exposed a deterministic filesystem drop-target (`~/Library/Application Support/Claude/UserSkills/<name>/SKILL.md`), we could ship a CLI that does this automatically — the Obsidian manual path is the *template*. Today, no such Anthropic path exists.

### 8. Zed / Neovim / Emacs extension install

**Zed:**

- **Extension Gallery:** `Cmd+Shift+X` → browse → click Install. No confirmation dialog.
- **Sideload "dev extension":** Extension Gallery page → "Install Dev Extension" → pick a folder containing `extension.toml`. Per [zed.dev/docs/extensions/installing-extensions](https://zed.dev/docs/extensions/installing-extensions): *"click the Install Dev Extension button from the extensions page (or use the 'zed: install dev extension' action) and select the directory containing your extension."*
- **CLI:** No first-class `zed --install-extension` flag equivalent to VS Code's. However, `cli: install` command-palette action installs the `zed` CLI binary to `/usr/local/bin/zed`.
- **URL scheme:** Not documented as supporting install — `zed://` handles file-open only.

**Neovim / Vim:**

- Essentially: shell-command install via plugin manager. `lazy.nvim`, `packer.nvim`, `vim-plug`, etc. all follow the same pattern: user edits their `init.lua` or `.vimrc` to add the plugin's GitHub path, reloads config, and the plugin manager clones the repo. No GUI, no confirmation dialog, no URL scheme — pure config-file-add.
- Best-practice: lazy-load with `{ 'user/plugin', event = 'VeryLazy' }` patterns. Install is atomic with config commit.

**Emacs:**

- **In-app:** `M-x package-list-packages` → RET → `i` on the package → `x` to execute. No URL scheme.
- **Manual:** Clone into `~/.emacs.d/elpa/<pkg>/`, add to `load-path` in `init.el`.
- **use-package / straight.el:** `(use-package some-package :ensure t)` in config.

**Takeaway for Skills:** These ecosystems' shared model is **config-file-add** (plugin list in a config file, manager pulls on next reload). This is effectively what the `vercel-labs/skills` CLI does for Claude Code: `npx skills add <path> --agent claude-code -g` writes into `~/.claude/skills/` and the agent picks it up at next session. The model doesn't exist for Cowork because Cowork doesn't read a user-writable config directory.

### 9. macOS .pkg / .dmg install

**.dmg drag-to-Applications:**

1. Download `.dmg`. OS auto-mounts the disk image.
2. Finder opens the mounted volume, showing the app icon + an alias-arrow to `/Applications`.
3. User drags the app icon onto the Applications alias.
4. Finder copies the `.app` bundle.
5. User ejects the DMG.
6. User launches the app from Applications → **Gatekeeper** prompts: "This app was downloaded from the internet. Are you sure you want to open it?" → user clicks Open.
7. If the app is unsigned / not notarized, macOS Sequoia requires a right-click "Open" the first time (or System Settings → Privacy & Security → "Open Anyway").

**.pkg (Installer):**

1. Double-click `.pkg`.
2. Apple's Installer app launches.
3. User clicks Continue through a series of panes (README, License, Installation Type, Destination).
4. Admin password prompt.
5. Package performs install scripts.
6. Success pane.

**URL scheme interaction:** macOS has `open` command (`open myapp://...`) and `open -a <app>` (`open -a Claude`, `open -a "Claude"`), but these launch the app generically — they don't drive install-panel navigation unless the app implements the handler.

**Takeaway for Skills:** The `.dmg` drag-to-Applications pattern is the **weakest** hand-off in the survey — many confirmation clicks, multiple UI surfaces, Gatekeeper friction. But users universally tolerate it. If Claude's skill install is "download ZIP, click upload button, pick file," that's actually on par with `.dmg` install in click-count. The relative simplicity may not be the bottleneck; the bottleneck is *onboarding visibility* (can users find the upload button).

### 10. Raycast Pro / macOS Shortcuts import

**Shortcuts import via Finder:**

1. User double-clicks `.shortcut` file → Shortcuts app opens.
2. Shortcuts shows a **"Import Shortcut?"** panel with a *preview* of every action in the shortcut (every `Run Script`, `Get Current Location`, etc., listed).
3. User clicks **"Add Shortcut"**.
4. Shortcut appears in user's library.

Alternative imports: drag into Shortcuts window, drag onto Dock icon, "Open With > Shortcuts" context menu.

Per [Apple — Import shortcuts](https://support.apple.com/guide/shortcuts-mac/import-shortcuts-apd02bffbaac/mac).

**Shortcuts URL scheme:** Fully featured. Per [Apple — URL schemes](https://support.apple.com/guide/shortcuts-mac/apda283236d7/mac):

- `shortcuts://` — open the app
- `shortcuts://create-shortcut` — open the editor
- `shortcuts://open-shortcut?name=<name>` — launch a named shortcut
- `shortcuts://import-shortcut/?url=<url>&name=<name>` — **import from URL**, with optional silent param

**This is the exemplar of a "download + install" URL scheme.** The `?url=` parameter is a remote URL that the Shortcuts app fetches, validates, and presents to the user — all in one click.

**Takeaway for Skills:** The ideal UX for installing a Claude skill from the web is *exactly* what Apple shipped for Shortcuts. `shortcuts://import-shortcut/?url=https://example.com/my-shortcut.shortcut` triggers: app focus → fetch → preview → user confirms → installed. A `claude://import-skill/?url=https://openknowledge.dev/skill.zip` would work identically if Anthropic built it.

---

## Synthesis — hand-off pattern taxonomy

Grouping the survey's install flows into categories by level of integration:

### Category A. Zero-click-ish deep-link install (deep integration, with confirmation)

Source site emits a URL scheme; target app opens, shows a single confirmation dialog, installs. **Source can deep-link into the install panel; no filesystem friction.**

Examples:

- **Cursor**: `cursor://anysphere.cursor-deeplink/mcp/install?name=<>&config=<base64>`
- **VS Code**: `vscode:mcp/install?<url-encoded-json>` and `vscode:extension/<id>`
- **Raycast**: "Install Extension" button on store (raycast://)
- **Shortcuts**: `shortcuts://import-shortcut/?url=<url>`
- **Firefox (off-AMO signed)**: vendor-site hosted `.xpi` install link
- **Figma**: `figma://` URL for opening the desktop app to a specific file (not install per se, but shows the URL-scheme pattern is standard)

Requires: target app registers URL scheme + validates+displays content + accepts `Install` click. Cannot be silent (security).

**Claude Desktop support:** NO. Issue #26952 and #10366 closed as not-planned.

### Category B. File-association auto-open (mid-integration)

User double-clicks a known-extension file → target app opens, shows install dialog.

Examples:

- **Claude Desktop `.mcpb`**: double-click, drag-drop into window, or Settings → Install
- **VS Code `.vsix`**: file-dialog via "Install from VSIX..." (not quite double-click in VS Code, but CLI `code --install-extension foo.vsix` works non-interactively)
- **macOS Shortcuts `.shortcut`**: double-click → Import Shortcut dialog
- **Firefox `.xpi`**: manual install via about:addons gear
- **macOS `.dmg`** and `.pkg`: universal file-association + Installer.app

Requires: target app registers file-type in OS. Browser "Open With" + "Always open these" flow completes the loop — after one manual choose, every subsequent download auto-opens.

**Claude Desktop support for Skills:** NO. Only `.mcpb` is registered; no `.skill` or `.skill.zip` association. ZIPs are generic, so registering `.zip` to Claude would be disastrously over-broad.

### Category C. Download + manual drop (low-integration, config-file-add)

User downloads files; user navigates filesystem; user places files in a known directory; app picks up on next reload.

Examples:

- **Obsidian plugins** (manual): `.obsidian/plugins/<id>/main.js + manifest.json + styles.css`
- **Neovim / Emacs**: clone repo to plugin path, edit init file
- **Claude Code CLI skills** (our current path via `npx skills add`): writes to `~/.claude/skills/<name>/SKILL.md`
- **Chrome unpacked**: `chrome://extensions` → Developer mode → Load unpacked

Requires: target app reads a known directory at launch / on hot-reload. Source site can at best provide a download link + written instructions.

**Claude Desktop / Cowork support for Skills:** NO. No deterministic user-writable directory is read by Cowork. Per-session UUID suffixes prevent pre-population. Claude Desktop Chat also has no documented filesystem drop-target for Skills.

### Category D. Download + guided UI walkthrough (zero-integration)

Target app exposes no automation hooks. User must manually navigate through multiple clicks in a settings panel.

Examples:

- **Pre-2018 Chrome extensions**: "Download this → drag onto chrome://extensions"
- **Claude Desktop / Cowork Skills (current)**: "Download ZIP → click Customize → Skills → + → + Create skill → Upload a skill → pick ZIP"
- **Claude Cowork org-admin provisioning**: "Owner logs into organization settings → Plugins → upload ZIP or GitHub-sync"

The only things the source site can do:

1. Pre-download the artifact.
2. Reveal the download in Finder / Explorer (Electron `shell.showItemInFolder` if we have an app; web-download otherwise).
3. Copy the download path to clipboard.
4. Open the target app (via `open -a Claude` on macOS; `start` on Windows; xdg-open on Linux).
5. Render screenshots or a walkthrough alongside.

**This is Claude Skills today. Category D is what we're stuck with.**

### Category E. Cloud-side registry (no local install)

User doesn't install locally — they grant cloud-side access once, and the remote service serves the skill/extension/MCP tool call.

Examples:

- **Claude Custom Connectors (remote MCP)**: paste URL + OAuth → done. Docs at [support.claude.com/11175166](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- **ChatGPT Connectors / OpenAI custom GPTs**: entirely cloud-hosted
- **GitHub Marketplace, Zapier, etc.**: SaaS integration model

Acknowledged in parent report as the **one path for Cowork that does work today** (cloud-hosted MCP + Custom Connector + paste URL). Scope here is Skills, not MCP servers, and there is no "remote Skill" equivalent: Skills are local-file content that Claude reads to guide its behavior, not a transport-wrapped tool. So Category E doesn't solve Skills distribution.

### Category F (lateral pattern). Companion-CLI fan-out writing target config files

Third-party CLI detects installed hosts and writes each host's native config.

Examples:

- **`vercel-labs/skills`** (`npx skills add --agent '*' -g -y`): ~45 agent IDs, writes per-target
- **`neondatabase/add-mcp`**: 7 MCP-harness targets
- **`supermemoryai/install-mcp`**: 7 MCP-harness targets
- **Smithery CLI**: commercial
- **Open Knowledge's `skill-install.ts`**: already shells out to `skills` for Claude Code

Enables Category C without user navigating the filesystem. But **does NOT cross Category D walls** — if the target has no config-directory read surface (Cowork), no amount of CLI sugar helps.

---

## Applicability to Open Knowledge → Cowork hand-off

### What's achievable today

1. **Download the ZIP.** We control this end. Our CLI or desktop app produces `openknowledge.skill.zip` (valid Claude Skill ZIP: ZIP root = the skill folder; contains `SKILL.md` with valid YAML frontmatter).
2. **Reveal the ZIP in the user's filesystem.** In the Electron app, `shell.showItemInFolder(zipPath)` focuses Finder / Explorer on the file. In a web download, we rely on the browser's download drawer.
3. **Open Claude Desktop.** `shell.openExternal('claude://')` or `open -a "Claude"` (macOS) / `start Claude` (Windows) launches the app. Claude Desktop does NOT focus a specific settings panel in response — it opens to the user's last-used state.
4. **Copy the ZIP path to clipboard.** Useful for the user's subsequent "drag from here" or paste-into-file-picker flow.
5. **Render walkthrough screenshots / animated step-by-step.** The user has to see 7 clicks; we can display them.
6. **Link to Anthropic's support article.** `https://support.claude.com/en/articles/12512180-use-skills-in-claude` is the canonical install doc.

These are all Category D tools. None of them bridge the automation gap.

### UX improvements possible without Anthropic changes

- **One-click "Install in Cowork" from our preview / browser UI**: opens a download, reveals in Finder, opens Claude, shows a modal / toast in our own UI with the 7-step walkthrough.
- **Screenshot-quality walkthrough inline** rather than linking out. Embed images of the exact Customize > Skills > + → Upload path.
- **Pre-validate the ZIP before offering it.** We already have the `skills` tooling: we can use `skills validate <path>` to confirm the ZIP will pass Claude's structural checks (root directory, `SKILL.md` present, name matches, YAML frontmatter valid, name lowercase + hyphens only per Anthropic's rules).
- **Auto-name correctly.** Claude rejects ZIPs if *"Skill folder name doesn't match the skill name"* or *"Invalid characters in skill name"*. Pre-validate and rename automatically.
- **Side-channel "installed elsewhere" confirmation.** Our own server can tell (via MCP tool usage) whether the user has the Open Knowledge MCP wired up in Claude Code — if so, we can omit the Skill-install suggestion for Cowork (different substrate). If they're using Cowork and the skill hasn't been uploaded (detected by lack of a specific MCP tool call pattern), we prompt.
- **Status-bar presence for the desktop app**: Electron app with menu-bar presence showing "Skill: installed in Claude Code" / "Skill: not yet in Cowork — click to download the ZIP".
- **Cloud-hosted remote-MCP alternative** (cross-reference parent report Category E): for *MCP* we have a clean hand-off path (paste URL in Custom Connector). For Skills specifically, no equivalent exists — Skills are local markdown + reference files Claude reads, not network-transport-wrapped.

### UX improvements requiring Anthropic cooperation

These are the asks that would materially simplify the handoff. None are available today:

1. **`claude://install-skill?url=<zip-url>&sig=<hmac>` URL scheme.** Registered by Claude Desktop. On click: fetches the ZIP, validates signature, shows a permissions dialog (from SKILL.md frontmatter), writes to the appropriate path. Analogous to `shortcuts://import-shortcut/?url=...` or `cursor://...install`.
2. **`.skill` or `.skill.zip` file association.** User downloads, double-clicks, Claude opens the install dialog. Analogous to `.mcpb`. Practical concern: `.zip` is too generic; Anthropic would need a new extension like `.skill` with a registered MIME type.
3. **Deep-link to Customize > Skills panel.** Even without doing the install automatically — `claude://settings/skills?highlight=upload` would open Claude Desktop already focused on the upload button. Closes half the nav-burden.
4. **Deterministic user-writable filesystem drop-target.** `~/Library/Application Support/Claude/UserSkills/<name>/SKILL.md` that Claude Desktop + Cowork both read at session start. Would enable Category C pattern for Skills.
5. **HTTP API for skill install.** Claude Desktop could expose a localhost HTTP endpoint (like JetBrains IDEs do for `http://localhost:63342/api/file`) that accepts authenticated `POST /skills/install` from the same machine. Bypasses URL-scheme registration entirely.
6. **`claude skill add` CLI subcommand.** Analogous to `claude mcp add` — `claude skill add <path> --personal` or `claude skill add <path> --team`. Would let our existing `skill-install.ts` just add Claude Desktop and Cowork as two more targets.
7. **Fix the skill-mount-race bugs #26254/#31542/#39400.** Even when the UI upload flow is used, there's an open bug class where Cowork advertises skills in its `<available_skills>` system-prompt block but the SKILL.md file is missing from the VM filesystem. Zero Anthropic engagement as of 2026-04-24.

### Recommended handoff pattern

**Pattern: Category D with concierge polish.** We live in Category D territory for Cowork until Anthropic builds something. Within that constraint, we should build:

1. **"Skill install" CTA in our app / website with two outcomes based on detected host:**
   - **Claude Code CLI user detected** (or `claude` binary on PATH): Run `npx skills add <bundled-path> --agent claude-code -g -y --copy` automatically. Report success in-app. (This is what `skill-install.ts` does today for `--agent '*'`.)
   - **Claude Desktop / Cowork user** (always fallback): Show the download-and-handoff flow below.

2. **Desktop / Cowork handoff flow (5 UI steps, fronted by our app/website):**
   - **Step 1 (our UI):** Show "Install Open Knowledge in Claude Cowork" CTA button.
   - **Step 2 (our UI):** On click, generate + validate `openknowledge.skill.zip`. Show a modal: "Installing in Claude Cowork takes 3 clicks. Here's how." With 3 animated screenshots or a short screen-recording.
   - **Step 3 (our UI):** Trigger download. If Electron app, also call `shell.showItemInFolder(zipPath)` to auto-reveal in Finder. If web, rely on browser download drawer.
   - **Step 4 (our UI):** Trigger `shell.openExternal('claude://')` or `open -a "Claude"` to open Claude Desktop. If Claude is not installed, show a link to the download page (claude.ai/download).
   - **Step 5 (our UI):** Show a persistent "Waiting for install..." state with a "Done" / "Skip" control. Optionally, if the user grants MCP access, we can detect first use of the skill tokens in their subsequent Cowork sessions and auto-dismiss.

3. **Post-install self-verification:** Once the user has (presumably) uploaded the ZIP, show a "Test that it worked" path — e.g. prompt them to say "Use Open Knowledge to search my notes" in a Cowork session, and surface telemetry back.

4. **File a feature request with Anthropic** (item 1 in the "requiring Anthropic" list above). Link to this evidence file and parent report.

---

## Confidence + gaps

| Claim | Confidence | Notes |
|-------|-----------|-------|
| Claude Desktop has no `claude://install-skill` URL scheme | HIGH | #26952 and #10366 are both closed not-planned. Searched repo + support docs. |
| Claude Desktop has no `.skill.zip` file association | HIGH | No Anthropic doc mentions it; only `.mcpb` is registered (different format, different target). |
| Cowork has no deterministic user-writable Skills drop-target | HIGH | Per-session UUID paths documented in #31422; zero staff engagement. |
| `shortcuts://import-shortcut/?url=` is the exemplar UX | HIGH | First-party Apple doc, verified. |
| Cursor `cursor://...install` requires user confirmation | HIGH | Docs + security advisory GHSA-r22h-5wp2-2wfv. |
| VS Code `vscode:mcp/install` requires user confirmation | MEDIUM | Docs do not detail consent dialog text; den.dev article (third-party) confirms a consent dialog exists. |
| Chrome removed inline install in December 2018 | HIGH | Official Google FAQ; multiple security-news sources corroborate. |
| Obsidian manual install requires Settings toggle | HIGH | First-party forum + sample-plugin README corroborate. |
| Firefox off-AMO signed `.xpi` install allowed | HIGH | Mozilla doc + extensionworkshop verified. |
| MCPB install via double-click / drag-drop / Settings | HIGH | Anthropic engineering post + support article + MCPB README. |
| MCPB is Claude-Desktop-only (not Cowork) | HIGH | Parent report `cowork-deep-dive.md` + `cowork-skills-surface-update-2026-04-24.md`. |
| An HTTP localhost API ala JetBrains exists in Claude Desktop | UNVERIFIED | NOT FOUND. Speculative "could be built" in UX improvements section. |

### NOT FOUND / gaps

- **A leaked / internal "Cowork skill install API."** Searched all public issue trackers and community reverse-engineering. None. The `skills-plugin` directory on Cowork's VM is Anthropic-reserved for the 6 built-in skills.
- **Is there an Anthropic roadmap item for Cowork Skills install?** Issue #50148 (`gh skill`) is an open user-filed feature request with no Anthropic response. No blog post, no changelog entry, no Dev-Day announcement.
- **Does Electron's `open-url` event fire for `.zip` file double-clicks?** It does for registered file associations (via `open-file` event on macOS, `argv` on Windows). Claude Desktop does not register `.zip`, so the question is moot.
- **Does Claude Desktop's Chat tab accept Skills differently from Cowork's substrate?** Per docs, Chat's `Customize > Skills` UI is the same entry point for both Chat and Cowork sessions. Skills are user-global (same list everywhere). But the Cowork VM's filesystem mount path for those skills diverges from Chat's (which just reads the user-level list). The "installed skill is advertised but SKILL.md not mounted" bug class (#26254, #31542, #39400) hits Cowork specifically.
- **macOS Sequoia Gatekeeper interaction with `.skill.zip` downloads.** If Anthropic ever registers `.skill.zip`, Gatekeeper's quarantine attribute on the downloaded ZIP would require user-confirmation-on-first-open-from-internet. The `.mcpb` experience already deals with this.
- **Whether a browser extension (Chrome / Safari) could reach into Claude Desktop's running process to install a skill.** No documented API. Claude Desktop's Electron app doesn't expose a WebSocket or IPC to browser extensions.

---

## Direct quotes worth preserving

- **Cursor security advisory** ([GHSA-r22h-5wp2-2wfv](https://github.com/cursor/cursor/security/advisories/GHSA-r22h-5wp2-2wfv)): hardened the install dialog to "always display full args and env" — establishing as precedent that a install-handoff dialog is a security surface, not optional UX.

- **Chrome inline install FAQ** ([developer.chrome.com/docs/extensions/mv2/inline-faq](https://developer.chrome.com/docs/extensions/mv2/inline-faq)): *"users who move to install an extension from a third-party site will be automatically redirected to the Chrome Web Store to complete the installation."* — Google's choice after 2018: one trusted install surface + mandatory nav.

- **VS Code Marketplace** ([code.visualstudio.com/docs/configure/extensions/extension-marketplace](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)): *"When you first install an extension from a third-party publisher, VS Code shows a dialog prompting you to confirm that you trust the extension publisher."* — per-publisher trust model.

- **Raycast Deeplinks** ([developers.raycast.com/information/lifecycle/deeplinks](https://developers.raycast.com/information/lifecycle/deeplinks)): *"Whenever a command is launched using a Deeplink, Raycast will ask you to confirm that you want to run the command."* — the universal rule for URL-scheme install: always confirm.

- **Claude Desktop outbound URL handling** ([Issue #26952](https://github.com/anthropics/claude-code/issues/26952)): *"When an MCP server returns deep link URLs with custom URL schemes (e.g. `carebrief://entity/medication/...`), clicking them in Claude Desktop's 'Open external link' dialog does nothing. The OS never receives the URL."* — reveals Claude Desktop's Electron shell filters custom URL schemes; closed as not-planned.

- **Anthropic engineering blog on MCPB** ([anthropic.com/engineering/desktop-extensions](https://www.anthropic.com/engineering/desktop-extensions)): *"Download a `.mcpb` file, double-click to open with Claude Desktop, click 'Install'."* — proves Anthropic has already built (for `.mcpb`) the file-association install dialog they have not built for `.skill.zip`.

- **Anthropic support on Skills upload** ([support.claude.com/en/articles/12512180](https://support.claude.com/en/articles/12512180)): *"navigate to Customize > Skills, click the + button, then + Create skill and upload a ZIP file containing your skill folder."* — the seven-click canonical path.

- **Issue #50148 on gh skill** (Anthropic user feature request, open): *"Claude Desktop: No remote source option"* — first-party confirmation that no programmatic install mechanism exists.

- **Parent report cowork-skills update** ([`reports/mcp-server-auto-install-harnesses/evidence/cowork-skills-surface-update-2026-04-24.md`](../../mcp-server-auto-install-harnesses/evidence/cowork-skills-surface-update-2026-04-24.md)): *"The only documented install paths are: (1) Per-user ZIP upload via `Customize > Skills > +`... (2) Org-admin ZIP upload or GitHub-sync... (3) Session-ephemeral user-created skills (wiped on cleanup)."*

---

## Cross-reference to Open Knowledge's current implementation

Our `packages/server/src/skill-install.ts` is a Category F (companion-CLI fan-out) implementation that successfully handles Claude Code CLI via `npx skills@~1.5.0 add <bundled-path> --agent '*' -g -y --copy`. It's idempotent via a sidecar version file and has a 60s subprocess timeout.

For Cowork:

- The wildcard `--agent '*'` in our install command resolves to ~45 agent IDs in the `vercel-labs/skills` registry. Zero of those target Cowork. Adding `--agent claude-cowork` to our command has no effect because the target doesn't exist.
- Petitioning `vercel-labs/skills` to add a `claude-cowork` target would be premature — Vercel would have to know WHERE on disk to write, and Anthropic has not documented that path.
- The lowest-effort pragmatic addition to our flow: in the CLI, detect if Claude Desktop is installed (check for `~/Applications/Claude.app` or `/Applications/Claude.app` on macOS), and if so, surface a post-install note: *"Open Knowledge skill installed for Claude Code. For Claude Desktop / Cowork, download `<zip-url>` and upload via Customize > Skills."* This turns the bundled-skill ZIP into a dual-purpose artifact — it's already the raw material `skills add` uses; we just expose it separately for Cowork users.
- For the Electron Desktop app specifically (`packages/desktop`), we can implement the polished Category D flow described in "Recommended handoff pattern" above, using Electron's `shell.showItemInFolder` + `shell.openExternal('claude://')` primitives. The Electron app's existing first-launch MCP consent milestone (M6) proves the IPC discipline for this is already established.
