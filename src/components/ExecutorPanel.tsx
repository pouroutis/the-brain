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
  /** CEO execution prompt available for generation */
  generatedPrompt?: string | null;
  /** Callback when Generate is clicked */
  onGeneratePrompt?: () => void;
  /** Whether generate button should be disabled */
  canGenerate?: boolean;
  /** Copy feedback message */
  copyFeedback?: string | null;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ExecutorPanel({
  ceoExecutionPrompt,
  resultArtifact,
  onSaveResultArtifact,
  isProjectMode,
  generatedPrompt,
  onGeneratePrompt,
  canGenerate = false,
  copyFeedback,
}: ExecutorPanelProps): JSX.Element | null {
  const [resultInput, setResultInput] = useState<string>('');

  const handleSaveResult = useCallback(() => {
    if (resultInput.trim()) {
      onSaveResultArtifact(resultInput);
      setResultInput('');
    }
  }, [resultInput, onSaveResultArtifact]);

  const handleCopyPrompt = useCallback(async () => {
    if (ceoExecutionPrompt) {
      try {
        await navigator.clipboard.writeText(ceoExecutionPrompt);
      } catch {
        // Silently fail
      }
    }
  }, [ceoExecutionPrompt]);

  // Only show in Project mode
  if (!isProjectMode) {
    return null;
  }

  return (
    <div className="executor-panel">
      <div className="executor-panel__header">
        <h3 className="executor-panel__title">Executor Panel</h3>
        <span
          className="executor-panel__help"
          title="Use this panel to manage the execution workflow: generate prompts for Claude Code, paste results back, and track artifacts."
        >
          ?
        </span>
      </div>

      {/* CEO Execution Prompt Section */}
      <div className="executor-panel__section">
        <div className="executor-panel__section-header">
          <label className="executor-panel__label">
            CEO Execution Prompt
          </label>
          <div className="executor-panel__section-actions">
            {onGeneratePrompt && (
              <button
                className="executor-panel__button executor-panel__button--generate"
                onClick={onGeneratePrompt}
                disabled={!canGenerate || !generatedPrompt}
                title="Generate the CEO's execution prompt and copy to clipboard. Use this prompt with Claude Code to execute the CEO's instructions."
              >
                {copyFeedback ?? 'Generate & Copy'}
              </button>
            )}
            {ceoExecutionPrompt && (
              <button
                className="executor-panel__button executor-panel__button--copy"
                onClick={handleCopyPrompt}
                title="Copy the execution prompt to clipboard again."
              >
                Copy
              </button>
            )}
          </div>
        </div>
        <textarea
          className="executor-panel__textarea executor-panel__textarea--readonly"
          value={ceoExecutionPrompt ?? ''}
          readOnly
          rows={6}
          placeholder="Click 'Generate & Copy' after the CEO responds to create an execution prompt..."
          title="This is the CEO's execution prompt. Copy this and paste it into Claude Code to execute the instructions."
        />
      </div>

      {/* Claude Code Result Section */}
      <div className="executor-panel__section">
        <div className="executor-panel__section-header">
          <label className="executor-panel__label">
            Claude Code Result
          </label>
        </div>
        <textarea
          className="executor-panel__textarea"
          value={resultInput}
          onChange={(e) => setResultInput(e.target.value)}
          rows={6}
          placeholder="After Claude Code finishes execution, paste the result here..."
          title="Paste the output from Claude Code here. This result will be fed back to the advisors in the next iteration."
        />
        <div className="executor-panel__section-footer">
          <button
            className="executor-panel__button executor-panel__button--save"
            onClick={handleSaveResult}
            disabled={!resultInput.trim()}
            title="Save the result artifact. This will be included in the next round of discussion."
          >
            Save Result
          </button>
          {resultArtifact && (
            <span
              className="executor-panel__saved-indicator"
              title={`Saved result: ${resultArtifact.length > 100 ? resultArtifact.slice(0, 100) + '...' : resultArtifact}`}
            >
              ✓ Result saved ({resultArtifact.length} chars)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
