export function AboutPanel() {
  return (
    <div className="panel-content">
      <h1 className="panel-title">About</h1>
      <p className="panel-subtitle">JustDetox — a free, open-source focus tool.</p>

      <section className="panel-section">
        <div className="about-card">
          <div className="about-row">
            <span className="about-label">Version</span>
            <span className="about-value">0.1.0</span>
          </div>
          <div className="about-row">
            <span className="about-label">License</span>
            <span className="about-value">MIT</span>
          </div>
          <div className="about-row">
            <span className="about-label">Source</span>
            <span className="about-value">
              <a
                href="https://github.com/AlimMak/JustDetox"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#aaa", textDecoration: "underline" }}
              >
                github.com/AlimMak/JustDetox
              </a>
            </span>
          </div>
        </div>
      </section>

      <section className="panel-section">
        <p className="muted" style={{ maxWidth: 480, lineHeight: 1.6 }}>
          JustDetox helps you stay focused by blocking or time-limiting distracting websites.
          No accounts, no telemetry — all data stays in your browser.
        </p>
      </section>
    </div>
  );
}
