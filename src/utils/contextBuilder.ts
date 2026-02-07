// =============================================================================
// The Brain — Context Builder (Phase 5)
// =============================================================================

import type { Agent, AgentResponse, Carryover, Exchange, FileEntry, KeyNotes } from '../types/brain';
import {
  MAX_SINGLE_FILE_CHARS,
  FILE_TRUNCATION_KEEP_START,
  FILE_TRUNCATION_KEEP_END,
  EXCLUDED_PATH_PATTERNS,
  BINARY_EXTENSIONS,
} from './fileConfig';

// =============================================================================
// PROJECT SUMMARY (Decision Mode Only)
// Human-curated, static text. <= 500 words, bullets only.
// =============================================================================

/**
 * Static Project Summary for Decision mode.
 * This is injected into EVERY AI call in Decision mode so agents can
 * produce accurate decisions and Claude Code prompts.
 */
export const PROJECT_SUMMARY_TEXT = `
## FACTS (What Exists Now)
- "The Brain" is a multi-AI chat system using GPT, Claude, and Gemini
- Three operating modes: Discussion (free-form), Decision (Claude Code prompt output), Project (disabled)
- CEO agent speaks last and produces final decisions (default: GPT)
- Agent order: Gemini first, Claude second, CEO last
- React + TypeScript frontend with Vite build system
- State managed via useReducer pattern (brainReducer)
- AI calls routed through Supabase Edge Functions (proxies)
- Discussion mode has memory persistence (localStorage) and compaction
- Decision mode outputs a "Claude Code Prompt" artifact in right pane

## LOCKED / FORBIDDEN (Hard Rules)
- No in-session mode switching — mode selected from Home screen only
- No direct API key exposure in frontend
- No breaking existing test contracts without explicit approval
- No changes to .env.local or credentials
- CEO must always speak last in the agent sequence
- Agent order (gemini, claude, gpt) must not change without approval
- Discussion mode must NOT include Project Summary injection
- Project mode is disabled (Coming Soon)

## OUT OF SCOPE (Not Building Now)
- Real-time collaboration / multi-user
- Authentication / user accounts
- Conversation branching / forking
- File uploads or image processing
- Voice input/output
- Mobile-specific optimizations
- Streaming responses (currently batch only)
- Agent-specific model selection per call
- Custom system prompts per session
`.trim();

/**
 * Build the Project Summary block for Decision mode injection.
 * Header: "PROJECT SUMMARY (READ-ONLY)"
 * Includes instruction line about unknowns.
 */
export function buildProjectSummaryBlock(): string {
  const sections: string[] = [];

  sections.push('=== PROJECT SUMMARY (READ-ONLY) ===');
  sections.push('If info is missing, say UNKNOWN. Do not guess.');
  sections.push('');
  sections.push(PROJECT_SUMMARY_TEXT);
  sections.push('');
  sections.push('=== END PROJECT SUMMARY ===');
  sections.push('');
  sections.push('--- USER PROMPT ---');
  sections.push('');

  return sections.join('\n');
}
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

// -----------------------------------------------------------------------------
// Discussion Memory Block Builder (Task 4 — Discussion Mode Only)
// -----------------------------------------------------------------------------

/** Maximum exchanges to include in discussion memory */
const DISCUSSION_MEMORY_MAX_EXCHANGES = 10;

/** Schema version for discussion memory format */
const DISCUSSION_MEMORY_SCHEMA_VERSION = 1;

/**
 * Input parameters for building discussion memory block.
 */
export interface DiscussionMemoryParams {
  /** Key-notes from compacted exchanges (may be null/empty) */
  keyNotes: KeyNotes | null;
  /** All current exchanges (will be sliced to last 10) */
  exchanges: Exchange[];
}

/**
 * Serialize an exchange for discussion memory (includes timestamps).
 */
