// =============================================================================
// The Brain — Cost Control Configuration (Phase 5)
// =============================================================================

/**
 * Maximum characters allowed in context payload per agent call.
 * Matches CONTRACT.md: ~12,000 characters.
 */
export const MAX_CONTEXT_CHARS = 12_000;

/**
 * Maximum exchanges included in context history.
 * Matches CONTRACT.md: 10 exchanges max (rolling window).
 */
export const MAX_EXCHANGES = 10;

/**
 * Maximum agent calls per run.
 * Multi-round: 3 agents × 5 rounds max = 15
 */
export const MAX_AGENT_CALLS = 15;

/**
 * Reserved characters for truncation marker.
 */
export const TRUNCATION_RESERVE = 50;

/**
 * Marker appended when content is truncated.
 */
export const TRUNCATION_MARKER = '\n[TRUNCATED]';

/**
 * Maximum user prompt length before truncation.
 * MAX_CONTEXT_CHARS - TRUNCATION_RESERVE = 11,950
 */
export const MAX_PROMPT_CHARS = MAX_CONTEXT_CHARS - TRUNCATION_RESERVE;
