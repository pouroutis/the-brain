// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ActionBar Component (Phase 2B — Mode Enforcement + CEO UX)
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
  /** Callback to change mode */
  onModeChange: (mode: BrainMode) => void;
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
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CEO_OPTIONS: { value: Agent; label: string }[] = [
  { value: 'gpt', label: 'ChatGPT' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
];

const MODE_OPTIONS: { value: BrainMode; label: string; description: string }[] = [
  { value: 'discussion', label: 'Discussion', description: 'All AIs speak, no execution' },
  { value: 'decision', label: 'Decision', description: 'Single round, CEO decides' },
  { value: 'project', label: 'Project', description: 'CEO controls, execution enabled' },
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
  onModeChange,
  loopState,
  onStartExecution,
  onPauseExecution,
  onStopExecution,
  onMarkDone,
  ceo = 'gpt',
  onCeoChange,
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

  const handleModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      // Hard block: No mode changes during execution loop
      if (isRunning) return;
      onModeChange(e.target.value as BrainMode);
    },
    [onModeChange, isRunning]
  );

  // CEO is active in Decision and Project modes
  const ceoActive = mode === 'decision' || mode === 'project';

  // Execution controls only in Project mode
  const showExecutionControls = mode === 'project';

  return (
    <div className="action-bar">
      {/* Row 1: Status Indicator (running/paused state) */}
      {(isRunning || isPaused) && (
        <div className="action-bar__status">
          {isRunning && (
            <span className="action-bar__status-item action-bar__status-item--running">
              RUNNING
            </span>
          )}
          {isPaused && (
            <span className="action-bar__status-item action-bar__status-item--paused">
              PAUSED
            </span>
          )}
        </div>
      )}

      {/* Row 2: Controls - Mode, CEO, Execution buttons */}
      <div className="action-bar__controls">
        {/* Group: Mode & CEO Selectors */}
        <div className="action-bar__group action-bar__group--selectors">
          <select
            className="action-bar__select"
            value={mode}
            onChange={handleModeChange}
            disabled={isProcessing || isRunning}
            title="Select operating mode: Discussion (all AIs discuss), Decision (CEO decides), Project (CEO + execution)"
          >
            {MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {ceoActive && onCeoChange && (
            <select
              className="action-bar__select"
              value={ceo}
              onChange={handleCeoChange}
              disabled={isProcessing || isRunning}
              title="Select CEO: The AI that speaks last and makes final decisions"
            >
              {CEO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  CEO: {opt.label}
                </option>
              ))}
            </select>
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
                title="Start autonomous execution loop. CEO controls the conversation until you click DONE."
              >
                EXECUTE
              </button>
            )}
            {loopState === 'paused' && (
              <button
                className="action-bar__button action-bar__button--resume"
                onClick={onStartExecution}
                disabled={isProcessing}
                title="Resume the paused execution loop from where it left off."
              >
                RESUME
              </button>
            )}
            {isRunning && (
              <button
                className="action-bar__button action-bar__button--done"
                onClick={onMarkDone}
                disabled={isProcessing}
                title="Mark execution as complete. Terminates the loop and unlocks all controls."
              >
                DONE
              </button>
            )}
            {isRunning && (
              <button
                className="action-bar__button action-bar__button--pause"
                onClick={onPauseExecution}
                title="Pause execution to review progress. You can RESUME or STOP after pausing."
              >
                PAUSE
              </button>
            )}
            {(isRunning || isPaused) && (
              <button
                className="action-bar__button action-bar__button--stop"
                onClick={onStopExecution}
                disabled={isProcessing}
                title="Stop execution and clear context. You'll need to click EXECUTE to start a new loop."
              >
                STOP
              </button>
            )}
          </div>
        )}

        {/* Group: Board Actions */}
        <div className="action-bar__group action-bar__group--board">
          {isProcessing && (
            <button
              className="action-bar__button action-bar__button--cancel"
              onClick={onCancel}
              title="Cancel the current AI response. The conversation will stop mid-generation."
            >
              Cancel
            </button>
          )}
          <button
            className="action-bar__button action-bar__button--clear"
            onClick={onClear}
            disabled={!canClear || isRunning}
            title="Clear all conversations from the board. Cannot be undone."
          >
            Clear Board
          </button>
        </div>
      </div>
    </div>
  );
}
