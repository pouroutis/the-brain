// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ActionBar Component (Phase 2 — Step 5)
// =============================================================================

import React from 'react';

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
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ActionBar({
  canClear,
  isProcessing,
  onClear,
  onCancel,
}: ActionBarProps): JSX.Element {
  return (
    <div className="action-bar">
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
