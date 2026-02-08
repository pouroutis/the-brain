// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// BrainChat Container Component (Discussion Mode Only)
// =============================================================================

import { useCallback, useRef } from 'react';
import { useBrain } from '../context/BrainContext';
import { useWorkItems } from '../context/WorkItemContext';
import { ExchangeList } from './ExchangeList';
import { PromptInput } from './PromptInput';
import { ActionBar } from './ActionBar';
import { WarningBanner } from './WarningBanner';
import {
  exportTranscriptAsJson,
  exportTranscriptAsMarkdown,
  downloadFile,
} from '../utils/discussionPersistence';

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
    // Selectors
    getState,
    canSubmit,
    canClear,
    isProcessing,
    getWarning,
    getPendingExchange,
    getExchanges,
    getCeo,
  } = useBrain();

  // WorkItem binding (V2-C — title derivation on first prompt)
  const { workItems, selectedWorkItemId, rename, updateShelf } = useWorkItems();
  const hasSetTitleRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived state from selectors
  // ---------------------------------------------------------------------------

  const state = getState();
  const exchanges = getExchanges();
  const pendingExchange = getPendingExchange();
  const currentAgent = state.currentAgent;
  const warning = getWarning();
  const processing = isProcessing();
  const ceo = getCeo();
  const mode = 'discussion';

  // ---------------------------------------------------------------------------
  // Warning display rule (GPT mandate):
  // Only show warning if pendingExchange exists.
  // ---------------------------------------------------------------------------

  const shouldShowWarning = warning !== null && pendingExchange !== null;

  // ---------------------------------------------------------------------------
  // Input Control
  // ---------------------------------------------------------------------------

  const canSubmitPrompt = canSubmit();

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    (prompt: string) => {
      // V2-C: Derive work item title from first prompt
      if (selectedWorkItemId && hasSetTitleRef.current !== selectedWorkItemId) {
        const item = workItems.find((w) => w.id === selectedWorkItemId);
        if (item) {
          const trimmed = prompt.trim();
          if (trimmed && (item.title === 'Untitled' || item.title === '')) {
            rename(selectedWorkItemId, trimmed.slice(0, 60));
          }
          if (item.shelf.task === null && trimmed) {
            updateShelf(selectedWorkItemId, { task: trimmed });
          }
          hasSetTitleRef.current = selectedWorkItemId;
        }
      }
      submitPrompt(prompt);
    },
    [submitPrompt, selectedWorkItemId, workItems, rename, updateShelf]
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

  // Can export if there is transcript data
  const canExportDiscussion = state.transcript.length > 0;

  // ---------------------------------------------------------------------------
  // Render — Discussion mode only
  // ---------------------------------------------------------------------------

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
      />

      {/* Prompt Input */}
      <PromptInput canSubmit={canSubmitPrompt} onSubmit={handleSubmit} />

      {/* Action Bar (Discussion mode) */}
      <ActionBar
        canClear={canClear()}
        isProcessing={processing}
        onClear={handleClear}
        onCancel={handleCancel}
        mode={mode}
        onFinishDiscussion={handleFinishDiscussion}
        canExport={canExportDiscussion}
      />
    </div>
  );
}
