// =============================================================================
// The Brain — Execution Review Parser Tests (Batch 11)
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  parseExecutionReview,
  buildReviewPrompt,
  EXECUTION_REVIEW_START_MARKER,
  EXECUTION_REVIEW_END_MARKER,
  REVIEW_PROMPT_PREFIX,
  parseCeoSynthesis,
  computeVerdictResolution,
  buildSynthesisPrompt,
  CEO_VERDICT_START_MARKER,
  CEO_VERDICT_END_MARKER,
  SYNTHESIS_PROMPT_PREFIX,
} from '../utils/executionReviewParser';
import type { ParsedExecutionReview } from '../utils/executionReviewParser';

// =============================================================================
// parseExecutionReview
// =============================================================================

describe('parseExecutionReview', () => {
  it('parses valid ACCEPT review', () => {
    const content = `Some preamble text
${EXECUTION_REVIEW_START_MARKER}
VERDICT: ACCEPT
CONFIDENCE: HIGH
RATIONALE:
- All tests pass
- Implementation matches spec
ISSUES:
- None
NEXT_STEPS:
- Deploy to production
${EXECUTION_REVIEW_END_MARKER}
Some trailing text`;

    const result = parseExecutionReview(content);
    expect(result.valid).toBe(true);
    expect(result.verdict).toBe('ACCEPT');
    expect(result.confidence).toBe('HIGH');
    expect(result.rationale).toContain('All tests pass');
    expect(result.rationale).toContain('Implementation matches spec');
    expect(result.issues).toContain('None');
    expect(result.nextSteps).toContain('Deploy to production');
    expect(result.errors).toHaveLength(0);
  });

  it('parses valid REVISE review with issues', () => {
    const content = `${EXECUTION_REVIEW_START_MARKER}
VERDICT: REVISE
CONFIDENCE: MEDIUM
RATIONALE:
- Most features work
- Some edge cases missing
ISSUES:
- Error handling incomplete
- No retry logic
NEXT_STEPS:
- Add error boundaries
- Implement retry mechanism
${EXECUTION_REVIEW_END_MARKER}`;

    const result = parseExecutionReview(content);
    expect(result.valid).toBe(true);
    expect(result.verdict).toBe('REVISE');
    expect(result.confidence).toBe('MEDIUM');
    expect(result.issues).toHaveLength(2);
    expect(result.issues).toContain('Error handling incomplete');
    expect(result.nextSteps).toHaveLength(2);
  });

  it('parses valid FAIL review', () => {
    const content = `${EXECUTION_REVIEW_START_MARKER}
VERDICT: FAIL
CONFIDENCE: HIGH
RATIONALE:
- Build fails with TypeScript errors
ISSUES:
- 15 type errors in reducer
NEXT_STEPS:
- Fix type errors before re-executing
${EXECUTION_REVIEW_END_MARKER}`;

    const result = parseExecutionReview(content);
    expect(result.valid).toBe(true);
    expect(result.verdict).toBe('FAIL');
    expect(result.confidence).toBe('HIGH');
  });

  it('returns invalid when markers are missing', () => {
    const content = 'Just some plain text without any markers';
    const result = parseExecutionReview(content);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing review markers (EXECUTION_REVIEW_START/END)');
    expect(result.rawText).toBe(content);
  });

  it('returns invalid when VERDICT field is missing', () => {
    const content = `${EXECUTION_REVIEW_START_MARKER}
CONFIDENCE: HIGH
RATIONALE:
- Looks good
${EXECUTION_REVIEW_END_MARKER}`;

    const result = parseExecutionReview(content);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing VERDICT field');
  });

  it('returns invalid for unknown verdict value', () => {
    const content = `${EXECUTION_REVIEW_START_MARKER}
VERDICT: MAYBE
CONFIDENCE: HIGH
RATIONALE:
- Unsure
${EXECUTION_REVIEW_END_MARKER}`;

    const result = parseExecutionReview(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid VERDICT value');
  });

  it('returns invalid when CONFIDENCE is missing', () => {
    const content = `${EXECUTION_REVIEW_START_MARKER}
VERDICT: ACCEPT
RATIONALE:
- Good
${EXECUTION_REVIEW_END_MARKER}`;

    const result = parseExecutionReview(content);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing CONFIDENCE field');
  });

  it('returns invalid when RATIONALE is empty', () => {
    const content = `${EXECUTION_REVIEW_START_MARKER}
VERDICT: ACCEPT
CONFIDENCE: HIGH
RATIONALE:
ISSUES:
- None
${EXECUTION_REVIEW_END_MARKER}`;

    const result = parseExecutionReview(content);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('RATIONALE must have at least 1 item');
  });

  it('preserves rawText for fallback display', () => {
    const content = 'Some unstructured agent response without markers';
    const result = parseExecutionReview(content);
    expect(result.rawText).toBe(content);
  });

  it('handles empty content between markers', () => {
    const content = `${EXECUTION_REVIEW_START_MARKER}
${EXECUTION_REVIEW_END_MARKER}`;

    const result = parseExecutionReview(content);
    expect(result.valid).toBe(false);
  });

  it('ignores text outside markers', () => {
    const content = `VERDICT: FAIL
This text is outside markers and should be ignored.
${EXECUTION_REVIEW_START_MARKER}
VERDICT: ACCEPT
CONFIDENCE: HIGH
RATIONALE:
- All good
${EXECUTION_REVIEW_END_MARKER}
VERDICT: FAIL again outside`;

    const result = parseExecutionReview(content);
    expect(result.verdict).toBe('ACCEPT');
  });
});

// =============================================================================
// buildReviewPrompt
// =============================================================================

describe('buildReviewPrompt', () => {
  it('includes review prefix', () => {
    const prompt = buildReviewPrompt('Do the thing', 'It was done');
    expect(prompt.startsWith(REVIEW_PROMPT_PREFIX)).toBe(true);
  });

  it('includes original prompt', () => {
    const prompt = buildReviewPrompt('# Step 1: Build auth', 'Commit abc123');
    expect(prompt).toContain('# Step 1: Build auth');
  });

  it('includes execution results', () => {
    const prompt = buildReviewPrompt('Build it', '510 tests pass, 0 failures');
    expect(prompt).toContain('510 tests pass, 0 failures');
  });

  it('includes marker format instructions', () => {
    const prompt = buildReviewPrompt('Build it', 'Done');
    expect(prompt).toContain('EXECUTION_REVIEW_START');
    expect(prompt).toContain('VERDICT:');
    expect(prompt).toContain('CONFIDENCE:');
    expect(prompt).toContain('RATIONALE:');
  });
});

// =============================================================================
// parseCeoSynthesis (Batch 12)
// =============================================================================

describe('parseCeoSynthesis', () => {
  it('parses valid ACCEPT synthesis', () => {
    const content = `${CEO_VERDICT_START_MARKER}
VERDICT: ACCEPT
RATIONALE:
- All reviews agree on core quality
- Minor issues are cosmetic
NEXT_ACTION: None
${CEO_VERDICT_END_MARKER}`;

    const result = parseCeoSynthesis(content);
    expect(result.valid).toBe(true);
    expect(result.verdict).toBe('ACCEPT');
    expect(result.rationale).toHaveLength(2);
    expect(result.nextAction).toBe('None');
  });

  it('parses valid REVISE synthesis with action', () => {
    const content = `${CEO_VERDICT_START_MARKER}
VERDICT: REVISE
RATIONALE:
- Claude identified real missing error handling
NEXT_ACTION: Add retry logic to auth.ts network calls
${CEO_VERDICT_END_MARKER}`;

    const result = parseCeoSynthesis(content);
    expect(result.valid).toBe(true);
    expect(result.verdict).toBe('REVISE');
    expect(result.nextAction).toBe('Add retry logic to auth.ts network calls');
  });

  it('returns invalid when markers missing', () => {
    const result = parseCeoSynthesis('Just CEO rambling without markers');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing verdict markers (CEO_VERDICT_START/END)');
  });

  it('returns invalid when VERDICT missing', () => {
    const content = `${CEO_VERDICT_START_MARKER}
RATIONALE:
- Some reasoning
${CEO_VERDICT_END_MARKER}`;

    const result = parseCeoSynthesis(content);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing VERDICT field');
  });

  it('returns invalid for unknown verdict', () => {
    const content = `${CEO_VERDICT_START_MARKER}
VERDICT: MAYBE
RATIONALE:
- Unsure
${CEO_VERDICT_END_MARKER}`;

    const result = parseCeoSynthesis(content);
    expect(result.valid).toBe(false);
  });

  it('returns invalid when rationale empty', () => {
    const content = `${CEO_VERDICT_START_MARKER}
VERDICT: ACCEPT
RATIONALE:
NEXT_ACTION: None
${CEO_VERDICT_END_MARKER}`;

    const result = parseCeoSynthesis(content);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('RATIONALE must have at least 1 item');
  });
});

// =============================================================================
// computeVerdictResolution (Batch 12)
// =============================================================================

describe('computeVerdictResolution', () => {
  const makeReview = (verdict: 'ACCEPT' | 'REVISE' | 'FAIL', valid = true): ParsedExecutionReview => ({
    valid,
    errors: valid ? [] : ['parse error'],
    rawText: 'raw',
    verdict: valid ? verdict : null,
    confidence: 'HIGH',
    rationale: ['reason'],
    issues: [],
    nextSteps: [],
  });

  it('resolves consensus when all agree ACCEPT', () => {
    const verdicts = {
      gpt: makeReview('ACCEPT'),
      claude: makeReview('ACCEPT'),
      gemini: makeReview('ACCEPT'),
    };
    const result = computeVerdictResolution(verdicts, 'gpt');
    expect(result.resolved).toBe(true);
    expect(result.verdict).toBe('ACCEPT');
    expect(result.source).toBe('ceo_review');
  });

  it('resolves consensus when all agree REVISE', () => {
    const verdicts = {
      gpt: makeReview('REVISE'),
      claude: makeReview('REVISE'),
      gemini: makeReview('REVISE'),
    };
    const result = computeVerdictResolution(verdicts, 'gpt');
    expect(result.resolved).toBe(true);
    expect(result.verdict).toBe('REVISE');
  });

  it('does NOT resolve when verdicts disagree', () => {
    const verdicts = {
      gpt: makeReview('ACCEPT'),
      claude: makeReview('REVISE'),
      gemini: makeReview('ACCEPT'),
    };
    const result = computeVerdictResolution(verdicts, 'gpt');
    expect(result.resolved).toBe(false);
  });

  it('does NOT resolve when 0 valid verdicts', () => {
    const verdicts = {
      gpt: makeReview('ACCEPT', false),
      claude: makeReview('ACCEPT', false),
    };
    const result = computeVerdictResolution(verdicts, 'gpt');
    expect(result.resolved).toBe(false);
  });

  it('resolves when only CEO verdict is valid', () => {
    const verdicts = {
      gpt: makeReview('REVISE'),
      claude: makeReview('ACCEPT', false),
      gemini: makeReview('ACCEPT', false),
    };
    const result = computeVerdictResolution(verdicts, 'gpt');
    expect(result.resolved).toBe(true);
    expect(result.verdict).toBe('REVISE');
    expect(result.source).toBe('ceo_review');
  });

  it('resolves when only 1 non-CEO valid and agrees with itself', () => {
    const verdicts = {
      gpt: makeReview('ACCEPT', false),
      claude: makeReview('FAIL'),
    };
    const result = computeVerdictResolution(verdicts, 'gpt');
    expect(result.resolved).toBe(true);
    expect(result.verdict).toBe('FAIL');
    expect(result.source).toBe('consensus');
  });

  it('uses ceo_review source when CEO is among the valid agreeing verdicts', () => {
    const verdicts = {
      gpt: makeReview('ACCEPT'),
      claude: makeReview('ACCEPT'),
    };
    const result = computeVerdictResolution(verdicts, 'gpt');
    expect(result.source).toBe('ceo_review');
  });

  it('uses consensus source when CEO has no valid verdict', () => {
    const verdicts = {
      gpt: makeReview('ACCEPT', false),
      claude: makeReview('ACCEPT'),
      gemini: makeReview('ACCEPT'),
    };
    const result = computeVerdictResolution(verdicts, 'gpt');
    expect(result.source).toBe('consensus');
  });

  it('handles empty verdicts object', () => {
    const result = computeVerdictResolution({}, 'gpt');
    expect(result.resolved).toBe(false);
  });
});

// =============================================================================
// buildSynthesisPrompt (Batch 12)
// =============================================================================

describe('buildSynthesisPrompt', () => {
  it('includes synthesis prefix', () => {
    const prompt = buildSynthesisPrompt({}, 'gpt');
    expect(prompt.startsWith(SYNTHESIS_PROMPT_PREFIX)).toBe(true);
  });

  it('includes agent verdicts', () => {
    const verdicts = {
      gpt: {
        valid: true, errors: [], rawText: '', verdict: 'ACCEPT' as const,
        confidence: 'HIGH' as const, rationale: ['Looks good'], issues: [], nextSteps: [],
      },
      claude: {
        valid: true, errors: [], rawText: '', verdict: 'REVISE' as const,
        confidence: 'MEDIUM' as const, rationale: ['Missing tests'], issues: ['No edge cases'], nextSteps: [],
      },
    };
    const prompt = buildSynthesisPrompt(verdicts, 'gpt');
    expect(prompt).toContain('GPT: ACCEPT');
    expect(prompt).toContain('Claude: REVISE');
    expect(prompt).toContain('Missing tests');
    expect(prompt).toContain('No edge cases');
  });

  it('labels invalid reviews', () => {
    const verdicts = {
      gemini: {
        valid: false, errors: ['bad parse'], rawText: 'raw', verdict: null,
        confidence: null, rationale: [], issues: [], nextSteps: [],
      },
    };
    const prompt = buildSynthesisPrompt(verdicts, 'gpt');
    expect(prompt).toContain('Gemini: INVALID REVIEW');
  });

  it('includes verdict format instructions', () => {
    const prompt = buildSynthesisPrompt({}, 'gpt');
    expect(prompt).toContain('CEO_VERDICT_START');
    expect(prompt).toContain('VERDICT:');
    expect(prompt).toContain('NEXT_ACTION:');
  });
});
