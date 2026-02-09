// =============================================================================
// The Brain — Context Builder Tests (V3-B: formatPriorRounds)
// =============================================================================

import { describe, it, expect } from 'vitest';
import { formatPriorRounds } from '../utils/contextBuilder';
import type { Round, AgentResponse } from '../types/brain';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function successResponse(agent: 'gpt' | 'claude' | 'gemini', content: string): AgentResponse {
  return { agent, timestamp: Date.now(), status: 'success', content };
}

function errorResponse(agent: 'gpt' | 'claude' | 'gemini'): AgentResponse {
  return { agent, timestamp: Date.now(), status: 'error', errorCode: 'api', errorMessage: 'Mock error' };
}

function timeoutResponse(agent: 'gpt' | 'claude' | 'gemini'): AgentResponse {
  return { agent, timestamp: Date.now(), status: 'timeout' };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('formatPriorRounds', () => {
  it('formats rounds with success responses', () => {
    const rounds: Round[] = [
      {
        roundNumber: 1,
        responsesByAgent: {
          gpt: successResponse('gpt', 'GPT says hello'),
          claude: successResponse('claude', 'Claude agrees'),
          gemini: successResponse('gemini', 'Gemini concurs'),
        },
      },
      {
        roundNumber: 2,
        responsesByAgent: {
          gpt: successResponse('gpt', 'GPT round 2'),
          claude: successResponse('claude', 'Claude round 2'),
          gemini: successResponse('gemini', 'Gemini round 2'),
        },
      },
    ];

    const result = formatPriorRounds(rounds);

    // Round headers
    expect(result).toContain('--- Round 1 ---');
    expect(result).toContain('--- Round 2 ---');

    // Agent labels and content (ordered: GPT, Claude, Gemini)
    expect(result).toContain('GPT: GPT says hello');
    expect(result).toContain('Claude: Claude agrees');
    expect(result).toContain('Gemini: Gemini concurs');
    expect(result).toContain('GPT: GPT round 2');
    expect(result).toContain('Claude: Claude round 2');
    expect(result).toContain('Gemini: Gemini round 2');

    // Verify round 1 comes before round 2
    expect(result.indexOf('Round 1')).toBeLessThan(result.indexOf('Round 2'));
  });

  it('returns empty string for empty array', () => {
    expect(formatPriorRounds([])).toBe('');
  });

  it('formats error and timeout responses with status indicator', () => {
    const rounds: Round[] = [
      {
        roundNumber: 1,
        responsesByAgent: {
          gpt: successResponse('gpt', 'GPT works'),
          claude: errorResponse('claude'),
          gemini: timeoutResponse('gemini'),
        },
      },
    ];

    const result = formatPriorRounds(rounds);

    expect(result).toContain('GPT: GPT works');
    expect(result).toContain('Claude: [error]');
    expect(result).toContain('Gemini: [timeout]');
  });
});
