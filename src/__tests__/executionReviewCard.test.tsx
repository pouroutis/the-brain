// =============================================================================
// The Brain — Execution Review Card Tests (Batch 11)
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExecutionReviewCard } from '../components/ExecutionReviewCard';
import type { ParsedExecutionReview } from '../utils/executionReviewParser';

function makeReview(overrides: Partial<ParsedExecutionReview> = {}): ParsedExecutionReview {
  return {
    valid: true,
    errors: [],
    rawText: 'Full agent response text',
    verdict: 'ACCEPT',
    confidence: 'HIGH',
    rationale: ['Implementation matches spec'],
    issues: [],
    nextSteps: ['Deploy'],
    ...overrides,
  };
}

describe('ExecutionReviewCard', () => {
  it('renders ACCEPT verdict with correct styling', () => {
    render(<ExecutionReviewCard agent="claude" review={makeReview()} />);
    const card = screen.getByTestId('execution-review-card-claude');
    expect(card.className).toContain('execution-review-card--accept');
    expect(card.textContent).toContain('Claude');
    expect(card.textContent).toContain('Accept');
  });

  it('renders REVISE verdict with issues', () => {
    render(<ExecutionReviewCard agent="gemini" review={makeReview({
      verdict: 'REVISE',
      confidence: 'MEDIUM',
      issues: ['Missing error handling', 'No tests for edge case'],
      nextSteps: ['Add error handling', 'Write edge case tests'],
    })} />);
    const card = screen.getByTestId('execution-review-card-gemini');
    expect(card.className).toContain('execution-review-card--revise');
    expect(card.textContent).toContain('Missing error handling');
    expect(card.textContent).toContain('Write edge case tests');
    expect(card.textContent).toContain('MEDIUM');
  });

  it('renders FAIL verdict', () => {
    render(<ExecutionReviewCard agent="gpt" review={makeReview({
      verdict: 'FAIL',
      confidence: 'HIGH',
      rationale: ['Build completely broken'],
      issues: ['15 TypeScript errors'],
    })} />);
    const card = screen.getByTestId('execution-review-card-gpt');
    expect(card.className).toContain('execution-review-card--fail');
    expect(card.textContent).toContain('Fail');
  });

  it('renders invalid review with fallback', () => {
    render(<ExecutionReviewCard agent="claude" review={makeReview({
      valid: false,
      verdict: null,
      confidence: null,
      errors: ['Missing review markers'],
      rawText: 'Unstructured response without proper formatting',
      rationale: [],
      issues: [],
      nextSteps: [],
    })} />);
    const card = screen.getByTestId('execution-review-card-claude');
    expect(card.className).toContain('execution-review-card--invalid');
    expect(card.textContent).toContain('Invalid Format');
    expect(card.textContent).toContain('Missing review markers');
  });

  it('truncates long raw text at 300 chars', () => {
    const longRaw = 'X'.repeat(500);
    render(<ExecutionReviewCard agent="gemini" review={makeReview({
      valid: false,
      verdict: null,
      confidence: null,
      errors: ['Bad format'],
      rawText: longRaw,
      rationale: [],
      issues: [],
      nextSteps: [],
    })} />);
    const card = screen.getByTestId('execution-review-card-gemini');
    expect(card.textContent).toContain('X'.repeat(100));
    expect(card.textContent).not.toContain('X'.repeat(500));
    expect(card.textContent).toContain('…');
  });

  it('shows confidence badge', () => {
    render(<ExecutionReviewCard agent="gpt" review={makeReview({ confidence: 'LOW' })} />);
    const card = screen.getByTestId('execution-review-card-gpt');
    expect(card.textContent).toContain('LOW');
  });

  it('renders rationale list', () => {
    render(<ExecutionReviewCard agent="claude" review={makeReview({
      rationale: ['Point A', 'Point B', 'Point C'],
    })} />);
    const card = screen.getByTestId('execution-review-card-claude');
    expect(card.textContent).toContain('Point A');
    expect(card.textContent).toContain('Point B');
    expect(card.textContent).toContain('Point C');
  });
});
