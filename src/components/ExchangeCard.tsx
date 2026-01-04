// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ExchangeCard Component (Phase 2 — Step 5, Phase 6 — Routing Telemetry)
// =============================================================================

import type { Agent, AgentResponse, Exchange, PendingExchange } from '../types/brain';
import { AgentCard } from './AgentCard';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Fixed agent rendering order */
const AGENT_ORDER: Agent[] = ['gpt', 'claude', 'gemini'];

/** Agent display labels for telemetry */
const AGENT_LABELS: Record<Agent, string> = {
  gpt: 'GPT',
  claude: 'Claude',
  gemini: 'Gemini',
};

// -----------------------------------------------------------------------------
// Routing Telemetry (Phase 6 — Deterministic, Status-Only)
// -----------------------------------------------------------------------------

/**
 * Derive telemetry string from existing responsesByAgent.
 * Shows: agent statuses + call count. Does NOT claim flag/fallback info.
 */
function deriveRoutingTelemetry(
  responsesByAgent: Partial<Record<Agent, AgentResponse>>
): { line: string; callsUsed: number } {
  const parts: string[] = [];
  let callsUsed = 0;

  for (const agent of AGENT_ORDER) {
    const response = responsesByAgent[agent];
    if (response === undefined || response === null) {
      parts.push(`${AGENT_LABELS[agent]}=skipped`);
    } else {
      parts.push(`${AGENT_LABELS[agent]}=${response.status}`);
      callsUsed += 1;
    }
  }

  return {
    line: parts.join(' · '),
    callsUsed,
  };
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ExchangeCardProps {
  /** User prompt for this exchange */
  userPrompt: string;
  /** Agent responses keyed by agent */
  responsesByAgent: Partial<Record<Agent, AgentResponse>>;
  /** Whether this is the pending (in-flight) exchange */
  isPending: boolean;
  /** Currently active agent (only relevant for pending exchange) */
  currentAgent: Agent | null;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ExchangeCard({
  userPrompt,
  responsesByAgent,
  isPending,
  currentAgent,
}: ExchangeCardProps): JSX.Element {
  // Derive telemetry for completed exchanges (not shown during pending)
  const telemetry = !isPending ? deriveRoutingTelemetry(responsesByAgent) : null;

  return (
    <div className={`exchange-card ${isPending ? 'exchange-card--pending' : ''}`}>
      {/* User Prompt Section */}
      <div className="exchange-card__prompt">
        <div className="exchange-card__prompt-label">You</div>
        <div className="exchange-card__prompt-text">{userPrompt}</div>
      </div>

      {/* Routing Telemetry (Phase 6 — completed exchanges only) */}
      {telemetry && (
        <div className="routing-telemetry">
          <span className="routing-telemetry__label">Routing:</span>
          <span className="routing-telemetry__line">{telemetry.line}</span>
          <span className="routing-telemetry__calls">Calls: {telemetry.callsUsed}/3</span>
        </div>
      )}

      {/* Agent Responses Section (fixed order: GPT → Claude → Gemini) */}
      <div className="exchange-card__agents">
        {AGENT_ORDER.map((agent) => {
          const response = responsesByAgent[agent] ?? null;
          const isActive = isPending && currentAgent === agent;

          // For completed exchanges, only show agents that have responses
          // For pending exchanges, show all agents (some may be idle/waiting)
          if (!isPending && response === null) {
            return null;
          }

          return (
            <AgentCard
              key={agent}
              agent={agent}
              response={response}
              isActive={isActive}
            />
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Factory helpers for rendering from Exchange or PendingExchange
// -----------------------------------------------------------------------------

export function renderCompletedExchange(
  exchange: Exchange
): JSX.Element {
  return (
    <ExchangeCard
      key={exchange.id}
      userPrompt={exchange.userPrompt}
      responsesByAgent={exchange.responsesByAgent}
      isPending={false}
      currentAgent={null}
    />
  );
}

export function renderPendingExchange(
  pending: PendingExchange,
  currentAgent: Agent | null
): JSX.Element {
  return (
    <ExchangeCard
      key={pending.runId}
      userPrompt={pending.userPrompt}
      responsesByAgent={pending.responsesByAgent}
      isPending={true}
      currentAgent={currentAgent}
    />
  );
}
