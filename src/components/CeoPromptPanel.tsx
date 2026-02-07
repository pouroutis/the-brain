// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// CEO Prompt Panel (Discussion Mode Right Pane)
// =============================================================================

import { useCallback, useState } from 'react';
import type { CeoPromptArtifact } from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface CeoPromptPanelProps {
  artifact: CeoPromptArtifact | null;
  /** Warning message when CEO prompt is missing required markers */
  warning?: string | null;
  /** Current epoch phase for visual framing (Batch 8) */
  epochPhase?: string | null;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function CeoPromptPanel({ artifact, warning, epochPhase }: CeoPromptPanelProps): JSX.Element {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Batch 8: Visual framing for DRAFT vs FINAL
  const isDraftPhase = epochPhase === 'CEO_DRAFT' || epochPhase === 'ADVISORS';
  const isComplete = epochPhase === 'EPOCH_COMPLETE';
  const frameClass = isComplete ? 'ceo-prompt-panel--final' : isDraftPhase ? 'ceo-prompt-panel--draft' : '';
  const titleLabel = isComplete ? 'Final Prompt ✓' : isDraftPhase ? 'CEO Draft (Round 1)' : 'Claude Code Prompt';

  const handleCopy = useCallback(async () => {
    if (!artifact) return;

    try {
      await navigator.clipboard.writeText(artifact.text);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Failed');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, [artifact]);

  // ---------------------------------------------------------------------------
  // Render: Empty State (with optional warning)
  // ---------------------------------------------------------------------------

  if (!artifact) {
    return (
      <div
        className={`ceo-prompt-panel ceo-prompt-panel--empty ${warning ? 'ceo-prompt-panel--warning' : ''} ${frameClass}`}
        data-testid="ceo-prompt-panel"
      >
        <div className="ceo-prompt-panel__header">
          <h3 className="ceo-prompt-panel__title">{titleLabel}</h3>
        </div>
        {warning ? (
          <div className="ceo-prompt-panel__warning" data-testid="ceo-prompt-warning">
            <div className="ceo-prompt-panel__warning-icon">⚠️</div>
            <div className="ceo-prompt-panel__warning-text">{warning}</div>
          </div>
        ) : (
          <div className="ceo-prompt-panel__empty-state">
            <p>No prompt yet.</p>
            <p className="ceo-prompt-panel__hint">
              The CEO will publish a prompt when ready.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: With Artifact
  // ---------------------------------------------------------------------------

  const formattedTime = new Date(artifact.createdAt).toLocaleString();

  return (
    <div className={`ceo-prompt-panel ${frameClass}`} data-testid="ceo-prompt-panel">
      <div className="ceo-prompt-panel__header">
        <h3 className="ceo-prompt-panel__title">{titleLabel}</h3>
        <div className="ceo-prompt-panel__meta">
          <span className="ceo-prompt-panel__version">v{artifact.version}</span>
          <span className="ceo-prompt-panel__timestamp">{formattedTime}</span>
        </div>
      </div>

      <div className="ceo-prompt-panel__content">
        <pre className="ceo-prompt-panel__prompt" data-testid="ceo-prompt-text">
          {artifact.text}
        </pre>
      </div>

      <div className="ceo-prompt-panel__actions">
        <button
          className="ceo-prompt-panel__copy-btn"
          onClick={handleCopy}
          data-testid="copy-prompt-btn"
        >
          {copyFeedback ?? 'Copy'}
        </button>
      </div>
    </div>
  );
}
