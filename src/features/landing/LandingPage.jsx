import { useState, useEffect } from "react";

export default function LandingPage({ dark, setDark, onLogin, onSignup, supabase }) {
  const bg = dark ? "#0a0a0a" : "#ffffff";
  const bg2 = dark ? "#111111" : "#f5f5f5";
  const text = dark ? "#ffffff" : "#000000";
  const textMuted = dark ? "#666666" : "#999999";
  const border = dark ? "#1f1f1f" : "#e5e5e5";
  const btnP = {
    background: text,
    color: bg,
    border: "none",
    borderRadius: 8,
    padding: "10px 22px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 500,
  };
  const btnG = {
    background: "none",
    color: textMuted,
    border: `1px solid ${border}`,
    borderRadius: 8,
    padding: "10px 22px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { width: 100%; min-height: 100vh; margin: 0; padding: 0; overflow-x: hidden; background-color: ${dark ? "#0a0a0a" : "#ffffff"}; transition: background-color 0.3s ease, color 0.3s ease; }
    body { background: ${dark ? "#0a0a0a" : "#ffffff"}; }
    input, select, textarea { outline: none; font-family: inherit; }
    ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #2a2a2a; }
    @keyframes fu { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .fu { animation: fu 0.3s ease forwards; opacity: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hb:hover { opacity: 0.7; cursor: pointer; }
    .card-h:hover { border-color: ${text} !important; }
    @media (max-width: 640px) {
      .hero-h1 { font-size: 44px !important; letter-spacing: -2px !important; }
      .stat-grid { flex-direction: column !important; }
      .stat-item { border-right: none !important; border-bottom: 1px solid ${border} !important; padding: 16px 20px !important; }
      .how-grid { grid-template-columns: 1fr !important; }
      .how-card { border-right: 1px solid ${border} !important; border-bottom: none !important; }
      .how-card:last-child { border-bottom: 1px solid ${border} !important; }
      .pad { padding-left: 16px !important; padding-right: 16px !important; }
      .lp-card-grid { grid-template-columns: 1fr !important; }
    }
  `;

  const [liveStats, setLiveStats] = useState({ builders: 0, projects: 0, shipped: 0 });
  const [animatedStats, setAnimatedStats] = useState({ builders: 0, projects: 0, shipped: 0 });

  useEffect(() => {
    (async () => {
      const [
        { count: builderCount },
        { count: projectCount },
        { count: shippedCount },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("projects").select("*", { count: "exact", head: true }),
        supabase.from("projects").select("*", { count: "exact", head: true }).eq("shipped", true),
      ]);
      setLiveStats({ builders: builderCount || 0, projects: projectCount || 0, shipped: shippedCount || 0 });
    })();
  }, [supabase]);

  useEffect(() => {
    const frames = 30;
    let frame = 0;
    const timer = setInterval(() => {
      frame += 1;
      const t = Math.min(1, frame / frames);
      setAnimatedStats({
        builders: Math.round(liveStats.builders * t),
        projects: Math.round(liveStats.projects * t),
        shipped: Math.round(liveStats.shipped * t),
      });
      if (t >= 1) clearInterval(timer);
    }, 34);
    return () => clearInterval(timer);
  }, [liveStats]);

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: bg,
        color: text,
        fontFamily: "'DM Mono', monospace",
        overflowX: "hidden",
      }}
    >
      <style>{CSS}</style>

      {/* Nav */}
      <nav
        style={{
          width: "100%",
          borderBottom: `1px solid ${border}`,
          position: "sticky",
          top: 0,
          background: bg,
          backdropFilter: "blur(12px)",
          zIndex: 50,
        }}
      >
        <div
          className="pad"
          style={{
            padding: "0 40px",
            height: 52,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.5px", color: text }}>
            [CoLab]
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="hb"
              onClick={() => setDark(!dark)}
              style={{
                background: "none",
                border: `1px solid ${border}`,
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
                fontSize: 11,
                color: textMuted,
                fontFamily: "inherit",
              }}
            >
              {dark ? "☀" : "☾"}
            </button>
            <button
              className="hb"
              onClick={onLogin}
              style={{ ...btnG, padding: "7px 16px", fontSize: 12 }}
            >
              Log in
            </button>
            <button
              className="hb"
              onClick={onSignup}
              style={{ ...btnP, padding: "7px 16px", fontSize: 12 }}
            >
              Get started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div
        className="pad fu"
        style={{ padding: "80px 40px 64px", borderBottom: `1px solid ${border}` }}
      >
        <div
          style={{ fontSize: 10, color: textMuted, letterSpacing: "3px", marginBottom: 20 }}
        >
          THE COLLABORATIVE WORKSPACE
        </div>
        <h1
          className="hero-h1"
          style={{
            fontSize: "clamp(52px, 9vw, 96px)",
            fontWeight: 400,
            lineHeight: 0.92,
            letterSpacing: "-4px",
            marginBottom: 28,
            color: text,
          }}
        >
          Don't just
          <br />
          connect.
          <br />
          <span style={{ color: textMuted }}>Build together.</span>
        </h1>
        <p
          style={{
            fontSize: 14,
            color: textMuted,
            maxWidth: 500,
            lineHeight: 1.85,
            marginBottom: 36,
          }}
        >
          CoLab is where founders, creatives, engineers, and makers find each other and actually
          get work done — in one place.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="hb"
            onClick={onSignup}
            style={{
              background: text,
              color: bg,
              border: "none",
              borderRadius: 8,
              padding: "13px 28px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Start building →
          </button>
          <button
            className="hb"
            onClick={onLogin}
            style={{
              background: "none",
              color: textMuted,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: "13px 28px",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Log in
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ textAlign: "center", padding: "12px 16px", borderBottom: `1px solid ${border}`, fontFamily: "'DM Mono', monospace", fontSize: 13, color: textMuted }}>
        {animatedStats.builders} builders · {animatedStats.projects} projects · {animatedStats.shipped} shipped
      </div>
      <div
        className="stat-grid"
        style={{ display: "flex", width: "100%", borderBottom: `1px solid ${border}` }}
      >
        {[
          [animatedStats.builders, "builders"],
          [animatedStats.projects, "active projects"],
          [animatedStats.shipped, "shipped"],
          ["100%", "free to start"],
        ].map(([v, l], i) => (
          <div
            key={i}
            className="stat-item"
            style={{
              flex: 1,
              borderRight: i < 3 ? `1px solid ${border}` : "none",
              padding: "24px 40px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, color: text, letterSpacing: "-1px" }}>{v}</div>
            <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", padding: "18px 12px", fontSize: 12, color: textMuted }}>
        <a href="/terms" style={{ color: textMuted }}>Terms</a> · <a href="/privacy" style={{ color: textMuted }}>Privacy</a>
      </div>

      {/* How it works */}
      <div
        className="pad"
        style={{ padding: "72px 40px", borderBottom: `1px solid ${border}` }}
      >
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 36 }}>
          HOW IT WORKS
        </div>
        <div
          className="how-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}
        >
          {[
            ["01", "Build your profile", "List your skills and what you're looking to work on."],
            [
              "02",
              "Find your match",
              "Post a project or browse and apply to something that excites you.",
            ],
            [
              "03",
              "Build together",
              "Tasks, updates, messaging, and plugin integrations — all in one place.",
            ],
          ].map(([n, t, d], i) => (
            <div
              key={i}
              className="how-card card-h"
              style={{
                padding: "32px 36px",
                background: bg2,
                border: `1px solid ${border}`,
                borderRight: i < 2 ? "none" : `1px solid ${border}`,
                transition: "border 0.2s",
              }}
            >
              <div style={{ fontSize: 11, color: textMuted, marginBottom: 14 }}>{n}</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: text, marginBottom: 8 }}>
                {t}
              </div>
              <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.75 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Final CTA */}
      <div
        className="pad"
        style={{ padding: "80px 40px", background: bg2, textAlign: "center" }}
      >
        <h2
          style={{
            fontSize: "clamp(30px, 5vw, 54px)",
            fontWeight: 400,
            letterSpacing: "-2px",
            marginBottom: 14,
            color: text,
          }}
        >
          Ready to build?
        </h2>
        <p style={{ fontSize: 13, color: textMuted, marginBottom: 28 }}>
          Join{" "}
          {liveStats.builders !== "..." ? liveStats.builders : "hundreds of"} builders already
          collaborating on CoLab.
        </p>
        <button
          className="hb"
          onClick={onSignup}
          style={{
            background: text,
            color: bg,
            border: "none",
            borderRadius: 8,
            padding: "14px 36px",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Create your profile →
        </button>
      </div>

      {/* Footer */}
      <div
        className="pad"
        style={{
          padding: "18px 40px",
          borderTop: `1px solid ${border}`,
          background: bg,
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 12, color: textMuted }}>[CoLab] — build together.</div>
        <div style={{ fontSize: 11, color: textMuted }}>© 2026</div>
      </div>
    </div>
  );
}
