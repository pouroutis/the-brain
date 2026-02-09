// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Discussion Persistence — Reducer Integration Tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { brainReducer, initialBrainState } from '../reducer/brainReducer';
import type { BrainState, DiscussionSession, Exchange, TranscriptEntry } from '../types/brain';

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

function createMockSession(): DiscussionSession {
  return {
    id: 'session-test-123',
    createdAt: 1700000000000,
    lastUpdatedAt: 1700000001000,
    exchangeCount: 1,
    schemaVersion: 1,
  };
}

function createMockExchange(): Exchange {
  return {
    id: 'ex-test-123',
    userPrompt: 'Test prompt',
    rounds: [{
      roundNumber: 1,
      responsesByAgent: {
        gpt: {
          agent: 'gpt',
          timestamp: 1700000000500,
          status: 'success',
          content: 'GPT response',
        },
      },
    }],
    timestamp: 1700000000000,
  };
}

function createMockTranscript(): TranscriptEntry[] {
  return [
    {
      exchangeId: 'ex-test-123',
      role: 'user',
      content: 'Test prompt',
      timestamp: 1700000000000,
    },
    {
      exchangeId: 'ex-test-123',
      role: 'gpt',
      content: 'GPT response',
      timestamp: 1700000000500,
    },
  ];
}

// -----------------------------------------------------------------------------
// Tests: Reducer Integration
// -----------------------------------------------------------------------------

describe('brainReducer persistence actions', () => {
  describe('SEQUENCE_COMPLETED', () => {
    it('creates/updates discussionSession and appends transcript in discussion mode', () => {
      const stateWithPending: BrainState = {
        ...initialBrainState,
        isProcessing: true,
        pendingExchange: {
          runId: 'run-123',
          userPrompt: 'Test',
          responsesByAgent: {
            gpt: {
              agent: 'gpt',
              timestamp: Date.now(),
              status: 'success',
              content: 'Response',
            },
          },
        },
      };

      const result = brainReducer(stateWithPending, {
        type: 'SEQUENCE_COMPLETED',
        runId: 'run-123',
        rounds: [{
          roundNumber: 1,
          responsesByAgent: {
            gpt: {
              agent: 'gpt',
              timestamp: Date.now(),
              status: 'success',
              content: 'Response',
            },
          },
        }],
      });

      expect(result.discussionSession).not.toBeNull();
      expect(result.discussionSession?.schemaVersion).toBe(1);
      expect(result.discussionSession?.exchangeCount).toBe(1);
      expect(result.exchanges.length).toBe(1);
      // Transcript should have user prompt + gpt response
      expect(result.transcript.length).toBe(2);
      expect(result.transcript[0].role).toBe('user');
      expect(result.transcript[1].role).toBe('gpt');
    });

  });

  describe('CLEAR', () => {
    it('resets discussionSession with new ID and clears transcript in discussion mode', () => {
      const stateWithSession: BrainState = {
        ...initialBrainState,
        discussionSession: createMockSession(),
        exchanges: [createMockExchange()],
        transcript: createMockTranscript(),
      };

      const result = brainReducer(stateWithSession, { type: 'CLEAR' });

      expect(result.exchanges).toEqual([]);
      expect(result.transcript).toEqual([]);
      expect(result.discussionSession).not.toBeNull();
      expect(result.discussionSession?.id).not.toBe(stateWithSession.discussionSession?.id);
      expect(result.discussionSession?.exchangeCount).toBe(0);
    });
  });
});
