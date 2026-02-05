// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Discussion Persistence Tests
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  STORAGE_KEY,
  saveDiscussionState,
  loadDiscussionState,
  clearDiscussionState,
} from '../utils/discussionPersistence';
import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import type { BrainState, DiscussionSession, Exchange, KeyNotes, TranscriptEntry } from '../types/brain';

// -----------------------------------------------------------------------------
// Mock localStorage
// -----------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get _store() {
      return store;
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

function createMockSession(): DiscussionSession {
  return {
    id: 'session-test-123',
    createdAt: 1700000000000,
    lastUpdatedAt: 1700000001000,
    exchangeCount: 1,
    schemaVersion: 1,
  };
}

function createMockExchange(): Exchange {
  return {
    id: 'ex-test-123',
    userPrompt: 'Test prompt',
    responsesByAgent: {
      gpt: {
        agent: 'gpt',
        timestamp: 1700000000500,
        status: 'success',
        content: 'GPT response',
      },
    },
    timestamp: 1700000000000,
  };
}

function createMockTranscript(): TranscriptEntry[] {
  return [
    {
      exchangeId: 'ex-test-123',
      role: 'user',
      content: 'Test prompt',
      timestamp: 1700000000000,
    },
    {
      exchangeId: 'ex-test-123',
      role: 'gpt',
      content: 'GPT response',
      timestamp: 1700000000500,
    },
  ];
}

function createMockKeyNotes(): KeyNotes {
  return {
    decisions: ['Decision 1', 'Decision 2'],
    reasoningChains: ['Reasoning 1'],
    agreements: ['Agreement 1'],
    constraints: ['Constraint 1'],
    openQuestions: ['Question 1'],
  };
}

// -----------------------------------------------------------------------------
// Tests: Persistence Utilities
// -----------------------------------------------------------------------------

