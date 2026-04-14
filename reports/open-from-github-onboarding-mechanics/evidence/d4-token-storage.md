# Evidence: D4 — Token storage

**Dimension:** Where editors persist GitHub tokens on-device in 2026
**Date:** 2026-04-14
**Sources:** VSCode SecretStorage, keytar/keyring ecosystem (web-verified), GitHub Desktop keytar, gh CLI go-keyring

---

## Findings

### Finding: keytar is effectively abandoned but not formally deprecated on npm
**Confidence:** CONFIRMED
**Evidence:**
- npm registry for `keytar@7.9.0` has no `deprecated` field ([registry.npmjs.org/keytar/latest](https://registry.npmjs.org/keytar/latest), accessed 2026-04-14)
- GitHub repo archived 2022-12-15 ([github.com/atom/node-keytar](https://github.com/atom/node-keytar), accessed 2026-04-14)
- Last release `7.9.0` on 2022-02-17 (4+ years stale)
- Weekly downloads: 2,199,951 — enormous transitive legacy usage ([api.npmjs.org/downloads/point/last-week/keytar](https://api.npmjs.org/downloads/point/last-week/keytar), accessed 2026-04-14)

Downstream projects actively migrating off: Element Desktop ([element-hq/element-desktop#1947](https://github.com/element-hq/element-desktop/issues/1947)), Joplin ([laurent22/joplin#8829](https://github.com/laurent22/joplin/issues/8829)), Gemini CLI ([google-gemini/gemini-cli#21537](https://github.com/google-gemini/gemini-cli/issues/21537)), EnvKey ([envkey/envkey#113](https://github.com/envkey/envkey/issues/113)).

### Finding: VSCode migrated to Electron safeStorage in mid-2023
**Confidence:** CONFIRMED
**Evidence:** [microsoft/vscode#185677](https://github.com/microsoft/vscode/issues/185677) — shipped in June 2023 milestone, removed `node-keytar`, `vscode-encrypt`, and `KeytarShim`. New `EncryptionService` + `SecretStorageService` back the extension-facing `SecretStorage` API.

Note: `safeStorage` is Electron-main-only ([electronjs.org/docs/latest/api/safe-storage](https://www.electronjs.org/docs/latest/api/safe-storage)). **Not available to a plain Node/Bun CLI.** Rule out for non-Electron products.

### Finding: @napi-rs/keyring is the credible Node replacement in 2026
**Confidence:** CONFIRMED
**Evidence:**
- Latest `1.2.0` on 2025-09-02, weekly downloads ~192,000 ([registry.npmjs.org/@napi-rs/keyring](https://registry.npmjs.org/@napi-rs/keyring), accessed 2026-04-14)
- Wider platform matrix than keytar: Darwin x64/arm64, Linux x64/arm64 glibc+musl, arm gnueabihf, riscv64, Windows x64/ia32/arm64, FreeBSD x64
- Backends: macOS Keychain, Windows Credential Manager, Linux libsecret/Secret Service
- Advertises itself as "100% compatible node-keytar alternative" ([github.com/Brooooooklyn/keyring-node](https://github.com/Brooooooklyn/keyring-node))
- Built on [keyring-rs](https://github.com/hwchen/keyring-rs) — widely-used Rust crate

Adoption status: promising but not universal. Azure SDK closed its keytar-swap issue as "not planned" ([Azure/azure-sdk-for-js#29288](https://github.com/Azure/azure-sdk-for-js/issues/29288)). MSAL node has it open ([AzureAD/microsoft-authentication-library-for-js#7170](https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/7170)). No flagship like VSCode has publicly endorsed yet.

### Finding: Bun compatibility of @napi-rs/keyring is probable but untested
**Confidence:** INFERRED
**Evidence:** Bun implements standard Node-API; @napi-rs/keyring uses the standard napi-rs build pipeline. No "broken on Bun" issue found in search. Bun's docs claim broad Node.js compat ([bun.com/docs/runtime/nodejs-compat](https://bun.com/docs/runtime/nodejs-compat)). Community reporting pegs native-dep compatibility ~34% today with target ~90% by Bun 2.0 ([dev.to Bun Compatibility in 2026](https://dev.to/alexcloudstar/bun-compatibility-in-2026-what-actually-works-what-does-not-and-when-to-switch-23eb)).

**Treat as "probably works — verify with 10-line smoke test before committing."**

### Finding: No pure-JS OS-keychain binding exists
**Confidence:** CONFIRMED
**Evidence:** Every OS credential store requires native code — macOS Security.framework, Windows DPAPI/Wincred, Linux libsecret+D-Bus. No pure-JS wrapper can access these without (a) a native addon, (b) shelling to OS CLIs (`security` / `secret-tool` / PowerShell), or (c) encrypting to a file (which isn't equivalent security — the key lives next to the ciphertext).

### Finding: `cross-keychain` bundles the fallback strategy as a library
**Confidence:** CONFIRMED
**Evidence:** [github.com/magarcia/cross-keychain](https://github.com/magarcia/cross-keychain) — v1.1.0 (2025-10-07)

Priority-ordered backends:
- macOS: @napi-rs/keyring → `security` CLI → encrypted file (AES-256-GCM, 0600 perms)
- Windows: @napi-rs/keyring → PowerShell → encrypted file
- Linux: @napi-rs/keyring → `secret-tool` CLI → encrypted file

Honest about security: explicitly warns file fallback is "NOT a substitute for OS keychain." Newer library (6 months old); downloads modest. Would need code review before adoption.

### Finding: gh CLI's plaintext fallback is the in-ecosystem precedent
**Confidence:** CONFIRMED
**Evidence:** `gh-cli/internal/config/config.go:347-384`

```go
var setErr error
if secureStorage {
  setErr = keyring.Set(keyringServiceName(hostname), username, token)
  // ...
}
insecureStorageUsed := false
if !secureStorage || setErr != nil {
  c.cfg.Set([]string{hostsKey, hostname, usersKey, username, oauthTokenKey}, token)
  insecureStorageUsed = true
}
```

If keyring.Set fails or secureStorage is off, gh writes token to `~/.config/gh/hosts.yml` with no encryption. File is readable by the user only (relies on filesystem perms). Claude Code has proposed the same pattern in its own issue tracker ([anthropics/claude-code#44089](https://github.com/anthropics/claude-code/issues/44089)).

---

## Platform-native storage comparison

| Editor | Library | Storage | 2026 status |
|---|---|---|---|
| VSCode | Electron `safeStorage` + `SecretStorage` API | OS keychain via Electron | Current |
| GitHub Desktop | `keytar` | OS keychain | Using deprecated lib (Electron, could migrate to safeStorage) |
| gh CLI | `zalando/go-keyring` + plaintext fallback | OS keychain / `~/.config/gh/hosts.yml` | Current |
| Obsidian-Git (desktop) | System git credential manager | Inherits OS git auth | Transparent to plugin |
| Obsidian-Git (mobile) | Obsidian plugin localStorage | Plain localStorage | Plugin-managed |

---

## Implementation options for a Node/Bun CLI (no Electron)

1. **Minimum-viable path — Plaintext at `~/.<appname>/auth.yml` with `0600` perms.**
   - Matches gh's fallback behavior and Claude Code's approach.
   - Zero native deps; Bun-trivial.
   - Security: protects against other users on the same machine; does NOT protect against disk exfiltration.
   - Correct as a fallback path; not correct as the sole path for a privacy-sensitive product.

2. **Preferred primary — `@napi-rs/keyring` with plaintext fallback.**
   - Secure-by-default for the 90% happy path.
   - Falls back gracefully on headless Linux / SSH sessions without D-Bus.
   - Needs runtime smoke test on non-Node runtimes (Bun, Deno).

3. **Cascade wrapper alternative — `cross-keychain`.**
   - Bundles the cascade (@napi-rs/keyring → OS CLI → file).
   - One dep instead of bespoke cascade logic.
   - Less mature (~6 months as of 2026-04-14); evaluate code quality before adopting.

4. **Delegate-only — rely on gh auth git-credential.**
   - If the product requires `gh` to be installed for private-repo clone, the product stores nothing.
   - Simplifies to zero-auth-layer on the editor side.
   - Breaks the "non-developer" story — gh is a developer tool with a non-trivial install + login step.

---

## Gaps / follow-ups

- "Sign out" UX is non-trivial: OS keychains must be explicitly cleared; plaintext files rewritten. VSCode's token revocation flow (calls `DELETE /applications/{clientId}/token`) is precedent but requires `clientId` knowledge server-side.
- Multi-account (multiple GitHub logins per machine) is out of initial scope; gh supports it via `users.<login>.oauth_token` — plausible future extension.
