import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { normalizeBannerPixels } from "../constants/appConstants";
import { initials } from "../utils/appHelpers";

const getMediaType = (url = "") => {
  if (!url) return "none";
  const lower = url.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(lower)) return "image";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  return "link";
};

const getYouTubeId = (url = "") => {
  const shortMatch = url.match(/youtu\.be\/([^?&/]+)/i);
  if (shortMatch?.[1]) return shortMatch[1];
  const longMatch = url.match(/[?&]v=([^?&/]+)/i);
  if (longMatch?.[1]) return longMatch[1];
  const embedMatch = url.match(/youtube\.com\/embed\/([^?&/]+)/i);
  return embedMatch?.[1] || null;
};

const toHost = (url = "") => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "external link";
  }
};

export default function PublicProfilePage({ username, userId }) {
  const [dark, setDark] = useState(true);
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [applications, setApplications] = useState([]);
  const [collaborationHistory, setCollaborationHistory] = useState([]);
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
    let isActive = true;

    async function load() {
      setLoading(true);
      setNotFound(false);
      setUser(null);
      setProjects([]);
      setPortfolio([]);
      setProfilesById({});
      setApplications([]);
      setCollaborationHistory([]);

      let profileQuery;
      if (userId) {
        profileQuery = supabase.from("profiles").select("*").eq("id", userId).single();
      } else {
        profileQuery = supabase.from("profiles").select("*").eq("username", username).single();
      }
      const { data: u } = await profileQuery;
      if (!isActive) return;
      if (!u) { setNotFound(true); setLoading(false); return; }
      setUser(u);
      const [{ data: projs }, { data: port }] = await Promise.all([
        supabase.from("projects").select("*").eq("owner_id", u.id).order("created_at", { ascending: false }),
        supabase.from("portfolio_items").select("*").eq("user_id", u.id),
      ]);
      if (!isActive) return;
      const projectIds = (projs || []).map((p) => p.id);
      let apps = [];
      let acceptedAsApplicant = [];
      if (projectIds.length > 0) {
        const { data: appRows } = await supabase
          .from("applications")
          .select("id, project_id, applicant_id, status, created_at")
          .in("project_id", projectIds)
          .eq("status", "accepted")
          .order("created_at", { ascending: false });
        if (!isActive) return;
        apps = appRows || [];
      }
      const { data: applicantRows } = await supabase
        .from("applications")
        .select("id, project_id, applicant_id, status, created_at")
        .eq("applicant_id", u.id)
        .eq("status", "accepted")
        .order("created_at", { ascending: false });
      if (!isActive) return;
      acceptedAsApplicant = applicantRows || [];

      const projectIdsAsApplicant = [...new Set(acceptedAsApplicant.map((a) => a.project_id).filter(Boolean))];
      let ownerProjects = [];
      if (projectIdsAsApplicant.length > 0) {
        const { data: ownerProjectRows } = await supabase
          .from("projects")
          .select("id, owner_id, title")
          .in("id", projectIdsAsApplicant);
        if (!isActive) return;
        ownerProjects = ownerProjectRows || [];
      }

      const uniqueApplicantIds = [...new Set(apps.map((a) => a.applicant_id).filter(Boolean))];
      const ownerIds = [...new Set(ownerProjects.map((p) => p.owner_id).filter((id) => id && id !== u.id))];
      const allCollaboratorIds = [...new Set([...uniqueApplicantIds, ...ownerIds])];
      let collaboratorMap = {};
      if (allCollaboratorIds.length > 0) {
        const { data: collaboratorProfiles } = await supabase
          .from("profiles")
          .select("id, name, username, role")
          .in("id", allCollaboratorIds);
        if (!isActive) return;
        (collaboratorProfiles || []).forEach((row) => { collaboratorMap[row.id] = row; });
        setProfilesById(collaboratorMap);
      } else {
        setProfilesById({});
      }

      const ownerProjectById = {};
      ownerProjects.forEach((p) => { ownerProjectById[p.id] = p; });
      const history = [];
      const seen = new Set();
      apps.forEach((a) => {
        const collaborator = a.applicant_id ? { id: a.applicant_id, ...(collaboratorMap[a.applicant_id] || {}) } : null;
        if (!collaborator?.id || collaborator.id === u.id || seen.has(collaborator.id)) return;
        seen.add(collaborator.id);
        history.push({ ...collaborator, viaProjectId: a.project_id });
      });
      acceptedAsApplicant.forEach((a) => {
        const ownerProject = ownerProjectById[a.project_id];
        const ownerId = ownerProject?.owner_id;
        const collaborator = ownerId ? { id: ownerId, ...(collaboratorMap[ownerId] || {}) } : null;
        if (!collaborator?.id || collaborator.id === u.id || seen.has(collaborator.id)) return;
        seen.add(collaborator.id);
        history.push({ ...collaborator, viaProjectId: a.project_id });
      });
      if (!isActive) return;
      setCollaborationHistory(history);
      setProjects(projs || []);
      setPortfolio(port || []);
      setApplications(apps);
      setLoading(false);
    }
    load();

    return () => {
      isActive = false;
    };
  }, [username, userId]);

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

  const bannerPixels = (() => { try { return user.banner_pixels ? normalizeBannerPixels(JSON.parse(user.banner_pixels)) : null; } catch { return null; } })();
  const sortedProjects = [...projects].sort((a, b) => Number(b.featured) - Number(a.featured) || new Date(b.created_at) - new Date(a.created_at));
  const pinnedProjects = sortedProjects.filter((p) => p.featured);
  const hasActivity = applications.length > 0 || projects.some((p) => p.shipped);
  const getProjectCollaborators = (projectId) => {
    return applications
      .filter((a) => a.project_id === projectId)
      .map((a) => profilesById[a.applicant_id])
      .filter(Boolean)
      .slice(0, 3);
  };

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

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 12 }}>COLLABORATORS</div>
          {collaborationHistory.length === 0 ? (
            <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "14px 16px", fontSize: 12, color: textMuted }}>
              no collaborators yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {collaborationHistory.map((c, i) => (
                <div key={c.id} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: i === 0 && collaborationHistory.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === collaborationHistory.length - 1 ? "0 0 8px 8px" : 0, borderBottom: i < collaborationHistory.length - 1 ? "none" : `1px solid ${border}`, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, color: text }}>{c.name || "Unknown builder"}</div>
                  <div style={{ fontSize: 11, color: textMuted }}>
                    {c.username ? `@${c.username}` : "no username"}{c.role ? ` · ${c.role}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 12 }}>PROJECTS</div>
          {projects.length > 0 ? (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {sortedProjects.map((p, i) => {
                const collaborators = getProjectCollaborators(p.id);
                return (
                <a key={p.id} href={`/p/${p.id}`} style={{ display: "block", background: bg2, border: `1px solid ${border}`, borderRadius: i === 0 && projects.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === projects.length - 1 ? "0 0 8px 8px" : 0, borderBottom: i < projects.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px", textDecoration: "none", transition: "opacity 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ fontSize: 13, color: text, marginBottom: 4, fontWeight: p.featured ? 500 : 400 }}>{p.title}</div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {p.featured && <span style={{ fontSize: 10, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px", color: text }}>pinned</span>}
                      <span style={{ fontSize: 10, border: `1px solid ${p.shipped ? "#22c55e66" : border}`, borderRadius: 3, padding: "1px 6px", color: p.shipped ? "#22c55e" : textMuted }}>{p.shipped ? "shipped" : "active"}</span>
                    </div>
                  </div>
                  {p.description && <div style={{ fontSize: 11, color: textMuted, marginBottom: 6, lineHeight: 1.6 }}>{p.description.slice(0, 120)}{p.description.length > 120 ? "..." : ""}</div>}
                  <div style={{ fontSize: 11, color: textMuted, marginBottom: 6 }}>{p.category}</div>
                  {collaborators.length > 0 && <div style={{ fontSize: 10, color: textMuted, marginBottom: 6 }}>with {collaborators.map((c) => c.username ? `@${c.username}` : c.name).join(", ")}</div>}
                  {(p.skills || []).length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {p.skills.slice(0, 4).map(s => <span key={s} style={{ fontSize: 10, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
                    </div>
                  )}
                </a>
              )})}
            </div>
            {pinnedProjects.length > 0 && <div style={{ marginTop: 8, fontSize: 10, color: textMuted }}>{pinnedProjects.length} pinned project{pinnedProjects.length > 1 ? "s" : ""} highlighted first.</div>}
          </div>
          ) : (
            <div style={{ background: bg2, border: `1px dashed ${border}`, borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: text, marginBottom: 4 }}>No projects yet.</div>
              <div style={{ fontSize: 11, color: textMuted, marginBottom: 8 }}>Create your first project to show what you’re building.</div>
              <a href="/" style={{ fontSize: 11, color: text, textDecoration: "underline" }}>Create your first project →</a>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 12 }}>PORTFOLIO</div>
          {portfolio.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {portfolio.map((item, i) => (
                <div key={item.id} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: i === 0 && portfolio.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === portfolio.length - 1 ? "0 0 8px 8px" : 0, borderBottom: i < portfolio.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px" }}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 4 }}>{item.title}</div>
                  {item.description && <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 6 }}>{item.description}</div>}
                  {item.url && getMediaType(item.url) === "image" && <img src={item.url} alt={item.title} style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 6, border: `1px solid ${border}`, marginTop: 4 }} />}
                  {item.url && getMediaType(item.url) === "youtube" && (
                    <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${border}`, marginTop: 6 }}>
                      <iframe title={item.title} src={`https://www.youtube.com/embed/${getYouTubeId(item.url) || ""}`} style={{ width: "100%", height: 240, border: "none" }} allowFullScreen />
                    </div>
                  )}
                  {item.url && getMediaType(item.url) === "link" && (
                    <a href={item.url} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px", marginTop: 6 }}>
                      <div style={{ fontSize: 10, color: textMuted, marginBottom: 3 }}>{toHost(item.url)}</div>
                      <div style={{ fontSize: 11, color: text, textDecoration: "underline", wordBreak: "break-all" }}>{item.url.includes("user-uploads") ? "view file" : item.url}</div>
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: bg2, border: `1px dashed ${border}`, borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: text, marginBottom: 4 }}>No portfolio work yet.</div>
              <div style={{ fontSize: 11, color: textMuted, marginBottom: 8 }}>Add portfolio work so collaborators can quickly see what you’ve built.</div>
              <a href="/" style={{ fontSize: 11, color: text, textDecoration: "underline" }}>Add portfolio work →</a>
            </div>
          )}
        </div>

        {hasActivity && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 12 }}>ACTIVITY</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {projects.filter((p) => p.shipped).slice(0, 3).map((p, i) => (
                <a key={p.id} href={`/p/${p.id}/shipped`} style={{ background: bg2, border: `1px solid ${border}`, borderBottom: i < Math.min(projects.filter((x) => x.shipped).length, 3) - 1 ? "none" : `1px solid ${border}`, borderRadius: i === 0 ? "8px 8px 0 0" : i === 2 ? "0 0 8px 8px" : 0, textDecoration: "none", padding: "11px 14px" }}>
                  <div style={{ fontSize: 12, color: text }}>Shipped {p.title}</div>
                  <div style={{ fontSize: 10, color: textMuted }}>{p.shipped_at ? new Date(p.shipped_at).toLocaleDateString() : "recently"}</div>
                </a>
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
