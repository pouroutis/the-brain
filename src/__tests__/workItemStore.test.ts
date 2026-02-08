// =============================================================================
// The Brain — WorkItem Store Tests (V2-B)
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import type { ContextShelf } from '../types/workItem';
import {
  createWorkItem,
  deriveSignals,
  updateShelf,
  archiveWorkItem,
  unarchiveWorkItem,
  loadWorkItems,
  saveWorkItems,
  loadSelectedWorkItemId,
  saveSelectedWorkItemId,
  updateWorkItem,
} from '../utils/workItemStore';

// -----------------------------------------------------------------------------
// Mock localStorage
// -----------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

beforeEach(() => {
  localStorageMock.clear();
});

// -----------------------------------------------------------------------------
// createWorkItem Tests
// -----------------------------------------------------------------------------

describe('createWorkItem', () => {
  it('creates item with default values', () => {
    const item = createWorkItem();

    expect(item.id).toBeTruthy();
    expect(item.title).toBe('Untitled');
    expect(item.status).toBe('active');
    expect(item.shelf.task).toBeNull();
    expect(item.shelf.files).toEqual([]);
    expect(item.shelf.pinnedPrompt).toBeNull();
    expect(item.shelf.executionNotes).toBeNull();
    expect(item.shelf.signals.hasTask).toBe(false);
    expect(item.shelf.signals.hasFiles).toBe(false);
    expect(item.shelf.signals.hasPrompt).toBe(false);
    expect(item.shelf.signals.hasResults).toBe(false);
  });

  it('uses explicit title when provided', () => {
    const item = createWorkItem({ title: 'My Task' });
    expect(item.title).toBe('My Task');
  });

  it('derives title from task when title not provided', () => {
    const item = createWorkItem({ task: '  Build a login page  ' });
    expect(item.title).toBe('Build a login page');
    expect(item.shelf.task).toBe('  Build a login page  ');
  });

  it('truncates derived title to 60 chars', () => {
    const longTask = 'A'.repeat(100);
    const item = createWorkItem({ task: longTask });
    expect(item.title).toHaveLength(60);
  });

  it('uses provided timestamp', () => {
    const item = createWorkItem({ now: 1000 });
    expect(item.createdAt).toBe(1000);
    expect(item.updatedAt).toBe(1000);
  });

  it('prefers explicit title over task-derived title', () => {
    const item = createWorkItem({ title: 'Custom', task: 'Some task text' });
    expect(item.title).toBe('Custom');
    expect(item.shelf.task).toBe('Some task text');
  });
});

// -----------------------------------------------------------------------------
// deriveSignals Tests
// -----------------------------------------------------------------------------

