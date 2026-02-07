// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Discussion Persistence Utilities (localStorage)
// =============================================================================

import type { DiscussionSession, Exchange, KeyNotes, TranscriptEntry } from '../types/brain';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const STORAGE_KEY = 'thebrain_discussion_v1';
const CURRENT_SCHEMA_VERSION = 1;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface PersistedDiscussionState {
  session: DiscussionSession;
  exchanges: Exchange[];
  transcript: TranscriptEntry[];
  keyNotes: KeyNotes | null;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

function isValidSession(session: unknown): session is DiscussionSession {
  if (!session || typeof session !== 'object') return false;
  const s = session as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.createdAt === 'number' &&
    typeof s.lastUpdatedAt === 'number' &&
    typeof s.exchangeCount === 'number' &&
    s.schemaVersion === CURRENT_SCHEMA_VERSION
  );
}

function isValidExchange(exchange: unknown): exchange is Exchange {
  if (!exchange || typeof exchange !== 'object') return false;
  const e = exchange as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.userPrompt === 'string' &&
    typeof e.timestamp === 'number' &&
    typeof e.responsesByAgent === 'object' &&
    e.responsesByAgent !== null
  );
}

function isValidTranscriptEntry(entry: unknown): entry is TranscriptEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  const validRoles = ['user', 'gpt', 'claude', 'gemini'];
  return (
    typeof e.exchangeId === 'string' &&
    typeof e.role === 'string' &&
    validRoles.includes(e.role) &&
    typeof e.content === 'string' &&
    typeof e.timestamp === 'number'
  );
}

function isValidKeyNotes(keyNotes: unknown): keyNotes is KeyNotes {
  if (keyNotes === null) return true; // null is valid (no keyNotes yet)
  if (!keyNotes || typeof keyNotes !== 'object') return false;
  const k = keyNotes as Record<string, unknown>;

  const requiredArrays = ['decisions', 'reasoningChains', 'agreements', 'constraints', 'openQuestions'];

  for (const key of requiredArrays) {
    if (!Array.isArray(k[key])) return false;
    for (const item of k[key] as unknown[]) {
      if (typeof item !== 'string') return false;
    }
  }

  return true;
}

function isValidPersistedState(data: unknown): data is PersistedDiscussionState {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  if (!isValidSession(d.session)) return false;
  if (!Array.isArray(d.exchanges)) return false;
  if (d.transcript !== undefined && !Array.isArray(d.transcript)) return false;
  if (d.keyNotes !== undefined && d.keyNotes !== null && !isValidKeyNotes(d.keyNotes)) return false;

  // Validate each exchange
  for (const exchange of d.exchanges) {
    if (!isValidExchange(exchange)) return false;
  }

  // Validate each transcript entry if present
  if (Array.isArray(d.transcript)) {
    for (const entry of d.transcript) {
      if (!isValidTranscriptEntry(entry)) return false;
    }
  }

  return true;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Save discussion state to localStorage.
 */
export function saveDiscussionState(
  session: DiscussionSession,
  exchanges: Exchange[],
  transcript: TranscriptEntry[],
  keyNotes: KeyNotes | null = null
): void {
  try {
    const state: PersistedDiscussionState = {
      session,
      exchanges,
      transcript,
      keyNotes,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Silently fail if localStorage is unavailable or full
  }
}

/**
 * Load discussion state from localStorage.
 * Returns null if data is missing, corrupted, or wrong schema version.
 */
export function loadDiscussionState(): PersistedDiscussionState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isValidPersistedState(parsed)) {
      clearDiscussionState();
      return null;
    }

    return {
      session: parsed.session,
      exchanges: parsed.exchanges,
      transcript: parsed.transcript ?? [],
      keyNotes: parsed.keyNotes ?? null,
    };
  } catch {
    clearDiscussionState();
    return null;
  }
}

/**
 * Clear discussion state from localStorage.
 */
export function clearDiscussionState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently fail
  }
}

// -----------------------------------------------------------------------------
// Export Utilities
// -----------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  user: 'User',
  gpt: 'GPT',
  claude: 'Claude',
  gemini: 'Gemini',
};

/**
 * Export transcript as JSON string.
 */
export function exportTranscriptAsJson(
  session: DiscussionSession,
  transcript: TranscriptEntry[]
): string {
  const exportData = {
    sessionId: session.id,
    createdAt: new Date(session.createdAt).toISOString(),
    exportedAt: new Date().toISOString(),
    entryCount: transcript.length,
    transcript: transcript.map((entry) => ({
      exchangeId: entry.exchangeId,
      role: entry.role,
      content: entry.content,
      timestamp: new Date(entry.timestamp).toISOString(),
    })),
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * Export transcript as Markdown string.
 */
export function exportTranscriptAsMarkdown(
  session: DiscussionSession,
  transcript: TranscriptEntry[]
): string {
  const lines: string[] = [];

  lines.push('# The Brain — Discussion Transcript');
  lines.push('');
  lines.push(`**Session ID:** ${session.id}`);
  lines.push(`**Created:** ${new Date(session.createdAt).toLocaleString()}`);
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push(`**Total entries:** ${transcript.length}`);
  lines.push('');

  lines.push('---');
  lines.push('');

  let currentExchangeId = '';
  for (const entry of transcript) {
    if (entry.exchangeId !== currentExchangeId) {
      if (currentExchangeId !== '') {
        lines.push('');
        lines.push('---');
        lines.push('');
      }
      currentExchangeId = entry.exchangeId;
    }

    const roleLabel = ROLE_LABELS[entry.role] ?? entry.role;
    const time = new Date(entry.timestamp).toLocaleTimeString();

    lines.push(`## ${roleLabel}`);
    lines.push(`*${time}*`);
    lines.push('');
    lines.push(entry.content);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Trigger file download in browser.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch {
    // Silently fail if download not supported
  }
}
