// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Discussion Mode Layout (Two-Pane: Thread + CEO Prompt)
// =============================================================================

import { ExchangeList } from './ExchangeList';
import { CeoPromptPanel } from './CeoPromptPanel';
import type {
  Agent,
  BrainMode,
  CeoPromptArtifact,
  Exchange,
  PendingExchange,
  SystemMessage,
} from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface DiscussionModeLayoutProps {
  exchanges: Exchange[];
  pendingExchange: PendingExchange | null;
  currentAgent: Agent | null;
  mode: BrainMode;
  ceo: Agent;
  systemMessages: SystemMessage[];
  ceoPromptArtifact: CeoPromptArtifact | null;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function DiscussionModeLayout({
  exchanges,
  pendingExchange,
  currentAgent,
  mode,
  ceo,
  systemMessages,
  ceoPromptArtifact,
}: DiscussionModeLayoutProps): JSX.Element {
  return (
    <div className="discussion-mode-layout" data-testid="discussion-mode-layout">
      {/* Left Pane: Discussion Thread */}
      <div className="discussion-mode-layout__left">
        <ExchangeList
          exchanges={exchanges}
          pendingExchange={pendingExchange}
          currentAgent={currentAgent}
          mode={mode}
          ceo={ceo}
          systemMessages={systemMessages}
        />
      </div>

      {/* Right Pane: CEO Prompt Artifact */}
      <div className="discussion-mode-layout__right">
        <CeoPromptPanel artifact={ceoPromptArtifact} />
      </div>
    </div>
  );
}
