// =============================================================================
// The Brain — brainReducer Unit Tests (Phase 3B)
// =============================================================================

import { describe, it, expect } from 'vitest';
import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import type { BrainState, BrainAction, AgentResponse } from '../types/brain';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createProcessingState(runId: string, userPrompt: string = 'test'): BrainState {
  return {
    ...initialBrainState,
    pendingExchange: {
      runId,
      userPrompt,
      responsesByAgent: {},
    },
    currentAgent: 'gpt',
    isProcessing: true,
  };
}

function createSuccessResponse(agent: 'gpt' | 'claude' | 'gemini'): AgentResponse {
  return {
    agent,
    timestamp: Date.now(),
    status: 'success',
    content: `Response from ${agent}`,
  };
}

// -----------------------------------------------------------------------------
// SUBMIT_START Tests
// -----------------------------------------------------------------------------

describe('brainReducer — SUBMIT_START', () => {
  it('creates pendingExchange with runId and userPrompt', () => {
    const action: BrainAction = {
      type: 'SUBMIT_START',
      runId: 'run-123',
      userPrompt: 'Hello world',
    };

    const result = brainReducer(initialBrainState, action);

    expect(result.pendingExchange).not.toBeNull();
    expect(result.pendingExchange?.runId).toBe('run-123');
    expect(result.pendingExchange?.userPrompt).toBe('Hello world');
    expect(result.pendingExchange?.responsesByAgent).toEqual({});
  });

  it('sets isProcessing to true', () => {
    const action: BrainAction = {
      type: 'SUBMIT_START',
      runId: 'run-123',
      userPrompt: 'Hello',
    };

    const result = brainReducer(initialBrainState, action);

    expect(result.isProcessing).toBe(true);
  });

  it('sets currentAgent to gpt', () => {
    const action: BrainAction = {
      type: 'SUBMIT_START',
      runId: 'run-123',
      userPrompt: 'Hello',
    };

    const result = brainReducer(initialBrainState, action);

    expect(result.currentAgent).toBe('gpt');
  });

  it('clears warningState on new submission', () => {
    const stateWithWarning: BrainState = {
      ...initialBrainState,
      warningState: {
        type: 'context_limit',
        message: 'Old warning',
        dismissable: true,
      },
    };

    const action: BrainAction = {
      type: 'SUBMIT_START',
      runId: 'run-123',
      userPrompt: 'Hello',
    };

    const result = brainReducer(stateWithWarning, action);

    expect(result.warningState).toBeNull();
  });

  it('resets userCancelled to false', () => {
    const stateWithCancelled: BrainState = {
      ...initialBrainState,
      userCancelled: true,
    };

    const action: BrainAction = {
      type: 'SUBMIT_START',
      runId: 'run-123',
      userPrompt: 'Hello',
    };

    const result = brainReducer(stateWithCancelled, action);

    expect(result.userCancelled).toBe(false);
  });

  it('BLOCKED if isProcessing === true (double-submit protection)', () => {
    const processingState = createProcessingState('run-existing');

    const action: BrainAction = {
      type: 'SUBMIT_START',
      runId: 'run-new',
      userPrompt: 'Should not work',
    };

    const result = brainReducer(processingState, action);

    // State unchanged — action ignored
    expect(result).toBe(processingState);
    expect(result.pendingExchange?.runId).toBe('run-existing');
  });
});

// -----------------------------------------------------------------------------
// AGENT_STARTED Tests
// -----------------------------------------------------------------------------

describe('brainReducer — AGENT_STARTED', () => {
  it('updates currentAgent on runId match', () => {
    const state = createProcessingState('run-123');

    const action: BrainAction = {
      type: 'AGENT_STARTED',
      runId: 'run-123',
      agent: 'claude',
    };

    const result = brainReducer(state, action);

    expect(result.currentAgent).toBe('claude');
  });

  it('REJECTED on runId mismatch (stale action)', () => {
    const state = createProcessingState('run-123');

    const action: BrainAction = {
      type: 'AGENT_STARTED',
      runId: 'run-STALE',
      agent: 'claude',
    };

    const result = brainReducer(state, action);

    // State unchanged
    expect(result).toBe(state);
    expect(result.currentAgent).toBe('gpt');
  });

  it('REJECTED if not processing', () => {
    const action: BrainAction = {
      type: 'AGENT_STARTED',
      runId: 'run-123',
      agent: 'claude',
    };

    const result = brainReducer(initialBrainState, action);

    // State unchanged
    expect(result).toBe(initialBrainState);
  });
});

