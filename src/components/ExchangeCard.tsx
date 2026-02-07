// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ExchangeCard Component (Phase 2 — Step 5, Phase 6 — Routing Telemetry)
// =============================================================================

import type { Agent, AgentResponse, BrainMode, Exchange, PendingExchange } from '../types/brain';
import { AgentCard } from './AgentCard';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Default agent rendering order: Gemini first, Claude second, GPT third */
const DEFAULT_AGENT_ORDER: Agent[] = ['gemini', 'claude', 'gpt'];

/**
 * Compute agent render order based on CEO.
 * - All modes: Gemini, Claude, then CEO last
 * - CEO is always rendered last regardless of mode
 */
function getAgentRenderOrder(ceo: Agent): Agent[] {
  // Priority order: gemini, claude, gpt
  // Remove CEO from this order, then append CEO at the end
  const priorityOrder: Agent[] = ['gemini', 'claude', 'gpt'];
  const nonCeoAgents = priorityOrder.filter((a) => a !== ceo);
  return [...nonCeoAgents, ceo];
}

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

  for (const agent of DEFAULT_AGENT_ORDER) {
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
  /** Current operating mode (for content sanitization) */
  mode: BrainMode;
  /** Current CEO agent (for render order in Decision/Project modes) */
  ceo: Agent;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ExchangeCard({
  userPrompt,
  responsesByAgent,
  isPending,
  currentAgent,
  mode,
  ceo,
}: ExchangeCardProps): JSX.Element {
  // Derive telemetry for completed exchanges (not shown during pending)
  const telemetry = !isPending ? deriveRoutingTelemetry(responsesByAgent) : null;

  // Compute agent render order based on CEO (CEO always last)
  const agentRenderOrder = getAgentRenderOrder(ceo);

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

      {/* Agent Responses Section (order depends on mode: Discussion=fixed, Decision/Project=CEO last) */}
      <div className="exchange-card__agents">
        {agentRenderOrder.map((agent) => {
          const response = responsesByAgent[agent] ?? null;
          const isActive = isPending && currentAgent === agent;

          // For completed exchanges, only show agents that have responses
          // For pending exchanges, show all agents (some may be idle/waiting)
          if (!isPending && response === null) {
            return null;
          }

          // Mark CEO agent (currently discussion-only, so always false)
          const isCeo = false;

          return (
            <AgentCard
              key={agent}
              agent={agent}
              response={response}
              isActive={isActive}
              mode={mode}
              isCeo={isCeo}
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
  exchange: Exchange,
  mode: BrainMode,
  ceo: Agent
): JSX.Element {
  return (
    <ExchangeCard
      key={exchange.id}
      userPrompt={exchange.userPrompt}
      responsesByAgent={exchange.responsesByAgent}
      isPending={false}
      currentAgent={null}
      mode={mode}
      ceo={ceo}
    />
  );
}

export function renderPendingExchange(
  pending: PendingExchange,
  currentAgent: Agent | null,
  mode: BrainMode,
  ceo: Agent
): JSX.Element {
  return (
    <ExchangeCard
      key={pending.runId}
      userPrompt={pending.userPrompt}
      responsesByAgent={pending.responsesByAgent}
      isPending={true}
      currentAgent={currentAgent}
      mode={mode}
      ceo={ceo}
    />
  );
}
