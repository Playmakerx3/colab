import { useEffect, useRef } from "react";
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
  getMessagingAttachmentUrl,
  markDmMessageRead,
  uploadMessagingAttachment,
} from "../services/messagesService";

const makeOptimisticId = (prefix) => `optimistic-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const isNearBottom = (el, threshold = 80) => {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
};

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
  projectMessagesListRef,
  dmListRef,
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
  projectAttachments,
  setProjectAttachments,
  dmAttachments,
  setDmAttachments,
}) {
  const readInFlightRef = useRef(new Set());
  const prefetchedThreadsRef = useRef(new Set());

  const loadDmMessages = async (threadId, opts = {}) => {
    const { force = false } = opts;
    if (!force && dmMessages[threadId]) return dmMessages[threadId];
    const { data } = await fetchDmMessages(threadId);
    const messages = data || [];
    setDmMessages((prev) => ({ ...prev, [threadId]: messages }));
    return messages;
  };

  const markDmRead = async (threadId, messagesOverride) => {
    const msgs = messagesOverride || dmMessages[threadId] || [];
    const unread = msgs.filter((m) => m.sender_id !== authUser?.id && !(m.read_by || []).includes(authUser?.id));
    if (unread.length === 0) return;

    const uniqueUnread = unread.filter((m) => {
      if (readInFlightRef.current.has(m.id)) return false;
      readInFlightRef.current.add(m.id);
      return true;
    });
    if (uniqueUnread.length === 0) return;

    await Promise.allSettled(
      uniqueUnread.map((m) => markDmMessageRead({ msgId: m.id, readBy: [...(m.read_by || []), authUser.id] }))
    );

    uniqueUnread.forEach((m) => readInFlightRef.current.delete(m.id));
    setDmMessages((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] || []).map((m) =>
        uniqueUnread.find((u) => u.id === m.id)
          ? { ...m, read_by: [...new Set([...(m.read_by || []), authUser.id])] }
          : m
      ),
    }));
  };

  const openDmThread = async ({ thread, otherUser }) => {
    setActiveDmThread({ ...thread, otherUser });
    setAppScreen("messages");
    setViewingProfile(null);
    setViewFullProfile(null);
    setDmThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, unread: false } : t)));

    const loadedMessages = await loadDmMessages(thread.id);
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
    const text = newMessage.trim();
    if (!text) return;

    const optimisticId = makeOptimisticId("project");
    const optimisticMessage = {
      id: optimisticId,
      project_id: projectId,
      from_user: authUser.id,
      from_initials: myInitials,
      from_name: profile.name,
      text,
      created_at: new Date().toISOString(),
      pending: true,
    };

    setNewMessage("");
    setMessages((prev) => [...prev, optimisticMessage]);

    if (isNearBottom(projectMessagesListRef.current)) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    }

    const { data, error } = await createProjectMessage({
      projectId,
      fromUser: authUser.id,
      fromInitials: myInitials,
      fromName: profile.name,
      text,
    });

    if (error || !data) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setNewMessage(text);
      showToast(`Message failed: ${error?.message || "Please retry."}`);
      return;
    }

    setMessages((prev) => prev.map((m) => (m.id === optimisticId ? data : m)));
    detectAndNotifyMentions(text, projectId);
  };

  const handleSendDm = async () => {
    const text = dmInput.trim();
    if (!text || !activeDmThread) return;
    const threadId = activeDmThread.id;

    const optimisticId = makeOptimisticId("dm");
    const optimisticMessage = {
      id: optimisticId,
      thread_id: threadId,
      sender_id: authUser.id,
      sender_name: profile.name,
      sender_initials: myInitials,
      text,
      created_at: new Date().toISOString(),
      read_by: [authUser.id],
      pending: true,
    };

    setDmInput("");
    setDmMessages((prev) => {
      const existing = prev[threadId] || [];
      return { ...prev, [threadId]: [...existing, optimisticMessage] };
    });

    if (isNearBottom(dmListRef.current)) {
      setTimeout(() => dmEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    }

    const { data, error } = await createDmMessage({
      threadId,
      senderId: authUser.id,
      senderName: profile.name,
      senderInitials: myInitials,
      text,
    });

    if (error || !data) {
      setDmMessages((prev) => ({
        ...prev,
        [threadId]: (prev[threadId] || []).filter((m) => m.id !== optimisticId),
      }));
      setDmInput(text);
      showToast(`Send failed: ${error?.message || "Please retry."}`);
      return;
    }

    setDmMessages((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] || []).map((m) => (m.id === optimisticId ? data : m)),
    }));
  };

  const sendAttachmentMessage = async ({ kind, contextId, file, attempt = 1 }) => {
    const attachmentId = makeOptimisticId(`att-${kind}`);
    const setQueue = kind === "project" ? setProjectAttachments : setDmAttachments;
    setQueue((prev) => [...prev, { id: attachmentId, contextId, file, status: "uploading", progress: 0, attempt }]);

    let simulatedProgress = 0;
    const timer = setInterval(() => {
      simulatedProgress = Math.min(90, simulatedProgress + 10);
      setQueue((prev) => prev.map((a) => (a.id === attachmentId ? { ...a, progress: simulatedProgress } : a)));
    }, 120);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `chat/${authUser.id}/${Date.now()}-${safeName}`;
    const { error } = await uploadMessagingAttachment({ path, file });
    clearInterval(timer);

    if (error) {
      setQueue((prev) => prev.map((a) => (a.id === attachmentId ? { ...a, status: "failed", error: error.message } : a)));
      return;
    }

    const { data: { publicUrl } } = getMessagingAttachmentUrl(path);
    const attachmentText = `📎 ${file.name}\n${publicUrl}`;

    const sender = kind === "project"
      ? createProjectMessage({ projectId: contextId, fromUser: authUser.id, fromInitials: myInitials, fromName: profile.name, text: attachmentText })
      : createDmMessage({ threadId: contextId, senderId: authUser.id, senderName: profile.name, senderInitials: myInitials, text: attachmentText });

    const { data, error: sendError } = await sender;
    if (sendError || !data) {
      setQueue((prev) => prev.map((a) => (a.id === attachmentId ? { ...a, status: "failed", error: sendError?.message || "Failed to send attachment message" } : a)));
      return;
    }

    setQueue((prev) => prev.map((a) => (a.id === attachmentId ? { ...a, status: "done", progress: 100 } : a)));
    setTimeout(() => {
      setQueue((prev) => prev.filter((a) => a.id !== attachmentId));
    }, 1200);

    if (kind === "project") {
      setMessages((prev) => (prev.find((m) => m.id === data.id) ? prev : [...prev, data]));
    } else {
      setDmMessages((prev) => {
        const existing = prev[contextId] || [];
        if (existing.find((m) => m.id === data.id)) return prev;
        return { ...prev, [contextId]: [...existing, data] };
      });
    }
  };

  const handleQueueProjectAttachments = async (files, projectId) => {
    const list = Array.from(files || []);
    await Promise.all(list.map((file) => sendAttachmentMessage({ kind: "project", contextId: projectId, file })));
  };

  const handleQueueDmAttachments = async (files) => {
    if (!activeDmThread) return;
    const list = Array.from(files || []);
    await Promise.all(list.map((file) => sendAttachmentMessage({ kind: "dm", contextId: activeDmThread.id, file })));
  };

  const retryAttachment = async ({ attachmentId, kind }) => {
    const queue = kind === "project" ? projectAttachments : dmAttachments;
    const item = queue.find((a) => a.id === attachmentId);
    if (!item?.file) return;

    const setQueue = kind === "project" ? setProjectAttachments : setDmAttachments;
    setQueue((prev) => prev.filter((a) => a.id !== attachmentId));
    await sendAttachmentMessage({ kind, contextId: item.contextId, file: item.file, attempt: (item.attempt || 1) + 1 });
  };

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

  useEffect(() => {
    if (!authUser?.id || dmThreads.length === 0) return;
    const recentThreads = [...dmThreads].slice(0, 3);
    recentThreads.forEach(async (thread) => {
      if (prefetchedThreadsRef.current.has(thread.id)) return;
      prefetchedThreadsRef.current.add(thread.id);
      const msgs = await loadDmMessages(thread.id);
      const hasUnread = msgs.some((m) => m.sender_id !== authUser.id && !(m.read_by || []).includes(authUser.id));
      if (hasUnread) {
        setDmThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, unread: true } : t)));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id, dmThreads.length]);

  useEffect(() => {
    if (!activeDmThread?.id) return;
    markDmRead(activeDmThread.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDmThread?.id, dmMessages[activeDmThread?.id]?.length]);

  useEffect(() => {
    if (!users?.length || !activeDmThread) return;
    const hydrated = users.find((u) => u.id === activeDmThread.otherUser?.id);
    if (!hydrated) return;
    setActiveDmThread((prev) => (prev?.id === activeDmThread.id ? { ...prev, otherUser: hydrated } : prev));
  }, [users, activeDmThread, setActiveDmThread]);

  return {
    loadDmMessages,
    markDmRead,
    openDmThread,
    openDm,
    handleSendMessage,
    handleSendDm,
    handleQueueProjectAttachments,
    handleQueueDmAttachments,
    retryAttachment,
    handleDeleteDm,
    handleDeleteThread,
    handleEditDm,
    handleDeleteProjectMessage,
    handleEditProjectMessage,
  };
}
