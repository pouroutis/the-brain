// =============================================================================
// The Brain — Ghost Project Mode Tests (STEP 3-4)
// =============================================================================

import { describe, it, expect } from 'vitest';
import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import type { BrainState, Carryover, Exchange, KeyNotes } from '../types/brain';

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

function createMockKeyNotes(): KeyNotes {
  return {
    decisions: ['Decision 1'],
    reasoningChains: ['Reasoning 1'],
    agreements: ['Agreement 1'],
    constraints: ['Constraint 1'],
    openQuestions: ['Question 1'],
  };
}

function createMockCarryover(): Carryover {
  return {
    schemaVersion: 1,
    fromSessionId: 'session-test-123',
    keyNotes: createMockKeyNotes(),
    last10Exchanges: [createMockExchange('ex-1', 'Test prompt')],
    createdAt: Date.now(),
  };
}

function createProjectState(overrides: Partial<BrainState> = {}): BrainState {
  return {
    ...initialBrainState,
    mode: 'project',
    carryover: createMockCarryover(),
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// LoopState Extension Tests
// -----------------------------------------------------------------------------

describe('LoopState extensions', () => {
  describe('START_EXECUTION_LOOP with intent', () => {
    it('stores lastProjectIntent when provided', () => {
      const state = createProjectState({ loopState: 'idle' });
      const result = brainReducer(state, {
        type: 'START_EXECUTION_LOOP',
        intent: 'Build a REST API',
      });

      expect(result.loopState).toBe('running');
      expect(result.lastProjectIntent).toBe('Build a REST API');
    });

    it('preserves existing lastProjectIntent when not provided', () => {
      const state = createProjectState({
        loopState: 'paused',
        lastProjectIntent: 'Previous intent',
      });
      const result = brainReducer(state, { type: 'START_EXECUTION_LOOP' });

      expect(result.loopState).toBe('running');
      expect(result.lastProjectIntent).toBe('Previous intent');
    });

    it('clears projectError on start', () => {
      const state = createProjectState({
        loopState: 'failed',
        projectError: 'Previous error',
      });
      const result = brainReducer(state, {
        type: 'START_EXECUTION_LOOP',
        intent: 'New intent',
      });

      expect(result.loopState).toBe('running');
      expect(result.projectError).toBeNull();
    });
  });

  describe('PROJECT_GHOST_SUCCESS', () => {
    it('sets loopState to completed and stores ghostOutput', () => {
      const state = createProjectState({ loopState: 'running' });
      const result = brainReducer(state, {
        type: 'PROJECT_GHOST_SUCCESS',
        content: 'Ghost output content',
      });

      expect(result.loopState).toBe('completed');
      expect(result.ghostOutput).toBe('Ghost output content');
      expect(result.projectError).toBeNull();
    });
  });

  describe('PROJECT_GHOST_FAILED', () => {
    it('sets loopState to failed and stores error', () => {
      const state = createProjectState({ loopState: 'running' });
      const result = brainReducer(state, {
        type: 'PROJECT_GHOST_FAILED',
        error: 'Connection timeout',
      });

      expect(result.loopState).toBe('failed');
      expect(result.projectError).toBe('Connection timeout');
      expect(result.ghostOutput).toBeNull();
    });
  });

  describe('PROJECT_RESET_ERROR', () => {
    it('clears error and resets to idle', () => {
      const state = createProjectState({
        loopState: 'failed',
        projectError: 'Some error',
      });
      const result = brainReducer(state, { type: 'PROJECT_RESET_ERROR' });

      expect(result.loopState).toBe('idle');
      expect(result.projectError).toBeNull();
    });
  });
});

// -----------------------------------------------------------------------------
// State Field Tests
// -----------------------------------------------------------------------------

describe('BrainState project fields', () => {
  it('initialBrainState includes project fields', () => {
    expect(initialBrainState.projectError).toBeNull();
    expect(initialBrainState.lastProjectIntent).toBeNull();
    expect(initialBrainState.ghostOutput).toBeNull();
  });

  describe('CLEAR action in project mode', () => {
    it('clears project-specific state', () => {
      const state = createProjectState({
        projectError: 'Some error',
        ghostOutput: 'Some output',
        lastProjectIntent: 'Some intent',
        exchanges: [createMockExchange('ex-1', 'Test')],
      });
      const result = brainReducer(state, { type: 'CLEAR' });

      expect(result.projectError).toBeNull();
      expect(result.ghostOutput).toBeNull();
      expect(result.lastProjectIntent).toBeNull();
      expect(result.exchanges).toHaveLength(0);
    });
  });

  describe('STOP_EXECUTION_LOOP', () => {
    it('clears project error and ghost output', () => {
      const state = createProjectState({
        loopState: 'failed',
        projectError: 'Error',
        ghostOutput: 'Output',
      });
      const result = brainReducer(state, { type: 'STOP_EXECUTION_LOOP' });

      expect(result.projectError).toBeNull();
      expect(result.ghostOutput).toBeNull();
      expect(result.loopState).toBe('idle');
      expect(result.mode).toBe('discussion');
    });
  });

  describe('SET_MODE', () => {
    it('clears projectError when switching modes', () => {
      const state = createProjectState({
        projectError: 'Some error',
        loopState: 'idle',
      });
      const result = brainReducer(state, { type: 'SET_MODE', mode: 'discussion' });

      expect(result.projectError).toBeNull();
      expect(result.mode).toBe('discussion');
    });
  });
});

// -----------------------------------------------------------------------------
// Guard Tests
// -----------------------------------------------------------------------------

describe('Action guards', () => {
  describe('START_EXECUTION_LOOP guards', () => {
    it('no-op when not in project mode', () => {
      const state: BrainState = { ...initialBrainState, mode: 'discussion' };
      const result = brainReducer(state, { type: 'START_EXECUTION_LOOP' });

      expect(result.loopState).toBe('idle');
      expect(result).toBe(state);
    });

    it('no-op when already running', () => {
      const state = createProjectState({ loopState: 'running' });
      const original = state;
      const result = brainReducer(state, {
        type: 'START_EXECUTION_LOOP',
        intent: 'New intent',
      });

      expect(result).toBe(original);
    });
  });
});

// -----------------------------------------------------------------------------
// Carryover Integration Tests
// -----------------------------------------------------------------------------

describe('Carryover in project mode', () => {
  it('preserves carryover through ghost success', () => {
    const carryover = createMockCarryover();
    const state = createProjectState({
      loopState: 'running',
      carryover,
    });
    const result = brainReducer(state, {
      type: 'PROJECT_GHOST_SUCCESS',
      content: 'Output',
    });

    expect(result.carryover).toEqual(carryover);
  });

  it('preserves carryover through ghost failure', () => {
    const carryover = createMockCarryover();
    const state = createProjectState({
      loopState: 'running',
      carryover,
    });
    const result = brainReducer(state, {
      type: 'PROJECT_GHOST_FAILED',
      error: 'Error',
    });

    expect(result.carryover).toEqual(carryover);
  });
});
