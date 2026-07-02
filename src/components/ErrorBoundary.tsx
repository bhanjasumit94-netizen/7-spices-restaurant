import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

// Catches any uncaught render error in the subtree and renders a friendly
// fallback instead of leaving the user staring at a blank screen.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-premium p-6">
        <div className="max-w-md w-full panel p-6 text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center">
            <svg
              className="h-7 w-7 text-rose-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-sm text-neutral-500">
            {this.state.error?.message || "An unexpected error occurred on this page."}
          </p>
          <p className="text-xs text-neutral-500">
            Please reload the application. Your data is saved locally and will not be lost.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-medium"
            >
              Try Again
            </button>
            <button
              onClick={this.handleReload}
              className="btn-gold text-sm py-2 rounded-lg"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
