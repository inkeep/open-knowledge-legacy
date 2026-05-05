import type { Join } from 'mdast-util-to-markdown';
import type { Position } from 'unist';

type MaybePositioned = { position?: Position };

export const positionAwareBlankLineJoin: Join = (left, right) => {
  const lp = (left as MaybePositioned).position;
  const rp = (right as MaybePositioned).position;
  if (!lp || !rp) return undefined;
  const gap = rp.start.line - lp.end.line - 1;
  return gap >= 1 ? gap : undefined;
};
