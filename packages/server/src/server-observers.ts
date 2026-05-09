import type { LocalTransactionOrigin } from '@hocuspocus/server';
import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import {
  applyFastDiff,
  applyIncrementalDiff,
  BridgeInvariantViolationError,
  BridgeMergeContentLossError,
  mergeThreeWay,
  normalizeBridge,
  prependFrontmatter,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import type { Schema } from '@tiptap/pm/model';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { attachQuiescenceTracker } from './bridge-quiescence.ts';
import { assertBridgeInvariant, emitObserverAPathBFired } from './bridge-watchdog.ts';
import { recordFrontmatterEditSurface } from './frontmatter-telemetry.ts';
import {
  incrementBridgeMergeCheckpointCreated,
  incrementBridgeMergeContentLoss,
  incrementObserverAPathBFires,
  incrementServerObserverError,
  incrementServerObserverFire,
} from './metrics.ts';
import { type ShadowHandle, saveInMemoryCheckpoint } from './shadow-repo.ts';

export const OBSERVER_SYNC_ORIGIN = {
  source: 'local',
  skipStoreHooks: true,
  context: { origin: 'observer-sync' },
} as const satisfies LocalTransactionOrigin;

export type PairedWriteOrigin = LocalTransactionOrigin & {
  readonly context: {
    readonly origin: string;
    readonly paired: true;
  };
};

export const isPairedWriteOrigin = (origin: unknown): boolean => {
  if (origin == null || typeof origin !== 'object') return false;
  const ctx = (origin as { context?: { paired?: boolean } }).context;
  return ctx?.paired === true;
};

export function shouldRethrowBridgeMergeLoss(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'test' || env.OK_RETHROW_BRIDGE_LOSS === '1';
}

type ShadowAccessor = () => ShadowHandle | undefined;

type BranchAccessor = () => string;

export type ObserverDispatchKind = 'none' | 'a' | 'b';

type ObserverDispatchHook = (kind: ObserverDispatchKind) => void;

export interface SetupServerObserversOpts {
  doc: Y.Doc;
  xmlFragment: Y.XmlFragment;
  ytext: Y.Text;
  mdManager: MarkdownManager;
  schema: Schema;
  docName?: string;
  shadow?: ShadowAccessor;
  getBranch?: BranchAccessor;
  contentRoot?: string;
  resolveEmbed?: (basename: string, sourcePath: string) => string | null;
  resolveSize?: (basename: string, sourcePath: string) => number | null;
  onDispatch?: ObserverDispatchHook;
}

export function setupServerObservers(opts: SetupServerObserversOpts): () => void {
  const { doc, xmlFragment, ytext, mdManager, schema } = opts;

  const handleBridgeMergeLoss = (
    err: BridgeMergeContentLossError,
    preMergeBaseline: string,
  ): void => {
    const verbose = process.env.OK_TELEMETRY_VERBOSE === '1';
    console.warn(
      JSON.stringify({
        ...err.toLog({ verbose }),
        docName: opts.docName ?? null,
        timestamp: new Date().toISOString(),
      }),
    );
    incrementBridgeMergeContentLoss();

    const shadow = opts.shadow?.();
    if (!shadow || !opts.docName) return;
    const branch = opts.getBranch?.() ?? 'main';
    const contentRoot = opts.contentRoot ?? '';
    queueMicrotask(() => {
      saveInMemoryCheckpoint(shadow, contentRoot, {
        kind: 'bridge-merge-loss',
        docName: opts.docName as string,
        contents: preMergeBaseline,
        label: `Before concurrent merge @ ${new Date().toISOString()}`,
        branch,
        metadata: { lostSubstrings: err.info.lostSubstrings },
      })
        .then((sha) => {
          incrementBridgeMergeCheckpointCreated();
          console.warn(
            JSON.stringify({
              event: 'bridge-merge-checkpoint-created',
              docName: opts.docName,
              sha,
              kind: 'bridge-merge-loss',
              timestamp: new Date().toISOString(),
            }),
          );
        })
        .catch((checkpointErr: unknown) => {
          const err =
            checkpointErr instanceof Error ? checkpointErr : new Error(String(checkpointErr));
          console.warn('[Server Observer A] Silent checkpoint write failed:', {
            name: err.name,
            message: err.message,
            stack: err.stack?.split('\n').slice(0, 4).join('\n'),
          });
        });
    });
  };

  let lastSyncedXmlMd = '';
  let xmlDirty = false;
  let textDirty = false;

  const readCurrentFm = (): string => stripFrontmatter(ytext.toString()).frontmatter;

  try {
    const initialJson = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
    const initialBody = mdManager.serialize(initialJson);
    const initialFrontmatter = readCurrentFm();
    lastSyncedXmlMd = prependFrontmatter(initialFrontmatter, initialBody);
  } catch (err) {
    incrementServerObserverError('a');
    console.warn(
      '[Server Observer A] Baseline init failed — starting from empty snapshot:',
      err instanceof Error ? err.message : String(err),
    );
    lastSyncedXmlMd = '';
  }

  const runObserverASync = (): void => {
    try {
      const json = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
      const body = mdManager.serialize(json);
      const frontmatter = readCurrentFm();
      const md = prependFrontmatter(frontmatter, body);

      if (lastSyncedXmlMd === md) return;

      const currentText = ytext.toString();

      if (normalizeBridge(currentText) === normalizeBridge(md)) {
        lastSyncedXmlMd = md;
        return;
      }

      const preMergeBaseline = lastSyncedXmlMd;
      const pathBState: { mergedText: string | null } = { mergedText: null };
      doc.transact(() => {
        if (currentText === lastSyncedXmlMd) {
          applyIncrementalDiff(ytext, currentText, md);
        } else {
          try {
            const mergedText = mergeThreeWay(lastSyncedXmlMd, md, currentText);
            applyFastDiff(ytext, currentText, mergedText);
            pathBState.mergedText = mergedText;
          } catch (mergeErr) {
            if (!(mergeErr instanceof BridgeMergeContentLossError)) throw mergeErr;
            handleBridgeMergeLoss(mergeErr, preMergeBaseline);
            if (shouldRethrowBridgeMergeLoss()) throw mergeErr;
            applyFastDiff(ytext, currentText, mergeErr.info.result);
            pathBState.mergedText = mergeErr.info.result;
          }
        }
      }, OBSERVER_SYNC_ORIGIN);

      if (pathBState.mergedText !== null) {
        if (emitObserverAPathBFired(opts.docName)) {
          incrementObserverAPathBFires();
          console.warn(
            JSON.stringify({
              event: 'observer-a-path-b-fired',
              'doc.name': opts.docName ?? null,
              xmlFragmentAdvanced: true,
              ytextDiverged: true,
              mergeBytesChanged: Math.abs(pathBState.mergedText.length - currentText.length),
            }),
          );
        }
      }

      incrementServerObserverFire('a');
      lastSyncedXmlMd = ytext.toString();
    } catch (err) {
      incrementServerObserverError('a');
      console.error('[Server Observer A] Failed to sync tree→text:', err);
      try {
        lastSyncedXmlMd = ytext.toString();
      } catch (innerErr) {
        console.warn('[Server Observer A] Baseline recovery also failed:', innerErr);
      }
    }
  };

  const observerA = (_events: Y.YEvent<Y.XmlFragment>[], transaction: Y.Transaction) => {
    if (transaction.origin === OBSERVER_SYNC_ORIGIN) return;

    if (isPairedWriteOrigin(transaction.origin)) {
      try {
        const frontmatter = readCurrentFm();
        lastSyncedXmlMd = ytext.toString();
        priorFmForTelemetry = frontmatter;
      } catch (err) {
        incrementServerObserverError('a');
        console.warn(
          '[Server Observer A] Paired-write baseline refresh failed — falling through to settlement:',
          err instanceof Error ? err.message : String(err),
        );
        xmlDirty = true;
      }
      return;
    }

    xmlDirty = true;
  };

  if (xmlFragment.length > 0 && ytext.length === 0) {
    try {
      const json = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
      const body = mdManager.serialize(json);
      const frontmatter = readCurrentFm();
      const md = prependFrontmatter(frontmatter, body);
      doc.transact(() => {
        ytext.insert(0, md);
      }, OBSERVER_SYNC_ORIGIN);
      lastSyncedXmlMd = md;
    } catch (err) {
      incrementServerObserverError('a');
      console.error('[Server Observer A] Failed initial sync:', err);
      lastSyncedXmlMd = '';
    }
  }

  let priorFmForTelemetry = readCurrentFm();
  const runObserverBSync = (): void => {
    try {
      const md = ytext.toString();
      const { frontmatter, body } = stripFrontmatter(md);

      if (normalizeBridge(lastSyncedXmlMd) === normalizeBridge(md)) {
        if (priorFmForTelemetry !== frontmatter) {
          recordFrontmatterEditSurface('source-mode');
          priorFmForTelemetry = frontmatter;
        }
        return;
      }

      const parseOpts =
        opts.resolveEmbed && opts.docName
          ? {
              resolveEmbed: opts.resolveEmbed,
              resolveSize: opts.resolveSize,
              sourcePath: opts.docName,
            }
          : undefined;
      const parsedJson = mdManager.parseWithFallback(body, parseOpts);

      const pmNode = opts.schema.nodeFromJSON(parsedJson);

      doc.transact(() => {
        const meta = { mapping: new Map(), isOMark: new Map() };
        updateYFragment(doc, xmlFragment, pmNode, meta);
      }, OBSERVER_SYNC_ORIGIN);

      if (priorFmForTelemetry !== frontmatter) {
        recordFrontmatterEditSurface('source-mode');
        priorFmForTelemetry = frontmatter;
      }

      incrementServerObserverFire('b');

      try {
        const canonicalBody = mdManager.serialize(parsedJson);
        const canonicalYText = prependFrontmatter(frontmatter, canonicalBody);
        assertBridgeInvariant(ytext.toString(), canonicalYText, {
          site: 'observer-b',
          docName: opts.docName,
        });
        lastSyncedXmlMd = canonicalYText;
      } catch (reserializeErr) {
        if (reserializeErr instanceof BridgeInvariantViolationError) {
          throw reserializeErr;
        }
        console.warn(
          '[Server Observer B] Post-sync re-serialization failed — using input body as baseline:',
          reserializeErr,
        );
        lastSyncedXmlMd = prependFrontmatter(frontmatter, body);
      }
    } catch (err) {
      if (err instanceof BridgeInvariantViolationError) {
        throw err;
      }
      incrementServerObserverError('b');
      console.error('[Server Observer B] Failed to sync text→tree:', err);
      try {
        const postJson = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
        const postBody = mdManager.serialize(postJson);
        const fm = readCurrentFm();
        lastSyncedXmlMd = prependFrontmatter(fm, postBody);
      } catch (innerErr) {
        if (innerErr instanceof BridgeInvariantViolationError) {
          throw innerErr;
        }
        console.warn('[Server Observer B] Baseline recovery also failed:', innerErr);
      }
    }
  };

  const observerB = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (transaction.origin === OBSERVER_SYNC_ORIGIN) return;

    if (isPairedWriteOrigin(transaction.origin)) {
      try {
        const frontmatter = readCurrentFm();
        lastSyncedXmlMd = ytext.toString();
        priorFmForTelemetry = frontmatter;
      } catch (err) {
        incrementServerObserverError('b');
        console.warn(
          '[Server Observer B] Paired-write baseline refresh failed — falling through to settlement:',
          err instanceof Error ? err.message : String(err),
        );
        textDirty = true;
      }
      return;
    }

    textDirty = true;
  };

  const afterAll = (_doc: Y.Doc, transactions: Y.Transaction[]): void => {
    if (!xmlDirty && !textDirty) {
      opts.onDispatch?.('none');
      return;
    }
    if (transactions.every((t) => t.origin === OBSERVER_SYNC_ORIGIN)) {
      xmlDirty = false;
      textDirty = false;
      opts.onDispatch?.('none');
      return;
    }

    if (xmlDirty) {
      xmlDirty = false;
      opts.onDispatch?.('a');
      runObserverASync();
    }
    if (textDirty) {
      textDirty = false;
      opts.onDispatch?.('b');
      runObserverBSync();
    }
  };

  xmlFragment.observeDeep(observerA);
  ytext.observe(observerB);
  doc.on('afterAllTransactions', afterAll);
  const detachQuiescence = attachQuiescenceTracker(doc);

  return () => {
    detachQuiescence();
    doc.off('afterAllTransactions', afterAll);
    xmlFragment.unobserveDeep(observerA);
    ytext.unobserve(observerB);
  };
}
