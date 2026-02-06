// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Decision/Project Persistence Utilities (localStorage)
// =============================================================================

import type { ProjectState, DecisionRecord, ProjectStatus, KeyNotes } from '../types/brain';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Key prefix for project storage */
const PROJECT_KEY_PREFIX = 'brain_project_';

/** Key for active project pointer */
const ACTIVE_PROJECT_KEY = 'brain_active_project';

/** Current schema version */
const CURRENT_SCHEMA_VERSION = 1;

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

/**
 * Validate KeyNotes structure (minimal safe checks)
 */
function isValidKeyNotes(keyNotes: unknown): keyNotes is KeyNotes {
  if (keyNotes === null) return true;
  if (!keyNotes || typeof keyNotes !== 'object') return false;
  const k = keyNotes as Record<string, unknown>;

  const requiredArrays = ['decisions', 'reasoningChains', 'agreements', 'constraints', 'openQuestions'];
  for (const key of requiredArrays) {
    if (!Array.isArray(k[key])) return false;
  }

  return true;
}

/**
 * Validate projectMemory structure
 */
function isValidProjectMemory(pm: unknown): pm is { recentExchanges: unknown[]; keyNotes: KeyNotes | null } {
  if (!pm || typeof pm !== 'object') return false;
  const mem = pm as Record<string, unknown>;

  if (!Array.isArray(mem.recentExchanges)) return false;
  if (mem.keyNotes !== null && !isValidKeyNotes(mem.keyNotes)) return false;

  return true;
}

function isValidProjectState(data: unknown): data is ProjectState {
  if (!data || typeof data !== 'object') return false;
  const p = data as Record<string, unknown>;

  // Required fields
  if (typeof p.id !== 'string') return false;
  if (typeof p.createdAt !== 'number') return false;
  if (typeof p.updatedAt !== 'number') return false;
  if (typeof p.status !== 'string') return false;
  if (!['active', 'blocked', 'done'].includes(p.status as string)) return false;
  if (!Array.isArray(p.decisions)) return false;
  if (p.schemaVersion !== CURRENT_SCHEMA_VERSION) return false;

  // Validate projectMemory (must be object, not array)
  // Migration safety: if old string[] format, treat as invalid and let caller handle
  if (!isValidProjectMemory(p.projectMemory)) return false;

  // Optional fields
  if (p.title !== undefined && typeof p.title !== 'string') return false;
  if (p.lastDecisionId !== undefined && typeof p.lastDecisionId !== 'string') return false;

  return true;
}

function isValidDecisionRecord(data: unknown): data is DecisionRecord {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  // Required fields
  if (typeof d.id !== 'string') return false;
  if (typeof d.createdAt !== 'number') return false;
  if (typeof d.mode !== 'string') return false;
  if (typeof d.promptProduced !== 'boolean') return false;
  if (typeof d.blocked !== 'boolean') return false;
  if (typeof d.ceoAgent !== 'string') return false;
  if (!Array.isArray(d.advisors)) return false;
  if (!Array.isArray(d.recentExchanges)) return false;

  return true;
}

// -----------------------------------------------------------------------------
// Helper: Generate Project ID
// -----------------------------------------------------------------------------

export function generateProjectId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// -----------------------------------------------------------------------------
// Helper: Generate Decision ID
// -----------------------------------------------------------------------------

