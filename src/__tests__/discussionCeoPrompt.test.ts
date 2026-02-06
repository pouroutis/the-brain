// =============================================================================
// The Brain — Decision Mode CEO Prompt Artifact Tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import { parseCeoControlBlock, createCeoPromptArtifact } from '../utils/ceoControlBlockParser';
import type { BrainState, CeoPromptArtifact } from '../types/brain';

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

function createDecisionState(overrides: Partial<BrainState> = {}): BrainState {
  return {
    ...initialBrainState,
    mode: 'decision',
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// CEO Control Block Parser Tests (HARD DELIMITERS)
// -----------------------------------------------------------------------------

describe('CEO Control Block Parser', () => {
  it('returns no artifact when content has no markers', () => {
    const content = 'This is a regular response without any delimiter markers.';
    const result = parseCeoControlBlock(content);

    expect(result.hasPromptArtifact).toBe(false);
    expect(result.promptText).toBeNull();
    expect(result.displayContent).toBe(content);
  });

  it('extracts prompt from valid delimiter markers', () => {
    const promptText = 'Build a REST API with authentication';
    const content = `Here's my analysis.

=== CLAUDE_CODE_PROMPT_START ===
${promptText}
=== CLAUDE_CODE_PROMPT_END ===

Let me know if you need anything else.`;

    const result = parseCeoControlBlock(content);

    expect(result.hasPromptArtifact).toBe(true);
    expect(result.promptText).toBe(promptText);
    expect(result.displayContent).not.toContain('CLAUDE_CODE_PROMPT_START');
    expect(result.displayContent).not.toContain('CLAUDE_CODE_PROMPT_END');
  });

  it('ignores partial markers (start only)', () => {
    const content = `Some response text.

=== CLAUDE_CODE_PROMPT_START ===
Some content without end marker

More text.`;

    const result = parseCeoControlBlock(content);

    expect(result.hasPromptArtifact).toBe(false);
    expect(result.promptText).toBeNull();
  });

  it('ignores partial markers (end only)', () => {
    const content = `Response with only end marker:

Some content
=== CLAUDE_CODE_PROMPT_END ===

End.`;

    const result = parseCeoControlBlock(content);

    expect(result.hasPromptArtifact).toBe(false);
    expect(result.promptText).toBeNull();
  });

  it('extracts first prompt when multiple marker pairs exist', () => {
    const content = `First block:

=== CLAUDE_CODE_PROMPT_START ===
First prompt
=== CLAUDE_CODE_PROMPT_END ===

Second block:

=== CLAUDE_CODE_PROMPT_START ===
Second prompt
=== CLAUDE_CODE_PROMPT_END ===`;

    const result = parseCeoControlBlock(content);

    expect(result.hasPromptArtifact).toBe(true);
    expect(result.promptText).toBe('First prompt');
  });

  it('handles multi-line prompt text', () => {
    const content = `=== CLAUDE_CODE_PROMPT_START ===
Step 1: Create database
Step 2: Add models
Step 3: Build API
=== CLAUDE_CODE_PROMPT_END ===`;

    const result = parseCeoControlBlock(content);

    expect(result.hasPromptArtifact).toBe(true);
    expect(result.promptText).toBe('Step 1: Create database\nStep 2: Add models\nStep 3: Build API');
  });
});

// -----------------------------------------------------------------------------
// CEO Prompt Artifact Creation Tests
// -----------------------------------------------------------------------------

describe('CEO Prompt Artifact Creation', () => {
  it('creates new artifact with version 1 when no existing artifact', () => {
    const artifact = createCeoPromptArtifact('New prompt', null);

    expect(artifact.text).toBe('New prompt');
    expect(artifact.version).toBe(1);
    expect(artifact.createdAt).toBeDefined();
  });

  it('increments version when existing artifact exists', () => {
    const existing: CeoPromptArtifact = {
      text: 'Old prompt',
      version: 3,
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const artifact = createCeoPromptArtifact('Updated prompt', existing);

    expect(artifact.text).toBe('Updated prompt');
    expect(artifact.version).toBe(4);
  });

  it('sets ISO timestamp for createdAt', () => {
    const artifact = createCeoPromptArtifact('Prompt', null);

    // Should be valid ISO date string
    expect(() => new Date(artifact.createdAt)).not.toThrow();
    expect(artifact.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// -----------------------------------------------------------------------------
// Reducer Tests for Decision Mode CEO Prompt Artifact
// -----------------------------------------------------------------------------

describe('Decision Mode CEO Prompt Artifact Reducer', () => {
  it('initialBrainState has null discussionCeoPromptArtifact', () => {
    expect(initialBrainState.discussionCeoPromptArtifact).toBeNull();
  });

  it('SET_DISCUSSION_CEO_PROMPT_ARTIFACT stores artifact in decision mode', () => {
    const state = createDecisionState();
    const artifact: CeoPromptArtifact = {
      text: 'Build authentication system',
      version: 1,
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const result = brainReducer(state, {
      type: 'SET_DISCUSSION_CEO_PROMPT_ARTIFACT',
      artifact,
    });

    expect(result.discussionCeoPromptArtifact).toEqual(artifact);
  });

  it('SET_DISCUSSION_CEO_PROMPT_ARTIFACT stores artifact in discussion mode', () => {
    const state: BrainState = { ...initialBrainState, mode: 'discussion' };
    const artifact: CeoPromptArtifact = {
      text: 'Build authentication system',
      version: 1,
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const result = brainReducer(state, {
      type: 'SET_DISCUSSION_CEO_PROMPT_ARTIFACT',
      artifact,
    });

    expect(result.discussionCeoPromptArtifact).toEqual(artifact);
  });

  it('SET_DISCUSSION_CEO_PROMPT_ARTIFACT no-ops in project mode', () => {
    const state: BrainState = { ...initialBrainState, mode: 'project' };
    const artifact: CeoPromptArtifact = {
      text: 'Some prompt',
      version: 1,
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const result = brainReducer(state, {
      type: 'SET_DISCUSSION_CEO_PROMPT_ARTIFACT',
      artifact,
    });

    expect(result.discussionCeoPromptArtifact).toBeNull();
  });

  it('CLEAR resets discussionCeoPromptArtifact in decision mode', () => {
    const state = createDecisionState({
      discussionCeoPromptArtifact: {
        text: 'Some prompt',
        version: 2,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    });

    const result = brainReducer(state, { type: 'CLEAR' });

    expect(result.discussionCeoPromptArtifact).toBeNull();
  });

  it('CLEAR preserves discussionCeoPromptArtifact in project mode', () => {
    const artifact: CeoPromptArtifact = {
      text: 'Some prompt',
      version: 2,
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const state: BrainState = {
      ...initialBrainState,
      mode: 'project',
      discussionCeoPromptArtifact: artifact,
    };

    const result = brainReducer(state, { type: 'CLEAR' });

    expect(result.discussionCeoPromptArtifact).toEqual(artifact);
  });
});

// -----------------------------------------------------------------------------
// Type Definition Tests
// -----------------------------------------------------------------------------

describe('CeoPromptArtifact Type', () => {
  it('has required properties', () => {
    const artifact: CeoPromptArtifact = {
      text: 'Create a REST API',
      version: 1,
      createdAt: new Date().toISOString(),
    };

    expect(artifact.text).toBeDefined();
    expect(artifact.version).toBeDefined();
    expect(artifact.createdAt).toBeDefined();
  });
});

// =============================================================================
// Batch 5: DRAFT + STOP_NOW Parser Tests
// =============================================================================

describe('CEO DRAFT Markers (Batch 5)', () => {
  it('extracts draft from valid DRAFT markers', () => {
    const draftText = 'Build a REST API with Node.js and Express';
    const content = `Here is my analysis.\n\n=== CEO_DRAFT_START ===\n${draftText}\n=== CEO_DRAFT_END ===\n\nPlease review.`;
    const result = parseCeoControlBlock(content);

    expect(result.hasDraftArtifact).toBe(true);
    expect(result.draftText).toBe(draftText);
    expect(result.hasPromptArtifact).toBe(false);
    expect(result.isStopped).toBe(false);
    expect(result.isBlocked).toBe(false);
  });

  it('FINAL takes precedence over DRAFT when both present', () => {
    const content = `=== CLAUDE_CODE_PROMPT_START ===\nFinal prompt\n=== CLAUDE_CODE_PROMPT_END ===\n\n=== CEO_DRAFT_START ===\nDraft prompt\n=== CEO_DRAFT_END ===`;
    const result = parseCeoControlBlock(content);

    expect(result.hasPromptArtifact).toBe(true);
    expect(result.promptText).toBe('Final prompt');
    expect(result.hasDraftArtifact).toBe(false);
  });

  it('DRAFT takes precedence over BLOCKED', () => {
    const content = `=== CEO_DRAFT_START ===\nDraft text\n=== CEO_DRAFT_END ===\n\n=== CEO_BLOCKED_START ===\nQ1: Question?\n=== CEO_BLOCKED_END ===`;
    const result = parseCeoControlBlock(content);

    expect(result.hasDraftArtifact).toBe(true);
    expect(result.isBlocked).toBe(false);
  });

  it('returns empty draft for markers with no content', () => {
    const content = `=== CEO_DRAFT_START ===\n\n=== CEO_DRAFT_END ===`;
    const result = parseCeoControlBlock(content);

    expect(result.hasDraftArtifact).toBe(false);
    expect(result.draftText).toBeNull();
  });

  it('removes DRAFT markers from displayContent', () => {
    const content = `Before draft.\n\n=== CEO_DRAFT_START ===\nDraft text\n=== CEO_DRAFT_END ===\n\nAfter draft.`;
    const result = parseCeoControlBlock(content);

    expect(result.displayContent).not.toContain('CEO_DRAFT_START');
    expect(result.displayContent).not.toContain('CEO_DRAFT_END');
  });
});

describe('CEO STOP_NOW (Batch 5)', () => {
  it('detects STOP_NOW marker', () => {
    const content = `I cannot proceed with this task.\n\n=== STOP_NOW ===`;
    const result = parseCeoControlBlock(content);

    expect(result.isStopped).toBe(true);
    expect(result.hasPromptArtifact).toBe(false);
    expect(result.hasDraftArtifact).toBe(false);
    expect(result.isBlocked).toBe(false);
  });

  it('FINAL takes precedence over STOP_NOW', () => {
    const content = `=== CLAUDE_CODE_PROMPT_START ===\nPrompt\n=== CLAUDE_CODE_PROMPT_END ===\n\n=== STOP_NOW ===`;
    const result = parseCeoControlBlock(content);

    expect(result.hasPromptArtifact).toBe(true);
    expect(result.isStopped).toBe(false);
  });

  it('STOP_NOW takes precedence over DRAFT', () => {
    const content = `=== STOP_NOW ===\n\n=== CEO_DRAFT_START ===\nDraft\n=== CEO_DRAFT_END ===`;
    const result = parseCeoControlBlock(content);

    expect(result.isStopped).toBe(true);
    expect(result.hasDraftArtifact).toBe(false);
  });

  it('STOP_NOW takes precedence over BLOCKED', () => {
    const content = `=== STOP_NOW ===\n\n=== CEO_BLOCKED_START ===\nQ1: Question?\n=== CEO_BLOCKED_END ===`;
    const result = parseCeoControlBlock(content);

    expect(result.isStopped).toBe(true);
    expect(result.isBlocked).toBe(false);
  });

  it('removes STOP_NOW marker from displayContent', () => {
    const content = `Cannot proceed.\n\n=== STOP_NOW ===`;
    const result = parseCeoControlBlock(content);

    expect(result.displayContent).not.toContain('STOP_NOW');
    expect(result.displayContent).toBe('Cannot proceed.');
  });
});

describe('Existing parser behavior preserved (Batch 5)', () => {
  it('no markers returns all false with new fields', () => {
    const content = 'Regular response without markers.';
    const result = parseCeoControlBlock(content);

    expect(result.hasPromptArtifact).toBe(false);
    expect(result.hasDraftArtifact).toBe(false);
    expect(result.isStopped).toBe(false);
    expect(result.isBlocked).toBe(false);
  });

  it('existing FINAL extraction still works', () => {
    const content = `=== CLAUDE_CODE_PROMPT_START ===\nBuild feature X\n=== CLAUDE_CODE_PROMPT_END ===`;
    const result = parseCeoControlBlock(content);

    expect(result.hasPromptArtifact).toBe(true);
    expect(result.promptText).toBe('Build feature X');
    expect(result.hasDraftArtifact).toBe(false);
    expect(result.isStopped).toBe(false);
  });

  it('existing BLOCKED extraction still works', () => {
    const content = `=== CEO_BLOCKED_START ===\nQ1: What auth method?\n=== CEO_BLOCKED_END ===`;
    const result = parseCeoControlBlock(content);

    expect(result.isBlocked).toBe(true);
    expect(result.blockedQuestions).toHaveLength(1);
    expect(result.hasDraftArtifact).toBe(false);
    expect(result.isStopped).toBe(false);
  });
});
