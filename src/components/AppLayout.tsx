// =============================================================================
// The Brain — 3-Column App Layout (V2-C)
// =============================================================================

import { useWorkItems } from '../context/WorkItemContext';
import { BrainChat } from './BrainChat';
import { WorkItemSidebar } from './WorkItemSidebar';
import { ContextShelfPanel } from './ContextShelfPanel';

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function AppLayout(): JSX.Element {
  const { workItems, selectedWorkItemId } = useWorkItems();

  const selectedItem = selectedWorkItemId
    ? workItems.find((item) => item.id === selectedWorkItemId) ?? null
    : null;

  return (
    <div className="app-layout">
      <div className="app-layout__sidebar">
        <WorkItemSidebar />
      </div>
      <div className="app-layout__center">
        <BrainChat onReturnHome={() => {}} />
      </div>
      <div className="app-layout__shelf">
        <ContextShelfPanel selectedItem={selectedItem} />
      </div>
    </div>
  );
}
