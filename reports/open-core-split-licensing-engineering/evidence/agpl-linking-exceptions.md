# Evidence: GPL/AGPL Linking Exceptions

**Dimension:** Linking Exceptions
**Date:** 2026-04-11
**Sources:** FSF, GCC, OpenJDK, Qt, MySQL/Oracle, ScanCode, Nextcloud

---

## Key sources
- [GCC Runtime Library Exception v3.1](https://www.gnu.org/licenses/gcc-exception-3.1.html)
- [OpenJDK GPLv2+CE](https://openjdk.org/legal/gplv2+ce.html)
- [Qt Licensing FAQ](https://www.qt.io/faq/qt-open-source-licensing)
- [Oracle Universal FOSS Exception](https://oss.oracle.com/licenses/universal-foss-exception/)
- [ScanCode AGPL-3.0 Linking Exception](https://scancode-licensedb.aboutcode.org/agpl-3.0-linking-exception.html)
- [FSF GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html)
- [Nextcloud AGPL plugin exception](https://github.com/nextcloud/server/issues/43079)

---

## Findings

### Finding: GPLv3/AGPLv3 Section 7 explicitly authorizes "additional permissions"
**Confidence:** CONFIRMED
**Evidence:** GPLv3 text, ScanCode template

Section 7 allows the copyright holder to supplement the license with additional permissions that the licensee may remove if they choose. This is the legal mechanism behind ALL linking exceptions.

### Finding: Classpath Exception is the closest template for npm/JS scenarios
**Confidence:** CONFIRMED
**Evidence:** OpenJDK GPLv2+CE text

Text: "The copyright holders of this library give you permission to link this library with independent modules to produce an executable, regardless of the license terms of these independent modules." Java classloading is structurally analogous to JS `import`.

### Finding: AGPL linking exception template exists
**Confidence:** CONFIRMED
**Evidence:** ScanCode licensedb

Template: "If you modify this Program, or any covered work, by linking or combining it with other code, such other code is not for that reason alone subject to any of the requirements of the GNU Affero GPL version 3."

### Finding: MySQL FOSS exception only covers OSS-to-OSS, NOT proprietary
**Confidence:** CONFIRMED
**Evidence:** Oracle Universal FOSS Exception

Only permits linking with code under OSI-approved or FSF-approved licenses. Does NOT solve proprietary linking.

### Finding: FSF considers dynamically loaded plugins as derivative works
**Confidence:** CONFIRMED
**Evidence:** FSF GPL FAQ

"If the plugin is invoked through dynamic linkage, and it makes function calls to a GPL program, then the plugin is most likely a derivative work." No distinction between static and dynamic linking for copyleft purposes.

### Finding: JS bundling = static linking; runtime import = dynamic linking; neither exempt under FSF interpretation
**Confidence:** INFERRED (no case law)
**Evidence:** Legal analyses by Kyle Mitchell, PopData, medium.com

webpack/rollup bundle = combined work (universally agreed). `import { x } from 'agpl-package'` in same process with shared data structures = likely combined work under FSF interpretation. No court has ruled on this.

---

## Custom Exception Template for AGPL + Proprietary npm Modules

Based on the Classpath Exception and Nextcloud patterns:

```
Additional permission under GNU AGPL version 3 section 7:

If you modify this Program, or any covered work, by combining it 
with Modules distributed as compiled npm packages by [Company] 
(the "Engine Modules"), the licensors of this Program grant you 
additional permission to convey the resulting combination under 
the terms of this License (AGPL-3.0) for the AGPL-licensed 
portions, and under the terms of [Company]'s license for the 
Engine Modules, provided that those Engine Module terms do not 
place additional restrictions on the AGPL-licensed portions.
```
