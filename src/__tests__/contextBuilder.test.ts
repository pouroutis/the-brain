// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Context Builder Tests (Task 4 — Discussion Memory)
// =============================================================================

import { describe, it, expect } from 'vitest';
import { buildDiscussionMemoryBlock, buildCarryoverMemoryBlock } from '../utils/contextBuilder';
import type { Carryover, Exchange, KeyNotes } from '../types/brain';

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

function createMockExchange(id: string, prompt: string, timestamp?: number): Exchange {
  return {
    id,
    userPrompt: prompt,
    responsesByAgent: {
      gpt: {
        agent: 'gpt',
        timestamp: timestamp ?? Date.now(),
        status: 'success',
        content: `GPT response to: ${prompt}`,
      },
      claude: {
        agent: 'claude',
        timestamp: timestamp ?? Date.now(),
        status: 'success',
        content: `Claude response to: ${prompt}`,
      },
      gemini: {
        agent: 'gemini',
        timestamp: timestamp ?? Date.now(),
        status: 'success',
        content: `Gemini response to: ${prompt}`,
      },
    },
    timestamp: timestamp ?? Date.now(),
  };
}

function createMockExchanges(count: number): Exchange[] {
  return Array.from({ length: count }, (_, i) =>
    createMockExchange(`ex-${i}`, `Prompt ${i}`, 1700000000000 + i * 1000)
  );
}

function createMockKeyNotes(): KeyNotes {
  return {
    decisions: ['Decision 1', 'Decision 2'],
    reasoningChains: ['Reasoning chain 1'],
    agreements: ['Agreement 1'],
    constraints: ['Constraint 1'],
    openQuestions: ['Open question 1'],
  };
}

function createEmptyKeyNotes(): KeyNotes {
  return {
    decisions: [],
    reasoningChains: [],
    agreements: [],
    constraints: [],
    openQuestions: [],
  };
}

// -----------------------------------------------------------------------------
// buildDiscussionMemoryBlock Tests
// -----------------------------------------------------------------------------

