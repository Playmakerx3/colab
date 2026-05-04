import { useState, useEffect } from "react";

export default function LandingPage({ dark, setDark, onLogin, onSignup, supabase }) {
  const bg      = dark ? "#0a0a0a" : "#f2f2f4";
  const bg2     = dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.72)";
  const text    = dark ? "#ffffff" : "#000000";
  const textMuted = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.38)";
  const border  = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

  // Hero is always dark for impact
  const heroBg    = "#080808";
  const heroText  = "#ffffff";
  const heroMuted = "rgba(255,255,255,0.38)";
  const heroBorder = "rgba(255,255,255,0.08)";

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { width: 100%; min-height: 100vh; margin: 0; padding: 0; overflow-x: hidden; background: ${bg}; transition: background 0.3s ease; }
    input, select, textarea { outline: none; font-family: inherit; }
    ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #222; }
    @keyframes fu { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    .fu { animation: fu 0.5s ease forwards; opacity: 0; }
    .hb:hover { opacity: 0.65; cursor: pointer; }
    .glass-nav {
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      background: ${dark ? "rgba(8,8,8,0.82)" : "rgba(242,242,244,0.82)"} !important;
    }
    .glass-card {
      backdrop-filter: blur(20px) saturate(150%);
      -webkit-backdrop-filter: blur(20px) saturate(150%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.09), 0 8px 40px rgba(0,0,0,0.36), 0 1px 0 rgba(255,255,255,0.04);
    }
    .pill-btn {
      border-radius: 999px !important;
    }
    .lp-hero-h1 {
      font-size: clamp(58px, 9.5vw, 128px);
      font-weight: 400;
      line-height: 0.92;
      letter-spacing: -5px;
      color: ${heroText};
    }
    .lp-stat-num {
      font-size: clamp(44px, 6vw, 72px);
      font-weight: 400;
      letter-spacing: -3px;
      color: ${text};
    }
    @media (max-width: 768px) {
      .lp-hero-h1 { font-size: 52px !important; letter-spacing: -3px !important; }
      .lp-hero-grid { grid-template-columns: 1fr !important; }
      .lp-hero-card { display: none !important; }
      .lp-stats-row { flex-direction: column !important; gap: 40px !important; align-items: flex-start !important; }
      .lp-how-grid { grid-template-columns: 1fr !important; gap: 0 !important; }
      .lp-how-left { padding-bottom: 40px !important; border-bottom: 1px solid ${border} !important; border-right: none !important; margin-bottom: 40px !important; }
      .pad { padding-left: 24px !important; padding-right: 24px !important; }
    }
  `;

  const [liveStats, setLiveStats] = useState({ builders: 0, projects: 0, shipped: 0 });
  const [displayStats, setDisplayStats] = useState({ builders: 0, projects: 0, shipped: 0 });
  const [statsLoaded, setStatsLoaded] = useState(false);

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
      setLiveStats({ builders: builderCount ?? 0, projects: projectCount ?? 0, shipped: shippedCount ?? 0 });
      setStatsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!statsLoaded) return;
    const frames = 40;
    let frame = 0;
    const timer = setInterval(() => {
      frame++;
      const ease = 1 - Math.pow(1 - frame / frames, 3);
      setDisplayStats({
        builders: Math.round(liveStats.builders * ease),
        projects: Math.round(liveStats.projects * ease),
        shipped: Math.round(liveStats.shipped * ease),
      });
      if (frame >= frames) { clearInterval(timer); setDisplayStats(liveStats); }
    }, 1000 / frames);
    return () => clearInterval(timer);
  }, [statsLoaded, liveStats]);

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", overflowX: "hidden" }}>
      <style>{CSS}</style>

      {/* ── NAV ── */}
      <nav className="glass-nav" style={{ position: "sticky", top: 0, zIndex: 50, width: "100%", borderBottom: `1px solid ${heroBorder}` }}>
        <div className="pad" style={{ padding: "0 48px", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.5px", color: heroText }}>[CoLab]</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="hb" onClick={() => setDark(!dark)} style={{ background: "none", border: `1px solid ${heroBorder}`, borderRadius: 999, padding: "5px 12px", fontSize: 11, color: heroMuted, cursor: "pointer", fontFamily: "inherit" }}>
              {dark ? "☀" : "☾"}
            </button>
            <button className="hb pill-btn" onClick={onLogin} style={{ background: "none", color: heroMuted, border: `1px solid ${heroBorder}`, borderRadius: 999, padding: "8px 18px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Log in
            </button>
            <button className="hb pill-btn" onClick={onSignup} style={{ background: heroText, color: heroBg, border: "none", borderRadius: 999, padding: "8px 18px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              Get started
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── always dark */}
      <div className="fu" style={{ background: heroBg, borderBottom: `1px solid ${heroBorder}`, padding: "96px 48px 80px" }}>
        <div className="lp-hero-grid pad" style={{ padding: 0, display: "grid", gridTemplateColumns: "1fr 420px", gap: 64, alignItems: "center", maxWidth: 1280, margin: "0 auto" }}>

          {/* Left — headline */}
          <div>
            <div style={{ fontSize: 10, color: heroMuted, letterSpacing: "3px", marginBottom: 24 }}>
              THE COLLABORATIVE WORKSPACE
            </div>
            <h1 className="lp-hero-h1" style={{ marginBottom: 32 }}>
              Don't just<br />
              connect.<br />
              <span style={{ color: heroMuted }}>Build.</span>
            </h1>
            <p style={{ fontSize: 13, color: heroMuted, maxWidth: 420, lineHeight: 1.9, marginBottom: 40 }}>
              CoLab is where founders, creatives, engineers, and makers find each other — and actually ship together.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="hb pill-btn" onClick={onSignup} style={{ background: heroText, color: heroBg, border: "none", borderRadius: 999, padding: "14px 32px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                Start building →
              </button>
              <button className="hb pill-btn" onClick={onLogin} style={{ background: "none", color: heroMuted, border: `1px solid ${heroBorder}`, borderRadius: 999, padding: "14px 32px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Log in
              </button>
            </div>
          </div>

          {/* Right — floating profile card */}
          <div className="lp-hero-card" style={{ position: "relative" }}>
            {/* Glow blob behind card */}
            <div style={{ position: "absolute", inset: "-20%", background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(120,100,200,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
            <div className="glass-card" style={{ position: "relative", background: "rgba(255,255,255,0.04)", border: `1px solid ${heroBorder}`, borderRadius: 24, padding: "28px 24px" }}>
              <div style={{ fontSize: 10, color: heroMuted, letterSpacing: "2px", marginBottom: 20 }}>FEATURED BUILDER</div>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 20 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(255,255,255,0.07)", border: `1px solid ${heroBorder}`, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 15, color: heroText, marginBottom: 4 }}>Ari Patel</div>
                  <div style={{ fontSize: 11, color: heroMuted }}>Product designer · Brooklyn</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                {["Brand systems", "Figma", "Motion", "Storytelling"].map(s => (
                  <span key={s} style={{ fontSize: 10, color: heroMuted, border: `1px solid ${heroBorder}`, borderRadius: 999, padding: "4px 10px" }}>{s}</span>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${heroBorder}`, paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, color: heroMuted, marginBottom: 4 }}>OPEN TO COLLABORATE</div>
                  <div style={{ fontSize: 11, color: heroText }}>Pocket Studio · 2 roles open</div>
                </div>
                <div style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${heroBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: heroText }}>→</div>
              </div>
            </div>

            {/* Small floating match chip */}
            <div className="glass-card" style={{ position: "absolute", bottom: -18, left: -24, background: "rgba(255,255,255,0.05)", border: `1px solid ${heroBorder}`, borderRadius: 14, padding: "12px 16px", display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: "#4ade80", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, color: heroText }}>3 skill matches found</div>
                <div style={{ fontSize: 9, color: heroMuted }}>Design · Frontend · Story</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── STATS ── */}
      <div className="pad" style={{ padding: "88px 48px", borderBottom: `1px solid ${border}`, maxWidth: 1280, margin: "0 auto" }}>
        <div className="lp-stats-row" style={{ display: "flex", gap: 80, alignItems: "flex-start", justifyContent: "center" }}>
          {[
            [displayStats.builders || "—", "builders on CoLab"],
            [displayStats.projects || "—", "active projects"],
            [displayStats.shipped || "—", "projects shipped"],
            ["100%", "free to start"],
          ].map(([v, l], i) => (
            <div key={i}>
              <div className="lp-stat-num">{v}</div>
              <div style={{ fontSize: 11, color: textMuted, marginTop: 8, letterSpacing: "0.5px" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div className="pad" style={{ padding: "88px 48px", borderBottom: `1px solid ${border}` }}>
        <div className="lp-how-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, maxWidth: 1280, margin: "0 auto" }}>

          {/* Left — section label + heading */}
          <div className="lp-how-left" style={{ borderRight: `1px solid ${border}`, paddingRight: 80 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "3px", marginBottom: 24 }}>HOW IT WORKS</div>
            <h2 style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 400, letterSpacing: "-2.5px", lineHeight: 1.05, color: text, maxWidth: 380 }}>
              Three steps to your next great project.
            </h2>
          </div>

          {/* Right — numbered list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              ["01", "Build your profile", "List your skills, what you're working on, and what kind of collaborators you're looking for."],
              ["02", "Find your match", "Browse open projects, apply to something that excites you, or post your own and find the right people."],
              ["03", "Build together", "Tasks, updates, direct messaging — everything you need to actually ship is in one place."],
            ].map(([n, t, d], i) => (
              <div key={i} style={{ paddingTop: i === 0 ? 0 : 32, paddingBottom: 32, borderBottom: i < 2 ? `1px solid ${border}` : "none", display: "flex", gap: 24 }}>
                <div style={{ fontSize: 10, color: textMuted, paddingTop: 3, flexShrink: 0, width: 24 }}>{n}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: text, marginBottom: 10 }}>{t}</div>
                  <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.85 }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FINAL CTA ── always dark */}
      <div style={{ background: heroBg, borderBottom: `1px solid ${heroBorder}`, padding: "112px 48px", textAlign: "center" }}>
        <div style={{ fontSize: 10, color: heroMuted, letterSpacing: "3px", marginBottom: 28 }}>GET STARTED</div>
        <h2 style={{ fontSize: "clamp(48px, 8vw, 108px)", fontWeight: 400, letterSpacing: "-5px", lineHeight: 0.94, color: heroText, marginBottom: 40, maxWidth: 800, margin: "0 auto 40px" }}>
          Ready to build?
        </h2>
        <p style={{ fontSize: 13, color: heroMuted, marginBottom: 36 }}>
          {liveStats.builders > 0 ? `Join ${liveStats.builders} builders` : "Join builders"} already collaborating
          {liveStats.shipped > 0 ? ` — ${liveStats.shipped} projects shipped.` : " on CoLab."}
        </p>
        <button className="hb pill-btn" onClick={onSignup} style={{ background: heroText, color: heroBg, border: "none", borderRadius: 999, padding: "16px 48px", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
          Create your profile →
        </button>
      </div>

      {/* ── FOOTER ── */}
      <div className="pad" style={{ padding: "20px 48px", background: heroBg, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, color: heroMuted }}>[CoLab] — build together.</div>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <a href="/terms" style={{ fontSize: 11, color: heroMuted, textDecoration: "none" }} className="hb">Terms</a>
          <a href="/privacy" style={{ fontSize: 11, color: heroMuted, textDecoration: "none" }} className="hb">Privacy</a>
          <span style={{ fontSize: 11, color: heroMuted }}>© 2026</span>
        </div>
      </div>
    </div>
  );
}
