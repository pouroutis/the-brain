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
import { buildCeoExecutionPrompt } from '../utils/executionPromptBuilder';
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
import type { Agent, BrainMode, InterruptSeverity, InterruptScope } from '../types/brain';

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
    setCeoExecutionPrompt,
    // Project phase actions
    addProjectInterrupt,
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
    canGenerateExecutionPrompt,
    getResultArtifact,
    getCeoExecutionPrompt,
    getSystemMessages,
    getProjectError,
    getProjectRun,
    getDiscussionCeoPromptArtifact,
    setDiscussionCeoPromptArtifact,
    // Clarification actions
    sendClarificationMessage,
    cancelClarification,
    getClarificationState,
    isClarificationActive,
    startClarification,
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
  const canGenerate = canGenerateExecutionPrompt();
  const resultArtifact = getResultArtifact();
  const persistedCeoPrompt = getCeoExecutionPrompt();
  const systemMessages = getSystemMessages();
  const projectError = getProjectError();
  const projectRun = getProjectRun();
  const discussionCeoPromptArtifact = getDiscussionCeoPromptArtifact();
  const clarificationState = getClarificationState();
  const clarificationActive = isClarificationActive();

  // ---------------------------------------------------------------------------
  // CEO Execution Prompt (memoized)
  // Only contains the CEO's final decision
  // Only available in Project mode
  // ---------------------------------------------------------------------------

  const ceoExecutionPrompt = useMemo(
    () => (mode === 'project' ? buildCeoExecutionPrompt(lastExchange, ceo, mode, resultArtifact, loopState) : null),
    [lastExchange, ceo, mode, resultArtifact, loopState]
  );

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
  // ---------------------------------------------------------------------------

  const canSubmitPrompt = canSubmit() && !loopRunning && !clarificationActive;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    (prompt: string) => {
      // Hard block: No input during execution loop
      if (loopRunning) return;
      // Hard block: No input during clarification (CEO-only lane)
      if (clarificationActive) return;
      submitPrompt(prompt);
    },
    [submitPrompt, loopRunning, clarificationActive]
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
  // Executor Panel: Generate Prompt Logic
  // ---------------------------------------------------------------------------

  const [executorCopyFeedback, setExecutorCopyFeedback] = useState<string | null>(null);
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
      return;
    }

    // Check for Claude Code prompt with required markers
    if (parsed.hasPromptArtifact && parsed.promptText) {
      // Clear warning - CEO provided valid prompt
      setCeoPromptWarning(null);
      // Create new artifact with incremented version
      const newArtifact = createCeoPromptArtifact(parsed.promptText, discussionCeoPromptArtifact);
      setDiscussionCeoPromptArtifact(newArtifact);
      return;
    }

    // CEO response WITHOUT required markers - show warning
    // Check if content has any partial markers (CEO tried but failed)
    const hasPartialStart = ceoResponse.content.includes('CLAUDE_CODE_PROMPT');
    const hasStartMarker = ceoResponse.content.includes(PROMPT_START_MARKER);
    const hasEndMarker = ceoResponse.content.includes(PROMPT_END_MARKER);

    if (hasPartialStart || hasStartMarker || hasEndMarker) {
      // CEO tried to use markers but format is wrong
      setCeoPromptWarning(
        `CEO prompt has malformed markers. Required format:\n${PROMPT_START_MARKER}\n(prompt)\n${PROMPT_END_MARKER}`
      );
    } else {
      // CEO didn't include markers at all
      setCeoPromptWarning(
        `CEO response missing required markers. Prompt panel will not be populated.`
      );
    }
  }, [mode, processing, lastExchange, ceo, discussionCeoPromptArtifact, setDiscussionCeoPromptArtifact, startClarification]);

  // Clear warning when mode changes or board is cleared
  useEffect(() => {
    if (mode !== 'decision' || exchanges.length === 0) {
      setCeoPromptWarning(null);
    }
  }, [mode, exchanges.length]);

  const hasGeneratedForCurrentExchange =
    lastExchange?.id !== null &&
    lastExchange?.id !== undefined &&
    generatedForExchangeRef.current.has(lastExchange.id);

  const handleExecutorGeneratePrompt = useCallback(async () => {
    if (mode !== 'project' || !ceoExecutionPrompt || !lastExchange?.id) return;

    if (generatedForExchangeRef.current.has(lastExchange.id)) {
      setExecutorCopyFeedback('Already generated');
      setTimeout(() => setExecutorCopyFeedback(null), 2000);
      return;
    }

    try {
      await navigator.clipboard.writeText(ceoExecutionPrompt);
      generatedForExchangeRef.current.add(lastExchange.id);
      setCeoExecutionPrompt(ceoExecutionPrompt);
      setExecutorCopyFeedback('Copied!');
      setTimeout(() => setExecutorCopyFeedback(null), 2000);
    } catch {
      setExecutorCopyFeedback('Failed');
      setTimeout(() => setExecutorCopyFeedback(null), 2000);
    }
  }, [ceoExecutionPrompt, lastExchange?.id, mode, setCeoExecutionPrompt]);

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
  // Project Phase Machine Handlers
  // ---------------------------------------------------------------------------

  const handleRequestChange = useCallback(
    (message: string, severity: InterruptSeverity, scope: InterruptScope) => {
      addProjectInterrupt(message, severity, scope);
    },
    [addProjectInterrupt]
  );

  const handleCopyPrompt = useCallback(() => {
    // Placeholder for tracking copy action
  }, []);

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
  // Render
  // ---------------------------------------------------------------------------

  // Project mode: Use two-pane layout (currently disabled from Home)
  if (mode === 'project') {
    return (
      <div className="brain-chat brain-chat--project">
        {/* Warning Banner (runId-scoped display) */}
        {shouldShowWarning && (
          <WarningBanner warning={warning} onDismiss={handleDismissWarning} />
        )}

        {/* Two-Pane Project Layout */}
        <ProjectModeLayout
          exchanges={exchanges}
          pendingExchange={pendingExchange}
          currentAgent={currentAgent}
          mode={mode}
          ceo={ceo}
          systemMessages={systemMessages}
          ceoPromptArtifact={projectRun?.ceoPromptArtifact ?? persistedCeoPrompt}
          executorOutput={projectRun?.executorOutput ?? resultArtifact}
          projectError={projectRun?.error ?? projectError}
          loopState={loopState}
          projectRun={projectRun}
          onRequestChange={handleRequestChange}
          onCopyPrompt={handleCopyPrompt}
        />

        {/* Prompt Input (disabled during execution loop) */}
        <PromptInput canSubmit={canSubmitPrompt} onSubmit={handleSubmit} />

        {/* Action Bar (Project Mode Controls - No mode switching) */}
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
          onGeneratePrompt={handleExecutorGeneratePrompt}
          canGenerate={canGenerate && !hasGeneratedForCurrentExchange && !!ceoExecutionPrompt}
          generateFeedback={executorCopyFeedback}
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

        {/* Two-Pane Decision Layout */}
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
        />

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
