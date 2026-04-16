import React, { useRef, useMemo, useEffect, useState, useCallback } from "react";

// ── Macro clusters ──────────────────────────────────────────────────────────
const SKILL_CLUSTERS = {
  Creative: {
    color: "#a78bfa",
    skills: [
      "Design", "Illustration", "Motion Design", "Animation", "Photography",
      "Video", "Music", "Podcast", "Writing", "Copywriting",
      "Content Strategy", "Journalism", "Branding",
    ],
  },
  Tech: {
    color: "#60a5fa",
    skills: [
      "Engineering", "Frontend", "Backend", "Mobile Dev", "DevOps",
      "Security", "AI/ML", "Data", "Blockchain", "AR/VR",
      "Game Dev", "Robotics", "Data Analysis",
    ],
  },
  Business: {
    color: "#34d399",
    skills: [
      "Product", "Marketing", "Sales", "Growth", "SEO", "Social Media",
      "Finance", "Fundraising", "Business Development", "Strategy",
      "Operations", "Project Management", "Legal", "Accounting",
      "HR/Recruiting", "Customer Success",
    ],
  },
  Making: {
    color: "#fb923c",
    skills: [
      "Architecture", "3D/CAD", "Industrial Design", "Hardware",
      "Electrical Engineering", "Mechanical Engineering", "Woodworking", "Fashion",
    ],
  },
  Research: {
    color: "#2dd4bf",
    skills: [
      "Research", "Healthcare", "Education", "Policy", "Community",
    ],
  },
};

// Reverse lookup: skill → { cluster, color }
const SKILL_META = {};
Object.entries(SKILL_CLUSTERS).forEach(([clusterName, { color, skills }]) => {
  skills.forEach(s => { SKILL_META[s] = { cluster: clusterName, color }; });
});

