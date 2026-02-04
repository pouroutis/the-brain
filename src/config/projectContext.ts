// =============================================================================
// The Brain — Project Discussion Mode Context
// Injected into agent prompts when Project Discussion Mode is enabled
// =============================================================================

/**
 * Project context for "The Brain" development discussions.
 * Injected into all agent system prompts when Project Discussion Mode is ON.
 *
 * NO SECRETS - This is visible in prompts.
 */
export const PROJECT_CONTEXT = `
=== PROJECT: THE BRAIN ===

SUMMARY:
The Brain is a multi-AI decision support system where three AI advisors (GPT, Claude, Gemini)
collaborate to provide comprehensive analysis. Users submit questions, advisors deliberate,
and a CEO agent synthesizes the final recommendation.

PHASE STATUS:
- Phase 11 (Foundation): Complete — production guards, circuit breaker, daily caps
- Phase 12 (CEO Brain Pivot): In progress — advisors speak first, CEO speaks last

LOCKED RULES:
1. CEO speaks exactly ONCE (final synthesis only)
2. NO questionnaires or follow-up questions in responses
3. Privacy-first: no PII logging, no conversation storage
4. Advisors provide independent analysis, not meta-commentary
5. Response format: RECOMMENDATION, RATIONALE, RISKS, NEXT ACTIONS

TESTING FLAGS:
- FORCE_ALL_ADVISORS: When ON, all 3 advisors always respond (ignores gatekeeping)
- PROJECT_DISCUSSION_MODE: This mode — adds project context to prompts

ARCHITECTURE:
- Frontend: React + TypeScript + Vite
- Backend: Supabase Edge Functions (Deno)
- Orchestration: BrainContext.tsx (client) or ghost-orchestrator (server)
`.trim();

/**
 * Agent-specific persona lines for Project Discussion Mode.
 * Appended after PROJECT_CONTEXT to specialize each agent's focus.
 */
export const AGENT_PERSONAS: Record<'gpt' | 'claude' | 'gemini', string> = {
  gpt: `
YOUR ROLE IN THIS DISCUSSION: Product & Strategy Advisor
Focus on: product direction, user experience, feature prioritization, business value,
and strategic trade-offs. Think like a product manager.
`.trim(),

  claude: `
YOUR ROLE IN THIS DISCUSSION: Engineering & Architecture Advisor
Focus on: code quality, system design, technical debt, implementation patterns,
testing strategies, and maintainability. Think like a senior engineer.
`.trim(),

  gemini: `
YOUR ROLE IN THIS DISCUSSION: Risk & Edge-Cases Advisor
Focus on: failure modes, security concerns, scalability limits, edge cases,
compliance issues, and what could go wrong. Think like a QA lead.
`.trim(),
};

/**
 * Build the full project context prefix for an agent.
 * Returns empty string if projectDiscussionMode is false.
 */
export function buildProjectContextPrefix(
  agent: 'gpt' | 'claude' | 'gemini',
  projectDiscussionMode: boolean
): string {
  if (!projectDiscussionMode) {
    return '';
  }
  return `${PROJECT_CONTEXT}\n\n${AGENT_PERSONAS[agent]}\n\n---\n\n`;
}
