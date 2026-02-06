// =============================================================================
// The Brain — DecisionEpoch State Machine Tests (Batch 4)
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import type { BrainState, BrainAction, DecisionEpoch } from '../types/brain';
import { EPOCH_DEFAULT_MAX_ROUNDS, EPOCH_ABSOLUTE_MAX_ROUNDS } from '../types/brain';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create a Decision-mode state for testing */
function decisionState(overrides?: Partial<BrainState>): BrainState {
  return {
    ...initialBrainState,
    mode: 'decision',
    ...overrides,
  };
}

/** Create a minimal active epoch */
function activeEpoch(overrides?: Partial<DecisionEpoch>): DecisionEpoch {
  return {
    epochId: 1,
    round: 1,
    phase: 'ADVISORS',
    maxRounds: EPOCH_DEFAULT_MAX_ROUNDS,
    intent: 'Test intent',
    ceoAgent: 'gpt',
    ceoOnlyMode: false,
    startedAt: 1000,
    completedAt: null,
    terminalReason: null,
    ...overrides,
  };
}

// Suppress console.warn in tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

// =============================================================================
// EPOCH_START
// =============================================================================

describe('EPOCH_START', () => {
  it('creates epoch with correct defaults in Decision mode', () => {
    const state = decisionState();
    const action: BrainAction = { type: 'EPOCH_START', intent: 'Build feature X', ceoAgent: 'gpt', ceoOnlyMode: false };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch).not.toBeNull();
    expect(result.decisionEpoch!.epochId).toBe(1);
    expect(result.decisionEpoch!.round).toBe(1);
    expect(result.decisionEpoch!.phase).toBe('ADVISORS');
    expect(result.decisionEpoch!.maxRounds).toBe(EPOCH_DEFAULT_MAX_ROUNDS);
    expect(result.decisionEpoch!.intent).toBe('Build feature X');
    expect(result.decisionEpoch!.ceoAgent).toBe('gpt');
    expect(result.decisionEpoch!.ceoOnlyMode).toBe(false);
    expect(result.decisionEpoch!.completedAt).toBeNull();
    expect(result.decisionEpoch!.terminalReason).toBeNull();
  });

  it('skips to CEO_DRAFT when ceoOnlyMode is true', () => {
    const state = decisionState();
    const action: BrainAction = { type: 'EPOCH_START', intent: 'Quick decision', ceoAgent: 'claude', ceoOnlyMode: true };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.phase).toBe('CEO_DRAFT');
    expect(result.decisionEpoch!.ceoOnlyMode).toBe(true);
    expect(result.decisionEpoch!.ceoAgent).toBe('claude');
  });

  it('increments epochId from previous epoch', () => {
    const state = decisionState({
      decisionEpoch: activeEpoch({ epochId: 5, phase: 'EPOCH_COMPLETE', completedAt: 2000, terminalReason: 'prompt_delivered' }),
    });
    const action: BrainAction = { type: 'EPOCH_START', intent: 'Next task', ceoAgent: 'gpt', ceoOnlyMode: false };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.epochId).toBe(6);
  });

  it('rejects when not in Decision mode', () => {
    const state = { ...initialBrainState, mode: 'discussion' as const };
    const action: BrainAction = { type: 'EPOCH_START', intent: 'Test', ceoAgent: 'gpt', ceoOnlyMode: false };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch).toBeNull();
  });

  it('rejects when active epoch exists (non-terminal)', () => {
    const state = decisionState({
      decisionEpoch: activeEpoch({ phase: 'ADVISORS' }),
    });
    const action: BrainAction = { type: 'EPOCH_START', intent: 'Duplicate', ceoAgent: 'gpt', ceoOnlyMode: false };
    const result = brainReducer(state, action);

    // Should keep the existing epoch, not create a new one
    expect(result.decisionEpoch!.intent).toBe('Test intent');
  });

  it('allows new epoch when previous epoch is terminal', () => {
    const state = decisionState({
      decisionEpoch: activeEpoch({ phase: 'EPOCH_BLOCKED', completedAt: 2000, terminalReason: 'blocked' }),
    });
    const action: BrainAction = { type: 'EPOCH_START', intent: 'After block', ceoAgent: 'gemini', ceoOnlyMode: false };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.intent).toBe('After block');
    expect(result.decisionEpoch!.ceoAgent).toBe('gemini');
  });
});

// =============================================================================
// EPOCH_ADVANCE_PHASE
// =============================================================================

