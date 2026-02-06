// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Home Screen Component (Mode Selection)
// =============================================================================

import type { BrainMode } from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface HomeScreenProps {
  onSelectMode: (mode: BrainMode) => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function HomeScreen({ onSelectMode }: HomeScreenProps): JSX.Element {
  return (
    <div className="home-screen" data-testid="home-screen">
      <div className="home-screen__content">
        <h2 className="home-screen__title">Choose Your Mode</h2>
        <p className="home-screen__subtitle">Select how you want the AIs to collaborate</p>

        <div className="home-screen__buttons">
          {/* Discussion Mode */}
          <button
            className="home-screen__button home-screen__button--discussion"
            onClick={() => onSelectMode('discussion')}
            data-testid="select-discussion"
          >
            <span className="home-screen__button-title">Discussion</span>
            <span className="home-screen__button-desc">
              Open conversation with all AIs. No execution prompts.
            </span>
          </button>

          {/* Decision Mode */}
          <button
            className="home-screen__button home-screen__button--decision"
            onClick={() => onSelectMode('decision')}
            data-testid="select-decision"
          >
            <span className="home-screen__button-title">Decision</span>
            <span className="home-screen__button-desc">
              Single round. CEO publishes Claude Code prompt.
            </span>
          </button>

          {/* Project Mode - Disabled/Coming Soon */}
          <button
            className="home-screen__button home-screen__button--project home-screen__button--disabled"
            disabled
            data-testid="select-project"
          >
            <span className="home-screen__button-title">Project</span>
            <span className="home-screen__button-desc">
              Coming soon. Autonomous execution loop.
            </span>
            <span className="home-screen__button-badge">Coming Soon</span>
          </button>
        </div>
      </div>
    </div>
  );
}
