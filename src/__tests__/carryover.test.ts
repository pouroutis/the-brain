// =============================================================================
// The Brain — Carryover Tests (Task 5.1)
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import {
  saveCarryover,
  loadCarryover,
  clearCarryover,
  hasCarryover,
} from '../utils/carryoverPersistence';
import type { BrainState, Exchange, KeyNotes, DiscussionSession, Carryover } from '../types/brain';

// -----------------------------------------------------------------------------
// localStorage Mock
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

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

function createMockExchange(id: string, prompt: string): Exchange {
  return {
    id,
    userPrompt: prompt,
    responsesByAgent: {
      gpt: {
        agent: 'gpt',
        timestamp: Date.now(),
        status: 'success',
        content: `GPT response to: ${prompt}`,
      },
      claude: {
        agent: 'claude',
        timestamp: Date.now(),
        status: 'success',
        content: `Claude response to: ${prompt}`,
      },
      gemini: {
        agent: 'gemini',
        timestamp: Date.now(),
        status: 'success',
        content: `Gemini response to: ${prompt}`,
      },
    },
    timestamp: Date.now(),
  };
}

function createMockExchanges(count: number): Exchange[] {
  return Array.from({ length: count }, (_, i) =>
    createMockExchange(`ex-${i}`, `Prompt ${i}`)
  );
}

function createMockKeyNotes(): KeyNotes {
  return {
    decisions: ['Decision 1', 'Decision 2'],
    reasoningChains: ['Reasoning chain 1'],
    agreements: ['Agreement 1'],
    constraints: ['Constraint 1'],
    openQuestions: ['Open question 1'],
  };
}

function createMockSession(): DiscussionSession {
  return {
    id: 'session-test-123',
    createdAt: Date.now(),
    lastUpdatedAt: Date.now(),
    exchangeCount: 5,
    schemaVersion: 1,
  };
}

function createDiscussionState(overrides: Partial<BrainState> = {}): BrainState {
  return {
    ...initialBrainState,
    mode: 'discussion',
    discussionSession: createMockSession(),
    exchanges: createMockExchanges(5),
    keyNotes: createMockKeyNotes(),
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Reducer Tests: CREATE_CARRYOVER_FROM_DISCUSSION
// -----------------------------------------------------------------------------

describe('CREATE_CARRYOVER_FROM_DISCUSSION reducer action', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('creates carryover with keyNotes and last 10 exchanges in discussion mode', () => {
    const state = createDiscussionState({ exchanges: createMockExchanges(15) });
    const result = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });

    expect(result.carryover).not.toBeNull();
    expect(result.carryover?.schemaVersion).toBe(1);
    expect(result.carryover?.fromSessionId).toBe(state.discussionSession?.id);
    expect(result.carryover?.keyNotes).toEqual(state.keyNotes);
    expect(result.carryover?.last10Exchanges).toHaveLength(10);
    // Should be last 10 exchanges (ex-5 through ex-14)
    expect(result.carryover?.last10Exchanges[0].id).toBe('ex-5');
    expect(result.carryover?.last10Exchanges[9].id).toBe('ex-14');
  });

  it('includes all exchanges when fewer than 10', () => {
    const state = createDiscussionState({ exchanges: createMockExchanges(3) });
    const result = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });

    expect(result.carryover?.last10Exchanges).toHaveLength(3);
  });

  it('includes null keyNotes when no compaction occurred', () => {
    const state = createDiscussionState({ keyNotes: null });
    const result = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });

    expect(result.carryover?.keyNotes).toBeNull();
  });

  it('no-op when mode is not discussion', () => {
    const state = createDiscussionState({ mode: 'project' });
    const result = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });

    expect(result.carryover).toBeNull();
    expect(result).toBe(state);
  });

  it('no-op when isProcessing is true', () => {
    const state = createDiscussionState({ isProcessing: true });
    const result = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });

    expect(result.carryover).toBeNull();
    expect(result).toBe(state);
  });

  it('no-op when discussionSession is null', () => {
    const state = createDiscussionState({ discussionSession: null });
    const result = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });

    expect(result.carryover).toBeNull();
    expect(result).toBe(state);
  });

  it('no-op when exchanges is empty', () => {
    const state = createDiscussionState({ exchanges: [] });
    const result = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });

    expect(result.carryover).toBeNull();
    expect(result).toBe(state);
  });

  it('sets createdAt timestamp', () => {
    const beforeTime = Date.now();
    const state = createDiscussionState();
    const result = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });
    const afterTime = Date.now();

    expect(result.carryover?.createdAt).toBeGreaterThanOrEqual(beforeTime);
    expect(result.carryover?.createdAt).toBeLessThanOrEqual(afterTime);
  });
});

// -----------------------------------------------------------------------------
// Reducer Tests: CLEAR_CARRYOVER
// -----------------------------------------------------------------------------

