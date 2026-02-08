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
 * Compute agent render order based on anchor agent.
 * Anchor is always rendered last regardless of mode.
 */
function getAgentRenderOrder(anchorAgent: Agent): Agent[] {
  const priorityOrder: Agent[] = ['gemini', 'claude', 'gpt'];
  const others = priorityOrder.filter((a) => a !== anchorAgent);
  return [...others, anchorAgent];
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
  /** Anchor agent (rendered last, shown in collapsed view) */
  anchorAgent: Agent;
  /** When false and exchange is completed, render only the anchor agent response */
  showDiscussion?: boolean;
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
  anchorAgent,
  showDiscussion = true,
}: ExchangeCardProps): JSX.Element {
  const collapsed = !showDiscussion && !isPending;

  // Derive telemetry for completed exchanges (not shown during pending or when collapsed)
  const telemetry = !isPending && !collapsed ? deriveRoutingTelemetry(responsesByAgent) : null;

  // Compute agent render order (anchor agent always last)
  const agentRenderOrder = getAgentRenderOrder(anchorAgent);

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

      {/* Agent Responses Section (anchor agent always last) */}
      <div className="exchange-card__agents">
        {/* Outcome label — visible only when collapsed to outcome-first view */}
        {collapsed && (
          <div className="exchange-card__outcome-label">Outcome</div>
        )}

        {agentRenderOrder.map((agent) => {
          // When collapsed, only render the anchor agent
          if (collapsed && agent !== anchorAgent) return null;

          const response = responsesByAgent[agent] ?? null;
          const isActive = isPending && currentAgent === agent;

          // For completed exchanges, only show agents that have responses
          // For pending exchanges, show all agents (some may be idle/waiting)
          if (!isPending && response === null) {
            return null;
          }

          // Visually emphasize anchor agent when in collapsed (outcome-first) view
          const isAnchor = collapsed && agent === anchorAgent;

          return (
            <AgentCard
              key={agent}
              agent={agent}
              response={response}
              isActive={isActive}
              mode={mode}
              isAnchor={isAnchor}
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
  anchorAgent: Agent
): JSX.Element {
  return (
    <ExchangeCard
      key={exchange.id}
      userPrompt={exchange.userPrompt}
      responsesByAgent={exchange.responsesByAgent}
      isPending={false}
      currentAgent={null}
      mode={mode}
      anchorAgent={anchorAgent}
    />
  );
}

export function renderPendingExchange(
  pending: PendingExchange,
  currentAgent: Agent | null,
  mode: BrainMode,
  anchorAgent: Agent
): JSX.Element {
  return (
    <ExchangeCard
      key={pending.runId}
      userPrompt={pending.userPrompt}
      responsesByAgent={pending.responsesByAgent}
      isPending={true}
      currentAgent={currentAgent}
      mode={mode}
      anchorAgent={anchorAgent}
    />
  );
}