function serializeExchangeForMemory(exchange: Exchange, index: number): string {
  const parts: string[] = [];
  const timestamp = new Date(exchange.timestamp).toISOString();

  parts.push(`[Exchange ${index + 1} - ${timestamp}]`);
  parts.push(`User: ${exchange.userPrompt}`);

  // Agent responses in fixed order
  const agentOrder: Agent[] = ['gpt', 'claude', 'gemini'];
  for (const agent of agentOrder) {
    const response = exchange.responsesByAgent[agent];
    if (response && response.status === 'success' && response.content) {
      parts.push(`${agent.toUpperCase()}: ${response.content}`);
    }
  }

  return parts.join('\n');
}

/**
 * Build discussion memory block for context injection (Discussion mode only).
 *
 * This creates a deterministic text block containing:
 * 1. Key-notes memory (structured JSON) if present
 * 2. Last 10 exchanges in full with timestamps
 *
 * The block is designed to be prepended to the user prompt for all agents.
 *
 * @param params - keyNotes and exchanges from state
 * @returns Formatted memory block string (empty string if no memory)
 */
export function buildDiscussionMemoryBlock(params: DiscussionMemoryParams): string {
  const { keyNotes, exchanges } = params;

  // Get last 10 exchanges only
  const last10 = exchanges.slice(-DISCUSSION_MEMORY_MAX_EXCHANGES);

  // Check if keyNotes has actual content
  const hasKeyNotes = keyNotes && hasKeyNotesContent(keyNotes);

  // If no memory to inject, return empty
  if (!hasKeyNotes && last10.length === 0) {
    return '';
  }

  const sections: string[] = [];

  // Header with schema version
  sections.push(`=== DISCUSSION MEMORY (v${DISCUSSION_MEMORY_SCHEMA_VERSION}) ===`);

  // Key-notes section (if present and non-empty)
  if (hasKeyNotes) {
    sections.push('');
    sections.push('--- KEY-NOTES (Compacted History) ---');
    sections.push(JSON.stringify(keyNotes, null, 2));
  }

  // Last 10 exchanges section
  if (last10.length > 0) {
    sections.push('');
    sections.push(`--- RECENT EXCHANGES (Last ${last10.length}) ---`);
    for (let i = 0; i < last10.length; i++) {
      sections.push('');
      sections.push(serializeExchangeForMemory(last10[i], i));
    }
  }

  sections.push('');
  sections.push('=== END DISCUSSION MEMORY ===');
  sections.push('');
  sections.push('--- CURRENT PROMPT ---');
  sections.push('');

  return sections.join('\n');
}

/**
 * Check if keyNotes has any actual content.
 */
function hasKeyNotesContent(keyNotes: KeyNotes): boolean {
  return (
    keyNotes.decisions.length > 0 ||
    keyNotes.reasoningChains.length > 0 ||
    keyNotes.agreements.length > 0 ||
    keyNotes.constraints.length > 0 ||
    keyNotes.openQuestions.length > 0
  );
}

// -----------------------------------------------------------------------------
// Carryover Memory Block Builder (Task 5.2 — Project Mode Only)
// -----------------------------------------------------------------------------

/** Schema version for carryover memory format */
const CARRYOVER_SCHEMA_VERSION = 1;

/**
 * Build carryover memory block for context injection (Project mode only).
 *
 * This creates a deterministic text block containing discussion context
 * that was carried over from Discussion mode to Project mode:
 * 1. Source session ID and creation timestamp
 * 2. Key-notes memory (structured JSON) if present
 * 3. Last 10 exchanges from the discussion
 *
 * The block is designed to be prepended to the user prompt for all agents.
 *
 * @param carryover - Carryover data from state
 * @returns Formatted memory block string (empty string if no content)
 */
