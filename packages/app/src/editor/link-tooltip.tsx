/**
 * Shared tooltip content for WYSIWYG link chips.
 *
 * The chip itself communicates "this is a link"; the tooltip just surfaces the
 * underlying target without restating click mechanics.
 */

export function LinkTooltipHint({ href }: { href: string }) {
  return <span className="max-w-[18rem] truncate">{href}</span>;
}
