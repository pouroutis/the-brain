// =============================================================================
// The Brain — Execution Review Card (Batch 11 — AI Review)
// Displays one agent's structured execution review verdict.
// =============================================================================

import type { Agent } from '../types/brain';
import type { ParsedExecutionReview } from '../utils/executionReviewParser';

interface ExecutionReviewCardProps {
  agent: Agent;
  review: ParsedExecutionReview;
}

const AGENT_LABELS: Record<Agent, string> = {
  gpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
};

const VERDICT_STYLES: Record<string, { className: string; label: string }> = {
  ACCEPT: { className: 'accept', label: '✅ Accept' },
  REVISE: { className: 'revise', label: '🔧 Revise' },
  FAIL: { className: 'fail', label: '❌ Fail' },
};

export function ExecutionReviewCard({ agent, review }: ExecutionReviewCardProps): JSX.Element {
  const agentLabel = AGENT_LABELS[agent] ?? agent;

  // Invalid schema fallback
  if (!review.valid) {
    return (
      <div className="execution-review-card execution-review-card--invalid" data-testid={`execution-review-card-${agent}`}>
        <div className="execution-review-card__header">
          <span className="execution-review-card__agent">{agentLabel}</span>
          <span className="execution-review-card__badge execution-review-card__badge--invalid">⚠ Invalid Format</span>
        </div>
        {review.errors.length > 0 && (
          <div className="execution-review-card__errors">
            {review.errors.map((err, i) => (
              <div key={i} className="execution-review-card__error">{err}</div>
            ))}
          </div>
        )}
        <div className="execution-review-card__raw">
          <div className="execution-review-card__raw-label">Raw response (excerpt):</div>
          <pre className="execution-review-card__raw-text">
            {review.rawText.length > 300 ? review.rawText.slice(0, 300) + '…' : review.rawText}
          </pre>
        </div>
      </div>
    );
  }

  // Valid review
  const verdictStyle = review.verdict ? VERDICT_STYLES[review.verdict] : null;

  return (
    <div
      className={`execution-review-card execution-review-card--${verdictStyle?.className ?? 'unknown'}`}
      data-testid={`execution-review-card-${agent}`}
    >
      <div className="execution-review-card__header">
        <span className="execution-review-card__agent">{agentLabel}</span>
        {verdictStyle && (
          <span className={`execution-review-card__badge execution-review-card__badge--${verdictStyle.className}`}>
            {verdictStyle.label}
          </span>
        )}
        {review.confidence && (
          <span className={`execution-review-card__confidence execution-review-card__confidence--${review.confidence.toLowerCase()}`}>
            {review.confidence}
          </span>
        )}
      </div>

      {review.rationale.length > 0 && (
        <div className="execution-review-card__section">
          <div className="execution-review-card__section-title">Rationale</div>
          <ul className="execution-review-card__list">
            {review.rationale.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}

      {review.issues.length > 0 && (
        <div className="execution-review-card__section">
          <div className="execution-review-card__section-title">Issues</div>
          <ul className="execution-review-card__list execution-review-card__list--issues">
            {review.issues.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}

      {review.nextSteps.length > 0 && (
        <div className="execution-review-card__section">
          <div className="execution-review-card__section-title">Next Steps</div>
          <ul className="execution-review-card__list execution-review-card__list--steps">
            {review.nextSteps.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
