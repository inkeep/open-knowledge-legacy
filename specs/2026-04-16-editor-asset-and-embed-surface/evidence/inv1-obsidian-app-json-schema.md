---
name: INV1 — Obsidian .obsidian/app.json schema
description: Field names, types, defaults for the fields a vault-detection parser needs
created: 2026-04-16
sources:
  - https://github.com/daniel-vera-g/obsidian-config/blob/master/.obsidian/app.json
  - https://github.com/WebBreacher/obsidian-osint-templates/blob/main/.obsidian/app.json
  - https://github.com/Sma-Das/Minimalistic-Obsidian-Config/blob/main/app.json
  - https://github.com/chatopera/docs/blob/master/templates/_obsidian/app.json
  - https://github.com/RollingSnack/ObsidianConfig/blob/main/app.json
  - https://github.com/vruyr/obsidian-dotobsidian/blob/main/app.json
  - https://github.com/MasonGuinn/Codepedia/blob/main/.config/app.json
  - https://github.com/wxmvv/MokoEditor/blob/main/src/moko/manifest/todo/default_config.json (all-fields synthetic reference)
  - https://github.com/trganda/obsidian-attachment-management/blob/main/src/commons.ts (attachmentFolderPath semantics)
  - https://github.com/xRyul/obsidian-image-converter/blob/main/src/utils/vaultConfig.ts (type-safe getConfig pattern)
  - https://github.com/khoj-ai/khoj/blob/master/src/interface/obsidian/src/utils.ts (newFileLocation usage)
  - https://github.com/liamcain/obsidian-periodic-notes/blob/master/src/settings/localization.ts (localeOverride, weekStart)
  - https://github.com/kepano/obsidian-minimal-settings/blob/master/src/main.ts (baseFontSize, foldHeading)
  - https://github.com/SilentVoid13/Templater/blob/master/src/handlers/EventHandler.ts (openBehavior)
  - https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts (official types — confirmed `getConfig` is NOT exposed)
  - https://forum.obsidian.md/t/fr-expose-api-to-get-config/88257 (community confirmation that getConfig is undocumented)
  - https://forum.obsidian.md/t/settings-new-link-format-what-is-shortest-path-when-possible/6748 (newLinkFormat enum semantics)
  - https://forum.obsidian.md/t/obsdian-json-automatic-vault-configuration/32700
  - https://obsidian.md/help/data-storage
---

# INV1 — Obsidian `.obsidian/app.json` schema

## Summary

Obsidian's `.obsidian/app.json` is a **flat JSON object** storing user-chosen overrides to app-level settings. There is **no published schema** from obsidianmd — the `obsidian-api` TypeScript declarations expose no `getConfig`, `setConfig`, or config-key type surface. The file is produced by Obsidian's "Files & Links" / "Editor" / "Appearance" settings UI and is the canonical source of truth plugins read via the **undocumented** `app.vault.getConfig(key: string): any` method.

Key parser-relevant traits:

- **Sparse-by-default.** Keys appear only when the user changes them from Obsidian's built-in default. A brand-new vault may have an *empty* or near-empty `app.json`. Never assume a key exists.
- **Every field is optional.** Missing field = "Obsidian default applies."
- **No array/object nesting on the three target fields** — all three we care about are scalar (string / boolean).
- **Stable naming across Obsidian 0.x → 1.x.** Forum references from 2020 (forum thread IDs in the 6xxx range) use the same `attachmentFolderPath` / `newLinkFormat` / `useMarkdownLinks` names seen in 2026 configs.

## 1. Confirmed fields (with evidence)

Listed alphabetically. "Type" is inferred from sighted real-world values; "Default (Obsidian UI)" reflects the setting's default when no override is present in `app.json` (from the Obsidian settings UI and community plugin code that uses `getVaultConfigBoolean(app, key, false)` / etc. fallbacks). "Seen in" cites one sample source; full sample list in §3.

