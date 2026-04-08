/**
 * HTTP API extension for Hocuspocus — agent write, undo/redo, and test reset endpoints.
 *
 * Implemented as a Hocuspocus onRequest extension so it works with both
 * the standalone Server and the Vite dev plugin.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Extension, Hocuspocus } from '@hocuspocus/server';
import {
  AGENT_WRITE_ORIGIN,
  type AgentSessionManager,
  DEFAULT_AGENT_ID,
  syncTextToFragment,
} from './agent-sessions';

const MAX_BODY_BYTES = 1_048_576; // 1 MB

export interface ApiExtensionOptions {
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  contentDir: string;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error('Payload too large');
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function createApiExtension(options: ApiExtensionOptions): Extension {
  const { hocuspocus, sessionManager, contentDir } = options;

  async function handleAgentWrite(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    try {
      const dc = await sessionManager.getSession('test-doc');
      const timestamp = new Date().toISOString();
      const content = `Hello from the agent! ${timestamp}`;

      dc.document.awareness.setLocalStateField('mode', 'editing');
      try {
        dc.document.transact(() => {
          const ytext = dc.document.getText('source');
          const currentText = ytext.toString();
          const insertAt = currentText.length;
          const separator = currentText.trim() ? '\n\n' : '';
          ytext.insert(insertAt, `${separator}${content}\n`);
          syncTextToFragment(dc.document);

          const activityMap = dc.document.getMap('activity');
          activityMap.set(DEFAULT_AGENT_ID, {
            agentId: DEFAULT_AGENT_ID,
            timestamp: Date.now(),
            type: 'insert',
            description: `Added: ${content.slice(0, 50)}`,
          });
        }, AGENT_WRITE_ORIGIN);
      } finally {
        dc.document.awareness.setLocalStateField('mode', 'idle');
      }

      json(res, 200, { ok: true, timestamp });
    } catch (e) {
      console.error('[agent-write]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleAgentWriteMd(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }

      const { markdown, position: pos } = body as Record<string, unknown>;
      if (!markdown || typeof markdown !== 'string') {
        json(res, 400, { ok: false, error: 'markdown field required' });
        return;
      }

      const position = pos === 'prepend' ? 'prepend' : 'append';
      const dc = await sessionManager.getSession('test-doc');
      const timestamp = new Date().toISOString();

      dc.document.awareness.setLocalStateField('mode', 'editing');
      try {
        dc.document.transact(() => {
          const ytext = dc.document.getText('source');
          const currentText = ytext.toString();

          if (position === 'prepend') {
            ytext.insert(0, `${markdown.trim()}\n\n`);
          } else {
            const insertAt = currentText.length;
            const separator = currentText.trim() ? '\n\n' : '';
            ytext.insert(insertAt, `${separator}${markdown.trim()}\n`);
          }

          syncTextToFragment(dc.document);

          const activityMap = dc.document.getMap('activity');
          activityMap.set(DEFAULT_AGENT_ID, {
            agentId: DEFAULT_AGENT_ID,
            timestamp: Date.now(),
            type: 'insert',
            description: `Added: ${markdown.trim().slice(0, 50)}`,
          });
        }, AGENT_WRITE_ORIGIN);
      } finally {
        dc.document.awareness.setLocalStateField('mode', 'idle');
      }

      json(res, 200, { ok: true, timestamp });
    } catch (e) {
      console.error('[agent-write-md]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleAgentUndoStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      if (!sessionManager.hasSession('test-doc')) {
        json(res, 200, { ok: true, canUndo: false, canRedo: false });
        return;
      }
      const um = sessionManager.getExistingUndoManager('test-doc');
      json(res, 200, {
        ok: true,
        canUndo: um?.canUndo() ?? false,
        canRedo: um?.canRedo() ?? false,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleAgentUndo(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const dc = await sessionManager.getSession('test-doc');
      const um = sessionManager.getUndoManager(dc);
      if (!um.canUndo()) {
        json(res, 200, { ok: false, canUndo: false, canRedo: um.canRedo() });
        return;
      }
      um.undo();
      console.log('[agent-undo] Undo performed');
      json(res, 200, { ok: true, canUndo: um.canUndo(), canRedo: um.canRedo() });
    } catch (e) {
      console.error('[agent-undo]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleAgentRedo(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const dc = await sessionManager.getSession('test-doc');
      const um = sessionManager.getUndoManager(dc);
      if (!um.canRedo()) {
        json(res, 200, { ok: false, canUndo: um.canUndo(), canRedo: false });
        return;
      }
      um.redo();
      console.log('[agent-redo] Redo performed');
      json(res, 200, { ok: true, canUndo: um.canUndo(), canRedo: um.canRedo() });
    } catch (e) {
      console.error('[agent-redo]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleTestReset(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      await sessionManager.closeAll();
      hocuspocus.closeConnections('test-doc');
      const doc = hocuspocus.documents.get('test-doc');
      if (doc) await hocuspocus.unloadDocument(doc);
      const { writeFileSync } = await import('node:fs');
      writeFileSync(resolve(contentDir, 'test-doc.md'), '', 'utf-8');
      json(res, 200, { ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
    '/api/agent-write': handleAgentWrite,
    '/api/agent-write-md': handleAgentWriteMd,
    '/api/agent-undo-status': handleAgentUndoStatus,
    '/api/agent-undo': handleAgentUndo,
    '/api/agent-redo': handleAgentRedo,
    '/api/test-reset': handleTestReset,
  };

  return {
    priority: 100, // Higher priority — API routes run before static file serving
    async onRequest({ request, response }: { request: IncomingMessage; response: ServerResponse }) {
      const url = request.url?.split('?')[0];
      if (!url) return;

      const handler = routes[url];
      if (handler) {
        await handler(request, response);
      }
    },
  };
}
