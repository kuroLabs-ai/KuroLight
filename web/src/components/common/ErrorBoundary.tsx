import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught KuroLight React Error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          backgroundColor: '#0d0e11',
          color: '#f87171',
          padding: '32px',
          fontFamily: 'monospace',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>
            ⚠️ KuroLight React Runtime Error
          </h1>
          <p style={{ color: '#ffffff', fontSize: '14px' }}>
            {this.state.error?.toString()}
          </p>
          <pre style={{
            backgroundColor: '#181a20',
            padding: '16px',
            borderRadius: '8px',
            color: '#cbd5e1',
            fontSize: '12px',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            border: '1px solid #334155'
          }}>
            {this.state.error?.stack}
            {'\n\nComponent Stack:\n'}
            {this.state.errorInfo?.componentStack}
          </pre>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Reload App
            </button>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.hash = '';
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#334155',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Try Recovering
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
