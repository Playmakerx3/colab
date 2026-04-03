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
  const loadDmMessages = async (threadId) => {
    const { data } = await fetchDmMessages(threadId);
    const messages = data || [];
    setDmMessages((prev) => ({ ...prev, [threadId]: messages }));
    return messages;
  };

  const markDmRead = async (threadId, messagesOverride) => {
    const msgs = messagesOverride || dmMessages[threadId] || [];
    const unread = msgs.filter((m) => m.sender_id !== authUser?.id && !(m.read_by || []).includes(authUser?.id));
    if (unread.length === 0) return;

    await Promise.all(
      unread.map((m) => markDmMessageRead({ msgId: m.id, readBy: [...(m.read_by || []), authUser.id] }))
    );

    setDmMessages((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] || []).map((m) =>
        m.sender_id !== authUser?.id ? { ...m, read_by: [...(m.read_by || []), authUser.id] } : m
      ),
    }));
  };

  const openDmThread = async ({ thread, otherUser }) => {
    setActiveDmThread({ ...thread, otherUser });
    const loadedMessages = await loadDmMessages(thread.id);
    setAppScreen("messages");
    setViewingProfile(null);
    setViewFullProfile(null);
    setDmThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, unread: false } : t)));
    setTimeout(() => markDmRead(thread.id, loadedMessages), 500);
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

    const { data } = await createProjectMessage({
      projectId,
      fromUser: authUser.id,
      fromInitials: myInitials,
      fromName: profile.name,
      text,
    });

    if (data) {
      setMessages((prev) => (prev.find((m) => m.id === data.id) ? prev : [...prev, data]));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      detectAndNotifyMentions(text, projectId);
    }
  };

  const handleSendDm = async () => {
    if (!dmInput.trim() || !activeDmThread) return;
    const text = dmInput;
    const threadId = activeDmThread.id;

    const { data } = await createDmMessage({
      threadId,
      senderId: authUser.id,
      senderName: profile.name,
      senderInitials: myInitials,
      text,
    });

    if (data) {
      setDmInput("");
      setDmMessages((prev) => {
        const existing = prev[threadId] || [];
        if (existing.find((m) => m.id === data.id)) return prev;
        return { ...prev, [threadId]: [...existing, data] };
      });
      setTimeout(() => dmEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
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
  };
}
