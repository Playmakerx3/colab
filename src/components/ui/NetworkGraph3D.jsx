import React, { useRef, useMemo, useEffect, useCallback } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";

const SKILL_COLORS = {
  "Design":       "#a78bfa",
  "Engineering":  "#60a5fa",
  "Music":        "#f472b6",
  "Film / Video": "#fb923c",
  "Video":        "#fb923c",
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
const DEFAULT_COLOR = "#64748b";

function getSkillColor(skills = []) {
  for (const s of skills) {
    if (SKILL_COLORS[s]) return SKILL_COLORS[s];
  }
  return DEFAULT_COLOR;
}

export default function NetworkGraph3D({ users, applications, projects, authUser, onNodeClick, dark }) {
  const fgRef = useRef();

  const { nodes, links } = useMemo(() => {
    if (!users?.length || !authUser) return { nodes: [], links: [] };

    // Build collaborator set: users who share an accepted application on any of my projects
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

    const nodes = users
      .filter(u => u.name?.trim())
      .map(u => ({
        id: u.id,
        name: u.name,
        role: u.role || "",
        skills: u.skills || [],
        color: u.id === authUser.id ? "#ffffff" : getSkillColor(u.skills),
        isMe: u.id === authUser.id,
        isCollab: collaboratorIds.has(u.id),
        val: u.id === authUser.id ? 6 : collaboratorIds.has(u.id) ? 3 : 1.5,
      }));

    const links = [];
    // Link authUser → each collaborator
    collaboratorIds.forEach(cid => {
      if (users.find(u => u.id === cid)) {
        links.push({ source: authUser.id, target: cid });
      }
    });
    // Also link collaborators who share projects with each other
    const seen = new Set();
    applications.filter(a => myProjectIds.has(a.project_id) && a.status === "accepted").forEach(a1 => {
      applications.filter(a2 => a2.project_id === a1.project_id && a2.applicant_id !== a1.applicant_id && a2.status === "accepted").forEach(a2 => {
        const key = [a1.applicant_id, a2.applicant_id].sort().join("-");
        if (!seen.has(key)) {
          seen.add(key);
          links.push({ source: a1.applicant_id, target: a2.applicant_id });
        }
      });
    });

    return { nodes, links };
  }, [users, applications, projects, authUser]);

  // Add cluster force by skill group after mount
  useEffect(() => {
    if (!fgRef.current) return;
    const SKILL_GROUPS = Object.keys(SKILL_COLORS);
    const groupCenters = {};
    SKILL_GROUPS.forEach((s, i) => {
      const angle = (i / SKILL_GROUPS.length) * Math.PI * 2;
      const r = 120;
      groupCenters[s] = { x: Math.cos(angle) * r, y: Math.sin(angle) * r, z: 0 };
    });

    fgRef.current.d3Force("cluster", (alpha) => {
      nodes.forEach(node => {
        const primarySkill = (node.skills || []).find(s => groupCenters[s]);
        if (!primarySkill || node.isMe) return;
        const center = groupCenters[primarySkill];
        node.vx = (node.vx || 0) + (center.x - (node.x || 0)) * alpha * 0.04;
        node.vy = (node.vy || 0) + (center.y - (node.y || 0)) * alpha * 0.04;
        node.vz = (node.vz || 0) + (center.z - (node.z || 0)) * alpha * 0.015;
      });
    });
    fgRef.current.d3ReheatSimulation();
  }, [nodes]);

  const handleNodeClick = useCallback((node) => {
    if (node.isMe) return;
    const user = users.find(u => u.id === node.id);
    if (user) onNodeClick(user);
  }, [users, onNodeClick]);

  const nodeThreeObject = useCallback((node) => {
    const group = new THREE.Group();
    // Sphere
    const geo = new THREE.SphereGeometry(node.isMe ? 5 : node.isCollab ? 3.5 : 2);
    const mat = new THREE.MeshLambertMaterial({
      color: node.color,
      transparent: !node.isMe && !node.isCollab,
      opacity: node.isMe ? 1 : node.isCollab ? 0.95 : 0.45,
    });
    group.add(new THREE.Mesh(geo, mat));
    // Label sprite for me + collaborators
    if (node.isMe || node.isCollab) {
      const canvas = document.createElement("canvas");
      canvas.width = 256; canvas.height = 48;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = node.color;
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(node.name, 128, 32);
      const tex = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sprite.scale.set(20, 4, 1);
      sprite.position.set(0, node.isMe ? 8 : 6, 0);
      group.add(sprite);
    }
    return group;
  }, []);

  const bg = dark ? "#080808" : "#f0f0f0";

  return (
    <ForceGraph3D
      ref={fgRef}
      graphData={{ nodes, links }}
      backgroundColor={bg}
      nodeThreeObject={nodeThreeObject}
      nodeThreeObjectExtend={false}
      linkColor={() => dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}
      linkWidth={0.5}
      linkDirectionalParticles={1}
      linkDirectionalParticleWidth={0.8}
      linkDirectionalParticleColor={() => "rgba(255,255,255,0.4)"}
      onNodeClick={handleNodeClick}
      onNodeHover={(node) => {
        document.body.style.cursor = node && !node.isMe ? "pointer" : "default";
      }}
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.3}
      width={typeof window !== "undefined" ? window.innerWidth - 260 : 900}
      height={typeof window !== "undefined" ? window.innerHeight - 120 : 600}
    />
  );
}
