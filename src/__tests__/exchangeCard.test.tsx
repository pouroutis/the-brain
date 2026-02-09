// =============================================================================
// The Brain — ExchangeCard V3-C Round-Aware Rendering Tests
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Agent, AgentResponse, Round } from '../types/brain';
import { ExchangeCard } from '../components/ExchangeCard';

// -----------------------------------------------------------------------------
// Mock WorkItemContext (AgentCard depends on useWorkItems)
// -----------------------------------------------------------------------------

vi.mock('../context/WorkItemContext', () => ({
  useWorkItems: () => ({
    selectedWorkItemId: null,
    updateShelf: vi.fn(),
  }),
}));

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function successResponse(agent: Agent, content: string): AgentResponse {
  return { agent, timestamp: Date.now(), status: 'success', content };
}

function makeRound(roundNumber: number, agents: Partial<Record<Agent, AgentResponse>>): Round {
  return { roundNumber, responsesByAgent: agents };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('ExchangeCard — V3-C Round-Aware Rendering', () => {
  // ---------------------------------------------------------------------------
  // Single-round exchange: no round label rendered
  // ---------------------------------------------------------------------------

  it('single-round expanded: renders agents without round labels', () => {
    const rounds: Round[] = [
      makeRound(1, {
        gpt: successResponse('gpt', 'GPT round 1'),
        claude: successResponse('claude', 'Claude round 1'),
      }),
    ];

    render(
      <ExchangeCard
        userPrompt="test prompt"
        rounds={rounds}
        isPending={false}
        currentAgent={null}
        mode="discussion"
        anchorAgent="gpt"
        showDiscussion={true}
      />
    );

    // Agent content should be visible
    expect(screen.getByText('GPT round 1')).toBeDefined();
    expect(screen.getByText('Claude round 1')).toBeDefined();

    // No round labels for single-round exchanges
    expect(screen.queryAllByTestId('round-label')).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Multi-round exchange expanded: all rounds rendered with "Round N" labels
  // ---------------------------------------------------------------------------

  it('multi-round expanded: renders all rounds with Round N labels', () => {
    const rounds: Round[] = [
      makeRound(1, {
        gpt: successResponse('gpt', 'GPT round 1'),
        claude: successResponse('claude', 'Claude round 1'),
      }),
      makeRound(2, {
        gpt: successResponse('gpt', 'GPT round 2'),
        claude: successResponse('claude', 'Claude round 2'),
        gemini: successResponse('gemini', 'Gemini round 2'),
      }),
    ];

    render(
      <ExchangeCard
        userPrompt="test prompt"
        rounds={rounds}
        isPending={false}
        currentAgent={null}
        mode="discussion"
        anchorAgent="gpt"
        showDiscussion={true}
      />
    );

    // All agent content from both rounds should be visible
    expect(screen.getByText('GPT round 1')).toBeDefined();
    expect(screen.getByText('Claude round 1')).toBeDefined();
    expect(screen.getByText('GPT round 2')).toBeDefined();
    expect(screen.getByText('Claude round 2')).toBeDefined();
    expect(screen.getByText('Gemini round 2')).toBeDefined();

    // Round labels should be present for multi-round
    const roundLabels = screen.getAllByTestId('round-label');
    expect(roundLabels).toHaveLength(2);
    expect(roundLabels[0].textContent).toBe('Round 1');
    expect(roundLabels[1].textContent).toBe('Round 2');
  });

  // ---------------------------------------------------------------------------
  // Multi-round exchange collapsed: only anchor agent from final round
  // ---------------------------------------------------------------------------

  it('multi-round collapsed: shows only anchor agent from final round with Outcome label', () => {
    const rounds: Round[] = [
      makeRound(1, {
        gpt: successResponse('gpt', 'GPT round 1'),
        claude: successResponse('claude', 'Claude round 1'),
      }),
      makeRound(2, {
        gpt: successResponse('gpt', 'GPT final answer'),
        claude: successResponse('claude', 'Claude round 2'),
      }),
    ];

    render(
      <ExchangeCard
        userPrompt="test prompt"
        rounds={rounds}
        isPending={false}
        currentAgent={null}
        mode="discussion"
        anchorAgent="gpt"
        showDiscussion={false}
      />
    );

    // Only anchor agent's final round response should be visible
    expect(screen.getByText('GPT final answer')).toBeDefined();

    // Other responses should NOT be visible
    expect(screen.queryByText('GPT round 1')).toBeNull();
    expect(screen.queryByText('Claude round 1')).toBeNull();
    expect(screen.queryByText('Claude round 2')).toBeNull();

    // "Outcome" label should be visible
    expect(screen.getByText('Outcome')).toBeDefined();

    // No round labels in collapsed view
    expect(screen.queryAllByTestId('round-label')).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Pending exchange: renders flat responsesByAgent, no round labels
  // ---------------------------------------------------------------------------

  it('pending exchange: renders flat responsesByAgent without round labels', () => {
    const responsesByAgent: Partial<Record<Agent, AgentResponse>> = {
      gpt: successResponse('gpt', 'GPT streaming'),
    };

    render(
      <ExchangeCard
        userPrompt="pending prompt"
        responsesByAgent={responsesByAgent}
        isPending={true}
        currentAgent="claude"
        mode="discussion"
        anchorAgent="gpt"
        showDiscussion={true}
      />
    );

    // Agent content should be visible
    expect(screen.getByText('GPT streaming')).toBeDefined();

    // No round labels for pending exchanges
    expect(screen.queryAllByTestId('round-label')).toHaveLength(0);

    // No "Outcome" label for pending exchanges
    expect(screen.queryByText('Outcome')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Three rounds: all labels correct
  // ---------------------------------------------------------------------------

  it('three-round expanded: renders Round 1, Round 2, Round 3 labels', () => {
    const rounds: Round[] = [
      makeRound(1, { gpt: successResponse('gpt', 'R1') }),
      makeRound(2, { gpt: successResponse('gpt', 'R2') }),
      makeRound(3, { gpt: successResponse('gpt', 'R3') }),
    ];

    render(
      <ExchangeCard
        userPrompt="test"
        rounds={rounds}
        isPending={false}
        currentAgent={null}
        mode="discussion"
        anchorAgent="gpt"
        showDiscussion={true}
      />
    );

    const roundLabels = screen.getAllByTestId('round-label');
    expect(roundLabels).toHaveLength(3);
    expect(roundLabels[0].textContent).toBe('Round 1');
    expect(roundLabels[1].textContent).toBe('Round 2');
    expect(roundLabels[2].textContent).toBe('Round 3');
  });

  // ---------------------------------------------------------------------------
  // Collapsed single-round: Outcome label, no round label
  // ---------------------------------------------------------------------------

  it('single-round collapsed: shows Outcome label, anchor agent only, no round labels', () => {
    const rounds: Round[] = [
      makeRound(1, {
        gpt: successResponse('gpt', 'GPT only answer'),
        claude: successResponse('claude', 'Claude answer'),
      }),
    ];

    render(
      <ExchangeCard
        userPrompt="test"
        rounds={rounds}
        isPending={false}
        currentAgent={null}
        mode="discussion"
        anchorAgent="gpt"
        showDiscussion={false}
      />
    );

    expect(screen.getByText('Outcome')).toBeDefined();
    expect(screen.getByText('GPT only answer')).toBeDefined();
    expect(screen.queryByText('Claude answer')).toBeNull();
    expect(screen.queryAllByTestId('round-label')).toHaveLength(0);
  });
});
