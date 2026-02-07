// =============================================================================
// The Brain — UI Transparency Tests (Batch 8)
// Component render tests for EpochStatusBadge, AdvisorReviewCard, CeoPromptPanel framing.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EpochStatusBadge } from '../components/EpochStatusBadge';
import { AdvisorReviewCard } from '../components/AdvisorReviewCard';
import { CeoPromptPanel } from '../components/CeoPromptPanel';
import type { DecisionEpoch, ParsedAdvisorReview } from '../types/brain';

// =============================================================================
// Test Helpers
// =============================================================================

function makeEpoch(overrides: Partial<DecisionEpoch> = {}): DecisionEpoch {
  return {
    epochId: 1,
    round: 1,
    phase: 'ADVISORS',
    maxRounds: 2,
    intent: 'Test intent',
    ceoAgent: 'gpt',
    ceoOnlyMode: false,
    startedAt: Date.now(),
    completedAt: null,
    terminalReason: null,
    ...overrides,
  };
}

function makeReview(overrides: Partial<ParsedAdvisorReview> = {}): ParsedAdvisorReview {
  return {
    valid: true,
    errors: [],
    rawText: 'Raw advisor review text',
    decision: 'APPROVE',
    rationale: ['Looks good'],
    requiredChanges: [],
    risks: [],
    confidence: 'HIGH',
    ...overrides,
  };
}

// =============================================================================
// EpochStatusBadge
// =============================================================================

