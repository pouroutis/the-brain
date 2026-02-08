// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Context / Provider with Orchestrator
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
  BrainState,
  Exchange,
  PendingExchange,
  WarningState,
  ErrorCode,
} from '../types/brain';
import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import { callAgent } from '../api/agentClient';
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
 * Gatekeeping flags parsed from GPT's response.
 */
interface GatekeepingFlags {
  callClaude: boolean;
  callGemini: boolean;
  reasonTag: string;
  valid: boolean;
}

/**
 * Parse GPT's gatekeeping response to extract routing flags.
 */
function parseGatekeepingFlags(content: string): GatekeepingFlags {
  const defaultFlags: GatekeepingFlags = {
    callClaude: true,
    callGemini: true,
    reasonTag: 'parse_failed',
    valid: false,
  };

  try {
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
 * Compute agent order based on anchor agent.
 * Anchor ALWAYS speaks LAST. Other agents speak first in priority order.
 */
function getAgentOrder(anchorAgent: Agent): Agent[] {
  const priorityOrder: Agent[] = ['gemini', 'claude', 'gpt'];
  const others = priorityOrder.filter((a) => a !== anchorAgent);
  return [...others, anchorAgent];
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
  /** Load a conversation snapshot into BrainState (V2-H swap-on-select) */
  loadConversationSnapshot: (exchanges: Exchange[], pendingExchange: PendingExchange | null) => void;
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
  /** Get the current anchor agent (speaks last) */
  getAnchorAgent: () => Agent;
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
  // ---------------------------------------------------------------------------

  const [forceAllAdvisors, setForceAllAdvisorsState] = useState<boolean>(
    env.forceAllAdvisors
  );

  const forceAllAdvisorsRef = useRef<boolean>(env.forceAllAdvisors);

  useEffect(() => {
    forceAllAdvisorsRef.current = forceAllAdvisors;
  }, [forceAllAdvisors]);

  // ---------------------------------------------------------------------------
  // Project Discussion Mode State
  // ---------------------------------------------------------------------------

  const [projectDiscussionMode, setProjectDiscussionModeState] = useState<boolean>(
    env.projectDiscussionMode
  );

  const projectDiscussionModeRef = useRef<boolean>(env.projectDiscussionMode);

  useEffect(() => {
    projectDiscussionModeRef.current = projectDiscussionMode;
  }, [projectDiscussionMode]);

  // ---------------------------------------------------------------------------
  // Anchor Agent State
  // ---------------------------------------------------------------------------

  const [anchorAgent, setAnchorAgentState] = useState<Agent>(env.defaultAnchorAgent);
  void setAnchorAgentState; // Retained — mutation path removed but useState preserved

  const anchorAgentRef = useRef<Agent>(env.defaultAnchorAgent);

  useEffect(() => {
    anchorAgentRef.current = anchorAgent;
  }, [anchorAgent]);

  // ---------------------------------------------------------------------------
  // Orchestrator Refs (stable across renders, avoid stale closures)
  // ---------------------------------------------------------------------------

  const activeRunIdRef = useRef<string | null>(null);
  const userCancelledRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const callIndexRef = useRef<number>(0);

  useEffect(() => {
    userCancelledRef.current = state.userCancelled;
  }, [state.userCancelled]);

  // ---------------------------------------------------------------------------
  // Orchestrator: Main Sequence Effect
  // ---------------------------------------------------------------------------

  const currentRunId = state.pendingExchange?.runId ?? null;

  useEffect(() => {
    if (currentRunId === null) {
      return;
    }

    if (activeRunIdRef.current === currentRunId) {
      return;
    }

    activeRunIdRef.current = currentRunId;
    callIndexRef.current = 0;

    const runId = currentRunId;
    const userPrompt = state.pendingExchange?.userPrompt ?? '';

    const sequenceAbortController = new AbortController();
    abortControllerRef.current = sequenceAbortController;

    const handleCancel = (): void => {
      sequenceAbortController.abort();
      dispatch({ type: 'CANCEL_COMPLETE', runId });
      activeRunIdRef.current = null;
      abortControllerRef.current = null;
    };

    const isCancelled = (): boolean => userCancelledRef.current;

    const runSequence = async (): Promise<void> => {
      let conversationContext = '';
      const useProjectContext = projectDiscussionModeRef.current;
      const currentAnchor = anchorAgentRef.current;

      const agentOrder = getAgentOrder(currentAnchor);

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

      let flags: GatekeepingFlags = {
        callClaude: true,
        callGemini: true,
        reasonTag: 'no_gatekeeping',
        valid: false,
      };

      for (let i = 0; i < agentOrder.length; i++) {
        const agent = agentOrder[i];
        const isFirstAgent = i === 0;

        if (isCancelled()) {
          handleCancel();
          return;
        }

        dispatch({ type: 'AGENT_STARTED', runId, agent });

        const response = await callAgentWithTimeout(agent);

        if (isCancelled()) {
          handleCancel();
          return;
        }

        if (!response) {
          continue;
        }

        dispatch({ type: 'AGENT_COMPLETED', runId, response });

        if (response.status === 'success' && response.content) {
          const agentLabels: Record<Agent, string> = {
            gpt: 'GPT',
            claude: 'Claude',
            gemini: 'Gemini',
          };
          conversationContext += `${agentLabels[agent]}: ${response.content}\n\n`;
        }

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

      if (!isCancelled() && activeRunIdRef.current === runId) {
        dispatch({ type: 'SEQUENCE_COMPLETED', runId });
      }

      activeRunIdRef.current = null;
      abortControllerRef.current = null;
    };

    runSequence().catch(() => {
      if (activeRunIdRef.current === runId) {
        dispatch({ type: 'SEQUENCE_COMPLETED', runId });
      }
      activeRunIdRef.current = null;
      abortControllerRef.current = null;
    });

    return () => {
      sequenceAbortController.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRunId]);

  // ---------------------------------------------------------------------------
  // Action Creators
  // ---------------------------------------------------------------------------

  const submitPrompt = useCallback((userPrompt: string): string => {
    if (state.isProcessing) {
      return '';
    }

    const runId = generateRunId();
    dispatch({ type: 'SUBMIT_START', runId, userPrompt });

    return runId;
  }, [state.isProcessing]);

  const cancelSequence = useCallback((): void => {
    if (state.pendingExchange === null) {
      return;
    }
    dispatch({ type: 'CANCEL_REQUESTED', runId: state.pendingExchange.runId });
  }, [state.pendingExchange]);

  const clearBoard = useCallback((): void => {
    if (state.isProcessing) {
      return;
    }
    dispatch({ type: 'CLEAR' });
  }, [state.isProcessing]);

  const dismissWarning = useCallback((): void => {
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

  const loadConversationSnapshot = useCallback(
    (exchanges: Exchange[], pendingExchange: PendingExchange | null): void => {
      dispatch({ type: 'LOAD_CONVERSATION_SNAPSHOT', exchanges, pendingExchange });
    },
    [],
  );

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
      if (state.pendingExchange !== null) {
        const pendingResponse = state.pendingExchange.responsesByAgent[agent];
        if (pendingResponse !== undefined) {
          return pendingResponse;
        }
      }

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

  const getAnchorAgent = useCallback((): Agent => {
    return anchorAgent;
  }, [anchorAgent]);

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
      loadConversationSnapshot,
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
      getAnchorAgent,
    }),
    [
      submitPrompt,
      cancelSequence,
      clearBoard,
      dismissWarning,
      setForceAllAdvisors,
      setProjectDiscussionMode,
      loadConversationSnapshot,
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
      getAnchorAgent,
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
