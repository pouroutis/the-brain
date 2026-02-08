// =============================================================================
// The Brain — Work Item Sidebar (V2-C)
// =============================================================================

import { useState, useCallback, useMemo } from 'react';
import { useWorkItems } from '../context/WorkItemContext';
import { useBrain } from '../context/BrainContext';

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function WorkItemSidebar(): JSX.Element {
  const { workItems, selectedWorkItemId, createNewWorkItem, selectWorkItem, archive, unarchive, saveConversation } = useWorkItems();
  const { getState, loadConversationSnapshot, isProcessing } = useBrain();
  const [view, setView] = useState<'active' | 'archived'>('active');

  const processing = isProcessing();
  // V2-K: Memoize filtered list — only recompute when workItems or view changes
  const filteredItems = useMemo(() => workItems.filter((item) => item.status === view), [workItems, view]);

  // Save current BrainState conversation to the currently-selected work item
  // V2-I: ID mismatch guard — only save if selectedWorkItemId matches
  const saveCurrentConversation = useCallback(() => {
    if (!selectedWorkItemId) return;
    const { exchanges, pendingExchange } = getState();
    saveConversation(selectedWorkItemId, exchanges, pendingExchange);
  }, [selectedWorkItemId, getState, saveConversation]);

  // Swap: save current → create new → load empty
  // V2-I: Blocked while processing
  const handleNewConversation = useCallback(() => {
    if (processing) return;
    saveCurrentConversation();
    createNewWorkItem();
    loadConversationSnapshot([], null);
  }, [processing, saveCurrentConversation, createNewWorkItem, loadConversationSnapshot]);

  // Swap: save current → select → load target
  // V2-I: Blocked while processing
  const handleSelectItem = useCallback(
    (id: string) => {
      if (id === selectedWorkItemId) return;
      if (processing) return;
      saveCurrentConversation();
      selectWorkItem(id);
      const item = workItems.find((w) => w.id === id);
      loadConversationSnapshot(item?.exchanges ?? [], item?.pendingExchange ?? null);
    },
    [selectedWorkItemId, processing, saveCurrentConversation, selectWorkItem, workItems, loadConversationSnapshot],
  );

  // V2-I: Blocked while processing
  // V2-J: Fall back to next active item (not null) after archiving selected
  const handleArchive = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (processing) return;
      if (id === selectedWorkItemId) {
        // Save conversation to the item before archiving
        saveCurrentConversation();
        // Fall back to next active item (excluding the one being archived)
        const nextActive = workItems.find((w) => w.status === 'active' && w.id !== id);
        if (nextActive) {
          selectWorkItem(nextActive.id);
          loadConversationSnapshot(nextActive.exchanges, nextActive.pendingExchange);
        } else {
          selectWorkItem(null);
          loadConversationSnapshot([], null);
        }
      }
      archive(id);
    },
    [archive, selectWorkItem, selectedWorkItemId, processing, saveCurrentConversation, loadConversationSnapshot, workItems],
  );

  const handleRestore = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      unarchive(id);
    },
    [unarchive],
  );

  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelectItem(id);
      }
    },
    [handleSelectItem],
  );

  return (
    <div className="work-item-sidebar">
      <div className="work-item-sidebar__header">
        <h2 className="work-item-sidebar__title">Work Items</h2>
        <div className="work-item-sidebar__toggle">
          <button
            className={`work-item-sidebar__toggle-btn${view === 'active' ? ' work-item-sidebar__toggle-btn--active' : ''}`}
            onClick={() => setView('active')}
          >
            Active
          </button>
          <button
            className={`work-item-sidebar__toggle-btn${view === 'archived' ? ' work-item-sidebar__toggle-btn--active' : ''}`}
            onClick={() => setView('archived')}
          >
            Archived
          </button>
        </div>
      </div>

      <button
        className="work-item-sidebar__new-btn"
        onClick={handleNewConversation}
        disabled={processing}
      >
        + New Conversation
      </button>

      <div className="work-item-sidebar__list">
        {filteredItems.length === 0 && (
          <div className="work-item-sidebar__empty">
            {view === 'active' ? 'No active items' : 'No archived items'}
          </div>
        )}
        {filteredItems.map((item) => {
          const isSelected = item.id === selectedWorkItemId;
          const isDisabled = processing && !isSelected;
          return (
            <div
              key={item.id}
              className={`work-item-sidebar__item${isSelected ? ' work-item-sidebar__item--selected' : ''}${isDisabled ? ' work-item-sidebar__item--disabled' : ''}`}
              role="button"
              tabIndex={isDisabled ? -1 : 0}
              onClick={() => handleSelectItem(item.id)}
              onKeyDown={(e) => handleItemKeyDown(e, item.id)}
              aria-disabled={isDisabled}
            >
              <div className="work-item-sidebar__item-info">
                <span className="work-item-sidebar__item-title">{item.title}</span>
                <span className="work-item-sidebar__item-date">
                  {new Date(item.updatedAt).toLocaleDateString()}
                </span>
              </div>
              {/* V2-I: Running badge on the active (selected) item while processing */}
              {isSelected && processing && (
                <span className="work-item-sidebar__running-badge">Running…</span>
              )}
              {view === 'active' && !processing ? (
                <button
                  className="work-item-sidebar__item-action"
                  aria-label={`Archive ${item.title}`}
                  onClick={(e) => handleArchive(e, item.id)}
                >
                  Archive
                </button>
              ) : view === 'archived' ? (
                <button
                  className="work-item-sidebar__item-action"
                  aria-label={`Restore ${item.title}`}
                  onClick={(e) => handleRestore(e, item.id)}
                >
                  Restore
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
