// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Reducer (Phase 2)
// =============================================================================

import type {
  Agent,
  BrainState,
  BrainAction,
  Exchange,
  PendingExchange,
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
};

// -----------------------------------------------------------------------------
// Helper: Generate Exchange ID
// -----------------------------------------------------------------------------

function generateExchangeId(): string {
  return `ex-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
    // Default: Unknown action type (TypeScript exhaustiveness)
    // -------------------------------------------------------------------------
    default: {
      const _exhaustiveCheck: never = action;
      void _exhaustiveCheck;
      return state;
    }
  }
}