describe('deriveSignals', () => {
  const emptyShelf: ContextShelf = {
    task: null,
    files: [],
    pinnedPrompt: null,
    executionNotes: null,
    signals: { hasTask: false, hasFiles: false, hasPrompt: false, hasResults: false },
  };

  it('all false for empty shelf', () => {
    const signals = deriveSignals(emptyShelf);
    expect(signals.hasTask).toBe(false);
    expect(signals.hasFiles).toBe(false);
    expect(signals.hasPrompt).toBe(false);
    expect(signals.hasResults).toBe(false);
  });

  it('hasFiles true when files present', () => {
    const shelf: ContextShelf = {
      ...emptyShelf,
      files: [{ id: 'f1', name: 'test.ts', addedAt: Date.now() }],
    };
    const signals = deriveSignals(shelf);
    expect(signals.hasFiles).toBe(true);
  });

  it('hasPrompt true when pinnedPrompt non-empty', () => {
    const shelf: ContextShelf = { ...emptyShelf, pinnedPrompt: 'Do this' };
    const signals = deriveSignals(shelf);
    expect(signals.hasPrompt).toBe(true);
  });

  it('hasPrompt false for empty string', () => {
    const shelf: ContextShelf = { ...emptyShelf, pinnedPrompt: '' };
    const signals = deriveSignals(shelf);
    expect(signals.hasPrompt).toBe(false);
  });

  it('hasResults true when executionNotes non-empty', () => {
    const shelf: ContextShelf = { ...emptyShelf, executionNotes: 'Result data' };
    const signals = deriveSignals(shelf);
    expect(signals.hasResults).toBe(true);
  });

  it('hasTask true when task is non-empty string', () => {
    const shelf: ContextShelf = { ...emptyShelf, task: 'Do something' };
    const signals = deriveSignals(shelf);
    expect(signals.hasTask).toBe(true);
  });

  it('hasTask false for null task', () => {
    const shelf: ContextShelf = { ...emptyShelf, task: null };
    const signals = deriveSignals(shelf);
    expect(signals.hasTask).toBe(false);
  });

  it('hasTask false for empty string task', () => {
    const shelf: ContextShelf = { ...emptyShelf, task: '' };
    const signals = deriveSignals(shelf);
    expect(signals.hasTask).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// updateShelf Tests
// -----------------------------------------------------------------------------

describe('updateShelf', () => {
  it('merges shelf patch and recomputes signals', () => {
    const item = createWorkItem({ now: 1000 });
    const items = [item];

    const updated = updateShelf(items, item.id, {
      pinnedPrompt: 'Build it',
      files: [{ id: 'f1', name: 'app.ts', addedAt: 2000 }],
    });

    const result = updated[0];
    expect(result.shelf.pinnedPrompt).toBe('Build it');
    expect(result.shelf.files).toHaveLength(1);
    expect(result.shelf.signals.hasFiles).toBe(true);
    expect(result.shelf.signals.hasPrompt).toBe(true);
    expect(result.shelf.signals.hasResults).toBe(false);
    // task should remain null (not in patch)
    expect(result.shelf.task).toBeNull();
  });

  it('preserves other items in the array', () => {
    const item1 = createWorkItem({ title: 'A', now: 1000 });
    const item2 = createWorkItem({ title: 'B', now: 2000 });
    const items = [item1, item2];

    const updated = updateShelf(items, item1.id, { executionNotes: 'Done' });
    expect(updated[0].shelf.executionNotes).toBe('Done');
    expect(updated[1]).toBe(item2); // reference equality — untouched
  });
});

// -----------------------------------------------------------------------------
// archiveWorkItem / unarchiveWorkItem Tests
// -----------------------------------------------------------------------------

describe('archiveWorkItem / unarchiveWorkItem', () => {
  it('archives an active item', () => {
    const item = createWorkItem();
    const items = [item];

    const updated = archiveWorkItem(items, item.id);
    expect(updated[0].status).toBe('archived');
  });

  it('unarchives an archived item', () => {
    const item = createWorkItem();
    const items = archiveWorkItem([item], item.id);
    expect(items[0].status).toBe('archived');

    const restored = unarchiveWorkItem(items, items[0].id);
    expect(restored[0].status).toBe('active');
  });
});

// -----------------------------------------------------------------------------
// updateWorkItem Tests
// -----------------------------------------------------------------------------

describe('updateWorkItem', () => {
  it('bumps updatedAt on update', () => {
    const item = createWorkItem({ now: 1000 });
    const items = [item];

    const updated = updateWorkItem(items, item.id, () => ({ title: 'New Title' }));
    expect(updated[0].title).toBe('New Title');
    expect(updated[0].updatedAt).toBeGreaterThan(1000);
  });

  it('no-ops for non-matching id', () => {
    const item = createWorkItem({ now: 1000 });
    const items = [item];

    const updated = updateWorkItem(items, 'nonexistent', () => ({ title: 'X' }));
    expect(updated[0]).toBe(item); // reference equality
  });
});

// -----------------------------------------------------------------------------
// Persistence — WorkItems
// -----------------------------------------------------------------------------

describe('WorkItem persistence', () => {
  it('saveWorkItems then loadWorkItems roundtrip', () => {
    const item = createWorkItem({ title: 'Test', now: 5000 });
    saveWorkItems([item]);

    const loaded = loadWorkItems();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(item.id);
    expect(loaded[0].title).toBe('Test');
    expect(loaded[0].shelf.task).toBeNull();
  });

  it('returns [] when storage is empty', () => {
    expect(loadWorkItems()).toEqual([]);
  });

  it('returns [] on corrupted JSON', () => {
    localStorage.setItem('thebrain_workitems_v1', '{invalid json');
    expect(loadWorkItems()).toEqual([]);
  });

  it('returns [] on non-array JSON', () => {
    localStorage.setItem('thebrain_workitems_v1', '"hello"');
    expect(loadWorkItems()).toEqual([]);
  });

  it('filters out invalid items during load', () => {
    const valid = createWorkItem({ title: 'Good' });
    const invalid = { foo: 'bar' };
    localStorage.setItem('thebrain_workitems_v1', JSON.stringify([valid, invalid]));

    const loaded = loadWorkItems();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(valid.id);
  });
});

// -----------------------------------------------------------------------------
// Persistence — Selected ID
// -----------------------------------------------------------------------------

describe('Selected work item ID persistence', () => {
  it('save then load roundtrip', () => {
    saveSelectedWorkItemId('item-123');
    expect(loadSelectedWorkItemId()).toBe('item-123');
  });

  it('returns null when storage is empty', () => {
    expect(loadSelectedWorkItemId()).toBeNull();
  });

  it('returns null on corrupted JSON', () => {
    localStorage.setItem('thebrain_selected_item_v1', '{bad}');
    expect(loadSelectedWorkItemId()).toBeNull();
  });

  it('returns null on non-string JSON', () => {
    localStorage.setItem('thebrain_selected_item_v1', '42');
    expect(loadSelectedWorkItemId()).toBeNull();
  });

  it('saving null removes the key', () => {
    saveSelectedWorkItemId('item-123');
    expect(loadSelectedWorkItemId()).toBe('item-123');

    saveSelectedWorkItemId(null);
    expect(loadSelectedWorkItemId()).toBeNull();
  });
});
