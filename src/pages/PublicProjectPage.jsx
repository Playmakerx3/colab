import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { initials } from "../utils/appHelpers";

export default function PublicProjectPage({ projectId }) {
  const [dark, setDark] = useState(true);
  const [project, setProject] = useState(null);
  const [owner, setOwner] = useState(null);
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
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fu { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .fu { animation: fu 0.35s ease forwards; }
    @keyframes tin { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    .hb:hover { opacity: 0.7; cursor: pointer; }
  `;

  useEffect(() => {
    document.body.style.backgroundColor = dark ? "#0a0a0a" : "#ffffff";
  }, [dark]);

  useEffect(() => {
    if (!project) return;
    const title = `${project.title} — CoLab`;
    const desc = project.description ? project.description.slice(0, 160) : "A project looking for collaborators on CoLab.";
    const url = window.location.href;
    document.title = title;
    const setMeta = (prop, val, attr = "property") => {
      let el = document.querySelector(`meta[${attr}="${prop}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, prop); document.head.appendChild(el); }
      el.setAttribute("content", val);
    };
    setMeta("og:title", title);
    setMeta("og:description", desc);
    setMeta("og:url", url);
    setMeta("og:type", "website");
    setMeta("og:site_name", "CoLab");
    setMeta("twitter:card", "summary", "name");
    setMeta("twitter:title", title, "name");
    setMeta("twitter:description", desc, "name");
  }, [project]);

  useEffect(() => {
    async function load() {
      const { data: proj } = await supabase.from("projects").select("*").eq("id", projectId).single();
      if (!proj) { setNotFound(true); setLoading(false); return; }
      setProject(proj);
      const { data: ownerData } = await supabase.from("profiles").select("id,name,role,bio,skills,username").eq("id", proj.owner_id).single();
      setOwner(ownerData);
      setLoading(false);
    }
    load();
  }, [projectId]);

  const spots = project ? (project.max_collaborators || 2) - (project.collaborators || 0) : 0;
  const shareUrl = window.location.href;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
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
        <div style={{ fontSize: 14, marginBottom: 16 }}>project not found.</div>
        <a href="/" style={{ fontSize: 12, color: "#fff", textDecoration: "underline" }}>← back to CoLab</a>
      </div>
    </div>
  );

  const ownerInitials = initials(owner?.name, "?");

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

      <div className="fu" style={{ maxWidth: 700, margin: "0 auto", padding: "48px 24px 80px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: bg, flexShrink: 0 }}>{ownerInitials}</div>
          <div>
            <div style={{ fontSize: 13, color: text }}>{owner?.name || "—"}</div>
            <div style={{ fontSize: 11, color: textMuted }}>{owner?.role || ""}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: spots > 0 ? text : textMuted, border: `1px solid ${spots > 0 ? border : "transparent"}`, borderRadius: 3, padding: "2px 8px" }}>{spots > 0 ? `${spots} spot${spots !== 1 ? "s" : ""} open` : "full"}</span>
          </div>
        </div>

        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 10 }}>{(project.category || "").toUpperCase()}</div>
        <h1 style={{ fontSize: "clamp(22px, 5vw, 36px)", fontWeight: 400, letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 16, color: text }}>{project.title}</h1>
        <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.85, marginBottom: 28 }}>{project.description}</p>

        {(project.goals || project.timeline) && (
          <div style={{ marginBottom: 28, padding: "16px 18px", background: bg2, border: `1px solid ${border}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
            {project.goals && (
              <div>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 4 }}>GOALS</div>
                <div style={{ fontSize: 13, color: text, lineHeight: 1.65 }}>{project.goals}</div>
              </div>
            )}
            {project.timeline && (
              <div>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 4 }}>TIMELINE</div>
                <div style={{ fontSize: 13, color: text }}>{project.timeline}</div>
              </div>
            )}
          </div>
        )}

        {(project.skills || []).length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 10 }}>SKILLS NEEDED</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {project.skills.map(s => (
                <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {project.location && (
          <div style={{ marginBottom: 28, fontSize: 12, color: textMuted }}>
            <span style={{ fontSize: 10, letterSpacing: "1.5px" }}>LOCATION </span>{project.location}
          </div>
        )}

        <div style={{ borderTop: `1px solid ${border}`, marginBottom: 28 }} />

        {project.shipped ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ padding: "12px 16px", background: dark ? "#0a1a0a" : "#f0fdf0", border: "1px solid #22c55e40", borderRadius: 8, fontSize: 12, color: "#22c55e", textAlign: "center" }}>this project has shipped</div>
            <a href={`/p/${project.id}/shipped`} style={{ display: "block", background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: textMuted, textDecoration: "none", textAlign: "center" }}>view shipped page →</a>
            <button className="hb" onClick={handleCopy} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: textMuted }}>{copied ? "link copied ✓" : "copy link"}</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="hb" onClick={() => { sessionStorage.setItem("pendingApply", JSON.stringify({ projectId: project.id, projectTitle: project.title })); window.location.href = "/"; }} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "14px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Apply to collaborate →</button>
            <button className="hb" onClick={handleCopy} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: textMuted }}>{copied ? "link copied ✓" : "copy link"}</button>
          </div>
        )}

        <div style={{ marginTop: 32, fontSize: 11, color: textMuted, lineHeight: 1.7, borderTop: `1px solid ${border}`, paddingTop: 24 }}>
          This project is listed on <a href="/" style={{ color: text, textDecoration: "underline" }}>CoLab</a> — a platform for builders to find collaborators and ship together.
        </div>
      </div>

      {copied && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: text, color: bg, padding: "10px 18px", borderRadius: 8, fontSize: 11, zIndex: 300, animation: "tin 0.3s ease", whiteSpace: "nowrap" }}>link copied to clipboard</div>}
    </div>
  );
}
