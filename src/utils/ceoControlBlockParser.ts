// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// CEO Control Block Parser (Discussion Mode)
// =============================================================================

import type { CeoPromptArtifact } from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * CEO control block structure.
 * Format: {"ceo_action": "FINALIZE_PROMPT", "claude_code_prompt": "..."}
 */
interface CeoControlBlock {
  ceo_action: string;
  claude_code_prompt?: string;
}

/**
 * Result of parsing CEO content for control blocks.
 */
export interface ParsedCeoResponse {
  /** Whether a FINALIZE_PROMPT action was found */
  hasPromptArtifact: boolean;
  /** The extracted prompt text (if found) */
  promptText: string | null;
  /** The content with control block removed (for display) */
  displayContent: string;
}

// -----------------------------------------------------------------------------
// Parser
// -----------------------------------------------------------------------------

/**
 * Regex to match JSON control block in CEO response.
 * Matches: {"ceo_action": "...", ...} anywhere in the text
 */
const CEO_CONTROL_BLOCK_REGEX = /\{[\s\S]*?"ceo_action"\s*:\s*"[^"]*"[\s\S]*?\}/g;

/**
 * Parse CEO response content for control blocks.
 * Extracts FINALIZE_PROMPT artifacts for the right pane.
 */
export function parseCeoControlBlock(content: string): ParsedCeoResponse {
  const result: ParsedCeoResponse = {
    hasPromptArtifact: false,
    promptText: null,
    displayContent: content,
  };

  const matches = content.match(CEO_CONTROL_BLOCK_REGEX);
  if (!matches) {
    return result;
  }

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match) as CeoControlBlock;

      if (parsed.ceo_action === 'FINALIZE_PROMPT' && parsed.claude_code_prompt) {
        result.hasPromptArtifact = true;
        result.promptText = parsed.claude_code_prompt;
        // Remove the control block from display content
        result.displayContent = content.replace(match, '').trim();
        // Only process first FINALIZE_PROMPT found
        break;
      }
    } catch {
      // Invalid JSON, skip this match
      continue;
    }
  }

  return result;
}

/**
 * Create a new CeoPromptArtifact with incremented version.
 */
export function createCeoPromptArtifact(
  promptText: string,
  existingArtifact: CeoPromptArtifact | null
): CeoPromptArtifact {
  return {
    text: promptText,
    version: existingArtifact ? existingArtifact.version + 1 : 1,
    createdAt: new Date().toISOString(),
  };
}
