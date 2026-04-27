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
    color: "#f472b6",
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

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 6;
const FOV = 900;
const IDLE_MS = 2500; // ms before auto-rotate kicks in

export default function NetworkGraph3D({ users, applications, projects = [], authUser, onNodeClick, dark, following = [], followers = [], onFollow }) {
  const canvasRef = useRef();
  const nodesRef = useRef([]);
  const rafRef = useRef();
  const projectedRef = useRef([]);

  const viewRef = useRef({ panX: 0, panY: 0, zoom: 1, rotX: 0, rotY: 0 });
  const velocityRef = useRef({ vrX: 0, vrY: 0 });
  const lastSampleRef = useRef({ rotX: 0, rotY: 0, t: 0 });
  const lastInteractRef = useRef(Date.now());

  const interactRef = useRef({ mode: null, startX: 0, startY: 0, originView: null, panMoved: false });
  const pinchRef = useRef(null);

  const [tooltip, setTooltip] = useState(null);
  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [showMutualLines, setShowMutualLines] = useState(true);
  const [hintsVisible, setHintsVisible] = useState(true);
  const [filterCluster, setFilterCluster] = useState(null); // skill cluster filter
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { const t = setTimeout(() => setHintsVisible(false), 4000); return () => clearTimeout(t); }, []);

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

  const { nodes, collabLinks, mutualLinks, skillPopulation, stats } = useMemo(() => {
    if (!users?.length || !authUser) return { nodes: [], collabLinks: [], mutualLinks: [], skillPopulation: {}, stats: { total: 0, collabs: 0, mutuals: 0 } };
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

    // Count connections per user for node sizing
    const connectionCount = {};
    users.forEach(u => { connectionCount[u.id] = 0; });
    collaboratorIds.forEach(id => { if (connectionCount[id] !== undefined) connectionCount[id] += 3; });
    mutualFollowIds.forEach(id => { if (connectionCount[id] !== undefined) connectionCount[id] += 2; });
    following.forEach(id => { if (connectionCount[id] !== undefined) connectionCount[id] += 1; });

    const userNodes = users.filter(u => u.name?.trim()).map(u => {
      const isMe = u.id === authUser.id;
      const isCollab = collaboratorIds.has(u.id);
      const isMutual = !isCollab && mutualFollowIds.has(u.id);
      const isFollowing = !isCollab && !isMutual && following.includes(u.id);
      const primarySkill = (u.skills || []).find(s => skillCenters[s]);
      const skillCenter = primarySkill ? skillCenters[primarySkill] : null;
      const macroCluster = getClusterName(u.skills);
      const macroCenter = macroCluster ? macroCenters[macroCluster] : null;
      const fallback = { x: cx + (Math.random() - 0.5) * 160, y: cy + (Math.random() - 0.5) * 160 };
      const target = skillCenter || macroCenter || fallback;
      const jitter = isCollab ? 32 : isMutual ? 42 : 30;
      // Node size: base + bonus for connections + bonus for skills count
      const skillBonus = Math.min(3, Math.floor((u.skills || []).length / 3));
      const connBonus = Math.min(4, Math.floor((connectionCount[u.id] || 0) / 2));
      const baseR = isMe ? 12 : isCollab ? 9 : isMutual ? 7 : isFollowing ? 5.5 : 4;
      const r = isMe ? 12 : Math.min(baseR + skillBonus * 0.5 + connBonus * 0.5, baseR + 2.5);
      return {
        id: u.id, name: u.name, role: u.role || "", skills: u.skills || [], nodeType: "user",
        primarySkill: primarySkill || null, macroCluster,
        color: getNodeColor(u.skills),
        isMe, isCollab, isMutual, isFollowing,
        r,
        x: isMe ? cx : target.x + (Math.random() - 0.5) * jitter,
        y: isMe ? cy : target.y + (Math.random() - 0.5) * jitter,
        vx: 0, vy: 0,
        targetX: isMe ? cx : target.x,
        targetY: isMe ? cy : target.y,
      };
    });

    const nodes = [...userNodes];
    const collabLinks = [];
    collaboratorIds.forEach(cid => { if (users.find(u => u.id === cid)) collabLinks.push({ source: authUser.id, target: cid }); });
    const mutualLinks = [];
    mutualFollowIds.forEach(uid => { if (users.find(u => u.id === uid)) mutualLinks.push({ source: authUser.id, target: uid }); });

    const stats = {
      total: userNodes.length - 1, // exclude self
      collabs: collaboratorIds.size,
      mutuals: mutualFollowIds.size,
    };

    return { nodes, collabLinks, mutualLinks, skillPopulation, stats };
  }, [users, applications, projects, authUser, dims, mutualFollowIds, following, getLayout]);

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

  // Derived sets for render
  const searchLower = searchQuery.trim().toLowerCase();

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

      // ── Auto-rotate when idle
      const idleMs = Date.now() - lastInteractRef.current;
      if (!interactRef.current.mode && idleMs > IDLE_MS) {
        velocityRef.current.vrY = 0.0006;
      }

      // ── Spin inertia
      if (!interactRef.current.mode) {
        const vel = velocityRef.current;
        if (Math.abs(vel.vrX) > 0.00008) { vel.vrX *= 0.91; viewRef.current.rotX += vel.vrX; }
        if (Math.abs(vel.vrY) > 0.00008) { vel.vrY *= 0.91; viewRef.current.rotY += vel.vrY; }
      }

      const { panX, panY, zoom, rotX, rotY } = viewRef.current;
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);

      const project = (worldX, worldY) => {
        const x1 = worldX * cosY;
        const y1 = worldY;
        const z1 = -worldX * sinY;
        const x2 = x1;
        const y2 = y1 * cosX - z1 * sinX;
        const z2 = y1 * sinX + z1 * cosX;
        const pd = Math.max(0.2, FOV / (FOV + z2));
        return {
          sx: cx + panX + x2 * pd * zoom,
          sy: cy + panY + y2 * pd * zoom,
          z: z2,
          pd,
        };
      };

      // ── Physics
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

      // ── Project all nodes
      const projected = ns.map(n => {
        const { sx, sy, z, pd } = project(n.x - cx, n.y - cy);
        const sr = Math.max(1.5, n.r * pd * zoom);
        return { ...n, sx, sy, sr, z, pd };
      });

      projected.sort((a, b) => b.z - a.z);
      projectedRef.current = projected;

      const nodeMap = {};
      projected.forEach(n => { nodeMap[n.id] = n; });

      // ── Compute highlight/dim state
      const hasFilter = !!filterCluster;
      const hasSearch = searchLower.length > 0;

      const isHighlighted = (n) => {
        if (n.isMe) return true;
        if (hasSearch) return n.name.toLowerCase().includes(searchLower);
        if (hasFilter) return n.macroCluster === filterCluster;
        return true;
      };
      const isDimmed = (n) => !isHighlighted(n);

      // ── Clear + background
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = dark ? "#0d0d0d" : "#ffffff";
      ctx.fillRect(0, 0, w, h);

      // ── Subtle dot grid (projected for 3D depth feel)
      const gridStep = 48;
      const gridCols = Math.ceil(w / gridStep) + 2;
      const gridRows = Math.ceil(h / gridStep) + 2;
      ctx.fillStyle = dark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.12)";
      for (let r = -1; r < gridRows; r++) {
        for (let c = -1; c < gridCols; c++) {
          const wx = (c * gridStep) - cx;
          const wy = (r * gridStep) - cy;
          const { sx, sy, pd } = project(wx, wy);
          const dotR = Math.max(0.5, 1 * pd);
          ctx.beginPath(); ctx.arc(sx, sy, dotR, 0, Math.PI * 2); ctx.fill();
        }
      }

      // ── Cluster zone labels (very faint, only when not filtered)
      if (!hasFilter && !hasSearch) {
        Object.entries(SKILL_CLUSTERS).forEach(([name, { color }]) => {
          const center = mc[name];
          if (!center) return;
          const { sx, sy, pd } = project(center.x - cx, center.y - cy);
          const fontSize = Math.max(8, Math.round(Math.min(w, h) * 0.014 * pd * zoom));
          ctx.font = `${fontSize}px -apple-system, monospace`;
          ctx.textAlign = "center";
          ctx.fillStyle = dark ? `rgba(${hexToRgb(color)},0.08)` : `rgba(${hexToRgb(color)},0.18)`;
          ctx.fillText(name.toUpperCase(), sx, sy);
        });
      }

      // ── Skill sub-labels at high zoom
      if (zoom > 1.8) {
        Object.entries(skillCenters).forEach(([skill, pos]) => {
          if (!skillPopulation[skill]) return;
          const meta = SKILL_META[skill];
          if (!meta) return;
          const { sx, sy, pd } = project(pos.x - cx, pos.y - cy);
          if (pd < 0.5) return;
          const fontSize = Math.max(6, Math.round(7 * pd * zoom));
          ctx.font = `${fontSize}px monospace`;
          ctx.textAlign = "center";
          const dimAlpha = (hasFilter && filterCluster !== meta.cluster) ? 0.04 : (dark ? 0.16 : 0.18);
          ctx.fillStyle = `rgba(${hexToRgb(meta.color)},${dimAlpha})`;
          ctx.fillText(skill, sx, sy - Math.round(10 * pd * zoom));
        });
      }

      // ── Collab links
      collabLinks.forEach(link => {
        const s = nodeMap[link.source], t = nodeMap[link.target];
        if (!s || !t) return;
        const dimmed = isDimmed(t);
        ctx.beginPath(); ctx.moveTo(s.sx, s.sy); ctx.lineTo(t.sx, t.sy);
        ctx.strokeStyle = dark ? `rgba(255,255,255,${dimmed ? 0.1 : 0.6})` : `rgba(0,0,0,${dimmed ? 0.08 : 0.45})`;
        ctx.lineWidth = 1; ctx.setLineDash([]); ctx.stroke();
      });

      // ── Mutual follow links
      if (showMutualLines) {
        mutualLinks.forEach(link => {
          const s = nodeMap[link.source], t = nodeMap[link.target];
          if (!s || !t) return;
          const dimmed = isDimmed(t);
          ctx.beginPath(); ctx.moveTo(s.sx, s.sy); ctx.lineTo(t.sx, t.sy);
          ctx.strokeStyle = dark ? `rgba(255,255,255,${dimmed ? 0.05 : 0.28})` : `rgba(0,0,0,${dimmed ? 0.04 : 0.22})`;
          ctx.lineWidth = 0.75; ctx.setLineDash([3, 4]); ctx.stroke();
          ctx.setLineDash([]);
        });
      }

      // ── Nodes
      const meColor = dark ? "#ffffff" : "#111111";
      projected.forEach(n => {
        const rgb = hexToRgb(n.color);
        const dimmed = isDimmed(n);
        const isSearchHit = hasSearch && n.name.toLowerCase().includes(searchLower) && !n.isMe;

        if (n.isMe) {
          // Clean solid node — single subtle outer ring, solid fill
          ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr * 1.9, 0, Math.PI * 2);
          ctx.strokeStyle = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.18)";
          ctx.lineWidth = 1; ctx.setLineDash([]); ctx.stroke();
          ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr, 0, Math.PI * 2);
          ctx.fillStyle = meColor; ctx.fill();
          const lfs = Math.max(8, Math.round(10 * n.pd * zoom));
          ctx.textAlign = "center";
          ctx.font = `600 ${lfs}px -apple-system, sans-serif`;
          ctx.fillStyle = meColor;
          ctx.fillText(n.name.split(" ")[0], n.sx, n.sy + n.sr + Math.round(13 * n.pd * zoom));
        } else {
          // Search highlight
          if (isSearchHit) {
            ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr * 2.4, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${rgb},${dark ? 0.5 : 0.7})`;
            ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke();
            ctx.setLineDash([]);
          }

          // Fill: very light tint of node color
          const fillAlpha = dimmed ? 0.03 : (n.isCollab ? 0.18 : n.isMutual ? 0.12 : 0.07);
          ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rgb},${fillAlpha})`; ctx.fill();

          // Border: clean ring in node color
          const strokeAlpha = dimmed ? 0.08 : (n.isCollab ? 0.9 : n.isMutual ? 0.65 : isSearchHit ? 0.8 : 0.4);
          ctx.strokeStyle = `rgba(${rgb},${strokeAlpha})`;
          ctx.lineWidth = dimmed ? 0.5 : (n.isCollab ? 1.5 : 1);
          ctx.setLineDash([]); ctx.stroke();

          // Labels
          const showLabel = !dimmed && n.pd > 0.4 && (
            isSearchHit || n.isCollab || n.isMutual || zoom > 1.4
          );
          if (showLabel) {
            const lfs = Math.max(7, Math.round((n.isCollab ? 9 : 8) * n.pd * zoom));
            ctx.font = `${n.isCollab ? "600 " : ""}${lfs}px -apple-system, sans-serif`;
            ctx.textAlign = "center";
            const labelAlpha = n.isCollab ? 0.85 : n.isMutual ? 0.6 : isSearchHit ? 0.85 : 0.45;
            ctx.fillStyle = dark
              ? `rgba(255,255,255,${labelAlpha})`
              : `rgba(0,0,0,${labelAlpha})`;
            ctx.fillText(n.name.split(" ")[0], n.sx, n.sy + n.sr + Math.round(11 * n.pd * zoom));
          }
        }
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [collabLinks, mutualLinks, showMutualLines, dark, dims, getLayout, skillPopulation, filterCluster, searchLower]);

  // ── Mouse ─────────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0 && e.button !== 2) return;
    lastInteractRef.current = Date.now();
    velocityRef.current = { vrX: 0, vrY: 0 };
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    lastSampleRef.current = { rotX: viewRef.current.rotX, rotY: viewRef.current.rotY, t: performance.now() };

    if (e.button === 2) {
      interactRef.current = { mode: "pan", startX: e.clientX, startY: e.clientY, originView: { ...viewRef.current }, panMoved: false };
      canvas.style.cursor = "grabbing";
    } else {
      const hit = getHit(sx, sy);
      if (hit) {
        interactRef.current = { mode: "click", startX: e.clientX, startY: e.clientY, originView: null, panMoved: false };
      } else {
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
      lastInteractRef.current = Date.now();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) interactRef.current.panMoved = true;

      const newRotY = originView.rotY - dx * 0.007;
      const newRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, originView.rotX + dy * 0.007));

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
      lastInteractRef.current = Date.now();
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) interactRef.current.panMoved = true;
      viewRef.current = { ...viewRef.current, panX: originView.panX + dx, panY: originView.panY + dy };
      return;
    }

    const hit = getHit(sx, sy);
    if (hit && !hit.isMe) {
      setTooltip({ id: hit.id, name: hit.name, role: hit.role, skills: hit.skills, primarySkill: hit.primarySkill, isMutual: hit.isMutual, isCollab: hit.isCollab, x: hit.sx, y: hit.sy });
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
    lastInteractRef.current = Date.now();
    velocityRef.current = { vrX: 0, vrY: 0 };
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    applyZoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - rect.left, e.clientY - rect.top);
  }, [applyZoom]);

  const handleTouchStart = useCallback((e) => {
    lastInteractRef.current = Date.now();
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
    lastInteractRef.current = Date.now();
    const { mode, startX, startY, originView } = interactRef.current;

    if (e.touches.length === 1 && mode === "rotate") {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) interactRef.current.panMoved = true;

      const newRotY = originView.rotY - dx * 0.007;
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

  const panelBg = dark ? "rgba(10,10,10,0.78)" : "rgba(255,255,255,0.88)";
  const panelBorder = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.18)";
  const mutedColor = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  const btnStyle = {
    width: 22, height: 22, borderRadius: 4, fontSize: 13, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace",
    background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    border: `1px solid ${panelBorder}`,
    color: mutedColor,
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

      {/* Left panel: legend + search + controls */}
      <div style={{
        position: "absolute", top: 12, left: 12,
        background: panelBg,
        backdropFilter: "blur(10px)",
        border: `1px solid ${panelBorder}`,
        borderRadius: 8, padding: "10px 12px",
        display: "flex", flexDirection: "column", gap: 5,
        minWidth: 148,
      }}>
        {/* Search */}
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="search people..."
          style={{
            background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
            border: `1px solid ${panelBorder}`,
            borderRadius: 4, padding: "4px 7px",
            fontSize: 9, color: dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)",
            fontFamily: "monospace", outline: "none", width: "100%",
            boxSizing: "border-box",
          }}
        />

        <div style={{ borderTop: `1px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, margin: "1px 0" }} />

        {/* Skill cluster filters */}
        {Object.entries(SKILL_CLUSTERS).map(([name, { color }]) => {
          const active = filterCluster === name;
          return (
            <button
              key={name}
              onClick={() => setFilterCluster(active ? null : name)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                background: active ? `rgba(${hexToRgb(color)},0.15)` : "none",
                border: active ? `1px solid rgba(${hexToRgb(color)},0.4)` : "1px solid transparent",
                borderRadius: 4, padding: "2px 4px", cursor: "pointer",
                transition: "all 0.15s",
              }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0, opacity: active ? 1 : 0.9 }} />
              <span style={{ fontSize: 9, color: active ? (dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.75)") : mutedColor, fontFamily: "monospace" }}>{name}</span>
            </button>
          );
        })}

        <div style={{ borderTop: `1px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, margin: "1px 0" }} />

        {/* Line types */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 14, height: 0, borderTop: `2px solid ${dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.75)"}`, flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: mutedColor, fontFamily: "monospace" }}>collaborator</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 14, height: 0, borderTop: `1px solid ${dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.4)"}`, flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: mutedColor, fontFamily: "monospace" }}>mutual follow</span>
        </div>

        <div style={{ borderTop: `1px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, margin: "1px 0" }} />

        {/* Controls */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button onClick={() => setShowMutualLines(v => !v)}
            style={{ flex: 1, background: "none", border: `1px solid ${panelBorder}`, borderRadius: 4, padding: "3px 6px", fontSize: 9, color: mutedColor, cursor: "pointer", fontFamily: "monospace" }}>
            {showMutualLines ? "hide lines" : "show lines"}
          </button>
          <button onClick={() => { const c = canvasRef.current; if (c) applyZoom(1.25, c.width/2, c.height/2); }} style={btnStyle}>+</button>
          <button onClick={() => { const c = canvasRef.current; if (c) applyZoom(0.8, c.width/2, c.height/2); }} style={btnStyle}>−</button>
          <button onClick={resetView} style={{ ...btnStyle, fontSize: 10 }} title="Reset">⊙</button>
        </div>

        <div style={{ fontSize: 8, color: dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.22)", fontFamily: "monospace", lineHeight: 1.6, opacity: hintsVisible ? 1 : 0, transition: "opacity 1s ease" }}>
          drag to rotate · scroll to zoom
        </div>
      </div>

      {/* Stats overlay — top right */}
      <div style={{
        position: "absolute", top: 12, right: 12,
        background: panelBg,
        backdropFilter: "blur(10px)",
        border: `1px solid ${panelBorder}`,
        borderRadius: 8, padding: "8px 12px",
        display: "flex", flexDirection: "column", gap: 4,
        minWidth: 110,
      }}>
        <div style={{ fontSize: 8, color: mutedColor, fontFamily: "monospace", letterSpacing: "1.5px", marginBottom: 2 }}>YOUR NETWORK</div>
        {[
          ["people", stats.total],
          ["collaborators", stats.collabs],
          ["mutual follows", stats.mutuals],
        ].map(([label, val]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 9, color: mutedColor, fontFamily: "monospace" }}>{label}</span>
            <span style={{ fontSize: 11, color: dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.75)", fontFamily: "monospace", fontWeight: 600 }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "absolute",
          left: Math.min(tooltip.x + 14, dims.w - 180),
          top: Math.max(8, tooltip.y - 20),
          background: dark ? "rgba(18,18,18,0.97)" : "rgba(255,255,255,0.98)",
          backdropFilter: "blur(8px)",
          border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
          borderRadius: 8, padding: "9px 13px",
          pointerEvents: "auto", fontSize: 11,
          color: dark ? "#fff" : "#000",
          fontFamily: "monospace", whiteSpace: "nowrap",
          boxShadow: dark ? "0 4px 20px rgba(0,0,0,0.5)" : "0 4px 20px rgba(0,0,0,0.1)",
          minWidth: 150,
        }}>
          <div style={{ fontWeight: 600, letterSpacing: "-0.3px" }}>{tooltip.name}</div>
          {tooltip.role && <div style={{ opacity: 0.45, fontSize: 10, marginTop: 2 }}>{tooltip.role}</div>}
          {/* Top skills */}
          {tooltip.skills?.length > 0 && (
            <div style={{ marginTop: 5, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {tooltip.skills.slice(0, 3).map(s => (
                <span key={s} style={{
                  fontSize: 8, padding: "2px 6px", borderRadius: 3,
                  background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                  color: SKILL_META[s]?.color || (dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)"),
                }}>{s}</span>
              ))}
            </div>
          )}
          {(tooltip.isCollab || tooltip.isMutual) && (
            <div style={{ fontSize: 9, marginTop: 5, opacity: 0.5, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: tooltip.isCollab ? "#22c55e" : "#60a5fa", display: "inline-block" }} />
              {tooltip.isCollab ? "collaborator" : "mutual follow"}
            </div>
          )}
          <div style={{ marginTop: 7, display: "flex", gap: 5 }}>
            <button
              onClick={() => { const user = users.find(u => u.id === tooltip.id); if (user) onNodeClick(user); }}
              style={{ flex: 1, background: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.07)", border: "none", borderRadius: 4, padding: "4px 0", fontSize: 9, color: dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)", cursor: "pointer", fontFamily: "monospace" }}>
              view profile →
            </button>
            {onFollow && !following.includes(tooltip.id) && (
              <button
                onClick={(e) => { e.stopPropagation(); onFollow(tooltip.id); }}
                style={{
                  flex: 1, border: "none", borderRadius: 4, padding: "4px 0", fontSize: 9,
                  cursor: "pointer", fontFamily: "monospace",
                  background: dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)",
                  color: dark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.7)",
                }}>
                follow
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
