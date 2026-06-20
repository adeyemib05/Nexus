import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Something went wrong' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-nexus-void flex items-center justify-center p-6">
          <div className="glass-card p-8 max-w-md text-center space-y-4">
            <AlertTriangle size={32} className="text-nexus-bear mx-auto" />
            <h2 className="font-display font-semibold text-nexus-textPrimary">Something went wrong</h2>
            <p className="text-sm text-nexus-textSecondary">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-nexus-accent/10 text-nexus-accent text-sm font-medium hover:bg-nexus-accent/20 transition-colors"
            >
              Reload NEXUS
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
