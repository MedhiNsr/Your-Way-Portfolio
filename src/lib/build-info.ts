// Build SHA is injected by Vite's `define` (see vite.config.ts).
declare const __BUILD_SHA__: string;

export const BUILD_SHA: string =
  typeof __BUILD_SHA__ !== "undefined" ? __BUILD_SHA__ : "unknown";
