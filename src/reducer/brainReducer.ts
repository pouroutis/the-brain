// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Reducer
// =============================================================================

import type {
  Agent,
  BrainState,
  BrainAction,
  DiscussionSession,
  Exchange,
  PendingExchange,
  Round,
  TranscriptEntry,
  TranscriptRole,
} from '../types/brain';

// -----------------------------------------------------------------------------
// Initial State
// -----------------------------------------------------------------------------

export const initialBrainState: BrainState = {
  exchanges: [],
  pendingExchange: null,
  currentAgent: null,
  isProcessing: false,
  userCancelled: false,
  warningState: null,
  error: null,
  clearBoardVersion: 0,
  discussionSession: null,
  transcript: [],
};

// -----------------------------------------------------------------------------
// Helper: Generate Session ID
// -----------------------------------------------------------------------------

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// -----------------------------------------------------------------------------
// Helper: Create or Update Discussion Session
// -----------------------------------------------------------------------------

function createOrUpdateSession(
  existing: DiscussionSession | null,
  exchangeCount: number
): DiscussionSession {
  const now = Date.now();
  if (existing) {
    return {
      ...existing,
      lastUpdatedAt: now,
      exchangeCount,
    };
  }
  return {
    id: generateSessionId(),
    createdAt: now,
    lastUpdatedAt: now,
    exchangeCount,
    schemaVersion: 1,
  };
}

// -----------------------------------------------------------------------------
// Helper: Generate Exchange ID
// -----------------------------------------------------------------------------

