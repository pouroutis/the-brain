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
  SystemMessage,
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
  keyNotes: null,
  systemMessages: [],
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
// Helper: Generate System Message ID
// -----------------------------------------------------------------------------

function generateSystemMessageId(): string {
  return `sys-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// -----------------------------------------------------------------------------
// Helper: Create Compaction System Message
// -----------------------------------------------------------------------------

function createCompactionMessage(): SystemMessage {
  return {
    id: generateSystemMessageId(),
    type: 'compaction',
    message: 'Older messages compacted. Full history preserved.',
    timestamp: Date.now(),
  };
}

// -----------------------------------------------------------------------------
// Helper: Convert Exchange to Transcript Entries (Append-Only)
// -----------------------------------------------------------------------------

function exchangeToTranscriptEntries(exchange: Exchange): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  // Add user prompt first
  entries.push({
    exchangeId: exchange.id,
    role: 'user',
    content: exchange.userPrompt,
    timestamp: exchange.timestamp,
  });

  // Add agent responses in order: gpt, claude, gemini
  const agentOrder: TranscriptRole[] = ['gpt', 'claude', 'gemini'];
  for (const agent of agentOrder) {
    const response = exchange.responsesByAgent[agent as Agent];
    if (response && response.status === 'success' && response.content) {
      entries.push({
        exchangeId: exchange.id,
        role: agent,
        content: response.content,
        timestamp: response.timestamp,
      });
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
// Helper: Finalize Pending Exchange to Exchange
// -----------------------------------------------------------------------------

function finalizePendingExchange(pending: PendingExchange): Exchange {
  return {
    id: generateExchangeId(),
    userPrompt: pending.userPrompt,
    responsesByAgent: pending.responsesByAgent,
    timestamp: Date.now(),
  };
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
    // SEQUENCE_COMPLETED
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

      const finalizedExchange = finalizePendingExchange(state.pendingExchange);
      const newExchanges = [...state.exchanges, finalizedExchange];

      // Update discussion session metadata
      const updatedSession = createOrUpdateSession(state.discussionSession, newExchanges.length);

      // Append to transcript (append-only)
      const newTranscriptEntries = exchangeToTranscriptEntries(finalizedExchange);
      const updatedTranscript = [...state.transcript, ...newTranscriptEntries];

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
    // CANCEL_COMPLETE
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

      // Finalize without reasonTag (cancellation is signaled via terminal statuses)
      const finalizedExchange = finalizePendingExchange(state.pendingExchange);

      return {
        ...state,
        exchanges: [...state.exchanges, finalizedExchange],
        pendingExchange: null,
        currentAgent: null,
        isProcessing: false,
        userCancelled: false,
        warningState: null,
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
        keyNotes: null,
        systemMessages: [],
      };
    }

    // -------------------------------------------------------------------------
    // REHYDRATE_DISCUSSION (Persistence — restore from localStorage)
    // -------------------------------------------------------------------------
    case 'REHYDRATE_DISCUSSION': {
      // Guard: Block if currently processing
      if (state.isProcessing) {
        return state;
      }

      return {
        ...state,
        exchanges: action.exchanges,
        discussionSession: action.session,
        transcript: action.transcript,
        keyNotes: action.keyNotes,
      };
    }

    // -------------------------------------------------------------------------
    // COMPACTION_COMPLETED (trim exchanges, update keyNotes)
    // -------------------------------------------------------------------------
    case 'COMPACTION_COMPLETED': {
      // Guard: Block if currently processing
      if (state.isProcessing) {
        return state;
      }

      return {
        ...state,
        exchanges: action.trimmedExchanges,
        keyNotes: action.keyNotes,
        systemMessages: [...state.systemMessages, createCompactionMessage()],
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
