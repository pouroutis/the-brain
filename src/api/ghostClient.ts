// =============================================================================
// The Brain — Ghost Client
// Phase 9B: Frontend client for Ghost Orchestrator Edge Function
// Phase 10: Integration hardening (JSON parse, response validation)
// =============================================================================

import type { GhostRequest, GhostResponse, GhostErrorCode } from '../types/ghost';
import { env } from '../config/env';

/**
 * Whitelist of valid GhostErrorCode values for runtime validation
 */
const VALID_ERROR_CODES: ReadonlySet<string> = new Set<string>([
  'GHOST_GPT_FAILED',
  'GHOST_TIMEOUT',
  'GHOST_TOKEN_CAP',
  'GHOST_ROUND_CAP',
  'GHOST_CALL_CAP',
  'GHOST_AUDIT_FAILED',
  'GHOST_INTERNAL',
  'GHOST_KILLED',
  'GHOST_DAILY_CAP_EXCEEDED',
  'GHOST_CIRCUIT_OPEN',
]);

/**
 * Type guard: validates that a value is a valid GhostErrorCode
 */
function isGhostErrorCode(value: unknown): value is GhostErrorCode {
  return typeof value === 'string' && VALID_ERROR_CODES.has(value);
}

/**
 * Ghost orchestrator endpoint URL
 */
const GHOST_ORCHESTRATOR_URL = env.supabaseUrl
  ? `${env.supabaseUrl}/functions/v1/ghost-orchestrator`
  : '';

/**
 * Default timeout for ghost orchestrator (matches server-side 90s + buffer)
 */
const GHOST_TIMEOUT_MS = 100_000;

/**
 * Call the Ghost Orchestrator Edge Function
 * 
 * @param userPrompt - The user's question/request
 * @param abortController - Optional abort controller for cancellation
 * @returns Ghost response with final CEO output or error
 */
export async function callGhostOrchestrator(
  userPrompt: string,
  abortController?: AbortController
): Promise<GhostResponse> {
  if (!GHOST_ORCHESTRATOR_URL || GHOST_ORCHESTRATOR_URL.includes('undefined')) {
    return {
      status: 'error',
      error: 'Ghost orchestrator URL not configured. Check VITE_SUPABASE_URL.',
      errorCode: 'GHOST_INTERNAL',
    };
  }

  // Create timeout if no abort controller provided
  const controller = abortController ?? new AbortController();
  const timeoutId = abortController ? null : setTimeout(() => controller.abort(), GHOST_TIMEOUT_MS);

  try {
    const request: GhostRequest = { userPrompt };

    const response = await fetch(GHOST_ORCHESTRATOR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        status: 'error',
        error: `Ghost orchestrator error: HTTP ${response.status} - ${errorText.slice(0, 200)}`,
        errorCode: 'GHOST_INTERNAL',
      };
    }

    // Parse JSON with error handling
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return {
        status: 'error',
        error: 'Invalid response from server',
        errorCode: 'GHOST_INTERNAL',
      };
    }

    // Validate response structure
    if (!data || typeof data !== 'object') {
      return {
        status: 'error',
        error: 'Invalid response format',
        errorCode: 'GHOST_INTERNAL',
      };
    }

    const responseData = data as Record<string, unknown>;

    // Validate required status field
    if (responseData.status !== 'success' && responseData.status !== 'error') {
      return {
        status: 'error',
        error: 'Invalid response: missing status',
        errorCode: 'GHOST_INTERNAL',
      };
    }

    // Construct validated GhostResponse
    if (responseData.status === 'success') {
      return {
        status: 'success',
        content: typeof responseData.content === 'string' ? responseData.content : undefined,
      };
    }

    // Error response
    return {
      status: 'error',
      error: typeof responseData.error === 'string' ? responseData.error : 'Unknown error',
      errorCode: isGhostErrorCode(responseData.errorCode) 
        ? responseData.errorCode 
        : 'GHOST_INTERNAL',
    };

  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    // Check if aborted (timeout or user cancellation)
    if (controller.signal.aborted) {
      return {
        status: 'error',
        error: 'Ghost request timed out or was cancelled.',
        errorCode: 'GHOST_TIMEOUT',
      };
    }

    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'GHOST_INTERNAL',
    };
  }
}

/**
 * Check if Ghost mode is enabled
 * Per Phase 9A: CEO mode always enables Ghost (server-side enforced)
 * This client-side check is for UI logic only — server is authoritative
 */
export function isGhostEnabled(): boolean {
  // In the current implementation, Ghost is always enabled for CEO mode
  // The server enforces this — client cannot disable
  return true;
}

/**
 * Map error code to user-friendly message
 */
export function getGhostErrorMessage(errorCode: GhostErrorCode): string {
  const messages: Record<GhostErrorCode, string> = {
    GHOST_GPT_FAILED: 'The lead analyst could not complete the analysis. Please try again.',
    GHOST_TIMEOUT: 'The analysis took too long. Please try a simpler question.',
    GHOST_TOKEN_CAP: 'The analysis exceeded resource limits. A best-effort response was provided.',
    GHOST_ROUND_CAP: 'The analysis reached its maximum iterations. A best-effort response was provided.',
    GHOST_CALL_CAP: 'The analysis exceeded call limits. A best-effort response was provided.',
    GHOST_AUDIT_FAILED: 'The decision could not be recorded. Please retry.',
    GHOST_INTERNAL: 'An internal error occurred. Please try again.',
    // Phase 11: Production guards
    GHOST_KILLED: 'Service is temporarily disabled. Please try again later.',
    GHOST_DAILY_CAP_EXCEEDED: 'Daily request limit reached. Please try again tomorrow.',
    GHOST_CIRCUIT_OPEN: 'Service is experiencing issues. Please try again in a few minutes.',
  };
  return messages[errorCode] ?? 'An unknown error occurred.';
}
