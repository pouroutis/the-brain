// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Entry Point (Phase 2 — Step 5)
// =============================================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

// -----------------------------------------------------------------------------
// Mount Application
// -----------------------------------------------------------------------------

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Root element not found. Make sure there is a <div id="root"> in your HTML.');
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
