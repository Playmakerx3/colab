import React, { useRef, useMemo, useEffect, useState, useCallback } from "react";

const SKILL_COLORS = {
  "Design":       "#a78bfa",
  "Engineering":  "#60a5fa",
  "Music":        "#f472b6",
  "Video":        "#fb923c",
  "Film / Video": "#fb923c",
  "Marketing":    "#34d399",
  "Finance":      "#fbbf24",
  "Writing":      "#e879f9",
  "AI/ML":        "#38bdf8",
  "Product":      "#4ade80",
  "Photography":  "#f87171",
  "Data":         "#818cf8",
  "Sales":        "#2dd4bf",
  "Operations":   "#94a3b8",
  "3D/CAD":       "#c084fc",
  "Architecture": "#86efac",
};
const DEFAULT_COLOR = "#475569";

function getColor(skills = []) {
  for (const s of skills) if (SKILL_COLORS[s]) return SKILL_COLORS[s];
  return DEFAULT_COLOR;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

export default function NetworkGraph3D({ users, applications, projects, authUser, onNodeClick, dark, following = [], followers = [] }) {
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

  const { nodes, collabLinks, mutualLinks } = useMemo(() => {
    if (!users?.length || !authUser) return { nodes: [], collabLinks: [], mutualLinks: [] };

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

    const w = dims.w, h = dims.h;
    const cx = w / 2, cy = h / 2;

    const skillKeys = Object.keys(SKILL_COLORS);
    const clusterCenters = {};
    skillKeys.forEach((s, i) => {
      const angle = (i / skillKeys.length) * Math.PI * 2 - Math.PI / 2;
      const r = Math.min(w, h) * 0.32;
      clusterCenters[s] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    });

    const nodes = users.filter(u => u.name?.trim()).map(u => {
      const isMe = u.id === authUser.id;
      const isCollab = collaboratorIds.has(u.id);
      const isMutual = !isCollab && mutualFollowIds.has(u.id);
      const primarySkill = (u.skills || []).find(s => clusterCenters[s]);
      const center = primarySkill ? clusterCenters[primarySkill] : { x: cx + (Math.random() - 0.5) * 200, y: cy + (Math.random() - 0.5) * 200 };
      const spread = isCollab ? 80 : isMutual ? 110 : 140;
      return {
        id: u.id, name: u.name, role: u.role || "", skills: u.skills || [],
        color: isMe ? "#ffffff" : getColor(u.skills),
        isMe, isCollab, isMutual,
        r: isMe ? 10 : isCollab ? 6 : isMutual ? 5 : 3,
        x: isMe ? cx : center.x + (Math.random() - 0.5) * spread,
        y: isMe ? cy : center.y + (Math.random() - 0.5) * spread,
        vx: 0, vy: 0,
        targetX: isMe ? cx : center.x,
        targetY: isMe ? cy : center.y,
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

    return { nodes, collabLinks, mutualLinks };
  }, [users, applications, projects, authUser, dims, mutualFollowIds]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodesRef.current.length) return;
    const ctx = canvas.getContext("2d");
    const nodeMap = {};
    nodesRef.current.forEach(n => { nodeMap[n.id] = n; });

    const tick = () => {
      const ns = nodesRef.current;
      const w = canvas.width, h = canvas.height;

      ns.forEach(n => {
        if (n.isMe) return;
        n.vx += (n.targetX - n.x) * 0.003;
        n.vy += (n.targetY - n.y) * 0.003;
        ns.forEach(other => {
          if (other.id === n.id) return;
          const dx = n.x - other.x, dy = n.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = (n.r + other.r) * 3;
          if (dist < minDist) {
            const force = (minDist - dist) / dist * 0.08;
            n.vx += dx * force;
            n.vy += dy * force;
          }
        });
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(n.r, Math.min(w - n.r, n.x));
        n.y = Math.max(n.r, Math.min(h - n.r, n.y));
      });

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = dark ? "#080808" : "#f0f0f0";
      ctx.fillRect(0, 0, w, h);

      // Collaborator links (bright white — your people)
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
          ctx.strokeStyle = dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.stroke();
        });
      }

      // Nodes
      ns.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        const rgb = hexToRgb(n.color);
        ctx.fillStyle = n.isMe ? n.color
          : n.isCollab ? `rgba(${rgb},0.9)`
          : n.isMutual ? `rgba(${rgb},0.65)`
          : `rgba(${rgb},0.35)`;
        ctx.fill();

        if (n.isMe || n.isCollab || n.isMutual) {
          ctx.strokeStyle = n.isMutual ? (dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.55)") : n.color;
          ctx.lineWidth = n.isMe ? 2 : 1;
          ctx.setLineDash([]);
          ctx.stroke();
        }

        if (n.isMe || n.isCollab || n.isMutual) {
          ctx.font = n.isMe ? "bold 11px monospace" : "10px monospace";
          ctx.fillStyle = n.isMutual ? (dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)") : n.color;
          ctx.textAlign = "center";
          ctx.fillText(n.name.split(" ")[0], n.x, n.y + n.r + 12);
        }
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [collabLinks, mutualLinks, showMutualLines, dark, dims]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const hit = nodesRef.current.find(n => {
      const dx = n.x - mx, dy = n.y - my;
      return Math.sqrt(dx * dx + dy * dy) < Math.max(n.r + 4, 8);
    });
    setTooltip(hit && !hit.isMe ? { name: hit.name, role: hit.role, x: mx, y: my, isMutual: hit.isMutual, isCollab: hit.isCollab } : null);
    canvas.style.cursor = hit && !hit.isMe ? "pointer" : "default";
  }, []);

  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const hit = nodesRef.current.find(n => {
      const dx = n.x - mx, dy = n.y - my;
      return Math.sqrt(dx * dx + dy * dy) < Math.max(n.r + 4, 8);
    });
    if (hit && !hit.isMe) {
      const user = users.find(u => u.id === hit.id);
      if (user) onNodeClick(user);
    }
  }, [users, onNodeClick]);

  const legendItems = [
    { type: "node", color: "#ffffff", label: "you", solid: true },
    { type: "line", color: dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)", label: "collaborator", dashed: false, width: 2 },
    { type: "line", color: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)", label: "mutual follow", dashed: false, width: 1 },
  ];

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
      <div style={{ position: "absolute", top: 12, left: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Skill colors */}
        {Object.entries(SKILL_COLORS).filter((_, i) => i % 2 === 0).map(([skill, color]) => (
          <div key={skill} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)", fontFamily: "monospace" }}>{skill}</span>
          </div>
        ))}

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, margin: "2px 0" }} />

        {/* Connection types */}
        {legendItems.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {item.type === "node" ? (
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, border: `1px solid ${item.color}`, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 16, height: 0, borderTop: `${item.width}px solid ${item.color}`, flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 9, color: dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", fontFamily: "monospace" }}>{item.label}</span>
          </div>
        ))}

        {/* Toggle for mutual follow lines */}
        <button
          onClick={() => setShowMutualLines(v => !v)}
          style={{
            marginTop: 4,
            background: showMutualLines ? (dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.07)") : "none",
            border: `1px solid ${dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`,
            borderRadius: 4,
            padding: "3px 8px",
            fontSize: 9,
            color: dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)",
            cursor: "pointer",
            fontFamily: "monospace",
            textAlign: "left",
          }}
        >
          {showMutualLines ? "hide" : "show"} mutual lines
        </button>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "absolute", left: tooltip.x + 12, top: tooltip.y - 10,
          background: dark ? "#1a1a1a" : "#fff",
          border: `1px solid ${tooltip.isMutual ? (dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)") : "rgba(128,128,128,0.2)"}`,
          borderRadius: 6, padding: "6px 10px", pointerEvents: "none",
          fontSize: 11, color: dark ? "#fff" : "#000", fontFamily: "monospace", whiteSpace: "nowrap"
        }}>
          <div>{tooltip.name}</div>
          {tooltip.role && <div style={{ opacity: 0.5, fontSize: 10 }}>{tooltip.role}</div>}
          {tooltip.isMutual && <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>mutual follow</div>}
          {tooltip.isCollab && <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>collaborator</div>}
        </div>
      )}
    </div>
  );
}
