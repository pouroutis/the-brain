// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Context / Provider with Orchestrator (Phase 2 — Steps 3 & 4)
// =============================================================================

import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

import type {
  Agent,
  AgentResponse,
  AgentStatus,
  BrainState,
  Exchange,
  PendingExchange,
  WarningState,
  ErrorCode,
  GatekeepingFlags,
} from '../types/brain';

import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import { callAgent } from '../api/agentClient';
import { callGhostOrchestrator, isGhostEnabled } from '../api/ghostClient';

// -----------------------------------------------------------------------------
// Helper: Generate Run ID
// -----------------------------------------------------------------------------

function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// -----------------------------------------------------------------------------
// Orchestrator Helpers
// -----------------------------------------------------------------------------

/**
 * Parse GPT's gatekeeping response to extract routing flags.
 * Expected format in response:
 * ---
 * CALL_CLAUDE=true|false
 * CALL_GEMINI=true|false
 * REASON_TAG=some_tag
 * ---
 */
function parseGatekeepingFlags(content: string): GatekeepingFlags {
  const defaultFlags: GatekeepingFlags = {
    callClaude: true,
    callGemini: true,
    reasonTag: 'parse_failed',
    valid: false,
  };

  try {
    // Look for the flags block
    const callClaudeMatch = content.match(/CALL_CLAUDE\s*=\s*(true|false)/i);
    const callGeminiMatch = content.match(/CALL_GEMINI\s*=\s*(true|false)/i);
    const reasonTagMatch = content.match(/REASON_TAG\s*=\s*(\S+)/i);

    if (!callClaudeMatch || !callGeminiMatch) {
      return defaultFlags;
    }

    return {
      callClaude: callClaudeMatch[1].toLowerCase() === 'true',
      callGemini: callGeminiMatch[1].toLowerCase() === 'true',
      reasonTag: reasonTagMatch?.[1] ?? 'default',
      valid: true,
    };
  } catch {
    return defaultFlags;
  }
}

// -----------------------------------------------------------------------------
// Context Types
// -----------------------------------------------------------------------------

/**
 * Action Creators — wrapped with auto-generated runId where applicable.
 * Raw dispatch is NOT exposed.
 */
interface BrainActions {
  /** Start a new sequence with a user prompt. Auto-generates runId. */
  submitPrompt: (userPrompt: string) => string;
  /** Request cancellation of the current sequence. No-op if no active sequence. */
  cancelSequence: () => void;
  /** Clear the board (all exchanges). No-op if currently processing. */
  clearBoard: () => void;
  /** Dismiss the current warning. No-op if no active runId. */
  dismissWarning: () => void;
}

/**
 * Selectors — pure functions derived from state.
 * All selectors are stable references via useCallback.
 */
interface BrainSelectors {
  /** Get the full state (read-only snapshot) */
  getState: () => BrainState;
  /** Get the active runId, or null if no sequence in progress */
  getActiveRunId: () => string | null;
  /** Get the pending exchange, or null */
  getPendingExchange: () => PendingExchange | null;
  /** Get all completed exchanges */
  getExchanges: () => Exchange[];
  /** Get the count of completed exchanges */
  getExchangeCount: () => number;
  /** Get the last completed exchange, or null */
  getLastExchange: () => Exchange | null;
  /** Check if a sequence is currently processing */
  isProcessing: () => boolean;
  /** Check if a specific agent is currently active (being called) */
  isAgentActive: (agent: Agent) => boolean;
  /** Get an agent's response — prioritizes pendingExchange, falls back to last exchange */
  getAgentResponse: (agent: Agent) => AgentResponse | null;
  /** Get an agent's status — prioritizes pendingExchange, falls back to last exchange */
  getAgentStatus: (agent: Agent) => AgentStatus | null;
  /** Get the global error (state.error), or null */
  getGlobalError: () => string | null;
  /** Get an agent's error code if status is 'error', or null */
  getAgentError: (agent: Agent) => ErrorCode | null;
  /** Get the current warning state, or null */
  getWarning: () => WarningState | null;
  /** Check if a new prompt can be submitted (not processing) */
  canSubmit: () => boolean;
  /** Check if the board can be cleared (not processing, has exchanges) */
  canClear: () => boolean;
}

