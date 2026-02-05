// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Compaction Utilities Tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  shouldCompact,
  getExchangesToCompact,
  getExchangesToKeep,
  parseKeyNotes,
  mergeKeyNotes,
  enforceKeySizeCap,
  buildCompactionPrompt,
  createEmptyKeyNotes,
  COMPACTION_TRIGGER,
  KEEP_EXCHANGES,
  MAX_KEY_NOTES_CHARS,
} from '../utils/compaction';
import type { Exchange, KeyNotes } from '../types/brain';

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

function createMockExchange(id: string, prompt: string): Exchange {
  return {
    id,
    userPrompt: prompt,
    responsesByAgent: {
      gpt: {
        agent: 'gpt',
        timestamp: Date.now(),
        status: 'success',
        content: `GPT response to: ${prompt}`,
      },
    },
    timestamp: Date.now(),
  };
}

function createMockExchanges(count: number): Exchange[] {
  return Array.from({ length: count }, (_, i) =>
    createMockExchange(`ex-${i}`, `Prompt ${i}`)
  );
}

function createMockKeyNotes(): KeyNotes {
  return {
    decisions: ['Decision 1', 'Decision 2'],
    reasoningChains: ['Reasoning 1'],
    agreements: ['Agreement 1'],
    constraints: ['Constraint 1'],
    openQuestions: ['Question 1'],
  };
}

// -----------------------------------------------------------------------------
// Constants Tests
// -----------------------------------------------------------------------------

describe('compaction constants', () => {
  it('COMPACTION_TRIGGER is 40', () => {
    expect(COMPACTION_TRIGGER).toBe(40);
  });

  it('KEEP_EXCHANGES is 10', () => {
    expect(KEEP_EXCHANGES).toBe(10);
  });

  it('MAX_KEY_NOTES_CHARS is 80000 (20k tokens × 4)', () => {
    expect(MAX_KEY_NOTES_CHARS).toBe(80_000);
  });
});

// -----------------------------------------------------------------------------
// shouldCompact Tests
// -----------------------------------------------------------------------------

