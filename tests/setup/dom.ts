/**
 * Thiết lập cho project test `dom` (jsdom): bổ sung các API trình duyệt mà jsdom thiếu
 * nhưng Radix UI và app cần. Không dùng cho test cần canvas thật (xem project `browser`).
 */
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    // Mô phỏng khung nhìn desktop 1280 px (như E2E): `(min-width: …)` khớp tới 1280.
    value: vi.fn((query: string) => ({
      matches: Number(/\(min-width:\s*(\d+)px\)/.exec(query)?.[1] ?? Infinity) <= 1280,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  });
}

class ResizeObserverStub {
  observe = (): void => undefined;
  unobserve = (): void => undefined;
  disconnect = (): void => undefined;
}
if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverStub,
  });
}

// Radix dùng các API pointer capture / scrollIntoView mà jsdom chưa có.
function polyfillElementMethod(name: string, value: () => unknown): void {
  if (!(name in Element.prototype)) {
    Object.defineProperty(Element.prototype, name, { configurable: true, value });
  }
}
polyfillElementMethod('hasPointerCapture', () => false);
polyfillElementMethod('releasePointerCapture', () => undefined);
polyfillElementMethod('scrollIntoView', () => undefined);
