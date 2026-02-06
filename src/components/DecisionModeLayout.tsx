// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Decision Mode Layout (Two-Pane: Thread + CEO Prompt + Clarification)
// =============================================================================

import { ExchangeList } from './ExchangeList';
import { CeoPromptPanel } from './CeoPromptPanel';
import { CeoClarificationPanel } from './CeoClarificationPanel';
import type {
  Agent,
  BrainMode,
  CeoPromptArtifact,
  ClarificationState,
  DecisionBlockingState,
  Exchange,
  PendingExchange,
  SystemMessage,
} from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface DecisionModeLayoutProps {
  exchanges: Exchange[];
  pendingExchange: PendingExchange | null;
  currentAgent: Agent | null;
  mode: BrainMode;
  ceo: Agent;
  systemMessages: SystemMessage[];
  ceoPromptArtifact: CeoPromptArtifact | null;
  clarificationState: ClarificationState | null;
  onSendClarificationMessage: (content: string) => void;
  onCancelClarification: () => void;
  /** Warning message when CEO prompt is missing markers */
  ceoPromptWarning: string | null;
  /** Session blocking state (invalid CEO output) */
  blockingState: DecisionBlockingState | null;
  /** Callback to clear board and unblock */
  onClearAndUnblock: () => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function DecisionModeLayout({
  exchanges,
  pendingExchange,
  currentAgent,
  mode,
  ceo,
  systemMessages,
  ceoPromptArtifact,
  clarificationState,
  onSendClarificationMessage,
  onCancelClarification,
  ceoPromptWarning,
  blockingState,
  onClearAndUnblock,
}: DecisionModeLayoutProps): JSX.Element {
  const isBlocked = blockingState?.isBlocked ?? false;

  return (
    <div className="decision-mode-layout" data-testid="decision-mode-layout">
      {/* Session Blocking Overlay */}
      {isBlocked && (
        <div className="decision-mode-layout__blocking-overlay" data-testid="decision-blocking-overlay">
          <div className="decision-mode-layout__blocking-content">
            <div className="decision-mode-layout__blocking-icon">⛔</div>
            <h3 className="decision-mode-layout__blocking-title">Session Blocked</h3>
            <p className="decision-mode-layout__blocking-reason">{blockingState?.reason}</p>
            <p className="decision-mode-layout__blocking-help">
              CEO must output either a valid Claude Code prompt (with markers) or clarification questions.
            </p>
            <button
              className="decision-mode-layout__blocking-btn"
              onClick={onClearAndUnblock}
              data-testid="clear-and-retry-btn"
            >
              Clear Board &amp; Retry
            </button>
          </div>
        </div>
      )}

      {/* Left Pane: Discussion Thread */}
      <div className="decision-mode-layout__left">
        <ExchangeList
          exchanges={exchanges}
          pendingExchange={pendingExchange}
          currentAgent={currentAgent}
          mode={mode}
          ceo={ceo}
          systemMessages={systemMessages}
        />
      </div>

      {/* Right Pane: CEO Prompt + Clarification */}
      <div className="decision-mode-layout__right">
        <CeoPromptPanel artifact={ceoPromptArtifact} warning={ceoPromptWarning} />
        <CeoClarificationPanel
          clarificationState={clarificationState}
          onSendMessage={onSendClarificationMessage}
          onCancel={onCancelClarification}
        />
      </div>
    </div>
  );
}
