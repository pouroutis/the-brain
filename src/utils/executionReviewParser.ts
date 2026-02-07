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
// CEO Synthesis Types (Batch 12 — Verdict Gate)
// -----------------------------------------------------------------------------

export interface ParsedCeoSynthesis {
  /** Whether the response contained valid structured verdict markers */
  valid: boolean;
  /** Parse errors (empty if valid) */
  errors: string[];
  /** Full raw text of the CEO's response */
  rawText: string;
  /** CEO's authoritative verdict */
  verdict: ExecutionVerdict | null;
  /** CEO's rationale points */
  rationale: string[];
  /** Recommended next action (e.g., "Add retry logic to auth.ts") */
  nextAction: string | null;
}

export interface VerdictResolution {
  /** Whether the verdict has been resolved (auto or via CEO synthesis) */
  resolved: boolean;
  /** The final verdict */
  verdict: ExecutionVerdict | null;
  /** How the verdict was determined */
  source: 'consensus' | 'ceo_review' | 'ceo_synthesis' | null;
  /** Which agent is/was CEO */
  ceoAgent: string;
  /** Rationale text for display (consensus description or CEO rationale) */
  rationale: string | null;
  /** Next action recommendation (from CEO synthesis, null for consensus) */
  nextAction: string | null;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const EXECUTION_REVIEW_START_MARKER = '=== EXECUTION_REVIEW_START ===';
export const EXECUTION_REVIEW_END_MARKER = '=== EXECUTION_REVIEW_END ===';

/** Prefix used to identify review prompts in exchanges */
export const REVIEW_PROMPT_PREFIX = '=== EXECUTION REVIEW REQUEST ===';

export const CEO_VERDICT_START_MARKER = '=== CEO_VERDICT_START ===';
export const CEO_VERDICT_END_MARKER = '=== CEO_VERDICT_END ===';

/** Prefix used to identify synthesis prompts in exchanges */
export const SYNTHESIS_PROMPT_PREFIX = '=== CEO VERDICT REQUEST ===';

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

// -----------------------------------------------------------------------------
// CEO Synthesis Parser (Batch 12)
// -----------------------------------------------------------------------------

/**
 * Parse the CEO's synthesis response for a structured verdict.
 * Extracts content ONLY between CEO_VERDICT_START/END markers.
 */
export function parseCeoSynthesis(content: string): ParsedCeoSynthesis {
  const result: ParsedCeoSynthesis = {
    valid: false,
    errors: [],
    rawText: content,
    verdict: null,
    rationale: [],
    nextAction: null,
  };

  const extracted = extractBetweenMarkers(
    content,
    CEO_VERDICT_START_MARKER,
    CEO_VERDICT_END_MARKER
  );

  if (!extracted) {
    result.errors.push('Missing verdict markers (CEO_VERDICT_START/END)');
    return result;
  }

  const lines = extracted.split('\n');
  const allLabels = ['VERDICT:', 'RATIONALE:', 'NEXT_ACTION:'];

  // Parse VERDICT
  const verdictValue = parseSingleValue(lines, 'VERDICT:');
  if (!verdictValue) {
    result.errors.push('Missing VERDICT field');
  } else if (!VALID_VERDICTS.includes(verdictValue as ExecutionVerdict)) {
    result.errors.push(`Invalid VERDICT value: '${verdictValue}'. Expected: ACCEPT, REVISE, or FAIL`);
  } else {
    result.verdict = verdictValue as ExecutionVerdict;
  }

  // Parse RATIONALE
  result.rationale = parseSection(lines, 'RATIONALE:', allLabels);
  if (result.rationale.length === 0) {
    result.errors.push('RATIONALE must have at least 1 item');
  }

  // Parse NEXT_ACTION (single value, not a list)
  const nextActionItems = parseSection(lines, 'NEXT_ACTION:', allLabels);
  result.nextAction = nextActionItems.length > 0 ? nextActionItems.join('; ') : null;

  result.valid = result.errors.length === 0;
  return result;
}

// -----------------------------------------------------------------------------
// Verdict Resolution (Batch 12 — Tier 1: Deterministic Consensus)
// -----------------------------------------------------------------------------

/**
 * Determine verdict resolution from advisor review verdicts.
 * Tier 1: Auto-resolves on consensus. Returns resolved=false if disagreement.
 *
 * @param reviewVerdicts - Parsed reviews from all agents (Batch 11)
 * @param ceoAgent - Current CEO agent identifier
 */
export function computeVerdictResolution(
  reviewVerdicts: Partial<Record<string, ParsedExecutionReview>>,
  ceoAgent: string
): VerdictResolution {
  const base: VerdictResolution = {
    resolved: false,
    verdict: null,
    source: null,
    ceoAgent,
    rationale: null,
    nextAction: null,
  };

  // Collect valid verdicts
  const validEntries: Array<{ agent: string; verdict: ExecutionVerdict }> = [];
  for (const [agent, review] of Object.entries(reviewVerdicts)) {
    if (review && review.valid && review.verdict) {
      validEntries.push({ agent, verdict: review.verdict });
    }
  }

  // 0 valid verdicts → unresolved
  if (validEntries.length === 0) {
    return base;
  }

  // Check if all valid verdicts agree
  const uniqueVerdicts = new Set(validEntries.map(e => e.verdict));

  if (uniqueVerdicts.size === 1) {
    // Consensus — all agree
    const verdict = validEntries[0].verdict;
    const ceoEntry = validEntries.find(e => e.agent === ceoAgent);
    const source = ceoEntry ? 'ceo_review' as const : 'consensus' as const;

    return {
      resolved: true,
      verdict,
      source,
      ceoAgent,
      rationale: validEntries.length === 1
        ? `${validEntries[0].agent.toUpperCase()} verdict (only valid review)`
        : `All ${validEntries.length} reviewers agree: ${verdict}`,
      nextAction: null,
    };
  }

  // Verdicts disagree → unresolved, needs Tier 2
  return base;
}

// -----------------------------------------------------------------------------
// CEO Synthesis Prompt Builder (Batch 12 — Tier 2)
// -----------------------------------------------------------------------------

/**
 * Build the CEO synthesis prompt for Tier 2 verdict resolution.
 * Includes all agent verdicts for CEO to synthesize.
 */
export function buildSynthesisPrompt(
  reviewVerdicts: Partial<Record<string, ParsedExecutionReview>>,
  ceoAgent: string
): string {
  const AGENT_LABELS: Record<string, string> = {
    gpt: 'GPT',
    claude: 'Claude',
    gemini: 'Gemini',
  };

  let verdictSummary = '';
  const agents = ['gpt', 'claude', 'gemini'];

  for (const agent of agents) {
    const review = reviewVerdicts[agent];
    if (!review) continue;

    const label = AGENT_LABELS[agent] ?? agent;

    if (review.valid && review.verdict) {
      verdictSummary += `${label}: ${review.verdict} (${review.confidence ?? 'unknown'} confidence)\n`;
      if (review.rationale.length > 0) {
        verdictSummary += `  Rationale: ${review.rationale.join('; ')}\n`;
      }
      if (review.issues.length > 0) {
        verdictSummary += `  Issues: ${review.issues.join('; ')}\n`;
      }
    } else {
      verdictSummary += `${label}: INVALID REVIEW (could not parse structured response)\n`;
    }
  }

  return `${SYNTHESIS_PROMPT_PREFIX}

You are the CEO (${AGENT_LABELS[ceoAgent] ?? ceoAgent}). The AI team has reviewed execution results but their verdicts DISAGREE or could not be parsed.
You must make the FINAL authoritative call.

ADVISOR VERDICTS:
---
${verdictSummary.trim()}
---

Your task: Synthesize these into ONE authoritative verdict.

Respond with EXACTLY this format:

=== CEO_VERDICT_START ===
VERDICT: ACCEPT or REVISE or FAIL
RATIONALE:
- [your reasoning point 1]
- [your reasoning point 2]
NEXT_ACTION: [specific next step — "None" for ACCEPT, or a concrete action for REVISE/FAIL]
=== CEO_VERDICT_END ===`;
}
