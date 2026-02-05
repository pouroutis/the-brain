// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// ProjectModeLayout Component (Two-Pane Layout)
// =============================================================================

import { useCallback, useState } from 'react';
import type { Agent, BrainMode, Exchange, LoopState, PendingExchange, ProjectRun, SystemMessage } from '../types/brain';
import { ExchangeList } from './ExchangeList';
import { RequestChangeForm } from './RequestChangeForm';
import type { InterruptSeverity, InterruptScope } from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ProjectModeLayoutProps {
  // Left pane: Board deliberation
  exchanges: Exchange[];
  pendingExchange: PendingExchange | null;
  currentAgent: Agent | null;
  mode: BrainMode;
  ceo: Agent;
  systemMessages: SystemMessage[];
  // Right pane: Executor artifacts
  ceoPromptArtifact: string | null;
  executorOutput: string | null;
  projectError: string | null;
  loopState: LoopState;
  projectRun: ProjectRun | null;
  // Callbacks
  onRequestChange: (message: string, severity: InterruptSeverity, scope: InterruptScope) => void;
  onCopyPrompt: () => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ProjectModeLayout({
  exchanges,
  pendingExchange,
  currentAgent,
  mode,
  ceo,
  systemMessages,
  ceoPromptArtifact,
  executorOutput,
  projectError,
  loopState,
  projectRun,
  onRequestChange,
  onCopyPrompt,
}: ProjectModeLayoutProps): JSX.Element {
  const [showRequestChangeForm, setShowRequestChangeForm] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const isRunning = loopState === 'running';
  const isFailed = loopState === 'failed';

  const handleCopyPrompt = useCallback(async () => {
    if (!ceoPromptArtifact) return;
    try {
      await navigator.clipboard.writeText(ceoPromptArtifact);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(null), 2000);
      onCopyPrompt();
    } catch {
      setCopyFeedback('Failed');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, [ceoPromptArtifact, onCopyPrompt]);

  const handleRequestChangeSubmit = useCallback(
    (message: string, severity: InterruptSeverity, scope: InterruptScope) => {
      onRequestChange(message, severity, scope);
      setShowRequestChangeForm(false);
    },
    [onRequestChange]
  );

  const handleRequestChangeCancel = useCallback(() => {
    setShowRequestChangeForm(false);
  }, []);

  // Get phase display name
  const getPhaseDisplay = (phase: string | undefined): string => {
    if (!phase) return 'Not Started';
    const phaseNames: Record<string, string> = {
      INTENT_RECEIVED: 'Intent Received',
      DELIBERATION: 'Deliberation',
      CONSENSUS_DRAFT: 'Consensus Draft',
      CEO_GATE: 'CEO Gate',
      CLAUDE_CODE_EXECUTION: 'Claude Code Execution',
      REVIEW: 'Review',
      USER_BUILD_GATE: 'User Build Gate',
      DONE: 'Done',
      FAILED_REQUIRES_USER_DIRECTION: 'Failed - Needs Direction',
    };
    return phaseNames[phase] ?? phase;
  };

  return (
    <div className="project-mode-layout" data-testid="project-mode-layout">
      {/* Left Pane: Board Deliberation */}
      <div className="project-mode-layout__left" data-testid="project-left-pane">
        <div className="project-mode-layout__header">
          <h3 className="project-mode-layout__title">Board Deliberation</h3>
          {isRunning && (
            <span className="project-mode-layout__status project-mode-layout__status--running">
              Running
            </span>
          )}
        </div>
        <div className="project-mode-layout__content">
          <ExchangeList
            exchanges={exchanges}
            pendingExchange={pendingExchange}
            currentAgent={currentAgent}
            mode={mode}
            ceo={ceo}
            systemMessages={systemMessages}
          />
        </div>
        {/* Request Change button - available during running */}
        {isRunning && (
          <div className="project-mode-layout__actions">
            <button
              className="project-mode-layout__button project-mode-layout__button--request-change"
              onClick={() => setShowRequestChangeForm(true)}
              title="Submit a structured change request"
            >
              Request Change
            </button>
          </div>
        )}
      </div>

      {/* Right Pane: Executor / Artifacts */}
      <div className="project-mode-layout__right" data-testid="project-right-pane">
        <div className="project-mode-layout__header">
          <h3 className="project-mode-layout__title">Executor Panel</h3>
        </div>

        {/* Phase Status */}
        {projectRun && (
          <div className="project-mode-layout__section">
            <h4 className="project-mode-layout__section-title">Status</h4>
            <div className="project-mode-layout__status-grid">
              <div className="project-mode-layout__status-item">
                <span className="project-mode-layout__label">Phase:</span>
                <span className="project-mode-layout__value">{getPhaseDisplay(projectRun.phase)}</span>
              </div>
              <div className="project-mode-layout__status-item">
                <span className="project-mode-layout__label">Epoch:</span>
                <span className="project-mode-layout__value">{projectRun.epochId}</span>
              </div>
              <div className="project-mode-layout__status-item">
                <span className="project-mode-layout__label">Micro-Epoch:</span>
                <span className="project-mode-layout__value">{projectRun.microEpochId}</span>
              </div>
              <div className="project-mode-layout__status-item">
                <span className="project-mode-layout__label">Revisions:</span>
                <span className="project-mode-layout__value">{projectRun.revisionCount} / 2</span>
              </div>
            </div>
          </div>
        )}

        {/* CEO Prompt Artifact */}
        <div className="project-mode-layout__section">
          <div className="project-mode-layout__section-header">
            <h4 className="project-mode-layout__section-title">Claude Code Prompt Artifact</h4>
            {ceoPromptArtifact && (
              <button
                className="project-mode-layout__button project-mode-layout__button--copy"
                onClick={handleCopyPrompt}
                title="Copy prompt to clipboard"
              >
                {copyFeedback ?? 'Copy'}
              </button>
            )}
          </div>
          <textarea
            className="project-mode-layout__textarea project-mode-layout__textarea--readonly"
            value={ceoPromptArtifact ?? ''}
            readOnly
            rows={8}
            placeholder="CEO prompt artifact will appear here..."
            data-testid="ceo-prompt-artifact"
          />
        </div>

        {/* Executor Output */}
        <div className="project-mode-layout__section">
          <h4 className="project-mode-layout__section-title">Executor Output</h4>
          <textarea
            className="project-mode-layout__textarea project-mode-layout__textarea--readonly"
            value={executorOutput ?? ''}
            readOnly
            rows={6}
            placeholder="Executor output will appear here..."
            data-testid="executor-output"
          />
        </div>

        {/* Error Display */}
        {isFailed && projectError && (
          <div className="project-mode-layout__section project-mode-layout__section--error">
            <h4 className="project-mode-layout__section-title">Error</h4>
            <p className="project-mode-layout__error-message" data-testid="project-error">
              {projectError}
            </p>
          </div>
        )}

        {/* Pending Interrupts */}
        {projectRun && projectRun.interrupts.length > 0 && (
          <div className="project-mode-layout__section">
            <h4 className="project-mode-layout__section-title">
              Interrupts ({projectRun.interrupts.filter((i) => !i.processed).length} pending)
            </h4>
            <ul className="project-mode-layout__interrupt-list">
              {projectRun.interrupts.map((interrupt) => (
                <li
                  key={interrupt.id}
                  className={`project-mode-layout__interrupt ${
                    interrupt.processed ? 'project-mode-layout__interrupt--processed' : ''
                  } project-mode-layout__interrupt--${interrupt.severity}`}
                >
                  <span className="project-mode-layout__interrupt-severity">
                    [{interrupt.severity.toUpperCase()}]
                  </span>
                  <span className="project-mode-layout__interrupt-scope">
                    [{interrupt.scope.toUpperCase()}]
                  </span>
                  <span className="project-mode-layout__interrupt-message">{interrupt.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Request Change Form Modal */}
      {showRequestChangeForm && (
        <RequestChangeForm
          onSubmit={handleRequestChangeSubmit}
          onCancel={handleRequestChangeCancel}
        />
      )}
    </div>
  );
}
