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
  useState,
  type ReactNode,
} from 'react';

import type {
  Agent,
  AgentResponse,
  AgentStatus,
  BrainMode,
  BrainState,
  Exchange,
  LoopState,
  PendingExchange,
  WarningState,
  ErrorCode,
  GatekeepingFlags,
} from '../types/brain';

import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import { callAgent } from '../api/agentClient';
import { callGhostOrchestrator, isGhostEnabled } from '../api/ghostClient';
import { env } from '../config/env';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Agent call timeout in milliseconds (matches agentClient DEFAULT_TIMEOUT_MS)
 */
const AGENT_TIMEOUT_MS = 30_000;

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

/**
 * Compute agent order based on CEO.
 * CEO speaks LAST. Other advisors speak first in their natural order.
 *
 * Special case: When CEO=GPT, maintain backward-compatible order (GPT first)
 * because GPT serves dual role as gatekeeper + CEO. GPT's single response
 * contains both gatekeeping flags and the CEO decision.
 *
 * When CEO=gpt: gpt, claude, gemini (backward compatible, GPT is gatekeeper+CEO)
 * When CEO=claude: gpt, gemini, claude (GPT gatekeeps, Claude CEO speaks last)
 * When CEO=gemini: gpt, claude, gemini (GPT gatekeeps, Gemini CEO speaks last)
 */
