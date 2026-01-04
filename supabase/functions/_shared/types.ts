// =============================================================================
// The Brain — Shared Edge Function Types
// Phase 9B: Common types for all Edge Functions
// =============================================================================

/**
 * Token usage information returned by AI providers
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Standard response envelope for all proxy responses
 * Extends existing response structure with usage field
 */
export interface ProxyResponse {
  content?: string;
  error?: string;
  usage?: TokenUsage;
}

/**
 * OpenAI-specific types
 */
export interface OpenAIRequest {
  action: 'chat';
  messages: Array<{ role: string; content: string }>;
  systemPrompt: string;
  userMessage: string;
  stream?: boolean;
}

export interface OpenAIAPIResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

/**
 * Anthropic-specific types
 */
export interface AnthropicRequest {
  action: 'chat';
  systemPrompt: string;
  prompt: string;
  stream?: boolean;
}

export interface AnthropicAPIResponse {
  content?: Array<{ text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: { message?: string };
}

/**
 * Gemini-specific types
 */
export interface GeminiRequest {
  action: 'chat';
  prompt: string;
}

export interface GeminiAPIResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string };
}

/**
 * Ghost Mode types (Phase 9A Rev 3)
 */
export type GhostStatus = 'CONTINUE' | 'CONVERGED' | 'FORCED';
export type GateResult = 'PASS' | 'FAIL';
export type FinalStatus = 'CONVERGED' | 'FORCED' | 'ABORTED';
export type ForcedReason = 'round_cap' | 'call_cap' | 'token_cap' | 'timeout';
export type AbortReason = 'gpt_failure' | 'audit_failure' | 'internal_error';

export interface GateEvaluation {
  round: number;
  g1: GateResult;
  g2: GateResult;
  g3: GateResult;
}

export interface GhostAuditRecord {
  snapshot_hash: string;
  decision_fingerprint: string;
  fingerprint_key_version: string;
  rounds_used: number;
  calls_used: number;
  tokens_used: number;
  final_status: FinalStatus;
  forced_reason?: ForcedReason;
  abort_reason?: AbortReason;
  gate_results: GateEvaluation[];
  template_version: string;
}

/**
 * Ghost orchestrator request/response
 */
export interface GhostRequest {
  userPrompt: string;
}

export interface GhostResponse {
  status: 'success' | 'error';
  content?: string;  // Final CEO output (RECOMMENDATION, RATIONALE, RISKS, NEXT ACTIONS)
  error?: string;
  errorCode?: 
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
}
