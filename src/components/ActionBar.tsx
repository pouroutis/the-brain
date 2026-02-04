// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ActionBar Component (Phase 2 — Modes + CEO Authority)
// =============================================================================

import { useCallback, useState, useRef, useEffect } from 'react';
import type { Agent, BrainMode } from '../types/brain';

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
  /** Whether execution loop is active (Project mode) */
  executionLoopActive: boolean;
  /** Callback to start execution loop (EXECUTE/ATTACK) */
  onStartExecution: () => void;
  /** Callback to stop execution loop (PAUSE/STOP) */
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
  executionLoopActive,
  onStartExecution,
  onStopExecution,
  ceoExecutionPrompt,
  ceo = 'gpt',
  onCeoChange,
  lastExchangeId,
  canGenerateExecutionPrompt = false,
}: ActionBarProps): JSX.Element {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

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
  }, [ceoExecutionPrompt, lastExchangeId]);

  const handleCeoChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onCeoChange?.(e.target.value as Agent);
    },
    [onCeoChange]
  );

  const handleModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onModeChange(e.target.value as BrainMode);
    },
    [onModeChange]
  );

  // CEO is active in Decision and Project modes
  const ceoActive = mode === 'decision' || mode === 'project';

  // Execution controls only in Project mode
  const showExecutionControls = mode === 'project';

  return (
    <div className="action-bar">
      {/* Mode Selector */}
      <label className="action-bar__select-label">
        <span className="action-bar__select-text">Mode:</span>
        <select
          className="action-bar__select"
          value={mode}
          onChange={handleModeChange}
          disabled={isProcessing || executionLoopActive}
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
            disabled={isProcessing || executionLoopActive}
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
          {!executionLoopActive ? (
            <button
              className="action-bar__button action-bar__button--execute"
              onClick={onStartExecution}
              disabled={isProcessing}
              title="Start autonomous execution loop (CEO controls until DONE)"
            >
              EXECUTE
            </button>
          ) : (
            <>
              <button
                className="action-bar__button action-bar__button--pause"
                onClick={onStopExecution}
                title="Pause execution loop, return to Discussion"
              >
                PAUSE
              </button>
              <button
                className="action-bar__button action-bar__button--stop"
                onClick={onStopExecution}
                title="Stop and terminate Project mode"
              >
                STOP
              </button>
            </>
          )}
        </>
      )}

      {/* Generate CEO Execution Prompt button (Project mode only) */}
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
              : 'Generate and copy CEO execution prompt for Claude Code'
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

      {/* Clear button: always visible, disabled when processing or no exchanges */}
      <button
        className="action-bar__button action-bar__button--clear"
        onClick={onClear}
        disabled={!canClear || executionLoopActive}
      >
        Clear Board
      </button>
    </div>
  );
}
