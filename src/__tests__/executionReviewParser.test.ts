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
} from '../utils/executionReviewParser';

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
