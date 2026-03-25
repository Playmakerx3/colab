import { useState, useEffect, useRef, useCallback } from "react";
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
              <Avatar initials={u.name.split(" ").map(n => n[0]).join("").slice(0, 2)} size={24} dark={dark} />
              <div><div style={{ fontSize: 12, color: dark ? "#fff" : "#000" }}>{u.name}</div><div style={{ fontSize: 10, color: dark ? "#555" : "#aaa" }}>{u.role}</div></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CoLab() {
  const [dark, setDark] = useState(true);
  const [screen, setScreen] = useState("landing");
  const [appScreen, setAppScreen] = useState("explore");
  const [exploreTab, setExploreTab] = useState("for-you");
  const [networkTab, setNetworkTab] = useState("feed");
  const [activeProject, setActiveProject] = useState(null);
  const [viewingProfile, setViewingProfile] = useState(null);
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
  const [onboardData, setOnboardData] = useState({ name: "", role: "", bio: "", skills: [] });

  // Data
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [projectUpdates, setProjectUpdates] = useState([]);
  const [applications, setApplications] = useState([]);
  const [following, setFollowing] = useState([]);
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
  const [postLikes, setPostLikes] = useState({});
  const [postComments, setPostComments] = useState({});
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostProject, setNewPostProject] = useState("");
  const [newPostMediaUrl, setNewPostMediaUrl] = useState("");
  const [expandedComments, setExpandedComments] = useState({});
  const [newCommentText, setNewCommentText] = useState({});
  const [projectMembers, setProjectMembers] = useState([]);
  const [projectFiles, setProjectFiles] = useState([]);
  const [projectDocs, setProjectDocs] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);

  // UI
  const [showNotifications, setShowNotifications] = useState(false);
  const [filterSkill, setFilterSkill] = useState(null);
  const [networkFilter, setNetworkFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newProject, setNewProject] = useState({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2 });
  const [newTaskText, setNewTaskText] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newUpdate, setNewUpdate] = useState("");
  const [dmInput, setDmInput] = useState("");
  const [editProfile, setEditProfile] = useState(false);
  const [showApplicationForm, setShowApplicationForm] = useState(null);
  const [applicationForm, setApplicationForm] = useState({ skills: [], availability: "", motivation: "", portfolio_url: "" });
  const [reviewingApplicants, setReviewingApplicants] = useState(null);
  const [editingProgress, setEditingProgress] = useState(null);
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
  const myInitials = profile?.name ? profile.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "ME";
  const getMatchScore = (p) => (profile?.skills || []).filter(s => (p.skills || []).includes(s)).length;
  const unreadDms = dmThreads.filter(t => t.unread && t.id !== activeDmThread?.id).length;
  const unreadNotifs = notifications.filter(n => !n.read).length;

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
    html, body, #root { width: 100%; min-height: 100vh; margin: 0; padding: 0; overflow-x: hidden; background-color: ${dark ? "#0a0a0a" : "#ffffff"}; }
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

  // Force body background + mobile browser chrome color on mode switch
  useEffect(() => {
    const color = dark ? "#0a0a0a" : "#ffffff";
    document.body.style.backgroundColor = color;
    document.documentElement.style.backgroundColor = color;
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
    if (data) { setProfile(data); setScreen("app"); setAuthLoading(false); loadAllData(userId); }
    else { setScreen("onboard"); setAuthLoading(false); }
  };

  const loadAllData = async (userId) => {
    setLoading(true);
    try {
      const [{ data: projs }, { data: usrs }, { data: apps }, { data: fols }, { data: threads }, { data: port }, { data: postsData }, { data: likesData }] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("*"),
        supabase.from("applications").select("*"),
        supabase.from("follows").select("*").eq("follower_id", userId),
        supabase.from("dm_threads").select("*").or(`user_a.eq.${userId},user_b.eq.${userId}`),
        supabase.from("portfolio_items").select("*").eq("user_id", userId),
        supabase.from("posts").select("*").order("created_at", { ascending: false }),
        supabase.from("likes").select("*").eq("user_id", userId),
      ]);
      setProjects(projs || []);
      setUsers(usrs || []);
      setApplications(apps || []);
      setFollowing((fols || []).map(f => f.following_id));
      setDmThreads(threads || []);
      setPortfolioItems(port || []);
      setPosts(postsData || []);
      setPostLikes({ myLikes: (likesData || []).map(l => l.post_id) });
      // Live stats for landing page
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
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // ── REALTIME ──
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
        if (payload.new.sender_id !== authUser.id) {
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
        const myProjectIds = projects.filter(p => p.owner_id === authUser.id).map(p => p.id);
        if (myProjectIds.includes(payload.new.project_id)) {
          const proj = projects.find(p => p.id === payload.new.project_id);
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
        if (payload.new.user_id !== authUser.id) {
          setPosts(prev => {
            if (prev.find(p => p.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [authUser, activeProject, activeDmThread, projects]);

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
        id: userId, name: onboardData.name, role: onboardData.role || "",
        bio: onboardData.bio || "", skills: onboardData.skills || [],
      }, { onConflict: "id" }).select().single();
      if (error) { showToast("Error: " + error.message); return; }
      if (data) { setProfile(data); setScreen("app"); setAppScreen("explore"); loadAllData(userId); showToast(`Welcome, ${data.name.split(" ")[0]}!`); }
    } catch (e) { showToast("Something went wrong."); }
  };

  const handleSaveProfile = async () => {
    const { data, error } = await supabase.from("profiles").update({
      name: profile.name, role: profile.role, bio: profile.bio, skills: profile.skills,
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
      owner_id: authUser.id, owner_name: profile.name,
      owner_initials: myInitials, status: "open", progress: 0, plugins: [], collaborators: 0,
    }).select().single();
    if (!error && data) {
      setProjects([data, ...projects]);
      setNewProject({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2 });
      setShowCreate(false); showToast("Project posted.");
    }
  };

  const handleUpdateProgress = async (projectId, progress) => {
    const val = Math.min(100, Math.max(0, parseInt(progress) || 0));
    await supabase.from("projects").update({ progress: val }).eq("id", projectId);
    setProjects(projects.map(p => p.id === projectId ? { ...p, progress: val } : p));
    if (activeProject?.id === projectId) setActiveProject({ ...activeProject, progress: val });
    setEditingProgress(null);
    showToast("Progress updated.");
  };

  // ── TASKS ──
  const handleAddTask = async (projectId) => {
    if (!newTaskText.trim()) return;
    const assignedUser = users.find(u => u.name === taskAssignee);
    const { data } = await supabase.from("tasks").insert({
      project_id: projectId, text: newTaskText, done: false,
      assigned_to: assignedUser?.id || null, assigned_name: taskAssignee || null,
    }).select().single();
    if (data) { setTasks([...tasks, data]); setNewTaskText(""); setTaskAssignee(""); }
  };

  const handleToggleTask = async (task) => {
    const { data } = await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id).select().single();
    if (data) setTasks(tasks.map(t => t.id === task.id ? data : t));
  };

  const handleDeleteTask = async (taskId) => {
    await supabase.from("tasks").delete().eq("id", taskId);
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  // ── MESSAGES ──
  const handleSendMessage = async (projectId) => {
    if (!newMessage.trim()) return;
    await supabase.from("messages").insert({
      project_id: projectId, from_user: authUser.id,
      from_initials: myInitials, from_name: profile.name, text: newMessage,
    });
    setNewMessage("");
  };

  const handlePostUpdate = async (projectId) => {
    if (!newUpdate.trim()) return;
    const { data } = await supabase.from("updates").insert({
      project_id: projectId, author_id: authUser.id,
      author: profile.name, initials: myInitials, text: newUpdate,
    }).select().single();
    if (data) { setProjectUpdates([data, ...projectUpdates]); setNewUpdate(""); showToast("Update posted."); }
  };

  // ── DMs ──
  const openDm = async (user) => {
    if (user.id === authUser?.id) return;
    let thread = dmThreads.find(t =>
      (t.user_a === authUser.id && t.user_b === user.id) ||
      (t.user_b === authUser.id && t.user_a === user.id)
    );
    if (!thread) {
      const { data } = await supabase.from("dm_threads").insert({ user_a: authUser.id, user_b: user.id }).select().single();
      if (data) { thread = data; setDmThreads(prev => [...prev, data]); }
    }
    if (thread) {
      setActiveDmThread({ ...thread, otherUser: user });
      loadDmMessages(thread.id);
      setAppScreen("messages");
      // Clear unread flag
      setDmThreads(prev => prev.map(t => t.id === thread.id ? { ...t, unread: false } : t));
    }
  };

  const handleSendDm = async () => {
    if (!dmInput.trim() || !activeDmThread) return;
    await supabase.from("dm_messages").insert({
      thread_id: activeDmThread.id, sender_id: authUser.id,
      sender_name: profile.name, sender_initials: myInitials, text: dmInput,
    });
    setDmInput("");
  };

  // ── APPLICATIONS ──
  const handleApply = async () => {
    const project = showApplicationForm;
    if (!project) return;
    const already = applications.find(a => a.project_id === project.id && a.applicant_id === authUser.id);
    if (already) return;
    const { data } = await supabase.from("applications").insert({
      project_id: project.id, applicant_id: authUser.id,
      applicant_name: profile.name, applicant_initials: myInitials,
      applicant_role: profile.role, applicant_bio: profile.bio,
      applicant_skills: applicationForm.skills,
      availability: applicationForm.availability,
      motivation: applicationForm.motivation,
      portfolio_url: applicationForm.portfolio_url,
      status: "pending",
    }).select().single();
    if (data) {
      setApplications([...applications, data]);
      setShowApplicationForm(null);
      setApplicationForm({ skills: [], availability: "", motivation: "", portfolio_url: "" });
      showToast(`Applied to "${project.title}"`);
      setActiveProject(null);
    }
  };

  const handleAccept = async (notif) => {
    await supabase.from("applications").update({ status: "accepted" }).eq("id", notif.id);
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    showToast(`${notif.applicant.name} accepted!`);
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

  const myProjects = projects.filter(p => p.owner_id === authUser?.id);
  const appliedProjectIds = applications.filter(a => a.applicant_id === authUser?.id).map(a => a.project_id);
  const browseBase = projects.filter(p => p.owner_id !== authUser?.id);
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
            <div style={{ fontSize: 14, fontWeight: 500, color: text }}>{u.name}</div>
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

  const ProfileModal = ({ u, onClose }) => {
    const isFollowing = following.includes(u.id);
    const userProjects = projects.filter(p => p.owner_id === u.id);
    const sharedSkills = (profile?.skills || []).filter(s => (u.skills || []).includes(s));
    const uInitials = u.name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "?";
    const [userPortfolio, setUserPortfolio] = useState([]);
    useEffect(() => {
      supabase.from("portfolio_items").select("*").eq("user_id", u.id).then(({ data }) => setUserPortfolio(data || []));
    }, [u.id]);
    return (
      <div style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.88)" : "rgba(220,220,220,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150, backdropFilter: "blur(10px)", padding: 16 }} onClick={onClose}>
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "32px 28px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
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
                  {item.description && <div style={{ fontSize: 12, color: textMuted, marginBottom: 4 }}>{item.description}</div>}
                  {item.url && <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: text, textDecoration: "underline" }}>{item.url}</a>}
                </div>
              ))}
            </div>
          )}
          {u.id !== authUser?.id && (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => handleFollow(u.id)} style={{ flex: 1, background: isFollowing ? bg3 : text, color: isFollowing ? textMuted : bg, border: `1px solid ${isFollowing ? border : text}`, borderRadius: 8, padding: "11px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                {isFollowing ? "following" : "follow"}
              </button>
              <button onClick={() => { openDm(u); onClose(); }} style={{ flex: 1, background: "none", color: text, border: `1px solid ${border}`, borderRadius: 8, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>message</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const ApplicationFormModal = ({ project, onClose }) => (
    <div style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(10px)", padding: 16 }} onClick={onClose}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "28px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 6 }}>APPLY</div>
            <div style={{ fontSize: 16, color: text, fontWeight: 500 }}>{project.title}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>SKILLS YOU'RE BRINGING</label>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {SKILLS.map(s => { const sel = applicationForm.skills.includes(s); return <button key={s} className="hb" onClick={() => setApplicationForm({ ...applicationForm, skills: sel ? applicationForm.skills.filter(x => x !== s) : [...applicationForm.skills, s] })} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
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
          <button className="hb" onClick={onClose} style={btnG}>cancel</button>
          <button className="hb" onClick={handleApply} disabled={!applicationForm.motivation || !applicationForm.availability} style={{ ...btnP, flex: 1, opacity: (!applicationForm.motivation || !applicationForm.availability) ? 0.4 : 1 }}>submit application →</button>
        </div>
      </div>
    </div>
  );

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
                    <button className="hb" onClick={async () => { await supabase.from("applications").update({ status: "declined" }).eq("id", selected.id); setApplications(applications.filter(a => a.id !== selected.id)); setSelected(null); showToast("Declined."); }} style={{ ...btnG, flex: 1 }}>decline</button>
                    <button className="hb" onClick={async () => {
                      await supabase.from("applications").update({ status: "accepted" }).eq("id", selected.id);
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

  // ── POSTS ──
  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    const proj = myProjects.find(p => p.id === newPostProject);
    const { data } = await supabase.from("posts").insert({
      user_id: authUser.id, user_name: profile.name,
      user_initials: myInitials, user_role: profile.role,
      content: newPostContent,
      project_id: proj?.id || null,
      project_title: proj?.title || null,
      media_url: newPostMediaUrl || null,
    }).select().single();
    if (data) {
      setPosts([data, ...posts]);
      setNewPostContent("");
      setNewPostProject("");
      setNewPostMediaUrl("");
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
    await supabase.from("posts").delete().eq("id", postId);
    setPosts(posts.filter(p => p.id !== postId));
    showToast("Post deleted.");
  };


  const renderNetwork = () => {
    const followingFeed = posts.filter(p => following.includes(p.user_id));
    const allFeed = posts;
    const feedToShow = networkTab === "feed-following" ? followingFeed : allFeed;

    const PostCard = ({ post }) => {
      const isLiked = (postLikes.myLikes || []).includes(post.id);
      const isOpen = expandedComments[post.id];
      const comments = postComments[post.id] || [];
      const isOwner = post.user_id === authUser?.id;
      const postUser = users.find(u => u.id === post.user_id);
      return (
        <div style={{ borderBottom: `1px solid ${border}`, padding: "20px 0" }}>
          {/* Header */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
            <button onClick={() => postUser && setViewingProfile(postUser)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
              <Avatar initials={post.user_initials} size={36} dark={dark} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <button onClick={() => postUser && setViewingProfile(postUser)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: text }}>{post.user_name}</span>
                  </button>
                  <span style={{ fontSize: 11, color: textMuted, marginLeft: 8 }}>{post.user_role}</span>
                  <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{new Date(post.created_at).toLocaleDateString()}</div>
                </div>
                {isOwner && <button className="hb" onClick={() => handleDeletePost(post.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>✕</button>}
              </div>
            </div>
          </div>
          {/* Content */}
          <div style={{ fontSize: 14, color: text, lineHeight: 1.7, marginBottom: 10, paddingLeft: 46 }}>{post.content}</div>
          {/* Media embed */}
          {post.media_url && (
            <div style={{ paddingLeft: 46, marginBottom: 10 }}>
              {post.media_url.includes("youtube.com") || post.media_url.includes("youtu.be") ? (
                <iframe
                  src={`https://www.youtube.com/embed/${post.media_url.split("v=")[1]?.split("&")[0] || post.media_url.split("/").pop()}`}
                  style={{ width: "100%", height: 240, borderRadius: 8, border: "none" }}
                  allowFullScreen
                />
              ) : (
                <img src={post.media_url} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 8, border: `1px solid ${border}` }} onError={e => e.target.style.display = "none"} />
              )}
            </div>
          )}
          {/* Project tag */}
          {post.project_title && (
            <div style={{ paddingLeft: 46, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: textMuted, border: `1px solid ${border}`, borderRadius: 4, padding: "2px 8px" }}>↗ {post.project_title}</span>
            </div>
          )}
          {/* Actions */}
          <div style={{ paddingLeft: 46, display: "flex", gap: 16, alignItems: "center" }}>
            <button className="hb" onClick={() => handleLike(post.id)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: isLiked ? text : textMuted, display: "flex", gap: 5, alignItems: "center" }}>
              {isLiked ? "♥" : "♡"} {post.like_count || 0}
            </button>
            <button className="hb" onClick={() => {
              setExpandedComments(prev => ({ ...prev, [post.id]: !prev[post.id] }));
              if (!postComments[post.id]) loadComments(post.id);
            }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: textMuted, display: "flex", gap: 5, alignItems: "center" }}>
              ◎ {isOpen ? "hide" : "comment"}
            </button>
          </div>
          {/* Comments */}
          {isOpen && (
            <div style={{ paddingLeft: 46, marginTop: 14 }}>
              {comments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                  {comments.map((c, i) => {
                    const cUser = users.find(u => u.id === c.user_id);
                    return (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <Avatar initials={c.user_initials} size={24} dark={dark} />
                        <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "7px 12px", flex: 1 }}>
                          <button onClick={() => cUser && setViewingProfile(cUser)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11, fontWeight: 500, color: text, fontFamily: "inherit" }}>{c.user_name}</button>
                          <div style={{ fontSize: 12, color: textMuted, marginTop: 2, lineHeight: 1.55 }}>{c.content}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <Avatar initials={myInitials} size={24} dark={dark} />
                <input placeholder="write a comment..." value={newCommentText[post.id] || ""} onChange={e => setNewCommentText(prev => ({ ...prev, [post.id]: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleComment(post.id)} style={{ ...inputStyle, fontSize: 12, padding: "7px 12px", flex: 1 }} />
              </div>
            </div>
          )}
        </div>
      );
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
          <div style={{ maxWidth: 640 }}>
            {/* Compose */}
            <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 12, padding: "16px", marginBottom: 28 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Avatar initials={myInitials} size={36} dark={dark} />
                <div style={{ flex: 1 }}>
                  <textarea placeholder="share what you're working on..." value={newPostContent} onChange={e => setNewPostContent(e.target.value)} rows={3} style={{ ...inputStyle, resize: "none", fontSize: 13, padding: "10px 12px", background: bg3, borderColor: "transparent" }} />
                  {newPostContent.trim() && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                      <input placeholder="photo or YouTube URL (optional)..." value={newPostMediaUrl} onChange={e => setNewPostMediaUrl(e.target.value)} style={{ ...inputStyle, fontSize: 11, padding: "6px 10px" }} />
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

            {/* Feed */}
            {feedToShow.length === 0
              ? <div style={{ fontSize: 13, color: textMuted, padding: "24px 0" }}>
                  {networkTab === "feed-following"
                    ? <>nothing yet from people you follow. <button className="hb" onClick={() => setNetworkTab("people")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>find people →</button></>
                    : "no posts yet. be the first."}
                </div>
              : feedToShow.map(post => <PostCard key={post.id} post={post} />)
            }
          </div>
        )}

        {/* People tab */}
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
        {[[liveStats.builders,"builders"],[liveStats.projects,"active projects"],["48","skill categories"],["100%","free to start"]].map(([v,l],i) => (
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
  const navItems = [
    { id: "explore", label: "explore" },
    { id: "network", label: "network" },
    { id: "workspace", label: "work" },
    { id: "messages", label: "msgs", badge: unreadDms },
    { id: "profile", label: profile?.name?.split(" ")[0]?.toLowerCase() || "me" },
  ];

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", transition: "background 0.2s, color 0.2s", overflowX: "hidden" }}>
      <style>{CSS}</style>

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, width: "100%", background: dark ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${border}`, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 50 }}>
        <button onClick={() => { setAppScreen("explore"); setActiveProject(null); setViewingProfile(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500, color: text, letterSpacing: "-0.5px", flexShrink: 0 }}>[CoLab]</button>

        {/* Global search */}
        <div style={{ position: "relative", flex: 1, maxWidth: 200, margin: "0 8px" }}>
          <input
            placeholder="search people..."
            value={globalSearch}
            onChange={e => { setGlobalSearch(e.target.value); setShowGlobalSearch(e.target.value.length > 0); }}
            onBlur={() => setTimeout(() => setShowGlobalSearch(false), 150)}
            style={{ ...inputStyle, fontSize: 11, padding: "5px 10px", borderRadius: 6 }}
          />
          {showGlobalSearch && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: bg, border: `1px solid ${border}`, borderRadius: 8, zIndex: 300, overflow: "hidden", boxShadow: dark ? "0 8px 24px rgba(0,0,0,0.6)" : "0 8px 24px rgba(0,0,0,0.1)" }}>
              {users.filter(u => u.id !== authUser?.id && u.name?.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 5).map(u => (
                <button key={u.id} onClick={() => { setViewingProfile(u); setGlobalSearch(""); setShowGlobalSearch(false); }} style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "center", textAlign: "left" }}
                  onMouseEnter={e => e.currentTarget.style.background = bg2} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <Avatar initials={u.name?.split(" ").map(n => n[0]).join("").slice(0, 2)} size={26} dark={dark} />
                  <div>
                    <div style={{ fontSize: 12, color: text }}>{u.name}</div>
                    <div style={{ fontSize: 10, color: textMuted }}>{u.role}</div>
                  </div>
                </button>
              ))}
              {users.filter(u => u.id !== authUser?.id && u.name?.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 && (
                <div style={{ padding: "12px 14px", fontSize: 12, color: textMuted }}>no results.</div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 1, alignItems: "center" }}>
          {navItems.map(({ id, label, badge }) => (
            <button key={id} onClick={() => { setAppScreen(id); setActiveProject(null); setViewingProfile(null); setShowNotifications(false); }}
              style={{ position: "relative", background: appScreen === id && !activeProject && !showNotifications ? bg3 : "none", color: appScreen === id && !activeProject && !showNotifications ? text : textMuted, border: "none", borderRadius: 6, padding: "5px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>
              {label}
              {badge > 0 && <span style={{ position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: "50%", background: text, border: `1px solid ${bg}` }} />}
            </button>
          ))}
          <button onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) setNotifications(prev => prev.map(n => ({ ...n, read: true }))); }}
            style={{ position: "relative", background: showNotifications ? bg3 : "none", border: "none", borderRadius: 6, padding: "5px 7px", cursor: "pointer", color: textMuted, fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>
            ◎{unreadNotifs > 0 && <span style={{ position: "absolute", top: 3, right: 3, width: 5, height: 5, borderRadius: "50%", background: text, border: `1px solid ${bg}` }} />}
          </button>
          <div style={{ width: 1, height: 14, background: border, margin: "0 2px", flexShrink: 0 }} />
          <button onClick={() => setDark(!dark)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "3px 7px", cursor: "pointer", fontSize: 10, color: textMuted, fontFamily: "inherit", flexShrink: 0 }}>{dark ? "☀" : "☾"}</button>
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
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <div style={{ fontSize: 12, color: text }}>{n.text}</div>
                    <button className="hb" onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", marginLeft: 8 }}>✕</button>
                  </div>
                  <div style={{ fontSize: 11, color: textMuted, marginBottom: n.type === "application" ? 10 : 0 }}>{n.sub} · {n.time}</div>
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
              ))
            }
          </div>
        </>
      )}

      {viewingProfile && <ProfileModal u={viewingProfile} onClose={() => setViewingProfile(null)} />}
      {showApplicationForm && <ApplicationFormModal project={showApplicationForm} onClose={() => setShowApplicationForm(null)} />}
      {reviewingApplicants && <ReviewModal project={reviewingApplicants} onClose={() => setReviewingApplicants(null)} />}

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
              ? <button className="hb" onClick={() => setReviewingApplicants(activeProject)} style={{ ...btnP, width: "100%", padding: "13px" }}>review applicants ({applications.filter(a => a.project_id === activeProject.id && a.status === "pending").length})</button>
              : <button className="hb" onClick={() => setShowApplicationForm(activeProject)} style={{ ...btnP, width: "100%", padding: "13px" }}>Apply to collaborate →</button>
          }
        </div>
      )}

      {/* NETWORK */}
      {appScreen === "network" && renderNetwork()}

      {/* MESSAGES */}
      {appScreen === "messages" && (
        <div style={{ width: "100%", padding: "0" }}>
          <div className="msg-layout" style={{ display: "grid", gridTemplateColumns: dmThreads.length > 0 ? "260px 1fr" : "1fr", height: "calc(100vh - 50px)" }}>
            <div style={{ borderRight: `1px solid ${border}`, overflowY: "auto" }}>
              <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${border}` }}>
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>MESSAGES</div>
              </div>
              {dmThreads.length === 0
                ? <div style={{ padding: "24px 20px", fontSize: 12, color: textMuted }}>no conversations yet.<br />Message someone from their profile.</div>
                : dmThreads.map(thread => {
                    const otherId = thread.user_a === authUser?.id ? thread.user_b : thread.user_a;
                    const other = users.find(u => u.id === otherId);
                    if (!other) return null;
                    const isActive = activeDmThread?.id === thread.id;
                    return (
                      <div key={thread.id} onClick={() => { setActiveDmThread({ ...thread, otherUser: other }); loadDmMessages(thread.id); setDmThreads(prev => prev.map(t => t.id === thread.id ? { ...t, unread: false } : t)); }} style={{ padding: "14px 20px", borderBottom: `1px solid ${border}`, cursor: "pointer", background: isActive ? bg2 : "none", display: "flex", gap: 12, alignItems: "center" }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = bg2; }} onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "none"; }}>
                        <Avatar initials={other.name?.split(" ").map(n => n[0]).join("").slice(0, 2)} size={36} dark={dark} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: text, fontWeight: 500 }}>{other.name}</div>
                          <div style={{ fontSize: 11, color: textMuted }}>{other.role}</div>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
            {activeDmThread ? (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${border}`, display: "flex", gap: 12, alignItems: "center" }}>
                  <Avatar initials={activeDmThread.otherUser?.name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "?"} size={32} dark={dark} />
                  <div>
                    <div style={{ fontSize: 14, color: text, fontWeight: 500 }}>{activeDmThread.otherUser?.name}</div>
                    <div style={{ fontSize: 11, color: textMuted }}>{activeDmThread.otherUser?.role}</div>
                  </div>
                  <button className="hb" onClick={() => setViewingProfile(activeDmThread.otherUser)} style={{ marginLeft: "auto", background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>view profile</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {(dmMessages[activeDmThread.id] || []).length === 0
                    ? <div style={{ fontSize: 12, color: textMuted, textAlign: "center", marginTop: 40 }}>start the conversation.</div>
                    : (dmMessages[activeDmThread.id] || []).map((msg, i) => {
                        const isMe = msg.sender_id === authUser?.id;
                        return (
                          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexDirection: isMe ? "row-reverse" : "row" }}>
                            <Avatar initials={msg.sender_initials} size={26} dark={dark} />
                            <div style={{ maxWidth: "70%" }}>
                              <div style={{ background: isMe ? text : bg2, color: isMe ? bg : text, padding: "9px 13px", borderRadius: isMe ? "14px 14px 2px 14px" : "14px 14px 14px 2px", fontSize: 13, lineHeight: 1.55, border: isMe ? "none" : `1px solid ${border}` }}>{msg.text}</div>
                              <div style={{ fontSize: 10, color: textMuted, marginTop: 4, textAlign: isMe ? "right" : "left" }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                            </div>
                          </div>
                        );
                      })
                  }
                  <div ref={dmEndRef} />
                </div>
                <div style={{ padding: "14px 20px", borderTop: `1px solid ${border}`, display: "flex", gap: 10 }}>
                  <input placeholder="message..." value={dmInput} onChange={e => setDmInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSendDm()} style={{ ...inputStyle, fontSize: 13 }} />
                  <button className="hb" onClick={handleSendDm} style={{ ...btnP, padding: "10px 18px", flexShrink: 0 }}>send</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: textMuted, fontSize: 13 }}>
                {dmThreads.length > 0 ? "select a conversation" : ""}
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
              ["following", following.length],
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
                          {/* Editable progress */}
                          {editingProgress === p.id ? (
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                              <input type="range" min="0" max="100" defaultValue={p.progress || 0} style={{ flex: 1, accentColor: text }} onMouseUp={e => handleUpdateProgress(p.id, e.target.value)} onTouchEnd={e => handleUpdateProgress(p.id, e.target.value)} />
                              <span style={{ fontSize: 11, color: text, minWidth: 30 }}>{p.progress || 0}%</span>
                              <button onClick={() => setEditingProgress(null)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>done</button>
                            </div>
                          ) : (
                            <div onClick={e => { e.stopPropagation(); setEditingProgress(p.id); }}>
                              <ProgressBar value={p.progress || 0} dark={dark} />
                              <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>{p.progress || 0}% · <span style={{ textDecoration: "underline", cursor: "pointer" }}>edit</span></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
              }
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
                          <span style={{ fontSize: 10, color: myApp?.status === "accepted" ? text : textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>{myApp?.status || "pending"}</span>
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
              <span style={{ fontSize: 10, color: textMuted }}>{activeProject.progress || 0}%</span>
              {activeProject.owner_id === authUser?.id && (
                <button onClick={() => setEditingProgress(editingProgress === activeProject.id ? null : activeProject.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 10, textDecoration: "underline" }}>
                  {editingProgress === activeProject.id ? "done" : "edit progress"}
                </button>
              )}
            </div>
          </div>
          {editingProgress === activeProject.id && (
            <div className="pad" style={{ padding: "8px 28px", borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
              <input type="range" min="0" max="100" defaultValue={activeProject.progress || 0} style={{ width: "100%", accentColor: text }} onMouseUp={e => handleUpdateProgress(activeProject.id, e.target.value)} onTouchEnd={e => handleUpdateProgress(activeProject.id, e.target.value)} />
            </div>
          )}

          {/* Tab bar */}
          <div className="pad proj-tabs" style={{ padding: "0 28px", borderBottom: `1px solid ${border}`, display: "flex", flexShrink: 0, overflowX: "auto" }}>
            <TabBtn id="kanban" label="board" count={0} setter={setProjectTab} current={projectTab} />
            <TabBtn id="messages" label="chat" count={messages.length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="files" label="files" count={0} setter={setProjectTab} current={projectTab} />
            <TabBtn id="docs" label="docs" count={0} setter={setProjectTab} current={projectTab} />
            <TabBtn id="updates" label="updates" count={projectUpdates.length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="team" label="team" count={0} setter={setProjectTab} current={projectTab} />
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>

            {/* KANBAN BOARD */}
            {projectTab === "kanban" && (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <input placeholder="add a task..." value={newTaskText} onChange={e => setNewTaskText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddTask(activeProject.id)} style={{ ...inputStyle, fontSize: 12 }} />
                  <select value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} style={{ ...inputStyle, fontSize: 12, maxWidth: 160 }}>
                    <option value="">assign to...</option>
                    {users.filter(u => [authUser?.id, ...(applications.filter(a => a.project_id === activeProject.id && a.status === "accepted").map(a => a.applicant_id))].includes(u.id)).map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                  </select>
                  <button className="hb" onClick={() => handleAddTask(activeProject.id)} style={{ ...btnP, padding: "10px 16px", flexShrink: 0, fontSize: 12 }}>add</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                  {[
                    { id: "todo", label: "TO DO", tasks: tasks.filter(t => !t.done && !t.in_progress) },
                    { id: "inprogress", label: "IN PROGRESS", tasks: tasks.filter(t => t.in_progress && !t.done) },
                    { id: "done", label: "DONE", tasks: tasks.filter(t => t.done) },
                  ].map(col => (
                    <div key={col.id} style={{ background: bg2, borderRadius: 10, border: `1px solid ${border}`, padding: "14px", minHeight: 200 }}>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                        {col.label} <span style={{ background: bg3, borderRadius: 10, padding: "1px 7px" }}>{col.tasks.length}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {col.tasks.map(task => (
                          <div key={task.id} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px" }}>
                            <div style={{ fontSize: 12, color: text, marginBottom: 6, lineHeight: 1.4 }}>{task.text}</div>
                            {task.assigned_name && <div style={{ fontSize: 10, color: textMuted, marginBottom: 8 }}>→ {task.assigned_name}</div>}
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {col.id !== "todo" && <button className="hb" onClick={async () => { await supabase.from("tasks").update({ in_progress: false, done: false }).eq("id", task.id); setTasks(tasks.map(t => t.id === task.id ? { ...t, in_progress: false, done: false } : t)); }} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>← to do</button>}
                              {col.id === "todo" && <button className="hb" onClick={async () => { await supabase.from("tasks").update({ in_progress: true, done: false }).eq("id", task.id); setTasks(tasks.map(t => t.id === task.id ? { ...t, in_progress: true, done: false } : t)); }} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>in progress →</button>}
                              {col.id === "inprogress" && <button className="hb" onClick={() => handleToggleTask(task)} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>done →</button>}
                              <button className="hb" onClick={() => handleDeleteTask(task.id)} style={{ fontSize: 9, padding: "2px 7px", border: `1px solid ${border}`, borderRadius: 3, background: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                            </div>
                          </div>
                        ))}
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
                        return (
                          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: isMe ? "row-reverse" : "row" }}>
                            <Avatar initials={msg.from_initials} size={28} dark={dark} />
                            <div style={{ maxWidth: "72%" }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                                <span style={{ fontSize: 11, fontWeight: 500, color: text }}>{isMe ? "you" : msg.from_name}</span>
                                <span style={{ fontSize: 10, color: textMuted }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                              <div style={{ background: isMe ? text : bg2, color: isMe ? bg : text, padding: "8px 12px", borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px", fontSize: 12, lineHeight: 1.6, border: isMe ? "none" : `1px solid ${border}` }}>
                                {renderWithMentions(msg.text)}
                              </div>
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
                        <div key={file.id} style={{ background: bg2, borderRadius: i === 0 && projectFiles.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === projectFiles.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < projectFiles.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px", display: "flex", gap: 14, alignItems: "center" }}>
                          <div style={{ fontSize: 20, flexShrink: 0 }}>
                            {file.type?.startsWith("image") ? "🖼" : file.type?.includes("pdf") ? "📄" : file.type?.includes("video") ? "🎬" : "📎"}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: text, marginBottom: 2 }}>{file.name}</div>
                            <div style={{ fontSize: 10, color: textMuted }}>{file.user_name} · {new Date(file.created_at).toLocaleDateString()} · {file.size ? `${(file.size / 1024).toFixed(0)}kb` : ""}</div>
                          </div>
                          <a href={file.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: text, textDecoration: "underline", flexShrink: 0 }}>open</a>
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
                    <div style={{ fontSize: 16, color: text, fontWeight: 400, marginBottom: 4 }}>{activeDoc.title}</div>
                    <div style={{ fontSize: 10, color: textMuted, marginBottom: 16 }}>last edited by {activeDoc.last_edited_by}</div>
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
                      placeholder="Start writing..."
                      style={{ ...inputStyle, resize: "none", minHeight: 400, fontSize: 13, lineHeight: 1.8, fontFamily: "inherit" }}
                    />
                  </div>
                ) : (
                  projectDocs.length === 0
                    ? <div style={{ fontSize: 13, color: textMuted }}>no documents yet. create one to start writing together.</div>
                    : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {projectDocs.map((doc, i) => (
                          <div key={doc.id} onClick={() => setActiveDoc(doc)} style={{ background: bg2, borderRadius: i === 0 && projectDocs.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === projectDocs.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < projectDocs.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px", cursor: "pointer", transition: "opacity 0.15s" }}
                            onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                            <div style={{ fontSize: 14, color: text, marginBottom: 4 }}>{doc.title}</div>
                            <div style={{ fontSize: 10, color: textMuted }}>edited by {doc.last_edited_by} · {new Date(doc.updated_at).toLocaleDateString()}</div>
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
                  </div>
                ))}
                {applications.filter(a => a.project_id === activeProject.id && a.status === "accepted").length === 0 && (
                  <div style={{ fontSize: 12, color: textMuted, padding: "16px 0" }}>no collaborators yet.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PROFILE */}
      {appScreen === "profile" && (
        <div className="pad fu" style={{ width: "100%", padding: "48px 32px" }}>
          {!editProfile ? (
            <div>
              {/* Identity */}
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 20 }}>PROFILE</div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
                <Avatar initials={myInitials} size={52} dark={dark} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{profile?.name || "Anonymous"}</div>
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{profile?.role}</div>
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>{following.length} following · {myProjects.length} project{myProjects.length !== 1 ? "s" : ""}</div>
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
                            {item.url && <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: text, textDecoration: "underline", wordBreak: "break-all" }}>{item.url}</a>}
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

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="hb" onClick={() => setEditProfile(true)} style={btnG}>edit profile</button>
                <button className="hb" onClick={handleSignOut} style={{ ...btnG, color: textMuted }}>sign out</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 20 }}>EDIT PROFILE</div>
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

      {/* ADD PORTFOLIO MODAL */}
      {showAddPortfolio && (
        <div onClick={() => setShowAddPortfolio(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(10px)", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "24px", width: "100%", maxWidth: 440 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 16 }}>ADD TO PORTFOLIO</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={labelStyle}>TITLE</label><input style={inputStyle} placeholder="Project or work title" value={newPortfolioItem.title} onChange={e => setNewPortfolioItem({ ...newPortfolioItem, title: e.target.value })} /></div>
              <div><label style={labelStyle}>DESCRIPTION</label><textarea style={{ ...inputStyle, resize: "none" }} rows={3} placeholder="What did you build or create?" value={newPortfolioItem.description} onChange={e => setNewPortfolioItem({ ...newPortfolioItem, description: e.target.value })} /></div>
              <div><label style={labelStyle}>LINK (optional)</label><input style={inputStyle} placeholder="https://..." value={newPortfolioItem.url} onChange={e => setNewPortfolioItem({ ...newPortfolioItem, url: e.target.value })} /></div>
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
