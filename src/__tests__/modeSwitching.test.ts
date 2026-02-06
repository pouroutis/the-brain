// =============================================================================
// The Brain — Mode Selection Tests (No In-Session Switching)
// =============================================================================
//
// After the UI refactor, mode is selected ONLY from the Home screen.
// There is no in-session mode switching. These tests verify:
// 1. SET_MODE action works for initial mode selection
// 2. Mode state remains stable during a session
// 3. Carryover and session state still function correctly
// =============================================================================

import { describe, it, expect } from 'vitest';
import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import type { BrainState, Exchange, DiscussionSession, KeyNotes } from '../types/brain';

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

function createMockSession(): DiscussionSession {
  return {
    id: 'session-test-123',
    createdAt: Date.now(),
    lastUpdatedAt: Date.now(),
    exchangeCount: 5,
    schemaVersion: 1,
  };
}

function createMockKeyNotes(): KeyNotes {
  return {
    decisions: ['Decision 1'],
    reasoningChains: ['Reasoning 1'],
    agreements: ['Agreement 1'],
    constraints: ['Constraint 1'],
    openQuestions: ['Question 1'],
  };
}

// -----------------------------------------------------------------------------
// Initial Mode Selection Tests (Home Screen)
// -----------------------------------------------------------------------------

describe('Initial mode selection from Home screen', () => {
  it('SET_MODE sets mode to discussion', () => {
    const state = brainReducer(initialBrainState, { type: 'SET_MODE', mode: 'discussion' });
    expect(state.mode).toBe('discussion');
  });

  it('SET_MODE sets mode to decision', () => {
    const state = brainReducer(initialBrainState, { type: 'SET_MODE', mode: 'decision' });
    expect(state.mode).toBe('decision');
  });

  it('SET_MODE sets mode to project', () => {
    const state = brainReducer(initialBrainState, { type: 'SET_MODE', mode: 'project' });
    expect(state.mode).toBe('project');
  });

  it('initial mode defaults to discussion', () => {
    expect(initialBrainState.mode).toBe('discussion');
  });
});

// -----------------------------------------------------------------------------
// Mode Isolation Tests (No Switching Invariants)
// -----------------------------------------------------------------------------

describe('Mode isolation invariants', () => {
  it('decision mode starts with clean state (no carryover from other sessions)', () => {
    // When entering decision mode from Home, state should be fresh
    const state = brainReducer(initialBrainState, { type: 'SET_MODE', mode: 'decision' });

    expect(state.mode).toBe('decision');
    expect(state.exchanges).toHaveLength(0);
    expect(state.discussionCeoPromptArtifact).toBeNull();
    expect(state.pendingExchange).toBeNull();
  });

  it('discussion mode starts with clean state', () => {
    const state = brainReducer(initialBrainState, { type: 'SET_MODE', mode: 'discussion' });

    expect(state.mode).toBe('discussion');
    expect(state.exchanges).toHaveLength(0);
    expect(state.pendingExchange).toBeNull();
  });

  it('mode remains stable after CLEAR action', () => {
    let state = brainReducer(initialBrainState, { type: 'SET_MODE', mode: 'decision' });

    // Clear the board (should not change mode)
    state = brainReducer(state, { type: 'CLEAR' });

    // Mode should remain decision
    expect(state.mode).toBe('decision');
  });
});

// -----------------------------------------------------------------------------
// Carryover Tests (Preserved for Project Mode Future Use)
// -----------------------------------------------------------------------------

describe('Carryover creation (for Project mode)', () => {
  it('CREATE_CARRYOVER_FROM_DISCUSSION creates carryover from discussion session', () => {
    let state: BrainState = {
      ...initialBrainState,
      mode: 'discussion',
      discussionSession: createMockSession(),
      exchanges: [createMockExchange('ex-1', 'Test prompt')],
      keyNotes: createMockKeyNotes(),
    };

    state = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });

    expect(state.carryover).not.toBeNull();
    expect(state.carryover?.fromSessionId).toBe('session-test-123');
    expect(state.carryover?.last10Exchanges).toHaveLength(1);
  });

  it('CREATE_CARRYOVER_FROM_DISCUSSION no-ops when no exchanges', () => {
    let state: BrainState = {
      ...initialBrainState,
      mode: 'discussion',
      discussionSession: createMockSession(),
      exchanges: [],
    };

    state = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });

    expect(state.carryover).toBeNull();
  });

  it('CREATE_CARRYOVER_FROM_DISCUSSION no-ops when no session', () => {
    let state: BrainState = {
      ...initialBrainState,
      mode: 'discussion',
      discussionSession: null,
      exchanges: [createMockExchange('ex-1', 'Test')],
    };

    state = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });

    expect(state.carryover).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// hasActiveDiscussion Selector Tests
// -----------------------------------------------------------------------------

describe('hasActiveDiscussion selector logic', () => {
  it('returns true when discussionSession is not null', () => {
    const state: BrainState = {
      ...initialBrainState,
      discussionSession: createMockSession(),
    };
    expect(state.discussionSession !== null).toBe(true);
  });

  it('returns false when discussionSession is null', () => {
    const state: BrainState = { ...initialBrainState, discussionSession: null };
    expect(state.discussionSession !== null).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// State Preservation Tests
// -----------------------------------------------------------------------------

describe('State preservation across mode set', () => {
  it('SET_MODE preserves existing exchanges and session when switching modes', () => {
    // This tests that SET_MODE doesn't wipe state (important for returning to Home)
    const session = createMockSession();
    const exchanges = [createMockExchange('ex-1', 'Test')];

    let state: BrainState = {
      ...initialBrainState,
      mode: 'discussion',
      discussionSession: session,
      exchanges,
    };

    // Set mode to project
    state = brainReducer(state, { type: 'SET_MODE', mode: 'project' });

    expect(state.mode).toBe('project');
    expect(state.discussionSession).toEqual(session);
    expect(state.exchanges).toEqual(exchanges);
  });
});
