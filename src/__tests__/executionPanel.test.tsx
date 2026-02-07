// =============================================================================
// The Brain — Execution Panel Tests (Batch 10)
// Component render tests for ExecutionPanel lifecycle states.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExecutionPanel } from '../components/ExecutionPanel';
import type { DecisionRecord } from '../types/brain';

// =============================================================================
// Helpers
// =============================================================================

function makeDecision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: 'dec-test-001',
    createdAt: Date.now(),
    mode: 'decision',
    promptProduced: true,
    claudeCodePrompt: '# Test Prompt\nStep 1: Build the thing\nStep 2: Test the thing',
    blocked: false,
    ceoAgent: 'gpt',
    advisors: ['claude', 'gemini'],
    recentExchanges: [],
    keyNotes: null,
    epochId: 3,
    ...overrides,
  };
}

const noopFn = () => {};

// =============================================================================
// Render / Visibility
// =============================================================================

describe('ExecutionPanel visibility', () => {
  it('renders null when decision is null', () => {
    const { container } = render(
      <ExecutionPanel
        decision={null}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders null when decision has no prompt', () => {
    const { container } = render(
      <ExecutionPanel
        decision={makeDecision({ promptProduced: false, claudeCodePrompt: undefined })}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders panel when decision has prompt', () => {
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    expect(screen.getByTestId('execution-panel')).toBeTruthy();
  });
});

// =============================================================================
// Pending State
// =============================================================================

describe('ExecutionPanel pending state', () => {
  it('shows prompt text and copy button', () => {
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    expect(screen.getByTestId('execution-prompt-text').textContent).toContain('Test Prompt');
    expect(screen.getByTestId('execution-copy-btn')).toBeTruthy();
  });

  it('shows epoch and CEO metadata', () => {
    render(
      <ExecutionPanel
        decision={makeDecision({ epochId: 5, ceoAgent: 'claude' })}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    const panel = screen.getByTestId('execution-panel');
    expect(panel.textContent).toContain('Epoch #5');
    expect(panel.textContent).toContain('CLAUDE');
  });

  it('shows "I\'m Executing This" button', () => {
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    expect(screen.getByTestId('mark-executing-btn')).toBeTruthy();
  });

  it('shows iterate button', () => {
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    expect(screen.getByTestId('iterate-btn-pending')).toBeTruthy();
  });
});

// =============================================================================
// Executing State
// =============================================================================

describe('ExecutionPanel executing state', () => {
  it('transitions to executing state on button click', () => {
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    fireEvent.click(screen.getByTestId('mark-executing-btn'));
    expect(screen.getByTestId('execution-results-input')).toBeTruthy();
  });

  it('shows results textarea in executing state', () => {
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    fireEvent.click(screen.getByTestId('mark-executing-btn'));
    const textarea = screen.getByTestId('execution-results-input') as HTMLTextAreaElement;
    expect(textarea.tagName.toLowerCase()).toBe('textarea');
  });

  it('submit button is disabled when results are empty', () => {
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    fireEvent.click(screen.getByTestId('mark-executing-btn'));
    const submitBtn = screen.getByTestId('submit-results-btn') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });
});

// =============================================================================
// Results Submission
// =============================================================================

describe('ExecutionPanel results submission', () => {
  it('calls onSubmitResult with trimmed text', () => {
    const onSubmit = vi.fn();
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult={null}
        onSubmitResult={onSubmit}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    fireEvent.click(screen.getByTestId('mark-executing-btn'));
    const textarea = screen.getByTestId('execution-results-input');
    fireEvent.change(textarea, { target: { value: '  Commit abc123. 5 tests pass.  ' } });
    fireEvent.click(screen.getByTestId('submit-results-btn'));
    expect(onSubmit).toHaveBeenCalledWith('Commit abc123. 5 tests pass.');
  });

  it('transitions to results_submitted after submit', () => {
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    fireEvent.click(screen.getByTestId('mark-executing-btn'));
    fireEvent.change(screen.getByTestId('execution-results-input'), {
      target: { value: 'Result text' },
    });
    fireEvent.click(screen.getByTestId('submit-results-btn'));
    expect(screen.getByTestId('submitted-results-text')).toBeTruthy();
    expect(screen.getByTestId('submitted-results-text').textContent).toContain('Result text');
  });

  it('shows Mark Done and Iterate buttons after submission', () => {
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    fireEvent.click(screen.getByTestId('mark-executing-btn'));
    fireEvent.change(screen.getByTestId('execution-results-input'), {
      target: { value: 'Done' },
    });
    fireEvent.click(screen.getByTestId('submit-results-btn'));
    expect(screen.getByTestId('mark-done-btn')).toBeTruthy();
    expect(screen.getByTestId('iterate-btn-results')).toBeTruthy();
  });
});

// =============================================================================
// Existing Result (mode switch survival)
// =============================================================================

describe('ExecutionPanel existing result', () => {
  it('starts at results_submitted when existingResult is provided', () => {
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult="Previous execution output"
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    // Should skip pending and executing, go straight to results_submitted
    expect(screen.getByTestId('submitted-results-text')).toBeTruthy();
    expect(screen.getByTestId('submitted-results-text').textContent).toContain('Previous execution output');
  });
});

// =============================================================================
// Done State
// =============================================================================

describe('ExecutionPanel done state', () => {
  it('transitions to done on Mark Done click', () => {
    const onDone = vi.fn();
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult="Some results"
        onSubmitResult={noopFn}
        onMarkDone={onDone}
        onIterate={noopFn}
      />
    );
    fireEvent.click(screen.getByTestId('mark-done-btn'));
    expect(onDone).toHaveBeenCalled();
    expect(screen.getByTestId('execution-panel').textContent).toContain('Execution Complete');
  });

  it('shows New Decision button in done state', () => {
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult="Results"
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={noopFn}
      />
    );
    fireEvent.click(screen.getByTestId('mark-done-btn'));
    expect(screen.getByTestId('new-decision-btn')).toBeTruthy();
  });
});

// =============================================================================
// Callbacks
// =============================================================================

describe('ExecutionPanel callbacks', () => {
  it('calls onIterate when iterate button is clicked (pending)', () => {
    const onIterate = vi.fn();
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult={null}
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={onIterate}
      />
    );
    fireEvent.click(screen.getByTestId('iterate-btn-pending'));
    expect(onIterate).toHaveBeenCalled();
  });

  it('calls onIterate when iterate button is clicked (results)', () => {
    const onIterate = vi.fn();
    render(
      <ExecutionPanel
        decision={makeDecision()}
        existingResult="Results"
        onSubmitResult={noopFn}
        onMarkDone={noopFn}
        onIterate={onIterate}
      />
    );
    fireEvent.click(screen.getByTestId('iterate-btn-results'));
    expect(onIterate).toHaveBeenCalled();
  });
});
