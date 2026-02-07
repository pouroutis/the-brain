// =============================================================================
// The Brain — Advisor Review Parser Tests (Batch 6)
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  parseAdvisorReview,
  buildAdvisorReviewSummary,
  ADVISOR_REVIEW_START_MARKER,
  ADVISOR_REVIEW_END_MARKER,
} from '../utils/advisorReviewParser';
import type { Agent, ParsedAdvisorReview } from '../types/brain';

// -----------------------------------------------------------------------------
// Helper: Build a valid review block
// -----------------------------------------------------------------------------

function buildReviewBlock(fields: {
  decision?: string;
  rationale?: string[];
  requiredChanges?: string[];
  risks?: string[];
  confidence?: string;
}): string {
  const lines: string[] = [ADVISOR_REVIEW_START_MARKER];
  if (fields.decision !== undefined) lines.push(`DECISION: ${fields.decision}`);
  if (fields.rationale) {
    lines.push('RATIONALE:');
    fields.rationale.forEach(r => lines.push(`- ${r}`));
  }
  if (fields.requiredChanges) {
    lines.push('REQUIRED_CHANGES:');
    fields.requiredChanges.forEach(c => lines.push(`- ${c}`));
  }
  if (fields.risks) {
    lines.push('RISKS:');
    fields.risks.forEach(r => lines.push(`- ${r}`));
  }
  if (fields.confidence !== undefined) lines.push(`CONFIDENCE: ${fields.confidence}`);
  lines.push(ADVISOR_REVIEW_END_MARKER);
  return lines.join('\n');
}

// =============================================================================
// parseAdvisorReview
// =============================================================================

describe('parseAdvisorReview', () => {
  it('parses valid APPROVE review', () => {
    const content = buildReviewBlock({
      decision: 'APPROVE',
      rationale: ['Clean architecture', 'All requirements covered'],
      risks: ['None identified'],
      confidence: 'HIGH',
    });
    const result = parseAdvisorReview(content);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.decision).toBe('APPROVE');
    expect(result.confidence).toBe('HIGH');
    expect(result.rationale).toEqual(['Clean architecture', 'All requirements covered']);
    expect(result.risks).toEqual(['None identified']);
    expect(result.requiredChanges).toHaveLength(0);
    expect(result.rawText).toBe(content);
  });

  it('parses valid REVISE review with required changes', () => {
    const content = buildReviewBlock({
      decision: 'REVISE',
      rationale: ['Missing error handling'],
      requiredChanges: ['Add try-catch around API calls', 'Add input validation'],
      risks: ['Unhandled promise rejections'],
      confidence: 'MEDIUM',
    });
    const result = parseAdvisorReview(content);

    expect(result.valid).toBe(true);
    expect(result.decision).toBe('REVISE');
    expect(result.requiredChanges).toEqual(['Add try-catch around API calls', 'Add input validation']);
    expect(result.confidence).toBe('MEDIUM');
  });

  it('parses valid REJECT review', () => {
    const content = buildReviewBlock({
      decision: 'REJECT',
      rationale: ['Fundamentally wrong approach'],
      risks: ['Security vulnerability'],
      confidence: 'HIGH',
    });
    const result = parseAdvisorReview(content);

    expect(result.valid).toBe(true);
    expect(result.decision).toBe('REJECT');
  });

  it('returns invalid when markers are missing', () => {
    const content = 'This is just freeform text with no markers.';
    const result = parseAdvisorReview(content);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing review markers (ADVISOR_REVIEW_START/END)');
    expect(result.rawText).toBe(content);
  });

  it('returns invalid when DECISION is missing', () => {
    const content = buildReviewBlock({
      rationale: ['Good work'],
      confidence: 'HIGH',
    });
    const result = parseAdvisorReview(content);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing DECISION field');
  });

  it('returns invalid when CONFIDENCE is missing', () => {
    const content = buildReviewBlock({
      decision: 'APPROVE',
      rationale: ['Looks good'],
    });
    const result = parseAdvisorReview(content);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing CONFIDENCE field');
  });

  it('returns invalid for bad DECISION value', () => {
    const content = buildReviewBlock({
      decision: 'MAYBE',
      rationale: ['Not sure'],
      confidence: 'LOW',
    });
    const result = parseAdvisorReview(content);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid DECISION value'))).toBe(true);
  });

  it('returns invalid for bad CONFIDENCE value', () => {
    const content = buildReviewBlock({
      decision: 'APPROVE',
      rationale: ['Looks fine'],
      confidence: 'UNSURE',
    });
    const result = parseAdvisorReview(content);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid CONFIDENCE value'))).toBe(true);
  });

  it('returns invalid when REVISE has no REQUIRED_CHANGES', () => {
    const content = buildReviewBlock({
      decision: 'REVISE',
      rationale: ['Needs work'],
      confidence: 'MEDIUM',
    });
    const result = parseAdvisorReview(content);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('REVISE decision requires at least 1 REQUIRED_CHANGES item');
  });

  it('returns invalid when RATIONALE is empty', () => {
    const content = buildReviewBlock({
      decision: 'APPROVE',
      confidence: 'HIGH',
    });
    const result = parseAdvisorReview(content);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('RATIONALE must have at least 1 item');
  });

  it('rawText is always the full original content', () => {
    const content = 'Some preamble.\n\n' + buildReviewBlock({
      decision: 'APPROVE',
      rationale: ['Good'],
      confidence: 'HIGH',
    }) + '\n\nSome epilogue.';
    const result = parseAdvisorReview(content);

    expect(result.rawText).toBe(content);
    expect(result.valid).toBe(true); // Still valid — parser extracts between markers
  });

  it('ignores text outside markers (governance fix #2)', () => {
    const content = 'I think this looks great! Here is my structured review:\n\n' + buildReviewBlock({
      decision: 'APPROVE',
      rationale: ['Meets all requirements'],
      risks: ['None'],
      confidence: 'HIGH',
    }) + '\n\nHope this helps!';
    const result = parseAdvisorReview(content);

    expect(result.valid).toBe(true);
    expect(result.decision).toBe('APPROVE');
  });

  it('handles case-insensitive DECISION values', () => {
    const content = `${ADVISOR_REVIEW_START_MARKER}
DECISION: approve
RATIONALE:
- Looks good
CONFIDENCE: high
${ADVISOR_REVIEW_END_MARKER}`;
    const result = parseAdvisorReview(content);

    expect(result.valid).toBe(true);
    expect(result.decision).toBe('APPROVE');
    expect(result.confidence).toBe('HIGH');
  });
});

