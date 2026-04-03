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
          setMessages((prev) => {
            if (prev.find((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, (payload) => {
        // Always update DM messages — works even when not on messages tab
        setDmMessages((prev) => {
          const threadId = payload.new.thread_id;
          const existing = prev[threadId] || [];
          if (existing.find((m) => m.id === payload.new.id)) return prev;
          return { ...prev, [threadId]: [...existing, payload.new] };
        });
        // If this thread is active, scroll to bottom
        if (activeDmThread?.id === payload.new.thread_id) {
          setTimeout(() => dmEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
        // Show notification dot if message is from someone else and we're not on messages tab
        if (payload.new.sender_id !== authUser?.id) {
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
