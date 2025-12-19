// src/types/meta.d.ts
export {};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
    __META_TRACKING_ENABLED?: boolean;
  }
}
