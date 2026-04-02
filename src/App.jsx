import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

const SKILLS = ["Design", "Engineering", "Marketing", "Finance", "Legal", "Writing", "Video", "Music", "Photography", "Data", "AI/ML", "Product", "Sales", "Operations", "3D/CAD", "Architecture"];
const CATEGORIES = ["Tech / Software", "Creative / Art", "Music", "Film / Video", "Physical / Hardware", "Business / Startup", "Social Impact", "Research", "Other"];
const AVAILABILITY = ["Full-time", "Part-time", "Weekends only", "Evenings only", "Flexible"];
const PLUGINS = [
  { id: "slack", name: "Slack", icon: "#", desc: "Team messaging" },
  { id: "discord", name: "Discord", icon: "◈", desc: "Voice & chat" },
  { id: "drive", name: "Google Drive", icon: "△", desc: "File sharing" },
  { id: "notion", name: "Notion", icon: "□", desc: "Docs & tasks" },
  { id: "github", name: "GitHub", icon: "◎", desc: "Code & repos" },
  { id: "figma", name: "Figma", icon: "◐", desc: "Design files" },
];

// ── MODULE-LEVEL HELPERS ──
const initials = (name, fallback = "?") =>
  name ? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : fallback;

const relativeTime = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

const matchesRegion = (locationStr, regionFilter, myLocation) => {
  if (!regionFilter) return true;
  const loc = (locationStr || "").toLowerCase();
  const myLoc = (myLocation || "").toLowerCase();
  const myCity = myLoc.split(",")[0].trim();
  if (regionFilter === "local" || regionFilter === "city") return myCity.length > 0 && loc.includes(myCity);
  if (regionFilter === "national") return loc.includes("us") || loc.includes("usa") || loc.includes("united states") || (myLoc && loc.split(",").pop().trim() === myLoc.split(",").pop().trim());
  if (regionFilter === "international") return myLoc.length > 0 && !loc.includes(myLoc.split(",").pop().trim().toLowerCase());
  return true;
};

