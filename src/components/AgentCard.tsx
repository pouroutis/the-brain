// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// AgentCard Component (Phase 2 — Step 5)
// =============================================================================

import type { Agent, AgentResponse, BrainMode } from '../types/brain';

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
  /** Current operating mode (for content sanitization) */
  mode: BrainMode;
  /** Whether this agent is the CEO (Decision/Project modes) */
  isCeo?: boolean;
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

/**
 * Sanitize response content for ALL modes.
 * Removes internal gatekeeping flags (CALL_CLAUDE, CALL_GEMINI, REASON_TAG)
 * and surrounding delimiter lines (---).
 */
function sanitizeGatekeepingFlags(content: string): string {
  // Split into lines
  const lines = content.split('\n');
  const sanitizedLines: string[] = [];
  let insideFlagsBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect delimiter line (---) that may surround flags block
    if (trimmed === '---') {
      // Toggle block state, skip this line
      insideFlagsBlock = !insideFlagsBlock;
      continue;
    }

    // Skip lines with gatekeeping flags (even outside --- blocks)
    if (/^CALL_CLAUDE\s*=/i.test(trimmed)) continue;
    if (/^CALL_GEMINI\s*=/i.test(trimmed)) continue;
    if (/^REASON_TAG\s*=/i.test(trimmed)) continue;

    // Skip lines inside flags block
    if (insideFlagsBlock) continue;

    sanitizedLines.push(line);
  }

  // Trim leading/trailing empty lines and return
  return sanitizedLines.join('\n').trim();
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function AgentCard({ agent, response, isActive, mode: _mode, isCeo = false }: AgentCardProps): JSX.Element {
  const status = getDisplayStatus(response, isActive);
  const statusLabel = getStatusLabel(status);

  // Extract content (available for success, and optionally for error/terminal states)
  const rawContent = response?.status === 'success' ? response.content : response?.content;

  // Sanitize gatekeeping flags in ALL modes (CALL_CLAUDE, CALL_GEMINI, REASON_TAG)
  let content = rawContent
    ? sanitizeGatekeepingFlags(rawContent)
    : rawContent;

  // Get contextual sub-message for terminal states
  const subMessage = getStatusSubMessage(response);

  // Show FINAL DECISION badge for CEO with completed response (decision mode only — currently unused)
  const showFinalBadge = false;

  // Build class names
  const cardClasses = ['agent-card'];
  if (isCeo) cardClasses.push('agent-card--ceo');

  return (
    <div className={cardClasses.join(' ')}>
      <div className="agent-card__header">
        <span className={`agent-card__name agent-card__name--${agent}`}>
          {AGENT_LABELS[agent]}
        </span>
        {showFinalBadge && (
          <span className="agent-card__final-badge">FINAL DECISION</span>
        )}
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
