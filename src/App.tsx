// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// App Component (Home Screen + Mode-Based Routing)
// =============================================================================

import { useState, useCallback } from 'react';
import { BrainProvider } from './context/BrainContext';
import { BrainChat } from './components/BrainChat';
import { HomeScreen } from './components/HomeScreen';
import type { BrainMode } from './types/brain';
import './styles.css';

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function App(): JSX.Element {
  // Track which mode user selected (null = show home screen)
  const [selectedMode, setSelectedMode] = useState<BrainMode | null>(null);

  const handleSelectMode = useCallback((mode: BrainMode) => {
    setSelectedMode(mode);
  }, []);

  const handleReturnHome = useCallback(() => {
    setSelectedMode(null);
  }, []);

  return (
    <BrainProvider>
      <div className="brain-app">
        <header className="brain-header">
          <h1>The Brain</h1>
          <p>Multi-AI Sequential Chat System</p>
        </header>

        {selectedMode === null ? (
          <HomeScreen onSelectMode={handleSelectMode} />
        ) : (
          <BrainChat
            onReturnHome={handleReturnHome}
          />
        )}
      </div>
    </BrainProvider>
  );
}

export default App;
