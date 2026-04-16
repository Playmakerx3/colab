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

  // ── Viewport (pan + zoom) — kept in refs so no re-render per frame ──────────
  const viewRef = useRef({ x: 0, y: 0, scale: 1 });
  const isPanningRef = useRef(false);
  const panMovedRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef(null);

  const screenToWorld = useCallback((sx, sy) => {
    const { x, y, scale } = viewRef.current;
    return { x: (sx - x) / scale, y: (sy - y) / scale };
  }, []);

  const zoomAt = useCallback((sx, sy, factor) => {
    const v = viewRef.current;
    const newScale = Math.max(0.25, Math.min(5, v.scale * factor));
    const ratio = newScale / v.scale;
    viewRef.current = { x: sx - (sx - v.x) * ratio, y: sy - (sy - v.y) * ratio, scale: newScale };
  }, []);

  const resetView = useCallback(() => {
    viewRef.current = { x: 0, y: 0, scale: 1 };
  }, []);

  const mutualFollowIds = useMemo(() => {
    if (!authUser) return new Set();
    return new Set(following.filter(id => followers.includes(id)));
  }, [following, followers, authUser]);

  // ── Layout ──────────────────────────────────────────────────────────────────
  const getLayout = useCallback((w, h) => {
    const cx = w / 2, cy = h / 2;
    const clusterNames = Object.keys(SKILL_CLUSTERS);
    const macroR = Math.min(w, h) * 0.30;
    const macroCenters = {};
    clusterNames.forEach((name, i) => {
      const angle = (i / clusterNames.length) * Math.PI * 2 - Math.PI / 2;
      macroCenters[name] = { x: cx + Math.cos(angle) * macroR, y: cy + Math.sin(angle) * macroR };
    });
    const skillCenters = {};
    Object.entries(SKILL_CLUSTERS).forEach(([clusterName, { skills }]) => {
      const mc = macroCenters[clusterName];
      const subR = Math.min(w, h) * 0.09;
      skills.forEach((skill, i) => {
        const angle = (i / skills.length) * Math.PI * 2;
        skillCenters[skill] = { x: mc.x + Math.cos(angle) * subR, y: mc.y + Math.sin(angle) * subR };
      });
    });
    return { macroCenters, skillCenters, cx, cy };
  }, []);

  // ── Graph data ──────────────────────────────────────────────────────────────
  const { nodes, collabLinks, mutualLinks, skillPopulation } = useMemo(() => {
    if (!users?.length || !authUser) return { nodes: [], collabLinks: [], mutualLinks: [], skillPopulation: {} };

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
      const fallback = { x: cx + (Math.random() - 0.5) * 160, y: cy + (Math.random() - 0.5) * 160 };
      const target = skillCenter || macroCenter || fallback;
      const jitter = isCollab ? 30 : isMutual ? 40 : 28;
      return {
        id: u.id, name: u.name, role: u.role || "", skills: u.skills || [],
        primarySkill: primarySkill || null, macroCluster,
        color: getNodeColor(u.skills),
        isMe, isCollab, isMutual,
        r: isMe ? 10 : isCollab ? 7 : isMutual ? 5 : 3.5,
        x: isMe ? cx : target.x + (Math.random() - 0.5) * jitter,
        y: isMe ? cy : target.y + (Math.random() - 0.5) * jitter,
        vx: 0, vy: 0, targetX: isMe ? cx : target.x, targetY: isMe ? cy : target.y,
      };
    });

    const collabLinks = [];
    collaboratorIds.forEach(cid => { if (users.find(u => u.id === cid)) collabLinks.push({ source: authUser.id, target: cid }); });
    const mutualLinks = [];
    mutualFollowIds.forEach(uid => { if (users.find(u => u.id === uid)) mutualLinks.push({ source: authUser.id, target: uid }); });

    return { nodes, collabLinks, mutualLinks, skillPopulation };
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
      const w = canvas.width, h = canvas.height;
      const { x: vx, y: vy, scale: vs } = viewRef.current;

      // Physics (always in world space)
      ns.forEach(n => {
        if (n.isMe) return;
        n.vx += (n.targetX - n.x) * 0.004;
        n.vy += (n.targetY - n.y) * 0.004;
        ns.forEach(other => {
          if (other.id === n.id) return;
          const dx = n.x - other.x, dy = n.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const sameSkill = n.primarySkill && n.primarySkill === other.primarySkill;
          const minDist = sameSkill ? (n.r + other.r) * 2 : (n.r + other.r) * 3.5;
          if (dist < minDist) {
            const force = (minDist - dist) / dist * (sameSkill ? 0.04 : 0.09);
            n.vx += dx * force; n.vy += dy * force;
          }
        });
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
        // World-space boundary (use canvas size / scale as world bounds)
        n.x = Math.max(n.r, Math.min(w - n.r, n.x));
        n.y = Math.max(n.r, Math.min(h - n.r, n.y));
      });

      // Build nodeMap each frame
      const nodeMap = {};
      ns.forEach(n => { nodeMap[n.id] = n; });

      // Clear (always full canvas, before transform)
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = dark ? "#080808" : "#f0f0f0";
      ctx.fillRect(0, 0, w, h);

      // Apply viewport transform
      ctx.save();
      ctx.translate(vx, vy);
      ctx.scale(vs, vs);

      // Macro cluster labels
      Object.entries(SKILL_CLUSTERS).forEach(([name, { color }]) => {
        const center = mc[name];
        if (!center) return;
        ctx.font = `bold ${Math.round(Math.min(w, h) * 0.028)}px monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = dark ? `rgba(${hexToRgb(color)},0.08)` : `rgba(${hexToRgb(color)},0.12)`;
        ctx.fillText(name.toUpperCase(), center.x, center.y);
      });

      // Skill sub-labels
      ctx.font = "9px monospace";
      Object.entries(skillCenters).forEach(([skill, pos]) => {
        if (!skillPopulation[skill]) return;
        const meta = SKILL_META[skill];
        if (!meta) return;
        ctx.textAlign = "center";
        ctx.fillStyle = dark ? `rgba(${hexToRgb(meta.color)},0.28)` : `rgba(${hexToRgb(meta.color)},0.38)`;
        ctx.fillText(skill, pos.x, pos.y - 14);
      });

      // Collaborator links (bright)
      collabLinks.forEach(link => {
        const s = nodeMap[link.source], t = nodeMap[link.target];
        if (!s || !t) return;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke();
      });

      // Mutual follow links (faint)
      if (showMutualLines) {
        mutualLinks.forEach(link => {
          const s = nodeMap[link.source], t = nodeMap[link.target];
          if (!s || !t) return;
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
          ctx.lineWidth = 1; ctx.setLineDash([]); ctx.stroke();
        });
      }

      // Nodes
      ns.forEach(n => {
        const meColor = dark ? "#ffffff" : "#111111";
        const rgb = hexToRgb(n.color);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.isMe ? meColor
          : n.isCollab ? `rgba(${rgb},0.95)`
          : n.isMutual ? `rgba(${rgb},0.65)`
          : `rgba(${rgb},0.4)`;
        ctx.fill();

        if (n.isMe || n.isCollab) {
          ctx.strokeStyle = n.isMe ? meColor : n.color;
          ctx.lineWidth = n.isMe ? 2 : 1.5; ctx.setLineDash([]); ctx.stroke();
        } else if (n.isMutual) {
          ctx.strokeStyle = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)";
          ctx.lineWidth = 1; ctx.setLineDash([]); ctx.stroke();
        }

        if (n.isMe || n.isCollab || n.isMutual) {
          ctx.font = n.isMe ? "bold 11px monospace" : "10px monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = n.isMe ? meColor
            : n.isCollab ? n.color
            : dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)";
          ctx.fillText(n.name.split(" ")[0], n.x, n.y + n.r + 12);
        }
      });

      ctx.restore();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [collabLinks, mutualLinks, showMutualLines, dark, dims, getLayout, skillPopulation]);

  // ── Interaction ─────────────────────────────────────────────────────────────
  const getHit = useCallback((sx, sy) => {
    const { x, y, scale } = viewRef.current;
    const wx = (sx - x) / scale, wy = (sy - y) / scale;
    return nodesRef.current.find(n => {
      const dx = n.x - wx, dy = n.y - wy;
      return Math.sqrt(dx * dx + dy * dy) < Math.max(n.r + 5, 10);
    });
  }, []);

  const handleMouseDown = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const hit = getHit(sx, sy);
    if (!hit) {
      isPanningRef.current = true;
      panMovedRef.current = false;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOriginRef.current = { ...viewRef.current };
      canvas.style.cursor = "grabbing";
    }
  }, [getHit]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panMovedRef.current = true;
      const o = panOriginRef.current;
      viewRef.current = { ...viewRef.current, x: o.x + dx, y: o.y + dy };
      return;
    }

    const hit = getHit(sx, sy);
    if (hit && !hit.isMe) {
      const { x: vx, y: vy, scale: vs } = viewRef.current;
      setTooltip({ name: hit.name, role: hit.role, primarySkill: hit.primarySkill, isMutual: hit.isMutual, isCollab: hit.isCollab, x: hit.x * vs + vx, y: hit.y * vs + vy });
      canvas.style.cursor = "pointer";
    } else {
      setTooltip(null);
      canvas.style.cursor = isPanningRef.current ? "grabbing" : "grab";
    }
  }, [getHit]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  }, []);

  const handleClick = useCallback((e) => {
    if (panMovedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const hit = getHit(e.clientX - rect.left, e.clientY - rect.top);
    if (hit && !hit.isMe) {
      const user = users.find(u => u.id === hit.id);
      if (user) onNodeClick(user);
    }
  }, [users, onNodeClick, getHit]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 0.9);
  }, [zoomAt]);

  // Touch: single finger = pan, two finger = pinch zoom
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      isPanningRef.current = true;
      panMovedRef.current = false;
      panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panOriginRef.current = { ...viewRef.current };
    } else if (e.touches.length === 2) {
      isPanningRef.current = false;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), scale: viewRef.current.scale };
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (e.touches.length === 1 && isPanningRef.current) {
      const dx = e.touches[0].clientX - panStartRef.current.x;
      const dy = e.touches[0].clientY - panStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panMovedRef.current = true;
      const o = panOriginRef.current;
      viewRef.current = { ...viewRef.current, x: o.x + dx, y: o.y + dy };
    } else if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      const factor = newDist / pinchRef.current.dist;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      const newScale = Math.max(0.25, Math.min(5, pinchRef.current.scale * factor));
      const ratio = newScale / viewRef.current.scale;
      viewRef.current = { x: midX - (midX - viewRef.current.x) * ratio, y: midY - (midY - viewRef.current.y) * ratio, scale: newScale };
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    isPanningRef.current = false;
    pinchRef.current = null;
  }, []);

  // Attach wheel with passive:false so we can preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  return (
    <div style={{ position: "relative", width: "100%", height: dims.h, overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        width={dims.w}
        height={dims.h}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); setTooltip(null); }}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ display: "block", cursor: "grab", touchAction: "none" }}
      />

      {/* Legend */}
      <div style={{ position: "absolute", top: 12, left: 12, display: "flex", flexDirection: "column", gap: 5 }}>
        {Object.entries(SKILL_CLUSTERS).map(([name, { color }]) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: dark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)", fontFamily: "monospace" }}>{name}</span>
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, margin: "2px 0" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 0, borderTop: `2px solid ${dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)"}`, flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", fontFamily: "monospace" }}>collaborator</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 0, borderTop: `1px solid ${dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)"}`, flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", fontFamily: "monospace" }}>mutual follow</span>
        </div>
        <button onClick={() => setShowMutualLines(v => !v)}
          style={{ marginTop: 2, background: showMutualLines ? (dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)") : "none", border: `1px solid ${dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)"}`, borderRadius: 4, padding: "3px 8px", fontSize: 9, color: dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", cursor: "pointer", fontFamily: "monospace", textAlign: "left" }}>
          {showMutualLines ? "hide" : "show"} mutual lines
        </button>
      </div>

      {/* Zoom controls */}
      <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        <button onClick={() => { const c = canvasRef.current; if (c) { const r = c.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.25); } }}
          style={{ width: 32, height: 32, borderRadius: 6, background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", border: `1px solid ${dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)"}`, color: dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>+</button>
        <button onClick={() => { const c = canvasRef.current; if (c) { const r = c.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 0.8); } }}
          style={{ width: 32, height: 32, borderRadius: 6, background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", border: `1px solid ${dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)"}`, color: dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>−</button>
        <button onClick={resetView}
          style={{ width: 32, height: 32, borderRadius: 6, background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", border: `1px solid ${dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)"}`, color: dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>⊙</button>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{ position: "absolute", left: tooltip.x + 14, top: tooltip.y - 12, background: dark ? "#1a1a1a" : "#fff", border: `1px solid ${tooltip.isCollab ? (dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)") : "rgba(128,128,128,0.2)"}`, borderRadius: 6, padding: "7px 11px", pointerEvents: "none", fontSize: 11, color: dark ? "#fff" : "#000", fontFamily: "monospace", whiteSpace: "nowrap" }}>
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
