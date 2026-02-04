// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// BrainChat Container Component (Phase 2 — Step 5)
// =============================================================================

import { useCallback } from 'react';
import { useBrain } from '../context/BrainContext';
import { ExchangeList } from './ExchangeList';
import { PromptInput } from './PromptInput';
import { ActionBar } from './ActionBar';
import { WarningBanner } from './WarningBanner';

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
    // Selectors
    getState,
    canSubmit,
    canClear,
    isProcessing,
    getWarning,
    getPendingExchange,
    getExchanges,
    getProjectDiscussionMode,
  } = useBrain();

  // ---------------------------------------------------------------------------
  // Derived state from selectors
  // ---------------------------------------------------------------------------

  const state = getState();
  const exchanges = getExchanges();
  const pendingExchange = getPendingExchange();
  const currentAgent = state.currentAgent;
  const warning = getWarning();
  const processing = isProcessing();
  const projectDiscussionMode = getProjectDiscussionMode();

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

      {/* Action Bar (Clear + Cancel + Project Mode toggle) */}
      <ActionBar
        canClear={canClear()}
        isProcessing={processing}
        onClear={handleClear}
        onCancel={handleCancel}
        projectDiscussionMode={projectDiscussionMode}
        onToggleProjectDiscussionMode={handleToggleProjectDiscussionMode}
      />
    </div>
  );
}
