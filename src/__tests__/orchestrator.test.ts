// =============================================================================
// The Brain — Orchestrator Integration Tests (Phase 3B)
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { BrainProvider, useBrain } from '../context/BrainContext';
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
// Setup / Teardown (Real Timers by Default)
// -----------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Happy Path Tests (Real Timers)
// -----------------------------------------------------------------------------

describe('Orchestrator — Happy Path', () => {
  it('calls GPT → Claude → Gemini in sequence when all flags are true', async () => {
    const gptResponse = createGPTResponseWithFlags(true, true, 'comprehensive');
    const claudeResponse = createMockResponse('claude', 'Claude response');
    const geminiResponse = createMockResponse('gemini', 'Gemini response');

    mockCallAgent
      .mockResolvedValueOnce(gptResponse)
      .mockResolvedValueOnce(claudeResponse)
      .mockResolvedValueOnce(geminiResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Submit prompt
    act(() => {
      result.current.submitPrompt('Test question');
    });

    // Wait for sequence to complete
    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Verify all agents were called
    expect(mockCallAgent).toHaveBeenCalledTimes(3);
    expect(mockCallAgent).toHaveBeenNthCalledWith(
      1,
      'gpt',
      'Test question',
      '',
      expect.any(AbortController),
      expect.objectContaining({ runId: expect.any(String), callIndex: 1, exchanges: expect.any(Array) })
    );
    expect(mockCallAgent).toHaveBeenNthCalledWith(
      2,
      'claude',
      'Test question',
      expect.stringContaining('GPT:'),
      expect.any(AbortController),
      expect.objectContaining({ runId: expect.any(String), callIndex: 2, exchanges: expect.any(Array) })
    );
    expect(mockCallAgent).toHaveBeenNthCalledWith(
      3,
      'gemini',
      'Test question',
      expect.stringContaining('Claude:'),
      expect.any(AbortController),
      expect.objectContaining({ runId: expect.any(String), callIndex: 3, exchanges: expect.any(Array) })
    );

    // Verify exchange was finalized
    expect(result.current.getExchanges()).toHaveLength(1);
    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt).toBeDefined();
    expect(exchange.responsesByAgent.claude).toBeDefined();
    expect(exchange.responsesByAgent.gemini).toBeDefined();
  });

  it('finalizes exchange with all responses on success', async () => {
    mockCallAgent
      .mockResolvedValueOnce(createGPTResponseWithFlags(true, true))
      .mockResolvedValueOnce(createMockResponse('claude', 'Claude says'))
      .mockResolvedValueOnce(createMockResponse('gemini', 'Gemini says'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.submitPrompt('Hello');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    const exchange = result.current.getExchanges()[0];
    expect(exchange.userPrompt).toBe('Hello');
    expect(exchange.responsesByAgent.gpt?.status).toBe('success');
    expect(exchange.responsesByAgent.claude?.status).toBe('success');
    expect(exchange.responsesByAgent.gemini?.status).toBe('success');
  });
});

// -----------------------------------------------------------------------------
// Gatekeeping Flag Tests (Real Timers)
// -----------------------------------------------------------------------------

describe('Orchestrator — Gatekeeping Flags', () => {
  it('skips Claude when CALL_CLAUDE=false', async () => {
    const gptResponse = createGPTResponseWithFlags(false, true, 'skip_claude');
    const geminiResponse = createMockResponse('gemini', 'Gemini only');

    mockCallAgent
      .mockResolvedValueOnce(gptResponse)
      .mockResolvedValueOnce(geminiResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' to enable gatekeeping (Discussion mode bypasses it)
    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.submitPrompt('Quick question');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Only GPT and Gemini called
    expect(mockCallAgent).toHaveBeenCalledTimes(2);
    expect(mockCallAgent).toHaveBeenNthCalledWith(1, 'gpt', expect.any(String), expect.any(String), expect.any(AbortController), expect.objectContaining({ callIndex: 1, exchanges: expect.any(Array) }));
    expect(mockCallAgent).toHaveBeenNthCalledWith(2, 'gemini', expect.any(String), expect.any(String), expect.any(AbortController), expect.objectContaining({ callIndex: 2, exchanges: expect.any(Array) }));

    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt).toBeDefined();
    expect(exchange.responsesByAgent.claude).toBeUndefined();
    expect(exchange.responsesByAgent.gemini).toBeDefined();
  });

  it('skips Gemini when CALL_GEMINI=false', async () => {
    const gptResponse = createGPTResponseWithFlags(true, false, 'skip_gemini');
    const claudeResponse = createMockResponse('claude', 'Claude only');

    mockCallAgent
      .mockResolvedValueOnce(gptResponse)
      .mockResolvedValueOnce(claudeResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' to enable gatekeeping (Discussion mode bypasses it)
    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.submitPrompt('Code review');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Only GPT and Claude called
    expect(mockCallAgent).toHaveBeenCalledTimes(2);
    expect(mockCallAgent).toHaveBeenNthCalledWith(1, 'gpt', expect.any(String), expect.any(String), expect.any(AbortController), expect.objectContaining({ callIndex: 1, exchanges: expect.any(Array) }));
    expect(mockCallAgent).toHaveBeenNthCalledWith(2, 'claude', expect.any(String), expect.any(String), expect.any(AbortController), expect.objectContaining({ callIndex: 2, exchanges: expect.any(Array) }));

    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt).toBeDefined();
    expect(exchange.responsesByAgent.claude).toBeDefined();
    expect(exchange.responsesByAgent.gemini).toBeUndefined();
  });

  it('skips both Claude and Gemini when both flags are false', async () => {
    const gptResponse = createGPTResponseWithFlags(false, false, 'gpt_only');

    mockCallAgent.mockResolvedValueOnce(gptResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' to enable gatekeeping (Discussion mode bypasses it)
    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.submitPrompt('Hi');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Only GPT called
    expect(mockCallAgent).toHaveBeenCalledTimes(1);
    expect(mockCallAgent).toHaveBeenCalledWith('gpt', expect.any(String), expect.any(String), expect.any(AbortController), expect.objectContaining({ callIndex: 1, exchanges: expect.any(Array) }));

    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt).toBeDefined();
    expect(exchange.responsesByAgent.claude).toBeUndefined();
    expect(exchange.responsesByAgent.gemini).toBeUndefined();
  });

  it('calls all agents when GPT response has no flags (fallback)', async () => {
    // GPT response without flags
    const gptResponseNoFlags: AgentResponse = {
      agent: 'gpt',
      timestamp: Date.now(),
      status: 'success',
      content: 'Here is my answer without any flags.',
    };

    mockCallAgent
      .mockResolvedValueOnce(gptResponseNoFlags)
      .mockResolvedValueOnce(createMockResponse('claude', 'Claude fallback'))
      .mockResolvedValueOnce(createMockResponse('gemini', 'Gemini fallback'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' to enable gatekeeping (Discussion mode bypasses it)
    // This tests the fallback behavior when flags are missing, not Discussion mode
    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.submitPrompt('Test fallback');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // All three agents called (fallback behavior)
    expect(mockCallAgent).toHaveBeenCalledTimes(3);

    // Exchange exists
    expect(result.current.getExchanges()).toHaveLength(1);
  });

  it('calls all agents when GPT fails (error status)', async () => {
    const gptError = createMockResponse('gpt', '', 'error');

    mockCallAgent
      .mockResolvedValueOnce(gptError)
      .mockResolvedValueOnce(createMockResponse('claude', 'Claude after GPT error'))
      .mockResolvedValueOnce(createMockResponse('gemini', 'Gemini after GPT error'));

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' to enable gatekeeping (Discussion mode bypasses it)
    // This tests the fallback behavior when GPT errors, not Discussion mode
    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.submitPrompt('GPT will fail');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // All agents called despite GPT error
    expect(mockCallAgent).toHaveBeenCalledTimes(3);
  });
});

// -----------------------------------------------------------------------------
// Cancellation Tests (Real Timers)
// -----------------------------------------------------------------------------

describe('Orchestrator — Cancellation', () => {
  it('cancellation mid-sequence prevents subsequent agent calls', async () => {
    let gptResolve: (value: AgentResponse) => void;
    const gptPromise = new Promise<AgentResponse>((resolve) => {
      gptResolve = resolve;
    });

    mockCallAgent.mockImplementation((agent) => {
      if (agent === 'gpt') {
        return gptPromise;
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

    // Cancel before GPT completes
    act(() => {
      result.current.cancelSequence();
    });

    // Verify userCancelled is set
    expect(result.current.getState().userCancelled).toBe(true);

    // Now resolve GPT (after cancellation requested)
    await act(async () => {
      gptResolve!(createGPTResponseWithFlags(true, true));
    });

    // Wait for cancellation to complete
    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Verify cancellation completed and state reset
    expect(result.current.getState().userCancelled).toBe(false);

    // Exchange should be finalized (possibly with partial responses)
    expect(result.current.getExchanges()).toHaveLength(1);

    // Only GPT was called; Claude and Gemini skipped due to cancellation
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
    let gptResolve: (value: AgentResponse) => void;
    const gptPromise = new Promise<AgentResponse>((resolve) => {
      gptResolve = resolve;
    });

    mockCallAgent.mockImplementation(() => gptPromise);

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
      gptResolve!(createGPTResponseWithFlags(true, true));
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
    // GPT times out - mock returns timeout status when aborted
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

    // Verify GPT was called
    expect(mockCallAgent).toHaveBeenCalled();

    // Exchange should exist with timeout status
    expect(result.current.getExchanges()).toHaveLength(1);
    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt?.status).toBe('timeout');
  });

  it('sequence continues after single agent timeout with fallback', async () => {
    mockCallAgent.mockImplementation((agent, _prompt, _context, abortController) => {
      if (agent === 'gpt') {
        // GPT succeeds immediately
        return Promise.resolve(createGPTResponseWithFlags(true, true));
      }

      if (agent === 'claude') {
        // Claude times out
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            resolve(createMockResponse('claude', 'Claude response'));
          }, 60000);

          abortController.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            resolve({
              agent: 'claude',
              timestamp: Date.now(),
              status: 'timeout',
            });
          });
        });
      }

      // Gemini succeeds
      return Promise.resolve(createMockResponse('gemini', 'Gemini works'));
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    act(() => {
      result.current.submitPrompt('Claude will timeout');
    });

    // Let GPT complete (microtask)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Advance past Claude's timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35000);
    });

    // Let Gemini complete
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.isProcessing()).toBe(false);

    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt?.status).toBe('success');
    expect(exchange.responsesByAgent.claude?.status).toBe('timeout');
    expect(exchange.responsesByAgent.gemini?.status).toBe('success');
  });
});

