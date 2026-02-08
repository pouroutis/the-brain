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
// V2-H: Conversation Fields
// -----------------------------------------------------------------------------

describe('createWorkItem — conversation fields (V2-H)', () => {
  it('initializes with empty exchanges and null pendingExchange', () => {
    const item = createWorkItem();
    expect(item.exchanges).toEqual([]);
    expect(item.pendingExchange).toBeNull();
  });
});

describe('WorkItem swap — conversation snapshots (V2-H)', () => {
  it('create → select → conversation snapshot is empty', () => {
    const item = createWorkItem();
    expect(item.exchanges).toEqual([]);
    expect(item.pendingExchange).toBeNull();
  });

  it('switching between items preserves conversations via updateWorkItem', () => {
    const item1 = createWorkItem({ title: 'Item 1' });
    const item2 = createWorkItem({ title: 'Item 2' });
    const exchange1 = { id: 'ex-1', userPrompt: 'Q1', responsesByAgent: {}, timestamp: 1000 };

    const updated = updateWorkItem([item1, item2], item1.id, () => ({
      exchanges: [exchange1],
      pendingExchange: null,
    }));

    const foundItem1 = updated.find((i) => i.id === item1.id)!;
    expect(foundItem1.exchanges).toHaveLength(1);
    expect(foundItem1.exchanges[0].userPrompt).toBe('Q1');

    const foundItem2 = updated.find((i) => i.id === item2.id)!;
    expect(foundItem2.exchanges).toEqual([]);
  });

  it('rename persists on item with conversations', () => {
    const item = createWorkItem();
    const exchange = { id: 'ex-1', userPrompt: 'test', responsesByAgent: {}, timestamp: 1000 };

    let items = updateWorkItem([item], item.id, () => ({
      exchanges: [exchange],
    }));
    items = updateWorkItem(items, item.id, () => ({ title: 'New Name' }));

    expect(items[0].title).toBe('New Name');
    expect(items[0].exchanges).toHaveLength(1);
  });

  it('archive/restore does not corrupt conversation snapshots', () => {
    const item = createWorkItem();
    const exchange = { id: 'ex-1', userPrompt: 'Q1', responsesByAgent: {}, timestamp: 1000 };

    let items = updateWorkItem([item], item.id, () => ({
      exchanges: [exchange],
    }));

    items = archiveWorkItem(items, item.id);
    expect(items[0].status).toBe('archived');
    expect(items[0].exchanges).toHaveLength(1);

    items = unarchiveWorkItem(items, items[0].id);
    expect(items[0].status).toBe('active');
    expect(items[0].exchanges).toHaveLength(1);
    expect(items[0].exchanges[0].userPrompt).toBe('Q1');
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

// -----------------------------------------------------------------------------
// V2-H: Persistence — Conversation Fields + Migration
// -----------------------------------------------------------------------------

describe('WorkItem persistence — conversation fields (V2-H)', () => {
  it('roundtrip preserves conversation fields', () => {
    const item = createWorkItem({ title: 'Test' });
    const exchange = { id: 'ex-1', userPrompt: 'Q1', responsesByAgent: {}, timestamp: 1000 };
    const updated = updateWorkItem([item], item.id, () => ({
      exchanges: [exchange],
    }));

    saveWorkItems(updated);
    const loaded = loadWorkItems();

    expect(loaded[0].exchanges).toHaveLength(1);
    expect(loaded[0].exchanges[0].userPrompt).toBe('Q1');
    expect(loaded[0].pendingExchange).toBeNull();
  });

  it('migration: items without exchanges get defaults', () => {
    const oldItem = {
      id: 'old-1',
      title: 'Old',
      status: 'active',
      createdAt: 1000,
      updatedAt: 1000,
      shelf: {
        task: null,
        files: [],
        pinnedPrompt: null,
        executionNotes: null,
        signals: { hasTask: false, hasFiles: false, hasPrompt: false, hasResults: false },
      },
    };
    localStorage.setItem('thebrain_workitems_v1', JSON.stringify([oldItem]));

    const loaded = loadWorkItems();
    expect(loaded[0].exchanges).toEqual([]);
    expect(loaded[0].pendingExchange).toBeNull();
  });

  it('saveWorkItems returns true on success', () => {
    const item = createWorkItem();
    expect(saveWorkItems([item])).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// V2-I: Selection Restore + Swap Guard
// -----------------------------------------------------------------------------

describe('Selection restore — stored ID validation (V2-I)', () => {
  it('loadSelectedWorkItemId returns stored id when it exists in items', () => {
    const item = createWorkItem({ title: 'Valid' });
    saveWorkItems([item]);
    saveSelectedWorkItemId(item.id);

    const storedId = loadSelectedWorkItemId();
    const items = loadWorkItems();
    const valid = items.some((w) => w.id === storedId);
    expect(valid).toBe(true);
  });

  it('stored id pointing to nonexistent item can be detected', () => {
    const item = createWorkItem({ title: 'Alive' });
    saveWorkItems([item]);
    saveSelectedWorkItemId('deleted-id');

    const storedId = loadSelectedWorkItemId();
    const items = loadWorkItems();
    const valid = items.some((w) => w.id === storedId);
    expect(valid).toBe(false);
  });

  it('fallback: first active item used when stored id invalid', () => {
    const item1 = createWorkItem({ title: 'First Active' });
    const item2 = createWorkItem({ title: 'Second Active' });
    saveWorkItems([item1, item2]);
    saveSelectedWorkItemId('gone-id');

    const items = loadWorkItems();
    const storedId = loadSelectedWorkItemId();
    const validId = items.some((w) => w.id === storedId)
      ? storedId
      : items.find((w) => w.status === 'active')?.id ?? null;
    expect(validId).toBe(item1.id);
  });

  it('fallback: null when no active items and stored id invalid', () => {
    saveWorkItems([]);
    saveSelectedWorkItemId('gone-id');

    const items = loadWorkItems();
    const storedId = loadSelectedWorkItemId();
    const validId = items.some((w) => w.id === storedId)
      ? storedId
      : items.find((w) => w.status === 'active')?.id ?? null;
    expect(validId).toBeNull();
  });
});

describe('Swap guard — snapshot write only to correct item (V2-I)', () => {
  it('updateWorkItem no-ops on id mismatch (prevents cross-item save)', () => {
    const item1 = createWorkItem({ title: 'Item A' });
    const item2 = createWorkItem({ title: 'Item B' });
    const exchange = { id: 'ex-1', userPrompt: 'Hello', responsesByAgent: {}, timestamp: 1000 };

    // Attempt to save exchange to wrong item id
    const updated = updateWorkItem([item1, item2], 'nonexistent-id', () => ({
      exchanges: [exchange],
    }));

    // Both items unchanged (reference equality)
    expect(updated[0]).toBe(item1);
    expect(updated[1]).toBe(item2);
    expect(updated[0].exchanges).toEqual([]);
    expect(updated[1].exchanges).toEqual([]);
  });

  it('updateWorkItem writes only to matching item', () => {
    const item1 = createWorkItem({ title: 'Target' });
    const item2 = createWorkItem({ title: 'Bystander' });
    const exchange = { id: 'ex-1', userPrompt: 'Q', responsesByAgent: {}, timestamp: 1000 };

    const updated = updateWorkItem([item1, item2], item1.id, () => ({
      exchanges: [exchange],
    }));

    expect(updated[0].exchanges).toHaveLength(1);
    expect(updated[1]).toBe(item2); // reference equality — untouched
    expect(updated[1].exchanges).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// V2-J: Conversation Integrity Hardening
// -----------------------------------------------------------------------------

describe('Selection restore — archived ID fallback (V2-J)', () => {
  it('stored id pointing to archived item falls back to first active', () => {
    const active = createWorkItem({ title: 'Active One' });
    const toArchive = createWorkItem({ title: 'To Archive' });
    let items = [active, toArchive];
    items = archiveWorkItem(items, toArchive.id);
    saveWorkItems(items);
    saveSelectedWorkItemId(toArchive.id);

    // Simulate the restore logic from WorkItemContext init
    const loaded = loadWorkItems();
    const storedId = loadSelectedWorkItemId();
    const isValid = storedId && loaded.some((w) => w.id === storedId && w.status === 'active');
    const resolvedId = isValid ? storedId : (loaded.find((w) => w.status === 'active')?.id ?? null);
    expect(resolvedId).toBe(active.id);
  });

  it('all items archived → falls back to null', () => {
    const item = createWorkItem({ title: 'Only' });
    let items = [item];
    items = archiveWorkItem(items, item.id);
    saveWorkItems(items);
    saveSelectedWorkItemId(item.id);

    const loaded = loadWorkItems();
    const storedId = loadSelectedWorkItemId();
    const isValid = storedId && loaded.some((w) => w.id === storedId && w.status === 'active');
    const resolvedId = isValid ? storedId : (loaded.find((w) => w.status === 'active')?.id ?? null);
    expect(resolvedId).toBeNull();
  });

  it('missing id + multiple active items → first active selected', () => {
    const a = createWorkItem({ title: 'A' });
    const b = createWorkItem({ title: 'B' });
    saveWorkItems([a, b]);
    saveSelectedWorkItemId('gone-id');

    const loaded = loadWorkItems();
    const storedId = loadSelectedWorkItemId();
    const isValid = storedId && loaded.some((w) => w.id === storedId && w.status === 'active');
    const resolvedId = isValid ? storedId : (loaded.find((w) => w.status === 'active')?.id ?? null);
    expect(resolvedId).toBe(a.id);
  });
});

describe('Archive safety — conversation snapshot before archive (V2-J)', () => {
  it('archiveWorkItem preserves existing exchanges on the item', () => {
    const item = createWorkItem({ title: 'Has Chat' });
    const exchange = { id: 'ex-1', userPrompt: 'Q1', responsesByAgent: {}, timestamp: 1000 };
    let items = updateWorkItem([item], item.id, () => ({ exchanges: [exchange] }));
    expect(items[0].exchanges).toHaveLength(1);

    items = archiveWorkItem(items, item.id);
    expect(items[0].status).toBe('archived');
    expect(items[0].exchanges).toHaveLength(1);
    expect(items[0].exchanges[0].userPrompt).toBe('Q1');
  });

  it('archiving selected item allows fallback to next active (pure data)', () => {
    const item1 = createWorkItem({ title: 'Selected' });
    const item2 = createWorkItem({ title: 'Fallback' });
    let items = [item1, item2];

    // Save conversation to item1 before archiving
    const exchange = { id: 'ex-1', userPrompt: 'Saved', responsesByAgent: {}, timestamp: 1000 };
    items = updateWorkItem(items, item1.id, () => ({ exchanges: [exchange] }));

    // Archive item1
    items = archiveWorkItem(items, item1.id);

    // Verify item1 is archived with conversation intact
    const archived = items.find((w) => w.id === item1.id)!;
    expect(archived.status).toBe('archived');
    expect(archived.exchanges).toHaveLength(1);

    // Find next active (simulating sidebar fallback)
    const nextActive = items.find((w) => w.status === 'active' && w.id !== item1.id);
    expect(nextActive).toBeDefined();
    expect(nextActive!.id).toBe(item2.id);
  });

  it('no active items after archive → fallback is null', () => {
    const item = createWorkItem({ title: 'Only' });
    let items = [item];
    items = archiveWorkItem(items, item.id);

    const nextActive = items.find((w) => w.status === 'active');
    expect(nextActive).toBeUndefined();
  });
});

describe('Pending exchange write guard — caller-level status check (V2-J)', () => {
  it('updateWorkItem still writes to archived item (no built-in guard)', () => {
    const item = createWorkItem();
    let items = archiveWorkItem([item], item.id);
    expect(items[0].status).toBe('archived');

    // updateWorkItem is a pure mapper — it does not check status
    const exchange = { id: 'ex-1', userPrompt: 'Leaked', responsesByAgent: {}, timestamp: 1000 };
    items = updateWorkItem(items, item.id, () => ({ exchanges: [exchange] }));
    expect(items[0].exchanges).toHaveLength(1);
    // This proves the guard must be in the caller (WorkItemContext.saveConversation)
  });
});
