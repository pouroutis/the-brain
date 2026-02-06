// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// CEO Control Block Parser (Decision Mode)
// =============================================================================

import type { CeoPromptArtifact } from '../types/brain';

// -----------------------------------------------------------------------------
// Constants — Hard Delimiters
// -----------------------------------------------------------------------------

/**
 * Hard delimiters for Claude Code prompt extraction.
 * CEO MUST wrap prompts exactly like this:
 *
 * === CLAUDE_CODE_PROMPT_START ===
 * (prompt text)
 * === CLAUDE_CODE_PROMPT_END ===
 */
export const PROMPT_START_MARKER = '=== CLAUDE_CODE_PROMPT_START ===';
export const PROMPT_END_MARKER = '=== CLAUDE_CODE_PROMPT_END ===';

/**
 * Hard delimiters for BLOCKED state (clarification).
 * CEO wraps questions like this:
 *
 * === CEO_BLOCKED_START ===
 * Q1: Question one?
 * Q2: Question two?
 * === CEO_BLOCKED_END ===
 */
export const BLOCKED_START_MARKER = '=== CEO_BLOCKED_START ===';
export const BLOCKED_END_MARKER = '=== CEO_BLOCKED_END ===';

/**
 * Hard delimiters for DRAFT state (Round 1 only — CEO requests advisor review).
 *
 * === CEO_DRAFT_START ===
 * (draft prompt text)
 * === CEO_DRAFT_END ===
 */
export const DRAFT_START_MARKER = '=== CEO_DRAFT_START ===';
export const DRAFT_END_MARKER = '=== CEO_DRAFT_END ===';

/**
 * Hard delimiter for STOP_NOW (CEO aborts the process).
 * Single-line marker, no start/end pair.
 *
 * === STOP_NOW ===
 */
export const STOP_NOW_MARKER = '=== STOP_NOW ===';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Result of parsing CEO content for control blocks.
 */
export interface ParsedCeoResponse {
  /** Whether a Claude Code prompt was found (between markers) */
  hasPromptArtifact: boolean;
  /** The extracted prompt text (if found) */
  promptText: string | null;
  /** The content with markers removed (for display) */
  displayContent: string;
  /** Whether a BLOCKED state was found (between markers) */
  isBlocked: boolean;
  /** Questions from BLOCKED state (max 3) */
  blockedQuestions: string[];
  /** Whether a CEO DRAFT was found (between markers) — Batch 5 */
  hasDraftArtifact: boolean;
  /** The extracted draft text (if found) — Batch 5 */
  draftText: string | null;
  /** Whether STOP_NOW was detected — Batch 5 */
  isStopped: boolean;
}

// -----------------------------------------------------------------------------
// Parser
// -----------------------------------------------------------------------------

/**
 * Extract content between two markers.
 * Returns null if markers not found or invalid.
 */
function extractBetweenMarkers(
  content: string,
  startMarker: string,
  endMarker: string
): string | null {
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) return null;

  const contentStart = startIdx + startMarker.length;
  const endIdx = content.indexOf(endMarker, contentStart);
  if (endIdx === -1) return null;

  const extracted = content.slice(contentStart, endIdx).trim();
  return extracted.length > 0 ? extracted : null;
}

/**
 * Remove marker block from content for display.
 */
function removeMarkerBlock(
  content: string,
  startMarker: string,
  endMarker: string
): string {
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) return content;

  const endIdx = content.indexOf(endMarker, startIdx);
  if (endIdx === -1) return content;

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + endMarker.length);
  return (before + after).trim();
}

/**
 * Parse BLOCKED questions from content.
 * Format: Lines starting with Q1:, Q2:, Q3: or numbered lines.
 */
function parseBlockedQuestions(content: string): string[] {
  const questions: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match Q1:, Q2:, Q3: format
    const qMatch = trimmed.match(/^Q\d+:\s*(.+)/i);
    if (qMatch) {
      questions.push(qMatch[1].trim());
      continue;
    }

    // Match numbered format: 1. Question?
    const numMatch = trimmed.match(/^\d+\.\s*(.+)/);
    if (numMatch) {
      questions.push(numMatch[1].trim());
      continue;
    }

    // Match bullet format: - Question?
    const bulletMatch = trimmed.match(/^[-*]\s*(.+)/);
    if (bulletMatch) {
      questions.push(bulletMatch[1].trim());
      continue;
    }

    // Plain line that looks like a question
    if (trimmed.endsWith('?')) {
      questions.push(trimmed);
    }
  }

  // Limit to max 3 questions
  return questions.slice(0, 3);
}

/**
 * Parse CEO response content for control blocks.
 * Uses HARD DELIMITERS for deterministic extraction.
 *
 * Precedence: FINAL > STOP_NOW > DRAFT > BLOCKED (governance-locked)
 */
export function parseCeoControlBlock(content: string): ParsedCeoResponse {
  const result: ParsedCeoResponse = {
    hasPromptArtifact: false,
    promptText: null,
    displayContent: content,
    isBlocked: false,
    blockedQuestions: [],
    hasDraftArtifact: false,
    draftText: null,
    isStopped: false,
  };

  // -------------------------------------------------------------------------
  // Precedence: FINAL > STOP_NOW > DRAFT > BLOCKED (governance-locked)
  // -------------------------------------------------------------------------

  // 1. Check for FINAL (Claude Code prompt markers) — highest precedence
  const promptText = extractBetweenMarkers(
    content,
    PROMPT_START_MARKER,
    PROMPT_END_MARKER
  );

  if (promptText) {
    result.hasPromptArtifact = true;
    result.promptText = promptText;
    result.displayContent = removeMarkerBlock(
      content,
      PROMPT_START_MARKER,
      PROMPT_END_MARKER
    );
    return result;
  }

  // 2. Check for STOP_NOW
  if (content.includes(STOP_NOW_MARKER)) {
    result.isStopped = true;
    result.displayContent = content.replace(STOP_NOW_MARKER, '').trim();
    return result;
  }

  // 3. Check for DRAFT markers
  const draftText = extractBetweenMarkers(
    content,
    DRAFT_START_MARKER,
    DRAFT_END_MARKER
  );

  if (draftText) {
    result.hasDraftArtifact = true;
    result.draftText = draftText;
    result.displayContent = removeMarkerBlock(
      content,
      DRAFT_START_MARKER,
      DRAFT_END_MARKER
    );
    return result;
  }

  // 4. Check for BLOCKED markers — lowest precedence
  const blockedText = extractBetweenMarkers(
    content,
    BLOCKED_START_MARKER,
    BLOCKED_END_MARKER
  );

  if (blockedText) {
    result.isBlocked = true;
    result.blockedQuestions = parseBlockedQuestions(blockedText);
    result.displayContent = removeMarkerBlock(
      content,
      BLOCKED_START_MARKER,
      BLOCKED_END_MARKER
    );
  }

  return result;
}

/**
 * Create a new CeoPromptArtifact with incremented version.
 */
export function createCeoPromptArtifact(
  promptText: string,
  existingArtifact: CeoPromptArtifact | null
): CeoPromptArtifact {
  return {
    text: promptText,
    version: existingArtifact ? existingArtifact.version + 1 : 1,
    createdAt: new Date().toISOString(),
  };
}
