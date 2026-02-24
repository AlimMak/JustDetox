// FILE: src/ui/options/components/AboutPanel.tsx

export function AboutPanel() {
  return (
    <div className="panel-content">
      <div className="panel-header">
        <div>
          <h1 className="panel-title">About</h1>
          <p className="panel-subtitle">JustDetox — a free, open-source focus tool.</p>
        </div>
      </div>

      <section className="panel-section">
        <div className="card">
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
                style={{ color: "var(--text-2)", textDecoration: "underline" }}
              >
                github.com/AlimMak/JustDetox
              </a>
            </span>
          </div>
        </div>
      </section>

      <p style={{ fontSize: "var(--text-sm)", color: "var(--text-3)", lineHeight: 1.6 }}>
        No accounts, no telemetry. All data stays in your browser.
      </p>
    </div>
  );
}
