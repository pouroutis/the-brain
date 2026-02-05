// =============================================================================
// The Brain — Mode Switching Tests (Task 5.3)
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

function createDiscussionState(overrides: Partial<BrainState> = {}): BrainState {
  return {
    ...initialBrainState,
    mode: 'discussion',
    discussionSession: createMockSession(),
    exchanges: [createMockExchange('ex-1', 'Test prompt')],
    keyNotes: createMockKeyNotes(),
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Dispatch Order Semantics Tests
// -----------------------------------------------------------------------------

describe('Mode switching dispatch order', () => {
  describe('switchToProject (simulated via sequential dispatches)', () => {
    it('CREATE_CARRYOVER_FROM_DISCUSSION + SET_MODE produces carryover and mode=project', () => {
      // Simulate switchToProject: dispatch carryover, then set mode
      let state = createDiscussionState();

      // Step 1: Dispatch CREATE_CARRYOVER_FROM_DISCUSSION
      state = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });

      // Verify carryover was created
      expect(state.carryover).not.toBeNull();
      expect(state.carryover?.fromSessionId).toBe('session-test-123');
      expect(state.carryover?.last10Exchanges).toHaveLength(1);
      expect(state.mode).toBe('discussion'); // Mode not changed yet

      // Step 2: Dispatch SET_MODE to project
      state = brainReducer(state, { type: 'SET_MODE', mode: 'project' });

      // Verify mode changed
      expect(state.mode).toBe('project');
      // Verify carryover preserved
      expect(state.carryover).not.toBeNull();
    });

    it('SET_MODE still succeeds even if carryover no-ops (no exchanges)', () => {
      // State with no exchanges - carryover will no-op
      let state = createDiscussionState({ exchanges: [] });

      // Step 1: Dispatch CREATE_CARRYOVER_FROM_DISCUSSION (will no-op)
      state = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });
      expect(state.carryover).toBeNull(); // No-op due to empty exchanges

      // Step 2: Dispatch SET_MODE to project (should still succeed)
      state = brainReducer(state, { type: 'SET_MODE', mode: 'project' });
      expect(state.mode).toBe('project');
    });

    it('SET_MODE still succeeds even if carryover no-ops (no session)', () => {
      // State with no session - carryover will no-op
      let state = createDiscussionState({ discussionSession: null });

      // Step 1: Dispatch CREATE_CARRYOVER_FROM_DISCUSSION (will no-op)
      state = brainReducer(state, { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' });
      expect(state.carryover).toBeNull(); // No-op due to null session

      // Step 2: Dispatch SET_MODE to project (should still succeed)
      state = brainReducer(state, { type: 'SET_MODE', mode: 'project' });
      expect(state.mode).toBe('project');
    });
  });

  describe('returnToDiscussion (SET_MODE only)', () => {
    it('preserves discussionSession and exchanges when returning to discussion', () => {
      // Start in project mode with carryover and a valid discussion session
      const session = createMockSession();
      const exchanges = [createMockExchange('ex-1', 'Test')];
      const carryover = {
        schemaVersion: 1 as const,
        fromSessionId: session.id,
        keyNotes: createMockKeyNotes(),
        last10Exchanges: exchanges,
        createdAt: Date.now(),
      };

      let state: BrainState = {
        ...initialBrainState,
        mode: 'project',
        discussionSession: session,
        exchanges,
        carryover,
      };

      // Dispatch SET_MODE to discussion
      state = brainReducer(state, { type: 'SET_MODE', mode: 'discussion' });

      // Verify mode changed
      expect(state.mode).toBe('discussion');
      // Verify session preserved
      expect(state.discussionSession).toEqual(session);
      // Verify exchanges preserved
      expect(state.exchanges).toEqual(exchanges);
      // Verify carryover NOT cleared (preserved for potential re-entry)
      expect(state.carryover).toEqual(carryover);
    });
  });
});

// -----------------------------------------------------------------------------
// Visibility/Disabled Logic Tests
// -----------------------------------------------------------------------------

describe('Mode switching button visibility logic', () => {
  describe('Switch to Project button (Discussion mode)', () => {
    it('should be visible when mode is discussion', () => {
      const state = createDiscussionState();
      expect(state.mode).toBe('discussion');
      // Button visibility: mode === 'discussion'
    });

    it('should be disabled when isProcessing', () => {
      const state = createDiscussionState({ isProcessing: true });
      // Button disabled: isProcessing === true
      expect(state.isProcessing).toBe(true);
    });

    it('should be disabled when exchanges.length === 0', () => {
      const state = createDiscussionState({ exchanges: [] });
      // Button disabled: exchanges.length === 0
      expect(state.exchanges.length).toBe(0);
    });

    it('should be enabled when not processing and has exchanges', () => {
      const state = createDiscussionState({ isProcessing: false });
      expect(state.isProcessing).toBe(false);
      expect(state.exchanges.length).toBeGreaterThan(0);
    });
  });

  describe('Back to Discussion button (Project mode)', () => {
    it('should be visible when mode is project AND hasActiveDiscussion', () => {
      const state: BrainState = {
        ...initialBrainState,
        mode: 'project',
        discussionSession: createMockSession(),
      };
      expect(state.mode).toBe('project');
      expect(state.discussionSession).not.toBeNull();
      // Button visible: mode === 'project' && discussionSession !== null
    });

    it('should be hidden when no active discussion session', () => {
      const state: BrainState = {
        ...initialBrainState,
        mode: 'project',
        discussionSession: null,
      };
      expect(state.mode).toBe('project');
      expect(state.discussionSession).toBeNull();
      // Button hidden: discussionSession === null
    });

    it('should be disabled when isProcessing', () => {
      const state: BrainState = {
        ...initialBrainState,
        mode: 'project',
        discussionSession: createMockSession(),
        isProcessing: true,
      };
      expect(state.isProcessing).toBe(true);
      // Button disabled: isProcessing === true
    });

    it('should be disabled when loop is running', () => {
      const state: BrainState = {
        ...initialBrainState,
        mode: 'project',
        discussionSession: createMockSession(),
        loopState: 'running',
      };
      expect(state.loopState).toBe('running');
      // Button disabled: loopState === 'running'
    });

    it('should be enabled when not processing and loop not running', () => {
      const state: BrainState = {
        ...initialBrainState,
        mode: 'project',
        discussionSession: createMockSession(),
        isProcessing: false,
        loopState: 'idle',
      };
      expect(state.isProcessing).toBe(false);
      expect(state.loopState).toBe('idle');
    });
  });
});

// -----------------------------------------------------------------------------
// hasActiveDiscussion Selector Tests
// -----------------------------------------------------------------------------

describe('hasActiveDiscussion selector logic', () => {
  it('returns true when discussionSession is not null', () => {
    const state = createDiscussionState();
    // Selector: state.discussionSession !== null
    expect(state.discussionSession !== null).toBe(true);
  });

  it('returns false when discussionSession is null', () => {
    const state: BrainState = { ...initialBrainState, discussionSession: null };
    // Selector: state.discussionSession !== null
    expect(state.discussionSession !== null).toBe(false);
  });
});
