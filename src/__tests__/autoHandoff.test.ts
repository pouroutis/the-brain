// =============================================================================
// The Brain — Auto-Handoff Tests (Batch 9)
// Verifies Decision → Project handoff: project creation + decision seeding.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import type { BrainState, DecisionRecord } from '../types/brain';

// =============================================================================
// Helpers
// =============================================================================

function makeDecisionRecord(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: 'dec-test-001',
    createdAt: Date.now(),
    mode: 'decision',
    promptProduced: true,
    claudeCodePrompt: '# Test Claude Code Prompt\nStep 1: Do the thing',
    blocked: false,
    ceoAgent: 'gpt',
    advisors: ['claude', 'gemini'],
    recentExchanges: [],
    keyNotes: null,
    ...overrides,
  };
}

// =============================================================================
// Handoff Flow: CREATE_PROJECT → APPEND_PROJECT_DECISION
// =============================================================================

describe('Auto-handoff: CREATE_PROJECT → APPEND_PROJECT_DECISION', () => {
  it('creates a project then seeds it with a decision record', () => {
    // Start with no project
    let state: BrainState = { ...initialBrainState, mode: 'decision' };
    expect(state.activeProject).toBeNull();

    // Step 1: Create project
    state = brainReducer(state, {
      type: 'CREATE_PROJECT',
      projectId: 'proj-handoff-001',
      title: 'Build auth system',
    });

    expect(state.activeProject).not.toBeNull();
    expect(state.activeProject!.id).toBe('proj-handoff-001');
    expect(state.activeProject!.title).toBe('Build auth system');
    expect(state.activeProject!.decisions).toHaveLength(0);

    // Step 2: Append decision with FINAL prompt
    const decision = makeDecisionRecord({
      epochId: 5,
      claudeCodePrompt: '# Batch 9 implementation prompt\nDo it right.',
    });

    state = brainReducer(state, {
      type: 'APPEND_PROJECT_DECISION',
      decision,
    });

    expect(state.activeProject!.decisions).toHaveLength(1);
    expect(state.activeProject!.decisions[0].promptProduced).toBe(true);
    expect(state.activeProject!.decisions[0].claudeCodePrompt).toContain('Batch 9');
    expect(state.activeProject!.decisions[0].epochId).toBe(5);
    expect(state.activeProject!.lastDecisionId).toBe(decision.id);
  });

  it('project title is set from epoch intent', () => {
    let state: BrainState = { ...initialBrainState, mode: 'decision' };

    state = brainReducer(state, {
      type: 'CREATE_PROJECT',
      projectId: 'proj-titled-001',
      title: 'Implement CEO file injection for Decision mode',
    });

    expect(state.activeProject!.title).toBe('Implement CEO file injection for Decision mode');
  });

  it('decision record preserves Claude Code prompt text', () => {
    let state: BrainState = { ...initialBrainState, mode: 'decision' };

    state = brainReducer(state, {
      type: 'CREATE_PROJECT',
      projectId: 'proj-prompt-001',
    });

    const promptText = `# PROJECT: THE BRAIN
## STEP 1: Do something
## STEP 2: Do another thing
Build gates after every step.`;

    state = brainReducer(state, {
      type: 'APPEND_PROJECT_DECISION',
      decision: makeDecisionRecord({ claudeCodePrompt: promptText }),
    });

    expect(state.activeProject!.decisions[0].claudeCodePrompt).toBe(promptText);
  });

  it('APPEND_PROJECT_DECISION is no-op when no active project', () => {
    let state: BrainState = { ...initialBrainState, mode: 'decision' };
    expect(state.activeProject).toBeNull();

    // Try to append without a project
    state = brainReducer(state, {
      type: 'APPEND_PROJECT_DECISION',
      decision: makeDecisionRecord(),
    });

    // State unchanged
    expect(state.activeProject).toBeNull();
  });

  it('project status updates based on decision', () => {
    let state: BrainState = { ...initialBrainState, mode: 'decision' };

    state = brainReducer(state, {
      type: 'CREATE_PROJECT',
      projectId: 'proj-status-001',
    });

    // Non-blocked decision → status stays active
    state = brainReducer(state, {
      type: 'APPEND_PROJECT_DECISION',
      decision: makeDecisionRecord({ blocked: false }),
    });
    expect(state.activeProject!.status).toBe('active');

    // Blocked decision → status becomes blocked
    state = brainReducer(state, {
      type: 'APPEND_PROJECT_DECISION',
      decision: makeDecisionRecord({
        id: 'dec-blocked-001',
        blocked: true,
        promptProduced: false,
        blockedReason: 'CEO needs clarification',
      }),
    });
    expect(state.activeProject!.status).toBe('blocked');
  });

  it('multiple decisions accumulate in project history', () => {
    let state: BrainState = { ...initialBrainState, mode: 'decision' };

    state = brainReducer(state, {
      type: 'CREATE_PROJECT',
      projectId: 'proj-multi-001',
    });

    // Append 3 decisions
    for (let i = 0; i < 3; i++) {
      state = brainReducer(state, {
        type: 'APPEND_PROJECT_DECISION',
        decision: makeDecisionRecord({
          id: `dec-multi-${i}`,
          epochId: i + 1,
          claudeCodePrompt: `Prompt for batch ${i + 1}`,
        }),
      });
    }

    expect(state.activeProject!.decisions).toHaveLength(3);
    expect(state.activeProject!.lastDecisionId).toBe('dec-multi-2');
    expect(state.activeProject!.decisions[2].claudeCodePrompt).toContain('batch 3');
  });

  it('SET_MODE to project works after handoff sequence', () => {
    let state: BrainState = { ...initialBrainState, mode: 'decision' };

    state = brainReducer(state, {
      type: 'CREATE_PROJECT',
      projectId: 'proj-mode-001',
    });

    state = brainReducer(state, {
      type: 'APPEND_PROJECT_DECISION',
      decision: makeDecisionRecord(),
    });

    state = brainReducer(state, {
      type: 'SET_MODE',
      mode: 'project',
    });

    expect(state.mode).toBe('project');
    expect(state.activeProject).not.toBeNull();
    expect(state.activeProject!.decisions).toHaveLength(1);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Auto-handoff edge cases', () => {
  it('project with no prompt artifact still creates valid decision', () => {
    let state: BrainState = { ...initialBrainState, mode: 'decision' };

    state = brainReducer(state, {
      type: 'CREATE_PROJECT',
      projectId: 'proj-noprompt-001',
    });

    state = brainReducer(state, {
      type: 'APPEND_PROJECT_DECISION',
      decision: makeDecisionRecord({
        promptProduced: false,
        claudeCodePrompt: undefined,
        blocked: true,
        blockedReason: 'Need more context',
      }),
    });

    expect(state.activeProject!.decisions).toHaveLength(1);
    expect(state.activeProject!.decisions[0].promptProduced).toBe(false);
    expect(state.activeProject!.decisions[0].claudeCodePrompt).toBeUndefined();
  });

  it('CREATE_PROJECT does not clear exchanges (no CLEAR dispatch)', () => {
    // Simulate having exchanges in state before project creation
    let state: BrainState = {
      ...initialBrainState,
      mode: 'decision',
      exchanges: [{
        id: 'ex-001',
        userPrompt: 'Build a login page',
        timestamp: Date.now(),
        responsesByAgent: {
          gpt: { agent: 'gpt', timestamp: Date.now(), status: 'success', content: 'Done' },
          claude: { agent: 'claude', timestamp: Date.now(), status: 'success', content: 'Done' },
          gemini: { agent: 'gemini', timestamp: Date.now(), status: 'success', content: 'Done' },
        },
      }],
    };

    // CREATE_PROJECT alone should NOT clear exchanges
    state = brainReducer(state, {
      type: 'CREATE_PROJECT',
      projectId: 'proj-preserve-001',
    });

    expect(state.exchanges).toHaveLength(1);
    expect(state.exchanges[0].userPrompt).toBe('Build a login page');
  });
});
