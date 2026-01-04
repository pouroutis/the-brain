// =============================================================================
// The Brain — Ghost Mode Types
// Phase 9B: Frontend types for Ghost Mode (brain.ts unchanged)
// Implements Phase 9A Rev 3 (LOCKED)
// =============================================================================

// -----------------------------------------------------------------------------
// Token Usage (from API responses)
// -----------------------------------------------------------------------------

/**
 * Token usage information returned by AI providers
 * Used for Ghost Mode token cap enforcement
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// -----------------------------------------------------------------------------
// Ghost Status Types
// -----------------------------------------------------------------------------

/**
 * Ghost deliberation status (from GPT's gate evaluation)
 */
export type GhostStatus = 'CONTINUE' | 'CONVERGED' | 'FORCED';

/**
 * Convergence gate result
 */
export type GateResult = 'PASS' | 'FAIL';

/**
 * Final outcome of a Ghost run
 */
export type FinalStatus = 'CONVERGED' | 'FORCED' | 'ABORTED';

/**
 * Reason for forced output (only when FinalStatus = 'FORCED')
 */
export type ForcedReason = 'round_cap' | 'call_cap' | 'token_cap' | 'timeout';

/**
 * Reason for abort (only when FinalStatus = 'ABORTED')
 */
export type AbortReason = 'gpt_failure' | 'audit_failure' | 'internal_error';

// -----------------------------------------------------------------------------
// Gate Evaluation
// -----------------------------------------------------------------------------

/**
 * Result of gate evaluation for a single round
 * G1: Compliance gate
 * G2: Factual gate
 * G3: Risk stability gate
 */
export interface GateEvaluation {
  round: number;  // 0, 1, or 2
  g1: GateResult;
  g2: GateResult;
  g3: GateResult;
}

// -----------------------------------------------------------------------------
// Ghost Configuration (Phase 8 LOCKED values)
// -----------------------------------------------------------------------------

/**
 * Ghost mode limits (Phase 8 LOCKED)
 */
export const GHOST_LIMITS = {
  MAX_ROUNDS: 2,
  MAX_CALLS: 6,
  MAX_TOKENS: 4000,
  SYNTHESIS_RESERVE: 1000,
  TIMEOUT_MS: 90_000,
} as const;

// -----------------------------------------------------------------------------
// Ghost Request/Response (Client ↔ Server)
// -----------------------------------------------------------------------------

/**
 * Request to ghost-orchestrator Edge Function
 */
export interface GhostRequest {
  userPrompt: string;
}

/**
 * Response from ghost-orchestrator Edge Function
 * Client sees ONLY this — never deliberation details
 */
export interface GhostResponse {
  status: 'success' | 'error';
  /** Final CEO output (RECOMMENDATION, RATIONALE, RISKS, NEXT ACTIONS) */
  content?: string;
  /** Error message if status = 'error' */
  error?: string;
  /** Error classification */
  errorCode?: GhostErrorCode;
}

/**
 * Ghost error codes (Phase 9A Rev 3 taxonomy + Phase 11 production guards)
 */
export type GhostErrorCode =
  | 'GHOST_GPT_FAILED'
  | 'GHOST_TIMEOUT'
  | 'GHOST_TOKEN_CAP'
  | 'GHOST_ROUND_CAP'
  | 'GHOST_CALL_CAP'
  | 'GHOST_AUDIT_FAILED'
  | 'GHOST_INTERNAL'
  // Phase 11: Production guards
  | 'GHOST_KILLED'
  | 'GHOST_DAILY_CAP_EXCEEDED'
  | 'GHOST_CIRCUIT_OPEN';

// -----------------------------------------------------------------------------
// Snapshot Configuration (for audit fingerprint)
// -----------------------------------------------------------------------------

/**
 * System configuration snapshot for audit trail
 * Used to compute snapshot_hash via canonical JSON serialization
 */
export interface SnapshotConfig {
  ghost_config_version: string;
  gate_definitions_version: string;
  max_rounds: number;
  max_calls: number;
  max_tokens: number;
  synthesis_reserve: number;
  timeout_ms: number;
}

/**
 * Current snapshot configuration
 * Must match GHOST_LIMITS values
 */
export const CURRENT_SNAPSHOT: SnapshotConfig = {
  ghost_config_version: '1.0.0',
  gate_definitions_version: '1.0.0',
  max_rounds: GHOST_LIMITS.MAX_ROUNDS,
  max_calls: GHOST_LIMITS.MAX_CALLS,
  max_tokens: GHOST_LIMITS.MAX_TOKENS,
  synthesis_reserve: GHOST_LIMITS.SYNTHESIS_RESERVE,
  timeout_ms: GHOST_LIMITS.TIMEOUT_MS,
};

/**
 * Current template version
 */
export const TEMPLATE_VERSION = '1.0.0';

/**
 * Current fingerprint key version
 */
export const FINGERPRINT_KEY_VERSION = 'v1';