describe('EpochStatusBadge', () => {
  it('renders null when epoch is null', () => {
    const { container } = render(<EpochStatusBadge epoch={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders badge with epoch ID, round, and phase label', () => {
    render(<EpochStatusBadge epoch={makeEpoch({ epochId: 3, round: 2, phase: 'CEO_FINAL' })} />);
    const badge = screen.getByTestId('epoch-status-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('Epoch #3');
    expect(badge.textContent).toContain('Round 2');
    expect(badge.textContent).toContain('CEO Finalizing');
  });

  it('applies "complete" modifier class for EPOCH_COMPLETE', () => {
    render(<EpochStatusBadge epoch={makeEpoch({ phase: 'EPOCH_COMPLETE', completedAt: Date.now(), terminalReason: 'prompt_delivered' })} />);
    const badge = screen.getByTestId('epoch-status-badge');
    expect(badge.className).toContain('epoch-status-badge--complete');
  });

  it('applies "blocked" modifier class for EPOCH_BLOCKED', () => {
    render(<EpochStatusBadge epoch={makeEpoch({ phase: 'EPOCH_BLOCKED', completedAt: Date.now(), terminalReason: 'blocked' })} />);
    const badge = screen.getByTestId('epoch-status-badge');
    expect(badge.className).toContain('epoch-status-badge--blocked');
  });

  it('applies "stopped" modifier class for EPOCH_STOPPED', () => {
    render(<EpochStatusBadge epoch={makeEpoch({ phase: 'EPOCH_STOPPED', completedAt: Date.now(), terminalReason: 'stopped' })} />);
    const badge = screen.getByTestId('epoch-status-badge');
    expect(badge.className).toContain('epoch-status-badge--stopped');
  });

  it('applies "active" modifier class for ADVISORS phase', () => {
    render(<EpochStatusBadge epoch={makeEpoch({ phase: 'ADVISORS' })} />);
    const badge = screen.getByTestId('epoch-status-badge');
    expect(badge.className).toContain('epoch-status-badge--active');
  });

  it('applies "idle" modifier class for IDLE phase', () => {
    render(<EpochStatusBadge epoch={makeEpoch({ phase: 'IDLE' })} />);
    const badge = screen.getByTestId('epoch-status-badge');
    expect(badge.className).toContain('epoch-status-badge--idle');
  });

  it('shows all active phases with "active" modifier', () => {
    for (const phase of ['ADVISORS', 'CEO_DRAFT', 'ADVISOR_REVIEW', 'CEO_FINAL'] as const) {
      const { unmount } = render(<EpochStatusBadge epoch={makeEpoch({ phase })} />);
      const badge = screen.getByTestId('epoch-status-badge');
      expect(badge.className).toContain('epoch-status-badge--active');
      unmount();
    }
  });
});

// =============================================================================
// AdvisorReviewCard
// =============================================================================

describe('AdvisorReviewCard', () => {
  it('renders valid APPROVE review with decision badge', () => {
    render(<AdvisorReviewCard agent="claude" review={makeReview({ decision: 'APPROVE' })} />);
    const card = screen.getByTestId('advisor-review-card-claude');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('Claude');
    expect(card.textContent).toContain('Approve');
    expect(card.className).toContain('advisor-review-card--approve');
  });

  it('renders valid REVISE review with required changes', () => {
    render(<AdvisorReviewCard agent="gemini" review={makeReview({
      decision: 'REVISE',
      confidence: 'MEDIUM',
      requiredChanges: ['Fix type mismatch', 'Add guard clause'],
      risks: ['May break tests'],
    })} />);
    const card = screen.getByTestId('advisor-review-card-gemini');
    expect(card.className).toContain('advisor-review-card--revise');
    expect(card.textContent).toContain('Gemini');
    expect(card.textContent).toContain('Revise');
    expect(card.textContent).toContain('Fix type mismatch');
    expect(card.textContent).toContain('Add guard clause');
    expect(card.textContent).toContain('May break tests');
    expect(card.textContent).toContain('MEDIUM');
  });

  it('renders invalid schema review with warning badge and raw text', () => {
    render(<AdvisorReviewCard agent="claude" review={makeReview({
      valid: false,
      decision: null,
      confidence: null,
      errors: ['Missing ADVISOR_REVIEW_START marker'],
      rawText: 'Unstructured advisor response without proper markers',
      rationale: [],
      requiredChanges: [],
      risks: [],
    })} />);
    const card = screen.getByTestId('advisor-review-card-claude');
    expect(card.className).toContain('advisor-review-card--invalid');
    expect(card.textContent).toContain('Invalid Schema');
    expect(card.textContent).toContain('Missing ADVISOR_REVIEW_START marker');
    expect(card.textContent).toContain('Unstructured advisor response');
  });

  it('truncates rawText at 300 chars in invalid review display', () => {
    const longRaw = 'B'.repeat(500);
    render(<AdvisorReviewCard agent="gemini" review={makeReview({
      valid: false,
      decision: null,
      confidence: null,
      errors: ['Bad format'],
      rawText: longRaw,
      rationale: [],
      requiredChanges: [],
      risks: [],
    })} />);
    const card = screen.getByTestId('advisor-review-card-gemini');
    // Should contain truncated text, not the full 500
    expect(card.textContent).toContain('B'.repeat(100)); // some portion
    expect(card.textContent).not.toContain('B'.repeat(500)); // not full
    expect(card.textContent).toContain('…');
  });

  it('renders REJECT review', () => {
    render(<AdvisorReviewCard agent="claude" review={makeReview({ decision: 'REJECT' })} />);
    const card = screen.getByTestId('advisor-review-card-claude');
    expect(card.className).toContain('advisor-review-card--reject');
    expect(card.textContent).toContain('Reject');
  });

  it('shows confidence badge when present', () => {
    render(<AdvisorReviewCard agent="claude" review={makeReview({ confidence: 'HIGH' })} />);
    const card = screen.getByTestId('advisor-review-card-claude');
    expect(card.textContent).toContain('HIGH');
  });
});

// =============================================================================
// CeoPromptPanel framing
// =============================================================================

describe('CeoPromptPanel framing', () => {
  it('shows "CEO Draft (Round 1)" title when epochPhase is CEO_DRAFT', () => {
    render(<CeoPromptPanel artifact={null} epochPhase="CEO_DRAFT" />);
    const panel = screen.getByTestId('ceo-prompt-panel');
    expect(panel.textContent).toContain('CEO Draft (Round 1)');
  });

  it('shows "CEO Draft (Round 1)" title when epochPhase is ADVISORS', () => {
    render(<CeoPromptPanel artifact={null} epochPhase="ADVISORS" />);
    const panel = screen.getByTestId('ceo-prompt-panel');
    expect(panel.textContent).toContain('CEO Draft (Round 1)');
  });

  it('shows "Final Prompt ✓" title when epochPhase is EPOCH_COMPLETE', () => {
    render(<CeoPromptPanel artifact={null} epochPhase="EPOCH_COMPLETE" />);
    const panel = screen.getByTestId('ceo-prompt-panel');
    expect(panel.textContent).toContain('Final Prompt');
  });

  it('shows default "Claude Code Prompt" when no epochPhase', () => {
    render(<CeoPromptPanel artifact={null} />);
    const panel = screen.getByTestId('ceo-prompt-panel');
    expect(panel.textContent).toContain('Claude Code Prompt');
  });

  it('applies draft frame class when epochPhase is CEO_DRAFT', () => {
    render(<CeoPromptPanel artifact={null} epochPhase="CEO_DRAFT" />);
    const panel = screen.getByTestId('ceo-prompt-panel');
    expect(panel.className).toContain('ceo-prompt-panel--draft');
  });

  it('applies final frame class when epochPhase is EPOCH_COMPLETE', () => {
    render(<CeoPromptPanel artifact={null} epochPhase="EPOCH_COMPLETE" />);
    const panel = screen.getByTestId('ceo-prompt-panel');
    expect(panel.className).toContain('ceo-prompt-panel--final');
  });

  it('shows framing labels even without an artifact present', () => {
    render(<CeoPromptPanel artifact={null} epochPhase="CEO_DRAFT" />);
    const panel = screen.getByTestId('ceo-prompt-panel');
    // titleLabel should still show "CEO Draft (Round 1)" even though artifact is null
    expect(panel.textContent).toContain('CEO Draft (Round 1)');
    expect(panel.textContent).not.toContain('Claude Code Prompt');
  });
});
