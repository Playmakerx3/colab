import React from "react";
import { supabase } from "../supabase";

export default function ShippedPage({ projectId }) {
  const [project, setProject] = React.useState(null);
  const [owner, setOwner] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      const { data: proj } = await supabase.from("projects").select("*").eq("id", projectId).single();
      if (!proj) { setLoading(false); return; }
      setProject(proj);
      const { data: ownerData } = await supabase.from("profiles").select("name,role,username").eq("id", proj.owner_id).single();
      setOwner(ownerData);
      setLoading(false);
    })();
  }, [projectId]);

  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const bg = dark ? "#0a0a0a" : "#fafafa";
  const text = dark ? "#f0f0f0" : "#111";
  const textMuted = dark ? "#555" : "#aaa";
  const border = dark ? "#1e1e1e" : "#e5e5e5";

  if (loading) return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace", color: textMuted }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      loading...
    </div>
  );

  if (!project) return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace", color: textMuted }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ marginBottom: 16 }}>project not found.</div>
        <a href="/" style={{ color: text, fontSize: 12 }}>← back to CoLab</a>
      </div>
    </div>
  );

  const shippedDate = project.shipped_at ? new Date(project.shipped_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;

  return (
    <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'DM Mono', monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } html, body { background: ${bg}; } .hb:hover { opacity: 0.7; }`}</style>
      <nav style={{ borderBottom: `1px solid ${border}`, padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.5px", color: text, textDecoration: "none" }}>[CoLab]</a>
        <a href={`/p/${projectId}`} style={{ fontSize: 11, color: textMuted, textDecoration: "none" }}>view project →</a>
      </nav>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 24 }}></div>
        <div style={{ fontSize: 10, color: "#22c55e", letterSpacing: "3px", marginBottom: 16 }}>SHIPPED</div>
        <h1 style={{ fontSize: "clamp(24px, 5vw, 40px)", fontWeight: 400, letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 16, color: text }}>{project.title}</h1>
        {owner && (
          <div style={{ fontSize: 13, color: textMuted, marginBottom: 12 }}>
            built by {owner.name}{owner.username ? ` · @${owner.username}` : ""}
          </div>
        )}
        {shippedDate && <div style={{ fontSize: 11, color: textMuted, marginBottom: 32 }}>shipped {shippedDate}</div>}
        {project.description && (
          <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.8, marginBottom: 40, textAlign: "left", background: dark ? "#111" : "#f5f5f5", border: `1px solid ${border}`, borderRadius: 10, padding: "20px 24px" }}>
            {project.description}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <a href={`/p/${projectId}`} style={{ padding: "10px 24px", background: text, color: bg, borderRadius: 8, fontSize: 12, textDecoration: "none", fontWeight: 500 }}>View project</a>
          <a href="/" style={{ padding: "10px 24px", background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12, textDecoration: "none" }}>Browse CoLab →</a>
        </div>
        <div style={{ marginTop: 60, fontSize: 11, color: textMuted }}>
          built on <a href="/" style={{ color: text, textDecoration: "underline" }}>CoLab</a> — find collaborators, ship together.
        </div>
      </div>
    </div>
  );
}
