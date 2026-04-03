import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../supabase";
import {
  createDmMessage,
  createDmThread,
  createProjectMessage,
  deleteDmMessage,
  deleteDmMessagesForThread,
  deleteDmThread,
  deleteProjectMessage,
  editDmMessage,
  editProjectMessage,
  fetchDmMessages,
  findExistingDmThread,
  markDmMessageRead,
} from "../services/messagesService";

export function useMessaging({
  authUser,
  profile,
  myInitials,
  users,
  dmThreads,
  dmMessages,
  activeDmThread,
  newMessage,
  setNewMessage,
  dmInput,
  setDmInput,
  messagesEndRef,
  dmEndRef,
  setMessages,
  setDmMessages,
  setDmThreads,
  setActiveDmThread,
  setAppScreen,
  setViewingProfile,
  setViewFullProfile,
  setEditingMessage,
  detectAndNotifyMentions,
  showToast,
}) {
  const dmReadInFlightRef = useRef(new Set());
  const [dmAttachments, setDmAttachments] = useState({});
  const [projectAttachments, setProjectAttachments] = useState({});

  const isImageUrl = (url) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url || "");
  const normalizeUpload = (file) => ({
    tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    name: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    progress: 0,
    status: "queued",
    error: null,
    url: null,
  });
  const upsertMessage = (list, nextMsg) => {
    if (!nextMsg) return list;
    const indexById = nextMsg.id ? list.findIndex((m) => m.id === nextMsg.id) : -1;
    if (indexById >= 0) {
      const copy = [...list];
      copy[indexById] = { ...copy[indexById], ...nextMsg };
      return copy;
    }
    const optimisticIdx = list.findIndex((m) =>
      String(m.id || "").startsWith("temp-") &&
      m.sender_id === nextMsg.sender_id &&
      m.from_user === nextMsg.from_user &&
      m.text === nextMsg.text
    );
    if (optimisticIdx >= 0) {
      const copy = [...list];
      copy[optimisticIdx] = { ...nextMsg };
      return copy;
    }
    return [...list, nextMsg];
  };
  const shouldAutoScroll = (endRef) => {
    const el = endRef?.current?.parentElement;
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    return distanceFromBottom < 80;
  };
  const scrollToBottom = (endRef) => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const loadDmMessages = async (threadId) => {
    const { data } = await fetchDmMessages(threadId);
    const messages = data || [];
    setDmMessages((prev) => {
      const existing = prev[threadId] || [];
      return {
        ...prev,
        [threadId]: messages.reduce((acc, msg) => upsertMessage(acc, msg), existing),
      };
    });
    return messages;
  };

  const markDmRead = async (threadId, messagesOverride) => {
    if (!threadId || !authUser?.id || dmReadInFlightRef.current.has(threadId)) return;
    const msgs = messagesOverride || dmMessages[threadId] || [];
    const unread = msgs.filter((m) => m.sender_id !== authUser?.id && !(m.read_by || []).includes(authUser?.id));
    if (unread.length === 0) return;
    dmReadInFlightRef.current.add(threadId);
    try {
      await Promise.all(
        unread.map((m) => markDmMessageRead({ msgId: m.id, readBy: [...(m.read_by || []), authUser.id] }))
      );
    } finally {
      dmReadInFlightRef.current.delete(threadId);
    }

    setDmMessages((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] || []).map((m) =>
        m.sender_id !== authUser?.id ? { ...m, read_by: [...(m.read_by || []), authUser.id] } : m
      ),
    }));
  };

  const openDmThread = async ({ thread, otherUser }) => {
    setActiveDmThread({ ...thread, otherUser });
    const cachedMessages = dmMessages[thread.id] || [];
    if (cachedMessages.length > 0) {
      await markDmRead(thread.id, cachedMessages);
    }
    const loadedMessages = await loadDmMessages(thread.id);
    setAppScreen("messages");
    setViewingProfile(null);
    setViewFullProfile(null);
    setDmThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, unread: false } : t)));
    await markDmRead(thread.id, loadedMessages);
  };

  const openDm = async (user) => {
    if (user.id === authUser?.id) return;
    let thread = dmThreads.find(
      (t) =>
        (t.user_a === authUser.id && t.user_b === user.id) ||
        (t.user_b === authUser.id && t.user_a === user.id)
    );

    if (!thread) {
      const { data: existing } = await findExistingDmThread({ authUserId: authUser.id, otherUserId: user.id });
      if (existing && existing.length > 0) {
        thread = existing[0];
        setDmThreads((prev) => (prev.find((t) => t.id === thread.id) ? prev : [...prev, thread]));
      } else {
        const { data } = await createDmThread({ authUserId: authUser.id, otherUserId: user.id });
        if (data) {
          thread = data;
          setDmThreads((prev) => [...prev, data]);
        }
      }
    }

    if (thread) {
      await openDmThread({ thread, otherUser: user });
    }
  };

  const handleSendMessage = async (projectId) => {
    if (!newMessage.trim()) return;
    const text = newMessage;
    setNewMessage("");
    const optimisticId = `temp-project-${Date.now()}`;
    const optimisticMsg = {
      id: optimisticId,
      project_id: projectId,
      from_user: authUser.id,
      from_initials: myInitials,
      from_name: profile.name,
      text,
      created_at: new Date().toISOString(),
      optimistic: true,
    };
    const canScroll = shouldAutoScroll(messagesEndRef);
    setMessages((prev) => upsertMessage(prev, optimisticMsg));

    const { data } = await createProjectMessage({
      projectId,
      fromUser: authUser.id,
      fromInitials: myInitials,
      fromName: profile.name,
      text,
    });

    if (data) {
      setMessages((prev) => upsertMessage(prev, data));
      if (canScroll) scrollToBottom(messagesEndRef);
      detectAndNotifyMentions(text, projectId);
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    }
  };

  const handleSendDm = async () => {
    if (!dmInput.trim() || !activeDmThread) return;
    const text = dmInput;
    const threadId = activeDmThread.id;
    const optimisticId = `temp-dm-${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      thread_id: threadId,
      sender_id: authUser.id,
      sender_name: profile.name,
      sender_initials: myInitials,
      text,
      created_at: new Date().toISOString(),
      read_by: [authUser.id],
      optimistic: true,
    };
    const canScroll = shouldAutoScroll(dmEndRef);
    setDmInput("");
    setDmMessages((prev) => ({ ...prev, [threadId]: upsertMessage(prev[threadId] || [], optimistic) }));

    const { data } = await createDmMessage({
      threadId,
      senderId: authUser.id,
      senderName: profile.name,
      senderInitials: myInitials,
      text,
    });

    if (data) {
      setDmMessages((prev) => {
        const existing = prev[threadId] || [];
        return { ...prev, [threadId]: upsertMessage(existing, data) };
      });
      if (canScroll) scrollToBottom(dmEndRef);
    } else {
      setDmMessages((prev) => ({ ...prev, [threadId]: (prev[threadId] || []).filter((m) => m.id !== optimisticId) }));
    }
  };

  const uploadAttachment = async ({ file, scope, threadId, projectId }) => {
    const temp = normalizeUpload(file);
    if (scope === "dm") {
      setDmAttachments((prev) => ({ ...prev, [threadId]: [...(prev[threadId] || []), temp] }));
    } else {
      setProjectAttachments((prev) => ({ ...prev, [projectId]: [...(prev[projectId] || []), temp] }));
    }
    const folder = scope === "dm" ? "dm-attachments" : "project-attachments";
    const path = `${authUser.id}/${folder}/${Date.now()}-${file.name}`;
    try {
      const setProgress = (status, progress, extras = {}) => {
        const updater = (items = []) => items.map((a) => (a.tempId === temp.tempId ? { ...a, status, progress, ...extras } : a));
        if (scope === "dm") setDmAttachments((prev) => ({ ...prev, [threadId]: updater(prev[threadId]) }));
        else setProjectAttachments((prev) => ({ ...prev, [projectId]: updater(prev[projectId]) }));
      };
      setProgress("uploading", 10);
      const { error } = await supabase.storage.from("user-uploads").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("user-uploads").getPublicUrl(path);
      if (!publicUrl || !/^https?:\/\//i.test(publicUrl)) throw new Error("Invalid uploaded file URL");
      setProgress("uploaded", 100, { url: publicUrl });

      const text = `${isImageUrl(publicUrl) ? "🖼️" : "📎"} ${file.name}\n${publicUrl}`;
      if (scope === "dm") {
        await createDmMessage({
          threadId,
          senderId: authUser.id,
          senderName: profile.name,
          senderInitials: myInitials,
          text,
        });
      } else {
        await createProjectMessage({
          projectId,
          fromUser: authUser.id,
          fromInitials: myInitials,
          fromName: profile.name,
          text,
        });
      }
    } catch (error) {
      const setFailed = (items = []) => items.map((a) => (a.tempId === temp.tempId ? { ...a, status: "failed", error: error.message } : a));
      if (scope === "dm") setDmAttachments((prev) => ({ ...prev, [threadId]: setFailed(prev[threadId]) }));
      else setProjectAttachments((prev) => ({ ...prev, [projectId]: setFailed(prev[projectId]) }));
    }
  };
  const addDmAttachments = async (files, threadId) => {
    await Promise.all(files.map((file) => uploadAttachment({ file, scope: "dm", threadId })));
  };
  const addProjectAttachments = async (files, projectId) => {
    await Promise.all(files.map((file) => uploadAttachment({ file, scope: "project", projectId })));
  };
  const retryDmAttachment = async (threadId, tempId) => {
    const item = (dmAttachments[threadId] || []).find((a) => a.tempId === tempId);
    if (!item) return;
    await uploadAttachment({ file: item.file, scope: "dm", threadId });
  };
  const retryProjectAttachment = async (projectId, tempId) => {
    const item = (projectAttachments[projectId] || []).find((a) => a.tempId === tempId);
    if (!item) return;
    await uploadAttachment({ file: item.file, scope: "project", projectId });
  };

  useEffect(() => {
    if (!users?.length || !activeDmThread) return;

    const hydrated = users.find(
      (u) => u.id === activeDmThread.otherUser?.id
    );

    if (
      !hydrated ||
      (hydrated.id === activeDmThread.otherUser?.id &&
       hydrated.name === activeDmThread.otherUser?.name)
    ) {
      return;
    }

    setActiveDmThread((prev) =>
      prev?.id === activeDmThread.id
        ? { ...prev, otherUser: hydrated }
        : prev
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, activeDmThread?.id]);

  useEffect(() => {
    const candidates = dmThreads.slice(0, 5).map((t) => t.id).filter((id) => !(dmMessages[id] || []).length);
    candidates.forEach((threadId) => { loadDmMessages(threadId); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmThreads]);

  const handleDeleteDm = async (msgId) => {
    await deleteDmMessage(msgId);
    setDmMessages((prev) => ({ ...prev, [activeDmThread.id]: (prev[activeDmThread.id] || []).filter((m) => m.id !== msgId) }));
  };

  const handleDeleteThread = async (threadId) => {
    await deleteDmMessagesForThread(threadId);
    await deleteDmThread(threadId);
    setDmMessages((prev) => {
      const n = { ...prev };
      delete n[threadId];
      return n;
    });
    setDmThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (activeDmThread?.id === threadId) setActiveDmThread(null);
    showToast("Conversation deleted.");
  };

  const handleEditDm = async (msgId, newText) => {
    const { data } = await editDmMessage({ msgId, newText });
    if (data) {
      setDmMessages((prev) => ({ ...prev, [activeDmThread.id]: (prev[activeDmThread.id] || []).map((m) => (m.id === msgId ? data : m)) }));
      setEditingMessage(null);
    }
  };

  const handleDeleteProjectMessage = async (msgId) => {
    await deleteProjectMessage(msgId);
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  };

  const handleEditProjectMessage = async (msgId, newText) => {
    const { data } = await editProjectMessage({ msgId, newText });
    if (data) {
      setMessages((prev) => prev.map((m) => (m.id === msgId ? data : m)));
      setEditingMessage(null);
    }
  };

  return {
    loadDmMessages,
    markDmRead,
    openDmThread,
    openDm,
    handleSendMessage,
    handleSendDm,
    handleDeleteDm,
    handleDeleteThread,
    handleEditDm,
    handleDeleteProjectMessage,
    handleEditProjectMessage,
    dmAttachments,
    projectAttachments,
    addDmAttachments,
    addProjectAttachments,
    retryDmAttachment,
    retryProjectAttachment,
  };
}
