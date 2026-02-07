// =============================================================================
// The Brain — Verdict Banner Tests (Batch 12)
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VerdictBanner } from '../components/VerdictBanner';
import type { VerdictResolution } from '../utils/executionReviewParser';

function makeResolution(overrides: Partial<VerdictResolution> = {}): VerdictResolution {
  return {
    resolved: true,
    verdict: 'ACCEPT',
    source: 'consensus',
    ceoAgent: 'gpt',
    rationale: 'All 3 reviewers agree: ACCEPT',
    nextAction: null,
    ...overrides,
  };
}

const noopFn = () => {};

describe('VerdictBanner resolved states', () => {
  it('renders ACCEPT verdict with Accept button', () => {
    render(
      <VerdictBanner
        resolution={makeResolution()}
        onAccept={noopFn}
        onIterate={noopFn}
      />
    );
    const banner = screen.getByTestId('verdict-banner');
    expect(banner.className).toContain('verdict-banner--accept');
    expect(banner.textContent).toContain('Accept');
    expect(screen.getByTestId('verdict-accept-btn')).toBeTruthy();
  });

  it('renders REVISE verdict with Revise button', () => {
    render(
      <VerdictBanner
        resolution={makeResolution({ verdict: 'REVISE', source: 'ceo_synthesis' })}
        onAccept={noopFn}
        onIterate={noopFn}
      />
    );
    const banner = screen.getByTestId('verdict-banner');
    expect(banner.className).toContain('verdict-banner--revise');
    expect(screen.getByTestId('verdict-revise-btn')).toBeTruthy();
  });

  it('renders FAIL verdict with New Strategy button', () => {
    render(
      <VerdictBanner
        resolution={makeResolution({ verdict: 'FAIL' })}
        onAccept={noopFn}
        onIterate={noopFn}
      />
    );
    const banner = screen.getByTestId('verdict-banner');
    expect(banner.className).toContain('verdict-banner--fail');
    expect(screen.getByTestId('verdict-fail-btn')).toBeTruthy();
  });

  it('shows rationale text', () => {
    render(
      <VerdictBanner
        resolution={makeResolution({ rationale: 'Implementation meets all requirements' })}
        onAccept={noopFn}
        onIterate={noopFn}
      />
    );
    expect(screen.getByTestId('verdict-rationale').textContent).toContain('Implementation meets all requirements');
  });

  it('shows next action when present and not "None"', () => {
    render(
      <VerdictBanner
        resolution={makeResolution({ verdict: 'REVISE', nextAction: 'Add retry logic to auth.ts' })}
        onAccept={noopFn}
        onIterate={noopFn}
      />
    );
    expect(screen.getByTestId('verdict-next-action').textContent).toContain('Add retry logic');
  });

  it('hides next action when "None"', () => {
    render(
      <VerdictBanner
        resolution={makeResolution({ nextAction: 'None' })}
        onAccept={noopFn}
        onIterate={noopFn}
      />
    );
    expect(screen.queryByTestId('verdict-next-action')).toBeNull();
  });

  it('shows source label', () => {
    render(
      <VerdictBanner
        resolution={makeResolution({ source: 'ceo_synthesis' })}
        onAccept={noopFn}
        onIterate={noopFn}
      />
    );
    expect(screen.getByTestId('verdict-banner').textContent).toContain('CEO Synthesis');
  });

  it('always shows Override button', () => {
    render(
      <VerdictBanner
        resolution={makeResolution()}
        onAccept={noopFn}
        onIterate={noopFn}
      />
    );
    expect(screen.getByTestId('verdict-override-btn')).toBeTruthy();
  });
});

describe('VerdictBanner unresolved state', () => {
  it('shows Request CEO Verdict button when unresolved', () => {
    const onRequest = vi.fn();
    render(
      <VerdictBanner
        resolution={makeResolution({ resolved: false, verdict: null, source: null })}
        onAccept={noopFn}
        onIterate={noopFn}
        onRequestCeoVerdict={onRequest}
      />
    );
    const banner = screen.getByTestId('verdict-banner');
    expect(banner.className).toContain('verdict-banner--unresolved');
    expect(screen.getByTestId('request-ceo-verdict-btn')).toBeTruthy();
  });

  it('fires onRequestCeoVerdict callback', () => {
    const onRequest = vi.fn();
    render(
      <VerdictBanner
        resolution={makeResolution({ resolved: false, verdict: null })}
        onAccept={noopFn}
        onIterate={noopFn}
        onRequestCeoVerdict={onRequest}
      />
    );
    fireEvent.click(screen.getByTestId('request-ceo-verdict-btn'));
    expect(onRequest).toHaveBeenCalled();
  });
});

describe('VerdictBanner synthesizing state', () => {
  it('shows synthesizing indicator', () => {
    render(
      <VerdictBanner
        resolution={makeResolution({ resolved: false, verdict: null })}
        isSynthesizing={true}
        onAccept={noopFn}
        onIterate={noopFn}
      />
    );
    const banner = screen.getByTestId('verdict-banner');
    expect(banner.className).toContain('verdict-banner--synthesizing');
    expect(banner.textContent).toContain('CEO is synthesizing');
  });
});

describe('VerdictBanner callbacks', () => {
  it('fires onAccept when Accept button clicked', () => {
    const onAccept = vi.fn();
    render(
      <VerdictBanner
        resolution={makeResolution()}
        onAccept={onAccept}
        onIterate={noopFn}
      />
    );
    fireEvent.click(screen.getByTestId('verdict-accept-btn'));
    expect(onAccept).toHaveBeenCalled();
  });

  it('fires onIterate when Revise button clicked', () => {
    const onIterate = vi.fn();
    render(
      <VerdictBanner
        resolution={makeResolution({ verdict: 'REVISE' })}
        onAccept={noopFn}
        onIterate={onIterate}
      />
    );
    fireEvent.click(screen.getByTestId('verdict-revise-btn'));
    expect(onIterate).toHaveBeenCalled();
  });

  it('fires onIterate when Override button clicked', () => {
    const onIterate = vi.fn();
    render(
      <VerdictBanner
        resolution={makeResolution()}
        onAccept={noopFn}
        onIterate={onIterate}
      />
    );
    fireEvent.click(screen.getByTestId('verdict-override-btn'));
    expect(onIterate).toHaveBeenCalled();
  });
});
