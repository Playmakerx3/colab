import { useState, useRef } from "react";

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

const SEED_USERS = [
  { id: "MT", name: "Marcus T.", role: "ML Engineer", bio: "Building AI products at the intersection of sports and data. 5 years in ML, ex-Google. Looking for designers and product thinkers.", skills: ["Engineering", "AI/ML", "Data", "Product"], projects: [1], followers: 24, following: 12 },
  { id: "DR", name: "Destiny R.", role: "Music Producer", bio: "Independent artist and producer. Creating a new sound blending R&B and electronic. Studio booked, team needed.", skills: ["Music", "Video", "Writing"], projects: [2], followers: 61, following: 8 },
  { id: "JK", name: "Jordan K.", role: "Brand Founder", bio: "Obsessed with sustainable fashion. Have the manufacturer, have the designs. Need the right people to help scale.", skills: ["Marketing", "Design", "Sales"], projects: [3], followers: 18, following: 22 },
  { id: "PM", name: "Priya M.", role: "Journalist / Filmmaker", bio: "5 years covering housing policy and urban issues. Ready to tell this story on film. Looking for cinematographer and editor.", skills: ["Writing", "Video", "Photography"], projects: [4], followers: 33, following: 14 },
  { id: "AW", name: "Alex W.", role: "Lawyer + Developer", bio: "Quit BigLaw to build legaltech. Prototype already has 3 paying pilot users. Need design and growth.", skills: ["Legal", "Engineering", "Product"], projects: [5], followers: 41, following: 19 },
  { id: "SL", name: "Sam L.", role: "Full-stack Engineer", bio: "5 years building data pipelines. Big sports fan. Looking to work on something at the intersection of sports, data, and AI.", skills: ["Engineering", "Data", "AI/ML"], projects: [], followers: 9, following: 5 },
  { id: "NB", name: "Nia B.", role: "Podcast Host", bio: "Former McKinsey consultant turned content creator. Launching a show on the future of work and AI. Need co-host and audio editor.", skills: ["Writing", "Marketing", "Finance"], projects: [7], followers: 55, following: 30 },
  { id: "ZM", name: "Zara M.", role: "E-Commerce Founder", bio: "Formulated 3 natural hair products. Suppliers ready. Looking for a technical co-founder who can build the store and run growth.", skills: ["Marketing", "Sales", "Design"], projects: [8], followers: 27, following: 16 },
];

