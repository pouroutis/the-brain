// =============================================================================
// The Brain — Context Builder
// =============================================================================

import type { Agent, AgentResponse, Exchange } from '../types/brain';
import { getLatestRound } from '../reducer/brainReducer';
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

  // V3-A: Read from latest round
  const latestRound = getLatestRound(exchange);
  const agentOrder: Agent[] = ['gpt', 'claude', 'gemini'];
  for (const agent of agentOrder) {
    const response = latestRound.responsesByAgent[agent];
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
 */
export function buildContext(
  exchanges: Exchange[],
  currentRunContext: string,
  userPrompt: string
): ContextBuildResult {
  let promptTruncated = false;
  let exchangesDropped = 0;
  let historyTruncated = false;

  // Step 1: Handle user prompt truncation
  let finalPrompt = userPrompt;
  if (userPrompt.length > MAX_PROMPT_CHARS) {
    finalPrompt = truncateWithMarker(userPrompt, MAX_PROMPT_CHARS);
    promptTruncated = true;
    logCost('User prompt truncated', {
      original: userPrompt.length,
      truncated: finalPrompt.length,
    });
  }

  // Step 2: Calculate available budget for history
  const currentRunLength = currentRunContext.length;
  const promptLength = finalPrompt.length;

  const padding = 100;
  const availableForHistory = Math.max(
    0,
    MAX_CONTEXT_CHARS - currentRunLength - promptLength - padding
  );

  // Step 3: Select and truncate exchanges (oldest-first removal)
  let selectedExchanges = exchanges.slice(-MAX_EXCHANGES);
  if (exchanges.length > MAX_EXCHANGES) {
    exchangesDropped = exchanges.length - MAX_EXCHANGES;
    logCost('Exchanges dropped (max limit)', { dropped: exchangesDropped });
  }

  let historyParts: string[] = [];
  let historyLength = 0;

  for (let i = selectedExchanges.length - 1; i >= 0; i--) {
    const serialized = serializeExchange(selectedExchanges[i]);
    const newLength = historyLength + serialized.length + 4;

    if (newLength <= availableForHistory) {
      historyParts.unshift(serialized);
      historyLength = newLength;
    } else {
      exchangesDropped += i + 1;
      historyTruncated = true;
      logCost('Exchanges dropped (budget)', { dropped: i + 1 });
      break;
    }
  }

  // Step 4: Assemble final context
  const contextParts: string[] = [];

  if (historyParts.length > 0) {
    contextParts.push('--- Previous Exchanges ---');
    contextParts.push(historyParts.join('\n\n'));
  }

  if (currentRunContext.trim()) {
    contextParts.push('--- Current Exchange ---');
    contextParts.push(currentRunContext.trim());
  }

  const context = contextParts.join('\n\n');

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
 * Build context for GPT (first agent - no current run context).
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
