// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Agent API Client (Phase 3 — Integration + Phase 5 Cost Controls)
// =============================================================================

import type { Agent, AgentResponse, ErrorCode, Exchange } from '../types/brain';
import { AGENT_ENDPOINTS } from '../config/env';
import {
  MAX_AGENT_CALLS,
} from '../utils/costConfig';
import { buildContext } from '../utils/contextBuilder';
import { logCalls } from '../utils/devLogger';
import { buildProjectContextPrefix } from '../config/projectContext';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

// -----------------------------------------------------------------------------
// Run Coordination Types (Phase 5)
// -----------------------------------------------------------------------------

export interface RunCoordination {
  runId: string;
  callIndex: number;
  exchanges: Exchange[];  // Historical exchanges for context building
  projectDiscussionMode?: boolean;  // Inject project context into prompts
  mode?: 'discussion' | 'decision' | 'project';  // Current brain mode
  ceoAgent?: Agent;  // Current CEO agent
}

/**
 * System prompt for GPT (gatekeeping role)
 */
const GPT_SYSTEM_PROMPT = `You are the Gatekeeper AI in a multi-AI system called "The Brain."
Your role is to analyze the user's question and decide which other AIs should respond.

ALWAYS include these routing flags in your response:
---
CALL_CLAUDE=true or false
CALL_GEMINI=true or false
REASON_TAG=brief_reason
---

After the flags, provide your own response to the user's question.

Guidelines:
- Set CALL_CLAUDE=true for coding, analysis, writing, or complex reasoning tasks
- Set CALL_GEMINI=true for factual queries, research, or general knowledge
- Set both true for comprehensive questions that benefit from multiple perspectives
- Set both false only for simple greetings or meta-questions about the system`;

/**
 * System prompt for Claude
 */
const CLAUDE_SYSTEM_PROMPT = `You are Claude, part of a multi-AI system called "The Brain."
GPT has already provided an initial response. Build on or complement that response.
Focus on: deep analysis, nuanced reasoning, and thoughtful perspectives.
Be concise but thorough.`;

/**
 * Prompt prefix for Gemini (no system prompt support in simple API)
 */
const GEMINI_PROMPT_PREFIX = `You are Gemini, part of a multi-AI system called "The Brain."
GPT and Claude may have already responded. Provide your unique perspective.
Focus on: factual accuracy, practical information, and clear explanations.

User question: `;

/**
 * System prompt for CEO in Decision mode (MANDATORY MARKERS)
 * CEO MUST include one of the two marker blocks. Surrounding text is tolerated but discouraged.
 */
const CEO_DECISION_MODE_SYSTEM_PROMPT = `You are the CEO in Decision mode. You are the FINAL DECISION-MAKER.

AUTHORITY:
- Advisor feedback (from Gemini/Claude) is ADVISORY, not directive.
- You must evaluate each advisor point and decide to ACCEPT, MODIFY, or REJECT it based on your judgment.
- Your decision is final. Advisors do not override you.

OUTPUT FORMAT — You MUST include one of these two marker formats in your response:

OPTION 1 - Claude Code Prompt (when ready to execute):
=== CLAUDE_CODE_PROMPT_START ===
[Your complete prompt for Claude Code here]
=== CLAUDE_CODE_PROMPT_END ===

OPTION 2 - Clarification Questions (when you need more info):
=== CEO_BLOCKED_START ===
Q1: [First question]
Q2: [Second question]
=== CEO_BLOCKED_END ===

RULES:
- You MUST include exactly ONE of these marker blocks
- Choose Option 1 when you have enough info to create a prompt
- Choose Option 2 when you need clarification (max 3 questions)
- Prefer minimal text outside the markers

EXAMPLE 1 - Ready to execute:
=== CLAUDE_CODE_PROMPT_START ===
Create a React component that displays a user profile card with name, email, and avatar.
=== CLAUDE_CODE_PROMPT_END ===

EXAMPLE 2 - Need clarification:
=== CEO_BLOCKED_START ===
Q1: What authentication method should be used?
Q2: Should the component support dark mode?
=== CEO_BLOCKED_END ===`;

/**
 * Instruction for CEO retry/reformat (when markers were missing)
 */
