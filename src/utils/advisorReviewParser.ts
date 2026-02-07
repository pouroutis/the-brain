// =============================================================================
// The Brain — Advisor Review Parser (Batch 6)
// Parses structured Round 2 advisor reviews.
// Phase 6A: Soft fallback — invalid reviews pass through with rawText.
// =============================================================================

import type { Agent, AdvisorDecision, AdvisorConfidence, ParsedAdvisorReview } from '../types/brain';

// -----------------------------------------------------------------------------
// Constants — Hard Delimiters
// -----------------------------------------------------------------------------

export const ADVISOR_REVIEW_START_MARKER = '=== ADVISOR_REVIEW_START ===';
export const ADVISOR_REVIEW_END_MARKER = '=== ADVISOR_REVIEW_END ===';

// Valid values
const VALID_DECISIONS: AdvisorDecision[] = ['APPROVE', 'REVISE', 'REJECT'];
const VALID_CONFIDENCES: AdvisorConfidence[] = ['HIGH', 'MEDIUM', 'LOW'];

// -----------------------------------------------------------------------------
// Parser Helpers
// -----------------------------------------------------------------------------

/**
 * Extract content between markers. Returns null if markers not found.
 * Parser is marker-extract only — ignores text outside markers.
 */
function extractBetweenMarkers(content: string, start: string, end: string): string | null {
  const startIdx = content.indexOf(start);
  if (startIdx === -1) return null;

  const contentStart = startIdx + start.length;
  const endIdx = content.indexOf(end, contentStart);
  if (endIdx === -1) return null;

  const extracted = content.slice(contentStart, endIdx).trim();
  return extracted.length > 0 ? extracted : null;
}

/**
 * Parse a labeled section (e.g., "RATIONALE:") and collect bullet lines.
 * Returns all lines between the label and the next known label or end.
 */
function parseSection(lines: string[], sectionLabel: string, allLabels: string[]): string[] {
  const items: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this line starts a new section
    const isNewSection = allLabels.some(label => trimmed.toUpperCase().startsWith(label));

    if (trimmed.toUpperCase().startsWith(sectionLabel)) {
      inSection = true;
      // Check if value is on the same line as label (e.g., "DECISION: APPROVE")
      const afterLabel = trimmed.slice(sectionLabel.length).trim();
      if (afterLabel && !afterLabel.startsWith('-')) {
        items.push(afterLabel);
      }
      continue;
    }

    if (inSection && isNewSection) {
      break; // Hit next section
    }

    if (inSection && trimmed) {
      // Strip bullet prefix
      const bullet = trimmed.replace(/^[-*]\s*/, '').trim();
      if (bullet) {
        items.push(bullet);
      }
    }
  }

  return items;
}

/**
 * Parse a single-value field (e.g., "DECISION: APPROVE").
 */
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

// -----------------------------------------------------------------------------
// Main Parser
// -----------------------------------------------------------------------------

/**
 * Parse an advisor's Round 2 response for structured review content.
 *
 * Extracts content ONLY between ADVISOR_REVIEW_START/END markers.
 * Text outside markers is ignored (governance fix #2).
 * rawText is always set to the full original content.
 *
 * @param content - Full advisor response text
 * @returns ParsedAdvisorReview with valid=true if schema passes, valid=false otherwise
 */