function PostCard({ post, ctx }) {
  const {
    postLikes, expandedComments, postComments, authUser, users,
    handleDeletePost, dark, border, text, textMuted, bg, bg2, btnP, inputStyle,
    setViewingProfile, handleLike, setExpandedComments, loadComments,
    myInitials, setPostComments, profile, supabase,
  } = ctx;
  const isLiked = (postLikes.myLikes || []).includes(post.id);
  const isOpen = expandedComments[post.id];
  const comments = postComments[post.id] || [];
  const isOwner = post.user_id === authUser?.id;
  const postUser = users.find(u => u.id === post.user_id);
  const [localComment, setLocalComment] = React.useState("");
  const [hovered, setHovered] = React.useState(false);

  const submitComment = async () => {
    if (!localComment.trim()) return;
    const content = localComment;
    setLocalComment("");
    const { data } = await supabase.from("comments").insert({
      post_id: post.id, user_id: authUser.id,
      user_name: profile.name, user_initials: myInitials, content,
    }).select().single();
    if (data) setPostComments(prev => ({ ...prev, [post.id]: [...(prev[post.id] || []), data] }));
  };

  const handleDeleteComment = async (commentId) => {
    await supabase.from("comments").delete().eq("id", commentId);
    setPostComments(prev => ({ ...prev, [post.id]: (prev[post.id] || []).filter(c => c.id !== commentId) }));
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderBottom: `1px solid ${border}`, padding: "24px 0", transition: "background 0.15s" }}
    >
      {/* Header */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
        <button onClick={() => postUser && setViewingProfile(postUser)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
          <Avatar initials={post.user_initials} size={40} dark={dark} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <button onClick={() => postUser && setViewingProfile(postUser)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: text }}>{post.user_name}</span>
              </button>
              {post.user_role && <span style={{ fontSize: 11, color: textMuted, marginLeft: 8 }}>{post.user_role}</span>}
              <div style={{ fontSize: 10, color: textMuted, marginTop: 3 }}>{relativeTime(post.created_at)}</div>
            </div>
            {isOwner && hovered && (
              <button className="hb" onClick={() => handleDeletePost(post.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit", opacity: 0.6 }}>✕</button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ fontSize: 14, color: text, lineHeight: 1.75, marginBottom: 14, paddingLeft: 52, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{post.content}</div>

      {/* Media */}
      {post.media_url && (
        <div style={{ paddingLeft: 52, marginBottom: 14 }}>
          {(() => {
            const t = post.media_type || (
              post.media_url.includes("youtube.com") || post.media_url.includes("youtu.be") ? "youtube"
              : post.media_url.match(/\.(mp4|mov|webm)$/i) ? "video"
              : post.media_url.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i) ? "audio"
              : post.media_url.match(/\.pdf$/i) ? "pdf"
              : "image"
            );
            if (t === "youtube") {
              const ytId = post.media_url.includes("youtu.be/")
                ? post.media_url.split("youtu.be/")[1]?.split("?")[0]
                : post.media_url.split("v=")[1]?.split("&")[0];
              return <iframe src={`https://www.youtube.com/embed/${ytId || ""}`} style={{ width: "100%", height: 260, borderRadius: 10, border: "none" }} allowFullScreen />;
            }
            if (t === "video") return <video src={post.media_url} controls style={{ width: "100%", maxHeight: 320, borderRadius: 10, border: `1px solid ${border}` }} />;
            if (t === "audio") return (
              <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ fontSize: 11, color: textMuted, marginBottom: 10, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 14 }}>♪</span>
                  <span>{decodeURIComponent(post.media_url.split("/").pop().split("?")[0]).replace(/^\d+-/, "")}</span>
                </div>
                <audio src={post.media_url} controls style={{ width: "100%", height: 36 }} />
              </div>
            );
            if (t === "pdf") return (
              <a href={post.media_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: text, background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 16px", textDecoration: "none" }}>
                <span style={{ fontSize: 16 }}>↗</span> view PDF
              </a>
            );
            return <img src={post.media_url} alt="" style={{ width: "100%", maxHeight: 400, objectFit: "cover", borderRadius: 10, border: `1px solid ${border}`, display: "block" }} onError={e => e.target.style.display = "none"} />;
          })()}
        </div>
      )}

      {/* Project tag */}
      {post.project_title && (
        <div style={{ paddingLeft: 52, marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: textMuted, background: bg2, border: `1px solid ${border}`, borderRadius: 20, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 9, opacity: 0.6 }}>↗</span> {post.project_title}
          </span>
        </div>
      )}

      {/* Actions */}
      <div style={{ paddingLeft: 52, display: "flex", gap: 20, alignItems: "center" }}>
        <button
          className="hb"
          onClick={() => handleLike(post.id)}
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: isLiked ? text : textMuted, display: "flex", gap: 6, alignItems: "center", transition: "color 0.15s", fontWeight: isLiked ? 500 : 400 }}
        >
          {isLiked ? "♥" : "♡"}
          {(post.like_count || 0) > 0 && <span style={{ fontSize: 12 }}>{post.like_count}</span>}
        </button>
        <button
          className="hb"
          onClick={() => { setExpandedComments(prev => ({ ...prev, [post.id]: !prev[post.id] })); if (!postComments[post.id]) loadComments(post.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: isOpen ? text : textMuted, display: "flex", gap: 6, alignItems: "center", transition: "color 0.15s" }}
        >
          ◎ {comments.length > 0 ? <span>{comments.length}</span> : <span>{isOpen ? "hide" : "comment"}</span>}
        </button>
      </div>

      {/* Comments */}
      {isOpen && (
        <div style={{ paddingLeft: 52, marginTop: 16 }}>
          {comments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              {comments.map((c) => {
                const cUser = users.find(u => u.id === c.user_id);
                const isMyComment = c.user_id === authUser?.id;
                return (
                  <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <Avatar initials={c.user_initials} size={26} dark={dark} />
                    <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 10, padding: "8px 13px", flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <button onClick={() => cUser && setViewingProfile(cUser)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11, fontWeight: 500, color: text, fontFamily: "inherit" }}>{c.user_name}</button>
                        {isMyComment && <button className="hb" onClick={() => handleDeleteComment(c.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit", opacity: 0.6 }}>✕</button>}
                      </div>
                      <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.6 }}>{c.content}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Avatar initials={myInitials} size={26} dark={dark} />
            <input
              placeholder="write a comment..."
              value={localComment}
              onChange={e => setLocalComment(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitComment(); } }}
              style={{ ...inputStyle, fontSize: 12, padding: "8px 13px", flex: 1, borderRadius: 20 }}
            />
            {localComment.trim() && (
              <button className="hb" onClick={submitComment} style={{ ...btnP, padding: "8px 14px", fontSize: 11, flexShrink: 0, borderRadius: 20 }}>post</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ initials: i, size = 32, dark }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: dark ? "#fff" : "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.32, fontWeight: 700, color: dark ? "#000" : "#fff", flexShrink: 0, fontFamily: "inherit" }}>
      {(i || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function ProgressBar({ value, dark }) {
  return (
    <div style={{ background: dark ? "#1a1a1a" : "#e8e8e8", borderRadius: 4, height: 3, width: "100%", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(value || 0, 100)}%`, height: "100%", background: dark ? "#fff" : "#000", borderRadius: 4, transition: "width 0.4s ease" }} />
    </div>
  );
}

function Spinner({ dark }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ width: 20, height: 20, border: `2px solid ${dark ? "#333" : "#ddd"}`, borderTop: `2px solid ${dark ? "#fff" : "#000"}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}

// @mention input component
function MentionInput({ value, onChange, onKeyDown, placeholder, users, style, rows, dark }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [mentionStart, setMentionStart] = useState(-1);
  const ref = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const atIndex = textBefore.lastIndexOf("@");
    if (atIndex !== -1 && (atIndex === 0 || textBefore[atIndex - 1] === " ")) {
      const query = textBefore.slice(atIndex + 1).toLowerCase();
      const matches = users.filter(u => u.name.toLowerCase().includes(query)).slice(0, 4);
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
      setMentionStart(atIndex);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectUser = (user) => {
    const before = value.slice(0, mentionStart);
    const after = value.slice(ref.current.selectionStart);
    onChange(`${before}@${user.name} ${after}`);
    setShowSuggestions(false);
    ref.current.focus();
  };

  const Tag = rows ? "textarea" : "input";
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <Tag ref={ref} value={value} onChange={handleChange} onKeyDown={e => { if (e.key === "Escape") setShowSuggestions(false); if (onKeyDown) onKeyDown(e); }} placeholder={placeholder} rows={rows} style={{ ...style, resize: rows ? "none" : undefined }} />
      {showSuggestions && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: dark ? "#111" : "#fff", border: `1px solid ${dark ? "#222" : "#e0e0e0"}`, borderRadius: 8, zIndex: 100, overflow: "hidden", marginTop: 4 }}>
          {suggestions.map(u => (
            <button key={u.id} onClick={() => selectUser(u)} style={{ width: "100%", padding: "8px 12px", background: "none", border: "none", color: dark ? "#fff" : "#000", cursor: "pointer", textAlign: "left", fontSize: 12, fontFamily: "inherit", display: "flex", gap: 8, alignItems: "center" }}
              onMouseEnter={e => e.currentTarget.style.background = dark ? "#1a1a1a" : "#f0f0f0"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
              <Avatar initials={initials(u.name)} size={24} dark={dark} />
              <div><div style={{ fontSize: 12, color: dark ? "#fff" : "#000" }}>{u.name}</div><div style={{ fontSize: 10, color: dark ? "#555" : "#aaa" }}>{u.role}</div></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PIXEL BANNER PRESETS ──
const COLS = 48, ROWS = 12;
const PRESETS = {
  empty: new Array(COLS * ROWS).fill(0),
  wave: (() => {
    const p = new Array(COLS * ROWS).fill(0);
    for (let c = 0; c < COLS; c++) {
      const h = Math.round(ROWS / 2 + Math.sin(c / 4) * 3);
      for (let r = h; r < ROWS; r++) p[r * COLS + c] = 1;
    }
    return p;
  })(),
  checkerboard: (() => {
    const p = new Array(COLS * ROWS).fill(0);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if ((r + c) % 2 === 0) p[r * COLS + c] = 1;
    return p;
  })(),
  diagonal: (() => {
    const p = new Array(COLS * ROWS).fill(0);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if ((c - r * 2 + 96) % 8 < 4) p[r * COLS + c] = 1;
    return p;
  })(),
  mountains: (() => {
    const p = new Array(COLS * ROWS).fill(0);
    const heights = Array.from({ length: COLS }, (_, c) => {
      const m1 = Math.max(0, ROWS - Math.abs(c - 12) * 0.7);
      const m2 = Math.max(0, ROWS - Math.abs(c - 32) * 0.5);
      const m3 = Math.max(0, ROWS * 0.6 - Math.abs(c - 22) * 0.9);
      return Math.min(ROWS, Math.round(Math.max(m1, m2, m3)));
    });
    for (let c = 0; c < COLS; c++) for (let r = ROWS - heights[c]; r < ROWS; r++) p[r * COLS + c] = 1;
    return p;
  })(),
  city: (() => {
    const p = new Array(COLS * ROWS).fill(0);
    const buildings = [
      { x: 1, w: 5, h: 8 }, { x: 7, w: 4, h: 6 }, { x: 12, w: 6, h: 10 },
      { x: 19, w: 3, h: 7 }, { x: 23, w: 7, h: 9 }, { x: 31, w: 4, h: 6 },
      { x: 36, w: 5, h: 11 }, { x: 42, w: 5, h: 7 },
    ];
    buildings.forEach(({ x, w, h }) => {
      for (let c = x; c < x + w && c < COLS; c++)
        for (let r = ROWS - h; r < ROWS; r++) p[r * COLS + c] = 1;
    });
    return p;
  })(),
  dots: (() => {
    const p = new Array(COLS * ROWS).fill(0);
    for (let r = 1; r < ROWS; r += 3) for (let c = 1; c < COLS; c += 3) p[r * COLS + c] = 1;
    return p;
  })(),
  grid: (() => {
    const p = new Array(COLS * ROWS).fill(0);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (r % 3 === 0 || c % 4 === 0) p[r * COLS + c] = 1;
    return p;
  })(),
};

function PixelBannerDisplay({ pixels, dark, height = 80 }) {
  if (!pixels || pixels.every(v => v === 0)) return null;
  const cellW = 100 / COLS;
  const cellH = 100 / ROWS;
  const onColor = dark ? "#ffffff" : "#000000";
  return (
    <div style={{ width: "100%", height, position: "relative", overflow: "hidden" }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${COLS} ${ROWS}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {pixels.map((v, i) => v ? (
          <rect key={i} x={i % COLS} y={Math.floor(i / COLS)} width={1} height={1} fill={onColor} opacity={0.9} />
        ) : null)}
      </svg>
    </div>
  );
}

function BannerEditor({ pixels, onSave, onClose, dark, bg, bg2, bg3, border, text, textMuted }) {
  const [grid, setGrid] = React.useState([...pixels]);
  const [drawing, setDrawing] = React.useState(false);
  const [drawMode, setDrawMode] = React.useState(1); // 1 = fill, 0 = erase
  const [activePreset, setActivePreset] = React.useState(null);

  const toggle = (i, mode) => {
    setGrid(prev => { const n = [...prev]; n[i] = mode; return n; });
  };

  const applyPreset = (name) => {
    setGrid([...PRESETS[name]]);
    setActivePreset(name);
  };

  const cellSize = Math.floor(Math.min(600, window.innerWidth - 80) / COLS);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.95)" : "rgba(200,200,200,0.9)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: 24, width: "100%", maxWidth: 680, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 4 }}>PROFILE BANNER</div>
            <div style={{ fontSize: 14, color: text }}>design your 8-bit banner</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>✕</button>
        </div>

        {/* Preview */}
        <div style={{ marginBottom: 16, border: `1px solid ${border}`, borderRadius: 8, overflow: "hidden", background: dark ? "#000" : "#fff" }}>
          <PixelBannerDisplay pixels={grid} dark={dark} height={60} />
        </div>

        {/* Presets */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 8 }}>PRESETS</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.keys(PRESETS).map(name => (
              <button key={name} onClick={() => applyPreset(name)} style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: activePreset === name ? text : "none", color: activePreset === name ? bg : textMuted, border: `1px solid ${activePreset === name ? text : border}`, transition: "all 0.15s" }}>
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Draw mode */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px" }}>TOOL</div>
          <button onClick={() => setDrawMode(1)} style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: drawMode === 1 ? text : "none", color: drawMode === 1 ? bg : textMuted, border: `1px solid ${drawMode === 1 ? text : border}` }}>draw</button>
          <button onClick={() => setDrawMode(0)} style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: drawMode === 0 ? text : "none", color: drawMode === 0 ? bg : textMuted, border: `1px solid ${drawMode === 0 ? text : border}` }}>erase</button>
          <button onClick={() => { setGrid(new Array(COLS * ROWS).fill(0)); setActivePreset(null); }} style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: "none", color: textMuted, border: `1px solid ${border}`, marginLeft: "auto" }}>clear</button>
        </div>

        {/* Grid */}
        <div
          style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`, gap: 0, userSelect: "none", border: `1px solid ${border}`, borderRadius: 6, overflow: "hidden", cursor: "crosshair" }}
          onMouseLeave={() => setDrawing(false)}
        >
          {grid.map((v, i) => (
            <div
              key={i}
              style={{ width: cellSize, height: Math.max(6, cellSize * 0.75), background: v ? (dark ? "#fff" : "#000") : (dark ? "#111" : "#f5f5f5"), borderRight: `0.5px solid ${dark ? "#1a1a1a" : "#e8e8e8"}`, borderBottom: `0.5px solid ${dark ? "#1a1a1a" : "#e8e8e8"}`, boxSizing: "border-box" }}
              onMouseDown={() => { setDrawing(true); toggle(i, drawMode); }}
              onMouseEnter={() => { if (drawing) toggle(i, drawMode); }}
              onMouseUp={() => setDrawing(false)}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: textMuted }}>cancel</button>
          <button onClick={() => { onSave(grid); onClose(); }} style={{ flex: 2, background: text, color: bg, border: "none", borderRadius: 8, padding: "11px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>save banner →</button>
        </div>
      </div>
    </div>
  );
}

function FullProfilePortfolio({ userId, dark, bg, bg2, border, text, textMuted, labelStyle }) {
  const [items, setItems] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => {
    supabase.from("portfolio_items").select("*").eq("user_id", userId).then(({ data }) => { setItems(data || []); setLoaded(true); });
  }, [userId]);
  if (!loaded) return <div style={{ fontSize: 12, color: textMuted }}>loading...</div>;
  if (items.length === 0) return <div style={{ fontSize: 12, color: textMuted }}>no portfolio items yet.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {items.map((item, i) => (
        <div key={item.id} style={{ background: bg2, borderRadius: i === 0 && items.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === items.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < items.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px" }}>
          <div style={{ fontSize: 14, color: text, marginBottom: 4 }}>{item.title}</div>
          {item.description && <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 6 }}>{item.description}</div>}
          {item.url && (
            item.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
              ? <img src={item.url} alt={item.title} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, border: `1px solid ${border}`, marginTop: 4 }} />
              : <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: text, textDecoration: "underline", wordBreak: "break-all" }}>{item.url.includes("user-uploads") ? "view file" : item.url}</a>
          )}
        </div>
      ))}
    </div>
  );
}

// ── PUBLIC PROJECT PAGE ──
function PublicProjectPage({ projectId }) {
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

  // Inject OG meta tags once project loads
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

      {/* Nav */}
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

      {/* Content */}
      <div className="fu" style={{ maxWidth: 700, margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* Owner */}
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

        {/* Category label */}
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 10 }}>{(project.category || "").toUpperCase()}</div>

        {/* Title */}
        <h1 style={{ fontSize: "clamp(22px, 5vw, 36px)", fontWeight: 400, letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 16, color: text }}>{project.title}</h1>

        {/* Description */}
        <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.85, marginBottom: 28 }}>{project.description}</p>

        {/* Goals / Timeline */}
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

        {/* Skills */}
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

        {/* Location */}
        {project.location && (
          <div style={{ marginBottom: 28, fontSize: 12, color: textMuted }}>
            <span style={{ fontSize: 10, letterSpacing: "1.5px" }}>LOCATION </span>{project.location}
          </div>
        )}

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${border}`, marginBottom: 28 }} />

        {/* CTA */}
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

        {/* Footer note */}
        <div style={{ marginTop: 32, fontSize: 11, color: textMuted, lineHeight: 1.7, borderTop: `1px solid ${border}`, paddingTop: 24 }}>
          This project is listed on <a href="/" style={{ color: text, textDecoration: "underline" }}>CoLab</a> — a platform for builders to find collaborators and ship together.
        </div>
      </div>

      {copied && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: text, color: bg, padding: "10px 18px", borderRadius: 8, fontSize: 11, zIndex: 300, animation: "tin 0.3s ease", whiteSpace: "nowrap" }}>link copied to clipboard</div>}
    </div>
  );
}

function CoLab() {
  const [dark, setDark] = useState(true);
  const [screen, setScreen] = useState("landing");
  const [appScreen, setAppScreen] = useState("explore");
  const [exploreTab, setExploreTab] = useState("for-you");
  const [networkTab, setNetworkTab] = useState("feed");
  const [activeProject, setActiveProject] = useState(null);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [viewFullProfile, setViewFullProfile] = useState(null); // full page profile view
  const [projectTab, setProjectTab] = useState("tasks");

  // Auth
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [onboardStep, setOnboardStep] = useState(0);
  const [onboardData, setOnboardData] = useState({ name: "", username: "", role: "", bio: "", skills: [] });

  // Data
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [projectUpdates, setProjectUpdates] = useState([]);
  const [applications, setApplications] = useState([]);
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [dmThreads, setDmThreads] = useState([]);
  const [dmMessages, setDmMessages] = useState({});
  const [activeDmThread, setActiveDmThread] = useState(null);
  const [portfolioItems, setPortfolioItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [liveStats, setLiveStats] = useState({ builders: "...", projects: "..." });
  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [posts, setPosts] = useState([]);
  const [postLikes, setPostLikes] = useState({ myLikes: [] });
  const [postComments, setPostComments] = useState({});
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostProject, setNewPostProject] = useState("");
  const [newPostMediaUrl, setNewPostMediaUrl] = useState("");
  const [newPostMediaType, setNewPostMediaType] = useState(""); // image|video|audio|youtube|pdf
  const [expandedComments, setExpandedComments] = useState({});
  const [newCommentText, setNewCommentText] = useState({});
  const [projectFiles, setProjectFiles] = useState([]);
  const [projectDocs, setProjectDocs] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null); // { id, text, type }
  const [editMessageText, setEditMessageText] = useState("");
  const [mentionNotifications, setMentionNotifications] = useState([]);
  const [trendingProjects, setTrendingProjects] = useState([]);
  const [skillCategoryCount, setSkillCategoryCount] = useState(48);

  // UI
  const [showNotifications, setShowNotifications] = useState(false);
  const [filterSkill, setFilterSkill] = useState(null);
  const [networkFilter, setNetworkFilter] = useState(null);
  const [regionFilter, setRegionFilter] = useState(null); // local, national, international
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newProject, setNewProject] = useState({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2, location: "", goals: "", timeline: "", is_private: false });
  const [newTaskText, setNewTaskText] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newUpdate, setNewUpdate] = useState("");
  const [dmInput, setDmInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsEmail, setSettingsEmail] = useState("");
  const [settingsPassword, setSettingsPassword] = useState("");
  const [settingsNewPassword, setSettingsNewPassword] = useState("");
  const [projectActivity, setProjectActivity] = useState([]);
  const [docPreviewMode, setDocPreviewMode] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipPostContent, setShipPostContent] = useState("");
  const [editProfile, setEditProfile] = useState(false);
  const [showBannerEditor, setShowBannerEditor] = useState(false);
  const [bannerPixels, setBannerPixels] = useState(new Array(48 * 12).fill(0));
  const [showApplicationForm, setShowApplicationForm] = useState(null);
  const [applicationSuccess, setApplicationSuccess] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [newDmSearch, setNewDmSearch] = useState("");
  const [applicationForm, setApplicationForm] = useState({ skills: [], availability: "", motivation: "", portfolio_url: "" });
  const [reviewingApplicants, setReviewingApplicants] = useState(null);
  const [showAddPortfolio, setShowAddPortfolio] = useState(false);
  const [newPortfolioItem, setNewPortfolioItem] = useState({ title: "", description: "", url: "" });
  const messagesEndRef = useRef(null);
  const dmEndRef = useRef(null);

  const bg = dark ? "#0a0a0a" : "#ffffff";
  const bg2 = dark ? "#111111" : "#f5f5f5";
  const bg3 = dark ? "#1a1a1a" : "#ebebeb";
  const border = dark ? "#1e1e1e" : "#e0e0e0";
  const text = dark ? "#ffffff" : "#000000";
  const textMuted = dark ? "#555555" : "#aaaaaa";
  const textSub = dark ? "#2a2a2a" : "#d0d0d0";

  const inputStyle = { background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 14px", color: text, fontSize: 13, width: "100%", fontFamily: "inherit", outline: "none" };
  const labelStyle = { fontSize: 10, fontWeight: 500, color: textMuted, display: "block", marginBottom: 6, letterSpacing: "0.8px" };
  const btnP = { background: text, color: bg, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
  const btnG = { background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 20px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const myInitials = initials(profile?.name, "ME");
  const getMatchScore = (p) => (profile?.skills || []).filter(s => (p.skills || []).includes(s)).length;
  const unreadDms = dmThreads.filter(t => t.unread && t.id !== activeDmThread?.id).length;
  const unreadNotifs = notifications.filter(n => !n.read).length + mentionNotifications.length;

  // Render mentions with highlights
  const renderWithMentions = (text) => {
    if (!text) return text;
    const parts = text.split(/(@\w[\w\s]*)/g);
    return parts.map((part, i) =>
      part.startsWith("@")
        ? <span key={i} style={{ color: dark ? "#fff" : "#000", fontWeight: 600 }}>{part}</span>
        : part
    );
  };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { width: 100%; min-height: 100vh; margin: 0; padding: 0; overflow-x: hidden; background-color: ${dark ? "#0a0a0a" : "#ffffff"}; transition: background-color 0.3s ease, color 0.3s ease; }
    body { background: ${dark ? "#0a0a0a" : "#ffffff"}; }
    input, select, textarea { outline: none; font-family: inherit; }
    ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #2a2a2a; }
    @keyframes fu { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .fu { animation: fu 0.3s ease forwards; opacity: 0; }
    @keyframes tin { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hb:hover { opacity: 0.7; cursor: pointer; }
    .card-h:hover { border-color: ${text} !important; }
    .task-row:hover .tdel { opacity: 1 !important; }
    @media (max-width: 640px) {
      .search-desktop { display: none !important; }
      .search-mobile { display: block !important; }
      .hero-h1 { font-size: 44px !important; letter-spacing: -2px !important; }
      .stat-grid { flex-direction: column !important; }
      .stat-item { border-right: none !important; border-bottom: 1px solid ${border} !important; padding: 16px 20px !important; }
      .how-grid { grid-template-columns: 1fr !important; }
      .how-card { border-right: 1px solid ${border} !important; border-bottom: none !important; }
      .how-card:last-child { border-bottom: 1px solid ${border} !important; }
      .pad { padding-left: 16px !important; padding-right: 16px !important; }
      .network-grid { grid-template-columns: 1fr !important; }
      .notif-w { width: calc(100vw - 24px) !important; right: 12px !important; }
      .proj-tabs { overflow-x: auto !important; }
      .profile-layout { grid-template-columns: 1fr !important; }
      .msg-layout { grid-template-columns: 1fr !important; }
      input, select, textarea { font-size: 16px !important; }
      .msgs-left { width: 100% !important; border-right: none !important; }
      .msgs-right { width: 100% !important; }
      .msgs-has-thread .msgs-left { display: none !important; }
      .msgs-no-thread .msgs-right { display: none !important; }
      .msgs-back { display: flex !important; }
    }
      .nav-label { font-size: 10px !important; padding: 4px 4px !important; }
      .hero-h1 { font-size: 44px !important; letter-spacing: -2px !important; }
      .stat-grid { flex-direction: column !important; }
      .stat-item { border-right: none !important; border-bottom: 1px solid ${border} !important; padding: 16px 20px !important; }
      .how-grid { grid-template-columns: 1fr !important; }
      .how-card { border-right: 1px solid ${border} !important; border-bottom: none !important; }
      .how-card:last-child { border-bottom: 1px solid ${border} !important; }
      .pad { padding-left: 16px !important; padding-right: 16px !important; }
      .network-grid { grid-template-columns: 1fr !important; }
      .notif-w { width: calc(100vw - 24px) !important; right: 12px !important; }
      .proj-tabs { overflow-x: auto !important; }
      .profile-layout { grid-template-columns: 1fr !important; }
      .msg-layout { grid-template-columns: 1fr !important; }
    }
  `;

  // Pre-populate application form with matching skills when it opens
  useEffect(() => {
    if (showApplicationForm) {
      const matchingSkills = (showApplicationForm.skills || []).filter(s => (profile?.skills || []).includes(s));
      setApplicationForm({ skills: matchingSkills, availability: "", motivation: "", portfolio_url: "" });
      setApplicationSuccess(false);
    }
  }, [showApplicationForm?.id]);

  // Force body background + mobile browser chrome color on mode switch
  useEffect(() => {
    const color = dark ? "#0a0a0a" : "#ffffff";
    document.body.style.backgroundColor = color;
    document.body.style.transition = "background-color 0.3s ease";
    document.documentElement.style.backgroundColor = color;
    document.documentElement.style.transition = "background-color 0.3s ease";
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [dark]);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user || null);
      if (session?.user) loadProfile(session.user.id);
      else setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user || null);
      if (session?.user) loadProfile(session.user.id);
      else { setProfile(null); setAuthLoading(false); setScreen("landing"); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data) { setProfile(data); if (data?.banner_pixels) { try { setBannerPixels(JSON.parse(data.banner_pixels)); } catch {} } setScreen("app"); setAuthLoading(false); loadAllData(userId); }
    else { setScreen("onboard"); setAuthLoading(false); }
  };

  const loadAllData = async (userId) => {
    setLoading(true);
    try {
      const [{ data: projs }, { data: usrs }, { data: apps }, { data: fols }, { data: folsByMe }, { data: threads }, { data: port }, { data: postsData }, { data: likesData }, { data: mentionNotifs }] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("*"),
        supabase.from("applications").select("*"),
        supabase.from("follows").select("*").eq("following_id", userId), // people who follow YOU
        supabase.from("follows").select("*").eq("follower_id", userId),  // people YOU follow
        supabase.from("dm_threads").select("*").or(`user_a.eq.${userId},user_b.eq.${userId}`),
        supabase.from("portfolio_items").select("*").eq("user_id", userId),
        supabase.from("posts").select("*").order("created_at", { ascending: false }),
        supabase.from("likes").select("*").eq("user_id", userId),
        supabase.from("mention_notifications").select("*").eq("user_id", userId).eq("read", false).order("created_at", { ascending: false }),
      ]);
      setProjects(projs || []);
      setUsers(usrs || []);
      setApplications(apps || []);
      setFollowers((fols || []).map(f => f.follower_id));   // IDs of people who follow you
      setFollowing((folsByMe || []).map(f => f.following_id)); // IDs you follow
      setDmThreads(threads || []);
      setPortfolioItems(port || []);
      setPosts(postsData || []);
      setPostLikes({ myLikes: (likesData || []).map(l => l.post_id) });
      setMentionNotifications(mentionNotifs || []);
      // Trending — top 3 projects by applicant count
      const trending = [...(projs || [])].sort((a, b) => {
        const aCount = (apps || []).filter(ap => ap.project_id === a.id).length;
        const bCount = (apps || []).filter(ap => ap.project_id === b.id).length;
        return bCount - aCount;
      }).slice(0, 3);
      setTrendingProjects(trending);
      const allSkills = new Set((projs || []).flatMap(p => p.skills || []));
      setSkillCategoryCount(allSkills.size || 48);
      setLiveStats({ builders: (usrs || []).length, projects: (projs || []).length });
      const myProjectIds = (projs || []).filter(p => p.owner_id === userId).map(p => p.id);
      const incoming = (apps || []).filter(a => myProjectIds.includes(a.project_id) && a.status === "pending");
      setNotifications(incoming.map(a => ({
        id: a.id, type: "application",
        text: `${a.applicant_name} applied to your project`,
        sub: (projs || []).find(p => p.id === a.project_id)?.title || "",
        time: new Date(a.created_at).toLocaleDateString(), read: false,
        projectId: a.project_id,
        applicant: { id: a.applicant_id, initials: a.applicant_initials, name: a.applicant_name, role: a.applicant_role, bio: a.applicant_bio, skills: a.applicant_skills || [], availability: a.availability, motivation: a.motivation, portfolio_url: a.portfolio_url }
      })));
      // ── PENDING APPLY FROM PUBLIC PAGE ──
      const pendingApply = sessionStorage.getItem("pendingApply");
      if (pendingApply) {
        try {
          const { projectId } = JSON.parse(pendingApply);
          sessionStorage.removeItem("pendingApply");
          const proj = (projs || []).find(p => p.id === projectId);
          if (proj) setTimeout(() => setShowApplicationForm(proj), 400);
        } catch {}
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // ── REALTIME ──
  // Ref so realtime callbacks always see current projects without re-subscribing
  const projectsRef = useRef([]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);

  useEffect(() => {
    if (!authUser) return;
    const channel = supabase.channel("realtime-colab")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        if (activeProject && payload.new.project_id === activeProject.id) {
          setMessages(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, (payload) => {
        // Always update DM messages — works even when not on messages tab
        setDmMessages(prev => {
          const threadId = payload.new.thread_id;
          const existing = prev[threadId] || [];
          if (existing.find(m => m.id === payload.new.id)) return prev;
          return { ...prev, [threadId]: [...existing, payload.new] };
        });
        // If this thread is active, scroll to bottom
        if (activeDmThread?.id === payload.new.thread_id) {
          setTimeout(() => dmEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
        // Show notification dot if message is from someone else and we're not on messages tab
        if (payload.new.sender_id !== authUser?.id) {
          setDmThreads(prev => prev.map(t =>
            t.id === payload.new.thread_id ? { ...t, unread: true } : t
          ));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "applications" }, (payload) => {
        setApplications(prev => {
          if (prev.find(a => a.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        const myProjectIds = projectsRef.current.filter(p => p.owner_id === authUser?.id).map(p => p.id);
        if (myProjectIds.includes(payload.new.project_id)) {
          const proj = projectsRef.current.find(p => p.id === payload.new.project_id);
          setNotifications(prev => {
            if (prev.find(n => n.id === payload.new.id)) return prev;
            return [{
              id: payload.new.id, type: "application",
              text: `${payload.new.applicant_name} applied to your project`,
              sub: proj?.title || "", time: "just now", read: false,
              projectId: payload.new.project_id,
              applicant: { id: payload.new.applicant_id, initials: payload.new.applicant_initials, name: payload.new.applicant_name, role: payload.new.applicant_role, bio: payload.new.applicant_bio, skills: payload.new.applicant_skills || [], availability: payload.new.availability, motivation: payload.new.motivation }
            }, ...prev];
          });
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "projects" }, (payload) => {
        setProjects(prev => {
          if (prev.find(p => p.id === payload.new.id)) return prev;
          return [payload.new, ...prev];
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
        if (payload.new.user_id !== authUser?.id) {
          setPosts(prev => {
            if (prev.find(p => p.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mention_notifications" }, (payload) => {
        if (payload.new.user_id === authUser?.id) {
          setMentionNotifications(prev => [payload.new, ...prev]);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [authUser, activeProject, activeDmThread]);

  const loadProjectData = async (projectId) => {
    const [{ data: t }, { data: m }, { data: u }, { data: f }, { data: d }] = await Promise.all([
      supabase.from("tasks").select("*").eq("project_id", projectId).order("created_at"),
      supabase.from("messages").select("*").eq("project_id", projectId).order("created_at"),
      supabase.from("updates").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("project_files").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("project_docs").select("*").eq("project_id", projectId).order("created_at"),
    ]);
    setTasks(t || []);
    setMessages(m || []);
    setProjectUpdates(u || []);
    setProjectFiles(f || []);
    setProjectDocs(d || []);
    setActiveDoc(null);
    loadActivity(projectId);
  };

  const loadDmMessages = async (threadId) => {
    const { data } = await supabase.from("dm_messages").select("*").eq("thread_id", threadId).order("created_at");
    setDmMessages(prev => ({ ...prev, [threadId]: data || [] }));
  };

  // ── AUTH ──
  const handleSignUp = async () => {
    setAuthError("");
    const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (error) { setAuthError(error.message); return; }
    if (data.user) { setAuthUser(data.user); setScreen("onboard"); }
  };

  const handleLogin = async () => {
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
  };

  const handlePasswordReset = async () => {
    if (!authEmail) { setAuthError("Enter your email first."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setAuthError(error.message);
    else setResetSent(true);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfile(null); setProjects([]); setUsers([]); setFollowing([]);
    setScreen("landing");
  };

  const handleFinishOnboard = async () => {
    if (!onboardData.name) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id || authUser?.id;
      if (!userId) { showToast("Session expired."); setScreen("auth"); return; }
      const { data, error } = await supabase.from("profiles").upsert({
        id: userId, name: onboardData.name, username: onboardData.username || onboardData.name.toLowerCase().replace(/\s+/g, ""), role: onboardData.role || "",
        bio: onboardData.bio || "", skills: onboardData.skills || [],
      }, { onConflict: "id" }).select().single();
      if (error) { showToast("Error: " + error.message); return; }
      if (data) { setProfile(data); setScreen("app"); setAppScreen("explore"); loadAllData(userId); showToast(`Welcome, ${data.name.split(" ")[0]}!`); }
    } catch (e) { showToast("Something went wrong."); }
  };

  const handleSaveProfile = async () => {
    const { data, error } = await supabase.from("profiles").update({
      name: profile.name, username: profile.username, role: profile.role,
      bio: profile.bio, skills: profile.skills, location: profile.location || "",
    }).eq("id", authUser.id).select().single();
    if (!error) { setProfile(data); setEditProfile(false); showToast("Profile saved."); }
  };

  // ── PORTFOLIO ──
  const handleAddPortfolioItem = async () => {
    if (!newPortfolioItem.title) return;
    const { data } = await supabase.from("portfolio_items").insert({
      user_id: authUser.id, ...newPortfolioItem,
    }).select().single();
    if (data) {
      setPortfolioItems([...portfolioItems, data]);
      setNewPortfolioItem({ title: "", description: "", url: "" });
      setShowAddPortfolio(false);
      showToast("Portfolio item added.");
    }
  };

  const handleDeletePortfolioItem = async (id) => {
    await supabase.from("portfolio_items").delete().eq("id", id);
    setPortfolioItems(portfolioItems.filter(p => p.id !== id));
    showToast("Removed.");
  };

  // ── PROJECTS ──
  const handlePostProject = async () => {
    if (!newProject.title || !newProject.description) return;
    const { data, error } = await supabase.from("projects").insert({
      title: newProject.title, description: newProject.description,
      category: newProject.category, skills: newProject.skills,
      max_collaborators: newProject.maxCollaborators,
      location: newProject.location || profile?.location || "",
      goals: newProject.goals || null,
      timeline: newProject.timeline || null,
      owner_id: authUser.id, owner_name: profile.name,
      owner_initials: myInitials, status: "open", progress: 0, plugins: [], collaborators: 0,
      is_private: newProject.is_private || false,
    }).select().single();
    if (!error && data) {
      setProjects([data, ...projects]);
      setNewProject({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2, location: "", goals: "", timeline: "", is_private: false });
      setShowCreate(false);
      setActiveProject(data);
      loadProjectData(data.id);
      setAppScreen("workspace");
      setProjectTab("kanban");
      showToast("Project posted — you're in your workspace.");
    } else {
      showToast("Failed to post project. Try again.");
    }
  };

  const handleUpdateProgress = async (projectId, progress) => {
    const val = Math.min(100, Math.max(0, parseInt(progress) || 0));
    await supabase.from("projects").update({ progress: val }).eq("id", projectId);
    setProjects(projects.map(p => p.id === projectId ? { ...p, progress: val } : p));
    if (activeProject?.id === projectId) setActiveProject({ ...activeProject, progress: val });
    showToast("Progress updated.");
  };

  const handleArchiveProject = async (projectId) => {
    if (!window.confirm("Archive this project? It will be hidden from your workspace but not deleted.")) return;
    await supabase.from("projects").update({ archived: true }).eq("id", projectId);
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, archived: true } : p));
    setActiveProject(null);
    showToast("Project archived.");
  };

  const handleUnarchiveProject = async (projectId) => {
    await supabase.from("projects").update({ archived: false }).eq("id", projectId);
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, archived: false } : p));
    showToast("Project restored.");
  };

  const handleShipProject = async (projectId, content) => {
    if (!content.trim()) return;
    const proj = projects.find(p => p.id === projectId) || activeProject;
    if (!proj) return;
    const now = new Date().toISOString();
    await supabase.from("projects").update({ shipped: true, shipped_at: now }).eq("id", projectId);
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, shipped: true, shipped_at: now } : p));
    if (activeProject?.id === projectId) setActiveProject(prev => ({ ...prev, shipped: true, shipped_at: now }));
    const insertPayload = {
      user_id: authUser.id, user_name: profile.name, user_initials: myInitials,
      user_role: profile.role || "", content,
      project_id: projectId, project_title: proj.title,
    };
    const { data: postData } = await supabase.from("posts").insert(insertPayload).select().single();
    if (postData) setPosts(prev => [postData, ...prev]);
    logActivity(projectId, "project_shipped", `${proj.title} shipped`);
    setShowShipModal(false);
    setShipPostContent("");
    showToast("Shipped! Post added to your feed.");
  };

  const handleToggleFeatured = async (projectId, featured) => {
    await supabase.from("projects").update({ featured }).eq("id", projectId);
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, featured } : p));
    if (activeProject?.id === projectId) setActiveProject(prev => ({ ...prev, featured }));
    showToast(featured ? "Project featured on Explore." : "Removed from featured.");
  };

  const handleLeaveProject = async (applicationId) => {
    if (!window.confirm("Leave this project? You'll need to re-apply to rejoin.")) return;
    await supabase.from("applications").update({ status: "left" }).eq("id", applicationId);
    setApplications(prev => prev.map(a => a.id === applicationId ? { ...a, status: "left" } : a));
    setActiveProject(null);
    showToast("You've left the project.");
  };

  const handleGenerateInvite = async (projectId) => {
    const { data } = await supabase.from("project_invites").insert({ project_id: projectId, created_by: authUser.id }).select().single();
    if (data) {
      const url = `${window.location.origin}/join/${data.token}`;
      setInviteLink(url);
      navigator.clipboard?.writeText(url);
      showToast("Invite link copied to clipboard.");
    }
  };

  const handleUpdateEmail = async () => {
    if (!settingsEmail) return;
    const { error } = await supabase.auth.updateUser({ email: settingsEmail });
    if (error) showToast("Error: " + error.message);
    else { showToast("Check your new email to confirm the change."); setSettingsEmail(""); }
  };

  const handleUpdatePassword = async () => {
    if (!settingsNewPassword || settingsNewPassword.length < 8) { showToast("Password must be at least 8 characters."); return; }
    const { error } = await supabase.auth.updateUser({ password: settingsNewPassword });
    if (error) showToast("Error: " + error.message);
    else { showToast("Password updated."); setSettingsNewPassword(""); setSettingsPassword(""); }
  };

  const logActivity = async (projectId, eventType, details) => {
    if (!authUser || !profile) return;
    await supabase.from("project_activity").insert({ project_id: projectId, user_id: authUser.id, user_name: profile.name, event_type: eventType, details });
  };

  const loadActivity = async (projectId) => {
    const { data } = await supabase.from("project_activity").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50);
    setProjectActivity(data || []);
  };

  // Auto-calculate progress from task completion
  const calcProgress = (projectId, taskList) => {
    const pt = taskList.filter(t => t.project_id === projectId);
    if (pt.length === 0) return null;
    return Math.round((pt.filter(t => t.done).length / pt.length) * 100);
  };

  const syncProgress = async (projectId, taskList) => {
    const prog = calcProgress(projectId, taskList);
    if (prog === null) return;
    await supabase.from("projects").update({ progress: prog }).eq("id", projectId);
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, progress: prog } : p));
    if (activeProject?.id === projectId) setActiveProject(prev => ({ ...prev, progress: prog }));
    if (prog === 100) {
      const proj = projectsRef.current.find(p => p.id === projectId);
      if (proj && !proj.shipped && proj.owner_id === authUser?.id) {
        setTimeout(() => {
          setShipPostContent(`just shipped: ${proj.title}. built it with the team on CoLab.`);
          setShowShipModal(true);
        }, 600);
      }
    }
  };

  // ── TASKS ──
  const handleAddTask = async (projectId) => {
    if (!newTaskText.trim()) return;
    const assignedUser = users.find(u => u.name === taskAssignee);
    const { data } = await supabase.from("tasks").insert({
      project_id: projectId, text: newTaskText, done: false,
      assigned_to: assignedUser?.id || null, assigned_name: taskAssignee || null,
      due_date: taskDueDate || null,
    }).select().single();
    if (data) {
      const newTasks = [...tasks, data];
      setTasks(newTasks);
      setNewTaskText(""); setTaskAssignee(""); setTaskDueDate("");
      syncProgress(projectId, newTasks);
    }
  };

  const handleToggleTask = async (task) => {
    const { data } = await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id).select().single();
    if (data) {
      const newTasks = tasks.map(t => t.id === task.id ? data : t);
      setTasks(newTasks);
      syncProgress(task.project_id, newTasks);
    }
  };

  const handleDeleteTask = async (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    await supabase.from("tasks").delete().eq("id", taskId);
    const newTasks = tasks.filter(t => t.id !== taskId);
    setTasks(newTasks);
    if (task) syncProgress(task.project_id, newTasks);
  };

  // ── MESSAGES ──
  const handleSendMessage = async (projectId) => {
    if (!newMessage.trim()) return;
    const text = newMessage;
    setNewMessage(""); // optimistic clear
    const { data } = await supabase.from("messages").insert({
      project_id: projectId, from_user: authUser.id,
      from_initials: myInitials, from_name: profile.name, text,
    }).select().single();
    if (data) {
      setMessages(prev => prev.find(m => m.id === data.id) ? prev : [...prev, data]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      detectAndNotifyMentions(text, projectId);
    }
  };

  const handlePostUpdate = async (projectId) => {
    if (!newUpdate.trim()) return;
    const { data } = await supabase.from("updates").insert({
      project_id: projectId, author_id: authUser.id,
      author: profile.name, initials: myInitials, text: newUpdate,
    }).select().single();
    if (data) { setProjectUpdates([data, ...projectUpdates]); setNewUpdate(""); detectAndNotifyMentions(newUpdate, projectId); showToast("Update posted."); }
  };

  // ── DMs ──
  const openDm = async (user) => {
    if (user.id === authUser?.id) return;
    let thread = dmThreads.find(t =>
      (t.user_a === authUser.id && t.user_b === user.id) ||
      (t.user_b === authUser.id && t.user_a === user.id)
    );
    if (!thread) {
      // Check DB both orderings before creating — prevents duplicate threads
      const { data: existing } = await supabase.from("dm_threads").select("*")
        .or(`and(user_a.eq.${authUser.id},user_b.eq.${user.id}),and(user_a.eq.${user.id},user_b.eq.${authUser.id})`);
      if (existing && existing.length > 0) {
        thread = existing[0];
        setDmThreads(prev => prev.find(t => t.id === thread.id) ? prev : [...prev, thread]);
      } else {
        const { data } = await supabase.from("dm_threads").insert({ user_a: authUser.id, user_b: user.id }).select().single();
        if (data) { thread = data; setDmThreads(prev => [...prev, data]); }
      }
    }
    if (thread) {
      setActiveDmThread({ ...thread, otherUser: user });
      loadDmMessages(thread.id);
      setAppScreen("messages");
      setViewingProfile(null);
      setViewFullProfile(null);
      setDmThreads(prev => prev.map(t => t.id === thread.id ? { ...t, unread: false } : t));
      setTimeout(() => markDmRead(thread.id), 500);
    }
  };

  const handleSendDm = async () => {
    if (!dmInput.trim() || !activeDmThread) return;
    const text = dmInput;
    const threadId = activeDmThread.id; // capture before async — avoids stale closure
    const { data } = await supabase.from("dm_messages").insert({
      thread_id: threadId, sender_id: authUser.id,
      sender_name: profile.name, sender_initials: myInitials, text,
    }).select().single();
    if (data) {
      setDmInput(""); // clear only after successful insert
      setDmMessages(prev => {
        const existing = prev[threadId] || [];
        if (existing.find(m => m.id === data.id)) return prev;
        return { ...prev, [threadId]: [...existing, data] };
      });
      setTimeout(() => dmEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  // ── APPLICATIONS ──
  const handleApply = async () => {
    const project = showApplicationForm;
    if (!project) return;
    const existing = applications.find(a => a.project_id === project.id && a.applicant_id === authUser.id);
    if (existing) {
      if (existing.status === "pending") { showToast("Already applied."); return; }
      if (existing.status === "accepted") { showToast("You're already on this project."); return; }
      if (existing.status === "declined") {
        const hoursSince = (Date.now() - new Date(existing.updated_at || existing.created_at).getTime()) / 3600000;
        if (hoursSince < 24) { showToast(`You can reapply in ${Math.ceil(24 - hoursSince)}h`); return; }
        await supabase.from("applications").delete().eq("id", existing.id);
        setApplications(prev => prev.filter(a => a.id !== existing.id));
      }
    }
    const { data, error } = await supabase.from("applications").insert({
      project_id: project.id, applicant_id: authUser.id,
      applicant_name: profile.name, applicant_initials: myInitials,
      applicant_role: profile.role || "", applicant_bio: profile.bio || "",
      availability: applicationForm.availability || "",
      motivation: applicationForm.motivation || "",
      portfolio_url: applicationForm.portfolio_url || "",
      status: "pending",
    }).select().single();
    if (error) { showToast("Error submitting. Try again."); return; }
    if (data) {
      setApplications([...applications, data]);
      setApplicationSuccess(true);
    }
  };

  const handleRemoveDeniedApp = async (appId) => {
    await supabase.from("applications").delete().eq("id", appId);
    setApplications(prev => prev.filter(a => a.id !== appId));
    showToast("Application removed.");
  };

  const handleAccept = async (notif) => {
    await supabase.from("applications").update({ status: "accepted" }).eq("id", notif.id);
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    showToast(`${notif.applicant.name} accepted!`);
    logActivity(notif.projectId, "member_joined", `${notif.applicant.name} joined the project`);
    loadAllData(authUser.id);
  };

  const handleDecline = async (notif) => {
    await supabase.from("applications").update({ status: "declined" }).eq("id", notif.id);
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    showToast("Application declined.");
  };

  const handleFollow = async (userId) => {
    if (following.includes(userId)) {
      await supabase.from("follows").delete().eq("follower_id", authUser.id).eq("following_id", userId);
      setFollowing(prev => prev.filter(id => id !== userId));
      showToast("Unfollowed.");
    } else {
      await supabase.from("follows").insert({ follower_id: authUser.id, following_id: userId });
      setFollowing(prev => [...prev, userId]);
      showToast("Following!");
    }
  };

  const handleAddPlugin = async (plugId, project) => {
    const newPlugins = (project.plugins || []).includes(plugId)
      ? project.plugins.filter(x => x !== plugId)
      : [...(project.plugins || []), plugId];
    await supabase.from("projects").update({ plugins: newPlugins }).eq("id", project.id);
    setProjects(projects.map(p => p.id === project.id ? { ...p, plugins: newPlugins } : p));
    if (activeProject?.id === project.id) setActiveProject({ ...activeProject, plugins: newPlugins });
    showToast("Plugin updated.");
  };

  const myProjects = projects.filter(p => p.owner_id === authUser?.id && !p.archived);

  // Derive collaborators from accepted applications (both directions)
  const getCollaborators = (userId) => {
    const asApplicant = applications.filter(a => a.applicant_id === userId && a.status === "accepted").map(a => {
      const proj = projects.find(p => p.id === a.project_id);
      const owner = users.find(u => u.id === proj?.owner_id);
      return owner && owner.id !== userId ? { user: owner, project: proj } : null;
    }).filter(Boolean);
    const asOwner = applications.filter(a => {
      const proj = projects.find(p => p.id === a.project_id);
      return proj?.owner_id === userId && a.status === "accepted";
    }).map(a => {
      const collaborator = users.find(u => u.id === a.applicant_id);
      const proj = projects.find(p => p.id === a.project_id);
      return collaborator ? { user: collaborator, project: proj } : null;
    }).filter(Boolean);
    const seen = new Set();
    return [...asApplicant, ...asOwner].filter(c => {
      if (seen.has(c.user.id)) return false;
      seen.add(c.user.id);
      return true;
    });
  };

  const myCollaborators = getCollaborators(authUser?.id);
  const [showCollaborators, setShowCollaborators] = useState(null); // userId whose collaborators to show
  const appliedProjectIds = applications.filter(a => a.applicant_id === authUser?.id).map(a => a.project_id);
  const browseBase = projects.filter(p => p.owner_id !== authUser?.id && !p.archived && !p.is_private);
  const forYou = browseBase.map(p => ({ ...p, _s: getMatchScore(p) })).filter(p => p._s > 0).sort((a, b) => b._s - a._s);
  const allP = browseBase.map(p => ({ ...p, _s: getMatchScore(p) })).filter(p =>
    (!filterSkill || (p.skills || []).includes(filterSkill)) &&
    (!search || p.title?.toLowerCase().includes(search.toLowerCase()))
  ).sort((a, b) => b._s - a._s);

  const TabBtn = ({ id, label, count, setter, current }) => (
    <button onClick={() => setter(id)} style={{ background: "none", border: "none", borderBottom: current === id ? `1px solid ${text}` : "1px solid transparent", color: current === id ? text : textMuted, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginRight: 20, transition: "all 0.15s", display: "inline-flex", gap: 5, alignItems: "center", whiteSpace: "nowrap" }}>
      {label}{count > 0 && <span style={{ fontSize: 10, background: bg3, borderRadius: 10, padding: "1px 6px", color: textMuted }}>{count}</span>}
    </button>
  );

  const PRow = ({ p }) => {
    const spots = (p.max_collaborators || 2) - (p.collaborators || 0);
    const owner = users.find(u => u.id === p.owner_id);
    return (
      <div style={{ borderBottom: `1px solid ${border}`, padding: "20px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 12, cursor: "pointer", transition: "opacity 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.65"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        onClick={() => { setActiveProject(p); loadProjectData(p.id); }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <button onClick={e => { e.stopPropagation(); if (owner) setViewingProfile(owner); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <Avatar initials={p.owner_initials} size={20} dark={dark} />
              <span style={{ fontSize: 11, color: textMuted, textDecoration: "underline" }}>{p.owner_name}</span>
            </button>
            <span style={{ color: textSub }}>·</span>
            <span style={{ fontSize: 11, color: textMuted }}>{new Date(p.created_at).toLocaleDateString()}</span>
            {appliedProjectIds.includes(p.id) && <span style={{ fontSize: 10, color: textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px" }}>applied</span>}
            {p._s > 0 && <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 3, border: `1px solid ${dark ? "#ffffff20" : "#00000015"}`, color: text }}>{p._s >= 2 ? "★★ strong match" : "★ match"}</span>}
          </div>
          <div style={{ fontSize: 15, color: text, marginBottom: 6, letterSpacing: "-0.3px", lineHeight: 1.3 }}>{p.title}</div>
          <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 10 }}>{(p.description || "").slice(0, 100)}...</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {(p.skills || []).map(s => <span key={s} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: `1px solid ${(profile?.skills || []).includes(s) ? (dark ? "#ffffff35" : "#00000025") : border}`, color: (profile?.skills || []).includes(s) ? text : textMuted, fontWeight: (profile?.skills || []).includes(s) ? 500 : 400 }}>{s}</span>)}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {p.shipped && <div style={{ fontSize: 10, color: "#22c55e", marginBottom: 4 }}>shipped</div>}
          <div style={{ fontSize: 11, color: spots > 0 && !p.shipped ? text : textMuted, fontWeight: spots > 0 && !p.shipped ? 500 : 300, marginBottom: 3 }}>{p.shipped ? "complete" : spots > 0 ? `${spots} open` : "full"}</div>
          <div style={{ fontSize: 10, color: textMuted }}>{p.category}</div>
          {p.location && <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{p.location}</div>}
        </div>
      </div>
    );
  };

  const UserCard = ({ u }) => {
    const sharedSkills = (profile?.skills || []).filter(s => (u.skills || []).includes(s));
    const userProjects = projects.filter(p => p.owner_id === u.id);
    return (
      <div onClick={() => setViewFullProfile(u)} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 12, padding: "20px", cursor: "pointer", transition: "border 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = text} onMouseLeave={e => e.currentTarget.style.borderColor = border}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
          <Avatar initials={initials(u.name)} size={44} dark={dark} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: text }}>{u.name}</div>
            <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{u.role}</div>
            {u.location && <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{u.location}</div>}
            <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>{userProjects.length} project{userProjects.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 12 }}>{(u.bio || "").slice(0, 90)}...</p>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: sharedSkills.length > 0 ? 10 : 0 }}>
          {(u.skills || []).slice(0, 4).map(s => <span key={s} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: `1px solid ${sharedSkills.includes(s) ? (dark ? "#ffffff35" : "#00000025") : border}`, color: sharedSkills.includes(s) ? text : textMuted }}>{s}</span>)}
        </div>
        {sharedSkills.length > 0 && <div style={{ fontSize: 10, color: textMuted }}>★ {sharedSkills.length} shared skill{sharedSkills.length !== 1 ? "s" : ""}</div>}
      </div>
    );
  };

  const ProfileModal = ({ u, onClose }) => {
    const isFollowing = following.includes(u.id);
    const userProjects = projects.filter(p => p.owner_id === u.id);
    const sharedSkills = (profile?.skills || []).filter(s => (u.skills || []).includes(s));
    const uInitials = initials(u.name, "?");
    const [userPortfolio, setUserPortfolio] = useState([]);
    useEffect(() => {
      supabase.from("portfolio_items").select("*").eq("user_id", u.id).then(({ data }) => setUserPortfolio(data || []));
    }, [u.id]);
    return (
      <div style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.88)" : "rgba(220,220,220,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150, backdropFilter: "blur(10px)", padding: 16 }} onClick={onClose}>
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "32px 28px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", cursor: "pointer" }} onClick={() => { setViewFullProfile(u); onClose(); }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>PROFILE</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            <Avatar initials={uInitials} size={52} dark={dark} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{u.name}</div>
              {u.username && <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>@{u.username}</div>}
              <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{u.role}</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 20 }}>{u.bio}</p>
          <div style={{ marginBottom: 20 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>SKILLS</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {(u.skills || []).map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${sharedSkills.includes(s) ? (dark ? "#ffffff40" : "#00000030") : border}`, borderRadius: 3, color: sharedSkills.includes(s) ? text : textMuted, fontWeight: sharedSkills.includes(s) ? 500 : 400 }}>{s}{sharedSkills.includes(s) ? " ★" : ""}</span>)}
            </div>
            {sharedSkills.length > 0 && <div style={{ fontSize: 11, color: textMuted, marginTop: 8 }}>★ {sharedSkills.length} shared skill{sharedSkills.length !== 1 ? "s" : ""} with you</div>}
          </div>
          {userProjects.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>PROJECTS</div>
              {userProjects.map(p => (
                <div key={p.id} style={{ padding: "10px 0", borderBottom: `1px solid ${border}`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.6"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                  onClick={() => { setActiveProject(p); loadProjectData(p.id); onClose(); setAppScreen("explore"); }}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 5 }}>{p.title}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {(p.skills || []).map(s => <span key={s} style={{ fontSize: 10, padding: "1px 7px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {userPortfolio.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>PORTFOLIO</div>
              {userPortfolio.map(item => (
                <div key={item.id} style={{ padding: "10px 0", borderBottom: `1px solid ${border}` }}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 3 }}>{item.title}</div>
                  {item.description && <div style={{ fontSize: 12, color: textMuted, marginBottom: 6 }}>{item.description}</div>}
                  {item.url && (
                    item.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                      ? <img src={item.url} alt={item.title} style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 6, border: `1px solid ${border}`, marginTop: 4 }} />
                      : <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: text, textDecoration: "underline" }}>{item.url.includes("user-uploads") ? "view file" : item.url}</a>
                  )}
                </div>
              ))}
            </div>
          )}
          {u.id !== authUser?.id && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={e => { e.stopPropagation(); setViewFullProfile(u); onClose(); }} style={{ ...btnG, width: "100%", textAlign: "center", fontSize: 12, padding: "10px" }}>view full profile →</button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={e => { e.stopPropagation(); handleFollow(u.id); }} style={{ flex: 1, background: isFollowing ? bg3 : text, color: isFollowing ? textMuted : bg, border: `1px solid ${isFollowing ? border : text}`, borderRadius: 8, padding: "11px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  {isFollowing ? "following" : "follow"}
                </button>
                <button onClick={e => { e.stopPropagation(); openDm(u); onClose(); }} style={{ flex: 1, background: "none", color: text, border: `1px solid ${border}`, borderRadius: 8, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>message</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderApplicationForm = () => {
    const project = showApplicationForm;
    if (!project) return null;
    const closeForm = () => { setShowApplicationForm(null); setApplicationSuccess(false); };
    const projectSkills = project.skills || [];
    const otherSkills = SKILLS.filter(s => !projectSkills.includes(s));
    const toggleSkill = (s) => setApplicationForm(f => ({ ...f, skills: f.skills.includes(s) ? f.skills.filter(x => x !== s) : [...f.skills, s] }));
    return (
    <div style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(10px)", padding: 16 }} onClick={closeForm}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        {applicationSuccess ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 16, color: text, fontWeight: 500, marginBottom: 10 }}>Application sent!</div>
            <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 28, maxWidth: 320, margin: "0 auto 28px" }}>
              {project.owner_name ? `${project.owner_name} will` : "The project owner will"} reach out via Messages if they want to move forward.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="hb" onClick={() => { closeForm(); setAppScreen("explore"); setActiveProject(null); }} style={{ ...btnP, width: "100%", padding: "12px" }}>browse more projects →</button>
              <button className="hb" onClick={closeForm} style={{ ...btnG, width: "100%" }}>close</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 6 }}>APPLY</div>
                <div style={{ fontSize: 16, color: text, fontWeight: 500 }}>{project.title}</div>
              </div>
              <button onClick={closeForm} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>SKILLS YOU'RE BRINGING</label>
                {projectSkills.length > 0 && (
                  <div style={{ marginBottom: 8, padding: "10px 12px", background: bg2, borderRadius: 6, border: `1px solid ${border}` }}>
                    <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 6 }}>NEEDED FOR THIS PROJECT</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {projectSkills.map(s => { const sel = applicationForm.skills.includes(s); const match = (profile?.skills || []).includes(s); return <button key={s} className="hb" onClick={() => toggleSkill(s)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : match ? text : textMuted, border: `1px solid ${sel ? text : match ? (dark ? "#ffffff45" : "#00000025") : border}`, fontWeight: match ? 500 : 400, transition: "all 0.15s" }}>{s}{match && !sel ? " ★" : ""}</button>; })}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {otherSkills.map(s => { const sel = applicationForm.skills.includes(s); return <button key={s} className="hb" onClick={() => toggleSkill(s)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                </div>
              </div>
              <div><label style={labelStyle}>AVAILABILITY</label>
                <select style={inputStyle} value={applicationForm.availability} onChange={e => setApplicationForm({ ...applicationForm, availability: e.target.value })}>
                  <option value="">Select availability...</option>
                  {AVAILABILITY.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>WHY DO YOU WANT TO JOIN?</label>
                <textarea style={{ ...inputStyle, resize: "none" }} rows={4} placeholder="Tell the project owner why you're a great fit..." value={applicationForm.motivation} onChange={e => setApplicationForm({ ...applicationForm, motivation: e.target.value })} />
              </div>
              <div><label style={labelStyle}>PORTFOLIO / LINK (optional)</label>
                <input style={inputStyle} placeholder="https://..." value={applicationForm.portfolio_url} onChange={e => setApplicationForm({ ...applicationForm, portfolio_url: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="hb" onClick={closeForm} style={btnG}>cancel</button>
              <button className="hb" onClick={handleApply} disabled={!applicationForm.motivation || !applicationForm.availability} style={{ ...btnP, flex: 1, opacity: (!applicationForm.motivation || !applicationForm.availability) ? 0.4 : 1 }}>submit application →</button>
            </div>
          </>
        )}
      </div>
    </div>
    );
  };

  const ReviewModal = ({ project, onClose }) => {
    const projectApps = applications.filter(a => a.project_id === project.id && a.status === "pending");
    const [selected, setSelected] = useState(null);
    return (
      <div style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(10px)", padding: 16 }} onClick={onClose}>
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 6 }}>APPLICANTS</div>
              <div style={{ fontSize: 16, color: text, fontWeight: 500 }}>{project.title}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
          </div>
          {projectApps.length === 0
            ? <div style={{ fontSize: 13, color: textMuted, padding: "24px 0" }}>no applications yet.</div>
            : !selected
              ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {projectApps.map(a => (
                    <div key={a.id} onClick={() => setSelected(a)} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "border 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = text} onMouseLeave={e => e.currentTarget.style.borderColor = border}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <Avatar initials={a.applicant_initials} size={36} dark={dark} />
                        <div>
                          <div style={{ fontSize: 13, color: text, fontWeight: 500 }}>{a.applicant_name}</div>
                          <div style={{ fontSize: 11, color: textMuted }}>{a.applicant_role} · {a.availability}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: textMuted }}>view →</div>
                    </div>
                  ))}
                </div>
              : <div>
                  <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 20 }}>← all applicants</button>
                  <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                    <Avatar initials={selected.applicant_initials} size={48} dark={dark} />
                    <div>
                      <div style={{ fontSize: 18, color: text }}>{selected.applicant_name}</div>
                      <div style={{ fontSize: 12, color: textMuted }}>{selected.applicant_role}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                    {selected.availability && <div><div style={labelStyle}>AVAILABILITY</div><div style={{ fontSize: 13, color: text }}>{selected.availability}</div></div>}
                    {selected.motivation && <div><div style={labelStyle}>WHY THEY WANT TO JOIN</div><div style={{ fontSize: 13, color: textMuted, lineHeight: 1.7 }}>{selected.motivation}</div></div>}
                    {selected.applicant_bio && <div><div style={labelStyle}>BIO</div><div style={{ fontSize: 13, color: textMuted, lineHeight: 1.7 }}>{selected.applicant_bio}</div></div>}
                    {selected.portfolio_url && <div><div style={labelStyle}>PORTFOLIO</div><a href={selected.portfolio_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: text }}>{selected.portfolio_url}</a></div>}
                    {(selected.applicant_skills || []).length > 0 && <div><div style={labelStyle}>SKILLS</div><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{selected.applicant_skills.map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}</div></div>}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="hb" onClick={async () => {
                      const { error } = await supabase.from("applications").update({ status: "declined" }).eq("id", selected.id);
                      if (error) { showToast("Failed to decline. Try again."); return; }
                      setApplications(applications.filter(a => a.id !== selected.id));
                      setSelected(null); showToast("Declined.");
                    }} style={{ ...btnG, flex: 1 }}>decline</button>
                    <button className="hb" onClick={async () => {
                      const { error } = await supabase.from("applications").update({ status: "accepted" }).eq("id", selected.id);
                      if (error) { showToast("Failed to accept. Try again."); return; }
                      setApplications(applications.filter(a => a.id !== selected.id));
                      const u = users.find(u => u.id === selected.applicant_id);
                      if (u) openDm(u);
                      setSelected(null); onClose(); showToast(`${selected.applicant_name} accepted!`);
                    }} style={{ ...btnP, flex: 1 }}>accept + message →</button>
                  </div>
                </div>
          }
        </div>
      </div>
    );
  };

  // ── MESSAGE DELETE + EDIT ──
  const handleDeleteDm = async (msgId) => {
    await supabase.from("dm_messages").delete().eq("id", msgId);
    setDmMessages(prev => ({ ...prev, [activeDmThread.id]: (prev[activeDmThread.id] || []).filter(m => m.id !== msgId) }));
  };

  const handleDeleteThread = async (threadId) => {
    await supabase.from("dm_messages").delete().eq("thread_id", threadId);
    await supabase.from("dm_threads").delete().eq("id", threadId);
    setDmMessages(prev => { const n = { ...prev }; delete n[threadId]; return n; });
    setDmThreads(prev => prev.filter(t => t.id !== threadId));
    if (activeDmThread?.id === threadId) setActiveDmThread(null);
    showToast("Conversation deleted.");
  };

  const handleEditDm = async (msgId, newText) => {
    const { data } = await supabase.from("dm_messages").update({ text: newText, edited: true }).eq("id", msgId).select().single();
    if (data) {
      setDmMessages(prev => ({ ...prev, [activeDmThread.id]: (prev[activeDmThread.id] || []).map(m => m.id === msgId ? data : m) }));
      setEditingMessage(null);
    }
  };

  const handleDeleteProjectMessage = async (msgId) => {
    await supabase.from("messages").delete().eq("id", msgId);
    setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  const handleEditProjectMessage = async (msgId, newText) => {
    const { data } = await supabase.from("messages").update({ text: newText, edited: true }).eq("id", msgId).select().single();
    if (data) { setMessages(prev => prev.map(m => m.id === msgId ? data : m)); setEditingMessage(null); }
  };

  // ── READ RECEIPTS ──
  const markDmRead = async (threadId) => {
    const msgs = dmMessages[threadId] || [];
    const unread = msgs.filter(m => m.sender_id !== authUser?.id && !(m.read_by || []).includes(authUser?.id));
    if (unread.length === 0) return;
    await Promise.all(unread.map(m =>
      supabase.from("dm_messages").update({ read_by: [...(m.read_by || []), authUser.id] }).eq("id", m.id)
    ));
    setDmMessages(prev => ({
      ...prev,
      [threadId]: (prev[threadId] || []).map(m =>
        m.sender_id !== authUser?.id ? { ...m, read_by: [...(m.read_by || []), authUser.id] } : m
      )
    }));
  };

  // ── MENTION DETECTION ──
  const detectAndNotifyMentions = async (text, projectId) => {
    const mentioned = text.match(/@(\w[\w\s]*)/g);
    if (!mentioned) return;
    for (const mention of mentioned) {
      const name = mention.slice(1).trim();
      const mentionedUser = users.find(u => u.name.toLowerCase() === name.toLowerCase());
      if (mentionedUser && mentionedUser.id !== authUser?.id) {
        await supabase.from("mention_notifications").insert({
          user_id: mentionedUser.id, from_name: profile.name,
          from_initials: myInitials, context: text.slice(0, 80),
          project_id: projectId, read: false,
        });
      }
    }
  };
  const saveBanner = async (pixels) => {
    const pixelStr = JSON.stringify(pixels);
    await supabase.from("profiles").update({ banner_pixels: pixelStr }).eq("id", authUser.id);
    setProfile(prev => ({ ...prev, banner_pixels: pixelStr }));
    setBannerPixels(pixels);
    showToast("Banner saved.");
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    const proj = myProjects.find(p => p.id === newPostProject);
    const insertPayload = {
      user_id: authUser.id,
      user_name: profile.name,
      user_initials: myInitials,
      user_role: profile.role || "",
      content: newPostContent,
      project_id: proj?.id || null,
      project_title: proj?.title || null,
      media_url: newPostMediaUrl || null,
      media_type: newPostMediaType || null,
    };
    let { data, error } = await supabase.from("posts").insert(insertPayload).select().single();
    // If media_type column doesn't exist yet, retry without it
    if (error && error.message?.includes("media_type")) {
      delete insertPayload.media_type;
      ({ data, error } = await supabase.from("posts").insert(insertPayload).select().single());
    }
    if (error) { showToast(`Post failed: ${error.message}`); return; }
    if (data) {
      // Attach media_type locally even if not in DB yet
      setPosts([{ ...data, media_type: newPostMediaType || null }, ...posts]);
      setNewPostContent("");
      setNewPostProject("");
      setNewPostMediaUrl("");
      setNewPostMediaType("");
      showToast("Posted.");
    }
  };

  const handleAssignRole = async (projectId, userId, role) => {
    await supabase.from("project_members").upsert({
      project_id: projectId, user_id: userId, role,
    }, { onConflict: "project_id,user_id" });
    showToast(`Role updated to ${role}.`);
  };

  const handleLike = async (postId) => {
    const myLikes = postLikes.myLikes || [];
    if (myLikes.includes(postId)) {
      await supabase.from("likes").delete().eq("user_id", authUser.id).eq("post_id", postId);
      await supabase.rpc("decrement_like", { post_id: postId });
      setPostLikes({ myLikes: myLikes.filter(id => id !== postId) });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, like_count: Math.max(0, (p.like_count || 0) - 1) } : p));
    } else {
      await supabase.from("likes").insert({ user_id: authUser.id, post_id: postId });
      await supabase.rpc("increment_like", { post_id: postId });
      setPostLikes({ myLikes: [...myLikes, postId] });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, like_count: (p.like_count || 0) + 1 } : p));
    }
  };

  const handleComment = async (postId) => {
    const content = newCommentText[postId];
    if (!content?.trim()) return;
    const { data } = await supabase.from("comments").insert({
      post_id: postId, user_id: authUser.id,
      user_name: profile.name, user_initials: myInitials, content,
    }).select().single();
    if (data) {
      setPostComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), data] }));
      setNewCommentText(prev => ({ ...prev, [postId]: "" }));
    }
  };

  const loadComments = async (postId) => {
    if (postComments[postId]) return;
    const { data } = await supabase.from("comments").select("*").eq("post_id", postId).order("created_at");
    setPostComments(prev => ({ ...prev, [postId]: data || [] }));
  };

  const handleDeletePost = async (postId) => {
    const post = posts.find(p => p.id === postId);
    if (post?.media_url && post.media_url.includes("user-uploads")) {
      try {
        const pathMatch = post.media_url.match(/user-uploads\/(.+)$/);
        if (pathMatch) await supabase.storage.from("user-uploads").remove([pathMatch[1]]);
      } catch (e) { console.warn("Storage cleanup:", e); }
    }
    await supabase.from("posts").delete().eq("id", postId);
    setPosts(posts.filter(p => p.id !== postId));
    showToast("Post deleted.");
  };

  const renderNetwork = () => {
    const followingFeed = posts.filter(p => following.includes(p.user_id));
    const allFeed = posts;
    const feedToShow = networkTab === "feed-following" ? followingFeed : allFeed;
    const postCtx = {
      postLikes, expandedComments, postComments, authUser, users,
      handleDeletePost, dark, border, text, textMuted, bg, bg2, btnP, inputStyle,
      setViewingProfile, handleLike, setExpandedComments, loadComments,
      myInitials, setPostComments, profile, supabase,
    };

    return (
      <div className="pad fu" style={{ width: "100%", padding: "48px 32px" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 10 }}>NETWORK</div>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 400, letterSpacing: "-1.5px", color: text, marginBottom: 8 }}>Your network.</h2>
          <p style={{ fontSize: 13, color: textMuted }}>See what people are building. Share what you're working on.</p>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: `1px solid ${border}`, marginBottom: 28, display: "flex" }}>
          {[
            { id: "feed", label: "feed" },
            { id: "feed-following", label: "following", count: followingFeed.length },
            { id: "people", label: "people" },
          ].map(({ id, label, count }) => (
            <button key={id} onClick={() => setNetworkTab(id)} style={{ background: "none", border: "none", borderBottom: networkTab === id ? `1px solid ${text}` : "1px solid transparent", color: networkTab === id ? text : textMuted, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginRight: 24, transition: "all 0.15s", display: "inline-flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
              {label}
              {count > 0 && <span style={{ fontSize: 10, background: bg3, borderRadius: 10, padding: "1px 6px", color: textMuted }}>{count}</span>}
            </button>
          ))}
        </div>

        {/* Feed tabs */}
        {(networkTab === "feed" || networkTab === "feed-following") && (
          <div>
            {/* Compose */}
            <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 14, padding: "18px", marginBottom: 32 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Avatar initials={myInitials} size={40} dark={dark} />
                <div style={{ flex: 1 }}>
                  <textarea
                    placeholder="what are you building? share an update..."
                    value={newPostContent}
                    onChange={e => setNewPostContent(e.target.value)}
                    rows={newPostContent ? 4 : 2}
                    style={{ ...inputStyle, resize: "none", fontSize: 13, padding: "10px 14px", background: bg3, borderColor: "transparent", lineHeight: 1.65, transition: "height 0.15s" }}
                  />
                  {newPostContent.trim() && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                      {/* Media preview */}
                      {newPostMediaUrl && (
                        <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
                          {newPostMediaType === "audio" ? (
                            <div style={{ fontSize: 11, color: text, padding: "8px 12px", background: bg3, borderRadius: 8, display: "flex", gap: 6, alignItems: "center" }}>
                              ♪ {newPostMediaUrl.split("/").pop().split("?")[0]}
                            </div>
                          ) : newPostMediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                            <img src={newPostMediaUrl} alt="" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, border: `1px solid ${border}` }} />
                          ) : (
                            <div style={{ fontSize: 11, color: textMuted, padding: "6px 10px", background: bg3, borderRadius: 6 }}>file: {newPostMediaUrl.split("/").pop()}</div>
                          )}
                          <button onClick={() => { setNewPostMediaUrl(""); setNewPostMediaType(""); }} style={{ position: "absolute", top: 4, right: 4, background: bg, border: `1px solid ${border}`, borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", color: text, fontFamily: "inherit" }}>✕</button>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {/* Image/video upload */}
                        <label style={{ cursor: "pointer", flexShrink: 0 }}>
                          <div style={{ ...btnG, padding: "6px 12px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}>↑ photo/video</div>
                          <input type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            showToast("Uploading...");
                            const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
                            const path = `posts/${authUser.id}/${Date.now()}-${safeName}`;
                            const { error } = await supabase.storage.from("user-uploads").upload(path, file);
                            if (error) { showToast(`Upload failed: ${error.message}`); return; }
                            const { data: { publicUrl } } = supabase.storage.from("user-uploads").getPublicUrl(path);
                            setNewPostMediaUrl(publicUrl);
                            setNewPostMediaType(file.type.startsWith("video") ? "video" : "image");
                            showToast("Ready.");
                          }} />
                        </label>
                        {/* Audio upload */}
                        <label style={{ cursor: "pointer", flexShrink: 0 }}>
                          <div style={{ ...btnG, padding: "6px 12px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}>♪ audio</div>
                          <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac" style={{ display: "none" }} onChange={async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            showToast("Uploading audio...");
                            const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
                            const path = `posts/${authUser.id}/${Date.now()}-${safeName}`;
                            const { data: uploadData, error } = await supabase.storage.from("user-uploads").upload(path, file);
                            if (error) { showToast(`Upload failed: ${error.message}`); return; }
                            const { data: { publicUrl } } = supabase.storage.from("user-uploads").getPublicUrl(path);
                            setNewPostMediaUrl(publicUrl);
                            setNewPostMediaType("audio");
                            showToast("Audio ready.");
                          }} />
                        </label>
                        <input placeholder="or paste a YouTube URL..." value={newPostMediaUrl.includes("youtube") || newPostMediaUrl.includes("youtu.be") ? newPostMediaUrl : ""} onChange={e => { setNewPostMediaUrl(e.target.value); setNewPostMediaType("youtube"); }} style={{ ...inputStyle, fontSize: 11, padding: "6px 10px", flex: 1 }} />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <select value={newPostProject} onChange={e => setNewPostProject(e.target.value)} style={{ ...inputStyle, fontSize: 11, padding: "6px 10px", flex: 1 }}>
                          <option value="">tag a project (optional)</option>
                          {myProjects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                        <button className="hb" onClick={handleCreatePost} style={{ ...btnP, padding: "7px 18px", fontSize: 12, flexShrink: 0 }}>post</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Feed region filter */}
            <div style={{ marginBottom: 16, display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: textMuted, letterSpacing: "1px" }}>REGION</span>
              {["local","city","national","international"].map(r => { const sel = regionFilter === r; return <button key={r} className="hb" onClick={() => setRegionFilter(sel ? null : r)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{r}</button>; })}
            </div>

            {/* Feed */}
            {(() => {
              const visibleFeed = feedToShow.filter(post => matchesRegion((users.find(u => u.id === post.user_id)?.location), regionFilter, profile?.location));
              return visibleFeed.length === 0
                ? <div style={{ fontSize: 13, color: textMuted, padding: "24px 0" }}>
                    {regionFilter ? `no posts from ${regionFilter} builders yet.` : networkTab === "feed-following"
                      ? <>nothing yet from people you follow. <button className="hb" onClick={() => setNetworkTab("people")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>find people →</button></>
                      : "no posts yet. be the first."}
                  </div>
                : visibleFeed.map(post => <PostCard key={post.id} post={post} ctx={postCtx} />);
            })()}
          </div>
        )}

        {/* People tab */}
        {networkTab === "people" && (
          <div>
            <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {["Design","Engineering","Marketing","Music","Finance","AI/ML","Writing","Video","Product"].map(s => { const sel = networkFilter === s; return <button key={s} className="hb" onClick={() => setNetworkFilter(sel ? null : s)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                {networkFilter && <button className="hb" onClick={() => setNetworkFilter(null)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: "none", color: textMuted, border: `1px solid ${border}` }}>clear</button>}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: textMuted, letterSpacing: "1px" }}>REGION</span>
                {["local","city","national","international"].map(r => { const sel = regionFilter === r; return <button key={r} className="hb" onClick={() => setRegionFilter(sel ? null : r)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{r}</button>; })}
              </div>
            </div>
            <div className="network-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {users.filter(u => {
                if (u.id === authUser?.id) return false;
                if (networkFilter && !(u.skills || []).includes(networkFilter)) return false;
                if (regionFilter && u.location) {
                  const loc = (u.location || "").toLowerCase();
                  const myLoc = (profile?.location || "").toLowerCase();
                  const myCity = myLoc.split(",")[0].trim();
                  if (regionFilter === "local" || regionFilter === "city") return loc.includes(myCity) && myCity.length > 0;
                  if (regionFilter === "national") return loc.includes("us") || loc.includes("usa") || loc.includes("united states") || (myLoc && loc.split(",").pop().trim() === myLoc.split(",").pop().trim());
                  if (regionFilter === "international") return myLoc && !loc.includes(myLoc.split(",").pop().trim().toLowerCase());
                }
                return true;
              }).map(u => <UserCard key={u.id} u={u} />)}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── MAIN RETURN ──

  // ── LOADING ──
  if (authLoading) return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } html, body { width: 100%; min-height: 100vh; background: #0a0a0a; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, color: "#fff", letterSpacing: "-0.5px", marginBottom: 20 }}>[CoLab]</div>
        <div style={{ width: 20, height: 20, border: "2px solid #333", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
      </div>
    </div>
  );

  // ── LANDING ──
  if (screen === "landing") return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", overflowX: "hidden" }}>
      <style>{CSS}</style>
      <nav style={{ width: "100%", borderBottom: `1px solid ${border}`, position: "sticky", top: 0, background: bg, backdropFilter: "blur(12px)", zIndex: 50 }}>
        <div className="pad" style={{ padding: "0 40px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.5px", color: text }}>[CoLab]</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="hb" onClick={() => setDark(!dark)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, color: textMuted, fontFamily: "inherit" }}>{dark ? "☀" : "☾"}</button>
            <button className="hb" onClick={() => { setAuthMode("login"); setScreen("auth"); }} style={{ ...btnG, padding: "7px 16px", fontSize: 12 }}>Log in</button>
            <button className="hb" onClick={() => { setAuthMode("signup"); setScreen("auth"); }} style={{ ...btnP, padding: "7px 16px", fontSize: 12 }}>Get started</button>
          </div>
        </div>
      </nav>
      <div className="pad fu" style={{ padding: "80px 40px 64px", borderBottom: `1px solid ${border}` }}>
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "3px", marginBottom: 20 }}>THE COLLABORATIVE WORKSPACE</div>
        <h1 className="hero-h1" style={{ fontSize: "clamp(52px, 9vw, 96px)", fontWeight: 400, lineHeight: 0.92, letterSpacing: "-4px", marginBottom: 28, color: text }}>
          Don't just<br />connect.<br /><span style={{ color: textMuted }}>Build together.</span>
        </h1>
        <p style={{ fontSize: 14, color: textMuted, maxWidth: 500, lineHeight: 1.85, marginBottom: 36 }}>CoLab is where founders, creatives, engineers, and makers find each other and actually get work done — in one place.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="hb" onClick={() => { setAuthMode("signup"); setScreen("auth"); }} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "13px 28px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Start building →</button>
          <button className="hb" onClick={() => { setAuthMode("login"); setScreen("auth"); }} style={{ background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 8, padding: "13px 28px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Log in</button>
        </div>
      </div>
      <div className="stat-grid" style={{ display: "flex", width: "100%", borderBottom: `1px solid ${border}` }}>
        {[[liveStats.builders,"builders"],[liveStats.projects,"active projects"],[skillCategoryCount,"skill categories"],["100%","free to start"]].map(([v,l],i) => (
          <div key={i} className="stat-item" style={{ flex: 1, borderRight: i < 3 ? `1px solid ${border}` : "none", padding: "24px 40px", textAlign: "center" }}>
            <div style={{ fontSize: 28, color: text, letterSpacing: "-1px" }}>{v}</div>
            <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
      <div className="pad" style={{ padding: "72px 40px", borderBottom: `1px solid ${border}` }}>
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 36 }}>HOW IT WORKS</div>
        <div className="how-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
          {[["01","Build your profile","List your skills and what you're looking to work on."],["02","Find your match","Post a project or browse and apply to something that excites you."],["03","Build together","Tasks, updates, messaging, and plugin integrations — all in one place."]].map(([n,t,d],i) => (
            <div key={i} className="how-card card-h" style={{ padding: "32px 36px", background: bg2, border: `1px solid ${border}`, borderRight: i < 2 ? "none" : `1px solid ${border}`, transition: "border 0.2s" }}>
              <div style={{ fontSize: 11, color: textMuted, marginBottom: 14 }}>{n}</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: text, marginBottom: 8 }}>{t}</div>
              <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.75 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="pad" style={{ padding: "80px 40px", background: bg2, textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(30px, 5vw, 54px)", fontWeight: 400, letterSpacing: "-2px", marginBottom: 14, color: text }}>Ready to build?</h2>
        <p style={{ fontSize: 13, color: textMuted, marginBottom: 28 }}>Join hundreds of builders already collaborating on CoLab.</p>
        <button className="hb" onClick={() => { setAuthMode("signup"); setScreen("auth"); }} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "14px 36px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Create your profile →</button>
      </div>
      <div className="pad" style={{ padding: "18px 40px", borderTop: `1px solid ${border}`, background: bg, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, color: textMuted }}>[CoLab] — build together.</div>
        <div style={{ fontSize: 11, color: textMuted }}>© 2026</div>
      </div>
    </div>
  );

  // ── AUTH ──
  if (screen === "auth") return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <style>{CSS}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <button onClick={() => setScreen("landing")} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 32 }}>← back</button>
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 14 }}>{authMode === "signup" ? "CREATE ACCOUNT" : authMode === "reset" ? "RESET PASSWORD" : "WELCOME BACK"}</div>
        <h2 style={{ fontSize: 26, fontWeight: 400, letterSpacing: "-1px", marginBottom: 28, color: text }}>
          {authMode === "signup" ? "Join CoLab." : authMode === "reset" ? "Reset your password." : "Log in."}
        </h2>
        {authMode === "reset" ? (
          resetSent ? (
            <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.7 }}>
              Check your email — we sent a reset link to <strong style={{ color: text }}>{authEmail}</strong>.
              <div style={{ marginTop: 20 }}>
                <button onClick={() => { setAuthMode("login"); setResetSent(false); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>← back to login</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>EMAIL</label>
                <input style={inputStyle} type="email" placeholder="you@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
              </div>
              {authError && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 14 }}>{authError}</div>}
              <button className="hb" onClick={handlePasswordReset} style={{ ...btnP, width: "100%", padding: "13px", marginBottom: 16 }}>Send reset link →</button>
              <button onClick={() => setAuthMode("login")} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>← back to login</button>
            </div>
          )
        ) : (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <div><label style={labelStyle}>EMAIL</label><input style={inputStyle} type="email" placeholder="you@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && (authMode === "signup" ? handleSignUp() : handleLogin())} /></div>
              <div><label style={labelStyle}>PASSWORD</label><input style={inputStyle} type="password" placeholder="••••••••" value={authPassword} onChange={e => setAuthPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && (authMode === "signup" ? handleSignUp() : handleLogin())} /></div>
            </div>
            {authError && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 14 }}>{authError}</div>}
            <button className="hb" onClick={authMode === "signup" ? handleSignUp : handleLogin} style={{ ...btnP, width: "100%", padding: "13px", marginBottom: 16 }}>
              {authMode === "signup" ? "Create account →" : "Log in →"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: textMuted }}>
                {authMode === "signup" ? "Already have an account?" : "Don't have an account?"}
                <button onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline", marginLeft: 6 }}>
                  {authMode === "signup" ? "Log in" : "Sign up"}
                </button>
              </div>
              {authMode === "login" && <button onClick={() => setAuthMode("reset")} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>forgot password?</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── ONBOARDING ──
  if (screen === "onboard") {
    const steps = [
      { label: "what's your name?", field: "name", placeholder: "Your display name", type: "input" },
      { label: "pick a username.", field: "username", placeholder: "@handle — unique, no spaces", type: "username" },
      { label: "what do you do?", field: "role", placeholder: "Founder, Designer, Engineer, Musician...", type: "input" },
      { label: "what's your story?", field: "bio", placeholder: "What are you about? What are you trying to build?", type: "textarea" },
      { label: "what are your skills?", field: "skills", type: "skills" },
    ];
    const step = steps[onboardStep];
    const isLast = onboardStep === steps.length - 1;
    const canNext = step.field === "skills" ? onboardData.skills.length > 0 : step.type === "username" ? (onboardData.username || "").length >= 3 : (onboardData[step.field] || "").trim().length > 0;
    return (
      <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
        <style>{CSS}</style>
        <div style={{ width: "100%", maxWidth: 480 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 40, justifyContent: "center" }}>
            {steps.map((_, i) => <div key={i} style={{ width: i === onboardStep ? 20 : 6, height: 6, borderRadius: 3, background: i <= onboardStep ? text : textSub, transition: "all 0.3s" }} />)}
          </div>
          <div className="fu" key={onboardStep}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 14 }}>STEP {onboardStep + 1} OF {steps.length}</div>
            <h2 style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 400, letterSpacing: "-1px", marginBottom: 26, color: text }}>{step.label}</h2>
            {step.type === "input" && <input autoFocus style={{ background: "none", border: "none", borderBottom: `1px solid ${border}`, padding: "10px 0", color: text, fontSize: "clamp(16px, 4vw, 18px)", width: "100%", fontFamily: "inherit", outline: "none" }} placeholder={step.placeholder} value={onboardData[step.field] || ""} onChange={e => setOnboardData({ ...onboardData, [step.field]: e.target.value })} onKeyDown={e => e.key === "Enter" && canNext && (isLast ? handleFinishOnboard() : setOnboardStep(s => s + 1))} />}
            {step.type === "username" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${border}`, marginBottom: 8 }}>
                  <span style={{ fontSize: "clamp(16px, 4vw, 18px)", color: textMuted, paddingBottom: 10, paddingTop: 10 }}>@</span>
                  <input autoFocus style={{ background: "none", border: "none", padding: "10px 0 10px 4px", color: text, fontSize: "clamp(16px, 4vw, 18px)", flex: 1, fontFamily: "inherit", outline: "none" }} placeholder="yourhandle" value={onboardData.username || ""} onChange={e => setOnboardData({ ...onboardData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} onKeyDown={e => e.key === "Enter" && canNext && (isLast ? handleFinishOnboard() : setOnboardStep(s => s + 1))} />
                </div>
                <div style={{ fontSize: 11, color: textMuted }}>lowercase letters, numbers, underscores only</div>
              </div>
            )}
            {step.type === "textarea" && <textarea autoFocus style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "12px", color: text, fontSize: 13, width: "100%", fontFamily: "inherit", outline: "none", resize: "none", lineHeight: 1.7 }} rows={4} placeholder={step.placeholder} value={onboardData[step.field] || ""} onChange={e => setOnboardData({ ...onboardData, [step.field]: e.target.value })} />}
            {step.type === "skills" && (
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {SKILLS.map(s => { const sel = onboardData.skills.includes(s); return <button key={s} className="hb" onClick={() => setOnboardData({ ...onboardData, skills: sel ? onboardData.skills.filter(x => x !== s) : [...onboardData.skills, s] })} style={{ padding: "6px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                </div>
                <div style={{ fontSize: 11, color: onboardData.skills.length === 0 ? text : textMuted, marginTop: 4 }}>
                  {onboardData.skills.length === 0 ? "select at least one to continue" : `${onboardData.skills.length} selected`}
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 30 }}>
              <button className="hb" onClick={() => onboardStep === 0 ? setScreen("auth") : setOnboardStep(s => s - 1)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>{onboardStep === 0 ? "← back" : "← previous"}</button>
              <button className="hb" onClick={() => isLast ? handleFinishOnboard() : setOnboardStep(s => s + 1)} disabled={!canNext} style={{ background: canNext ? text : textSub, color: bg, border: "none", borderRadius: 8, padding: "11px 24px", fontSize: 12, fontWeight: 500, cursor: canNext ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.2s" }}>
                {isLast ? "Enter CoLab →" : "continue →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN APP ──
  const navItems = [
    { id: "explore", label: "explore" },
    { id: "network", label: "network" },
    { id: "workspace", label: "work" },
    { id: "messages", label: "msgs", badge: unreadDms },
    { id: "profile", label: profile?.username ? `@${profile.username}` : profile?.name?.split(" ")[0]?.toLowerCase() || "me" },
  ];

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", transition: "background-color 0.3s ease, color 0.3s ease", overflowX: "hidden" }}>
      <style>{CSS}</style>

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, width: "100%", background: dark ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${border}`, padding: "0 12px", display: "flex", alignItems: "center", gap: 8, height: 50 }}>
        <button onClick={() => { setAppScreen("explore"); setActiveProject(null); setViewingProfile(null); setViewFullProfile(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500, color: text, letterSpacing: "-0.5px", flexShrink: 0 }}>[CoLab]</button>

        {/* Global search — full bar on desktop, expandable on mobile */}
        <div style={{ position: "relative", flexShrink: 0 }} className="search-wrap">
          {/* Desktop: full input */}
          <div className="search-desktop" style={{ width: 180 }}>
            <input
              placeholder="search people..."
              value={globalSearch}
              onChange={e => { setGlobalSearch(e.target.value); setShowGlobalSearch(e.target.value.length > 0); }}
              onBlur={() => setTimeout(() => setShowGlobalSearch(false), 150)}
              style={{ ...inputStyle, fontSize: 11, padding: "5px 10px", borderRadius: 6 }}
            />
          </div>
          {/* Mobile: tap to expand */}
          <div className="search-mobile" style={{ display: "none" }}>
            <button onClick={() => { setShowGlobalSearch(!showGlobalSearch); if (!showGlobalSearch) setTimeout(() => document.getElementById("mobile-search")?.focus(), 50); }} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: textMuted, fontFamily: "inherit" }}>
              srch
            </button>
            {showGlobalSearch && (
              <div style={{ position: "fixed", top: 58, left: 12, right: 12, background: bg, border: `1px solid ${border}`, borderRadius: 10, zIndex: 300, padding: "10px", boxShadow: dark ? "0 8px 24px rgba(0,0,0,0.8)" : "0 8px 24px rgba(0,0,0,0.15)" }}>
                <input
                  id="mobile-search"
                  placeholder="search people..."
                  value={globalSearch}
                  onChange={e => setGlobalSearch(e.target.value)}
                  autoFocus
                  style={{ ...inputStyle, fontSize: 13, marginBottom: globalSearch.length > 0 ? 8 : 0 }}
                />
                {globalSearch.length > 0 && users.filter(u => u.id !== authUser?.id && u.name?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 3).map(u => (
                  <button key={u.id} onClick={() => { setViewFullProfile(u); setGlobalSearch(""); setShowGlobalSearch(false); }} style={{ width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "center", textAlign: "left", borderTop: `1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <Avatar initials={initials(u.name)} size={28} dark={dark} />
                    <div>
                      <div style={{ fontSize: 13, color: text }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>{u.role}</div>
                    </div>
                  </button>
                ))}
                {globalSearch.length > 0 && projects.filter(p => p.title?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 2).map(p => (
                  <button key={p.id} onClick={() => { setActiveProject(p); loadProjectData(p.id); setAppScreen("workspace"); setProjectTab("tasks"); setGlobalSearch(""); setShowGlobalSearch(false); }} style={{ width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "center", textAlign: "left", borderTop: `1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <span style={{ fontSize: 16 }}>◈</span>
                    <div>
                      <div style={{ fontSize: 13, color: text }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>project · {p.category}</div>
                    </div>
                  </button>
                ))}
                {globalSearch.length > 0 && posts.filter(p => p.content?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 2).map(p => {
                  const postUser = users.find(u => u.id === p.user_id);
                  return (
                    <button key={p.id} onClick={() => { setAppScreen("network"); setNetworkTab("feed"); setGlobalSearch(""); setShowGlobalSearch(false); }} style={{ width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", borderTop: `1px solid ${border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontSize: 16 }}>◎</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: textMuted, marginBottom: 2 }}>{postUser?.name}</div>
                        <div style={{ fontSize: 13, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.content.slice(0, 60)}</div>
                      </div>
                    </button>
                  );
                })}
                {globalSearch.length > 0 &&
                  users.filter(u => u.id !== authUser?.id && u.name?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 &&
                  projects.filter(p => p.title?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 &&
                  posts.filter(p => p.content?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 && (
                  <div style={{ fontSize: 12, color: textMuted, padding: "8px 4px" }}>no results.</div>
                )}
              </div>
            )}
          </div>
          {/* Desktop dropdown results */}
          {showGlobalSearch && globalSearch.length > 0 && (
            <div className="search-desktop" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, width: 260, background: bg, border: `1px solid ${border}`, borderRadius: 8, zIndex: 300, overflow: "hidden", boxShadow: dark ? "0 8px 24px rgba(0,0,0,0.6)" : "0 8px 24px rgba(0,0,0,0.1)" }}>
              {/* People */}
              {users.filter(u => u.id !== authUser?.id && u.name?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 3).map(u => (
                <button key={u.id} onClick={() => { setViewFullProfile(u); setGlobalSearch(""); setShowGlobalSearch(false); }}
                  style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 8, alignItems: "center", textAlign: "left" }}
                  onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <Avatar initials={initials(u.name)} size={22} dark={dark} />
                  <div>
                    <div style={{ fontSize: 11, color: text }}>{u.name}</div>
                    <div style={{ fontSize: 10, color: textMuted }}>{u.role}</div>
                  </div>
                </button>
              ))}
              {/* Projects */}
              {projects.filter(p => p.title?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 2).map(p => (
                <button key={p.id} onClick={() => { setActiveProject(p); loadProjectData(p.id); setAppScreen("workspace"); setProjectTab("tasks"); setGlobalSearch(""); setShowGlobalSearch(false); }}
                  style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 8, alignItems: "center", textAlign: "left", borderTop: `1px solid ${border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <span style={{ fontSize: 14 }}>◈</span>
                  <div>
                    <div style={{ fontSize: 11, color: text }}>{p.title}</div>
                    <div style={{ fontSize: 10, color: textMuted }}>project · {p.category}</div>
                  </div>
                </button>
              ))}
              {/* Posts */}
              {posts.filter(p => p.content?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 2).map(p => {
                const postUser = users.find(u => u.id === p.user_id);
                return (
                  <button key={p.id} onClick={() => { setAppScreen("network"); setNetworkTab("feed"); setGlobalSearch(""); setShowGlobalSearch(false); }}
                    style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 8, alignItems: "flex-start", textAlign: "left", borderTop: `1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <span style={{ fontSize: 14 }}>◎</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: textMuted, marginBottom: 2 }}>{postUser?.name}</div>
                      <div style={{ fontSize: 11, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.content.slice(0, 60)}</div>
                    </div>
                  </button>
                );
              })}
              {users.filter(u => u.id !== authUser?.id && u.name?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 &&
               projects.filter(p => p.title?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 &&
               posts.filter(p => p.content?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 && (
                <div style={{ padding: "12px 14px", fontSize: 12, color: textMuted }}>no results.</div>
              )}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Nav items */}
        <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
          {navItems.map(({ id, label, badge }) => (
            <button key={id} onClick={() => { setAppScreen(id); setActiveProject(null); setViewingProfile(null); setViewFullProfile(null); setShowNotifications(false); }}
              style={{ position: "relative", background: appScreen === id && !activeProject && !showNotifications ? bg3 : "none", color: appScreen === id && !activeProject && !showNotifications ? text : textMuted, border: "none", borderRadius: 6, padding: "5px 5px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>
              {label}
              {badge > 0 && <span style={{ position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: "50%", background: text, border: `1px solid ${bg}` }} />}
            </button>
          ))}
          <button onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) setNotifications(prev => prev.map(n => ({ ...n, read: true }))); }}
            style={{ position: "relative", background: showNotifications ? bg3 : "none", border: "none", borderRadius: 6, padding: "5px 4px", cursor: "pointer", color: textMuted, fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>
            ◎{unreadNotifs > 0 && <span style={{ position: "absolute", top: 3, right: 3, width: 5, height: 5, borderRadius: "50%", background: text, border: `1px solid ${bg}` }} />}
          </button>
          <button onClick={() => setDark(!dark)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "3px 5px", cursor: "pointer", fontSize: 10, color: textMuted, fontFamily: "inherit", flexShrink: 0, marginLeft: 2 }}>{dark ? "☀" : "☾"}</button>
          <button onClick={() => setShowSettings(true)}
            style={{ background: "none", border: "none", borderRadius: 6, padding: "5px 4px", cursor: "pointer", color: textMuted, fontSize: 12, fontFamily: "inherit" }}>
            ⚙
          </button>
        </div>
      </nav>

      {/* NOTIFICATIONS */}
      {showNotifications && (
        <>
          <div onClick={() => setShowNotifications(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
          <div className="notif-w" style={{ position: "fixed", top: 58, right: 16, width: 340, background: bg, border: `1px solid ${border}`, borderRadius: 12, zIndex: 200, animation: "slideIn 0.2s ease", boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.6)" : "0 8px 32px rgba(0,0,0,0.1)", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${border}`, fontSize: 11, color: textMuted, letterSpacing: "1px", display: "flex", justifyContent: "space-between" }}>
              NOTIFICATIONS
              {notifications.length > 0 && <button className="hb" onClick={() => setNotifications([])} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 10 }}>clear all</button>}
            </div>
            {notifications.length === 0 && mentionNotifications.length === 0 ? <div style={{ padding: "24px 16px", fontSize: 12, color: textMuted }}>no notifications.</div>
              : <>
                {mentionNotifications.map(n => (
                  <div key={n.id} style={{ padding: "14px 16px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, color: text, marginBottom: 2 }}>{n.from_name} mentioned you</div>
                      <div style={{ fontSize: 11, color: textMuted, fontStyle: "italic" }}>"{n.context}..."</div>
                    </div>
                    <button className="hb" onClick={async () => { await supabase.from("mention_notifications").update({ read: true }).eq("id", n.id); setMentionNotifications(prev => prev.filter(x => x.id !== n.id)); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>✕</button>
                  </div>
                ))}
                {notifications.map(n => (
                <div key={n.id} style={{ padding: "14px 16px", borderBottom: `1px solid ${border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <div style={{ fontSize: 12, color: text }}>{n.text}</div>
                    <button className="hb" onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", marginLeft: 8 }}>✕</button>
                  </div>
                  <div style={{ marginBottom: n.type === "application" ? 10 : 0 }}>
                    {n.projectId && (
                      <button className="hb" onClick={() => {
                        const proj = projects.find(p => p.id === n.projectId);
                        if (proj) { setActiveProject(proj); loadProjectData(proj.id); setAppScreen("workspace"); setProjectTab("tasks"); setShowNotifications(false); }
                      }} style={{ background: "none", border: "none", padding: 0, color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>
                        {n.sub}
                      </button>
                    )}
                    {!n.projectId && <span style={{ fontSize: 11, color: textMuted }}>{n.sub}</span>}
                    <span style={{ fontSize: 11, color: textMuted }}> · {n.time}</span>
                  </div>
                  {n.type === "application" && n.applicant && (
                    <div>
                      <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <Avatar initials={n.applicant.initials} size={28} dark={dark} />
                          <div><div style={{ fontSize: 12, color: text }}>{n.applicant.name}</div><div style={{ fontSize: 10, color: textMuted }}>{n.applicant.role}{n.applicant.availability ? ` · ${n.applicant.availability}` : ""}</div></div>
                        </div>
                        {n.applicant.motivation && <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.6, marginTop: 6 }}>{n.applicant.motivation.slice(0, 100)}...</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="hb" onClick={() => handleAccept(n)} style={{ flex: 1, background: text, color: bg, border: "none", borderRadius: 6, padding: "7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>accept</button>
                        <button className="hb" onClick={() => handleDecline(n)} style={{ flex: 1, background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 6, padding: "7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>decline</button>
                      </div>
                    </div>
                  )}
                </div>
                ))}
              </>
            }
          </div>
        </>
      )}

      {viewingProfile && <ProfileModal u={viewingProfile} onClose={() => setViewingProfile(null)} />}
      {renderApplicationForm()}
      {reviewingApplicants && <ReviewModal project={reviewingApplicants} onClose={() => setReviewingApplicants(null)} />}

      {/* NEW DM PICKER */}
      {showNewDm && (
        <div style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(10px)", padding: 16 }} onClick={() => setShowNewDm(false)}>
          <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "24px", width: "100%", maxWidth: 440, maxHeight: "70vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>NEW MESSAGE</div>
              <button onClick={() => setShowNewDm(false)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
            </div>
            <input
              autoFocus
              placeholder="search people..."
              value={newDmSearch}
              onChange={e => setNewDmSearch(e.target.value)}
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              {users
                .filter(u => u.id !== authUser?.id && (!newDmSearch || u.name?.toLowerCase().includes(newDmSearch.toLowerCase()) || u.username?.toLowerCase().includes(newDmSearch.toLowerCase()) || u.role?.toLowerCase().includes(newDmSearch.toLowerCase())))
                .slice(0, 20)
                .map(u => (
                  <button key={u.id} onClick={() => { openDm(u); setShowNewDm(false); setNewDmSearch(""); }} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", background: "none", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
                    onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <Avatar initials={initials(u.name)} size={36} dark={dark} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: text }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.role}{u.username ? ` · @${u.username}` : ""}</div>
                    </div>
                  </button>
                ))
              }
              {users.filter(u => u.id !== authUser?.id && (!newDmSearch || u.name?.toLowerCase().includes(newDmSearch.toLowerCase()) || u.username?.toLowerCase().includes(newDmSearch.toLowerCase()) || u.role?.toLowerCase().includes(newDmSearch.toLowerCase()))).length === 0 && (
                <div style={{ fontSize: 12, color: textMuted, padding: "20px 0", textAlign: "center" }}>no one found.</div>
              )}
            </div>
          </div>
        </div>
      )}
      {showBannerEditor && <BannerEditor pixels={bannerPixels} onSave={saveBanner} onClose={() => setShowBannerEditor(false)} dark={dark} bg={bg} bg2={bg2} bg3={bg3} border={border} text={text} textMuted={textMuted} />}

      {/* COLLABORATORS MODAL */}
      {showCollaborators && (() => {
        const collabs = getCollaborators(showCollaborators);
        const isMe = showCollaborators === authUser?.id;
        const subjectUser = isMe ? profile : users.find(u => u.id === showCollaborators);
        return (
          <div onClick={() => setShowCollaborators(null)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 6 }}>COLLABORATORS</div>
                  <div style={{ fontSize: 16, color: text, fontWeight: 400 }}>{isMe ? "your" : `${subjectUser?.name?.split(" ")[0]}'s`} network</div>
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 3 }}>{collabs.length} people {isMe ? "you've" : "they've"} built with</div>
                </div>
                <button onClick={() => setShowCollaborators(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>✕</button>
              </div>
              {collabs.length === 0 ? (
                <div style={{ fontSize: 13, color: textMuted, padding: "20px 0", textAlign: "center" }}>
                  {isMe ? "no collaborators yet. accept someone into a project to start building your network." : "no collaborators yet."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {collabs.map((c, i) => (
                    <div key={c.user.id} onClick={() => { setShowCollaborators(null); setViewFullProfile(c.user); }} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", background: bg2, borderRadius: i === 0 && collabs.length === 1 ? 10 : i === 0 ? "10px 10px 0 0" : i === collabs.length - 1 ? "0 0 10px 10px" : 0, border: `1px solid ${border}`, borderBottom: i < collabs.length - 1 ? "none" : `1px solid ${border}`, cursor: "pointer", transition: "opacity 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                      <Avatar initials={initials(c.user.name)} size={40} dark={dark} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: text, fontWeight: 400, marginBottom: 2 }}>{c.user.name}</div>
                        {c.user.username && <div style={{ fontSize: 11, color: textMuted, marginBottom: 3 }}>@{c.user.username}</div>}
                        <div style={{ fontSize: 11, color: textMuted }}>{c.user.role}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: textMuted, marginBottom: 2 }}>via</div>
                        <div style={{ fontSize: 11, color: text, maxWidth: 120, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.project?.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {isMe && collabs.length > 0 && (
                <div style={{ marginTop: 20, padding: "14px 16px", background: bg3, borderRadius: 8, border: `1px solid ${border}` }}>
                  <div style={{ fontSize: 12, color: text, marginBottom: 4 }}>grow your network</div>
                  <div style={{ fontSize: 11, color: textMuted }}>every accepted collaboration adds to your profile. the more you build, the stronger your reputation on CoLab.</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* EXPLORE */}
      {!viewFullProfile && appScreen === "explore" && !activeProject && (
        <div className="pad fu" style={{ width: "100%", padding: "48px 32px" }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 14 }}>FIND YOUR PEOPLE. BUILD SOMETHING REAL.</div>
            <h1 style={{ fontSize: "clamp(30px, 5vw, 56px)", fontWeight: 400, lineHeight: 1.0, letterSpacing: "-2.5px", marginBottom: 14, color: text }}>Don't just connect.<br />Build together.</h1>
            <p style={{ fontSize: 13, color: textMuted, maxWidth: 400, lineHeight: 1.8, marginBottom: 22 }}>Post your project. Find people with the skills you need. Get to work.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="hb" onClick={() => setShowCreate(true)} style={btnP}>Post a project</button>
              <button className="hb" onClick={() => document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" })} style={btnG}>Browse</button>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${border}`, marginBottom: 24, display: "flex", gap: 32, paddingTop: 20, flexWrap: "wrap" }}>
            {[["open now", projects.filter(p => (p.collaborators||0) < (p.max_collaborators||2)).length],["projects", projects.length],["builders", users.length]].map(([l,v]) => (
              <div key={l}><div style={{ fontSize: 24, color: text, letterSpacing: "-1px" }}>{v}</div><div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{l}</div></div>
            ))}
          </div>
          {projects.filter(p => p.featured && !p.archived && !p.is_private).length > 0 && (
            <div style={{ marginBottom: 28, padding: "16px 20px", background: bg2, border: `1px solid ${border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 12 }}>★ FEATURED THIS WEEK</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {projects.filter(p => p.featured && !p.archived && !p.is_private).slice(0, 3).map(p => (
                  <div key={p.id} onClick={() => { setActiveProject(p); loadProjectData(p.id); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "8px 0", borderBottom: `1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.6"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                    <div>
                      <div style={{ fontSize: 13, color: text }}>{p.title}</div>
                      <div style={{ fontSize: 10, color: textMuted }}>{p.owner_name} · {p.category}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      {p.shipped && <span style={{ fontSize: 10, color: "#22c55e" }}>shipped</span>}
                      <span style={{ fontSize: 10, color: textMuted }}>{(p.skills || []).slice(0, 2).join(", ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {trendingProjects.length > 0 && (
            <div style={{ marginBottom: 28, padding: "16px 20px", background: bg2, border: `1px solid ${border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 12 }}>TRENDING</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {trendingProjects.map(p => (
                  <div key={p.id} onClick={() => { setActiveProject(p); loadProjectData(p.id); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "6px 0", borderBottom: `1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.6"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                    <div>
                      <div style={{ fontSize: 13, color: text }}>{p.title}</div>
                      <div style={{ fontSize: 10, color: textMuted }}>{p.category}</div>
                    </div>
                    <div style={{ fontSize: 10, color: textMuted, flexShrink: 0 }}>{applications.filter(a => a.project_id === p.id).length} applicants</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div id="feed" style={{ borderBottom: `1px solid ${border}`, display: "flex" }}>
            {["for-you","all"].map(id => (
              <button key={id} onClick={() => setExploreTab(id)} style={{ background: "none", border: "none", borderBottom: exploreTab === id ? `1px solid ${text}` : "1px solid transparent", color: exploreTab === id ? text : textMuted, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginRight: 24, transition: "all 0.15s", display: "inline-flex", gap: 6, alignItems: "center" }}>
                {id === "for-you" ? "for you" : "all projects"}
                {id === "for-you" && forYou.length > 0 && <span style={{ fontSize: 10, background: bg3, borderRadius: 10, padding: "1px 6px", color: textMuted }}>{forYou.length}</span>}
              </button>
            ))}
          </div>
          {loading ? <Spinner dark={dark} /> : (
            <>
              {exploreTab === "for-you" && ((profile?.skills || []).length === 0
                ? <div style={{ padding: "36px 0", color: textMuted, fontSize: 13 }}>add skills to see matched projects. <button onClick={() => setAppScreen("profile")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>update profile →</button></div>
                : forYou.length === 0
                  ? <div style={{ padding: "36px 0", color: textMuted, fontSize: 13 }}>no matches yet. <button className="hb" onClick={() => setExploreTab("all")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>browse all →</button></div>
                  : <div><div style={{ padding: "14px 0 2px", fontSize: 11, color: textMuted }}>{forYou.length} project{forYou.length !== 1 ? "s" : ""} matching your skills</div>{forYou.map(p => <PRow key={p.id} p={p} />)}</div>
              )}
              {exploreTab === "all" && (
                <div>
                  <div style={{ padding: "14px 0 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <input placeholder="search projects..." value={search} onChange={e => setSearch(e.target.value)} style={inputStyle} />
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {["Design","Engineering","Marketing","Music","Video","Finance","AI/ML","Writing","Product"].map(s => { const sel = filterSkill === s; return <button key={s} className="hb" onClick={() => setFilterSkill(sel ? null : s)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                      {filterSkill && <button className="hb" onClick={() => setFilterSkill(null)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: "none", color: textMuted, border: `1px solid ${border}` }}>clear</button>}
                    </div>
                    {/* Region filter */}
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: textMuted, letterSpacing: "1px" }}>REGION</span>
                      {["local","city","national","international"].map(r => { const sel = regionFilter === r; return <button key={r} className="hb" onClick={() => setRegionFilter(sel ? null : r)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{r}</button>; })}
                    </div>
                  </div>
                  {allP.length === 0 ? <div style={{ padding: "36px 0", textAlign: "center", color: textMuted, fontSize: 12 }}>no results.</div> : allP.filter(p => !regionFilter || (p.location || "").toLowerCase().includes(regionFilter === "local" ? (profile?.location || "").split(",")[0].toLowerCase() : regionFilter === "city" ? (profile?.location || "").split(",")[0].toLowerCase() : regionFilter === "national" ? "us" : "")).map(p => <PRow key={p.id} p={p} />)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* EXPLORE DETAIL */}
      {appScreen === "explore" && activeProject && (
        <div className="pad fu" style={{ width: "100%", maxWidth: 700, margin: "0 auto", padding: "36px 24px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
            <button className="hb" onClick={() => setActiveProject(null)} style={{ ...btnG, padding: "6px 14px", fontSize: 11 }}>← back</button>
            <button className="hb" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${activeProject.id}`).catch(() => {}); showToast("Link copied!"); }} style={{ ...btnG, padding: "6px 14px", fontSize: 11, marginLeft: "auto" }}>share ↗</button>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
            <button onClick={() => { const u = users.find(u => u.id === activeProject.owner_id); if (u) setViewingProfile(u); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <Avatar initials={activeProject.owner_initials} size={40} dark={dark} />
            </button>
            <div>
              <button onClick={() => { const u = users.find(u => u.id === activeProject.owner_id); if (u) setViewingProfile(u); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: text, textDecoration: "underline" }}>{activeProject.owner_name}</div>
              </button>
              <div style={{ fontSize: 11, color: textMuted }}>{new Date(activeProject.created_at).toLocaleDateString()} · {activeProject.category}</div>
            </div>
          </div>
          <h2 style={{ fontSize: "clamp(16px, 4vw, 20px)", fontWeight: 400, letterSpacing: "-0.8px", marginBottom: 10, color: text }}>{activeProject.title}</h2>
          <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 22 }}>{activeProject.description}</p>
          {(activeProject.goals || activeProject.timeline) && (
            <div style={{ marginBottom: 22, padding: "14px 16px", background: bg2, border: `1px solid ${border}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              {activeProject.goals && (
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 4 }}>GOALS</div>
                  <div style={{ fontSize: 13, color: text, lineHeight: 1.65 }}>{activeProject.goals}</div>
                </div>
              )}
              {activeProject.timeline && (
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 4 }}>TIMELINE</div>
                  <div style={{ fontSize: 13, color: text }}>{activeProject.timeline}</div>
                </div>
              )}
            </div>
          )}
          <div style={{ marginBottom: 22 }}>
            <div style={labelStyle}>SKILLS NEEDED</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {(activeProject.skills || []).map(s => { const m = (profile?.skills || []).includes(s); return <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${m ? (dark ? "#ffffff45" : "#00000030") : border}`, borderRadius: 3, color: m ? text : textMuted, fontWeight: m ? 500 : 400 }}>{s}{m ? " ★" : ""}</span>; })}
            </div>
          </div>
          {getMatchScore(activeProject) > 0 && <div style={{ padding: "10px 14px", background: bg2, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12, color: textMuted, marginBottom: 18 }}>you match <strong style={{ color: text }}>{getMatchScore(activeProject)}</strong> of the skills needed.</div>}
          {appliedProjectIds.includes(activeProject.id)
            ? <div style={{ textAlign: "center", padding: 12, background: bg2, borderRadius: 8, color: textMuted, fontSize: 12, border: `1px solid ${border}` }}>applied — waiting to hear back</div>
            : activeProject.owner_id === authUser?.id
              ? <button className="hb" onClick={() => setReviewingApplicants(activeProject)} style={{ ...btnP, width: "100%", padding: "13px" }}>review applicants ({applications.filter(a => a.project_id === activeProject.id && a.status === "pending").length})</button>
              : <button className="hb" onClick={() => setShowApplicationForm(activeProject)} style={{ ...btnP, width: "100%", padding: "13px" }}>Apply to collaborate →</button>
          }
        </div>
      )}

      {/* NETWORK */}
      {!viewFullProfile && appScreen === "network" && renderNetwork()}

      {/* MESSAGES */}
      {appScreen === "messages" && (
        <div className={activeDmThread ? "msgs-has-thread" : "msgs-no-thread"} style={{ width: "100%", padding: "0", display: "flex", height: "calc(100vh - 50px)" }}>
          {/* Left panel — thread list */}
          <div className="msgs-left" style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${border}`, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>MESSAGES</div>
              <button className="hb" onClick={() => { setShowNewDm(true); setNewDmSearch(""); }} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 5, width: 22, height: 22, cursor: "pointer", fontSize: 14, color: textMuted, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
            </div>
            {dmThreads.length === 0
              ? <div style={{ padding: "24px 20px", fontSize: 12, color: textMuted, lineHeight: 1.7 }}>no conversations yet.<br /><button className="hb" onClick={() => { setShowNewDm(true); setNewDmSearch(""); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline", padding: 0 }}>start one →</button></div>
              : dmThreads.map(thread => {
                  const otherId = thread.user_a === authUser?.id ? thread.user_b : thread.user_a;
                  const other = users.find(u => u.id === otherId);
                  if (!other) return null;
                  const isActive = activeDmThread?.id === thread.id;
                  const threadMsgs = dmMessages[thread.id] || [];
                  const lastMsg = threadMsgs[threadMsgs.length - 1];
                  return (
                    <div key={thread.id} onClick={() => { setActiveDmThread({ ...thread, otherUser: other }); loadDmMessages(thread.id); setDmThreads(prev => prev.map(t => t.id === thread.id ? { ...t, unread: false } : t)); setTimeout(() => markDmRead(thread.id), 500); }}
                      style={{ padding: "14px 20px", borderBottom: `1px solid ${border}`, cursor: "pointer", background: isActive ? bg2 : "none", display: "flex", gap: 12, alignItems: "center" }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = bg2; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "none"; }}>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <Avatar initials={initials(other.name)} size={36} dark={dark} />
                        {thread.unread && <span style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, borderRadius: "50%", background: text, border: `2px solid ${bg}` }} />}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, color: text, fontWeight: thread.unread ? 500 : 400 }}>{other.name}</div>
                        {lastMsg
                          ? <div style={{ fontSize: 11, color: textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastMsg.sender_id === authUser?.id ? "you: " : ""}{lastMsg.text}</div>
                          : <div style={{ fontSize: 11, color: textMuted }}>{other.role}</div>
                        }
                      </div>
                    </div>
                  );
                })
            }
          </div>

          {/* Right panel — conversation */}
          <div className="msgs-right" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {activeDmThread ? (
              <>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${border}`, display: "flex", gap: 12, alignItems: "center" }}>
                  <button className="msgs-back hb" onClick={() => setActiveDmThread(null)} style={{ display: "none", background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 18, padding: "0 8px 0 0", lineHeight: 1 }}>‹</button>
                  <Avatar initials={initials(activeDmThread.otherUser?.name)} size={32} dark={dark} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: text, fontWeight: 500 }}>{activeDmThread.otherUser?.name}</div>
                    <div style={{ fontSize: 11, color: textMuted }}>{activeDmThread.otherUser?.role}</div>
                  </div>
                  <button className="hb" onClick={() => setViewingProfile(activeDmThread.otherUser)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>profile</button>
                  <button className="hb" onClick={() => { if (window.confirm("Delete this entire conversation? This cannot be undone.")) handleDeleteThread(activeDmThread.id); }} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>delete chat</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {(dmMessages[activeDmThread.id] || []).length === 0
                    ? <div style={{ fontSize: 12, color: textMuted, textAlign: "center", marginTop: 40 }}>start the conversation.</div>
                    : (dmMessages[activeDmThread.id] || []).map((msg, i) => {
                        const isMe = msg.sender_id === authUser?.id;
                        const isRead = (msg.read_by || []).length > 0;
                        const isEditing = editingMessage?.id === msg.id;
                        return (
                          <div key={msg.id || i} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexDirection: isMe ? "row-reverse" : "row" }}>
                            <Avatar initials={msg.sender_initials} size={26} dark={dark} />
                            <div style={{ maxWidth: "70%" }}>
                              {isEditing ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <input value={editMessageText} onChange={e => setEditMessageText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleEditDm(msg.id, editMessageText); if (e.key === "Escape") setEditingMessage(null); }} style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }} autoFocus />
                                  <button onClick={() => handleEditDm(msg.id, editMessageText)} style={{ ...btnP, padding: "6px 10px", fontSize: 11, flexShrink: 0 }}>save</button>
                                </div>
                              ) : (
                                <div style={{ background: isMe ? text : bg2, color: isMe ? bg : text, padding: "9px 13px", borderRadius: isMe ? "14px 14px 2px 14px" : "14px 14px 14px 2px", fontSize: 13, lineHeight: 1.55, border: isMe ? "none" : `1px solid ${border}` }}>{msg.text}{msg.edited && <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 6 }}>edited</span>}</div>
                              )}
                              <div style={{ fontSize: 10, color: textMuted, marginTop: 3, textAlign: isMe ? "right" : "left", display: "flex", gap: 8, justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "center" }}>
                                <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                {isMe && isRead && <span style={{ fontSize: 9 }}>✓✓</span>}
                                {isMe && <button className="hb" onClick={() => { setEditingMessage({ id: msg.id }); setEditMessageText(msg.text); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>edit</button>}
                                {isMe && <button className="hb" onClick={() => handleDeleteDm(msg.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>delete</button>}
                              </div>
                            </div>
                          </div>
                        );
                      })
                  }
                  <div ref={dmEndRef} />
                </div>
                <div style={{ padding: "14px 20px", borderTop: `1px solid ${border}`, display: "flex", gap: 10 }}>
                  <input placeholder="message..." value={dmInput} onChange={e => setDmInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSendDm()} style={{ ...inputStyle, fontSize: 13 }} autoFocus />
                  <button className="hb" onClick={handleSendDm} style={{ ...btnP, padding: "10px 18px", flexShrink: 0 }}>send</button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: textMuted, fontSize: 13 }}>
                {dmThreads.length > 0 ? "select a conversation →" : "message someone from their profile to get started"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* WORKSPACE */}
      {appScreen === "workspace" && !activeProject && (
        <div className="pad fu" style={{ width: "100%", padding: "44px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>WORKSPACE</div>
              <h2 style={{ fontSize: "clamp(20px, 4vw, 26px)", fontWeight: 400, letterSpacing: "-1.5px", color: text }}>{profile?.name ? `${profile.name.split(" ")[0]}'s workspace.` : "Your workspace."}</h2>
            </div>
            <button className="hb" onClick={() => setShowCreate(true)} style={btnP}>+ new project</button>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginBottom: 36, border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
            {[
              ["projects", myProjects.length],
              ["applied to", appliedProjectIds.length],
              ["followers", followers.length],
              ["notifications", unreadNotifs],
            ].map(([label,val],i) => (
              <div key={i} style={{ padding: "16px 18px", background: bg2, borderRight: i < 3 ? `1px solid ${border}` : "none" }}>
                <div style={{ fontSize: "clamp(18px, 3vw, 24px)", fontWeight: 400, color: text, letterSpacing: "-1px" }}>{val}</div>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Two col: my projects + applications */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 36 }}>
            {/* My projects */}
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>MY PROJECTS</div>
              {loading ? <Spinner dark={dark} /> : myProjects.length === 0
                ? <div style={{ fontSize: 12, color: textMuted }}>no projects yet. <button onClick={() => setShowCreate(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>post one →</button></div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {myProjects.map((p,i) => {
                      const pendingApps = applications.filter(a => a.project_id === p.id && a.status === "pending").length;
                      return (
                        <div key={p.id} style={{ background: bg2, borderRadius: i === 0 && myProjects.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === myProjects.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < myProjects.length - 1 ? "none" : `1px solid ${border}`, padding: "12px 16px", cursor: "pointer", transition: "opacity 0.15s" }}
                          onMouseEnter={e => e.currentTarget.style.opacity = "0.8"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                          onClick={() => { setActiveProject(p); loadProjectData(p.id); setProjectTab("tasks"); }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: text, letterSpacing: "-0.3px", marginBottom: 2 }}>{p.title}</div>
                              <div style={{ fontSize: 11, color: textMuted }}>{p.category}{pendingApps > 0 ? ` · ${pendingApps} pending` : ""}</div>
                            </div>
                            {pendingApps > 0 && <button className="hb" onClick={e => { e.stopPropagation(); setReviewingApplicants(p); }} style={{ fontSize: 10, padding: "2px 8px", border: `1px solid ${border}`, borderRadius: 4, background: "none", color: text, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>review</button>}
                          </div>
                          {/* Task-based progress */}
                          {(() => {
                            const projTasks = tasks.filter(t => t.project_id === p.id);
                            const done = projTasks.filter(t => t.done).length;
                            const prog = projTasks.length > 0 ? Math.round((done / projTasks.length) * 100) : (p.progress || 0);
                            return (
                              <div>
                                <ProgressBar value={prog} dark={dark} />
                                <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>
                                  {projTasks.length > 0 ? `${done}/${projTasks.length} tasks · ${prog}%` : `${prog}%`}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
              }
            {projects.filter(p => p.owner_id === authUser?.id && p.archived).length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 10 }}>ARCHIVED</div>
                {projects.filter(p => p.owner_id === authUser?.id && p.archived).map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: bg2, border: `1px solid ${border}`, borderRadius: 6, marginBottom: 4, opacity: 0.6 }}>
                    <div style={{ fontSize: 12, color: text }}>{p.title}</div>
                    <button className="hb" onClick={() => handleUnarchiveProject(p.id)}
                      style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 10 }}>restore</button>
                  </div>
                ))}
              </div>
            )}
            </div>

            {/* Applications + recent activity */}
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>APPLICATIONS</div>
              {appliedProjectIds.length === 0
                ? <div style={{ fontSize: 12, color: textMuted, marginBottom: 24 }}>no applications yet.</div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 24 }}>
                    {projects.filter(p => appliedProjectIds.includes(p.id)).map((p,i,arr) => {
                      const myApp = applications.find(a => a.project_id === p.id && a.applicant_id === authUser?.id);
                      return (
                        <div key={p.id} style={{ background: bg2, borderRadius: i === 0 && arr.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === arr.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < arr.length - 1 ? "none" : `1px solid ${border}`, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, color: text, marginBottom: 1 }}>{p.title}</div><div style={{ fontSize: 10, color: textMuted }}>{p.owner_name}</div></div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 10, color: myApp?.status === "accepted" ? text : textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px" }}>{myApp?.status || "pending"}</span>
                            {myApp?.status === "declined" && <button className="hb" onClick={() => handleRemoveDeniedApp(myApp.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>✕</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
              }

              {/* Pending notifications */}
              {notifications.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>NEEDS ATTENTION</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {notifications.slice(0, 3).map(n => (
                      <div key={n.id} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: text, marginBottom: 1 }}>{n.text}</div>
                          <div style={{ fontSize: 10, color: textMuted }}>{n.sub}</div>
                        </div>
                        <button className="hb" onClick={() => { setShowNotifications(true); setAppScreen("workspace"); }} style={{ fontSize: 10, padding: "2px 8px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: text, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>review</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PROJECT SPACE */}
      {appScreen === "workspace" && activeProject && (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", height: "calc(100vh - 50px)" }}>
          {/* Project header */}
          <div className="pad" style={{ padding: "16px 28px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", flexShrink: 0 }}>
            <button className="hb" onClick={() => setActiveProject(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>← workspace</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{activeProject.title}</div>
              <div style={{ fontSize: 11, color: textMuted }}>{activeProject.category}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              {(() => {
                const projTasks = tasks.filter(t => t.project_id === activeProject.id);
                const doneTasks = projTasks.filter(t => t.done).length;
                const prog = projTasks.length > 0 ? Math.round((doneTasks / projTasks.length) * 100) : (activeProject.progress || 0);
                return (
                  <span style={{ fontSize: 10, color: textMuted }}>
                    {projTasks.length > 0 ? `${doneTasks}/${projTasks.length} tasks · ${prog}%` : `${prog}%`}
                  </span>
                );
              })()}
              {activeProject.shipped && (
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: "1px solid #22c55e", color: "#22c55e" }}>shipped</span>
              )}
              {activeProject.owner_id === authUser?.id && !activeProject.shipped && (
                <button className="hb" onClick={() => { setShipPostContent(`just shipped: ${activeProject.title}. built it with the team on CoLab.`); setShowShipModal(true); }}
                  style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", fontSize: 10, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>
                  ship it
                </button>
              )}
              {activeProject.owner_id === authUser?.id && (
                <button className="hb" onClick={() => handleToggleFeatured(activeProject.id, !activeProject.featured)}
                  style={{ background: activeProject.featured ? text : "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", fontSize: 10, cursor: "pointer", color: activeProject.featured ? bg : textMuted, fontFamily: "inherit" }}>
                  {activeProject.featured ? "★ featured" : "feature"}
                </button>
              )}
              {activeProject.owner_id === authUser?.id && (
                <button className="hb" onClick={() => handleArchiveProject(activeProject.id)}
                  style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", fontSize: 10, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>
                  archive
                </button>
              )}
            </div>
          </div>

          {/* Due this week banner */}
          {(() => {
            const now = new Date();
            const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            const upcoming = tasks.filter(t => t.project_id === activeProject.id && !t.done && t.due_date && new Date(t.due_date) <= weekOut);
            const overdue = upcoming.filter(t => new Date(t.due_date) < now);
            if (upcoming.length === 0) return null;
            const accentColor = overdue.length > 0 ? "#ef4444" : "#f97316";
            const bannerBg = overdue.length > 0 ? (dark ? "#1a000088" : "#fff5f5") : (dark ? "#1a0e0088" : "#fffbf0");
            return (
              <div className="pad" style={{ padding: "7px 28px", background: bannerBg, borderBottom: `1px solid ${accentColor}40`, display: "flex", gap: 10, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: accentColor, fontWeight: 500, flexShrink: 0 }}>
                  {overdue.length > 0 ? `${overdue.length} overdue` : ""}{overdue.length > 0 && upcoming.length > overdue.length ? " · " : ""}{upcoming.length > overdue.length ? `${upcoming.length - overdue.length} due this week` : ""}
                </span>
                <span style={{ fontSize: 10, color: textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {upcoming.slice(0, 3).map(t => t.text).join(" · ")}{upcoming.length > 3 ? ` +${upcoming.length - 3} more` : ""}
                </span>
              </div>
            );
          })()}

          {/* Tab bar */}
          <div className="pad proj-tabs" style={{ padding: "0 28px", borderBottom: `1px solid ${border}`, display: "flex", flexShrink: 0, overflowX: "auto" }}>
            <TabBtn id="kanban" label="board" count={0} setter={setProjectTab} current={projectTab} />
            <TabBtn id="messages" label="chat" count={messages.length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="files" label="files" count={0} setter={setProjectTab} current={projectTab} />
            <TabBtn id="docs" label="docs" count={0} setter={setProjectTab} current={projectTab} />
            <TabBtn id="updates" label="updates" count={projectUpdates.length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="team" label="team" count={0} setter={setProjectTab} current={projectTab} />
            <TabBtn id="plugins" label="plugins" count={(activeProject.plugins || []).length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="activity" label="activity" count={0} setter={setProjectTab} current={projectTab} />
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>

            {/* KANBAN BOARD */}
            {projectTab === "kanban" && (
              <div>
                {(activeProject.goals || activeProject.timeline) && (
                  <div style={{ marginBottom: 16, padding: "12px 16px", background: bg2, border: `1px solid ${border}`, borderRadius: 8 }}>
                    {activeProject.goals && <div style={{ fontSize: 12, color: textMuted, marginBottom: activeProject.timeline ? 4 : 0 }}><span style={{ color: text, fontWeight: 500 }}>Goals: </span>{activeProject.goals}</div>}
                    {activeProject.timeline && <div style={{ fontSize: 12, color: textMuted }}><span style={{ color: text, fontWeight: 500 }}>Timeline: </span>{activeProject.timeline}</div>}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <input placeholder="add a task..." value={newTaskText} onChange={e => setNewTaskText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddTask(activeProject.id)} style={{ ...inputStyle, fontSize: 12 }} />
                  <input type="date" value={taskDueDate || ""} onChange={e => setTaskDueDate(e.target.value)} style={{ ...inputStyle, fontSize: 11, width: "auto", flexShrink: 0 }} title="due date" />
                  <select value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} style={{ ...inputStyle, fontSize: 12, maxWidth: 140 }}>
                    <option value="">assign...</option>
                    {users.filter(u => [authUser?.id, ...(applications.filter(a => a.project_id === activeProject.id && a.status === "accepted").map(a => a.applicant_id))].includes(u.id)).map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                  </select>
                  <button className="hb" onClick={() => handleAddTask(activeProject.id)} style={{ ...btnP, padding: "10px 16px", flexShrink: 0, fontSize: 12 }}>add</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                  {[
                    { id: "todo", label: "TO DO", tasks: tasks.filter(t => t.project_id === activeProject.id && !t.done && !t.in_progress) },
                    { id: "inprogress", label: "IN PROGRESS", tasks: tasks.filter(t => t.project_id === activeProject.id && t.in_progress && !t.done) },
                    { id: "done", label: "DONE", tasks: tasks.filter(t => t.project_id === activeProject.id && t.done) },
                  ].map(col => (
                    <div key={col.id} style={{ background: bg2, borderRadius: 10, border: `1px solid ${border}`, padding: "14px", minHeight: 200 }}>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                        {col.label} <span style={{ background: bg3, borderRadius: 10, padding: "1px 7px" }}>{col.tasks.length}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {col.tasks.map(task => {
                          const now = new Date();
                          const due = task.due_date ? new Date(task.due_date) : null;
                          const isOverdue = due && !task.done && due < now;
                          const isDueSoon = due && !task.done && !isOverdue && (due - now) < 3 * 24 * 60 * 60 * 1000;
                          return (
                          <div key={task.id} style={{ background: isOverdue ? (dark ? "#1a0000" : "#fff5f5") : bg, border: `1px solid ${isOverdue ? "#ef4444" : isDueSoon ? "#f97316" : border}`, borderLeft: isOverdue ? "3px solid #ef4444" : isDueSoon ? "3px solid #f97316" : `1px solid ${border}`, borderRadius: 8, padding: "10px 12px" }}>
                            <div style={{ fontSize: 12, color: text, marginBottom: 6, lineHeight: 1.4 }}>{task.text}</div>
                            {task.assigned_name && <div style={{ fontSize: 10, color: textMuted, marginBottom: 4 }}>→ {task.assigned_name}</div>}
                            {due && <div style={{ fontSize: 10, color: isOverdue ? "#ef4444" : isDueSoon ? "#f97316" : textMuted, marginBottom: 8, fontWeight: isOverdue ? 500 : 400 }}>{isOverdue ? "overdue · " : isDueSoon ? "due soon · " : "due "}{due.toLocaleDateString()}</div>}
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {col.id !== "todo" && <button className="hb" onClick={async () => { await supabase.from("tasks").update({ in_progress: false, done: false }).eq("id", task.id); setTasks(tasks.map(t => t.id === task.id ? { ...t, in_progress: false, done: false } : t)); }} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>← to do</button>}
                              {col.id === "todo" && <button className="hb" onClick={async () => { await supabase.from("tasks").update({ in_progress: true, done: false }).eq("id", task.id); setTasks(tasks.map(t => t.id === task.id ? { ...t, in_progress: true, done: false } : t)); }} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>in progress →</button>}
                              {col.id === "inprogress" && <button className="hb" onClick={() => handleToggleTask(task)} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>done →</button>}
                              <button className="hb" onClick={() => handleDeleteTask(task.id)} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                            </div>
                          </div>
                          );
                        })}
                        {col.tasks.length === 0 && <div style={{ fontSize: 11, color: textMuted, textAlign: "center", padding: "20px 0" }}>empty</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CHAT */}
            {projectTab === "messages" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: "calc(100vh - 220px)" }}>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
                  {messages.length === 0 ? <div style={{ fontSize: 12, color: textMuted }}>no messages yet.</div>
                    : messages.map((msg, i) => {
                        const isMe = msg.from_user === authUser?.id;
                        const isEditing = editingMessage?.id === msg.id && editingMessage?.type === "project";
                        return (
                          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: isMe ? "row-reverse" : "row" }}>
                            <Avatar initials={msg.from_initials} size={28} dark={dark} />
                            <div style={{ maxWidth: "72%" }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                                <span style={{ fontSize: 11, fontWeight: 500, color: text }}>{isMe ? "you" : msg.from_name}</span>
                                <span style={{ fontSize: 10, color: textMuted }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                {isMe && <button className="hb" onClick={() => { setEditingMessage({ id: msg.id, type: "project" }); setEditMessageText(msg.text); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>edit</button>}
                                {isMe && <button className="hb" onClick={() => handleDeleteProjectMessage(msg.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>delete</button>}
                              </div>
                              {isEditing ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <input value={editMessageText} onChange={e => setEditMessageText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleEditProjectMessage(msg.id, editMessageText); if (e.key === "Escape") setEditingMessage(null); }} style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }} autoFocus />
                                  <button onClick={() => handleEditProjectMessage(msg.id, editMessageText)} style={{ ...btnP, padding: "6px 10px", fontSize: 11, flexShrink: 0 }}>save</button>
                                </div>
                              ) : (
                                <div style={{ background: isMe ? text : bg2, color: isMe ? bg : text, padding: "8px 12px", borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px", fontSize: 12, lineHeight: 1.6, border: isMe ? "none" : `1px solid ${border}` }}>
                                  {renderWithMentions(msg.text)}{msg.edited && <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 6 }}>edited</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                  }
                  <div ref={messagesEndRef} />
                </div>
                <div style={{ display: "flex", gap: 8, borderTop: `1px solid ${border}`, paddingTop: 12 }}>
                  <MentionInput dark={dark} value={newMessage} onChange={setNewMessage} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSendMessage(activeProject.id)} placeholder="message the team... (@mention)" users={users} style={{ ...inputStyle, fontSize: 12 }} />
                  <button className="hb" onClick={() => handleSendMessage(activeProject.id)} style={{ ...btnP, padding: "10px 16px", flexShrink: 0, fontSize: 12 }}>send</button>
                </div>
              </div>
            )}

            {/* FILES */}
            {projectTab === "files" && (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "inline-block", cursor: "pointer" }}>
                    <div style={{ ...btnP, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      ↑ upload file
                    </div>
                    <input type="file" style={{ display: "none" }} onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      showToast("Uploading...");
                      const path = `${activeProject.id}/${Date.now()}-${file.name}`;
                      const { data: uploadData, error } = await supabase.storage.from("project-files").upload(path, file);
                      if (error) { showToast("Upload failed."); return; }
                      const { data: { publicUrl } } = supabase.storage.from("project-files").getPublicUrl(path);
                      const { data: fileRecord } = await supabase.from("project_files").insert({
                        project_id: activeProject.id, user_id: authUser.id,
                        user_name: profile.name, user_initials: myInitials,
                        name: file.name, size: file.size, type: file.type, url: publicUrl,
                      }).select().single();
                      if (fileRecord) {
                        setProjectFiles(prev => [...prev, fileRecord]);
                        showToast("File uploaded.");
                      }
                    }} />
                  </label>
                </div>
                {projectFiles.length === 0
                  ? <div style={{ fontSize: 13, color: textMuted }}>no files yet. upload something to share with the team.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {projectFiles.map((file, i) => (
                        <div key={file.id} style={{ background: bg2, borderRadius: i === 0 && projectFiles.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === projectFiles.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < projectFiles.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px" }}>
                          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: file.type?.startsWith("image") ? 10 : 0 }}>
                            <div style={{ fontSize: 20, flexShrink: 0 }}>
                            {file.type?.startsWith("image") ? "img" : file.type?.includes("pdf") ? "pdf" : file.type?.includes("video") ? "vid" : "file"}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: text, marginBottom: 2 }}>{file.name}</div>
                              <div style={{ fontSize: 10, color: textMuted }}>{file.user_name} · {new Date(file.created_at).toLocaleDateString()} · {file.size ? `${(file.size / 1024).toFixed(0)}kb` : ""}</div>
                            </div>
                            <a href={file.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: text, textDecoration: "underline", flexShrink: 0 }}>open</a>
                            <button className="hb" onClick={async () => {
                              const path = file.url.split("/project-files/")[1];
                              await supabase.storage.from("project-files").remove([path]);
                              await supabase.from("project_files").delete().eq("id", file.id);
                              setProjectFiles(prev => prev.filter(f => f.id !== file.id));
                              showToast("File deleted.");
                            }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>delete</button>
                          </div>
                          {file.type?.startsWith("image") && (
                            <img src={file.url} alt={file.name} style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 6, border: `1px solid ${border}` }} />
                          )}
                          {file.type?.includes("pdf") && (
                            <a href={file.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: text, border: `1px solid ${border}`, borderRadius: 6, padding: "6px 12px", textDecoration: "none" }}>↗ view PDF</a>
                          )}
                        </div>
                      ))}
                    </div>
                }
              </div>
            )}

            {/* DOCS */}
            {projectTab === "docs" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px" }}>SHARED DOCUMENTS</div>
                  <button className="hb" onClick={async () => {
                    const title = prompt("Document title:");
                    if (!title) return;
                    const { data } = await supabase.from("project_docs").insert({
                      project_id: activeProject.id, title, content: "",
                      last_edited_by: profile.name, last_edited_initials: myInitials,
                    }).select().single();
                    if (data) { setProjectDocs(prev => [...prev, data]); setActiveDoc(data); }
                  }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>+ new doc</button>
                </div>
                {activeDoc ? (
                  <div>
                    <button onClick={() => setActiveDoc(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 16 }}>← all docs</button>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 16, color: text, fontWeight: 400, marginBottom: 4 }}>{activeDoc.title}</div>
                        <div style={{ fontSize: 10, color: textMuted }}>last edited by {activeDoc.last_edited_by}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="hb" onClick={() => setDocPreviewMode(m => !m)}
                          style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>
                          {docPreviewMode ? "edit" : "preview"}
                        </button>
                        <button className="hb" onClick={async () => {
                          await supabase.from("project_docs").delete().eq("id", activeDoc.id);
                          setProjectDocs(prev => prev.filter(d => d.id !== activeDoc.id));
                          setActiveDoc(null);
                          showToast("Document deleted.");
                        }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>delete doc</button>
                      </div>
                    </div>
                    {docPreviewMode ? (
                      <div style={{ ...inputStyle, minHeight: 400, fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", overflow: "auto", cursor: "text" }}
                        onClick={() => setDocPreviewMode(false)}>
                        {(activeDoc.content || "").split("\n").map((line, i) => {
                          if (line.startsWith("# ")) return <h1 key={i} style={{ fontSize: 20, fontWeight: 400, letterSpacing: "-0.5px", marginBottom: 8 }}>{line.slice(2)}</h1>;
                          if (line.startsWith("## ")) return <h2 key={i} style={{ fontSize: 16, fontWeight: 400, marginBottom: 6 }}>{line.slice(3)}</h2>;
                          if (line.startsWith("### ")) return <h3 key={i} style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{line.slice(4)}</h3>;
                          if (line.startsWith("- ") || line.startsWith("* ")) return <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}><span>·</span><span>{line.slice(2)}</span></div>;
                          if (line === "") return <div key={i} style={{ height: "1em" }} />;
                          const bold = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/__(.*?)__/g, "<strong>$1</strong>");
                          const italic = bold.replace(/\*(.*?)\*/g, "<em>$1</em>").replace(/_(.*?)_/g, "<em>$1</em>");
                          return <div key={i} style={{ marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: italic }} />;
                        })}
                        {!activeDoc.content && <span style={{ color: textMuted, fontStyle: "italic" }}>click to start writing...</span>}
                      </div>
                    ) : (
                      <textarea
                        value={activeDoc.content || ""}
                        onChange={e => setActiveDoc({ ...activeDoc, content: e.target.value })}
                        onBlur={async () => {
                          await supabase.from("project_docs").update({
                            content: activeDoc.content,
                            last_edited_by: profile.name,
                            last_edited_initials: myInitials,
                            updated_at: new Date().toISOString(),
                          }).eq("id", activeDoc.id);
                          setProjectDocs(prev => prev.map(d => d.id === activeDoc.id ? { ...activeDoc } : d));
                          showToast("Saved.");
                        }}
                        placeholder="Start writing... Use # for headers, **bold**, *italic*, - for bullets"
                        style={{ ...inputStyle, resize: "none", minHeight: 400, fontSize: 13, lineHeight: 1.8, fontFamily: "inherit" }}
                      />
                    )}
                  </div>
                ) : (
                  projectDocs.length === 0
                    ? <div style={{ fontSize: 13, color: textMuted }}>no documents yet. create one to start writing together.</div>
                    : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {projectDocs.map((doc, i) => (
                          <div key={doc.id} style={{ background: bg2, borderRadius: i === 0 && projectDocs.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === projectDocs.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < projectDocs.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                            <div onClick={() => setActiveDoc(doc)} style={{ flex: 1, cursor: "pointer" }}
                              onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                              <div style={{ fontSize: 14, color: text, marginBottom: 4 }}>{doc.title}</div>
                              <div style={{ fontSize: 10, color: textMuted }}>edited by {doc.last_edited_by} · {new Date(doc.updated_at).toLocaleDateString()}</div>
                            </div>
                            <button className="hb" onClick={async () => {
                              await supabase.from("project_docs").delete().eq("id", doc.id);
                              setProjectDocs(prev => prev.filter(d => d.id !== doc.id));
                              showToast("Document deleted.");
                            }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, flexShrink: 0 }}>delete</button>
                          </div>
                        ))}
                      </div>
                )}
              </div>
            )}

            {/* UPDATES */}
            {projectTab === "updates" && (
              <div>
                <div style={{ display: "flex", gap: 10, marginBottom: 22, alignItems: "flex-start" }}>
                  <Avatar initials={myInitials} size={28} dark={dark} />
                  <div style={{ flex: 1 }}>
                    <MentionInput dark={dark} value={newUpdate} onChange={setNewUpdate} placeholder="post an update... (@mention someone)" users={users} style={{ ...inputStyle, resize: "none", fontSize: 12, padding: "8px 12px" }} rows={2} />
                    {newUpdate.trim() && <button className="hb" onClick={() => handlePostUpdate(activeProject.id)} style={{ ...btnP, marginTop: 8, padding: "7px 14px", fontSize: 11 }}>post</button>}
                  </div>
                </div>
                {projectUpdates.length === 0 ? <div style={{ fontSize: 12, color: textMuted }}>no updates yet.</div>
                  : projectUpdates.map((u, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                      <Avatar initials={u.initials} size={28} dark={dark} />
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: text }}>{u.author}</span>
                          <span style={{ fontSize: 10, color: textMuted }}>{new Date(u.created_at).toLocaleDateString()}</span>
                        </div>
                        <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65 }}>{renderWithMentions(u.text)}</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {/* TEAM */}
            {projectTab === "team" && (
              <div>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 14 }}>TEAM</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${border}` }}>
                  <Avatar initials={activeProject.owner_initials} size={36} dark={dark} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: text }}>{activeProject.owner_name}</div>
                    <div style={{ fontSize: 11, color: textMuted }}>project owner</div>
                  </div>
                  <span style={{ fontSize: 10, padding: "2px 8px", border: `1px solid ${border}`, borderRadius: 3, color: text }}>owner</span>
                </div>
                {applications.filter(a => a.project_id === activeProject.id && a.status === "accepted").map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${border}` }}>
                    <Avatar initials={a.applicant_initials} size={36} dark={dark} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: text }}>{a.applicant_name}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>{a.applicant_role}</div>
                    </div>
                    {activeProject.owner_id === authUser?.id ? (
                      <select defaultValue={a.role || "contributor"} onChange={e => handleAssignRole(activeProject.id, a.applicant_id, e.target.value)} style={{ ...inputStyle, fontSize: 11, padding: "4px 8px", width: "auto" }}>
                        <option value="admin">admin</option>
                        <option value="contributor">contributor</option>
                        <option value="viewer">viewer</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: 10, padding: "2px 8px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{a.role || "contributor"}</span>
                    )}
                    {a.applicant_id === authUser?.id && (
                      <button className="hb" onClick={() => handleLeaveProject(a.id)}
                        style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 8px", fontSize: 10, cursor: "pointer", color: textMuted, fontFamily: "inherit", marginLeft: 4 }}>
                        leave
                      </button>
                    )}
                  </div>
                ))}
                {applications.filter(a => a.project_id === activeProject.id && a.status === "accepted").length === 0 && (
                  <div style={{ fontSize: 12, color: textMuted, padding: "16px 0" }}>no collaborators yet.</div>
                )}
                {activeProject.owner_id === authUser?.id && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${border}` }}>
                    <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>INVITE</div>
                    <button className="hb" onClick={() => handleGenerateInvite(activeProject.id)}
                      style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "7px 14px", fontSize: 11, cursor: "pointer", color: text, fontFamily: "inherit" }}>
                      generate invite link
                    </button>
                    {inviteLink && (
                      <div style={{ marginTop: 10, background: bg2, border: `1px solid ${border}`, borderRadius: 6, padding: "8px 12px", fontSize: 10, color: textMuted, wordBreak: "break-all" }}>
                        {inviteLink}
                        <button className="hb" onClick={() => { navigator.clipboard?.writeText(inviteLink); showToast("Copied."); }}
                          style={{ display: "block", marginTop: 6, background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 10, textDecoration: "underline", padding: 0 }}>
                          copy again
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ACTIVITY */}
            {projectTab === "activity" && (
              <div>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 14 }}>ACTIVITY</div>
                {projectActivity.length === 0
                  ? <div style={{ fontSize: 13, color: textMuted }}>no activity yet.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {projectActivity.map((a, i) => (
                        <div key={a.id} style={{ padding: "10px 14px", background: bg2, borderRadius: i === 0 && projectActivity.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === projectActivity.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < projectActivity.length - 1 ? "none" : `1px solid ${border}` }}>
                          <div style={{ fontSize: 12, color: text }}>{a.details}</div>
                          <div style={{ fontSize: 10, color: textMuted, marginTop: 3 }}>{relativeTime(a.created_at)}</div>
                        </div>
                      ))}
                    </div>
                }
              </div>
            )}

            {/* PLUGINS */}
            {projectTab === "plugins" && (
              <div>
                {(activeProject.plugins || []).length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 4 }}>CONNECTED</div>
                    {PLUGINS.filter(p => (activeProject.plugins || []).includes(p.id)).map(plug => (
                      <div key={plug.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: bg2, borderRadius: 8, border: `1px solid ${border}` }}>
                        <span style={{ fontSize: 16, color: text, width: 20, textAlign: "center", flexShrink: 0 }}>{plug.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: text }}>{plug.name}</div>
                          <div style={{ fontSize: 11, color: textMuted }}>{plug.desc}</div>
                        </div>
                        <button className="hb" onClick={() => handleAddPlugin(plug.id, activeProject)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>remove</button>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>ADD PLUGIN</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {PLUGINS.filter(p => !(activeProject.plugins || []).includes(p.id)).map(plug => (
                      <button key={plug.id} className="hb" onClick={() => handleAddPlugin(plug.id, activeProject)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "12px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: textMuted, display: "flex", gap: 12, alignItems: "center", textAlign: "left", transition: "border 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = text} onMouseLeave={e => e.currentTarget.style.borderColor = border}>
                        <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{plug.icon}</span>
                        <div>
                          <div style={{ color: text, marginBottom: 2 }}>{plug.name}</div>
                          <div style={{ fontSize: 11 }}>{plug.desc}</div>
                        </div>
                        <span style={{ marginLeft: "auto", fontSize: 11 }}>+ connect</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FULL PROFILE VIEW — other users */}
      {viewFullProfile && (
        <div className="pad fu" style={{ width: "100%", padding: "48px 32px" }}>
          <button onClick={() => setViewFullProfile(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 28 }}>← back</button>

          {/* Identity — mirrors own profile */}
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 20 }}>PROFILE</div>
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 20 }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
                <Avatar initials={initials(viewFullProfile.name)} size={52} dark={dark} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{viewFullProfile.name}</div>
                  {viewFullProfile.username && <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>@{viewFullProfile.username}</div>}
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{viewFullProfile.role}</div>
                  {viewFullProfile.location && <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>{viewFullProfile.location}</div>}
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button onClick={() => setShowCollaborators(viewFullProfile.id)} style={{ background: "none", border: "none", color: getCollaborators(viewFullProfile.id).length > 0 ? text : textMuted, cursor: getCollaborators(viewFullProfile.id).length > 0 ? "pointer" : "default", fontFamily: "inherit", fontSize: 11, padding: 0, fontWeight: getCollaborators(viewFullProfile.id).length > 0 ? 500 : 400 }}>
                      {getCollaborators(viewFullProfile.id).length} collaborator{getCollaborators(viewFullProfile.id).length !== 1 ? "s" : ""}
                    </button>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>{projects.filter(p => p.owner_id === viewFullProfile.id).length} project{projects.filter(p => p.owner_id === viewFullProfile.id).length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>
            </div>
            {viewFullProfile.banner_pixels && (
              <div style={{ flex: 1, minWidth: 0, border: `1px solid ${border}`, borderRadius: 8, overflow: "hidden", background: dark ? "#000" : "#fff" }}>
                <PixelBannerDisplay pixels={(() => { try { return JSON.parse(viewFullProfile.banner_pixels); } catch { return []; } })()} dark={dark} height={80} />
              </div>
            )}
          </div>
          {viewFullProfile.bio && <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 20 }}>{viewFullProfile.bio}</p>}

          {/* Skills */}
          <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>SKILLS</div>
            {(viewFullProfile.skills || []).length === 0
              ? <div style={{ fontSize: 12, color: textMuted }}>no skills listed.</div>
              : <div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                    {viewFullProfile.skills.map(s => {
                      const shared = (profile?.skills || []).includes(s);
                      return <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${shared ? (dark ? "#ffffff40" : "#00000030") : border}`, borderRadius: 3, color: shared ? text : textMuted, fontWeight: shared ? 500 : 400 }}>{s}{shared ? " ★" : ""}</span>;
                    })}
                  </div>
                  {viewFullProfile.skills.filter(s => (profile?.skills || []).includes(s)).length > 0 &&
                    <div style={{ fontSize: 10, color: textMuted }}>★ {viewFullProfile.skills.filter(s => (profile?.skills || []).includes(s)).length} shared skills with you</div>
                  }
                </div>
            }
          </div>

          {/* Portfolio */}
          <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>PORTFOLIO</div>
            <FullProfilePortfolio userId={viewFullProfile.id} dark={dark} bg={bg} bg2={bg2} border={border} text={text} textMuted={textMuted} labelStyle={labelStyle} />
          </div>

          {/* Projects */}
          <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>PROJECTS</div>
            {projects.filter(p => p.owner_id === viewFullProfile.id).length === 0
              ? <div style={{ fontSize: 12, color: textMuted }}>no projects yet.</div>
              : projects.filter(p => p.owner_id === viewFullProfile.id).map(p => (
                  <div key={p.id} style={{ padding: "12px 0", borderBottom: `1px solid ${border}`, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.6"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                    onClick={() => { setActiveProject(p); loadProjectData(p.id); setViewFullProfile(null); setAppScreen("workspace"); }}>
                    <div style={{ fontSize: 13, color: text, marginBottom: 4 }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: textMuted, marginBottom: 6 }}>{p.description?.slice(0, 80)}{p.description?.length > 80 ? "..." : ""}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {(p.skills || []).map(s => <span key={s} style={{ fontSize: 10, padding: "1px 7px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
                    </div>
                  </div>
                ))
            }
          </div>

          {/* Activity — applications they've sent */}
          <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>ACTIVITY</div>
            {applications.filter(a => a.applicant_id === viewFullProfile.id && a.status === "accepted").length === 0
              ? <div style={{ fontSize: 12, color: textMuted }}>no public activity.</div>
              : applications.filter(a => a.applicant_id === viewFullProfile.id && a.status === "accepted").slice(0, 5).map(a => {
                  const p = projects.find(proj => proj.id === a.project_id);
                  return p ? (
                    <div key={a.id} style={{ padding: "10px 14px", background: bg2, borderRadius: 8, border: `1px solid ${border}`, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div><div style={{ fontSize: 12, color: text, marginBottom: 2 }}>Collaborating on {p.title}</div><div style={{ fontSize: 10, color: textMuted }}>{new Date(a.created_at).toLocaleDateString()}</div></div>
                      <span style={{ fontSize: 10, color: text, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px" }}>collaborator</span>
                    </div>
                  ) : null;
                })
            }
          </div>

          {/* Actions */}
          {viewFullProfile.id !== authUser?.id && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => handleFollow(viewFullProfile.id)} style={{ flex: 1, background: following.includes(viewFullProfile.id) ? bg3 : text, color: following.includes(viewFullProfile.id) ? textMuted : bg, border: `1px solid ${following.includes(viewFullProfile.id) ? border : text}`, borderRadius: 8, padding: "12px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", minWidth: 100 }}>
                {following.includes(viewFullProfile.id) ? "following" : "follow"}
              </button>
              <button onClick={() => { openDm(viewFullProfile); setViewFullProfile(null); }} style={{ flex: 1, background: "none", color: text, border: `1px solid ${border}`, borderRadius: 8, padding: "12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", minWidth: 100 }}>message</button>
              <button onClick={() => { setShowCreate(true); }} style={{ flex: 1, background: "none", color: text, border: `1px solid ${border}`, borderRadius: 8, padding: "12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", minWidth: 100 }}>collaborate →</button>
            </div>
          )}
        </div>
      )}

      {/* PROFILE */}
      {appScreen === "profile" && (
        <div className="pad fu" style={{ width: "100%", padding: "48px 32px" }}>
          {!editProfile ? (
            <div>
              {/* Identity + Banner side by side */}
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 20 }}>PROFILE</div>
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 20 }}>
                {/* Left: identity */}
                <div style={{ flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
                    <Avatar initials={myInitials} size={52} dark={dark} />
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{profile?.name || "Anonymous"}</div>
                      {profile?.username
                        ? <div style={{ fontSize: 11, color: textMuted, marginTop: 1, cursor: "pointer" }} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/u/${profile.username}`).catch(() => {}); showToast("Profile link copied!"); }} title="click to copy profile link">@{profile.username} ↗</div>
                        : <div style={{ fontSize: 11, color: textMuted, marginTop: 1, cursor: "pointer", textDecoration: "underline" }} onClick={() => setEditProfile(true)}>set a username →</div>
                      }
                      <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{profile?.role}</div>
                      {profile?.location && <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>{profile.location}</div>}
                      <div style={{ fontSize: 11, color: textMuted, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <button onClick={() => setShowCollaborators(authUser?.id)} style={{ background: "none", border: "none", color: myCollaborators.length > 0 ? text : textMuted, cursor: myCollaborators.length > 0 ? "pointer" : "default", fontFamily: "inherit", fontSize: 11, padding: 0, fontWeight: myCollaborators.length > 0 ? 500 : 400 }}>
                          {myCollaborators.length} collaborator{myCollaborators.length !== 1 ? "s" : ""}
                        </button>
                        <span style={{ opacity: 0.4 }}>·</span>
                        <span>{myProjects.length} project{myProjects.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>{followers.length} follower{followers.length !== 1 ? "s" : ""} · {following.length} following</div>
                    </div>
                  </div>
                </div>
                {/* Right: pixel banner */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ position: "relative", border: `1px solid ${border}`, borderRadius: 8, overflow: "hidden", background: dark ? "#000" : "#fff", minHeight: 80, cursor: "pointer" }} onClick={() => setShowBannerEditor(true)}>
                    {bannerPixels.some(v => v) ? (
                      <PixelBannerDisplay pixels={bannerPixels} dark={dark} height={80} />
                    ) : (
                      <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 11, color: textMuted }}>+ design your banner</span>
                      </div>
                    )}
                    <div style={{ position: "absolute", bottom: 4, right: 6, fontSize: 9, color: textMuted, opacity: 0.6 }}>edit</div>
                  </div>
                </div>
              </div>
              {profile?.bio && <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 20 }}>{profile.bio}</p>}
              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>SKILLS</div>
                {(profile?.skills || []).length === 0
                  ? <div style={{ fontSize: 12, color: textMuted }}>no skills. <button onClick={() => setEditProfile(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>add →</button></div>
                  : <div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>{(profile?.skills || []).map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>★ {forYou.length} matching project{forYou.length !== 1 ? "s" : ""} <button className="hb" onClick={() => { setAppScreen("explore"); setExploreTab("for-you"); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline", marginLeft: 4 }}>view →</button></div>
                    </div>
                }
              </div>

              {/* Portfolio */}
              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ ...labelStyle, marginBottom: 0 }}>PORTFOLIO</div>
                  <button className="hb" onClick={() => setShowAddPortfolio(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>+ add work</button>
                </div>
                {portfolioItems.length === 0
                  ? <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.75 }}>your portfolio lives here.<br />add projects, work samples, and links you're proud of.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {portfolioItems.map((item, i) => (
                        <div key={item.id} style={{ background: bg2, borderRadius: i === 0 && portfolioItems.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === portfolioItems.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < portfolioItems.length - 1 ? "none" : `1px solid ${border}`, padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 14, color: text, marginBottom: 5, letterSpacing: "-0.3px" }}>{item.title}</div>
                            {item.description && <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 6 }}>{item.description}</div>}
                            {item.url && (
                                item.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                                  ? <img src={item.url} alt={item.title} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, border: `1px solid ${border}`, marginTop: 4 }} />
                                  : <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: text, textDecoration: "underline", wordBreak: "break-all" }}>{item.url.includes("user-uploads") ? "view file" : item.url}</a>
                            )}
                          </div>
                          <button className="hb" onClick={() => handleDeletePortfolioItem(item.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                }
              </div>

              {/* Activity */}
              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
                <div style={{ ...labelStyle, marginBottom: 16 }}>ACTIVITY</div>
                {applications.filter(a => a.applicant_id === authUser?.id).length === 0
                  ? <div style={{ fontSize: 12, color: textMuted }}>no activity yet.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {applications.filter(a => a.applicant_id === authUser?.id).slice(0, 6).map(a => {
                        const p = projects.find(proj => proj.id === a.project_id);
                        return p ? (
                          <div key={a.id} style={{ padding: "10px 14px", background: bg2, borderRadius: 8, border: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                            <div><div style={{ fontSize: 12, color: text, marginBottom: 2 }}>Applied to {p.title}</div><div style={{ fontSize: 10, color: textMuted }}>{new Date(a.created_at).toLocaleDateString()}</div></div>
                            <span style={{ fontSize: 10, color: a.status === "accepted" ? text : textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>{a.status}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                }
              </div>

              {/* Posts */}
              <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>
                <div style={{ ...labelStyle, marginBottom: 16 }}>POSTS</div>
                {posts.filter(p => p.user_id === authUser?.id).length === 0
                  ? <div style={{ fontSize: 12, color: textMuted }}>no posts yet. <button className="hb" onClick={() => setAppScreen("network")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>share something →</button></div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {posts.filter(p => p.user_id === authUser?.id).slice(0, 5).map(post => (
                        <div key={post.id} style={{ padding: "12px 14px", background: bg2, borderRadius: 8, border: `1px solid ${border}` }}>
                          <div style={{ fontSize: 13, color: text, lineHeight: 1.6, marginBottom: 6 }}>{post.content}</div>
                          {post.media_url && post.media_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) && (
                            <img src={post.media_url} alt="" style={{ maxWidth: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 6, marginBottom: 6 }} />
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: textMuted }}>♥ {post.like_count || 0}</span>
                              {post.project_title && <span style={{ fontSize: 10, color: textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px" }}>↗ {post.project_title}</span>}
                            </div>
                            <span style={{ fontSize: 10, color: textMuted }}>{new Date(post.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="hb" onClick={() => setEditProfile(true)} style={btnG}>edit profile</button>
                <button className="hb" onClick={() => { if (profile?.username) { navigator.clipboard.writeText(`${window.location.origin}/u/${profile.username}`).catch(() => {}); showToast("Profile link copied!"); } else { setEditProfile(true); showToast("Set a username first →"); } }} style={btnG}>share profile ↗</button>
                <button className="hb" onClick={handleSignOut} style={{ ...btnG, color: textMuted }}>sign out</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 20 }}>EDIT PROFILE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 22 }}>
                <div><label style={labelStyle}>DISPLAY NAME</label><input style={inputStyle} value={profile?.name || ""} onChange={e => setProfile({ ...profile, name: e.target.value })} /></div>
                <div><label style={labelStyle}>USERNAME</label>
                  <div style={{ display: "flex", alignItems: "center", background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "0 14px" }}>
                    <span style={{ fontSize: 13, color: textMuted }}>@</span>
                    <input style={{ ...inputStyle, border: "none", background: "none", padding: "10px 6px" }} value={profile?.username || ""} onChange={e => setProfile({ ...profile, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="yourhandle" />
                  </div>
                </div>
                <div><label style={labelStyle}>ROLE</label><input style={inputStyle} placeholder="Founder, Designer, Engineer..." value={profile?.role || ""} onChange={e => setProfile({ ...profile, role: e.target.value })} /></div>
                <div><label style={labelStyle}>LOCATION</label><input style={inputStyle} placeholder="City, State or Country" value={profile?.location || ""} onChange={e => setProfile({ ...profile, location: e.target.value })} /></div>
                <div><label style={labelStyle}>BIO</label><textarea style={{ ...inputStyle, resize: "none" }} rows={4} value={profile?.bio || ""} onChange={e => setProfile({ ...profile, bio: e.target.value })} /></div>
                <div>
                  <label style={labelStyle}>SKILLS</label>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {SKILLS.map(s => { const sel = (profile?.skills || []).includes(s); return <button key={s} className="hb" onClick={() => setProfile({ ...profile, skills: sel ? profile.skills.filter(x => x !== s) : [...(profile?.skills || []), s] })} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="hb" onClick={() => setEditProfile(false)} style={btnG}>cancel</button>
                <button className="hb" onClick={handleSaveProfile} style={{ ...btnP, flex: 1 }}>save</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ADD PORTFOLIO MODAL */}
      {showAddPortfolio && (
        <div onClick={() => setShowAddPortfolio(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(10px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "24px", width: "100%", maxWidth: 440 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 16 }}>ADD TO PORTFOLIO</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={labelStyle}>TITLE</label><input style={inputStyle} placeholder="Project or work title" value={newPortfolioItem.title} onChange={e => setNewPortfolioItem({ ...newPortfolioItem, title: e.target.value })} /></div>
              <div><label style={labelStyle}>DESCRIPTION</label><textarea style={{ ...inputStyle, resize: "none" }} rows={3} placeholder="What did you build or create?" value={newPortfolioItem.description} onChange={e => setNewPortfolioItem({ ...newPortfolioItem, description: e.target.value })} /></div>
              <div>
                <label style={labelStyle}>MEDIA / FILE</label>
                {newPortfolioItem.url && (
                  <div style={{ marginBottom: 8, position: "relative", display: "inline-block" }}>
                    {newPortfolioItem.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                      ? <img src={newPortfolioItem.url} alt="" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, border: `1px solid ${border}` }} />
                      : <div style={{ fontSize: 11, color: textMuted, padding: "6px 10px", background: bg2, borderRadius: 6 }}>file: {newPortfolioItem.url.split("/").pop()}</div>
                    }
                    <button onClick={() => setNewPortfolioItem({ ...newPortfolioItem, url: "" })} style={{ position: "absolute", top: 4, right: 4, background: bg, border: `1px solid ${border}`, borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", color: text, fontFamily: "inherit" }}>✕</button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ cursor: "pointer", flexShrink: 0 }}>
                    <div style={{ ...btnG, padding: "8px 14px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}>↑ upload file</div>
                    <input type="file" accept="image/*,.pdf,.doc,.docx,.mp4,.mov" style={{ display: "none" }} onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      showToast("Uploading...");
                      const path = `portfolio/${authUser.id}/${Date.now()}-${file.name}`;
                      const { error } = await supabase.storage.from("user-uploads").upload(path, file);
                      if (error) { showToast("Upload failed."); return; }
                      const { data: { publicUrl } } = supabase.storage.from("user-uploads").getPublicUrl(path);
                      setNewPortfolioItem({ ...newPortfolioItem, url: publicUrl });
                      showToast("File ready.");
                    }} />
                  </label>
                  <input style={{ ...inputStyle, fontSize: 11, padding: "8px 12px" }} placeholder="or paste a URL..." value={newPortfolioItem.url} onChange={e => setNewPortfolioItem({ ...newPortfolioItem, url: e.target.value })} />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="hb" onClick={() => setShowAddPortfolio(false)} style={btnG}>cancel</button>
              <button className="hb" onClick={handleAddPortfolioItem} style={{ ...btnP, flex: 1 }}>add →</button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(10px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "24px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 12 }}>NEW PROJECT</div>
            <h2 style={{ fontSize: 20, fontWeight: 400, letterSpacing: "-1px", marginBottom: 20, color: text }}>What are you building?</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={labelStyle}>TITLE</label><input style={inputStyle} placeholder="Project name" value={newProject.title} onChange={e => setNewProject({ ...newProject, title: e.target.value })} /></div>
              <div><label style={labelStyle}>DESCRIPTION</label><textarea style={{ ...inputStyle, resize: "none" }} rows={4} placeholder="What are you building? What do you need?" value={newProject.description} onChange={e => setNewProject({ ...newProject, description: e.target.value })} /></div>
              <div><label style={labelStyle}>CATEGORY</label><select style={inputStyle} value={newProject.category} onChange={e => setNewProject({ ...newProject, category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
              <div>
                <label style={labelStyle}>SKILLS NEEDED</label>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {SKILLS.map(s => { const sel = newProject.skills.includes(s); return <button key={s} className="hb" onClick={() => setNewProject({ ...newProject, skills: sel ? newProject.skills.filter(x => x !== s) : [...newProject.skills, s] })} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                </div>
              </div>
              <div><label style={labelStyle}>COLLABORATORS NEEDED</label><select style={inputStyle} value={newProject.maxCollaborators} onChange={e => setNewProject({ ...newProject, maxCollaborators: parseInt(e.target.value) })}>{[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
              <div><label style={labelStyle}>LOCATION (optional)</label><input style={inputStyle} placeholder="City, remote, or global" value={newProject.location} onChange={e => setNewProject({ ...newProject, location: e.target.value })} /></div>
              <div><label style={labelStyle}>GOALS / CHECKPOINTS (optional)</label><textarea style={{ ...inputStyle, resize: "none" }} rows={3} placeholder="What does done look like? List key milestones or deliverables..." value={newProject.goals} onChange={e => setNewProject({ ...newProject, goals: e.target.value })} /></div>
              <div><label style={labelStyle}>TIMELINE (optional)</label><input style={inputStyle} placeholder="e.g. 8 weeks, by end of Q2, 3 months..." value={newProject.timeline} onChange={e => setNewProject({ ...newProject, timeline: e.target.value })} /></div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
                <div>
                  <div style={{ fontSize: 11, color: text }}>Private project</div>
                  <div style={{ fontSize: 10, color: textMuted }}>Only visible to team members and invited people</div>
                </div>
                <button className="hb" onClick={() => setNewProject({ ...newProject, is_private: !newProject.is_private })}
                  style={{ background: newProject.is_private ? text : "none", border: `1px solid ${border}`, borderRadius: 20, padding: "3px 12px", fontSize: 10, cursor: "pointer", color: newProject.is_private ? bg : textMuted, fontFamily: "inherit" }}>
                  {newProject.is_private ? "on" : "off"}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="hb" onClick={() => { setShowCreate(false); setNewProject({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2, location: "", goals: "", timeline: "", is_private: false }); }} style={btnG}>cancel</button>
              <button className="hb" onClick={handlePostProject} style={{ ...btnP, flex: 1 }}>post →</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: text, color: bg, padding: "11px 20px", borderRadius: 8, fontSize: 11, zIndex: 300, animation: "tin 0.3s ease", whiteSpace: "nowrap" }}>{toast}</div>}

      {showShipModal && (
        <div onClick={() => setShowShipModal(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 460 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>SHIP IT</div>
            <div style={{ fontSize: 18, fontWeight: 400, letterSpacing: "-0.5px", color: text, marginBottom: 6 }}>All tasks complete.</div>
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 20 }}>Mark this project as shipped and share what you built with your network.</div>
            <textarea
              value={shipPostContent}
              onChange={e => setShipPostContent(e.target.value)}
              placeholder="What did you build? Who did you build it with?"
              style={{ ...inputStyle, resize: "none", minHeight: 100, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="hb" onClick={() => setShowShipModal(false)} style={{ ...btnG, flex: 1 }}>later</button>
              <button className="hb" onClick={() => handleShipProject(activeProject?.id, shipPostContent)} style={{ ...btnP, flex: 2 }}>ship it →</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div onClick={() => setShowSettings(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.92)" : "rgba(200,200,200,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(12px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 420 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>ACCOUNT SETTINGS</div>
              <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>CHANGE EMAIL</div>
                <input placeholder="New email address" value={settingsEmail} onChange={e => setSettingsEmail(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 8 }} />
                <button className="hb" onClick={handleUpdateEmail}
                  style={{ ...btnP, width: "100%" }}>update email</button>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 6 }}>You'll receive a confirmation at your new address.</div>
              </div>
              <div style={{ borderTop: `1px solid ${border}`, paddingTop: 20 }}>
                <div style={{ fontSize: 11, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>CHANGE PASSWORD</div>
                <input type="password" placeholder="New password (min 8 chars)" value={settingsNewPassword} onChange={e => setSettingsNewPassword(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 8 }} />
                <button className="hb" onClick={handleUpdatePassword}
                  style={{ ...btnP, width: "100%" }}>update password</button>
              </div>
              <div style={{ borderTop: `1px solid ${border}`, paddingTop: 20 }}>
                <div style={{ fontSize: 11, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>DANGER ZONE</div>
                <button className="hb" onClick={async () => { if (window.confirm("Sign out of all devices?")) { await supabase.auth.signOut(); } }}
                  style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "7px 14px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit", width: "100%" }}>
                  sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PUBLIC PROFILE PAGE ──
function PublicProfilePage({ username }) {
  const [dark, setDark] = useState(true);
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
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
    async function load() {
      const { data: u } = await supabase.from("profiles").select("*").eq("username", username).single();
      if (!u) { setNotFound(true); setLoading(false); return; }
      setUser(u);
      const [{ data: projs }, { data: port }] = await Promise.all([
        supabase.from("projects").select("*").eq("owner_id", u.id).order("created_at", { ascending: false }),
        supabase.from("portfolio_items").select("*").eq("user_id", u.id),
      ]);
      setProjects(projs || []);
      setPortfolio(port || []);
      setLoading(false);
    }
    load();
  }, [username]);

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

  const bannerPixels = (() => { try { return user.banner_pixels ? JSON.parse(user.banner_pixels) : null; } catch { return null; } })();

  return (
    <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'DM Mono', monospace" }}>
      <style>{CSS}</style>

      {/* Nav */}
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

      {/* Banner */}
      {bannerPixels && bannerPixels.some(v => v) && (
        <div style={{ width: "100%", height: 80, overflow: "hidden", borderBottom: `1px solid ${border}` }}>
          <svg width="100%" height="100%" viewBox={`0 0 48 12`} preserveAspectRatio="none" style={{ display: "block" }}>
            {bannerPixels.map((v, i) => v ? <rect key={i} x={i % 48} y={Math.floor(i / 48)} width={1} height={1} fill={dark ? "#ffffff" : "#000000"} opacity={0.9} /> : null)}
          </svg>
        </div>
      )}

      {/* Content */}
      <div className="fu" style={{ maxWidth: 700, margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* Header */}
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

        {/* Bio */}
        {user.bio && <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.85, marginBottom: 28 }}>{user.bio}</p>}

        {/* Skills */}
        {(user.skills || []).length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 10 }}>SKILLS</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {user.skills.map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
            </div>
          </div>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 12 }}>PROJECTS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {projects.map((p, i) => (
                <a key={p.id} href={`/p/${p.id}`} style={{ display: "block", background: bg2, border: `1px solid ${border}`, borderRadius: i === 0 && projects.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === projects.length - 1 ? "0 0 8px 8px" : 0, borderBottom: i < projects.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px", textDecoration: "none", transition: "opacity 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 4 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: textMuted, marginBottom: 6 }}>{p.category}</div>
                  {(p.skills || []).length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {p.skills.slice(0, 4).map(s => <span key={s} style={{ fontSize: 10, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Portfolio */}
        {portfolio.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 12 }}>PORTFOLIO</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {portfolio.map((item, i) => (
                <div key={item.id} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: i === 0 && portfolio.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === portfolio.length - 1 ? "0 0 8px 8px" : 0, borderBottom: i < portfolio.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px" }}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 4 }}>{item.title}</div>
                  {item.description && <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 6 }}>{item.description}</div>}
                  {item.url && (item.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                    ? <img src={item.url} alt={item.title} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 6, border: `1px solid ${border}`, marginTop: 4 }} />
                    : <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: text, textDecoration: "underline", wordBreak: "break-all" }}>{item.url.includes("user-uploads") ? "view file" : item.url}</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${border}`, marginBottom: 28 }} />

        {/* CTA */}
        <a href="/" style={{ display: "block", background: text, color: bg, border: "none", borderRadius: 8, padding: "14px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", textDecoration: "none", textAlign: "center" }}>Connect on CoLab →</a>

        <div style={{ marginTop: 32, fontSize: 11, color: textMuted, lineHeight: 1.7, borderTop: `1px solid ${border}`, paddingTop: 24 }}>
          <a href={`@${user.username}`} style={{ color: text, textDecoration: "none" }}>@{user.username}</a> is a builder on <a href="/" style={{ color: text, textDecoration: "underline" }}>CoLab</a> — find collaborators, ship together.
        </div>
      </div>

      {copied && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: text, color: bg, padding: "10px 18px", borderRadius: 8, fontSize: 11, zIndex: 300, animation: "tin 0.3s ease", whiteSpace: "nowrap" }}>link copied to clipboard</div>}
    </div>
  );
}

function JoinPage({ token }) {
  const [status, setStatus] = React.useState("loading");
  const [projectTitle, setProjectTitle] = React.useState("");
  const [projectId, setProjectId] = React.useState(null);

  React.useEffect(() => {
    (async () => {
      const { data: invite } = await supabase.from("project_invites").select("*, projects(title)").eq("token", token).single();
      if (!invite) { setStatus("invalid"); return; }
      setProjectTitle(invite.projects?.title || "");
      setProjectId(invite.project_id);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setStatus("login"); return; }
      const { data: existing } = await supabase.from("applications").select("id, status").eq("project_id", invite.project_id).eq("applicant_id", session.user.id).single();
      if (existing?.status === "accepted") { window.location.href = "/"; return; }
      setStatus("join");
    })();
  }, [token]);

  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const bg = dark ? "#0a0a0a" : "#fafafa";
  const text = dark ? "#f0f0f0" : "#111";
  const textMuted = dark ? "#555" : "#aaa";

  const handleAcceptInvite = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !projectId) return;
    const { data: profile } = await supabase.from("profiles").select("name, role").eq("id", session.user.id).single();
    await supabase.from("applications").upsert({
      project_id: projectId,
      applicant_id: session.user.id,
      applicant_name: profile?.name || "",
      applicant_role: profile?.role || "",
      status: "accepted",
    }, { onConflict: "project_id,applicant_id" });
    window.location.href = "/";
  };

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace", color: text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ textAlign: "center", padding: 32, maxWidth: 400 }}>
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 24 }}>[CoLab]</div>
        {status === "loading" && <div style={{ fontSize: 13, color: textMuted }}>loading...</div>}
        {status === "invalid" && (
          <>
            <div style={{ fontSize: 14, marginBottom: 16 }}>invite link not found or expired.</div>
            <a href="/" style={{ fontSize: 12, color: text, textDecoration: "underline" }}>← back to CoLab</a>
          </>
        )}
        {status === "login" && (
          <>
            <div style={{ fontSize: 14, marginBottom: 8 }}>you've been invited to join</div>
            <div style={{ fontSize: 18, fontWeight: 400, marginBottom: 24 }}>{projectTitle}</div>
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 24 }}>sign in to accept the invite.</div>
            <a href="/" style={{ display: "inline-block", padding: "10px 24px", background: text, color: bg, borderRadius: 8, fontSize: 13, textDecoration: "none" }}>sign in →</a>
          </>
        )}
        {status === "join" && (
          <>
            <div style={{ fontSize: 14, marginBottom: 8 }}>you've been invited to join</div>
            <div style={{ fontSize: 18, fontWeight: 400, marginBottom: 24 }}>{projectTitle}</div>
            <button onClick={handleAcceptInvite}
              style={{ display: "inline-block", padding: "10px 24px", background: text, color: bg, borderRadius: 8, fontSize: 13, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              accept invite →
            </button>
            <div style={{ marginTop: 16 }}>
              <a href="/" style={{ fontSize: 11, color: textMuted, textDecoration: "none" }}>← back to CoLab</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ShippedPage({ projectId }) {
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
        <div style={{ fontSize: 48, marginBottom: 24 }}>🚀</div>
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

// ── ROUTER ──
const _publicMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/p\/([^/]+)$/) : null;
const _shippedMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/p\/([^/]+)\/shipped$/) : null;
const _profileMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/u\/([^/]+)$/) : null;
const _joinMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/join\/([^/]+)$/) : null;

export { CoLab };
export default function App() {
  if (_shippedMatch) return <ShippedPage projectId={_shippedMatch[1]} />;
  if (_publicMatch) return <PublicProjectPage projectId={_publicMatch[1]} />;
  if (_profileMatch) return <PublicProfilePage username={_profileMatch[1]} />;
  if (_joinMatch) return <JoinPage token={_joinMatch[1]} />;
  return <CoLab />;
}
