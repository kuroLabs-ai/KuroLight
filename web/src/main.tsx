import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

window.addEventListener('error', (event) => {
  console.error('Global KuroLight window.onerror:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Global KuroLight unhandled rejection:', event.reason);
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
