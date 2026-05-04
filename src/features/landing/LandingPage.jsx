import { useState, useEffect } from "react";

export default function LandingPage({ dark, setDark, onLogin, onSignup, supabase }) {
  const bg = dark ? "#0a0a0a" : "#f4f4f6";
  const bg2 = dark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.62)";
  const text = dark ? "#ffffff" : "#000000";
  const textMuted = dark ? "#666666" : "#999999";
  const border = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
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
    html, body, #root { width: 100%; min-height: 100vh; margin: 0; padding: 0; overflow-x: hidden; background-color: ${dark ? "#0a0a0a" : "#f4f4f6"}; transition: background-color 0.3s ease, color 0.3s ease; }
    body { background: ${dark
      ? "radial-gradient(ellipse 70% 60% at 15% 10%, rgba(80,70,120,0.13) 0%, transparent 65%), radial-gradient(ellipse 55% 65% at 85% 85%, rgba(50,80,120,0.10) 0%, transparent 65%), #0a0a0a"
      : "radial-gradient(ellipse 70% 60% at 15% 10%, rgba(180,190,230,0.28) 0%, transparent 65%), radial-gradient(ellipse 55% 65% at 85% 85%, rgba(190,180,240,0.22) 0%, transparent 65%), #f4f4f6"
    }; }
    .glass-nav { backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%); background: ${dark ? "rgba(10,10,10,0.72)" : "rgba(244,244,246,0.72)"} !important; }
    .glass-card { backdrop-filter: blur(16px) saturate(140%); -webkit-backdrop-filter: blur(16px) saturate(140%); box-shadow: inset 0 1px 0 rgba(255,255,255,${dark ? "0.07" : "0.9"}), 0 4px 24px rgba(0,0,0,${dark ? "0.28" : "0.06"}); }
    input, select, textarea { outline: none; font-family: inherit; }
    ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #2a2a2a; }
    @keyframes fu { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .fu { animation: fu 0.3s ease forwards; opacity: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hb:hover { opacity: 0.7; cursor: pointer; }
    .card-h:hover { border-color: ${text} !important; }
    @media (max-width: 640px) {
      .hero-h1 { font-size: 44px !important; letter-spacing: -2px !important; }
      .hero-grid { grid-template-columns: 1fr !important; }
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
  const [displayStats, setDisplayStats] = useState({ builders: 0, projects: 0, shipped: 0 });
  const [statsLoaded, setStatsLoaded] = useState(false);
  const heroPreviewCards = [
    { eyebrow: "PROFILE", title: "Ari Patel", subtitle: "Product designer · Brooklyn", tags: ["Brand systems", "Figma", "Motion"] },
    { eyebrow: "PROJECT", title: "Pocket Studio", subtitle: "Looking for frontend + growth", tags: ["2 roles open", "MVP in progress"] },
    { eyebrow: "MATCH", title: "Shared skills detected", subtitle: "3 creators overlap with your toolkit", tags: ["Design", "Frontend", "Storytelling"] },
  ];

  useEffect(() => {
    (async () => {
      const [
        { count: builderCount },
        { count: projectCount },
        { count: shippedCount },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("projects").select("*", { count: "exact", head: true }).eq("shipped", false),
        supabase.from("projects").select("*", { count: "exact", head: true }).eq("shipped", true),
      ]);
      setLiveStats({
        builders: builderCount ?? 0,
        projects: projectCount ?? 0,
        shipped: shippedCount ?? 0,
      });
      setStatsLoaded(true);
    })();
  }, []);

  // Count-up animation when stats load
  useEffect(() => {
    if (!statsLoaded) return;
    const duration = 1000;
    const frames = 40;
    const interval = duration / frames;
    let frame = 0;
    const timer = setInterval(() => {
      frame++;
      const progress = frame / frames;
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplayStats({
        builders: Math.round(liveStats.builders * ease),
        projects: Math.round(liveStats.projects * ease),
        shipped: Math.round(liveStats.shipped * ease),
      });
      if (frame >= frames) {
        clearInterval(timer);
        setDisplayStats(liveStats);
      }
    }, interval);
    return () => clearInterval(timer);
  }, [statsLoaded, liveStats]);

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
        className="glass-nav"
        style={{
          width: "100%",
          borderBottom: `1px solid ${border}`,
          position: "sticky",
          top: 0,
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
        <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(320px, 0.95fr)", gap: 32, alignItems: "center" }}>
          <div>
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
              get work done in one place.
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
          <div style={{ position: "relative", minHeight: 360, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: "10% 12% auto 12%", height: 220, borderRadius: 28, background: dark ? "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.01))" : "linear-gradient(135deg, rgba(0,0,0,0.06), rgba(0,0,0,0.02))", filter: "blur(4px)" }} />
            <div style={{ position: "relative", width: "100%", maxWidth: 420 }}>
              {heroPreviewCards.map((card, index) => (
                <div
                  key={card.title}
                  className="glass-card"
                  style={{
                    position: "relative",
                    marginLeft: index === 1 ? 28 : index === 2 ? 8 : 0,
                    marginTop: index === 0 ? 0 : -28,
                    background: bg2,
                    border: `1px solid ${border}`,
                    borderRadius: 18,
                    padding: "18px 18px 16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>{card.eyebrow}</div>
                    <div style={{ width: 52, height: 8, borderRadius: 999, background: dark ? "#1d1d1d" : "#e8e8e8" }} />
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 14, background: dark ? "#1a1a1a" : "#ececec", border: `1px solid ${border}` }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: text, marginBottom: 5 }}>{card.title}</div>
                      <div style={{ width: "72%", height: 8, borderRadius: 999, background: dark ? "#191919" : "#ebebeb", marginBottom: 6 }} />
                      <div style={{ width: "52%", height: 8, borderRadius: 999, background: dark ? "#151515" : "#efefef" }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: textMuted, marginBottom: 14 }}>{card.subtitle}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {card.tags.map((tag) => (
                      <span key={tag} style={{ fontSize: 10, color: textMuted, border: `1px solid ${border}`, borderRadius: 999, padding: "3px 9px" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div
        className="stat-grid"
        style={{ display: "flex", width: "100%", borderBottom: `1px solid ${border}` }}
      >
        {[
          [displayStats.builders || "—", "builders"],
          [displayStats.projects || "—", "active projects"],
          [displayStats.shipped || "—", "shipped"],
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
              className="how-card card-h glass-card"
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
          Join {liveStats.builders > 0 ? liveStats.builders : "builders"} already collaborating
          {liveStats.shipped > 0 ? ` — ${liveStats.shipped} projects shipped.` : " on CoLab."}
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
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <a href="/terms" style={{ fontSize: 11, color: textMuted, textDecoration: "none" }} className="hb">Terms</a>
          <a href="/privacy" style={{ fontSize: 11, color: textMuted, textDecoration: "none" }} className="hb">Privacy</a>
          <span style={{ fontSize: 11, color: textMuted }}>© 2026</span>
        </div>
      </div>
    </div>
  );
}
