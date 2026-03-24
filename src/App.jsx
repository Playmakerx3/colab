import { useState, useEffect, useRef } from "react";

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

const INITIAL_PROJECTS = [
  { id: 1, title: "AI-Powered Sports Analytics Platform", description: "Building a platform that uses machine learning to predict player performance and help fantasy sports players make better decisions. Need someone who can handle the data pipeline and model training.", owner: "Marcus T.", ownerInitials: "MT", category: "Tech / Software", skills: ["Engineering", "AI/ML", "Data"], collaborators: 1, maxCollaborators: 3, time: "2h ago", members: [{ initials: "MT", name: "Marcus T." }, { initials: "JR", name: "JR" }], status: "active", progress: 30, plugins: ["slack", "github", "drive"], tasks: [{ id: 1, text: "Set up data ingestion pipeline", done: true, assignee: "MT" }, { id: 2, text: "Build player stats API endpoints", done: true, assignee: "JR" }, { id: 3, text: "Train initial prediction model", done: false, assignee: "MT" }, { id: 4, text: "Design dashboard UI mockups", done: false, assignee: "" }], updates: [{ author: "Marcus T.", initials: "MT", text: "Finished the initial data schema. Starting on the ML pipeline this week.", time: "1h ago" }, { author: "JR", initials: "JR", text: "I can take on the frontend data viz once the API is ready.", time: "3h ago" }], messages: [{ from: "MT", name: "Marcus T.", text: "Hey, glad to have you on board!", time: "3h ago" }, { from: "JR", name: "JR", text: "Excited to work on this. When do we kick off?", time: "2h ago" }], applications: [] },
  { id: 2, title: "Independent Music Label — First EP", description: "I write and produce. Looking for someone who can handle mixing/mastering and another person who can shoot music video content. Got the studio time booked, need the team.", owner: "Destiny R.", ownerInitials: "DR", category: "Music", skills: ["Music", "Video", "Photography"], collaborators: 0, maxCollaborators: 2, time: "5h ago", members: [{ initials: "DR", name: "Destiny R." }], status: "open", progress: 0, plugins: ["notion", "drive"], tasks: [], updates: [], messages: [], applications: [] },
  { id: 3, title: "Sustainable Streetwear Brand", description: "Have the designs, have the manufacturer contact, need someone on the business/finance side and a marketing person who understands Gen Z culture. This is a real brand, not a hobby.", owner: "Jordan K.", ownerInitials: "JK", category: "Business / Startup", skills: ["Marketing", "Finance", "Design"], collaborators: 1, maxCollaborators: 2, time: "1d ago", members: [{ initials: "JK", name: "Jordan K." }, { initials: "AL", name: "AL" }], status: "active", progress: 55, plugins: ["slack", "notion", "figma"], tasks: [{ id: 1, text: "Finalize manufacturer contract", done: true, assignee: "JK" }, { id: 2, text: "Create brand identity deck", done: true, assignee: "AL" }, { id: 3, text: "Launch pre-order campaign", done: false, assignee: "AL" }, { id: 4, text: "Set up Shopify storefront", done: false, assignee: "" }], updates: [{ author: "Jordan K.", initials: "JK", text: "Manufacturer confirmed MOQ of 50 units.", time: "6h ago" }], messages: [], applications: [] },
  { id: 4, title: "Documentary: Housing Crisis in the Bay", description: "Journalist with 5 years experience. Have interviews lined up, story arc mapped. Need a cinematographer and an editor. Passion project with real distribution potential.", owner: "Priya M.", ownerInitials: "PM", category: "Film / Video", skills: ["Video", "Writing", "Photography"], collaborators: 0, maxCollaborators: 2, time: "2d ago", members: [{ initials: "PM", name: "Priya M." }], status: "open", progress: 0, plugins: ["drive", "notion"], tasks: [], updates: [], messages: [], applications: [] },
  { id: 5, title: "Chrome Extension for Contract Redlining", description: "Lawyer-turned-dev with a working prototype. Need a designer to make it look good and a growth person for go-to-market. B2B SaaS, already have 3 pilot users.", owner: "Alex W.", ownerInitials: "AW", category: "Tech / Software", skills: ["Design", "Marketing", "Engineering"], collaborators: 1, maxCollaborators: 2, time: "3d ago", members: [{ initials: "AW", name: "Alex W." }, { initials: "SC", name: "SC" }], status: "active", progress: 70, plugins: ["github", "figma", "slack"], tasks: [{ id: 1, text: "Ship v0.3 to pilot users", done: true, assignee: "AW" }, { id: 2, text: "Redesign onboarding flow", done: false, assignee: "SC" }, { id: 3, text: "Write go-to-market brief", done: false, assignee: "SC" }], updates: [{ author: "Alex W.", initials: "AW", text: "v0.3 shipped to pilot users. Getting good feedback.", time: "1d ago" }], messages: [], applications: [] },
  { id: 6, title: "Fintech App for Gen Z Investing", description: "Building a micro-investing app targeted at 18-25 year olds. Have the product spec and initial designs. Need a finance/compliance person and a growth marketer who gets the demographic.", owner: "Sam L.", ownerInitials: "SL", category: "Tech / Software", skills: ["Finance", "Marketing", "Product"], collaborators: 0, maxCollaborators: 2, time: "4h ago", members: [{ initials: "SL", name: "Sam L." }], status: "open", progress: 0, plugins: ["notion", "figma"], tasks: [], updates: [], messages: [], applications: [] },
  { id: 7, title: "Podcast: Future of Work", description: "Launching a weekly podcast on how AI is changing careers. Have the equipment, format, and first 5 episode scripts. Need a co-host who can talk finance and markets, and someone for audio.", owner: "Nia B.", ownerInitials: "NB", category: "Creative / Art", skills: ["Finance", "Writing", "Marketing"], collaborators: 0, maxCollaborators: 2, time: "8h ago", members: [{ initials: "NB", name: "Nia B." }], status: "open", progress: 0, plugins: ["drive"], tasks: [], updates: [], messages: [], applications: [] },
  { id: 8, title: "E-Commerce Brand for Natural Hair Products", description: "Formulated 3 products, have suppliers lined up. Need someone who can build the Shopify store and run paid social. Looking for a long-term equity partner.", owner: "Zara M.", ownerInitials: "ZM", category: "Business / Startup", skills: ["Marketing", "Design", "Sales"], collaborators: 0, maxCollaborators: 2, time: "12h ago", members: [{ initials: "ZM", name: "Zara M." }], status: "open", progress: 0, plugins: [], tasks: [], updates: [], messages: [], applications: [] },
];