// -----------------------------------------------------------------------------
// Double-Submit Protection Tests (Real Timers)
// -----------------------------------------------------------------------------

describe('Orchestrator — Double Submit Protection', () => {
  it('blocks second submission while processing', async () => {
    let gptResolve: (value: AgentResponse) => void;
    const gptPromise = new Promise<AgentResponse>((resolve) => {
      gptResolve = resolve;
    });

    mockCallAgent.mockImplementation(() => gptPromise);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' to enable gatekeeping (Discussion mode bypasses it)
    act(() => {
      result.current.setMode('decision');
    });

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

    // Cleanup - resolve GPT
    await act(async () => {
      gptResolve!(createGPTResponseWithFlags(false, false));
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
    mockCallAgent.mockResolvedValue(createGPTResponseWithFlags(false, false));

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' to enable gatekeeping (Discussion mode bypasses it)
    act(() => {
      result.current.setMode('decision');
    });

    // Submit and complete first exchange
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
    let gptResolve: (value: AgentResponse) => void;

    // First call resolves immediately, second hangs
    let callCount = 0;
    mockCallAgent.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(createGPTResponseWithFlags(false, false));
      }
      return new Promise((resolve) => {
        gptResolve = resolve;
      });
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' to enable gatekeeping (Discussion mode bypasses it)
    act(() => {
      result.current.setMode('decision');
    });

    // First exchange completes
    act(() => {
      result.current.submitPrompt('Setup');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    expect(result.current.getExchanges()).toHaveLength(1);

    // Start second exchange (will hang)
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

    // Cleanup
    await act(async () => {
      gptResolve!(createGPTResponseWithFlags(false, false));
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });
  });
});
