// =============================================================================
// The Brain — Ghost Orchestrator Edge Function
// Phase 9B: Server-side Ghost Mode deliberation
// Phase 10: Integration hardening (JSON parse guard, error sanitization)
// Phase 11: Production readiness (kill-switch, daily caps, circuit breaker)
// Implements Phase 9A Rev 3 (LOCKED)
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import type {
  GhostResponse,
  TokenUsage,
  GateEvaluation,
  FinalStatus,
  ForcedReason,
  AbortReason,
  GhostAuditRecord,
} from '../_shared/types.ts';
import { parseGhostFlags, toGateEvaluation, allGatesPass } from '../_shared/ghostParser.ts';
import { buildGPTPrompt, buildClaudePrompt, buildGeminiPrompt, TEMPLATE_VERSION } from '../_shared/ghostPrompts.ts';
import {
  CURRENT_SNAPSHOT,
  FINGERPRINT_KEY_VERSION,
  computeSnapshotHash,
  computeDecisionFingerprint,
  getAuditSecret,
} from '../_shared/ghostCanonical.ts';
import {
  runProductionGuards,
  createGuardClient,
} from '../_shared/productionGuards.ts';

// =============================================================================
// LOCKED CONFIGURATION (Phase 8)
// =============================================================================

/**
 * Mode is hardcoded server-side — NOT a client parameter
 * Per Phase 9A: CEO mode always enables Ghost
 */
const GHOST_MODE: 'ceo' = 'ceo';

/**
 * Ghost limits (Phase 8 LOCKED)
 */
const MAX_ROUNDS = 2;
const MAX_CALLS = 6;
const MAX_TOKENS = 4000;
const SYNTHESIS_RESERVE = 1000;
const TIMEOUT_MS = 90_000;

/**
 * Per-agent timeout
 */
const AGENT_TIMEOUT_MS = 30_000;

// =============================================================================
// API ENDPOINTS
// =============================================================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// =============================================================================
// ORCHESTRATOR STATE
// =============================================================================

interface OrchestratorState {
  roundsUsed: number;
  callsUsed: number;
  tokensUsed: number;
  gateHistory: GateEvaluation[];
  conversationContext: string;
  finalOutput?: string;
  finalStatus?: FinalStatus;
  forcedReason?: ForcedReason;
  abortReason?: AbortReason;
}

// =============================================================================
// AGENT CALLERS
// =============================================================================

