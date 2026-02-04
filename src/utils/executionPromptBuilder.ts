// =============================================================================
// The Brain — Execution Prompt Builder
// Builds Claude Code prompts from exchange responses
// =============================================================================

import type { Exchange, Agent, BrainMode, LoopState } from '../types/brain';

/**
 * Agent order for building execution prompts (legacy, all advisors)
 */
const AGENT_ORDER: Agent[] = ['gpt', 'claude', 'gemini'];

/**
 * Agent display names for the prompt
 */
const AGENT_NAMES: Record<Agent, string> = {
  gpt: 'GPT (Product/Strategy)',
  claude: 'Claude (Engineering)',
  gemini: 'Gemini (Risk/QA)',
};

/**
 * CEO role names for execution prompts
 */
const CEO_ROLE_NAMES: Record<Agent, string> = {
  gpt: 'GPT CEO',
  claude: 'Claude CEO',
  gemini: 'Gemini CEO',
};

/**
 * Build a Claude Code execution prompt from the last exchange.
 * Combines all successful agent responses into a structured prompt.
 * (Legacy function - use buildCeoExecutionPrompt for CEO-only prompts)
 *
 * @param exchange - The exchange to build the prompt from
 * @returns The formatted execution prompt string, or null if no content
 */
export function buildExecutionPrompt(exchange: Exchange | null): string | null {
  if (!exchange) {
    return null;
  }

  const responses: string[] = [];

  for (const agent of AGENT_ORDER) {
    const response = exchange.responsesByAgent[agent];
    if (response?.status === 'success' && response.content) {
      responses.push(`### ${AGENT_NAMES[agent]}\n${response.content}`);
    }
  }

  if (responses.length === 0) {
    return null;
  }

  const prompt = `# The Brain — Advisor Consensus

## Original Question
${exchange.userPrompt}

## Advisor Responses

${responses.join('\n\n')}

---

## Your Task

Based on the advisor responses above, implement the recommended changes. Follow the consensus where advisors agree. Where they disagree, use your judgment to pick the best approach and explain why.

Key priorities:
1. Address the original question directly
2. Follow the RECOMMENDATION sections
3. Consider the RISKS mentioned
4. Keep changes minimal and focused
`;

  return prompt;
}

/**
 * Mode display names for the prompt
 */
const MODE_NAMES: Record<BrainMode, string> = {
  discussion: 'Discussion',
  decision: 'Decision',
  project: 'Project',
};

/**
 * Loop state display names
 */
const LOOP_STATE_NAMES: Record<LoopState, string> = {
  idle: 'Idle',
  running: 'Running',
  paused: 'Paused',
};

/**
 * Build a CEO-only execution prompt from the last exchange.
 * Contains ONLY the CEO's final decision, formatted for direct Claude Code execution.
 * Includes current mode, CEO, loopState, and result artifact summary.
 *
 * @param exchange - The exchange to build the prompt from
 * @param ceo - The CEO agent whose response to extract
 * @param mode - The current operating mode
 * @param resultArtifact - The latest Claude Code execution result (optional)
 * @param loopState - The current loop state
 * @returns The formatted CEO execution prompt string, or null if CEO has no response
 */
export function buildCeoExecutionPrompt(
  exchange: Exchange | null,
  ceo: Agent,
  mode: BrainMode = 'project',
  resultArtifact: string | null = null,
  loopState: LoopState = 'idle'
): string | null {
  if (!exchange) {
    return null;
  }

  const ceoResponse = exchange.responsesByAgent[ceo];

  if (!ceoResponse || ceoResponse.status !== 'success' || !ceoResponse.content) {
    return null;
  }

  // Build result artifact section — show "NONE" if not present
  const resultSummary = resultArtifact
    ? resultArtifact.slice(0, 2000) + (resultArtifact.length > 2000 ? '\n...(truncated)' : '')
    : 'NONE';

  const prompt = `# The Brain — CEO Execution Directive

## Context
- **Mode:** ${MODE_NAMES[mode]}
- **CEO:** ${CEO_ROLE_NAMES[ceo]}
- **Loop State:** ${LOOP_STATE_NAMES[loopState]}
- **Previous Result:** ${resultSummary}

## Original Question
${exchange.userPrompt}

## ${CEO_ROLE_NAMES[ceo]} Decision

${ceoResponse.content}

---

## Your Task

Execute the CEO's directive above. This is the final decision after advisor deliberation.

Key priorities:
1. Follow the CEO's instructions precisely
2. Implement the recommended approach
3. Address any risks or concerns mentioned
4. Keep changes focused and minimal
`;

  return prompt;
}