describe('CLEAR_CARRYOVER reducer action', () => {
  it('clears existing carryover', () => {
    const carryover: Carryover = {
      schemaVersion: 1,
      fromSessionId: 'session-test',
      keyNotes: createMockKeyNotes(),
      last10Exchanges: createMockExchanges(5),
      createdAt: Date.now(),
    };
    const state: BrainState = { ...initialBrainState, carryover };
    const result = brainReducer(state, { type: 'CLEAR_CARRYOVER' });

    expect(result.carryover).toBeNull();
  });

  it('idempotent when carryover is already null', () => {
    const state: BrainState = { ...initialBrainState, carryover: null };
    const result = brainReducer(state, { type: 'CLEAR_CARRYOVER' });

    expect(result.carryover).toBeNull();
  });

  it('works in any mode', () => {
    const carryover: Carryover = {
      schemaVersion: 1,
      fromSessionId: 'session-test',
      keyNotes: null,
      last10Exchanges: [],
      createdAt: Date.now(),
    };

    // Test in project mode
    const projectState: BrainState = { ...initialBrainState, mode: 'project', carryover };
    const projectResult = brainReducer(projectState, { type: 'CLEAR_CARRYOVER' });
    expect(projectResult.carryover).toBeNull();

    // Test in decision mode
    const decisionState: BrainState = { ...initialBrainState, mode: 'decision', carryover };
    const decisionResult = brainReducer(decisionState, { type: 'CLEAR_CARRYOVER' });
    expect(decisionResult.carryover).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Persistence Tests: saveCarryover / loadCarryover
// -----------------------------------------------------------------------------

describe('Carryover persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('saveCarryover', () => {
    it('saves carryover to localStorage', () => {
      const carryover: Carryover = {
        schemaVersion: 1,
        fromSessionId: 'session-test',
        keyNotes: createMockKeyNotes(),
        last10Exchanges: createMockExchanges(3),
        createdAt: Date.now(),
      };

      const result = saveCarryover(carryover);

      expect(result).toBe(true);
      expect(localStorage.getItem('thebrain-carryover')).not.toBeNull();
    });
  });

  describe('loadCarryover', () => {
    it('loads valid carryover from localStorage', () => {
      const carryover: Carryover = {
        schemaVersion: 1,
        fromSessionId: 'session-test',
        keyNotes: createMockKeyNotes(),
        last10Exchanges: createMockExchanges(3),
        createdAt: Date.now(),
      };
      localStorage.setItem('thebrain-carryover', JSON.stringify(carryover));

      const loaded = loadCarryover();

      expect(loaded).not.toBeNull();
      expect(loaded?.fromSessionId).toBe('session-test');
      expect(loaded?.last10Exchanges).toHaveLength(3);
    });

    it('returns null when no carryover exists', () => {
      const loaded = loadCarryover();
      expect(loaded).toBeNull();
    });

    it('returns null and clears invalid data', () => {
      localStorage.setItem('thebrain-carryover', JSON.stringify({ invalid: true }));

      const loaded = loadCarryover();

      expect(loaded).toBeNull();
      expect(localStorage.getItem('thebrain-carryover')).toBeNull();
    });

    it('returns null for wrong schema version', () => {
      const invalidCarryover = {
        schemaVersion: 99,
        fromSessionId: 'session-test',
        keyNotes: null,
        last10Exchanges: [],
        createdAt: Date.now(),
      };
      localStorage.setItem('thebrain-carryover', JSON.stringify(invalidCarryover));

      const loaded = loadCarryover();

      expect(loaded).toBeNull();
    });

    it('returns null for more than 10 exchanges', () => {
      const invalidCarryover = {
        schemaVersion: 1,
        fromSessionId: 'session-test',
        keyNotes: null,
        last10Exchanges: createMockExchanges(15),
        createdAt: Date.now(),
      };
      localStorage.setItem('thebrain-carryover', JSON.stringify(invalidCarryover));

      const loaded = loadCarryover();

      expect(loaded).toBeNull();
    });
  });

  describe('clearCarryover', () => {
    it('removes carryover from localStorage', () => {
      const carryover: Carryover = {
        schemaVersion: 1,
        fromSessionId: 'session-test',
        keyNotes: null,
        last10Exchanges: [],
        createdAt: Date.now(),
      };
      localStorage.setItem('thebrain-carryover', JSON.stringify(carryover));

      clearCarryover();

      expect(localStorage.getItem('thebrain-carryover')).toBeNull();
    });

    it('no-op when no carryover exists', () => {
      clearCarryover();
      expect(localStorage.getItem('thebrain-carryover')).toBeNull();
    });
  });

  describe('hasCarryover', () => {
    it('returns true when carryover exists', () => {
      localStorage.setItem('thebrain-carryover', JSON.stringify({ test: true }));
      expect(hasCarryover()).toBe(true);
    });

    it('returns false when no carryover exists', () => {
      expect(hasCarryover()).toBe(false);
    });
  });
});

// -----------------------------------------------------------------------------
// Integration Tests
// -----------------------------------------------------------------------------

describe('Carryover integration', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('full flow: create carryover → save → load → clear', () => {
    // 1. Create carryover via reducer
    const state = createDiscussionState({ exchanges: createMockExchanges(8) });
    const afterCreate = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });
    expect(afterCreate.carryover).not.toBeNull();

    // 2. Save to localStorage
    const saveResult = saveCarryover(afterCreate.carryover!);
    expect(saveResult).toBe(true);

    // 3. Load from localStorage
    const loaded = loadCarryover();
    expect(loaded).not.toBeNull();
    expect(loaded?.last10Exchanges).toHaveLength(8);
    expect(loaded?.fromSessionId).toBe(state.discussionSession?.id);

    // 4. Clear carryover via reducer
    const afterClear = brainReducer(afterCreate, { type: 'CLEAR_CARRYOVER' });
    expect(afterClear.carryover).toBeNull();

    // 5. Clear from localStorage
    clearCarryover();
    expect(loadCarryover()).toBeNull();
  });
});
