// =============================================================================
// The Brain — Work Item Sidebar (V2-C)
// =============================================================================

import { useState, useCallback } from 'react';
import { useWorkItems } from '../context/WorkItemContext';

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function WorkItemSidebar(): JSX.Element {
  const { workItems, selectedWorkItemId, createNewWorkItem, selectWorkItem } = useWorkItems();
  const [view, setView] = useState<'active' | 'archived'>('active');

  const filteredItems = workItems.filter((item) => item.status === view);

  const handleNewConversation = useCallback(() => {
    createNewWorkItem();
  }, [createNewWorkItem]);

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
          <button
            key={item.id}
            className={`work-item-sidebar__item${item.id === selectedWorkItemId ? ' work-item-sidebar__item--selected' : ''}`}
            onClick={() => selectWorkItem(item.id)}
          >
            <span className="work-item-sidebar__item-title">{item.title}</span>
            <span className="work-item-sidebar__item-date">
              {new Date(item.updatedAt).toLocaleDateString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