function getAgentOrder(ceo: Agent): Agent[] {
  // Special case: GPT as CEO maintains original order for backward compatibility
  if (ceo === 'gpt') {
    return ['gpt', 'claude', 'gemini'];
  }
  // For other CEOs: GPT first (gatekeeper), then other advisor, then CEO last
  const allAgents: Agent[] = ['gpt', 'claude', 'gemini'];
  const advisors = allAgents.filter((a) => a !== ceo);
  return [...advisors, ceo];
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
  /** Toggle force all advisors mode (testing-phase override) */
  setForceAllAdvisors: (enabled: boolean) => void;
  /** Toggle project discussion mode (injects project context) */
  setProjectDiscussionMode: (enabled: boolean) => void;
  /** Set the CEO agent (speaks last, generates execution prompt) */
  setCeo: (agent: Agent) => void;
  /** Set the operating mode (Phase 2) */
  setMode: (mode: BrainMode) => void;
  /** Start the autonomous execution loop (Project mode only) */
  startExecutionLoop: () => void;
  /** Pause execution loop and return to Discussion mode */
  pauseExecutionLoop: () => void;
  /** Stop execution loop and clear context */
  stopExecutionLoop: () => void;
  /** Mark execution as DONE (Phase 2F — deterministic termination via UI) */
  markDone: () => void;
  /** Set the result artifact from Claude Code execution (Phase 2C) */
  setResultArtifact: (artifact: string | null) => void;
  /** Set the CEO execution prompt (Phase 2D — Executor Panel) */
  setCeoExecutionPrompt: (prompt: string | null) => void;
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
  /** Check if force all advisors mode is enabled */
  getForceAllAdvisors: () => boolean;
  /** Check if project discussion mode is enabled */
  getProjectDiscussionMode: () => boolean;
  /** Get the current CEO agent */
  getCeo: () => Agent;
  /** Get the current operating mode (Phase 2) */
  getMode: () => BrainMode;
  /** Get the loop state (Phase 2C) */
  getLoopState: () => LoopState;
  /** Check if loop is running (convenience helper) */
  isLoopRunning: () => boolean;
  /** Check if CEO can generate execution prompt (Project mode only) */
  canGenerateExecutionPrompt: () => boolean;
  /** Get the latest result artifact from Claude Code execution (Phase 2C) */
  getResultArtifact: () => string | null;
  /** Get the persisted CEO execution prompt (Phase 2D — Executor Panel) */
  getCeoExecutionPrompt: () => string | null;
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
  // Force All Advisors State (testing-phase override)
  // Initialized from env, can be toggled via UI
  // ---------------------------------------------------------------------------

  const [forceAllAdvisors, setForceAllAdvisorsState] = useState<boolean>(
    env.forceAllAdvisors
  );

  // Ref for reading current value during async operations
  const forceAllAdvisorsRef = useRef<boolean>(env.forceAllAdvisors);

  useEffect(() => {
    forceAllAdvisorsRef.current = forceAllAdvisors;
  }, [forceAllAdvisors]);

  // ---------------------------------------------------------------------------
  // Project Discussion Mode State
  // Initialized from env, can be toggled via UI
  // ---------------------------------------------------------------------------

  const [projectDiscussionMode, setProjectDiscussionModeState] = useState<boolean>(
    env.projectDiscussionMode
  );

  // Ref for reading current value during async operations
  const projectDiscussionModeRef = useRef<boolean>(env.projectDiscussionMode);

  useEffect(() => {
    projectDiscussionModeRef.current = projectDiscussionMode;
  }, [projectDiscussionMode]);

  // ---------------------------------------------------------------------------
  // CEO State (Phase 2A)
  // The CEO speaks last and is the only agent whose response becomes execution prompt
  // ---------------------------------------------------------------------------

  const [ceo, setCeoState] = useState<Agent>(env.defaultCeo);

  // Ref for reading current value during async operations
  const ceoRef = useRef<Agent>(env.defaultCeo);

  useEffect(() => {
    ceoRef.current = ceo;
  }, [ceo]);

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
      // EXCEPTION: Discussion mode ALWAYS uses client-side orchestration
      // -----------------------------------------------------------------------

      // Capture mode early for ghost/client branching decision
      const currentMode = state.mode;

      if (isGhostEnabled() && currentMode !== 'discussion') {
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
      // Single-Pass Mode (CEO-ordered sequence)
      // CEO speaks LAST. Gatekeeping only works when GPT is first (CEO≠GPT).
      // -----------------------------------------------------------------------

      let conversationContext = '';

      // Capture settings at start of run (currentMode already captured above)
      const useProjectContext = projectDiscussionModeRef.current;
      const currentCeo = ceoRef.current;
      const currentLoopState = state.loopState;
      // Note: forceAllAdvisorsRef removed — Phase 2F force-all makes it obsolete

      // Compute agent order: advisors first, CEO last
      const agentOrder = getAgentOrder(currentCeo);

      // Gatekeeping flags (only populated if GPT speaks first)
      let flags: GatekeepingFlags = {
        callClaude: true,
        callGemini: true,
        reasonTag: 'no_gatekeeping',
        valid: false,
      };

      // Helper to call an agent
      const callAgentWithTimeout = async (agent: Agent): Promise<AgentResponse> => {
        const agentAbortController = new AbortController();
        sequenceAbortController.signal.addEventListener('abort', () => {
          agentAbortController.abort();
        });

        const timeoutId = setTimeout(() => {
          agentAbortController.abort();
        }, AGENT_TIMEOUT_MS);

        callIndexRef.current += 1;

        const response = await callAgent(
          agent,
          userPrompt,
          conversationContext,
          agentAbortController,
          {
            runId,
            callIndex: callIndexRef.current,
            exchanges: state.exchanges,
            projectDiscussionMode: useProjectContext,
          }
        );

        clearTimeout(timeoutId);
        return response;
      };

      // Helper to check if agent should be called
      // Phase 2F: ALL modes force all agents (gatekeeping disabled for MVP)
      const shouldCallAgent = (_agent: Agent, _isCeo: boolean): boolean => {
        // ALL MODES: Force all agents (Discussion, Decision, Project)
        // Gatekeeping flags are ignored — all 3 agents always speak
        // CEO ordering is handled by getAgentOrder() — CEO speaks last
        return true;
      };

      // -----------------------------------------------------------------------
      // Call agents in CEO-ordered sequence
      // -----------------------------------------------------------------------

      for (let i = 0; i < agentOrder.length; i++) {
        const agent = agentOrder[i];
        const isCeoAgent = agent === currentCeo;
        const isFirstAgent = i === 0;

        // Check cancellation before each agent
        if (isCancelled()) {
          handleCancel();
          return;
        }

        // Check if agent should be called (gatekeeping for non-CEO)
        if (!shouldCallAgent(agent, isCeoAgent)) {
          continue;
        }

        dispatch({ type: 'AGENT_STARTED', runId, agent });

        const response = await callAgentWithTimeout(agent);

        // Post-await cancellation check
        if (isCancelled()) {
          handleCancel();
          return;
        }

        // Guard: Skip if response is undefined (malformed mock or edge case)
        if (!response) {
          continue;
        }

        dispatch({ type: 'AGENT_COMPLETED', runId, response });

        // Update conversation context with proper agent labels
        if (response.status === 'success' && response.content) {
          const agentLabels: Record<Agent, string> = {
            gpt: 'GPT',
            claude: 'Claude',
            gemini: 'Gemini',
          };
          conversationContext += `${agentLabels[agent]}: ${response.content}\n\n`;

          // DONE detection: If CEO outputs "DONE" keyword in Project mode while running
          // Case-insensitive, word-boundary match
          if (
            isCeoAgent &&
            currentMode === 'project' &&
            currentLoopState === 'running' &&
            /\bDONE\b/i.test(response.content)
          ) {
            dispatch({ type: 'CEO_DONE_DETECTED' });
          }
        }

        // Parse gatekeeping flags if GPT spoke first
        if (isFirstAgent && agent === 'gpt') {
          if (response.status === 'success' && response.content) {
            flags = parseGatekeepingFlags(response.content);
          } else {
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
        }
      }

      // -----------------------------------------------------------------------
      // Complete sequence
      // -----------------------------------------------------------------------

      // Final safety check: only complete if not cancelled and runId still matches
      if (!isCancelled() && activeRunIdRef.current === runId) {
        dispatch({ type: 'SEQUENCE_COMPLETED', runId });
      }

      // Clear refs
      activeRunIdRef.current = null;
      abortControllerRef.current = null;
    };

    // Start the sequence with error handling to ensure processing always resets
    runSequence().catch(() => {
      // On any unhandled error, ensure we clean up and reset processing state
      // Dispatch SEQUENCE_COMPLETED to reset isProcessing=false
      if (activeRunIdRef.current === runId) {
        dispatch({ type: 'SEQUENCE_COMPLETED', runId });
      }
      activeRunIdRef.current = null;
      abortControllerRef.current = null;
    });

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

  const setForceAllAdvisors = useCallback((enabled: boolean): void => {
    setForceAllAdvisorsState(enabled);
  }, []);

  const setProjectDiscussionMode = useCallback((enabled: boolean): void => {
    setProjectDiscussionModeState(enabled);
  }, []);

  const setCeo = useCallback((agent: Agent): void => {
    setCeoState(agent);
  }, []);

  const setMode = useCallback((mode: BrainMode): void => {
    dispatch({ type: 'SET_MODE', mode });
  }, []);

  const startExecutionLoop = useCallback((): void => {
    dispatch({ type: 'START_EXECUTION_LOOP' });
  }, []);

  const pauseExecutionLoop = useCallback((): void => {
    dispatch({ type: 'PAUSE_EXECUTION_LOOP' });
  }, []);

  const stopExecutionLoop = useCallback((): void => {
    dispatch({ type: 'STOP_EXECUTION_LOOP' });
  }, []);

  const markDone = useCallback((): void => {
    // Phase 2F: Deterministic termination via UI button
    // Reuses CEO_DONE_DETECTED action (sets loopState to 'idle')
    dispatch({ type: 'CEO_DONE_DETECTED' });
  }, []);

  const setResultArtifact = useCallback((artifact: string | null): void => {
    dispatch({ type: 'SET_RESULT_ARTIFACT', artifact });
  }, []);

  const setCeoExecutionPrompt = useCallback((prompt: string | null): void => {
    dispatch({ type: 'SET_CEO_EXECUTION_PROMPT', prompt });
  }, []);

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

  const getForceAllAdvisors = useCallback((): boolean => {
    return forceAllAdvisors;
  }, [forceAllAdvisors]);

  const getProjectDiscussionMode = useCallback((): boolean => {
    return projectDiscussionMode;
  }, [projectDiscussionMode]);

  const getCeo = useCallback((): Agent => {
    return ceo;
  }, [ceo]);

  const getMode = useCallback((): BrainMode => {
    return state.mode;
  }, [state.mode]);

  const getLoopState = useCallback((): LoopState => {
    return state.loopState;
  }, [state.loopState]);

  const isLoopRunning = useCallback((): boolean => {
    return state.loopState === 'running';
  }, [state.loopState]);

  const canGenerateExecutionPrompt = useCallback((): boolean => {
    // Only CEO can generate execution prompts, and only in Project mode
    return state.mode === 'project' && !state.isProcessing && state.exchanges.length > 0;
  }, [state.mode, state.isProcessing, state.exchanges]);

  const getResultArtifact = useCallback((): string | null => {
    return state.resultArtifact;
  }, [state.resultArtifact]);

  const getCeoExecutionPrompt = useCallback((): string | null => {
    return state.ceoExecutionPrompt;
  }, [state.ceoExecutionPrompt]);

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
      setForceAllAdvisors,
      setProjectDiscussionMode,
      setCeo,
      setMode,
      startExecutionLoop,
      pauseExecutionLoop,
      stopExecutionLoop,
      markDone,
      setResultArtifact,
      setCeoExecutionPrompt,
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
      getForceAllAdvisors,
      getProjectDiscussionMode,
      getCeo,
      getMode,
      getLoopState,
      isLoopRunning,
      canGenerateExecutionPrompt,
      getResultArtifact,
      getCeoExecutionPrompt,
    }),
    [
      submitPrompt,
      cancelSequence,
      clearBoard,
      dismissWarning,
      setForceAllAdvisors,
      setProjectDiscussionMode,
      setCeo,
      setMode,
      startExecutionLoop,
      pauseExecutionLoop,
      stopExecutionLoop,
      markDone,
      setResultArtifact,
      setCeoExecutionPrompt,
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
      getForceAllAdvisors,
      getProjectDiscussionMode,
      getCeo,
      getMode,
      getLoopState,
      isLoopRunning,
      canGenerateExecutionPrompt,
      getResultArtifact,
      getCeoExecutionPrompt,
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
