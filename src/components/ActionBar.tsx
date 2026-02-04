// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ActionBar Component (Phase 2 — Step 5)
// =============================================================================

import { useCallback, useState } from 'react';

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
  /** Execution prompt to copy (null if not available) */
  executionPrompt?: string | null;
}

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
  executionPrompt,
}: ActionBarProps): JSX.Element {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleCopyExecutionPrompt = useCallback(async () => {
    if (!executionPrompt) return;

    try {
      await navigator.clipboard.writeText(executionPrompt);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Failed to copy');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, [executionPrompt]);

  return (
    <div className="action-bar">
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

      {/* Copy Execution Prompt button */}
      <button
        className="action-bar__button action-bar__button--copy"
        onClick={handleCopyExecutionPrompt}
        disabled={!executionPrompt || isProcessing}
        title="Copy a Claude Code prompt based on the last exchange"
      >
        {copyFeedback ?? 'Copy Execution Prompt'}
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
