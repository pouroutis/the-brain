// =============================================================================
// The Brain — WorkItem Store + Persistence (V2-B)
// =============================================================================

import type { WorkItem, ContextShelf } from '../types/workItem';

// -----------------------------------------------------------------------------
// Storage Keys
// -----------------------------------------------------------------------------

const STORAGE_KEY_ITEMS = 'thebrain_workitems_v1';
const STORAGE_KEY_SELECTED = 'thebrain_selected_item_v1';

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

function isValidWorkItem(value: unknown): value is WorkItem {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    (obj.status === 'active' || obj.status === 'archived') &&
    typeof obj.shelf === 'object' &&
    obj.shelf !== null
  );
}

// -----------------------------------------------------------------------------
// Persistence — Load / Save
// -----------------------------------------------------------------------------

export function loadWorkItems(): WorkItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ITEMS);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(isValidWorkItem);
    // Migration (V2-H): ensure conversation fields exist on older items
    return valid.map((item) => ({
      ...item,
      exchanges: item.exchanges ?? [],
      pendingExchange: item.pendingExchange ?? null,
    }));
  } catch {
    return [];
  }
}

export function saveWorkItems(items: WorkItem[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(items));
    return true;
  } catch {
    // Storage full or unavailable
    return false;
  }
}

export function loadSelectedWorkItemId(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SELECTED);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSelectedWorkItemId(id: string | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY_SELECTED);
    } else {
      localStorage.setItem(STORAGE_KEY_SELECTED, JSON.stringify(id));
    }
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

// -----------------------------------------------------------------------------
// Helpers — Shelf Signals
// -----------------------------------------------------------------------------

export function deriveSignals(shelf: ContextShelf): ContextShelf['signals'] {
  return {
    hasTask: !!shelf.task,
    hasFiles: shelf.files.length > 0,
    hasPrompt: !!shelf.pinnedPrompt,
    hasResults: !!shelf.executionNotes,
  };
}

// -----------------------------------------------------------------------------
// Helpers — Empty Shelf
// -----------------------------------------------------------------------------

function createEmptyShelf(): ContextShelf {
  return {
    task: null,
    files: [],
    pinnedPrompt: null,
    executionNotes: null,
    signals: { hasTask: false, hasFiles: false, hasPrompt: false, hasResults: false },
  };
}

// -----------------------------------------------------------------------------
// CRUD — Create
// -----------------------------------------------------------------------------

export function createWorkItem(params?: {
  title?: string;
  task?: string | null;
  now?: number;
}): WorkItem {
  const now = params?.now ?? Date.now();
  const task = params?.task ?? null;

  // Title: explicit > derived from task > default
  let title: string;
  if (params?.title) {
    title = params.title;
  } else if (task) {
    title = task.trim().slice(0, 60);
  } else {
    title = 'Untitled';
  }

  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${now}-${Math.random().toString(36).slice(2, 10)}`;

  const shelf = createEmptyShelf();
  if (task) {
    shelf.task = task;
  }

  return {
    id,
    title,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    shelf,
    exchanges: [],
    pendingExchange: null,
  };
}

// -----------------------------------------------------------------------------
// CRUD — Update (immutable)
// -----------------------------------------------------------------------------

export function updateWorkItem(
  items: WorkItem[],
  id: string,
  updater: (item: WorkItem) => Partial<WorkItem>,
): WorkItem[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    const patch = updater(item);
    return { ...item, ...patch, updatedAt: Date.now() };
  });
}

// -----------------------------------------------------------------------------
// CRUD — Archive / Unarchive
// -----------------------------------------------------------------------------

export function archiveWorkItem(items: WorkItem[], id: string): WorkItem[] {
  return updateWorkItem(items, id, () => ({ status: 'archived' }));
}

export function unarchiveWorkItem(items: WorkItem[], id: string): WorkItem[] {
  return updateWorkItem(items, id, () => ({ status: 'active' }));
}

// -----------------------------------------------------------------------------
// CRUD — Update Shelf (merge patch + recompute signals)
// -----------------------------------------------------------------------------

export function updateShelf(
  items: WorkItem[],
  id: string,
  shelfPatch: Partial<ContextShelf>,
): WorkItem[] {
  return updateWorkItem(items, id, (item) => {
    const merged: ContextShelf = { ...item.shelf, ...shelfPatch };
    merged.signals = deriveSignals(merged);
    return { shelf: merged };
  });
}
