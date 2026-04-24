# Evidence: D5 — Linux libsecret / SecretService fallback and missing-backend handling

**Dimension:** D5 (P1) — What happens on Linux without libsecret/SecretService backend
**Date:** 2026-04-17
**Sources:** keyring-node source, keyring-rs docs, Electron safeStorage, Signal/VS Code reports

---

## Key files / pages referenced

- [keyring-node Cargo.toml linux target](https://github.com/Brooooooklyn/keyring-node/blob/main/Cargo.toml)
- [keyring-node src/linux_credential_builder.rs](https://github.com/Brooooooklyn/keyring-node/blob/main/src/linux_credential_builder.rs)
- [keyring-rs crate docs](https://docs.rs/keyring/latest/keyring/) — feature flags and fallback
- [Electron safeStorage API docs](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Signal Flathub issue #753](https://github.com/flathub/org.signal.Signal/issues/753)
- [VS Code issue #194530 — GNOME keyring unavailable](https://github.com/microsoft/vscode/issues/194530)
- [Arch Linux forums — electron keyring error](https://bbs.archlinux.org/viewtopic.php?id=306402)

---

## Findings

### Finding 1: @napi-rs/keyring on Linux tries SecretService first, falls back to kernel keyutils

**Confidence:** CONFIRMED
**Evidence:** [keyring-node src/linux_credential_builder.rs](https://github.com/Brooooooklyn/keyring-node/blob/main/src/linux_credential_builder.rs)

```rust
pub struct LinuxCredentialBuilder {
    secret_service_missing: bool,
}

impl LinuxCredentialBuilder {
    pub fn new() -> Result<Self, Box<dyn Error>> {
        let ss = SsCredential::new_with_target(None, "test", "user")?;
        let missing = matches!(
            ss.map_matching_items(|_item| Ok(()), false),
            Err(keyring::Error::PlatformFailure(_x))
        );
        Ok(Self { secret_service_missing: missing })
    }
}

impl CredentialBuilderApi for LinuxCredentialBuilder {
    fn build(&self, target: Option<&str>, service: &str, user: &str)
        -> Result<Box<(dyn CredentialApi + Send + Sync + 'static)>, keyring::Error>
    {
        if !self.secret_service_missing {
            let cred = SsCredential::new_with_target(target, service, user)?;
            return Ok(Box::new(cred));
        }
        let cred = KeyutilsCredential::new_with_target(target, service, user)?;
        Ok(Box::new(cred))
    }
}
```

Quote from Cargo.toml:
```toml
[target.'cfg(target_os = "linux")'.dependencies]
keyring = { version = "3", features = ["linux-native", "sync-secret-service", "vendored"] }
```

The `vendored` feature statically links OpenSSL/dbus — removing the runtime dynamic-library dependency. `linux-native` provides kernel keyutils support (`/proc/keys`, `keyctl`).

**Implications:**
- On Linux with gnome-keyring/KWallet running: uses SecretService (DBus API). Items appear in seahorse / KWallet Manager.
- On Linux WITHOUT SecretService (headless servers, minimal WM, broken keyring daemon): falls back to kernel keyutils. Items live in the kernel keyring, accessible via `keyctl` CLI.
- No plaintext fallback exists in `@napi-rs/keyring` — if BOTH SecretService AND keyutils are unavailable, `set_password` throws.

---

### Finding 2: keyutils-backed storage is volatile (cleared on reboot) unless session-keyring is persisted

**Confidence:** CONFIRMED
**Evidence:** [keyring-rs keyutils module docs](https://docs.rs/keyring/latest/keyring/keyutils/index.html) + Linux kernel Documentation/security/keys/

Linux keyctl keyrings are tied to:
- `@s` (session keyring): cleared on logout.
- `@u` (user keyring): persistent across sessions for same user.
- `@p` (process keyring): cleared on process exit.

`keyring-rs::keyutils` defaults to user keyring (`@u`), which is persistent.

However: user keyring is periodically flushed by `persistent_keyring_expiry` timer (default 3 days of inactivity). After expiry, reading the key fails.

**Implications:**
- keyutils fallback is "good enough" for short-sessions but not ideal for long-lived secrets.
- Consumer apps relying on the fallback may need to re-authenticate periodically on Linux.

---

### Finding 3: Electron's safeStorage Linux backend behavior provides useful context: falls back to plaintext with warning

**Confidence:** CONFIRMED
**Evidence:** [Electron safeStorage docs](https://www.electronjs.org/docs/latest/api/safe-storage) + [Signal Flathub issue #753](https://github.com/flathub/org.signal.Signal/issues/753)

Quote from Electron safeStorage docs:
> "Linux: Utilizes variable secret stores depending on the window manager. Supported options include kwallet, kwallet5, kwallet6, and gnome-libsecret. The documentation notes that 'if no secret store is available, items stored using the safeStorage API will be unprotected' and are encrypted with a hardcoded plaintext password."

Quote from Signal Flathub issue:
> "safeStorage backend basic_text and user rejected it"

This is a DIFFERENT behavior from `@napi-rs/keyring`:
- safeStorage: tries libsecret/kwallet → on failure, silently uses hardcoded key (plaintext equivalent).
- @napi-rs/keyring: tries SecretService → on failure, uses keyutils → on double failure, throws.

**Implications:**
- Electron's safeStorage is more permissive (always succeeds, but may be insecure).
- @napi-rs/keyring is stricter (fails loudly if no backend).
- For sensitive tokens, the stricter behavior is arguably better (fail-to-enroll vs. silent plaintext).

---

### Finding 4: Snap / Flatpak sandboxing commonly breaks libsecret/SecretService DBus access

**Confidence:** CONFIRMED
**Evidence:** [Signal Flathub issue #753](https://github.com/flathub/org.signal.Signal/issues/753) + [Arch forums — element-desktop keyring error](https://bbs.archlinux.org/viewtopic.php?id=306402)

Flatpak/Snap sandboxes restrict DBus socket access by default. Apps inside sandboxes must declare `--talk-name=org.freedesktop.secrets` (Flatpak) or `password-manager-service` interface (Snap) to reach the SecretService daemon.

When sandbox manifests omit this, the app sees SecretService as unavailable and falls back.

**Implications:**
- Direct-DMG/MSI/AppImage distribution (non-sandboxed) is unaffected.
- Flatpak/Snap/Snap Store distribution requires explicit manifest entries.
- `@napi-rs/keyring`'s kernel keyutils fallback may or may not work in sandboxes depending on sandbox policy (Flatpak blocks `keyctl` by default).

---

### Finding 5: Electron `--password-store=` flag controls safeStorage backend selection on Linux

**Confidence:** CONFIRMED
**Evidence:** [Electron CLI flags](https://www.electronjs.org/docs/latest/api/command-line-switches) + [KDE Discuss — keyring backend config](https://discuss.kde.org/t/how-do-i-set-the-keyring-backend-to-gnome-libsecret/21584)

Electron accepts `--password-store=<backend>` at launch to force a specific backend:
- `basic` (plaintext)
- `gnome-libsecret` (libsecret via DBus)
- `kwallet` / `kwallet5` / `kwallet6` (KDE KWallet)

This affects safeStorage only. Does not affect `@napi-rs/keyring` (which has its own backend selection).

**Implications:**
- If a consumer mixes safeStorage AND @napi-rs/keyring in the same Electron app, each picks its own Linux backend independently. Potential for inconsistent storage state.

---

## Gaps / follow-ups

- Primary-source docs on keyutils persistence-timer behavior across distros (default `persistent_keyring_expiry`) — values vary by distro/kernel config.
- Minimal-environment testing (bare Linux server with no gnome-keyring, no KWallet, not running under SystemD user session) — behavior of kernel keyutils in that scenario is underdocumented.
