// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Core Type Definitions
// =============================================================================

// -----------------------------------------------------------------------------
// Agent Types
// -----------------------------------------------------------------------------

export type Agent = 'gpt' | 'claude' | 'gemini';

// -----------------------------------------------------------------------------
// Mode Types
// -----------------------------------------------------------------------------

export type BrainMode = 'discussion';

// -----------------------------------------------------------------------------
// Status Types
// -----------------------------------------------------------------------------

/**
 * Final status of an agent's participation in an exchange.
 * "loading" is NOT a status — it is derived from (isProcessing + currentAgent).
 */
export type AgentStatus = 'success' | 'error' | 'timeout' | 'cancelled' | 'skipped';

/**
 * Error classification — ONLY present when status === 'error'
 */
export type ErrorCode = 'network' | 'api' | 'rate_limit' | 'unknown';

// -----------------------------------------------------------------------------
// Warning Types
// -----------------------------------------------------------------------------

export type WarningType = 'context_limit' | 'exchange_limit' | 'timeout_warning';

export interface WarningState {
  type: WarningType;
  message: string;
  dismissable: boolean;
}

// -----------------------------------------------------------------------------
// Response Types (Discriminated Union by Status)
// -----------------------------------------------------------------------------

interface AgentResponseBase {
  agent: Agent;
  timestamp: number;
}

export interface AgentResponseSuccess extends AgentResponseBase {
  status: 'success';
  /** Required for success */
  content: string;
}

export interface AgentResponseError extends AgentResponseBase {
  status: 'error';
  /** Optional for error states */
  content?: string;
  /** Required when status is error */
  errorCode: ErrorCode;
  /** Optional human-readable error detail */
  errorMessage?: string;
}

export interface AgentResponseTerminal extends AgentResponseBase {
  status: 'timeout' | 'cancelled' | 'skipped';
  /** Optional for terminal states */
  content?: string;
}

export type AgentResponse =
  | AgentResponseSuccess
  | AgentResponseError
  | AgentResponseTerminal;

// -----------------------------------------------------------------------------
// Exchange Types
// -----------------------------------------------------------------------------

export interface Exchange {
  id: string;
  /** The user's message for THIS specific exchange */
  userPrompt: string;
  /** Keyed by agent — guarantees uniqueness, deterministic rendering */
  responsesByAgent: Partial<Record<Agent, AgentResponse>>;
  timestamp: number;
}

export interface PendingExchange {
  /** Unique identifier for this sequence run — validated on every state transition */
  runId: string;
  userPrompt: string;
  /** Keyed by agent — accumulates during sequence */
  responsesByAgent: Partial<Record<Agent, AgentResponse>>;
}

// -----------------------------------------------------------------------------
// Discussion Session (Persistence)
// -----------------------------------------------------------------------------

export interface DiscussionSession {
  /** Unique session identifier */
  id: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  lastUpdatedAt: number;
  /** Number of exchanges in session */
  exchangeCount: number;
  /** Schema version for migration support */
  schemaVersion: 1;
}

// -----------------------------------------------------------------------------
// Transcript (Append-Only Record)
// -----------------------------------------------------------------------------

export type TranscriptRole = 'user' | 'gpt' | 'claude' | 'gemini';

export interface TranscriptEntry {
  /** Reference to the exchange this entry belongs to */
  exchangeId: string;
  /** Role of the speaker */
  role: TranscriptRole;
  /** Exact verbatim content */
  content: string;
  /** Timestamp when this entry was created */
  timestamp: number;
}

// -----------------------------------------------------------------------------
// Brain State
// -----------------------------------------------------------------------------

export interface BrainState {
  exchanges: Exchange[];
  pendingExchange: PendingExchange | null;
  currentAgent: Agent | null;
  isProcessing: boolean;
  userCancelled: boolean;
  warningState: WarningState | null;
  error: string | null;
  clearBoardVersion: number;
  /** Discussion session metadata (persistence) */
  discussionSession: DiscussionSession | null;
  /** Full transcript (append-only) */
  transcript: TranscriptEntry[];
}

// -----------------------------------------------------------------------------
// Brain Actions (Reducer)
// -----------------------------------------------------------------------------

export type BrainAction =
  | { type: 'SUBMIT_START'; runId: string; userPrompt: string }
  | { type: 'AGENT_STARTED'; runId: string; agent: Agent }
  | { type: 'AGENT_COMPLETED'; runId: string; response: AgentResponse }
  | { type: 'SEQUENCE_COMPLETED'; runId: string }
  | { type: 'CANCEL_REQUESTED'; runId: string }
  | { type: 'CANCEL_COMPLETE'; runId: string }
  | { type: 'SET_WARNING'; runId: string; warning: WarningState | null }
  | { type: 'CLEAR' };

// -----------------------------------------------------------------------------
// Brain Events (Logging / Debugging) — 6 variants, contract-locked
// -----------------------------------------------------------------------------

type AgentCompletedEventError = {
  type: 'AGENT_COMPLETED';
  runId: string;
  agent: Agent;
  status: 'error';
  errorCode: ErrorCode;
  timestamp: number;
};

type AgentCompletedEventNonError = {
  type: 'AGENT_COMPLETED';
  runId: string;
  agent: Agent;
  status: 'success' | 'timeout' | 'cancelled' | 'skipped';
  timestamp: number;
};

export type BrainEvent =
  | { type: 'SEQUENCE_START'; runId: string; userPrompt: string; timestamp: number }
  | { type: 'AGENT_STARTED'; runId: string; agent: Agent; timestamp: number }
  | AgentCompletedEventError
  | AgentCompletedEventNonError
  | { type: 'SEQUENCE_CANCELLED'; runId: string; timestamp: number }
  | { type: 'SEQUENCE_TIMEOUT'; runId: string; agent: Agent; timestamp: number }
  | { type: 'SEQUENCE_COMPLETED'; runId: string; timestamp: number };