const INITIAL_PROJECTS = [
  { id: 1, title: "AI-Powered Sports Analytics Platform", description: "Building a platform that uses machine learning to predict player performance and help fantasy sports players make better decisions. Need someone who can handle the data pipeline and model training.", owner: "Marcus T.", ownerInitials: "MT", ownerId: "MT", category: "Tech / Software", skills: ["Engineering", "AI/ML", "Data"], collaborators: 1, maxCollaborators: 3, time: "2h ago", members: [{ initials: "MT", name: "Marcus T.", id: "MT" }, { initials: "JR", name: "JR", id: "JR" }], status: "active", progress: 30, plugins: ["slack", "github", "drive"], tasks: [{ id: 1, text: "Set up data ingestion pipeline", done: true, assignee: "MT" }, { id: 2, text: "Build player stats API endpoints", done: true, assignee: "JR" }, { id: 3, text: "Train initial prediction model", done: false, assignee: "MT" }], updates: [{ author: "Marcus T.", initials: "MT", text: "Finished the initial data schema. Starting on the ML pipeline this week.", time: "1h ago" }], messages: [{ from: "MT", name: "Marcus T.", text: "Hey, glad to have you on board!", time: "3h ago" }], applications: [] },
  { id: 2, title: "Independent Music Label — First EP", description: "I write and produce. Looking for someone who can handle mixing/mastering and another person who can shoot music video content. Got the studio time booked, need the team.", owner: "Destiny R.", ownerInitials: "DR", ownerId: "DR", category: "Music", skills: ["Music", "Video", "Photography"], collaborators: 0, maxCollaborators: 2, time: "5h ago", members: [{ initials: "DR", name: "Destiny R.", id: "DR" }], status: "open", progress: 0, plugins: [], tasks: [], updates: [], messages: [], applications: [] },
  { id: 3, title: "Sustainable Streetwear Brand", description: "Have the designs, have the manufacturer contact, need someone on the business/finance side and a marketing person who understands Gen Z culture. This is a real brand, not a hobby.", owner: "Jordan K.", ownerInitials: "JK", ownerId: "JK", category: "Business / Startup", skills: ["Marketing", "Finance", "Design"], collaborators: 1, maxCollaborators: 2, time: "1d ago", members: [{ initials: "JK", name: "Jordan K.", id: "JK" }, { initials: "AL", name: "AL", id: "AL" }], status: "active", progress: 55, plugins: ["slack", "notion"], tasks: [{ id: 1, text: "Finalize manufacturer contract", done: true, assignee: "JK" }, { id: 2, text: "Launch pre-order campaign", done: false, assignee: "AL" }], updates: [{ author: "Jordan K.", initials: "JK", text: "Manufacturer confirmed MOQ of 50 units.", time: "6h ago" }], messages: [], applications: [] },
  { id: 4, title: "Documentary: Housing Crisis in the Bay", description: "Journalist with 5 years experience. Have interviews lined up, story arc mapped. Need a cinematographer and an editor. Passion project with real distribution potential.", owner: "Priya M.", ownerInitials: "PM", ownerId: "PM", category: "Film / Video", skills: ["Video", "Writing", "Photography"], collaborators: 0, maxCollaborators: 2, time: "2d ago", members: [{ initials: "PM", name: "Priya M.", id: "PM" }], status: "open", progress: 0, plugins: [], tasks: [], updates: [], messages: [], applications: [] },
  { id: 5, title: "Chrome Extension for Contract Redlining", description: "Lawyer-turned-dev with a working prototype. Need a designer to make it look good and a growth person for go-to-market. B2B SaaS, already have 3 pilot users.", owner: "Alex W.", ownerInitials: "AW", ownerId: "AW", category: "Tech / Software", skills: ["Design", "Marketing", "Engineering"], collaborators: 1, maxCollaborators: 2, time: "3d ago", members: [{ initials: "AW", name: "Alex W.", id: "AW" }, { initials: "SC", name: "SC", id: "SC" }], status: "active", progress: 70, plugins: ["github", "figma"], tasks: [{ id: 1, text: "Ship v0.3 to pilot users", done: true, assignee: "AW" }, { id: 2, text: "Redesign onboarding flow", done: false, assignee: "SC" }], updates: [{ author: "Alex W.", initials: "AW", text: "v0.3 shipped to pilot users. Getting good feedback.", time: "1d ago" }], messages: [], applications: [] },
  { id: 6, title: "Fintech App for Gen Z Investing", description: "Building a micro-investing app targeted at 18-25 year olds. Have the product spec and initial designs. Need a finance/compliance person and a growth marketer.", owner: "Sam L.", ownerInitials: "SL", ownerId: "SL", category: "Tech / Software", skills: ["Finance", "Marketing", "Product"], collaborators: 0, maxCollaborators: 2, time: "4h ago", members: [{ initials: "SL", name: "Sam L.", id: "SL" }], status: "open", progress: 0, plugins: [], tasks: [], updates: [], messages: [], applications: [] },
  { id: 7, title: "Podcast: Future of Work", description: "Launching a weekly podcast on how AI is changing careers. Have the equipment, format, and first 5 episode scripts. Need a co-host who can talk finance and markets.", owner: "Nia B.", ownerInitials: "NB", ownerId: "NB", category: "Creative / Art", skills: ["Finance", "Writing", "Marketing"], collaborators: 0, maxCollaborators: 2, time: "8h ago", members: [{ initials: "NB", name: "Nia B.", id: "NB" }], status: "open", progress: 0, plugins: [], tasks: [], updates: [], messages: [], applications: [] },
  { id: 8, title: "E-Commerce Brand for Natural Hair Products", description: "Formulated 3 products, have suppliers lined up. Need someone who can build the Shopify store and run paid social. Looking for a long-term equity partner.", owner: "Zara M.", ownerInitials: "ZM", ownerId: "ZM", category: "Business / Startup", skills: ["Marketing", "Design", "Sales"], collaborators: 0, maxCollaborators: 2, time: "12h ago", members: [{ initials: "ZM", name: "Zara M.", id: "ZM" }], status: "open", progress: 0, plugins: [], tasks: [], updates: [], messages: [], applications: [] },
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
  const [screen, setScreen] = useState("landing");
  const [appScreen, setAppScreen] = useState("explore");
  const [exploreTab, setExploreTab] = useState("for-you");
  const [networkTab, setNetworkTab] = useState("people");
  const [activeProject, setActiveProject] = useState(null);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [projectTab, setProjectTab] = useState("tasks");
  const [projects, setProjects] = useState(INITIAL_PROJECTS);
  const [users, setUsers] = useState(SEED_USERS);
  const [myProjects, setMyProjects] = useState([INITIAL_PROJECTS[0]]);
  const [appliedTo, setAppliedTo] = useState([]);
  const [following, setFollowing] = useState([]);
  const [dmOpen, setDmOpen] = useState(null);
  const [dmMessages, setDmMessages] = useState({});
  const [dmInput, setDmInput] = useState("");
  const [profile, setProfile] = useState({ name: "", role: "", bio: "", skills: [] });
  const [onboardStep, setOnboardStep] = useState(0);
  const [notifications, setNotifications] = useState([
    { id: 1, type: "application", text: "Sam L. applied to your project", sub: "AI-Powered Sports Analytics Platform", time: "10m ago", read: false, projectId: 1, applicant: { initials: "SL", name: "Sam L.", role: "Full-stack Engineer", bio: "5 years exp in ML/data pipelines. Big sports fan." } },
    { id: 2, type: "application", text: "Zara M. applied to your project", sub: "AI-Powered Sports Analytics Platform", time: "1h ago", read: false, projectId: 1, applicant: { initials: "ZM", name: "Zara M.", role: "Data Scientist", bio: "Former NBA stats analyst. Have built similar pipelines at scale." } },
  ]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [filterSkill, setFilterSkill] = useState(null);
  const [networkFilter, setNetworkFilter] = useState(null);
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
  const btnP = { background: text, color: bg, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
  const btnG = { background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 20px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const unreadCount = notifications.filter(n => !n.read).length;
  const myInitials = profile.name ? profile.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "ME";
  const getMatchScore = (p) => profile.skills.filter(s => p.skills.includes(s)).length;

  const updateProjects = (updated) => {
    setProjects(updated);
    if (activeProject) setActiveProject(updated.find(p => p.id === activeProject.id) || null);
    setMyProjects(prev => prev.map(p => updated.find(u => u.id === p.id) || p));
  };

  const dismissNotif = (id) => setNotifications(prev => prev.filter(n => n.id !== id));

  const handleFollow = (userId) => {
    if (following.includes(userId)) {
      setFollowing(prev => prev.filter(id => id !== userId));
      showToast("Unfollowed.");
    } else {
      setFollowing(prev => [...prev, userId]);
      showToast("Following!");
    }
  };

  const handleCollaborate = (user) => {
    setDmOpen(user);
    const key = user.id;
    if (!dmMessages[key]) setDmMessages(prev => ({ ...prev, [key]: [{ from: "system", text: `You sent a collaboration request to ${user.name}.`, time: "just now" }] }));
    showToast(`Collaboration request sent to ${user.name}`);
  };

  const sendDm = (userId) => {
    if (!dmInput.trim()) return;
    const key = userId;
    const msg = { from: "me", text: dmInput, time: "just now" };
    setDmMessages(prev => ({ ...prev, [key]: [...(prev[key] || []), msg] }));
    setDmInput("");
  };

  const handleAccept = (notif) => {
    updateProjects(projects.map(p => p.id === notif.projectId ? { ...p, members: [...p.members, { initials: notif.applicant.initials, name: notif.applicant.name, id: notif.applicant.initials }], collaborators: p.collaborators + 1, messages: [...p.messages, { from: "system", name: "CoLab", text: `${notif.applicant.name} joined the project.`, time: "just now" }] } : p));
    dismissNotif(notif.id);
    showToast(`${notif.applicant.name} added to project.`);
  };

  const handleDecline = (notif) => { dismissNotif(notif.id); showToast("Application declined."); };

  const handleApply = (project) => {
    if (appliedTo.includes(project.id)) return;
    setAppliedTo([...appliedTo, project.id]);
    setNotifications(prev => [{ id: Date.now(), type: "application", text: `${profile.name} applied to your project`, sub: project.title, time: "just now", read: false, projectId: project.id, applicant: { initials: myInitials, name: profile.name, role: profile.role, bio: profile.bio } }, ...prev]);
    showToast(`Applied to "${project.title}"`);
    setActiveProject(null);
  };

  const handlePostProject = () => {
    if (!newProject.title || !newProject.description) return;
    const p = { ...newProject, id: Date.now(), owner: profile.name, ownerInitials: myInitials, ownerId: "ME", collaborators: 0, time: "just now", members: [{ initials: myInitials, name: profile.name, id: "ME" }], status: "open", progress: 0, plugins: [], tasks: [], updates: [], messages: [], applications: [] };
    setProjects([p, ...projects]);
    setMyProjects([p, ...myProjects]);
    setNewProject({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2 });
    setShowCreate(false);
    showToast("Project posted.");
  };

  const sendMessage = (projectId) => {
    if (!newMessage.trim()) return;
    updateProjects(projects.map(p => p.id === projectId ? { ...p, messages: [...p.messages, { from: myInitials, name: profile.name, text: newMessage, time: "just now" }] } : p));
    setNewMessage("");
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const toggleTask = (pid, tid) => updateProjects(projects.map(p => p.id === pid ? { ...p, tasks: p.tasks.map(t => t.id === tid ? { ...t, done: !t.done } : t) } : p));
  const addTask = (pid) => { if (!newTaskText.trim()) return; updateProjects(projects.map(p => p.id === pid ? { ...p, tasks: [...p.tasks, { id: Date.now(), text: newTaskText, done: false, assignee: "" }] } : p)); setNewTaskText(""); };
  const deleteTask = (pid, tid) => updateProjects(projects.map(p => p.id === pid ? { ...p, tasks: p.tasks.filter(t => t.id !== tid) } : p));
  const postUpdate = (pid) => { if (!newUpdate.trim()) return; updateProjects(projects.map(p => p.id === pid ? { ...p, updates: [{ author: profile.name, initials: myInitials, text: newUpdate, time: "just now" }, ...p.updates] } : p)); setNewUpdate(""); showToast("Update posted."); };
  const addPlugin = (plugId, pid) => { updateProjects(projects.map(p => p.id === pid ? { ...p, plugins: p.plugins.includes(plugId) ? p.plugins.filter(x => x !== plugId) : [...p.plugins, plugId] } : p)); showToast("Plugin connected."); };

  const browseBase = projects.filter(p => !myProjects.find(m => m.id === p.id));
  const forYou = browseBase.map(p => ({ ...p, _s: getMatchScore(p) })).filter(p => p._s > 0).sort((a, b) => b._s - a._s);
  const allP = browseBase.map(p => ({ ...p, _s: getMatchScore(p) })).filter(p => (!filterSkill || p.skills.includes(filterSkill)) && (!search || p.title.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => b._s - a._s);

  const filteredUsers = users.filter(u => !networkFilter || u.skills.includes(networkFilter));

  const TabBtn = ({ id, label, count, setter, current }) => (
    <button onClick={() => setter(id)} style={{ background: "none", border: "none", borderBottom: current === id ? `1px solid ${text}` : "1px solid transparent", color: current === id ? text : textMuted, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginRight: 20, transition: "all 0.15s", display: "inline-flex", gap: 5, alignItems: "center", whiteSpace: "nowrap" }}>
      {label}{count > 0 && <span style={{ fontSize: 10, background: bg3, borderRadius: 10, padding: "1px 6px", color: textMuted }}>{count}</span>}
    </button>
  );

  const PRow = ({ p }) => {
    const spots = p.maxCollaborators - p.collaborators;
    return (
      <div style={{ borderBottom: `1px solid ${border}`, padding: "20px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start", cursor: "pointer", transition: "opacity 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.65"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        onClick={() => setActiveProject(p)}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <button onClick={e => { e.stopPropagation(); const u = users.find(u => u.id === p.ownerId); if (u) setViewingProfile(u); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <Avatar initials={p.ownerInitials} size={20} dark={dark} />
              <span style={{ fontSize: 11, color: textMuted, textDecoration: "underline" }}>{p.owner}</span>
            </button>
            <span style={{ color: textSub }}>·</span>
            <span style={{ fontSize: 11, color: textMuted }}>{p.time}</span>
            {appliedTo.includes(p.id) && <span style={{ fontSize: 10, color: textMuted, border: `1px solid ${border}`, borderRadius: 3, padding: "1px 6px" }}>applied</span>}
            {p._s > 0 && <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 3, border: `1px solid ${dark ? "#ffffff20" : "#00000015"}`, color: text }}>{p._s >= 2 ? "★★ strong match" : "★ match"}</span>}
          </div>
          <div style={{ fontSize: 15, color: text, marginBottom: 6, letterSpacing: "-0.3px", lineHeight: 1.3 }}>{p.title}</div>
          <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 10 }}>{p.description.slice(0, 100)}...</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {p.skills.map(s => <span key={s} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: `1px solid ${profile.skills.includes(s) ? (dark ? "#ffffff35" : "#00000025") : border}`, color: profile.skills.includes(s) ? text : textMuted, fontWeight: profile.skills.includes(s) ? 500 : 400 }}>{s}</span>)}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: spots > 0 ? text : textMuted, fontWeight: spots > 0 ? 500 : 300, marginBottom: 3 }}>{spots > 0 ? `${spots} open` : "full"}</div>
          <div style={{ fontSize: 10, color: textMuted }}>{p.category}</div>
        </div>
      </div>
    );
  };

  // User card for network
  const UserCard = ({ u }) => {
    const sharedSkills = profile.skills.filter(s => u.skills.includes(s));
    const userProjects = projects.filter(p => p.ownerId === u.id);
    return (
      <div onClick={() => setViewingProfile(u)} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 12, padding: "20px", transition: "border 0.2s, opacity 0.15s", cursor: "pointer" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = text} onMouseLeave={e => e.currentTarget.style.borderColor = border}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
          <Avatar initials={u.id} size={44} dark={dark} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: text, letterSpacing: "-0.3px" }}>{u.name}</div>
            <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{u.role}</div>
            <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>{u.followers} followers · {userProjects.length} project{userProjects.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: textMuted, lineHeight: 1.65, marginBottom: 12 }}>{u.bio.slice(0, 90)}...</p>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: sharedSkills.length > 0 ? 10 : 0 }}>
          {u.skills.slice(0, 4).map(s => <span key={s} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: `1px solid ${sharedSkills.includes(s) ? (dark ? "#ffffff35" : "#00000025") : border}`, color: sharedSkills.includes(s) ? text : textMuted }}>{s}</span>)}
        </div>
        {sharedSkills.length > 0 && <div style={{ fontSize: 10, color: textMuted }}>★ {sharedSkills.length} shared skill{sharedSkills.length !== 1 ? "s" : ""} — {sharedSkills.join(", ")}</div>}
      </div>
    );
  };

  // Full profile view — matches the profile page layout
  const ProfileView = ({ u, onClose }) => {
    const isFollowing = following.includes(u.id);
    const userProjects = projects.filter(p => p.ownerId === u.id);
    const sharedSkills = profile.skills.filter(s => u.skills.includes(s));
    return (
      <div style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.88)" : "rgba(220,220,220,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150, backdropFilter: "blur(10px)", padding: 16 }} onClick={onClose}>
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "32px 28px", width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px" }}>PROFILE</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
          </div>

          {/* Avatar + name row */}
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            <Avatar initials={u.id} size={52} dark={dark} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{u.name}</div>
              <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{u.role}</div>
              <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>{u.followers} followers · {u.following} following</div>
            </div>
          </div>

          {/* Bio */}
          <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 22 }}>{u.bio}</p>

          {/* Skills */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>SKILLS</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {u.skills.map(s => (
                <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${sharedSkills.includes(s) ? (dark ? "#ffffff40" : "#00000030") : border}`, borderRadius: 3, color: sharedSkills.includes(s) ? text : textMuted, fontWeight: sharedSkills.includes(s) ? 500 : 400 }}>
                  {s}{sharedSkills.includes(s) ? " ★" : ""}
                </span>
              ))}
            </div>
            {sharedSkills.length > 0 && <div style={{ fontSize: 11, color: textMuted, marginTop: 8 }}>★ {sharedSkills.length} shared skill{sharedSkills.length !== 1 ? "s" : ""} with you</div>}
          </div>

          {/* Projects */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>PROJECTS</div>
            {userProjects.length === 0
              ? <div style={{ fontSize: 12, color: textMuted }}>no projects yet.</div>
              : userProjects.map(p => (
                <div key={p.id} style={{ padding: "10px 0", borderBottom: `1px solid ${border}`, cursor: "pointer", transition: "opacity 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.6"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                  onClick={() => { setActiveProject(p); onClose(); setAppScreen("explore"); }}>
                  <div style={{ fontSize: 13, color: text, marginBottom: 5 }}>{p.title}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {p.skills.map(s => <span key={s} style={{ fontSize: 10, padding: "1px 7px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}
                  </div>
                </div>
              ))
            }
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => handleFollow(u.id)} style={{ flex: 1, background: isFollowing ? bg3 : text, color: isFollowing ? textMuted : bg, border: `1px solid ${isFollowing ? border : text}`, borderRadius: 8, padding: "11px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
              {isFollowing ? "following" : "follow"}
            </button>
            <button onClick={() => { handleCollaborate(u); onClose(); }} style={{ flex: 1, background: "none", color: text, border: `1px solid ${border}`, borderRadius: 8, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "border 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = text} onMouseLeave={e => e.currentTarget.style.borderColor = border}>
              message
            </button>
          </div>
        </div>
      </div>
    );
  };

  // DM panel
  const DmPanel = ({ u, onClose }) => {
    const msgs = dmMessages[u.id] || [];
    return (
      <div style={{ position: "fixed", bottom: 16, right: 16, width: 320, background: bg, border: `1px solid ${border}`, borderRadius: 12, zIndex: 250, boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.7)" : "0 8px 32px rgba(0,0,0,0.12)" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Avatar initials={u.id} size={26} dark={dark} />
            <div style={{ fontSize: 13, color: text, fontWeight: 500 }}>{u.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>✕</button>
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {msgs.length === 0 ? <div style={{ fontSize: 11, color: textMuted }}>say something.</div>
            : msgs.map((m, i) => {
              if (m.from === "system") return <div key={i} style={{ textAlign: "center", fontSize: 10, color: textMuted }}>{m.text}</div>;
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
          <input placeholder="message..." value={dmInput} onChange={e => setDmInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendDm(u.id)} style={{ ...inputStyle, fontSize: 12, padding: "8px 12px" }} />
          <button onClick={() => sendDm(u.id)} style={{ ...btnP, padding: "8px 14px", fontSize: 11, flexShrink: 0 }}>↑</button>
        </div>
      </div>
    );
  };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; padding: 0; width: 100%; overflow-x: hidden; }
    input, select, textarea { outline: none; font-family: inherit; }
    ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #2a2a2a; }
    @keyframes fu { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .fu { animation: fu 0.3s ease forwards; opacity: 0; }
    @keyframes tin { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
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

  // ── LANDING ──
  if (screen === "landing") return (
    <div style={{ minHeight: "100vh", width: "100%", background: bg, color: text, fontFamily: "'DM Mono', monospace", overflowX: "hidden" }}>
      <style>{CSS}</style>
      <nav style={{ width: "100%", borderBottom: `1px solid ${border}`, position: "sticky", top: 0, background: dark ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)", zIndex: 50 }}>
        <div className="pad" style={{ padding: "0 40px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.5px" }}>[CoLab]</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="hb" onClick={() => setDark(!dark)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, color: textMuted, fontFamily: "inherit" }}>{dark ? "☀" : "☾"}</button>
            <button className="hb" onClick={() => setScreen("onboard")} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Get started</button>
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
          <button className="hb" onClick={() => setScreen("onboard")} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "13px 28px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Start building →</button>
          <button className="hb" onClick={() => { setScreen("app"); setAppScreen("explore"); }} style={{ background: "none", color: textMuted, border: `1px solid ${border}`, borderRadius: 8, padding: "13px 28px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Browse projects</button>
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
              <div style={{ fontSize: 15, fontWeight: 500, color: text, marginBottom: 8, letterSpacing: "-0.3px" }}>{t}</div>
              <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.75 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="pad" style={{ padding: "72px 40px", borderBottom: `1px solid ${border}` }}>
        <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 28 }}>LIVE PROJECTS</div>
        {INITIAL_PROJECTS.slice(0, 5).map(p => (
          <div key={p.id} style={{ padding: "16px 0", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, color: text, marginBottom: 6 }}>{p.title}</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{p.skills.map(s => <span key={s} style={{ fontSize: 10, padding: "1px 8px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}</div>
            </div>
            <div style={{ fontSize: 11, color: textMuted, flexShrink: 0 }}>{p.maxCollaborators - p.collaborators} open</div>
          </div>
        ))}
        <button className="hb" onClick={() => { setScreen("app"); setAppScreen("explore"); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline", marginTop: 20, display: "block" }}>view all →</button>
      </div>
      <div className="pad" style={{ padding: "80px 40px", background: bg2, textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(30px, 5vw, 54px)", fontWeight: 400, letterSpacing: "-2px", marginBottom: 14, color: text }}>Ready to build?</h2>
        <p style={{ fontSize: 13, color: textMuted, marginBottom: 28 }}>Join hundreds of builders already collaborating on CoLab.</p>
        <button className="hb" onClick={() => setScreen("onboard")} style={{ background: text, color: bg, border: "none", borderRadius: 8, padding: "14px 36px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Create your profile →</button>
      </div>
      <div className="pad" style={{ padding: "18px 40px", borderTop: `1px solid ${border}`, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, color: textMuted }}>[CoLab] — build together.</div>
        <div style={{ fontSize: 11, color: textMuted }}>© 2026</div>
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
    const canNext = step.field === "skills" ? profile.skills.length > 0 : (profile[step.field] || "").trim().length > 0;
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
            {step.type === "input" && <input autoFocus style={{ background: "none", border: "none", borderBottom: `1px solid ${border}`, padding: "10px 0", color: text, fontSize: "clamp(16px, 4vw, 18px)", width: "100%", fontFamily: "inherit", outline: "none" }} placeholder={step.placeholder} value={profile[step.field] || ""} onChange={e => setProfile({ ...profile, [step.field]: e.target.value })} onKeyDown={e => e.key === "Enter" && canNext && (isLast ? (setScreen("app"), setAppScreen("explore")) : setOnboardStep(s => s + 1))} />}
            {step.type === "textarea" && <textarea autoFocus style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "12px", color: text, fontSize: 13, width: "100%", fontFamily: "inherit", outline: "none", resize: "none", lineHeight: 1.7 }} rows={4} placeholder={step.placeholder} value={profile[step.field] || ""} onChange={e => setProfile({ ...profile, [step.field]: e.target.value })} />}
            {step.type === "skills" && (
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {SKILLS.map(s => { const sel = profile.skills.includes(s); return <button key={s} className="hb" onClick={() => setProfile({ ...profile, skills: sel ? profile.skills.filter(x => x !== s) : [...profile.skills, s] })} style={{ padding: "6px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                </div>
                {profile.skills.length > 0 && <div style={{ fontSize: 11, color: textMuted }}>{profile.skills.length} selected</div>}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 30 }}>
              <button className="hb" onClick={() => onboardStep === 0 ? setScreen("landing") : setOnboardStep(s => s - 1)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>{onboardStep === 0 ? "← back" : "← previous"}</button>
              <button className="hb" onClick={() => isLast ? (setScreen("app"), setAppScreen("explore")) : setOnboardStep(s => s + 1)} disabled={!canNext} style={{ background: canNext ? text : textSub, color: bg, border: "none", borderRadius: 8, padding: "11px 24px", fontSize: 12, fontWeight: 500, cursor: canNext ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.2s" }}>
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
          {[["explore","explore"],["network","network"],["dashboard","dash"],["profile",(profile.name||"me").split(" ")[0].toLowerCase().slice(0,6)]].map(([id,label]) => (
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
                    <button className="hb" onClick={() => dismissNotif(n.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", marginLeft: 8, flexShrink: 0 }}>✕</button>
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

      {/* PROFILE MODAL */}
      {viewingProfile && <ProfileView u={viewingProfile} onClose={() => setViewingProfile(null)} />}

      {/* DM PANEL */}
      {dmOpen && <DmPanel u={dmOpen} onClose={() => setDmOpen(null)} />}

      {/* ── EXPLORE ── */}
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
            {[["open now", projects.filter(p => p.collaborators < p.maxCollaborators).length],["projects", projects.length],["builders", users.length]].map(([l,v]) => (
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
          {exploreTab === "for-you" && (
            profile.skills.length === 0
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
        </div>
      )}

      {/* EXPLORE DETAIL */}
      {appScreen === "explore" && activeProject && (
        <div className="pad fu" style={{ width: "100%", maxWidth: 700, margin: "0 auto", padding: "36px 24px" }}>
          <button className="hb" onClick={() => setActiveProject(null)} style={{ ...btnG, marginBottom: 22, padding: "6px 14px", fontSize: 11 }}>← back</button>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
            <button onClick={() => { const u = users.find(u => u.id === activeProject.ownerId); if (u) setViewingProfile(u); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <Avatar initials={activeProject.ownerInitials} size={40} dark={dark} />
            </button>
            <div>
              <button onClick={() => { const u = users.find(u => u.id === activeProject.ownerId); if (u) setViewingProfile(u); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: text, textDecoration: "underline" }}>{activeProject.owner}</div>
              </button>
              <div style={{ fontSize: 11, color: textMuted }}>{activeProject.time} · {activeProject.category}</div>
            </div>
          </div>
          <h2 style={{ fontSize: "clamp(16px, 4vw, 20px)", fontWeight: 400, letterSpacing: "-0.8px", marginBottom: 10, color: text }}>{activeProject.title}</h2>
          <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 22 }}>{activeProject.description}</p>
          <div style={{ marginBottom: 22 }}>
            <div style={labelStyle}>SKILLS NEEDED</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {activeProject.skills.map(s => { const m = profile.skills.includes(s); return <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${m ? (dark ? "#ffffff45" : "#00000030") : border}`, borderRadius: 3, color: m ? text : textMuted, fontWeight: m ? 500 : 400 }}>{s}{m ? " ★" : ""}</span>; })}
            </div>
          </div>
          {getMatchScore(activeProject) > 0 && <div style={{ padding: "10px 14px", background: bg2, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12, color: textMuted, marginBottom: 18 }}>you match <strong style={{ color: text }}>{getMatchScore(activeProject)}</strong> of the skills needed.</div>}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: bg2, borderRadius: 8, marginBottom: 22, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 12, color: textMuted }}>{activeProject.collaborators}/{activeProject.maxCollaborators} collaborators</div>
            <div style={{ display: "flex" }}>{activeProject.members.map((m,i) => <div key={i} style={{ marginLeft: i > 0 ? -6 : 0, border: `2px solid ${bg2}`, borderRadius: "50%" }}><Avatar initials={m.initials} size={26} dark={dark} /></div>)}</div>
          </div>
          {appliedTo.includes(activeProject.id)
            ? <div style={{ textAlign: "center", padding: 12, background: bg2, borderRadius: 8, color: textMuted, fontSize: 12, border: `1px solid ${border}` }}>applied — waiting to hear back</div>
            : <button className="hb" onClick={() => handleApply(activeProject)} style={{ ...btnP, width: "100%", padding: "13px" }}>Apply to collaborate →</button>
          }
        </div>
      )}

      {/* ── NETWORK ── */}
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
                {filteredUsers.map(u => <UserCard key={u.id} u={u} />)}
              </div>
            </div>
          )}

          {networkTab === "following" && (
            <div>
              {following.length === 0
                ? <div style={{ padding: "36px 0", color: textMuted, fontSize: 13 }}>you're not following anyone yet. <button className="hb" onClick={() => setNetworkTab("people")} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>discover people →</button></div>
                : <div className="network-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                    {users.filter(u => following.includes(u.id)).map(u => <UserCard key={u.id} u={u} />)}
                  </div>
              }
            </div>
          )}
        </div>
      )}

      {/* ── DASHBOARD ── */}
      {appScreen === "dashboard" && !activeProject && (
        <div className="pad fu" style={{ width: "100%", padding: "44px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "2px", marginBottom: 8 }}>DASHBOARD</div>
              <h2 style={{ fontSize: "clamp(20px, 4vw, 26px)", fontWeight: 400, letterSpacing: "-1.5px", color: text }}>{profile.name ? `${profile.name.split(" ")[0]}'s workspace.` : "Your workspace."}</h2>
            </div>
            <button className="hb" onClick={() => setShowCreate(true)} style={btnP}>+ new project</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, marginBottom: 32, border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden" }}>
            {[["active projects", myProjects.filter(p => p.status === "active").length],["applications", appliedTo.length],["following", following.length]].map(([label,val],i) => (
              <div key={i} style={{ padding: "16px 18px", background: bg2, borderRight: i < 2 ? `1px solid ${border}` : "none" }}>
                <div style={{ fontSize: "clamp(20px, 4vw, 26px)", fontWeight: 400, color: text, letterSpacing: "-1px" }}>{val}</div>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>MY PROJECTS</div>
            {myProjects.length === 0
              ? <div style={{ padding: "28px 0", color: textMuted, fontSize: 12, borderTop: `1px solid ${border}` }}>no projects yet. <button onClick={() => setShowCreate(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>post one →</button></div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {myProjects.map((p,i) => {
                    const done = p.tasks.filter(t => t.done).length;
                    return (
                      <div key={p.id} style={{ background: bg2, borderRadius: i === 0 && myProjects.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === myProjects.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < myProjects.length - 1 ? "none" : `1px solid ${border}`, padding: "14px 18px", cursor: "pointer", transition: "opacity 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                        onClick={() => { setActiveProject(p); setProjectTab("tasks"); }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, color: text, letterSpacing: "-0.3px", marginBottom: 2 }}>{p.title}</div>
                            <div style={{ fontSize: 11, color: textMuted }}>{p.category} · {p.members.length} member{p.members.length !== 1 ? "s" : ""}{p.tasks.length > 0 ? ` · ${done}/${p.tasks.length} tasks` : ""}</div>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 10, padding: "2px 8px", border: `1px solid ${border}`, borderRadius: 3, color: p.status === "active" ? text : textMuted }}>{p.status}</span>
                            <div style={{ display: "flex" }}>{p.members.slice(0,3).map((m,i) => <div key={i} style={{ marginLeft: i > 0 ? -5 : 0, border: `2px solid ${bg2}`, borderRadius: "50%" }}><Avatar initials={m.initials} size={22} dark={dark} /></div>)}</div>
                          </div>
                        </div>
                        <ProgressBar value={p.progress} dark={dark} />
                        <div style={{ fontSize: 10, color: textMuted, marginTop: 5 }}>{p.progress}% complete</div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
          {appliedTo.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1.5px", marginBottom: 14 }}>APPLICATIONS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {projects.filter(p => appliedTo.includes(p.id)).map((p,i,arr) => (
                  <div key={p.id} style={{ background: bg2, borderRadius: i === 0 && arr.length === 1 ? 8 : i === 0 ? "8px 8px 0 0" : i === arr.length - 1 ? "0 0 8px 8px" : 0, border: `1px solid ${border}`, borderBottom: i < arr.length - 1 ? "none" : `1px solid ${border}`, padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 10 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.7"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                    onClick={() => { setActiveProject(p); setProjectTab("messages"); }}>
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, color: text, marginBottom: 2 }}>{p.title}</div><div style={{ fontSize: 11, color: textMuted }}>{p.owner} · {p.category}</div></div>
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
          <div style={{ fontSize: 11, color: textMuted, marginBottom: 18 }}>{activeProject.category} · {activeProject.members.length} member{activeProject.members.length !== 1 ? "s" : ""}</div>
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}><span style={{ fontSize: 10, color: textMuted }}>progress</span><span style={{ fontSize: 10, color: text }}>{activeProject.progress}%</span></div>
            <ProgressBar value={activeProject.progress} dark={dark} />
          </div>
          <div className="proj-tabs" style={{ borderBottom: `1px solid ${border}`, marginBottom: 22, display: "flex" }}>
            <TabBtn id="tasks" label="tasks" count={activeProject.tasks.filter(t => !t.done).length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="messages" label="messages" count={activeProject.messages.length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="updates" label="updates" count={activeProject.updates.length} setter={setProjectTab} current={projectTab} />
            <TabBtn id="team" label="team" count={0} setter={setProjectTab} current={projectTab} />
            <TabBtn id="plugins" label="plugins" count={activeProject.plugins.length} setter={setProjectTab} current={projectTab} />
          </div>

          {projectTab === "tasks" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                <input placeholder="add a task..." value={newTaskText} onChange={e => setNewTaskText(e.target.value)} onKeyDown={e => e.key === "Enter" && addTask(activeProject.id)} style={{ ...inputStyle, fontSize: 12 }} />
                <button className="hb" onClick={() => addTask(activeProject.id)} style={{ ...btnP, padding: "10px 16px", flexShrink: 0, fontSize: 12 }}>add</button>
              </div>
              {activeProject.tasks.length === 0 ? <div style={{ fontSize: 12, color: textMuted, padding: "18px 0" }}>no tasks yet.</div> : (
                <div>
                  {activeProject.tasks.filter(t => !t.done).length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 8 }}>TO DO · {activeProject.tasks.filter(t => !t.done).length}</div>
                      {activeProject.tasks.filter(t => !t.done).map(task => (
                        <div key={task.id} className="task-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${border}` }}>
                          <button onClick={() => toggleTask(activeProject.id, task.id)} style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${textMuted}`, background: "none", cursor: "pointer", flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: text, flex: 1 }}>{task.text}</span>
                          <button className="tdel hb" onClick={() => deleteTask(activeProject.id, task.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, opacity: 0, transition: "opacity 0.15s", fontFamily: "inherit" }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {activeProject.tasks.filter(t => t.done).length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 8 }}>DONE · {activeProject.tasks.filter(t => t.done).length}</div>
                      {activeProject.tasks.filter(t => t.done).map(task => (
                        <div key={task.id} className="task-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${border}` }}>
                          <button onClick={() => toggleTask(activeProject.id, task.id)} style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${text}`, background: text, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: bg, fontSize: 9 }}>✓</span></button>
                          <span style={{ fontSize: 13, color: textMuted, textDecoration: "line-through", flex: 1 }}>{task.text}</span>
                          <button className="tdel hb" onClick={() => deleteTask(activeProject.id, task.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 12, opacity: 0, transition: "opacity 0.15s", fontFamily: "inherit" }}>✕</button>
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
                {activeProject.messages.length === 0 ? <div style={{ fontSize: 12, color: textMuted, padding: "18px 0" }}>no messages yet.</div>
                  : activeProject.messages.map((msg, i) => {
                      const isMe = msg.from === myInitials;
                      if (msg.from === "system") return <div key={i} style={{ textAlign: "center", fontSize: 10, color: textMuted, padding: "4px 0" }}>{msg.text}</div>;
                      return (
                        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: isMe ? "row-reverse" : "row" }}>
                          <Avatar initials={msg.from} size={28} dark={dark} />
                          <div style={{ maxWidth: "72%" }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                              <span style={{ fontSize: 11, fontWeight: 500, color: text }}>{isMe ? "you" : msg.name}</span>
                              <span style={{ fontSize: 10, color: textMuted }}>{msg.time}</span>
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
                <input placeholder="send a message..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage(activeProject.id)} style={{ ...inputStyle, fontSize: 12 }} />
                <button className="hb" onClick={() => sendMessage(activeProject.id)} style={{ ...btnP, padding: "10px 16px", flexShrink: 0, fontSize: 12 }}>send</button>
              </div>
            </div>
          )}

          {projectTab === "updates" && (
            <div>
              <div style={{ display: "flex", gap: 10, marginBottom: 22, alignItems: "flex-start" }}>
                <Avatar initials={myInitials} size={28} dark={dark} />
                <div style={{ flex: 1 }}>
                  <textarea placeholder="post an update..." value={newUpdate} onChange={e => setNewUpdate(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none", fontSize: 12, padding: "8px 12px" }} />
                  {newUpdate.trim() && <button className="hb" onClick={() => postUpdate(activeProject.id)} style={{ ...btnP, marginTop: 8, padding: "7px 14px", fontSize: 11 }}>post</button>}
                </div>
              </div>
              {activeProject.updates.length === 0 ? <div style={{ fontSize: 12, color: textMuted }}>no updates yet.</div>
                : activeProject.updates.map((u,i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 18 }}>
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

          {projectTab === "team" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeProject.members.map((m,i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: bg2, borderRadius: 8, border: `1px solid ${border}` }}>
                  <button onClick={() => { const u = users.find(u => u.id === m.id); if (u) setViewingProfile(u); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    <Avatar initials={m.initials} size={36} dark={dark} />
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: text }}>{m.name || m.initials}</div>
                    <div style={{ fontSize: 11, color: textMuted }}>{i === 0 ? "owner" : "collaborator"}</div>
                  </div>
                  {i !== 0 && <button className="hb" onClick={() => { const u = users.find(u => u.id === m.id); if (u) setDmOpen(u); }} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: textMuted, fontFamily: "inherit" }}>message</button>}
                </div>
              ))}
              <div style={{ padding: "12px 16px", border: `1px dashed ${border}`, borderRadius: 8, fontSize: 12, color: textMuted, textAlign: "center", cursor: "pointer" }} onClick={() => showToast("Invite link copied.")}>+ invite collaborator</div>
            </div>
          )}

          {projectTab === "plugins" && (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {PLUGINS.filter(p => activeProject.plugins.includes(p.id)).map(plug => (
                  <div key={plug.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: bg2, borderRadius: 8, border: `1px solid ${border}` }}>
                    <span style={{ fontSize: 18, color: text, width: 24, textAlign: "center" }}>{plug.icon}</span>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: text }}>{plug.name}</div><div style={{ fontSize: 11, color: textMuted }}>{plug.desc}</div></div>
                    <button className="hb" onClick={() => addPlugin(plug.id, activeProject.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>remove</button>
                  </div>
                ))}
              </div>
              {PLUGINS.filter(p => !activeProject.plugins.includes(p.id)).length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: textMuted, letterSpacing: "1px", marginBottom: 8 }}>ADD PLUGIN</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {PLUGINS.filter(p => !activeProject.plugins.includes(p.id)).map(plug => (
                      <button key={plug.id} className="hb" onClick={() => addPlugin(plug.id, activeProject.id)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "10px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: textMuted, display: "flex", gap: 10, alignItems: "center", textAlign: "left" }}>
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
                  <div style={{ fontSize: "clamp(16px, 4vw, 20px)", fontWeight: 400, color: text, letterSpacing: "-0.5px" }}>{profile.name || "Anonymous"}</div>
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{profile.role}</div>
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>{following.length} following</div>
                </div>
              </div>
              {profile.bio && <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 22 }}>{profile.bio}</p>}
              <div style={{ marginBottom: 22 }}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>SKILLS</div>
                {profile.skills.length === 0
                  ? <div style={{ fontSize: 12, color: textMuted }}>no skills added. <button onClick={() => setEditProfile(true)} style={{ background: "none", border: "none", color: text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>add →</button></div>
                  : <div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>{profile.skills.map(s => <span key={s} style={{ fontSize: 11, padding: "3px 10px", border: `1px solid ${border}`, borderRadius: 3, color: textMuted }}>{s}</span>)}</div>
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
                <button className="hb" onClick={() => { setScreen("landing"); setProfile({ name: "", role: "", bio: "", skills: [] }); setOnboardStep(0); setFollowing([]); }} style={{ ...btnG, color: textMuted }}>sign out</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 22 }}>
                <div><label style={labelStyle}>NAME</label><input style={inputStyle} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></div>
                <div><label style={labelStyle}>ROLE</label><input style={inputStyle} placeholder="Founder, Designer, Engineer..." value={profile.role} onChange={e => setProfile({ ...profile, role: e.target.value })} /></div>
                <div><label style={labelStyle}>BIO</label><textarea style={{ ...inputStyle, resize: "none" }} rows={4} value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} /></div>
                <div>
                  <label style={labelStyle}>SKILLS</label>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {SKILLS.map(s => { const sel = profile.skills.includes(s); return <button key={s} className="hb" onClick={() => setProfile({ ...profile, skills: sel ? profile.skills.filter(x => x !== s) : [...profile.skills, s] })} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: sel ? text : "none", color: sel ? bg : textMuted, border: `1px solid ${sel ? text : border}`, transition: "all 0.15s" }}>{s}</button>; })}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="hb" onClick={() => setEditProfile(false)} style={btnG}>cancel</button>
                <button className="hb" onClick={() => { setEditProfile(false); showToast("Profile saved."); }} style={{ ...btnP, flex: 1 }}>save</button>
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