/**
 * Combined context value — actions + selectors, memoized.
 */
interface BrainContextValue extends BrainActions, BrainSelectors {}

// -----------------------------------------------------------------------------
// Context Creation
// -----------------------------------------------------------------------------

const BrainContext = createContext<BrainContextValue | null>(null);

// -----------------------------------------------------------------------------
// Provider Component
// -----------------------------------------------------------------------------

interface BrainProviderProps {
  children: ReactNode;
}

export function BrainProvider({ children }: BrainProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(brainReducer, initialBrainState);

  // ---------------------------------------------------------------------------
  // Orchestrator Refs (stable across renders, avoid stale closures)
  // ---------------------------------------------------------------------------

  /** Tracks the currently orchestrating runId to prevent duplicate runs */
  const activeRunIdRef = useRef<string | null>(null);

  /** Synced from state.userCancelled to read fresh value during awaits */
  const userCancelledRef = useRef<boolean>(false);

  /** Current in-flight AbortController for cancellation/cleanup */
  const abortControllerRef = useRef<AbortController | null>(null);

  /** Run-scoped call counter for cost control (Phase 5) */
  const callIndexRef = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // Sync userCancelled state to ref (for reading during async operations)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    userCancelledRef.current = state.userCancelled;
  }, [state.userCancelled]);

  // ---------------------------------------------------------------------------
  // Orchestrator: Main Sequence Effect
  // ---------------------------------------------------------------------------

  const currentRunId = state.pendingExchange?.runId ?? null;

  useEffect(() => {
    // Only trigger on runId transition (null → new runId)
    if (currentRunId === null) {
      return;
    }

    // Idempotency: skip if already orchestrating this runId
    if (activeRunIdRef.current === currentRunId) {
      return;
    }

    // Set activeRunIdRef synchronously BEFORE any async boundary
    activeRunIdRef.current = currentRunId;

    // Reset call counter for new run (Phase 5 cost control)
    callIndexRef.current = 0;

    // Capture runId for this run (stable reference)
    const runId = currentRunId;
    
    // Read userPrompt from state at the moment runId is observed (snapshot)
    // This is safe because runId only transitions when SUBMIT_START creates a new pendingExchange
    const userPrompt = state.pendingExchange?.userPrompt ?? '';

    // Create abort controller for this sequence
    const sequenceAbortController = new AbortController();
    abortControllerRef.current = sequenceAbortController;

    /**
     * Handle cancellation: abort in-flight, dispatch CANCEL_COMPLETE
     */
    const handleCancel = (): void => {
      // Abort any in-flight request
      sequenceAbortController.abort();
      // Dispatch CANCEL_COMPLETE (runId-guarded by reducer)
      dispatch({ type: 'CANCEL_COMPLETE', runId });
      // Clear active ref
      activeRunIdRef.current = null;
      abortControllerRef.current = null;
    };

    /**
     * Check if cancelled (reads fresh ref value)
     */
    const isCancelled = (): boolean => userCancelledRef.current;

    /**
     * Run the orchestration sequence
     */
    const runSequence = async (): Promise<void> => {
      // -----------------------------------------------------------------------
      // Ghost Mode Branch (Phase 9B)
      // Per Phase 9A: CEO mode always uses Ghost (server-side enforced)
      // -----------------------------------------------------------------------
      
      if (isGhostEnabled()) {
        // Dispatch AGENT_STARTED for GPT (Ghost orchestrator is GPT-led)
        dispatch({ type: 'AGENT_STARTED', runId, agent: 'gpt' });
        
        // Call Ghost orchestrator (server-side deliberation)
        const ghostResult = await callGhostOrchestrator(userPrompt, sequenceAbortController);
        
        // Check for cancellation
        if (isCancelled()) {
          handleCancel();
          return;
        }
        
        // Handle Ghost response
        if (ghostResult.status === 'success' && ghostResult.content) {
          // Success: dispatch as GPT response (Ghost output is GPT-authored)
          dispatch({
            type: 'AGENT_COMPLETED',
            runId,
            response: {
              agent: 'gpt',
              timestamp: Date.now(),
              status: 'success',
              content: ghostResult.content,
            },
          });
        } else {
          // Error: dispatch as GPT error
          dispatch({
            type: 'AGENT_COMPLETED',
            runId,
            response: {
              agent: 'gpt',
              timestamp: Date.now(),
              status: 'error',
              errorCode: 'api',
              errorMessage: ghostResult.error ?? 'Ghost orchestration failed',
            },
          });
        }
        
        // Complete sequence (Ghost handles all deliberation internally)
        if (!isCancelled() && activeRunIdRef.current === runId) {
          dispatch({ type: 'SEQUENCE_COMPLETED', runId });
        }
        
        // Clear refs
        activeRunIdRef.current = null;
        abortControllerRef.current = null;
        return;
      }
      
      // -----------------------------------------------------------------------
      // Single-Pass Mode (existing logic, for non-Ghost flows)
      // -----------------------------------------------------------------------
      
      let conversationContext = '';

      // -----------------------------------------------------------------------
      // Step 1: Call GPT (gatekeeping)
      // -----------------------------------------------------------------------

      if (isCancelled()) {
        handleCancel();
        return;
      }

      dispatch({ type: 'AGENT_STARTED', runId, agent: 'gpt' });

      const gptAbortController = new AbortController();
      // Link to sequence abort
      sequenceAbortController.signal.addEventListener('abort', () => {
        gptAbortController.abort();
      });

      // Increment call counter (Phase 5)
      callIndexRef.current += 1;

      const gptResponse = await callAgent(
        'gpt',
        userPrompt,
        conversationContext,
        gptAbortController,
        { runId, callIndex: callIndexRef.current, exchanges: state.exchanges }
      );

      // Post-await cancellation check
      if (isCancelled()) {
        handleCancel();
        return;
      }

      dispatch({ type: 'AGENT_COMPLETED', runId, response: gptResponse });

      // Update context with GPT's response
      if (gptResponse.status === 'success' && gptResponse.content) {
        conversationContext += `GPT: ${gptResponse.content}\n\n`;
      }

      // -----------------------------------------------------------------------
      // Step 2: Parse gatekeeping flags
      // -----------------------------------------------------------------------

      let flags: GatekeepingFlags;
      if (gptResponse.status === 'success' && gptResponse.content) {
        flags = parseGatekeepingFlags(gptResponse.content);
      } else {
        // GPT failed — fallback to calling all agents
        flags = {
          callClaude: true,
          callGemini: true,
          reasonTag: 'gpt_failed',
          valid: false,
        };
      }

      // Emit warning if parse failed
      if (!flags.valid) {
        dispatch({
          type: 'SET_WARNING',
          runId,
          warning: {
            type: 'context_limit',
            message: `Gatekeeping parse failed (${flags.reasonTag}). Calling all agents.`,
            dismissable: true,
          },
        });
      }

      // -----------------------------------------------------------------------
      // Step 3: Call Claude (if needed)
      // -----------------------------------------------------------------------

      if (flags.callClaude || !flags.valid) {
        if (isCancelled()) {
          handleCancel();
          return;
        }

        dispatch({ type: 'AGENT_STARTED', runId, agent: 'claude' });

        const claudeAbortController = new AbortController();
        sequenceAbortController.signal.addEventListener('abort', () => {
          claudeAbortController.abort();
        });

        // Increment call counter (Phase 5)
        callIndexRef.current += 1;

        const claudeResponse = await callAgent(
          'claude',
          userPrompt,
          conversationContext,
          claudeAbortController,
          { runId, callIndex: callIndexRef.current, exchanges: state.exchanges }
        );

        // Post-await cancellation check
        if (isCancelled()) {
          handleCancel();
          return;
        }

        dispatch({ type: 'AGENT_COMPLETED', runId, response: claudeResponse });

        // Update context with Claude's response
        if (claudeResponse.status === 'success' && claudeResponse.content) {
          conversationContext += `Claude: ${claudeResponse.content}\n\n`;
        }
      }

      // -----------------------------------------------------------------------
      // Step 4: Call Gemini (if needed)
      // -----------------------------------------------------------------------

      if (flags.callGemini || !flags.valid) {
        if (isCancelled()) {
          handleCancel();
          return;
        }

        dispatch({ type: 'AGENT_STARTED', runId, agent: 'gemini' });

        const geminiAbortController = new AbortController();
        sequenceAbortController.signal.addEventListener('abort', () => {
          geminiAbortController.abort();
        });

        // Increment call counter (Phase 5)
        callIndexRef.current += 1;

        const geminiResponse = await callAgent(
          'gemini',
          userPrompt,
          conversationContext,
          geminiAbortController,
          { runId, callIndex: callIndexRef.current, exchanges: state.exchanges }
        );

        // Post-await cancellation check
        if (isCancelled()) {
          handleCancel();
          return;
        }

        dispatch({ type: 'AGENT_COMPLETED', runId, response: geminiResponse });
      }

      // -----------------------------------------------------------------------
      // Step 5: Complete sequence
      // -----------------------------------------------------------------------

      // Final safety check: only complete if not cancelled and runId still matches
      if (!isCancelled() && activeRunIdRef.current === runId) {
        dispatch({ type: 'SEQUENCE_COMPLETED', runId });
      }

      // Clear refs
      activeRunIdRef.current = null;
      abortControllerRef.current = null;
    };

    // Start the sequence
    runSequence();

    // -------------------------------------------------------------------------
    // Cleanup: Abort on unmount or if effect re-runs
    // -------------------------------------------------------------------------

    return () => {
      // Abort any in-flight request to prevent ghost dispatch
      sequenceAbortController.abort();
      // Note: We don't dispatch here as component may be unmounting
    };
  // Note: state.pendingExchange is read inside effect for userPrompt snapshot.
  // This is safe because: (1) effect only fires on runId change, (2) idempotency
  // guard prevents re-runs, (3) userPrompt is captured synchronously before async.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRunId]);

  // ---------------------------------------------------------------------------
  // Action Creators
  // ---------------------------------------------------------------------------

  const submitPrompt = useCallback((userPrompt: string): string => {
    // Guard: Block if already processing (double-submit protection)
    if (state.isProcessing) {
      return '';
    }
    const runId = generateRunId();
    dispatch({ type: 'SUBMIT_START', runId, userPrompt });
    return runId;
  }, [state.isProcessing]);

  const cancelSequence = useCallback((): void => {
    // No-op if no active sequence
    if (state.pendingExchange === null) {
      return;
    }
    dispatch({ type: 'CANCEL_REQUESTED', runId: state.pendingExchange.runId });
  }, [state.pendingExchange]);

  const clearBoard = useCallback((): void => {
    // Guard: Block if currently processing
    if (state.isProcessing) {
      return;
    }
    dispatch({ type: 'CLEAR' });
  }, [state.isProcessing]);

  const dismissWarning = useCallback((): void => {
    // No-op if no active runId
    if (state.pendingExchange === null) {
      return;
    }
    dispatch({
      type: 'SET_WARNING',
      runId: state.pendingExchange.runId,
      warning: null,
    });
  }, [state.pendingExchange]);

  // ---------------------------------------------------------------------------
  // Selectors
  // ---------------------------------------------------------------------------

  const getState = useCallback((): BrainState => {
    return state;
  }, [state]);

  const getActiveRunId = useCallback((): string | null => {
    return state.pendingExchange?.runId ?? null;
  }, [state.pendingExchange]);

  const getPendingExchange = useCallback((): PendingExchange | null => {
    return state.pendingExchange;
  }, [state.pendingExchange]);

  const getExchanges = useCallback((): Exchange[] => {
    return state.exchanges;
  }, [state.exchanges]);

  const getExchangeCount = useCallback((): number => {
    return state.exchanges.length;
  }, [state.exchanges]);

  const getLastExchange = useCallback((): Exchange | null => {
    const { exchanges } = state;
    return exchanges.length > 0 ? exchanges[exchanges.length - 1] : null;
  }, [state.exchanges]);

  const isProcessing = useCallback((): boolean => {
    return state.isProcessing;
  }, [state.isProcessing]);

  const isAgentActive = useCallback(
    (agent: Agent): boolean => {
      return state.isProcessing && state.currentAgent === agent;
    },
    [state.isProcessing, state.currentAgent]
  );

  const getAgentResponse = useCallback(
    (agent: Agent): AgentResponse | null => {
      // Priority 1: pendingExchange (current sequence)
      if (state.pendingExchange !== null) {
        const pendingResponse = state.pendingExchange.responsesByAgent[agent];
        if (pendingResponse !== undefined) {
          return pendingResponse;
        }
      }

      // Priority 2: last completed exchange
      const { exchanges } = state;
      if (exchanges.length > 0) {
        const lastExchange = exchanges[exchanges.length - 1];
        const lastResponse = lastExchange.responsesByAgent[agent];
        if (lastResponse !== undefined) {
          return lastResponse;
        }
      }

      return null;
    },
    [state.pendingExchange, state.exchanges]
  );

  const getAgentStatus = useCallback(
    (agent: Agent): AgentStatus | null => {
      const response = getAgentResponse(agent);
      return response?.status ?? null;
    },
    [getAgentResponse]
  );

  const getGlobalError = useCallback((): string | null => {
    return state.error;
  }, [state.error]);

  const getAgentError = useCallback(
    (agent: Agent): ErrorCode | null => {
      const response = getAgentResponse(agent);
      // errorCode only exists when status === 'error'
      if (response !== null && response.status === 'error') {
        return response.errorCode;
      }
      return null;
    },
    [getAgentResponse]
  );

  const getWarning = useCallback((): WarningState | null => {
    return state.warningState;
  }, [state.warningState]);

  const canSubmit = useCallback((): boolean => {
    return !state.isProcessing;
  }, [state.isProcessing]);

  const canClear = useCallback((): boolean => {
    return !state.isProcessing && state.exchanges.length > 0;
  }, [state.isProcessing, state.exchanges]);

  // ---------------------------------------------------------------------------
  // Memoized Context Value
  // ---------------------------------------------------------------------------

  const contextValue = useMemo<BrainContextValue>(
    () => ({
      // Actions
      submitPrompt,
      cancelSequence,
      clearBoard,
      dismissWarning,
      // Selectors
      getState,
      getActiveRunId,
      getPendingExchange,
      getExchanges,
      getExchangeCount,
      getLastExchange,
      isProcessing,
      isAgentActive,
      getAgentResponse,
      getAgentStatus,
      getGlobalError,
      getAgentError,
      getWarning,
      canSubmit,
      canClear,
    }),
    [
      submitPrompt,
      cancelSequence,
      clearBoard,
      dismissWarning,
      getState,
      getActiveRunId,
      getPendingExchange,
      getExchanges,
      getExchangeCount,
      getLastExchange,
      isProcessing,
      isAgentActive,
      getAgentResponse,
      getAgentStatus,
      getGlobalError,
      getAgentError,
      getWarning,
      canSubmit,
      canClear,
    ]
  );

  return (
    <BrainContext.Provider value={contextValue}>
      {children}
    </BrainContext.Provider>
  );
}

// -----------------------------------------------------------------------------
// Hook: useBrain
// -----------------------------------------------------------------------------

/**
 * Access the Brain context. Must be used within a BrainProvider.
 * Throws if used outside provider.
 */
export function useBrain(): BrainContextValue {
  const context = useContext(BrainContext);
  if (context === null) {
    throw new Error('useBrain must be used within a BrainProvider');
  }
  return context;
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export { BrainContext };
export type { BrainContextValue, BrainActions, BrainSelectors };
