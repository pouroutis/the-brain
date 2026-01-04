// =============================================================================
// The Brain — Dev-Only Logger (Phase 5)
// =============================================================================

/**
 * Check if we're in development mode.
 * Uses Vite's import.meta.env.DEV
 */
const isDev = (): boolean => {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
};

/**
 * Log cost control events (truncation, budget enforcement).
 * Only outputs in development mode.
 */
export function logCost(message: string, data?: Record<string, unknown>): void {
  if (!isDev()) return;
  
  if (data) {
    console.log(`[Brain:Cost] ${message}`, data);
  } else {
    console.log(`[Brain:Cost] ${message}`);
  }
}

/**
 * Log routing decisions (agent skips, fallbacks).
 * Only outputs in development mode.
 */
export function logRouting(message: string, data?: Record<string, unknown>): void {
  if (!isDev()) return;
  
  if (data) {
    console.log(`[Brain:Routing] ${message}`, data);
  } else {
    console.log(`[Brain:Routing] ${message}`);
  }
}

/**
 * Log call coordination events (run tracking, call counting).
 * Only outputs in development mode.
 */
export function logCalls(message: string, data?: Record<string, unknown>): void {
  if (!isDev()) return;
  
  if (data) {
    console.log(`[Brain:Calls] ${message}`, data);
  } else {
    console.log(`[Brain:Calls] ${message}`);
  }
}

/**
 * Log errors (dev-only, prefixed for filtering).
 */
export function logError(message: string, error?: unknown): void {
  if (!isDev()) return;
  console.error(`[Brain:Error] ${message}`, error ?? '');
}
