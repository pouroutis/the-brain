// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ActionBar Component (Phase 2A — CEO Authority)
// =============================================================================

import { useCallback, useState, useRef, useEffect } from 'react';
import type { Agent } from '../types/brain';

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
  /** Whether project discussion mode is enabled */
  projectDiscussionMode?: boolean;
  /** Callback to toggle project discussion mode */
  onToggleProjectDiscussionMode?: (enabled: boolean) => void;
  /** CEO execution prompt to copy (null if not available) */
  ceoExecutionPrompt?: string | null;
  /** Current CEO agent */
  ceo?: Agent;
  /** Callback to change CEO */
  onCeoChange?: (agent: Agent) => void;
  /** Current exchange ID (for tracking prompt generation per cycle) */
  lastExchangeId?: string | null;
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
  projectDiscussionMode = false,
  onToggleProjectDiscussionMode,
  ceoExecutionPrompt,
  ceo = 'gpt',
  onCeoChange,
  lastExchangeId,
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

  return (
    <div className="action-bar">
      {/* CEO Selector */}
      {onCeoChange && (
        <label className="action-bar__select-label">
          <span className="action-bar__select-text">CEO:</span>
          <select
            className="action-bar__select"
            value={ceo}
            onChange={handleCeoChange}
            disabled={isProcessing}
          >
            {CEO_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Project Discussion Mode toggle */}
      {onToggleProjectDiscussionMode && (
        <label className="action-bar__toggle">
          <input
            type="checkbox"
            checked={projectDiscussionMode}
            onChange={(e) => onToggleProjectDiscussionMode(e.target.checked)}
            disabled={isProcessing}
          />
          <span className="action-bar__toggle-label">Project Mode</span>
        </label>
      )}

      {/* Generate CEO Execution Prompt button */}
      <button
        className="action-bar__button action-bar__button--copy"
        onClick={handleGenerateCeoPrompt}
        disabled={!ceoExecutionPrompt || isProcessing || hasGeneratedForCurrentExchange}
        title={
          hasGeneratedForCurrentExchange
            ? 'Execution prompt already generated for this cycle'
            : 'Generate and copy CEO execution prompt for Claude Code'
        }
      >
        {copyFeedback ?? 'Generate CEO Execution Prompt'}
      </button>

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
        disabled={!canClear}
      >
        Clear Board
      </button>
    </div>
  );
}