export const CEO_REFORMAT_INSTRUCTION = `Your previous response was missing the required markers. Reformat your answer using EXACTLY one of these formats with NO other text:

=== CLAUDE_CODE_PROMPT_START ===
[Your prompt here]
=== CLAUDE_CODE_PROMPT_END ===

OR

=== CEO_BLOCKED_START ===
Q1: [Question]
=== CEO_BLOCKED_END ===

Output ONLY the markers and content. No explanations.`;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface OpenAIRequest {
  action: 'chat';
  messages: Array<{ role: string; content: string }>;
  systemPrompt: string;
  userMessage: string;
  stream?: boolean;
}

interface AnthropicRequest {
  action: 'chat';
  systemPrompt: string;
  prompt: string;
  stream?: boolean;
}

interface GeminiRequest {
  action: 'chat';
  prompt: string;
}

// Response types (raw from APIs)
interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: string;
}

interface AnthropicResponse {
  content?: Array<{ text?: string }>;
  error?: string;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: string;
}

// -----------------------------------------------------------------------------
// Request Builders
// -----------------------------------------------------------------------------

function buildGPTRequest(
  userPrompt: string,
  _context: string,
  projectDiscussionMode: boolean,
  isCeoInDecisionMode: boolean = false
): OpenAIRequest {
  const projectPrefix = buildProjectContextPrefix('gpt', projectDiscussionMode);
  const systemPrompt = isCeoInDecisionMode
    ? CEO_DECISION_MODE_SYSTEM_PROMPT
    : projectPrefix + GPT_SYSTEM_PROMPT;
  return {
    action: 'chat',
    messages: [],
    systemPrompt,
    userMessage: userPrompt,
    stream: false,
  };
}

function buildClaudeRequest(
  userPrompt: string,
  context: string,
  projectDiscussionMode: boolean,
  isCeoInDecisionMode: boolean = false
): AnthropicRequest {
  const projectPrefix = buildProjectContextPrefix('claude', projectDiscussionMode);
  const fullPrompt = context
    ? `Previous responses:\n${context}\n\nUser's original question: ${userPrompt}`
    : userPrompt;
  const systemPrompt = isCeoInDecisionMode
    ? CEO_DECISION_MODE_SYSTEM_PROMPT
    : projectPrefix + CLAUDE_SYSTEM_PROMPT;

  return {
    action: 'chat',
    systemPrompt,
    prompt: fullPrompt,
    stream: false,
  };
}

function buildGeminiRequest(
  userPrompt: string,
  context: string,
  projectDiscussionMode: boolean,
  isCeoInDecisionMode: boolean = false
): GeminiRequest {
  const projectPrefix = buildProjectContextPrefix('gemini', projectDiscussionMode);
  let fullPrompt: string;

  if (isCeoInDecisionMode) {
    // Gemini doesn't have system prompt, so prepend the CEO instruction
    fullPrompt = CEO_DECISION_MODE_SYSTEM_PROMPT + '\n\n' + userPrompt;
  } else {
    fullPrompt = projectPrefix + GEMINI_PROMPT_PREFIX + userPrompt;
  }

  if (context) {
    fullPrompt += `\n\nPrevious responses from other AIs:\n${context}`;
  }

  return {
    action: 'chat',
    prompt: fullPrompt,
  };
}

// -----------------------------------------------------------------------------
// Response Parsers
// -----------------------------------------------------------------------------

function parseGPTResponse(data: OpenAIResponse): string | null {
  if (data.error) {
    return null;
  }
  return data.choices?.[0]?.message?.content ?? null;
}

function parseClaudeResponse(data: AnthropicResponse): string | null {
  if (data.error) {
    return null;
  }
  return data.content?.[0]?.text ?? null;
}