function Avatar({ initials, size = 32, dark }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: dark ? "#fff" : "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.32, fontWeight: 700, color: dark ? "#000" : "#fff", flexShrink: 0, fontFamily: "inherit" }}>
      {initials}
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

export default function CoLab() {
  const [dark, setDark] = useState(true);
  const [screen, setScreen] = useState("landing"); // landing | onboard | app
  const [appScreen, setAppScreen] = useState("explore");
  const [exploreTab, setExploreTab] = useState("for-you");
  const [activeProject, setActiveProject] = useState(null);
  const [projectTab, setProjectTab] = useState("tasks");
  const [projects, setProjects] = useState(INITIAL_PROJECTS);
  const [myProjects, setMyProjects] = useState([INITIAL_PROJECTS[0]]);
  const [appliedTo, setAppliedTo] = useState([]);
  const [profile, setProfile] = useState({ name: "", role: "", bio: "", skills: [] });
  const [onboardStep, setOnboardStep] = useState(0);
  const [notifications, setNotifications] = useState([
    { id: 1, type: "application", text: "Sam L. applied to your project", sub: "AI-Powered Sports Analytics Platform", time: "10m ago", read: false, projectId: 1, applicant: { initials: "SL", name: "Sam L.", role: "Full-stack Engineer", bio: "5 years exp in ML/data pipelines. Big sports fan, would love to build this." } },
    { id: 2, type: "application", text: "Zara M. applied to your project", sub: "AI-Powered Sports Analytics Platform", time: "1h ago", read: false, projectId: 1, applicant: { initials: "ZM", name: "Zara M.", role: "Data Scientist", bio: "Former NBA stats analyst. Have built similar pipelines at scale." } },
    { id: 3, type: "update", text: "Jordan K. posted an update", sub: "Sustainable Streetwear Brand", time: "6h ago", read: true, projectId: 3 },
  ]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [filterSkill, setFilterSkill] = useState(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [newProject, setNewProject] = useState({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2 });
  const [showCreate, setShowCreate] = useState(false);
  const [newUpdate, setNewUpdate] = useState("");
  const [newTaskText, setNewTaskText] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [editProfile, setEditProfile] = useState(false);
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
  const btnPrimary = { background: text, color: bg, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
  const btnGhost = { background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 20px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const unreadCount = notifications.filter(n => !n.read).length;
  const myInitials = profile.name ? profile.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "ME";

  const getMatchScore = (project) => profile.skills.filter(s => project.skills.includes(s)).length;

  const updateProjects = (updated) => {
    setProjects(updated);
    if (activeProject) setActiveProject(updated.find(p => p.id === activeProject.id) || null);
    setMyProjects(prev => prev.map(p => updated.find(u => u.id === p.id) || p));
  };

  const markNotificationsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const handleAcceptApplication = (notif) => {
    const updated = projects.map(p => p.id === notif.projectId
      ? { ...p, members: [...p.members, { initials: notif.applicant.initials, name: notif.applicant.name }], collaborators: p.collaborators + 1, messages: [...p.messages, { from: "system", name: "CoLab", text: `${notif.applicant.name} joined the project.`, time: "just now" }] }
      : p
    );
    updateProjects(updated);
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    showToast(`${notif.applicant.name} has been added to the project.`);
  };

  const handleDeclineApplication = (notif) => {
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    showToast(`Application declined.`);
  };

  const handleApply = (project) => {
    if (appliedTo.includes(project.id)) return;
    setAppliedTo([...appliedTo, project.id]);
    const newNotif = { id: Date.now(), type: "application", text: `${profile.name} applied to your project`, sub: project.title, time: "just now", read: false, projectId: project.id, applicant: { initials: myInitials, name: profile.name, role: profile.role, bio: profile.bio } };
    setNotifications(prev => [newNotif, ...prev]);
    showToast(`Applied to "${project.title}"`);
    setActiveProject(null);
  };

  const handlePostProject = () => {
    if (!newProject.title || !newProject.description) return;
    const p = { ...newProject, id: Date.now(), owner: profile.name, ownerInitials: myInitials, collaborators: 0, time: "just now", members: [{ initials: myInitials, name: profile.name }], status: "open", progress: 0, plugins: [], tasks: [], updates: [], messages: [], applications: [] };
    setProjects([p, ...projects]);
    setMyProjects([p, ...myProjects]);
    setNewProject({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2 });
    setShowCreate(false);
    showToast("Project posted.");
  };

  const sendMessage = (projectId) => {
    if (!newMessage.trim()) return;
    const msg = { from: myInitials, name: profile.name, text: newMessage, time: "just now" };
    updateProjects(projects.map(p => p.id === projectId ? { ...p, messages: [...p.messages, msg] } : p));
    setNewMessage("");
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const toggleTask = (projectId, taskId) => {
    updateProjects(projects.map(p => p.id === projectId ? { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) } : p));
  };

  const addTask = (projectId) => {
    if (!newTaskText.trim()) return;
    updateProjects(projects.map(p => p.id === projectId ? { ...p, tasks: [...p.tasks, { id: Date.now(), text: newTaskText, done: false, assignee: "" }] } : p));
    setNewTaskText("");
  };

  const deleteTask = (projectId, taskId) => {
    updateProjects(projects.map(p => p.id === projectId ? { ...p, tasks: p.tasks.filter(t => t.id !== taskId) } : p));
  };

  const postUpdate = (projectId) => {
    if (!newUpdate.trim()) return;
    updateProjects(projects.map(p => p.id === projectId ? { ...p, updates: [{ author: profile.name, initials: myInitials, text: newUpdate, time: "just now" }, ...p.updates] } : p));
    setNewUpdate("");
    showToast("Update posted.");
  };

  const handleAddPlugin = (pluginId, projectId) => {
    updateProjects(projects.map(p => p.id === projectId ? { ...p, plugins: p.plugins.includes(pluginId) ? p.plugins.filter(x => x !== pluginId) : [...p.plugins, pluginId] } : p));
    showToast("Plugin connected.");
  };

  const browseBase = projects.filter(p => !myProjects.find(m => m.id === p.id));
  const forYouProjects = browseBase.map(p => ({ ...p, _score: getMatchScore(p) })).filter(p => p._score > 0).sort((a, b) => b._score - a._score);
  const allProjects = browseBase.map(p => ({ ...p, _score: getMatchScore(p) })).filter(p => (!filterSkill || p.skills.includes(filterSkill)) && (!search || p.title.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => b._score - a._score);

  const tabBtn = (id, label, count) => (
    <button onClick={() => setProjectTab(id)} style={{ background: "none", border: "none", borderBottom: projectTab === id ? `1px solid ${text}` : "1px solid transparent", color: projectTab === id ? text : textMuted, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginRight: 24, transition: "all 0.15s", display: "inline-flex", gap: 6, alignItems: "center" }}>
      {label}{count > 0 && <span style={{ fontSize: 10, background: bg3, borderRadius: 10, padding: "1px 6px", color: textMuted }}>{count}</span>}
    </button>
  );

  const ProjectRow = ({ p, i }) => {
    const spotsLeft = p.maxCollaborators - p.collaborators;
    return (
      <div className="fu hover-row" style={{ animationDelay: `${i * 0.04}s`, borderBottom: `1px solid ${border}`, padding: "22px 0", display: "grid", gridTemplateColumns: "1fr 110px", gap: 16, alignItems: "start", cursor: "pointer", transition: "opacity 0.15s" }} onClick={() => setActiveProject(p)}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <Avatar initials={p.ownerInitials} size={22} dark={dark} />
            <span style={{ fontSize: 11, color: textMuted }}>{p.owner}</span>
            <span style={{ fontSize: 11, color: textSub }}>·</span>
            <span style={{ fontSize: 11, color: textMuted }}>{p.time}</span>
            {appliedTo.includes(p.id) && <span style={{ fontSize: 10, color: textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px" }}>applied</span>}
            {p._score > 0 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: `1px solid ${dark ? "#ffffff25" : "#00000020"}`, color: text }}>{p._score >= 2 ? "★★" : "★"} {p._score >= 2 ? "strong match" : "match"}</span>}
          </div>
          <div style={{ fontSize: 15, color: text, marginBottom: 6, letterSpacing: "-0.3px" }}>{p.title}</div>
          <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 10 }}>{p.description.slice(0, 110)}...</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {p.skills.map(s => <span key={s} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: `1px solid ${profile.skills.includes(s) ? (dark ? "#ffffff40" : "#00000030") : border}`, color: profile.skills.includes(s) ? text : textMuted, fontWeight: profile.skills.includes(s) ? 500 : 400 }}>{s}</span>)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: spotsLeft > 0 ? text : textMuted, fontWeight: spotsLeft > 0 ? 500 : 300, marginBottom: 3 }}>{spotsLeft > 0 ? `${spotsLeft} open` : "full"}</div>
          <div style={{ fontSize: 10, color: textMuted }}>{p.category}</div>
        </div>
      </div>
    );
  };

  // ── LANDING PAGE ──
  if (screen === "landing") {
    return (
      <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'DM Mono', monospace", transition: "all 0.2s" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @keyframes fu { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
          .fu { animation: fu 0.4s ease forwards; opacity: 0; }
          .hb:hover { opacity: 0.7; }
          .card-hover:hover { border-color: ${text} !important; }
        `}</style>

        {/* Nav */}
        <nav style={{ padding: "0 40px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${border}` }}>
          <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.5px" }}>[CoLab]</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="hb" onClick={() => setDark(!dark)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, color: textMuted, fontFamily: "inherit" }}>{dark ? "☀" : "☾"}</button>
            <button className="hb" onClick={() => setScreen("onboard")} style={{ ...{ background: text, color: bg, border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" } }}>Get started</button>
          </div>
        </nav>

        {/* Hero */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 32px 60px" }}>
          <div className="fu" style={{ animationDelay: "0s" }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "3px", marginBottom: 20 }}>THE COLLABORATIVE WORKSPACE</div>
            <h1 style={{ fontSize: "clamp(44px, 8vw, 88px)", fontWeight: 400, lineHeight: 0.95, letterSpacing: "-4px", marginBottom: 28, color: text }}>
              Don't just<br />connect.<br /><span style={{ color: textMuted }}>Build together.</span>
            </h1>
          </div>
          <div className="fu" style={{ animationDelay: "0.1s" }}>
            <p style={{ fontSize: 14, color: textMuted, maxWidth: 420, lineHeight: 1.8, marginBottom: 36 }}>
              CoLab is where founders, creatives, engineers, and makers find each other and actually get work done — in one place, not scattered across five apps.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="hb" onClick={() => setScreen("onboard")} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "13px 28px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Start building →</button>
              <button className="hb" onClick={() => { setScreen("app"); setAppScreen("explore"); }} style={{ background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 8, padding: "13px 28px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Browse projects</button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="fu" style={{ animationDelay: "0.2s", borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 32px", display: "flex", gap: 0 }}>
            {[["500+", "builders"], ["200+", "active projects"], ["48", "skill categories"], ["100%", "free to start"]].map(([val, label], i) => (
              <div key={i} style={{ flex: 1, borderRight: i < 3 ? `1px solid ${border}` : "none", padding: "0 28px", textAlign: i === 0 ? "left" : "center" }}>
                <div style={{ fontSize: 24, fontWeight: 400, color: text, letterSpacing: "-1px" }}>{val}</div>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "72px 32px" }}>
          <div className="fu" style={{ animationDelay: "0.3s" }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 40 }}>HOW IT WORKS</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
              {[
                ["01", "Build your profile", "List your skills and what you're looking to work on. Your profile is how people know what you bring."],
                ["02", "Find your match", "Post a project and get matched with people who have exactly the skills you need — or browse and apply to something that excites you."],
                ["03", "Build together", "Once matched, your project space has everything you need — tasks, updates, team chat, and plugin integrations."],
              ].map(([num, title, desc], i) => (
                <div key={i} className="card-hover" style={{ padding: "28px", background: bg2, border: `1px solid ${border}`, borderRight: i < 2 ? "none" : `1px solid ${border}`, transition: "border 0.2s", cursor: "default" }}>
                  <div style={{ fontSize: 11, color: textMuted, marginBottom: 16 }}>{num}</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: text, marginBottom: 10, letterSpacing: "-0.3px" }}>{title}</div>
                  <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.7 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Featured projects */}
        <div style={{ borderTop: `1px solid ${border}` }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "72px 32px" }}>
            <div className="fu" style={{ animationDelay: "0.4s" }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 32 }}>LIVE PROJECTS</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {INITIAL_PROJECTS.slice(0, 4).map((p, i) => (
                  <div key={p.id} style={{ padding: "18px 0", borderBottom: `1px solid ${border}`, display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 14, color: text, marginBottom: 4 }}>{p.title}</div>
                      <div style={{ display: "flex", gap: 5 }}>
                        {p.skills.map(s => <span key={s} style={{ fontSize: 10, padding: "1px 8px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: textMuted }}>{p.maxCollaborators - p.collaborators} spot{p.maxCollaborators - p.collaborators !== 1 ? "s" : ""} open</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 24 }}>
                <button className="hb" onClick={() => { setScreen("app"); setAppScreen("explore"); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>view all projects →</button>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ borderTop: `1px solid ${border}`, background: bg2 }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "72px 32px", textAlign: "center" }}>
            <div className="fu" style={{ animationDelay: "0.5s" }}>
              <h2 style={{ fontSize: "clamp(28px, 5vw, 52px)", fontWeight: 400, letterSpacing: "-2px", marginBottom: 16, color: text }}>Ready to build?</h2>
              <p style={{ fontSize: 13, color: textMuted, marginBottom: 28 }}>Join hundreds of builders already collaborating on CoLab.</p>
              <button className="hb" onClick={() => setScreen("onboard")} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "14px 32px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                Create your profile →
              </button>
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${border}`, padding: "20px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: textMuted }}>[CoLab] — build together.</div>
          <div style={{ fontSize: 11, color: textMuted }}>© 2026</div>
        </div>
      </div>
    );
  }

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
    const canNext = step.field === "skills" ? profile.skills.length > 0 : profile[step.field]?.trim().length > 0;

    return (
      <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'DM Mono', monospace", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } input, textarea { outline: none; font-family: inherit; } @keyframes fu { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .fu { animation: fu 0.3s ease forwards; opacity: 0; } .hb:hover { opacity: 0.7; }`}</style>
        <div style={{ width: "100%", maxWidth: 480 }}>
          {/* Progress dots */}
          <div style={{ display: "flex", gap: 6, marginBottom: 40, justifyContent: "center" }}>
            {steps.map((_, i) => <div key={i} style={{ width: i === onboardStep ? 20 : 6, height: 6, borderRadius: 3, background: i <= onboardStep ? text : textSub, transition: "all 0.3s" }} />)}
          </div>

          <div className="fu" key={onboardStep}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 16 }}>STEP {onboardStep + 1} OF {steps.length}</div>
            <h2 style={{ fontSize: 28, fontWeight: 400, letterSpacing: "-1px", marginBottom: 28, color: text }}>{step.label}</h2>

            {step.type === "input" && (
              <input autoFocus style={{ background: "none", border: "none", borderBottom: `1px solid ${border}`, borderRadius: 0, padding: "10px 0", color: text, fontSize: 18, width: "100%", fontFamily: "inherit", outline: "none", letterSpacing: "-0.5px" }} placeholder={step.placeholder} value={profile[step.field]} onChange={e => setProfile({ ...profile, [step.field]: e.target.value }) } onKeyDown={e => e.key === "Enter" && canNext && (isLast ? (setScreen("app"), setAppScreen("explore")) : setOnboardStep(s => s + 1))} />
            )}
            {step.type === "textarea" && (
              <textarea autoFocus style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "12px", color: text, fontSize: 13, width: "100%", fontFamily: "inherit", outline: "none", resize: "none", lineHeight: 1.7 }} placeholder={step.placeholder} rows={4} value={profile[step.field]} onChange={e => setProfile({ ...profile, [step.field]: e.target.value })} />
            )}
            {step.type === "skills" && (
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {SKILLS.map(s => {
                    const sel = profile.skills.includes(s);
                    return <button key={s} className="hb" onClick={() => { const skills = sel ? profile.skills.filter(x => x !== s) : [...profile.skills, s]; setProfile({ ...profile, skills }); }} style={{ padding: "5px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>;
                  })}
                </div>
                {profile.skills.length > 0 && <div style={{ fontSize: 11, color: textMuted }}>{profile.skills.length} skill{profile.skills.length !== 1 ? "s" : ""} selected</div>}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 32 }}>
              <button className="hb" onClick={() => onboardStep === 0 ? setScreen("landing") : setOnboardStep(s => s - 1)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                {onboardStep === 0 ? "← back" : "← previous"}
              </button>
              <button className="hb" onClick={() => isLast ? (setScreen("app"), setAppScreen("explore")) : setOnboardStep(s => s + 1)} disabled={!canNext}
                style={{ background: canNext ? text : textSub, color: bg, border: "none", borderRadius: 8, padding: "11px 24px", fontSize: 12, fontWeight: 500, cursor: canNext ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.2s" }}>
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
    <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'DM Mono', monospace", transition: "all 0.2s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #2a2a2a; }
        input, select, textarea { outline: none; font-family: inherit; }
        @keyframes fu { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .fu { animation: fu 0.3s ease forwards; opacity: 0; }
        @keyframes tin { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .hover-row:hover { opacity: 0.6; }
        .hb:hover { opacity: 0.7; }
        .task-row:hover .task-del { opacity: 1 !important; }
      `}</style>

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, background: dark ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${border}`, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 50 }}>
        <button onClick={() => { setAppScreen("explore"); setActiveProject(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 500, color: text, letterSpacing: "-0.5px" }}>
          [CoLab]
        </button>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {[["explore", "explore"], ["dashboard", "dashboard"], ["profile", (profile.name || "profile").split(" ")[0].toLowerCase()]].map(([id, label]) => (
            <button key={id} onClick={() => { setAppScreen(id); setActiveProject(null); setShowNotifications(false); }}
              style={{ background: appScreen === id && !activeProject && !showNotifications ? bg3 : "none", color: appScreen === id && !activeProject && !showNotifications ? text : textMuted, border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
              {label}
            </button>
          ))}
          {/* Notifications bell */}
          <button onClick={() => { setShowNotifications(!showNotifications); markNotificationsRead(); }}
            style={{ position: "relative", background: showNotifications ? bg3 : "none", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", color: textMuted, fontSize: 14, fontFamily: "inherit", marginLeft: 2 }}>
            ◎
            {unreadCount > 0 && <span style={{ position: "absolute", top: 3, right: 4, width: 7, height: 7, borderRadius: "50%", background: text, border: `1px solid ${bg}` }} />}
          </button>
          <div style={{ width: 1, height: 16, background: border, margin: "0 6px" }} />
          <button onClick={() => setDark(!dark)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, color: textMuted, fontFamily: "inherit" }}>
            {dark ? "☀" : "☾"}
          </button>
        </div>
      </nav>

      {/* NOTIFICATIONS PANEL */}
      {showNotifications && (
        <div style={{ position: "fixed", top: 58, right: 16, width: 340, background: bg, border: `1px solid ${border}`, borderRadius: 12, zIndex: 200, animation: "slideIn 0.2s ease", boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.6)" : "0 8px 32px rgba(0,0,0,0.1)", maxHeight: "80vh", overflowY: "auto" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${border}`, fontSize: 11, color: textMuted, letterSpacing: "1px" }}>NOTIFICATIONS</div>
          {notifications.length === 0
            ? <div style={{ padding: "24px 16px", fontSize: 12, color: textMuted }}>no notifications.</div>
            : notifications.map(notif => (
              <div key={notif.id} style={{ padding: "14px 16px", borderBottom: `1px solid ${border}` }}>
                <div style={{ fontSize: 12, color: text, marginBottom: 3 }}>{notif.text}</div>
                <div style={{ fontSize: 11, color: textMuted, marginBottom: notif.type === "application" ? 10 : 0 }}>{notif.sub} · {notif.time}</div>
                {notif.type === "application" && notif.applicant && (
                  <div>
                    <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <Avatar initials={notif.applicant.initials} size={28} dark={dark} />
                        <div>
                          <div style={{ fontSize: 12, color: text }}>{notif.applicant.name}</div>
                          <div style={{ fontSize: 10, color: textMuted }}>{notif.applicant.role}</div>
                        </div>
                      </div>
                      {notif.applicant.bio && <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.6 }}>{notif.applicant.bio}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="hb" onClick={() => handleAcceptApplication(notif)} style={{ flex: 1, background: text, color: bg, border: "none", borderRadius: 6, padding: "7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>accept</button>
                      <button className="hb" onClick={() => handleDeclineApplication(notif)} style={{ flex: 1, background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 6, padding: "7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>decline</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          }
        </div>
      )}

      {/* overlay to close notifications */}
      {showNotifications && <div onClick={() => setShowNotifications(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />}

      {/* ── EXPLORE ── */}
      {appScreen === "explore" && !activeProject && (
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "52px 24px" }}>
          <div className="fu">
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 16 }}>FIND YOUR PEOPLE. BUILD SOMETHING REAL.</div>
            <h1 style={{ fontSize: "clamp(36px, 6vw, 68px)", fontWeight: 400, lineHeight: 1.0, letterSpacing: "-3px", marginBottom: 18, color: text }}>
              Don't just connect.<br />Build together.
            </h1>
            <p style={{ fontSize: 13, color: textMuted, maxWidth: 360, lineHeight: 1.8, marginBottom: 28 }}>Post your project. Find people with the skills you need. Get to work.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="hb" onClick={() => setShowCreate(true)} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Post a project</button>
              <button className="hb" onClick={() => document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" })} style={btnGhost}>Browse</button>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${border}`, margin: "44px 0 0", display: "flex", gap: 40, paddingTop: 28 }}>
            {[["open now", projects.filter(p => p.collaborators < p.maxCollaborators).length], ["projects", projects.length], ["skills", SKILLS.length]].map(([l, v]) => (
              <div key={l}><div style={{ fontSize: 26, color: text, letterSpacing: "-1px" }}>{v}</div><div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{l}</div></div>
            ))}
          </div>

          <div id="feed" style={{ borderBottom: `1px solid ${border}`, margin: "36px 0 0", display: "flex" }}>
            {["for-you", "all"].map(id => (
              <button key={id} onClick={() => setExploreTab(id)} style={{ background: "none", border: "none", borderBottom: exploreTab === id ? `1px solid ${text}` : "1px solid transparent", color: exploreTab === id ? text : textMuted, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginRight: 24, transition: "all 0.15s", display: "inline-flex", gap: 6, alignItems: "center" }}>
                {id === "for-you" ? "for you" : "all projects"}
                {id === "for-you" && forYouProjects.length > 0 && <span style={{ fontSize: 10, background: bg3, borderRadius: 10, padding: "1px 6px", color: textMuted }}>{forYouProjects.length}</span>}
              </button>
            ))}
          </div>

          {exploreTab === "for-you" && (
            <div>
              {profile.skills.length === 0
                ? <div style={{ padding: "40px 0", color: textMuted, fontSize: 13 }}>add skills to your profile to see matched projects. <button onClick={() => setAppScreen("profile")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>update profile →</button></div>
                : forYouProjects.length === 0
                  ? <div style={{ padding: "40px 0", color: textMuted, fontSize: 13 }}>no matches yet. <button className="hb" onClick={() => setExploreTab("all")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>browse all →</button></div>
                  : <div><div style={{ padding: "16px 0 4px", fontSize: 11, color: textMuted }}>showing {forYouProjects.length} project{forYouProjects.length !== 1 ? "s" : ""} matching your skills — {profile.skills.slice(0, 3).join(", ")}{profile.skills.length > 3 ? ` +${profile.skills.length - 3}` : ""}</div>{forYouProjects.map((p, i) => <ProjectRow key={p.id} p={p} i={i} />)}</div>
              }
            </div>
          )}

          {exploreTab === "all" && (
            <div>
              <div style={{ padding: "20px 0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                <input placeholder="search projects..." value={search} onChange={e => setSearch(e.target.value)} style={inputStyle} />
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {["Design", "Engineering", "Marketing", "Music", "Video", "Finance", "AI/ML", "Writing", "Product"].map(s => {
                    const sel = filterSkill === s;
                    return <button key={s} className="hb" onClick={() => setFilterSkill(sel ? null : s)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>;
                  })}
                  {filterSkill && <button className="hb" onClick={() => setFilterSkill(null)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: "none", color: textMuted, border: `1px solid ${border}` }}>clear</button>}
                </div>
              </div>
              {allProjects.length === 0 ? <div style={{ padding: "40px 0", textAlign: "center", color: textMuted, fontSize: 12 }}>no results.</div> : allProjects.map((p, i) => <ProjectRow key={p.id} p={p} i={i} />)}
            </div>
          )}
        </div>
      )}

      {/* ── EXPLORE PROJECT DETAIL ── */}
      {appScreen === "explore" && activeProject && (
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "36px 24px" }}>
          <button className="hb" onClick={() => setActiveProject(null)} style={{ ...btnGhost, marginBottom: 24, padding: "6px 14px", fontSize: 11 }}>← back</button>
          <div className="fu">
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
              <Avatar initials={activeProject.ownerInitials} size={40} dark={dark} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: text }}>{activeProject.owner}</div>
                <div style={{ fontSize: 11, color: textMuted }}>{activeProject.time} · {activeProject.category}</div>
              </div>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-0.8px", marginBottom: 12, color: text }}>{activeProject.title}</h2>
            <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 24 }}>{activeProject.description}</p>
            <div style={{ marginBottom: 24 }}>
              <div style={labelStyle}>SKILLS NEEDED</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {activeProject.skills.map(s => {
                  const isMatch = profile.skills.includes(s);
                  return <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${isMatch ? (dark ? "#ffffff50" : "#00000040") : border}`, borderRadius: 3, color: isMatch ? text : textMuted, fontWeight: isMatch ? 500 : 400 }}>{s}{isMatch ? " ★" : ""}</span>;
                })}
              </div>
            </div>
            {getMatchScore(activeProject) > 0 && (
              <div style={{ padding: "10px 14px", background: bg2, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12, color: textMuted, marginBottom: 20 }}>
                you match <strong style={{ color: text }}>{getMatchScore(activeProject)}</strong> of the skills needed for this project.
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: bg2, borderRadius: 8, marginBottom: 24, border: `1px solid ${border}` }}>
              <div style={{ fontSize: 12, color: textMuted }}>{activeProject.collaborators}/{activeProject.maxCollaborators} collaborators</div>
              <div style={{ display: "flex" }}>
                {activeProject.members.map((m, i) => <div key={i} style={{ marginLeft: i > 0 ? -6 : 0, border: `2px solid ${bg2}`, borderRadius: "50%" }}><Avatar initials={m.initials} size={26} dark={dark} /></div>)}
              </div>
            </div>
            {appliedTo.includes(activeProject.id)
              ? <div style={{ textAlign: "center", padding: 12, background: bg2, borderRadius: 8, color: textMuted, fontSize: 12, border: `1px solid ${border}` }}>applied — waiting to hear back</div>
              : <button className="hb" onClick={() => handleApply(activeProject)} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "13px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>Apply to collaborate →</button>
            }
          </div>
        </div>
      )}

      {/* ── DASHBOARD ── */}
      {appScreen === "dashboard" && !activeProject && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "44px 24px" }}>
          <div className="fu" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 10 }}>DASHBOARD</div>
              <h2 style={{ fontSize: 28, fontWeight: 400, letterSpacing: "-1.5px", color: text }}>
                {profile.name ? `${profile.name.split(" ")[0]}'s workspace.` : "Your workspace."}
              </h2>
            </div>
            <button className="hb" onClick={() => setShowCreate(true)} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>+ new project</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, marginBottom: 40, border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
            {[["active projects", myProjects.filter(p => p.status === "active").length], ["applications", appliedTo.length], ["collaborators", myProjects.reduce((s, p) => s + p.members.length - 1, 0)]].map(([label, val], i) => (
              <div key={i} style={{ padding: "20px 24px", background: bg2, borderRight: i < 2 ? `1px solid ${border}` : "none" }}>
                <div style={{ fontSize: 28, fontWeight: 400, color: text, letterSpacing: "-1px" }}>{val}</div>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 16 }}>MY PROJECTS</div>
            {myProjects.length === 0
              ? <div style={{ padding: "32px 0", color: textMuted, fontSize: 12, borderTop: `1px solid ${border}` }}>no projects yet. <button onClick={() => setShowCreate(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>post one →</button></div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {myProjects.map((p, i) => {
                    const doneTasks = p.tasks.filter(t => t.done).length;
                    return (
                      <div key={p.id} className="fu hover-row" style={{ animationDelay: `${i * 0.04}s`, background: bg2, borderRadius: i === 0 && myProjects.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === myProjects.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < myProjects.length - 1 ? "none" : `1px solid ${border}`, padding: "16px 20px", cursor: "pointer", transition: "opacity 0.15s" }}
                        onClick={() => { setActiveProject(p); setProjectTab("tasks"); }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 14, color: text, letterSpacing: "-0.3px", marginBottom: 3 }}>{p.title}</div>
                            <div style={{ fontSize: 11, color: textMuted }}>{p.category} · {p.members.length} member{p.members.length !== 1 ? "s" : ""}{p.tasks.length > 0 ? ` · ${doneTasks}/${p.tasks.length} tasks` : ""}</div>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 10, padding: "2px 8px", border: `1px solid ${border}`, borderRadius: 3, color: p.status === "active" ? text : textMuted }}>{p.status}</span>
                            <div style={{ display: "flex" }}>
                              {p.members.slice(0, 3).map((m, i) => <div key={i} style={{ marginLeft: i > 0 ? -5 : 0, border: `2px solid ${bg2}`, borderRadius: "50%" }}><Avatar initials={m.initials} size={22} dark={dark} /></div>)}
                            </div>
                          </div>
                        </div>
                        <ProgressBar value={p.progress} dark={dark} />
                        <div style={{ fontSize: 10, color: textMuted, marginTop: 6 }}>{p.progress}% complete</div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>

          {appliedTo.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 16 }}>APPLICATIONS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {projects.filter(p => appliedTo.includes(p.id)).map((p, i, arr) => (
                  <div key={p.id} className="fu hover-row" style={{ animationDelay: `${i * 0.04}s`, background: bg2, borderRadius: i === 0 && arr.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === arr.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < arr.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "opacity 0.15s" }}
                    onClick={() => { setActiveProject(p); setProjectTab("messages"); }}>
                    <div>
                      <div style={{ fontSize: 13, color: text, marginBottom: 2 }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>{p.owner} · {p.category}</div>
                    </div>
                    <span style={{ fontSize: 10, color: textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "2px 8px" }}>pending</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PROJECT SPACE ── */}
      {appScreen === "dashboard" && activeProject && (
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 24px" }}>
          <button className="hb" onClick={() => setActiveProject(null)} style={{ ...btnGhost, marginBottom: 24, padding: "6px 14px", fontSize: 11 }}>← dashboard</button>
          <div className="fu">
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>PROJECT SPACE</div>
              <h2 style={{ fontSize: 20, fontWeight: 400, letterSpacing: "-0.8px", color: text, marginBottom: 4 }}>{activeProject.title}</h2>
              <div style={{ fontSize: 11, color: textMuted, marginBottom: 16 }}>{activeProject.category} · {activeProject.members.length} member{activeProject.members.length !== 1 ? "s" : ""}</div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: textMuted }}>progress</span>
                <span style={{ fontSize: 10, color: text }}>{activeProject.progress}%</span>
              </div>
              <ProgressBar value={activeProject.progress} dark={dark} />
            </div>

            <div style={{ borderBottom: `1px solid ${border}`, marginBottom: 24, display: "flex" }}>
              {tabBtn("tasks", "tasks", activeProject.tasks.filter(t => !t.done).length)}
              {tabBtn("messages", "messages", activeProject.messages.length)}
              {tabBtn("updates", "updates", activeProject.updates.length)}
              {tabBtn("team", "team", 0)}
              {tabBtn("plugins", "plugins", activeProject.plugins.length)}
            </div>

            {/* TASKS */}
            {projectTab === "tasks" && (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <input placeholder="add a task..." value={newTaskText} onChange={e => setNewTaskText(e.target.value)} onKeyDown={e => e.key === "Enter" && addTask(activeProject.id)} style={{ ...inputStyle, fontSize: 12 }} />
                  <button className="hb" onClick={() => addTask(activeProject.id)} style={{ ...btnPrimary, padding: "10px 16px", flexShrink: 0, fontSize: 12 }}>add</button>
                </div>
                {activeProject.tasks.length === 0
                  ? <div style={{ fontSize: 12, color: textMuted, padding: "20px 0" }}>no tasks yet.</div>
                  : (
                    <div>
                      {activeProject.tasks.filter(t => !t.done).length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>TO DO · {activeProject.tasks.filter(t => !t.done).length}</div>
                          {activeProject.tasks.filter(t => !t.done).map(task => (
                            <div key={task.id} className="task-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${border}` }}>
                              <button onClick={() => toggleTask(activeProject.id, task.id)} style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${textMuted}`, background: "none", cursor: "pointer", flexShrink: 0 }} />
                              <span style={{ fontSize: 13, color: text, flex: 1 }}>{task.text}</span>
                              {task.assignee && <Avatar initials={task.assignee} size={20} dark={dark} />}
                              <button className="task-del hb" onClick={() => deleteTask(activeProject.id, task.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, opacity: 0, transition: "opacity 0.15s", fontFamily: "inherit" }}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {activeProject.tasks.filter(t => t.done).length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>DONE · {activeProject.tasks.filter(t => t.done).length}</div>
                          {activeProject.tasks.filter(t => t.done).map(task => (
                            <div key={task.id} className="task-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${border}` }}>
                              <button onClick={() => toggleTask(activeProject.id, task.id)} style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${text}`, background: text, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ color: bg, fontSize: 9 }}>✓</span>
                              </button>
                              <span style={{ fontSize: 13, color: textMuted, textDecoration: "line-through", flex: 1 }}>{task.text}</span>
                              {task.assignee && <Avatar initials={task.assignee} size={20} dark={dark} />}
                              <button className="task-del hb" onClick={() => deleteTask(activeProject.id, task.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, opacity: 0, transition: "opacity 0.15s", fontFamily: "inherit" }}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }
              </div>
            )}

            {/* MESSAGES */}
            {projectTab === "messages" && (
              <div>
                <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, marginBottom: 16, padding: "4px 0" }}>
                  {activeProject.messages.length === 0
                    ? <div style={{ fontSize: 12, color: textMuted, padding: "20px 0" }}>no messages yet. say hello.</div>
                    : activeProject.messages.map((msg, i) => {
                      const isMe = msg.from === myInitials;
                      const isSystem = msg.from === "system";
                      if (isSystem) return (
                        <div key={i} style={{ textAlign: "center", fontSize: 10, color: textMuted, padding: "4px 0" }}>{msg.text}</div>
                      );
                      return (
                        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: isMe ? "row-reverse" : "row" }}>
                          <Avatar initials={msg.from} size={28} dark={dark} />
                          <div style={{ maxWidth: "70%" }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                              <span style={{ fontSize: 11, fontWeight: 500, color: text }}>{isMe ? "you" : msg.name}</span>
                              <span style={{ fontSize: 10, color: textMuted }}>{msg.time}</span>
                            </div>
                            <div style={{ background: isMe ? text : bg2, color: isMe ? bg : text, padding: "8px 12px", borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px", fontSize: 12, lineHeight: 1.6, border: isMe ? "none" : `1px solid ${border}` }}>
                              {msg.text}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  }
                  <div ref={messagesEndRef} />
                </div>
                <div style={{ display: "flex", gap: 8, borderTop: `1px solid ${border}`, paddingTop: 14 }}>
                  <input placeholder="send a message..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage(activeProject.id)} style={{ ...inputStyle, fontSize: 12 }} />
                  <button className="hb" onClick={() => sendMessage(activeProject.id)} style={{ ...btnPrimary, padding: "10px 16px", flexShrink: 0, fontSize: 12 }}>send</button>
                </div>
              </div>
            )}

            {/* UPDATES */}
            {projectTab === "updates" && (
              <div>
                <div style={{ display: "flex", gap: 10, marginBottom: 24, alignItems: "flex-start" }}>
                  <Avatar initials={myInitials} size={28} dark={dark} />
                  <div style={{ flex: 1 }}>
                    <textarea placeholder="post an update..." value={newUpdate} onChange={e => setNewUpdate(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none", fontSize: 12, padding: "8px 12px" }} />
                    {newUpdate.trim() && <button className="hb" onClick={() => postUpdate(activeProject.id)} style={{ ...btnPrimary, marginTop: 8, padding: "7px 14px", fontSize: 11 }}>post</button>}
                  </div>
                </div>
                {activeProject.updates.length === 0
                  ? <div style={{ fontSize: 12, color: textMuted }}>no updates yet.</div>
                  : activeProject.updates.map((u, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                      <Avatar initials={u.initials} size={28} dark={dark} />
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: text }}>{u.author}</span>
                          <span style={{ fontSize: 10, color: textMuted }}>{u.time}</span>
                        </div>
                        <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65 }}>{u.text}</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {/* TEAM */}
            {projectTab === "team" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {activeProject.members.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: bg2, borderRadius: 8, border: `1px solid ${border}` }}>
                    <Avatar initials={m.initials} size={36} dark={dark} />
                    <div>
                      <div style={{ fontSize: 13, color: text }}>{m.name || m.initials}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>{i === 0 ? "owner" : "collaborator"}</div>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "12px 16px", border: `1px dashed ${border}`, borderRadius: 8, fontSize: 12, color: textMuted, textAlign: "center", cursor: "pointer" }} onClick={() => showToast("Invite link copied.")}>
                  + invite collaborator
                </div>
              </div>
            )}

            {/* PLUGINS */}
            {projectTab === "plugins" && (
              <div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {PLUGINS.filter(p => activeProject.plugins.includes(p.id)).map(plug => (
                    <div key={plug.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: bg2, borderRadius: 8, border: `1px solid ${border}` }}>
                      <span style={{ fontSize: 18, color: text, width: 24, textAlign: "center" }}>{plug.icon}</span>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: text }}>{plug.name}</div><div style={{ fontSize: 11, color: textMuted }}>{plug.desc}</div></div>
                      <button className="hb" onClick={() => handleAddPlugin(plug.id, activeProject.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>remove</button>
                    </div>
                  ))}
                </div>
                {PLUGINS.filter(p => !activeProject.plugins.includes(p.id)).length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 10 }}>ADD PLUGIN</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {PLUGINS.filter(p => !activeProject.plugins.includes(p.id)).map(plug => (
                        <button key={plug.id} className="hb" onClick={() => handleAddPlugin(plug.id, activeProject.id)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "10px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: textMuted, display: "flex", gap: 10, alignItems: "center", textAlign: "left" }}>
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
        </div>
      )}

      {/* ── PROFILE ── */}
      {appScreen === "profile" && (
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px" }}>
          <div className="fu">
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 20 }}>PROFILE</div>
            {!editProfile ? (
              <div>
                <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 28 }}>
                  <Avatar initials={myInitials} size={56} dark={dark} />
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{profile.name || "Anonymous"}</div>
                    <div style={{ fontSize: 12, color: textMuted, marginTop: 3 }}>{profile.role}</div>
                  </div>
                </div>
                {profile.bio && <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 24 }}>{profile.bio}</p>}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ ...labelStyle, marginBottom: 10 }}>SKILLS</div>
                  {profile.skills.length === 0
                    ? <div style={{ fontSize: 12, color: textMuted }}>no skills added. <button onClick={() => setEditProfile(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>add skills →</button></div>
                    : (
                      <div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                          {profile.skills.map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
                        </div>
                        <div style={{ fontSize: 11, color: textMuted }}>
                          ★ your skills match {forYouProjects.length} open project{forYouProjects.length !== 1 ? "s" : ""} right now
                          <button className="hb" onClick={() => { setAppScreen("explore"); setExploreTab("for-you"); }} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline", marginLeft: 6 }}>view →</button>
                        </div>
                      </div>
                    )
                  }
                </div>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ ...labelStyle, marginBottom: 10 }}>PROJECTS</div>
                  {myProjects.length === 0
                    ? <span style={{ fontSize: 12, color: textMuted }}>none yet.</span>
                    : myProjects.map(p => <div key={p.id} style={{ fontSize: 12, color: textMuted, padding: "8px 0", borderBottom: `1px solid ${border}` }}>{p.title}</div>)
                  }
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="hb" onClick={() => setEditProfile(true)} style={btnGhost}>edit profile</button>
                  <button className="hb" onClick={() => setScreen("landing")} style={{ ...btnGhost, color: textMuted }}>sign out</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
                  <div><label style={labelStyle}>NAME</label><input style={inputStyle} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></div>
                  <div><label style={labelStyle}>ROLE</label><input style={inputStyle} placeholder="Founder, Designer, Engineer..." value={profile.role} onChange={e => setProfile({ ...profile, role: e.target.value })} /></div>
                  <div><label style={labelStyle}>BIO</label><textarea style={{ ...inputStyle, resize: "none" }} rows={4} value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} /></div>
                  <div>
                    <label style={labelStyle}>SKILLS</label>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {SKILLS.map(s => {
                        const sel = profile.skills.includes(s);
                        return <button key={s} className="hb" onClick={() => { const skills = sel ? profile.skills.filter(x => x !== s) : [...profile.skills, s]; setProfile({ ...profile, skills }); }} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>;
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="hb" onClick={() => setEditProfile(false)} style={btnGhost}>cancel</button>
                  <button className="hb" onClick={() => { setEditProfile(false); showToast("Profile saved."); }} style={{ ...btnPrimary, flex: 1 }}>save</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.9)" : "rgba(200,200,200,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(10px)", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: 28, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 14 }}>NEW PROJECT</div>
            <h2 style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-1px", marginBottom: 24, color: text }}>What are you building?</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={labelStyle}>TITLE</label><input style={inputStyle} placeholder="Project name" value={newProject.title} onChange={e => setNewProject({ ...newProject, title: e.target.value })} /></div>
              <div><label style={labelStyle}>DESCRIPTION</label><textarea style={{ ...inputStyle, resize: "none" }} placeholder="What are you building? What do you need?" rows={4} value={newProject.description} onChange={e => setNewProject({ ...newProject, description: e.target.value })} /></div>
              <div><label style={labelStyle}>CATEGORY</label><select style={inputStyle} value={newProject.category} onChange={e => setNewProject({ ...newProject, category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
              <div>
                <label style={labelStyle}>SKILLS NEEDED</label>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {SKILLS.map(s => {
                    const sel = newProject.skills.includes(s);
                    return <button key={s} className="hb" onClick={() => { const skills = sel ? newProject.skills.filter(x => x !== s) : [...newProject.skills, s]; setNewProject({ ...newProject, skills }); }} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>;
                  })}
                </div>
              </div>
              <div><label style={labelStyle}>COLLABORATORS NEEDED</label><select style={inputStyle} value={newProject.maxCollaborators} onChange={e => setNewProject({ ...newProject, maxCollaborators: parseInt(e.target.value) })}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button className="hb" onClick={() => setShowCreate(false)} style={btnGhost}>cancel</button>
              <button className="hb" onClick={handlePostProject} style={{ ...btnPrimary, flex: 1 }}>post →</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: text, color: bg, padding: "11px 20px", borderRadius: 8, fontSize: 11, zIndex: 300, animation: "tin 0.3s ease", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
