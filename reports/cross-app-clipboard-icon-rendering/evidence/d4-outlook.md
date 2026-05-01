# Evidence: D4 — Outlook (web + desktop) HTML sanitizer behavior

**Dimension:** Outlook variants' handling of pasted inline `<svg>` and image alternatives.
**Date:** 2026-05-01

## Sources

- [Microsoft is retiring support for inline SVG images in Outlook — Topedia Blog (Aug 2025)](https://blog-en.topedia.com/2025/08/microsoft-is-retiring-support-for-inline-svg-images-in-outlook/)
- [Can I email — Embedded `<svg>` (caniemail.com, last updated Feb 2020)](https://www.caniemail.com/features/html-svg/)
- [Can I email — SVG image format](https://www.caniemail.com/features/image-svg/)
- [SVG Icons Not Displaying in Email Clients (Gmail, Outlook) · formbricks/formbricks#5947](https://github.com/formbricks/formbricks/issues/5947)

## Findings

### Finding D4-1: Microsoft is actively retiring inline SVG support in Outlook (Sept 2025)

**Confidence:** CONFIRMED
**Evidence (Topedia, Aug 2025):**
- _"Microsoft is discontinuing support for inline SVG images in Outlook, replacing rendered graphics with blank placeholders."_
- **Effective date:** September 2025.
- **Affected:** Outlook for the web ✓, New Outlook for Windows ✓, Outlook Classic (already blocks SVG), Outlook Mobile (no change announced).
- **Reason:** _"Inline SVG files pose cybersecurity risks because they're XML-based and can contain embedded JavaScript. Attackers exploit this capability to execute malicious scripts that enable unauthorized system access, data theft, identity compromise, and leakage of sensitive information."_
- **Replacement:** Microsoft provides no replacement technology for inline SVG functionality.
- **Impact estimate:** Microsoft estimates this affects fewer than 0.1% of images in Outlook.

**Implications:** As of Sept 2025+, every Outlook variant (Classic desktop, new desktop, Outlook for the web) actively strips `<svg>` from pasted/received HTML. Mobile Outlook lags but is the only outlier and may follow.

### Finding D4-2: Outlook Classic desktop has historically blocked SVG (pre-Sept 2025)

**Confidence:** CONFIRMED
**Evidence:**
- formbricks/formbricks#5947: _"Outlook (2007-2019 & Outlook.com): No SVG support"_
- Caniemail.com (Feb 2020 snapshot, partially superseded): listed Outlook 2007-2019 as full support — but this conflicts with the formbricks empirical data, suggesting caniemail's test may have been against a non-canonical Outlook variant, OR the policy shifted between 2020 and 2024.

**Implications:** Outlook desktop is the most aggressive HTML stripper in the matrix. It's been hostile to SVG for years; the Sept 2025 change formalizes a status quo that was already mostly true.

### Finding D4-3: Linked SVG via `<img src=".svg">` works in some Outlook variants

**Confidence:** CONFIRMED (caniemail data — limited to 2020 snapshot)
**Evidence:**
- Caniemail.com `image-svg` feature page (Jan 2023 last update): Outlook (Windows 2007-2019, macOS 2016+, Outlook.com 2020-02+, iOS/Android 2020-02+) listed as full support for *linked* SVG via `<img src>`.
- BUT: the 2025 Topedia article + recent formbricks issue suggest that with Outlook tightening SVG policy in general, the `<img src=".svg">` path may also be at risk.

**Implications:** Linking to a hosted `.svg` URL may still work for Outlook variants — but it's strictly less reliable than a hosted PNG. Treat `<img src="https://...png">` as the canonical cross-Outlook shape.

### Finding D4-4: PNG `<img src>` (HTTPS) works across all Outlook variants

**Confidence:** INFERRED (no negative evidence; consistent with historical behavior across the Outlook variants)
**Evidence:** No source found documenting Outlook stripping legitimately-formed `<img src="https://...png">`. Standard image rendering has been preserved across Outlook desktop, web, and mobile for the entirety of the surveyed period.

**Implications:** Hosted PNG via HTTPS URL is the only image-form known to survive across all 4 Outlook variants (desktop classic, desktop new, web, mobile). This is consistent with the cross-destination pattern in D2-D3-D5.

### Finding D4-5: Outlook desktop (legacy) has known issues with emoji variation selectors (U+FE0F)

**Confidence:** CONFIRMED
**Evidence:** simpletoolshub.com — _"Compatible mode avoids emoji variation selectors (which includes U+FE0F), since older Outlook may misrender them. Stick with the Compatible set, which uses classic BMP text symbols without emoji variation selectors for reliable rendering in pre-2019 versions."_

**Implications:** For "icon by emoji" approach, prefer plain BMP characters (e.g., `▶ U+25B6`, `▼ U+25BC`, `ℹ U+2139`, `⚠ U+26A0`, `✓ U+2713`) over emoji variation forms (`▶️`, `▼️`, `ℹ️`, `⚠️`). The plain forms render reliably in legacy Outlook; the variation forms may misrender.

## Negative searches

- Searched: Outlook 365 mobile policy on inline SVG → no specific source; Topedia article notes "no change announced" for mobile.
- Searched: Outlook desktop allowlist for HTML on paste → no public docs from Microsoft (consistent with their general pattern of not publishing sanitizer specs).

## Gaps / follow-ups

- **UNCERTAIN whether `<img src="https://...svg">` will continue to work in Outlook 365 web post-Sept 2025**, given the broader SVG security tightening. May be safer to mandate PNG.
- **No source found for Outlook desktop's data: URI handling.** Likely blocked given Outlook's strict allowlist + the broader anti-base64 trend in security-conscious mail clients.
