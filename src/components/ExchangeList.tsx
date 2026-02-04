// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ExchangeList Component (Phase 2 — Step 5)
// =============================================================================

import type { Agent, BrainMode, Exchange, PendingExchange } from '../types/brain';
import { renderCompletedExchange, renderPendingExchange } from './ExchangeCard';

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
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ExchangeList({
  exchanges,
  pendingExchange,
  currentAgent,
  mode,
}: ExchangeListProps): JSX.Element {
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
      {/* Render completed exchanges (historical) */}
      {exchanges.map((exchange) => renderCompletedExchange(exchange, mode))}

      {/* Render pending exchange (in-flight) */}
      {pendingExchange !== null && renderPendingExchange(pendingExchange, currentAgent, mode)}
    </div>
  );
}
