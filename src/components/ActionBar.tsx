// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ActionBar Component (Discussion Mode Only)
// =============================================================================

import type { BrainMode } from '../types/brain';

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
  /** Callback to export transcript (Discussion mode) */
  onFinishDiscussion?: () => void;
  /** Whether export is available (has transcript) */
  canExport?: boolean;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ActionBar({
  canClear,
  isProcessing,
  onClear,
  onCancel,
  mode,
  onFinishDiscussion,
  canExport = false,
}: ActionBarProps): JSX.Element {
  return (
    <div className="action-bar">
      {/* Single Control Row */}
      <div className="action-bar__controls">
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
            disabled={!canClear}
            title="Remove all conversations from the board"
          >
            Clear Board
          </button>
        </div>
      </div>
    </div>
  );
}
