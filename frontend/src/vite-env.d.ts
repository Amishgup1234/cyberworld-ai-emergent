/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

interface Global {
  ResizeObserver: typeof ResizeObserver;
  fetch: typeof fetch;
}

declare const global: Global;