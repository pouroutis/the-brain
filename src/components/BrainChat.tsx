// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// BrainChat Container Component (Phase 2B — Mode Enforcement + CEO UX)
// =============================================================================

import { useCallback, useMemo } from 'react';
import { useBrain } from '../context/BrainContext';
import { ExchangeList } from './ExchangeList';
import { PromptInput } from './PromptInput';
import { ActionBar } from './ActionBar';
import { WarningBanner } from './WarningBanner';
import { buildCeoExecutionPrompt } from '../utils/executionPromptBuilder';
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
    getExecutionLoopActive,
    canGenerateExecutionPrompt,
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
  const executionLoopActive = getExecutionLoopActive();
  const canGenerate = canGenerateExecutionPrompt();

  // ---------------------------------------------------------------------------
  // CEO Execution Prompt (memoized)
  // Only contains the CEO's final decision
  // Only available in Project mode
  // ---------------------------------------------------------------------------

  const ceoExecutionPrompt = useMemo(
    () => (mode === 'project' ? buildCeoExecutionPrompt(lastExchange, ceo) : null),
    [lastExchange, ceo, mode]
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

  const canSubmitPrompt = canSubmit() && !executionLoopActive;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    (prompt: string) => {
      // Hard block: No input during execution loop
      if (executionLoopActive) return;
      submitPrompt(prompt);
    },
    [submitPrompt, executionLoopActive]
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
      if (executionLoopActive) return;
      setCeo(agent);
    },
    [setCeo, executionLoopActive]
  );

  const handleModeChange = useCallback(
    (newMode: BrainMode) => {
      // Hard block: No mode changes during execution loop
      if (executionLoopActive) return;
      setMode(newMode);
    },
    [setMode, executionLoopActive]
  );

  const handleStartExecution = useCallback(() => {
    startExecutionLoop();
  }, [startExecutionLoop]);

  const handlePauseExecution = useCallback(() => {
    pauseExecutionLoop();
  }, [pauseExecutionLoop]);

  const handleStopExecution = useCallback(() => {
    stopExecutionLoop();
  }, [stopExecutionLoop]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="brain-chat">
      {/* Warning Banner (runId-scoped display) */}
      {shouldShowWarning && (
        <WarningBanner warning={warning} onDismiss={handleDismissWarning} />
      )}

      {/* Exchange List (completed + pending) */}
      <ExchangeList
        exchanges={exchanges}
        pendingExchange={pendingExchange}
        currentAgent={currentAgent}
      />

      {/* Prompt Input (disabled during execution loop) */}
      <PromptInput canSubmit={canSubmitPrompt} onSubmit={handleSubmit} />

      {/* Action Bar (Mode + CEO + Execution Controls + Clear + Cancel) */}
      <ActionBar
        canClear={canClear()}
        isProcessing={processing}
        onClear={handleClear}
        onCancel={handleCancel}
        mode={mode}
        onModeChange={handleModeChange}
        executionLoopActive={executionLoopActive}
        onStartExecution={handleStartExecution}
        onPauseExecution={handlePauseExecution}
        onStopExecution={handleStopExecution}
        ceo={ceo}
        onCeoChange={handleCeoChange}
        ceoExecutionPrompt={ceoExecutionPrompt}
        lastExchangeId={lastExchange?.id ?? null}
        canGenerateExecutionPrompt={canGenerate}
      />
    </div>
  );
}