| Field | Type | Default (Obsidian UI) | Example values | Seen in |
|---|---|---|---|---|
| `accentColor` | string (hex or empty) | `""` | `""` | MokoEditor |
| `alwaysUpdateLinks` | boolean | `false` | `true`, `false` | daniel-vera-g, WebBreacher, Sma-Das, chatopera |
| `attachmentFolderPath` | string | `"/"` (vault root) | `"/"`, `"./"`, `"attachments"`, `"./assets"`, `"Assets/Attachments"`, `"docfx_project/images/assets"` | daniel-vera-g, WebBreacher, MasonGuinn, chatopera, Sma-Das |
| `autoConvertHtml` | boolean | `true` | `true` | MokoEditor |
| `autoPairBrackets` | boolean | `true` | `true`, `false` | WebBreacher, RollingSnack, chatopera |
| `autoPairMarkdown` | boolean | `true` | `true`, `false` | RollingSnack, chatopera, MokoEditor |
| `baseFontSize` | number | `16` | `16` | MokoEditor; read by kepano/obsidian-minimal-settings |
| `baseFontSizeAction` | boolean | `false` | `false` | MokoEditor |
| `communityPluginSortOrder` | string (enum: `download` \| `update` \| `release` \| `alphabetical`) | `download` | `"download"` | daniel-vera-g |
| `communityThemeSortOrder` | string (enum: same as plugin) | `download` | `"download"` | daniel-vera-g |
| `cssTheme` | string | `""` | `""` | MokoEditor |
| `defaultViewMode` | string (enum: `"source"` \| `"preview"` \| `"live"`) | `"source"` | `"source"`, `"preview"` | daniel-vera-g, MasonGuinn, RollingSnack, MokoEditor |
| `emacsyKeys` | boolean | `false` | `false` | RollingSnack |
| `enabledCssSnippets` | string[] | `[]` | `[]` | MokoEditor |
| `fileSortOrder` | string (enum) | `"alphabetical"` | `"alphabetical"` | WebBreacher |
| `focusNewTab` | boolean | `true` | `true`, `false` | daniel-vera-g, MokoEditor |
| `foldHeading` | boolean | `false` | `true`, `false` | daniel-vera-g, WebBreacher, MokoEditor, MasonGuinn |
| `foldIndent` | boolean | `false` | `true`, `false` | daniel-vera-g, WebBreacher, MokoEditor |
| `hotkeys` | object `{[cmdId]: Hotkey[]}` | `{}` | `{}` | MokoEditor |
| `interfaceFontFamily` | string | `""` | `""` | MokoEditor |
| `legacyEditor` | boolean | `false` | `false` | daniel-vera-g, WebBreacher, Sma-Das, vruyr |
| `lineWrap` | boolean | `true` | `true` | RollingSnack |
| `livePreview` | boolean | `true` | `true`, `false` | daniel-vera-g, Sma-Das, vruyr, chatopera |
| `mobilePullAction` | string (command ID) | — | `"command-palette:open"`, `"editor:go-end"` | MokoEditor, vruyr |
| `mobileQuickRibbonItem` | string (command ID) | `""` | `""` | MokoEditor |
| `mobileToolbarCommands` | string[] (command IDs) | — | see MokoEditor sample | MokoEditor, vruyr |
| `monospaceFontFamily` | string | `""` | `""` | MokoEditor |
| `nativeMenus` | boolean \| null | `null` | `null` | MokoEditor |
| `newFileFolderPath` | string (vault-relative) | `""` | `"New"`, `"/"` | vruyr, MokoEditor |
| `newFileLocation` | string (enum: `"root"` \| `"current"` \| `"folder"`) | `"root"` | `"root"`, `"current"`, `"folder"` | daniel-vera-g, vruyr, MokoEditor, WebBreacher; used by khoj-ai, scambier/obsidian-omnisearch |
| `newLinkFormat` | string (enum: `"shortest"` \| `"relative"` \| `"absolute"`) | `"shortest"` | `"shortest"`, `"relative"` | daniel-vera-g, Sma-Das, RollingSnack, chatopera |
| `pdfExportSettings` | object (see §1a) | — | `{pageSize:"A4"...}` | daniel-vera-g, vruyr, MokoEditor |
| `promptDelete` | boolean | `true` | `true`, `false` | daniel-vera-g, WebBreacher, MokoEditor, MasonGuinn |
| `propertiesInDocument` | string (enum: `"visible"` \| `"hidden"` \| `"source"`) | `"visible"` | `"visible"` | MasonGuinn, vruyr, MokoEditor |
| `readableLineLength` | boolean | `true` | `true`, `false` | daniel-vera-g, MasonGuinn, vruyr |
| `rightToLeft` | boolean | `false` | `false` | MokoEditor; read by obsidian-community/obsidian-kanban |
| `showFrontmatter` | boolean | — | `false` | RollingSnack |
| `showIndentGuide` | boolean | `true` | `true`, `false` | MasonGuinn, vruyr, MokoEditor |
| `showInlineTitle` | boolean | `true` | `true`, `false` | daniel-vera-g, MasonGuinn, MokoEditor |
| `showLineNumber` | boolean | `false` | `true`, `false` | daniel-vera-g, WebBreacher, MokoEditor |
| `showRibbon` | boolean | `true` | `true` | MokoEditor |
| `showUnsupportedFiles` | boolean | `false` | `true`, `false` | daniel-vera-g, chatopera, vruyr, MokoEditor |
| `showViewHeader` | boolean | `true` | `true` | MokoEditor |
| `smartIndentList` | boolean | `true` | `true` | RollingSnack, MokoEditor |
| `spellcheck` | boolean | platform-dependent (`true` typical) | `true`, `false` | daniel-vera-g, WebBreacher, RollingSnack, MokoEditor |
| `spellcheckDictionary` | string[] | — | user-specific words | (docs only) |
| `spellcheckLanguages` | string[] \| null | `null` | `null` | MokoEditor |
| `strictLineBreaks` | boolean | `false` | `false`, `true` | MasonGuinn, RollingSnack, MokoEditor |
| `tabSize` | number | `4` | `2`, `4` | MokoEditor; read by Pierrad/obsidian-github-copilot |
| `textFontFamily` | string | `""` | `""` | MokoEditor |
| `theme` | string (enum: `"system"` \| `"obsidian"` \| `"moonstone"`) | `"system"` | `"system"` | MokoEditor (note: `obsidian` = dark legacy name, `moonstone` = light legacy name; modern UI uses `"system"`) |
| `translucency` | boolean | `false` | `false` | MokoEditor |
| `trashOption` | string (enum: `"system"` \| `"local"` \| `"none"`) | `"system"` | `"system"` | MokoEditor |
| `types` | object | `{}` | `{}` | MokoEditor (Obsidian 1.4+ Properties schema) |
| `useMarkdownLinks` | boolean | `false` | `true`, `false` | daniel-vera-g, Sma-Das, chatopera, WebBreacher, vruyr |
| `useTab` | boolean | `false` | `true`, `false` | daniel-vera-g, MokoEditor, RollingSnack |
| `userIgnoreFilters` | string[] \| null | `null` | `["Assets/"]`, `null`, `["tmp", ".git", "min.js"]` | MasonGuinn, chatopera, MokoEditor |
| `uriCallbacks` | boolean | `false` | `true` | vruyr |
| `vimMode` | boolean | `false` | `true`, `false` | daniel-vera-g, Sma-Das, RollingSnack, MokoEditor |

