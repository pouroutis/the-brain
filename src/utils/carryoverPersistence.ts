// =============================================================================
// The Brain — Carryover Persistence (Task 5.1)
// =============================================================================

import type { Carryover, Exchange, KeyNotes } from '../types/brain';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CARRYOVER_STORAGE_KEY = 'thebrain-carryover';
const CARRYOVER_SCHEMA_VERSION = 1;

// -----------------------------------------------------------------------------
// Validation Helpers
// -----------------------------------------------------------------------------

/**
 * Validate a KeyNotes object structure.
 */
function isValidKeyNotes(obj: unknown): obj is KeyNotes {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const kn = obj as Record<string, unknown>;
  return (
    Array.isArray(kn.decisions) &&
    Array.isArray(kn.reasoningChains) &&
    Array.isArray(kn.agreements) &&
    Array.isArray(kn.constraints) &&
    Array.isArray(kn.openQuestions)
  );
}

/**
 * Validate an Exchange object structure.
 */
function isValidExchange(obj: unknown): obj is Exchange {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const ex = obj as Record<string, unknown>;
  return (
    typeof ex.id === 'string' &&
    typeof ex.userPrompt === 'string' &&
    typeof ex.timestamp === 'number' &&
    typeof ex.responsesByAgent === 'object' &&
    ex.responsesByAgent !== null
  );
}

/**
 * Validate a Carryover object structure.
 */
function isValidCarryover(obj: unknown): obj is Carryover {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const co = obj as Record<string, unknown>;

  // Check schema version
  if (co.schemaVersion !== CARRYOVER_SCHEMA_VERSION) {
    return false;
  }

  // Check required fields
  if (typeof co.fromSessionId !== 'string') {
    return false;
  }

  if (typeof co.createdAt !== 'number') {
    return false;
  }

  // Check keyNotes (can be null or valid KeyNotes)
  if (co.keyNotes !== null && !isValidKeyNotes(co.keyNotes)) {
    return false;
  }

  // Check last10Exchanges (must be array of valid exchanges)
  if (!Array.isArray(co.last10Exchanges)) {
    return false;
  }

  // Validate each exchange in the array
  for (const ex of co.last10Exchanges) {
    if (!isValidExchange(ex)) {
      return false;
    }
  }

  // Enforce max 10 exchanges
  if (co.last10Exchanges.length > 10) {
    return false;
  }

  return true;
}

// -----------------------------------------------------------------------------
// Persistence Functions
// -----------------------------------------------------------------------------

/**
 * Save carryover to localStorage.
 * Returns true on success, false on failure.
 */
export function saveCarryover(carryover: Carryover): boolean {
  try {
    const serialized = JSON.stringify(carryover);
    localStorage.setItem(CARRYOVER_STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.error('[Carryover] Save failed:', error);
    return false;
  }
}

/**
 * Load carryover from localStorage.
 * Returns null if not found, invalid, or on error.
 */
export function loadCarryover(): Carryover | null {
  try {
    const serialized = localStorage.getItem(CARRYOVER_STORAGE_KEY);
    if (!serialized) {
      return null;
    }

    const parsed = JSON.parse(serialized);
    if (!isValidCarryover(parsed)) {
      console.warn('[Carryover] Invalid carryover data, clearing');
      clearCarryover();
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('[Carryover] Load failed:', error);
    return null;
  }
}

/**
 * Clear carryover from localStorage.
 */
export function clearCarryover(): void {
  try {
    localStorage.removeItem(CARRYOVER_STORAGE_KEY);
  } catch (error) {
    console.error('[Carryover] Clear failed:', error);
  }
}

/**
 * Check if carryover exists in localStorage.
 */
export function hasCarryover(): boolean {
  try {
    return localStorage.getItem(CARRYOVER_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
