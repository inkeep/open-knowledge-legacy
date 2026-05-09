export { applyFastDiff, applyIncrementalDiff } from './apply-diff.ts';
export {
  bindFrontmatterDoc,
  FORM_WRITE_ORIGIN,
  type FrontmatterBinding,
  type FrontmatterBindingPatchResult,
  type FrontmatterBindingPatchSuccess,
  type FrontmatterBindingRenameResult,
  type FrontmatterBindingRenameSuccess,
  type FrontmatterBindingReorderResult,
  type FrontmatterBindingReorderSuccess,
  type FrontmatterDocProvider,
  type FrontmatterSnapshot,
  type Unsubscribe as FrontmatterBindingUnsubscribe,
} from './bind-frontmatter-doc.ts';
export {
  type BridgeInvariantLogPayload,
  type BridgeInvariantSite,
  type BridgeInvariantViolation,
  BridgeInvariantViolationError,
  type InvariantViolation,
  toBridgeInvariantLog,
} from './bridge-invariant.ts';
export { type DiffChange, diffLinesFast } from './diff-lines.ts';
export {
  applyPatchToFm,
  applyRenameToFm,
  applyReorderToFm,
  detectFmRegion,
  type FmEditError,
  type FmEditResult,
  MAX_FM_REGION_BYTES,
  type ParsedFmRegion,
  parseFencedFmRegion,
  parseFmRegion,
  readFmKeys,
  readFmMap,
  readFmRegionWithError,
} from './frontmatter-region.ts';
export {
  assertContentPreservation,
  BridgeMergeContentLossError,
  type BridgeMergeContentLossInfo,
  type BridgeMergeContentLossLogPayload,
  type BridgeMergeContentLossSide,
  type BridgeMergeContentLossWhich,
  mergeThreeWay,
} from './merge-three-way.ts';
export {
  BRIDGE_TOLERANCE_CLASSES,
  type BridgeToleranceClass,
  detectAppliedToleranceClasses,
  normalizeBridge,
} from './normalize.ts';
export { defaultScheduler, type Scheduler } from './scheduler.ts';
