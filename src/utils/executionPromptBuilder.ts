// =============================================================================
// The Brain — Execution Prompt Builder
// Builds Claude Code prompts from exchange responses
// =============================================================================

import type { Exchange, Agent } from '../types/brain';

/**
 * Agent order for building execution prompts
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
 * Build a Claude Code execution prompt from the last exchange.
 * Combines all successful agent responses into a structured prompt.
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
