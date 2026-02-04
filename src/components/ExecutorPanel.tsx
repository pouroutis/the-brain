// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ExecutorPanel Component (Phase 2D)
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
      <h3 className="executor-panel__title">Executor Panel</h3>

      {/* CEO Execution Prompt (read-only) */}
      <div className="executor-panel__section">
        <label className="executor-panel__label">
          CEO Execution Prompt
          {ceoExecutionPrompt ? '' : ' (not yet generated)'}
        </label>
        <textarea
          className="executor-panel__textarea executor-panel__textarea--readonly"
          value={ceoExecutionPrompt ?? ''}
          readOnly
          rows={8}
          placeholder="Generate a CEO Execution Prompt to see it here..."
        />
      </div>

      {/* Current Result Artifact (if any) */}
      {resultArtifact && (
        <div className="executor-panel__section">
          <label className="executor-panel__label">Current Result Artifact</label>
          <div className="executor-panel__result-preview">
            {resultArtifact.length > 200
              ? resultArtifact.slice(0, 200) + '...'
              : resultArtifact}
          </div>
        </div>
      )}

      {/* Paste Claude Code Result */}
      <div className="executor-panel__section">
        <label className="executor-panel__label">Paste Claude Code Result</label>
        <textarea
          className="executor-panel__textarea"
          value={resultInput}
          onChange={(e) => setResultInput(e.target.value)}
          rows={4}
          placeholder="Paste the output from Claude Code here..."
        />
        <button
          className="executor-panel__button"
          onClick={handleSaveResult}
          disabled={!resultInput.trim()}
        >
          Save Result
        </button>
      </div>
    </div>
  );
}
