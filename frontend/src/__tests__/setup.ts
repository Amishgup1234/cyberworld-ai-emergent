/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock ResizeObserver for React Flow and Recharts (jsdom does not implement it)
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_callback: any) {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Additional jsdom polyfills for Recharts and ReactFlow
if (!Element.prototype.getBoundingClientRect) {
  Element.prototype.getBoundingClientRect = () => ({
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    bottom: 600,
    right: 800,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
} else {
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    try {
      const rect = originalGetBoundingClientRect.call(this);
      if (rect.width === 0 && rect.height === 0) {
        return {
          width: 800,
          height: 600,
          top: 0,
          left: 0,
          bottom: 600,
          right: 800,
          x: 0,
          y: 0,
          toJSON: () => {},
        } as unknown as DOMRect;
      }
      return rect;
    } catch {
      return {
        width: 800,
        height: 600,
        top: 0,
        left: 0,
        bottom: 600,
        right: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as unknown as DOMRect;
    }
  };
}

// Mock IntersectionObserver for completeness
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_callback: any, _options?: any) {}
}
(global as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
(window as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});