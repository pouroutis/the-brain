// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ActionBar Component (Phase 2B — Mode Enforcement + CEO UX)
// =============================================================================

import { useCallback, useState, useRef, useEffect } from 'react';
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
  /** Callback to save result artifact */
  onSaveResultArtifact?: (artifact: string | null) => void;
  /** Callback to start execution loop (EXECUTE) */
  onStartExecution: () => void;
  /** Callback to pause execution loop (returns to Discussion) */
  onPauseExecution: () => void;
  /** Callback to stop execution loop (clears context) */
  onStopExecution: () => void;
  /** CEO execution prompt to copy (null if not available) */
  ceoExecutionPrompt?: string | null;
  /** Current CEO agent */
  ceo?: Agent;
  /** Callback to change CEO */
  onCeoChange?: (agent: Agent) => void;
  /** Current exchange ID (for tracking prompt generation per cycle) */
  lastExchangeId?: string | null;
  /** Whether CEO can generate execution prompt (Project mode + has exchanges) */
  canGenerateExecutionPrompt?: boolean;
  /** Latest result artifact from Claude Code (Phase 2C) */
  resultArtifact?: string | null;
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

const CEO_LABELS: Record<Agent, string> = {
  gpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
};

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
  ceoExecutionPrompt,
  ceo = 'gpt',
  onCeoChange,
  lastExchangeId,
  canGenerateExecutionPrompt = false,
  resultArtifact,
  onSaveResultArtifact,
}: ActionBarProps): JSX.Element {
  // Derived state
  const isRunning = loopState === 'running';
  const isPaused = loopState === 'paused';
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [resultInput, setResultInput] = useState<string>('');
  const [showResultInput, setShowResultInput] = useState<boolean>(false);

  // Track which exchange IDs have had execution prompts generated (safety)
  const generatedForExchangeRef = useRef<Set<string>>(new Set());

  // Reset tracking when exchanges are cleared
  useEffect(() => {
    if (!lastExchangeId) {
      generatedForExchangeRef.current.clear();
    }
  }, [lastExchangeId]);

  const hasGeneratedForCurrentExchange =
    lastExchangeId !== null &&
    lastExchangeId !== undefined &&
    generatedForExchangeRef.current.has(lastExchangeId);

  const handleGenerateCeoPrompt = useCallback(async () => {
    // Hard block: Only CEO in Project mode can generate
    if (mode !== 'project') {
      setCopyFeedback('Project mode only');
      setTimeout(() => setCopyFeedback(null), 2000);
      return;
    }

    if (!ceoExecutionPrompt || !lastExchangeId) return;

    // Safety: Prevent multiple execution prompts per cycle
    if (generatedForExchangeRef.current.has(lastExchangeId)) {
      setCopyFeedback('Already generated');
      setTimeout(() => setCopyFeedback(null), 2000);
      return;
    }

    try {
      await navigator.clipboard.writeText(ceoExecutionPrompt);
      generatedForExchangeRef.current.add(lastExchangeId);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Failed to copy');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, [ceoExecutionPrompt, lastExchangeId, mode]);

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
      {/* Status Indicator Bar */}
      <div className="action-bar__status">
        <span className="action-bar__status-item">
          <strong>Mode:</strong> {MODE_OPTIONS.find(m => m.value === mode)?.label}
        </span>
        {ceoActive && (
          <span className="action-bar__status-item">
            <strong>CEO:</strong> {CEO_LABELS[ceo]}
          </span>
        )}
        {isRunning && (
          <span className="action-bar__status-item action-bar__status-item--running">
            <strong>RUNNING</strong>
          </span>
        )}
        {isPaused && (
          <span className="action-bar__status-item action-bar__status-item--paused">
            <strong>PAUSED</strong>
          </span>
        )}
        {resultArtifact && (
          <span className="action-bar__status-item action-bar__status-item--result">
            <strong>Result:</strong> {resultArtifact.length > 50 ? resultArtifact.slice(0, 50) + '...' : resultArtifact}
          </span>
        )}
      </div>

      {/* Mode Selector */}
      <label className="action-bar__select-label">
        <span className="action-bar__select-text">Mode:</span>
        <select
          className="action-bar__select"
          value={mode}
          onChange={handleModeChange}
          disabled={isProcessing || isRunning}
          title={MODE_OPTIONS.find(m => m.value === mode)?.description}
        >
          {MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {/* CEO Selector (only when CEO is active) */}
      {ceoActive && onCeoChange && (
        <label className="action-bar__select-label">
          <span className="action-bar__select-text">CEO:</span>
          <select
            className="action-bar__select"
            value={ceo}
            onChange={handleCeoChange}
            disabled={isProcessing || isRunning}
          >
            {CEO_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Execution Controls (Project mode only) */}
      {showExecutionControls && (
        <>
          {loopState === 'idle' && (
            <button
              className="action-bar__button action-bar__button--execute"
              onClick={onStartExecution}
              disabled={isProcessing}
              title="Start autonomous execution loop (CEO controls until DONE)"
            >
              EXECUTE
            </button>
          )}
          {loopState === 'paused' && (
            <button
              className="action-bar__button action-bar__button--resume"
              onClick={onStartExecution}
              disabled={isProcessing}
              title="Resume execution loop"
            >
              RESUME
            </button>
          )}
          {(isRunning || isPaused) && (
            <>
              {isRunning && (
                <button
                  className="action-bar__button action-bar__button--pause"
                  onClick={onPauseExecution}
                  title="Pause execution loop, return to Discussion mode"
                >
                  PAUSE
                </button>
              )}
              <button
                className="action-bar__button action-bar__button--stop"
                onClick={onStopExecution}
                disabled={isProcessing}
                title="Stop and clear execution context (requires EXECUTE to restart)"
              >
                STOP
              </button>
            </>
          )}
        </>
      )}

      {/* Result Artifact Paste UI (Project mode only) */}
      {mode === 'project' && onSaveResultArtifact && (
        <div className="action-bar__result-input">
          <button
            className="action-bar__button action-bar__button--paste"
            onClick={() => setShowResultInput(!showResultInput)}
            title="Paste Claude Code execution result"
          >
            {showResultInput ? 'Hide' : 'Paste Result'}
          </button>
          {showResultInput && (
            <div className="action-bar__result-input-area">
              <textarea
                className="action-bar__textarea"
                placeholder="Paste Claude Code Result here..."
                value={resultInput}
                onChange={(e) => setResultInput(e.target.value)}
                rows={4}
              />
              <button
                className="action-bar__button action-bar__button--save"
                onClick={() => {
                  onSaveResultArtifact(resultInput || null);
                  setShowResultInput(false);
                }}
                disabled={!resultInput.trim()}
              >
                Save Result
              </button>
            </div>
          )}
        </div>
      )}

      {/* Generate CEO Execution Prompt button (Project mode only, CEO only) */}
      {mode === 'project' && (
        <button
          className="action-bar__button action-bar__button--copy"
          onClick={handleGenerateCeoPrompt}
          disabled={!canGenerateExecutionPrompt || !ceoExecutionPrompt || isProcessing || hasGeneratedForCurrentExchange}
          title={
            hasGeneratedForCurrentExchange
              ? 'Execution prompt already generated for this cycle'
              : mode !== 'project'
              ? 'Execution prompts only available in Project mode'
              : 'Generate CEO execution prompt for Claude Code (one per cycle)'
          }
        >
          {copyFeedback ?? 'Generate CEO Execution Prompt'}
        </button>
      )}

      {/* Cancel button: visible only when processing */}
      {isProcessing && (
        <button
          className="action-bar__button action-bar__button--cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
      )}

      {/* Clear button: always visible, disabled when processing or execution loop running */}
      <button
        className="action-bar__button action-bar__button--clear"
        onClick={onClear}
        disabled={!canClear || isRunning}
      >
        Clear Board
      </button>
    </div>
  );
}