export function parseAdvisorReview(content: string): ParsedAdvisorReview {
  const result: ParsedAdvisorReview = {
    valid: false,
    errors: [],
    rawText: content,
    decision: null,
    rationale: [],
    requiredChanges: [],
    risks: [],
    confidence: null,
  };

  // Extract between markers (ignore everything outside)
  const extracted = extractBetweenMarkers(
    content,
    ADVISOR_REVIEW_START_MARKER,
    ADVISOR_REVIEW_END_MARKER
  );

  if (!extracted) {
    result.errors.push('Missing review markers (ADVISOR_REVIEW_START/END)');
    return result;
  }

  const lines = extracted.split('\n');
  const allLabels = ['DECISION:', 'RATIONALE:', 'REQUIRED_CHANGES:', 'RISKS:', 'CONFIDENCE:'];

  // Parse DECISION
  const decisionValue = parseSingleValue(lines, 'DECISION:');
  if (!decisionValue) {
    result.errors.push('Missing DECISION field');
  } else if (!VALID_DECISIONS.includes(decisionValue as AdvisorDecision)) {
    result.errors.push(`Invalid DECISION value: '${decisionValue}'. Expected: APPROVE, REVISE, or REJECT`);
  } else {
    result.decision = decisionValue as AdvisorDecision;
  }

  // Parse CONFIDENCE
  const confidenceValue = parseSingleValue(lines, 'CONFIDENCE:');
  if (!confidenceValue) {
    result.errors.push('Missing CONFIDENCE field');
  } else if (!VALID_CONFIDENCES.includes(confidenceValue as AdvisorConfidence)) {
    result.errors.push(`Invalid CONFIDENCE value: '${confidenceValue}'. Expected: HIGH, MEDIUM, or LOW`);
  } else {
    result.confidence = confidenceValue as AdvisorConfidence;
  }

  // Parse RATIONALE
  result.rationale = parseSection(lines, 'RATIONALE:', allLabels);
  if (result.rationale.length === 0) {
    result.errors.push('RATIONALE must have at least 1 item');
  }

  // Parse REQUIRED_CHANGES
  result.requiredChanges = parseSection(lines, 'REQUIRED_CHANGES:', allLabels);

  // Parse RISKS
  result.risks = parseSection(lines, 'RISKS:', allLabels);

  // Validation: REVISE must have REQUIRED_CHANGES
  if (result.decision === 'REVISE' && result.requiredChanges.length === 0) {
    result.errors.push('REVISE decision requires at least 1 REQUIRED_CHANGES item');
  }

  // Set valid if no errors
  result.valid = result.errors.length === 0;

  return result;
}

// -----------------------------------------------------------------------------
// Summary Builder
// -----------------------------------------------------------------------------

/** Max characters of raw text to include for invalid advisors */
const MAX_RAW_FEEDBACK_CHARS = 500;

/**
 * Build a deterministic text summary of advisor reviews for CEO consumption.
 * Valid reviews show structured fields. Invalid reviews show truncated raw text.
 */
export function buildAdvisorReviewSummary(
  reviews: Partial<Record<Agent, ParsedAdvisorReview>>
): string {
  const agentLabels: Record<Agent, string> = {
    gpt: 'GPT',
    claude: 'Claude',
    gemini: 'Gemini',
  };

  const lines: string[] = ['=== ADVISOR REVIEWS SUMMARY ===', ''];

  const agents: Agent[] = ['gpt', 'claude', 'gemini'];

  for (const agent of agents) {
    const review = reviews[agent];
    if (!review) continue;

    if (review.valid) {
      lines.push(`${agentLabels[agent]} (VALID):`);
      lines.push(`  DECISION: ${review.decision}`);
      lines.push(`  CONFIDENCE: ${review.confidence}`);
      lines.push(`  RATIONALE: ${review.rationale.join('; ')}`);
      if (review.requiredChanges.length > 0) {
        lines.push(`  REQUIRED_CHANGES: ${review.requiredChanges.join('; ')}`);
      }
      if (review.risks.length > 0) {
        lines.push(`  RISKS: ${review.risks.join('; ')}`);
      } else {
        lines.push(`  RISKS: None identified`);
      }
    } else {
      lines.push(`${agentLabels[agent]} (INVALID_SCHEMA):`);
      lines.push(`  ERRORS: ${review.errors.join('; ')}`);
      const truncated = review.rawText.length > MAX_RAW_FEEDBACK_CHARS
        ? review.rawText.slice(0, MAX_RAW_FEEDBACK_CHARS) + '...'
        : review.rawText;
      lines.push(`  RAW_FEEDBACK: ${truncated}`);
    }

    lines.push('');
  }

  lines.push('=== END ADVISOR REVIEWS SUMMARY ===');
  return lines.join('\n');
}
