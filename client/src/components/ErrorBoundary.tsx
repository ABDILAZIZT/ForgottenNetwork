import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Forgotten Network crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fn-fatal-error" role="alert">
          <p className="fn-label">CONNECTION INTERRUPTED</p>
          <h1>The world could not be rendered.</h1>
          <p>Your locally saved world has not been deleted.</p>
          <button className="fn-btn fn-btn-primary" onClick={() => window.location.reload()}>
            Reload world
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
