// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// WarningBanner Component (Phase 2 — Step 5)
// =============================================================================

import React from 'react';
import type { WarningState } from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface WarningBannerProps {
  warning: WarningState;
  onDismiss: () => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function WarningBanner({ warning, onDismiss }: WarningBannerProps): JSX.Element {
  return (
    <div className="warning-banner">
      <span className="warning-banner__message">{warning.message}</span>
      {warning.dismissable && (
        <button
          className="warning-banner__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss warning"
        >
          ×
        </button>
      )}
    </div>
  );
}