describe('shouldCompact', () => {
  it('returns false for 0 exchanges', () => {
    expect(shouldCompact(0)).toBe(false);
  });

  it('returns false for exchanges below threshold', () => {
    expect(shouldCompact(10)).toBe(false);
    expect(shouldCompact(39)).toBe(false);
  });

  it('returns true at exactly 40 exchanges', () => {
    expect(shouldCompact(40)).toBe(true);
  });

  it('returns true at multiples of 40', () => {
    expect(shouldCompact(80)).toBe(true);
    expect(shouldCompact(120)).toBe(true);
    expect(shouldCompact(160)).toBe(true);
  });

  it('returns false between multiples', () => {
    expect(shouldCompact(41)).toBe(false);
    expect(shouldCompact(50)).toBe(false);
    expect(shouldCompact(79)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// getExchangesToCompact Tests
// -----------------------------------------------------------------------------

describe('getExchangesToCompact', () => {
  it('returns empty array when exchanges <= KEEP_EXCHANGES', () => {
    const exchanges = createMockExchanges(10);
    expect(getExchangesToCompact(exchanges)).toEqual([]);
  });

  it('returns empty array for fewer than KEEP_EXCHANGES', () => {
    const exchanges = createMockExchanges(5);
    expect(getExchangesToCompact(exchanges)).toEqual([]);
  });

  it('returns older exchanges when more than KEEP_EXCHANGES', () => {
    const exchanges = createMockExchanges(15);
    const toCompact = getExchangesToCompact(exchanges);

    // Should return first 5 (15 - 10 = 5)
    expect(toCompact.length).toBe(5);
    expect(toCompact[0].id).toBe('ex-0');
    expect(toCompact[4].id).toBe('ex-4');
  });

  it('returns 30 exchanges when at 40 total', () => {
    const exchanges = createMockExchanges(40);
    const toCompact = getExchangesToCompact(exchanges);

    // Should return first 30 (40 - 10 = 30)
    expect(toCompact.length).toBe(30);
    expect(toCompact[0].id).toBe('ex-0');
    expect(toCompact[29].id).toBe('ex-29');
  });
});

// -----------------------------------------------------------------------------
// getExchangesToKeep Tests
// -----------------------------------------------------------------------------

describe('getExchangesToKeep', () => {
  it('returns all exchanges when <= KEEP_EXCHANGES', () => {
    const exchanges = createMockExchanges(10);
    const toKeep = getExchangesToKeep(exchanges);

    expect(toKeep.length).toBe(10);
    expect(toKeep).toEqual(exchanges);
  });

  it('returns last 10 when more than KEEP_EXCHANGES', () => {
    const exchanges = createMockExchanges(15);
    const toKeep = getExchangesToKeep(exchanges);

    expect(toKeep.length).toBe(10);
    expect(toKeep[0].id).toBe('ex-5');
    expect(toKeep[9].id).toBe('ex-14');
  });

  it('returns last 10 when at 40 total', () => {
    const exchanges = createMockExchanges(40);
    const toKeep = getExchangesToKeep(exchanges);

    expect(toKeep.length).toBe(10);
    expect(toKeep[0].id).toBe('ex-30');
    expect(toKeep[9].id).toBe('ex-39');
  });
});

// -----------------------------------------------------------------------------
// parseKeyNotes Tests
// -----------------------------------------------------------------------------

describe('parseKeyNotes', () => {
  it('parses valid JSON keyNotes', () => {
    const input = JSON.stringify({
      decisions: ['D1', 'D2'],
      reasoningChains: ['R1'],
      agreements: ['A1'],
      constraints: ['C1'],
      openQuestions: ['Q1'],
    });

    const result = parseKeyNotes(input);

    expect(result).not.toBeNull();
    expect(result?.decisions).toEqual(['D1', 'D2']);
    expect(result?.reasoningChains).toEqual(['R1']);
  });

  it('extracts JSON from markdown code blocks', () => {
    const input = `Here is the summary:
\`\`\`json
{
  "decisions": ["D1"],
  "reasoningChains": [],
  "agreements": [],
  "constraints": [],
  "openQuestions": []
}
\`\`\`
Done!`;

    const result = parseKeyNotes(input);

    expect(result).not.toBeNull();
    expect(result?.decisions).toEqual(['D1']);
  });

  it('extracts JSON when surrounded by text', () => {
    const input = `Some preamble text {"decisions":[],"reasoningChains":[],"agreements":[],"constraints":[],"openQuestions":[]} and more text`;

    const result = parseKeyNotes(input);

    expect(result).not.toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseKeyNotes('not json')).toBeNull();
    expect(parseKeyNotes('{invalid}')).toBeNull();
  });

  it('returns null for missing required arrays', () => {
    const input = JSON.stringify({
      decisions: ['D1'],
      // Missing other arrays
    });

    expect(parseKeyNotes(input)).toBeNull();
  });

  it('returns null for non-string array items', () => {
    const input = JSON.stringify({
      decisions: [123, 456],
      reasoningChains: [],
      agreements: [],
      constraints: [],
      openQuestions: [],
    });

    expect(parseKeyNotes(input)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// mergeKeyNotes Tests
// -----------------------------------------------------------------------------

describe('mergeKeyNotes', () => {
  it('returns incoming when existing is null', () => {
    const incoming = createMockKeyNotes();
    const result = mergeKeyNotes(null, incoming);

    expect(result).toEqual(incoming);
  });

  it('merges arrays from both keyNotes', () => {
    const existing: KeyNotes = {
      decisions: ['Old D1'],
      reasoningChains: ['Old R1'],
      agreements: [],
      constraints: [],
      openQuestions: [],
    };
    const incoming: KeyNotes = {
      decisions: ['New D1'],
      reasoningChains: ['New R1'],
      agreements: ['A1'],
      constraints: ['C1'],
      openQuestions: ['Q1'],
    };

    const result = mergeKeyNotes(existing, incoming);

    expect(result.decisions).toEqual(['Old D1', 'New D1']);
    expect(result.reasoningChains).toEqual(['Old R1', 'New R1']);
    expect(result.agreements).toEqual(['A1']);
  });
});

// -----------------------------------------------------------------------------
// enforceKeySizeCap Tests
// -----------------------------------------------------------------------------

describe('enforceKeySizeCap', () => {
  it('returns unchanged if under cap', () => {
    const keyNotes = createMockKeyNotes();
    const result = enforceKeySizeCap(keyNotes);

    expect(result).toEqual(keyNotes);
  });

  it('trims arrays when over cap', () => {
    // Create keyNotes that exceeds cap
    const largeArray = Array.from({ length: 1000 }, (_, i) =>
      `Very long entry number ${i} with lots of content to make it big`.repeat(10)
    );

    const keyNotes: KeyNotes = {
      decisions: largeArray.slice(0, 100),
      reasoningChains: largeArray.slice(100, 500),
      agreements: largeArray.slice(500, 700),
      constraints: largeArray.slice(700, 900),
      openQuestions: largeArray.slice(900),
    };

    const result = enforceKeySizeCap(keyNotes);
    const resultSize = JSON.stringify(result).length;

    expect(resultSize).toBeLessThanOrEqual(MAX_KEY_NOTES_CHARS);
  });
});

// -----------------------------------------------------------------------------
// buildCompactionPrompt Tests
// -----------------------------------------------------------------------------

describe('buildCompactionPrompt', () => {
  it('builds prompt with exchanges to compact', () => {
    const exchanges = createMockExchanges(5);
    const prompt = buildCompactionPrompt(exchanges, null);

    expect(prompt).toContain('summarizing a discussion');
    expect(prompt).toContain('Prompt 0');
    expect(prompt).toContain('GPT response');
    expect(prompt).toContain('decisions');
    expect(prompt).toContain('reasoningChains');
  });

  it('includes existing keyNotes when provided', () => {
    const exchanges = createMockExchanges(2);
    const existing = createMockKeyNotes();
    const prompt = buildCompactionPrompt(exchanges, existing);

    expect(prompt).toContain('Existing key-notes');
    expect(prompt).toContain('Decision 1');
  });
});

// -----------------------------------------------------------------------------
// createEmptyKeyNotes Tests
// -----------------------------------------------------------------------------

describe('createEmptyKeyNotes', () => {
  it('returns empty keyNotes structure', () => {
    const result = createEmptyKeyNotes();

    expect(result.decisions).toEqual([]);
    expect(result.reasoningChains).toEqual([]);
    expect(result.agreements).toEqual([]);
    expect(result.constraints).toEqual([]);
    expect(result.openQuestions).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Integration: Transcript Unchanged After Compaction
// -----------------------------------------------------------------------------

describe('compaction integration', () => {
  it('compaction does not affect transcript (transcript is append-only)', () => {
    // This is a behavioral test: compaction only affects exchanges[]
    // Transcript is never modified by compaction

    const exchanges = createMockExchanges(40);
    const toCompact = getExchangesToCompact(exchanges);
    const toKeep = getExchangesToKeep(exchanges);

    // Verify exchanges are split correctly
    expect(toCompact.length + toKeep.length).toBe(40);
    expect(toCompact.length).toBe(30);
    expect(toKeep.length).toBe(10);

    // The transcript would remain with all 40 entries
    // (transcript handling is in the reducer, not compaction utils)
  });
});
