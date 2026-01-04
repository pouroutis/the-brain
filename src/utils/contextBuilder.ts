// =============================================================================
// The Brain — Context Builder (Phase 5)
// =============================================================================

import type { Agent, AgentResponse, Exchange } from '../types/brain';
import {
  MAX_CONTEXT_CHARS,
  MAX_EXCHANGES,
  MAX_PROMPT_CHARS,
  TRUNCATION_MARKER,
} from './costConfig';
import { logCost } from './devLogger';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ContextBuildResult {
  /** The truncated context string ready for agent payload */
  context: string;
  /** The truncated user prompt (if truncation was applied) */
  userPrompt: string;
  /** Whether user prompt was truncated */
  promptTruncated: boolean;
  /** Number of exchanges dropped from history */
  exchangesDropped: number;
  /** Whether any history content was truncated */
  historyTruncated: boolean;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Truncate a string to maxLength, appending marker if truncated.
 */
function truncateWithMarker(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  const truncateAt = maxLength - TRUNCATION_MARKER.length;
  return str.slice(0, truncateAt) + TRUNCATION_MARKER;
}

/**
 * Serialize an agent response for context inclusion.
 */
function serializeResponse(agent: Agent, response: AgentResponse): string {
  if (response.status === 'success' && response.content) {
    return `${agent.toUpperCase()}: ${response.content}`;
  }
  // Non-success responses: include status indicator
  return `${agent.toUpperCase()}: [${response.status}]`;
}

/**
 * Serialize a single exchange for context inclusion.
 */
function serializeExchange(exchange: Exchange): string {
  const parts: string[] = [];
  
  // User prompt
  parts.push(`User: ${exchange.userPrompt}`);
  
  // Agent responses in fixed order
  const agentOrder: Agent[] = ['gpt', 'claude', 'gemini'];
  for (const agent of agentOrder) {
    const response = exchange.responsesByAgent[agent];
    if (response) {
      parts.push(serializeResponse(agent, response));
    }
  }
  
  return parts.join('\n');
}

// -----------------------------------------------------------------------------
// Main Context Builder
// -----------------------------------------------------------------------------

/**
 * Build context for an agent call with deterministic truncation.
 * 
 * Budget allocation:
 * 1. User prompt gets priority (truncated only if > MAX_PROMPT_CHARS)
 * 2. Current run responses included in full (within budget)
 * 3. Historical exchanges fill remaining budget (oldest dropped first)
 * 
 * @param exchanges - Completed exchanges from state
 * @param currentRunContext - Context built during current run (GPT/Claude responses)
 * @param userPrompt - The user's original prompt for this run
 */
export function buildContext(
  exchanges: Exchange[],
  currentRunContext: string,
  userPrompt: string
): ContextBuildResult {
  let promptTruncated = false;
  let exchangesDropped = 0;
  let historyTruncated = false;

  // -------------------------------------------------------------------------
  // Step 1: Handle user prompt truncation
  // -------------------------------------------------------------------------
  
  let finalPrompt = userPrompt;
  if (userPrompt.length > MAX_PROMPT_CHARS) {
    finalPrompt = truncateWithMarker(userPrompt, MAX_PROMPT_CHARS);
    promptTruncated = true;
    logCost('User prompt truncated', {
      original: userPrompt.length,
      truncated: finalPrompt.length,
    });
  }

  // -------------------------------------------------------------------------
  // Step 2: Calculate available budget for history
  // -------------------------------------------------------------------------
  
  // Current run context is included in full (it's the current conversation)
  const currentRunLength = currentRunContext.length;
  const promptLength = finalPrompt.length;
  
  // Available for history = total - currentRun - prompt - some padding
  const padding = 100; // Safety margin for separators
  const availableForHistory = Math.max(
    0,
    MAX_CONTEXT_CHARS - currentRunLength - promptLength - padding
  );

  // -------------------------------------------------------------------------
  // Step 3: Select and truncate exchanges (oldest-first removal)
  // -------------------------------------------------------------------------
  
  // Limit to MAX_EXCHANGES first
  let selectedExchanges = exchanges.slice(-MAX_EXCHANGES);
  if (exchanges.length > MAX_EXCHANGES) {
    exchangesDropped = exchanges.length - MAX_EXCHANGES;
    logCost('Exchanges dropped (max limit)', { dropped: exchangesDropped });
  }

  // Serialize exchanges and fit within budget
  let historyParts: string[] = [];
  let historyLength = 0;

  // Work backwards from newest to oldest, building up history
  for (let i = selectedExchanges.length - 1; i >= 0; i--) {
    const serialized = serializeExchange(selectedExchanges[i]);
    const newLength = historyLength + serialized.length + 4; // +4 for "\n\n" separator
    
    if (newLength <= availableForHistory) {
      historyParts.unshift(serialized);
      historyLength = newLength;
    } else {
      // Can't fit this exchange - drop it and all older ones
      exchangesDropped += i + 1;
      historyTruncated = true;
      logCost('Exchanges dropped (budget)', { dropped: i + 1 });
      break;
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Assemble final context
  // -------------------------------------------------------------------------
  
  const contextParts: string[] = [];
  
  // History section (if any)
  if (historyParts.length > 0) {
    contextParts.push('--- Previous Exchanges ---');
    contextParts.push(historyParts.join('\n\n'));
  }
  
  // Current run section (if any)
  if (currentRunContext.trim()) {
    contextParts.push('--- Current Exchange ---');
    contextParts.push(currentRunContext.trim());
  }

  const context = contextParts.join('\n\n');

  // -------------------------------------------------------------------------
  // Log summary
  // -------------------------------------------------------------------------
  
  if (promptTruncated || exchangesDropped > 0 || historyTruncated) {
    logCost('Context built with truncation', {
      contextLength: context.length,
      promptLength: finalPrompt.length,
      exchangesIncluded: historyParts.length,
      exchangesDropped,
      promptTruncated,
      historyTruncated,
    });
  }

  return {
    context,
    userPrompt: finalPrompt,
    promptTruncated,
    exchangesDropped,
    historyTruncated,
  };
}

/**
 * Build context for GPT (first agent - no current run context, no history needed for first call).
 * GPT receives only the user prompt.
 */
export function buildGPTContext(userPrompt: string): ContextBuildResult {
  let promptTruncated = false;
  let finalPrompt = userPrompt;
  
  if (userPrompt.length > MAX_PROMPT_CHARS) {
    finalPrompt = truncateWithMarker(userPrompt, MAX_PROMPT_CHARS);
    promptTruncated = true;
    logCost('User prompt truncated for GPT', {
      original: userPrompt.length,
      truncated: finalPrompt.length,
    });
  }

  return {
    context: '',
    userPrompt: finalPrompt,
    promptTruncated,
    exchangesDropped: 0,
    historyTruncated: false,
  };
}
