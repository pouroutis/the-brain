// =============================================================================
// The Brain — Orchestrator Integration Tests (Phase 3B)
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { BrainProvider, useBrain } from '../context/BrainContext';
import { getLatestRound } from '../reducer/brainReducer';
import type { AgentResponse, Agent } from '../types/brain';

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

function createMockResponse(
  agent: Agent,
  content: string,
  status: 'success' | 'error' | 'timeout' | 'cancelled' = 'success'
): AgentResponse {
  if (status === 'success') {
    return {
      agent,
      timestamp: Date.now(),
      status: 'success',
      content,
    };
  }
  if (status === 'error') {
    return {
      agent,
      timestamp: Date.now(),
      status: 'error',
      errorCode: 'api',
      errorMessage: 'Mock error',
    };
  }
  return {
    agent,
    timestamp: Date.now(),
    status,
  };
}

function createGPTResponseWithFlags(
  callClaude: boolean,
  callGemini: boolean,
  reasonTag: string = 'test'
): AgentResponse {
  const content = `Here is my response.
---
CALL_CLAUDE=${callClaude}
CALL_GEMINI=${callGemini}
REASON_TAG=${reasonTag}
---`;

  return {
    agent: 'gpt',
    timestamp: Date.now(),
    status: 'success',
    content,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(BrainProvider, null, children);
}

// -----------------------------------------------------------------------------
// Mock localStorage (prevents state leakage between tests)
// -----------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// -----------------------------------------------------------------------------
// Setup / Teardown (Real Timers by Default)
// -----------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear(); // Clear localStorage between tests
});

// -----------------------------------------------------------------------------
// Happy Path Tests (Real Timers)
// -----------------------------------------------------------------------------

