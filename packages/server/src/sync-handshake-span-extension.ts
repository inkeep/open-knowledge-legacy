import type { Extension } from '@hocuspocus/server';
import type { Attributes } from '@opentelemetry/api';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import { withSpanSync } from './telemetry.ts';

const MOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createSyncHandshakeSpanExtension(): Extension {
  return {
    async afterLoadDocument({ documentName, requestParameters }) {
      if (isSystemDoc(documentName) || isConfigDoc(documentName)) return;

      const mountId = requestParameters?.get('mountId') ?? undefined;
      const attributes: Attributes = { 'doc.name': documentName };
      if (mountId !== undefined && MOUNT_ID_PATTERN.test(mountId)) {
        attributes['mount.id'] = mountId;
      }

      try {
        withSpanSync('sync.handshake', { attributes }, () => {});
      } catch (err) {
        console.warn(
          '[sync-handshake-span] emission failed:',
          err instanceof Error ? err : String(err),
        );
      }
    },
  };
}
