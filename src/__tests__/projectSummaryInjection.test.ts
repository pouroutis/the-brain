// =============================================================================
// The Brain — Project Summary Injection Tests (Decision Mode Only)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { BrainProvider, useBrain } from '../context/BrainContext';
import { buildProjectSummaryBlock, PROJECT_SUMMARY_TEXT } from '../utils/contextBuilder';
import type { AgentResponse } from '../types/brain';

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
// buildProjectSummaryBlock Unit Tests
// -----------------------------------------------------------------------------

describe('buildProjectSummaryBlock', () => {
  it('returns block with correct header', () => {
    const block = buildProjectSummaryBlock();
    expect(block).toContain('=== PROJECT SUMMARY (READ-ONLY) ===');
  });

  it('returns block with instruction line', () => {
    const block = buildProjectSummaryBlock();
    expect(block).toContain('If info is missing, say UNKNOWN. Do not guess.');
  });

  it('returns block with project summary content', () => {
    const block = buildProjectSummaryBlock();
    expect(block).toContain('## FACTS (What Exists Now)');
    expect(block).toContain('## LOCKED / FORBIDDEN (Hard Rules)');
    expect(block).toContain('## OUT OF SCOPE (Not Building Now)');
  });

  it('returns block with end marker', () => {
    const block = buildProjectSummaryBlock();
    expect(block).toContain('=== END PROJECT SUMMARY ===');
  });

  it('returns block with USER PROMPT separator', () => {
    const block = buildProjectSummaryBlock();
    expect(block).toContain('--- USER PROMPT ---');
  });
});

// -----------------------------------------------------------------------------
// PROJECT_SUMMARY_TEXT Content Tests
// -----------------------------------------------------------------------------

describe('PROJECT_SUMMARY_TEXT', () => {
  it('has FACTS section', () => {
    expect(PROJECT_SUMMARY_TEXT).toContain('## FACTS (What Exists Now)');
  });

  it('has LOCKED / FORBIDDEN section', () => {
    expect(PROJECT_SUMMARY_TEXT).toContain('## LOCKED / FORBIDDEN (Hard Rules)');
  });

  it('has OUT OF SCOPE section', () => {
    expect(PROJECT_SUMMARY_TEXT).toContain('## OUT OF SCOPE (Not Building Now)');
  });

  it('is under 500 words', () => {
    const wordCount = PROJECT_SUMMARY_TEXT.split(/\s+/).filter(w => w.length > 0).length;
    expect(wordCount).toBeLessThanOrEqual(500);
  });

  it('uses bullets (dash format)', () => {
    // Check that content uses bullet format (lines starting with -)
    const lines = PROJECT_SUMMARY_TEXT.split('\n');
    const bulletLines = lines.filter(line => line.trim().startsWith('-'));
    expect(bulletLines.length).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------------
// Decision Mode: Project Summary Injection Tests
// -----------------------------------------------------------------------------

describe('Decision Mode — Project Summary Injection', () => {
  it('AI request includes PROJECT SUMMARY header in Decision mode', async () => {
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gpt'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set to Decision mode
    act(() => {
      result.current.setMode('decision');
    });

    // Submit a prompt
    act(() => {
      result.current.submitPrompt('Test decision prompt');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Verify callAgent was called with prompt containing PROJECT SUMMARY
    expect(mockCallAgent).toHaveBeenCalled();

    // First call should be gemini with injected summary
    const firstCallArgs = mockCallAgent.mock.calls[0];
    const promptArg = firstCallArgs[1]; // userPrompt is second argument

    expect(promptArg).toContain('=== PROJECT SUMMARY (READ-ONLY) ===');
    expect(promptArg).toContain('If info is missing, say UNKNOWN. Do not guess.');
    expect(promptArg).toContain('Test decision prompt');
  });

  it('all three agents receive the PROJECT SUMMARY in Decision mode', async () => {
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gpt'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.submitPrompt('Multi-agent test');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // All three calls should have PROJECT SUMMARY in the prompt
    expect(mockCallAgent).toHaveBeenCalledTimes(3);

    for (let i = 0; i < 3; i++) {
      const callArgs = mockCallAgent.mock.calls[i];
      const promptArg = callArgs[1];
      expect(promptArg).toContain('=== PROJECT SUMMARY (READ-ONLY) ===');
    }
  });
});

// -----------------------------------------------------------------------------
// Discussion Mode: No Project Summary Tests
// -----------------------------------------------------------------------------

describe('Discussion Mode — No Project Summary Injection', () => {
  it('AI request does NOT include PROJECT SUMMARY in Discussion mode', async () => {
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gpt'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Default mode is discussion, but set explicitly to be clear
    act(() => {
      result.current.setMode('discussion');
    });

    // Submit a prompt
    act(() => {
      result.current.submitPrompt('Test discussion prompt');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Verify callAgent was called
    expect(mockCallAgent).toHaveBeenCalled();

    // First call should NOT contain PROJECT SUMMARY
    const firstCallArgs = mockCallAgent.mock.calls[0];
    const promptArg = firstCallArgs[1];

    expect(promptArg).not.toContain('=== PROJECT SUMMARY (READ-ONLY) ===');
    expect(promptArg).toContain('Test discussion prompt');
  });

  it('none of the agents receive PROJECT SUMMARY in Discussion mode', async () => {
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gpt'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.setMode('discussion');
    });

    act(() => {
      result.current.submitPrompt('Discussion test');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // All three calls should NOT have PROJECT SUMMARY
    expect(mockCallAgent).toHaveBeenCalledTimes(3);

    for (let i = 0; i < 3; i++) {
      const callArgs = mockCallAgent.mock.calls[i];
      const promptArg = callArgs[1];
      expect(promptArg).not.toContain('=== PROJECT SUMMARY (READ-ONLY) ===');
    }
  });
});

// -----------------------------------------------------------------------------
// Mode Switching: Summary Injection Changes
// -----------------------------------------------------------------------------

describe('Mode-dependent Summary Injection', () => {
  it('switches from no injection (Discussion) to injection (Decision)', async () => {
    // First sequence: Discussion mode (no injection)
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gpt'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.setMode('discussion');
    });

    act(() => {
      result.current.submitPrompt('Discussion prompt');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Verify no PROJECT SUMMARY in Discussion mode
    const discussionPrompt = mockCallAgent.mock.calls[0][1];
    expect(discussionPrompt).not.toContain('=== PROJECT SUMMARY (READ-ONLY) ===');

    // Clear mocks for second sequence
    mockCallAgent.mockClear();
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gpt'));

    // Switch to Decision mode
    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.submitPrompt('Decision prompt');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Verify PROJECT SUMMARY in Decision mode
    const decisionPrompt = mockCallAgent.mock.calls[0][1];
    expect(decisionPrompt).toContain('=== PROJECT SUMMARY (READ-ONLY) ===');
  });
});
