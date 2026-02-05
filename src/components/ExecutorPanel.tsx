// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ExecutorPanel Component (Phase 2D — Project Mode UI)
// STEP 3-4: Engine Activity, Status Pill, Ghost Output, Retry
// =============================================================================

import { useState, useCallback } from 'react';
import type { LoopState } from '../types/brain';

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
  /** Current loop state (STEP 3-4) */
  loopState?: LoopState;
  /** Project error message (STEP 3-4) */
  projectError?: string | null;
  /** Ghost orchestrator output (STEP 3-4) */
  ghostOutput?: string | null;
  /** Callback to retry execution (STEP 3-4) */
  onRetry?: () => void;
}

// -----------------------------------------------------------------------------
// Constants: Engine Activity Phases (Static)
// -----------------------------------------------------------------------------

const ENGINE_PHASES = [
  { id: 'init', label: 'Initializing ghost orchestrator' },
  { id: 'context', label: 'Building context with carryover' },
  { id: 'deliberation', label: 'Running AI deliberation' },
  { id: 'synthesis', label: 'Synthesizing final output' },
];

// -----------------------------------------------------------------------------
// Helper: Get Status Label and Class
// -----------------------------------------------------------------------------

function getStatusInfo(loopState: LoopState): { label: string; className: string } {
  switch (loopState) {
    case 'idle':
      return { label: 'IDLE', className: 'executor-panel__status--idle' };
    case 'running':
      return { label: 'RUNNING', className: 'executor-panel__status--running' };
    case 'paused':
      return { label: 'PAUSED', className: 'executor-panel__status--paused' };
    case 'completed':
      return { label: 'COMPLETED', className: 'executor-panel__status--completed' };
    case 'failed':
      return { label: 'FAILED', className: 'executor-panel__status--failed' };
    default:
      return { label: 'UNKNOWN', className: 'executor-panel__status--idle' };
  }
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ExecutorPanel({
  ceoExecutionPrompt,
  resultArtifact,
  onSaveResultArtifact,
  isProjectMode,
  loopState = 'idle',
  projectError = null,
  ghostOutput = null,
  onRetry,
}: ExecutorPanelProps): JSX.Element | null {
  const [resultInput, setResultInput] = useState<string>('');
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);

  const handleSaveResult = useCallback(() => {
    if (resultInput.trim()) {
      onSaveResultArtifact(resultInput);
      setResultInput('');
    }
  }, [resultInput, onSaveResultArtifact]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setResultInput(text);
        setPasteFeedback('Pasted!');
        setTimeout(() => setPasteFeedback(null), 2000);
      }
    } catch {
      setPasteFeedback('No access');
      setTimeout(() => setPasteFeedback(null), 2000);
    }
  }, []);

  // Only show in Project mode
  if (!isProjectMode) {
    return null;
  }

  const statusInfo = getStatusInfo(loopState);
  const isRunning = loopState === 'running';
  const isFailed = loopState === 'failed';
  const isCompleted = loopState === 'completed';

  return (
    <div className="executor-panel">
      {/* Status Pill (STEP 3-4) */}
      <div className="executor-panel__status-row">
        <span className={`executor-panel__status ${statusInfo.className}`}>
          {statusInfo.label}
        </span>
        {isFailed && onRetry && (
          <button
            className="executor-panel__button executor-panel__button--retry"
            onClick={onRetry}
            title="Retry the ghost orchestrator call"
          >
            Retry
          </button>
        )}
      </div>

      {/* Engine Activity (STEP 3-4) */}
      {(isRunning || isCompleted || isFailed) && (
        <div className="executor-panel__section">
          <h4 className="executor-panel__section-title">Engine Activity</h4>
          <ul className="executor-panel__activity-list">
            {ENGINE_PHASES.map((phase, index) => {
              // Determine phase status based on loop state
              let phaseClass = 'executor-panel__activity-item--pending';
              if (isCompleted) {
                phaseClass = 'executor-panel__activity-item--done';
              } else if (isFailed) {
                // Show phases up to the failure point
                phaseClass = index < 3
                  ? 'executor-panel__activity-item--done'
                  : 'executor-panel__activity-item--error';
              } else if (isRunning) {
                // Show progressive animation during running
                phaseClass = index <= 2
                  ? 'executor-panel__activity-item--active'
                  : 'executor-panel__activity-item--pending';
              }

              return (
                <li
                  key={phase.id}
                  className={`executor-panel__activity-item ${phaseClass}`}
                >
                  {phase.label}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Error Display (STEP 3-4) */}
      {isFailed && projectError && (
        <div className="executor-panel__section executor-panel__section--error">
          <h4 className="executor-panel__section-title">Error</h4>
          <p className="executor-panel__error-message">{projectError}</p>
        </div>
      )}

      {/* Engine Output (STEP 3-4) */}
      {isCompleted && ghostOutput && (
        <div className="executor-panel__section">
          <h4 className="executor-panel__section-title">Engine Output</h4>
          <textarea
            className="executor-panel__textarea executor-panel__textarea--readonly"
            value={ghostOutput}
            readOnly
            rows={8}
            title="Ghost orchestrator output"
          />
        </div>
      )}

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
        <div className="executor-panel__section-header">
          <h4 className="executor-panel__section-title">Claude Code Result</h4>
          <button
            className="executor-panel__button executor-panel__button--paste"
            onClick={handlePasteFromClipboard}
            title="Paste Claude Code output from clipboard"
          >
            {pasteFeedback ?? 'Paste from Clipboard'}
          </button>
        </div>
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
