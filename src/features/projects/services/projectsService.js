import { supabase } from "../../../supabase";

export const fetchProjectWorkspaceData = async (projectId) => {
  return Promise.all([
    supabase.from("tasks").select("*").eq("project_id", projectId).order("created_at"),
    supabase.from("messages").select("*").eq("project_id", projectId).order("created_at"),
    supabase.from("updates").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    supabase.from("project_files").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    supabase.from("project_docs").select("*").eq("project_id", projectId).order("created_at"),
  ]);
};

export const createProject = async (payload) => {
  return supabase.from("projects").insert(payload).select().single();
};

export const updateProject = async (projectId, payload) => {
  return supabase.from("projects").update(payload).eq("id", projectId);
};

export const createProjectInvite = async (projectId, userId) => {
  return supabase.from("project_invites").insert({ project_id: projectId, created_by: userId }).select().single();
};

export const createProjectActivity = async (payload) => {
  return supabase.from("project_activity").insert(payload);
};

export const fetchProjectActivity = async (projectId) => {
  return supabase.from("project_activity").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50);
};

export const createTask = async (payload) => {
  return supabase.from("tasks").insert(payload).select().single();
};

export const updateTask = async (taskId, payload) => {
  return supabase.from("tasks").update(payload).eq("id", taskId).select().single();
};

export const deleteTask = async (taskId) => {
  return supabase.from("tasks").delete().eq("id", taskId);
};

export const createProjectUpdate = async (payload) => {
  return supabase.from("updates").insert(payload).select().single();
};

export const createProjectFileRecord = async (payload) => {
  return supabase.from("project_files").insert(payload).select().single();
};

export const deleteProjectFileRecord = async (fileId) => {
  return supabase.from("project_files").delete().eq("id", fileId);
};

export const uploadProjectFile = async (path, file) => {
  return supabase.storage.from("project-files").upload(path, file);
};

export const removeProjectFileStorage = async (path) => {
  return supabase.storage.from("project-files").remove([path]);
};

export const getProjectFilePublicUrl = (path) => {
  return supabase.storage.from("project-files").getPublicUrl(path);
};

export const createProjectDoc = async (payload) => {
  return supabase.from("project_docs").insert(payload).select().single();
};

export const updateProjectDoc = async (docId, payload) => {
  return supabase.from("project_docs").update(payload).eq("id", docId);
};

export const deleteProjectDoc = async (docId) => {
  return supabase.from("project_docs").delete().eq("id", docId);
};

export const markApplicationLeft = async (applicationId) => {
  return supabase.from("applications").update({ status: "left" }).eq("id", applicationId);
};

export const createShipPost = async (payload) => {
  return supabase.from("posts").insert(payload).select().single();
};
