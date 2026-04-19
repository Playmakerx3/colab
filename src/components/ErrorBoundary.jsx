import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[CoLab] Uncaught error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#0a0a0a", color: "#fff",
          fontFamily: "'DM Mono', monospace", padding: "24px 16px", textAlign: "center",
        }}>
          <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "-1px", marginBottom: 12 }}>
            something went wrong.
          </div>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 32, maxWidth: 400, lineHeight: 1.7 }}>
            An unexpected error occurred. Try refreshing — if it keeps happening, reach out to the team.
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              background: "#fff", color: "#0a0a0a", border: "none", borderRadius: 8,
              padding: "12px 28px", fontSize: 13, cursor: "pointer",
              fontFamily: "'DM Mono', monospace", marginBottom: 16,
            }}
          >
            refresh page
          </button>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
            style={{
              background: "none", color: "#666", border: "1px solid #333", borderRadius: 8,
              padding: "10px 24px", fontSize: 12, cursor: "pointer",
              fontFamily: "'DM Mono', monospace",
            }}
          >
            go home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