export function buildCarryoverMemoryBlock(carryover: Carryover): string {
  const { keyNotes, last10Exchanges, fromSessionId, createdAt } = carryover;

  // Check if keyNotes has actual content
  const hasKeyNotes = keyNotes && hasKeyNotesContent(keyNotes);

  // If no content to inject, return empty
  if (!hasKeyNotes && last10Exchanges.length === 0) {
    return '';
  }

  const sections: string[] = [];

  // Header with schema version
  sections.push(`=== DISCUSSION CARRYOVER (v${CARRYOVER_SCHEMA_VERSION}) ===`);
  sections.push(`fromSessionId: ${fromSessionId}`);
  sections.push(`createdAt: ${new Date(createdAt).toISOString()}`);

  // Key-notes section (if present and non-empty)
  if (hasKeyNotes) {
    sections.push('');
    sections.push('--- KEY NOTES ---');
    sections.push(JSON.stringify(keyNotes, null, 2));
  }

  // Exchanges section (if present)
  if (last10Exchanges.length > 0) {
    sections.push('');
    sections.push(`--- RECENT EXCHANGES (${last10Exchanges.length}) ---`);
    for (let i = 0; i < last10Exchanges.length; i++) {
      sections.push('');
      sections.push(serializeExchangeForMemory(last10Exchanges[i], i));
    }
  }

  sections.push('');
  sections.push('=== END DISCUSSION CARRYOVER ===');
  sections.push('');
  sections.push('--- CURRENT PROMPT ---');
  sections.push('');

  return sections.join('\n');
}

// =============================================================================
// CEO File Context (Batch 7)
// =============================================================================

/**
 * Check if a file should be excluded based on path/name.
 * Returns a rejection reason string, or null if allowed.
 */
export function isFileExcluded(name: string, path: string): string | null {
  // Check binary extensions
  const ext = name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  if (BINARY_EXTENSIONS.includes(ext)) {
    return `Binary file type (${ext}) is not supported`;
  }

  // Check excluded path patterns
  const checkPath = path || name;
  for (const pattern of EXCLUDED_PATH_PATTERNS) {
    if (pattern.test(checkPath)) {
      return `File path matches exclusion pattern: ${pattern.source}`;
    }
  }

  return null; // Allowed
}

/**
 * Truncate file content to fit within per-file size limit.
 * Keeps start and end of file with a truncation marker in between.
 */
export function truncateFileContent(content: string): { content: string; isTruncated: boolean } {
  if (content.length <= MAX_SINGLE_FILE_CHARS) {
    return { content, isTruncated: false };
  }

  const start = content.slice(0, FILE_TRUNCATION_KEEP_START);
  const end = content.slice(-FILE_TRUNCATION_KEEP_END);
  const truncated = `${start}\n\n=== TRUNCATED (original: ${content.length} chars, showing first ${FILE_TRUNCATION_KEEP_START} + last ${FILE_TRUNCATION_KEEP_END}) ===\n\n${end}`;

  return { content: truncated, isTruncated: true };
}

/**
 * Build the CEO file context block for injection into CEO prompts.
 * Returns empty string if no files.
 *
 * Format:
 * === CEO_FILE_CONTEXT_START ===
 * --- FILE: path (size) ---
 * [content]
 * --- END FILE ---
 * === CEO_FILE_CONTEXT_END ===
 */
export function buildCeoFileContext(files: FileEntry[]): string {
  if (!files || files.length === 0) return '';

  const lines: string[] = [
    '=== CEO_FILE_CONTEXT_START ===',
    'Files provided for implementation reference (CEO eyes only):',
    '',
  ];

  for (const file of files) {
    const sizeLabel = file.isTruncated
      ? `${file.content.length} chars, TRUNCATED from ${file.originalSize}`
      : `${file.content.length} chars`;

    lines.push(`--- FILE: ${file.path} (${sizeLabel}) ---`);
    lines.push(file.content);
    lines.push('--- END FILE ---');
    lines.push('');
  }

  lines.push('=== CEO_FILE_CONTEXT_END ===');
  lines.push('');

  return lines.join('\n');
}
