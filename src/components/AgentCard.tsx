// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// AgentCard Component (Phase 2 — Step 5)
// =============================================================================

import type { Agent, AgentResponse } from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type AgentDisplayStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'error'
  | 'timeout'
  | 'cancelled'
  | 'skipped';

interface AgentCardProps {
  agent: Agent;
  response: AgentResponse | null;
  isActive: boolean;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const AGENT_LABELS: Record<Agent, string> = {
  gpt: 'GPT',
  claude: 'Claude',
  gemini: 'Gemini',
};

function getDisplayStatus(
  response: AgentResponse | null,
  isActive: boolean
): AgentDisplayStatus {
  if (isActive) {
    return 'loading';
  }
  if (response === null) {
    return 'idle';
  }
  return response.status;
}

function getStatusLabel(status: AgentDisplayStatus): string {
  switch (status) {
    case 'idle':
      return 'Waiting';
    case 'loading':
      return 'Thinking...';
    case 'success':
      return 'Done';
    case 'error':
      return 'Error';
    case 'timeout':
      return 'Timeout';
    case 'cancelled':
      return 'Cancelled';
    case 'skipped':
      return 'Skipped';
  }
}

// -----------------------------------------------------------------------------
// Status Sub-message Helper
// -----------------------------------------------------------------------------

function getStatusSubMessage(response: AgentResponse | null): string | null {
  if (response === null) {
    return null;
  }

  switch (response.status) {
    case 'error': {
      const detail = response.errorMessage
        ? `${response.errorCode}: ${response.errorMessage}`
        : response.errorCode;
      return `Something went wrong — ${detail}`;
    }
    case 'timeout':
      return 'Request timed out';
    case 'cancelled':
      return 'Cancelled by user';
    default:
      return null;
  }
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function AgentCard({ agent, response, isActive }: AgentCardProps): JSX.Element {
  const status = getDisplayStatus(response, isActive);
  const statusLabel = getStatusLabel(status);

  // Extract content (available for success, and optionally for error/terminal states)
  const content = response?.status === 'success' ? response.content : response?.content;

  // Get contextual sub-message for terminal states
  const subMessage = getStatusSubMessage(response);

  return (
    <div className="agent-card">
      <div className="agent-card__header">
        <span className={`agent-card__name agent-card__name--${agent}`}>
          {AGENT_LABELS[agent]}
        </span>
        <span className={`agent-card__status agent-card__status--${status}`}>
          {statusLabel}
        </span>
      </div>

      {content && (
        <div className="agent-card__content">{content}</div>
      )}

      {subMessage && (
        <div className={`agent-card__submessage agent-card__submessage--${status}`}>
          {subMessage}
        </div>
      )}
    </div>
  );
}
