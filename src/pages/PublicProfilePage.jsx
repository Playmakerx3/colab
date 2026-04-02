import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { initials } from "../utils/appHelpers";

export default function PublicProfilePage({ username }) {
  const [dark, setDark] = useState(true);
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const bg = dark ? "#0a0a0a" : "#ffffff";
  const bg2 = dark ? "#111111" : "#f5f5f5";
  const border = dark ? "#1e1e1e" : "#e0e0e0";
  const text = dark ? "#ffffff" : "#000000";
  const textMuted = dark ? "#555555" : "#aaaaaa";

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { width: 100%; min-height: 100vh; background: ${bg}; }
    @keyframes fu { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .fu { animation: fu 0.35s ease forwards; }
    @keyframes tin { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    .hb:hover { opacity: 0.7; cursor: pointer; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  useEffect(() => {
    document.body.style.backgroundColor = dark ? "#0a0a0a" : "#ffffff";
  }, [dark]);

  useEffect(() => {
    if (!user) return;
    const title = `${user.name} — CoLab`;
    const desc = user.bio ? user.bio.slice(0, 160) : `${user.name} is building on CoLab.`;
    document.title = title;
    const setMeta = (prop, val, attr = "property") => {
      let el = document.querySelector(`meta[${attr}="${prop}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, prop); document.head.appendChild(el); }
      el.setAttribute("content", val);
    };
    setMeta("og:title", title);
    setMeta("og:description", desc);
    setMeta("og:url", window.location.href);
    setMeta("og:type", "profile");
    setMeta("og:site_name", "CoLab");
    setMeta("twitter:card", "summary", "name");
    setMeta("twitter:title", title, "name");
    setMeta("twitter:description", desc, "name");
  }, [user]);

  useEffect(() => {
    async function load() {
      const { data: u } = await supabase.from("profiles").select("*").eq("username", username).single();
      if (!u) { setNotFound(true); setLoading(false); return; }
      setUser(u);
      const [{ data: projs }, { data: port }] = await Promise.all([
        supabase.from("projects").select("*").eq("owner_id", u.id).order("created_at", { ascending: false }),
        supabase.from("portfolio_items").select("*").eq("user_id", u.id),
      ]);
      setProjects(projs || []);
      setPortfolio(port || []);
      setLoading(false);
    }
    load();
  }, [username]);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } html, body { background: #0a0a0a; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 16, color: "#fff", letterSpacing: "-0.5px", marginBottom: 20 }}>[CoLab]</div>
        <div style={{ width: 18, height: 18, border: "2px solid #333", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
      </div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace", color: "#555" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } html, body { background: #0a0a0a; }`}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, marginBottom: 16 }}>profile not found.</div>
        <a href="/" style={{ fontSize: 12, color: "#fff", textDecoration: "underline" }}>← back to CoLab</a>
      </div>
    </div>
  );

  const bannerPixels = (() => { try { return user.banner_pixels ? JSON.parse(user.banner_pixels) : null; } catch { return null; } })();

  return (
    <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'DM Mono', monospace" }}>
      <style>{CSS}</style>
      <nav style={{ borderBottom: `1px solid ${border}`, position: "sticky", top: 0, background: bg, zIndex: 50, backdropFilter: "blur(12px)" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="/" style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.5px", color: text, textDecoration: "none" }}>[CoLab]</a>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="hb" onClick={() => setDark(d => !d)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, color: textMuted, fontFamily: "inherit" }}>{dark ? "☀" : "☾"}</button>
            <a href="/" style={{ padding: "6px 14px", borderRadius: 6, fontSize: 11, background: "none", color: textMuted, border: `1px solid ${border}`, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Log in</a>
            <a href="/" style={{ padding: "6px 14px", borderRadius: 6, fontSize: 11, background: text, color: bg, border: "none", textDecoration: "none", display: "inline-flex", alignItems: "center", fontWeight: 500 }}>Get started</a>
          </div>
        </div>
      </nav>

      {bannerPixels && bannerPixels.some(v => v) && (
        <div style={{ width: "100%", height: 80, overflow: "hidden", borderBottom: `1px solid ${border}` }}>
          <svg width="100%" height="100%" viewBox={`0 0 48 12`} preserveAspectRatio="none" style={{ display: "block" }}>
            {bannerPixels.map((v, i) => v ? <rect key={i} x={i % 48} y={Math.floor(i / 48)} width={1} height={1} fill={dark ? "#ffffff" : "#000000"} opacity={0.9} /> : null)}
          </svg>
        </div>
      )}

      <div className="fu" style={{ maxWidth: 700, margin: "0 auto", padding: "48px 24px 80px" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: bg, flexShrink: 0 }}>{initials(user.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 400, letterSpacing: "-1px", color: text, marginBottom: 4 }}>{user.name}</h1>
            {user.username && <div style={{ fontSize: 11, color: textMuted, marginBottom: 4 }}>@{user.username}</div>}
            <div style={{ fontSize: 12, color: textMuted }}>{user.role}</div>
            {user.location && <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>{user.location}</div>}
          </div>
          <button className="hb" onClick={handleCopy} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", color: textMuted, flexShrink: 0 }}>{copied ? "copied ✓" : "share"}</button>
        </div>

        {user.bio && <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.85, marginBottom: 28 }}>{user.bio}</p>}

        {(user.skills || []).length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 10 }}>SKILLS</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {user.skills.map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
            </div>
          </div>
        )}

        {projects.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 12 }}>PROJECTS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {projects.map((p, i) => (
                <a key={p.id} href={`/p/${p.id}`} style={{ display: "block", background: bg2, border: `1px solid ${border}`, borderRadius: i === 0 && projects.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === projects.length - 1 ? "0 0 8px 8px" : 0, borderBottom: i < projects.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px", textDecoration: "none", transition: "opacity 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 4 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: textMuted, marginBottom: 6 }}>{p.category}</div>
                  {(p.skills || []).length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {p.skills.slice(0, 4).map(s => <span key={s} style={{ fontSize: 10, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {portfolio.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 12 }}>PORTFOLIO</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {portfolio.map((item, i) => (
                <div key={item.id} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: i === 0 && portfolio.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === portfolio.length - 1 ? "0 0 8px 8px" : 0, borderBottom: i < portfolio.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px" }}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 4 }}>{item.title}</div>
                  {item.description && <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 6 }}>{item.description}</div>}
                  {item.url && (item.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                    ? <img src={item.url} alt={item.title} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 6, border: `1px solid ${border}`, marginTop: 4 }} />
                    : <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: text, textDecoration: "underline", wordBreak: "break-all" }}>{item.url.includes("user-uploads") ? "view file" : item.url}</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${border}`, marginBottom: 28 }} />

        <a href="/" style={{ display: "block", background: text, color: bg, border: "none", borderRadius: 8, padding: "14px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", textDecoration: "none", textAlign: "center" }}>Connect on CoLab →</a>

        <div style={{ marginTop: 32, fontSize: 11, color: textMuted, lineHeight: 1.7, borderTop: `1px solid ${border}`, paddingTop: 24 }}>
          <a href={`@${user.username}`} style={{ color: text, textDecoration: "none" }}>@{user.username}</a> is a builder on <a href="/" style={{ color: text, textDecoration: "underline" }}>CoLab</a> — find collaborators, ship together.
        </div>
      </div>

      {copied && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: text, color: bg, padding: "10px 18px", borderRadius: 8, fontSize: 11, zIndex: 300, animation: "tin 0.3s ease", whiteSpace: "nowrap" }}>link copied to clipboard</div>}
    </div>
  );
}
