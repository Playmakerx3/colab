import { supabase } from "../../../supabase";

export const fetchDmMessages = async (threadId) => {
  return supabase.from("dm_messages").select("*").eq("thread_id", threadId).order("created_at");
};

export const createProjectMessage = async ({ projectId, fromUser, fromInitials, fromName, text }) => {
  return supabase.from("messages").insert({
    project_id: projectId,
    from_user: fromUser,
    from_initials: fromInitials,
    from_name: fromName,
    text,
  }).select().single();
};

export const findExistingDmThread = async ({ authUserId, otherUserId }) => {
  return supabase.from("dm_threads").select("*")
    .or(`and(user_a.eq.${authUserId},user_b.eq.${otherUserId}),and(user_a.eq.${otherUserId},user_b.eq.${authUserId})`);
};

export const createDmThread = async ({ authUserId, otherUserId }) => {
  return supabase.from("dm_threads").insert({ user_a: authUserId, user_b: otherUserId }).select().single();
};

export const createDmMessage = async ({ threadId, senderId, senderName, senderInitials, text }) => {
  return supabase.from("dm_messages").insert({
    thread_id: threadId,
    sender_id: senderId,
    sender_name: senderName,
    sender_initials: senderInitials,
    text,
  }).select().single();
};

export const deleteDmMessage = async (msgId) => {
  return supabase.from("dm_messages").delete().eq("id", msgId);
};

export const deleteDmMessagesForThread = async (threadId) => {
  return supabase.from("dm_messages").delete().eq("thread_id", threadId);
};

export const deleteDmThread = async (threadId) => {
  return supabase.from("dm_threads").delete().eq("id", threadId);
};

export const editDmMessage = async ({ msgId, newText }) => {
  return supabase.from("dm_messages").update({ text: newText, edited: true }).eq("id", msgId).select().single();
};

export const deleteProjectMessage = async (msgId) => {
  return supabase.from("messages").delete().eq("id", msgId);
};

export const editProjectMessage = async ({ msgId, newText }) => {
  return supabase.from("messages").update({ text: newText, edited: true }).eq("id", msgId).select().single();
};

export const markDmMessageRead = async ({ msgId, readBy }) => {
  return supabase.from("dm_messages").update({ read_by: readBy }).eq("id", msgId);
};

export const uploadMessagingAttachment = async ({ path, file }) => {
  return supabase.storage.from("user-uploads").upload(path, file, { upsert: false });
};

export const getMessagingAttachmentUrl = (path) => {
  return supabase.storage.from("user-uploads").getPublicUrl(path);
};
