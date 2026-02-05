// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Reducer (Phase 2)
// =============================================================================

import type {
  Agent,
  BrainState,
  BrainAction,
  Carryover,
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
  mode: 'discussion',
  loopState: 'idle',
  resultArtifact: null,
  ceoExecutionPrompt: null,
  discussionSession: null,
  transcript: [],
  keyNotes: null,
  systemMessages: [],
  carryover: null,
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

      // Update discussion session metadata (Discussion mode only)
      const updatedSession =
        state.mode === 'discussion'
          ? createOrUpdateSession(state.discussionSession, newExchanges.length)
          : state.discussionSession;

      // Append to transcript (Discussion mode only, append-only)
      const newTranscriptEntries =
        state.mode === 'discussion'
          ? exchangeToTranscriptEntries(finalizedExchange)
          : [];
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
      const clearedSession: DiscussionSession | null =
        state.mode === 'discussion'
          ? {
              id: generateSessionId(),
              createdAt: Date.now(),
              lastUpdatedAt: Date.now(),
              exchangeCount: 0,
              schemaVersion: 1,
            }
          : state.discussionSession;

      // Clear transcript in discussion mode (new session = new transcript)
      const clearedTranscript = state.mode === 'discussion' ? [] : state.transcript;

      // Clear keyNotes and systemMessages in discussion mode
      const clearedKeyNotes = state.mode === 'discussion' ? null : state.keyNotes;
      const clearedSystemMessages: SystemMessage[] = state.mode === 'discussion' ? [] : state.systemMessages;

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
        transcript: clearedTranscript,
        keyNotes: clearedKeyNotes,
        systemMessages: clearedSystemMessages,
      };
    }

    // -------------------------------------------------------------------------
    // SET_MODE (Phase 2)
    // -------------------------------------------------------------------------
    case 'SET_MODE': {
      // Guard: Block mode change while processing
      if (state.isProcessing) {
        return state;
      }

      // Guard: Block mode change while loop is running
      if (state.loopState === 'running') {
        return state;
      }

      return {
        ...state,
        mode: action.mode,
        // Reset loop state when mode changes
        loopState: 'idle',
      };
    }

    // -------------------------------------------------------------------------
    // START_EXECUTION_LOOP (Phase 2C — Project Mode Only)
    // -------------------------------------------------------------------------
    case 'START_EXECUTION_LOOP': {
      // Guard: Only allowed in project mode
      if (state.mode !== 'project') {
        return state;
      }

      // Guard: Don't start if already running
      if (state.loopState === 'running') {
        return state;
      }

      return {
        ...state,
        loopState: 'running',
      };
    }

    // -------------------------------------------------------------------------
    // PAUSE_EXECUTION_LOOP (Phase 2C — Sets paused + Discussion mode)
    // -------------------------------------------------------------------------
    case 'PAUSE_EXECUTION_LOOP': {
      return {
        ...state,
        loopState: 'paused',
        mode: 'discussion',
      };
    }

    // -------------------------------------------------------------------------
    // STOP_EXECUTION_LOOP (Phase 2C — Sets idle + Discussion mode, keeps chat history)
    // -------------------------------------------------------------------------
    case 'STOP_EXECUTION_LOOP': {
      // Guard: Block if currently processing
      if (state.isProcessing) {
        return state;
      }

      return {
        ...state,
        loopState: 'idle',
        mode: 'discussion',
        // Reset loop-related state only, KEEP chat history (exchanges)
        pendingExchange: null,
        currentAgent: null,
        warningState: null,
        error: null,
        resultArtifact: null,
      };
    }

    // -------------------------------------------------------------------------
    // SET_RESULT_ARTIFACT (Phase 2C — Store Claude Code execution result)
    // -------------------------------------------------------------------------
    case 'SET_RESULT_ARTIFACT': {
      return {
        ...state,
        resultArtifact: action.artifact,
      };
    }

    // -------------------------------------------------------------------------
    // CEO_DONE_DETECTED (Phase 2C — CEO output DONE keyword)
    // -------------------------------------------------------------------------
    case 'CEO_DONE_DETECTED': {
      // Transition to idle, keep history, re-enable controls
      return {
        ...state,
        loopState: 'idle',
        // Keep exchanges and resultArtifact intact
      };
    }

    // -------------------------------------------------------------------------
    // SET_CEO_EXECUTION_PROMPT (Phase 2D — Persist prompt for Executor Panel)
    // -------------------------------------------------------------------------
    case 'SET_CEO_EXECUTION_PROMPT': {
      return {
        ...state,
        ceoExecutionPrompt: action.prompt,
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
        // Ensure we're in discussion mode after rehydration
        mode: 'discussion',
      };
    }

    // -------------------------------------------------------------------------
    // COMPACTION_COMPLETED (Discussion mode — trim exchanges, update keyNotes)
    // -------------------------------------------------------------------------
    case 'COMPACTION_COMPLETED': {
      // Guard: Only in discussion mode
      if (state.mode !== 'discussion') {
        return state;
      }

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
    // CREATE_CARRYOVER_FROM_DISCUSSION (Task 5.1 — Discussion→Project transfer)
    // -------------------------------------------------------------------------
    case 'CREATE_CARRYOVER_FROM_DISCUSSION': {
      // Guard: Only allowed in discussion mode
      if (state.mode !== 'discussion') {
        return state;
      }

      // Guard: Block if currently processing
      if (state.isProcessing) {
        return state;
      }

      // Guard: Require valid discussion session
      if (state.discussionSession === null) {
        return state;
      }

      // Guard: Require at least one exchange
      if (state.exchanges.length === 0) {
        return state;
      }

      // Create carryover with last 10 exchanges (strict slice)
      const last10Exchanges = state.exchanges.slice(-10);
      const carryover: Carryover = {
        schemaVersion: 1,
        fromSessionId: state.discussionSession.id,
        keyNotes: state.keyNotes,
        last10Exchanges,
        createdAt: Date.now(),
      };

      return {
        ...state,
        carryover,
      };
    }

    // -------------------------------------------------------------------------
    // CLEAR_CARRYOVER (Task 5.1 — Idempotent carryover clear)
    // -------------------------------------------------------------------------
    case 'CLEAR_CARRYOVER': {
      // Always succeeds (idempotent)
      return {
        ...state,
        carryover: null,
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
