// =============================================================================
// The Brain — Project Mode Phase Machine Tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import type { BrainState, ProjectRun } from '../types/brain';

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

function createProjectState(overrides: Partial<BrainState> = {}): BrainState {
  return {
    ...initialBrainState,
    mode: 'project',
    ...overrides,
  };
}

function createProjectRunState(runOverrides: Partial<ProjectRun> = {}): BrainState {
  const defaultRun: ProjectRun = {
    phase: 'INTENT_RECEIVED',
    epochId: 1,
    microEpochId: 1,
    revisionCount: 0,
    interrupts: [],
    lastIntent: 'Build a feature',
    ceoPromptArtifact: null,
    executorOutput: null,
    error: null,
    ...runOverrides,
  };
  return createProjectState({
    projectRun: defaultRun,
    loopState: 'running',
  });
}

// -----------------------------------------------------------------------------
// Two-Pane Layout Tests
// -----------------------------------------------------------------------------

describe('Project Mode Two-Pane Layout', () => {
  it('projectRun is null in initial state', () => {
    expect(initialBrainState.projectRun).toBeNull();
  });

  it('projectRun is created when starting epoch', () => {
    const state = createProjectState();
    const result = brainReducer(state, {
      type: 'PROJECT_START_EPOCH',
      intent: 'Build a REST API',
    });

    expect(result.projectRun).not.toBeNull();
    expect(result.projectRun?.phase).toBe('INTENT_RECEIVED');
    expect(result.projectRun?.epochId).toBe(1);
    expect(result.projectRun?.lastIntent).toBe('Build a REST API');
  });

  it('projectRun cleared when switching away from project mode', () => {
    // Create state with loopState: 'idle' so mode change is allowed
    const state = createProjectRunState();
    const idleState = { ...state, loopState: 'idle' as const };
    const result = brainReducer(idleState, { type: 'SET_MODE', mode: 'discussion' });

    expect(result.projectRun).toBeNull();
    expect(result.mode).toBe('discussion');
  });
});

// -----------------------------------------------------------------------------
// Request Change (Interrupt) Tests
// -----------------------------------------------------------------------------

describe('Request Change — Blocker', () => {
  it('blocker sets loopState to paused immediately', () => {
    const state = createProjectRunState();
    expect(state.loopState).toBe('running');

    const result = brainReducer(state, {
      type: 'PROJECT_ADD_INTERRUPT',
      interrupt: {
        message: 'Critical bug found',
        severity: 'blocker',
        scope: 'api',
      },
    });

    expect(result.loopState).toBe('paused');
    expect(result.projectRun?.interrupts).toHaveLength(1);
    expect(result.projectRun?.interrupts[0].severity).toBe('blocker');
    expect(result.projectRun?.interrupts[0].processed).toBe(false);
  });

  it('processing blocker creates new microEpochId and increments revision', () => {
    const state = createProjectRunState({
      microEpochId: 1,
      revisionCount: 0,
      interrupts: [
        {
          id: 'int-1',
          message: 'Bug',
          severity: 'blocker',
          scope: 'api',
          timestamp: Date.now(),
          processed: false,
        },
      ],
    });
    // Simulate paused state after blocker
    const pausedState: BrainState = { ...state, loopState: 'paused' };

    const result = brainReducer(pausedState, { type: 'PROJECT_PROCESS_BLOCKER' });

    expect(result.loopState).toBe('running');
    expect(result.projectRun?.microEpochId).toBe(2);
    expect(result.projectRun?.revisionCount).toBe(1);
    expect(result.projectRun?.phase).toBe('INTENT_RECEIVED');
    expect(result.projectRun?.interrupts[0].processed).toBe(true);
  });
});

describe('Request Change — Improvement', () => {
  it('improvement does NOT pause immediately', () => {
    const state = createProjectRunState();
    expect(state.loopState).toBe('running');

    const result = brainReducer(state, {
      type: 'PROJECT_ADD_INTERRUPT',
      interrupt: {
        message: 'Consider better naming',
        severity: 'improvement',
        scope: 'ui',
      },
    });

    expect(result.loopState).toBe('running'); // Still running
    expect(result.projectRun?.interrupts).toHaveLength(1);
    expect(result.projectRun?.interrupts[0].severity).toBe('improvement');
  });
});

// -----------------------------------------------------------------------------
// Revision Cap Tests
// -----------------------------------------------------------------------------

describe('Revision Cap', () => {
  it('allows up to 2 revisions per epoch', () => {
    const state = createProjectRunState({ revisionCount: 1 });
    const pausedState: BrainState = { ...state, loopState: 'paused' };

    const result = brainReducer(pausedState, { type: 'PROJECT_PROCESS_BLOCKER' });

    expect(result.projectRun?.revisionCount).toBe(2);
    expect(result.loopState).toBe('running');
    expect(result.projectRun?.phase).not.toBe('FAILED_REQUIRES_USER_DIRECTION');
  });

  it('exceeding 2 revisions forces FAILED_REQUIRES_USER_DIRECTION', () => {
    const state = createProjectRunState({ revisionCount: 2 });
    const pausedState: BrainState = { ...state, loopState: 'paused' };

    const result = brainReducer(pausedState, { type: 'PROJECT_PROCESS_BLOCKER' });

    expect(result.loopState).toBe('failed');
    expect(result.projectRun?.phase).toBe('FAILED_REQUIRES_USER_DIRECTION');
    expect(result.projectRun?.revisionCount).toBe(3);
    expect(result.projectRun?.error).toContain('Revision cap exceeded');
  });
});

