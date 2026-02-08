// =============================================================================
// The Brain — Work Item Sidebar (V2-C)
// =============================================================================

import { useState, useCallback } from 'react';
import { useWorkItems } from '../context/WorkItemContext';
import { useBrain } from '../context/BrainContext';

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function WorkItemSidebar(): JSX.Element {
  const { workItems, selectedWorkItemId, createNewWorkItem, selectWorkItem, archive, unarchive, saveConversation } = useWorkItems();
  const { getState, loadConversationSnapshot } = useBrain();
  const [view, setView] = useState<'active' | 'archived'>('active');

  const filteredItems = workItems.filter((item) => item.status === view);

  // Save current BrainState conversation to the currently-selected work item
  const saveCurrentConversation = useCallback(() => {
    if (!selectedWorkItemId) return;
    const { exchanges, pendingExchange } = getState();
    saveConversation(selectedWorkItemId, exchanges, pendingExchange);
  }, [selectedWorkItemId, getState, saveConversation]);

  // Swap: save current → create new → load empty
  const handleNewConversation = useCallback(() => {
    saveCurrentConversation();
    createNewWorkItem();
    loadConversationSnapshot([], null);
  }, [saveCurrentConversation, createNewWorkItem, loadConversationSnapshot]);

  // Swap: save current → select → load target
  const handleSelectItem = useCallback(
    (id: string) => {
      if (id === selectedWorkItemId) return;
      saveCurrentConversation();
      selectWorkItem(id);
      const item = workItems.find((w) => w.id === id);
      loadConversationSnapshot(item?.exchanges ?? [], item?.pendingExchange ?? null);
    },
    [selectedWorkItemId, saveCurrentConversation, selectWorkItem, workItems, loadConversationSnapshot],
  );

  const handleArchive = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (id === selectedWorkItemId) {
        // Save conversation to the item before archiving
        saveCurrentConversation();
        selectWorkItem(null);
        loadConversationSnapshot([], null);
      }
      archive(id);
    },
    [archive, selectWorkItem, selectedWorkItemId, saveCurrentConversation, loadConversationSnapshot],
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

      <button className="work-item-sidebar__new-btn" onClick={handleNewConversation}>
        + New Conversation
      </button>

      <div className="work-item-sidebar__list">
        {filteredItems.length === 0 && (
          <div className="work-item-sidebar__empty">
            {view === 'active' ? 'No active items' : 'No archived items'}
          </div>
        )}
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className={`work-item-sidebar__item${item.id === selectedWorkItemId ? ' work-item-sidebar__item--selected' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => handleSelectItem(item.id)}
            onKeyDown={(e) => handleItemKeyDown(e, item.id)}
          >
            <div className="work-item-sidebar__item-info">
              <span className="work-item-sidebar__item-title">{item.title}</span>
              <span className="work-item-sidebar__item-date">
                {new Date(item.updatedAt).toLocaleDateString()}
              </span>
            </div>
            {view === 'active' ? (
              <button
                className="work-item-sidebar__item-action"
                aria-label={`Archive ${item.title}`}
                onClick={(e) => handleArchive(e, item.id)}
              >
                Archive
              </button>
            ) : (
              <button
                className="work-item-sidebar__item-action"
                aria-label={`Restore ${item.title}`}
                onClick={(e) => handleRestore(e, item.id)}
              >
                Restore
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