describe('discussionPersistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('saveDiscussionState', () => {
    it('saves session, exchanges, transcript, and keyNotes to localStorage', () => {
      const session = createMockSession();
      const exchanges = [createMockExchange()];
      const transcript = createMockTranscript();
      const keyNotes = createMockKeyNotes();

      saveDiscussionState(session, exchanges, transcript, keyNotes);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.any(String)
      );

      const saved = JSON.parse(localStorageMock._store[STORAGE_KEY]);
      expect(saved.session).toEqual(session);
      expect(saved.exchanges).toEqual(exchanges);
      expect(saved.transcript).toEqual(transcript);
      expect(saved.keyNotes).toEqual(keyNotes);
    });
  });

  describe('loadDiscussionState', () => {
    it('loads valid state from localStorage', () => {
      const session = createMockSession();
      const exchanges = [createMockExchange()];
      const transcript = createMockTranscript();
      const keyNotes = createMockKeyNotes();
      localStorageMock._store[STORAGE_KEY] = JSON.stringify({
        session,
        exchanges,
        transcript,
        keyNotes,
      });

      const result = loadDiscussionState();

      expect(result).not.toBeNull();
      expect(result?.session).toEqual(session);
      expect(result?.exchanges).toEqual(exchanges);
      expect(result?.transcript).toEqual(transcript);
      expect(result?.keyNotes).toEqual(keyNotes);
    });

    it('returns empty transcript and null keyNotes for legacy data', () => {
      const session = createMockSession();
      const exchanges = [createMockExchange()];
      localStorageMock._store[STORAGE_KEY] = JSON.stringify({
        session,
        exchanges,
        // No transcript or keyNotes (legacy data)
      });

      const result = loadDiscussionState();

      expect(result).not.toBeNull();
      expect(result?.session).toEqual(session);
      expect(result?.exchanges).toEqual(exchanges);
      expect(result?.transcript).toEqual([]);
      expect(result?.keyNotes).toBeNull();
    });

    it('returns null for missing data', () => {
      const result = loadDiscussionState();
      expect(result).toBeNull();
    });

    it('returns null and clears corrupted JSON', () => {
      localStorageMock._store[STORAGE_KEY] = 'not valid json{{{';

      const result = loadDiscussionState();

      expect(result).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('returns null and clears data with wrong schema version', () => {
      const session = { ...createMockSession(), schemaVersion: 99 };
      localStorageMock._store[STORAGE_KEY] = JSON.stringify({
        session,
        exchanges: [],
      });

      const result = loadDiscussionState();

      expect(result).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('returns null and clears data with missing session fields', () => {
      localStorageMock._store[STORAGE_KEY] = JSON.stringify({
        session: { id: 'test' }, // Missing required fields
        exchanges: [],
      });

      const result = loadDiscussionState();

      expect(result).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('returns null and clears data with invalid exchange', () => {
      const session = createMockSession();
      localStorageMock._store[STORAGE_KEY] = JSON.stringify({
        session,
        exchanges: [{ invalid: 'exchange' }],
      });

      const result = loadDiscussionState();

      expect(result).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });
  });

  describe('clearDiscussionState', () => {
    it('removes data from localStorage', () => {
      localStorageMock._store[STORAGE_KEY] = 'some data';

      clearDiscussionState();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });
  });
});

// -----------------------------------------------------------------------------
// Tests: Reducer Integration
// -----------------------------------------------------------------------------

describe('brainReducer persistence actions', () => {
  describe('SEQUENCE_COMPLETED', () => {
    it('creates/updates discussionSession and appends transcript in discussion mode', () => {
      const stateWithPending: BrainState = {
        ...initialBrainState,
        mode: 'discussion',
        isProcessing: true,
        pendingExchange: {
          runId: 'run-123',
          userPrompt: 'Test',
          responsesByAgent: {
            gpt: {
              agent: 'gpt',
              timestamp: Date.now(),
              status: 'success',
              content: 'Response',
            },
          },
        },
      };

      const result = brainReducer(stateWithPending, {
        type: 'SEQUENCE_COMPLETED',
        runId: 'run-123',
      });

      expect(result.discussionSession).not.toBeNull();
      expect(result.discussionSession?.schemaVersion).toBe(1);
      expect(result.discussionSession?.exchangeCount).toBe(1);
      expect(result.exchanges.length).toBe(1);
      // Transcript should have user prompt + gpt response
      expect(result.transcript.length).toBe(2);
      expect(result.transcript[0].role).toBe('user');
      expect(result.transcript[1].role).toBe('gpt');
    });

    it('does not update discussionSession in project mode', () => {
      const stateWithPending: BrainState = {
        ...initialBrainState,
        mode: 'project',
        isProcessing: true,
        pendingExchange: {
          runId: 'run-123',
          userPrompt: 'Test',
          responsesByAgent: {},
        },
      };

      const result = brainReducer(stateWithPending, {
        type: 'SEQUENCE_COMPLETED',
        runId: 'run-123',
      });

      expect(result.discussionSession).toBeNull();
    });
  });

  describe('REHYDRATE_DISCUSSION', () => {
    it('restores session, exchanges, transcript, and keyNotes from persisted state', () => {
      const session = createMockSession();
      const exchanges = [createMockExchange()];
      const transcript = createMockTranscript();
      const keyNotes = createMockKeyNotes();

      const result = brainReducer(initialBrainState, {
        type: 'REHYDRATE_DISCUSSION',
        session,
        exchanges,
        transcript,
        keyNotes,
      });

      expect(result.discussionSession).toEqual(session);
      expect(result.exchanges).toEqual(exchanges);
      expect(result.transcript).toEqual(transcript);
      expect(result.keyNotes).toEqual(keyNotes);
      expect(result.mode).toBe('discussion');
    });

    it('does not rehydrate while processing', () => {
      const processingState: BrainState = {
        ...initialBrainState,
        isProcessing: true,
      };
      const session = createMockSession();
      const exchanges = [createMockExchange()];
      const transcript = createMockTranscript();
      const keyNotes = createMockKeyNotes();

      const result = brainReducer(processingState, {
        type: 'REHYDRATE_DISCUSSION',
        session,
        exchanges,
        transcript,
        keyNotes,
      });

      expect(result.discussionSession).toBeNull();
      expect(result.exchanges).toEqual([]);
      expect(result.transcript).toEqual([]);
      expect(result.keyNotes).toBeNull();
    });
  });

  describe('CLEAR', () => {
    it('resets discussionSession with new ID and clears transcript in discussion mode', () => {
      const stateWithSession: BrainState = {
        ...initialBrainState,
        mode: 'discussion',
        discussionSession: createMockSession(),
        exchanges: [createMockExchange()],
        transcript: createMockTranscript(),
      };

      const result = brainReducer(stateWithSession, { type: 'CLEAR' });

      expect(result.exchanges).toEqual([]);
      expect(result.transcript).toEqual([]);
      expect(result.discussionSession).not.toBeNull();
      expect(result.discussionSession?.id).not.toBe(stateWithSession.discussionSession?.id);
      expect(result.discussionSession?.exchangeCount).toBe(0);
    });
  });
});
