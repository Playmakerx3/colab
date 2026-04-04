import { useEffect, useRef } from "react";
import { CATEGORIES } from "../../../constants/appConstants";
import {
  createProject,
  createProjectActivity,
  createProjectDoc,
  createProjectFileRecord,
  createProjectInvite,
  createProjectUpdate,
  createShipPost,
  createTask,
  deleteProject,
  deleteProjectDoc,
  deleteProjectFileRecord,
  deleteTask,
  fetchProjectActivity,
  fetchProjectWorkspaceData,
  getProjectFilePublicUrl,
  markApplicationLeft,
  removeProjectFileStorage,
  updateProject,
  updateProjectDoc,
  updateTask,
  uploadProjectFile,
} from "../services/projectsService";

export function useProjectWorkspace({
  authUser,
  profile,
  myInitials,
  projects,
  setProjects,
  activeProject,
  setActiveProject,
  setTasks,
  tasks,
  users,
  setMessages,
  setProjectUpdates,
  projectUpdates,
  setProjectFiles,
  setProjectDocs,
  setActiveDoc,
  setProjectActivity,
  setApplications,
  setPosts,
  newProject,
  setNewProject,
  setShowCreate,
  setAppScreen,
  setProjectTab,
  newTaskText,
  setNewTaskText,
  taskAssignee,
  setTaskAssignee,
  taskDueDate,
  setTaskDueDate,
  newUpdate,
  setNewUpdate,
  detectAndNotifyMentions,
  showToast,
  setShowShipModal,
  setShipPostContent,
  setInviteLink,
  setGithubLoading,
  setGithubError,
  setGithubCommits,
  setCreateProjectError,
  setIsCreatingProject,
}) {
  const projectsRef = useRef([]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const loadActivity = async (projectId) => {
    const { data } = await fetchProjectActivity(projectId);
    setProjectActivity(data || []);
  };

  const loadProjectData = async (projectId) => {
    const [{ data: t }, { data: m }, { data: u }, { data: f }, { data: d }] = await fetchProjectWorkspaceData(projectId);
    setTasks((prev) => {
      const next = (prev || []).filter((task) => task.project_id !== projectId);
      return [...next, ...(t || [])];
    });
    setMessages(m || []);
    setProjectUpdates(u || []);
    setProjectFiles(f || []);
    setProjectDocs(d || []);
    setActiveDoc(null);
    loadActivity(projectId);
  };

  const handlePostProject = async () => {
    console.info("[project:create] submit triggered");

    const title = newProject.title?.trim() || "";
    const description = newProject.description?.trim() || "";
    if (!title || !description) {
      const message = "Title and description are required.";
      console.warn("[project:create] validation failed", { titlePresent: !!title, descriptionPresent: !!description });
      setCreateProjectError?.(message);
      showToast(message);
      return;
    }

    if (!authUser?.id) {
      const message = "Your session is still loading. Please wait a moment and retry.";
      console.error("[project:create] missing user/session id");
      setCreateProjectError?.(message);
      showToast(message);
      return;
    }

    const ownerName = profile?.name?.trim()
      || authUser.user_metadata?.name?.trim()
      || authUser.user_metadata?.full_name?.trim()
      || authUser.email?.split("@")?.[0]
      || "New member";
    const ownerInitials = myInitials || ownerName.slice(0, 2).toUpperCase();
    const payload = {
      title,
      description,
      category: newProject.category || CATEGORIES[0],
      skills: Array.isArray(newProject.skills) ? newProject.skills : [],
      max_collaborators: Number.isFinite(newProject.maxCollaborators) ? newProject.maxCollaborators : 2,
      location: (newProject.location || profile?.location || "").trim(),
      goals: newProject.goals?.trim() || null,
      timeline: newProject.timeline?.trim() || null,
      owner_id: authUser.id,
      owner_name: ownerName,
      owner_initials: ownerInitials,
      status: "open",
      progress: 0,
      plugins: [],
      collaborators: 0,
      is_private: Boolean(newProject.is_private),
    };

    console.info("[project:create] payload constructed", {
      owner_id: payload.owner_id,
      title: payload.title,
      category: payload.category,
      max_collaborators: payload.max_collaborators,
    });

    setCreateProjectError?.("");
    setIsCreatingProject?.(true);

    try {
      console.info("[project:create] calling createProject API");
      const { data, error } = await createProject(payload);
      if (error) {
        console.error("[project:create] API returned error", error);
        throw error;
      }
      if (!data) {
        throw new Error("Project could not be created. Please retry.");
      }

      console.info("[project:create] API success", { projectId: data.id });
      setProjects([data, ...projects]);
      setNewProject({ title: "", description: "", category: CATEGORIES[0], skills: [], maxCollaborators: 2, location: "", goals: "", timeline: "", is_private: false });
      setShowCreate(false);
      setActiveProject(data);
      loadProjectData(data.id);
      setAppScreen("workspace");
      setProjectTab("kanban");
      showToast("Project posted — you're in your workspace.");
    } catch (error) {
      const message = error?.message || "Failed to post project. Try again.";
      setCreateProjectError?.(message);
      showToast(message);
      console.error("[project:create] failed", error);
    } finally {
      setIsCreatingProject?.(false);
    }
  };

  const handleArchiveProject = async (projectId) => {
    if (!window.confirm("Archive this project? It will be hidden from your workspace but not deleted.")) return;
    try {
      const { data, error } = await updateProject(projectId, { archived: true });
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Archive did not persist. Please retry.");
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, archived: true } : p)));
      setActiveProject(null);
      showToast("Project archived.");
    } catch (error) {
      console.error("Archive failed", error);
      showToast(error?.message || "Could not archive project. Please retry.");
    }
  };

  const handleUnarchiveProject = async (projectId) => {
    try {
      const { data, error } = await updateProject(projectId, { archived: false });
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Restore did not persist. Please retry.");
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, archived: false } : p)));
      showToast("Project restored.");
    } catch (error) {
      console.error("Unarchive failed", error);
      showToast(error?.message || "Could not restore project. Please retry.");
    }
  };

  const logActivity = async (projectId, eventType, details) => {
    if (!authUser || !profile) return;
    await createProjectActivity({ project_id: projectId, user_id: authUser.id, user_name: profile.name, event_type: eventType, details });
  };

  const handleShipProject = async (projectId, content) => {
    if (!content.trim()) return;
    const proj = projects.find((p) => p.id === projectId) || activeProject;
    if (!proj) return;
    const now = new Date().toISOString();
    await updateProject(projectId, { shipped: true, shipped_at: now });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, shipped: true, shipped_at: now } : p)));
    if (activeProject?.id === projectId) setActiveProject((prev) => ({ ...prev, shipped: true, shipped_at: now }));
    const insertPayload = {
      user_id: authUser.id,
      user_name: profile.name,
      user_initials: myInitials,
      user_role: profile.role || "",
      content,
      project_id: projectId,
      project_title: proj.title,
    };
    const { data: postData } = await createShipPost(insertPayload);
    if (postData) setPosts((prev) => [postData, ...prev]);
    logActivity(projectId, "project_shipped", `${proj.title} shipped`);
    setShowShipModal(false);
    setShipPostContent("");
    showToast("Shipped! Post added to your feed.");
  };

  const handleToggleFeatured = async (projectId, featured) => {
    await updateProject(projectId, { featured });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, featured } : p)));
    if (activeProject?.id === projectId) setActiveProject((prev) => ({ ...prev, featured }));
    showToast(featured ? "Project featured on Explore." : "Removed from featured.");
  };

  const parseGithubRepo = (input) => {
    if (!input) return null;
    const cleaned = input.trim().replace(/\.git$/, "").replace(/\/$/, "");
    const match = cleaned.match(/(?:github\.com\/)?([^/\s]+\/[^/\s]+)$/);
    return match ? match[1] : null;
  };

  const loadGithubCommits = async (repoSlug) => {
    if (!repoSlug) return;
    setGithubLoading(true);
    setGithubError(null);
    try {
      const res = await fetch(`https://api.github.com/repos/${repoSlug}/commits?per_page=8`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!res.ok) {
        if (res.status === 404) setGithubError("Repo not found. Make sure it's public.");
        else if (res.status === 403) setGithubError("Rate limited by GitHub. Try again in a minute.");
        else setGithubError(`GitHub error: ${res.status}`);
        setGithubCommits([]);
      } else {
        const data = await res.json();
        setGithubCommits(data);
      }
    } catch {
      setGithubError("Failed to reach GitHub.");
    }
    setGithubLoading(false);
  };

  const handleSaveGithubRepo = async (repoInput) => {
    const slug = parseGithubRepo(repoInput);
    if (!slug) {
      showToast("Enter a valid GitHub repo (e.g. owner/repo)");
      return;
    }
    await updateProject(activeProject.id, { github_repo: slug });
    setProjects((prev) => prev.map((p) => (p.id === activeProject.id ? { ...p, github_repo: slug } : p)));
    setActiveProject((prev) => ({ ...prev, github_repo: slug }));
    if (!(activeProject.plugins || []).includes("github")) {
      const newPlugins = [...(activeProject.plugins || []), "github"];
      await updateProject(activeProject.id, { plugins: newPlugins });
      setProjects((prev) => prev.map((p) => (p.id === activeProject.id ? { ...p, plugins: newPlugins } : p)));
      setActiveProject((prev) => ({ ...prev, plugins: newPlugins }));
    }
    showToast("Repo connected.");
    loadGithubCommits(slug);
  };

  const handleLeaveProject = async (applicationId) => {
    if (!window.confirm("Leave this project? You'll need to re-apply to rejoin.")) return;
    await markApplicationLeft(applicationId);
    setApplications((prev) => prev.map((a) => (a.id === applicationId ? { ...a, status: "left" } : a)));
    setActiveProject(null);
    showToast("You've left the project.");
  };

  const handleGenerateInvite = async (projectId) => {
    if (!projectId) {
      const error = new Error("Project is not ready yet. Re-open the project and retry.");
      showToast(error.message);
      return { ok: false, error };
    }
    if (!authUser?.id) {
      const error = new Error("Session not ready yet. Please sign in again and retry.");
      showToast(error.message);
      return { ok: false, error };
    }
    try {
      const { data, error } = await createProjectInvite(projectId, authUser.id);
      if (error) throw error;
      if (data?.token) {
        const url = `${window.location.origin}/join/${data.token}`;
        setInviteLink(url);
        try {
          await navigator.clipboard?.writeText(url);
          showToast("Invite link copied to clipboard.");
        } catch {
          showToast("Invite link ready. Copy it from the panel.");
        }
        return { ok: true, url };
      }
      const missingTokenError = new Error("Invite was created but link token was missing. Please retry.");
      showToast(missingTokenError.message);
      return { ok: false, error: missingTokenError };
    } catch (error) {
      console.error("Invite generation failed", error);
      showToast("Could not create invite link. Please retry.");
      return { ok: false, error };
    }
  };

  const handleDeleteArchivedProject = async (projectId) => {
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project) return;
    if (!project.archived) {
      showToast("Archive this project before deleting.");
      return;
    }
    if (!window.confirm(`Delete "${project.title}" permanently? This cannot be undone.`)) return;
    const { error } = await deleteProject(projectId);
    if (error) {
      showToast("Project could not be deleted.");
      return;
    }
    setProjects((prev) => prev.filter((item) => item.id !== projectId));
    setTasks((prev) => prev.filter((task) => task.project_id !== projectId));
    if (activeProject?.id === projectId) setActiveProject(null);
    showToast("Project deleted permanently.");
  };

  const calcProgress = (projectId, taskList) => {
    const pt = taskList.filter((t) => t.project_id === projectId);
    if (pt.length === 0) return null;
    return Math.round((pt.filter((t) => t.done).length / pt.length) * 100);
  };

  const syncProgress = async (projectId, taskList) => {
    const prog = calcProgress(projectId, taskList);
    if (prog === null) return;
    await updateProject(projectId, { progress: prog });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, progress: prog } : p)));
    if (activeProject?.id === projectId) setActiveProject((prev) => ({ ...prev, progress: prog }));
    if (prog === 100) {
      const proj = projectsRef.current.find((p) => p.id === projectId);
      if (proj && !proj.shipped && proj.owner_id === authUser?.id) {
        setTimeout(() => {
          setShipPostContent(`just shipped: ${proj.title}. built it with the team on CoLab.`);
          setShowShipModal(true);
        }, 600);
      }
    }
  };

  const handleAddTask = async (projectId) => {
    if (!newTaskText.trim()) return;
    const assignedUser = users.find((u) => u.name === taskAssignee);
    const { data } = await createTask({
      project_id: projectId,
      text: newTaskText,
      done: false,
      assigned_to: assignedUser?.id || null,
      assigned_name: taskAssignee || null,
      due_date: taskDueDate || null,
    });
    if (data) {
      const newTasks = [...tasks, data];
      setTasks(newTasks);
      setNewTaskText("");
      setTaskAssignee("");
      setTaskDueDate("");
      syncProgress(projectId, newTasks);
    }
  };

  const handleToggleTask = async (task) => {
    const { data } = await updateTask(task.id, { done: !task.done });
    if (data) {
      const newTasks = tasks.map((t) => (t.id === task.id ? data : t));
      setTasks(newTasks);
      syncProgress(task.project_id, newTasks);
    }
  };

  const handleDeleteTask = async (taskId) => {
    const task = tasks.find((t) => t.id === taskId);
    await deleteTask(taskId);
    const newTasks = tasks.filter((t) => t.id !== taskId);
    setTasks(newTasks);
    if (task) syncProgress(task.project_id, newTasks);
  };

  const handlePostUpdate = async (projectId) => {
    if (!newUpdate.trim()) return;
    const { data } = await createProjectUpdate({
      project_id: projectId,
      author_id: authUser.id,
      author: profile.name,
      initials: myInitials,
      text: newUpdate,
    });
    if (data) {
      setProjectUpdates([data, ...projectUpdates]);
      setNewUpdate("");
      detectAndNotifyMentions(newUpdate, projectId);
      showToast("Update posted.");
    }
  };

  const handleUploadProjectFile = async (projectId, file) => {
    if (!file) return;
    showToast("Uploading...");
    const path = `${projectId}/${Date.now()}-${file.name}`;
    const { error } = await uploadProjectFile(path, file);
    if (error) {
      showToast("Upload failed.");
      return;
    }
    const { data: { publicUrl } } = getProjectFilePublicUrl(path);
    const { data: fileRecord } = await createProjectFileRecord({
      project_id: projectId,
      user_id: authUser.id,
      user_name: profile.name,
      user_initials: myInitials,
      name: file.name,
      size: file.size,
      type: file.type,
      url: publicUrl,
    });
    if (fileRecord) {
      setProjectFiles((prev) => [...prev, fileRecord]);
      showToast("File uploaded.");
    }
  };

  const handleDeleteProjectFile = async (file) => {
    const path = file.url.split("/project-files/")[1];
    await removeProjectFileStorage(path);
    await deleteProjectFileRecord(file.id);
    setProjectFiles((prev) => prev.filter((f) => f.id !== file.id));
    showToast("File deleted.");
  };

  const handleCreateProjectDoc = async (projectId, title) => {
    if (!title) return;
    const { data } = await createProjectDoc({
      project_id: projectId,
      title,
      content: "",
      last_edited_by: profile.name,
      last_edited_initials: myInitials,
    });
    if (data) {
      setProjectDocs((prev) => [...prev, data]);
      setActiveDoc(data);
    }
  };

  const handleDeleteProjectDoc = async (docId, clearActive = false) => {
    await deleteProjectDoc(docId);
    setProjectDocs((prev) => prev.filter((d) => d.id !== docId));
    if (clearActive) setActiveDoc(null);
    showToast("Document deleted.");
  };

  const handleSaveProjectDoc = async (doc) => {
    await updateProjectDoc(doc.id, {
      content: doc.content,
      last_edited_by: profile.name,
      last_edited_initials: myInitials,
      updated_at: new Date().toISOString(),
    });
    setProjectDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...doc } : d)));
    showToast("Saved.");
  };

  return {
    loadProjectData,
    handlePostProject,
    handleArchiveProject,
    handleUnarchiveProject,
    handleShipProject,
    handleToggleFeatured,
    loadGithubCommits,
    handleSaveGithubRepo,
    handleLeaveProject,
    handleGenerateInvite,
    handleDeleteArchivedProject,
    logActivity,
    loadActivity,
    handleAddTask,
    handleToggleTask,
    handleDeleteTask,
    handlePostUpdate,
    handleUploadProjectFile,
    handleDeleteProjectFile,
    handleCreateProjectDoc,
    handleDeleteProjectDoc,
    handleSaveProjectDoc,
    syncProgress,
    parseGithubRepo,
  };
}
