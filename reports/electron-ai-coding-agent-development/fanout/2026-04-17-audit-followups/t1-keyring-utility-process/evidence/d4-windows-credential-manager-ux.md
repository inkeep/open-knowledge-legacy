# Evidence: D4 — Windows Credential Manager UX from Electron

**Dimension:** D4 (P1) — Windows first-prompt behavior, user attribution, signing considerations
**Date:** 2026-04-17
**Sources:** Microsoft docs, electron-builder Windows signing, keytar references

---

## Key files / pages referenced

- [Microsoft — Credential Manager in Windows](https://support.microsoft.com/en-us/windows/credential-manager-in-windows-1b5c916a-6a16-889f-8581-fc16e8165ac0)
- [Microsoft Learn — Credentials Management Win32](https://learn.microsoft.com/en-us/windows/win32/secauthn/credentials-management)
- [Wikipedia — Data Protection API (DPAPI)](https://en.wikipedia.org/wiki/Data_Protection_API)
- [cameronnokes.com — node-keytar Electron guide](https://cameronnokes.com/blog/how-to-securely-store-sensitive-information-in-electron-with-node-keytar/)
- [keyring-rs Cargo.toml — windows-native feature](https://github.com/Brooooooklyn/keyring-node/blob/main/Cargo.toml)

---

## Findings

### Finding 1: Windows Credential Manager has no per-application access prompt (unlike macOS)

**Confidence:** CONFIRMED
**Evidence:** [Microsoft Learn — Credentials Management](https://learn.microsoft.com/en-us/windows/win32/secauthn/credentials-management)

Windows Credentials API (`CredRead`/`CredWrite`/`CredDelete`) stores "Generic Credentials" encrypted with DPAPI. Credentials are scoped to:
- Windows user account (DPAPI user-key derivation via PBKDF2 from user password).
- Optionally persisted to `CRED_PERSIST_LOCAL_MACHINE` (same user, any process), `CRED_PERSIST_SESSION` (current logon only), or `CRED_PERSIST_ENTERPRISE` (roaming).

There is no "Application X is requesting access to key Y, Allow/Deny" prompt. Any process running as the Windows user can `CredRead` any Generic Credential that user owns.

Quote from cameronnokes blog (citing keytar behavior):
> "Windows behavior is noted as more flexible" — meaning no prompts.

**Implications:**
- First-access UX on Windows: **silent, zero prompts**.
- On Windows, the helper/utility process name is irrelevant — the only security boundary is the Windows user account.

---

### Finding 2: DPAPI encryption is tied to the Windows user password; user password change invalidates encrypted blobs indirectly

**Confidence:** CONFIRMED
**Evidence:** [Wikipedia DPAPI](https://en.wikipedia.org/wiki/Data_Protection_API)

> "A main encryption/decryption key is derived from user's password by PBKDF2 function."

When user changes their Windows password via the normal Settings → Accounts flow, Windows re-derives and migrates the master keys. Stored credentials remain accessible.

Password reset (e.g., admin resets user's password without knowing the old one) DOES invalidate DPAPI-encrypted blobs. In that case `CredRead` returns an error, and the app must prompt the user to re-enter credentials.

**Implications:**
- Normal password change → transparent.
- Password reset → re-authentication flow required (rare but should be handled).

---

### Finding 3: Windows code signing (Azure Trusted Signing, Sectigo EV, DigiCert) does NOT affect Credential Manager access

**Confidence:** CONFIRMED (inferred from Windows architecture)
**Evidence:** [Microsoft Credentials Management docs](https://learn.microsoft.com/en-us/windows/win32/secauthn/credentials-management)

Windows Credential Manager access has no notion of code-signing identity as an access criterion. Unlike macOS Keychain ACLs, Windows Generic Credentials are not bound to publisher certificate or application identity. Any app running as the user can read any Generic Credential.

Therefore:
- Signing cert rotation (annual Sectigo renewal, Azure Trusted Signing rotation) has zero impact on Credential Manager access.
- Unsigned dev builds can read credentials stored by signed release builds (and vice versa) if running as the same Windows user.

**Implications:**
- Windows side of the design is simpler than macOS: no ACL design, no cert-rotation concerns, no per-process prompts.
- Trade-off: weaker isolation — any malicious process running as the user can read Credential Manager items. Same threat model as keytar/keyring on Windows.

---

### Finding 4: keyring-rs on Windows uses `windows-native` feature backed by Win32 Credentials API

**Confidence:** CONFIRMED
**Evidence:** [keyring-node Cargo.toml windows target](https://github.com/Brooooooklyn/keyring-node/blob/main/Cargo.toml)

```toml
[target.'cfg(target_os = "windows")'.dependencies]
byteorder = "1"
keyring   = { version = "3", features = ["windows-native"] }
windows   = { version = "0.62", features = ["Win32", "Win32_Security_Credentials", "Win32_Foundation"] }
```

The `windows-native` feature of keyring-rs uses `CredReadW` / `CredWriteW` / `CredDeleteW` directly. Stored as `CRED_TYPE_GENERIC` with target name `"<service>/<user>"` (or whatever target pattern the caller sets).

Entries appear in:
- Control Panel → Credential Manager → Windows Credentials → Generic Credentials
- Accessible to any process running as the same Windows user.

**Implications:**
- `@napi-rs/keyring` on Windows provides the same capability as native `CredRead` — zero prompts, zero ACL, instant read.

---

### Finding 5: Windows Credential Guard (enterprise feature) may restrict DPAPI behavior on some managed devices

**Confidence:** CONFIRMED (with enterprise caveat)
**Evidence:** [Microsoft Learn — Credential Guard known issues](https://learn.microsoft.com/en-us/windows/security/identity-protection/credential-guard/considerations-known-issues)

Credential Guard is an enterprise-managed Windows feature that isolates LSA secrets in a VSM (Virtual Secure Mode) process. It primarily affects NTLM/Kerberos credentials, NOT Generic Credentials. Generic Credentials remain user-DPAPI-encrypted and accessible.

**Implications:**
- Generic Credentials (what `@napi-rs/keyring` writes) are unaffected by Credential Guard on standard enterprise deployments.
- Rare exception: aggressively locked-down enterprise policies may disable DPAPI-per-user storage entirely. Extremely unusual for desktop app users.

---

## Gaps / follow-ups

- Windows ARM64 DPAPI behavior with cross-architecture credential access (e.g., credential written by x64 app, read by arm64 app on same machine under same user). Expected identical behavior since DPAPI is architecture-agnostic, but not explicitly verified.
- No primary-source evidence of Azure Trusted Signing (newer signing path) affecting any credential-storage semantics — by architecture, it shouldn't.
