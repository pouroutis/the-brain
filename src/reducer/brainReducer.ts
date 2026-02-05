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
  ProjectRun,
  ProjectInterrupt,
  SystemMessage,
  TranscriptEntry,
  TranscriptRole,
} from '../types/brain';

// Re-export constant for use in reducer
const MAX_REVISIONS = 2;

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
  projectError: null,
  lastProjectIntent: null,
  ghostOutput: null,
  projectRun: null,
  discussionCeoPromptArtifact: null,
};

// -----------------------------------------------------------------------------
// Helper: Generate Session ID
// -----------------------------------------------------------------------------

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// -----------------------------------------------------------------------------
// Helper: Generate Interrupt ID
// -----------------------------------------------------------------------------

function generateInterruptId(): string {
  return `int-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// -----------------------------------------------------------------------------
// Helper: Create Initial Project Run
// -----------------------------------------------------------------------------

function createInitialProjectRun(intent: string, epochId: number = 1): ProjectRun {
  return {
    phase: 'INTENT_RECEIVED',
    epochId,
    microEpochId: 1,
    revisionCount: 0,
    interrupts: [],
    lastIntent: intent,
    ceoPromptArtifact: null,
    executorOutput: null,
    error: null,
  };
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
      const clearedCeoPromptArtifact = state.mode === 'discussion' ? null : state.discussionCeoPromptArtifact;

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
        discussionCeoPromptArtifact: clearedCeoPromptArtifact,
        // Clear project-specific state when in project mode
        ...(state.mode === 'project' && {
          projectError: null,
          ghostOutput: null,
          lastProjectIntent: null,
          projectRun: null,
        }),
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
        // Clear project error when switching modes
        projectError: null,
        // Clear projectRun when leaving project mode
        ...(action.mode !== 'project' && { projectRun: null }),
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
        projectError: null,
        lastProjectIntent: action.intent ?? state.lastProjectIntent,
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
        projectError: null,
        ghostOutput: null,
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
    // PROJECT_GHOST_SUCCESS (STEP 3-4 — Ghost orchestrator succeeded)
    // -------------------------------------------------------------------------
    case 'PROJECT_GHOST_SUCCESS': {
      return {
        ...state,
        loopState: 'completed',
        ghostOutput: action.content,
        projectError: null,
      };
    }

    // -------------------------------------------------------------------------
    // PROJECT_GHOST_FAILED (STEP 3-4 — Ghost orchestrator failed)
    // -------------------------------------------------------------------------
    case 'PROJECT_GHOST_FAILED': {
      return {
        ...state,
        loopState: 'failed',
        projectError: action.error,
        ghostOutput: null,
      };
    }

    // -------------------------------------------------------------------------
    // PROJECT_RESET_ERROR (STEP 3-4 — Clear error for retry)
    // -------------------------------------------------------------------------
    case 'PROJECT_RESET_ERROR': {
      return {
        ...state,
        projectError: null,
        loopState: 'idle',
      };
    }

    // -------------------------------------------------------------------------
    // PROJECT_START_EPOCH — Start a new epoch with user intent
    // -------------------------------------------------------------------------
    case 'PROJECT_START_EPOCH': {
      // Guard: Only in project mode
      if (state.mode !== 'project') {
        return state;
      }

      const nextEpochId = state.projectRun ? state.projectRun.epochId + 1 : 1;
      const newRun = createInitialProjectRun(action.intent, nextEpochId);

      return {
        ...state,
        projectRun: newRun,
        loopState: 'running',
        projectError: null,
        lastProjectIntent: action.intent,
      };
    }

    // -------------------------------------------------------------------------
    // PROJECT_SET_PHASE — Transition to a new phase (orchestrator only)
    // -------------------------------------------------------------------------
    case 'PROJECT_SET_PHASE': {
      // Guard: Require active projectRun
      if (!state.projectRun) {
        return state;
      }

      return {
        ...state,
        projectRun: {
          ...state.projectRun,
          phase: action.phase,
        },
        // Update loopState based on terminal phases
        ...(action.phase === 'DONE' && { loopState: 'completed' as const }),
        ...(action.phase === 'FAILED_REQUIRES_USER_DIRECTION' && { loopState: 'failed' as const }),
      };
    }

    // -------------------------------------------------------------------------
    // PROJECT_ADD_INTERRUPT — Add a structured interrupt
    // -------------------------------------------------------------------------
    case 'PROJECT_ADD_INTERRUPT': {
      // Guard: Require active projectRun
      if (!state.projectRun) {
        return state;
      }

      const newInterrupt: ProjectInterrupt = {
        id: generateInterruptId(),
        message: action.interrupt.message,
        severity: action.interrupt.severity,
        scope: action.interrupt.scope,
        timestamp: Date.now(),
        processed: false,
      };

      // Blocker: Immediate pause
      if (action.interrupt.severity === 'blocker') {
        return {
          ...state,
          loopState: 'paused',
          projectRun: {
            ...state.projectRun,
            interrupts: [...state.projectRun.interrupts, newInterrupt],
          },
        };
      }

      // Improvement: Queue only
      return {
        ...state,
        projectRun: {
          ...state.projectRun,
          interrupts: [...state.projectRun.interrupts, newInterrupt],
        },
      };
    }

    // -------------------------------------------------------------------------
    // PROJECT_PROCESS_BLOCKER — Restart as new micro-epoch after blocker
    // -------------------------------------------------------------------------
    case 'PROJECT_PROCESS_BLOCKER': {
      // Guard: Require active projectRun
      if (!state.projectRun) {
        return state;
      }

      // Check revision cap
      const newRevisionCount = state.projectRun.revisionCount + 1;
      if (newRevisionCount > MAX_REVISIONS) {
        // Exceeded cap: terminal failure
        return {
          ...state,
          loopState: 'failed',
          projectRun: {
            ...state.projectRun,
            phase: 'FAILED_REQUIRES_USER_DIRECTION',
            revisionCount: newRevisionCount,
            error: `Revision cap exceeded (max ${MAX_REVISIONS} per epoch)`,
          },
        };
      }

      // Mark all unprocessed blockers as processed, restart micro-epoch
      const processedInterrupts = state.projectRun.interrupts.map((int) =>
        int.severity === 'blocker' && !int.processed
          ? { ...int, processed: true }
          : int
      );

      return {
        ...state,
        loopState: 'running',
        projectRun: {
          ...state.projectRun,
          phase: 'INTENT_RECEIVED',
          microEpochId: state.projectRun.microEpochId + 1,
          revisionCount: newRevisionCount,
          interrupts: processedInterrupts,
        },
      };
    }

    // -------------------------------------------------------------------------
    // PROJECT_SET_CEO_ARTIFACT — Store CEO-generated Claude Code prompt
    // -------------------------------------------------------------------------
    case 'PROJECT_SET_CEO_ARTIFACT': {
      // Guard: Require active projectRun
      if (!state.projectRun) {
        return state;
      }

      return {
        ...state,
        projectRun: {
          ...state.projectRun,
          ceoPromptArtifact: action.artifact,
        },
        ceoExecutionPrompt: action.artifact,
      };
    }

    // -------------------------------------------------------------------------
    // PROJECT_SET_EXECUTOR_OUTPUT — Store executor output artifact
    // -------------------------------------------------------------------------
    case 'PROJECT_SET_EXECUTOR_OUTPUT': {
      // Guard: Require active projectRun
      if (!state.projectRun) {
        return state;
      }

      return {
        ...state,
        projectRun: {
          ...state.projectRun,
          executorOutput: action.output,
        },
        resultArtifact: action.output,
      };
    }

    // -------------------------------------------------------------------------
    // PROJECT_NEW_DIRECTION — Start fresh epoch after DONE or FAILED
    // -------------------------------------------------------------------------
    case 'PROJECT_NEW_DIRECTION': {
      // Guard: Only in project mode
      if (state.mode !== 'project') {
        return state;
      }

      const nextEpochId = state.projectRun ? state.projectRun.epochId + 1 : 1;
      const newRun = createInitialProjectRun(action.intent, nextEpochId);

      return {
        ...state,
        projectRun: newRun,
        loopState: 'running',
        projectError: null,
        lastProjectIntent: action.intent,
        // Clear previous artifacts
        ghostOutput: null,
        resultArtifact: null,
        ceoExecutionPrompt: null,
      };
    }

    // -------------------------------------------------------------------------
    // PROJECT_MARK_DONE — User marks project as done
    // -------------------------------------------------------------------------
    case 'PROJECT_MARK_DONE': {
      // Guard: Require active projectRun
      if (!state.projectRun) {
        return state;
      }

      return {
        ...state,
        loopState: 'completed',
        projectRun: {
          ...state.projectRun,
          phase: 'DONE',
        },
      };
    }

    // -------------------------------------------------------------------------
    // PROJECT_FORCE_FAIL — Force terminal failure (Stop button)
    // -------------------------------------------------------------------------
    case 'PROJECT_FORCE_FAIL': {
      // Guard: Require active projectRun
      if (!state.projectRun) {
        return state;
      }

      return {
        ...state,
        loopState: 'failed',
        projectRun: {
          ...state.projectRun,
          phase: 'FAILED_REQUIRES_USER_DIRECTION',
          error: 'Stopped by user',
        },
      };
    }

    // -------------------------------------------------------------------------
    // SET_DISCUSSION_CEO_PROMPT_ARTIFACT — Store CEO prompt artifact (Discussion mode)
    // -------------------------------------------------------------------------
    case 'SET_DISCUSSION_CEO_PROMPT_ARTIFACT': {
      // Guard: Only in discussion mode
      if (state.mode !== 'discussion') {
        return state;
      }

      return {
        ...state,
        discussionCeoPromptArtifact: action.artifact,
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
