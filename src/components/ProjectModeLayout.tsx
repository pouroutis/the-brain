// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ProjectModeLayout Component (Project Dashboard - Read Only)
// =============================================================================

import { useState } from 'react';
import { ProjectSidebar } from './ProjectSidebar';
import { ExecutionPanel } from './ExecutionPanel';
import type { ProjectState, DecisionRecord, Exchange } from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ProjectModeLayoutProps {
  /** All saved projects for sidebar */
  projects: ProjectState[];
  /** Currently active project (full data) */
  activeProject: ProjectState | null;
  /** Callback when user selects a project */
  onSelectProject: (projectId: string) => void;
  /** Callback when user clicks New Project */
  onNewProject: () => void;
  /** Callback when user deletes a project */
  onDeleteProject: (projectId: string) => void;
  /** Callback to enter Decision mode for this project */
  onContinueInDecisionMode: () => void;
  /** Existing execution result artifact (survives mode switches) */
  resultArtifact: string | null;
  /** Callback to store execution results */
  onSubmitResult: (result: string) => void;
  /** Callback to mark execution as done */
  onMarkExecutionDone: () => void;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Format timestamp to readable date string
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Get status display info
 */
function getStatusDisplay(status: ProjectState['status']): { label: string; className: string } {
  switch (status) {
    case 'active':
      return { label: 'Active', className: 'project-dashboard__status--active' };
    case 'blocked':
      return { label: 'Blocked', className: 'project-dashboard__status--blocked' };
    case 'done':
      return { label: 'Complete', className: 'project-dashboard__status--done' };
    default:
      return { label: 'Unknown', className: '' };
  }
}

/**
 * Get the last blocked decision's reason
 */
function getLastBlockedReason(decisions: DecisionRecord[]): string | null {
  for (let i = decisions.length - 1; i >= 0; i--) {
    const d = decisions[i];
    if (d.blocked && d.blockedReason) {
      return d.blockedReason;
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// Sub-Components
// -----------------------------------------------------------------------------

interface DecisionCardProps {
  decision: DecisionRecord;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function DecisionCard({ decision, index, isExpanded, onToggle }: DecisionCardProps): JSX.Element {
  const hasPrompt = decision.promptProduced && decision.claudeCodePrompt;

  return (
    <div className="project-dashboard__decision-card" data-testid={`decision-card-${index}`}>
      <div className="project-dashboard__decision-header">
        <span className="project-dashboard__decision-number">#{index + 1}</span>
        <span className="project-dashboard__decision-date">{formatDate(decision.createdAt)}</span>
        <span className="project-dashboard__decision-ceo">CEO: {decision.ceoAgent.toUpperCase()}</span>
        {decision.blocked && (
          <span className="project-dashboard__decision-blocked">BLOCKED</span>
        )}
        {hasPrompt && (
          <button
            className="project-dashboard__decision-toggle"
            onClick={onToggle}
            data-testid={`decision-toggle-${index}`}
          >
            {isExpanded ? '▼ Hide Prompt' : '▶ Show Prompt'}
          </button>
        )}
      </div>
      {hasPrompt && isExpanded && (
        <div className="project-dashboard__decision-prompt">
          <pre>{decision.claudeCodePrompt}</pre>
        </div>
      )}
      {decision.blocked && decision.blockedReason && (
        <div className="project-dashboard__decision-blocked-reason">
          <strong>Blocked:</strong> {decision.blockedReason}
        </div>
      )}
    </div>
  );
}

interface ExchangeItemProps {
  exchange: Exchange;
  index: number;
}

function ExchangeItem({ exchange, index }: ExchangeItemProps): JSX.Element {
  return (
    <div className="project-dashboard__exchange-item">
      <span className="project-dashboard__exchange-number">#{index + 1}</span>
      <span className="project-dashboard__exchange-prompt">
        {exchange.userPrompt.slice(0, 100)}{exchange.userPrompt.length > 100 ? '...' : ''}
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ProjectModeLayout({
  projects,
  activeProject,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onContinueInDecisionMode,
  resultArtifact,
  onSubmitResult,
  onMarkExecutionDone,
}: ProjectModeLayoutProps): JSX.Element {
  const statusDisplay = activeProject ? getStatusDisplay(activeProject.status) : null;

  // Local state for expand/collapse
  const [expandedDecisions, setExpandedDecisions] = useState<Set<string>>(new Set());
  const [showRecentExchanges, setShowRecentExchanges] = useState(false);

  const toggleDecisionExpand = (decisionId: string) => {
    setExpandedDecisions((prev) => {
      const next = new Set(prev);
      if (next.has(decisionId)) {
        next.delete(decisionId);
      } else {
        next.add(decisionId);
      }
      return next;
    });
  };

  // Get blocked reason if project is blocked
  const isBlocked = activeProject?.status === 'blocked';
  const blockedReason = activeProject ? getLastBlockedReason(activeProject.decisions) : null;

  // Get recent exchanges count
  const recentExchanges = activeProject?.projectMemory.recentExchanges ?? [];
  const exchangeCount = recentExchanges.length;

  // Find the latest decision that produced a Claude Code prompt
  const latestPromptDecision = activeProject
    ? [...activeProject.decisions].reverse().find(d => d.promptProduced && d.claudeCodePrompt)
    : null;

  return (
    <div className="project-mode-layout" data-testid="project-mode-layout">
      {/* Left Rail: Project Sidebar */}
      <ProjectSidebar
        projects={projects}
        activeProjectId={activeProject?.id ?? null}
        onSelectProject={onSelectProject}
        onNewProject={onNewProject}
        onDeleteProject={onDeleteProject}
        projectFiles={activeProject?.projectFiles ?? []}
        onAddFiles={() => {}}
        onRemoveFile={() => {}}
        onClearFiles={() => {}}
      />

      {/* Main Content: Project Dashboard */}
      <div className="project-dashboard" data-testid="project-dashboard">
        {!activeProject ? (
          /* Empty State */
          <div className="project-dashboard__empty">
            <h2 className="project-dashboard__empty-title">No Project Selected</h2>
            <p className="project-dashboard__empty-desc">
              Select a project from the sidebar or create a new one to get started.
            </p>
            <button
              className="project-dashboard__empty-btn"
              onClick={onNewProject}
              data-testid="empty-new-project-btn"
            >
              + New Project
            </button>
          </div>
        ) : (
          /* Project Details */
          <>
            {/* Blocked Banner */}
            {isBlocked && (
              <div className="project-dashboard__blocked-banner" data-testid="blocked-banner">
                <div className="project-dashboard__blocked-icon">⛔</div>
                <div className="project-dashboard__blocked-content">
                  <h3 className="project-dashboard__blocked-title">CEO BLOCKED</h3>
                  {blockedReason && (
                    <p className="project-dashboard__blocked-reason">{blockedReason}</p>
                  )}
                </div>
                <button
                  className="project-dashboard__blocked-btn"
                  onClick={onContinueInDecisionMode}
                  data-testid="return-to-decision-btn"
                >
                  Return to Decision
                </button>
              </div>
            )}

            {/* Execution Panel (Batch 10) */}
            <ExecutionPanel
              decision={latestPromptDecision ?? null}
              existingResult={resultArtifact}
              onSubmitResult={onSubmitResult}
              onMarkDone={onMarkExecutionDone}
              onIterate={onContinueInDecisionMode}
            />

            {/* Project Header */}
            <div className="project-dashboard__header">
              <h2 className="project-dashboard__title">
                {activeProject.title || `Project ${activeProject.id.slice(5, 15)}...`}
              </h2>
              <span className={`project-dashboard__status ${statusDisplay?.className}`}>
                {statusDisplay?.label}
              </span>
            </div>

            {/* Project Meta */}
            <div className="project-dashboard__meta">
              <div className="project-dashboard__meta-item">
                <span className="project-dashboard__meta-label">Created:</span>
                <span className="project-dashboard__meta-value">{formatDate(activeProject.createdAt)}</span>
              </div>
              <div className="project-dashboard__meta-item">
                <span className="project-dashboard__meta-label">Last Updated:</span>
                <span className="project-dashboard__meta-value">{formatDate(activeProject.updatedAt)}</span>
              </div>
              <div className="project-dashboard__meta-item">
                <span className="project-dashboard__meta-label">Decisions:</span>
                <span className="project-dashboard__meta-value">{activeProject.decisions.length}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="project-dashboard__actions">
              <button
                className="project-dashboard__action-btn project-dashboard__action-btn--primary"
                onClick={onContinueInDecisionMode}
                data-testid="continue-decision-btn"
              >
                Continue in Decision Mode
              </button>
            </div>

            {/* Recent Exchanges (Project Memory) */}
            {exchangeCount > 0 && (
              <div className="project-dashboard__exchanges">
                <div className="project-dashboard__section-header">
                  <h3 className="project-dashboard__section-title">Recent Exchanges</h3>
                  <button
                    className="project-dashboard__expand-btn"
                    onClick={() => setShowRecentExchanges(!showRecentExchanges)}
                    data-testid="toggle-exchanges-btn"
                  >
                    {showRecentExchanges ? '▼ Hide' : `▶ Show (${exchangeCount} captured)`}
                  </button>
                </div>
                {showRecentExchanges && (
                  <div className="project-dashboard__exchange-list">
                    {recentExchanges.map((exchange, index) => (
                      <ExchangeItem key={exchange.id} exchange={exchange} index={index} />
                    ))}
                  </div>
                )}
                {!showRecentExchanges && (
                  <p className="project-dashboard__exchange-count">
                    {exchangeCount} exchange{exchangeCount !== 1 ? 's' : ''} captured in project memory
                  </p>
                )}
              </div>
            )}

            {/* Decision History */}
            <div className="project-dashboard__decisions">
              <h3 className="project-dashboard__section-title">Decision History</h3>
              {activeProject.decisions.length === 0 ? (
                <p className="project-dashboard__no-decisions">
                  No decisions recorded yet. Continue in Decision mode to add decisions.
                </p>
              ) : (
                <div className="project-dashboard__decision-list">
                  {activeProject.decisions.map((decision, index) => (
                    <DecisionCard
                      key={decision.id}
                      decision={decision}
                      index={index}
                      isExpanded={expandedDecisions.has(decision.id)}
                      onToggle={() => toggleDecisionExpand(decision.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Key Notes Summary (if any) */}
            {activeProject.projectMemory.keyNotes && (
              <div className="project-dashboard__keynotes">
                <h3 className="project-dashboard__section-title">Key Notes</h3>
                <div className="project-dashboard__keynotes-content">
                  {activeProject.projectMemory.keyNotes.decisions.length > 0 && (
                    <div className="project-dashboard__keynotes-section">
                      <h4>Decisions Made</h4>
                      <ul>
                        {activeProject.projectMemory.keyNotes.decisions.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {activeProject.projectMemory.keyNotes.constraints.length > 0 && (
                    <div className="project-dashboard__keynotes-section">
                      <h4>Constraints</h4>
                      <ul>
                        {activeProject.projectMemory.keyNotes.constraints.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {activeProject.projectMemory.keyNotes.openQuestions.length > 0 && (
                    <div className="project-dashboard__keynotes-section">
                      <h4>Open Questions</h4>
                      <ul>
                        {activeProject.projectMemory.keyNotes.openQuestions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
