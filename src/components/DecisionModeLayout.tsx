// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Decision Mode Layout (Two-Pane: Thread + CEO Prompt)
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

interface DecisionModeLayoutProps {
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

export function DecisionModeLayout({
  exchanges,
  pendingExchange,
  currentAgent,
  mode,
  ceo,
  systemMessages,
  ceoPromptArtifact,
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

      {/* Right Pane: CEO Prompt Artifact */}
      <div className="decision-mode-layout__right">
        <CeoPromptPanel artifact={ceoPromptArtifact} />
      </div>
    </div>
  );
}
