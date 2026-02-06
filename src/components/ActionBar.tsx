// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ActionBar Component (No Mode Switching — Return Home Only)
// =============================================================================

import { useCallback } from 'react';
import type { Agent, BrainMode, LoopState } from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ActionBarProps {
  /** Whether clear is allowed (not processing, has exchanges) */
  canClear: boolean;
  /** Whether currently processing (for cancel visibility) */
  isProcessing: boolean;
  /** Callback to clear all exchanges */
  onClear: () => void;
  /** Callback to cancel current sequence */
  onCancel: () => void;
  /** Current operating mode */
  mode: BrainMode;
  /** Loop state (Phase 2C) */
  loopState: LoopState;
  /** Callback to start execution loop (EXECUTE) */
  onStartExecution: () => void;
  /** Callback to pause execution loop (returns to Discussion) */
  onPauseExecution: () => void;
  /** Callback to stop execution loop (clears context) */
  onStopExecution: () => void;
  /** Callback to mark execution as DONE (Phase 2F — deterministic termination) */
  onMarkDone: () => void;
  /** Current CEO agent */
  ceo?: Agent;
  /** Callback to change CEO */
  onCeoChange?: (agent: Agent) => void;
  /** Callback to generate CEO execution prompt (Project mode) */
  onGeneratePrompt?: () => void;
  /** Whether generate button should be enabled */
  canGenerate?: boolean;
  /** Feedback text for generate button */
  generateFeedback?: string | null;
  /** Callback to export transcript (Discussion mode) */
  onFinishDiscussion?: () => void;
  /** Whether export is available (has transcript) */
  canExport?: boolean;
  /** Callback to return to Home screen */
  onReturnHome?: () => void;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CEO_OPTIONS: { value: Agent; label: string }[] = [
  { value: 'gpt', label: 'ChatGPT' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
];

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ActionBar({
  canClear,
  isProcessing,
  onClear,
  onCancel,
  mode,
  loopState,
  onStartExecution,
  onPauseExecution,
  onStopExecution,
  onMarkDone,
  ceo = 'gpt',
  onCeoChange,
  onGeneratePrompt,
  canGenerate = false,
  generateFeedback,
  onFinishDiscussion,
  canExport = false,
  onReturnHome,
}: ActionBarProps): JSX.Element {
  // Derived state
  const isRunning = loopState === 'running';
  const isPaused = loopState === 'paused';

  const handleCeoChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      // Hard block: No CEO changes during execution loop
      if (isRunning) return;
      onCeoChange?.(e.target.value as Agent);
    },
    [onCeoChange, isRunning]
  );

  // CEO is active in Decision and Project modes
  const ceoActive = mode === 'decision' || mode === 'project';

  // Execution controls only in Project mode
  const showExecutionControls = mode === 'project';

  return (
    <div className="action-bar">
      {/* Single Control Row: CEO Selector | Execution | Artifacts | Board | Home */}
      <div className="action-bar__controls">
        {/* Group: CEO Selector (Decision/Project modes only) */}
        <div className="action-bar__group action-bar__group--selectors">
          {ceoActive && onCeoChange && (
            <select
              className="action-bar__select"
              value={ceo}
              onChange={handleCeoChange}
              disabled={isProcessing || isRunning}
              title="Pick which AI leads and makes final decisions"
            >
              {CEO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  CEO: {opt.label}
                </option>
              ))}
            </select>
          )}

          {/* Status badge inline with selectors */}
          {isRunning && (
            <span className="action-bar__status-badge action-bar__status-badge--running">
              RUNNING
            </span>
          )}
          {isPaused && (
            <span className="action-bar__status-badge action-bar__status-badge--paused">
              PAUSED
            </span>
          )}
        </div>

        {/* Group: Execution Controls (Project mode only) */}
        {showExecutionControls && (
          <div className="action-bar__group action-bar__group--execution">
            {loopState === 'idle' && (
              <button
                className="action-bar__button action-bar__button--execute"
                onClick={onStartExecution}
                disabled={isProcessing}
                title="Start the autonomous execution loop"
              >
                Execute
              </button>
            )}
            {loopState === 'paused' && (
              <button
                className="action-bar__button action-bar__button--resume"
                onClick={onStartExecution}
                disabled={isProcessing}
                title="Continue the paused execution"
              >
                Resume
              </button>
            )}
            {isRunning && (
              <button
                className="action-bar__button action-bar__button--pause"
                onClick={onPauseExecution}
                title="Pause to review progress"
              >
                Pause
              </button>
            )}
            {(isRunning || isPaused) && (
              <button
                className="action-bar__button action-bar__button--stop"
                onClick={onStopExecution}
                disabled={isProcessing}
                title="Stop and reset the execution loop"
              >
                Stop
              </button>
            )}
            {isRunning && (
              <button
                className="action-bar__button action-bar__button--done"
                onClick={onMarkDone}
                disabled={isProcessing}
                title="Mark the task as complete"
              >
                Mark DONE
              </button>
            )}
          </div>
        )}

        {/* Group: Artifacts (Project mode only) */}
        {showExecutionControls && onGeneratePrompt && (
          <div className="action-bar__group action-bar__group--artifacts">
            <button
              className="action-bar__button action-bar__button--generate"
              onClick={onGeneratePrompt}
              disabled={!canGenerate}
              title="Copy the CEO's instructions for Claude Code"
            >
              {generateFeedback ?? 'Generate Prompt'}
            </button>
          </div>
        )}

        {/* Group: Discussion Export (Discussion mode only) */}
        {mode === 'discussion' && onFinishDiscussion && (
          <div className="action-bar__group action-bar__group--export">
            <button
              className="action-bar__button action-bar__button--export"
              onClick={onFinishDiscussion}
              disabled={!canExport || isProcessing}
              title="Export full discussion transcript"
            >
              Finish Discussion
            </button>
          </div>
        )}

        {/* Group: Board Actions */}
        <div className="action-bar__group action-bar__group--board">
          {isProcessing && (
            <button
              className="action-bar__button action-bar__button--cancel"
              onClick={onCancel}
              title="Stop the current AI response"
            >
              Cancel
            </button>
          )}
          <button
            className="action-bar__button action-bar__button--clear"
            onClick={onClear}
            disabled={!canClear || isRunning}
            title="Remove all conversations from the board"
          >
            Clear Board
          </button>
        </div>

        {/* Group: Return Home */}
        {onReturnHome && (
          <div className="action-bar__group action-bar__group--home">
            <button
              className="action-bar__button action-bar__button--home"
              onClick={onReturnHome}
              disabled={isProcessing || isRunning}
              title="Return to mode selection"
            >
              Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
