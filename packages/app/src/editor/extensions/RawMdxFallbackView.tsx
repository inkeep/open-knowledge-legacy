/**
 * rawMdxFallback source-mode navigation event.
 *
 * The legacy `RawMdxFallbackView` React NodeView was superseded by
 * `RawMdxFallbackCMView.tsx` (embedded CodeMirror per Precedent #24). Its
 * click-handler dispatched `RAW_MDX_NAV_EVENT` to switch to source mode
 * at the broken region's offset — that event is still load-bearing for
 * the CM-version's outline / navigation integration (consumed by
 * `EditorPane.tsx` and `SourceEditor.tsx`).
 *
 * This file is a thin module for the event constant + its detail type;
 * the NodeView implementation lives in `RawMdxFallbackCMView.tsx`.
 */

export const RAW_MDX_NAV_EVENT = 'raw-mdx-nav';

export interface RawMdxNavDetail {
  /** Character offset from start of source where the broken region begins */
  offset: number;
}