describe('EPOCH_ADVANCE_PHASE', () => {
  it('ADVISORS → CEO_DRAFT is valid', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'ADVISORS' }) });
    const action: BrainAction = { type: 'EPOCH_ADVANCE_PHASE', phase: 'CEO_DRAFT' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.phase).toBe('CEO_DRAFT');
  });

  it('ADVISORS → CEO_FINAL is valid (Round 2+)', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'ADVISORS', round: 2 }) });
    const action: BrainAction = { type: 'EPOCH_ADVANCE_PHASE', phase: 'CEO_FINAL' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.phase).toBe('CEO_FINAL');
  });

  it('CEO_DRAFT → ADVISOR_REVIEW is valid', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'CEO_DRAFT' }) });
    const action: BrainAction = { type: 'EPOCH_ADVANCE_PHASE', phase: 'ADVISOR_REVIEW' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.phase).toBe('ADVISOR_REVIEW');
  });

  it('ADVISOR_REVIEW → CEO_FINAL is valid', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'ADVISOR_REVIEW', round: 2 }) });
    const action: BrainAction = { type: 'EPOCH_ADVANCE_PHASE', phase: 'CEO_FINAL' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.phase).toBe('CEO_FINAL');
  });

  it('rejects invalid transition (ADVISORS → EPOCH_COMPLETE)', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'ADVISORS' }) });
    const action: BrainAction = { type: 'EPOCH_ADVANCE_PHASE', phase: 'EPOCH_COMPLETE' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.phase).toBe('ADVISORS'); // unchanged
  });

  it('rejects when no epoch exists', () => {
    const state = decisionState();
    const action: BrainAction = { type: 'EPOCH_ADVANCE_PHASE', phase: 'CEO_DRAFT' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch).toBeNull();
  });

  it('rejects transition from terminal phase', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'EPOCH_COMPLETE' }) });
    const action: BrainAction = { type: 'EPOCH_ADVANCE_PHASE', phase: 'CEO_DRAFT' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.phase).toBe('EPOCH_COMPLETE'); // unchanged
  });
});

// =============================================================================
// EPOCH_ADVANCE_ROUND
// =============================================================================

describe('EPOCH_ADVANCE_ROUND', () => {
  it('increments round and sets ADVISOR_REVIEW from CEO_DRAFT', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'CEO_DRAFT', round: 1 }) });
    const action: BrainAction = { type: 'EPOCH_ADVANCE_ROUND' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.round).toBe(2);
    expect(result.decisionEpoch!.phase).toBe('ADVISOR_REVIEW');
  });

  it('rejects from wrong phase (ADVISORS)', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'ADVISORS', round: 1 }) });
    const action: BrainAction = { type: 'EPOCH_ADVANCE_ROUND' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.round).toBe(1); // unchanged
  });

  it('rejects at max rounds', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'CEO_DRAFT', round: 2, maxRounds: 2 }) });
    const action: BrainAction = { type: 'EPOCH_ADVANCE_ROUND' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.round).toBe(2); // unchanged
  });

  it('allows round 3 when maxRounds extended to 3', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'CEO_DRAFT', round: 2, maxRounds: 3 }) });
    const action: BrainAction = { type: 'EPOCH_ADVANCE_ROUND' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.round).toBe(3);
    expect(result.decisionEpoch!.phase).toBe('ADVISOR_REVIEW');
  });

  it('rejects when no epoch exists', () => {
    const state = decisionState();
    const action: BrainAction = { type: 'EPOCH_ADVANCE_ROUND' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch).toBeNull();
  });
});

// =============================================================================
// EPOCH_EXTEND_MAX_ROUNDS
// =============================================================================

describe('EPOCH_EXTEND_MAX_ROUNDS', () => {
  it('extends 2 → 3 in Round 2', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ round: 2, maxRounds: 2, phase: 'CEO_FINAL' }) });
    const action: BrainAction = { type: 'EPOCH_EXTEND_MAX_ROUNDS' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.maxRounds).toBe(EPOCH_ABSOLUTE_MAX_ROUNDS);
  });

  it('rejects when already extended', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ round: 2, maxRounds: 3, phase: 'CEO_FINAL' }) });
    const action: BrainAction = { type: 'EPOCH_EXTEND_MAX_ROUNDS' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.maxRounds).toBe(3); // unchanged
  });

  it('rejects outside Round 2', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ round: 1, maxRounds: 2, phase: 'CEO_DRAFT' }) });
    const action: BrainAction = { type: 'EPOCH_EXTEND_MAX_ROUNDS' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.maxRounds).toBe(2); // unchanged
  });

  it('rejects when no epoch exists', () => {
    const state = decisionState();
    const action: BrainAction = { type: 'EPOCH_EXTEND_MAX_ROUNDS' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch).toBeNull();
  });

  it('rejects on terminal epoch', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ round: 2, maxRounds: 2, phase: 'EPOCH_COMPLETE' }) });
    const action: BrainAction = { type: 'EPOCH_EXTEND_MAX_ROUNDS' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.maxRounds).toBe(2); // unchanged
  });
});

