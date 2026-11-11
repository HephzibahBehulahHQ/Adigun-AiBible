import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { failed: boolean }

/** Keep a failed lazy workspace or render from leaving the reader completely blank. */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main id="main" className="app" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px' }}>
        <section className="panel" role="alert" aria-labelledby="app-recovery-title" style={{ maxWidth: '560px', width: '100%' }}>
          <span className="eyebrow">Adigun-AiBible</span>
          <h1 id="app-recovery-title">This view could not be opened</h1>
          <p>A problem interrupted this view. You can reload the application or return to the Bible reader. Neither action clears your saved study data.</p>
          <div className="button-row">
            <button type="button" className="primary" onClick={() => window.location.reload()}>Reload application</button>
            <a className="secondary" href="/#/read/GEN/1?verse=1&amp;edition=eng-web">Open Bible reader</a>
          </div>
        </section>
      </main>
    );
  }
}
