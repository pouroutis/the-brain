// =============================================================================
// The Brain — WorkItem Context Provider (V2-B)
// =============================================================================

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Exchange, PendingExchange } from '../types/brain';
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
  /** Persist conversation snapshot to a work item (V2-H) */
  saveConversation: (id: string, exchanges: Exchange[], pendingExchange: PendingExchange | null) => void;
  /** Non-blocking storage warning (null = no warning) */
  storageWarning: string | null;
  /** Dismiss the storage warning */
  dismissStorageWarning: () => void;
}

const WorkItemCtx = createContext<WorkItemContextValue | null>(null);

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export function WorkItemProvider({ children }: { children: ReactNode }): JSX.Element {
  // V2-I: Validate stored selection on init — fallback to first active or create
  const [workItems, setWorkItems] = useState<WorkItem[]>(() => loadWorkItems());
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const items = loadWorkItems();
    const storedId = loadSelectedWorkItemId();
    if (storedId && items.some((w) => w.id === storedId)) return storedId;
    const firstActive = items.find((w) => w.status === 'active');
    return firstActive?.id ?? null;
  });
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  // Track mount to avoid double-persist on initial load
  const isMounted = useRef(false);

  // Persist work items on change
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    const success = saveWorkItems(workItems);
    if (!success) {
      setStorageWarning('Storage full — cannot save history.');
    }
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

  const saveConversation = useCallback(
    (id: string, exchanges: Exchange[], pendingExchange: PendingExchange | null) => {
      setWorkItems((prev) =>
        updateWorkItem(prev, id, () => ({ exchanges, pendingExchange }))
      );
    },
    [],
  );

  const dismissStorageWarning = useCallback(() => {
    setStorageWarning(null);
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
    saveConversation,
    storageWarning,
    dismissStorageWarning,
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
