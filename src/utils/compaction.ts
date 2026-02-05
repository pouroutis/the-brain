// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Compaction Utilities (Discussion Mode)
// =============================================================================

import type { Exchange, KeyNotes } from '../types/brain';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Trigger compaction every N exchanges */
export const COMPACTION_TRIGGER = 40;

/** Keep last N exchanges in full after compaction */
export const KEEP_EXCHANGES = 10;

/** Max size for keyNotes in characters (20,000 tokens × 4 chars/token) */
export const MAX_KEY_NOTES_CHARS = 80_000;

// -----------------------------------------------------------------------------
// Compaction Checks
// -----------------------------------------------------------------------------

/**
 * Check if compaction is due based on exchange count.
 * Triggers at multiples of COMPACTION_TRIGGER (40, 80, 120, etc.)
 */
export function shouldCompact(exchangeCount: number): boolean {
  return exchangeCount > 0 && exchangeCount % COMPACTION_TRIGGER === 0;
}

/**
 * Get exchanges to compact (all except last KEEP_EXCHANGES).
 */
export function getExchangesToCompact(exchanges: Exchange[]): Exchange[] {
  if (exchanges.length <= KEEP_EXCHANGES) {
    return [];
  }
  return exchanges.slice(0, exchanges.length - KEEP_EXCHANGES);
}

/**
 * Get exchanges to keep (last KEEP_EXCHANGES).
 */
export function getExchangesToKeep(exchanges: Exchange[]): Exchange[] {
  if (exchanges.length <= KEEP_EXCHANGES) {
    return exchanges;
  }
  return exchanges.slice(-KEEP_EXCHANGES);
}

// -----------------------------------------------------------------------------
// Prompt Building
// -----------------------------------------------------------------------------

/**
 * Build a summarization prompt for CEO to generate keyNotes.
 */
export function buildCompactionPrompt(
  exchangesToCompact: Exchange[],
  existingKeyNotes: KeyNotes | null
): string {
  const exchangeSummaries = exchangesToCompact.map((ex, i) => {
    const responses = Object.entries(ex.responsesByAgent)
      .filter(([, r]) => r?.status === 'success' && r?.content)
      .map(([agent, r]) => `  ${agent.toUpperCase()}: ${(r as { content: string }).content.slice(0, 500)}...`)
      .join('\n');
    return `Exchange ${i + 1}:\n  User: ${ex.userPrompt}\n${responses}`;
  }).join('\n\n');

  const existingContext = existingKeyNotes
    ? `\nExisting key-notes to merge with:\n${JSON.stringify(existingKeyNotes, null, 2)}\n`
    : '';

  return `You are summarizing a discussion for memory compaction. Extract and preserve the most important information.
${existingContext}
Exchanges to summarize:
${exchangeSummaries}

Output ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "decisions": ["array of key decisions made"],
  "reasoningChains": ["array of important reasoning processes"],
  "agreements": ["array of points agreed upon"],
  "constraints": ["array of constraints/limitations identified"],
  "openQuestions": ["array of unresolved questions"]
}

Guidelines:
- Preserve reasoning, not just conclusions
- Keep entries concise but meaningful
- Merge with existing key-notes if provided
- Each array should have max 10 most important items
- Total response must be under 15000 characters`;
}

// -----------------------------------------------------------------------------
// Parsing
// -----------------------------------------------------------------------------

/**
 * Parse CEO's response into KeyNotes structure.
 * Returns null if parsing fails.
 */
export function parseKeyNotes(content: string): KeyNotes | null {
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonStr = content.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Find JSON object boundaries
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      return null;
    }
    jsonStr = jsonStr.slice(startIdx, endIdx + 1);

    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!isValidKeyNotes(parsed)) {
      return null;
    }

    return parsed as KeyNotes;
  } catch {
    return null;
  }
}

/**
 * Validate KeyNotes structure.
 */
function isValidKeyNotes(obj: unknown): obj is KeyNotes {
  if (!obj || typeof obj !== 'object') return false;
  const k = obj as Record<string, unknown>;

  const requiredArrays = ['decisions', 'reasoningChains', 'agreements', 'constraints', 'openQuestions'];

  for (const key of requiredArrays) {
    if (!Array.isArray(k[key])) return false;
    for (const item of k[key] as unknown[]) {
      if (typeof item !== 'string') return false;
    }
  }

  return true;
}

// -----------------------------------------------------------------------------
// Merging
// -----------------------------------------------------------------------------

/**
 * Merge new keyNotes with existing, enforcing size cap.
 */
export function mergeKeyNotes(existing: KeyNotes | null, incoming: KeyNotes): KeyNotes {
  if (!existing) {
    return enforceKeySizeCap(incoming);
  }

  const merged: KeyNotes = {
    decisions: [...existing.decisions, ...incoming.decisions],
    reasoningChains: [...existing.reasoningChains, ...incoming.reasoningChains],
    agreements: [...existing.agreements, ...incoming.agreements],
    constraints: [...existing.constraints, ...incoming.constraints],
    openQuestions: [...existing.openQuestions, ...incoming.openQuestions],
  };

  return enforceKeySizeCap(merged);
}

/**
 * Enforce size cap on keyNotes (80,000 chars max).
 * Trims oldest entries from each array to fit.
 */
export function enforceKeySizeCap(keyNotes: KeyNotes): KeyNotes {
  let current = JSON.stringify(keyNotes);

  if (current.length <= MAX_KEY_NOTES_CHARS) {
    return keyNotes;
  }

  // Create mutable copy
  const trimmed: KeyNotes = {
    decisions: [...keyNotes.decisions],
    reasoningChains: [...keyNotes.reasoningChains],
    agreements: [...keyNotes.agreements],
    constraints: [...keyNotes.constraints],
    openQuestions: [...keyNotes.openQuestions],
  };

  // Priority order for trimming (trim least important first)
  const trimOrder: (keyof KeyNotes)[] = [
    'reasoningChains',
    'agreements',
    'constraints',
    'openQuestions',
    'decisions',
  ];

  // Trim oldest entries until under cap
  while (JSON.stringify(trimmed).length > MAX_KEY_NOTES_CHARS) {
    let trimmed_any = false;

    for (const key of trimOrder) {
      if (trimmed[key].length > 1) {
        trimmed[key].shift(); // Remove oldest
        trimmed_any = true;
        break;
      }
    }

    // If we can't trim anymore, truncate individual strings
    if (!trimmed_any) {
      for (const key of trimOrder) {
        if (trimmed[key].length > 0 && trimmed[key][0].length > 100) {
          trimmed[key][0] = trimmed[key][0].slice(0, 100) + '...';
          trimmed_any = true;
          break;
        }
      }
    }

    // Safety: prevent infinite loop
    if (!trimmed_any) break;
  }

  return trimmed;
}

// -----------------------------------------------------------------------------
// Empty KeyNotes Factory
// -----------------------------------------------------------------------------

/**
 * Create empty keyNotes structure.
 */
export function createEmptyKeyNotes(): KeyNotes {
  return {
    decisions: [],
    reasoningChains: [],
    agreements: [],
    constraints: [],
    openQuestions: [],
  };
}
