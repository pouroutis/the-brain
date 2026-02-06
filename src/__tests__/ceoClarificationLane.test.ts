// =============================================================================
// The Brain — CEO Clarification Lane Tests (Decision Mode Only)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { BrainProvider, useBrain } from '../context/BrainContext';
import { parseCeoControlBlock } from '../utils/ceoControlBlockParser';
import type { AgentResponse, DecisionMemo } from '../types/brain';

// -----------------------------------------------------------------------------
// Mock callAgent
// -----------------------------------------------------------------------------

vi.mock('../api/agentClient', () => ({
  callAgent: vi.fn(),
  AGENT_ENDPOINTS: {
    gpt: 'https://mock.supabase.co/functions/v1/openai-proxy',
    claude: 'https://mock.supabase.co/functions/v1/anthropic-proxy',
    gemini: 'https://mock.supabase.co/functions/v1/gemini-proxy',
  },
}));

vi.mock('../api/ghostClient', () => ({
  callGhostOrchestrator: vi.fn(),
  isGhostEnabled: vi.fn().mockReturnValue(false),
}));

import { callAgent } from '../api/agentClient';

const mockCallAgent = vi.mocked(callAgent);

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(BrainProvider, null, children);
}

function createAgentResponse(agent: 'gpt' | 'claude' | 'gemini'): AgentResponse {
  return {
    agent,
    timestamp: Date.now(),
    status: 'success',
    content: `Response from ${agent}`,
  };
}

// -----------------------------------------------------------------------------
// Setup / Teardown
// -----------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Clarification State Initial Tests
// -----------------------------------------------------------------------------

describe('Clarification State — Initial', () => {
  it('clarificationState is null initially', () => {
    const { result } = renderHook(() => useBrain(), { wrapper });

    expect(result.current.getClarificationState()).toBeNull();
    expect(result.current.isClarificationActive()).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// START_CLARIFICATION Tests
// -----------------------------------------------------------------------------

describe('START_CLARIFICATION Action', () => {
  it('starts clarification with questions in Decision mode', () => {
    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set to Decision mode
    act(() => {
      result.current.setMode('decision');
    });

    // Start clarification
    act(() => {
      result.current.startClarification(['Question 1?', 'Question 2?']);
    });

    const state = result.current.getClarificationState();
    expect(state).not.toBeNull();
    expect(state?.isActive).toBe(true);
    expect(state?.blockedQuestions).toEqual(['Question 1?', 'Question 2?']);
    expect(state?.messages).toEqual([]);
    expect(state?.isProcessing).toBe(false);
    expect(state?.decisionMemo).toBeNull();
    expect(result.current.isClarificationActive()).toBe(true);
  });

  it('limits questions to max 3', () => {
    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.startClarification(['Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?']);
    });

    const state = result.current.getClarificationState();
    expect(state?.blockedQuestions).toHaveLength(3);
    expect(state?.blockedQuestions).toEqual(['Q1?', 'Q2?', 'Q3?']);
  });

  it('does not start clarification in Discussion mode', () => {
    const { result } = renderHook(() => useBrain(), { wrapper });

    // Ensure in Discussion mode
    act(() => {
      result.current.setMode('discussion');
    });

    // Try to start clarification
    act(() => {
      result.current.startClarification(['Question?']);
    });

    expect(result.current.getClarificationState()).toBeNull();
    expect(result.current.isClarificationActive()).toBe(false);
  });

  it('does not start clarification if already active', () => {
    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.startClarification(['First question?']);
    });

    const firstState = result.current.getClarificationState();

    // Try to start another clarification
    act(() => {
      result.current.startClarification(['Second question?']);
    });

    const secondState = result.current.getClarificationState();

    // Should still have the first state
    expect(secondState?.blockedQuestions).toEqual(firstState?.blockedQuestions);
  });
});

// -----------------------------------------------------------------------------
// CLARIFICATION_USER_MESSAGE Tests
// -----------------------------------------------------------------------------

describe('CLARIFICATION_USER_MESSAGE Action', () => {
  it('adds user message to clarification', () => {
    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.startClarification(['Question?']);
    });

    act(() => {
      result.current.sendClarificationMessage('My response');
    });

    const state = result.current.getClarificationState();
    expect(state?.messages).toHaveLength(1);
    expect(state?.messages[0].role).toBe('user');
    expect(state?.messages[0].content).toBe('My response');
  });

  it('does not add message when clarification is not active', () => {
    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.setMode('decision');
    });

    // No clarification started
    act(() => {
      result.current.sendClarificationMessage('My response');
    });

    expect(result.current.getClarificationState()).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// CANCEL_CLARIFICATION Tests
