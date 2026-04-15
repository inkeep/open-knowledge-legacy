/**
 * HTML block construct (Phase 3) — purple-tinted zone with syntax highlighting
 *
 * Nested HTML syntax coloring comes from markdown({ htmlTagLanguage }) in US-001.
 * This construct only adds the line-tint + border zone treatment.
 * Rainbow-HTML is NOT shipped — Phase 3 A/B tester territory.
 */

import type { ConstructConfig } from '../registry';

export const htmlBlockConstruct: ConstructConfig = {
  id: 'html-block',
  nodeName: 'HTMLBlock',
  kind: 'line',
  class: 'cm-html-block',
};
