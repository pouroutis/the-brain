// =============================================================================
// The Brain — Execution Review Parser (Batch 11)
// Parses structured execution review verdicts from agent responses.
// Follows same marker-based pattern as advisorReviewParser.ts (Batch 6).
// =============================================================================

// -----------------------------------------------------------------------------
// Types (local to this module — no changes to brain.ts)
// -----------------------------------------------------------------------------

export type ExecutionVerdict = 'ACCEPT' | 'REVISE' | 'FAIL';
export type ReviewConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ParsedExecutionReview {
  /** Whether the response contained valid structured review markers */
  valid: boolean;
  /** Parse errors (empty if valid) */
  errors: string[];
  /** Full raw text of the agent's response */
  rawText: string;
  /** Structured verdict */
  verdict: ExecutionVerdict | null;
  /** Confidence level */
  confidence: ReviewConfidence | null;
  /** Rationale points */
  rationale: string[];
  /** Issues found */
  issues: string[];
  /** Recommended next steps */
  nextSteps: string[];
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const EXECUTION_REVIEW_START_MARKER = '=== EXECUTION_REVIEW_START ===';
export const EXECUTION_REVIEW_END_MARKER = '=== EXECUTION_REVIEW_END ===';

/** Prefix used to identify review prompts in exchanges */
export const REVIEW_PROMPT_PREFIX = '=== EXECUTION REVIEW REQUEST ===';

const VALID_VERDICTS: ExecutionVerdict[] = ['ACCEPT', 'REVISE', 'FAIL'];
const VALID_CONFIDENCES: ReviewConfidence[] = ['HIGH', 'MEDIUM', 'LOW'];

// -----------------------------------------------------------------------------
// Parser Helpers (mirrored from advisorReviewParser.ts)
// -----------------------------------------------------------------------------

function extractBetweenMarkers(content: string, start: string, end: string): string | null {
  const startIdx = content.indexOf(start);
  if (startIdx === -1) return null;
  const contentStart = startIdx + start.length;
  const endIdx = content.indexOf(end, contentStart);
  if (endIdx === -1) return null;
  const extracted = content.slice(contentStart, endIdx).trim();
  return extracted.length > 0 ? extracted : null;
}

function parseSingleValue(lines: string[], label: string): string | null {
  for (const line of lines) {
    const trimmed = line.trim().toUpperCase();
    if (trimmed.startsWith(label)) {
      const value = line.trim().slice(label.length).trim().toUpperCase();
      return value || null;
    }
  }
  return null;
}

function parseSection(lines: string[], sectionLabel: string, allLabels: string[]): string[] {
  const items: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isNewSection = allLabels.some(label => trimmed.toUpperCase().startsWith(label));

    if (trimmed.toUpperCase().startsWith(sectionLabel)) {
      inSection = true;
      const afterLabel = trimmed.slice(sectionLabel.length).trim();
      if (afterLabel && !afterLabel.startsWith('-')) {
        items.push(afterLabel);
      }
      continue;
    }

    if (inSection && isNewSection) break;

    if (inSection && trimmed) {
      const bullet = trimmed.replace(/^[-*]\s*/, '').trim();
      if (bullet) items.push(bullet);
    }
  }

  return items;
}

// -----------------------------------------------------------------------------
// Main Parser
// -----------------------------------------------------------------------------

/**
 * Parse an agent's response for a structured execution review.
 * Extracts content ONLY between EXECUTION_REVIEW_START/END markers.
 * rawText is always set to the full original content for fallback display.
 */
export function parseExecutionReview(content: string): ParsedExecutionReview {
  const result: ParsedExecutionReview = {
    valid: false,
    errors: [],
    rawText: content,
    verdict: null,
    confidence: null,
    rationale: [],
    issues: [],
    nextSteps: [],
  };

  const extracted = extractBetweenMarkers(
    content,
    EXECUTION_REVIEW_START_MARKER,
    EXECUTION_REVIEW_END_MARKER
  );

  if (!extracted) {
    result.errors.push('Missing review markers (EXECUTION_REVIEW_START/END)');
    return result;
  }

  const lines = extracted.split('\n');
  const allLabels = ['VERDICT:', 'CONFIDENCE:', 'RATIONALE:', 'ISSUES:', 'NEXT_STEPS:'];

  // Parse VERDICT
  const verdictValue = parseSingleValue(lines, 'VERDICT:');
  if (!verdictValue) {
    result.errors.push('Missing VERDICT field');
  } else if (!VALID_VERDICTS.includes(verdictValue as ExecutionVerdict)) {
    result.errors.push(`Invalid VERDICT value: '${verdictValue}'. Expected: ACCEPT, REVISE, or FAIL`);
  } else {
    result.verdict = verdictValue as ExecutionVerdict;
  }

  // Parse CONFIDENCE
  const confidenceValue = parseSingleValue(lines, 'CONFIDENCE:');
  if (!confidenceValue) {
    result.errors.push('Missing CONFIDENCE field');
  } else if (!VALID_CONFIDENCES.includes(confidenceValue as ReviewConfidence)) {
    result.errors.push(`Invalid CONFIDENCE value: '${confidenceValue}'. Expected: HIGH, MEDIUM, or LOW`);
  } else {
    result.confidence = confidenceValue as ReviewConfidence;
  }

  // Parse RATIONALE
  result.rationale = parseSection(lines, 'RATIONALE:', allLabels);
  if (result.rationale.length === 0) {
    result.errors.push('RATIONALE must have at least 1 item');
  }

  // Parse ISSUES
  result.issues = parseSection(lines, 'ISSUES:', allLabels);

  // Parse NEXT_STEPS
  result.nextSteps = parseSection(lines, 'NEXT_STEPS:', allLabels);

  // Set valid if no errors
  result.valid = result.errors.length === 0;

  return result;
}

// -----------------------------------------------------------------------------
// Review Prompt Builder
// -----------------------------------------------------------------------------

/**
 * Build the review prompt sent to agents. Includes original prompt + results.
 */
export function buildReviewPrompt(claudeCodePrompt: string, executionResults: string): string {
  return `${REVIEW_PROMPT_PREFIX}

You are reviewing execution results for a Claude Code implementation task.
Provide a structured review of whether the execution was successful.

ORIGINAL CLAUDE CODE PROMPT:
---
${claudeCodePrompt}
---

EXECUTION RESULTS:
---
${executionResults}
---

Respond with EXACTLY this format:

=== EXECUTION_REVIEW_START ===
VERDICT: ACCEPT or REVISE or FAIL
CONFIDENCE: HIGH or MEDIUM or LOW
RATIONALE:
- [assessment point 1]
- [assessment point 2]
ISSUES:
- [issue found, or "None"]
NEXT_STEPS:
- [recommended action]
=== EXECUTION_REVIEW_END ===`;
}
