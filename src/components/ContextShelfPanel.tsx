// =============================================================================
// The Brain — Context Shelf Panel (V2-C — Read-Only)
// =============================================================================

import type { WorkItem } from '../types/workItem';

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
        <h3 className="context-shelf__section-label">Task</h3>
        {shelf.task ? (
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
        <h3 className="context-shelf__section-label">Pinned Prompt</h3>
        {shelf.pinnedPrompt ? (
          <pre className="context-shelf__pre">{shelf.pinnedPrompt}</pre>
        ) : (
          <p className="context-shelf__placeholder">No pinned prompt</p>
        )}
      </div>

      {/* Execution Notes */}
      <div className="context-shelf__section">
        <h3 className="context-shelf__section-label">Execution Notes</h3>
        {shelf.executionNotes ? (
          <pre className="context-shelf__pre">{shelf.executionNotes}</pre>
        ) : (
          <p className="context-shelf__placeholder">No execution notes</p>
        )}
      </div>
    </div>
  );
}
