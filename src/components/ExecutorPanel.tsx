// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ExecutorPanel Component (Phase 2D — Project Mode UI)
// =============================================================================

import { useState, useCallback } from 'react';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ExecutorPanelProps {
  /** The persisted CEO execution prompt (read-only display) */
  ceoExecutionPrompt: string | null;
  /** The current result artifact */
  resultArtifact: string | null;
  /** Callback to save result artifact */
  onSaveResultArtifact: (artifact: string | null) => void;
  /** Whether in Project mode (panel only visible in Project mode) */
  isProjectMode: boolean;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ExecutorPanel({
  ceoExecutionPrompt,
  resultArtifact,
  onSaveResultArtifact,
  isProjectMode,
}: ExecutorPanelProps): JSX.Element | null {
  const [resultInput, setResultInput] = useState<string>('');

  const handleSaveResult = useCallback(() => {
    if (resultInput.trim()) {
      onSaveResultArtifact(resultInput);
      setResultInput('');
    }
  }, [resultInput, onSaveResultArtifact]);

  // Only show in Project mode
  if (!isProjectMode) {
    return null;
  }

  return (
    <div className="executor-panel">
      {/* CEO Execution Prompt Section */}
      <div className="executor-panel__section">
        <h4 className="executor-panel__section-title">CEO Execution Prompt</h4>
        <textarea
          className="executor-panel__textarea executor-panel__textarea--readonly"
          value={ceoExecutionPrompt ?? ''}
          readOnly
          rows={6}
          placeholder="Use 'Generate Prompt' above after the CEO responds..."
          title="The CEO's instructions for Claude Code"
        />
      </div>

      {/* Claude Code Result Section */}
      <div className="executor-panel__section">
        <h4 className="executor-panel__section-title">Claude Code Result</h4>
        <textarea
          className="executor-panel__textarea"
          value={resultInput}
          onChange={(e) => setResultInput(e.target.value)}
          rows={6}
          placeholder="Paste the result from Claude Code here..."
          title="Paste output here to feed back to the advisors"
        />
        <div className="executor-panel__section-footer">
          {resultArtifact && (
            <span
              className="executor-panel__saved-indicator"
              title={`Saved: ${resultArtifact.length > 100 ? resultArtifact.slice(0, 100) + '...' : resultArtifact}`}
            >
              Saved ({resultArtifact.length} chars)
            </span>
          )}
          <button
            className="executor-panel__button executor-panel__button--save"
            onClick={handleSaveResult}
            disabled={!resultInput.trim()}
            title="Save result for the next discussion round"
          >
            Save Result
          </button>
        </div>
      </div>
    </div>
  );
}
