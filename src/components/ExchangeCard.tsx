// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ExchangeCard Component (V3-C — Round-Aware Rendering)
// =============================================================================

import { memo, useMemo } from 'react';
import type { Agent, AgentResponse, BrainMode, Exchange, PendingExchange, Round } from '../types/brain';
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
export function getAgentRenderOrder(anchorAgent: Agent): Agent[] {
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
// Types — Discriminated Union Props (V3-C)
// -----------------------------------------------------------------------------

interface ExchangeCardBaseProps {
  /** User prompt for this exchange */
  userPrompt: string;
  /** Current operating mode (for content sanitization) */
  mode: BrainMode;
  /** Anchor agent (rendered last, shown in collapsed view) */
  anchorAgent: Agent;
  /** When false and exchange is completed, render only the anchor agent response */
  showDiscussion?: boolean;
}

interface CompletedExchangeCardProps extends ExchangeCardBaseProps {
  isPending: false;
  /** V3-C: Full rounds array for completed exchanges */
  rounds: Round[];
  currentAgent?: null;
}

interface PendingExchangeCardProps extends ExchangeCardBaseProps {
  isPending: true;
  /** Flat responsesByAgent for pending (in-flight) exchanges */
  responsesByAgent: Partial<Record<Agent, AgentResponse>>;
  /** Currently active agent */
  currentAgent: Agent | null;
}

export type ExchangeCardProps = CompletedExchangeCardProps | PendingExchangeCardProps;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

// V2-K: Memoized to prevent re-renders of completed exchange cards during processing
export const ExchangeCard = memo(function ExchangeCard(props: ExchangeCardProps): JSX.Element {
  const {
    userPrompt,
    isPending,
    mode,
    anchorAgent,
    showDiscussion = true,
  } = props;

  const collapsed = !showDiscussion && !isPending;

  // V2-K: Memoize agent render order — only recompute when anchor changes
  const agentRenderOrder = useMemo(() => getAgentRenderOrder(anchorAgent), [anchorAgent]);

  // For completed exchanges, derive telemetry from the final round only
  const telemetry = useMemo(() => {
    if (isPending || collapsed) return null;
    const rounds = (props as CompletedExchangeCardProps).rounds;
    const finalRound = rounds[rounds.length - 1];
    return finalRound ? deriveRoutingTelemetry(finalRound.responsesByAgent) : null;
  }, [isPending, collapsed, props]);

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

      {/* Agent Responses Section */}
      <div className="exchange-card__agents">
        {/* Outcome label — visible only when collapsed to outcome-first view */}
        {collapsed && (
          <div className="exchange-card__outcome-label">Outcome</div>
        )}

        {isPending
          ? renderPendingAgents(props as PendingExchangeCardProps, agentRenderOrder, mode)
          : collapsed
            ? renderCollapsedAgents(props as CompletedExchangeCardProps, agentRenderOrder, mode)
            : renderExpandedRounds(props as CompletedExchangeCardProps, agentRenderOrder, mode)
        }
      </div>
    </div>
  );
});

// -----------------------------------------------------------------------------
// Render Helpers
// -----------------------------------------------------------------------------

/** Pending view: flat responsesByAgent, no round labels */
function renderPendingAgents(
  props: PendingExchangeCardProps,
  agentRenderOrder: Agent[],
  mode: BrainMode,
): JSX.Element[] {
  const elements: JSX.Element[] = [];
  for (const agent of agentRenderOrder) {
    const response = props.responsesByAgent[agent] ?? null;
    const isActive = props.currentAgent === agent;
    elements.push(
      <AgentCard
        key={agent}
        agent={agent}
        response={response}
        isActive={isActive}
        mode={mode}
      />
    );
  }
  return elements;
}

/** Collapsed view: only anchor agent from final round */
function renderCollapsedAgents(
  props: CompletedExchangeCardProps,
  agentRenderOrder: Agent[],
  mode: BrainMode,
): JSX.Element[] {
  const finalRound = props.rounds[props.rounds.length - 1];
  if (!finalRound) return [];

  const elements: JSX.Element[] = [];
  for (const agent of agentRenderOrder) {
    if (agent !== props.anchorAgent) continue;
    const response = finalRound.responsesByAgent[agent] ?? null;
    if (response === null) continue;
    elements.push(
      <AgentCard
        key={agent}
        agent={agent}
        response={response}
        isActive={false}
        mode={mode}
        isAnchor={true}
      />
    );
  }
  return elements;
}

/** Expanded view: all rounds, with "Round N" labels for multi-round exchanges */
function renderExpandedRounds(
  props: CompletedExchangeCardProps,
  agentRenderOrder: Agent[],
  mode: BrainMode,
): JSX.Element[] {
  const { rounds } = props;
  const isMultiRound = rounds.length > 1;
  const elements: JSX.Element[] = [];

  for (const round of rounds) {
    // Round label: only shown for multi-round exchanges
    if (isMultiRound) {
      elements.push(
        <div
          key={`round-label-${round.roundNumber}`}
          className="exchange-card__round-label"
          data-testid="round-label"
        >
          Round {round.roundNumber}
        </div>
      );
    }

    // Render all agents in this round using standard order
    for (const agent of agentRenderOrder) {
      const response = round.responsesByAgent[agent] ?? null;
      // For completed exchanges, skip agents with no response
      if (response === null) continue;
      elements.push(
        <AgentCard
          key={`${round.roundNumber}-${agent}`}
          agent={agent}
          response={response}
          isActive={false}
          mode={mode}
        />
      );
    }
  }

  return elements;
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
      rounds={exchange.rounds}
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
