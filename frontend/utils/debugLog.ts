const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "1";

export function debugLog(...args: unknown[]): void {
  if (DEBUG) console.log(...args);
}