# Evidence: D1 — Gmail HTML sanitizer behavior on inline SVG

**Dimension:** Gmail's handling of pasted inline `<svg>`
**Date:** 2026-05-01
**Sources:** Caniemail.com, formbricks GitHub issue #5947, Medium (Khalil 2025), Hashrocket TIL, Filippo Valsorda's Gmail proxy analysis, Litmus community

## Key sources

- [Can I email — Embedded `<svg>`](https://www.caniemail.com/features/html-svg/) — last tested **February 2020**, support matrix
- [SVG Icons Not Displaying in Email Clients (Gmail, Outlook) · formbricks/formbricks#5947](https://github.com/formbricks/formbricks/issues/5947) — empirical confirmation
- [Why Your SVG Icons Break in Gmail — Khalil (Medium, Apr 2025)](https://medium.com/@muhammadabdullahkhalil/why-your-svg-icons-break-in-gmail-and-how-to-fix-it-in-rails-with-one-line-of-code-eb4f62fdb073)
- [Gmail HTML Email: CSS Support, Limitations, and Workarounds — Emailens](https://emailens.dev/blog/gmail-html-email)
- [How the new Gmail image proxy works — Filippo Valsorda](https://words.filippo.io/how-the-new-gmail-image-proxy-works-and-what-this-means-for-you/)
- [Set up an image URL proxy allowlist — Google Workspace Admin Help](https://support.google.com/a/answer/3299041?hl=en)

## Findings

### Finding D1-1: Gmail blocks inline `<svg>` elements entirely

**Confidence:** CONFIRMED
**Evidence:**
- formbricks/formbricks#5947 (2024): _"Major email clients (Gmail, Outlook, and others) do not support SVG files, causing smiley rating icons to appear as broken images or not display at all."_ Confirmed for **Gmail Desktop AND Gmail Mobile**.
- Khalil (Medium, Apr 2025): _"Gmail **blocks inline** `<svg>` **elements**"_ — explicitly stated as the cause of broken icons.
- Hashrocket TIL ("Do not serve SVG images in email content"): _"the Google image proxy that every image gets served by when mail is processed through Gmail will not serve your SVG content."_

**Implications:** A live-DOM walker that emits `<svg class="lucide-chevron-right" stroke="currentColor"><path d="..."/></svg>` produces zero rendered output in Gmail. The SVG element is dropped before render.

### Finding D1-2: Caniemail.com's "Gmail supports embedded SVG" data is from Feb 2020 and contradicts current empirical reality

**Confidence:** CONFIRMED
**Evidence:**
- caniemail.com/features/html-svg lists Gmail as "Full Support" with last-tested date of **2020-02-06**.
- Multiple 2024-2025 reports (formbricks #5947, Khalil 2025, Hashrocket TIL) confirm empirical Gmail SVG breakage.
- The discrepancy is attributable to Gmail's image-proxy policy tightening since 2020 (privacy + security hardening; SVG can carry JS / external requests).

**Implications:** The 2020 caniemail snapshot is misleading; the 2024-2026 state is "blocked." Treat empirical reports + the Google image proxy behavior as authoritative.

### Finding D1-3: Gmail's image proxy rewrites every `<img src>` URL

**Confidence:** CONFIRMED
**Evidence:**
- Filippo Valsorda (2014, ongoing): _"Gmail rewrites all image URLs in email content to call Google's content caching service googleusercontent.com, for example replacing an image src of `http://mysite.com/i.jpg` with a URL like `https://ci3.googleusercontent.com/proxy/…#http://mysite.com/i.jpg`."_
- Google Workspace Admin Help: documents the proxy + the allowlist mechanism for internal-IP/cookie-protected images.
- Litmus community: confirms re-hosting/caching behavior since 2013.

**Implications:** A `<img src="https://your-cdn.com/icons/info.png">` in clipboard HTML pasted into Gmail will be rewritten to a googleusercontent.com proxy URL. The proxy refuses to serve SVG content (per D1-1); it serves PNG/JPG/GIF. **Public CDN URLs work; localhost / internal IPs / cookie-dependent URLs fail.**

### Finding D1-4: Gmail blocks `<img src="data:image/...">` base64 data URIs

**Confidence:** CONFIRMED
**Evidence:**
- Multiple Gmail Community / Medium articles: _"Gmail does not support base64 images in HTML emails. More specifically, Gmail doesn't support adding images as Base64 strings inside HTML img tags. ... If you try to send base64 images to Gmail, the image will not be displayed in the email body but will be displayed as an attachment instead."_
- Reason cited: _"Gmail blocks Base64 images due to security policies intended to protect users from potentially harmful content. Inline Base64 images have historically been exploited to hide malware or phishing links."_
- Recommended alternatives: CID (Content-ID) embedding for outbound mail, OR HTTP-hosted images for cross-app paste.

**Implications:** Neither `data:image/svg+xml;base64,...` nor `data:image/png;base64,...` is a viable cross-app delivery shape for Gmail. **Hosted PNG via HTTPS URL is the only image-form that survives.**

**Note on Khalil article tension:** The April 2025 Medium piece advocates `data:image/svg+xml;base64,...` as a fix for Rails server-rendered email templates. This may work in some send-side contexts but contradicts the broader paste-from-clipboard literature. UNCERTAIN whether the Khalil approach works for clipboard paste vs. only for outbound-template rendering. Real-destination smoke testing required to disambiguate.

### Finding D1-5: Gmail's CSS allowlist drops most properties; only a narrow inline-style subset survives

**Confidence:** CONFIRMED
**Evidence:** Emailens — _"Gmail's sanitizer permits these inline styles: background-color, border, color, font-family, font-size, font-style, font-weight, line-height, margin, padding, text-align, text-decoration, vertical-align, width, height, max-width, max-height, and specific display values (block, inline, inline-block, none)."_
- Strips: `<style>` blocks, class-based styles (rewrites class names), `display: flex/grid`, `position`, `@media` queries, `@font-face`, animations, `background-image`, CSS variables, `float`.

**Implications:** `currentColor` is not in the allowlist; `stroke` and `fill` are not in the allowlist (they're SVG-only). Even if Gmail accepted `<svg>` (it doesn't), the color resolution path through `stroke="currentColor"` + parent `color: rgb(...)` would fail. The walker's oklch→rgb conversion is necessary but not sufficient — without `<svg>` survival, color-correctness is moot.

## Negative searches

- Searched: "Gmail SVG render specific subset 2025" → no evidence Gmail keeps any SVG subset; all evidence points to full strip.
- Searched: Gmail Help official docs on supported HTML tags → Google does not publish a complete allowlist (consistent across all sources).

## Gaps / follow-ups

- **UNCERTAIN whether `data:image/svg+xml` works specifically on clipboard-paste path (vs send-mail path).** Khalil's Rails fix vs. the broader "Gmail blocks data URIs" claim need empirical testing in Gmail compose.
- **Gmail account-type variance**: caniemail.com noted "linked SVG only works with non-Google accounts" — the Google-account vs Workspace-account split might affect paste behavior too. Untested.