function generateExchangeId(): string {
  return `ex-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// -----------------------------------------------------------------------------
// Helper: Get Latest Round (V3-A)
// -----------------------------------------------------------------------------

export function getLatestRound(exchange: Exchange): Round {
  return exchange.rounds[exchange.rounds.length - 1];
}

// -----------------------------------------------------------------------------
// Helper: Convert Exchange to Transcript Entries (Append-Only)
// -----------------------------------------------------------------------------

function exchangeToTranscriptEntries(exchange: Exchange): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  // Add user prompt first (no roundNumber — user entry is per-exchange)
  entries.push({
    exchangeId: exchange.id,
    role: 'user',
    content: exchange.userPrompt,
    timestamp: exchange.timestamp,
  });

  // Iterate ALL stored rounds
  const agentOrder: TranscriptRole[] = ['gpt', 'claude', 'gemini'];
  for (const round of exchange.rounds) {
    for (const agent of agentOrder) {
      const response = round.responsesByAgent[agent as Agent];
      if (response) {
        const entry: TranscriptEntry = {
          exchangeId: exchange.id,
          role: agent,
          content: response.status === 'success' ? (response.content ?? '') : `[${response.status}]`,
          timestamp: response.timestamp,
          roundNumber: round.roundNumber,
          status: response.status,
        };
        entries.push(entry);
      }
    }
  }

  return entries;
}

// -----------------------------------------------------------------------------
// Helper: Check runId Match
// -----------------------------------------------------------------------------

function isRunIdMatch(state: BrainState, runId: string): boolean {
  return state.pendingExchange !== null && state.pendingExchange.runId === runId;
}

// -----------------------------------------------------------------------------
// Reducer
// -----------------------------------------------------------------------------

export function brainReducer(state: BrainState, action: BrainAction): BrainState {
  switch (action.type) {
    // -------------------------------------------------------------------------
    // SUBMIT_START
    // -------------------------------------------------------------------------
    case 'SUBMIT_START': {
      // Guard: Block if already processing (double-submit protection)
      if (state.isProcessing) {
        return state;
      }

      const newPendingExchange: PendingExchange = {
        runId: action.runId,
        userPrompt: action.userPrompt,
        responsesByAgent: {},
      };

      return {
        ...state,
        pendingExchange: newPendingExchange,
        currentAgent: 'gpt' as Agent,
        isProcessing: true,
        userCancelled: false,
        warningState: null,
        error: null,
      };
    }

    // -------------------------------------------------------------------------
    // AGENT_STARTED
    // -------------------------------------------------------------------------
    case 'AGENT_STARTED': {
      // Guard: Reject if runId mismatch
      if (!isRunIdMatch(state, action.runId)) {
        return state;
      }

      // Guard: Reject if not currently processing
      if (!state.isProcessing) {
        return state;
      }

      return {
        ...state,
        currentAgent: action.agent,
      };
    }

    // -------------------------------------------------------------------------
    // AGENT_COMPLETED
    // -------------------------------------------------------------------------
    case 'AGENT_COMPLETED': {
      // Guard: Reject if runId mismatch
      if (!isRunIdMatch(state, action.runId)) {
        return state;
      }

      // Guard: Reject if no pending exchange
      if (state.pendingExchange === null) {
        return state;
      }

      // Guard: Reject if response is undefined (malformed dispatch)
      if (!action.response) {
        return state;
      }

      const updatedResponsesByAgent = {
        ...state.pendingExchange.responsesByAgent,
        [action.response.agent]: action.response,
      };

      return {
        ...state,
        pendingExchange: {
          ...state.pendingExchange,
          responsesByAgent: updatedResponsesByAgent,
        },
        currentAgent: null,
      };
    }

    // -------------------------------------------------------------------------
    // SEQUENCE_COMPLETED (V3-B: carries accumulated rounds from orchestrator)
    // -------------------------------------------------------------------------
    case 'SEQUENCE_COMPLETED': {
      // Guard: Reject if runId mismatch
      if (!isRunIdMatch(state, action.runId)) {
        return state;
      }

      // Guard: Reject if no pending exchange
      if (state.pendingExchange === null) {
        return state;
      }

      const finalizedExchange: Exchange = {
        id: generateExchangeId(),
        userPrompt: state.pendingExchange.userPrompt,
        rounds: action.rounds,
        timestamp: Date.now(),
      };
      const newExchanges = [...state.exchanges, finalizedExchange];

      // Update discussion session metadata
      const updatedSession = createOrUpdateSession(state.discussionSession, newExchanges.length);

      // Append to transcript (append-only) — only if rounds exist
      let updatedTranscript = state.transcript;
      if (finalizedExchange.rounds.length > 0) {
        const newTranscriptEntries = exchangeToTranscriptEntries(finalizedExchange);
        updatedTranscript = [...state.transcript, ...newTranscriptEntries];
      }

      return {
        ...state,
        exchanges: newExchanges,
        pendingExchange: null,
        currentAgent: null,
        isProcessing: false,
        userCancelled: false,
        warningState: null,
        discussionSession: updatedSession,
        transcript: updatedTranscript,
      };
    }

    // -------------------------------------------------------------------------
    // CANCEL_REQUESTED
    // -------------------------------------------------------------------------
    case 'CANCEL_REQUESTED': {
      // Guard: Reject if runId mismatch
      if (!isRunIdMatch(state, action.runId)) {
        return state;
      }

      return {
        ...state,
        userCancelled: true,
      };
    }

    // -------------------------------------------------------------------------
    // CANCEL_COMPLETE (V3-B: carries accumulated rounds from orchestrator)
    // -------------------------------------------------------------------------
    case 'CANCEL_COMPLETE': {
      // Guard: Reject if runId mismatch
      if (!isRunIdMatch(state, action.runId)) {
        return state;
      }

      // Guard: Reject if no pending exchange
      if (state.pendingExchange === null) {
        return state;
      }

      const cancelledExchange: Exchange = {
        id: generateExchangeId(),
        userPrompt: state.pendingExchange.userPrompt,
        rounds: action.rounds,
        timestamp: Date.now(),
      };

      return {
        ...state,
        exchanges: [...state.exchanges, cancelledExchange],
        pendingExchange: null,
        currentAgent: null,
        isProcessing: false,
        userCancelled: false,
        warningState: null,
      };
    }

    // -------------------------------------------------------------------------
    // RESET_PENDING_ROUND (V3-B: clear responsesByAgent for next round)
    // -------------------------------------------------------------------------
    case 'RESET_PENDING_ROUND': {
      // Guard: Reject if runId mismatch
      if (!isRunIdMatch(state, action.runId)) {
        return state;
      }

      // Guard: Reject if no pending exchange
      if (state.pendingExchange === null) {
        return state;
      }

      return {
        ...state,
        pendingExchange: {
          ...state.pendingExchange,
          responsesByAgent: {},
        },
        currentAgent: null,
      };
    }

    // -------------------------------------------------------------------------
    // SET_WARNING
    // -------------------------------------------------------------------------
    case 'SET_WARNING': {
      // Guard: Reject if runId mismatch (warnings are sequence-scoped)
      if (!isRunIdMatch(state, action.runId)) {
        return state;
      }

      return {
        ...state,
        warningState: action.warning,
      };
    }

    // -------------------------------------------------------------------------
    // CLEAR
    // -------------------------------------------------------------------------
    case 'CLEAR': {
      // Guard: Block if currently processing
      if (state.isProcessing) {
        return state;
      }

      // Reset discussion session (start fresh)
      const clearedSession: DiscussionSession | null = {
        id: generateSessionId(),
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        exchangeCount: 0,
        schemaVersion: 1,
      };

      return {
        ...state,
        exchanges: [],
        pendingExchange: null,
        currentAgent: null,
        isProcessing: false,
        userCancelled: false,
        warningState: null,
        error: null,
        clearBoardVersion: state.clearBoardVersion + 1,
        discussionSession: clearedSession,
        transcript: [],
      };
    }

    // -------------------------------------------------------------------------
    // LOAD_CONVERSATION_SNAPSHOT (V2-H — swap-on-select)
    // -------------------------------------------------------------------------
    case 'LOAD_CONVERSATION_SNAPSHOT': {
      // Guard: Block if currently processing
      if (state.isProcessing) {
        return state;
      }

      return {
        ...initialBrainState,
        exchanges: action.exchanges,
        pendingExchange: action.pendingExchange,
        clearBoardVersion: state.clearBoardVersion,
      };
    }

    // -------------------------------------------------------------------------
    // Default: Unknown action type (TypeScript exhaustiveness)
    // -------------------------------------------------------------------------
    default: {
      const _exhaustiveCheck: never = action;
      void _exhaustiveCheck;
      return state;
    }
  }
}
