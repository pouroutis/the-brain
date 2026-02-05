// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// BrainChat Container Component (Phase 2B — Mode Enforcement + CEO UX)
// =============================================================================

import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useBrain } from '../context/BrainContext';
import { ExchangeList } from './ExchangeList';
import { PromptInput } from './PromptInput';
import { ActionBar } from './ActionBar';
import { WarningBanner } from './WarningBanner';
import { ExecutorPanel } from './ExecutorPanel';
import { buildCeoExecutionPrompt } from '../utils/executionPromptBuilder';
import {
  exportTranscriptAsJson,
  exportTranscriptAsMarkdown,
  downloadFile,
} from '../utils/discussionPersistence';
import type { Agent, BrainMode } from '../types/brain';

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function BrainChat(): JSX.Element {
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
    setResultArtifact,
    setCeoExecutionPrompt,
    switchToProject,
    returnToDiscussion,
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
    hasActiveDiscussion,
  } = useBrain();

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
  const activeDiscussion = hasActiveDiscussion();

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
  // ---------------------------------------------------------------------------

  const canSubmitPrompt = canSubmit() && !loopRunning;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    (prompt: string) => {
      // Hard block: No input during execution loop
      if (loopRunning) return;
      submitPrompt(prompt);
    },
    [submitPrompt, loopRunning]
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

  const handleModeChange = useCallback(
    (newMode: BrainMode) => {
      // Hard block: No mode changes during execution loop
      if (loopRunning) return;
      setMode(newMode);
    },
    [setMode, loopRunning]
  );

  const handleSaveResultArtifact = useCallback(
    (artifact: string | null) => {
      setResultArtifact(artifact);
    },
    [setResultArtifact]
  );

  // ---------------------------------------------------------------------------
  // Executor Panel: Generate Prompt Logic
  // ---------------------------------------------------------------------------

  const [executorCopyFeedback, setExecutorCopyFeedback] = useState<string | null>(null);
  const generatedForExchangeRef = useRef<Set<string>>(new Set());

  // Reset tracking when exchanges are cleared
  useEffect(() => {
    if (!lastExchange?.id) {
      generatedForExchangeRef.current.clear();
    }
  }, [lastExchange?.id]);

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
    stopExecutionLoop();
  }, [stopExecutionLoop]);

  const handleMarkDone = useCallback(() => {
    markDone();
  }, [markDone]);

  const handleSwitchToProject = useCallback(() => {
    // Hard block: No mode switch during execution loop
    if (loopRunning) return;
    switchToProject();
  }, [switchToProject, loopRunning]);

  const handleReturnToDiscussion = useCallback(() => {
    // Hard block: No mode switch during execution loop
    if (loopRunning) return;
    returnToDiscussion();
  }, [returnToDiscussion, loopRunning]);

  // ---------------------------------------------------------------------------
  // Discussion Export: Finish Discussion (JSON + Markdown)
  // ---------------------------------------------------------------------------

  const handleFinishDiscussion = useCallback(() => {
    const session = state.discussionSession;
    const transcript = state.transcript;

    if (!session || transcript.length === 0) return;

    // Generate timestamp for filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // Export as JSON
    const jsonContent = exportTranscriptAsJson(session, transcript);
    downloadFile(jsonContent, `brain-transcript-${timestamp}.json`, 'application/json');

    // Export as Markdown
    const mdContent = exportTranscriptAsMarkdown(session, transcript);
    downloadFile(mdContent, `brain-transcript-${timestamp}.md`, 'text/markdown');
  }, [state.discussionSession, state.transcript]);

  // Can export if in discussion mode with transcript
  const canExportDiscussion = mode === 'discussion' && state.transcript.length > 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="brain-chat">
      {/* Warning Banner (runId-scoped display) */}
      {shouldShowWarning && (
        <WarningBanner warning={warning} onDismiss={handleDismissWarning} />
      )}

      {/* Exchange List (completed + pending + system messages) */}
      <ExchangeList
        exchanges={exchanges}
        pendingExchange={pendingExchange}
        currentAgent={currentAgent}
        mode={mode}
        ceo={ceo}
        systemMessages={systemMessages}
      />

      {/* Prompt Input (disabled during execution loop) */}
      <PromptInput canSubmit={canSubmitPrompt} onSubmit={handleSubmit} />

      {/* Action Bar (Mode + CEO + Execution Controls + Artifacts + Export + Clear) */}
      <ActionBar
        canClear={canClear()}
        isProcessing={processing}
        onClear={handleClear}
        onCancel={handleCancel}
        mode={mode}
        onModeChange={handleModeChange}
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
        onFinishDiscussion={handleFinishDiscussion}
        canExport={canExportDiscussion}
        onSwitchToProject={handleSwitchToProject}
        onReturnToDiscussion={handleReturnToDiscussion}
        hasActiveDiscussion={activeDiscussion}
        hasExchanges={exchanges.length > 0}
      />

      {/* Executor Panel (Project mode only) */}
      <ExecutorPanel
        ceoExecutionPrompt={persistedCeoPrompt}
        resultArtifact={resultArtifact}
        onSaveResultArtifact={handleSaveResultArtifact}
        isProjectMode={mode === 'project'}
      />
    </div>
  );
}