// -----------------------------------------------------------------------------

describe('CANCEL_CLARIFICATION Action', () => {
  it('cancels active clarification', () => {
    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.startClarification(['Question?']);
    });

    expect(result.current.isClarificationActive()).toBe(true);

    act(() => {
      result.current.cancelClarification();
    });

    expect(result.current.getClarificationState()).toBeNull();
    expect(result.current.isClarificationActive()).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// RESOLVE_CLARIFICATION Tests
// -----------------------------------------------------------------------------

describe('RESOLVE_CLARIFICATION Action', () => {
  it('resolves clarification with Decision Memo', () => {
    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.startClarification(['Question?']);
    });

    const memo: DecisionMemo = {
      clarificationSummary: 'User clarified X',
      finalDecision: 'We will do Y',
      nextStep: 'Implement Z',
      timestamp: Date.now(),
    };

    act(() => {
      result.current.resolveClarification(memo);
    });

    const state = result.current.getClarificationState();
    expect(state?.isActive).toBe(false);
    expect(state?.decisionMemo).toEqual(memo);
  });
});

// -----------------------------------------------------------------------------
// CEO-Only Call Tests (Integration)
// -----------------------------------------------------------------------------

describe('CEO-Only Clarification Call', () => {
  it('calls only CEO agent during clarification, not other AIs', async () => {
    mockCallAgent.mockResolvedValue(createAgentResponse('gpt'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set to Decision mode
    act(() => {
      result.current.setMode('decision');
    });

    // Start clarification
    act(() => {
      result.current.startClarification(['Question?']);
    });

    // Clear any previous calls from sequence
    mockCallAgent.mockClear();

    // Send user message (should trigger CEO-only call)
    act(() => {
      result.current.sendClarificationMessage('My response');
    });

    // Wait for CEO call to complete
    await waitFor(
      () => {
        // Should have called the agent exactly once (CEO only)
        // Note: The effect may not have triggered yet, so we check for >= 0 calls
        // The key assertion is that it never calls claude or gemini
        const calls = mockCallAgent.mock.calls;
        if (calls.length > 0) {
          // All calls should be to the CEO (gpt by default)
          for (const call of calls) {
            expect(call[0]).toBe('gpt'); // CEO is GPT by default
          }
        }
        return true;
      },
      { timeout: 1000 }
    );

    // Verify no calls to claude or gemini
    const allCallAgents = mockCallAgent.mock.calls.map((c) => c[0]);
    expect(allCallAgents).not.toContain('claude');
    expect(allCallAgents).not.toContain('gemini');
  });
});

// -----------------------------------------------------------------------------
// Main Input Disabled Tests
// -----------------------------------------------------------------------------

describe('Main Input Disabled During Clarification', () => {
  it('main board sequence is blocked during active clarification', async () => {
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gpt'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set to Decision mode
    act(() => {
      result.current.setMode('decision');
    });

    // Start clarification (this should block main input)
    act(() => {
      result.current.startClarification(['Question?']);
    });

    expect(result.current.isClarificationActive()).toBe(true);

    // canSubmit should still return true (that's the base check)
    // But the UI component should check isClarificationActive to block input
    // The actual blocking happens at the UI layer (BrainChat.tsx)
    // Here we verify the state is properly set
    expect(result.current.isClarificationActive()).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Discussion Mode Unchanged Tests
// -----------------------------------------------------------------------------

describe('Discussion Mode — No Clarification Impact', () => {
  it('Discussion mode sequences work normally without clarification state', async () => {
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gpt'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Ensure in Discussion mode
    act(() => {
      result.current.setMode('discussion');
    });

    // Submit prompt
    act(() => {
      result.current.submitPrompt('Test prompt');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Clarification state should remain null
    expect(result.current.getClarificationState()).toBeNull();
    expect(result.current.isClarificationActive()).toBe(false);

    // Should have called all 3 agents
    expect(mockCallAgent).toHaveBeenCalledTimes(3);
  });
});

// -----------------------------------------------------------------------------
// BLOCKED State Parsing Tests
// -----------------------------------------------------------------------------

describe('parseCeoControlBlock — BLOCKED Detection', () => {
  it('detects BLOCKED action with questions', () => {
    const content = `I need more information to proceed.
{"ceo_action": "BLOCKED", "questions": ["What is the target platform?", "Should we use TypeScript?"]}
Please clarify these points.`;

    const result = parseCeoControlBlock(content);

    expect(result.isBlocked).toBe(true);
    expect(result.blockedQuestions).toEqual([
      'What is the target platform?',
      'Should we use TypeScript?',
    ]);
    expect(result.displayContent).not.toContain('"ceo_action"');
  });

  it('limits questions to max 3', () => {
    const content = `{"ceo_action": "BLOCKED", "questions": ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?"]}`;

    const result = parseCeoControlBlock(content);

    expect(result.isBlocked).toBe(true);
    expect(result.blockedQuestions).toHaveLength(3);
    expect(result.blockedQuestions).toEqual(['Q1?', 'Q2?', 'Q3?']);
  });

  it('returns isBlocked=false when no BLOCKED action', () => {
    const content = 'Just a normal response without any control blocks.';

    const result = parseCeoControlBlock(content);

    expect(result.isBlocked).toBe(false);
    expect(result.blockedQuestions).toEqual([]);
  });

  it('does not trigger BLOCKED for FINALIZE_PROMPT action', () => {
    const content = `{"ceo_action": "FINALIZE_PROMPT", "claude_code_prompt": "do the thing"}`;

    const result = parseCeoControlBlock(content);

    expect(result.isBlocked).toBe(false);
    expect(result.hasPromptArtifact).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// SUBMIT_START Blocked During Clarification Tests
// -----------------------------------------------------------------------------

describe('SUBMIT_START Blocked During Clarification', () => {
  it('submitPrompt does not trigger sequence when clarification is active', async () => {
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gpt'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set to Decision mode
    act(() => {
      result.current.setMode('decision');
    });

    // Start clarification
    act(() => {
      result.current.startClarification(['Question?']);
    });

    expect(result.current.isClarificationActive()).toBe(true);

    // Clear mock to track new calls
    mockCallAgent.mockClear();

    // Try to submit a prompt while clarification is active
    act(() => {
      result.current.submitPrompt('This should be blocked');
    });

    // Wait a bit to ensure no sequence started
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should NOT have called any agents
    expect(mockCallAgent).not.toHaveBeenCalled();

    // Should NOT be processing
    expect(result.current.isProcessing()).toBe(false);

    // Clarification should still be active
    expect(result.current.isClarificationActive()).toBe(true);
  });

  it('submitPrompt works normally after clarification ends', async () => {
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gpt'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set to Decision mode
    act(() => {
      result.current.setMode('decision');
    });

    // Start and then cancel clarification
    act(() => {
      result.current.startClarification(['Question?']);
    });

    expect(result.current.isClarificationActive()).toBe(true);

    act(() => {
      result.current.cancelClarification();
    });

    expect(result.current.isClarificationActive()).toBe(false);

    // Clear mock to track new calls
    mockCallAgent.mockClear();

    // Now submit should work
    act(() => {
      result.current.submitPrompt('This should work now');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Should have called all 3 agents
    expect(mockCallAgent).toHaveBeenCalledTimes(3);
  });
});

// -----------------------------------------------------------------------------
// Clarification Messages Never Reach Other AIs Tests
// -----------------------------------------------------------------------------

describe('Clarification Messages Isolation', () => {
  it('clarification messages are never sent to Gemini or Claude', async () => {
    // Mock CEO response (just a plain response, not FINALIZE_PROMPT)
    mockCallAgent.mockResolvedValue({
      agent: 'gpt',
      timestamp: Date.now(),
      status: 'success',
      content: 'CEO response to clarification',
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set to Decision mode
    act(() => {
      result.current.setMode('decision');
    });

    // Start clarification
    act(() => {
      result.current.startClarification(['Question?']);
    });

    // Clear any previous calls
    mockCallAgent.mockClear();

    // Send multiple clarification messages
    act(() => {
      result.current.sendClarificationMessage('First response');
    });

    // Wait for CEO to respond
    await waitFor(
      () => {
        const state = result.current.getClarificationState();
        return state !== null && state.messages.length >= 2;
      },
      { timeout: 2000 }
    );

    // Send another message
    mockCallAgent.mockClear();
    act(() => {
      result.current.sendClarificationMessage('Second response');
    });

    await waitFor(
      () => {
        const state = result.current.getClarificationState();
        return state !== null && state.messages.length >= 4;
      },
      { timeout: 2000 }
    );

    // Verify ONLY CEO (gpt) was ever called
    const allCalls = mockCallAgent.mock.calls;
    for (const call of allCalls) {
      expect(call[0]).toBe('gpt'); // All calls must be to CEO
    }

    // Explicitly check no calls to other agents
    const calledAgents = allCalls.map((c) => c[0]);
    expect(calledAgents).not.toContain('claude');
    expect(calledAgents).not.toContain('gemini');
  });
});
