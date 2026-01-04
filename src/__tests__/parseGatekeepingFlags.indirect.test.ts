// =============================================================================
// The Brain — parseGatekeepingFlags Indirect Tests (Phase 3B)
// Tests gatekeeping logic through orchestrator behavior observation
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { BrainProvider, useBrain } from '../context/BrainContext';
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

import { callAgent } from '../api/agentClient';

const mockCallAgent = vi.mocked(callAgent);

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(BrainProvider, null, children);
}

function createGPTResponse(content: string): AgentResponse {
  return {
    agent: 'gpt',
    timestamp: Date.now(),
    status: 'success',
    content,
  };
}

function createAgentResponse(agent: 'claude' | 'gemini'): AgentResponse {
  return {
    agent,
    timestamp: Date.now(),
    status: 'success',
    content: `Response from ${agent}`,
  };
}

// Helper to run a sequence and return which agents were called
async function runSequenceAndGetCalledAgents(
  result: { current: ReturnType<typeof useBrain> }
): Promise<string[]> {
  act(() => {
    result.current.submitPrompt('Test');
  });

  await waitFor(() => {
    expect(result.current.isProcessing()).toBe(false);
  });

  return mockCallAgent.mock.calls.map((call) => call[0] as string);
}

// -----------------------------------------------------------------------------
// Setup / Teardown (Real Timers)
// -----------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Valid Flag Parsing Tests
// -----------------------------------------------------------------------------

describe('parseGatekeepingFlags (indirect) — Valid Flags', () => {
  it('parses CALL_CLAUDE=true CALL_GEMINI=true → calls both', async () => {
    const gptContent = `
Here is my analysis of your question.

---
CALL_CLAUDE=true
CALL_GEMINI=true
REASON_TAG=comprehensive
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gemini'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt', 'claude', 'gemini']);
  });

  it('parses CALL_CLAUDE=false CALL_GEMINI=true → skips Claude', async () => {
    const gptContent = `
Simple factual question.

---
CALL_CLAUDE=false
CALL_GEMINI=true
REASON_TAG=factual
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('gemini'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt', 'gemini']);
  });

  it('parses CALL_CLAUDE=true CALL_GEMINI=false → skips Gemini', async () => {
    const gptContent = `
Code analysis needed.

---
CALL_CLAUDE=true
CALL_GEMINI=false
REASON_TAG=code_review
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('claude'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt', 'claude']);
  });

  it('parses CALL_CLAUDE=false CALL_GEMINI=false → GPT only', async () => {
    const gptContent = `
Hi there! Just a greeting.

---
CALL_CLAUDE=false
CALL_GEMINI=false
REASON_TAG=greeting
---
`;
    mockCallAgent.mockResolvedValueOnce(createGPTResponse(gptContent));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt']);
  });

  it('handles case-insensitive flag values (TRUE/FALSE)', async () => {
    const gptContent = `
Mixed case test.

---
CALL_CLAUDE=TRUE
CALL_GEMINI=FALSE
REASON_TAG=case_test
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('claude'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt', 'claude']);
  });

  it('handles whitespace around equals sign', async () => {
    const gptContent = `
Whitespace tolerance test.

---
CALL_CLAUDE = true
CALL_GEMINI = false
REASON_TAG = whitespace_test
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('claude'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt', 'claude']);
  });

  it('handles flags without REASON_TAG (defaults to "default")', async () => {
    const gptContent = `
No reason tag.

---
CALL_CLAUDE=true
CALL_GEMINI=true
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gemini'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt', 'claude', 'gemini']);
  });
});

// -----------------------------------------------------------------------------
// Invalid / Missing Flags — Fallback Behavior
// -----------------------------------------------------------------------------

describe('parseGatekeepingFlags (indirect) — Fallback Behavior', () => {
  it('missing CALL_CLAUDE flag → fallback calls all agents', async () => {
    const gptContent = `
Missing Claude flag.

---
CALL_GEMINI=false
REASON_TAG=incomplete
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gemini'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    // Fallback: call all agents
    expect(calledAgents).toEqual(['gpt', 'claude', 'gemini']);
  });

  it('missing CALL_GEMINI flag → fallback calls all agents', async () => {
    const gptContent = `
Missing Gemini flag.

---
CALL_CLAUDE=true
REASON_TAG=incomplete
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gemini'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    // Fallback: call all agents
    expect(calledAgents).toEqual(['gpt', 'claude', 'gemini']);
  });

  it('no flags block at all → fallback calls all agents', async () => {
    const gptContent = `
Just a regular response with no flags at all.
No dashes, no structure.
`;
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gemini'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt', 'claude', 'gemini']);
  });

  it('malformed flag values → fallback calls all agents', async () => {
    const gptContent = `
Bad values.

---
CALL_CLAUDE=yes
CALL_GEMINI=no
REASON_TAG=malformed
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gemini'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    // "yes" and "no" don't match true/false → fallback
    expect(calledAgents).toEqual(['gpt', 'claude', 'gemini']);
  });

  it('empty GPT response → fallback calls all agents', async () => {
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(''))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gemini'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt', 'claude', 'gemini']);
  });

  it('GPT error status → fallback calls all agents', async () => {
    const gptError: AgentResponse = {
      agent: 'gpt',
      timestamp: Date.now(),
      status: 'error',
      errorCode: 'api',
      errorMessage: 'GPT API error',
    };

    mockCallAgent
      .mockResolvedValueOnce(gptError)
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gemini'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt', 'claude', 'gemini']);
  });

  it('GPT timeout status → fallback calls all agents', async () => {
    const gptTimeout: AgentResponse = {
      agent: 'gpt',
      timestamp: Date.now(),
      status: 'timeout',
    };

    mockCallAgent
      .mockResolvedValueOnce(gptTimeout)
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createAgentResponse('gemini'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt', 'claude', 'gemini']);
  });
});

// -----------------------------------------------------------------------------
// Edge Cases
// -----------------------------------------------------------------------------

describe('parseGatekeepingFlags (indirect) — Edge Cases', () => {
  it('flags embedded in prose are still parsed', async () => {
    const gptContent = `
Here is my detailed response to your query about machine learning.

I believe we need additional perspectives, so:
CALL_CLAUDE=true
CALL_GEMINI=false
REASON_TAG=ml_analysis

Let me know if you have questions.
`;
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('claude'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt', 'claude']);
  });

  it('handles multiple dashes blocks (uses regex matching)', async () => {
    const gptContent = `
Some text
---
Other stuff
---
CALL_CLAUDE=false
CALL_GEMINI=true
REASON_TAG=multi_block
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('gemini'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gpt', 'gemini']);
  });

  it('flags with extra text on same line are parsed', async () => {
    const gptContent = `
Response.

---
CALL_CLAUDE=true (Claude should handle this)
CALL_GEMINI=false (skip Gemini)
REASON_TAG=inline_comments
---
`;
    // This should still work because regex matches CALL_CLAUDE=true
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponse(gptContent))
      .mockResolvedValueOnce(createAgentResponse('claude'));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    // Regex should match 'true' even with trailing text
    expect(calledAgents).toEqual(['gpt', 'claude']);
  });
});