// =============================================================================
// buildAdvisorReviewSummary
// =============================================================================

describe('buildAdvisorReviewSummary', () => {
  it('builds summary with all valid reviews', () => {
    const reviews: Partial<Record<Agent, ParsedAdvisorReview>> = {
      claude: {
        valid: true, errors: [], rawText: '', decision: 'APPROVE',
        rationale: ['Clean code'], requiredChanges: [], risks: [], confidence: 'HIGH',
      },
      gemini: {
        valid: true, errors: [], rawText: '', decision: 'REVISE',
        rationale: ['Missing tests'], requiredChanges: ['Add unit tests'], risks: ['Low coverage'], confidence: 'MEDIUM',
      },
    };
    const summary = buildAdvisorReviewSummary(reviews);

    expect(summary).toContain('ADVISOR REVIEWS SUMMARY');
    expect(summary).toContain('Claude (VALID)');
    expect(summary).toContain('DECISION: APPROVE');
    expect(summary).toContain('Gemini (VALID)');
    expect(summary).toContain('DECISION: REVISE');
    expect(summary).toContain('REQUIRED_CHANGES: Add unit tests');
  });

  it('builds summary with invalid review showing RAW_FEEDBACK', () => {
    const reviews: Partial<Record<Agent, ParsedAdvisorReview>> = {
      claude: {
        valid: false, errors: ['Missing review markers (ADVISOR_REVIEW_START/END)'],
        rawText: 'This is freeform feedback without markers.',
        decision: null, rationale: [], requiredChanges: [], risks: [], confidence: null,
      },
    };
    const summary = buildAdvisorReviewSummary(reviews);

    expect(summary).toContain('Claude (INVALID_SCHEMA)');
    expect(summary).toContain('RAW_FEEDBACK: This is freeform feedback');
  });

  it('builds summary with mixed valid and invalid', () => {
    const reviews: Partial<Record<Agent, ParsedAdvisorReview>> = {
      claude: {
        valid: true, errors: [], rawText: '', decision: 'APPROVE',
        rationale: ['Good'], requiredChanges: [], risks: [], confidence: 'HIGH',
      },
      gemini: {
        valid: false, errors: ['Missing DECISION field'],
        rawText: 'Some unstructured feedback here.',
        decision: null, rationale: [], requiredChanges: [], risks: [], confidence: null,
      },
    };
    const summary = buildAdvisorReviewSummary(reviews);

    expect(summary).toContain('Claude (VALID)');
    expect(summary).toContain('Gemini (INVALID_SCHEMA)');
  });

  it('truncates long raw feedback', () => {
    const longText = 'A'.repeat(600);
    const reviews: Partial<Record<Agent, ParsedAdvisorReview>> = {
      claude: {
        valid: false, errors: ['Missing review markers (ADVISOR_REVIEW_START/END)'],
        rawText: longText,
        decision: null, rationale: [], requiredChanges: [], risks: [], confidence: null,
      },
    };
    const summary = buildAdvisorReviewSummary(reviews);

    expect(summary).toContain('...');
    // Should be truncated to ~500 chars + "..."
    expect(summary).not.toContain('A'.repeat(600));
  });

  it('skips agents with no review entry', () => {
    const reviews: Partial<Record<Agent, ParsedAdvisorReview>> = {
      claude: {
        valid: true, errors: [], rawText: '', decision: 'APPROVE',
        rationale: ['Good'], requiredChanges: [], risks: [], confidence: 'HIGH',
      },
    };
    const summary = buildAdvisorReviewSummary(reviews);

    expect(summary).toContain('Claude (VALID)');
    expect(summary).not.toContain('Gemini');
    expect(summary).not.toContain('GPT');
  });
});
