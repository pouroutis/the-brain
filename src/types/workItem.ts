// =============================================================================
// The Brain — WorkItem & Context Shelf Types (V2-B, V2-H)
// =============================================================================

import type { Exchange, PendingExchange } from './brain';

// -----------------------------------------------------------------------------
// Status
// -----------------------------------------------------------------------------

export type WorkItemStatus = 'active' | 'archived';

// -----------------------------------------------------------------------------
// File Reference (lightweight — no content blob)
// -----------------------------------------------------------------------------

export interface FileReference {
  id: string;
  name: string;
  addedAt: number;
}

// -----------------------------------------------------------------------------
// Context Shelf — structured context attached to a WorkItem
// -----------------------------------------------------------------------------

export interface ContextShelf {
  task: string | null;
  files: FileReference[];
  pinnedPrompt: string | null;
  executionNotes: string | null;
  signals: {
    hasTask: boolean;
    hasFiles: boolean;
    hasPrompt: boolean;
    hasResults: boolean;
  };
}

// -----------------------------------------------------------------------------
// WorkItem — top-level entity
// -----------------------------------------------------------------------------

export interface WorkItem {
  id: string;
  title: string;
  status: WorkItemStatus;
  createdAt: number;
  updatedAt: number;
  shelf: ContextShelf;
  /** Conversation history — persisted per work item (V2-H) */
  exchanges: Exchange[];
  /** In-flight exchange snapshot — persisted per work item (V2-H) */
  pendingExchange: PendingExchange | null;
}