// =============================================================================
// EPOCH_COMPLETE
// =============================================================================

describe('EPOCH_COMPLETE', () => {
  it('prompt_delivered → EPOCH_COMPLETE phase', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'CEO_DRAFT' }) });
    const action: BrainAction = { type: 'EPOCH_COMPLETE', reason: 'prompt_delivered' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.phase).toBe('EPOCH_COMPLETE');
    expect(result.decisionEpoch!.completedAt).not.toBeNull();
    expect(result.decisionEpoch!.terminalReason).toBe('prompt_delivered');
  });

  it('blocked → EPOCH_BLOCKED phase', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'CEO_DRAFT' }) });
    const action: BrainAction = { type: 'EPOCH_COMPLETE', reason: 'blocked' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.phase).toBe('EPOCH_BLOCKED');
    expect(result.decisionEpoch!.terminalReason).toBe('blocked');
  });

  it('stopped → EPOCH_STOPPED phase', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'CEO_FINAL' }) });
    const action: BrainAction = { type: 'EPOCH_COMPLETE', reason: 'stopped' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.phase).toBe('EPOCH_STOPPED');
    expect(result.decisionEpoch!.terminalReason).toBe('stopped');
  });

  it('cancelled → EPOCH_STOPPED phase', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'ADVISORS' }) });
    const action: BrainAction = { type: 'EPOCH_COMPLETE', reason: 'cancelled' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.phase).toBe('EPOCH_STOPPED');
    expect(result.decisionEpoch!.terminalReason).toBe('cancelled');
  });

  it('rejects on already-terminal epoch', () => {
    const state = decisionState({ decisionEpoch: activeEpoch({ phase: 'EPOCH_COMPLETE', completedAt: 2000, terminalReason: 'prompt_delivered' }) });
    const action: BrainAction = { type: 'EPOCH_COMPLETE', reason: 'blocked' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch!.phase).toBe('EPOCH_COMPLETE'); // unchanged
    expect(result.decisionEpoch!.terminalReason).toBe('prompt_delivered'); // unchanged
  });

  it('rejects when no epoch exists', () => {
    const state = decisionState();
    const action: BrainAction = { type: 'EPOCH_COMPLETE', reason: 'prompt_delivered' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch).toBeNull();
  });
});

// =============================================================================
// EPOCH_RESET
// =============================================================================

describe('EPOCH_RESET', () => {
  it('clears epoch to null', () => {
    const state = decisionState({ decisionEpoch: activeEpoch() });
    const action: BrainAction = { type: 'EPOCH_RESET' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch).toBeNull();
  });

  it('no-op when epoch is already null', () => {
    const state = decisionState();
    const action: BrainAction = { type: 'EPOCH_RESET' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch).toBeNull();
  });
});

// =============================================================================
// Integration with existing actions
// =============================================================================

describe('Existing action epoch integration', () => {
  it('CLEAR resets decisionEpoch', () => {
    const state = decisionState({
      decisionEpoch: activeEpoch(),
      exchanges: [{ id: 'ex-1', userPrompt: 'Test', responsesByAgent: {}, timestamp: 1 }],
    });
    const action: BrainAction = { type: 'CLEAR' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch).toBeNull();
  });

  it('SET_MODE away from decision resets decisionEpoch', () => {
    const state = decisionState({ decisionEpoch: activeEpoch() });
    const action: BrainAction = { type: 'SET_MODE', mode: 'discussion' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch).toBeNull();
  });

  it('SET_MODE to decision preserves decisionEpoch', () => {
    const state = decisionState({ decisionEpoch: activeEpoch() });
    const action: BrainAction = { type: 'SET_MODE', mode: 'decision' };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch).not.toBeNull();
  });

  it('REHYDRATE_PROJECT resets decisionEpoch', () => {
    const state = decisionState({ decisionEpoch: activeEpoch() });
    const action: BrainAction = {
      type: 'REHYDRATE_PROJECT',
      project: {
        id: 'proj-1',
        createdAt: 1000,
        updatedAt: 2000,
        status: 'active',
        decisions: [],
        projectMemory: { recentExchanges: [], keyNotes: null },
        schemaVersion: 1,
      },
    };
    const result = brainReducer(state, action);

    expect(result.decisionEpoch).toBeNull();
  });
});

// =============================================================================
// Initial state
// =============================================================================

describe('initialBrainState', () => {
  it('has null decisionEpoch', () => {
    expect(initialBrainState.decisionEpoch).toBeNull();
  });
});
