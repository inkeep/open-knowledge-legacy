/**
 * Network-layer sync control for deterministic CRDT race testing (FR-16).
 *
 * Provides a WebSocket wrapper that supports pause/resume of inbound message
 * delivery. When paused, inbound messages are queued and delivered FIFO on
 * resume. Outbound is always passthrough.
 *
 * Minimal surface for v1: pauseInbound/resumeInbound only.
 * Future extensions (delaySync, dropInbound, inspectSyncQueue) land when a
 * concrete test motivates them.
 */

type MessageHandler = ((event: MessageEvent) => void) | null;

export class ControllableWebSocket {
  private inner: WebSocket;
  private paused = false;
  private inboundQueue: MessageEvent[] = [];
  private realOnMessage: MessageHandler = null;

  constructor(url: string | URL, protocols?: string | string[]) {
    this.inner = new WebSocket(url, protocols);

    // Intercept inbound messages
    this.inner.onmessage = (event: MessageEvent) => {
      if (this.paused) {
        this.inboundQueue.push(event);
      } else {
        this.realOnMessage?.(event);
      }
    };
  }

  pauseInbound(): void {
    this.paused = true;
  }

  resumeInbound(): void {
    this.paused = false;
    while (this.inboundQueue.length > 0) {
      const msg = this.inboundQueue.shift();
      if (msg) this.realOnMessage?.(msg);
    }
  }

  // ─── WebSocket interface passthrough ───

  get url(): string {
    return this.inner.url;
  }
  get readyState(): number {
    return this.inner.readyState;
  }
  get bufferedAmount(): number {
    return this.inner.bufferedAmount;
  }
  get extensions(): string {
    return this.inner.extensions;
  }
  get protocol(): string {
    return this.inner.protocol;
  }
  get binaryType(): BinaryType {
    return this.inner.binaryType;
  }
  set binaryType(value: BinaryType) {
    this.inner.binaryType = value;
  }

  get onopen(): ((this: WebSocket, ev: Event) => unknown) | null {
    return this.inner.onopen;
  }
  set onopen(handler: ((this: WebSocket, ev: Event) => unknown) | null) {
    this.inner.onopen = handler;
  }

  get onclose(): ((this: WebSocket, ev: CloseEvent) => unknown) | null {
    return this.inner.onclose;
  }
  set onclose(handler: ((this: WebSocket, ev: CloseEvent) => unknown) | null) {
    this.inner.onclose = handler;
  }

  get onerror(): ((this: WebSocket, ev: Event) => unknown) | null {
    return this.inner.onerror;
  }
  set onerror(handler: ((this: WebSocket, ev: Event) => unknown) | null) {
    this.inner.onerror = handler;
  }

  get onmessage(): MessageHandler {
    return this.realOnMessage;
  }
  set onmessage(handler: MessageHandler) {
    this.realOnMessage = handler;
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.inner.send(data);
  }

  close(code?: number, reason?: string): void {
    this.inner.close(code, reason);
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (type === 'message') {
      // Route message listeners through our interception
      const wrappedListener = (event: Event) => {
        if (this.paused) {
          this.inboundQueue.push(event as MessageEvent);
        } else if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      };
      this.inner.addEventListener(type, wrappedListener, options);
    } else {
      this.inner.addEventListener(type, listener, options);
    }
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    this.inner.removeEventListener(type, listener, options);
  }

  dispatchEvent(event: Event): boolean {
    return this.inner.dispatchEvent(event);
  }

  // WebSocket constants
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
}