// -----------------------------------------------------------------------------
// AGENT_COMPLETED Tests
// -----------------------------------------------------------------------------

describe('brainReducer — AGENT_COMPLETED', () => {
  it('stores response in responsesByAgent on runId match', () => {
    const state = createProcessingState('run-123');
    const gptResponse = createSuccessResponse('gpt');

    const action: BrainAction = {
      type: 'AGENT_COMPLETED',
      runId: 'run-123',
      response: gptResponse,
    };

    const result = brainReducer(state, action);

    expect(result.pendingExchange?.responsesByAgent.gpt).toEqual(gptResponse);
  });

  it('sets currentAgent to null after completion', () => {
    const state = createProcessingState('run-123');
    const gptResponse = createSuccessResponse('gpt');

    const action: BrainAction = {
      type: 'AGENT_COMPLETED',
      runId: 'run-123',
      response: gptResponse,
    };

    const result = brainReducer(state, action);

    expect(result.currentAgent).toBeNull();
  });

  it('accumulates multiple agent responses', () => {
    let state = createProcessingState('run-123');
    
    // GPT completes
    state = brainReducer(state, {
      type: 'AGENT_COMPLETED',
      runId: 'run-123',
      response: createSuccessResponse('gpt'),
    });

    // Claude starts and completes
    state = brainReducer(state, {
      type: 'AGENT_STARTED',
      runId: 'run-123',
      agent: 'claude',
    });
    state = brainReducer(state, {
      type: 'AGENT_COMPLETED',
      runId: 'run-123',
      response: createSuccessResponse('claude'),
    });

    expect(state.pendingExchange?.responsesByAgent.gpt).toBeDefined();
    expect(state.pendingExchange?.responsesByAgent.claude).toBeDefined();
  });

  it('REJECTED on runId mismatch (stale action)', () => {
    const state = createProcessingState('run-123');
    const gptResponse = createSuccessResponse('gpt');

    const action: BrainAction = {
      type: 'AGENT_COMPLETED',
      runId: 'run-STALE',
      response: gptResponse,
    };

    const result = brainReducer(state, action);

    // State unchanged
    expect(result).toBe(state);
    expect(result.pendingExchange?.responsesByAgent.gpt).toBeUndefined();
  });

  it('REJECTED if pendingExchange is null', () => {
    const gptResponse = createSuccessResponse('gpt');

    const action: BrainAction = {
      type: 'AGENT_COMPLETED',
      runId: 'run-123',
      response: gptResponse,
    };

    const result = brainReducer(initialBrainState, action);

    // State unchanged
    expect(result).toBe(initialBrainState);
  });
});

// -----------------------------------------------------------------------------
// SEQUENCE_COMPLETED Tests
// -----------------------------------------------------------------------------

