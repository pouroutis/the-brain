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
