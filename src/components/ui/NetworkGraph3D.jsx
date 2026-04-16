import React, { useRef, useMemo, useEffect, useState, useCallback } from "react";

const SKILL_CLUSTERS = {
  Creative: {
    color: "#a78bfa",
    skills: ["Design","Illustration","Motion Design","Animation","Photography","Video","Music","Podcast","Writing","Copywriting","Content Strategy","Journalism","Branding"],
  },
  Tech: {
    color: "#60a5fa",
    skills: ["Engineering","Frontend","Backend","Mobile Dev","DevOps","Security","AI/ML","Data","Blockchain","AR/VR","Game Dev","Robotics","Data Analysis"],
  },
  Business: {
    color: "#34d399",
    skills: ["Product","Marketing","Sales","Growth","SEO","Social Media","Finance","Fundraising","Business Development","Strategy","Operations","Project Management","Legal","Accounting","HR/Recruiting","Customer Success"],
  },
  Making: {
    color: "#fb923c",
    skills: ["Architecture","3D/CAD","Industrial Design","Hardware","Electrical Engineering","Mechanical Engineering","Woodworking","Fashion"],
  },
  Research: {
    color: "#2dd4bf",
    skills: ["Research","Healthcare","Education","Policy","Community"],
  },
};

const SKILL_META = {};
Object.entries(SKILL_CLUSTERS).forEach(([clusterName, { color, skills }]) => {
  skills.forEach(s => { SKILL_META[s] = { cluster: clusterName, color }; });
});

function getNodeColor(skills = []) {
  for (const s of skills) if (SKILL_META[s]) return SKILL_META[s].color;
  return "#6366f1";
}
function getClusterName(skills = []) {
  for (const s of skills) if (SKILL_META[s]) return SKILL_META[s].cluster;
  return null;
}
function hexToRgb(hex) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const FOV = 900; // perspective focal length — higher = less extreme depth distortion

