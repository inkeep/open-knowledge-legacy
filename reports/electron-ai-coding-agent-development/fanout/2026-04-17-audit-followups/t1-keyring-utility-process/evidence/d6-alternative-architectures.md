# Evidence: D6 — Alternative architectures (safeStorage, main-process relay)

**Dimension:** D6 (P1) — Does Electron's safeStorage obsolete external keyring libs?
**Date:** 2026-04-17
**Sources:** Electron docs, VS Code migration, freek.dev blog, Signal migration

---

## Key files / pages referenced

- [Electron safeStorage API docs](https://www.electronjs.org/docs/latest/api/safe-storage)
- [electron/electron#34614 — safeStorage requires BrowserWindow](https://github.com/electron/electron/issues/34614)
- [electron/electron#43233 — password prompt on safeStorage post-upgrade](https://github.com/electron/electron/issues/43233)
- [VS Code keytar migration #185677](https://github.com/microsoft/vscode/issues/185677)
- [freek.dev blog — Ray migration to safeStorage](https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray)
- [Signal migration blog](https://yingtongli.me/blog/2025/08/13/signal-secrets.html)
- [jesse.li — Breaking electron-store's encryption](https://blog.jse.li/posts/electron-store-encryption/)

---

## Findings

### Finding 1: Electron safeStorage is Main-Process-only — cannot be called from utilityProcess or renderer

**Confidence:** CONFIRMED
**Evidence:** [Electron safeStorage docs](https://www.electronjs.org/docs/latest/api/safe-storage)

> "The module runs exclusively in the Main Process."

Consequence: if architecture parks the server-level work (e.g., a CRDT server) in a `utilityProcess.fork()`, and that utility process needs to read tokens from secure storage, it CANNOT call safeStorage directly. It must either:
1. IPC to main process, which calls safeStorage on its behalf (main-process relay pattern).
2. Use a different library (e.g., `@napi-rs/keyring`) that IS callable from utilityProcess.

**Implications:**
- For architectures where secure storage access is colocated with server logic in a utility process, safeStorage requires an IPC hop per read. `@napi-rs/keyring` does not.
- IPC hop adds latency (a few ms) but provides a clean architectural boundary.

---

### Finding 2: safeStorage and @napi-rs/keyring have DIFFERENT storage models

**Confidence:** CONFIRMED
**Evidence:** [Electron safeStorage docs](https://www.electronjs.org/docs/latest/api/safe-storage) + [keyring-rs apple-native feature source](https://github.com/hwchen/keyring-rs)

**safeStorage model:**
- Stores a single encryption key in OS keyring (Keychain / Credential Manager / libsecret).
- App is responsible for persisting ciphertext (typically in user-data directory: `~/Library/Application Support/<app>/`, `%APPDATA%\<app>\`, `~/.config/<app>/`).
- Returns `Buffer` from `encryptString` / accepts `Buffer` for `decryptString`.
- Data loss if user-data directory is cleared but keychain entry remains (or vice versa).

**@napi-rs/keyring model:**
- Stores secrets DIRECTLY as keychain items (one item per `{service, user}`).
- No disk-side state.
- Keychain is the sole source of truth.

Quote from freek.dev:
> "any previously saved passwords and passphrases saved using Keytar are now inaccessible for the app."

— because the storage models differ. Keytar stores secrets AS keychain items. safeStorage stores an encryption key as a keychain item + ciphertext on disk. A keytar-stored secret is a keychain generic password entry; safeStorage cannot read it.

**Implications:**
- Library choice is not a pure substitution — model differs.
- @napi-rs/keyring is simpler for single-secret-per-tuple patterns (e.g., "one OAuth token per GitHub account").
- safeStorage is more flexible for arbitrary-sized blobs / config structures.

---

### Finding 3: safeStorage has known bootstrapping issues — requires app-ready event on macOS/Linux

**Confidence:** CONFIRMED
**Evidence:** [Electron safeStorage docs](https://www.electronjs.org/docs/latest/api/safe-storage) + [electron/electron#34614](https://github.com/electron/electron/issues/34614)

Quote from docs:
> "On macOS and Linux, Keychain/password manager access may block the current thread to collect user input."
> "isEncryptionAvailable(): Returns boolean status; on Linux requires the app's ready event and an available secret key"

Issue #34614 reports safeStorage being "invalid" if called before a BrowserWindow is created. Indicates subtle initialization dependencies in the safeStorage module.

**Implications:**
- safeStorage initialization timing is more fragile than `@napi-rs/keyring` (which has no app-lifecycle dependency).
- For headless utility-process contexts, this alone is disqualifying.

---

### Finding 4: safeStorage has had Electron-upgrade-induced data-loss bugs

**Confidence:** CONFIRMED
**Evidence:** [electron/electron#43233](https://github.com/electron/electron/issues/43233) — "macOS password prompt when using safeStorage after electron upgrade"

After a specific Electron version upgrade, apps that used safeStorage saw password-prompt dialogs for data they previously stored. Root cause was a change in how safeStorage derives its encryption identity on macOS, invalidating previous data.

**Implications:**
- safeStorage couples data integrity to Electron's internal implementation details — not guaranteed stable across Electron upgrades.
- `@napi-rs/keyring` uses OS-native keychain primitives — stability guarantees come from Apple/Microsoft/Freedesktop, not from Electron.

---

### Finding 5: VS Code explicitly chose to migrate FROM keytar TO safeStorage, citing keytar's maintenance status

**Confidence:** CONFIRMED
**Evidence:** [VS Code issue #185677](https://github.com/microsoft/vscode/issues/185677)

Primary driver:
> "node-keytar is archived and unmaintained."

Not cited as a reason:
- Performance, security, or UX advantage of safeStorage.
- safeStorage having better features.

This is a "library-of-last-resort" migration — the old library is unmaintained, safeStorage is an in-Electron alternative that doesn't require external dependencies.

**Note:** VS Code's migration predates widespread adoption of `@napi-rs/keyring` (which is actively maintained — v1.2.0 released 2025-09-02). A greenfield decision today between safeStorage and `@napi-rs/keyring` is different from the keytar-era decision VS Code faced.

**Implications:**
- safeStorage's primary appeal (no external native module) applies mostly when the alternative is an unmaintained/abandoned library.
- Against a maintained `@napi-rs/keyring`, the comparison is more even-handed: process-locality vs. architectural simplicity.

---

### Finding 6: main-process relay is a viable alternative to in-utility keyring access

**Confidence:** INFERRED (standard Electron pattern)
**Evidence:** Pattern emerges from the architecture constraints. Not a single authoritative source.

Pattern:
```
utility-process                    main-process
---------                          ---------
ipcRenderer.invoke('getToken')  → (receives IPC)
                                   safeStorage.decryptString(readFromDisk())
                                   return decrypted
(awaits)                        ← returns via MessagePort
```

Trade-offs:
- Pro: safeStorage usable from utility.
- Pro: clear architectural boundary for secrets access.
- Con: adds IPC hop (latency ~1-5ms per read, usually negligible).
- Con: requires careful process-id validation to prevent malicious utility processes from requesting tokens they shouldn't.

Production precedent: 1Password's Electron architecture [exposes a "1Password Helper" process](https://news.ycombinator.com/item?id=28143563) that brokers keychain access via IPC.

**Implications:**
- For architectures where all keyring access is in the utility, `@napi-rs/keyring` is simpler (direct call).
- For architectures where secrets must be accessed from multiple processes, main-process relay is a natural fit.

---

## Gaps / follow-ups

- No side-by-side performance comparison of `@napi-rs/keyring` read-latency vs. safeStorage-via-IPC read-latency on modern hardware. Expected order of magnitude: both sub-10ms.
- Long-term stability of the safeStorage API (has had breaking changes in Electron 15, 21, 28) vs. the stable keyring-rs crate (v3.x semver-compatible).
