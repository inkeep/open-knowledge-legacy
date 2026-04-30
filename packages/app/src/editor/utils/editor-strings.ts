/**
 * Editor user-visible string helpers.
 *
 * Every user-visible label that varies by count / context goes through a
 * helper here so the future i18n pass has a single file to swap. Today
 * every helper emits English, using `Intl.PluralRules` for cardinal
 * agreement where it applies.
 *
 * Design: prefer LOCALE-NEUTRAL shapes ("with N items") over inflecting
 * the caller's noun, because inflection heuristics (the "+ 's'" pattern)
 * are wrong for irregular plurals and nonsensical in non-English locales.
 * The helpers here intentionally do NOT inflect user-supplied nouns.
 */

const pluralRules = new Intl.PluralRules('en-US');

/**
 * Human-readable container summary used as an aria-label on block-
 * container wrappers (Cards / Steps / Tabs / Accordions / Files / …).
 *
 * Examples:
 *   formatContainerAriaLabel('Cards', 'Card', 0)  // "Cards (empty)"
 *   formatContainerAriaLabel('Cards', 'Card', 1)  // "Cards with 1 item"
 *   formatContainerAriaLabel('Cards', 'Card', 3)  // "Cards with 3 items"
 *
 * `childName` is intentionally ignored in the output prose — we used to
 * say "with 3 cards" (inflecting childName with "+ 's'"), but that breaks
 * for irregular plurals (Foot → Foots) and is meaningless in any non-
 * English locale. "item/items" is a fixed English form whose future i18n
 * swap is mechanical. Accepting `childName` in the signature keeps the
 * contract stable in case a future formatter wants to use it.
 */
export function formatContainerAriaLabel(
  componentLabel: string,
  _childName: string | undefined,
  childCount: number,
): string {
  if (childCount <= 0) return `${componentLabel} (empty)`;
  const cat = pluralRules.select(childCount);
  const noun = cat === 'one' ? 'item' : 'items';
  return `${componentLabel} with ${childCount} ${noun}`;
}

/**
 * The selection-breadcrumb root-level label. Shown in the editor header
 * when the selection is at document-body depth (no block selected).
 */
export const DOCUMENT_ROOT_LABEL = 'Document';

/**
 * Humanize a camelCase / snake_case prop name for the PropPanel UI.
 * `emptyChildName` → `Empty Child Name`, `default_value` → `Default Value`.
 * Identifiers stay camelCase in the generated markdown attr; only the label
 * is transformed.
 */
export function humanizePropName(name: string): string {
  if (!name) return name;
  const spaced = name
    // snake_case and kebab-case → space
    .replace(/[_-]+/g, ' ')
    // camelCase and consecutive-capitals boundaries (emptyChildName → empty Child Name; ARIALabel → ARIA Label)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
