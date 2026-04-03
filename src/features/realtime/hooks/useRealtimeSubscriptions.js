import { useEffect, useRef } from "react";
import { supabase } from "../../../supabase";

export function useRealtimeSubscriptions({
  authUser,
  activeProject,
  activeDmThread,
  projects,
  messagesEndRef,
  dmEndRef,
  setMessages,
  setDmMessages,
  setDmThreads,
  setApplications,
  setNotifications,
  setProjects,
  setPosts,
  onIncomingPost,
  setMentionNotifications,
}) {
  const shouldAutoScroll = (endRef) => {
    const el = endRef?.current?.parentElement;
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    return distanceFromBottom < 80;
  };
  const upsertIncoming = (list, incoming) => {
    if (list.find((m) => m.id === incoming.id)) return list;
    const optimisticIdx = list.findIndex((m) =>
      String(m.id || "").startsWith("temp-") &&
      ((m.thread_id && m.thread_id === incoming.thread_id) || (m.project_id && m.project_id === incoming.project_id)) &&
      ((m.sender_id && m.sender_id === incoming.sender_id) || (m.from_user && m.from_user === incoming.from_user)) &&
      m.text === incoming.text
    );
    if (optimisticIdx >= 0) {
      const copy = [...list];
      copy[optimisticIdx] = incoming;
      return copy;
    }
    return [...list, incoming];
  };
  // Ref so realtime callbacks always see current projects without re-subscribing
  const projectsRef = useRef([]);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  // Keep dependency timing aligned with existing App subscription lifecycle.
  useEffect(() => {
    if (!authUser) return;
    const channel = supabase
      .channel("realtime-colab")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        if (activeProject && payload.new.project_id === activeProject.id) {
          const canScroll = shouldAutoScroll(messagesEndRef);
          setMessages((prev) => {
            return upsertIncoming(prev, payload.new);
          });
          if (canScroll) messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, (payload) => {
        // Always update DM messages — works even when not on messages tab
        setDmMessages((prev) => {
          const threadId = payload.new.thread_id;
          const existing = prev[threadId] || [];
          return { ...prev, [threadId]: upsertIncoming(existing, payload.new) };
        });
        // If this thread is active, scroll to bottom
        if (activeDmThread?.id === payload.new.thread_id) {
          if (shouldAutoScroll(dmEndRef)) dmEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }
        // Show notification dot if message is from someone else and we're not on messages tab
        if (payload.new.sender_id !== authUser?.id && activeDmThread?.id !== payload.new.thread_id) {
          setDmThreads((prev) =>
            prev.map((t) =>
              t.id === payload.new.thread_id ? { ...t, unread: true } : t
            )
          );
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "applications" }, (payload) => {
        setApplications((prev) => {
          if (prev.find((a) => a.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        const myProjectIds = projectsRef.current.filter((p) => p.owner_id === authUser?.id).map((p) => p.id);
        if (myProjectIds.includes(payload.new.project_id)) {
          const proj = projectsRef.current.find((p) => p.id === payload.new.project_id);
          setNotifications((prev) => {
            if (prev.find((n) => n.id === payload.new.id)) return prev;
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
        setProjects((prev) => {
          if (prev.find((p) => p.id === payload.new.id)) return prev;
          return [payload.new, ...prev];
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
        if (payload.new.user_id !== authUser?.id) {
          if (onIncomingPost) {
            onIncomingPost(payload.new);
            return;
          }
          setPosts((prev) => {
            if (prev.find((p) => p.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mention_notifications" }, (payload) => {
        if (payload.new.user_id === authUser?.id) {
          setMentionNotifications((prev) => [payload.new, ...prev]);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, activeProject, activeDmThread]);
}
