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

vi.mock('../api/ghostClient', () => ({
  callGhostOrchestrator: vi.fn(),
  isGhostEnabled: vi.fn(),
}));

import { callAgent } from '../api/agentClient';
import { isGhostEnabled } from '../api/ghostClient';

const mockCallAgent = vi.mocked(callAgent);
const mockIsGhostEnabled = vi.mocked(isGhostEnabled);

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
  // Default: Ghost disabled (most tests expect client-side orchestration)
  mockIsGhostEnabled.mockReturnValue(false);
});

// -----------------------------------------------------------------------------
// Happy Path Tests (Real Timers)
// -----------------------------------------------------------------------------

describe('Orchestrator — Happy Path', () => {
  it('calls Claude → Gemini → GPT in sequence (CEO=GPT speaks last)', async () => {
    const claudeResponse = createMockResponse('claude', 'Claude response');
    const geminiResponse = createMockResponse('gemini', 'Gemini response');
    const gptResponse = createGPTResponseWithFlags(true, true, 'comprehensive');

    mockCallAgent
      .mockResolvedValueOnce(claudeResponse)
      .mockResolvedValueOnce(geminiResponse)
      .mockResolvedValueOnce(gptResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Submit prompt
    act(() => {
      result.current.submitPrompt('Test question');
    });

    // Wait for sequence to complete
    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Verify all agents were called (CEO=GPT speaks LAST, order: gemini, claude, gpt)
    expect(mockCallAgent).toHaveBeenCalledTimes(3);
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

    // Verify exchange was finalized
    expect(result.current.getExchanges()).toHaveLength(1);
    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt).toBeDefined();
    expect(exchange.responsesByAgent.claude).toBeDefined();
    expect(exchange.responsesByAgent.gemini).toBeDefined();
  });

  it('finalizes exchange with all responses on success', async () => {
    // CEO=GPT speaks last: claude, gemini, gpt
    mockCallAgent
      .mockResolvedValueOnce(createMockResponse('claude', 'Claude says'))
      .mockResolvedValueOnce(createMockResponse('gemini', 'Gemini says'))
      .mockResolvedValueOnce(createGPTResponseWithFlags(true, true));

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
// Gatekeeping Flag Tests (Phase 2F: Flags IGNORED — All Modes Force All Agents)
// -----------------------------------------------------------------------------

describe('Orchestrator — Gatekeeping Flags (MVP: Ignored)', () => {
  it('calls all 3 agents even when CALL_CLAUDE=false (flags ignored in MVP)', async () => {
    // CEO=GPT speaks last: claude, gemini, gpt
    const claudeResponse = createMockResponse('claude', 'Claude response');
    const geminiResponse = createMockResponse('gemini', 'Gemini response');
    const gptResponse = createGPTResponseWithFlags(false, true, 'skip_claude');

    mockCallAgent
      .mockResolvedValueOnce(claudeResponse)
      .mockResolvedValueOnce(geminiResponse)
      .mockResolvedValueOnce(gptResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' — but flags are ignored in MVP
    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.submitPrompt('Quick question');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Phase 2F: All 3 agents called (flags ignored)
    expect(mockCallAgent).toHaveBeenCalledTimes(3);

    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt).toBeDefined();
    expect(exchange.responsesByAgent.claude).toBeDefined();
    expect(exchange.responsesByAgent.gemini).toBeDefined();
  });

  it('calls all 3 agents even when CALL_GEMINI=false (flags ignored in MVP)', async () => {
    // CEO=GPT speaks last: claude, gemini, gpt
    const claudeResponse = createMockResponse('claude', 'Claude response');
    const geminiResponse = createMockResponse('gemini', 'Gemini response');
    const gptResponse = createGPTResponseWithFlags(true, false, 'skip_gemini');

    mockCallAgent
      .mockResolvedValueOnce(claudeResponse)
      .mockResolvedValueOnce(geminiResponse)
      .mockResolvedValueOnce(gptResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' — but flags are ignored in MVP
    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.submitPrompt('Code review');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Phase 2F: All 3 agents called (flags ignored)
    expect(mockCallAgent).toHaveBeenCalledTimes(3);

    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt).toBeDefined();
    expect(exchange.responsesByAgent.claude).toBeDefined();
    expect(exchange.responsesByAgent.gemini).toBeDefined();
  });

  it('calls all 3 agents even when both flags are false (flags ignored in MVP)', async () => {
    // CEO=GPT speaks last: claude, gemini, gpt
    const claudeResponse = createMockResponse('claude', 'Claude response');
    const geminiResponse = createMockResponse('gemini', 'Gemini response');
    const gptResponse = createGPTResponseWithFlags(false, false, 'gpt_only');

    mockCallAgent
      .mockResolvedValueOnce(claudeResponse)
      .mockResolvedValueOnce(geminiResponse)
      .mockResolvedValueOnce(gptResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' — but flags are ignored in MVP
    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.submitPrompt('Hi');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // Phase 2F: All 3 agents called (flags ignored)
    expect(mockCallAgent).toHaveBeenCalledTimes(3);

    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt).toBeDefined();
    expect(exchange.responsesByAgent.claude).toBeDefined();
    expect(exchange.responsesByAgent.gemini).toBeDefined();
  });

  it('calls all agents when GPT response has no flags (consistent with force-all)', async () => {
    // CEO=GPT speaks last: claude, gemini, gpt
    // GPT response without flags — same behavior as with flags in MVP
    const gptResponseNoFlags: AgentResponse = {
      agent: 'gpt',
      timestamp: Date.now(),
      status: 'success',
      content: 'Here is my answer without any flags.',
    };

    mockCallAgent
      .mockResolvedValueOnce(createMockResponse('claude', 'Claude response'))
      .mockResolvedValueOnce(createMockResponse('gemini', 'Gemini response'))
      .mockResolvedValueOnce(gptResponseNoFlags);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' — force-all applies regardless of flags
    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.submitPrompt('Test no flags');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // All three agents called (force-all behavior)
    expect(mockCallAgent).toHaveBeenCalledTimes(3);

    // Exchange exists
    expect(result.current.getExchanges()).toHaveLength(1);
  });

  it('calls all agents when GPT fails (error status)', async () => {
    // CEO=GPT speaks last: claude, gemini, gpt
    const gptError = createMockResponse('gpt', '', 'error');

    mockCallAgent
      .mockResolvedValueOnce(createMockResponse('claude', 'Claude speaks first'))
      .mockResolvedValueOnce(createMockResponse('gemini', 'Gemini speaks second'))
      .mockResolvedValueOnce(gptError);

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
    // CEO=GPT speaks last: claude, gemini, gpt
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
    // CEO=GPT speaks last: claude, gemini, gpt
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
    // CEO=GPT speaks last: claude, gemini, gpt
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
    expect(exchange.responsesByAgent.claude?.status).toBe('timeout');
  });

  it('sequence continues after single agent timeout with fallback', async () => {
    // CEO=GPT speaks last: claude, gemini, gpt
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

      // GPT (CEO) succeeds last
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
    expect(exchange.responsesByAgent.claude?.status).toBe('success');
    expect(exchange.responsesByAgent.gemini?.status).toBe('timeout');
    expect(exchange.responsesByAgent.gpt?.status).toBe('success');
  });
});

// -----------------------------------------------------------------------------
// Double-Submit Protection Tests (Real Timers)
// -----------------------------------------------------------------------------

describe('Orchestrator — Double Submit Protection', () => {
  it('blocks second submission while processing', async () => {
    let firstCallResolve: (value: AgentResponse) => void;

    // CEO=GPT speaks last: claude, gemini, gpt
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

    // CEO=GPT speaks last: claude, gemini, gpt
    // Phase 2F: Force-all means 3 calls per exchange
    // First exchange (calls 1-3) resolves immediately
    // Second exchange (call 4+) hangs until resolved
    let callCount = 0;
    mockCallAgent.mockImplementation((agent) => {
      callCount++;
      // First exchange: calls 1-3 (Claude, Gemini, GPT) resolve immediately
      if (callCount <= 3) {
        return Promise.resolve(createMockResponse(agent, `${agent} response`));
      }
      // Second exchange: call 4 (Claude) hangs
      return new Promise((resolve) => {
        secondExchangeResolve = resolve;
      });
    });

    const { result } = renderHook(() => useBrain(), { wrapper });

    // First exchange completes (3 agent calls)
    act(() => {
      result.current.submitPrompt('Setup');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    expect(result.current.getExchanges()).toHaveLength(1);

    // Start second exchange (will hang on Claude call)
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

    // Cleanup - resolve second exchange Claude, then Gemini/GPT will also resolve
    mockCallAgent.mockImplementation((agent) => {
      return Promise.resolve(createMockResponse(agent, `${agent} response`));
    });

    await act(async () => {
      secondExchangeResolve!(createMockResponse('claude', 'Claude response'));
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });
  });
});

// -----------------------------------------------------------------------------
// Discussion Mode Bypasses Ghost (Real Timers)
// -----------------------------------------------------------------------------

describe('Orchestrator — Discussion Mode Bypasses Ghost', () => {
  it('calls all 3 agents in Discussion mode even when Ghost is enabled', async () => {
    // Enable Ghost (but Discussion mode should bypass it)
    mockIsGhostEnabled.mockReturnValue(true);

    // CEO=GPT speaks last: claude, gemini, gpt
    const claudeResponse = createMockResponse('claude', 'Claude response');
    const geminiResponse = createMockResponse('gemini', 'Gemini response');
    const gptResponse = createMockResponse('gpt', 'GPT response in discussion');

    mockCallAgent
      .mockResolvedValueOnce(claudeResponse)
      .mockResolvedValueOnce(geminiResponse)
      .mockResolvedValueOnce(gptResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Mode defaults to 'discussion' — ensure it stays that way
    expect(result.current.getMode()).toBe('discussion');

    act(() => {
      result.current.submitPrompt('Test discussion with ghost enabled');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // CRITICAL: All 3 agents must be called (Calls 3/3), NOT Ghost
    // CEO=GPT speaks LAST, order: gemini, claude, gpt
    expect(mockCallAgent).toHaveBeenCalledTimes(3);
    expect(mockCallAgent).toHaveBeenNthCalledWith(1, 'gemini', expect.any(String), expect.any(String), expect.any(AbortController), expect.any(Object));
    expect(mockCallAgent).toHaveBeenNthCalledWith(2, 'claude', expect.any(String), expect.any(String), expect.any(AbortController), expect.any(Object));
    expect(mockCallAgent).toHaveBeenNthCalledWith(3, 'gpt', expect.any(String), expect.any(String), expect.any(AbortController), expect.any(Object));

    // Exchange should have all 3 responses
    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt).toBeDefined();
    expect(exchange.responsesByAgent.claude).toBeDefined();
    expect(exchange.responsesByAgent.gemini).toBeDefined();
  });
});

// -----------------------------------------------------------------------------
// Phase 2F: Force-All in Decision + Project Modes
// -----------------------------------------------------------------------------

describe('Orchestrator — Phase 2F Force-All Modes', () => {
  it('Decision mode calls 3/3 agents even when GPT flags say skip both', async () => {
    // CEO=GPT speaks last: claude, gemini, gpt
    // GPT returns flags saying skip Claude and Gemini (ignored)
    const claudeResponse = createMockResponse('claude', 'Claude response');
    const geminiResponse = createMockResponse('gemini', 'Gemini response');
    const gptResponse = createGPTResponseWithFlags(false, false, 'skip_all');

    mockCallAgent
      .mockResolvedValueOnce(claudeResponse)
      .mockResolvedValueOnce(geminiResponse)
      .mockResolvedValueOnce(gptResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'decision' (should force all agents)
    act(() => {
      result.current.setMode('decision');
    });

    act(() => {
      result.current.submitPrompt('Test decision mode force-all');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // CRITICAL: All 3 agents must be called (Calls 3/3) despite flags
    expect(mockCallAgent).toHaveBeenCalledTimes(3);

    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt).toBeDefined();
    expect(exchange.responsesByAgent.claude).toBeDefined();
    expect(exchange.responsesByAgent.gemini).toBeDefined();
  });

  it('Project mode calls 3/3 agents even when GPT flags say skip both', async () => {
    // CEO=GPT speaks last: claude, gemini, gpt
    // GPT returns flags saying skip Claude and Gemini (ignored)
    const claudeResponse = createMockResponse('claude', 'Claude response');
    const geminiResponse = createMockResponse('gemini', 'Gemini response');
    const gptResponse = createGPTResponseWithFlags(false, false, 'skip_all');

    mockCallAgent
      .mockResolvedValueOnce(claudeResponse)
      .mockResolvedValueOnce(geminiResponse)
      .mockResolvedValueOnce(gptResponse);

    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set mode to 'project' (should force all agents)
    act(() => {
      result.current.setMode('project');
    });

    act(() => {
      result.current.submitPrompt('Test project mode force-all');
    });

    await waitFor(() => {
      expect(result.current.isProcessing()).toBe(false);
    });

    // CRITICAL: All 3 agents must be called (Calls 3/3) despite flags
    expect(mockCallAgent).toHaveBeenCalledTimes(3);

    const exchange = result.current.getExchanges()[0];
    expect(exchange.responsesByAgent.gpt).toBeDefined();
    expect(exchange.responsesByAgent.claude).toBeDefined();
    expect(exchange.responsesByAgent.gemini).toBeDefined();
  });
});

// -----------------------------------------------------------------------------
// Phase 2F: Mark DONE Button
// -----------------------------------------------------------------------------

describe('Orchestrator — Phase 2F Mark DONE', () => {
  it('markDone sets loopState to idle when running', async () => {
    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set up project mode and start execution loop
    act(() => {
      result.current.setMode('project');
    });

    act(() => {
      result.current.startExecutionLoop();
    });

    expect(result.current.getLoopState()).toBe('running');

    // Click Mark DONE
    act(() => {
      result.current.markDone();
    });

    // Loop state should be idle
    expect(result.current.getLoopState()).toBe('idle');
  });

  it('markDone works even when loopState is paused', async () => {
    const { result } = renderHook(() => useBrain(), { wrapper });

    // Set up project mode, start, then pause
    act(() => {
      result.current.setMode('project');
    });

    act(() => {
      result.current.startExecutionLoop();
    });

    act(() => {
      result.current.pauseExecutionLoop();
    });

    expect(result.current.getLoopState()).toBe('paused');

    // markDone should still work
    act(() => {
      result.current.markDone();
    });

    expect(result.current.getLoopState()).toBe('idle');
  });
});
