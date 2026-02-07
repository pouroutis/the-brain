// =============================================================================
// The Brain — Verdict Banner (Batch 12 — CEO Synthesis & Verdict Gate)
// Displays the resolved verdict with action buttons.
// =============================================================================

import type { VerdictResolution } from '../utils/executionReviewParser';

interface VerdictBannerProps {
  /** The resolved verdict */
  resolution: VerdictResolution;
  /** Whether CEO synthesis is in progress */
  isSynthesizing?: boolean;
  /** Callback for "Accept & Close" */
  onAccept: () => void;
  /** Callback for "Revise" / "New Strategy" (returns to Decision mode) */
  onIterate: () => void;
  /** Callback to request CEO synthesis (Tier 2) */
  onRequestCeoVerdict?: () => void;
}

const VERDICT_CONFIG: Record<string, { icon: string; label: string; className: string }> = {
  ACCEPT: { icon: '✅', label: 'Accept', className: 'accept' },
  REVISE: { icon: '🔧', label: 'Revise', className: 'revise' },
  FAIL: { icon: '❌', label: 'Fail', className: 'fail' },
};

const SOURCE_LABELS: Record<string, string> = {
  consensus: 'Team Consensus',
  ceo_review: 'CEO Authority',
  ceo_synthesis: 'CEO Synthesis',
};

export function VerdictBanner({
  resolution,
  isSynthesizing = false,
  onAccept,
  onIterate,
  onRequestCeoVerdict,
}: VerdictBannerProps): JSX.Element | null {
  // Synthesizing state
  if (isSynthesizing) {
    return (
      <div className="verdict-banner verdict-banner--synthesizing" data-testid="verdict-banner">
        <div className="verdict-banner__header">
          <span className="verdict-banner__icon">🧠</span>
          <span className="verdict-banner__title">CEO is synthesizing verdict...</span>
        </div>
      </div>
    );
  }

  // Unresolved — show request button
  if (!resolution.resolved || !resolution.verdict) {
    return (
      <div className="verdict-banner verdict-banner--unresolved" data-testid="verdict-banner">
        <div className="verdict-banner__header">
          <span className="verdict-banner__icon">⚖️</span>
          <span className="verdict-banner__title">Verdicts Disagree — CEO Decision Required</span>
        </div>
        <div className="verdict-banner__actions">
          {onRequestCeoVerdict && (
            <button
              className="verdict-banner__btn verdict-banner__btn--primary"
              onClick={onRequestCeoVerdict}
              data-testid="request-ceo-verdict-btn"
            >
              🧠 Request CEO Verdict
            </button>
          )}
          <button
            className="verdict-banner__btn verdict-banner__btn--secondary"
            onClick={onIterate}
            data-testid="verdict-iterate-btn"
          >
            🔄 Iterate Anyway
          </button>
        </div>
      </div>
    );
  }

  // Resolved — show verdict + actions
  const config = VERDICT_CONFIG[resolution.verdict] ?? { icon: '❓', label: 'Unknown', className: 'unknown' };
  const sourceLabel = resolution.source ? SOURCE_LABELS[resolution.source] ?? resolution.source : '';

  return (
    <div className={`verdict-banner verdict-banner--${config.className}`} data-testid="verdict-banner">
      <div className="verdict-banner__header">
        <span className="verdict-banner__icon">{config.icon}</span>
        <span className="verdict-banner__title">
          Verdict: {config.label}
        </span>
        {sourceLabel && (
          <span className="verdict-banner__source">({sourceLabel})</span>
        )}
      </div>

      {resolution.rationale && (
        <div className="verdict-banner__rationale" data-testid="verdict-rationale">
          {resolution.rationale}
        </div>
      )}

      {resolution.nextAction && resolution.nextAction.toLowerCase() !== 'none' && (
        <div className="verdict-banner__next-action" data-testid="verdict-next-action">
          Next: {resolution.nextAction}
        </div>
      )}

      <div className="verdict-banner__actions">
        {resolution.verdict === 'ACCEPT' && (
          <button
            className="verdict-banner__btn verdict-banner__btn--success"
            onClick={onAccept}
            data-testid="verdict-accept-btn"
          >
            ✅ Accept & Close
          </button>
        )}
        {resolution.verdict === 'REVISE' && (
          <button
            className="verdict-banner__btn verdict-banner__btn--primary"
            onClick={onIterate}
            data-testid="verdict-revise-btn"
          >
            🔧 Revise (New Decision)
          </button>
        )}
        {resolution.verdict === 'FAIL' && (
          <button
            className="verdict-banner__btn verdict-banner__btn--danger"
            onClick={onIterate}
            data-testid="verdict-fail-btn"
          >
            ❌ New Strategy
          </button>
        )}
        <button
          className="verdict-banner__btn verdict-banner__btn--secondary"
          onClick={onIterate}
          data-testid="verdict-override-btn"
        >
          🔄 Override — Iterate Anyway
        </button>
      </div>
    </div>
  );
}