function parseGeminiResponse(data: GeminiResponse): string | null {
  if (data.error) {
    return null;
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

// -----------------------------------------------------------------------------
// Error Classification
// -----------------------------------------------------------------------------

function classifyError(status: number): ErrorCode {
  if (status === 429) {
    return 'rate_limit';
  }
  if (status >= 500) {
    return 'api';
  }
  if (status >= 400) {
    return 'api';
  }
  return 'network';
}

// -----------------------------------------------------------------------------
// Main API Client
// -----------------------------------------------------------------------------

/**
 * Call an agent's API endpoint and return a normalized AgentResponse.
 *
 * @param agent - Which agent to call ('gpt', 'claude', 'gemini')
 * @param userPrompt - The user's original question
 * @param conversationContext - Context from previous agent responses
 * @param abortController - For cancellation/timeout
 * @param coordination - Run-scoped coordination (runId + callIndex) for cost control
 * @param timeoutMs - Timeout in milliseconds (default 30s)
 */
export async function callAgent(
  agent: Agent,
  userPrompt: string,
  conversationContext: string,
  abortController: AbortController,
  coordination: RunCoordination,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<AgentResponse> {
  const { runId, callIndex, exchanges, projectDiscussionMode = false, mode, ceoAgent } = coordination;

  // Detect if this is CEO in Decision mode (requires special system prompt)
  const isCeoInDecisionMode = mode === 'decision' && ceoAgent === agent;
  const timestamp = Date.now();

  // -------------------------------------------------------------------------
  // Phase 5: Enforce MAX_AGENT_CALLS
  // -------------------------------------------------------------------------

  if (callIndex > MAX_AGENT_CALLS) {
    logCalls(`ERROR: MAX_AGENT_CALLS exceeded: callIndex=${callIndex}, max=${MAX_AGENT_CALLS}`, {
      runId,
      agent,
    });
    return {
      agent,
      timestamp,
      status: 'error',
      errorCode: 'api',
      errorMessage: `Cost control: max agent calls (${MAX_AGENT_CALLS}) exceeded`,
    };
  }

  logCalls(`Agent call #${callIndex}`, { runId, agent });

  // -------------------------------------------------------------------------
  // Phase 5: Build context with deterministic truncation
  // Uses contextBuilder for:
  // - MAX_EXCHANGES enforcement (10 max)
  // - Oldest-first exchange dropping
  // - User prompt overflow handling
  // - Budget-based history truncation (newest preserved)
  // -------------------------------------------------------------------------

  const contextResult = buildContext(exchanges, conversationContext, userPrompt);
  const truncatedPrompt = contextResult.userPrompt;
  const truncatedContext = contextResult.context;

  // -------------------------------------------------------------------------
  // Validate endpoint
  // -------------------------------------------------------------------------

  const endpoint = AGENT_ENDPOINTS[agent];

  if (!endpoint || endpoint.includes('undefined')) {
    return {
      agent,
      timestamp,
      status: 'error',
      errorCode: 'network',
      errorMessage: 'Supabase URL not configured. Check VITE_SUPABASE_URL.',
    };
  }

  // -------------------------------------------------------------------------
  // Build request body based on agent (using truncated inputs)
  // -------------------------------------------------------------------------

  let requestBody: OpenAIRequest | AnthropicRequest | GeminiRequest;

  switch (agent) {
    case 'gpt':
      requestBody = buildGPTRequest(truncatedPrompt, truncatedContext, projectDiscussionMode, isCeoInDecisionMode);
      break;
    case 'claude':
      requestBody = buildClaudeRequest(truncatedPrompt, truncatedContext, projectDiscussionMode, isCeoInDecisionMode);
      break;
    case 'gemini':
      requestBody = buildGeminiRequest(truncatedPrompt, truncatedContext, projectDiscussionMode, isCeoInDecisionMode);
      break;
  }

  // Set up timeout
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        agent,
        timestamp,
        status: 'error',
        errorCode: classifyError(response.status),
        errorMessage: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
      };
    }

    // Parse response
    const data = await response.json();

    // Extract content based on agent
    let content: string | null;

    switch (agent) {
      case 'gpt':
        content = parseGPTResponse(data as OpenAIResponse);
        break;
      case 'claude':
        content = parseClaudeResponse(data as AnthropicResponse);
        break;
      case 'gemini':
        content = parseGeminiResponse(data as GeminiResponse);
        break;
    }

    // Check for parse failure
    if (content === null) {
      return {
        agent,
        timestamp,
        status: 'error',
        errorCode: 'api',
        errorMessage: data.error || 'Failed to parse response',
      };
    }

    // Success
    return {
      agent,
      timestamp,
      status: 'success',
      content,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // Check if aborted (timeout or user cancellation)
    if (abortController.signal.aborted) {
      return {
        agent,
        timestamp,
        status: 'timeout',
      };
    }

    // Network or other error
    return {
      agent,
      timestamp,
      status: 'error',
      errorCode: 'network',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export { AGENT_ENDPOINTS };
