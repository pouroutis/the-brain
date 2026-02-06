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
  CeoPromptArtifact,
  Exchange,
  KeyNotes,
  LoopState,
  PendingExchange,
  ProjectRun,
  SystemMessage,
  WarningState,
  ErrorCode,
  GatekeepingFlags,
  InterruptSeverity,
  InterruptScope,
} from '../types/brain';

import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import { callAgent } from '../api/agentClient';
import { callGhostOrchestrator, getGhostErrorMessage } from '../api/ghostClient';
import type { GhostErrorCode } from '../types/ghost';
import { env } from '../config/env';
import {
  loadDiscussionState,
  saveDiscussionState,
} from '../utils/discussionPersistence';
import {
  shouldCompact,
  getExchangesToCompact,
  getExchangesToKeep,
  buildCompactionPrompt,
  parseKeyNotes,
  mergeKeyNotes,
} from '../utils/compaction';
import { buildDiscussionMemoryBlock, buildCarryoverMemoryBlock } from '../utils/contextBuilder';

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
 * CEO ALWAYS speaks LAST. Non-CEO advisors speak first in priority order.
 *
 * Priority order: Gemini first, Claude second, then CEO last.
 *
 * Order examples:
 * - When CEO=gpt: gemini, claude, gpt (CEO last)
 * - When CEO=claude: gemini, gpt, claude (CEO last)
 * - When CEO=gemini: claude, gpt, gemini (CEO last)
 */