describe('brainReducer — SEQUENCE_COMPLETED', () => {
  it('finalizes exchange and adds to exchanges array', () => {
    let state = createProcessingState('run-123', 'Test prompt');
    state = brainReducer(state, {
      type: 'AGENT_COMPLETED',
      runId: 'run-123',
      response: createSuccessResponse('gpt'),
    });

    const action: BrainAction = {
      type: 'SEQUENCE_COMPLETED',
      runId: 'run-123',
    };

    const result = brainReducer(state, action);

    expect(result.exchanges).toHaveLength(1);
    expect(result.exchanges[0].userPrompt).toBe('Test prompt');
    expect(result.exchanges[0].responsesByAgent.gpt).toBeDefined();
  });

  it('clears pendingExchange', () => {
    const state = createProcessingState('run-123');

    const action: BrainAction = {
      type: 'SEQUENCE_COMPLETED',
      runId: 'run-123',
    };

    const result = brainReducer(state, action);

    expect(result.pendingExchange).toBeNull();
  });

  it('sets isProcessing to false', () => {
    const state = createProcessingState('run-123');

    const action: BrainAction = {
      type: 'SEQUENCE_COMPLETED',
      runId: 'run-123',
    };

    const result = brainReducer(state, action);

    expect(result.isProcessing).toBe(false);
  });

  it('clears warningState on completion', () => {
    let state = createProcessingState('run-123');
    state = {
      ...state,
      warningState: {
        type: 'context_limit',
        message: 'Parse failed',
        dismissable: true,
      },
    };

    const action: BrainAction = {
      type: 'SEQUENCE_COMPLETED',
      runId: 'run-123',
    };

    const result = brainReducer(state, action);

    expect(result.warningState).toBeNull();
  });

  it('resets userCancelled to false', () => {
    let state = createProcessingState('run-123');
    state = { ...state, userCancelled: true };

    const action: BrainAction = {
      type: 'SEQUENCE_COMPLETED',
      runId: 'run-123',
    };

    const result = brainReducer(state, action);

    expect(result.userCancelled).toBe(false);
  });

  it('REJECTED on runId mismatch', () => {
    const state = createProcessingState('run-123');

    const action: BrainAction = {
      type: 'SEQUENCE_COMPLETED',
      runId: 'run-STALE',
    };

    const result = brainReducer(state, action);

    // State unchanged
    expect(result).toBe(state);
    expect(result.pendingExchange).not.toBeNull();
  });

  it('REJECTED if pendingExchange is null', () => {
    const action: BrainAction = {
      type: 'SEQUENCE_COMPLETED',
      runId: 'run-123',
    };

    const result = brainReducer(initialBrainState, action);

    // State unchanged
    expect(result).toBe(initialBrainState);
  });
});

// -----------------------------------------------------------------------------
// CANCEL_REQUESTED Tests
// -----------------------------------------------------------------------------

