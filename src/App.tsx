// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// App Component (V2-C — Unified 3-Column Layout)
// =============================================================================

import { BrainProvider } from './context/BrainContext';
import { AppLayout } from './components/AppLayout';
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

        <AppLayout />
      </div>
    </BrainProvider>
  );
}

export default App;
