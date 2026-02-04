// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// BrainChat Container Component (Phase 2 — Modes + CEO Authority)
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
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    (prompt: string) => {
      submitPrompt(prompt);
    },
    [submitPrompt]
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
      setCeo(agent);
    },
    [setCeo]
  );

  const handleModeChange = useCallback(
    (newMode: BrainMode) => {
      setMode(newMode);
    },
    [setMode]
  );

  const handleStartExecution = useCallback(() => {
    startExecutionLoop();
  }, [startExecutionLoop]);

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

      {/* Prompt Input */}
      <PromptInput canSubmit={canSubmit()} onSubmit={handleSubmit} />

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
