// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ExchangeList Component (Phase 2 — Step 5)
// =============================================================================

import { useState } from 'react';
import type { Agent, BrainMode, Exchange, PendingExchange } from '../types/brain';
import { ExchangeCard } from './ExchangeCard';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ExchangeListProps {
  /** Completed exchanges (historical) */
  exchanges: Exchange[];
  /** Current in-flight exchange, or null */
  pendingExchange: PendingExchange | null;
  /** Currently active agent (for pending exchange) */
  currentAgent: Agent | null;
  /** Current operating mode (for content sanitization) */
  mode: BrainMode;
  /** Anchor agent (rendered last, shown in collapsed view) */
  anchorAgent: Agent;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ExchangeList({
  exchanges,
  pendingExchange,
  currentAgent,
  mode,
  anchorAgent,
}: ExchangeListProps): JSX.Element {
  const [showDiscussion, setShowDiscussion] = useState(false);

  const hasContent = exchanges.length > 0 || pendingExchange !== null;

  if (!hasContent) {
    return (
      <div className="exchange-list">
        <div className="exchange-list__empty">
          No conversations yet. Enter a prompt to begin.
        </div>
      </div>
    );
  }

  return (
    <div className="exchange-list">
      {/* Toggle between outcome-first and full discussion view */}
      {exchanges.length > 0 && (
        <div className="exchange-list__view-toggle">
          <button
            className="exchange-list__toggle-btn"
            onClick={() => setShowDiscussion(prev => !prev)}
            aria-pressed={showDiscussion}
            aria-label={showDiscussion ? 'Hide advisor discussion' : 'Show advisor discussion'}
          >
            {showDiscussion ? 'Hide discussion' : 'Show discussion'}
          </button>
        </div>
      )}

      {/* Render completed exchanges (historical) */}
      {exchanges.map((exchange) => (
        <ExchangeCard
          key={exchange.id}
          userPrompt={exchange.userPrompt}
          responsesByAgent={exchange.responsesByAgent}
          isPending={false}
          currentAgent={null}
          mode={mode}
          anchorAgent={anchorAgent}
          showDiscussion={showDiscussion}
        />
      ))}

      {/* Render pending exchange (in-flight) */}
      {pendingExchange !== null && (
        <ExchangeCard
          key={pendingExchange.runId}
          userPrompt={pendingExchange.userPrompt}
          responsesByAgent={pendingExchange.responsesByAgent}
          isPending={true}
          currentAgent={currentAgent}
          mode={mode}
          anchorAgent={anchorAgent}
          showDiscussion={true}
        />
      )}
    </div>
  );
}