describe('Orchestrator — Happy Path', () => {
  it('calls Gemini → Claude → GPT in sequence (anchor=GPT speaks last), terminates round 2', async () => {
    const geminiResponse = createMockResponse('gemini', 'Gemini response');
    const claudeResponse = createMockResponse('claude', 'Claude response');
    const gptResponse = createGPTResponseWithFlags(true, true, 'comprehensive');
    const nfiResponse = createMockResponse('gpt', '[NO_FURTHER_INPUT]');

    // Round 1: content responses; Round 2+: NFI → terminates
    mockCallAgent
      .mockResolvedValueOnce(geminiResponse)
      .mockResolvedValueOnce(claudeResponse)
      .mockResolvedValueOnce(gptResponse)
      .mockResolvedValue(nfiResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Submit prompt
    act(() => {
      result.current.submitPrompt('Test question');
    });

    // Wait for sequence to complete
    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // V3-B: 3 calls (round 1 content) + 3 calls (round 2 NFI termination) = 6
    expect(mockCallAgent).toHaveBeenCalledTimes(6);
    // Round 1 agent order: gemini, claude, gpt
    expect(mockCallAgent).toHaveBeenNthCalledWith(
      1,
      'gemini',
      'Test question',
      '',
      expect.any(AbortController),
      expect.objectContaining({ runId: expect.any(String), callIndex: 1, exchanges: expect.any(Array) })
    );
    expect(mockCallAgent).toHaveBeenNthCalledWith(
      2,
      'claude',
      'Test question',
      expect.stringContaining('Gemini:'),
      expect.any(AbortController),
      expect.objectContaining({ runId: expect.any(String), callIndex: 2, exchanges: expect.any(Array) })
    );
    expect(mockCallAgent).toHaveBeenNthCalledWith(
      3,
      'gpt',
      'Test question',
      expect.stringContaining('Claude:'),
      expect.any(AbortController),
      expect.objectContaining({ runId: expect.any(String), callIndex: 3, exchanges: expect.any(Array) })
    );

    // Verify exchange was finalized with 1 round (termination round discarded)
    expect(result.current.getExchanges()).toHaveLength(1);
    const exchange = result.current.getExchanges()[0];
    expect(exchange.rounds).toHaveLength(1);
    expect(getLatestRound(exchange).responsesByAgent.gpt).toBeDefined();
    expect(getLatestRound(exchange).responsesByAgent.claude).toBeDefined();
    expect(getLatestRound(exchange).responsesByAgent.gemini).toBeDefined();
  });

  it('finalizes exchange with all responses on success', async () => {
    // anchor=GPT speaks last: gemini, claude, gpt
    // Round 1: content, Round 2: NFI → terminate
    const nfiResponse = createMockResponse('gpt', '[NO_FURTHER_INPUT]');
    mockCallAgent
      .mockResolvedValueOnce(createMockResponse('gemini', 'Gemini says'))
      .mockResolvedValueOnce(createMockResponse('claude', 'Claude says'))
      .mockResolvedValueOnce(createGPTResponseWithFlags(true, true))
      .mockResolvedValue(nfiResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.submitPrompt('Hello');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    const exchange = result.current.getExchanges()[0];
    expect(exchange.userPrompt).toBe('Hello');
    expect(exchange.rounds).toHaveLength(1);
    expect(getLatestRound(exchange).responsesByAgent.gpt?.status).toBe('success');
    expect(getLatestRound(exchange).responsesByAgent.claude?.status).toBe('success');
    expect(getLatestRound(exchange).responsesByAgent.gemini?.status).toBe('success');
  });
});


// -----------------------------------------------------------------------------
// Cancellation Tests (Real Timers)
// -----------------------------------------------------------------------------

describe('Orchestrator — Cancellation', () => {
  it('cancellation mid-sequence prevents subsequent agent calls', async () => {
    // anchor=GPT speaks last: claude, gemini, gpt
    // First agent called is now Claude
    let claudeResolve: (value: AgentResponse) => void;
    const claudePromise = new Promise<AgentResponse>((resolve) => {
      claudeResolve = resolve;
    });

    mockCallAgent.mockImplementation((agent) => {
      if (agent === 'claude') {
        return claudePromise;
      }
      return Promise.resolve(createMockResponse(agent, `${agent} response`));
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Start sequence
    act(() => {
      result.current.submitPrompt('Will be cancelled');
    });

    // Verify processing started
    expect(result.current.isProcessing()).toBe(true);

    // Cancel before Claude completes
    act(() => {
      result.current.cancelSequence();
    });

    // Verify userCancelled is set
    expect(result.current.getState().userCancelled).toBe(true);

    // Now resolve Claude (after cancellation requested)
    await act(async () => {
      claudeResolve!(createMockResponse('claude', 'Claude response'));
    });

    // Wait for cancellation to complete
    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Verify cancellation completed and state reset
    expect(result.current.getState().userCancelled).toBe(false);

    // Exchange should be finalized (possibly with partial responses)
    expect(result.current.getExchanges()).toHaveLength(1);

    // Only Claude was called; Gemini and GPT skipped due to cancellation
    expect(mockCallAgent).toHaveBeenCalledTimes(1);
  });

  it('cancelSequence is no-op when no active sequence', () => {
    const { result } = renderHook(() => useBrain(), { wrapper });

    // No sequence running
    expect(result.current.isProcessing()).toBe(false);

    // Should not throw
    act(() => {
      result.current.cancelSequence();
    });

    expect(result.current.isProcessing()).toBe(false);
    expect(result.current.getExchanges()).toHaveLength(0);
  });

  it('CANCEL_REQUESTED sets userCancelled flag immediately', async () => {
    // anchor=GPT speaks last: claude, gemini, gpt
    // First agent called is now Claude
    let claudeResolve: (value: AgentResponse) => void;
    const claudePromise = new Promise<AgentResponse>((resolve) => {
      claudeResolve = resolve;
    });

    mockCallAgent.mockImplementation(() => claudePromise);

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.submitPrompt('Slow request');
    });

    // Verify processing
    expect(result.current.isProcessing()).toBe(true);

    // Cancel
    act(() => {
      result.current.cancelSequence();
    });

    // userCancelled should be true immediately after CANCEL_REQUESTED
    expect(result.current.getState().userCancelled).toBe(true);

    // Resolve to complete
    await act(async () => {
      claudeResolve!(createMockResponse('claude', 'Claude response'));
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });
  });
});

// -----------------------------------------------------------------------------
// Timeout Tests (Fake Timers - isolated)
// -----------------------------------------------------------------------------

describe('Orchestrator — Timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('timeout produces timeout status for agent', async () => {
    // anchor=GPT speaks last: claude, gemini, gpt
    // First agent (Claude) times out - mock returns timeout status when aborted
    mockCallAgent.mockImplementation((agent, _prompt, _context, abortController) => {
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          resolve(createMockResponse(agent, `${agent} response`));
        }, 60000); // Long delay

        abortController.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          resolve({
            agent,
            timestamp: Date.now(),
            status: 'timeout',
          });
        });
      });
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.submitPrompt('Will timeout');
    });

    expect(result.current.isProcessing()).toBe(true);

    // Advance past the 30s timeout in agentClient
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35000);
    });

    // Continue advancing to let all promises resolve
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Verify processing completed
    expect(result.current.isProcessing()).toBe(false);

    // Verify Claude was called (first in sequence)
    expect(mockCallAgent).toHaveBeenCalled();

    // Exchange should exist with timeout status
    expect(result.current.getExchanges()).toHaveLength(1);
    const exchange = result.current.getExchanges()[0];
    expect(getLatestRound(exchange).responsesByAgent.claude?.status).toBe('timeout');
  });

  it('sequence continues after single agent timeout with fallback', async () => {
    // anchor=GPT speaks last: claude, gemini, gpt
    mockCallAgent.mockImplementation((agent, _prompt, _context, abortController) => {
      if (agent === 'claude') {
        // Claude succeeds immediately (first in sequence)
        return Promise.resolve(createMockResponse('claude', 'Claude works'));
      }

      if (agent === 'gemini') {
        // Gemini times out (second in sequence)
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            resolve(createMockResponse('gemini', 'Gemini response'));
          }, 60000);

          abortController.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            resolve({
              agent: 'gemini',
              timestamp: Date.now(),
              status: 'timeout',
            });
          });
        });
      }

      // GPT (anchor) succeeds last
      return Promise.resolve(createGPTResponseWithFlags(true, true));
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.submitPrompt('Gemini will timeout');
    });

    // Let Claude complete (microtask)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Advance past Gemini's timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35000);
    });

    // Let GPT complete
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.isProcessing()).toBe(false);

    const exchange = result.current.getExchanges()[0];
    expect(getLatestRound(exchange).responsesByAgent.claude?.status).toBe('success');
    expect(getLatestRound(exchange).responsesByAgent.gemini?.status).toBe('timeout');
    expect(getLatestRound(exchange).responsesByAgent.gpt?.status).toBe('success');
  });
});