describe('buildDiscussionMemoryBlock', () => {
  describe('slicing behavior', () => {
    it('slices to last 10 exchanges when more than 10 provided', () => {
      const exchanges = createMockExchanges(15);
      const result = buildDiscussionMemoryBlock({
        keyNotes: null,
        exchanges,
      });

      // Should contain exchanges 5-14 (last 10), not 0-4
      expect(result).toContain('Prompt 5');
      expect(result).toContain('Prompt 14');
      expect(result).not.toContain('Prompt 0');
      expect(result).not.toContain('Prompt 4');
    });

    it('includes all exchanges when fewer than 10', () => {
      const exchanges = createMockExchanges(5);
      const result = buildDiscussionMemoryBlock({
        keyNotes: null,
        exchanges,
      });

      expect(result).toContain('Prompt 0');
      expect(result).toContain('Prompt 4');
      expect(result).toContain('Last 5');
    });

    it('handles exactly 10 exchanges', () => {
      const exchanges = createMockExchanges(10);
      const result = buildDiscussionMemoryBlock({
        keyNotes: null,
        exchanges,
      });

      expect(result).toContain('Prompt 0');
      expect(result).toContain('Prompt 9');
      expect(result).toContain('Last 10');
    });
  });

  describe('content inclusion', () => {
    it('includes keyNotes as JSON when present', () => {
      const keyNotes = createMockKeyNotes();
      const result = buildDiscussionMemoryBlock({
        keyNotes,
        exchanges: [],
      });

      expect(result).toContain('KEY-NOTES');
      expect(result).toContain('Decision 1');
      expect(result).toContain('Decision 2');
      expect(result).toContain('reasoningChains');
    });

    it('includes user prompt and all 3 agent responses per exchange', () => {
      const exchanges = [createMockExchange('ex-1', 'Test prompt')];
      const result = buildDiscussionMemoryBlock({
        keyNotes: null,
        exchanges,
      });

      expect(result).toContain('User: Test prompt');
      expect(result).toContain('GPT: GPT response to: Test prompt');
      expect(result).toContain('CLAUDE: Claude response to: Test prompt');
      expect(result).toContain('GEMINI: Gemini response to: Test prompt');
    });

    it('includes timestamps in exchange headers', () => {
      const exchanges = [createMockExchange('ex-1', 'Test', 1700000000000)];
      const result = buildDiscussionMemoryBlock({
        keyNotes: null,
        exchanges,
      });

      // Should contain ISO timestamp
      expect(result).toContain('2023-11-14');
    });

    it('includes memory block header and footer', () => {
      const result = buildDiscussionMemoryBlock({
        keyNotes: createMockKeyNotes(),
        exchanges: createMockExchanges(1),
      });

      expect(result).toContain('=== DISCUSSION MEMORY (v1) ===');
      expect(result).toContain('=== END DISCUSSION MEMORY ===');
      expect(result).toContain('--- CURRENT PROMPT ---');
    });
  });

  describe('empty/missing data handling', () => {
    it('returns empty string when no keyNotes and no exchanges', () => {
      const result = buildDiscussionMemoryBlock({
        keyNotes: null,
        exchanges: [],
      });

      expect(result).toBe('');
    });

    it('returns empty string when keyNotes is empty and no exchanges', () => {
      const result = buildDiscussionMemoryBlock({
        keyNotes: createEmptyKeyNotes(),
        exchanges: [],
      });

      expect(result).toBe('');
    });

    it('omits KEY-NOTES section when keyNotes is null', () => {
      const result = buildDiscussionMemoryBlock({
        keyNotes: null,
        exchanges: createMockExchanges(1),
      });

      expect(result).not.toContain('KEY-NOTES');
      expect(result).toContain('RECENT EXCHANGES');
    });

    it('omits KEY-NOTES section when keyNotes is empty', () => {
      const result = buildDiscussionMemoryBlock({
        keyNotes: createEmptyKeyNotes(),
        exchanges: createMockExchanges(1),
      });

      expect(result).not.toContain('KEY-NOTES');
      expect(result).toContain('RECENT EXCHANGES');
    });

    it('omits RECENT EXCHANGES section when no exchanges', () => {
      const result = buildDiscussionMemoryBlock({
        keyNotes: createMockKeyNotes(),
        exchanges: [],
      });

      expect(result).toContain('KEY-NOTES');
      expect(result).not.toContain('RECENT EXCHANGES');
    });
  });

  describe('determinism', () => {
    it('produces same output for same inputs', () => {
      const keyNotes = createMockKeyNotes();
      const exchanges = createMockExchanges(5);

      const result1 = buildDiscussionMemoryBlock({ keyNotes, exchanges });
      const result2 = buildDiscussionMemoryBlock({ keyNotes, exchanges });

      expect(result1).toBe(result2);
    });
  });
});

// -----------------------------------------------------------------------------
// Mode Isolation Tests (Project/Decision unchanged)
// -----------------------------------------------------------------------------

describe('Discussion memory isolation', () => {
  it('memory block is only used when explicitly called (Discussion mode logic)', () => {
    // This test documents that buildDiscussionMemoryBlock is a pure function
    // The mode check happens in BrainContext.tsx, not in the builder itself
    // Project/Decision modes simply don't call this function

    const result = buildDiscussionMemoryBlock({
      keyNotes: createMockKeyNotes(),
      exchanges: createMockExchanges(5),
    });

    // The function always produces output when given data
    // Mode filtering is handled by the caller
    expect(result).toBeTruthy();
    expect(result).toContain('DISCUSSION MEMORY');
  });
});

// -----------------------------------------------------------------------------
// Carryover Fixtures
// -----------------------------------------------------------------------------

