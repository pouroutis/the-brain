// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ExchangeList Component (Phase 2 — Step 5)
// =============================================================================

import { useState } from 'react';
import type { Agent, BrainMode, Exchange, PendingExchange, SystemMessage } from '../types/brain';
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
  /** Current CEO agent (for render order in Decision/Project modes) */
  ceo: Agent;
  /** System messages for inline notifications */
  systemMessages?: SystemMessage[];
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ExchangeList({
  exchanges,
  pendingExchange,
  currentAgent,
  mode,
  ceo,
  systemMessages = [],
}: ExchangeListProps): JSX.Element {
  const [showDiscussion, setShowDiscussion] = useState(false);

  const hasContent = exchanges.length > 0 || pendingExchange !== null || systemMessages.length > 0;

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
      {/* Render system messages (compaction notifications) */}
      {systemMessages.map((msg) => (
        <div key={msg.id} className="exchange-list__system-message">
          <span className="exchange-list__system-icon">&#9432;</span>
          {msg.message}
        </div>
      ))}

      {/* Toggle between outcome-first and full discussion view */}
      {exchanges.length > 0 && (
        <div className="exchange-list__view-toggle">
          <button
            className="exchange-list__toggle-btn"
            onClick={() => setShowDiscussion(prev => !prev)}
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
          ceo={ceo}
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
          ceo={ceo}
          showDiscussion={true}
        />
      )}
    </div>
  );
}
