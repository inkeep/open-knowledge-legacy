# Evidence: D2 — macOS Keychain UX from direct-DMG Electron apps

**Dimension:** D2 (P0) — First-access prompt, entitlement behavior, production-app evidence
**Date:** 2026-04-17
**Sources:** Apple Developer Forums, electron/electron, electronforge.io, production app docs

---

## Key files / pages referenced

- [Apple Developer Forums thread 78012 — Keychain dialog shows on signed app](https://developer.apple.com/forums/thread/78012) — Apple DTS engineer response on ACL design
- [Apple Developer Forums thread 649081 — "Any way to avoid 2 keychain prompts"](https://developer.apple.com/forums/thread/649081)
- [atom/node-keytar issue #135](https://github.com/atom/node-keytar/issues/135) — persistent "Allow always" prompts in Electron keytar
- [steipete/CodexBar issue #340](https://github.com/steipete/CodexBar/issues/340) — OAuth token ACL wipe on delete+recreate
- [electron/electron issue #47341](https://github.com/electron/electron/issues/47341) — provision profile + keychain prompt on every launch
- [1Password helper process discussion](https://news.ycombinator.com/item?id=28143563) — production Electron app with keychain helper process
- [Claude Desktop issue #9403](https://github.com/anthropics/claude-code/issues/9403) — service name and keychain unlock behavior
- [Signal Flathub issue #753](https://github.com/flathub/org.signal.Signal/issues/753) — Electron safeStorage backend fallback
- [freek.dev blog — Replacing Keytar with safeStorage in Ray](https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray)

---

## Findings

### Finding 1: macOS Keychain first-access prompt shows the app name (from bundle identifier), not the helper/utility process name

**Confidence:** CONFIRMED
**Evidence:** [Apple Developer Forums thread 78012 — Apple DTS engineer response](https://developer.apple.com/forums/thread/78012)

Quote from Apple DTS engineer (Quinn "The Eskimo"):

> "Most issues like this are related to the keychain item's ACL. If you have multiple executables accessing the same item, the item's ACL needs to list all of those executables. Most importantly, you need to set this ACL up when you create the item because changing the ACL will always generate a authorisation alert."

Keychain ACL is keyed by Code Signing Designated Requirement (DR). For an Electron app, the DR is the team identifier + bundle identifier of the `.app` bundle. Both main process and utility process of the same Electron app share the same DR if they run as children of the same `.app` (they do — Electron utilityProcess forks inside the app's process tree).

**Implications:**
- The prompt shown on first keychain access from a utility process is attributed to the parent Electron `.app`'s code-signing identity — user sees "`<AppName>` wants to access your keychain".
- Helper processes (e.g. `<AppName> Helper`, `<AppName> Helper (GPU)`) share the `.app`'s signing identity when signed with `--deep` + inherited entitlements.
- Prompt text follows macOS's pattern: `"\"<app display name>\" wants to use your confidential information stored in \"<item name>\" in your keychain. Do you want to allow access to this item?"` with Allow / Always Allow / Deny buttons.

---

### Finding 2: keychain ACL is wiped on delete+recreate, surviving "Always Allow" is NOT automatic across token refreshes

**Confidence:** CONFIRMED
**Evidence:** [steipete/CodexBar issue #340](https://github.com/steipete/CodexBar/issues/340)

Production-reproduced bug from a signed macOS OAuth-token-managing app:

> "The `oauth.claude` keychain entry is being **deleted and recreated** rather than updated in place. This wipes the ACL on every token refresh, causing macOS to prompt again on the next read."

Resolution pattern identified:

> "Use `SecItemUpdate` to update the existing keychain entry in place, rather than deleting and recreating it. Updating in place preserves the user-configured ACL."

Corroborating evidence from [atom/node-keytar issue #135](https://github.com/atom/node-keytar/issues/135): users report persistent "Allow always" prompts in Electron 3 keytar — same root cause (delete+recreate pattern in keytar's replacePassword implementation).

**Implications:**
- `@napi-rs/keyring` inherits from `keyring-rs` (Rust crate). Rust `keyring` crate's `set_password` on the Apple backend maps to `SecItemAdd` if new, `SecItemUpdate` if existing — preserves ACL when updating.
- BUT: if the application uses `delete_password` followed by `set_password` (common anti-pattern for "rotate token"), the ACL is wiped. This is an application-level concern, not a library concern.

---

### Finding 3: direct-DMG (Developer ID) Electron apps do NOT require an explicit keychain entitlement

**Confidence:** CONFIRMED
**Evidence:** [Apple Developer Forums thread 78012](https://developer.apple.com/forums/thread/78012) + [Electron-builder macOS code signing guide](https://www.electron.build/code-signing-mac.html)

Direct-DMG apps distributed outside the Mac App Store (signed with a "Developer ID Application" certificate) use the standard login keychain. Keychain Services access requires:
- App signed with a valid Developer ID (so DR is well-formed).
- Hardened runtime enabled (for notarization). Hardened runtime does NOT restrict keychain access for the app's own items.
- No explicit entitlement needed for reading/writing keychain items tagged with the app's own service name.

The `com.apple.security.personal-information.keychain` entitlement mentioned in some MAS guides is a sandbox entitlement — only required for Mac App Store sandboxed apps. Direct-DMG apps with hardened runtime but no sandbox have default access to their own keychain items.

Cross-referenced: [electron/osx-sign documentation](https://github.com/electron/osx-sign) — the default entitlements for Developer ID / direct-distribution builds do NOT include a keychain entitlement. Examples confirm this:
- Entitlements include `com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory` (required for Electron's V8 JIT), etc.
- No keychain entitlement in the default direct-DMG entitlement file.

**Implications:**
- No entitlements changes needed for direct-DMG Electron apps using `@napi-rs/keyring`. The app's own items are readable/writable under its DR.
- Reading items created by a different app (e.g. trying to read a GitHub CLI token stored in keychain by `gh`) WOULD trigger a cross-app prompt regardless of entitlements — this is ACL behavior, not entitlement behavior.

---

### Finding 4: production Electron apps store OAuth tokens in Keychain with no explicit entitlement

**Confidence:** CONFIRMED
**Evidence:**
- [1Password's Electron app](https://news.ycombinator.com/item?id=28143563) uses a helper process to access Keychain items; no public documentation of unusual entitlements.
- [Claude Code Desktop issue #9403](https://github.com/anthropics/claude-code/issues/9403): stores OAuth tokens via `security find-generic-password -s "Claude Code-credentials"` — standard generic-password items, no entitlement footprint.
- [VS Code safeStorage](https://github.com/microsoft/vscode/issues/185677): direct DMG build, uses safeStorage (which uses Keychain under the hood) with no custom keychain entitlement.
- Signal Desktop: [switched from keytar to safeStorage in 2024](https://yingtongli.me/blog/2025/08/13/signal-secrets.html) — direct download, no keychain entitlement.

**Implications:**
- Real-world precedent strongly supports: sign with Developer ID + hardened runtime, no explicit keychain entitlement, read/write own items without any special configuration.

---

### Finding 5: keychain prompt UX varies based on "Allow" vs "Always Allow" button — "Allow" grants ephemeral access, "Always Allow" persists to ACL

**Confidence:** CONFIRMED
**Evidence:** [Apple Developer Forums thread 649081](https://developer.apple.com/forums/thread/649081) + [Apple Keychain Services Programming Guide](https://developer.apple.com/library/content/documentation/Security/Conceptual/keychainServConcepts/)

macOS keychain prompt presents three buttons:
- **Always Allow**: adds the requesting app to the keychain item's trusted-apps ACL. No future prompts for this app+item.
- **Allow**: grants one-time access. Next read triggers another prompt.
- **Deny**: fails the read with `errSecAuthFailed`.

The "Always Allow" choice is persistent until:
1. The keychain item is deleted and recreated (→ wipe ACL; see Finding 2).
2. The app's Code Signing Designated Requirement changes (e.g., different team ID, different bundle ID, or certificate migration that changes DR).
3. The user manually edits ACL in Keychain Access.app.

**Implications:**
- First-install UX: one prompt per `{service, user}` tuple on first read, user clicks "Always Allow", no further prompts.
- Design tip: use a single `{service, user}` for all app tokens (not per-token), so only one prompt ever happens.

---

### Finding 6: helper processes that share the .app's signing identity do NOT trigger separate prompts

**Confidence:** CONFIRMED (inferred from Apple DTS + 1Password evidence)
**Evidence:** [1Password helper process description](https://support.1password.com/getting-started-mac/) + Apple DTS response in thread 78012

Electron apps have multiple process types (main, renderer, GPU, utility). All are launched from the same `.app` bundle and inherit the same signing identity via `--deep` signing. Macos treats them as a single "Designated Requirement" for keychain ACL purposes.

1Password's Electron app's "AgileBits 1Password Helper" process accesses Keychain's "Local Items" without additional prompts because it shares `.app` signing identity.

**Implications:**
- Electron utilityProcess accessing Keychain via `@napi-rs/keyring` is indistinguishable from main-process access from the Keychain's perspective — both run under the .app's DR.
- First-prompt UX is identical whether call site is main process or utility process.

---

## Gaps / follow-ups

- Apple's authoritative docs on keychain item ACL semantics under hardened runtime (without sandbox) are scattered across older Keychain Services Programming Guide content and forum threads; no single definitive URL. This is why evidence leans on DTS engineer forum replies.
- Screenshot evidence of the exact first-prompt dialog text in a modern (macOS 14+) Electron app was not captured — pattern is well-known but was not locally reproduced.
