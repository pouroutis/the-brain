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
  /** Callback to generate CEO execution prompt (Project mode) */
  onGeneratePrompt?: () => void;
  /** Whether generate button should be enabled */
  canGenerate?: boolean;
  /** Feedback text for generate button */
  generateFeedback?: string | null;
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
  onGeneratePrompt,
  canGenerate = false,
  generateFeedback,
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
      {/* Single Control Row: Selectors | Execution | Artifacts | Board */}
      <div className="action-bar__controls">
        {/* Group: Mode & CEO Selectors */}
        <div className="action-bar__group action-bar__group--selectors">
          <select
            className="action-bar__select"
            value={mode}
            onChange={handleModeChange}
            disabled={isProcessing || isRunning}
            title="Choose how AIs collaborate: Discussion, Decision, or Project mode"
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
      </div>
    </div>
  );
}
