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

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const SPACE_BG = "#06061a";  // deep space navy

// Generate a fixed starfield for the given canvas size
function makeStars(w, h, count = 220) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: Math.random() * 1.3 + 0.15,
    opacity: 0.1 + Math.random() * 0.65,
    // subtle twinkle offset
    twinkleOffset: Math.random() * Math.PI * 2,
    twinkleSpeed: 0.3 + Math.random() * 1.2,
  }));
}

export default function NetworkGraph3D({ users, applications, projects, authUser, onNodeClick, dark, following = [], followers = [] }) {
  const canvasRef = useRef();
  const nodesRef = useRef([]);
  const rafRef = useRef();
  const starsRef = useRef([]);
  const velocityRef = useRef({ vx: 0, vy: 0 });
  const lastPanPosRef = useRef({ x: 0, y: 0, t: 0 });

  const [tooltip, setTooltip] = useState(null);
  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [showMutualLines, setShowMutualLines] = useState(true);
  const [rotateMode, setRotateMode] = useState(false);

  // Viewport: pan (x,y), zoom scale, rotation angle (radians)
  const viewRef = useRef({ x: 0, y: 0, scale: 1, rotation: 0 });
  const interactRef = useRef({ mode: null, startX: 0, startY: 0, originView: null, panMoved: false });
  const pinchRef = useRef(null);
  const rotateModeRef = useRef(false);

  useEffect(() => { rotateModeRef.current = rotateMode; }, [rotateMode]);

  // Regenerate starfield when canvas size changes
  useEffect(() => {
    starsRef.current = makeStars(dims.w, dims.h);
  }, [dims.w, dims.h]);

  // World ↔ screen conversion (accounts for pan, zoom, and rotation around canvas center)
  const screenToWorld = useCallback((sx, sy) => {
    const c = canvasRef.current;
    if (!c) return { x: sx, y: sy };
    const { x: vx, y: vy, scale: vs, rotation: vr } = viewRef.current;
    const cx = c.width / 2, cy = c.height / 2;
    const u = (sx - vx - cx) / vs;
    const v = (sy - vy - cy) / vs;
    const cos = Math.cos(vr), sin = Math.sin(vr);
    return { x: cx + u * cos + v * sin, y: cy - u * sin + v * cos };
  }, []);

  const worldToScreen = useCallback((wx, wy) => {
    const c = canvasRef.current;
    if (!c) return { x: wx, y: wy };
    const { x: vx, y: vy, scale: vs, rotation: vr } = viewRef.current;
    const cx = c.width / 2, cy = c.height / 2;
    const dx = wx - cx, dy = wy - cy;
    const cos = Math.cos(vr), sin = Math.sin(vr);
    return { x: vs * (dx * cos - dy * sin) + vx + cx, y: vs * (dx * sin + dy * cos) + vy + cy };
  }, []);

  const applyZoom = useCallback((sx, sy, factor) => {
    const v = viewRef.current;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
    if (newScale === v.scale) return;
    const ratio = newScale / v.scale;
    const c = canvasRef.current;
    const cx = c ? c.width / 2 : 0, cy = c ? c.height / 2 : 0;
    viewRef.current = {
      ...v,
      x: sx - cx - (sx - cx - v.x) * ratio,
      y: sy - cy - (sy - cy - v.y) * ratio,
      scale: newScale,
    };
  }, []);

  const resetView = useCallback(() => {
    viewRef.current = { x: 0, y: 0, scale: 1, rotation: 0 };
    velocityRef.current = { vx: 0, vy: 0 };
  }, []);

  const getHit = useCallback((sx, sy) => {
    const { x: wx, y: wy } = screenToWorld(sx, sy);
    return nodesRef.current.find(n => {
      const dx = n.x - wx, dy = n.y - wy;
      return Math.sqrt(dx * dx + dy * dy) < Math.max(n.r + 6, 14);
    });
  }, [screenToWorld]);

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
    return { macroCenters, skillCenters, cx, cy, macroR };
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

  // ── Render loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodesRef.current.length) return;
    const ctx = canvas.getContext("2d");
    const { skillCenters, macroCenters: mc, macroR } = getLayout(dims.w, dims.h);

    const tick = () => {
      const ns = nodesRef.current;
      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2;

      // Apply pan momentum (inertia when drag is released)
      if (!interactRef.current.mode) {
        const vel = velocityRef.current;
        if (Math.abs(vel.vx) > 0.04 || Math.abs(vel.vy) > 0.04) {
          vel.vx *= 0.92;
          vel.vy *= 0.92;
          viewRef.current = {
            ...viewRef.current,
            x: viewRef.current.x + vel.vx,
            y: viewRef.current.y + vel.vy,
          };
        }
      }

      const { x: vx, y: vy, scale: vs, rotation: vr } = viewRef.current;

      // Physics (world space)
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

      const nodeMap = {};
      ns.forEach(n => { nodeMap[n.id] = n; });

      // ── Clear with space background
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = SPACE_BG;
      ctx.fillRect(0, 0, w, h);

      // ── Starfield (screen space — fixed backdrop while panning)
      const now = Date.now() * 0.001;
      starsRef.current.forEach(s => {
        const twinkle = 0.75 + 0.25 * Math.sin(now * s.twinkleSpeed + s.twinkleOffset);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(s.opacity * twinkle).toFixed(3)})`;
        ctx.fill();
      });

      // ── Apply viewport transform
      ctx.save();
      ctx.translate(cx + vx, cy + vy);
      ctx.rotate(vr);
      ctx.scale(vs, vs);
      ctx.translate(-cx, -cy);

      // ── Nebula glows behind each cluster
      Object.entries(SKILL_CLUSTERS).forEach(([name, { color }]) => {
        const center = mc[name];
        if (!center) return;
        const nebR = macroR * 0.9;
        const rgb = hexToRgb(color);
        const g = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, nebR);
        g.addColorStop(0, `rgba(${rgb},0.09)`);
        g.addColorStop(0.5, `rgba(${rgb},0.04)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(center.x, center.y, nebR, 0, Math.PI * 2);
        ctx.fill();
      });

      // ── Cluster zone labels
      Object.entries(SKILL_CLUSTERS).forEach(([name, { color }]) => {
        const center = mc[name];
        if (!center) return;
        ctx.font = `bold ${Math.round(Math.min(w, h) * 0.027)}px monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(${hexToRgb(color)},0.13)`;
        ctx.fillText(name.toUpperCase(), center.x, center.y);
      });

      // ── Skill sub-labels
      ctx.font = "9px monospace";
      Object.entries(skillCenters).forEach(([skill, pos]) => {
        if (!skillPopulation[skill]) return;
        const meta = SKILL_META[skill];
        if (!meta) return;
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(${hexToRgb(meta.color)},0.35)`;
        ctx.fillText(skill, pos.x, pos.y - 14);
      });

      // ── Collab links
      collabLinks.forEach(link => {
        const s = nodeMap[link.source], t = nodeMap[link.target];
        if (!s || !t) return;
        // Glowing collab line
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 6; ctx.setLineDash([]); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 1.5; ctx.stroke();
      });

      // ── Mutual follow links
      if (showMutualLines) {
        mutualLinks.forEach(link => {
          const s = nodeMap[link.source], t = nodeMap[link.target];
          if (!s || !t) return;
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = "rgba(255,255,255,0.2)";
          ctx.lineWidth = 1; ctx.setLineDash([]); ctx.stroke();
        });
      }

      // ── Glow halos pass (drawn before nodes so nodes sit on top)
      ns.forEach(n => {
        const rgb = n.isMe ? "180,200,255" : hexToRgb(n.color);
        const glowR = n.isMe ? n.r * 5.5 : n.isCollab ? n.r * 5 : n.isMutual ? n.r * 4 : n.r * 3;
        const glowPeak = n.isMe ? 0.38 : n.isCollab ? 0.28 : n.isMutual ? 0.16 : 0.07;
        const g = ctx.createRadialGradient(n.x, n.y, n.r * 0.4, n.x, n.y, glowR);
        g.addColorStop(0, `rgba(${rgb},${glowPeak})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      });

      // ── Draw nodes
      const nowMs = Date.now();
      ns.forEach(n => {
        const rgb = hexToRgb(n.color);

        if (n.isMe) {
          // Animated pulsing rings
          const pulse1 = 0.5 + 0.5 * Math.sin(nowMs * 0.002);
          const pulse2 = 0.5 + 0.5 * Math.sin(nowMs * 0.002 + Math.PI);

          // Outer slow pulse
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 14 + pulse1 * 8, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${(0.04 + pulse1 * 0.1).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.stroke();

          // Middle ring
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 6 + pulse2 * 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${(0.1 + pulse2 * 0.12).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Inner ring
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 2.5, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.lineWidth = 1;
          ctx.stroke();

          // Core dot
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();

          // "you" label
          ctx.font = "bold 11px monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillText("you", n.x, n.y + n.r + 16);
        } else {
          const opacity = n.isCollab ? 1 : n.isMutual ? 0.8 : 0.5;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rgb},${opacity})`;
          ctx.fill();

          // Rim for connected nodes
          if (n.isCollab || n.isMutual) {
            ctx.strokeStyle = n.isCollab ? n.color : `rgba(${rgb},0.55)`;
            ctx.lineWidth = n.isCollab ? 1.5 : 1;
            ctx.setLineDash([]);
            ctx.stroke();
          }

          // Names for connected nodes
          if (n.isCollab || n.isMutual) {
            ctx.font = n.isCollab ? "bold 10px monospace" : "9px monospace";
            ctx.textAlign = "center";
            ctx.fillStyle = n.isCollab ? n.color : `rgba(${rgb},0.65)`;
            ctx.fillText(n.name.split(" ")[0], n.x, n.y + n.r + 13);
          }
        }
      });

      ctx.restore();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [collabLinks, mutualLinks, showMutualLines, dims, getLayout, skillPopulation]);

  // ── Mouse ─────────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    // Kill momentum on new interaction
    velocityRef.current = { vx: 0, vy: 0 };
    lastPanPosRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };

    if (rotateModeRef.current) {
      interactRef.current = { mode: "rotate", startX: e.clientX, startY: e.clientY, originView: { ...viewRef.current }, panMoved: false };
      canvas.style.cursor = "crosshair";
    } else {
      const hit = getHit(sx, sy);
      if (!hit) {
        interactRef.current = { mode: "pan", startX: e.clientX, startY: e.clientY, originView: { ...viewRef.current }, panMoved: false };
        canvas.style.cursor = "grabbing";
      } else {
        interactRef.current = { mode: "click", startX: e.clientX, startY: e.clientY, originView: null, panMoved: false };
      }
    }
  }, [getHit]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const { mode, startX, startY, originView } = interactRef.current;

    if (mode === "pan") {
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) interactRef.current.panMoved = true;

      // Track velocity for momentum
      const now = performance.now();
      const dt = now - lastPanPosRef.current.t;
      if (dt > 0 && dt < 80) {
        velocityRef.current = {
          vx: (e.clientX - lastPanPosRef.current.x) / dt * 16,
          vy: (e.clientY - lastPanPosRef.current.y) / dt * 16,
        };
      }
      lastPanPosRef.current = { x: e.clientX, y: e.clientY, t: now };

      viewRef.current = { ...viewRef.current, x: originView.x + dx, y: originView.y + dy };
      return;
    }

    if (mode === "rotate") {
      const dx = e.clientX - startX;
      interactRef.current.panMoved = true;
      viewRef.current = { ...viewRef.current, rotation: originView.rotation + dx * 0.008 };
      return;
    }

    // Hover tooltip
    const hit = getHit(sx, sy);
    if (hit && !hit.isMe) {
      const sp = worldToScreen(hit.x, hit.y);
      setTooltip({ name: hit.name, role: hit.role, primarySkill: hit.primarySkill, isMutual: hit.isMutual, isCollab: hit.isCollab, x: sp.x, y: sp.y });
      canvas.style.cursor = "pointer";
    } else {
      setTooltip(null);
      canvas.style.cursor = mode ? (mode === "rotate" ? "crosshair" : "grabbing") : rotateModeRef.current ? "crosshair" : "grab";
    }
  }, [getHit, worldToScreen]);

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

  // Scroll = zoom in/out, clamped at min scale 1
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    // Kill momentum on zoom
    velocityRef.current = { vx: 0, vy: 0 };
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    applyZoom(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 0.9);
  }, [applyZoom]);

  // Touch: 1 finger = pan, 2 finger = pinch zoom + rotate
  const handleTouchStart = useCallback((e) => {
    velocityRef.current = { vx: 0, vy: 0 };
    if (e.touches.length === 1) {
      interactRef.current = { mode: "pan", startX: e.touches[0].clientX, startY: e.touches[0].clientY, originView: { ...viewRef.current }, panMoved: false };
      lastPanPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() };
    } else if (e.touches.length === 2) {
      interactRef.current.mode = null;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinchRef.current = {
        dist: Math.sqrt(dx * dx + dy * dy),
        angle: Math.atan2(dy, dx),
        originView: { ...viewRef.current },
      };
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { mode, startX, startY, originView } = interactRef.current;

    if (e.touches.length === 1 && mode === "pan") {
      const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) interactRef.current.panMoved = true;

      const now = performance.now();
      const dt = now - lastPanPosRef.current.t;
      if (dt > 0 && dt < 80) {
        velocityRef.current = {
          vx: (e.touches[0].clientX - lastPanPosRef.current.x) / dt * 16,
          vy: (e.touches[0].clientY - lastPanPosRef.current.y) / dt * 16,
        };
      }
      lastPanPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: now };

      viewRef.current = { ...viewRef.current, x: originView.x + dx, y: originView.y + dy };
    } else if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      const newAngle = Math.atan2(dy, dx);
      const factor = newDist / pinchRef.current.dist;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      const ov = pinchRef.current.originView;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, ov.scale * factor));
      const ratio = newScale / (viewRef.current.scale || 1);
      const c = canvas;
      const cx = c.width / 2, cy = c.height / 2;
      const deltaAngle = newAngle - pinchRef.current.angle;
      viewRef.current = {
        x: midX - cx - (midX - cx - viewRef.current.x) * ratio,
        y: midY - cy - (midY - cy - viewRef.current.y) * ratio,
        scale: newScale,
        rotation: ov.rotation + deltaAngle,
      };
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

  // Always dark overlay styles (canvas is always dark/space)
  const btnStyle = {
    width: 34, height: 34, borderRadius: 8, fontSize: 16, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.13)",
    color: "rgba(255,255,255,0.55)",
    transition: "background 0.15s, color 0.15s",
  };

  return (
    <div style={{ position: "relative", width: "100%", height: dims.h, overflow: "hidden", borderRadius: 12 }}>
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

      {/* Legend — always dark styled since canvas is always space-dark */}
      <div style={{
        position: "absolute", top: 14, left: 14,
        display: "flex", flexDirection: "column", gap: 5,
        background: "rgba(6,6,26,0.55)",
        backdropFilter: "blur(8px)",
        borderRadius: 10, padding: "10px 12px",
        border: "1px solid rgba(255,255,255,0.08)",
      }}>
        {Object.entries(SKILL_CLUSTERS).map(([name, { color }]) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}` }} />
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.42)", fontFamily: "monospace", letterSpacing: "0.04em" }}>{name}</span>
          </div>
        ))}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", margin: "3px 0" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 18, height: 0, borderTop: "2px solid rgba(255,255,255,0.7)", flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.42)", fontFamily: "monospace" }}>collaborator</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 18, height: 0, borderTop: "1px solid rgba(255,255,255,0.2)", flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.42)", fontFamily: "monospace" }}>mutual follow</span>
        </div>
        <button onClick={() => setShowMutualLines(v => !v)}
          style={{
            marginTop: 3, cursor: "pointer", fontFamily: "monospace", textAlign: "left", fontSize: 9,
            background: showMutualLines ? "rgba(255,255,255,0.07)" : "none",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 5, padding: "3px 8px",
            color: "rgba(255,255,255,0.38)",
          }}>
          {showMutualLines ? "hide" : "show"} mutual lines
        </button>
        <div style={{ marginTop: 4, fontSize: 8, color: "rgba(255,255,255,0.2)", fontFamily: "monospace", lineHeight: 1.7 }}>
          drag · scroll · pinch<br />{rotateMode ? "dragging rotates" : "↻ to rotate"}
        </div>
      </div>

      {/* Controls */}
      <div style={{
        position: "absolute", bottom: 18, right: 18,
        display: "flex", flexDirection: "column", gap: 5,
        background: "rgba(6,6,26,0.55)",
        backdropFilter: "blur(8px)",
        borderRadius: 10, padding: 6,
        border: "1px solid rgba(255,255,255,0.08)",
      }}>
        <button
          onClick={() => { const c = canvasRef.current; if (c) applyZoom(c.width / 2, c.height / 2, 1.3); }}
          style={btnStyle}
          title="Zoom in"
        >+</button>
        <button
          onClick={() => { const c = canvasRef.current; if (c) applyZoom(c.width / 2, c.height / 2, 0.8); }}
          style={btnStyle}
          title="Zoom out"
        >−</button>
        <button
          onClick={() => setRotateMode(v => !v)}
          style={{
            ...btnStyle, fontSize: 14,
            background: rotateMode ? "rgba(167,139,250,0.25)" : btnStyle.background,
            color: rotateMode ? "#a78bfa" : btnStyle.color,
            border: rotateMode ? "1px solid rgba(167,139,250,0.4)" : btnStyle.border,
          }}
          title="Toggle rotate mode"
        >↻</button>
        <button onClick={resetView} style={{ ...btnStyle, fontSize: 12 }} title="Reset view">⊙</button>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "absolute", left: tooltip.x + 16, top: tooltip.y - 14,
          background: "rgba(10,10,35,0.92)",
          backdropFilter: "blur(10px)",
          border: `1px solid ${tooltip.isCollab ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 8, padding: "8px 13px",
          pointerEvents: "none", fontSize: 11,
          color: "#fff", fontFamily: "monospace",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontWeight: 600 }}>{tooltip.name}</div>
          {tooltip.role && <div style={{ opacity: 0.5, fontSize: 10, marginTop: 2 }}>{tooltip.role}</div>}
          {tooltip.primarySkill && <div style={{ opacity: 0.4, fontSize: 9, marginTop: 2 }}>{tooltip.primarySkill}</div>}
          {tooltip.isCollab && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>● collaborator</div>}
          {tooltip.isMutual && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>● mutual follow</div>}
        </div>
      )}
    </div>
  );
}
