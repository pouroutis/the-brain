// =============================================================================
// The Brain — WorkItem Context Provider (V2-B)
// =============================================================================

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { WorkItem, ContextShelf } from '../types/workItem';
import {
  loadWorkItems,
  saveWorkItems,
  loadSelectedWorkItemId,
  saveSelectedWorkItemId,
  createWorkItem,
  archiveWorkItem as archiveUtil,
  unarchiveWorkItem as unarchiveUtil,
  updateShelf as updateShelfUtil,
  updateWorkItem,
} from '../utils/workItemStore';

// -----------------------------------------------------------------------------
// Context Shape
// -----------------------------------------------------------------------------

interface WorkItemContextValue {
  workItems: WorkItem[];
  selectedWorkItemId: string | null;
  createNewWorkItem: (params?: { title?: string; task?: string | null }) => string;
  selectWorkItem: (id: string | null) => void;
  archive: (id: string) => void;
  unarchive: (id: string) => void;
  updateShelf: (id: string, patch: Partial<ContextShelf>) => void;
  rename: (id: string, title: string) => void;
}

const WorkItemCtx = createContext<WorkItemContextValue | null>(null);

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export function WorkItemProvider({ children }: { children: ReactNode }): JSX.Element {
  const [workItems, setWorkItems] = useState<WorkItem[]>(() => loadWorkItems());
  const [selectedId, setSelectedId] = useState<string | null>(() => loadSelectedWorkItemId());

  // Track mount to avoid double-persist on initial load
  const isMounted = useRef(false);

  // Persist work items on change
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    saveWorkItems(workItems);
  }, [workItems]);

  // Persist selected id on change
  useEffect(() => {
    saveSelectedWorkItemId(selectedId);
  }, [selectedId]);

  // --- Actions ---

  const createNewWorkItem = useCallback(
    (params?: { title?: string; task?: string | null }): string => {
      const item = createWorkItem(params);
      setWorkItems((prev) => [...prev, item]);
      setSelectedId(item.id);
      return item.id;
    },
    [],
  );

  const selectWorkItem = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const archive = useCallback((id: string) => {
    setWorkItems((prev) => archiveUtil(prev, id));
  }, []);

  const unarchive = useCallback((id: string) => {
    setWorkItems((prev) => unarchiveUtil(prev, id));
  }, []);

  const updateShelfAction = useCallback((id: string, patch: Partial<ContextShelf>) => {
    setWorkItems((prev) => updateShelfUtil(prev, id, patch));
  }, []);

  const rename = useCallback((id: string, title: string) => {
    setWorkItems((prev) => updateWorkItem(prev, id, () => ({ title })));
  }, []);

  // --- Context value ---

  const value: WorkItemContextValue = {
    workItems,
    selectedWorkItemId: selectedId,
    createNewWorkItem,
    selectWorkItem,
    archive,
    unarchive,
    updateShelf: updateShelfAction,
    rename,
  };

  return <WorkItemCtx.Provider value={value}>{children}</WorkItemCtx.Provider>;
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

export function useWorkItems(): WorkItemContextValue {
  const ctx = useContext(WorkItemCtx);
  if (ctx === null) {
    throw new Error('useWorkItems must be used within a WorkItemProvider');
  }
  return ctx;
}
