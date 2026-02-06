// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// BrainChat Container Component (Mode Reset — No Switching)
// =============================================================================

import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useBrain } from '../context/BrainContext';
import { ExchangeList } from './ExchangeList';
import { PromptInput } from './PromptInput';
import { ActionBar } from './ActionBar';
import { WarningBanner } from './WarningBanner';
import { ProjectModeLayout } from './ProjectModeLayout';
import { DecisionModeLayout } from './DecisionModeLayout';
import {
  exportTranscriptAsJson,
  exportTranscriptAsMarkdown,
  downloadFile,
} from '../utils/discussionPersistence';
import {
  parseCeoControlBlock,
  createCeoPromptArtifact,
  PROMPT_START_MARKER,
  PROMPT_END_MARKER,
} from '../utils/ceoControlBlockParser';
import type { Agent, BrainMode } from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface BrainChatProps {
  /** Initial mode selected from Home screen */
  initialMode: BrainMode;
  /** Callback to return to Home screen */
  onReturnHome: () => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function BrainChat({ initialMode, onReturnHome }: BrainChatProps): JSX.Element {
  const {
    // Action creators
    submitPrompt,
    cancelSequence,
    clearBoard,
    dismissWarning,
    setCeo,
    setMode,
    startExecutionLoop,
    pauseExecutionLoop,
    stopExecutionLoop,
    markDone,
    // Project phase actions
    markProjectDone,
    forceProjectFail,
    // Selectors
    getState,
    canSubmit,
    canClear,
    isProcessing,
    getWarning,
    getPendingExchange,
    getExchanges,
    getLastExchange,
    getCeo,
    getMode,
    getLoopState,
    isLoopRunning,
    getSystemMessages,
    getProjectRun,
    getDiscussionCeoPromptArtifact,
    setDiscussionCeoPromptArtifact,
    // Clarification actions
    sendClarificationMessage,
    cancelClarification,
    retryCeoClarification,
    getClarificationState,
    isClarificationActive,
    startClarification,
    // Decision mode blocking
    blockDecisionSession,
    unblockDecisionSession,
    getDecisionBlockingState,
    isDecisionBlocked,
    retryCeoReformat,
    // CEO-only mode toggle
    setCeoOnlyMode,
    isCeoOnlyMode,
    // Project management
    getActiveProject,
    listProjects,
    createNewProject,
    switchToProjectById,
    deleteProject,
    clearProjectBlock,
    completeDecisionEpoch,
  } = useBrain();

  // ---------------------------------------------------------------------------
  // Set initial mode on mount
  // ---------------------------------------------------------------------------

  const hasSetInitialModeRef = useRef(false);

  useEffect(() => {
    if (!hasSetInitialModeRef.current) {
      hasSetInitialModeRef.current = true;
      setMode(initialMode);
    }
  }, [initialMode, setMode]);

  // ---------------------------------------------------------------------------
  // Derived state from selectors
  // ---------------------------------------------------------------------------

  const state = getState();
  const exchanges = getExchanges();
  const pendingExchange = getPendingExchange();
  const lastExchange = getLastExchange();
  const currentAgent = state.currentAgent;
  const warning = getWarning();
  const processing = isProcessing();
  const ceo = getCeo();
  const mode = getMode();
  const loopState = getLoopState();
  const loopRunning = isLoopRunning();
  const systemMessages = getSystemMessages();
  const projectRun = getProjectRun();
  const discussionCeoPromptArtifact = getDiscussionCeoPromptArtifact();
  const clarificationState = getClarificationState();
  const clarificationActive = isClarificationActive();
  const decisionBlockingState = getDecisionBlockingState();
  const decisionBlocked = isDecisionBlocked();
  const ceoOnlyModeEnabled = isCeoOnlyMode();
  const activeProject = getActiveProject();
  const projects = listProjects();

  // ---------------------------------------------------------------------------
  // Extract last CEO questions (for CeoClarificationPanel display)
  // Shown even when CEO-only toggle is OFF
  // ---------------------------------------------------------------------------

  const lastCeoQuestions = useMemo((): string[] => {
    if (mode !== 'decision' || !lastExchange) return [];
    const ceoResponse = lastExchange.responsesByAgent[ceo];
    if (!ceoResponse || ceoResponse.status !== 'success' || !ceoResponse.content) return [];
    const parsed = parseCeoControlBlock(ceoResponse.content);
    return parsed.blockedQuestions;
  }, [mode, lastExchange, ceo]);

  // ---------------------------------------------------------------------------
  // Warning display rule (GPT mandate):
  // Only show warning if pendingExchange exists.
  // This prevents stale warnings from surfacing after completion/cancel.
  // ---------------------------------------------------------------------------

  const shouldShowWarning = warning !== null && pendingExchange !== null;

  // ---------------------------------------------------------------------------
  // Input Control
  // Block advisor input during execution loop (read-only mode)
  // Block main input during clarification (Decision mode)
  // Block main input after decision is finalized (has prompt artifact)
  // ---------------------------------------------------------------------------

  // Decision is finalized when we have a prompt artifact and clarification is NOT active
  const isDecisionFinalized = mode === 'decision' &&
    discussionCeoPromptArtifact !== null &&
    !clarificationActive &&
    !processing;

  const canSubmitPrompt = canSubmit() && !loopRunning && !clarificationActive && !decisionBlocked && !isDecisionFinalized;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    (prompt: string) => {
      // Hard block: No input during execution loop
      if (loopRunning) return;
      // Hard block: No input during clarification (CEO-only lane)
      if (clarificationActive) return;
      // Hard block: No input when session is blocked (invalid CEO output)
      if (decisionBlocked) return;
      // Hard block: No input after decision is finalized
      if (isDecisionFinalized) return;
      submitPrompt(prompt);
    },
    [submitPrompt, loopRunning, clarificationActive, decisionBlocked, isDecisionFinalized]
  );

  const handleCancel = useCallback(() => {
    cancelSequence();
  }, [cancelSequence]);

  const handleClear = useCallback(() => {
    clearBoard();
  }, [clearBoard]);

  const handleDismissWarning = useCallback(() => {
    dismissWarning();
  }, [dismissWarning]);

  const handleCeoChange = useCallback(
    (agent: Agent) => {
      // Hard block: No CEO changes during execution loop
      if (loopRunning) return;
      setCeo(agent);
    },
    [setCeo, loopRunning]
  );

  // ---------------------------------------------------------------------------
  // Executor Panel: Generate Prompt Logic (used in Decision mode warning)
  // ---------------------------------------------------------------------------

  const generatedForExchangeRef = useRef<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // CEO Prompt Warning (Decision mode only)
  // Shown when CEO response doesn't contain required markers
  // ---------------------------------------------------------------------------

  const [ceoPromptWarning, setCeoPromptWarning] = useState<string | null>(null);

  // Reset tracking when exchanges are cleared
  useEffect(() => {
    if (!lastExchange?.id) {
      generatedForExchangeRef.current.clear();
    }
  }, [lastExchange?.id]);

  // ---------------------------------------------------------------------------
  // Decision Mode: Parse CEO responses for Claude Code prompt (HARD DELIMITERS)
  // (Only in Decision mode - NOT Discussion mode)
  // CEO MUST use: === CLAUDE_CODE_PROMPT_START === ... === CLAUDE_CODE_PROMPT_END ===
  // ---------------------------------------------------------------------------

  const lastParsedExchangeRef = useRef<string | null>(null);

  useEffect(() => {
    // Only in decision mode
    if (mode !== 'decision') return;

    // Only when not processing (sequence completed)
    if (processing) return;

    // Need a last exchange with CEO response
    if (!lastExchange?.id) return;

    // Skip if already parsed this exchange
    if (lastParsedExchangeRef.current === lastExchange.id) return;

    // Get CEO's response (ONLY CEO messages are eligible for extraction)
    const ceoResponse = lastExchange.responsesByAgent[ceo];
    if (!ceoResponse || ceoResponse.status !== 'success' || !ceoResponse.content) return;

    // Mark as parsed
    lastParsedExchangeRef.current = lastExchange.id;

    // Parse for markers (HARD DELIMITERS - deterministic extraction)
    const parsed = parseCeoControlBlock(ceoResponse.content);

    // Check for BLOCKED state (trigger clarification lane) - takes precedence
    if (parsed.isBlocked && parsed.blockedQuestions.length > 0) {
      setCeoPromptWarning(null); // Clear any previous warning
      startClarification(parsed.blockedQuestions);
      completeDecisionEpoch('blocked');
      return;
    }

    // Check for Claude Code prompt with required markers
    if (parsed.hasPromptArtifact && parsed.promptText) {
      // Clear warning - CEO provided valid prompt
      setCeoPromptWarning(null);
      // Create new artifact with incremented version
      const newArtifact = createCeoPromptArtifact(parsed.promptText, discussionCeoPromptArtifact);
      setDiscussionCeoPromptArtifact(newArtifact);
      completeDecisionEpoch('prompt_delivered');
      return;
    }

    // CEO HARD GATE: Invalid output - block session
    // CEO MUST output either a prompt (with markers) OR BLOCKED questions
    let blockReason: string;
    const hasPartialStart = ceoResponse.content.includes('CLAUDE_CODE_PROMPT');
    const hasStartMarker = ceoResponse.content.includes(PROMPT_START_MARKER);
    const hasEndMarker = ceoResponse.content.includes(PROMPT_END_MARKER);

    if (hasPartialStart || hasStartMarker || hasEndMarker) {
      // CEO tried to use markers but format is wrong
      blockReason = `CEO prompt has malformed markers. Required format:\n${PROMPT_START_MARKER}\n(prompt)\n${PROMPT_END_MARKER}`;
    } else {
      // CEO didn't include markers at all
      blockReason = `CEO must output a Claude Code prompt (with markers) or clarification questions. Session blocked.`;
    }

    setCeoPromptWarning(blockReason);
    blockDecisionSession(blockReason, lastExchange.id);
  }, [mode, processing, lastExchange, ceo, discussionCeoPromptArtifact, setDiscussionCeoPromptArtifact, startClarification, blockDecisionSession, completeDecisionEpoch]);

  // Clear warning and unblock when mode changes or board is cleared
  useEffect(() => {
    if (mode !== 'decision' || exchanges.length === 0) {
      setCeoPromptWarning(null);
      // Also unblock if blocked
      if (decisionBlocked) {
        unblockDecisionSession();
      }
    }
  }, [mode, exchanges.length, decisionBlocked, unblockDecisionSession]);

  const handleStartExecution = useCallback(() => {
    startExecutionLoop();
  }, [startExecutionLoop]);

  const handlePauseExecution = useCallback(() => {
    pauseExecutionLoop();
  }, [pauseExecutionLoop]);

  const handleStopExecution = useCallback(() => {
    // Use forceProjectFail for phase machine if projectRun exists
    if (projectRun) {
      forceProjectFail();
    } else {
      stopExecutionLoop();
    }
  }, [stopExecutionLoop, forceProjectFail, projectRun]);

  const handleMarkDone = useCallback(() => {
    // Use markProjectDone for phase machine if projectRun exists
    if (projectRun) {
      markProjectDone();
    } else {
      markDone();
    }
  }, [markDone, markProjectDone, projectRun]);

  // ---------------------------------------------------------------------------
  // Clarification Handlers (Decision Mode)
  // ---------------------------------------------------------------------------

  const handleSendClarificationMessage = useCallback(
    (content: string) => {
      sendClarificationMessage(content);
    },
    [sendClarificationMessage]
  );

  const handleCancelClarification = useCallback(() => {
    cancelClarification();
  }, [cancelClarification]);

  const handleRetryCeoClarification = useCallback(() => {
    retryCeoClarification();
  }, [retryCeoClarification]);

  const handleClearAndUnblock = useCallback(() => {
    // Clear board and unblock session
    clearBoard();
    unblockDecisionSession();
  }, [clearBoard, unblockDecisionSession]);

  const handleRetryCeoReformat = useCallback(() => {
    retryCeoReformat();
  }, [retryCeoReformat]);

  const handleToggleCeoOnlyMode = useCallback(
    (enabled: boolean) => {
      setCeoOnlyMode(enabled);
    },
    [setCeoOnlyMode]
  );

  // ---------------------------------------------------------------------------
  // Discussion Export: Finish Discussion (JSON + Markdown)
  // ---------------------------------------------------------------------------

  const handleFinishDiscussion = useCallback(() => {
    const session = state.discussionSession;
    const transcript = state.transcript;

    if (!session || transcript.length === 0) return;

    // Generate timestamp for filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // Export as JSON (no CEO prompt artifact in discussion mode)
    const jsonContent = exportTranscriptAsJson(session, transcript, null);
    downloadFile(jsonContent, `brain-transcript-${timestamp}.json`, 'application/json');

    // Export as Markdown (no CEO prompt artifact in discussion mode)
    const mdContent = exportTranscriptAsMarkdown(session, transcript, null);
    downloadFile(mdContent, `brain-transcript-${timestamp}.md`, 'text/markdown');
  }, [state.discussionSession, state.transcript]);

  // Can export if in discussion mode with transcript
  const canExportDiscussion = mode === 'discussion' && state.transcript.length > 0;

  // ---------------------------------------------------------------------------
  // Project Management Handlers
  // ---------------------------------------------------------------------------

  const handleSelectProject = useCallback(
    (projectId: string) => {
      switchToProjectById(projectId);
      setMode('project');
    },
    [switchToProjectById, setMode]
  );

  const handleNewProject = useCallback(() => {
    createNewProject();
    // Switch to Decision mode for new project
    setMode('decision');
  }, [createNewProject, setMode]);

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      deleteProject(projectId);
    },
    [deleteProject]
  );

  const handleContinueInDecisionMode = useCallback(() => {
    // Clear board first to reset isDecisionFinalized, then switch to Decision mode
    clearBoard();
    setMode('decision');
  }, [clearBoard, setMode]);

  const handleViewInProject = useCallback(() => {
    // Switch to Project mode to view project dashboard
    setMode('project');
  }, [setMode]);

  const handleClearProjectBlock = useCallback(() => {
    // Clear blocked status on active project (sets status back to 'active')
    clearProjectBlock();
  }, [clearProjectBlock]);

  // ---------------------------------------------------------------------------
  // Persisted Project Blocked State
  // When project is loaded with blocked status, show banner in Decision mode
  // ---------------------------------------------------------------------------

  const isProjectBlocked = activeProject?.status === 'blocked';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Project mode: Read-only Project Dashboard
  if (mode === 'project') {
    return (
      <div className="brain-chat brain-chat--project">
        {/* Warning Banner (runId-scoped display) */}
        {shouldShowWarning && (
          <WarningBanner warning={warning} onDismiss={handleDismissWarning} />
        )}

        {/* Project Dashboard Layout */}
        <ProjectModeLayout
          projects={projects}
          activeProject={activeProject}
          onSelectProject={handleSelectProject}
          onNewProject={handleNewProject}
          onDeleteProject={handleDeleteProject}
          onContinueInDecisionMode={handleContinueInDecisionMode}
        />

        {/* Action Bar (Project Mode - minimal controls) */}
        <ActionBar
          canClear={false}
          isProcessing={false}
          onClear={handleClear}
          onCancel={handleCancel}
          mode={mode}
          loopState={loopState}
          onStartExecution={handleStartExecution}
          onPauseExecution={handlePauseExecution}
          onStopExecution={handleStopExecution}
          onMarkDone={handleMarkDone}
          onReturnHome={onReturnHome}
        />
      </div>
    );
  }

  // Decision mode: Two-pane layout with CEO Prompt Panel
  if (mode === 'decision') {
    return (
      <div className="brain-chat brain-chat--decision">
        {/* Warning Banner (runId-scoped display) */}
        {shouldShowWarning && (
          <WarningBanner warning={warning} onDismiss={handleDismissWarning} />
        )}

        {/* Persisted Project Blocked Banner */}
        {isProjectBlocked && (
          <div className="brain-chat__project-blocked-banner" data-testid="project-blocked-banner">
            <div className="brain-chat__project-blocked-icon">⛔</div>
            <div className="brain-chat__project-blocked-content">
              <h3 className="brain-chat__project-blocked-title">Project Blocked</h3>
              <p className="brain-chat__project-blocked-desc">
                This project was saved in a blocked state. Clear the block to continue or view the project dashboard.
              </p>
            </div>
            <div className="brain-chat__project-blocked-actions">
              <button
                className="brain-chat__project-blocked-btn brain-chat__project-blocked-btn--primary"
                onClick={handleClearProjectBlock}
                data-testid="clear-project-block-btn"
              >
                Clear Block
              </button>
              <button
                className="brain-chat__project-blocked-btn brain-chat__project-blocked-btn--secondary"
                onClick={handleViewInProject}
                data-testid="go-to-project-btn"
              >
                Go to Project
              </button>
            </div>
          </div>
        )}

        {/* Three-Pane Decision Layout */}
        <DecisionModeLayout
          exchanges={exchanges}
          pendingExchange={pendingExchange}
          currentAgent={currentAgent}
          mode={mode}
          ceo={ceo}
          systemMessages={systemMessages}
          ceoPromptArtifact={discussionCeoPromptArtifact}
          clarificationState={clarificationState}
          onSendClarificationMessage={handleSendClarificationMessage}
          onCancelClarification={handleCancelClarification}
          ceoPromptWarning={ceoPromptWarning}
          blockingState={decisionBlockingState}
          onClearAndUnblock={handleClearAndUnblock}
          onRetryCeoReformat={handleRetryCeoReformat}
          ceoOnlyModeEnabled={ceoOnlyModeEnabled}
          onToggleCeoOnlyMode={handleToggleCeoOnlyMode}
          lastCeoQuestions={lastCeoQuestions}
          onRetryCeoClarification={handleRetryCeoClarification}
          projects={projects}
          activeProjectId={activeProject?.id ?? null}
          onSelectProject={handleSelectProject}
          onNewProject={handleNewProject}
          onDeleteProject={handleDeleteProject}
        />

        {/* Decision Finalized Message + View Project Button */}
        {isDecisionFinalized && (
          <div className="brain-chat__decision-finalized" data-testid="decision-finalized-message">
            <span>Decision finalized. Copy the Claude Code prompt or Clear Board to continue.</span>
            <button
              className="brain-chat__view-project-btn"
              onClick={handleViewInProject}
              data-testid="view-in-project-btn"
            >
              View in Project
            </button>
          </div>
        )}

        {/* Prompt Input (with summary indicator in Decision mode) */}
        <PromptInput
          canSubmit={canSubmitPrompt}
          onSubmit={handleSubmit}
          showSummaryIndicator={true}
        />

        {/* Action Bar (No mode switching) */}
        <ActionBar
          canClear={canClear()}
          isProcessing={processing}
          onClear={handleClear}
          onCancel={handleCancel}
          mode={mode}
          loopState={loopState}
          onStartExecution={handleStartExecution}
          onPauseExecution={handlePauseExecution}
          onStopExecution={handleStopExecution}
          onMarkDone={handleMarkDone}
          ceo={ceo}
          onCeoChange={handleCeoChange}
          onReturnHome={onReturnHome}
        />
      </div>
    );
  }

  // Discussion mode: Single-pane layout (no prompt panel)
  return (
    <div className="brain-chat">
      {/* Warning Banner (runId-scoped display) */}
      {shouldShowWarning && (
        <WarningBanner warning={warning} onDismiss={handleDismissWarning} />
      )}

      {/* Exchange List (single pane - no prompt artifact) */}
      <ExchangeList
        exchanges={exchanges}
        pendingExchange={pendingExchange}
        currentAgent={currentAgent}
        mode={mode}
        ceo={ceo}
        systemMessages={systemMessages}
      />

      {/* Prompt Input */}
      <PromptInput canSubmit={canSubmitPrompt} onSubmit={handleSubmit} />

      {/* Action Bar (No mode switching) */}
      <ActionBar
        canClear={canClear()}
        isProcessing={processing}
        onClear={handleClear}
        onCancel={handleCancel}
        mode={mode}
        loopState={loopState}
        onStartExecution={handleStartExecution}
        onPauseExecution={handlePauseExecution}
        onStopExecution={handleStopExecution}
        onMarkDone={handleMarkDone}
        onFinishDiscussion={handleFinishDiscussion}
        canExport={canExportDiscussion}
        onReturnHome={onReturnHome}
      />
    </div>
  );
}
