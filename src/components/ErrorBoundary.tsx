import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Reloads the page; injectable for tests. */
  onReload?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches a crash in one tab, including a lazy chunk that fails to load (for
 * example after a deploy replaced it), and offers a reload instead of a blank screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Tab crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const reload = this.props.onReload ?? (() => window.location.reload());
    return (
      <div role="alert" className="min-h-[60vh] flex items-center justify-center p-6 text-center text-white">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-slate-400 text-sm">
            This section couldn't load. It may be a dropped connection or a new version of Study Deck.
            Reloading usually fixes it, and your progress is saved.
          </p>
          <button
            type="button"
            onClick={reload}
            className="min-h-11 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
