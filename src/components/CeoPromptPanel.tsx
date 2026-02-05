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
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function CeoPromptPanel({ artifact }: CeoPromptPanelProps): JSX.Element {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

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
  // Render: Empty State
  // ---------------------------------------------------------------------------

  if (!artifact) {
    return (
      <div className="ceo-prompt-panel ceo-prompt-panel--empty" data-testid="ceo-prompt-panel">
        <div className="ceo-prompt-panel__header">
          <h3 className="ceo-prompt-panel__title">Claude Code Prompt</h3>
        </div>
        <div className="ceo-prompt-panel__empty-state">
          <p>No prompt yet.</p>
          <p className="ceo-prompt-panel__hint">
            The CEO will publish a prompt when ready.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: With Artifact
  // ---------------------------------------------------------------------------

  const formattedTime = new Date(artifact.createdAt).toLocaleString();

  return (
    <div className="ceo-prompt-panel" data-testid="ceo-prompt-panel">
      <div className="ceo-prompt-panel__header">
        <h3 className="ceo-prompt-panel__title">Claude Code Prompt</h3>
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