function getNodeColor(skills = []) {
  for (const s of skills) if (SKILL_META[s]) return SKILL_META[s].color;
  return "#475569";
}
function getClusterName(skills = []) {
  for (const s of skills) if (SKILL_META[s]) return SKILL_META[s].cluster;
  return null;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function NetworkGraph3D({
  users, applications, projects, authUser,
  onNodeClick, dark,
  following = [], followers = [],
}) {
  const canvasRef = useRef();
  const nodesRef = useRef([]);
  const rafRef = useRef();
  const [tooltip, setTooltip] = useState(null);
  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [showMutualLines, setShowMutualLines] = useState(true);

  const mutualFollowIds = useMemo(() => {
    if (!authUser) return new Set();
    return new Set(following.filter(id => followers.includes(id)));
  }, [following, followers, authUser]);

  // ── Layout ─────────────────────────────────────────────────────────────────
  // Returns macro cluster centers + skill sub-centers given canvas size
  const getLayout = useCallback((w, h) => {
    const cx = w / 2, cy = h / 2;
    const clusterNames = Object.keys(SKILL_CLUSTERS);
    const macroR = Math.min(w, h) * 0.30;

    // Macro cluster centers — evenly spaced around a circle
    const macroCenters = {};
    clusterNames.forEach((name, i) => {
      const angle = (i / clusterNames.length) * Math.PI * 2 - Math.PI / 2;
      macroCenters[name] = {
        x: cx + Math.cos(angle) * macroR,
        y: cy + Math.sin(angle) * macroR,
      };
    });

    // Skill sub-centers — smaller ring within each macro cluster
    const skillCenters = {};
    Object.entries(SKILL_CLUSTERS).forEach(([clusterName, { skills }]) => {
      const mc = macroCenters[clusterName];
      const subR = Math.min(w, h) * 0.09;
      skills.forEach((skill, i) => {
        const angle = (i / skills.length) * Math.PI * 2;
        skillCenters[skill] = {
          x: mc.x + Math.cos(angle) * subR,
          y: mc.y + Math.sin(angle) * subR,
        };
      });
    });

    return { macroCenters, skillCenters, cx, cy };
  }, []);

  // ── Graph data ──────────────────────────────────────────────────────────────
  const { nodes, collabLinks, mutualLinks, macroCenters, skillPopulation } = useMemo(() => {
    if (!users?.length || !authUser) return { nodes: [], collabLinks: [], mutualLinks: [], macroCenters: {}, skillPopulation: {} };

    const { macroCenters, skillCenters, cx, cy } = getLayout(dims.w, dims.h);

    const myProjectIds = new Set([
      ...projects.filter(p => p.owner_id === authUser.id).map(p => p.id),
      ...applications.filter(a => a.applicant_id === authUser.id && a.status === "accepted").map(a => a.project_id),
    ]);
    const collaboratorIds = new Set(
      applications
        .filter(a => myProjectIds.has(a.project_id) && a.status === "accepted" && a.applicant_id !== authUser.id)
        .map(a => a.applicant_id)
    );
    projects.filter(p => myProjectIds.has(p.id) && p.owner_id !== authUser.id).forEach(p => collaboratorIds.add(p.owner_id));

    // Count how many people are in each skill (for label threshold)
    const skillPopulation = {};
    users.forEach(u => (u.skills || []).forEach(s => { skillPopulation[s] = (skillPopulation[s] || 0) + 1; }));

    const nodes = users.filter(u => u.name?.trim()).map(u => {
      const isMe = u.id === authUser.id;
      const isCollab = collaboratorIds.has(u.id);
      const isMutual = !isCollab && mutualFollowIds.has(u.id);
      const primarySkill = (u.skills || []).find(s => skillCenters[s]);
      const skillCenter = primarySkill ? skillCenters[primarySkill] : null;
      const macroCluster = getClusterName(u.skills);
      const macroCenter = macroCluster ? macroCenters[macroCluster] : null;

      // Fallback position: if no known skill, scatter around canvas center
      const fallback = { x: cx + (Math.random() - 0.5) * 160, y: cy + (Math.random() - 0.5) * 160 };
      const target = skillCenter || macroCenter || fallback;
      const jitter = isCollab ? 30 : isMutual ? 40 : 28;

      return {
        id: u.id,
        name: u.name,
        role: u.role || "",
        skills: u.skills || [],
        primarySkill: primarySkill || null,
        macroCluster,
        color: isMe ? "#ffffff" : getNodeColor(u.skills),
        isMe, isCollab, isMutual,
        r: isMe ? 10 : isCollab ? 7 : isMutual ? 5 : 3.5,
        x: isMe ? cx : target.x + (Math.random() - 0.5) * jitter,
        y: isMe ? cy : target.y + (Math.random() - 0.5) * jitter,
        vx: 0, vy: 0,
        targetX: isMe ? cx : target.x,
        targetY: isMe ? cy : target.y,
      };
    });

    const collabLinks = [];
    collaboratorIds.forEach(cid => {
      if (users.find(u => u.id === cid)) collabLinks.push({ source: authUser.id, target: cid });
    });
    const mutualLinks = [];
    mutualFollowIds.forEach(uid => {
      if (users.find(u => u.id === uid)) mutualLinks.push({ source: authUser.id, target: uid });
    });

    return { nodes, collabLinks, mutualLinks, macroCenters, skillPopulation };
  }, [users, applications, projects, authUser, dims, mutualFollowIds, getLayout]);

  useEffect(() => { nodesRef.current = nodes.map(n => ({ ...n })); }, [nodes]);

  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: Math.max(500, window.innerHeight - 160) });
    });
    ro.observe(el);
    setDims({ w: el.offsetWidth, h: Math.max(500, window.innerHeight - 160) });
    return () => ro.disconnect();
  }, []);

  // ── Render loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodesRef.current.length) return;
    const ctx = canvas.getContext("2d");
    const { skillCenters, macroCenters: mc } = getLayout(dims.w, dims.h);

    const tick = () => {
      const ns = nodesRef.current;
      const nodeMap = {};
      ns.forEach(n => { nodeMap[n.id] = n; });
      const w = canvas.width, h = canvas.height;

      // Physics
      ns.forEach(n => {
        if (n.isMe) return;
        // Attraction toward skill target
        n.vx += (n.targetX - n.x) * 0.004;
        n.vy += (n.targetY - n.y) * 0.004;
        // Repulsion from nearby nodes
        ns.forEach(other => {
          if (other.id === n.id) return;
          const dx = n.x - other.x, dy = n.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          // Same-skill nodes can pack tighter; different-cluster nodes repel more
          const sameSkill = n.primarySkill && n.primarySkill === other.primarySkill;
          const minDist = sameSkill ? (n.r + other.r) * 2 : (n.r + other.r) * 3.5;
          if (dist < minDist) {
            const force = (minDist - dist) / dist * (sameSkill ? 0.04 : 0.09);
            n.vx += dx * force;
            n.vy += dy * force;
          }
        });
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(n.r, Math.min(w - n.r, n.x));
        n.y = Math.max(n.r, Math.min(h - n.r, n.y));
      });

      // ── Draw ──────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = dark ? "#080808" : "#f0f0f0";
      ctx.fillRect(0, 0, w, h);

      // Macro cluster zone labels (large, faint)
      Object.entries(SKILL_CLUSTERS).forEach(([name, { color }]) => {
        const center = mc[name];
        if (!center) return;
        ctx.font = `bold ${Math.round(Math.min(w, h) * 0.028)}px monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = dark ? `rgba(${hexToRgb(color)},0.08)` : `rgba(${hexToRgb(color)},0.12)`;
        ctx.fillText(name.toUpperCase(), center.x, center.y);
      });

      // Skill sub-labels — only for skills with at least 1 user
      ctx.font = "9px monospace";
      Object.entries(skillCenters).forEach(([skill, pos]) => {
        if (!skillPopulation[skill]) return;
        const meta = SKILL_META[skill];
        if (!meta) return;
        ctx.textAlign = "center";
        ctx.fillStyle = dark
          ? `rgba(${hexToRgb(meta.color)},0.28)`
          : `rgba(${hexToRgb(meta.color)},0.38)`;
        ctx.fillText(skill, pos.x, pos.y - 14);
      });

      // Collaborator links (bright white)
      collabLinks.forEach(link => {
        const s = nodeMap[link.source], t = nodeMap[link.target];
        if (!s || !t) return;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.stroke();
      });

      // Mutual follow links (faint)
      if (showMutualLines) {
        mutualLinks.forEach(link => {
          const s = nodeMap[link.source], t = nodeMap[link.target];
          if (!s || !t) return;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.stroke();
        });
      }

      // Nodes
      ns.forEach(n => {
        const rgb = hexToRgb(n.color);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.isMe ? n.color
          : n.isCollab ? `rgba(${rgb},0.95)`
          : n.isMutual ? `rgba(${rgb},0.65)`
          : `rgba(${rgb},0.4)`;
        ctx.fill();

        // Ring for collab / mutual
        if (n.isMe || n.isCollab) {
          ctx.strokeStyle = n.color;
          ctx.lineWidth = n.isMe ? 2 : 1.5;
          ctx.setLineDash([]);
          ctx.stroke();
        } else if (n.isMutual) {
          ctx.strokeStyle = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)";
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.stroke();
        }

        // Name labels for notable nodes
        if (n.isMe || n.isCollab || n.isMutual) {
          ctx.font = n.isMe ? "bold 11px monospace" : "10px monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = n.isCollab ? n.color
            : n.isMutual ? (dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)")
            : n.color;
          ctx.fillText(n.name.split(" ")[0], n.x, n.y + n.r + 12);
        }
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [collabLinks, mutualLinks, showMutualLines, dark, dims, getLayout, skillPopulation]);

  // ── Interaction ─────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const hit = nodesRef.current.find(n => {
      const dx = n.x - mx, dy = n.y - my;
      return Math.sqrt(dx * dx + dy * dy) < Math.max(n.r + 5, 10);
    });
    setTooltip(hit && !hit.isMe ? {
      name: hit.name, role: hit.role,
      primarySkill: hit.primarySkill,
      isMutual: hit.isMutual, isCollab: hit.isCollab,
      x: mx, y: my,
    } : null);
    canvas.style.cursor = hit && !hit.isMe ? "pointer" : "default";
  }, []);

  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const hit = nodesRef.current.find(n => {
      const dx = n.x - mx, dy = n.y - my;
      return Math.sqrt(dx * dx + dy * dy) < Math.max(n.r + 5, 10);
    });
    if (hit && !hit.isMe) {
      const user = users.find(u => u.id === hit.id);
      if (user) onNodeClick(user);
    }
  }, [users, onNodeClick]);

  // ── Legend ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100%", height: dims.h, overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        width={dims.w}
        height={dims.h}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        onClick={handleClick}
        style={{ display: "block" }}
      />

      {/* Legend */}
      <div style={{ position: "absolute", top: 12, left: 12, display: "flex", flexDirection: "column", gap: 5 }}>
        {/* Cluster colors */}
        {Object.entries(SKILL_CLUSTERS).map(([name, { color }]) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: dark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)", fontFamily: "monospace" }}>{name}</span>
          </div>
        ))}

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, margin: "2px 0" }} />

        {/* Connection types */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 0, borderTop: `2px solid ${dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)"}`, flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", fontFamily: "monospace" }}>collaborator</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 0, borderTop: `1px solid ${dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)"}`, flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", fontFamily: "monospace" }}>mutual follow</span>
        </div>

        {/* Toggle */}
        <button
          onClick={() => setShowMutualLines(v => !v)}
          style={{
            marginTop: 2,
            background: showMutualLines ? (dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)") : "none",
            border: `1px solid ${dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)"}`,
            borderRadius: 4, padding: "3px 8px", fontSize: 9,
            color: dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
            cursor: "pointer", fontFamily: "monospace", textAlign: "left",
          }}
        >
          {showMutualLines ? "hide" : "show"} mutual lines
        </button>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "absolute", left: tooltip.x + 14, top: tooltip.y - 12,
          background: dark ? "#1a1a1a" : "#fff",
          border: `1px solid ${tooltip.isCollab
            ? (dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)")
            : "rgba(128,128,128,0.2)"}`,
          borderRadius: 6, padding: "7px 11px",
          pointerEvents: "none", fontSize: 11,
          color: dark ? "#fff" : "#000",
          fontFamily: "monospace", whiteSpace: "nowrap",
        }}>
          <div>{tooltip.name}</div>
          {tooltip.role && <div style={{ opacity: 0.5, fontSize: 10, marginTop: 1 }}>{tooltip.role}</div>}
          {tooltip.primarySkill && <div style={{ opacity: 0.45, fontSize: 9, marginTop: 2 }}>{tooltip.primarySkill}</div>}
          {tooltip.isCollab && <div style={{ fontSize: 9, opacity: 0.55, marginTop: 3 }}>collaborator</div>}
          {tooltip.isMutual && <div style={{ fontSize: 9, opacity: 0.55, marginTop: 3 }}>mutual follow</div>}
        </div>
      )}
    </div>
  );
}