async function callGPT(
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number
): Promise<{ content: string | null; usage: TokenUsage | null; error?: string }> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return { content: null, usage: null, error: 'OpenAI API key not configured' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 1000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return { content: null, usage: null, error: `OpenAI error: ${errorText}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? null;
    const usage: TokenUsage | null = data.usage ? {
      inputTokens: data.usage.prompt_tokens ?? 0,
      outputTokens: data.usage.completion_tokens ?? 0,
      totalTokens: data.usage.total_tokens ?? 0,
    } : null;

    return { content, usage };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return { content: null, usage: null, error: 'Timeout' };
    }
    return { content: null, usage: null, error: String(error) };
  }
}

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number
): Promise<{ content: string | null; usage: TokenUsage | null; error?: string }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { content: null, usage: null, error: 'Anthropic API key not configured' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return { content: null, usage: null, error: `Anthropic error: ${errorText}` };
    }

    const data = await response.json();
    const content = data.content?.[0]?.text ?? null;
    const usage: TokenUsage | null = data.usage ? {
      inputTokens: data.usage.input_tokens ?? 0,
      outputTokens: data.usage.output_tokens ?? 0,
      totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
    } : null;

    return { content, usage };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return { content: null, usage: null, error: 'Timeout' };
    }
    return { content: null, usage: null, error: String(error) };
  }
}

async function callGemini(
  prompt: string,
  timeoutMs: number
): Promise<{ content: string | null; usage: TokenUsage | null; error?: string }> {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
  if (!apiKey) {
    return { content: null, usage: null, error: 'Google AI API key not configured' };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1000 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return { content: null, usage: null, error: `Gemini error: ${errorText}` };
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    const usage: TokenUsage | null = data.usageMetadata ? {
      inputTokens: data.usageMetadata.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
      totalTokens: data.usageMetadata.totalTokenCount ?? 0,
    } : null;

    return { content, usage };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return { content: null, usage: null, error: 'Timeout' };
    }
    return { content: null, usage: null, error: String(error) };
  }
}

// =============================================================================
// AUDIT PERSISTENCE
// =============================================================================

async function insertAuditRecord(
  record: GhostAuditRecord,
  retryOnce: boolean = true
): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return { success: false, error: 'Supabase credentials not configured' };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { error } = await supabase.from('ghost_runs').insert({
      snapshot_hash: record.snapshot_hash,
      decision_fingerprint: record.decision_fingerprint,
      fingerprint_key_version: record.fingerprint_key_version,
      rounds_used: record.rounds_used,
      calls_used: record.calls_used,
      tokens_used: record.tokens_used,
      final_status: record.final_status,
      forced_reason: record.forced_reason ?? null,
      abort_reason: record.abort_reason ?? null,
      gate_results: record.gate_results,
      template_version: record.template_version,
    });

    if (error) {
      if (retryOnce) {
        // Per Phase 9A: One retry on failure
        console.error('Audit insert failed, retrying:', error);
        await new Promise(resolve => setTimeout(resolve, 500));
        return insertAuditRecord(record, false);
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    if (retryOnce) {
      console.error('Audit insert exception, retrying:', err);
      await new Promise(resolve => setTimeout(resolve, 500));
      return insertAuditRecord(record, false);
    }
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// MAIN ORCHESTRATOR
// =============================================================================

async function runGhostDeliberation(userPrompt: string): Promise<GhostResponse> {
  const startTime = Date.now();
  
  // Initialize state
  const state: OrchestratorState = {
    roundsUsed: 0,
    callsUsed: 0,
    tokensUsed: 0,
    gateHistory: [],
    conversationContext: '',
  };

  // Compute snapshot hash
  const snapshotHash = await computeSnapshotHash(CURRENT_SNAPSHOT);

  // Helper to check if we can make another call (BEFORE incrementing)
  const canMakeCall = (): boolean => {
    return state.callsUsed < MAX_CALLS;
  };

  // Helper to check hard limits that require forced synthesis
  const checkForcedReason = (): ForcedReason | null => {
    if (state.roundsUsed >= MAX_ROUNDS) return 'round_cap';
    if (!canMakeCall()) return 'call_cap';
    if (state.tokensUsed + SYNTHESIS_RESERVE >= MAX_TOKENS) return 'token_cap';
    if (Date.now() - startTime >= TIMEOUT_MS) return 'timeout';
    return null;
  };

  // Helper to update token count (capped to prevent overflow)
  const addTokens = (usage: TokenUsage | null) => {
    if (usage) {
      state.tokensUsed = Math.min(state.tokensUsed + usage.totalTokens, MAX_TOKENS);
    }
  };

  // Helper to safely increment call count (with cap protection)
  const recordCall = () => {
    state.callsUsed = Math.min(state.callsUsed + 1, MAX_CALLS);
  };

  // ==========================================================================
  // DELIBERATION LOOP
  // ==========================================================================

  try {
    while (state.roundsUsed < MAX_ROUNDS) {
      // Check if we need forced synthesis before starting this round
      const forcedReason = checkForcedReason();
      
      if (forcedReason) {
        // Cannot continue normal deliberation - need forced synthesis
        if (!canMakeCall()) {
          // Cannot even make forced synthesis call - abort
          state.finalStatus = 'ABORTED';
          state.abortReason = 'internal_error';
          break;
        }

        // Make forced synthesis call
        const forcedPrompt = buildGPTPrompt(state.roundsUsed, userPrompt, state.conversationContext, true);
        const forcedResult = await callGPT(forcedPrompt.system, forcedPrompt.user, AGENT_TIMEOUT_MS);
        recordCall();
        addTokens(forcedResult.usage);

        if (!forcedResult.content) {
          state.finalStatus = 'ABORTED';
          state.abortReason = 'gpt_failure';
          break;
        }

        const forcedFlags = parseGhostFlags(forcedResult.content);
        state.gateHistory.push(toGateEvaluation(forcedFlags.round, forcedFlags.gates));
        state.finalStatus = 'FORCED';
        state.forcedReason = forcedReason;
        state.finalOutput = forcedFlags.finalOutput;
        break;
      }

      // ---------------------------------------------------------------------
      // CALL GPT (check capacity first)
      // ---------------------------------------------------------------------
      if (!canMakeCall()) {
        state.finalStatus = 'FORCED';
        state.forcedReason = 'call_cap';
        break;
      }

      const gptPrompt = buildGPTPrompt(
        state.roundsUsed,
        userPrompt,
        state.conversationContext,
        false
      );

      const gptResult = await callGPT(gptPrompt.system, gptPrompt.user, AGENT_TIMEOUT_MS);
      recordCall();
      addTokens(gptResult.usage);

      // Per Phase 9A: GPT failure = hard abort
      if (!gptResult.content) {
        state.finalStatus = 'ABORTED';
        state.abortReason = 'gpt_failure';
        break;
      }

      // Parse ghost flags
      const flags = parseGhostFlags(gptResult.content);
      state.conversationContext += `GPT: ${gptResult.content}\n\n`;

      // Record gate evaluation
      if (flags.valid) {
        state.gateHistory.push(toGateEvaluation(flags.round, flags.gates));
      }

      // Check for convergence or forced
      if (flags.status === 'CONVERGED' || flags.status === 'FORCED') {
        state.finalStatus = flags.status;
        state.finalOutput = flags.finalOutput;
        if (flags.status === 'FORCED') {
          state.forcedReason = checkForcedReason() ?? 'round_cap';
        }
        break;
      }

      // Check if we need forced synthesis after GPT
      const postGPTForcedReason = checkForcedReason();
      if (postGPTForcedReason) {
        if (!canMakeCall()) {
          // Use last GPT output as final (no more calls allowed)
          state.finalStatus = 'FORCED';
          state.forcedReason = 'call_cap';
          // Try to extract final output from last GPT response
          state.finalOutput = flags.finalOutput ?? gptResult.content;
          break;
        }

        // Force synthesis
        const forcedPrompt = buildGPTPrompt(state.roundsUsed, userPrompt, state.conversationContext, true);
        const forcedResult = await callGPT(forcedPrompt.system, forcedPrompt.user, AGENT_TIMEOUT_MS);
        recordCall();
        addTokens(forcedResult.usage);

        if (!forcedResult.content) {
          state.finalStatus = 'ABORTED';
          state.abortReason = 'gpt_failure';
          break;
        }

        const forcedFlags = parseGhostFlags(forcedResult.content);
        state.gateHistory.push(toGateEvaluation(forcedFlags.round, forcedFlags.gates));
        state.finalStatus = 'FORCED';
        state.forcedReason = postGPTForcedReason;
        state.finalOutput = forcedFlags.finalOutput;
        break;
      }

      // ---------------------------------------------------------------------
      // CALL CLAUDE (if within limits)
      // ---------------------------------------------------------------------
      if (canMakeCall() && checkForcedReason() === null) {
        const claudePrompt = buildClaudePrompt(userPrompt, state.conversationContext);
        const claudeResult = await callClaude(claudePrompt.system, claudePrompt.user, AGENT_TIMEOUT_MS);
        recordCall();
        addTokens(claudeResult.usage);

        // Claude failure is not fatal — continue
        if (claudeResult.content) {
          state.conversationContext += `Claude: ${claudeResult.content}\n\n`;
        }
      }

      // ---------------------------------------------------------------------
      // CALL GEMINI (if within limits)
      // ---------------------------------------------------------------------
      if (canMakeCall() && checkForcedReason() === null) {
        const geminiPrompt = buildGeminiPrompt(userPrompt, state.conversationContext);
        const geminiResult = await callGemini(geminiPrompt, AGENT_TIMEOUT_MS);
        recordCall();
        addTokens(geminiResult.usage);

        // Gemini failure is not fatal — continue
        if (geminiResult.content) {
          state.conversationContext += `Gemini: ${geminiResult.content}\n\n`;
        }
      }

      state.roundsUsed = Math.min(state.roundsUsed + 1, MAX_ROUNDS);
    }

    // If we exited loop without final status, force synthesis
    if (!state.finalStatus) {
      if (canMakeCall()) {
        const forcedPrompt = buildGPTPrompt(state.roundsUsed, userPrompt, state.conversationContext, true);
        const forcedResult = await callGPT(forcedPrompt.system, forcedPrompt.user, AGENT_TIMEOUT_MS);
        recordCall();
        addTokens(forcedResult.usage);

        if (!forcedResult.content) {
          state.finalStatus = 'ABORTED';
          state.abortReason = 'gpt_failure';
        } else {
          const forcedFlags = parseGhostFlags(forcedResult.content);
          state.gateHistory.push(toGateEvaluation(forcedFlags.round, forcedFlags.gates));
          state.finalStatus = 'FORCED';
          state.forcedReason = 'round_cap';
          state.finalOutput = forcedFlags.finalOutput;
        }
      } else {
        // Cannot make any more calls - use what we have
        state.finalStatus = 'FORCED';
        state.forcedReason = 'call_cap';
      }
    }

  } catch (error) {
    console.error('Ghost orchestration error:', error);
    state.finalStatus = 'ABORTED';
    state.abortReason = 'internal_error';
  }

  // ==========================================================================
  // AUDIT PERSISTENCE
  // ==========================================================================

  // Compute decision fingerprint
  let decisionFingerprint = '';
  try {
    const auditSecret = getAuditSecret(FINGERPRINT_KEY_VERSION);
    decisionFingerprint = await computeDecisionFingerprint(
      userPrompt,
      TEMPLATE_VERSION,
      snapshotHash,
      auditSecret
    );
  } catch {
    // If fingerprint computation fails, still attempt audit with empty fingerprint
    console.error('Failed to compute decision fingerprint');
  }

  // Build audit record
  const auditRecord: GhostAuditRecord = {
    snapshot_hash: snapshotHash,
    decision_fingerprint: decisionFingerprint,
    fingerprint_key_version: FINGERPRINT_KEY_VERSION,
    rounds_used: state.roundsUsed,
    calls_used: state.callsUsed,
    tokens_used: state.tokensUsed,
    final_status: state.finalStatus ?? 'ABORTED',
    forced_reason: state.forcedReason,
    abort_reason: state.abortReason ?? (state.finalStatus === 'ABORTED' ? 'internal_error' : undefined),
    gate_results: state.gateHistory,
    template_version: TEMPLATE_VERSION,
  };

  // Per Phase 9A: Audit insert required for CEO mode. Failure = ABORTED.
  const auditResult = await insertAuditRecord(auditRecord);
  if (!auditResult.success) {
    console.error('Audit insert failed:', auditResult.error);
    return {
      status: 'error',
      error: 'Decision could not be recorded. Please retry.',
      errorCode: 'GHOST_AUDIT_FAILED',
    };
  }

  // ==========================================================================
  // RETURN RESPONSE
  // ==========================================================================

  if (state.finalStatus === 'ABORTED') {
    const errorCodeMap: Record<AbortReason, GhostResponse['errorCode']> = {
      gpt_failure: 'GHOST_GPT_FAILED',
      audit_failure: 'GHOST_AUDIT_FAILED',
      internal_error: 'GHOST_INTERNAL',
    };

    return {
      status: 'error',
      error: `Ghost deliberation failed: ${state.abortReason}`,
      errorCode: errorCodeMap[state.abortReason ?? 'internal_error'],
    };
  }

  // Success — return only the final output (CEO never sees deliberation)
  return {
    status: 'success',
    content: state.finalOutput ?? 'No recommendation could be generated.',
  };
}

// =============================================================================
// HTTP HANDLER
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // =========================================================================
    // PRODUCTION GUARDS (Phase 11) — Fail-closed
    // =========================================================================
    
    const guardClient = createGuardClient();
    if (!guardClient) {
      // Fail-closed: cannot verify guards without DB access
      return errorResponse(req, 'Service unavailable', 503);
    }

    const guardResult = await runProductionGuards(guardClient);
    if (!guardResult.allowed) {
      return jsonResponse(req, {
        status: 'error',
        error: guardResult.errorMessage ?? 'Request blocked by production guard',
        errorCode: guardResult.errorCode,
      } as GhostResponse);
    }

    // =========================================================================
    // REQUEST PROCESSING
    // =========================================================================

    // Guard JSON parse with clean 400
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse(req, 'Invalid JSON in request body', 400);
    }

    // Validate request structure
    if (!body || typeof body !== 'object') {
      return errorResponse(req, 'Request body must be a JSON object', 400);
    }

    const request = body as Record<string, unknown>;

    if (!request.userPrompt || typeof request.userPrompt !== 'string') {
      return errorResponse(req, 'Missing or invalid userPrompt', 400);
    }

    // Run Ghost deliberation
    const result = await runGhostDeliberation(request.userPrompt as string);

    return jsonResponse(req, result);

  } catch (error) {
    // Log internally but return sanitized error to client
    console.error('Ghost orchestrator error:', error);
    return errorResponse(
      req,
      'Internal server error',
      500
    );
  }
});