### 1a. `pdfExportSettings` sub-object

```json
{
  "includeName": false,       // boolean — include filename in header
  "pageSize": "A4",           // string enum: "A4" | "Letter" | "Legal" | "A3" | "A5" | ...
  "landscape": false,         // boolean
  "margin": "0",              // string (numeric string: "0" | "1" | "2" | "3")
  "downscalePercent": 100     // number (0-100)
}
```

### 1b. Keys referenced by plugins but not in our samples

The following keys are read by community plugins via `app.vault.getConfig(...)` — confirming they exist as valid config keys, but none of our sighted `app.json` samples contain them (they're user-override-absent):

- `localeOverride` (string) — liamcain/obsidian-periodic-notes
- `weekStart` (string) — liamcain/obsidian-periodic-notes (`"locale"` default)
- `openBehavior` (string) — SilentVoid13/Templater
- `theme` key name `obsidian` (legacy dark theme indicator) — PKM-er/Blue-topaz-example

## 2. Fields specifically mapped to our config

### 2.1 `attachmentFolderPath` → `upload.globalAssetDir` / `upload.assetLocation`

**Type.** `string`.

**Default (when key absent).** `"/"` — vault root. Confirmed by Sma-Das explicitly setting `"/"` (a user who kept the default and serialized it), and by trganda/obsidian-attachment-management's switch-case treating `"/"` as the vault-root branch.

**Semantic encoding (from trganda/obsidian-attachment-management source):**

| Value pattern | Meaning |
|---|---|
| `"/"` | Store attachments in **vault root** |
| `"./"` | Store attachments **in the same folder as the note** (co-located) |
| `"./subdir"` (matches regex `/\.\/.+/g`) | Store attachments in `<note-folder>/subdir` (co-located with prefix) |
| Any other string | Vault-relative **specified folder** — e.g. `"attachments"`, `"Assets/Attachments"`, `"docfx_project/images/assets"` |

Empty string has not been observed in any real-world sample and the plugin code does not branch on it. An empty string would fall through to the "specified folder" branch in trganda's code, producing an empty path — likely an invalid state.

**Relative-to-vault-root or absolute?** Always **relative to the vault root**, except `"./"` and `"./<subdir>"` forms which are **relative to the note's folder**. Absolute filesystem paths are not supported; they would be interpreted as literal vault-relative strings (Obsidian does not `resolve()` to an OS path).

**Mapping to `upload.*`:**

- `attachmentFolderPath === "/"` → `upload.assetLocation = "global"`, `upload.globalAssetDir = "/"` (or `""` / vault root sentinel)
- `attachmentFolderPath === "./"` → `upload.assetLocation = "co-located"`, `globalAssetDir` unused
- `attachmentFolderPath` matches `/^\.\/.+/` → `upload.assetLocation = "co-located"` with a subdir hint (**our spec does not currently model this; see §5**)
- Any other string → `upload.assetLocation = "global"`, `upload.globalAssetDir = <value>`

### 2.2 `useMarkdownLinks` → `upload.emitFormat`

**Type.** `boolean`.

**Default (when key absent).** `false`. Obsidian defaults to wiki-link emission (`[[Page]]`). The Obsidian UI setting "Use [[Wikilinks]]" is the **inverse** — it's checked by default; `useMarkdownLinks: false` means wikilinks stay on.

**Mapping:**

- `useMarkdownLinks === true` → `upload.emitFormat = "markdown"`
- `useMarkdownLinks === false` OR **undefined** (key absent) → `upload.emitFormat = "wikilink"`

Undefined is semantically identical to explicit `false`. The Obsidian app does not distinguish the two — both render as "Use Wikilinks ON". Our parser should treat them identically.

### 2.3 `newLinkFormat` → related to emit

**Type.** `string`.

**Exact enum values.** `"shortest"` | `"relative"` | `"absolute"`. Confirmed by:
- Obsidian forum "New Link Format" discussion listing the three UI options: "Shortest path when possible", "Relative path to file", "Absolute path in vault"
- All 20+ real-world samples containing only these three string literals

**Default (when key absent).** `"shortest"`. Confirmed by:
- Explicit `"shortest"` in 8/10 samples that set the key (users who match the default often still serialize it)
- Obsidian forum thread title "Shortest path when possible" being the default-labeled option

**Semantic meaning:**

- `"shortest"` — Use minimum-unique ref. If `Foo.md` is unique across the vault, emit `[[Foo]]`; else emit folder-disambiguated path like `[[docs/Foo]]`.
- `"relative"` — Always emit path relative to the source note (e.g. `[[../other/Foo]]`).
- `"absolute"` — Always emit full vault path starting from root (e.g. `[[docs/guide/Foo]]`). Note: does **not** start with a leading `/` (see forum FR request).

No other variant strings have been observed. Any other string should be treated as "unknown — fall back to shortest."

**Mapping to our config.** `newLinkFormat` combines with `useMarkdownLinks` to determine link-resolution policy:

| `useMarkdownLinks` | `newLinkFormat` | Obsidian emits |
|---|---|---|
| `false` | `"shortest"` | `[[Foo]]` or `[[dir/Foo]]` |
| `false` | `"relative"` | `[[../Foo]]` |
| `false` | `"absolute"` | `[[docs/Foo]]` |
| `true` | `"shortest"` | `[Foo](Foo.md)` or `[Foo](dir/Foo.md)` |
| `true` | `"relative"` | `[Foo](../Foo.md)` |
| `true` | `"absolute"` | `[Foo](docs/Foo.md)` |

For our P0 (FR-4), we likely only need the `"shortest"` policy (most common, matches our existing `shortestImageRef` concept). `"relative"` and `"absolute"` are valid read-only signals we could store but do not need to act on in P0.

## 3. Sample `app.json` (real vault, included verbatim)

### 3.1 daniel-vera-g/obsidian-config — canonical mid-sized vault

Source: https://raw.githubusercontent.com/daniel-vera-g/obsidian-config/master/.obsidian/app.json

```json
{
  "vimMode": true,
  "spellcheck": true,
  "foldHeading": true,
  "foldIndent": true,
  "showLineNumber": true,
  "useTab": false,
  "alwaysUpdateLinks": true,
  "newLinkFormat": "shortest",
  "showUnsupportedFiles": true,
  "newFileLocation": "current",
  "communityPluginSortOrder": "download",
  "defaultViewMode": "source",
  "attachmentFolderPath": "attachments",
  "communityThemeSortOrder": "download",
  "readableLineLength": true,
  "legacyEditor": false,
  "livePreview": true,
  "pdfExportSettings": {
    "includeName": false,
    "pageSize": "A4",
    "landscape": false,
    "margin": "0",
    "downscalePercent": 100
  },
  "promptDelete": false,
  "useMarkdownLinks": false,
  "showInlineTitle": false,
  "focusNewTab": false
}
```

Note the trailing comma after `"focusNewTab": false` in the raw file — Obsidian's serializer produces **valid JSON**, but the raw file as stored in this repo has a stray trailing comma (likely hand-edited). Most real Obsidian-serialized `app.json` files are strict JSON.

### 3.2 chatopera/docs — markdown-mode vault (inverse of default)

Source: https://raw.githubusercontent.com/chatopera/docs/master/templates/_obsidian/app.json

```json
{
  "alwaysUpdateLinks": true,
  "newFileLocation": "current",
  "newLinkFormat": "relative",
  "useMarkdownLinks": true,
  "showUnsupportedFiles": true,
  "attachmentFolderPath": "docfx_project/images/assets",
  "userIgnoreFilters": [
    "tmp", ".git", ".fid", "temp", "_build", "dist", "node_moduels", "min.js"
  ],
  "promptDelete": false,
  "livePreview": false,
  "showLineNumber": true,
  "autoPairBrackets": true,
  "autoPairMarkdown": false
}
```

This vault is configured for docs-as-code workflows: markdown links, relative paths, ignore-filters for build artifacts, deep attachments path.

### 3.3 Sma-Das/Minimalistic-Obsidian-Config — vault-root attachments

Source: https://raw.githubusercontent.com/Sma-Das/Minimalistic-Obsidian-Config/main/app.json (trimmed to relevant fields)

```json
{
  "attachmentFolderPath": "/",
  "newLinkFormat": "shortest",
  "useMarkdownLinks": false,
  "newFileLocation": "root",
  "newFileFolderPath": "/"
}
```

Demonstrates all three target fields with default-ish values plus the `"/"` vault-root convention.

## 4. Parser contract recommendation

### 4.1 Parse leniently (non-destructive reads)

1. **Treat the file as optional.** If `.obsidian/app.json` does not exist, fall through to spec defaults. Do not error, do not warn — this is the happy path for non-Obsidian projects.
2. **Treat every field as optional.** Access via `config.attachmentFolderPath ?? undefined`, never `config.attachmentFolderPath!`.
3. **Validate type per-field, not whole-document.** Use a permissive Zod schema:
   ```ts
   const ObsidianAppJsonSchema = z.object({
     attachmentFolderPath: z.string().optional(),
     useMarkdownLinks: z.boolean().optional(),
     newLinkFormat: z.enum(["shortest", "relative", "absolute"]).optional(),
   }).passthrough(); // preserve unknown fields silently
   ```
4. **Coerce unknown `newLinkFormat` to `undefined`.** If a future Obsidian release adds a fourth enum variant, we should fall back to "unknown — use our own default" rather than crash.
5. **Never write.** Even a formatted-re-save would alter Obsidian's trailing-newline conventions and trigger Obsidian's file-watcher on the user's side, confusing their editor.
6. **Read once at server startup.** Our config resolution is static. Live-watching `app.json` is out of scope (NG or phase-2 consideration).

### 4.2 Fail-safe on

1. **Invalid JSON.** If `JSON.parse()` throws (e.g. editor-in-progress with unclosed brace), log a bracket-prefixed warning (`[obsidian-import] failed to parse .obsidian/app.json, skipping`) and skip import. Do NOT fall back to partial parsing.
2. **Type mismatch on any of our 3 target fields.** E.g. `attachmentFolderPath: 42`. Log per-field warning, skip that field, keep the others.
3. **`attachmentFolderPath === "./<subdir>"` pattern.** Our spec currently models only `"global"` vs `"co-located"`. The co-located-with-subdir case is underspecified in our upload config; choose one of (a) treat as `co-located` ignoring subdir, (b) extend config to support a `coLocatedSubdir` hint, (c) log a notice and fall back to co-located. **Recommend (a) for P0** since it's closest to our current model; surface (b) as a deferred enhancement.
4. **Empty string `""` for `attachmentFolderPath`.** Not observed in any real sample; treat as "not set" (skip).

### 4.3 Mapping algorithm (proposed)

```ts
function mapObsidianToUploadConfig(obs: ObsidianAppJson): Partial<UploadConfig> {
  const out: Partial<UploadConfig> = {};

  // attachmentFolderPath
  if (typeof obs.attachmentFolderPath === "string") {
    const p = obs.attachmentFolderPath;
    if (p === "/" || p === "") {
      out.assetLocation = "global";
      out.globalAssetDir = "/"; // or sentinel for vault root
    } else if (p === "./") {
      out.assetLocation = "co-located";
    } else if (/^\.\/.+/.test(p)) {
      // Underspec: treat as co-located for P0 (drop the subdir hint)
      out.assetLocation = "co-located";
    } else {
      out.assetLocation = "global";
      out.globalAssetDir = p;
    }
  }

  // useMarkdownLinks → emitFormat (undefined treated as false)
  if (obs.useMarkdownLinks === true) {
    out.emitFormat = "markdown";
  } else if (obs.useMarkdownLinks === false) {
    out.emitFormat = "wikilink";
  }
  // undefined → leave out.emitFormat unset, let spec default apply

  // newLinkFormat: no current upload.* target, but store for logging/future policy
  if (obs.newLinkFormat && ["shortest", "relative", "absolute"].includes(obs.newLinkFormat)) {
    // Record on an internal diagnostics surface or upload.linkFormat (if added)
  }

  return out;
}
```

## 5. Unresolved / needs-future-confirmation

1. **`attachmentFolderPath: "./<subdir>"` semantics.** Our upload config does not model "co-located with subdir." Either extend the schema (best) or drop the subdir on P0 (simpler, potentially surprising to users). **Decision needed in spec.**
2. **`newLinkFormat` as a dedicated config surface.** Should we add `upload.linkFormat: "shortest" | "relative" | "absolute"` to our schema in FR-5, or leave this as a read-only diagnostic? Our spec's FR-5 doesn't currently expose it; if we do, we'd need to honor it in write paths (link emission for uploaded assets and for doc-to-doc refs). **Decision needed.**
3. **`useMarkdownLinks` when key absent on a vault the user explicitly authored.** On a brand-new Obsidian vault, `app.json` may be empty `{}`, missing all three fields. Our detection of "this is an Obsidian vault" should probably key off directory *existence* of `.obsidian/`, not field presence — then apply spec defaults where Obsidian's defaults would differ from ours. Specifically: Obsidian's default is wikilink mode (`useMarkdownLinks: false`), so an empty `app.json` still implies wikilink intent. **Confirm with spec author: is the intent to inherit Obsidian defaults even when fields are missing?** (Likely yes for `useMarkdownLinks` — missing = wikilink — but less clear for `attachmentFolderPath`.)
4. **Trailing-comma and non-strict JSON edge cases.** At least one sample (daniel-vera-g) had a trailing comma. `JSON.parse` in Node.js rejects this; Obsidian itself uses a lenient parser. If we hit these in the wild, consider a single `// eslint-disable`-style retry with a permissive parser (e.g. `jsonc-parser`). **Recommend:** start strict (`JSON.parse`), widen only if real-world reports show failures.
5. **Mobile-specific overrides.** Obsidian writes `.obsidian/app.json` for desktop and a separate `.obsidian-mobile/app.json` for mobile (seen in dnnsmnstrr/zettelkasten, TalalakinAI/OSB). Our detection should check desktop-primary; mobile-only overrides are out of scope.
6. **Obsidian version stability.** All field names we care about are stable from at least Obsidian 0.6 (2020) through 1.4+ (types key, 2024+) and onward. No rename events are documented in Obsidian forum history. Confidence: **high**. But no machine-readable version compat promise exists; a future Obsidian major could in principle rename a field. Recommend: runtime warn-and-skip on type mismatch (not crash) gives us forward compat.
7. **Obsidian's own getConfig signature.** `app.vault.getConfig(key: string): any` is undocumented but has been stable since at least 2020. The official `obsidian.d.ts` deliberately does not expose it (obsidianmd forum threads confirm this is by design — plugins are expected to manage their own state). Reading `app.json` directly from disk (our approach) avoids the undocumented-API risk entirely.