export default function NetworkGraph3D({ users, applications, projects, authUser, onNodeClick, dark, following = [], followers = [] }) {
  const canvasRef = useRef();
  const nodesRef = useRef([]);
  const rafRef = useRef();
  const projectedRef = useRef([]); // last-frame projected screen positions, used for hit detection

  // rotX = tilt up/down, rotY = spin left/right, panX/panY = translate, zoom = scale
  const viewRef = useRef({ panX: 0, panY: 0, zoom: 1, rotX: 0, rotY: 0 });
  const velocityRef = useRef({ vrX: 0, vrY: 0 }); // angular spin inertia
  const lastSampleRef = useRef({ rotX: 0, rotY: 0, t: 0 });

  const interactRef = useRef({ mode: null, startX: 0, startY: 0, originView: null, panMoved: false });
  const pinchRef = useRef(null);

  const [tooltip, setTooltip] = useState(null);
  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [showMutualLines, setShowMutualLines] = useState(true);

  // Hit detection uses projectedRef (screen positions from last frame)
  const getHit = useCallback((sx, sy) => {
    return projectedRef.current.find(n => {
      const dx = n.sx - sx, dy = n.sy - sy;
      return Math.sqrt(dx * dx + dy * dy) < Math.max(n.sr + 6, 14);
    });
  }, []);

  const applyZoom = useCallback((factor, sx, sy) => {
    const v = viewRef.current;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
    if (newZoom === v.zoom) return;
    const ratio = newZoom / v.zoom;
    const c = canvasRef.current;
    const cx = c ? c.width / 2 : 0, cy = c ? c.height / 2 : 0;
    // Keep the point under the cursor fixed by adjusting pan
    const pivotX = sx ?? cx;
    const pivotY = sy ?? cy;
    viewRef.current = {
      ...v,
      panX: pivotX - cx - (pivotX - cx - v.panX) * ratio,
      panY: pivotY - cy - (pivotY - cy - v.panY) * ratio,
      zoom: newZoom,
    };
  }, []);

  const resetView = useCallback(() => {
    viewRef.current = { panX: 0, panY: 0, zoom: 1, rotX: 0, rotY: 0 };
    velocityRef.current = { vrX: 0, vrY: 0 };
  }, []);

  const mutualFollowIds = useMemo(() => {
    if (!authUser) return new Set();
    return new Set(following.filter(id => followers.includes(id)));
  }, [following, followers, authUser]);

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

  const { nodes, collabLinks, mutualLinks, skillPopulation } = useMemo(() => {
    if (!users?.length || !authUser) return { nodes: [], collabLinks: [], mutualLinks: [], skillPopulation: {} };
    const { macroCenters, skillCenters, cx, cy } = getLayout(dims.w, dims.h);

    const myProjectIds = new Set([
      ...projects.filter(p => p.owner_id === authUser.id).map(p => p.id),
      ...applications.filter(a => a.applicant_id === authUser.id && a.status === "accepted").map(a => a.project_id),
    ]);
    const collaboratorIds = new Set(
      applications.filter(a => myProjectIds.has(a.project_id) && a.status === "accepted" && a.applicant_id !== authUser.id).map(a => a.applicant_id)
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
      const jitter = isCollab ? 32 : isMutual ? 42 : 30;
      return {
        id: u.id, name: u.name, role: u.role || "", skills: u.skills || [],
        primarySkill: primarySkill || null, macroCluster,
        color: getNodeColor(u.skills),
        isMe, isCollab, isMutual,
        r: isMe ? 12 : isCollab ? 9 : isMutual ? 6 : 4,
        x: isMe ? cx : target.x + (Math.random() - 0.5) * jitter,
        y: isMe ? cy : target.y + (Math.random() - 0.5) * jitter,
        vx: 0, vy: 0,
        targetX: isMe ? cx : target.x,
        targetY: isMe ? cy : target.y,
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

  // ── Render loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodesRef.current.length) return;
    const ctx = canvas.getContext("2d");
    const { skillCenters, macroCenters: mc } = getLayout(dims.w, dims.h);

    const tick = () => {
      const ns = nodesRef.current;
      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2;

      // ── Spin inertia
      if (!interactRef.current.mode) {
        const vel = velocityRef.current;
        if (Math.abs(vel.vrX) > 0.00008) { vel.vrX *= 0.91; viewRef.current.rotX += vel.vrX; }
        if (Math.abs(vel.vrY) > 0.00008) { vel.vrY *= 0.91; viewRef.current.rotY += vel.vrY; }
      }

      const { panX, panY, zoom, rotX, rotY } = viewRef.current;
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);

      // Project a flat (z=0) world-space point (centered around cx,cy) into screen space
      const project = (worldX, worldY) => {
        // Rotate around Y axis (horizontal spin)
        const x1 = worldX * cosY;
        const y1 = worldY;
        const z1 = -worldX * sinY;
        // Rotate around X axis (vertical tilt)
        const x2 = x1;
        const y2 = y1 * cosX - z1 * sinX;
        const z2 = y1 * sinX + z1 * cosX;
        // Perspective divisor: nodes further back appear smaller
        const pd = Math.max(0.2, FOV / (FOV + z2));
        return {
          sx: cx + panX + x2 * pd * zoom,
          sy: cy + panY + y2 * pd * zoom,
          z: z2,
          pd,
        };
      };

      // ── Physics (2D world space — 3D is purely visual)
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
        n.x = Math.max(n.r, Math.min(w - n.r, n.x));
        n.y = Math.max(n.r, Math.min(h - n.r, n.y));
      });

      // ── Project all nodes to screen
      const projected = ns.map(n => {
        const { sx, sy, z, pd } = project(n.x - cx, n.y - cy);
        const sr = Math.max(1.5, n.r * pd * zoom);
        return { ...n, sx, sy, sr, z, pd };
      });

      // ── Painter's algorithm: draw back-to-front
      projected.sort((a, b) => b.z - a.z);

      // ── Store for hit detection (this frame's screen positions)
      projectedRef.current = projected;

      // ── Build nodeMap for links
      const nodeMap = {};
      projected.forEach(n => { nodeMap[n.id] = n; });

      // ── Clear
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = dark ? "#080808" : "#f0f0f0";
      ctx.fillRect(0, 0, w, h);

      // ── Cluster zone labels (projected)
      Object.entries(SKILL_CLUSTERS).forEach(([name, { color }]) => {
        const center = mc[name];
        if (!center) return;
        const { sx, sy, pd } = project(center.x - cx, center.y - cy);
        const fontSize = Math.max(8, Math.round(Math.min(w, h) * 0.027 * pd * zoom));
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = dark ? `rgba(${hexToRgb(color)},0.09)` : `rgba(${hexToRgb(color)},0.13)`;
        ctx.fillText(name.toUpperCase(), sx, sy);
      });

      // ── Skill sub-labels (projected)
      Object.entries(skillCenters).forEach(([skill, pos]) => {
        if (!skillPopulation[skill]) return;
        const meta = SKILL_META[skill];
        if (!meta) return;
        const { sx, sy, pd } = project(pos.x - cx, pos.y - cy);
        if (pd < 0.5) return; // skip labels that are too far back
        const fontSize = Math.max(6, Math.round(9 * pd * zoom));
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = dark ? `rgba(${hexToRgb(meta.color)},0.28)` : `rgba(${hexToRgb(meta.color)},0.38)`;
        ctx.fillText(skill, sx, sy - Math.round(12 * pd * zoom));
      });

      // ── Collab links
      collabLinks.forEach(link => {
        const s = nodeMap[link.source], t = nodeMap[link.target];
        if (!s || !t) return;
        ctx.beginPath(); ctx.moveTo(s.sx, s.sy); ctx.lineTo(t.sx, t.sy);
        ctx.strokeStyle = dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke();
      });

      // ── Mutual follow links
      if (showMutualLines) {
        mutualLinks.forEach(link => {
          const s = nodeMap[link.source], t = nodeMap[link.target];
          if (!s || !t) return;
          ctx.beginPath(); ctx.moveTo(s.sx, s.sy); ctx.lineTo(t.sx, t.sy);
          ctx.strokeStyle = dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
          ctx.lineWidth = 1; ctx.setLineDash([]); ctx.stroke();
        });
      }

      // ── Glow halos (back-to-front order, under nodes)
      projected.forEach(n => {
        const rgb = n.isMe ? (dark ? "200,210,255" : "80,80,120") : hexToRgb(n.color);
        const glowR = n.sr * (n.isMe ? 5 : n.isCollab ? 4.5 : n.isMutual ? 3.5 : 2.5);
        const peak = dark
          ? (n.isMe ? 0.35 : n.isCollab ? 0.25 : n.isMutual ? 0.15 : 0.05)
          : (n.isMe ? 0.16 : n.isCollab ? 0.12 : n.isMutual ? 0.08 : 0.03);
        const g = ctx.createRadialGradient(n.sx, n.sy, n.sr * 0.3, n.sx, n.sy, glowR);
        g.addColorStop(0, `rgba(${rgb},${peak})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.beginPath(); ctx.arc(n.sx, n.sy, glowR, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      });

      // ── Nodes (back-to-front)
      const nowMs = Date.now();
      const meColor = dark ? "#ffffff" : "#111111";
      projected.forEach(n => {
        const rgb = hexToRgb(n.color);

        if (n.isMe) {
          const p1 = 0.5 + 0.5 * Math.sin(nowMs * 0.0018);
          const p2 = 0.5 + 0.5 * Math.sin(nowMs * 0.0018 + Math.PI);
          // Pulsing rings (proportional to projected node size)
          ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr * (2.1 + p1 * 0.6), 0, Math.PI * 2);
          ctx.strokeStyle = dark ? `rgba(255,255,255,${(0.04 + p1 * 0.09).toFixed(3)})` : `rgba(0,0,0,${(0.04 + p1 * 0.09).toFixed(3)})`;
          ctx.lineWidth = 1; ctx.setLineDash([]); ctx.stroke();
          ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr * (1.5 + p2 * 0.35), 0, Math.PI * 2);
          ctx.strokeStyle = dark ? `rgba(255,255,255,${(0.1 + p2 * 0.12).toFixed(3)})` : `rgba(0,0,0,${(0.1 + p2 * 0.12).toFixed(3)})`;
          ctx.lineWidth = 1; ctx.stroke();
          ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr * 1.18, 0, Math.PI * 2);
          ctx.strokeStyle = dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.22)";
          ctx.lineWidth = 1; ctx.stroke();
          // Core
          ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr, 0, Math.PI * 2);
          ctx.fillStyle = meColor; ctx.fill();
          // Label
          const lfs = Math.max(7, Math.round(11 * n.pd * zoom));
          ctx.font = `bold ${lfs}px monospace`; ctx.textAlign = "center";
          ctx.fillStyle = meColor;
          ctx.fillText("you", n.sx, n.sy + n.sr + Math.round(14 * n.pd * zoom));
        } else {
          const opacity = n.isCollab ? 0.95 : n.isMutual ? 0.7 : 0.42;
          ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rgb},${opacity})`; ctx.fill();
          if (n.isCollab || n.isMutual) {
            ctx.strokeStyle = n.isCollab ? n.color : `rgba(${rgb},0.5)`;
            ctx.lineWidth = n.isCollab ? 1.5 : 1; ctx.setLineDash([]); ctx.stroke();
          }
          if ((n.isCollab || n.isMutual) && n.pd > 0.45) {
            const lfs = Math.max(7, Math.round((n.isCollab ? 10 : 9) * n.pd * zoom));
            ctx.font = `${n.isCollab ? "bold " : ""}${lfs}px monospace`;
            ctx.textAlign = "center";
            ctx.fillStyle = n.isCollab ? n.color : (dark ? `rgba(${rgb},0.65)` : `rgba(${rgb},0.8)`);
            ctx.fillText(n.name.split(" ")[0], n.sx, n.sy + n.sr + Math.round(12 * n.pd * zoom));
          }
        }
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [collabLinks, mutualLinks, showMutualLines, dark, dims, getLayout, skillPopulation]);

  // ── Mouse ─────────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0 && e.button !== 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    velocityRef.current = { vrX: 0, vrY: 0 };
    lastSampleRef.current = { rotX: viewRef.current.rotX, rotY: viewRef.current.rotY, t: performance.now() };

    if (e.button === 2) {
      // Right-click drag = pan (translate)
      interactRef.current = { mode: "pan", startX: e.clientX, startY: e.clientY, originView: { ...viewRef.current }, panMoved: false };
      canvas.style.cursor = "grabbing";
    } else {
      const hit = getHit(sx, sy);
      if (hit) {
        interactRef.current = { mode: "click", startX: e.clientX, startY: e.clientY, originView: null, panMoved: false };
      } else {
        // Left drag = 3D rotate (drag up/down tilts, left/right spins)
        interactRef.current = { mode: "rotate", startX: e.clientX, startY: e.clientY, originView: { ...viewRef.current }, panMoved: false };
        canvas.style.cursor = "grabbing";
      }
    }
  }, [getHit]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const { mode, startX, startY, originView } = interactRef.current;

    if (mode === "rotate") {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) interactRef.current.panMoved = true;

      const newRotY = originView.rotY + dx * 0.007;
      const newRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, originView.rotX + dy * 0.007));

      // Track velocity for spin inertia
      const now = performance.now();
      const dt = now - lastSampleRef.current.t;
      if (dt > 0 && dt < 80) {
        velocityRef.current.vrY = (newRotY - viewRef.current.rotY) / dt * 16;
        velocityRef.current.vrX = (newRotX - viewRef.current.rotX) / dt * 16;
      }
      lastSampleRef.current = { rotX: newRotX, rotY: newRotY, t: now };

      viewRef.current = { ...viewRef.current, rotX: newRotX, rotY: newRotY };
      return;
    }

    if (mode === "pan") {
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) interactRef.current.panMoved = true;
      viewRef.current = { ...viewRef.current, panX: originView.panX + dx, panY: originView.panY + dy };
      return;
    }

    // Hover tooltip
    const hit = getHit(sx, sy);
    if (hit && !hit.isMe) {
      setTooltip({ name: hit.name, role: hit.role, primarySkill: hit.primarySkill, isMutual: hit.isMutual, isCollab: hit.isCollab, x: hit.sx, y: hit.sy });
      canvas.style.cursor = "pointer";
    } else {
      setTooltip(null);
      canvas.style.cursor = "grab";
    }
  }, [getHit]);

  const handleMouseUp = useCallback(() => {
    interactRef.current.mode = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  }, []);

  const handleClick = useCallback((e) => {
    if (interactRef.current.panMoved) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const hit = getHit(e.clientX - rect.left, e.clientY - rect.top);
    if (hit && !hit.isMe) {
      const user = users.find(u => u.id === hit.id);
      if (user) onNodeClick(user);
    }
  }, [users, onNodeClick, getHit]);

  const handleContextMenu = useCallback((e) => e.preventDefault(), []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    velocityRef.current = { vrX: 0, vrY: 0 };
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    applyZoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - rect.left, e.clientY - rect.top);
  }, [applyZoom]);

  // Touch: 1 finger = 3D rotate, 2 finger = pinch zoom + twist
  const handleTouchStart = useCallback((e) => {
    velocityRef.current = { vrX: 0, vrY: 0 };
    if (e.touches.length === 1) {
      interactRef.current = { mode: "rotate", startX: e.touches[0].clientX, startY: e.touches[0].clientY, originView: { ...viewRef.current }, panMoved: false };
      lastSampleRef.current = { rotX: viewRef.current.rotX, rotY: viewRef.current.rotY, t: performance.now() };
    } else if (e.touches.length === 2) {
      interactRef.current.mode = null;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), originZoom: viewRef.current.zoom };
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    const { mode, startX, startY, originView } = interactRef.current;

    if (e.touches.length === 1 && mode === "rotate") {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) interactRef.current.panMoved = true;

      const newRotY = originView.rotY + dx * 0.007;
      const newRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, originView.rotX + dy * 0.007));

      const now = performance.now();
      const dt = now - lastSampleRef.current.t;
      if (dt > 0 && dt < 80) {
        velocityRef.current.vrY = (newRotY - viewRef.current.rotY) / dt * 16;
        velocityRef.current.vrX = (newRotX - viewRef.current.rotX) / dt * 16;
      }
      lastSampleRef.current = { rotX: newRotX, rotY: newRotY, t: now };
      viewRef.current = { ...viewRef.current, rotX: newRotX, rotY: newRotY };

    } else if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      const factor = newDist / pinchRef.current.dist;
      viewRef.current.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchRef.current.originZoom * factor));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    interactRef.current.mode = null;
    pinchRef.current = null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("touchmove", handleTouchMove);
    };
  }, [handleWheel, handleTouchMove]);

  const btnStyle = {
    width: 32, height: 32, borderRadius: 6, fontSize: 16, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace",
    background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    border: `1px solid ${dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)"}`,
    color: dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)",
  };

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
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
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
        <div style={{ marginTop: 6, fontSize: 8, color: dark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.25)", fontFamily: "monospace", lineHeight: 1.6 }}>
          drag to rotate · scroll to zoom<br />right-drag to pan
        </div>
      </div>

      {/* Controls */}
      <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        <button onClick={() => { const c = canvasRef.current; if (c) applyZoom(1.3, c.width/2, c.height/2); }} style={btnStyle}>+</button>
        <button onClick={() => { const c = canvasRef.current; if (c) applyZoom(0.8, c.width/2, c.height/2); }} style={btnStyle}>−</button>
        <button onClick={resetView} style={{ ...btnStyle, fontSize: 11 }} title="Reset view">⊙</button>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{ position: "absolute", left: tooltip.x + 14, top: tooltip.y - 12, background: dark ? "#1a1a1a" : "#fff", border: `1px solid ${tooltip.isCollab ? (dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)") : "rgba(128,128,128,0.2)"}`, borderRadius: 6, padding: "7px 11px", pointerEvents: "none", fontSize: 11, color: dark ? "#fff" : "#000", fontFamily: "monospace", whiteSpace: "nowrap" }}>
          <div style={{ fontWeight: 600 }}>{tooltip.name}</div>
          {tooltip.role && <div style={{ opacity: 0.5, fontSize: 10, marginTop: 1 }}>{tooltip.role}</div>}
          {tooltip.primarySkill && <div style={{ opacity: 0.45, fontSize: 9, marginTop: 2 }}>{tooltip.primarySkill}</div>}
          {tooltip.isCollab && <div style={{ fontSize: 9, opacity: 0.55, marginTop: 3 }}>collaborator</div>}
          {tooltip.isMutual && <div style={{ fontSize: 9, opacity: 0.55, marginTop: 3 }}>mutual follow</div>}
        </div>
      )}
    </div>
  );
}