describe('brainReducer — CANCEL_REQUESTED', () => {
  it('sets userCancelled to true on runId match', () => {
    const state = createProcessingState('run-123');

    const action: BrainAction = {
      type: 'CANCEL_REQUESTED',
      runId: 'run-123',
    };

    const result = brainReducer(state, action);

    expect(result.userCancelled).toBe(true);
  });

  it('does not change isProcessing (orchestrator handles completion)', () => {
    const state = createProcessingState('run-123');

    const action: BrainAction = {
      type: 'CANCEL_REQUESTED',
      runId: 'run-123',
    };

    const result = brainReducer(state, action);

    expect(result.isProcessing).toBe(true);
  });

  it('REJECTED on runId mismatch', () => {
    const state = createProcessingState('run-123');

    const action: BrainAction = {
      type: 'CANCEL_REQUESTED',
      runId: 'run-STALE',
    };

    const result = brainReducer(state, action);

    // State unchanged
    expect(result).toBe(state);
    expect(result.userCancelled).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// CANCEL_COMPLETE Tests
// -----------------------------------------------------------------------------

describe('brainReducer — CANCEL_COMPLETE', () => {
  it('finalizes exchange with partial responses', () => {
    let state = createProcessingState('run-123', 'Cancelled prompt');
    state = brainReducer(state, {
      type: 'AGENT_COMPLETED',
      runId: 'run-123',
      response: createSuccessResponse('gpt'),
    });
    state = { ...state, userCancelled: true };

    const action: BrainAction = {
      type: 'CANCEL_COMPLETE',
      runId: 'run-123',
    };

    const result = brainReducer(state, action);

    expect(result.exchanges).toHaveLength(1);
    expect(result.exchanges[0].userPrompt).toBe('Cancelled prompt');
    expect(result.exchanges[0].responsesByAgent.gpt).toBeDefined();
  });

  it('clears pendingExchange', () => {
    let state = createProcessingState('run-123');
    state = { ...state, userCancelled: true };

    const action: BrainAction = {
      type: 'CANCEL_COMPLETE',
      runId: 'run-123',
    };

    const result = brainReducer(state, action);

    expect(result.pendingExchange).toBeNull();
  });

  it('sets isProcessing to false', () => {
    let state = createProcessingState('run-123');
    state = { ...state, userCancelled: true };

    const action: BrainAction = {
      type: 'CANCEL_COMPLETE',
      runId: 'run-123',
    };

    const result = brainReducer(state, action);

    expect(result.isProcessing).toBe(false);
  });

  it('resets userCancelled to false', () => {
    let state = createProcessingState('run-123');
    state = { ...state, userCancelled: true };

    const action: BrainAction = {
      type: 'CANCEL_COMPLETE',
      runId: 'run-123',
    };

    const result = brainReducer(state, action);

    expect(result.userCancelled).toBe(false);
  });

  it('clears warningState', () => {
    let state = createProcessingState('run-123');
    state = {
      ...state,
      userCancelled: true,
      warningState: {
        type: 'context_limit',
        message: 'Warning',
        dismissable: true,
      },
    };

    const action: BrainAction = {
      type: 'CANCEL_COMPLETE',
      runId: 'run-123',
    };

    const result = brainReducer(state, action);

    expect(result.warningState).toBeNull();
  });

  it('REJECTED on runId mismatch', () => {
    let state = createProcessingState('run-123');
    state = { ...state, userCancelled: true };

    const action: BrainAction = {
      type: 'CANCEL_COMPLETE',
      runId: 'run-STALE',
    };

    const result = brainReducer(state, action);

    // State unchanged
    expect(result).toBe(state);
    expect(result.pendingExchange).not.toBeNull();
  });

  it('REJECTED if pendingExchange is null', () => {
    const action: BrainAction = {
      type: 'CANCEL_COMPLETE',
      runId: 'run-123',
    };

    const result = brainReducer(initialBrainState, action);

    // State unchanged
    expect(result).toBe(initialBrainState);
  });
});

// -----------------------------------------------------------------------------
// SET_WARNING Tests
// -----------------------------------------------------------------------------

describe('brainReducer — SET_WARNING', () => {
  it('sets warningState on runId match', () => {
    const state = createProcessingState('run-123');
    const warning = {
      type: 'context_limit' as const,
      message: 'Context limit approaching',
      dismissable: true,
    };

    const action: BrainAction = {
      type: 'SET_WARNING',
      runId: 'run-123',
      warning,
    };

    const result = brainReducer(state, action);

    expect(result.warningState).toEqual(warning);
  });

  it('clears warningState when warning is null', () => {
    let state = createProcessingState('run-123');
    state = {
      ...state,
      warningState: {
        type: 'context_limit',
        message: 'Old warning',
        dismissable: true,
      },
    };

    const action: BrainAction = {
      type: 'SET_WARNING',
      runId: 'run-123',
      warning: null,
    };

    const result = brainReducer(state, action);

    expect(result.warningState).toBeNull();
  });

  it('REJECTED on runId mismatch (warnings are runId-scoped)', () => {
    const state = createProcessingState('run-123');
    const warning = {
      type: 'context_limit' as const,
      message: 'Stale warning',
      dismissable: true,
    };

    const action: BrainAction = {
      type: 'SET_WARNING',
      runId: 'run-STALE',
      warning,
    };

    const result = brainReducer(state, action);

    // State unchanged
    expect(result).toBe(state);
    expect(result.warningState).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// CLEAR Tests
// -----------------------------------------------------------------------------

describe('brainReducer — CLEAR', () => {
  it('clears exchanges array', () => {
    const stateWithExchanges: BrainState = {
      ...initialBrainState,
      exchanges: [
        {
          id: 'ex-1',
          userPrompt: 'Old prompt',
          responsesByAgent: {},
          timestamp: Date.now(),
        },
      ],
    };

    const action: BrainAction = { type: 'CLEAR' };

    const result = brainReducer(stateWithExchanges, action);

    expect(result.exchanges).toHaveLength(0);
  });

  it('increments clearBoardVersion', () => {
    const action: BrainAction = { type: 'CLEAR' };

    const result = brainReducer(initialBrainState, action);

    expect(result.clearBoardVersion).toBe(1);
  });

  it('increments clearBoardVersion on each clear', () => {
    let state = initialBrainState;

    state = brainReducer(state, { type: 'CLEAR' });
    expect(state.clearBoardVersion).toBe(1);

    state = brainReducer(state, { type: 'CLEAR' });
    expect(state.clearBoardVersion).toBe(2);

    state = brainReducer(state, { type: 'CLEAR' });
    expect(state.clearBoardVersion).toBe(3);
  });

  it('BLOCKED if isProcessing === true', () => {
    const processingState = createProcessingState('run-123');
    const stateWithExchanges: BrainState = {
      ...processingState,
      exchanges: [
        {
          id: 'ex-1',
          userPrompt: 'Keep this',
          responsesByAgent: {},
          timestamp: Date.now(),
        },
      ],
    };

    const action: BrainAction = { type: 'CLEAR' };

    const result = brainReducer(stateWithExchanges, action);

    // State unchanged — action ignored
    expect(result).toBe(stateWithExchanges);
    expect(result.exchanges).toHaveLength(1);
    expect(result.clearBoardVersion).toBe(0);
  });

  it('resets all state fields except clearBoardVersion', () => {
    const dirtyState: BrainState = {
      exchanges: [{ id: 'ex-1', userPrompt: 'Test', responsesByAgent: {}, timestamp: 1 }],
      pendingExchange: null,
      currentAgent: null,
      isProcessing: false,
      userCancelled: false,
      warningState: { type: 'context_limit', message: 'Test', dismissable: true },
      error: 'Some error',
      clearBoardVersion: 5,
      mode: 'discussion',
      loopState: 'idle',
      resultArtifact: null,
      ceoExecutionPrompt: null,
      discussionSession: null,
      transcript: [],
      keyNotes: null,
      systemMessages: [],
      carryover: null,
      projectError: null,
      lastProjectIntent: null,
      ghostOutput: null,
      projectRun: null,
    };

    const action: BrainAction = { type: 'CLEAR' };

    const result = brainReducer(dirtyState, action);

    expect(result.exchanges).toHaveLength(0);
    expect(result.pendingExchange).toBeNull();
    expect(result.currentAgent).toBeNull();
    expect(result.isProcessing).toBe(false);
    expect(result.userCancelled).toBe(false);
    expect(result.warningState).toBeNull();
    expect(result.error).toBeNull();
    expect(result.clearBoardVersion).toBe(6); // Incremented from 5
  });
});

// -----------------------------------------------------------------------------
// State Invariant Tests
// -----------------------------------------------------------------------------

describe('brainReducer — State Invariants', () => {
  it('initialBrainState has expected key set', () => {
    const expectedKeys = [
      'exchanges',
      'pendingExchange',
      'currentAgent',
      'isProcessing',
      'userCancelled',
      'warningState',
      'error',
      'clearBoardVersion',
      'mode',
      'loopState',
      'resultArtifact',
      'ceoExecutionPrompt',
      'discussionSession',
      'transcript',
      'keyNotes',
      'systemMessages',
      'carryover',
      'projectError',
      'lastProjectIntent',
      'ghostOutput',
      'projectRun',
    ].sort();

    const actualKeys = Object.keys(initialBrainState).sort();
    expect(actualKeys).toEqual(expectedKeys);
  });

  it('responsesByAgent is keyed by Agent (not an array)', () => {
    let state = createProcessingState('run-123');
    state = brainReducer(state, {
      type: 'AGENT_COMPLETED',
      runId: 'run-123',
      response: createSuccessResponse('gpt'),
    });

    const responses = state.pendingExchange?.responsesByAgent;
    expect(responses).not.toBeInstanceOf(Array);
    expect(typeof responses).toBe('object');
    expect(responses?.gpt).toBeDefined();
  });
});