function createMockCarryover(overrides: Partial<Carryover> = {}): Carryover {
  return {
    schemaVersion: 1,
    fromSessionId: 'session-test-123',
    keyNotes: createMockKeyNotes(),
    last10Exchanges: createMockExchanges(5),
    createdAt: 1700000000000,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// buildCarryoverMemoryBlock Tests (Task 5.2)
// -----------------------------------------------------------------------------

describe('buildCarryoverMemoryBlock', () => {
  describe('header and footer markers', () => {
    it('includes header with version', () => {
      const carryover = createMockCarryover();
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).toContain('=== DISCUSSION CARRYOVER (v1) ===');
    });

    it('includes footer marker', () => {
      const carryover = createMockCarryover();
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).toContain('=== END DISCUSSION CARRYOVER ===');
    });

    it('includes CURRENT PROMPT marker', () => {
      const carryover = createMockCarryover();
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).toContain('--- CURRENT PROMPT ---');
    });
  });

  describe('metadata inclusion', () => {
    it('includes fromSessionId', () => {
      const carryover = createMockCarryover({ fromSessionId: 'session-abc-789' });
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).toContain('fromSessionId: session-abc-789');
    });

    it('includes createdAt as ISO timestamp', () => {
      const carryover = createMockCarryover({ createdAt: 1700000000000 });
      const result = buildCarryoverMemoryBlock(carryover);

      // 1700000000000 = 2023-11-14T22:13:20.000Z
      expect(result).toContain('createdAt: 2023-11-14');
    });
  });

  describe('keyNotes handling', () => {
    it('includes keyNotes as JSON when present', () => {
      const carryover = createMockCarryover({ keyNotes: createMockKeyNotes() });
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).toContain('--- KEY NOTES ---');
      expect(result).toContain('Decision 1');
      expect(result).toContain('Decision 2');
      expect(result).toContain('reasoningChains');
    });

    it('omits KEY NOTES section when keyNotes is null', () => {
      const carryover = createMockCarryover({ keyNotes: null });
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).not.toContain('--- KEY NOTES ---');
      expect(result).toContain('--- RECENT EXCHANGES');
    });

    it('omits KEY NOTES section when keyNotes is empty', () => {
      const carryover = createMockCarryover({ keyNotes: createEmptyKeyNotes() });
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).not.toContain('--- KEY NOTES ---');
      expect(result).toContain('--- RECENT EXCHANGES');
    });
  });

  describe('exchanges handling', () => {
    it('includes serialized exchanges when present', () => {
      const carryover = createMockCarryover({ last10Exchanges: createMockExchanges(3) });
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).toContain('--- RECENT EXCHANGES (3) ---');
      expect(result).toContain('User: Prompt 0');
      expect(result).toContain('User: Prompt 2');
      expect(result).toContain('GPT: GPT response to: Prompt 0');
    });

    it('handles exactly 10 exchanges', () => {
      const carryover = createMockCarryover({ last10Exchanges: createMockExchanges(10) });
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).toContain('--- RECENT EXCHANGES (10) ---');
      expect(result).toContain('Prompt 0');
      expect(result).toContain('Prompt 9');
    });

    it('handles fewer than 10 exchanges', () => {
      const carryover = createMockCarryover({ last10Exchanges: createMockExchanges(2) });
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).toContain('--- RECENT EXCHANGES (2) ---');
      expect(result).toContain('Prompt 0');
      expect(result).toContain('Prompt 1');
    });

    it('omits RECENT EXCHANGES section when exchanges empty', () => {
      const carryover = createMockCarryover({ last10Exchanges: [] });
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).not.toContain('--- RECENT EXCHANGES');
      expect(result).toContain('--- KEY NOTES ---');
    });
  });

  describe('empty content handling', () => {
    it('returns empty string when keyNotes null and exchanges empty', () => {
      const carryover = createMockCarryover({ keyNotes: null, last10Exchanges: [] });
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).toBe('');
    });

    it('returns empty string when keyNotes empty and exchanges empty', () => {
      const carryover = createMockCarryover({ keyNotes: createEmptyKeyNotes(), last10Exchanges: [] });
      const result = buildCarryoverMemoryBlock(carryover);

      expect(result).toBe('');
    });
  });

  describe('determinism', () => {
    it('produces same output for same inputs', () => {
      const carryover = createMockCarryover();

      const result1 = buildCarryoverMemoryBlock(carryover);
      const result2 = buildCarryoverMemoryBlock(carryover);

      expect(result1).toBe(result2);
    });
  });
});
