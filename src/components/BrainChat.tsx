// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// BrainChat Container Component (Discussion Mode Only)
// =============================================================================

import { useCallback, useEffect, useMemo, useRef } from 'react';
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
    getAnchorAgent,
    // V2-H
    loadConversationSnapshot,
  } = useBrain();

  // WorkItem binding (V2-C — title derivation on first prompt)
  const { workItems, selectedWorkItemId, rename, updateShelf, saveConversation } = useWorkItems();
  const hasSetTitleRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // V2-H: Initial load — populate BrainState from selected work item on mount
  // ---------------------------------------------------------------------------

  const initialLoadDoneRef = useRef(false);
  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    if (selectedWorkItemId) {
      const item = workItems.find((w) => w.id === selectedWorkItemId);
      // V2-J: Only load snapshot for active items (archived items should have been
      // filtered out by selection restore, but guard defensively)
      if (item && item.status === 'active' && item.exchanges.length > 0) {
        loadConversationSnapshot(item.exchanges, item.pendingExchange);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Derived state from selectors
  // ---------------------------------------------------------------------------

  const state = getState();
  const exchanges = getExchanges();
  const pendingExchange = getPendingExchange();
  const currentAgent = state.currentAgent;
  const warning = getWarning();
  const processing = isProcessing();
  const anchorAgent = getAnchorAgent();
  const mode = 'discussion';

  // ---------------------------------------------------------------------------
  // V2-H: Auto-save — persist to work item when a new exchange is completed
  // ---------------------------------------------------------------------------

  // V2-I: Track which work item the current conversation belongs to
  const conversationOwnerRef = useRef<string | null>(selectedWorkItemId);
  useEffect(() => {
    conversationOwnerRef.current = selectedWorkItemId;
  }, [selectedWorkItemId]);

  const prevExchangeLenRef = useRef(exchanges.length);

  // V2-J: Reset auto-save baseline on work item switch to prevent swap-triggered saves.
  // When the selected item changes, the new snapshot's exchange count becomes the baseline.
  // Declared before auto-save so it fires first in the same render cycle.
  useEffect(() => {
    prevExchangeLenRef.current = exchanges.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkItemId]);

  useEffect(() => {
    const currentLen = exchanges.length;
    if (currentLen > prevExchangeLenRef.current && selectedWorkItemId) {
      // V2-I: ID mismatch guard — only save if owner matches
      if (conversationOwnerRef.current !== selectedWorkItemId) {
        console.warn(`[TheBrain] Auto-save skipped: conversation owner (${conversationOwnerRef.current}) !== selected (${selectedWorkItemId})`);
        prevExchangeLenRef.current = currentLen;
        return;
      }
      saveConversation(selectedWorkItemId, exchanges, null);
    }
    prevExchangeLenRef.current = currentLen;
  }, [exchanges, selectedWorkItemId, saveConversation]);

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
    if (processing) return;
    clearBoard();
    // V2-H: Persist cleared state to the work item
    if (selectedWorkItemId) {
      saveConversation(selectedWorkItemId, [], null);
    }
  }, [clearBoard, processing, selectedWorkItemId, saveConversation]);

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
    const jsonContent = exportTranscriptAsJson(session, transcript, state.exchanges);
    downloadFile(jsonContent, `brain-transcript-${timestamp}.json`, 'application/json');

    // Export as Markdown
    const mdContent = exportTranscriptAsMarkdown(session, transcript, state.exchanges);
    downloadFile(mdContent, `brain-transcript-${timestamp}.md`, 'text/markdown');
  }, [state.discussionSession, state.transcript]);

  // V2-K: Memoize export check — only recompute when transcript changes
  const canExportDiscussion = useMemo(() => state.transcript.length > 0, [state.transcript]);

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
        anchorAgent={anchorAgent}
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
