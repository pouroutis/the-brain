// =============================================================================
// The Brain — Context Shelf Panel (V2-C — Read-Only)
// =============================================================================

import { useState, useCallback } from 'react';
import type { WorkItem } from '../types/workItem';
import { useWorkItems } from '../context/WorkItemContext';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ContextShelfPanelProps {
  selectedItem: WorkItem | null | undefined;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ContextShelfPanel({ selectedItem }: ContextShelfPanelProps): JSX.Element {
  const { updateShelf } = useWorkItems();

  const [isEditingTask, setIsEditingTask] = useState(false);
  const [taskDraft, setTaskDraft] = useState('');

  const handleStartEdit = useCallback(() => {
    if (!selectedItem) return;
    setTaskDraft(selectedItem.shelf.task ?? '');
    setIsEditingTask(true);
  }, [selectedItem]);

  const handleSaveTask = useCallback(() => {
    if (!selectedItem) return;
    const trimmed = taskDraft.trim();
    updateShelf(selectedItem.id, { task: trimmed || null });
    setIsEditingTask(false);
  }, [selectedItem, taskDraft, updateShelf]);

  const handleCancelEdit = useCallback(() => {
    setIsEditingTask(false);
  }, []);

  const handleTaskKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSaveTask();
      } else if (e.key === 'Escape') {
        handleCancelEdit();
      }
    },
    [handleSaveTask, handleCancelEdit],
  );

  const handleClearPinnedPrompt = useCallback(() => {
    if (!selectedItem) return;
    updateShelf(selectedItem.id, { pinnedPrompt: null });
  }, [selectedItem, updateShelf]);

  const handleClearExecutionNotes = useCallback(() => {
    if (!selectedItem) return;
    updateShelf(selectedItem.id, { executionNotes: null });
  }, [selectedItem, updateShelf]);

  if (!selectedItem) {
    return (
      <div className="context-shelf">
        <div className="context-shelf__header">
          <h2 className="context-shelf__title">Context Shelf</h2>
        </div>
        <div className="context-shelf__empty-state">
          Select a work item to view its context
        </div>
      </div>
    );
  }

  const { shelf } = selectedItem;
  const activeSignals = Object.entries(shelf.signals)
    .filter(([, v]) => v)
    .map(([k]) => {
      if (k === 'hasFiles') return 'Files';
      if (k === 'hasPrompt') return 'Prompt';
      if (k === 'hasResults') return 'Results';
      return k;
    });

  return (
    <div className="context-shelf">
      <div className="context-shelf__header">
        <h2 className="context-shelf__title">Context Shelf</h2>
        {activeSignals.length > 0 && (
          <div className="context-shelf__signals">
            {activeSignals.map((label) => (
              <span key={label} className="context-shelf__signal-tag">{label}</span>
            ))}
          </div>
        )}
      </div>

      {/* Task */}
      <div className="context-shelf__section">
        <div className="context-shelf__section-header">
          <h3 className="context-shelf__section-label">Task</h3>
          {!isEditingTask && (
            <button className="context-shelf__edit-btn" onClick={handleStartEdit}>
              Edit
            </button>
          )}
        </div>
        {isEditingTask ? (
          <input
            className="context-shelf__task-input"
            value={taskDraft}
            onChange={(e) => setTaskDraft(e.target.value)}
            onKeyDown={handleTaskKeyDown}
            onBlur={handleSaveTask}
            autoFocus
          />
        ) : shelf.task ? (
          <p className="context-shelf__text">{shelf.task}</p>
        ) : (
          <p className="context-shelf__placeholder">No task set</p>
        )}
      </div>

      {/* Files */}
      <div className="context-shelf__section">
        <h3 className="context-shelf__section-label">Files</h3>
        {shelf.files.length > 0 ? (
          <ul className="context-shelf__file-list">
            {shelf.files.map((f) => (
              <li key={f.id} className="context-shelf__file-item">{f.name}</li>
            ))}
          </ul>
        ) : (
          <p className="context-shelf__placeholder">No files attached</p>
        )}
      </div>

      {/* Pinned Prompt */}
      <div className="context-shelf__section">
        <div className="context-shelf__section-header">
          <h3 className="context-shelf__section-label">Pinned Prompt</h3>
          {shelf.pinnedPrompt && (
            <button className="context-shelf__clear-btn" onClick={handleClearPinnedPrompt}>
              Clear
            </button>
          )}
        </div>
        {shelf.pinnedPrompt ? (
          <pre className="context-shelf__pre">{shelf.pinnedPrompt}</pre>
        ) : (
          <p className="context-shelf__placeholder">No pinned prompt</p>
        )}
      </div>

      {/* Execution Notes */}
      <div className="context-shelf__section">
        <div className="context-shelf__section-header">
          <h3 className="context-shelf__section-label">Execution Notes</h3>
          {shelf.executionNotes && (
            <button className="context-shelf__clear-btn" onClick={handleClearExecutionNotes}>
              Clear
            </button>
          )}
        </div>
        {shelf.executionNotes ? (
          <pre className="context-shelf__pre">{shelf.executionNotes}</pre>
        ) : (
          <p className="context-shelf__placeholder">No execution notes</p>
        )}
      </div>
    </div>
  );
}
