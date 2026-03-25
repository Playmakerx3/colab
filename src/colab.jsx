import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const SKILLS = ["Design", "Engineering", "Marketing", "Finance", "Legal", "Writing", "Video", "Music", "Photography", "Data", "AI/ML", "Product", "Sales", "Operations", "3D/CAD", "Architecture"];
const CATEGORIES = ["Tech / Software", "Creative / Art", "Music", "Film / Video", "Physical / Hardware", "Business / Startup", "Social Impact", "Research", "Other"];
const PLUGINS = [
  { id: "slack", name: "Slack", icon: "#", desc: "Team messaging" },
  { id: "discord", name: "Discord", icon: "◈", desc: "Voice & chat" },
  { id: "drive", name: "Google Drive", icon: "△", desc: "File sharing" },
  { id: "notion", name: "Notion", icon: "□", desc: "Docs & tasks" },
  { id: "github", name: "GitHub", icon: "◎", desc: "Code & repos" },
  { id: "figma", name: "Figma", icon: "◐", desc: "Design files" },
];

function Avatar({ initials, size = 32, dark }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: dark ? "#fff" : "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.32, fontWeight: 700, color: dark ? "#000" : "#fff", flexShrink: 0, fontFamily: "inherit" }}>
      {(initials || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function ProgressBar({ value, dark }) {
  return (
    <div style={{ background: dark ? "#1a1a1a" : "#e8e8e8", borderRadius: 4, height: 3, width: "100%", overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: dark ? "#fff" : "#000", borderRadius: 4, transition: "width 0.4s ease" }} />
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

export default function CoLab() {
  const [dark, setDark] = useState(true);
  const [screen, setScreen] = useState("landing");
  const [appScreen, setAppScreen] = useState("explore");
  const [exploreTab, setExploreTab] = useState("for-you");
  const [networkTab, setNetworkTab] = useState("people");
  const [activeProject, setActiveProject] = useState(null);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [projectTab, setProjectTab] = useState("tasks");

  // Auth state
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login"); // login | signup
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [onboardStep, setOnboardStep] = useState(0);
  const [onboardData, setOnboardData] = useState({ name: "", role: "", bio: "", skills: [] });

  // Data state
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [applications, setApplications] = useState([]);
  const [following, setFollowing] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  // UI state
  const [showNotifications, setShowNotifications] = useState(false);
  const [filterSkill, setFilterSkill] = useState(null);
  const [networkFilter, setNetworkFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newProject, setNewProject] = useState({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2 });
  const [newTaskText, setNewTaskText] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newUpdate, setNewUpdate] = useState("");
  const [editProfile, setEditProfile] = useState(false);
  const [dmOpen, setDmOpen] = useState(null);
  const [dmMessages, setDmMessages] = useState({});
  const [dmInput, setDmInput] = useState("");
  const messagesEndRef = useRef(null);

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
  const myInitials = profile?.name ? profile.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "ME";
  const getMatchScore = (p) => (profile?.skills || []).filter(s => (p.skills || []).includes(s)).length;

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; padding: 0; width: 100%; overflow-x: hidden; background: #0a0a0a; }
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
    }
  `;

  // ── AUTH INIT ──
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
    if (data) {
      setProfile(data);
      setScreen("app");
      setAuthLoading(false);
      loadAllData(userId);
    } else {
      setScreen("onboard");
      setAuthLoading(false);
    }
  };

  const loadAllData = async (userId) => {
    setLoading(true);
    try {
      const [{ data: projs }, { data: usrs }, { data: apps }, { data: fols }] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("*"),
        supabase.from("applications").select("*").eq("status", "pending"),
        supabase.from("follows").select("*").eq("follower_id", userId),
      ]);
      setProjects(projs || []);
      setUsers(usrs || []);
      setApplications(apps || []);
      setFollowing((fols || []).map(f => f.following_id));
      const pendingApps = (apps || []).filter(a => {
        const proj = (projs || []).find(p => p.id === a.project_id);
        return proj?.owner_id === userId;
      });
      setNotifications(pendingApps.map(a => ({
        id: a.id, type: "application", text: `${a.applicant_name} applied to your project`,
        sub: (projs || []).find(p => p.id === a.project_id)?.title || "",
        time: new Date(a.created_at).toLocaleDateString(), read: false, projectId: a.project_id,
        applicant: { initials: a.applicant_initials, name: a.applicant_name, role: a.applicant_role, bio: a.applicant_bio, id: a.applicant_id }
      })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadProjectData = async (projectId) => {
    const [{ data: t }, { data: m }, { data: u }] = await Promise.all([
      supabase.from("tasks").select("*").eq("project_id", projectId).order("created_at"),
      supabase.from("messages").select("*").eq("project_id", projectId).order("created_at"),
      supabase.from("updates").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    ]);
    setTasks(t || []);
    setMessages(m || []);
    setUpdates(u || []);
  };

  // ── AUTH ACTIONS ──
  const handleSignUp = async () => {
    setAuthError("");
    const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (error) { setAuthError(error.message); return; }
    if (data.user) {
      setAuthUser(data.user);
      setScreen("onboard");
      showToast("Account created! Set up your profile.");
    }
  };

  const handleLogin = async () => {
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfile(null); setProjects([]); setUsers([]); setFollowing([]);
    setScreen("landing");
  };

  const handleFinishOnboard = async () => {
    if (!onboardData.name) return;
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) { setAuthError("Session expired. Please log in again."); setScreen("auth"); return; }
      const initials = onboardData.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
      const { data, error } = await supabase.from("profiles").upsert({
        id: user.id,
        name: onboardData.name,
        role: onboardData.role || "",
        bio: onboardData.bio || "",
        skills: onboardData.skills || [],
      }, { onConflict: "id" }).select().single();
      if (error) { console.error("Profile save error:", error); showToast("Error saving profile. Try again."); return; }
      if (data) {
        setProfile(data);
        setScreen("app");
        setAppScreen("explore");
        loadAllData(user.id);
        showToast(`Welcome, ${data.name.split(" ")[0]}!`);
      }
    } catch (e) {
      console.error(e);
      showToast("Something went wrong. Try again.");
    }
  };

  const handleSaveProfile = async () => {
    const { data, error } = await supabase.from("profiles").update({
      name: profile.name, role: profile.role, bio: profile.bio, skills: profile.skills,
    }).eq("id", authUser.id).select().single();
    if (!error) { setProfile(data); setEditProfile(false); showToast("Profile saved."); }
  };

  // ── PROJECT ACTIONS ──
  const handlePostProject = async () => {
    if (!newProject.title || !newProject.description) return;
    const initials = myInitials;
    const { data, error } = await supabase.from("projects").insert({
      ...newProject, max_collaborators: newProject.maxCollaborators,
      owner_id: authUser.id, owner_name: profile.name, owner_initials: initials,
      status: "open", progress: 0, plugins: [], collaborators: 0,
    }).select().single();
    if (!error && data) {
      setProjects([data, ...projects]);
      setNewProject({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2 });
      setShowCreate(false);
      showToast("Project posted.");
    }
  };

  // ── TASK ACTIONS ──
  const handleAddTask = async (projectId) => {
    if (!newTaskText.trim()) return;
    const { data, error } = await supabase.from("tasks").insert({ project_id: projectId, text: newTaskText, done: false }).select().single();
    if (!error) { setTasks([...tasks, data]); setNewTaskText(""); }
  };

  const handleToggleTask = async (task) => {
    const { data } = await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id).select().single();
    if (data) setTasks(tasks.map(t => t.id === task.id ? data : t));
  };

  const handleDeleteTask = async (taskId) => {
    await supabase.from("tasks").delete().eq("id", taskId);
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  // ── MESSAGE ACTIONS ──
  const handleSendMessage = async (projectId) => {
    if (!newMessage.trim()) return;
    const { data } = await supabase.from("messages").insert({
      project_id: projectId, from_user: authUser.id,
      from_initials: myInitials, from_name: profile.name, text: newMessage,
    }).select().single();
    if (data) { setMessages([...messages, data]); setNewMessage(""); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50); }
  };

  // ── UPDATE ACTIONS ──
  const handlePostUpdate = async (projectId) => {
    if (!newUpdate.trim()) return;
    const { data } = await supabase.from("updates").insert({
      project_id: projectId, author_id: authUser.id,
      author: profile.name, initials: myInitials, text: newUpdate,
    }).select().single();
    if (data) { setUpdates([data, ...updates]); setNewUpdate(""); showToast("Update posted."); }
  };

  // ── APPLICATION ACTIONS ──
  const handleApply = async (project) => {
    const already = applications.find(a => a.project_id === project.id && a.applicant_id === authUser.id);
    if (already) return;
    const { data } = await supabase.from("applications").insert({
      project_id: project.id, applicant_id: authUser.id,
      applicant_name: profile.name, applicant_initials: myInitials,
      applicant_role: profile.role, applicant_bio: profile.bio, status: "pending",
    }).select().single();
    if (data) {
      setApplications([...applications, data]);
      showToast(`Applied to "${project.title}"`);
      setActiveProject(null);
    }
  };

  const handleAccept = async (notif) => {
    await supabase.from("applications").update({ status: "accepted" }).eq("id", notif.id);
    await supabase.from("projects").update({ collaborators: supabase.rpc("increment", { x: 1 }) }).eq("id", notif.projectId);
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    showToast(`${notif.applicant.name} accepted!`);
    loadAllData(authUser.id);
  };

  const handleDecline = async (notif) => {
    await supabase.from("applications").update({ status: "declined" }).eq("id", notif.id);
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    showToast("Application declined.");
  };

  // ── FOLLOW ACTIONS ──
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

  // ── PLUGIN ACTIONS ──
  const handleAddPlugin = async (plugId, project) => {
    const newPlugins = project.plugins?.includes(plugId)
      ? project.plugins.filter(x => x !== plugId)
      : [...(project.plugins || []), plugId];
    await supabase.from("projects").update({ plugins: newPlugins }).eq("id", project.id);
    setProjects(projects.map(p => p.id === project.id ? { ...p, plugins: newPlugins } : p));
    if (activeProject?.id === project.id) setActiveProject({ ...activeProject, plugins: newPlugins });
    showToast("Plugin updated.");
  };

  const myProjects = projects.filter(p => p.owner_id === authUser?.id);
  const appliedProjectIds = applications.filter(a => a.applicant_id === authUser?.id).map(a => a.project_id);
  const browseBase = projects.filter(p => p.owner_id !== authUser?.id);
  const forYou = browseBase.map(p => ({ ...p, _s: getMatchScore(p) })).filter(p => p._s > 0).sort((a, b) => b._s - a._s);
  const allP = browseBase.map(p => ({ ...p, _s: getMatchScore(p) })).filter(p => (!filterSkill || (p.skills || []).includes(filterSkill)) && (!search || p.title?.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => b._s - a._s);
  const unreadCount = notifications.filter(n => !n.read).length;

  const TabBtn = ({ id, label, count, setter, current }) => (
    <button onClick={() => setter(id)} style={{ background: "none", border: "none", borderBottom: current === id ? `1px solid ${text}` : "1px solid transparent", color: current === id ? text : textMuted, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginRight: 20, transition: "all 0.15s", display: "inline-flex", gap: 5, alignItems: "center", whiteSpace: "nowrap" }}>
      {label}{count > 0 && <span style={{ fontSize: 10, background: bg3, borderRadius: 10, padding: "1px 6px", color: textMuted }}>{count}</span>}
    </button>
  );

  const PRow = ({ p }) => {
    const spots = (p.max_collaborators || 2) - (p.collaborators || 0);
    const owner = users.find(u => u.id === p.owner_id);
    return (
      <div style={{ borderBottom: `1px solid ${border}`, padding: "20px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start", cursor: "pointer", transition: "opacity 0.15s" }}
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
          <div style={{ fontSize: 11, color: spots > 0 ? text : textMuted, fontWeight: spots > 0 ? 500 : 300, marginBottom: 3 }}>{spots > 0 ? `${spots} open` : "full"}</div>
          <div style={{ fontSize: 10, color: textMuted }}>{p.category}</div>
        </div>
      </div>
    );
  };

  const UserCard = ({ u }) => {
    const sharedSkills = (profile?.skills || []).filter(s => (u.skills || []).includes(s));
    const userProjects = projects.filter(p => p.owner_id === u.id);
    return (
      <div onClick={() => setViewingProfile(u)} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 12, padding: "20px", cursor: "pointer", transition: "border 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = text} onMouseLeave={e => e.currentTarget.style.borderColor = border}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
          <Avatar initials={u.name?.split(" ").map(n => n[0]).join("").slice(0, 2)} size={44} dark={dark} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: text, letterSpacing: "-0.3px" }}>{u.name}</div>
            <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{u.role}</div>
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

  const ProfileView = ({ u, onClose }) => {
    const isFollowing = following.includes(u.id);
    const userProjects = projects.filter(p => p.owner_id === u.id);
    const sharedSkills = (profile?.skills || []).filter(s => (u.skills || []).includes(s));
    const uInitials = u.name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "?";
    return (
      <div style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.88)" : "rgba(220,220,220,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150, backdropFilter: "blur(10px)", padding: 16 }} onClick={onClose}>
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "32px 28px", width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>PROFILE</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            <Avatar initials={uInitials} size={52} dark={dark} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{u.name}</div>
              <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{u.role}</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 22 }}>{u.bio}</p>
          <div style={{ marginBottom: 22 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>SKILLS</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {(u.skills || []).map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${sharedSkills.includes(s) ? (dark ? "#ffffff40" : "#00000030") : border}`, borderRadius: 3, color: sharedSkills.includes(s) ? text : textMuted, fontWeight: sharedSkills.includes(s) ? 500 : 400 }}>{s}{sharedSkills.includes(s) ? " ★" : ""}</span>)}
            </div>
            {sharedSkills.length > 0 && <div style={{ fontSize: 11, color: textMuted, marginTop: 8 }}>★ {sharedSkills.length} shared skill{sharedSkills.length !== 1 ? "s" : ""} with you</div>}
          </div>
          <div style={{ marginBottom: 24 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>PROJECTS</div>
            {userProjects.length === 0 ? <div style={{ fontSize: 12, color: textMuted }}>no projects yet.</div>
              : userProjects.map(p => (
                <div key={p.id} style={{ padding: "10px 0", borderBottom: `1px solid ${border}`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.6"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                  onClick={() => { setActiveProject(p); loadProjectData(p.id); onClose(); setAppScreen("explore"); }}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 5 }}>{p.title}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {(p.skills || []).map(s => <span key={s} style={{ fontSize: 10, padding: "1px 7px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
                  </div>
                </div>
              ))
            }
          </div>
          {u.id !== authUser?.id && (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => handleFollow(u.id)} style={{ flex: 1, background: isFollowing ? bg3 : text, color: isFollowing ? textMuted : bg, border: `1px solid ${isFollowing ? border : text}`, borderRadius: 8, padding: "11px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                {isFollowing ? "following" : "follow"}
              </button>
              <button onClick={() => { setDmOpen(u); onClose(); }} style={{ flex: 1, background: "none", color: text, border: `1px solid ${border}`, borderRadius: 8, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                message
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const DmPanel = ({ u, onClose }) => {
    const msgs = dmMessages[u.id] || [];
    return (
      <div style={{ position: "fixed", bottom: 16, right: 16, width: 320, background: bg, border: `1px solid ${border}`, borderRadius: 12, zIndex: 250, boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.7)" : "0 8px 32px rgba(0,0,0,0.12)" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Avatar initials={u.name?.split(" ").map(n => n[0]).join("").slice(0, 2)} size={26} dark={dark} />
            <div style={{ fontSize: 13, color: text, fontWeight: 500 }}>{u.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {msgs.length === 0 ? <div style={{ fontSize: 11, color: textMuted }}>say something.</div>
            : msgs.map((m, i) => {
              const isMe = m.from === "me";
              return (
                <div key={i} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                  <div style={{ background: isMe ? text : bg2, color: isMe ? bg : text, padding: "7px 11px", borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px", fontSize: 12, maxWidth: "80%", border: isMe ? "none" : `1px solid ${border}` }}>{m.text}</div>
                </div>
              );
            })
          }
        </div>
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${border}`, display: "flex", gap: 8 }}>
          <input placeholder="message..." value={dmInput} onChange={e => setDmInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && dmInput.trim()) { setDmMessages(prev => ({ ...prev, [u.id]: [...(prev[u.id] || []), { from: "me", text: dmInput }] })); setDmInput(""); } }} style={{ ...inputStyle, fontSize: 12, padding: "8px 12px" }} />
          <button onClick={() => { if (dmInput.trim()) { setDmMessages(prev => ({ ...prev, [u.id]: [...(prev[u.id] || []), { from: "me", text: dmInput }] })); setDmInput(""); } }} style={{ ...btnP, padding: "8px 14px", fontSize: 11, flexShrink: 0 }}>↑</button>
        </div>
      </div>
    );
  };

  // ── LOADING ──
  if (authLoading) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&display=swap'); @keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
      <nav style={{ width: "100%", borderBottom: `1px solid ${border}`, position: "sticky", top: 0, background: dark ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)", zIndex: 50 }}>
        <div className="pad" style={{ padding: "0 40px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.5px" }}>[CoLab]</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="hb" onClick={() => setDark(!dark)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, color: textMuted, fontFamily: "inherit" }}>{dark ? "☀" : "☾"}</button>
            <button className="hb" onClick={() => setScreen("auth")} style={{ ...btnG, padding: "7px 16px", fontSize: 12 }}>Log in</button>
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
        {[["500+","builders"],["200+","active projects"],["48","skill categories"],["100%","free to start"]].map(([v,l],i) => (
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
      <div className="pad" style={{ padding: "18px 40px", borderTop: `1px solid ${border}`, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
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
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 14 }}>{authMode === "signup" ? "CREATE ACCOUNT" : "WELCOME BACK"}</div>
        <h2 style={{ fontSize: 26, fontWeight: 400, letterSpacing: "-1px", marginBottom: 28, color: text }}>{authMode === "signup" ? "Join CoLab." : "Log in."}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          <div><label style={labelStyle}>EMAIL</label><input style={inputStyle} type="email" placeholder="you@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && (authMode === "signup" ? handleSignUp() : handleLogin())} /></div>
          <div><label style={labelStyle}>PASSWORD</label><input style={inputStyle} type="password" placeholder="••••••••" value={authPassword} onChange={e => setAuthPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && (authMode === "signup" ? handleSignUp() : handleLogin())} /></div>
        </div>
        {authError && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 14 }}>{authError}</div>}
        <button className="hb" onClick={authMode === "signup" ? handleSignUp : handleLogin} style={{ ...btnP, width: "100%", padding: "13px", marginBottom: 16 }}>
          {authMode === "signup" ? "Create account →" : "Log in →"}
        </button>
        <div style={{ fontSize: 12, color: textMuted, textAlign: "center" }}>
          {authMode === "signup" ? "Already have an account?" : "Don't have an account?"}
          <button onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline", marginLeft: 6 }}>
            {authMode === "signup" ? "Log in" : "Sign up"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── ONBOARDING ──
  if (screen === "onboard") {
    const steps = [
      { label: "who are you?", field: "name", placeholder: "Your full name", type: "input" },
      { label: "what do you do?", field: "role", placeholder: "Founder, Designer, Engineer, Musician...", type: "input" },
      { label: "what's your story?", field: "bio", placeholder: "What are you about? What are you trying to build?", type: "textarea" },
      { label: "what are your skills?", field: "skills", type: "skills" },
    ];
    const step = steps[onboardStep];
    const isLast = onboardStep === steps.length - 1;
    const canNext = step.field === "skills" ? onboardData.skills.length > 0 : (onboardData[step.field] || "").trim().length > 0;
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
            {step.type === "textarea" && <textarea autoFocus style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "12px", color: text, fontSize: 13, width: "100%", fontFamily: "inherit", outline: "none", resize: "none", lineHeight: 1.7 }} rows={4} placeholder={step.placeholder} value={onboardData[step.field] || ""} onChange={e => setOnboardData({ ...onboardData, [step.field]: e.target.value })} />}
            {step.type === "skills" && (
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {SKILLS.map(s => { const sel = onboardData.skills.includes(s); return <button key={s} className="hb" onClick={() => setOnboardData({ ...onboardData, skills: sel ? onboardData.skills.filter(x => x !== s) : [...onboardData.skills, s] })} style={{ padding: "6px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                </div>
                {onboardData.skills.length > 0 && <div style={{ fontSize: 11, color: textMuted }}>{onboardData.skills.length} selected</div>}
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
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", transition: "all 0.2s", overflowX: "hidden" }}>
      <style>{CSS}</style>

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, width: "100%", background: dark ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${border}`, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 50 }}>
        <button onClick={() => { setAppScreen("explore"); setActiveProject(null); setViewingProfile(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 500, color: text, letterSpacing: "-0.5px" }}>[CoLab]</button>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {[["explore","explore"],["network","network"],["dashboard","dash"],["profile",(profile?.name||"me").split(" ")[0].toLowerCase().slice(0,6)]].map(([id,label]) => (
            <button key={id} onClick={() => { setAppScreen(id); setActiveProject(null); setViewingProfile(null); setShowNotifications(false); }} style={{ background: appScreen === id && !activeProject && !showNotifications ? bg3 : "none", color: appScreen === id && !activeProject && !showNotifications ? text : textMuted, border: "none", borderRadius: 6, padding: "5px 9px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{label}</button>
          ))}
          <button onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) setNotifications(prev => prev.map(n => ({ ...n, read: true }))); }} style={{ position: "relative", background: showNotifications ? bg3 : "none", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: textMuted, fontSize: 13, fontFamily: "inherit" }}>
            ◎{unreadCount > 0 && <span style={{ position: "absolute", top: 3, right: 3, width: 6, height: 6, borderRadius: "50%", background: text, border: `1px solid ${bg}` }} />}
          </button>
          <div style={{ width: 1, height: 16, background: border, margin: "0 3px" }} />
          <button onClick={() => setDark(!dark)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: textMuted, fontFamily: "inherit" }}>{dark ? "☀" : "☾"}</button>
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
            {notifications.length === 0 ? <div style={{ padding: "24px 16px", fontSize: 12, color: textMuted }}>no notifications.</div>
              : notifications.map(n => (
                <div key={n.id} style={{ padding: "14px 16px", borderBottom: `1px solid ${border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                    <div style={{ fontSize: 12, color: text }}>{n.text}</div>
                    <button className="hb" onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", marginLeft: 8 }}>✕</button>
                  </div>
                  <div style={{ fontSize: 11, color: textMuted, marginBottom: n.type === "application" ? 10 : 0 }}>{n.sub} · {n.time}</div>
                  {n.type === "application" && n.applicant && (
                    <div>
                      <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                          <Avatar initials={n.applicant.initials} size={28} dark={dark} />
                          <div><div style={{ fontSize: 12, color: text }}>{n.applicant.name}</div><div style={{ fontSize: 10, color: textMuted }}>{n.applicant.role}</div></div>
                        </div>
                        {n.applicant.bio && <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.6 }}>{n.applicant.bio}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="hb" onClick={() => handleAccept(n)} style={{ flex: 1, background: text, color: bg, border: "none", borderRadius: 6, padding: "7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>accept</button>
                        <button className="hb" onClick={() => handleDecline(n)} style={{ flex: 1, background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 6, padding: "7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>decline</button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        </>
      )}

      {viewingProfile && <ProfileView u={viewingProfile} onClose={() => setViewingProfile(null)} />}
      {dmOpen && <DmPanel u={dmOpen} onClose={() => setDmOpen(null)} />}

      {/* EXPLORE */}
      {appScreen === "explore" && !activeProject && (
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
              {exploreTab === "for-you" && (
                (profile?.skills || []).length === 0
                  ? <div style={{ padding: "36px 0", color: textMuted, fontSize: 13 }}>add skills to your profile to see matched projects. <button onClick={() => setAppScreen("profile")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>update profile →</button></div>
                  : forYou.length === 0
                    ? <div style={{ padding: "36px 0", color: textMuted, fontSize: 13 }}>no matches yet. <button className="hb" onClick={() => setExploreTab("all")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>browse all →</button></div>
                    : <div><div style={{ padding: "14px 0 2px", fontSize: 11, color: textMuted }}>showing {forYou.length} project{forYou.length !== 1 ? "s" : ""} matching your skills</div>{forYou.map(p => <PRow key={p.id} p={p} />)}</div>
              )}
              {exploreTab === "all" && (
                <div>
                  <div style={{ padding: "14px 0 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <input placeholder="search projects..." value={search} onChange={e => setSearch(e.target.value)} style={inputStyle} />
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {["Design","Engineering","Marketing","Music","Video","Finance","AI/ML","Writing","Product"].map(s => { const sel = filterSkill === s; return <button key={s} className="hb" onClick={() => setFilterSkill(sel ? null : s)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                      {filterSkill && <button className="hb" onClick={() => setFilterSkill(null)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: "none", color: textMuted, border: `1px solid ${border}` }}>clear</button>}
                    </div>
                  </div>
                  {allP.length === 0 ? <div style={{ padding: "36px 0", textAlign: "center", color: textMuted, fontSize: 12 }}>no results.</div> : allP.map(p => <PRow key={p.id} p={p} />)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* EXPLORE DETAIL */}
      {appScreen === "explore" && activeProject && (
        <div className="pad fu" style={{ width: "100%", maxWidth: 700, margin: "0 auto", padding: "36px 24px" }}>
          <button className="hb" onClick={() => setActiveProject(null)} style={{ ...btnG, marginBottom: 22, padding: "6px 14px", fontSize: 11 }}>← back</button>
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
              ? <div style={{ textAlign: "center", padding: 12, background: bg2, borderRadius: 8, color: textMuted, fontSize: 12, border: `1px solid ${border}` }}>this is your project</div>
              : <button className="hb" onClick={() => handleApply(activeProject)} style={{ ...btnP, width: "100%", padding: "13px" }}>Apply to collaborate →</button>
          }
        </div>
      )}

      {/* NETWORK */}
      {appScreen === "network" && (
        <div className="pad fu" style={{ width: "100%", padding: "48px 32px" }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 10 }}>NETWORK</div>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 400, letterSpacing: "-1.5px", color: text, marginBottom: 8 }}>Find your people.</h2>
            <p style={{ fontSize: 13, color: textMuted }}>Discover builders, creatives, and founders looking to collaborate.</p>
          </div>
          <div style={{ borderBottom: `1px solid ${border}`, marginBottom: 24, display: "flex" }}>
            {[["people","people"],["following","following"]].map(([id,label]) => (
              <button key={id} onClick={() => setNetworkTab(id)} style={{ background: "none", border: "none", borderBottom: networkTab === id ? `1px solid ${text}` : "1px solid transparent", color: networkTab === id ? text : textMuted, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginRight: 24, transition: "all 0.15s", display: "inline-flex", gap: 6, alignItems: "center" }}>
                {label}
                {id === "following" && following.length > 0 && <span style={{ fontSize: 10, background: bg3, borderRadius: 10, padding: "1px 6px", color: textMuted }}>{following.length}</span>}
              </button>
            ))}
          </div>
          {networkTab === "people" && (
            <div>
              <div style={{ marginBottom: 16, display: "flex", gap: 5, flexWrap: "wrap" }}>
                {["Design","Engineering","Marketing","Music","Finance","AI/ML","Writing","Video","Product"].map(s => { const sel = networkFilter === s; return <button key={s} className="hb" onClick={() => setNetworkFilter(sel ? null : s)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                {networkFilter && <button className="hb" onClick={() => setNetworkFilter(null)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: "none", color: textMuted, border: `1px solid ${border}` }}>clear</button>}
              </div>
              <div className="network-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                {users.filter(u => u.id !== authUser?.id && (!networkFilter || (u.skills || []).includes(networkFilter))).map(u => <UserCard key={u.id} u={u} />)}
              </div>
            </div>
          )}
          {networkTab === "following" && (
            following.length === 0
              ? <div style={{ padding: "36px 0", color: textMuted, fontSize: 13 }}>not following anyone yet. <button className="hb" onClick={() => setNetworkTab("people")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>discover people →</button></div>
              : <div className="network-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                  {users.filter(u => following.includes(u.id)).map(u => <UserCard key={u.id} u={u} />)}
                </div>
          )}
        </div>
      )}

      {/* DASHBOARD */}
      {appScreen === "dashboard" && !activeProject && (
        <div className="pad fu" style={{ width: "100%", padding: "44px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>DASHBOARD</div>
              <h2 style={{ fontSize: "clamp(20px, 4vw, 26px)", fontWeight: 400, letterSpacing: "-1.5px", color: text }}>{profile?.name ? `${profile.name.split(" ")[0]}'s workspace.` : "Your workspace."}</h2>
            </div>
            <button className="hb" onClick={() => setShowCreate(true)} style={btnP}>+ new project</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, marginBottom: 32, border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
            {[["my projects", myProjects.length],["applied to", appliedProjectIds.length],["following", following.length]].map(([label,val],i) => (
              <div key={i} style={{ padding: "16px 18px", background: bg2, borderRight: i < 2 ? `1px solid ${border}` : "none" }}>
                <div style={{ fontSize: "clamp(20px, 4vw, 26px)", fontWeight: 400, color: text, letterSpacing: "-1px" }}>{val}</div>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>MY PROJECTS</div>
            {loading ? <Spinner dark={dark} /> : myProjects.length === 0
              ? <div style={{ padding: "28px 0", color: textMuted, fontSize: 12, borderTop: `1px solid ${border}` }}>no projects yet. <button onClick={() => setShowCreate(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>post one →</button></div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {myProjects.map((p,i) => (
                    <div key={p.id} style={{ background: bg2, borderRadius: i === 0 && myProjects.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === myProjects.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < myProjects.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px", cursor: "pointer", transition: "opacity 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                      onClick={() => { setActiveProject(p); loadProjectData(p.id); setProjectTab("tasks"); }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, color: text, letterSpacing: "-0.3px", marginBottom: 2 }}>{p.title}</div>
                          <div style={{ fontSize: 11, color: textMuted }}>{p.category} · {p.status}</div>
                        </div>
                        <span style={{ fontSize: 10, padding: "2px 8px", border: `1px solid ${border}`, borderRadius: 3, color: p.status === "active" ? text : textMuted, flexShrink: 0 }}>{p.status}</span>
                      </div>
                      <ProgressBar value={p.progress || 0} dark={dark} />
                      <div style={{ fontSize: 10, color: textMuted, marginTop: 5 }}>{p.progress || 0}% complete</div>
                    </div>
                  ))}
                </div>
            }
          </div>
          {appliedProjectIds.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>APPLICATIONS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {projects.filter(p => appliedProjectIds.includes(p.id)).map((p,i,arr) => (
                  <div key={p.id} style={{ background: bg2, borderRadius: i === 0 && arr.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === arr.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < arr.length - 1 ? "none" : `1px solid ${border}`, padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, color: text, marginBottom: 2 }}>{p.title}</div><div style={{ fontSize: 11, color: textMuted }}>{p.owner_name} · {p.category}</div></div>
                    <span style={{ fontSize: 10, color: textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "2px 8px", flexShrink: 0 }}>pending</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PROJECT SPACE */}
      {appScreen === "dashboard" && activeProject && (
        <div className="pad fu" style={{ width: "100%", maxWidth: 800, margin: "0 auto", padding: "36px 24px" }}>
          <button className="hb" onClick={() => setActiveProject(null)} style={{ ...btnG, marginBottom: 22, padding: "6px 14px", fontSize: 11 }}>← dashboard</button>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 6 }}>PROJECT SPACE</div>
          <h2 style={{ fontSize: "clamp(15px, 3vw, 18px)", fontWeight: 400, letterSpacing: "-0.5px", color: text, marginBottom: 3 }}>{activeProject.title}</h2>
          <div style={{ fontSize: 11, color: textMuted, marginBottom: 18 }}>{activeProject.category}</div>
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}><span style={{ fontSize: 10, color: textMuted }}>progress</span><span style={{ fontSize: 10, color: text }}>{activeProject.progress || 0}%</span></div>
            <ProgressBar value={activeProject.progress || 0} dark={dark} />
          </div>
          <div className="proj-tabs" style={{ borderBottom: `1px solid ${border}`, marginBottom: 22, display: "flex" }}>
            <TabBtn id="tasks" label="tasks" count={tasks.filter(t => !t.done).length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="messages" label="messages" count={messages.length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="updates" label="updates" count={updates.length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="plugins" label="plugins" count={(activeProject.plugins || []).length} setter={setProjectTab} current={projectTab} />
          </div>

          {projectTab === "tasks" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                <input placeholder="add a task..." value={newTaskText} onChange={e => setNewTaskText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddTask(activeProject.id)} style={{ ...inputStyle, fontSize: 12 }} />
                <button className="hb" onClick={() => handleAddTask(activeProject.id)} style={{ ...btnP, padding: "10px 16px", flexShrink: 0, fontSize: 12 }}>add</button>
              </div>
              {tasks.length === 0 ? <div style={{ fontSize: 12, color: textMuted, padding: "18px 0" }}>no tasks yet.</div> : (
                <div>
                  {tasks.filter(t => !t.done).length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 8 }}>TO DO · {tasks.filter(t => !t.done).length}</div>
                      {tasks.filter(t => !t.done).map(task => (
                        <div key={task.id} className="task-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${border}` }}>
                          <button onClick={() => handleToggleTask(task)} style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${textMuted}`, background: "none", cursor: "pointer", flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: text, flex: 1 }}>{task.text}</span>
                          <button className="tdel hb" onClick={() => handleDeleteTask(task.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, opacity: 0, transition: "opacity 0.15s", fontFamily: "inherit" }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {tasks.filter(t => t.done).length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 8 }}>DONE · {tasks.filter(t => t.done).length}</div>
                      {tasks.filter(t => t.done).map(task => (
                        <div key={task.id} className="task-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${border}` }}>
                          <button onClick={() => handleToggleTask(task)} style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${text}`, background: text, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: bg, fontSize: 9 }}>✓</span></button>
                          <span style={{ fontSize: 13, color: textMuted, textDecoration: "line-through", flex: 1 }}>{task.text}</span>
                          <button className="tdel hb" onClick={() => handleDeleteTask(task.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, opacity: 0, transition: "opacity 0.15s", fontFamily: "inherit" }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {projectTab === "messages" && (
            <div>
              <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
                {messages.length === 0 ? <div style={{ fontSize: 12, color: textMuted, padding: "18px 0" }}>no messages yet.</div>
                  : messages.map((msg, i) => {
                      const isMe = msg.from_user === authUser?.id;
                      return (
                        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: isMe ? "row-reverse" : "row" }}>
                          <Avatar initials={msg.from_initials} size={28} dark={dark} />
                          <div style={{ maxWidth: "72%" }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                              <span style={{ fontSize: 11, fontWeight: 500, color: text }}>{isMe ? "you" : msg.from_name}</span>
                              <span style={{ fontSize: 10, color: textMuted }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                            <div style={{ background: isMe ? text : bg2, color: isMe ? bg : text, padding: "8px 12px", borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px", fontSize: 12, lineHeight: 1.6, border: isMe ? "none" : `1px solid ${border}` }}>{msg.text}</div>
                          </div>
                        </div>
                      );
                    })
                }
                <div ref={messagesEndRef} />
              </div>
              <div style={{ display: "flex", gap: 8, borderTop: `1px solid ${border}`, paddingTop: 12 }}>
                <input placeholder="send a message..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSendMessage(activeProject.id)} style={{ ...inputStyle, fontSize: 12 }} />
                <button className="hb" onClick={() => handleSendMessage(activeProject.id)} style={{ ...btnP, padding: "10px 16px", flexShrink: 0, fontSize: 12 }}>send</button>
              </div>
            </div>
          )}

          {projectTab === "updates" && (
            <div>
              <div style={{ display: "flex", gap: 10, marginBottom: 22, alignItems: "flex-start" }}>
                <Avatar initials={myInitials} size={28} dark={dark} />
                <div style={{ flex: 1 }}>
                  <textarea placeholder="post an update..." value={newUpdate} onChange={e => setNewUpdate(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none", fontSize: 12, padding: "8px 12px" }} />
                  {newUpdate.trim() && <button className="hb" onClick={() => handlePostUpdate(activeProject.id)} style={{ ...btnP, marginTop: 8, padding: "7px 14px", fontSize: 11 }}>post</button>}
                </div>
              </div>
              {updates.length === 0 ? <div style={{ fontSize: 12, color: textMuted }}>no updates yet.</div>
                : updates.map((u,i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                    <Avatar initials={u.initials} size={28} dark={dark} />
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: text }}>{u.author}</span>
                        <span style={{ fontSize: 10, color: textMuted }}>{new Date(u.created_at).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65 }}>{u.text}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {projectTab === "plugins" && (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {PLUGINS.filter(p => (activeProject.plugins || []).includes(p.id)).map(plug => (
                  <div key={plug.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: bg2, borderRadius: 8, border: `1px solid ${border}` }}>
                    <span style={{ fontSize: 18, color: text, width: 24, textAlign: "center" }}>{plug.icon}</span>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: text }}>{plug.name}</div><div style={{ fontSize: 11, color: textMuted }}>{plug.desc}</div></div>
                    <button className="hb" onClick={() => handleAddPlugin(plug.id, activeProject)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>remove</button>
                  </div>
                ))}
              </div>
              {PLUGINS.filter(p => !(activeProject.plugins || []).includes(p.id)).length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 8 }}>ADD PLUGIN</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {PLUGINS.filter(p => !(activeProject.plugins || []).includes(p.id)).map(plug => (
                      <button key={plug.id} className="hb" onClick={() => handleAddPlugin(plug.id, activeProject)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "10px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: textMuted, display: "flex", gap: 10, alignItems: "center", textAlign: "left" }}>
                        <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{plug.icon}</span>
                        <div><div style={{ color: text, marginBottom: 1 }}>{plug.name}</div><div style={{ fontSize: 10 }}>{plug.desc}</div></div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PROFILE */}
      {appScreen === "profile" && (
        <div className="pad fu" style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: "48px 24px" }}>
          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 18 }}>PROFILE</div>
          {!editProfile ? (
            <div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
                <Avatar initials={myInitials} size={52} dark={dark} />
                <div>
                  <div style={{ fontSize: "clamp(16px, 4vw, 20px)", fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{profile?.name || "Anonymous"}</div>
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{profile?.role}</div>
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>{following.length} following</div>
                </div>
              </div>
              {profile?.bio && <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 22 }}>{profile.bio}</p>}
              <div style={{ marginBottom: 22 }}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>SKILLS</div>
                {(profile?.skills || []).length === 0
                  ? <div style={{ fontSize: 12, color: textMuted }}>no skills. <button onClick={() => setEditProfile(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>add →</button></div>
                  : <div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>{(profile?.skills || []).map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>★ your skills match {forYou.length} open project{forYou.length !== 1 ? "s" : ""} <button className="hb" onClick={() => { setAppScreen("explore"); setExploreTab("for-you"); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline", marginLeft: 4 }}>view →</button></div>
                    </div>
                }
              </div>
              <div style={{ marginBottom: 22 }}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>MY PROJECTS</div>
                {myProjects.length === 0 ? <span style={{ fontSize: 12, color: textMuted }}>none yet.</span> : myProjects.map(p => <div key={p.id} style={{ fontSize: 12, color: textMuted, padding: "8px 0", borderBottom: `1px solid ${border}` }}>{p.title}</div>)}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="hb" onClick={() => setEditProfile(true)} style={btnG}>edit profile</button>
                <button className="hb" onClick={handleSignOut} style={{ ...btnG, color: textMuted }}>sign out</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 22 }}>
                <div><label style={labelStyle}>NAME</label><input style={inputStyle} value={profile?.name || ""} onChange={e => setProfile({ ...profile, name: e.target.value })} /></div>
                <div><label style={labelStyle}>ROLE</label><input style={inputStyle} placeholder="Founder, Designer, Engineer..." value={profile?.role || ""} onChange={e => setProfile({ ...profile, role: e.target.value })} /></div>
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

      {/* CREATE MODAL */}
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
              <div><label style={labelStyle}>COLLABORATORS NEEDED</label><select style={inputStyle} value={newProject.maxCollaborators} onChange={e => setNewProject({ ...newProject, maxCollaborators: parseInt(e.target.value) })}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="hb" onClick={() => setShowCreate(false)} style={btnG}>cancel</button>
              <button className="hb" onClick={handlePostProject} style={{ ...btnP, flex: 1 }}>post →</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: text, color: bg, padding: "11px 20px", borderRadius: 8, fontSize: 11, zIndex: 300, animation: "tin 0.3s ease", whiteSpace: "nowrap" }}>{toast}</div>}
    </div>
  );
}
