// =============================================================================
// The Brain — Epoch Status Badge (Batch 8 — UI Transparency)
// Read-only display of DecisionEpoch state: epoch ID, round, phase.
// =============================================================================

import type { DecisionEpoch } from '../types/brain';

interface EpochStatusBadgeProps {
  epoch: DecisionEpoch | null;
}

const PHASE_LABELS: Record<string, { label: string; icon: string }> = {
  IDLE: { label: 'Idle', icon: '⏸' },
  ADVISORS: { label: 'Analyzing', icon: '🔍' },
  CEO_DRAFT: { label: 'CEO Drafting', icon: '✏️' },
  ADVISOR_REVIEW: { label: 'Reviewing', icon: '📋' },
  CEO_FINAL: { label: 'CEO Finalizing', icon: '📝' },
  EPOCH_COMPLETE: { label: 'Complete', icon: '✅' },
  EPOCH_BLOCKED: { label: 'Blocked', icon: '⛔' },
  EPOCH_STOPPED: { label: 'Stopped', icon: '⏹' },
};

function getPhaseModifier(phase: string): string {
  if (phase === 'EPOCH_COMPLETE') return 'complete';
  if (phase === 'EPOCH_BLOCKED') return 'blocked';
  if (phase === 'EPOCH_STOPPED') return 'stopped';
  if (phase === 'IDLE') return 'idle';
  return 'active';
}

export function EpochStatusBadge({ epoch }: EpochStatusBadgeProps): JSX.Element | null {
  if (!epoch) return null;

  const phaseInfo = PHASE_LABELS[epoch.phase] ?? { label: epoch.phase, icon: '❓' };
  const modifier = getPhaseModifier(epoch.phase);

  return (
    <div
      className={`epoch-status-badge epoch-status-badge--${modifier}`}
      data-testid="epoch-status-badge"
    >
      <span className="epoch-status-badge__icon">{phaseInfo.icon}</span>
      <span className="epoch-status-badge__label">
        Epoch #{epoch.epochId} · Round {epoch.round} · {phaseInfo.label}
      </span>
    </div>
  );
}
