import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://localhost:5173',
  pretendToBeVisual: true,
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const win = dom.window as unknown as Window & typeof globalThis;

Object.assign(globalThis, {
  window: win,
  document: win.document,
  navigator: win.navigator,
  location: win.location,
  history: win.history,
  HTMLElement: win.HTMLElement,
  HTMLDivElement: win.HTMLDivElement,
  HTMLSpanElement: win.HTMLSpanElement,
  HTMLButtonElement: win.HTMLButtonElement,
  HTMLInputElement: win.HTMLInputElement,
  HTMLAnchorElement: win.HTMLAnchorElement,
  Element: win.Element,
  Node: win.Node,
  NodeList: win.NodeList,
  Event: win.Event,
  CustomEvent: win.CustomEvent,
  EventTarget: win.EventTarget,
  MouseEvent: win.MouseEvent,
  KeyboardEvent: win.KeyboardEvent,
  InputEvent: win.InputEvent,
  FocusEvent: win.FocusEvent,
  PointerEvent: win.PointerEvent,
  DataTransfer: win.DataTransfer,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
});

const matchMediaStub = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

(globalThis as { matchMedia?: typeof matchMediaStub }).matchMedia = matchMediaStub;
(win as { matchMedia?: typeof matchMediaStub }).matchMedia = matchMediaStub;

if (typeof (globalThis as { MessageChannel?: unknown }).MessageChannel === 'undefined') {
  class MinimalMessagePort {
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    private peer: MinimalMessagePort | null = null;
    setPeer(peer: MinimalMessagePort) {
      this.peer = peer;
    }
    postMessage(data: unknown) {
      queueMicrotask(() => {
        if (this.peer?.onmessage) this.peer.onmessage({ data });
      });
    }
    start() {}
    close() {}
  }
  class MinimalMessageChannel {
    port1: MinimalMessagePort;
    port2: MinimalMessagePort;
    constructor() {
      this.port1 = new MinimalMessagePort();
      this.port2 = new MinimalMessagePort();
      this.port1.setPeer(this.port2);
      this.port2.setPeer(this.port1);
    }
  }
  (globalThis as { MessageChannel?: unknown }).MessageChannel = MinimalMessageChannel;
}