// -----------------------------------------------------------------------------
// Double-Submit Protection Tests (Real Timers)
// -----------------------------------------------------------------------------

describe('Orchestrator — Double Submit Protection', () => {
  it('blocks second submission while processing', async () => {
    let firstCallResolve: (value: AgentResponse) => void;

    // anchor=GPT speaks last: claude, gemini, gpt
    // Phase 2F: Force-all means 3 calls per exchange
    // First call hangs, subsequent calls resolve immediately
    let callCount = 0;
    mockCallAgent.mockImplementation((agent) => {
      callCount++;
      if (callCount === 1) {
        // First call (Claude) hangs until resolved
        return new Promise((resolve) => {
          firstCallResolve = resolve;
        });
      }
      // Subsequent calls resolve immediately with correct agent type
      return Promise.resolve(createMockResponse(agent, `${agent} response`));
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    // First submission
    let runId1: string = '';
    act(() => {
      runId1 = result.current.submitPrompt('First');
    });

    expect(runId1).not.toBe('');
    expect(result.current.isProcessing()).toBe(true);

    // Second submission while processing
    let runId2: string = '';
    act(() => {
      runId2 = result.current.submitPrompt('Second');
    });

    // Second submission should return empty string (blocked)
    expect(runId2).toBe('');

    // Cleanup - resolve first call (Claude), then Gemini/GPT will complete immediately
    await act(async () => {
      firstCallResolve!(createMockResponse('claude', 'Claude response'));
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });
  });
});

// -----------------------------------------------------------------------------
// Clear Board Tests (Real Timers)
// -----------------------------------------------------------------------------

describe('Orchestrator — Clear Board', () => {
  it('clearBoard removes exchanges when not processing', async () => {
    // Phase 2F: Force-all means all 3 agents called, mock must return correct agent type
    mockCallAgent.mockImplementation((agent) => {
      return Promise.resolve(createMockResponse(agent, `${agent} response`));
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Submit and complete first exchange (all 3 agents)
    act(() => {
      result.current.submitPrompt('First');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    expect(result.current.getExchanges()).toHaveLength(1);

    // Clear board
    act(() => {
      result.current.clearBoard();
    });

    expect(result.current.getExchanges()).toHaveLength(0);
  });

  it('clearBoard is blocked while processing', async () => {
    let secondExchangeResolve: (value: AgentResponse) => void;

    // anchor=GPT speaks last: gemini, claude, gpt
    // V3-B: First exchange = round 1 (calls 1-3 content) + round 2 (calls 4-6 NFI → terminate)
    // Second exchange hangs on call 7
    let callCount = 0;
    mockCallAgent.mockImplementation((agent) => {
      callCount++;
      // First exchange, round 1: calls 1-3 content
      if (callCount <= 3) {
        return Promise.resolve(createMockResponse(agent, `${agent} response`));
      }
      // First exchange, round 2: calls 4-6 NFI → terminates
      if (callCount <= 6) {
        return Promise.resolve(createMockResponse(agent, '[NO_FURTHER_INPUT]'));
      }
      // Second exchange: call 7 hangs
      return new Promise((resolve) => {
        secondExchangeResolve = resolve;
      });
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    // First exchange completes (6 agent calls: round 1 content + round 2 NFI)
    act(() => {
      result.current.submitPrompt('Setup');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    expect(result.current.getExchanges()).toHaveLength(1);

    // Start second exchange (will hang on first agent call)
    act(() => {
      result.current.submitPrompt('Processing');
    });

    expect(result.current.isProcessing()).toBe(true);

    // Try to clear while processing
    act(() => {
      result.current.clearBoard();
    });

    // Should still have the exchange (clear blocked)
    expect(result.current.getExchanges()).toHaveLength(1);

    // Cleanup - resolve hanging call, then remaining agents return NFI
    mockCallAgent.mockImplementation((agent) => {
      return Promise.resolve(createMockResponse(agent, '[NO_FURTHER_INPUT]'));
    });

    await act(async () => {
      secondExchangeResolve!(createMockResponse('gemini', 'Gemini response'));
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });
  });
});

// -----------------------------------------------------------------------------
// V3-B Multi-Round Tests
// -----------------------------------------------------------------------------

describe('Orchestrator — V3-B Multi-Round', () => {
  it('round loop basic: content round 1, NFI round 2 → 1 round in exchange', async () => {
    // Round 1: all agents return content
    // Round 2: all agents return NFI → terminates, round discarded
    const nfi = createMockResponse('gpt', '[NO_FURTHER_INPUT]');
    mockCallAgent
      .mockResolvedValueOnce(createMockResponse('gemini', 'Gemini R1'))
      .mockResolvedValueOnce(createMockResponse('claude', 'Claude R1'))
      .mockResolvedValueOnce(createMockResponse('gpt', 'GPT R1'))
      .mockResolvedValue(nfi);

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.submitPrompt('Multi-round test');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    const exchange = result.current.getExchanges()[0];
    expect(exchange.rounds).toHaveLength(1);
    expect(exchange.rounds[0].roundNumber).toBe(1);
    // 3 content + 3 NFI = 6 total calls
    expect(mockCallAgent).toHaveBeenCalledTimes(6);
  });

  it('max rounds reached: always returns content → 5 rounds', async () => {
    // Every call returns content → never terminates → hits MAX_ROUNDS (5)
    mockCallAgent.mockImplementation((agent: Agent) => {
      return Promise.resolve(createMockResponse(agent, `${agent} round content`));
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.submitPrompt('Max rounds test');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    const exchange = result.current.getExchanges()[0];
    expect(exchange.rounds).toHaveLength(5);
    expect(exchange.rounds[0].roundNumber).toBe(1);
    expect(exchange.rounds[4].roundNumber).toBe(5);
    // 5 rounds × 3 agents = 15 calls
    expect(mockCallAgent).toHaveBeenCalledTimes(15);
  });

  it('round context propagation: round 2+ receives prior round context', async () => {
    // Round 1: content, Round 2: content, Round 3: NFI
    let callNum = 0;
    mockCallAgent.mockImplementation((agent: Agent) => {
      callNum++;
      // Calls 1-6: content (rounds 1-2)
      if (callNum <= 6) {
        return Promise.resolve(createMockResponse(agent, `${agent} R${Math.ceil(callNum / 3)}`));
      }
      // Calls 7-9: NFI (round 3 → terminate)
      return Promise.resolve(createMockResponse(agent, '[NO_FURTHER_INPUT]'));
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.submitPrompt('Context propagation test');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // 2 content rounds + 1 terminated round = 2 rounds saved
    const exchange = result.current.getExchanges()[0];
    expect(exchange.rounds).toHaveLength(2);

    // Round 2 agents (calls 4-6) should have received round 1 context
    // Call 4 is gemini in round 2 — context arg should contain 'Round 1'
    const round2GeminiCall = mockCallAgent.mock.calls[3]; // 0-indexed: call 4
    expect(round2GeminiCall[0]).toBe('gemini'); // agent
    expect(round2GeminiCall[2]).toContain('Round 1'); // context includes prior round
  });

  it('mixed termination: 2 NFI + 1 content → loop continues', async () => {
    // Round 1: all content
    // Round 2: gemini NFI, claude NFI, gpt content → NOT all terminated → continues
    // Round 3: all NFI → terminates
    let callNum = 0;
    mockCallAgent.mockImplementation((agent: Agent) => {
      callNum++;
      // Round 1 (calls 1-3): all content
      if (callNum <= 3) {
        return Promise.resolve(createMockResponse(agent, `${agent} content`));
      }
      // Round 2 (calls 4-6): gpt content, others NFI
      if (callNum <= 6) {
        if (agent === 'gpt') {
          return Promise.resolve(createMockResponse('gpt', 'GPT has more to say'));
        }
        return Promise.resolve(createMockResponse(agent, '[NO_FURTHER_INPUT]'));
      }
      // Round 3 (calls 7-9): all NFI → terminate
      return Promise.resolve(createMockResponse(agent, '[NO_FURTHER_INPUT]'));
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.submitPrompt('Mixed termination');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    const exchange = result.current.getExchanges()[0];
    // Rounds 1 and 2 saved (round 3 all-NFI → discarded)
    expect(exchange.rounds).toHaveLength(2);
    // 3 rounds × 3 agents = 9 calls
    expect(mockCallAgent).toHaveBeenCalledTimes(9);
  });

  it('cancel mid-round 2 → only round 1 in exchange', async () => {
    // Round 1: all content (resolves immediately)
    // Round 2: first agent (gemini) hangs → cancel during round 2
    let round2GeminiResolve: (value: AgentResponse) => void;
    let callNum = 0;

    mockCallAgent.mockImplementation((agent: Agent) => {
      callNum++;
      // Round 1: calls 1-3 content
      if (callNum <= 3) {
        return Promise.resolve(createMockResponse(agent, `${agent} R1`));
      }
      // Round 2, first agent (gemini): hangs
      if (callNum === 4) {
        return new Promise<AgentResponse>((resolve) => {
          round2GeminiResolve = resolve;
        });
      }
      // Should not reach here before cancel
      return Promise.resolve(createMockResponse(agent, `${agent} late`));
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.submitPrompt('Cancel mid-round');
    });

    // Wait for round 2 to start (round 1 completes, gemini hangs in round 2)
    await waitFor(() => {
      expect(mockCallAgent).toHaveBeenCalledTimes(4);
    });

    // Cancel during round 2
    act(() => {
      result.current.cancelSequence();
    });

    // Resolve gemini so the cancel path executes
    await act(async () => {
      round2GeminiResolve!(createMockResponse('gemini', 'Gemini R2'));
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Only round 1 saved (cancel happened before round 2 completed)
    const exchange = result.current.getExchanges()[0];
    expect(exchange.rounds).toHaveLength(1);
    expect(exchange.rounds[0].roundNumber).toBe(1);
  });
});