function getAgentOrder(ceo: Agent): Agent[] {
  // Priority order: gemini, claude, gpt
  // Remove CEO from this order, then append CEO at the end
  const priorityOrder: Agent[] = ['gemini', 'claude', 'gpt'];
  const advisors = priorityOrder.filter((a) => a !== ceo);
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
  startExecutionLoop: (intent?: string) => void;
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
  /** Switch from Discussion to Project mode with carryover (Task 5.3) */
  switchToProject: () => void;
  /** Return from Project to Discussion mode (Task 5.3) */
  returnToDiscussion: () => void;
  /** Retry ghost orchestrator call after failure (STEP 3-4) */
  retryExecution: () => void;
  /** Start a new project epoch with user intent */
  startProjectEpoch: (intent: string) => void;
  /** Add a structured interrupt to project */
  addProjectInterrupt: (message: string, severity: InterruptSeverity, scope: InterruptScope) => void;
  /** Process pending blocker and restart micro-epoch */
  processBlocker: () => void;
  /** Start a new direction/epoch after DONE or FAILED */
  newProjectDirection: (intent: string) => void;
  /** Mark project as done */
  markProjectDone: () => void;
  /** Force project to failed state */
  forceProjectFail: () => void;
  /** Set the discussion mode CEO prompt artifact */
  setDiscussionCeoPromptArtifact: (artifact: CeoPromptArtifact) => void;
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
  /** Get keyNotes from compacted exchanges (Discussion mode) */
  getKeyNotes: () => KeyNotes | null;
  /** Get system messages for inline notifications */
  getSystemMessages: () => SystemMessage[];
  /** Check if there is an active discussion session (Task 5.3) */
  hasActiveDiscussion: () => boolean;
  /** Get project error message (STEP 3-4) */
  getProjectError: () => string | null;
  /** Get ghost orchestrator output (STEP 3-4) */
  getGhostOutput: () => string | null;
  /** Get last project intent (STEP 3-4) */
  getLastProjectIntent: () => string | null;
  /** Get project run state */
  getProjectRun: () => ProjectRun | null;
  /** Get discussion mode CEO prompt artifact */
  getDiscussionCeoPromptArtifact: () => CeoPromptArtifact | null;
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

  /** Ghost orchestrator AbortController for Project mode (STEP 3-4) */
  const ghostAbortControllerRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------------------
  // Sync userCancelled state to ref (for reading during async operations)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    userCancelledRef.current = state.userCancelled;
  }, [state.userCancelled]);

  // ---------------------------------------------------------------------------
  // Discussion Persistence: Rehydration on mount
  // ---------------------------------------------------------------------------

  const hasRehydratedRef = useRef(false);
  const didLoadDataRef = useRef(false); // Track if we actually loaded data

  useEffect(() => {
    // Only rehydrate once on mount
    if (hasRehydratedRef.current) return;
    hasRehydratedRef.current = true;

    const persisted = loadDiscussionState();
    if (persisted) {
      didLoadDataRef.current = true; // Mark that we loaded existing data
      dispatch({
        type: 'REHYDRATE_DISCUSSION',
        session: persisted.session,
        exchanges: persisted.exchanges,
        transcript: persisted.transcript,
        keyNotes: persisted.keyNotes,
      });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Discussion Persistence: Save on SEQUENCE_COMPLETED or CLEAR
  // Triggered by changes to discussionSession (only updates after those actions)
  // ---------------------------------------------------------------------------

  const prevExchangesLengthRef = useRef<number | null>(null);

  useEffect(() => {
    // Skip if not in discussion mode
    if (state.mode !== 'discussion') return;

    // Skip if no session yet (initial state or non-discussion mode)
    if (!state.discussionSession) return;

    // Skip during processing (mid-sequence)
    if (state.isProcessing) return;

    // First valid run: initialize tracking
    if (prevExchangesLengthRef.current === null) {
      prevExchangesLengthRef.current = state.exchanges.length;
      // If we rehydrated data, skip save (data already in localStorage)
      // If fresh start, save immediately (first exchange needs to persist)
      if (didLoadDataRef.current) {
        return;
      }
      // Fresh start with exchanges → save now
      if (state.exchanges.length > 0) {
        saveDiscussionState(state.discussionSession, state.exchanges, state.transcript, state.keyNotes);
      }
      return;
    }

    // Subsequent runs: save if exchange count changed
    if (prevExchangesLengthRef.current !== state.exchanges.length) {
      prevExchangesLengthRef.current = state.exchanges.length;
      saveDiscussionState(state.discussionSession, state.exchanges, state.transcript, state.keyNotes);
    }
  }, [state.discussionSession, state.exchanges, state.transcript, state.keyNotes, state.mode, state.isProcessing]);

  // ---------------------------------------------------------------------------
  // Discussion Compaction: Trigger after SEQUENCE_COMPLETED when threshold met
  // ---------------------------------------------------------------------------

  const compactionInProgressRef = useRef(false);
  const lastCompactedCountRef = useRef<number>(0);

  useEffect(() => {
    // Skip if not in discussion mode
    if (state.mode !== 'discussion') return;

    // Skip during processing (mid-sequence)
    if (state.isProcessing) return;

    // Skip if no exchanges
    if (state.exchanges.length === 0) return;

    // Skip if compaction already in progress
    if (compactionInProgressRef.current) return;

    // Check if compaction is due
    const exchangeCount = state.discussionSession?.exchangeCount ?? state.exchanges.length;
    if (!shouldCompact(exchangeCount)) return;

    // Skip if already compacted at this count
    if (lastCompactedCountRef.current === exchangeCount) return;

    // Get exchanges to compact
    const toCompact = getExchangesToCompact(state.exchanges);
    if (toCompact.length === 0) return;

    // Mark compaction in progress
    compactionInProgressRef.current = true;

    // Run compaction asynchronously
    const runCompaction = async () => {
      try {
        // Get current CEO for summarization
        const currentCeo = ceoRef.current;

        // Build summarization prompt
        const prompt = buildCompactionPrompt(toCompact, state.keyNotes);

        // Create abort controller for compaction call
        const compactionAbortController = new AbortController();

        // Call CEO agent with summarization prompt
        const response = await callAgent(
          currentCeo,
          prompt,
          '', // No conversation context for summarization
          compactionAbortController,
          {
            runId: `compaction-${Date.now()}`,
            callIndex: 1,
            exchanges: [], // No history for summarization
            projectDiscussionMode: false,
          }
        );

        // Check for success
        if (response.status !== 'success' || !response.content) {
          // Summarization failed — do NOT compact, retry on next sequence
          compactionInProgressRef.current = false;
          return;
        }

        // Parse keyNotes from response
        const parsedKeyNotes = parseKeyNotes(response.content);
        if (!parsedKeyNotes) {
          // Parse failed — do NOT compact, retry on next sequence
          compactionInProgressRef.current = false;
          return;
        }

        // Merge with existing keyNotes
        const mergedKeyNotes = mergeKeyNotes(state.keyNotes, parsedKeyNotes);

        // Get exchanges to keep
        const toKeep = getExchangesToKeep(state.exchanges);

        // Mark this count as compacted
        lastCompactedCountRef.current = exchangeCount;

        // Dispatch compaction completed
        dispatch({
          type: 'COMPACTION_COMPLETED',
          keyNotes: mergedKeyNotes,
          trimmedExchanges: toKeep,
        });
      } catch {
        // Error during compaction — do NOT compact, retry on next sequence
      } finally {
        compactionInProgressRef.current = false;
      }
    };

    runCompaction();
  }, [state.mode, state.isProcessing, state.exchanges, state.discussionSession, state.keyNotes]);

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
      // Ghost Mode Branch — DISABLED
      // All modes (Discussion, Decision, Project) use client-side orchestration.
      // All 3 agents (GPT, Claude, Gemini) are always called. CEO speaks LAST.
      // -----------------------------------------------------------------------

      // Capture mode early for client-side orchestration
      const currentMode = state.mode;

      // Ghost mode disabled for all modes — client-side handles all orchestration
      if (false) {
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
              content: ghostResult.content as string, // Safe: guarded by if condition
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

      // -----------------------------------------------------------------------
      // Task 4: Discussion Memory Injection (Discussion mode ONLY)
      // Build memory block containing keyNotes + last 10 exchanges
      // Prepend to userPrompt so all agents receive context
      // -----------------------------------------------------------------------

      let promptWithMemory = userPrompt;
      if (currentMode === 'discussion') {
        const memoryBlock = buildDiscussionMemoryBlock({
          keyNotes: state.keyNotes,
          exchanges: state.exchanges,
        });
        if (memoryBlock) {
          promptWithMemory = memoryBlock + userPrompt;
        }
      }

      // -----------------------------------------------------------------------
      // Task 5.2: Project Carryover Injection (Project mode ONLY)
      // Build carryover block containing discussion context
      // Prepend to userPrompt so all agents receive context
      // -----------------------------------------------------------------------

      if (currentMode === 'project' && state.carryover) {
        const carryoverBlock = buildCarryoverMemoryBlock(state.carryover);
        if (carryoverBlock) {
          promptWithMemory = carryoverBlock + promptWithMemory;
        }
      }

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

        // Use promptWithMemory for Discussion mode (includes memory block)
        // Use original userPrompt for Project/Decision modes
        const response = await callAgent(
          agent,
          promptWithMemory,
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
  // STEP 3-4: Ghost Orchestrator Effect for Project Mode
  // Triggered when loopState transitions to 'running' in project mode
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Only trigger in project mode when running
    if (state.mode !== 'project' || state.loopState !== 'running') {
      return;
    }

    // Skip if already processing (prevents re-trigger)
    if (ghostAbortControllerRef.current) {
      return;
    }

    // Create abort controller for ghost call
    const ghostAbortController = new AbortController();
    ghostAbortControllerRef.current = ghostAbortController;

    const runGhostOrchestrator = async () => {
      try {
        // Build effective prompt with carryover injection
        let effectivePrompt = state.lastProjectIntent ?? '';

        // Inject carryover context if available
        if (state.carryover) {
          const carryoverBlock = buildCarryoverMemoryBlock(state.carryover);
          if (carryoverBlock) {
            effectivePrompt = carryoverBlock + effectivePrompt;
          }
        }

        // Call ghost orchestrator
        const result = await callGhostOrchestrator(effectivePrompt, ghostAbortController);

        // Check if aborted
        if (ghostAbortController.signal.aborted) {
          return;
        }

        // Handle result
        if (result.status === 'success' && result.content) {
          dispatch({ type: 'PROJECT_GHOST_SUCCESS', content: result.content });
        } else {
          // Map error code to user-friendly message
          const errorMessage = result.errorCode
            ? getGhostErrorMessage(result.errorCode as GhostErrorCode)
            : result.error ?? 'Ghost orchestration failed';
          dispatch({ type: 'PROJECT_GHOST_FAILED', error: errorMessage });
        }
      } catch (error) {
        // Handle unexpected errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        dispatch({ type: 'PROJECT_GHOST_FAILED', error: errorMessage });
      } finally {
        ghostAbortControllerRef.current = null;
      }
    };

    runGhostOrchestrator();

    // Cleanup: abort on unmount or mode change
    return () => {
      ghostAbortController.abort();
      ghostAbortControllerRef.current = null;
    };
  }, [state.mode, state.loopState, state.lastProjectIntent, state.carryover]);

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

  const startExecutionLoop = useCallback((intent?: string): void => {
    dispatch({ type: 'START_EXECUTION_LOOP', intent });
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

  const switchToProject = useCallback((): void => {
    // Task 5.3: Switch from Discussion to Project mode
    // 1. Attempt to create carryover (best-effort; may no-op due to guards)
    dispatch({ type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });
    // 2. Always switch to project mode
    dispatch({ type: 'SET_MODE', mode: 'project' });
  }, []);

  const returnToDiscussion = useCallback((): void => {
    // Task 5.3: Return from Project to Discussion mode
    // Do NOT clear carryover — preserve for potential re-entry
    dispatch({ type: 'SET_MODE', mode: 'discussion' });
  }, []);

  const retryExecution = useCallback((): void => {
    // STEP 3-4: Retry ghost orchestrator call
    // Reset error and re-trigger execution
    dispatch({ type: 'PROJECT_RESET_ERROR' });
    // Re-start with the same intent
    dispatch({ type: 'START_EXECUTION_LOOP', intent: state.lastProjectIntent ?? undefined });
  }, [state.lastProjectIntent]);

  const startProjectEpoch = useCallback((intent: string): void => {
    dispatch({ type: 'PROJECT_START_EPOCH', intent });
  }, []);

  const addProjectInterrupt = useCallback(
    (message: string, severity: InterruptSeverity, scope: InterruptScope): void => {
      dispatch({ type: 'PROJECT_ADD_INTERRUPT', interrupt: { message, severity, scope } });
    },
    []
  );

  const processBlocker = useCallback((): void => {
    dispatch({ type: 'PROJECT_PROCESS_BLOCKER' });
  }, []);

  const newProjectDirection = useCallback((intent: string): void => {
    dispatch({ type: 'PROJECT_NEW_DIRECTION', intent });
  }, []);

  const markProjectDone = useCallback((): void => {
    dispatch({ type: 'PROJECT_MARK_DONE' });
  }, []);

  const forceProjectFail = useCallback((): void => {
    dispatch({ type: 'PROJECT_FORCE_FAIL' });
  }, []);

  const setDiscussionCeoPromptArtifact = useCallback((artifact: CeoPromptArtifact): void => {
    dispatch({ type: 'SET_DISCUSSION_CEO_PROMPT_ARTIFACT', artifact });
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

  const getKeyNotes = useCallback((): KeyNotes | null => {
    return state.keyNotes;
  }, [state.keyNotes]);

  const getSystemMessages = useCallback((): SystemMessage[] => {
    return state.systemMessages;
  }, [state.systemMessages]);

  const hasActiveDiscussion = useCallback((): boolean => {
    return state.discussionSession !== null;
  }, [state.discussionSession]);

  const getProjectError = useCallback((): string | null => {
    return state.projectError;
  }, [state.projectError]);

  const getGhostOutput = useCallback((): string | null => {
    return state.ghostOutput;
  }, [state.ghostOutput]);

  const getLastProjectIntent = useCallback((): string | null => {
    return state.lastProjectIntent;
  }, [state.lastProjectIntent]);

  const getProjectRun = useCallback((): ProjectRun | null => {
    return state.projectRun;
  }, [state.projectRun]);

  const getDiscussionCeoPromptArtifact = useCallback((): CeoPromptArtifact | null => {
    return state.discussionCeoPromptArtifact;
  }, [state.discussionCeoPromptArtifact]);

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
      switchToProject,
      returnToDiscussion,
      retryExecution,
      startProjectEpoch,
      addProjectInterrupt,
      processBlocker,
      newProjectDirection,
      markProjectDone,
      forceProjectFail,
      setDiscussionCeoPromptArtifact,
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
      getKeyNotes,
      getSystemMessages,
      hasActiveDiscussion,
      getProjectError,
      getGhostOutput,
      getLastProjectIntent,
      getProjectRun,
      getDiscussionCeoPromptArtifact,
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
      switchToProject,
      returnToDiscussion,
      retryExecution,
      startProjectEpoch,
      addProjectInterrupt,
      processBlocker,
      newProjectDirection,
      markProjectDone,
      forceProjectFail,
      setDiscussionCeoPromptArtifact,
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
      getKeyNotes,
      getSystemMessages,
      hasActiveDiscussion,
      getProjectError,
      getGhostOutput,
      getLastProjectIntent,
      getProjectRun,
      getDiscussionCeoPromptArtifact,
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
