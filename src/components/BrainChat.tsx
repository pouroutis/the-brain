// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// BrainChat Container Component (Phase 2A — CEO Authority)
// =============================================================================

import { useCallback, useMemo } from 'react';
import { useBrain } from '../context/BrainContext';
import { ExchangeList } from './ExchangeList';
import { PromptInput } from './PromptInput';
import { ActionBar } from './ActionBar';
import { WarningBanner } from './WarningBanner';
import { buildCeoExecutionPrompt } from '../utils/executionPromptBuilder';
import type { Agent } from '../types/brain';

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
    setProjectDiscussionMode,
    setCeo,
    // Selectors
    getState,
    canSubmit,
    canClear,
    isProcessing,
    getWarning,
    getPendingExchange,
    getExchanges,
    getLastExchange,
    getProjectDiscussionMode,
    getCeo,
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
  const projectDiscussionMode = getProjectDiscussionMode();
  const ceo = getCeo();

  // ---------------------------------------------------------------------------
  // CEO Execution Prompt (memoized)
  // Only contains the CEO's final decision
  // ---------------------------------------------------------------------------

  const ceoExecutionPrompt = useMemo(
    () => buildCeoExecutionPrompt(lastExchange, ceo),
    [lastExchange, ceo]
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

  const handleToggleProjectDiscussionMode = useCallback(
    (enabled: boolean) => {
      setProjectDiscussionMode(enabled);
    },
    [setProjectDiscussionMode]
  );

  const handleCeoChange = useCallback(
    (agent: Agent) => {
      setCeo(agent);
    },
    [setCeo]
  );

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

      {/* Action Bar (CEO selector + Project Mode toggle + Generate CEO Prompt + Clear + Cancel) */}
      <ActionBar
        canClear={canClear()}
        isProcessing={processing}
        onClear={handleClear}
        onCancel={handleCancel}
        projectDiscussionMode={projectDiscussionMode}
        onToggleProjectDiscussionMode={handleToggleProjectDiscussionMode}
        ceo={ceo}
        onCeoChange={handleCeoChange}
        ceoExecutionPrompt={ceoExecutionPrompt}
        lastExchangeId={lastExchange?.id ?? null}
      />
    </div>
  );
}
