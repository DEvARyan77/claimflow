import { Component } from 'react';

/**
 * If any page crashes while drawing, show what went wrong instead of a blank white page.
 * (React shows nothing at all when a component throws and nobody catches it.)
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ClaimFlow page crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash">
        <div className="card crash-card" role="alert">
          <h1>Something went wrong on this page</h1>
          <p className="muted">Reloading usually fixes it. If it keeps happening, send this message to the developer:</p>
          <pre className="crash-detail">{String(this.state.error?.message ?? this.state.error)}</pre>
          <div className="row-between">
            <a className="btn btn-secondary" href="/welcome">
              Switch patient
            </a>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </main>
    );
  }
}