// -----------------------------------------------------------------------------
// Phase Transitions
// -----------------------------------------------------------------------------

describe('Phase Transitions', () => {
  it('PROJECT_SET_PHASE transitions to new phase', () => {
    const state = createProjectRunState({ phase: 'INTENT_RECEIVED' });

    const result = brainReducer(state, {
      type: 'PROJECT_SET_PHASE',
      phase: 'DELIBERATION',
    });

    expect(result.projectRun?.phase).toBe('DELIBERATION');
  });

  it('DONE phase sets loopState to completed', () => {
    const state = createProjectRunState({ phase: 'REVIEW' });

    const result = brainReducer(state, {
      type: 'PROJECT_SET_PHASE',
      phase: 'DONE',
    });

    expect(result.projectRun?.phase).toBe('DONE');
    expect(result.loopState).toBe('completed');
  });

  it('FAILED_REQUIRES_USER_DIRECTION sets loopState to failed', () => {
    const state = createProjectRunState({ phase: 'DELIBERATION' });

    const result = brainReducer(state, {
      type: 'PROJECT_SET_PHASE',
      phase: 'FAILED_REQUIRES_USER_DIRECTION',
    });

    expect(result.projectRun?.phase).toBe('FAILED_REQUIRES_USER_DIRECTION');
    expect(result.loopState).toBe('failed');
  });
});

// -----------------------------------------------------------------------------
// New Direction
// -----------------------------------------------------------------------------

describe('New Direction', () => {
  it('starts new epoch after DONE', () => {
    const state = createProjectRunState({
      phase: 'DONE',
      epochId: 1,
    });
    const completedState: BrainState = { ...state, loopState: 'completed' };

    const result = brainReducer(completedState, {
      type: 'PROJECT_NEW_DIRECTION',
      intent: 'Add authentication',
    });

    expect(result.projectRun?.epochId).toBe(2);
    expect(result.projectRun?.microEpochId).toBe(1);
    expect(result.projectRun?.revisionCount).toBe(0);
    expect(result.projectRun?.phase).toBe('INTENT_RECEIVED');
    expect(result.projectRun?.lastIntent).toBe('Add authentication');
    expect(result.loopState).toBe('running');
  });

  it('starts new epoch after FAILED', () => {
    const state = createProjectRunState({
      phase: 'FAILED_REQUIRES_USER_DIRECTION',
      epochId: 2,
    });
    const failedState: BrainState = { ...state, loopState: 'failed' };

    const result = brainReducer(failedState, {
      type: 'PROJECT_NEW_DIRECTION',
      intent: 'Try different approach',
    });

    expect(result.projectRun?.epochId).toBe(3);
    expect(result.loopState).toBe('running');
  });
});

// -----------------------------------------------------------------------------
// Force Fail (Stop Button)
// -----------------------------------------------------------------------------

describe('Force Fail', () => {
  it('PROJECT_FORCE_FAIL sets terminal failure state', () => {
    const state = createProjectRunState({ phase: 'DELIBERATION' });

    const result = brainReducer(state, { type: 'PROJECT_FORCE_FAIL' });

    expect(result.loopState).toBe('failed');
    expect(result.projectRun?.phase).toBe('FAILED_REQUIRES_USER_DIRECTION');
    expect(result.projectRun?.error).toBe('Stopped by user');
  });
});

// -----------------------------------------------------------------------------
// Discussion Mode Unaffected
// -----------------------------------------------------------------------------

describe('Discussion Mode Unaffected', () => {
  it('PROJECT_START_EPOCH no-ops in discussion mode', () => {
    const state: BrainState = { ...initialBrainState, mode: 'discussion' };

    const result = brainReducer(state, {
      type: 'PROJECT_START_EPOCH',
      intent: 'Test',
    });

    expect(result.projectRun).toBeNull();
    expect(result).toBe(state);
  });

  it('PROJECT_ADD_INTERRUPT no-ops without projectRun', () => {
    const state: BrainState = { ...initialBrainState, mode: 'discussion' };

    const result = brainReducer(state, {
      type: 'PROJECT_ADD_INTERRUPT',
      interrupt: { message: 'Test', severity: 'blocker', scope: 'api' },
    });

    expect(result).toBe(state);
  });

  it('initialBrainState includes projectRun: null', () => {
    expect(initialBrainState.projectRun).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// CEO Artifact Storage
// -----------------------------------------------------------------------------

describe('CEO Artifact', () => {
  it('PROJECT_SET_CEO_ARTIFACT stores prompt', () => {
    const state = createProjectRunState();

    const result = brainReducer(state, {
      type: 'PROJECT_SET_CEO_ARTIFACT',
      artifact: 'Execute: npm run build',
    });

    expect(result.projectRun?.ceoPromptArtifact).toBe('Execute: npm run build');
    expect(result.ceoExecutionPrompt).toBe('Execute: npm run build');
  });
});

// -----------------------------------------------------------------------------
// Executor Output Storage
// -----------------------------------------------------------------------------

describe('Executor Output', () => {
  it('PROJECT_SET_EXECUTOR_OUTPUT stores output', () => {
    const state = createProjectRunState();

    const result = brainReducer(state, {
      type: 'PROJECT_SET_EXECUTOR_OUTPUT',
      output: 'Build successful',
    });

    expect(result.projectRun?.executorOutput).toBe('Build successful');
    expect(result.resultArtifact).toBe('Build successful');
  });
});
