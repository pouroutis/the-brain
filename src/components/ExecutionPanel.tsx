// =============================================================================
// The Brain — Execution Panel (Batch 10 — Execution Management UI)
// Surfaces FINAL prompt, tracks execution lifecycle, accepts results.
// No automatic execution — user runs Claude Code externally.
// =============================================================================

import { useCallback, useState } from 'react';
import { ExecutionReviewCard } from './ExecutionReviewCard';
import type { Agent, DecisionRecord } from '../types/brain';
import type { ParsedExecutionReview } from '../utils/executionReviewParser';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type ExecutionStatus = 'pending' | 'executing' | 'results_submitted' | 'reviewing' | 'done';

interface ExecutionPanelProps {
  /** The latest decision that produced a Claude Code prompt */
  decision: DecisionRecord | null;
  /** Already-submitted result artifact (survives mode switches) */
  existingResult: string | null;
  /** Callback to store execution results globally */
  onSubmitResult: (result: string) => void;
  /** Callback when user marks execution as done */
  onMarkDone: () => void;
  /** Callback to iterate (return to Decision mode for refinement) */
  onIterate: () => void;
  /** Whether AI review is in progress */
  isReviewing?: boolean;
  /** Parsed review verdicts from agents (after review completes) */
  reviewVerdicts?: Partial<Record<Agent, ParsedExecutionReview>> | null;
  /** Callback to request AI review of execution results */
  onRequestReview?: () => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ExecutionPanel({
  decision,
  existingResult,
  onSubmitResult,
  onMarkDone,
  onIterate,
  isReviewing = false,
  reviewVerdicts = null,
  onRequestReview,
}: ExecutionPanelProps): JSX.Element | null {
  // No decision with prompt = nothing to show
  if (!decision || !decision.promptProduced || !decision.claudeCodePrompt) {
    return null;
  }

  // If results were previously submitted (survived mode switch), start at results_submitted
  const initialStatus: ExecutionStatus = existingResult ? 'results_submitted' : 'pending';

  const [status, setStatus] = useState<ExecutionStatus>(initialStatus);
  const [resultText, setResultText] = useState(existingResult ?? '');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    if (!decision.claudeCodePrompt) return;
    try {
      await navigator.clipboard.writeText(decision.claudeCodePrompt);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Failed');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, [decision.claudeCodePrompt]);

  const handleMarkExecuting = useCallback(() => {
    setStatus('executing');
  }, []);

  const handleSubmitResults = useCallback(() => {
    if (resultText.trim()) {
      onSubmitResult(resultText.trim());
      setStatus('results_submitted');
    }
  }, [resultText, onSubmitResult]);

  const handleMarkDone = useCallback(() => {
    setStatus('done');
    onMarkDone();
  }, [onMarkDone]);

  const promptText = decision.claudeCodePrompt;
  const epochLabel = decision.epochId ? `Epoch #${decision.epochId}` : '';
  const ceoLabel = decision.ceoAgent.toUpperCase();

  return (
    <div className={`execution-panel execution-panel--${status}`} data-testid="execution-panel">
      {/* Header */}
      <div className="execution-panel__header">
        <h3 className="execution-panel__title">
          {status === 'done' ? '✅ Execution Complete' :
           status === 'results_submitted' ? '📋 Results Submitted' :
           status === 'executing' ? '⚡ Executing Externally...' :
           '🚀 Ready to Execute'}
        </h3>
        {epochLabel && (
          <span className="execution-panel__meta">{epochLabel} · CEO: {ceoLabel}</span>
        )}
      </div>

      {/* Prompt Display (visible in pending + executing) */}
      {(status === 'pending' || status === 'executing') && (
        <div className="execution-panel__prompt-section">
          <div className="execution-panel__prompt-header">
            <span className="execution-panel__prompt-label">Claude Code Prompt</span>
            <button
              className="execution-panel__copy-btn"
              onClick={handleCopy}
              data-testid="execution-copy-btn"
            >
              {copyFeedback ?? '📋 Copy Prompt'}
            </button>
          </div>
          <pre className="execution-panel__prompt-text" data-testid="execution-prompt-text">
            {promptText}
          </pre>
        </div>
      )}

      {/* Actions: Pending */}
      {status === 'pending' && (
        <div className="execution-panel__actions">
          <button
            className="execution-panel__btn execution-panel__btn--primary"
            onClick={handleMarkExecuting}
            data-testid="mark-executing-btn"
          >
            ⚡ I'm Executing This
          </button>
          <button
            className="execution-panel__btn execution-panel__btn--secondary"
            onClick={onIterate}
            data-testid="iterate-btn-pending"
          >
            ← Refine in Decision Mode
          </button>
        </div>
      )}

      {/* Results Input: Executing */}
      {status === 'executing' && (
        <div className="execution-panel__results-section">
          <label className="execution-panel__results-label" htmlFor="execution-results">
            Paste Claude Code output or execution summary:
          </label>
          <textarea
            id="execution-results"
            className="execution-panel__results-input"
            value={resultText}
            onChange={(e) => setResultText(e.target.value)}
            placeholder="Paste the output from Claude Code here...&#10;&#10;e.g. commit hash, files changed, test results, errors encountered"
            rows={8}
            data-testid="execution-results-input"
          />
          <div className="execution-panel__actions">
            <button
              className="execution-panel__btn execution-panel__btn--primary"
              onClick={handleSubmitResults}
              disabled={!resultText.trim()}
              data-testid="submit-results-btn"
            >
              📤 Submit Results
            </button>
            <button
              className="execution-panel__btn execution-panel__btn--secondary"
              onClick={() => setStatus('pending')}
              data-testid="back-to-pending-btn"
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Results Display + Final Actions: Results Submitted */}
      {status === 'results_submitted' && (
        <div className="execution-panel__submitted-section">
          <div className="execution-panel__submitted-label">Execution Results:</div>
          <pre className="execution-panel__submitted-text" data-testid="submitted-results-text">
            {resultText}
          </pre>

          {/* AI Review Section (Batch 11) */}
          <div className="execution-panel__review-section">
            {/* Review Loading */}
            {isReviewing && (
              <div className="execution-panel__reviewing" data-testid="reviewing-indicator">
                <span className="execution-panel__reviewing-icon">🔍</span>
                <span className="execution-panel__reviewing-text">AI team is reviewing execution results...</span>
              </div>
            )}

            {/* Review Verdicts (after review completes) */}
            {!isReviewing && reviewVerdicts && Object.keys(reviewVerdicts).length > 0 && (
              <div className="execution-panel__verdicts" data-testid="review-verdicts">
                <h4 className="execution-panel__verdicts-title">AI Review Verdicts</h4>
                {(['gpt', 'claude', 'gemini'] as const).map((agent) => {
                  const review = reviewVerdicts[agent];
                  return review ? (
                    <ExecutionReviewCard key={agent} agent={agent} review={review} />
                  ) : null;
                })}
              </div>
            )}

            {/* Request Review Button (only when no review in progress and no verdicts yet) */}
            {!isReviewing && (!reviewVerdicts || Object.keys(reviewVerdicts).length === 0) && onRequestReview && (
              <button
                className="execution-panel__btn execution-panel__btn--review"
                onClick={onRequestReview}
                data-testid="request-review-btn"
              >
                🔍 Request AI Review
              </button>
            )}
          </div>

          <div className="execution-panel__actions">
            <button
              className="execution-panel__btn execution-panel__btn--success"
              onClick={handleMarkDone}
              data-testid="mark-done-btn"
            >
              ✅ Mark Done
            </button>
            <button
              className="execution-panel__btn execution-panel__btn--primary"
              onClick={onIterate}
              data-testid="iterate-btn-results"
            >
              🔄 Iterate (New Decision)
            </button>
          </div>
        </div>
      )}

      {/* Done State */}
      {status === 'done' && (
        <div className="execution-panel__done-section">
          <p className="execution-panel__done-message">
            Execution complete. Results have been recorded.
          </p>
          <div className="execution-panel__actions">
            <button
              className="execution-panel__btn execution-panel__btn--primary"
              onClick={onIterate}
              data-testid="new-decision-btn"
            >
              + Start New Decision
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
