// =============================================================================
// The Brain — Advisor Review Card (Batch 8 — UI Transparency)
// Read-only display of a ParsedAdvisorReview for one advisor.
// =============================================================================

import type { Agent, ParsedAdvisorReview } from '../types/brain';

interface AdvisorReviewCardProps {
  agent: Agent;
  review: ParsedAdvisorReview;
}

const AGENT_LABELS: Record<Agent, string> = {
  gpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
};

const DECISION_STYLES: Record<string, { className: string; label: string }> = {
  APPROVE: { className: 'approve', label: '✅ Approve' },
  REVISE: { className: 'revise', label: '🔧 Revise' },
  REJECT: { className: 'reject', label: '❌ Reject' },
};

export function AdvisorReviewCard({ agent, review }: AdvisorReviewCardProps): JSX.Element {
  const agentLabel = AGENT_LABELS[agent] ?? agent;

  // Invalid schema fallback
  if (!review.valid) {
    return (
      <div className="advisor-review-card advisor-review-card--invalid" data-testid={`advisor-review-card-${agent}`}>
        <div className="advisor-review-card__header">
          <span className="advisor-review-card__agent">{agentLabel}</span>
          <span className="advisor-review-card__badge advisor-review-card__badge--invalid">⚠ Invalid Schema</span>
        </div>
        {review.errors.length > 0 && (
          <div className="advisor-review-card__errors">
            {review.errors.map((err, i) => (
              <div key={i} className="advisor-review-card__error">{err}</div>
            ))}
          </div>
        )}
        <div className="advisor-review-card__raw">
          <div className="advisor-review-card__raw-label">Raw response (excerpt):</div>
          <pre className="advisor-review-card__raw-text">
            {review.rawText.length > 300 ? review.rawText.slice(0, 300) + '…' : review.rawText}
          </pre>
        </div>
      </div>
    );
  }

  // Valid review
  const decisionStyle = review.decision ? DECISION_STYLES[review.decision] : null;

  return (
    <div
      className={`advisor-review-card advisor-review-card--${decisionStyle?.className ?? 'unknown'}`}
      data-testid={`advisor-review-card-${agent}`}
    >
      <div className="advisor-review-card__header">
        <span className="advisor-review-card__agent">{agentLabel}</span>
        {decisionStyle && (
          <span className={`advisor-review-card__badge advisor-review-card__badge--${decisionStyle.className}`}>
            {decisionStyle.label}
          </span>
        )}
        {review.confidence && (
          <span className={`advisor-review-card__confidence advisor-review-card__confidence--${review.confidence.toLowerCase()}`}>
            {review.confidence}
          </span>
        )}
      </div>

      {review.rationale.length > 0 && (
        <div className="advisor-review-card__section">
          <div className="advisor-review-card__section-title">Rationale</div>
          <ul className="advisor-review-card__list">
            {review.rationale.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {review.requiredChanges.length > 0 && (
        <div className="advisor-review-card__section">
          <div className="advisor-review-card__section-title">Required Changes</div>
          <ul className="advisor-review-card__list advisor-review-card__list--changes">
            {review.requiredChanges.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {review.risks.length > 0 && (
        <div className="advisor-review-card__section">
          <div className="advisor-review-card__section-title">Risks</div>
          <ul className="advisor-review-card__list advisor-review-card__list--risks">
            {review.risks.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
