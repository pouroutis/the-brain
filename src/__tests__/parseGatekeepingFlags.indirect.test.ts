// =============================================================================
// The Brain — Phase 2F Force-All Tests (Gatekeeping Disabled for MVP)
// Tests that ALL modes call ALL agents regardless of gatekeeping flags
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
// Phase 2F: Force-All Tests — Gatekeeping Flags Ignored
// -----------------------------------------------------------------------------

describe('Phase 2F Force-All — Gatekeeping Flags Ignored', () => {
  it('calls all 3 agents when flags say CALL_CLAUDE=true CALL_GEMINI=true', async () => {
    // CEO=GPT speaks last, order: gemini, claude, gpt
    const gptContent = `
Here is my analysis of your question.

---
CALL_CLAUDE=true
CALL_GEMINI=true
REASON_TAG=comprehensive
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createGPTResponse(gptContent));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gemini', 'claude', 'gpt']);
  });

  it('calls all 3 agents when flags say CALL_CLAUDE=false CALL_GEMINI=true (flags ignored)', async () => {
    // CEO=GPT speaks last, order: gemini, claude, gpt
    const gptContent = `
Simple factual question.

---
CALL_CLAUDE=false
CALL_GEMINI=true
REASON_TAG=factual
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createGPTResponse(gptContent));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    // Phase 2F: All agents called despite CALL_CLAUDE=false
    expect(calledAgents).toEqual(['gemini', 'claude', 'gpt']);
  });

  it('calls all 3 agents when flags say CALL_CLAUDE=true CALL_GEMINI=false (flags ignored)', async () => {
    // CEO=GPT speaks last, order: gemini, claude, gpt
    const gptContent = `
Code analysis needed.

---
CALL_CLAUDE=true
CALL_GEMINI=false
REASON_TAG=code_review
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createGPTResponse(gptContent));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    // Phase 2F: All agents called despite CALL_GEMINI=false
    expect(calledAgents).toEqual(['gemini', 'claude', 'gpt']);
  });

  it('calls all 3 agents when flags say both false (flags ignored)', async () => {
    // CEO=GPT speaks last, order: gemini, claude, gpt
    const gptContent = `
Hi there! Just a greeting.

---
CALL_CLAUDE=false
CALL_GEMINI=false
REASON_TAG=greeting
---
`;
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createGPTResponse(gptContent));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    // Phase 2F: All agents called despite both flags=false
    expect(calledAgents).toEqual(['gemini', 'claude', 'gpt']);
  });

  it('calls all 3 agents with no flags at all', async () => {
    // CEO=GPT speaks last, order: gemini, claude, gpt
    const gptContent = `
Just a regular response with no flags at all.
No dashes, no structure.
`;
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createGPTResponse(gptContent));

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gemini', 'claude', 'gpt']);
  });

  it('calls all 3 agents when GPT errors', async () => {
    // CEO=GPT speaks last, order: gemini, claude, gpt
    const gptError: AgentResponse = {
      agent: 'gpt',
      timestamp: Date.now(),
      status: 'error',
      errorCode: 'api',
      errorMessage: 'GPT API error',
    };

    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(gptError);

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gemini', 'claude', 'gpt']);
  });

  it('calls all 3 agents when GPT times out', async () => {
    // CEO=GPT speaks last, order: gemini, claude, gpt
    const gptTimeout: AgentResponse = {
      agent: 'gpt',
      timestamp: Date.now(),
      status: 'timeout',
    };

    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(gptTimeout);

    const { result } = renderHook(() => useBrain(), { wrapper });
    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gemini', 'claude', 'gpt']);
  });
});

// -----------------------------------------------------------------------------
// Mode-Specific Force-All Tests
// -----------------------------------------------------------------------------

describe('Phase 2F Force-All — All Modes', () => {
  it('Discussion mode calls all 3 agents', async () => {
    // CEO=GPT speaks last, order: gemini, claude, gpt
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createGPTResponse('GPT response'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Default mode is discussion
    expect(result.current.getMode()).toBe('discussion');

    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gemini', 'claude', 'gpt']);
  });

  it('Decision mode calls all 3 agents', async () => {
    // CEO=GPT speaks last, order: gemini, claude, gpt
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createGPTResponse('GPT response'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.setMode('decision');
    });

    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gemini', 'claude', 'gpt']);
  });

  it('Project mode calls all 3 agents', async () => {
    // CEO=GPT speaks last, order: gemini, claude, gpt
    mockCallAgent
      .mockResolvedValueOnce(createAgentResponse('gemini'))
      .mockResolvedValueOnce(createAgentResponse('claude'))
      .mockResolvedValueOnce(createGPTResponse('GPT response'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.setMode('project');
    });

    const calledAgents = await runSequenceAndGetCalledAgents(result);

    expect(calledAgents).toEqual(['gemini', 'claude', 'gpt']);
  });
});