export function generateDecisionId(): string {
  return `dec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// -----------------------------------------------------------------------------
// Helper: Create Initial Project State
// -----------------------------------------------------------------------------

export function createInitialProjectState(projectId: string, title?: string): ProjectState {
  const now = Date.now();
  return {
    id: projectId,
    createdAt: now,
    updatedAt: now,
    title,
    status: 'active',
    decisions: [],
    projectMemory: {
      recentExchanges: [],
      keyNotes: null,
    },
    schemaVersion: 1,
  };
}

// -----------------------------------------------------------------------------
// Public API: Project Storage
// -----------------------------------------------------------------------------

/**
 * Save a project to localStorage.
 * Updates the project's updatedAt timestamp.
 */
export function saveProject(project: ProjectState): void {
  try {
    const updated: ProjectState = {
      ...project,
      updatedAt: Date.now(),
    };
    const key = `${PROJECT_KEY_PREFIX}${project.id}`;
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {
    // Silently fail if localStorage is unavailable or full
  }
}

/**
 * Load a project by ID from localStorage.
 * Returns null if not found or invalid.
 */
export function loadProject(projectId: string): ProjectState | null {
  try {
    const key = `${PROJECT_KEY_PREFIX}${projectId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isValidProjectState(parsed)) {
      // Corrupted data - clear it
      clearProjectById(projectId);
      return null;
    }

    return parsed;
  } catch {
    // JSON parse error - clear corrupted data
    clearProjectById(projectId);
    return null;
  }
}

/**
 * Clear a project by ID from localStorage.
 */
export function clearProjectById(projectId: string): void {
  try {
    const key = `${PROJECT_KEY_PREFIX}${projectId}`;
    localStorage.removeItem(key);
  } catch {
    // Silently fail
  }
}

// -----------------------------------------------------------------------------
// Public API: Active Project Pointer
// -----------------------------------------------------------------------------

/**
 * Set the active project ID pointer.
 */
export function setActiveProjectId(projectId: string): void {
  try {
    localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
  } catch {
    // Silently fail
  }
}

/**
 * Get the active project ID pointer.
 * Returns null if not set.
 */
export function getActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
}

/**
 * Load the active project from localStorage.
 * Returns null if no active project or if invalid.
 */
export function loadActiveProject(): ProjectState | null {
  const projectId = getActiveProjectId();
  if (!projectId) return null;
  return loadProject(projectId);
}

/**
 * Clear the active project pointer (does NOT delete project data).
 */
export function clearActiveProject(): void {
  try {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
  } catch {
    // Silently fail
  }
}

// -----------------------------------------------------------------------------
// Public API: Decision Helpers
// -----------------------------------------------------------------------------

/**
 * Append a decision to a project and save.
 * Returns the updated project state.
 */
export function appendDecisionToProject(
  project: ProjectState,
  decision: DecisionRecord
): ProjectState {
  // Validate decision
  if (!isValidDecisionRecord(decision)) {
    return project;
  }

  const updated: ProjectState = {
    ...project,
    updatedAt: Date.now(),
    lastDecisionId: decision.id,
    decisions: [...project.decisions, decision],
    // Update status based on decision
    status: decision.blocked ? 'blocked' : 'active',
  };

  saveProject(updated);
  return updated;
}

/**
 * Update project status.
 */
export function updateProjectStatus(
  project: ProjectState,
  status: ProjectStatus
): ProjectState {
  const updated: ProjectState = {
    ...project,
    updatedAt: Date.now(),
    status,
  };

  saveProject(updated);
  return updated;
}

/**
 * Update project title.
 */
export function updateProjectTitle(
  project: ProjectState,
  title: string
): ProjectState {
  const updated: ProjectState = {
    ...project,
    updatedAt: Date.now(),
    title,
  };

  saveProject(updated);
  return updated;
}

// -----------------------------------------------------------------------------
// Public API: List All Projects
// -----------------------------------------------------------------------------

/**
 * List all saved projects from localStorage.
 * Returns an array of ProjectState sorted by updatedAt descending (most recent first).
 */
export function listProjects(): ProjectState[] {
  const projects: ProjectState[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PROJECT_KEY_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (isValidProjectState(parsed)) {
              projects.push(parsed);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } catch {
    // localStorage unavailable
    return [];
  }

  // Sort by updatedAt descending (most recent first)
  projects.sort((a, b) => b.updatedAt - a.updatedAt);

  return projects;
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export {
  PROJECT_KEY_PREFIX,
  ACTIVE_PROJECT_KEY,
  CURRENT_SCHEMA_VERSION,
};
