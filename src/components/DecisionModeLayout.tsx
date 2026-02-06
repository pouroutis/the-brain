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
}: DecisionModeLayoutProps): JSX.Element {
  return (
    <div className="decision-mode-layout" data-testid="decision-mode-layout">
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
