// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// App Component (Phase 2 — Step 5)
// =============================================================================

import { BrainProvider } from './context/BrainContext';
import { BrainChat } from './components/BrainChat';
import './styles.css';

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function App(): JSX.Element {
  return (
    <BrainProvider>
      <div className="brain-app">
        <header className="brain-header">
          <h1>The Brain</h1>
          <p>Multi-AI Sequential Chat System</p>
        </header>
        <BrainChat />
      </div>
    </BrainProvider>
  );
}

export default App;
